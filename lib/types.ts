export type Role = "user" | "assistant" | "system";

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
  /** Names of tools (calculator, etc.) the model called to produce this reply. */
  toolsUsed?: string[];
  /** ChatGPT-style thumbs up / down feedback on an assistant reply. */
  feedback?: "up" | "down";
  error?: boolean;
  stopped?: boolean;
}

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
  { id: "qwen/qwen3.5-flash:free", name: "Qwen3.5 Flash", desc: "Free · 1M context · vision & reasoning", tag: "Free" },
  { id: "deepseek/deepseek-v4-pro", name: "DeepSeek V4 Pro", desc: "Free · 1M context · strong reasoning", tag: "Free" },
  { id: "deepseek/deepseek-chat-v3.1", name: "DeepSeek V3.1", desc: "Free · fast general chat", tag: "Free" },
  { id: "minimax/minimax-m3:free", name: "MiniMax M3", desc: "Free · 1M context · vision & reasoning", tag: "Free" },
  { id: "mistralai/mistral-large-2512", name: "Mistral Large 3", desc: "Free · 256K context", tag: "Free" },
  { id: "qwen/qwen3-max:free", name: "Qwen3 Max", desc: "Free · 262K context", tag: "Free" },
  { id: "openai/gpt-5.6-sol", name: "GPT-5.6 Sol", desc: "OpenAI flagship", tag: "OpenAI" },
  { id: "anthropic/claude-sonnet-5", name: "Claude Sonnet 5", desc: "Anthropic flagship", tag: "Anthropic" },
  { id: "google/gemini-3.8-flash", name: "Gemini 3.8 Flash", desc: "Google speed model", tag: "Google" },
  { id: "demo", name: "GPT-2.0 Demo (offline)", desc: "No API key needed — local canned engine", tag: "Offline" },
];

export const DEFAULT_SETTINGS: Settings = {
  apiKey: "",
  baseUrl: "https://api.xkiro.com/v1",
  model: "qwen/qwen3.5-flash:free",
  temperature: 0.7,
  systemPrompt: "You are ChatGPT 2.0, a helpful and concise assistant. Answer in Markdown.",
  streaming: true,
  search: false,
  tools: false,
  imageRatio: "1:1",
  bubbleColor: "default",
  ttsVoice: "american-female",
  ttsSpeed: 1,
  ttsPitch: 0,
  theme: "dark",
  nickname: "You",
};

export function modelName(id: string): string {
  return MODELS.find((m) => m.id === id)?.name ?? id;
}
