"use client";

import { useEffect, useRef, useState } from "react";
import { renderMarkdown } from "@/lib/markdown";
import type { CanvasDoc } from "@/lib/types";
import { CloseIcon, CopyIcon } from "./Icons";

interface Props {
  doc: CanvasDoc | null;
  onClose: () => void;
  onChange: (doc: CanvasDoc) => void;
  /** Write the canvas contents back into the originating assistant message. */
  onSaveToChat?: (content: string) => void;
}

/**
 * Canvas — a side-by-side editable panel (chatgpt.com Canvas).
 * Writes are debounced so typing stays smooth; "Save to chat" pushes the
 * document back into the message it was opened from.
 */
export default function Canvas({ doc, onClose, onChange, onSaveToChat }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(doc?.content ?? "");
  const [saved, setSaved] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setDraft(doc?.content ?? "");
    setEditing(false);
  }, [doc?.chatId, doc?.msgId]);

  // Debounced write-back to the parent while editing.
  useEffect(() => {
    if (!doc || !editing) return;
    const t = setTimeout(() => {
      onChange({ ...doc, content: draft, updatedAt: Date.now() });
      setSaved(true);
      setTimeout(() => setSaved(false), 1200);
    }, 600);
    return () => clearTimeout(t);
  }, [draft, editing, doc, onChange]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!doc) return null;

  return (
    <aside className="canvas" aria-label="Canvas">
      <div className="canvas-head">
        <input
          className="canvas-title"
          value={doc.title}
          aria-label="Canvas title"
          onChange={(e) => onChange({ ...doc, title: e.target.value, updatedAt: Date.now() })}
        />
        <div className="canvas-tools">
          {saved ? <span className="canvas-saved">Saved</span> : null}
          <button
            className={`icon-btn${editing ? " on" : ""}`}
            type="button"
            title={editing ? "Preview" : "Edit"}
            aria-label={editing ? "Preview canvas" : "Edit canvas"}
            onClick={() => setEditing((v) => !v)}
          >
            {editing ? "👁" : "✎"}
          </button>
          <button
            className="icon-btn"
            type="button"
            title="Copy canvas"
            aria-label="Copy canvas"
            onClick={() => {
              void navigator.clipboard.writeText(doc.content);
            }}
          >
            <CopyIcon size={15} />
          </button>
          <button className="icon-btn" type="button" title="Close canvas" aria-label="Close canvas" onClick={onClose}>
            <CloseIcon size={15} />
          </button>
        </div>
      </div>

      {editing ? (
        <textarea
          ref={areaRef}
          className="canvas-edit"
          value={draft}
          autoFocus
          spellCheck={false}
          aria-label="Canvas content"
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write or paste your content here…"
        />
      ) : (
        <div className="canvas-view">
          <div dangerouslySetInnerHTML={{ __html: renderMarkdown(doc.content) }} />
        </div>
      )}

      {onSaveToChat ? (
        <div className="canvas-foot">
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              onChange({ ...doc, content: draft, updatedAt: Date.now() });
              onSaveToChat(draft);
            }}
          >
            Save to chat
          </button>
        </div>
      ) : null}
    </aside>
  );
}
