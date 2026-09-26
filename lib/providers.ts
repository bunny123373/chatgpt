/**
 * Provider presets.
 *
 * The app already speaks the OpenAI wire format and already lets you type an
 * arbitrary base URL, so adding a provider is a convenience rather than new
 * capability. What this buys is that the common case is one click, and the
 * awkward parts are stated up front: which endpoints a given provider actually
 * serves, so a feature can explain itself instead of failing with a 404.
 */

export interface ProviderDef {
  id: string;
  label: string;
  /** Where the user gets a key. Shown next to the field. */
  keyUrl: string;
  /** Filled into the base URL when the preset is chosen. */
  baseUrl: string;
  /**
   * Model to select when this preset is applied.
   *
   * FreeLLMAPI needs "auto" rather than a model id: its router picks a
   * provider per request, and the id that served the last one is not
   * guaranteed to exist. auto:fast and auto:smart are its named strategies; a
   * profile name routes through a configured fallback chain.
   */
  defaultModel: string;
  /**
   * Endpoint suffixes this provider is known to serve, relative to the base URL.
   * Anything not listed here should be hidden rather than attempted, so the UI
   * can say "this provider has no web search" instead of returning a 404.
   */
  supports: {
    chat: boolean;
    /** Web search: xKiro's POST /search. */
    search: boolean;
    images: boolean;
    /** Text to speech. */
    speech: boolean;
    /** A list of voices, which not every speech provider offers. */
    voices: boolean;
    /** GET /models, for the dynamic picker. */
    models: boolean;
  };
  note?: string;
}

/**
 * The default base URL is the local one from the project's own quick start.
 * If you host it, change it here, or just overwrite the field: the preset only
 * fills the box.
 */
export const PROVIDERS: ProviderDef[] = [
  {
    id: "xkiro",
    label: "xKiro",
    keyUrl: "https://xkiro.com",
    baseUrl: "https://api.xkiro.com/v1",
    defaultModel: "qwen/qwen3.5-flash:free",
    supports: { chat: true, search: true, images: true, speech: true, voices: true, models: true },
  },
  {
    id: "freellmapi",
    label: "FreeLLMAPI (self-hosted)",
    keyUrl: "https://github.com/tashfeenahmed/freellmapi",
    baseUrl: "http://localhost:3001/v1",
    defaultModel: "auto",
    supports: {
      chat: true,
      // FreeLLMAPI documents no /search endpoint, so web search is not offered
      // rather than attempted and failed.
      search: false,
      images: true,
      speech: true,
      // No voice catalogue, so the picker has nothing to list.
      voices: false,
      models: true,
    },
    note: "Runs on your own machine. If you host it, point the base URL at that host instead.",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    keyUrl: "https://openrouter.ai/keys",
    baseUrl: "https://openrouter.ai/api/v1",
    // A free id, since this preset is free-only. The Test button replaces it with
    // whatever the provider actually lists, so this is just a safe starting point.
    defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
    supports: {
      chat: true,
      // OpenRouter aggregates many models, and some of them have a web-search
      // tool, but it is not the POST /search shape this app's research path uses.
      // Attempting it would fail on a shape mismatch rather than a 404, so the
      // toggle stays hidden.
      search: false,
      images: true,
      speech: false,
      // No voice catalogue.
      voices: false,
      models: true,
    },
    note: "One key, many models. Paste the key in the field below; it is stored only in this browser and sent with each request.",
  },  {
    id: "openai",
    label: "OpenAI (compatible)",
    keyUrl: "https://platform.openai.com/api-keys",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    supports: { chat: true, search: false, images: true, speech: true, voices: true, models: true },
  },
];

export function findProvider(id: string): ProviderDef | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/** Guess the provider from a base URL, so a typed URL still gets the right notes. */
export function providerForUrl(url: string): ProviderDef | undefined {
  const u = url.trim().toLowerCase();
  if (!u) return undefined;
  if (u.includes("localhost") || u.includes("127.0.0.1")) return findProvider("freellmapi");
  return PROVIDERS.find((p) => p.baseUrl !== "http://localhost:3001/v1" && u.startsWith(p.baseUrl.toLowerCase().replace(/^https?:\/\//, "").split("/")[0] ?? ""));
}
