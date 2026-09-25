"use client";

import { useRef, useState } from "react";
import { PencilIcon, PinIcon, TrashIcon, SettingsIcon, LogOutIcon } from "./Icons";
import type { AuthUser } from "@/lib/types";

interface Chat {
  id: string;
  title: string;
  messages: unknown[];
  updatedAt: number;
  pinned?: boolean;
}

interface Props {
  chats: Chat[];
  activeId: string | null;
  query: string;
  onQuery: (q: string) => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onPin: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onNew: () => void;
  /** Signed-in account profile (null in anonymous mode). */
  user?: AuthUser | null;
  onSignOut?: () => void;
  onOpenSettings?: () => void;
}

function groupLabel(ts: number): "Today" | "Yesterday" | "Previous 7 days" | "Older" {
  if (!ts) return "Older";
  const startOf = (t: number) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const days = Math.floor((startOf(Date.now()) - startOf(ts)) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return "Previous 7 days";
  return "Older";
}

const LABELS = ["Today", "Yesterday", "Previous 7 days", "Older"] as const;

export default function Sidebar({
  chats,
  activeId,
  query,
  onQuery,
  onSelect,
  onDelete,
  onPin,
  onRename,
  onNew,
  user,
  onSignOut,
  onOpenSettings,
}: Props) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const [acctOpen, setAcctOpen] = useState(false);
  // ChatGPT-style inline rename: the row turns into an input (no window.prompt).
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");
  const q = query.trim().toLowerCase();
  const filtered = q
    ? chats.filter((c) => c.title.toLowerCase().includes(q))
    : chats;

  // Pinned first, then most recently updated (like ChatGPT).
  const sorted = [...filtered].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });

  const pinned = sorted.filter((c) => c.pinned);
  const rest = sorted.filter((c) => !c.pinned);
  const groups: { label: string; items: Chat[] }[] = [
    ...(pinned.length ? [{ label: "Pinned", items: pinned }] : []),
    ...LABELS.map((label) => ({ label, items: rest.filter((c) => groupLabel(c.updatedAt) === label) })).filter(
      (g) => g.items.length > 0
    ),
  ];

  const commitRename = (id: string) => {
    const next = renameText.trim().slice(0, 80);
    if (next && next !== chats.find((c) => c.id === id)?.title) onRename(id, next);
    setRenameId(null);
  };

  const renderItem = (c: Chat) =>
    renameId === c.id ? (
      <div key={c.id} className="chat-item renaming" onClick={(e) => e.stopPropagation()} role="presentation">
        <input
          className="rename-input"
          value={renameText}
          autoFocus
          maxLength={80}
          spellCheck={false}
          aria-label="Rename chat"
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setRenameText(e.target.value)}
          onBlur={() => commitRename(c.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitRename(c.id);
            } else if (e.key === "Escape") {
              e.preventDefault();
              setRenameId(null);
            }
          }}
        />
      </div>
    ) : (
      <div
        key={c.id}
        className={`chat-item${c.id === activeId ? " active" : ""}`}
        onClick={() => onSelect(c.id)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSelect(c.id);
        }}
      >
        <span className="t">{c.title || "New chat"}</span>
        <span className="actions">
          <button
            className={`mini${c.pinned ? " on" : ""}`}
            type="button"
            title={c.pinned ? "Unpin" : "Pin"}
            aria-label={c.pinned ? "Unpin" : "Pin"}
            onClick={(e) => {
              e.stopPropagation();
              onPin(c.id);
            }}
          >
            <PinIcon />
          </button>
          <button
            className="mini"
            type="button"
            title="Rename"
            aria-label="Rename"
            onClick={(e) => {
              e.stopPropagation();
              setRenameId(c.id);
              setRenameText(c.title);
            }}
          >
            <PencilIcon size={13} />
          </button>
          <button
            className="mini"
            type="button"
            title="Delete"
            aria-label="Delete"
            onClick={(e) => {
              e.stopPropagation();
              // No confirm dialog — ChatGPT deletes right away with an Undo toast.
              onDelete(c.id);
            }}
          >
            <TrashIcon />
          </button>
        </span>
      </div>
    );

  return (
    <div className="sidebar" id="sidebar">
      <div className="sb-top">
        <button className="newchat" type="button" onClick={onNew}>
          <PencilIcon size={15} />
          <span>New chat</span>
        </button>
        <button
          className="icon-btn"
          type="button"
          title="Hide sidebar"
          onClick={() => {
            document.documentElement.dataset.sidebar = "closed";
            try {
              window.localStorage.setItem("chatgpt2.sidebar", "closed");
            } catch {}
          }}
        >
          ⟨
        </button>
      </div>

      <div className="sb-search">
        <input
          type="text"
          value={query}
          placeholder="Search chats…"
          autoComplete="off"
          onChange={(e) => onQuery(e.target.value)}
        />
      </div>

      {q ? (
        <div className="sb-label">{filtered.length} result{filtered.length === 1 ? "" : "s"}</div>
      ) : null}

      <div className="chatlist" ref={listRef}>
        {filtered.length === 0 ? (
          <div className="empty-note">
            {q ? "No chats match that search." : "No conversations yet.\nStart one below."}
          </div>
        ) : (
          groups.map((g) => (
            <div key={g.label}>
              <div className="sb-label">{g.label}</div>
              {g.items.map(renderItem)}
            </div>
          ))
        )}
      </div>

      <div className="sb-bottom">
        {user ? (
          <>
            {acctOpen ? <div className="menu-backdrop" onClick={() => setAcctOpen(false)} /> : null}
            <button
              className={`acct${acctOpen ? " open" : ""}`}
              type="button"
              onClick={() => setAcctOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={acctOpen}
              title={user.email || user.name}
            >
              <span className="avatar">
                {user.image ? (
                  <img src={user.image} alt="" loading="lazy" />
                ) : (
                  (user.name.trim()[0] || "?").toUpperCase()
                )}
              </span>
              <span className="meta">
                <span className="name">{user.name}</span>
              </span>
              <span className="more" aria-hidden="true">
                ⋯
              </span>
            </button>
            {acctOpen ? (
              <div className="acct-menu" role="menu">
                <div className="acct-menu-head">
                  <span className="avatar">
                    {user.image ? (
                      <img src={user.image} alt="" loading="lazy" />
                    ) : (
                      (user.name.trim()[0] || "?").toUpperCase()
                    )}
                  </span>
                  <span className="meta">
                    <span className="name">{user.name}</span>
                    <span className="sub">{user.email || "Account"}</span>
                  </span>
                </div>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setAcctOpen(false);
                    onOpenSettings?.();
                  }}
                >
                  <SettingsIcon />
                  Settings
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="signout"
                  onClick={() => {
                    setAcctOpen(false);
                    onSignOut?.();
                  }}
                >
                  <LogOutIcon />
                  Sign out
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <button className="acct" type="button" onClick={onNew}>
            <span className="avatar">+</span>
            <span className="meta">
              <span className="name">Start a new chat</span>
              <span className="sub">Or pick one above</span>
            </span>
          </button>
        )}
      </div>
    </div>
  );
}