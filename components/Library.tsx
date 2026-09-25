"use client";

import { useEffect, useMemo, useState } from "react";
import { printImagesPdf, filesToImages, type PdfImage } from "@/lib/imagesPdf";
import { FileIcon } from "./Icons";
import { CloseIcon, SearchIcon, TrashIcon, MoreIcon, PinIcon, PencilIcon, DownloadIcon } from "./Icons";
import type { Msg } from "@/lib/types";

interface LibraryChat {
  id: string;
  title: string;
  messages: Msg[];
  updatedAt: number;
  pinned?: boolean;
}

interface Props {
  open: boolean;
  chats: LibraryChat[];
  activeId: string | null;
  onClose: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onPin: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onImport: (file: File) => void;
}

type Tab = "chats" | "images" | "audio";

interface ImageItem {
  key: string;
  url: string;
  chatId: string;
  chatTitle: string;
  prompt: string;
  at: number;
}

interface AudioItem {
  key: string;
  chatId: string;
  chatTitle: string;
  text: string;
  voice: string;
  at: number;
}

function when(ts: number): string {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function Library({
  open,
  chats,
  activeId,
  onClose,
  onSelect,
  onDelete,
  onPin,
  onRename,
  onImport,
}: Props) {
  const [tab, setTab] = useState<Tab>("chats");
  const [q, setQ] = useState("");
  const [menuId, setMenuId] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");
  const [lightbox, setLightbox] = useState<string | null>(null);
  // Local images added for PDF export, alongside generated ones.
  const [localImages, setLocalImages] = useState<PdfImage[]>([]);

  useEffect(() => {
    if (open) {
      setTab("chats");
      setQ("");
      setMenuId(null);
    }
  }, [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!open) return;
      if (e.key === "Escape") {
        if (lightbox) setLightbox(null);
        else if (menuId) setMenuId(null);
        else onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, lightbox, menuId, onClose]);

  // Flatten generated images across every conversation.
  const images = useMemo<ImageItem[]>(() => {
    const out: ImageItem[] = [];
    for (const c of chats) {
      for (const m of c.messages) {
        if (m.generatedImage) {
          out.push({
            key: `${c.id}:${m.id}`,
            url: m.generatedImage,
            chatId: c.id,
            chatTitle: c.title || "New chat",
            prompt: m.content || "",
            at: c.updatedAt,
          });
        }
      }
    }
    return out.sort((a, b) => b.at - a.at);
  }, [chats]);

  // Assistant replies that are worth listening to again.
  const audio = useMemo<AudioItem[]>(() => {
    const out: AudioItem[] = [];
    for (const c of chats) {
      for (const m of c.messages) {
        if (m.role === "assistant" && m.content.trim().length > 40) {
          out.push({
            key: `${c.id}:${m.id}`,
            chatId: c.id,
            chatTitle: c.title || "New chat",
            text: m.content,
            voice: "",
            at: c.updatedAt,
          });
        }
      }
    }
    return out.sort((a, b) => b.at - a.at);
  }, [chats]);

  const needle = q.trim().toLowerCase();
  const filteredChats = useMemo(() => {
    const base = [...chats].sort((a, b) => {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
    if (!needle) return base;
    return base.filter((c) => {
      if (c.title.toLowerCase().includes(needle)) return true;
      return c.messages.some((m) => (m.content || "").toLowerCase().includes(needle));
    });
  }, [chats, needle]);

  const filteredImages = useMemo(
    () => (needle ? images.filter((i) => `${i.chatTitle} ${i.prompt}`.toLowerCase().includes(needle)) : images),
    [images, needle]
  );

  const filteredAudio = useMemo(
    () => (needle ? audio.filter((a) => `${a.chatTitle} ${a.text}`.toLowerCase().includes(needle)) : audio),
    [audio, needle]
  );

  if (!open) return null;

  const commitRename = (id: string) => {
    const next = renameText.trim().slice(0, 80);
    if (next) onRename(id, next);
    setRenameId(null);
  };

  // Route through the proxy so the file saves directly instead of opening a tab.
  const download = (url: string, name: string) => {
    const a = document.createElement("a");
    a.href = `/api/image-proxy?url=${encodeURIComponent(url)}&name=${encodeURIComponent(name)}`;
    a.download = name;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const counts = { chats: filteredChats.length, images: filteredImages.length, audio: filteredAudio.length };

  return (
    <div className="lib" role="dialog" aria-modal="true" aria-label="Library">
      <aside className="lib-side">
        <div className="lib-side-head">
          <span>Library</span>
          <button className="lib-x" type="button" onClick={onClose} title="Close library" aria-label="Close library">
            <CloseIcon size={16} />
          </button>
        </div>
        <div className="lib-nav" role="tablist" aria-label="Library sections">
          {(
            [
              ["chats", "Chats"],
              ["images", "Images"],
              ["audio", "Audio"],
            ] as Array<[Tab, string]>
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`lib-nav-item${tab === id ? " active" : ""}`}
              onClick={() => setTab(id)}
            >
              <span>{label}</span>
              <span className="lib-count">{counts[id]}</span>
            </button>
          ))}
        </div>
        <div className="lib-side-foot">
          <label className="lib-import btn">
            Import chats
            <input
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onImport(f);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </aside>

      <div className="lib-main">
        <div className="lib-search">
          <SearchIcon size={16} />
          <input
            type="text"
            value={q}
            placeholder={`Search ${tab}…`}
            autoComplete="off"
            onChange={(e) => setQ(e.target.value)}
            aria-label={`Search ${tab}`}
          />
          {q ? (
            <button className="lib-clear" type="button" onClick={() => setQ("")} title="Clear" aria-label="Clear search">
              <CloseIcon size={14} />
            </button>
          ) : null}
        </div>

        {tab === "chats" ? (
          filteredChats.length === 0 ? (
            <p className="lib-empty">{needle ? "No chats match your search." : "No conversations yet."}</p>
          ) : (
            <div className="lib-grid">
              {filteredChats.map((c) =>
                renameId === c.id ? (
                  <div key={c.id} className="lib-card lib-card-rename">
                    <input
                      className="lib-rename-input"
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
                    className={`lib-card${c.id === activeId ? " active" : ""}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setMenuId(null);
                      onSelect(c.id);
                      onClose();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        onSelect(c.id);
                        onClose();
                      }
                    }}
                  >
                    <div className="lib-card-top">
                      {c.pinned ? <PinIcon size={12} /> : null}
                      <span className="lib-card-when">{when(c.updatedAt)}</span>
                      <button
                        className="lib-more"
                        type="button"
                        title="More"
                        aria-label={`More actions for ${c.title}`}
                        aria-expanded={menuId === c.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuId((cur) => (cur === c.id ? null : c.id));
                        }}
                      >
                        <MoreIcon size={15} />
                      </button>
                    </div>
                    <h3 className="lib-card-title">{c.title || "New chat"}</h3>
                    <p className="lib-card-sub">
                      {c.messages.length} message{c.messages.length === 1 ? "" : "s"}
                    </p>
                    {menuId === c.id ? (
                      <>
                        <div className="chat-menu-backdrop" onClick={() => setMenuId(null)} />
                        <div className="chat-menu lib-menu" role="menu">
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
                            className="del"
                            onClick={(e) => {
                              e.stopPropagation();
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
                )
              )}
            </div>
          )
        ) : null}

        {tab === "images" ? (
          <div className="lib-imgs-bar">
            <label className="btn file-btn">
              <FileIcon size={14} /> Add local images
              <input
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={async (e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  if (!files.length) return;
                  const added = await filesToImages(files);
                  setLocalImages((prev) => [...prev, ...added]);
                }}
              />
            </label>
            <button
              type="button"
              className="btn primary"
              disabled={!filteredImages.length && !localImages.length}
              onClick={() => {
                const list: PdfImage[] = [
                  ...filteredImages.map((im) => ({ url: im.url, caption: im.prompt })),
                  ...localImages,
                ];
                if (!printImagesPdf({ title: "Next AI images", images: list, subtitle: `${list.length} selected` })) {
                  window.alert("Allow pop-ups to export images as PDF.");
                }
              }}
            >
              <FileIcon size={14} /> Save images as PDF
            </button>
            {localImages.length ? (
              <button type="button" className="btn" onClick={() => setLocalImages([])}>
                Clear local ({localImages.length})
              </button>
            ) : null}
          </div>
        ) : null}

        {tab === "images" ? (
          filteredImages.length === 0 ? (
            <p className="lib-empty">
              {needle ? "No images match your search." : "No generated images yet — try the 🖼 image tool."}
            </p>
          ) : (
            <div className="lib-imgs">
              {filteredImages.map((im) => (
                <figure key={im.key} className="lib-img">
                  <button
                    className="lib-img-hit"
                    type="button"
                    onClick={() => setLightbox(im.url)}
                    aria-label={`Open image: ${im.prompt.slice(0, 60)}`}
                  >
                    <img src={im.url} alt={im.prompt || "Generated image"} loading="lazy" />
                  </button>
                  <figcaption>
                    <span className="lib-img-prompt">{im.prompt || "Untitled"}</span>
                    <span className="lib-img-meta">
                      <button
                        type="button"
                        onClick={() => {
                          onSelect(im.chatId);
                          onClose();
                        }}
                        title={im.chatTitle}
                      >
                        {im.chatTitle}
                      </button>
                      <button
                        type="button"
                        title="Download"
                        aria-label="Download image"
                        onClick={() => download(im.url, `next-ai-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.png`)}
                      >
                        <DownloadIcon size={14} />
                      </button>
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>
          )
        ) : null}

        {tab === "audio" ? (
          filteredAudio.length === 0 ? (
            <p className="lib-empty">{needle ? "No replies match your search." : "No assistant replies yet."}</p>
          ) : (
            <div className="lib-list">
              {filteredAudio.map((a) => (
                <div key={a.key} className="lib-row">
                  <div className="lib-row-main">
                    <p className="lib-row-title">
                      {a.text.replace(/[#*`>\[\]]/g, "").replace(/\s+/g, " ").trim().slice(0, 120)}
                    </p>
                    <p className="lib-row-sub">
                      {a.chatTitle} · {when(a.at)}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      onSelect(a.chatId);
                      onClose();
                    }}
                  >
                    Open chat
                  </button>
                </div>
              ))}
            </div>
          )
        ) : null}
      </div>

      {lightbox ? (
        <div className="lib-lightbox" role="dialog" aria-modal="true" aria-label="Image preview" onClick={() => setLightbox(null)}>
          <button
            className="lib-lightbox-x"
            type="button"
            onClick={() => setLightbox(null)}
            title="Close"
            aria-label="Close preview"
          >
            <CloseIcon size={18} />
          </button>
          <img src={lightbox} alt="Full size" onClick={(e) => e.stopPropagation()} />
        </div>
      ) : null}
    </div>
  );
}
