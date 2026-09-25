import { BUBBLE_COLORS, DEFAULT_SETTINGS, IMAGE_RATIOS, type Chat, type Msg, type Project, type PromptTemplate, type Settings } from "./types";

const K_CHATS = "chatgpt2.chats";
const K_ACTIVE = "chatgpt2.active";
const K_SETTINGS = "chatgpt2.settings";
const K_SIDEBAR = "chatgpt2.sidebar";
const K_PROJECTS = "chatgpt2.projects";
const K_TEMPLATES = "chatgpt2.templates";

let authUid: string | null = null;

/**
 * Bind all persisted state to a signed-in account (Firebase `uid`).
 * Pass `null` for anonymous mode (no Firebase configured).
 * Call this before reading/writing any store data.
 */
export function setAuthUid(uid: string | null): void {
  authUid = uid;
}

/** Namespace a storage key per account so each user gets their own data. */
function scoped(key: string): string {
  return authUid ? `chatgpt2.u.${authUid}.${key.slice("chatgpt2.".length)}` : key;
}

/** Remove every saved key for the current account (anonymous clears the legacy keys). */
export function clearStore(): void {
  for (const base of [K_CHATS, K_ACTIVE, K_SETTINGS, K_SIDEBAR, K_PROJECTS]) {
    try {
      window.localStorage.removeItem(scoped(base));
    } catch {
      /* private mode — ignore */
    }
  }
}

/** Raw persisted settings for non-React consumers (e.g. read-aloud voice). */
export function peekSettings(): Partial<Settings> {
  return read<Partial<Settings>>(scoped(K_SETTINGS), {});
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function titleFrom(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return "New chat";
  return t.length > 42 ? t.slice(0, 42).trimEnd() + "…" : t;
}

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode — ignore */
  }
}

/** Normalize a chat object (from storage or an imported backup) into a valid Chat. */
export function sanitizeChat(c: unknown): Chat | null {
  if (!c || typeof c !== "object") return null;
  const x = c as Record<string, unknown>;
  if (typeof x.id !== "string" || !Array.isArray(x.messages)) return null;
  return {
    id: x.id,
    title: typeof x.title === "string" ? x.title : "New chat",
    messages: (x.messages as Msg[])
      .filter((m) => m && typeof m.content === "string" && !m.error)
      .map((m) => ({ ...m })),
    createdAt: typeof x.createdAt === "number" ? x.createdAt : Date.now(),
    updatedAt: typeof x.updatedAt === "number" ? x.updatedAt : Date.now(),
    pinned: typeof x.pinned === "boolean" ? x.pinned : false,
    model: typeof x.model === "string" ? x.model : undefined,
    projectId: typeof x.projectId === "string" ? x.projectId : undefined,
    tags: Array.isArray(x.tags) ? (x.tags as unknown[]).filter((t): t is string => typeof t === "string").slice(0, 8) : undefined,
    imageVariations: Array.isArray(x.imageVariations)
      ? (x.imageVariations as unknown[]).filter((u): u is string => typeof u === "string").slice(0, 6)
      : undefined,
  };
}

/* ---------- Projects ---------- */

export function loadProjects(): Project[] {
  const rows = read<Project[]>(scoped(K_PROJECTS), []);
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((p) => p && typeof p.id === "string" && typeof p.name === "string")
    .map((p) => ({
      id: p.id,
      name: p.name,
      instructions: typeof p.instructions === "string" ? p.instructions : "",
      createdAt: typeof p.createdAt === "number" ? p.createdAt : Date.now(),
      updatedAt: typeof p.updatedAt === "number" ? p.updatedAt : Date.now(),
    }));
}

export function saveProjects(projects: Project[]): void {
  write(scoped(K_PROJECTS), projects.slice(0, 100));
}

/* ---------- Prompt templates ---------- */

export function loadTemplates(): PromptTemplate[] {
  const rows = read<PromptTemplate[]>(scoped(K_TEMPLATES), []);
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((t) => t && typeof t.id === "string" && typeof t.prompt === "string")
    .map((t) => ({
      id: t.id,
      title: (typeof t.title === "string" && t.title.trim()) || t.prompt.slice(0, 32),
      prompt: t.prompt.slice(0, 4000),
      createdAt: typeof t.createdAt === "number" ? t.createdAt : Date.now(),
    }));
}

export function saveTemplates(templates: PromptTemplate[]): void {
  write(scoped(K_TEMPLATES), templates.slice(0, 100));
}

export function loadChats(): Chat[] {
  const rows = read<Chat[]>(scoped(K_CHATS), []);
  if (!Array.isArray(rows)) return [];
  return rows.map(sanitizeChat).filter((c): c is Chat => c !== null);
}

export function saveChats(chats: Chat[]): void {
  write(scoped(K_CHATS), chats.slice(0, 200));
}

export function loadActiveId(): string | null {
  const id = read<string | null>(scoped(K_ACTIVE), null);
  return typeof id === "string" ? id : null;
}

export function saveActiveId(id: string | null): void {
  write(scoped(K_ACTIVE), id);
}

export function loadSettings(): Settings {
  const raw = read<Partial<Settings>>(scoped(K_SETTINGS), {});
  const merged: Settings = { ...DEFAULT_SETTINGS, ...(raw && typeof raw === "object" ? raw : {}) };
  if (merged.theme !== "light" && merged.theme !== "dark") merged.theme = "dark";
  if (typeof merged.temperature !== "number" || Number.isNaN(merged.temperature)) merged.temperature = 0.7;
  if (typeof merged.streaming !== "boolean") merged.streaming = true;
  if (typeof merged.search !== "boolean") merged.search = false;
  if (typeof merged.tools !== "boolean") merged.tools = false;
  if (!IMAGE_RATIOS.some((r) => r.value === merged.imageRatio)) merged.imageRatio = "1:1";
  if (!BUBBLE_COLORS.some((c) => c.value === merged.bubbleColor)) merged.bubbleColor = "default";
  if (!merged.ttsVoice) merged.ttsVoice = DEFAULT_SETTINGS.ttsVoice;
  if (!merged.baseUrl) merged.baseUrl = DEFAULT_SETTINGS.baseUrl;
  if (!merged.model) merged.model = DEFAULT_SETTINGS.model;
  if (merged.mode !== "quick" && merged.mode !== "thinking" && merged.mode !== "auto") merged.mode = "auto";
  if (typeof merged.instructions !== "string") merged.instructions = "";
  if (typeof merged.showUsage !== "boolean") merged.showUsage = false;
  return merged;
}

export function saveSettings(s: Settings): void {
  write(scoped(K_SETTINGS), s);
}
