export type Role = "user" | "assistant" | "system";

/** A document/image attached to a user message. */
export interface FileRef {
  id: string;
  name: string;
  /** MIME type as reported by the browser. */
  type: string;
  /** Size in bytes. */
  size: number;
  /** Extracted plain text (PDF/DOCX/CSV/code). Empty for images. */
  text?: string;
  /** Data URL for image attachments (sent to the model as vision input). */
  dataUrl?: string;
  /** Truncated page count for PDFs, when known. */
  pages?: number;
  /** Set when the file couldn't be read (too large, binary, etc.). */
  error?: string;
}

/** Token accounting for one assistant reply. */
export interface Usage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  /** USD estimate, when the provider reports pricing. */
  costUsd?: number;
}

export interface Msg {
  id: string;
  role: Role;
  content: string;
  /** Optional image attached to a user message (data URL). */
  image?: string;
  /** URL of an AI-generated image shown with an assistant message. */
  generatedImage?: string;
  /** True while an image is still being generated (placeholder message). */
  imgPending?: boolean;
  /** Documents/images attached to this message. */
  files?: FileRef[];
  /** Names of tools (calculator, etc.) the model called to produce this reply. */
  toolsUsed?: string[];
  /** ChatGPT-style thumbs up / down feedback on an assistant reply. */
  feedback?: "up" | "down";
  /** Pinned message — kept in the conversation and easy to find. */
  pinned?: boolean;
  /** Live progress line shown while Deep Research runs. */
  researchStage?: string;
  /** How many sources the research report cited. */
  researchSources?: number;
  /** Live progress line while sandboxed code executes. */
  sandboxStage?: string;
  /** The JavaScript that was executed. */
  sandboxCode?: string;
  /** The execution transcript (console output + returned value). */
  sandboxOutput?: string;
  /** Mode used to produce an assistant reply. */
  mode?: ResponseMode;
  /** Token usage / cost for an assistant reply. */
  usage?: Usage;
  error?: boolean;
  stopped?: boolean;
}

/** ChatGPT-style reasoning modes. */
export type ResponseMode = "auto" | "quick" | "thinking";

export interface Chat {
  id: string;
  title: string;
  messages: Msg[];
  createdAt: number;
  updatedAt: number;
  /** Pinned chats stay at the top of the sidebar. */
  pinned?: boolean;
  /** The model this conversation was last used with (per-chat model memory). */
  model?: string;
  /** Project this chat belongs to (see PROJECTS). */
  projectId?: string;
  /** Free-form labels for filtering in the sidebar. */
  tags?: string[];
  /** Other images generated from the same prompt (variations). */
  imageVariations?: string[];
}

/** A reusable prompt the user can drop into the composer. */
export interface PromptTemplate {
  id: string;
  title: string;
  prompt: string;
  createdAt: number;
}

/** A Canvas document — an editable side panel beside the conversation. */
export interface CanvasDoc {
  title: string;
  content: string;
  /** Message the canvas was opened from, so it can be written back. */
  chatId?: string;
  msgId?: string;
  updatedAt: number;
}

/** A named workspace grouping related chats, with its own instructions. */
export interface Project {
  id: string;
  name: string;
  /** Extra system instructions applied to every chat in the project. */
  instructions: string;
  createdAt: number;
  updatedAt: number;
}

export type ImageRatio = "1:1" | "3:4" | "4:3" | "9:16" | "16:9" | "21:9";

/** Aspect ratios offered for image generation (ChatGPT-style picker). */
export const IMAGE_RATIOS: Array<{ value: ImageRatio; label: string }> = [
  { value: "1:1", label: "Square" },
  { value: "4:3", label: "Landscape" },
  { value: "16:9", label: "Wide" },
  { value: "3:4", label: "Portrait" },
  { value: "9:16", label: "Tall" },
  { value: "21:9", label: "Ultrawide" },
];

/**
 * Native output size per ratio (see app/api/image/route.ts). The SenseNova
 * model only accepts a fixed size list, so Landscape/Portrait render at 3:2 /
 * 2:3 and Ultrawide renders at the native 16:9 size.
 */
export const RATIO_OUTPUT: Record<ImageRatio, string> = {
  "1:1": "1024×1024",
  "4:3": "1536×1024",
  "3:4": "1024×1536",
  "16:9": "1792×1024",
  "9:16": "1024×1792",
  "21:9": "1792×1024",
};

export type BubbleColor = "default" | "blue" | "green" | "purple" | "teal" | "orange" | "rose";

