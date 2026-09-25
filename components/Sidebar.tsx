"use client";

import { useEffect, useRef, useState } from "react";
import {
  PencilIcon,
  PinIcon,
  TrashIcon,
  SettingsIcon,
  LogOutIcon,
  MoreIcon,
  LibraryIcon,
  LogInIcon,
  ImageIcon,
  CloseIcon,
  LockIcon,
  UserIcon,
  TagIcon,
} from "./Icons";
import type { AuthUser } from "@/lib/types";

interface Chat {
  id: string;
  title: string;
  messages: unknown[];
  updatedAt: number;
  pinned?: boolean;
  tags?: string[];
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
  onTags?: (id: string, tags: string[]) => void;
  onNew: () => void;
  /** Start a brand-new chat with image mode already armed. */
  onCreateImage?: () => void;
  /** Signed-in account profile (null in anonymous mode). */
  user?: AuthUser | null;
  onSignOut?: () => void;
  onOpenSettings?: () => void;
  /** Open Settings directly on the Profile section. */
  onEditProfile?: () => void;
  onOpenLibrary?: () => void;
  /** Opens the optional sign-in modal (undefined when Firebase isn't configured). */
  onOpenLogin?: () => void;
  /** False when Firebase isn't configured — hides the "Log in" affordance. */
  authAvailable?: boolean;
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
  onTags,
  onNew,
  onCreateImage,
  user,
  onSignOut,
  onOpenSettings,
  onEditProfile,
  onOpenLibrary,
  onOpenLogin,
  authAvailable = true,
}: Props) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const [acctOpen, setAcctOpen] = useState(false);
  // ChatGPT-style inline rename: the row turns into an input (no window.prompt).
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");
  // Which chat row currently has its ⋯ menu open (null = none).
  const [menuId, setMenuId] = useState<string | null>(null);
  // Inline tag editor.
  const [tagId, setTagId] = useState<string | null>(null);
  const [tagText, setTagText] = useState("");

  const setTagFor = (id: string) => {
    setTagText((chats.find((c) => c.id === id)?.tags ?? []).join(", "));
    setTagId(id);
  };

  const commitTags = (id: string) => {
    const tags = tagText
      .split(",")
      .map((t) => t.trim().replace(/^#/, "").toLowerCase())
      .filter(Boolean)
      .slice(0, 8);
    onTags?.(id, tags);
    setTagId(null);
  };
  // Signed-out users see a blurred, locked "Create image" teaser.
  const [imgLocked, setImgLocked] = useState(false);

  // Escape closes the locked teaser.
  useEffect(() => {
    if (!imgLocked) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setImgLocked(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [imgLocked]);

  const openImageTool = () => {
    if (!user) {
      setImgLocked(true);
      return;
    }
    onCreateImage?.();
  };
  const q = query.trim().toLowerCase();
  // Search titles, tags and message content, so any phrase said in a
  // conversation can be found from the sidebar.
  const filtered = q
    ? chats.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          (c.tags ?? []).some((t) => t.toLowerCase().includes(q)) ||
          c.messages.some((m) => String((m as { content?: string })?.content ?? "").toLowerCase().includes(q))
      )
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

  // Keyboard navigation: ↑/↓ walks the chat list, Enter opens, Home/End jump.
  const onListKey = (e: React.KeyboardEvent) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    const list = sorted;
    if (!list.length) return;
    e.preventDefault();
    const cur = list.findIndex((c) => c.id === activeId);
    let next = cur;
    if (e.key === "Home") next = 0;
    else if (e.key === "End") next = list.length - 1;
    else if (e.key === "ArrowDown") next = cur < 0 ? 0 : Math.min(list.length - 1, cur + 1);
    else next = cur < 0 ? list.length - 1 : Math.max(0, cur - 1);
    const target = list[next];
    if (!target) return;
    onSelect(target.id);
    requestAnimationFrame(() => {
      const nodes = listRef.current?.querySelectorAll<HTMLElement>(".chat-item");
      nodes?.[next]?.focus();
    });
  };

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
        className={`chat-item${c.id === activeId ? " active" : ""}${menuId === c.id ? " menu-open" : ""}`}
        onClick={() => {
          setMenuId(null);
          onSelect(c.id);
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            setMenuId(null);
            onSelect(c.id);
          }
        }}
      >
        <span className="t">{c.title || "New chat"}</span>
        {tagId === c.id ? (
          <input
            className="tag-input"
            value={tagText}
            autoFocus
            placeholder="tag1, tag2"
            aria-label="Chat tags"
            onChange={(e) => setTagText(e.target.value)}
            onBlur={() => commitTags(c.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitTags(c.id);
              if (e.key === "Escape") setTagId(null);
            }}
          />
        ) : null}        {c.tags?.length && tagId !== c.id ? (
          <span className="chat-tags">
            {c.tags.slice(0, 2).map((t) => (
              <span key={t} className="tag-pill">
                {t}
              </span>
            ))}
            {c.tags.length > 2 ? <span className="tag-more">+{c.tags.length - 2}</span> : null}
          </span>
        ) : null}
        {c.pinned ? <PinIcon size={12} /> : null}
        <button
          className="chat-more"
          type="button"
          title="More"
          aria-label={`More actions for ${c.title || "New chat"}`}
          aria-haspopup="menu"
          aria-expanded={menuId === c.id}
          onClick={(e) => {
            e.stopPropagation();
            setMenuId((cur) => (cur === c.id ? null : c.id));
          }}
        >
          <MoreIcon />
        </button>
        {menuId === c.id ? (
          <>
            <div className="chat-menu-backdrop" onClick={() => setMenuId(null)} />
            <div className="chat-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  onPin(c.id);
                  setMenuId(null);
                }}
              >
                <PinIcon size={15} />
                {c.pinned ? "Unpin" : "Pin"}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  setRenameId(c.id);
                  setRenameText(c.title);
                  setMenuId(null);
                }}
              >
                <PencilIcon size={15} />
                Rename
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuId(null);
                  setTagFor(c.id);
                }}
              >
                <TagIcon size={15} />
                {c.tags?.length ? "Edit tags" : "Add tags"}
              </button>
              <button
                type="button"
                role="menuitem"
                className="del"
                onClick={(e) => {
                  e.stopPropagation();
                  // No confirm dialog — ChatGPT deletes right away with an Undo toast.
                  setMenuId(null);
                  onDelete(c.id);
                }}
              >
                <TrashIcon size={15} />
                Delete
              </button>
            </div>
          </>
        ) : null}
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
          ⋯
        </button>
      </div>

      {/* Create image — blurred/locked teaser until the user signs in. */}
      <div className="sb-nav">
        <button className="sb-nav-item" type="button" onClick={openImageTool}>
          <ImageIcon />
          <span>Create image</span>
        </button>
      </div>

      {/* History is account-scoped, so it's only shown once signed in. */}
      {user ? (
        <>
          <div className="sb-nav">
            <button className="sb-nav-item" type="button" onClick={() => onOpenLibrary?.()}>
              <LibraryIcon />
              <span>Library</span>
            </button>
          </div>

          <div className="sb-search">
            <input
              type="text"
              value={query}
              placeholder="Search chats⋯"
              autoComplete="off"
              onChange={(e) => onQuery(e.target.value)}
            />
          </div>

          {q ? (
            <div className="sb-label">{filtered.length} result{filtered.length === 1 ? "" : "s"}</div>
          ) : null}

          <div className="chatlist" ref={listRef} onKeyDown={onListKey} role="listbox" aria-label="Chat history">
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
        </>
      ) : (
        // Signed out: no history, no search, no library — just empty space.
        <div className="chatlist" />
      )}

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
                  onClick={() => {
                    setAcctOpen(false);
                    onEditProfile?.();
                  }}
                >
                  <UserIcon />
                  Edit profile
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
          // ChatGPT puts "Log in" at the very bottom of the sidebar, with the
          // "tailored to you" line right above it.
          <div className="sb-anon">
            <p className="sb-gate-title">Get responses tailored to you</p>
            <p className="sb-gate-sub">
              Log in to get answers based on saved chats, plus create images and upload files.
            </p>
            <button className="sb-login" type="button" onClick={() => onOpenLogin?.()}>
              <LogInIcon />
              Log in
            </button>
          </div>
        )}
      </div>

      {imgLocked ? (
        <div
          className="lock-veil"
          role="dialog"
          aria-modal="true"
          aria-label="Create image"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setImgLocked(false);
          }}
        >
          <div className="lock-card">
            <button
              className="lock-x"
              type="button"
              onClick={() => setImgLocked(false)}
              title="Close"
              aria-label="Close"
            >
              <CloseIcon size={16} />
            </button>

            <div className="lock-art" aria-hidden="true">
              <div className="lock-blur" />
              <div className="lock-badge">
                <LockIcon size={22} />
              </div>
            </div>

            <h2 className="lock-title">Create images with Next AI</h2>
            <p className="lock-sub">
              Log in to generate and edit images from a prompt, and keep every creation in your library.
            </p>
            <button
              className="lock-cta"
              type="button"
              onClick={() => {
                setImgLocked(false);
                onOpenLogin?.();
              }}
            >
              <LogInIcon />
              Log in to create images
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}