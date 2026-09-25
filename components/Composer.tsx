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
} from "./Icons";
import { IMAGE_RATIOS, type ImageRatio } from "@/lib/types";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  busy: boolean;
  modelLabel: string;
  attach: string | null;
  onAttach: (url: string | null) => void;
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
  searching,
  onToggleSearch,
  tools,
  onToggleTools,
  imgMode,
  onToggleImgMode,
  imgBusy,
  imgRatio,
  onRatioChange,
}: Props) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [sizing, setSizing] = useState(0);
  const [imgError, setImgError] = useState(false);
  const [ratioOpen, setRatioOpen] = useState(false);

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

  const canSend = !busy && !imgBusy && (value.trim() !== "" || !!attach);

  return (
    <div className="composer-wrap">
      <div className="composer">
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
                        <span className="ratio-val">{r.value}</span>
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

        {(searching || tools || listening) ? (
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
            <button
              type="button"
              title="Attach an image"
              aria-label="Attach an image"
              className="comp-btn"
              onClick={() => fileRef.current?.click()}
            >
              <AttachIcon />
            </button>
            <button
              type="button"
              title={searching ? "Web search on — click to turn off" : "Web search off — click to search the web with your question"}
              aria-pressed={searching}
              className={`comp-btn search${searching ? " on" : ""}`}
              onClick={onToggleSearch}
            >
              <SearchIcon />
            </button>
            <button
              type="button"
              title={tools ? "Tools on — the model can use a calculator, unit converter and clock" : "Tools off — turn on built-in tools (calculator, converter, time, date)"}
              aria-pressed={tools}
              className={`comp-btn${tools ? " on" : ""}`}
              onClick={onToggleTools}
            >
              <WrenchIcon />
            </button>
            <button
              type="button"
              title={imgMode ? "Image mode on — click to turn off" : "Image mode off — click, then send a prompt to generate an image"}
              aria-pressed={imgMode}
              className={`comp-btn gen${imgMode ? " on" : ""}${imgBusy ? " busy" : ""}`}
              disabled={imgBusy}
              onClick={onToggleImgMode}
            >
              <ImageIcon />
            </button>
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
          </div>

          <textarea
            ref={ref}
            rows={1}
            value={value}
            placeholder={imgMode ? "Describe the image you want to create…" : `Message ${modelLabel}…`}
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
          ChatGPT can make mistakes. Check important info.
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