/** User-bubble colors offered in Settings (swatch picker). */
export const BUBBLE_COLORS: Array<{ value: BubbleColor; label: string; swatch: string }> = [
  { value: "default", label: "Grey", swatch: "#6b6b6b" },
  { value: "blue", label: "Blue", swatch: "#3b82f6" },
  { value: "green", label: "Green", swatch: "#22c55e" },
  { value: "purple", label: "Purple", swatch: "#a78bfa" },
  { value: "teal", label: "Teal", swatch: "#2dd4bf" },
  { value: "orange", label: "Orange", swatch: "#f97316" },
  { value: "rose", label: "Rose", swatch: "#f43f5e" },
];

export interface Settings {
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
  systemPrompt: string;
  streaming: boolean;
  /** Include fresh web results with the next message. */
  search: boolean;
  /** Let the model call built-in tools (time, date, calculator, converter). */
  tools: boolean;
  /** Aspect ratio used for image generation. */
  imageRatio: ImageRatio;
  /** User-bubble color (see BUBBLE_COLORS). */
  bubbleColor: BubbleColor;
  /** Voice id used by the 🔊 read-aloud button (xKiro TTS, see GET /v1/audio/voices). */
  ttsVoice: string;
  /** Read-aloud speed multiplier (0.5–2, xKiro `speed`). */
  ttsSpeed: number;
  /** Read-aloud pitch shift (-10–10, xKiro `pitch`). */
  ttsPitch: number;
  /** Reasoning mode for new messages (ChatGPT-style Quick / Thinking). */
  mode: ResponseMode;
  /** Custom instructions ("remembered" facts) applied to every conversation. */
  instructions: string;
  /** Show the token/cost readout under assistant replies. */
  showUsage: boolean;
  /** Display name shown in the app (overrides the provider name). */
  profileName: string;
  /** The user's real name — never shown in chat, only on their profile. */
  realName: string;
  /** Custom avatar as a data URL (overrides the provider photo). */
  avatar: string;
  theme: "dark" | "light";
  nickname: string;
}

/** Signed-in account surfaced from Firebase Auth into the app. */
export interface AuthUser {
  uid: string;
  name: string;
  email: string;
  image: string | null;
}

export interface ModelInfo {
  id: string;
  name: string;
  desc: string;
  tag?: string;
}

/**
 * Models offered in the picker. Any OpenAI-compatible id also works via Settings.
 * Ids use the xKiro `vendor/model` format (see https://xkiro.com/models).
 */
