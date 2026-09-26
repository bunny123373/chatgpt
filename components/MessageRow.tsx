"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { renderMarkdown } from "@/lib/markdown";
import ImageCard from "./ImageCard";
import {
  ChatGPTLogo,
  CopyIcon,
  DownloadIcon,
  PencilIcon,
  RefreshIcon,
  ShareIcon,
  SpeakerIcon,
  SpeakerOffIcon,
  ThumbDownIcon,
  ThumbUpIcon,
  TrashIcon,
  PinIcon,
  BranchIcon,
  FileIcon,
  CanvasIcon,
  VariateIcon,
} from "./Icons";
import { isSpeaking, primeVoices, speak, stopSpeaking } from "@/lib/speech";
import type { Msg } from "@/lib/types";

interface Props {
  msg: Msg;
  streaming?: boolean;
  nickname?: string;
  /** Model the active chat is using — shown under assistant replies. */
  model?: string;
  onEdit?: (text: string) => void;
  onDelete?: () => void;
  onRegenerate?: () => void;
  onCopy: (text: string) => void;
  /** ChatGPT-style 👍/👎 on assistant replies. */
  onFeedback?: (value: "up" | "down" | null) => void;
  onShare?: () => void;
  /** Pin this message so it's easy to find later. */
  onPin?: () => void;
  /** Start a new chat that branches from this message. */
  onBranch?: () => void;
  /** Open this reply in the Canvas side panel. */
  onCanvas?: () => void;
  /** Generate another take of a generated image. */
  onVary?: () => void;
  /** Show the token/cost readout. */
  showUsage?: boolean;
}

