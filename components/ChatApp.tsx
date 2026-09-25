"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Composer from "./Composer";
import MessageRow from "./MessageRow";
import SettingsModal from "./SettingsModal";
import Sidebar from "./Sidebar";
import {
  MoonIcon,
  SidebarIcon,
  SunIcon,
  DownloadIcon,
  HelpIcon,
  CopyIcon,
  ArrowDownIcon,
  ShareIcon,
} from "./Icons";
import {
  DEFAULT_SETTINGS,
  MODELS,
  modelName,
  type AuthUser,
  type Chat,
  type Msg,
  type Settings,
} from "@/lib/types";
import {
  clearStore,
  loadActiveId,
  loadChats,
  loadSettings,
  sanitizeChat,
  saveActiveId,
  saveChats,
  saveSettings,
  setAuthUid,
  titleFrom,
  uid,
} from "@/lib/store";

/* ---------- share-link codec (URL-hash, gzip + base64url) ---------- */
function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Blob-safe copy of a byte view (TS requires a non-shared ArrayBuffer). */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/** Decode a `#c=…` share payload into a Chat, or null when it isn't valid. */
async function decodeSharedChat(hash: string): Promise<Chat | null> {
  const m = /[#&]c=([A-Za-z0-9\-_]+)/.exec(hash);
  if (!m) return null;
  try {
    const tag = m[1][0];
    const data = m[1].slice(1);
    let json: string;
    if (tag === "z") {
      if (typeof DecompressionStream === "undefined") return null;
      const buf = await new Response(
        new Blob([toArrayBuffer(unb64url(data))]).stream().pipeThrough(new DecompressionStream("gzip"))
      ).text();
      json = buf;
    } else if (tag === "p") {
      json = new TextDecoder().decode(unb64url(data));
    } else {
      return null;
    }
    const raw = JSON.parse(json) as {
      title?: string;
      model?: string;
      messages?: Array<{ role?: string; content?: string; img?: string }>;
    };
    const msgs = (raw.messages ?? [])
      .filter((x) => x && (x.role === "user" || x.role === "assistant") && typeof x.content === "string")
      .map<Msg>((x) => ({
        id: uid(),
        role: x.role as "user" | "assistant",
        content: x.content ?? "",
        ...(x.img ? { generatedImage: x.img } : {}),
      }));
    if (!msgs.length) return null;
    const now = Date.now();
    return {
      id: uid(),
      title: (raw.title || "Shared chat").slice(0, 80),
      messages: msgs,
      createdAt: now,
      updatedAt: now,
      ...(raw.model ? { model: raw.model } : {}),
    };
  } catch {
    return null;
  }
}

const SUGGESTIONS: { title: string; sub: string; prompt: string }[] = [
  {
    title: "Explain a concept",
    sub: "Break down a hard idea in plain language",
    prompt: "Explain how HTTPS keeps my connection secure, in plain language with a simple analogy.",
  },
  {
    title: "Write some code",
    sub: "Generate a working, commented snippet",
    prompt: "Write a TypeScript function that debounces another function, with a usage example.",
  },
  {
    title: "Compare two options",
    sub: "Weigh trade-offs in a table",
    prompt: "Compare PostgreSQL and MongoDB for a new app. Use a table and give a clear recommendation.",
  },
  {
    title: "Draft a message",
    sub: "Turn rough notes into clean prose",
    prompt: "Draft a short, friendly email asking my team to move our Friday meeting to Monday.",
  },
];

interface ChatAppProps {
  /** Firebase account uid, or null when running anonymously (no Firebase configured). */
  authUid?: string | null;
  /** Signed-in account profile, or null in anonymous mode. */
  user?: AuthUser | null;
  /** Sign out of the current Firebase account. */
  onSignOut?: () => void;
}

export default function ChatApp({ authUid = null, user = null, onSignOut }: ChatAppProps) {
  // Bind every persisted key (chats/settings/active) to this account before
  // any load/save runs. ChatApp is remounted per account by AuthGate (key=uid).
  setAuthUid(authUid);

  const [chats, setChats] = useState<Chat[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [input, setInput] = useState("");
  const [attach, setAttach] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [imgBusy, setImgBusy] = useState(false);
  const [imgMode, setImgMode] = useState(false);
  const [query, setQuery] = useState("");
  const [ready, setReady] = useState(false);
  const [modelMenu, setModelMenu] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 52, left: 12 });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [toastAction, setToastAction] = useState<{ label: string; run: () => void } | null>(null);
  const [streamId, setStreamId] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickRef = useRef(true);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modelBtnRef = useRef<HTMLButtonElement | null>(null);

  /* ---------- hydration ---------- */
  useEffect(() => {
    const stored = loadChats();
    const s = loadSettings();
    setSettings(s);
    setChats(stored);
    const act = loadActiveId();
    setActiveId(act && stored.some((c) => c.id === act) ? act : stored[0]?.id ?? null);
    setReady(true);
    try {
      const sb = window.localStorage.getItem("chatgpt2.sidebar");
      document.documentElement.dataset.sidebar = sb === "closed" ? "closed" : window.innerWidth < 880 ? "closed" : "open";
    } catch {
      document.documentElement.dataset.sidebar = "open";
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    saveChats(chats);
  }, [chats, ready]);

  useEffect(() => {
    if (!ready) return;
    saveSettings(settings);
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.dataset.bubble = settings.bubbleColor;
  }, [settings, ready]);

  useEffect(() => {
    if (!ready) return;
    saveActiveId(activeId);
  }, [activeId, ready]);

  const active = useMemo(() => chats.find((c) => c.id === activeId) ?? null, [chats, activeId]);
  const messages = active?.messages ?? [];

  /* ---------- toast ---------- */
  const clearToast = useCallback(() => {
    setToast("");
    setToastAction(null);
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  const notify = useCallback((text: string) => {
    setToastAction(null);
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2200);
  }, []);

  /** ChatGPT-style toast with an inline action, e.g. "Chat deleted · Undo". */
  const notifyAction = useCallback((text: string, label: string, run: () => void) => {
    setToast(text);
    setToastAction({ label, run });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => {
      setToast("");
      setToastAction(null);
    }, 6000);
  }, []);

  // Opening a `#c=…` share link imports that conversation as a new chat.
  useEffect(() => {
    if (!ready) return;
    if (!/[#&]c=/.test(window.location.hash)) return;
    let live = true;
    void (async () => {
      const shared = await decodeSharedChat(window.location.hash);
      if (!live) return;
      history.replaceState(null, "", window.location.pathname + window.location.search);
      if (!shared) {
        notify("This share link is invalid or corrupted");
        return;
      }
      setChats((prev) => [shared, ...prev]);
      setActiveId(shared.id);
      notify(`Shared chat imported: “${shared.title}”`);
    })();
    return () => {
      live = false;
    };
  }, [ready, notify]);

  /* ---------- scrolling ---------- */
  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  useEffect(() => {
    if (stickRef.current) scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90;
      // ChatGPT shows a down-arrow whenever the thread is scrolled up.
      setShowScrollBtn(!stickRef.current);
    };
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  /* ---------- chat mutations ---------- */
  const patchChat = useCallback((id: string, fn: (c: Chat) => Chat) => {
    setChats((prev) => prev.map((c) => (c.id === id ? fn(c) : c)));
  }, []);

  /**
   * ChatGPT-style auto-title: ask the model for a 2-5 word name from the first
   * user message. Silently keeps the `titleFrom` fallback if the call fails.
   */
  const autoTitle = useCallback(
    async (chatId: string, first: string) => {
      const source = first.trim().slice(0, 1200);
      if (!source) return;
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": settings.apiKey.trim(),
            "x-base-url": settings.baseUrl.trim(),
          },
          body: JSON.stringify({
            title: true,
            model: settings.model,
            messages: [{ role: "user", content: source }],
          }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { title?: string };
        const title = (data.title ?? "").trim().slice(0, 60);
        if (!title) return;
        // Only overwrite while the chat still holds just the first message, so a
        // manual rename made meanwhile always wins.
        setChats((prev) =>
          prev.map((c) => (c.id === chatId && c.messages.length === 1 ? { ...c, title } : c))
        );
      } catch {
        /* keep the titleFrom fallback */
      }
    },
    [settings.apiKey, settings.baseUrl, settings.model]
  );

  const newChat = useCallback(() => {
    abortRef.current?.abort();
    const chat: Chat = {
      id: uid(),
      title: "New chat",
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      model: settings.model,
    };
    setChats((prev) => [chat, ...prev]);
    setActiveId(chat.id);
    setInput("");
    setAttach(null);
    stickRef.current = true;
    if (window.innerWidth < 880) document.documentElement.dataset.sidebar = "closed";
    return chat.id;
  }, [settings.model]);

  const deleteChat = useCallback(
    (id: string) => {
      const idx = chats.findIndex((c) => c.id === id);
      if (idx === -1) return;
      const removed = chats[idx];
      const next = chats.filter((c) => c.id !== id);
      setChats(next);
      setActiveId((cur) => (cur === id ? next[0]?.id ?? null : cur));
      // ChatGPT deletes immediately and offers a short Undo instead of a confirm.
      notifyAction("Chat deleted", "Undo", () => {
        setChats((cur) => {
          if (cur.some((c) => c.id === removed.id)) return cur;
          const restored = [...cur];
          restored.splice(Math.min(idx, restored.length), 0, removed);
          return restored;
        });
      });
    },
    [chats, notifyAction]
  );

  const clearAll = useCallback(() => {
    abortRef.current?.abort();
    setChats([]);
    setActiveId(null);
    setSettings(DEFAULT_SETTINGS);
    clearStore();
    document.documentElement.dataset.theme = DEFAULT_SETTINGS.theme;
    document.documentElement.dataset.bubble = DEFAULT_SETTINGS.bubbleColor;
    notify("All local data cleared");
  }, [notify]);

  /* ---------- streaming ---------- */
  const runStream = useCallback(
    async (chatId: string, history: Msg[]) => {
      const assistantId = uid();
      const placeholder: Msg = { id: assistantId, role: "assistant", content: "" };

      patchChat(chatId, (c) => ({
        ...c,
        messages: [...c.messages, placeholder],
        updatedAt: Date.now(),
      }));

      const ac = new AbortController();
      abortRef.current = ac;
      setBusy(true);
      setStreamId(assistantId);
      stickRef.current = true;

      let acc = "";
      let errored = false;
      let stopped = false;
      let toolsUsed: string[] = [];

      const flush = () => {
        const snapshot = acc;
        patchChat(chatId, (c) => ({
          ...c,
          messages: c.messages.map((m) => (m.id === assistantId ? { ...m, content: snapshot } : m)),
        }));
      };

      try {
        // OpenAI-style content: plain string, or a parts array when an image is attached.
        const toContent = (m: Msg) => {
          if (!m.image) return m.content;
          const parts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
          if (m.content.trim()) parts.push({ type: "text", text: m.content });
          parts.push({ type: "image_url", image_url: { url: m.image } });
          return parts;
        };
        const payload = [
          ...(settings.systemPrompt.trim() ? [{ role: "system" as const, content: settings.systemPrompt.trim() }] : []),
          ...history
            .filter((m) => !m.error && (m.content.trim() !== "" || !!m.image))
            .map((m) => ({ role: m.role as "user" | "assistant", content: toContent(m) })),
        ];

        // Batch web search: if search is on, we send the query as a single-element array
        // (the API supports up to 5; future enhancement could split complex questions).
        const queries = settings.search && history.length > 0
          ? [history[history.length - 1]?.content?.trim()].filter(Boolean)
          : undefined;

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(settings.apiKey.trim() ? { "x-api-key": settings.apiKey.trim() } : {}),
            "x-base-url": settings.baseUrl.trim(),
          },
          body: JSON.stringify({
            messages: payload,
            model: settings.model,
            temperature: settings.temperature,
            stream: true,
            search: settings.search,
            tools: settings.tools,
            ...(queries ? { queries } : {}),
          }),
          signal: ac.signal,
        });

        if (!res.ok) {
          const detail = await res.text().catch(() => "");
          throw new Error(`HTTP ${res.status}${detail ? ` — ${detail.slice(0, 300)}` : ""}`);
        }
        if (!res.body) throw new Error("The server returned no response body.");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let paint = false;

        const drain = (frame: string) => {
          const line = frame.startsWith("data:") ? frame.slice(5).trim() : frame.trim();
          if (!line || line === "[DONE]") return;
          let json: {
            delta?: string;
            error?: string;
            tools_used?: string[];
            choices?: { delta?: { content?: string } }[];
          };
          try {
            json = JSON.parse(line);
          } catch {
            return;
          }
          if (json.error) {
            errored = true;
            acc += (acc ? "\n\n" : "") + String(json.error);
            return;
          }
          if (Array.isArray(json.tools_used) && json.tools_used.length) {
            toolsUsed = [...toolsUsed, ...json.tools_used];
          }
          const piece = json.delta ?? json.choices?.[0]?.delta?.content ?? "";
          if (piece) {
            acc += piece;
            paint = true;
          }
        };

        const instant = !settings.streaming;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";
          for (const f of frames) drain(f);
          if (!instant && paint) {
            paint = false;
            flush();
            if (stickRef.current) scrollToBottom();
          }
        }
        if (buffer.trim()) drain(buffer);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          stopped = true;
          if (!acc) acc = "(generation stopped)";
        } else {
          errored = true;
          const message = err instanceof Error ? err.message : "Unknown error";
          const hint = settings.apiKey.trim()
            ? ""
            : "\n\nTip: no API key is set, so offline demo mode was requested — if you see this, the demo route failed.";
          acc = (acc ? acc + "\n\n" : "") + `⚠️ ${message}${hint}`;
        }
      } finally {
        const finalText = acc;
        patchChat(chatId, (c) => ({
          ...c,
          messages: c.messages.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: finalText || "(no response)",
                  error: errored,
                  stopped: stopped && !errored,
                  toolsUsed: toolsUsed.length ? [...new Set(toolsUsed)] : undefined,
                }
              : m
          ),
          updatedAt: Date.now(),
        }));
        setBusy(false);
        setStreamId(null);
        abortRef.current = null;
        if (stickRef.current) scrollToBottom(true);
      }
    },
    [patchChat, scrollToBottom, settings]
  );

  /* ---------- chat tools: pin / delete message / edit & resend / export ---------- */
  const togglePin = useCallback(
    (id: string) => {
      patchChat(id, (c) => ({ ...c, pinned: !c.pinned, updatedAt: Date.now() }));
      const pinned = chats.find((c) => c.id === id)?.pinned;
      notify(pinned ? "Chat unpinned" : "Chat pinned");
    },
    [patchChat, chats, notify]
  );

  // Deleting a message removes it and everything after it (ChatGPT behavior).
  const deleteMessage = useCallback(
    (chatId: string, msgId: string) => {
      const chat = chats.find((c) => c.id === chatId);
      const idx = chat?.messages.findIndex((m) => m.id === msgId) ?? -1;
      abortRef.current?.abort();
      patchChat(chatId, (c) => ({
        ...c,
        messages: idx === -1 ? c.messages : c.messages.slice(0, idx),
        updatedAt: Date.now(),
      }));
      notify(idx === -1 ? "Message not found" : "Message deleted");
    },
    [chats, patchChat, notify]
  );

  // ChatGPT-style 👍/👎 feedback stored on the assistant message.
  const setFeedback = useCallback(
    (chatId: string, msgId: string, value: "up" | "down" | null) => {
      patchChat(chatId, (c) => ({
        ...c,
        messages: c.messages.map((m) => (m.id === msgId ? { ...m, feedback: value ?? undefined } : m)),
      }));
    },
    [patchChat]
  );

  /**
   * Share link: the whole conversation is compressed into the URL hash
   * (gzip + base64url), so no server or database is involved. Opening such a
   * link imports the conversation as a new chat.
   */
  const shareChat = useCallback(async () => {
    if (!active) return;
    try {
      const json = JSON.stringify({
        v: 1,
        title: active.title,
        model: active.model,
        messages: active.messages.map((m) => ({
          role: m.role,
          content: m.content,
          ...(m.generatedImage ? { img: m.generatedImage } : {}),
        })),
      });
      const bytes = new TextEncoder().encode(json);
      let packed: string;
      if (typeof CompressionStream !== "undefined") {
        const cs = new CompressionStream("gzip");
        const buf = await new Response(
          new Blob([toArrayBuffer(bytes)]).stream().pipeThrough(cs)
        ).arrayBuffer();
        packed = "z" + b64url(new Uint8Array(buf));
      } else {
        packed = "p" + b64url(bytes);
      }
      const url = `${location.origin}${location.pathname}#c=${packed}`;
      await navigator.clipboard.writeText(url);
      notify("Share link copied to clipboard");
    } catch {
      notify("Couldn't create a share link");
    }
  }, [active, notify]);

  // Edit a user message and resend: truncate after it, swap text, regenerate reply.
  const editResend = useCallback(
    (chatId: string, msgId: string, text: string) => {
      if (busy) return;
      const chat = chats.find((c) => c.id === chatId);
      if (!chat) return;
      const idx = chat.messages.findIndex((m) => m.id === msgId);
      if (idx === -1) return;
      const edited = chat.messages.slice(0, idx + 1).map((m, i) =>
        i === idx ? { ...m, content: text } : m
      );
      patchChat(chatId, (c) => ({ ...c, messages: edited, updatedAt: Date.now() }));
      void runStream(chatId, edited);
    },
    [busy, chats, patchChat, runStream]
  );

  const exportChat = useCallback(() => {
    const a = active;
    if (!a || a.messages.length === 0) {
      notify("Nothing to export yet");
      return;
    }
    const who = (role: string) => (role === "user" ? settings.nickname.trim() || "You" : "ChatGPT");
    const md = [
      `# ${a.title}`,
      "",
      `_Exported ${new Date().toLocaleString()} — ${a.messages.length} message(s)_`,
      "",
      ...a.messages.flatMap((m) => [`## ${who(m.role)}`, "", `${m.content}`, ""]),
    ].join("\n");
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${a.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "chat"}.md`;
    link.click();
    URL.revokeObjectURL(url);
    notify("Chat exported as Markdown");
  }, [active, settings.nickname, notify]);

  const copyFullChat = useCallback(async () => {
    const a = active;
    if (!a || a.messages.length === 0) {
      notify("Nothing to copy yet");
      return;
    }
    const who = (role: string) => (role === "user" ? settings.nickname.trim() || "You" : "ChatGPT");
    const md = [
      `# ${a.title}`,
      "",
      ...a.messages.flatMap((m) => [`## ${who(m.role)}`, "", `${m.content.trim()}`, ""]),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(md);
      notify("Conversation copied as Markdown");
    } catch {
      notify("Copy failed — select the text manually");
    }
  }, [active, settings.nickname, notify]);

  // Per-chat model memory: reopening a chat restores the model it was using.
  const selectChat = useCallback(
    (id: string) => {
      setActiveId(id);
      const chat = chats.find((c) => c.id === id);
      if (chat?.model && chat.model !== settings.model) {
        setSettings((s) => ({ ...s, model: chat.model as string }));
      }
      stickRef.current = true;
      if (window.innerWidth < 880) document.documentElement.dataset.sidebar = "closed";
    },
    [chats, settings.model]
  );

  /* ---------- tools: image generation + chat backup/restore ---------- */
  const generateImage = useCallback(async () => {
    const prompt = input.trim();
    if (!prompt) {
      notify("Type an image prompt in the composer first");
      return;
    }
    if (imgBusy) return;
    setImgMode(false);

    const userMsg: Msg = { id: uid(), role: "user", content: `Generate an image: ${prompt}` };
    const pendingMsg: Msg = { id: uid(), role: "assistant", content: prompt, imgPending: true };
    let chatId = activeId;
    if (!chatId) {
      const chat: Chat = {
        id: uid(),
        title: titleFrom(prompt),
        messages: [userMsg, pendingMsg],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        model: settings.model,
      };
      chatId = chat.id;
      setChats((prev) => [chat, ...prev]);
      setActiveId(chat.id);
    } else {
      patchChat(chatId, (c) => ({
        ...c,
        title: c.messages.length === 0 ? titleFrom(prompt) : c.title,
        messages: [...c.messages, userMsg, pendingMsg],
        updatedAt: Date.now(),
      }));
    }
    setInput("");
    setImgBusy(true);
    stickRef.current = true;

    // Name the conversation from the first prompt, like ChatGPT.
    if (!active || active.messages.length === 0) void autoTitle(chatId, prompt);

    const settle = (patch: Partial<Msg>) => {
      patchChat(chatId, (c) => ({
        ...c,
        messages: c.messages.map((m) => (m.id === pendingMsg.id ? { ...m, ...patch } : m)),
        updatedAt: Date.now(),
      }));
      if (stickRef.current) scrollToBottom(true);
    };

    try {
      const res = await fetch("/api/image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(settings.apiKey.trim() ? { "x-api-key": settings.apiKey.trim() } : {}),
          "x-base-url": settings.baseUrl.trim(),
        },
        body: JSON.stringify({ prompt, ratio: settings.imageRatio }),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      settle({ generatedImage: data.url, imgPending: false });
      notify("Image generated ✓");
    } catch (err) {
      settle({
        content: `⚠️ Image generation failed: ${err instanceof Error ? err.message : "unknown error"}`,
        error: true,
        imgPending: false,
      });
    } finally {
      setImgBusy(false);
    }
  }, [active, activeId, autoTitle, imgBusy, input, notify, patchChat, scrollToBottom, setChats, settings, setImgMode]);

  const exportAllChats = useCallback(() => {
    const data = {
      app: "chatgpt2-next",
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: {
        model: settings.model,
        theme: settings.theme,
        nickname: settings.nickname,
      },
      chats,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `chatgpt2-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    notify(`Exported ${chats.length} chat${chats.length === 1 ? "" : "s"}`);
  }, [chats, notify, settings]);

  const importChats = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        const parsed = JSON.parse(text) as { chats?: unknown[] } | unknown[];
        const list = Array.isArray(parsed) ? parsed : (parsed as { chats?: unknown[] }).chats;
        if (!Array.isArray(list)) {
          notify("No chats found in that file");
          return;
        }
        const clean = list.map(sanitizeChat).filter((c): c is Chat => c !== null);
        if (!clean.length) {
          notify("No valid chats in that file");
          return;
        }
        setChats((prev) => {
          const seen = new Set(prev.map((c) => c.id));
          const merged = [...prev];
          for (const c of clean) {
            if (seen.has(c.id)) continue;
            seen.add(c.id);
            merged.push(c);
          }
          return merged;
        });
        notify(`Imported ${clean.length} chat${clean.length === 1 ? "" : "s"}`);
      } catch {
        notify("Import failed — not a valid JSON backup file");
      }
    },
    [notify, setChats]
  );

  const send = useCallback(
    (raw?: string) => {
      const text = (raw ?? input).trim();
      if (busy || (!text && !attach)) return;

      // Image mode is armed: sending generates an image instead of a chat reply.
      if (imgMode) {
        void generateImage();
        return;
      }

      let chatId = activeId;
      let history: Msg[] = [];
      const isFirst = !activeId || (active?.messages.length ?? 0) === 0;

      if (!chatId) {
        const chat: Chat = {
          id: uid(),
          title: titleFrom(text),
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          model: settings.model,
        };
        chatId = chat.id;
        setChats((prev) => [chat, ...prev]);
        setActiveId(chat.id);
      }

      const userMsg: Msg = {
        id: uid(),
        role: "user",
        content: text,
        ...(attach ? { image: attach } : {}),
      };
      history = [...((active?.messages ?? []) as Msg[]), userMsg];

      const id = chatId;
      setChats((prev) =>
        prev.map((c) =>
          c.id === id
            ? {
                ...c,
                title: c.messages.length === 0 ? titleFrom(text) : c.title,
                messages: [...c.messages, userMsg],
                model: c.model ?? settings.model,
                updatedAt: Date.now(),
              }
            : c
        )
      );

      setInput("");
      setAttach(null);
      void runStream(id, history);

      // ChatGPT names the conversation from its first user message.
      if (isFirst) void autoTitle(id, text);
    },
    [active, activeId, attach, autoTitle, busy, generateImage, imgMode, input, runStream, settings.model]
  );

  const regenerate = useCallback(() => {
    if (!active || busy) return;
    const msgs = [...active.messages];
    const lastUserIdx = (() => {
      for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].role === "user") return i;
      return -1;
    })();
    if (lastUserIdx === -1) return;
    const history = msgs.slice(0, lastUserIdx + 1);
    patchChat(active.id, (c) => ({ ...c, messages: history, updatedAt: Date.now() }));
    void runStream(active.id, history);
  }, [active, busy, patchChat, runStream]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        notify("Copied to clipboard");
      } catch {
        notify("Copy failed — select the text manually");
      }
    },
    [notify]
  );

  /* ---------- code copy buttons inside rendered markdown ---------- */
  const onThreadClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      if (!target.classList.contains("copy")) return;
      const encoded = target.getAttribute("data-code");
      if (!encoded) return;
      const code = decodeURIComponent(encoded);
      navigator.clipboard
        .writeText(code)
        .then(() => {
          const original = target.textContent;
          target.textContent = "Copied!";
          setTimeout(() => {
            target.textContent = original ?? "Copy";
          }, 1400);
        })
        .catch(() => notify("Copy failed"));
    },
    [notify]
  );

  /* ---------- shortcuts ---------- */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        newChat();
      } else if (meta && e.shiftKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        setSettingsOpen(true);
      } else if (e.key === "Escape") {
        setModelMenu(false);
        setHelpOpen(false);
      } else if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setHelpOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [newChat]);

  const openModelMenu = () => {
    const r = modelBtnRef.current?.getBoundingClientRect();
    setMenuPos({ top: (r?.bottom ?? 52) + 6, left: r?.left ?? 12 });
    setModelMenu((v) => !v);
  };

  const usingDemo = !settings.apiKey.trim() || settings.model === "demo";

  return (
    <div className="app">
      <div className="sb-backdrop" onClick={() => (document.documentElement.dataset.sidebar = "closed")} />

      <Sidebar
        chats={chats.map((c) => ({ id: c.id, title: c.title, messages: c.messages, updatedAt: c.updatedAt, pinned: c.pinned }))}
        activeId={activeId}
        query={query}
        onQuery={setQuery}
        onSelect={selectChat}
        onDelete={deleteChat}
        onPin={togglePin}
        onRename={(id, title) => patchChat(id, (c) => ({ ...c, title }))}
        onNew={newChat}
        user={user}
        onSignOut={onSignOut}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <main className="main">
        <div className="topbar">
          <div className="cluster">
            <button
              className="icon-btn"
              type="button"
              title="Toggle sidebar"
              onClick={() => {
                const open = document.documentElement.dataset.sidebar === "open";
                document.documentElement.dataset.sidebar = open ? "closed" : "open";
                try {
                  window.localStorage.setItem("chatgpt2.sidebar", open ? "closed" : "open");
                } catch {}
              }}
            >
              <SidebarIcon />
            </button>
          </div>

          <button className="model-btn" type="button" ref={modelBtnRef} onClick={openModelMenu} title={modelName(settings.model)}>
            <span className="mbn">{modelName(settings.model)}</span>
            <span className="chev">▾</span>
          </button>

          <div className="cluster">
            <button
              className="icon-btn hide-xs"
              type="button"
              title="Share chat (copies a link)"
              onClick={shareChat}
            >
              <ShareIcon />
            </button>
            <button
              className="icon-btn hide-xs"
              type="button"
              title="Copy full chat as Markdown"
              onClick={copyFullChat}
            >
              <CopyIcon />
            </button>
            <button
              className="icon-btn"
              type="button"
              title="Export chat as Markdown"
              onClick={exportChat}
            >
              <DownloadIcon />
            </button>
            <button className="icon-btn hide-sm" type="button" title="Keyboard shortcuts (?)" onClick={() => setHelpOpen((v) => !v)}>
              <HelpIcon />
            </button>
            <button
              className="icon-btn"
              type="button"
              title="Toggle theme"
              onClick={() => setSettings((s) => ({ ...s, theme: s.theme === "dark" ? "light" : "dark" }))}
            >
              {settings.theme === "dark" ? <SunIcon /> : <MoonIcon />}
            </button>
            <button className="icon-btn" type="button" title="Settings" onClick={() => setSettingsOpen(true)}>
              ⚙
            </button>
          </div>
        </div>

        {modelMenu ? (
          <>
            <div style={{ position: "fixed", inset: 0, zIndex: 55 }} onClick={() => setModelMenu(false)} />
            <div className="menu open" style={{ position: "fixed", top: menuPos.top, left: menuPos.left }}>
              {MODELS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`menu-item${settings.model === m.id ? " sel" : ""}`}
                  onClick={() => {
                    setSettings((s) => ({ ...s, model: m.id }));
                    if (active) patchChat(active.id, (c) => ({ ...c, model: m.id, updatedAt: Date.now() }));
                    setModelMenu(false);
                    if (m.id === "demo") notify("Switched to offline demo mode");
                  }}
                >
                  <span className="mi-t">
                    {m.name}
                    <span className="mi-d">{m.desc}</span>
                  </span>
                  {settings.model === m.id ? <span className="tick">✓</span> : null}
                </button>
              ))}
              <div className="menu-sep" />
              <button
                type="button"
                className="menu-item"
                onClick={() => {
                  setModelMenu(false);
                  setSettingsOpen(true);
                }}
              >
                <span className="mi-t">
                  Custom model…
                  <span className="mi-d">Use any model id your endpoint supports</span>
                </span>
              </button>
            </div>
          </>
        ) : null}

        <div className="thread" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="welcome">
              <h1>How can I help today?</h1>
              <p>
                ChatGPT 2.0 — streaming answers, Markdown, and chat history saved in your browser.
                {usingDemo ? " Running in offline demo mode until you add an API key." : ""}
              </p>
              <div className="cards">
                {SUGGESTIONS.map((s) => (
                  <button key={s.title} type="button" className="card" onClick={() => send(s.prompt)}>
                    <b>{s.title}</b>
                    <span>{s.sub}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="thread-inner" onClick={onThreadClick}>
              {messages.map((m, i) => (
                <MessageRow
                  key={m.id}
                  msg={m}
                  streaming={streamId === m.id}
                  nickname={settings.nickname}
                  model={active?.model ?? settings.model}
                  onCopy={copy}
                  onEdit={m.role === "user" ? (text) => active && editResend(active.id, m.id, text) : undefined}
                  onDelete={() => active && deleteMessage(active.id, m.id)}
                  onRegenerate={!busy && i === messages.length - 1 && m.role === "assistant" ? regenerate : undefined}
                  onFeedback={m.role === "assistant" ? (v) => active && setFeedback(active.id, m.id, v) : undefined}
                  onShare={shareChat}
                />
              ))}
            </div>
          )}

          {showScrollBtn && messages.length > 0 ? (
            <button
              type="button"
              className="scroll-bottom"
              title="Scroll to latest"
              aria-label="Scroll to latest message"
              onClick={() => {
                stickRef.current = true;
                scrollToBottom(true);
                setShowScrollBtn(false);
              }}
            >
              <ArrowDownIcon />
            </button>
          ) : null}
        </div>

        <Composer
          value={input}
          onChange={setInput}
          onSend={() => send()}
          onStop={stop}
          busy={busy}
          modelLabel={modelName(settings.model)}
          attach={attach}
          onAttach={setAttach}
          searching={settings.search}
          onToggleSearch={() => setSettings((s) => ({ ...s, search: !s.search }))}
          tools={settings.tools}
          onToggleTools={() => setSettings((s) => ({ ...s, tools: !s.tools }))}
          imgMode={imgMode}
          onToggleImgMode={() => setImgMode((v) => !v)}
          imgBusy={imgBusy}
          imgRatio={settings.imageRatio}
          onRatioChange={(r) => setSettings((s) => ({ ...s, imageRatio: r }))}
        />
      </main>

      <SettingsModal
        open={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onSave={(s) => {
          setSettings(s);
        }}
        onExportChats={exportAllChats}
        onImportChats={importChats}
        onClearAll={() => {
          if (window.confirm("Delete every conversation and setting stored in this browser?")) clearAll();
        }}
        user={user}
        onSignOut={onSignOut}
      />

      {helpOpen ? (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setHelpOpen(false)}>
          <div className="modal help-modal" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
            <div className="modal-head">
              <h2>Keyboard shortcuts</h2>
              <button className="icon-btn" type="button" onClick={() => setHelpOpen(false)} title="Close">
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="fieldset">
                {[
                  ["Send message", "Enter"],
                  ["New line", "Shift + Enter"],
                  ["New chat", "Ctrl / Cmd + Shift + O"],
                  ["Settings", "Ctrl / Cmd + Shift + S"],
                  ["Close menus", "Esc"],
                  ["Toggle this help", "?"],
                ].map(([label, keys]) => (
                  <div className="shortcut-row" key={label}>
                    <span>{label}</span>
                    <kbd>{keys}</kbd>
                  </div>
                ))}
              </div>
              <div className="fieldset">
                <p className="help">
                  Tip: hover any message to <b>Copy</b>, <b>Edit</b>, <b>Regenerate</b>, or <b>Delete</b> it. Pin chats
                  with the 📌 button in the sidebar.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className={`toast${toast ? " show" : ""}`} role="status">
        <span>{toast}</span>
        {toastAction ? (
          <button
            type="button"
            className="toast-action"
            onClick={() => {
              const run = toastAction.run;
              clearToast();
              run();
            }}
          >
            {toastAction.label}
          </button>
        ) : null}
      </div>
      <span className="sr-only" aria-live="polite">
        {busy ? "Assistant is responding" : ""}
      </span>
    </div>
  );
}