export const MODELS: ModelInfo[] = [
  // ---- Free tier (verified against GET /v1/models) ----
  { id: "qwen/qwen3.8-max:free", name: "Qwen3.8 Max", desc: "Free · strongest Qwen reasoning", tag: "Free" },
  { id: "qwen/qwen3.7-max:free", name: "Qwen3.7 Max", desc: "Free · long-context flagship", tag: "Free" },
  { id: "qwen/qwen3.6-max-preview:free", name: "Qwen3.6 Max Preview", desc: "Free · preview build", tag: "Free" },
  { id: "qwen/qwen3.5-397b-a17b:free", name: "Qwen3.5 397B", desc: "Free · huge MoE · vision & reasoning", tag: "Free" },
  { id: "qwen/qwen3.5-plus:free", name: "Qwen3.5 Plus", desc: "Free · balanced quality", tag: "Free" },
  { id: "qwen/qwen3.5-flash:free", name: "Qwen3.5 Flash", desc: "Free · 1M context · fast default", tag: "Free" },
  { id: "qwen/qwen3.5-omni-plus:free", name: "Qwen3.5 Omni Plus", desc: "Free · text + image + audio", tag: "Free" },
  { id: "qwen/qwen3.5-omni-flash:free", name: "Qwen3.5 Omni Flash", desc: "Free · fast multimodal", tag: "Free" },
  { id: "qwen/qwen3.6-35b-a3b:free", name: "Qwen3.6 35B-A3B", desc: "Free · MoE · fast", tag: "Free" },
  { id: "qwen/qwen3.6-27b:free", name: "Qwen3.6 27B", desc: "Free · compact reasoning", tag: "Free" },
  { id: "qwen/qwen3.6-plus:free", name: "Qwen3.6 Plus", desc: "Free · upgraded plus tier", tag: "Free" },
  { id: "qwen/qwen3.7-plus:free", name: "Qwen3.7 Plus", desc: "Free · refined plus tier", tag: "Free" },
  { id: "qwen/qwen3.7-flash:free", name: "Qwen3.7 Flash", desc: "Free · fastest Qwen3.7", tag: "Free" },
  { id: "qwen/qwen3.8-omni-flash:free", name: "Qwen3.8 Omni Flash", desc: "Free · newest omni model", tag: "Free" },
  { id: "qwen/qwen3-coder-plus:free", name: "Qwen3 Coder Plus", desc: "Free · coding specialist", tag: "Free" },
  { id: "qwen/qwen3-vl-plus:free", name: "Qwen3 VL Plus", desc: "Free · vision-language", tag: "Free" },
  { id: "qwen/qwen3-omni-flash:free", name: "Qwen3 Omni Flash", desc: "Free · multimodal", tag: "Free" },
  { id: "qwen/qwen3-max:free", name: "Qwen3 Max", desc: "Free · 262K context", tag: "Free" },
  { id: "qwen/qwen-plus-2025-07-28:free", name: "Qwen Plus", desc: "Free · stable general model", tag: "Free" },
  { id: "minimax/minimax-m3:free", name: "MiniMax M3", desc: "Free · 1M context · vision & reasoning", tag: "Free" },
  { id: "minimax/minimax-m2.7:free", name: "MiniMax M2.7", desc: "Free · latest M2 reasoning", tag: "Free" },
  { id: "minimax/minimax-m2.7-highspeed:free", name: "MiniMax M2.7 Highspeed", desc: "Free · low-latency M2.7", tag: "Free" },
  { id: "minimax/minimax-m2.5:free", name: "MiniMax M2.5", desc: "Free · fast general chat", tag: "Free" },
  { id: "minimax/minimax-m2.5-highspeed:free", name: "MiniMax M2.5 Highspeed", desc: "Free · low-latency M2.5", tag: "Free" },
  { id: "minimax/minimax-m2.1:free", name: "MiniMax M2.1", desc: "Free · efficient reasoning", tag: "Free" },
  { id: "minimax/minimax-m2.1-highspeed:free", name: "MiniMax M2.1 Highspeed", desc: "Free · low-latency M2.1", tag: "Free" },
  { id: "minimax/minimax-m2:free", name: "MiniMax M2", desc: "Free · earlier M2 build", tag: "Free" },
  { id: "deepseek/deepseek-v4.1-flash:free", name: "DeepSeek V4.1 Flash", desc: "Free · fast reasoning", tag: "Free" },

  // ---- Flagship / paid ----
  { id: "deepseek/deepseek-v4-pro", name: "DeepSeek V4 Pro", desc: "1M context · strong reasoning", tag: "DeepSeek" },
  { id: "deepseek/deepseek-chat-v3.1", name: "DeepSeek V3.1", desc: "Fast general chat", tag: "DeepSeek" },
  { id: "mistralai/mistral-large-2512", name: "Mistral Large 3", desc: "256K context", tag: "Mistral" },
  { id: "openai/gpt-5.6-sol", name: "GPT-5.6 Sol", desc: "OpenAI flagship", tag: "OpenAI" },
  { id: "anthropic/claude-sonnet-5", name: "Claude Sonnet 5", desc: "Anthropic flagship", tag: "Anthropic" },
  { id: "google/gemini-3.8-flash", name: "Gemini 3.8 Flash", desc: "Google speed model", tag: "Google" },
];

export const DEFAULT_SETTINGS: Settings = {
  apiKey: "",
  baseUrl: "https://api.xkiro.com/v1",
  model: "qwen/qwen3.5-flash:free",
  temperature: 0.7,
  systemPrompt: "You are Next AI, a helpful and concise assistant. Answer in Markdown.",
  streaming: true,
  search: false,
  tools: false,
  imageRatio: "1:1",
  bubbleColor: "default",
  ttsVoice: "american-female",
  ttsSpeed: 1,
  ttsPitch: 0,
  mode: "auto",
  instructions: "",
  showUsage: false,
  profileName: "",
  realName: "",
  avatar: "",
  theme: "dark",
  nickname: "You",
};

export function modelName(id: string): string {
  return MODELS.find((m) => m.id === id)?.name ?? id;
}

/** Rough USD per 1M tokens, used when the provider doesn't report usage. */
export const MODEL_PRICING: Record<string, { in: number; out: number }> = {
  "qwen/qwen3.8-max:free": { in: 0, out: 0 },
  "qwen/qwen3.5-397b-a17b:free": { in: 0, out: 0 },
  "deepseek/deepseek-v4.1-flash:free": { in: 0, out: 0 },
  "openai/gpt-5.6-sol": { in: 5, out: 30 },
  "anthropic/claude-sonnet-5": { in: 3, out: 15 },
  "google/gemini-3.8-flash": { in: 0.3, out: 2.5 },
  "deepseek/deepseek-v4-pro": { in: 0.28, out: 1.1 },
  "mistralai/mistral-large-2512": { in: 2, out: 6 },
};

/** Estimate USD cost for a reply, falling back to a flat per-1M rate. */
export function estimateCost(model: string, promptTokens: number, completionTokens: number): number | undefined {
  const p = MODEL_PRICING[model];
  if (!p) return undefined;
  const usd = (promptTokens / 1_000_000) * p.in + (completionTokens / 1_000_000) * p.out;
  return Math.round(usd * 10000) / 10000;
}

/** Very rough token estimate (~4 chars/token) when the provider reports nothing. */
export function roughTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}