function MessageRow({
  msg,
  streaming,
  nickname,
  model,
  onEdit,
  onDelete,
  onRegenerate,
  onCopy,
  onFeedback,
  onShare,
  onPin,
  onBranch,
  onCanvas,
  onVary,
  showUsage,
}: Props) {
  const html = useMemo(() => renderMarkdown(msg.content), [msg.content]);
  const isUser = msg.role === "user";
  const imgUrl = msg.generatedImage;
  const busy = streaming && msg.role === "assistant";
  const empty = msg.content.length === 0;
  const initial = (nickname?.trim()[0] ?? "Y").toUpperCase();

  // Save a generated image. Routed through /api/image-proxy so the download
  // works even when the image CDN sends no CORS headers (a direct fetch would
  // otherwise fail and force a new tab instead of saving the file).
  const downloadImage = async (url: string) => {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const proxied = `/api/image-proxy?url=${encodeURIComponent(url)}&name=next-ai-${stamp}.png`;
    const a = document.createElement("a");
    a.href = proxied;
    a.download = `next-ai-${stamp}.png`;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(msg.content);

  // Image generation status ("Preparing…" → "Generating…"), DALL·E style.
  const [genPhase, setGenPhase] = useState<"preparing" | "generating">("preparing");
  useEffect(() => {
    if (!msg.imgPending) return;
    setGenPhase("preparing");
    const t = setTimeout(() => setGenPhase("generating"), 2200);
    return () => clearTimeout(t);
  }, [msg.imgPending, msg.id]);

  // Read-aloud via the Web Speech API (one utterance app-wide).
  const [speaking, setSpeaking] = useState(() => isSpeaking(msg.id));
  useEffect(() => {
    primeVoices();
  }, []);
  const toggleSpeak = () => {
    if (isSpeaking(msg.id)) {
      stopSpeaking();
      setSpeaking(false);
    } else if (speak(msg.id, msg.content, () => setSpeaking(false))) {
      setSpeaking(true);
    }
  };

  // Inline "edit & resend" for user messages (ChatGPT style).
  if (isUser && editing && onEdit) {
    return (
      <div className="msg user editing">
        <div className="body edit-body">
          <textarea
            className="editbox"
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (draft.trim()) {
                  onEdit(draft.trim());
                  setEditing(false);
                }
              }
            }}
            aria-label="Edit message"
          />
          <div className="edit-actions">
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                if (draft.trim()) {
                  onEdit(draft.trim());
                  setEditing(false);
                }
              }}
              disabled={!draft.trim()}
            >
              Save & send
            </button>
            <button type="button" className="btn" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
        <div className="who">{initial}</div>
      </div>
    );
  }

  const body = (
    <div className="body">
      {msg.error ? (
        <div className="err">{msg.content}</div>
      ) : isUser ? (
        <div className="content">
          {msg.imageRef ? (
            /* A URL pasted into the chat: full card with download and convert. */
            <ImageCard
              src={msg.imageRef.url}
              dataUrl={msg.imageRef.dataUrl}
              filename={msg.imageRef.filename}
              type={msg.imageRef.type}
            />
          ) : msg.image ? (
            <div className="attach-img">
              <img src={msg.image} alt="Attached" />
            </div>
          ) : null}
          {msg.files?.length ? (
            <div className="msg-files">
              {msg.files.map((f) => (
                <div key={f.id} className={`msg-file${f.error ? " err" : ""}`} title={f.error || f.name}>
                  {f.dataUrl ? (
                    <img className="mf-thumb" src={f.dataUrl} alt={f.name} />
                  ) : (
                    <span className="mf-icon" aria-hidden>
                      <FileIcon size={16} />
                    </span>
                  )}
                  <span className="mf-meta">
                    <span className="mf-name">{f.name}</span>
                    <span className="mf-sub">
                      {f.error
                        ? "Couldn’t read"
                        : f.pages
                          ? `${f.pages} pages`
                          : `${Math.max(1, Math.round(f.size / 1024))} KB`}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          ) : null}
          {msg.content ? msg.content : null}
        </div>
      ) : busy && empty ? (
        <div className="typing" aria-label="Assistant is typing">
          <i />
          <i />
          <i />
        </div>
      ) : (
        <div className="content">
          {msg.imgPending ? (
            <div className="gen-pending" role="status" aria-live="polite">
              <span className="gen-squircle" aria-hidden>
                <span className="gen-beam" />
                <span className="gen-beam reverse" />
              </span>
              <span className="gen-label">
                {genPhase === "preparing" ? "Preparing your image…" : "Generating your image…"}
              </span>
            </div>
          ) : (
            <>
              {imgUrl ? (
                <div className="gen-img">
                  <img src={imgUrl} alt="AI generated" />
                  <button
                    type="button"
                    className="gen-dl"
                    title="Download image"
                    aria-label="Download image"
                    onClick={() => downloadImage(imgUrl)}
                  >
                    <DownloadIcon size={15} />
                  </button>
                </div>
              ) : null}
              <span dangerouslySetInnerHTML={{ __html: html }} />
              {busy ? <span className="cursor" /> : null}
              {msg.researchStage && !msg.content ? (
                <p className="research-stage" role="status">
                  <span className="rs-dot" aria-hidden />
                  {msg.researchStage}
                </p>
              ) : null}
              {msg.stopped && !busy ? <p className="stopped">Stopped by user.</p> : null}
              {msg.researchSources ? (
                <p className="research-note">Based on {msg.researchSources} web sources</p>
              ) : null}
              {/* model-tag / tools-used / usage-tag moved OUT of the message
                  body into the footer below it -- see `meta` near the return. */}
              {/* usage-tag moved out too -- see `meta` near the return. */}
            </>
          )}
        </div>
      )}
    </div>
  );

  /**
   * Copy, edit, share, pin, branch, delete.
   *
   * These were the last children of .body, which drew them INSIDE the bubble,
   * on top of the coloured fill. They are now outside it.
   *
   * A sent message puts them in a gutter to the LEFT of the bubble, vertically
   * centred, which is where ChatGPT puts them. That matters for width: a sent
   * message carries six buttons, about 178px, while a bubble for ""hi"" is
   * only about 48px. In a right-aligned footer the button row would jut out
   * some 130px to the left of its own bubble. Beside the bubble they occupy
   * their own space instead and cannot stretch it.
   */
  const actions = !busy && !empty ? (
    <div className="msg-actions" role="group" aria-label="Message actions">
      <button type="button" title="Copy" aria-label="Copy" onClick={() => onCopy(msg.content)}>
        <CopyIcon size={15} />
      </button>
      {isUser && onEdit ? (
        <button
          type="button"
          title="Edit"
          aria-label="Edit"
          onClick={() => {
            setDraft(msg.content);
            setEditing(true);
          }}
        >
          <PencilIcon size={15} />
        </button>
      ) : null}
      {!isUser && !busy && !empty ? (
        <button
          type="button"
          title={speaking ? "Stop reading aloud" : "Read this reply aloud"}
          aria-label={speaking ? "Stop reading aloud" : "Read this reply aloud"}
          className={speaking ? "active" : ""}
          onClick={toggleSpeak}
        >
          {speaking ? <SpeakerOffIcon size={15} /> : <SpeakerIcon size={15} />}
        </button>
      ) : null}
      {!isUser && onRegenerate ? (
        <button type="button" title="Regenerate" aria-label="Regenerate" onClick={onRegenerate}>
          <RefreshIcon size={15} />
        </button>
      ) : null}
      {onDelete ? (
        <button type="button" className="del" title="Delete" aria-label="Delete" onClick={onDelete}>
          <TrashIcon size={15} />
        </button>
      ) : null}
      {onShare ? (
        <button type="button" title="Share" aria-label="Share" onClick={onShare}>
          <ShareIcon size={15} />
        </button>
      ) : null}
      {onPin ? (
        <button
          type="button"
          className={msg.pinned ? "active" : ""}
          title={msg.pinned ? "Unpin message" : "Pin message"}
          aria-label={msg.pinned ? "Unpin message" : "Pin message"}
          aria-pressed={!!msg.pinned}
          onClick={onPin}
        >
          <PinIcon size={15} />
        </button>
      ) : null}
      {onBranch ? (
        <button
          type="button"
          title="Branch into a new chat from here"
          aria-label="Branch into a new chat from here"
          onClick={onBranch}
        >
          <BranchIcon size={15} />
        </button>
      ) : null}
      {onCanvas ? (
        <button
          type="button"
          title="Open in Canvas"
          aria-label="Open in Canvas"
          onClick={onCanvas}
        >
          <CanvasIcon size={15} />
        </button>
      ) : null}
      {onVary ? (
        <button
          type="button"
          title="Generate a variation"
          aria-label="Generate a variation of this image"
          onClick={onVary}
        >
          <VariateIcon size={15} />
        </button>
      ) : null}
    </div>
  ) : null;

  const feedback = !isUser && !busy && !empty && onFeedback ? (
  <div className="msg-feedback" role="group" aria-label="Rate this response">
    <button
      type="button"
      className={msg.feedback === "up" ? "active up" : ""}
      title="Good response"
      aria-label="Good response"
      aria-pressed={msg.feedback === "up"}
      onClick={() => onFeedback(msg.feedback === "up" ? null : "up")}
    >
      <ThumbUpIcon size={14} />
    </button>
    <button
      type="button"
      className={msg.feedback === "down" ? "active down" : ""}
      title="Bad response"
      aria-label="Bad response"
      aria-pressed={msg.feedback === "down"}
      onClick={() => onFeedback(msg.feedback === "down" ? null : "down")}
    >
      <ThumbDownIcon size={14} />
    </button>
    {msg.feedback ? (
      <span className="thanks" role="status">
        {msg.feedback === "up" ? "Thanks for the feedback!" : "Thanks — we'll use it to improve."}
      </span>
    ) : null}
  </div>
  ) : null;

  /**
   * Message metadata: which model answered, which tools it called, token/cost.
   *
   * These used to be the last children of .content, so they were part of the
   * message body and inherited its measure. They now render in a footer below
   * the message, outside the body, alongside the copy/edit controls -- so the
   * prose is the only thing in the bubble and the metadata reads as chrome
   * rather than as something the assistant wrote.
   */
  const meta = !busy && !empty ? (
    <div className="msg-meta">
      {!isUser && model ? (
        /* Friendly name only. The raw id names the provider, so it is never
           rendered, and never in the tooltip either. */
        <p className="model-tag" title={`Generated with ${model}`}>
          via {model}
        </p>
      ) : null}
      {msg.toolsUsed && msg.toolsUsed.length ? (
        <div className="tools-used">
          {msg.toolsUsed.map((t) => (
            <span key={t} title={`The model called the "${t}" tool for this answer`}>
              ⚙ {t.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      ) : null}
      {showUsage && msg.usage ? (
        <p className="usage-tag" title="Token usage and estimated cost for this reply">
          {msg.usage.totalTokens ? `${msg.usage.totalTokens.toLocaleString()} tokens` : null}
          {msg.usage.totalTokens && msg.usage.costUsd !== undefined ? " · " : null}
          {msg.usage.costUsd !== undefined
            ? msg.usage.costUsd === 0
              ? "free"
              : `$${msg.usage.costUsd.toFixed(4)}`
            : null}
          {msg.mode ? ` · ${msg.mode} mode` : null}
        </p>
      ) : null}
    </div>
  ) : null;

  return (
    <div className={`msg ${isUser ? "user msg-sent" : "assistant"}${busy ? " msg-streaming" : ""}${msg.pinned ? " pinned" : ""}`}>
      <div className="msg-row">
        {isUser ? (
          <>
            <div className="msg-gutter">{actions}</div>
            {body}
          </>
        ) : (
          <>
            <div className="who">
              <ChatGPTLogo size={15} />
            </div>
            {body}
          </>
        )}
      </div>
      <div className="msg-foot">
        {meta}
        {!isUser ? actions : null}
        {feedback}
      </div>
    </div>
  );
}

export default memo(MessageRow);