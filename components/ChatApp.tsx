"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Composer from "./Composer";
import Canvas from "./Canvas";
import { useSandbox, parseCsv, coerceRows } from "@/lib/sandbox";
import { printChat } from "@/lib/printChat";
import { convertFileToPdf, convertFileToPdfBlob } from "@/lib/fileToPdf";
import { buildTextPdf, downloadBlob, pdfFilename } from "@/lib/pdfWriter";
import { playSound, unlockAudio } from "@/lib/sound";
import Library from "./Library";
import ToolsPage from "./ToolsPage";
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
  FileIcon,
} from "./Icons";
import {
  DEFAULT_SETTINGS,
  MODELS,
  estimateCost,
  modelName,
  roughTokens,
  type AuthUser,
  type Chat,
  type FileRef,
  type Msg,
  type Project,
  type PromptTemplate,
  type ResponseMode,
  type CanvasDoc,
  type Settings,
  type Usage,
} from "@/lib/types";
import {
  clearStore,
  loadActiveId,
  loadChats,
  loadProjects,
  loadSettings,
  loadTemplates,
  sanitizeChat,
  saveActiveId,
  saveChats,
  saveProjects,
  saveSettings,
  saveTemplates,
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
  /** False when Firebase isn't configured — hides the "Log in" affordance. */
  authAvailable?: boolean;
  /** Opens the optional sign-in modal. */
  onOpenLogin?: () => void;
  /** Persist a custom display name / photo to the sign-in provider. */
  onSyncProfile?: (displayName: string, photoDataUrl: string | null) => Promise<void>;
}

