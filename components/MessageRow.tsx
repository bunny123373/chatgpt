"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { renderMarkdown } from "@/lib/markdown";
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
}

function MessageRow({ msg, streaming, nickname, model, onEdit, onDelete, onRegenerate, onCopy, onFeedback, onShare }: Props) {
  const html = useMemo(() => renderMarkdown(msg.content), [msg.content]);
  const isUser = msg.role === "user";
  const imgUrl = msg.generatedImage;
  const busy = streaming && msg.role === "assistant";
  const empty = msg.content.length === 0;
  const initial = (nickname?.trim()[0] ?? "Y").toUpperCase();

  // Save a generated image to disk. The CDN may be cross-origin without CORS
  // headers, so fall back to opening the image in a new tab for manual save.
  const downloadImage = async (url: string) => {
    try {
      const res = await fetch(url, { mode: "cors" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `cf-image-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(url, "_blank", "noopener");
    }
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
          {msg.image ? (
            <div className="attach-img">
              <img src={msg.image} alt="Attached" />
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
              {msg.stopped && !busy ? <p className="stopped">Stopped by user.</p> : null}
              {!isUser && !busy && !empty && model ? (
                <p className="model-tag" title={`This reply was generated with ${model}`}>
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
            </>
          )}
        </div>
      )}

      {!busy && !empty ? (
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
        </div>
      ) : null}

      {!isUser && !busy && !empty && onFeedback ? (
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
      ) : null}
    </div>
  );

  return (
    <div className={`msg ${isUser ? "user" : "assistant"}`}>
      {isUser ? (
        <>
          {body}
          <div className="who">{initial}</div>
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
  );
}

export default memo(MessageRow);