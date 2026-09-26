"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  SendIcon,
  StopIcon,
  AttachIcon,
  SearchIcon,
  CloseIcon,
  ImageIcon,
  MicIcon,
  WrenchIcon,
  FileIcon,
  ResearchIcon,
  TemplateIcon,
  PlusIcon,
  PdfIcon,
  DownloadIcon,
} from "./Icons";
import { IMAGE_RATIOS, RATIO_OUTPUT, type FileRef, type ImageRatio, type ResponseMode } from "@/lib/types";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  busy: boolean;
  modelLabel: string;
  attach: string | null;
  onAttach: (url: string | null) => void;
  /** Parsed documents attached to the next message. */
  files: FileRef[];
  onFiles: (files: FileRef[]) => void;
  /** Raw files the user just picked; the parent parses them. */
  onFilesAttach: (picked: File[]) => void;
  /** Convert a picked file to PDF and open the print dialog. */
  onConvertPdf: (file: File) => void;
  /** Open the Tools page on the image downloader. */
  onOpenImageDownloader: () => void;
  /** True while documents are being parsed. */
  filesBusy: boolean;
  searching: boolean;
  onToggleSearch: () => void;
  /** Model tool-calling (time/date/calculator/converter). */
  tools: boolean;
  onToggleTools: () => void;
  /** Generate an image when the user sends (image mode armed via the 🖼 button). */
  imgMode: boolean;
  onToggleImgMode: () => void;
  imgBusy: boolean;
  /** Aspect ratio used by the image generator. */
  imgRatio: ImageRatio;
  onRatioChange: (r: ImageRatio) => void;
  /** Quick / Thinking reasoning mode. */
  mode: ResponseMode;
  onModeChange: (m: ResponseMode) => void;
  /** Multi-step web research mode. */
  research: boolean;
  onToggleResearch: () => void;
  /** Saved prompt templates the user can drop into the composer. */
  templates: { id: string; title: string; prompt: string }[];
  onUseTemplate: (prompt: string) => void;
  onSaveTemplate: (title: string, prompt: string) => void;
  onDeleteTemplate: (id: string) => void;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyRecognition = any;