export default function ChatApp({
  authUid = null,
  user = null,
  onSignOut,
  authAvailable = true,
  onOpenLogin,
  onSyncProfile,
}: ChatAppProps) {
  // Bind every persisted key (chats/settings/active) to this account before
  // any load/save runs. ChatApp is remounted per account by AuthGate (key=uid).
  setAuthUid(authUid);

  // Browsing is open to everyone, but sending a message needs an account.
  // When Firebase isn't configured at all, auth is unavailable → never block.
  const authRequired = authAvailable && !user;

  const [chats, setChats] = useState<Chat[]>([]);
// Mirror of `chats` so async work after a send can read the latest messages
// without depending on a re-render having happened.
const chatsRef = useRef<Chat[]>([]);
chatsRef.current = chats;
  const [projects, setProjects] = useState<Project[]>([]);
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  // Canvas side panel document.
  const [canvasDoc, setCanvasDoc] = useState<CanvasDoc | null>(null);
  // Documents attached to the next message, and Deep Research arming.
  const [pendingFiles, setPendingFiles] = useState<FileRef[]>([]);
  const [filesBusy, setFilesBusy] = useState(false);
  const [researchOn, setResearchOn] = useState(false);
  const [researchBusy, setResearchBusy] = useState(false);
  // Parsed dataset from an attached CSV, used by the sandboxed code runner.
  const [dataset, setDataset] = useState<{
    name: string;
    columns: string[];
    rows: Record<string, string | number>[];
    rowCount: number;
  } | null>(null);
  const { run: runSandbox } = useSandbox();

  /* ---------- document attachments ---------- */
  // Declared as hoisted functions (not useCallback) so they can reference the
  // helpers defined further down this component.
  async function attachFiles(picked: File[]) {
    if (!picked.length) return;
    setFilesBusy(true);
    const readAsDataUrl = (file: File) =>
      new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = () => reject(new Error("read failed"));
        fr.readAsDataURL(file);
      });
    try {
      const payload = await Promise.all(
        picked.map(async (f) => ({ name: f.name, type: f.type, dataUrl: await readAsDataUrl(f) }))
      );
      const res = await fetch("/api/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: payload }),
      });
      const data = (await res.json()) as { files?: FileRef[]; error?: string };
      if (!res.ok || !data.files) {
        notify(data.error || "Couldn't read those files");
        return;
      }
      setPendingFiles((prev) => [...prev, ...data.files!]);

      // A CSV/TSV attachment also becomes a queryable dataset for the sandbox.
      const table = data.files!.find(
        (f) => /\.(csv|tsv)$/i.test(f.name) || f.type === "text/csv" || f.type === "text/tab-separated-values"
      );
      if (table?.text) {
        const parsed = parseCsv(table.text);
        setDataset({
          name: table.name,
          columns: parsed.columns,
          rows: coerceRows(parsed.rows),
          rowCount: parsed.rows.length,
        });
      }
    } catch {
      notify("Upload failed — check your connection");
    } finally {
      setFilesBusy(false);
    }
  }

  /* ---------- canvas ---------- */
  function saveCanvasToChat(content: string) {
    if (!canvasDoc?.chatId || !canvasDoc.msgId) return;
    patchChat(canvasDoc.chatId, (c) => ({
      ...c,
      messages: c.messages.map((m) => (m.id === canvasDoc.msgId ? { ...m, content } : m)),
      updatedAt: Date.now(),
    }));
    notify("Canvas saved to the conversation");
  }

  function openCanvas(msgId: string, title: string, content: string) {
    setCanvasDoc({ title, content, chatId: activeId ?? undefined, msgId, updatedAt: Date.now() });
  }

  /* ---------- prompt templates ---------- */
  function saveTemplate(title: string, prompt: string) {
    const t = prompt.trim();
    if (!t) return;
    setTemplates((prev) => [
      { id: uid(), title: (title.trim() || t.slice(0, 32)).slice(0, 60), prompt: t, createdAt: Date.now() },
      ...prev,
    ]);
    notify("Prompt template saved");
  }

  /* ---------- pdf export ---------- */
  function exportPdf() {
    if (!active) return notify("Nothing to export yet");
    const ok = printChat({
      title: active.title || "Conversation",
      who: (r) => (r === "user" ? settings.nickname.trim() || "You" : "Next AI"),
      messages: active.messages.map((m) => ({ role: m.role, content: m.content })),
      // Friendly name only: the printout is shareable, and the raw id names
      // the provider.
      model: modelName(active.model ?? settings.model),
    });
    if (!ok) notify("Allow pop-ups to export as PDF");
  }

  /** Direct .pdf download, which is the only reliable path on phones. */
  function downloadChatPdf() {
    if (!active) return notify("Nothing to export yet");
    const who = (r: string) => (r === "user" ? settings.nickname.trim() || "You" : "Next AI");
    const sections = active.messages.map((m) => ({
      heading: who(m.role),
      paragraphs: String(m.content ?? "")
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean),
    }));
    if (!sections.length) return notify("Nothing to export yet");
    const blob = buildTextPdf({
      title: active.title || "Conversation",
      // modelName, not the raw id: the id names the provider, and this ends up
      // in a file the user can share.
      subtitle: `${active.messages.length} message${active.messages.length === 1 ? "" : "s"} - ${modelName(active.model ?? settings.model)}`,
      sections,
    });
    downloadBlob(blob, pdfFilename(active.title || "conversation"));
    notify("PDF downloaded");
  }

  /* ---------- file -> pdf ---------- */
  async function convertToPdf(file: File) {
    notify(`Converting ${file.name}…`);
    // Direct download works on phones, where the print dialog hides
    // "Save as PDF" behind a share sheet.
    const res = await convertFileToPdfBlob(file);
    if (res.ok && res.blob && res.filename) {
      downloadBlob(res.blob, res.filename);
      notify(res.message);
      return;
    }
    // Fall back to the print route if the blob build failed.
    const fallback = await convertFileToPdf(file);
    notify(fallback.ok ? "Opened the print dialog — choose Save as PDF" : fallback.message);
  }

  /* ---------- chat tags ---------- */
  function setChatTags(chatId: string, tags: string[]) {
    patchChat(chatId, (c) => ({ ...c, tags, updatedAt: Date.now() }));
  }

  /* ---------- image variations ---------- */
  async function varyImage(msgId: string) {
      if (!active) return;
      const src = active.messages.find((m) => m.id === msgId);
      if (!src?.generatedImage) return;
      const chatId = active.id;
      try {
        const res = await fetch("/api/image", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(settings.apiKey.trim() ? { "x-api-key": settings.apiKey.trim() } : {}),
            "x-base-url": settings.baseUrl.trim(),
          },
          body: JSON.stringify({ prompt: src.content, ratio: settings.imageRatio, variation: true }),
        });
        const data = (await res.json()) as { url?: string; error?: string };
        if (!res.ok || !data.url) throw new Error(data.error || "Generation failed");
        const newMsg: Msg = { id: uid(), role: "assistant", content: src.content, generatedImage: data.url };
        setChats((prev) =>
          prev.map((c) =>
            c.id === chatId
              ? {
                  ...c,
                  imageVariations: [...(c.imageVariations ?? []), data.url as string].slice(-6),
                  messages: [...c.messages, newMsg],
                  updatedAt: Date.now(),
                }
              : c
          )
        );
      } catch (e) {
        notify(e instanceof Error ? e.message : "Variation failed");
      }
  }

  /* ---------- sandboxed data analysis ---------- */
  /**
   * When the model answers with a ```sandbox block and a dataset is attached,
   * run the code in a Web Worker and ask the model to write the final answer
   * from the real output instead of guessing.
   */
  async function runSandboxPass(chatId: string, assistantId: string, text: string) {
    if (!dataset) return;
    const block = /```sandbox\s*\n([\s\S]*?)```/.exec(text);
    if (!block) return;

    patchChat(chatId, (c) => ({
      ...c,
      messages: c.messages.map((m) =>
        m.id === assistantId ? { ...m, sandboxStage: "Running the code on your data…" } : m
      ),
    }));

    const out = await runSandbox(block[1], dataset.rows);
    const transcript = [
      `The code ran in a sandboxed browser worker on "${dataset.name}" (${dataset.rowCount} rows).`,
      `Columns: ${dataset.columns.join(", ")}`,
      out.ok ? "It completed successfully." : `It failed: ${out.error}`,
      out.logs ? `\nConsole output:\n${out.logs}` : "",
      out.result ? `\nReturned value:\n${out.result}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    // Ask the model to turn the real numbers into an answer.
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(settings.apiKey.trim() ? { "x-api-key": settings.apiKey.trim() } : {}),
          "x-base-url": settings.baseUrl.trim(),
        },
        body: JSON.stringify({
          model: settings.model,
          stream: false,
          temperature: 0.2,
          messages: [
            {
              role: "system",
              content:
                "You are a data analyst. Using the execution output below, write the final answer. State the concrete numbers, mention caveats, keep it concise. Do not emit another sandbox code block.",
            },
            { role: "user", content: `Execution output:\n${transcript}` },
          ],
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      // The route always answers with SSE frames, even for stream:false.
      const raw = await res.text();
      let answer = "";
      for (const frame of raw.split("\n\n")) {
        const line = frame.startsWith("data:") ? frame.slice(5).trim() : frame.trim();
        if (!line || line === "[DONE]") continue;
        try {
          const j = JSON.parse(line) as {
            delta?: string;
            error?: string;
            choices?: { delta?: { content?: string } }[];
          };
          if (j.error) throw new Error(j.error);
          answer += j.delta ?? j.choices?.[0]?.delta?.content ?? "";
        } catch {
          /* ignore malformed frames */
        }
        if (answer) break;
      }
      if (!answer) return;

      patchChat(chatId, (c) => ({
        ...c,
        messages: c.messages.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: `**Analysis of \`${dataset.name}\`\n\n${answer}`,
                sandboxStage: undefined,
                sandboxCode: block[1],
                sandboxOutput: transcript,
              }
            : m
        ),
        updatedAt: Date.now(),
      }));
    } catch (err) {
      patchChat(chatId, (c) => ({
        ...c,
        messages: c.messages.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: `${text}\n\n> **Code execution failed:** ${err instanceof Error ? err.message : "unknown error"}`,
                sandboxStage: undefined,
                sandboxCode: block[1],
              }
            : m
        ),
      }));
    }
  }

  /* ---------- deep research ---------- */
  async function runResearch(question: string) {
    if (researchBusy) return;

    let chatId = activeId;
    if (!chatId) {
      const chat: Chat = {
        id: uid(),
        title: titleFrom(question),
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        model: settings.model,
      };
      chatId = chat.id;
      setChats((prev) => [chat, ...prev]);
      setActiveId(chat.id);
      void autoTitle(chat.id, question);
    }

    const userMsg: Msg = { id: uid(), role: "user", content: question };
    const replyId = uid();
    const ac = new AbortController();
    abortRef.current = ac;
    setResearchBusy(true);
    setBusy(true);
    setInput("");
    setResearchOn(false);
    setPendingFiles([]);
    setLinked(null);
    stickRef.current = true;

    patchChat(chatId, (c) => ({
      ...c,
      messages: [
        ...c.messages,
        userMsg,
        { id: replyId, role: "assistant", content: "", researchStage: "Planning research…" },
      ],
      updatedAt: Date.now(),
    }));

    const setStage = (stage: string) =>
      patchChat(chatId, (c) => ({
        ...c,
        messages: c.messages.map((m) => (m.id === replyId ? { ...m, researchStage: stage } : m)),
      }));

    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          model: settings.model,
          apiKey: settings.apiKey.trim(),
          baseUrl: settings.baseUrl.trim(),
        }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const frames = buf.split("\n\n");
        buf = frames.pop() ?? "";
        for (const f of frames) {
          const line = f.startsWith("data:") ? f.slice(5).trim() : f.trim();
          if (!line || line === "[DONE]") continue;
          let j: { message?: string; report?: string; error?: string; sources?: number };
          try {
            j = JSON.parse(line);
          } catch {
            continue;
          }
          if (j.error) throw new Error(j.error);
          if (j.message) setStage(j.message);
          if (j.report) {
            patchChat(chatId, (c) => ({
              ...c,
              messages: c.messages.map((m) =>
                m.id === replyId
                  ? {
                      ...m,
                      content: j.report ?? "",
                      researchStage: undefined,
                      researchSources: j.sources ?? 0,
                      usage: { completionTokens: roughTokens(j.report ?? "") },
                    }
                  : m
              ),
              updatedAt: Date.now(),
            }));
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Research failed";
      patchChat(chatId, (c) => ({
        ...c,
        messages: c.messages.map((m) =>
          m.id === replyId
            ? { ...m, content: `⚠️ Deep Research failed: ${msg}`, error: true, researchStage: undefined }
            : m
        ),
      }));
    } finally {
      setResearchBusy(false);
      setBusy(false);
      abortRef.current = null;
      if (stickRef.current) scrollToBottom(true);
    }
  }

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
  const [settingsTab, setSettingsTab] = useState<"general" | "voice" | "profile" | "projects" | "data" | "account">("general");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  // Lets the composer's tools menu deep-link to a particular tool.
  const [toolsTab, setToolsTab] = useState<"pdf" | "image" | "colour" | "qr" | "url" | "data" | "make" | null>(null);
  const [toolsImageDir, setToolsImageDir] = useState<"edit" | "download" | undefined>(undefined);

  const openTools = (tab: typeof toolsTab, imageDir?: "edit" | "download") => {
    setToolsTab(tab);
    setToolsImageDir(imageDir);
    setToolsOpen(true);
  };

  /**
   * Browsers keep the audio context suspended until the user interacts with
   * the page. Do that on the first pointer or key event so the very first
   * message sound is not swallowed.
   */
  useEffect(() => {
    if (!settings.sound) return;
    const unlock = () => {
      unlockAudio();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [settings.sound]);

  /**
   * Deep links from the landing page, e.g. /chat?tools=colour or
   * /chat?tools=image&dir=download. Read from location.search rather than
   * useSearchParams so no Suspense boundary is needed.
   */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tools");
    if (tab) {
      const valid = ["pdf", "image", "colour", "qr", "url", "data", "make"] as const;
      if ((valid as readonly string[]).includes(tab)) {
        openTools(tab as typeof toolsTab, params.get("dir") === "download" ? "download" : undefined);
      }
    } else if (params.get("settings")) {
      const section = params.get("settings");
      if (section === "projects" || section === "data" || section === "general") {
        setSettingsTab(section);
        setSettingsOpen(true);
      }
    } else if (params.get("img") === "1") {
      newChat();
      setImgMode(true);
    }
  }, []);

  // An image URL found in the composer draft, attached to the next message.
  // Mirrored into a ref so the "Ask about this image" bubble can fire a send in
  // the same tick, without waiting for React to flush the state.
  const [linkedImage, setLinkedImage] = useState<{ url: string; filename: string; type: string; dataUrl?: string } | null>(null);
  const linkedImageRef = useRef<{ url: string; filename: string; type: string; dataUrl?: string } | null>(null);

  const setLinked = (info: { url: string; filename: string; type: string; dataUrl?: string } | null) => {
    linkedImageRef.current = info;
    setLinkedImage(info);
  };
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
    setProjects(loadProjects());
    setTemplates(loadTemplates());
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
    saveProjects(projects);
  }, [projects, ready]);

  useEffect(() => {
    if (!ready) return;
    saveTemplates(templates);
  }, [templates, ready]);

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

  // Profile overrides (custom avatar / display name) win over the provider's.
  const profile = useMemo<AuthUser | null>(() => {
    if (!user) return null;
    return {
      ...user,
      name: settings.profileName.trim() || user.name,
      image: settings.avatar || user.image,
    };
  }, [user, settings.avatar, settings.profileName]);
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

      // Per-chat model + reasoning mode, falling back to the current settings.
      const chatMeta = chats.find((c) => c.id === chatId);
      const cModel = chatMeta?.model ?? settings.model;
      const cMode: ResponseMode = settings.mode;
      const projectInstructions =
        projects.find((p) => p.id === chatMeta?.projectId)?.instructions.trim() || "";

      let acc = "";
      let errored = false;
      let stopped = false;
      let toolsUsed: string[] = [];
      let usage: Usage | undefined;

      const flush = () => {
        const snapshot = acc;
        patchChat(chatId, (c) => ({
          ...c,
          messages: c.messages.map((m) => (m.id === assistantId ? { ...m, content: snapshot } : m)),
        }));
      };

      try {
        // OpenAI-style content: plain string, or a parts array when an image or
        // document is attached to the message.
        const toContent = (m: Msg) => {
          const docs = (m.files ?? []).map((f) => ({
            type: "text" as const,
            text: `\n\n--- Attached file: ${f.name}${f.pages ? ` (${f.pages} pages)` : ""} ---\n${
              f.text ?? "[binary file — no extractable text]"
            }`,
          }));
          const images = [
            ...(m.image ? [{ type: "image_url" as const, image_url: { url: m.image } }] : []),
            ...(m.files ?? [])
              .filter((f) => f.dataUrl)
              .map((f) => ({ type: "image_url" as const, image_url: { url: f.dataUrl as string } })),
          ];
          if (!docs.length && !images.length) return m.content;
          const parts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
          if (m.content.trim()) parts.push({ type: "text", text: m.content });
          parts.push(...docs, ...images);
          return parts;
        };

        // System prompt + the user's standing custom instructions + any project
        // instructions, in that order of increasing specificity.
        const system: string[] = [];
        if (settings.systemPrompt.trim()) system.push(settings.systemPrompt.trim());
        if (settings.instructions.trim()) {
          system.push(
            `The user has shared these standing instructions. Follow them in every reply unless the current request overrides them:\n${settings.instructions.trim()}`
          );
        }
        if (projectInstructions) {
          system.push(`Project context:\n${projectInstructions}`);
        }
        if (dataset) {
          system.push(
            `A data file "${dataset.name}" is attached (${dataset.rowCount} rows, columns: ${dataset.columns.join(", ")}). ` +
              "To compute an answer, reply with a single fenced code block tagged `sandbox` containing plain JavaScript. " +
              "It receives the rows as an array of objects named `data`. Print findings with `out(...)` or `console.log`, " +
              "and put the final value in a variable named `result`. It runs in a browser sandbox with no network access."
          );
        }

        const payload = [
          ...(system.length ? [{ role: "system" as const, content: system.join("\n\n") }] : []),
          ...history
            .filter((m) => !m.error && (m.content.trim() !== "" || !!m.image || !!m.files?.length))
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
            mode: cMode,
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
            usage?: Usage;
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
          if (json.usage) usage = { ...json.usage };
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
          acc = (acc ? acc + "\n\n" : "") + `⚠️ ${message}`;
        }
      } finally {
        const finalText = acc;
        // The model asked for code execution — run it and rewrite the reply.
        if (dataset && !errored && finalText.includes("```sandbox")) {
          void runSandboxPass(chatId, assistantId, finalText);
        }
        // Prefer provider-reported usage; otherwise estimate from the text.
        const promptTokens = usage?.promptTokens ?? usage?.totalTokens;
        const completionTokens = usage?.completionTokens ?? roughTokens(finalText);
        const finalUsage: Usage | undefined =
          promptTokens || completionTokens
            ? {
                promptTokens,
                completionTokens,
                totalTokens: usage?.totalTokens ?? (promptTokens ?? 0) + completionTokens,
                costUsd:
                  usage?.costUsd ??
                  estimateCost(cModel, promptTokens ?? 0, completionTokens),
              }
            : undefined;
        patchChat(chatId, (c) => ({
          ...c,
          messages: c.messages.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: finalText || "(no response)",
                  error: errored,
                  stopped: stopped && !errored,
                  mode: cMode === "auto" ? undefined : cMode,
                  toolsUsed: toolsUsed.length ? [...new Set(toolsUsed)] : undefined,
                  usage: finalUsage,
                }
              : m
          ),
          updatedAt: Date.now(),
        }));
        setBusy(false);
        setStreamId(null);
        abortRef.current = null;
        if (stickRef.current) scrollToBottom(true);
        // A tone when the reply lands, or when it failed.
        if (settings.sound && !stopped) playSound(errored ? "error" : "receive", true);
      }
    },
    [chats, patchChat, projects, scrollToBottom, settings]
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

  // Pin a single message so it stays easy to find (ChatGPT-style).
  const toggleMsgPin = useCallback(
    (chatId: string, msgId: string) => {
      const current = chats.find((c) => c.id === chatId)?.messages.find((m) => m.id === msgId)?.pinned;
      patchChat(chatId, (c) => ({
        ...c,
        messages: c.messages.map((m) => (m.id === msgId ? { ...m, pinned: !m.pinned } : m)),
        updatedAt: Date.now(),
      }));
      notify(current ? "Message unpinned" : "Message pinned");
    },
    [chats, notify, patchChat]
  );

  // Branch: fork the conversation at this message into a brand-new chat.
  const branchFrom = useCallback(
    (chatId: string, msgId: string) => {
      const source = chats.find((c) => c.id === chatId);
      if (!source) return;
      const idx = source.messages.findIndex((m) => m.id === msgId);
      if (idx === -1) return;
      const kept = source.messages.slice(0, idx + 1).map((m) => ({ ...m, id: uid() }));
      const branch: Chat = {
        id: uid(),
        title: `${source.title || "New chat"} (branch)`,
        messages: kept,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        model: source.model,
        ...(source.projectId ? { projectId: source.projectId } : {}),
      };
      setChats((prev) => [branch, ...prev]);
      setActiveId(branch.id);
      setInput("");
      stickRef.current = true;
      notify("Branched into a new chat");
    },
    [chats, notify]
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
        // No model id: a share link is public and trivially decodable, and
        // the id names the provider. The decoder treats it as optional.
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
    const who = (role: string) => (role === "user" ? settings.nickname.trim() || "You" : "Next AI");
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
    const who = (role: string) => (role === "user" ? settings.nickname.trim() || "You" : "Next AI");
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
    // Image generation is account-gated, same as chat.
    if (authRequired && !user) {
      notify("Log in to create images");
      onOpenLogin?.();
      return;
    }
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
  }, [
    active,
    activeId,
    authRequired,
    autoTitle,
    imgBusy,
    input,
    notify,
    onOpenLogin,
    patchChat,
    scrollToBottom,
    setChats,
    settings,
    setImgMode,
    user,
  ]);

  const exportAllChats = useCallback(() => {
    const data = {
      app: "next-ai",
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
      if (busy || filesBusy || (!text && !attach && pendingFiles.length === 0)) return;

      // Chatting requires an account: prompt to log in instead of sending.
      if (authRequired && !user) {
        notify("Log in to send a message");
        onOpenLogin?.();
        return;
      }

      // Image mode is armed: sending generates an image instead of a chat reply.
      if (imgMode) {
        void generateImage();
        return;
      }

      // Deep Research runs its own multi-step pipeline.
      if (researchOn) {
        if (!text) {
          notify("Ask a research question first");
          return;
        }
        void runResearch(text);
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

      const docs = pendingFiles.length ? pendingFiles : undefined;
      const userMsg: Msg = {
        id: uid(),
        role: "user",
        content: text,
        ...(attach ? { image: attach } : {}),
        ...(docs ? { files: docs } : {}),
      };
      // An image URL found in the draft by the "Ask about this image" bubble.
      // Read from the ref, not the state, so the click can send in one tick.
      // The inlined data URL is preferred: a vision endpoint has to be able to
      // reach the remote URL itself, and usually cannot. Fall back to the URL
      // when the image was too large to inline.
      const linked = linkedImageRef.current;
      if (linked) {
        userMsg.image = linked.dataUrl || linked.url;
        userMsg.imageRef = {
          url: linked.url,
          filename: linked.filename,
          type: linked.type,
          dataUrl: linked.dataUrl,
        };
      }
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
      setPendingFiles([]);
      // The click that sent is a user gesture, so unlock the audio here and
      // play immediately rather than waiting for a reply.
      if (settings.sound) playSound("send", true);
      const hadImage = Boolean(userMsg.image) || Boolean(docs?.some((f) => f.dataUrl));
      void runStream(id, history).then(() => {
        if (!hadImage) return;
        const reply = chatsRef.current.find((c) => c.id === id)?.messages.at(-1)?.content ?? "";
        warnIfVisionRefused(reply, true);
      });

      // ChatGPT names the conversation from its first user message.
      if (isFirst) void autoTitle(id, text || docs?.[0]?.name || "New chat");
    },
    [
      active,
      activeId,
      attach,
      authRequired,
      autoTitle,
      busy,
      filesBusy,
      generateImage,
      imgMode,
      input,
      notify,
      onOpenLogin,
      runStream,
      settings.model,
      user,
    ]
  );

  /**
   * Not all models can see images. When we definitely attached one and the
   * reply says otherwise, say so plainly instead of leaving the user to guess
   * whether the image failed to upload or the model is the limitation.
   */
  const warnIfVisionRefused = useCallback(
    (text: string, attachedImage: boolean) => {
      if (!attachedImage) return;
      if (!/(cannot|can't|can not|unable to|don't have the capability)\s+(view|see|access|process|analy[sz]e)|not able to (view|see|process)|text-based/i.test(text)) {
        return;
      }
      if (!/image|visual|photo|picture|url|link/i.test(text)) return;
      notify("The image was sent, but this model may not support images. Try a vision-capable model from the picker.");
    },
    [notify]
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
        onTags={setChatTags}
        onNew={newChat}
        onCreateImage={() => {
          newChat();
          setImgMode(true);
        }}
        user={profile}
        onSignOut={onSignOut}
        onOpenSettings={() => setSettingsOpen(true)}
        onEditProfile={() => {
          setSettingsTab("profile");
          setSettingsOpen(true);
        }}
        onOpenLibrary={() => setLibraryOpen(true)}
        onOpenTools={() => setToolsOpen(true)}
        onOpenLogin={onOpenLogin}
        authAvailable={authAvailable}
      />

      <Library
        open={libraryOpen}
        chats={chats}
        activeId={activeId}
        onClose={() => setLibraryOpen(false)}
        onSelect={selectChat}
        onDelete={deleteChat}
        onPin={togglePin}
        onRename={(id, title) => patchChat(id, (c) => ({ ...c, title }))}
        onImport={importChats}
      />

      {toolsOpen ? (
        <ToolsPage
          onClose={() => setToolsOpen(false)}
          notify={notify}
          model={settings.model}
          apiKey={settings.apiKey.trim()}
          baseUrl={settings.baseUrl}
          signedIn={Boolean(profile)}
          initialTab={toolsTab ?? undefined}
          imageDir={toolsImageDir}
        />
      ) : null}

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
              className="icon-btn hide-xs"
              type="button"
              title="Export chat as PDF"
              onClick={exportPdf}
            >
              <FileIcon size={16} />
            </button>
            <button
              className="icon-btn"
              type="button"
              title="Download chat as PDF (no print dialog)"
              aria-label="Download chat as PDF"
              onClick={downloadChatPdf}
            >
              <DownloadIcon size={16} />
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
              <p>Next AI — streaming answers, Markdown, and chat history saved in your browser.</p>
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
                  model={modelName(active?.model ?? settings.model)}
                  onCopy={copy}
                  onEdit={m.role === "user" ? (text) => active && editResend(active.id, m.id, text) : undefined}
                  onDelete={() => active && deleteMessage(active.id, m.id)}
                  onRegenerate={!busy && i === messages.length - 1 && m.role === "assistant" ? regenerate : undefined}
                  onFeedback={m.role === "assistant" ? (v) => active && setFeedback(active.id, m.id, v) : undefined}
                  onShare={shareChat}
                  onPin={active ? () => toggleMsgPin(active.id, m.id) : undefined}
                  onBranch={active ? () => branchFrom(active.id, m.id) : undefined}
                  onCanvas={() => openCanvas(m.id, active?.title || "Canvas", m.content)}
                  onVary={m.generatedImage ? () => void varyImage(m.id) : undefined}
                  showUsage={settings.showUsage}
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
          files={pendingFiles}
          onFiles={setPendingFiles}
          onFilesAttach={(picked) => void attachFiles(picked)}
      onConvertPdf={(file) => void convertToPdf(file)}
      onOpenImageDownloader={() => openTools("image", "download")}
      onImageUrl={setLinked}
      onAskAboutImage={(info) => {
        // Clicking the bubble sends the image straight to the model. The ref is
        // set synchronously so send() sees it in this same tick.
        setLinked(info);
        // Reuse whatever is already in the draft as the question, so a user who
        // pasted the link alongside a request gets that request honoured.
        send(input.trim() || "Describe this image in detail.");
      }}
          filesBusy={filesBusy}
          mode={settings.mode}
          onModeChange={(m) => setSettings((s) => ({ ...s, mode: m }))}
          research={researchOn}
          onToggleResearch={() => setResearchOn((v) => !v)}
          templates={templates}
          onUseTemplate={(p) => setInput((cur) => (cur.trim() ? `${cur.trim()}\n\n${p}` : p))}
          onSaveTemplate={saveTemplate}
          onDeleteTemplate={(id) => setTemplates((prev) => prev.filter((t) => t.id !== id))}
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
        projects={projects}
        onProjects={setProjects}
        onDeleteProject={(id) => setChats((prev) => prev.map((c) => (c.projectId === id ? { ...c, projectId: undefined } : c)))}
        onNewProjectChat={(projectId) => {
          const chat: Chat = {
            id: uid(),
            title: "New chat",
            messages: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
            model: settings.model,
            projectId,
          };
          setChats((prev) => [chat, ...prev]);
          setActiveId(chat.id);
          setInput("");
          stickRef.current = true;
        }}
        onSyncProfile={onSyncProfile}
        openTab={settingsTab}
      />

      {helpOpen ? (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setHelpOpen(false)}>
          <div className="modal help-modal scale-in" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
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

      <Canvas
        doc={canvasDoc}
        onClose={() => setCanvasDoc(null)}
        onChange={setCanvasDoc}
        onSaveToChat={canvasDoc?.msgId ? saveCanvasToChat : undefined}
      />

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