export default function Composer({
  value,
  onChange,
  onSend,
  onStop,
  busy,
  modelLabel,
  attach,
  onAttach,
  files,
  onFiles,
  onFilesAttach,
  filesBusy,
  onConvertPdf,
  onOpenImageDownloader,
  searching,
  onToggleSearch,
  tools,
  onToggleTools,
  imgMode,
  onToggleImgMode,
  imgBusy,
  imgRatio,
  onRatioChange,
  mode,
  onModeChange,
  research,
  onToggleResearch,
  templates,
  onUseTemplate,
  onSaveTemplate,
  onDeleteTemplate,
}: Props) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const pdfRef = useRef<HTMLInputElement | null>(null);
  const [sizing, setSizing] = useState(0);
  const [imgError, setImgError] = useState(false);
  const [ratioOpen, setRatioOpen] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  // ChatGPT-style: one "+" button opens the tools menu.
  const [toolsOpen, setToolsOpen] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);
  const [tplTitle, setTplTitle] = useState("");

  // Escape closes whichever composer popover is open.
  useEffect(() => {
    if (!toolsOpen && !tplOpen && !ratioOpen && !modeOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setToolsOpen(false);
      setTplOpen(false);
      setRatioOpen(false);
      setModeOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toolsOpen, tplOpen, ratioOpen, modeOpen]);

  // ---- Voice input (Web Speech API) ----
  const recSupported = useMemo(() => {
    if (typeof window === "undefined") return false;
    const w = window as any;
    return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
  }, []);
  const recRef = useRef<AnyRecognition | null>(null);
  const [listening, setListening] = useState(false);
  const startValRef = useRef("");

  const getRecognizer = () => {
    if (recRef.current) return recRef.current;
    const w = window as any;
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return null;
    const rec = new Ctor();
    rec.lang = navigator.language || "en-US";
    rec.interimResults = true;
    rec.continuous = true;
    rec.maxAlternatives = 1;
    rec.onresult = (event: any) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      const base = startValRef.current;
      onChange(base + (base && transcript ? " " : "") + transcript);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    return rec;
  };

  const toggleMic = () => {
    const rec = getRecognizer();
    if (!rec) return;
    if (listening) {
      setListening(false);
      try {
        rec.stop();
      } catch {}
      return;
    }
    startValRef.current = value;
    setListening(true);
    try {
      rec.start();
    } catch {
      setListening(false);
    }
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 190) + "px";
  }, [value, sizing]);

  // Pick an image, downscale it client-side so the payload stays small.
  const pickImage = async (file: File) => {
    setImgError(false);
    if (!file.type.startsWith("image/")) return;
    try {
      const url = await downscaleImage(file, 1280, 0.85);
      onAttach(url);
      setSizing((n) => n + 1);
    } catch {
      setImgError(true);
    }
  };

  // ---- Document attachments ----
  const docRef = useRef<HTMLInputElement | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const MAX_FILES = 6;
  const MAX_BYTES = 8 * 1024 * 1024;

  const addDocs = (picked: FileList | null) => {
    if (!picked || picked.length === 0) return;
    const incoming = Array.from(picked);
    if (files.length + incoming.length > MAX_FILES) {
      setFileError(`Up to ${MAX_FILES} files per message.`);
      return;
    }
    if (incoming.some((f) => f.size > MAX_BYTES)) {
      setFileError("Each file must be 8 MB or smaller.");
      return;
    }
    setFileError(null);
    onFilesAttach(incoming);
    setSizing((n) => n + 1);
  };

  const fileSize = (bytes: number) =>
    bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

  const canSend = !busy && !imgBusy && !filesBusy && (value.trim() !== "" || !!attach || files.length > 0);

  return (
    <div className="composer-wrap">
      <div className="composer">
        {files.length || fileError || filesBusy ? (
          <div className="doc-chips">
            {files.map((f) => (
              <span key={f.id} className={`doc-chip${f.error ? " err" : ""}`} title={f.error || f.name}>
                <span className="doc-icon" aria-hidden>
                  {f.type.startsWith("image/") ? <ImageIcon size={13} /> : "📄"}
                </span>
                <span className="doc-meta">
                  <span className="doc-name">{f.name}</span>
                  <span className="doc-sub">
                    {f.error ? "Unreadable" : f.pages ? `${f.pages} pages` : fileSize(f.size)}
                  </span>
                </span>
                <button type="button" className="doc-x" onClick={() => onFiles(files.filter((x) => x.id !== f.id))} title={`Remove ${f.name}`}>
                  <CloseIcon size={12} />
                </button>
              </span>
            ))}
            {filesBusy ? <span className="doc-chip pending">Reading files…</span> : null}
            {fileError ? <span className="doc-chip err">{fileError}</span> : null}
          </div>
        ) : null}

        {attach ? (
          <div className="attach-chip">
            <div className="attach-preview">
              {imgError ? (
                <span className="attach-fallback">Unsupported image</span>
              ) : (
                <img src={attach} alt="Attachment preview" />
              )}
            </div>
            <button
              type="button"
              className="attach-x"
              title="Remove image"
              aria-label="Remove image"
              onClick={() => {
                onAttach(null);
                setImgError(false);
              }}
            >
              <CloseIcon />
            </button>
          </div>
        ) : null}

        {imgMode ? (
          <div className="img-chip">
            <span className="ic-label">
              <ImageIcon />
              Generate image
            </span>
            <span className="ic-ratio-wrap">
              <button
                type="button"
                className="ic-ratio"
                aria-expanded={ratioOpen}
                onClick={() => setRatioOpen((v) => !v)}
              >
                {imgRatio} <span className="ic-caret">▾</span>
              </button>
              {ratioOpen ? (
                <>
                  <div className="ratio-backdrop" onClick={() => setRatioOpen(false)} />
                  <div className="ratio-menu" role="menu" aria-label="Aspect ratio">
                    <p className="ratio-title">Aspect ratio</p>
                    {IMAGE_RATIOS.map((r) => (
                      <button
                        key={r.value}
                        type="button"
                        role="menuitemradio"
                        aria-checked={imgRatio === r.value}
                        className={`ratio-opt${imgRatio === r.value ? " on" : ""}`}
                        onClick={() => {
                          onRatioChange(r.value);
                          setRatioOpen(false);
                        }}
                      >
                        <span className="ratio-shape" style={{ aspectRatio: r.value }} aria-hidden />
                        <span className="ratio-name">{r.label}</span>
                        <span className="ratio-val">{RATIO_OUTPUT[r.value]}</span>
                        {imgRatio === r.value ? <span className="ratio-check">✓</span> : null}
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
            </span>
            <button
              type="button"
              className="ic-x"
              title="Cancel image generation"
              aria-label="Cancel image generation"
              onClick={() => {
                onToggleImgMode();
                setRatioOpen(false);
              }}
            >
              <CloseIcon />
            </button>
          </div>
        ) : null}

        {(searching || tools || listening || research) ? (
          <div className="tchips">
            {searching ? (
              <div className="tchip">
                <SearchIcon />
                <span>Search the web</span>
                <button
                  type="button"
                  className="tchip-x"
                  title="Turn off web search"
                  aria-label="Turn off web search"
                  onClick={onToggleSearch}
                >
                  <CloseIcon />
                </button>
              </div>
            ) : null}
            {tools ? (
              <div className="tchip">
                <WrenchIcon />
                <span>Use tools</span>
                <button
                  type="button"
                  className="tchip-x"
                  title="Turn off tools"
                  aria-label="Turn off tools"
                  onClick={onToggleTools}
                >
                  <CloseIcon />
                </button>
              </div>
            ) : null}
            {research ? (
              <div className="tchip">
                <ResearchIcon />
                <span>Deep Research</span>
                <button
                  type="button"
                  className="tchip-x"
                  title="Turn off Deep Research"
                  aria-label="Turn off Deep Research"
                  onClick={onToggleResearch}
                >
                  <CloseIcon />
                </button>
              </div>
            ) : null}
            {listening ? (
              <div className="tchip">
                <MicIcon />
                <span>Voice input</span>
                <button
                  type="button"
                  className="tchip-x"
                  title="Stop listening"
                  aria-label="Stop listening"
                  onClick={toggleMic}
                >
                  <CloseIcon />
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="field">
          <div className="tools">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void pickImage(f);
                e.target.value = "";
              }}
            />
            <input
              ref={pdfRef}
              type="file"
              accept=".pdf,.docx,image/*,.txt,.md,.markdown,.csv,.tsv,.json,.yaml,.yml,.html,.htm,.xml,.rtf,.log,text/*,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onConvertPdf(f);
                e.target.value = "";
              }}
            />
            <input
              ref={docRef}
              type="file"
              multiple
              accept=".pdf,.docx,.txt,.md,.markdown,.csv,.tsv,.json,.yaml,.yml,.html,.htm,.xml,.rtf,application/pdf,text/*"
              hidden
              onChange={(e) => {
                void addDocs(e.target.files);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              className={`plus-btn${toolsOpen ? " on" : ""}`}
              title="Add tools"
              aria-label="Add tools"
              aria-haspopup="menu"
              aria-expanded={toolsOpen}
              onClick={() => {
                setToolsOpen((v) => !v);
                setTplOpen(false);
              }}
            >
              <PlusIcon />
            </button>
            {toolsOpen ? (
              <>
                <div className="ratio-backdrop" onClick={() => setToolsOpen(false)} />
                <div className="tools-menu" role="menu" aria-label="Add tools">
                  <p className="ratio-title">Tools</p>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={searching}
                    onClick={() => {
                      onToggleSearch();
                      setToolsOpen(false);
                    }}
                  >
                    <span className="tm-ic">
                      <SearchIcon size={16} />
                    </span>
                    <span className="tm-text">
                      <b>Search the web</b>
                      <small>Fresh results and citations</small>
                    </span>
                    {searching ? <span className="tm-check">✓</span> : null}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={tools}
                    onClick={() => {
                      onToggleTools();
                      setToolsOpen(false);
                    }}
                  >
                    <span className="tm-ic">
                      <WrenchIcon size={16} />
                    </span>
                    <span className="tm-text">
                      <b>Use tools</b>
                      <small>Calculator, converter, date and time</small>
                    </span>
                    {tools ? <span className="tm-check">✓</span> : null}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={imgMode || imgBusy}
                    onClick={() => {
                      onToggleImgMode();
                      setToolsOpen(false);
                    }}
                  >
                    <span className="tm-ic">
                      <ImageIcon size={16} />
                    </span>
                    <span className="tm-text">
                      <b>Create image</b>
                      <small>Generate an image from a description</small>
                    </span>
                    {imgMode ? <span className="tm-check">✓</span> : null}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={research}
                    onClick={() => {
                      onToggleResearch();
                      setToolsOpen(false);
                    }}
                  >
                    <span className="tm-ic">
                      <ResearchIcon size={16} />
                    </span>
                    <span className="tm-text">
                      <b>Deep Research</b>
                      <small>Multi-step research with a cited report</small>
                    </span>
                    {research ? <span className="tm-check">✓</span> : null}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setToolsOpen(false);
                      docRef.current?.click();
                    }}
                  >
                    <span className="tm-ic">
                      <FileIcon size={16} />
                    </span>
                    <span className="tm-text">
                      <b>Upload files</b>
                      <small>PDF, DOCX, CSV, text and code</small>
                    </span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setToolsOpen(false);
                      pdfRef.current?.click();
                    }}
                  >
                    <span className="tm-ic">
                      <PdfIcon size={16} />
                    </span>
                    <span className="tm-text">
                      <b>Convert to PDF</b>
                      <small>Turn a document, image or text file into a PDF</small>
                    </span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setToolsOpen(false);
                      onOpenImageDownloader();
                    }}
                  >
                    <span className="tm-ic">
                      <DownloadIcon size={16} />
                    </span>
                    <span className="tm-text">
                      <b>Download image from URL</b>
                      <small>Save an image from any link, then convert it</small>
                    </span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setToolsOpen(false);
                      fileRef.current?.click();
                    }}
                  >
                    <span className="tm-ic">
                      <AttachIcon size={16} />
                    </span>
                    <span className="tm-text">
                      <b>Add photos</b>
                      <small>Attach images for the model to see</small>
                    </span>
                  </button>
                </div>
              </>
            ) : null}
            <button
              type="button"
              title={
                recSupported
                  ? listening
                    ? "Listening — click to stop"
                    : "Voice input — dictate your message"
                  : "Voice input is not supported in this browser (try Chrome or Edge)"
              }
              aria-pressed={listening}
              className={`comp-btn mic${listening ? " on rec" : ""}`}
              disabled={!recSupported}
              onClick={toggleMic}
            >
              <MicIcon />
            </button>
            <button
              type="button"
              title="Prompt templates"
              aria-label="Prompt templates"
              className={`comp-btn${tplOpen ? " on" : ""}`}
              onClick={() => {
                setTplOpen((v) => !v);
                setToolsOpen(false);
              }}
            >
              <TemplateIcon />
            </button>
            {tplOpen ? (
              <>
                <div className="ratio-backdrop" onClick={() => setTplOpen(false)} />
                <div className="tpl-menu" role="menu" aria-label="Prompt templates">
                  <p className="ratio-title">Prompt templates</p>
                  {templates.length === 0 ? (
                    <p className="tpl-empty">Save a prompt to reuse it later.</p>
                  ) : (
                    templates.map((t) => (
                      <div key={t.id} className="tpl-row">
                        <button
                          type="button"
                          className="tpl-use"
                          onClick={() => {
                            onUseTemplate(t.prompt);
                            setTplOpen(false);
                          }}
                        >
                          <b>{t.title}</b>
                          <span>{t.prompt.slice(0, 80)}</span>
                        </button>
                        <button
                          type="button"
                          className="tpl-del"
                          title={`Delete ${t.title}`}
                          aria-label={`Delete ${t.title}`}
                          onClick={() => onDeleteTemplate(t.id)}
                        >
                          ✕
                        </button>
                      </div>
                    ))
                  )}
                  {value.trim() ? (
                    <button
                      type="button"
                      className="tpl-save"
                      onClick={() => {
                        onSaveTemplate(tplTitle, value);
                        setTplTitle("");
                      }}
                    >
                      + Save this prompt
                    </button>
                  ) : null}
                  {tplTitle ? null : null}
                </div>
              </>
            ) : null}
            <span className="mode-wrap">
              <button
                type="button"
                className={`mode-btn${mode === "thinking" ? " thinking" : ""}`}
                aria-haspopup="menu"
                aria-expanded={modeOpen}
                title={
                  mode === "thinking"
                    ? "Thinking mode — slower, more careful answers"
                    : "Quick mode — fast, concise answers"
                }
                onClick={() => setModeOpen((v) => !v)}
              >
                {mode === "thinking" ? "Thinking" : "Quick"}
                <span className="ic-caret">▾</span>
              </button>
              {modeOpen ? (
                <>
                  <div className="ratio-backdrop" onClick={() => setModeOpen(false)} />
                  <div className="mode-menu" role="menu" aria-label="Response mode">
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={mode === "quick"}
                      className={mode === "quick" ? "on" : ""}
                      onClick={() => {
                        onModeChange("quick");
                        setModeOpen(false);
                      }}
                    >
                      <b>Quick</b>
                      <span>Faster answers for everyday questions</span>
                    </button>
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={mode === "thinking"}
                      className={mode === "thinking" ? "on" : ""}
                      onClick={() => {
                        onModeChange("thinking");
                        setModeOpen(false);
                      }}
                    >
                      <b>Thinking</b>
                      <span>Takes longer, reasons more carefully</span>
                    </button>
                  </div>
                </>
              ) : null}
            </span>
          </div>

          <textarea
            ref={ref}
            rows={1}
            value={value}
            placeholder={
              imgMode
                ? "Describe the image you want to create…"
                : research
                  ? "Ask a research question — I'll search the web and write a cited report…"
                  : `Message ${modelLabel}…`
            }
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (canSend) onSend();
              }
            }}
            aria-label="Message"
          />
          {busy ? (
            <button type="button" className="send stop" onClick={onStop} title="Stop generating" aria-label="Stop generating">
              <StopIcon />
            </button>
          ) : canSend ? (
            <button
              type="button"
              className="send"
              onClick={onSend}
              title="Send"
              aria-label="Send message"
            >
              <SendIcon />
            </button>
          ) : null}
        </div>
        <p className="hint">
          {listening ? <b>Listening… speak now.</b> : null}
          {listening ? " " : null}
          {searching ? (
            <>Web search is on — fresh results will be included with your next message. </>
          ) : null}
          {tools ? <>Tools are on — the model can use a calculator, converter and clock. </> : null}
          Next AI can make mistakes. Check important info.
        </p>
      </div>
    </div>
  );
}

/** Downscale an image to fit within maxSize px and re-encode as JPEG data URL. */
function downscaleImage(file: File, maxSize: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("canvas unavailable"));
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => reject(new Error("failed to read image"));
    img.src = URL.createObjectURL(file);
  });
}