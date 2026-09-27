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
    /**
     * A built-in web search endpoint on this provider, such as xKiro's
     * POST /search. False does not mean the user cannot search: it means this
     * provider has none, and a configured search provider (lib/searchMeta.ts)
     * is used instead. See searchUsable() in lib/providers.ts.
     */
    search: boolean;
    images: boolean;
    /** Text to speech. */
    speech: boolean;
    /** A list of voices, which not every speech provider offers. */
    voices: boolean;
    /** GET /models, for the dynamic picker. */
    models: boolean;
  };
  /**
   * Which image API shape this provider speaks.
   *
   * "openai" is POST {base}/images/generations, the standard one, returning a
   * job id and then a URL. "cloudflare-run" is Workers AI's own
   * POST /ai/run/{model}, which Cloudflare does not expose OpenAI-compatibly and
   * which answers with base64 rather than a URL. The two are different enough
   * that pretending one is the other produces either a 404 or a response the
   * parser cannot read.
   */
  imageApi?: "openai" | "cloudflare-run";
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
  {
    id: "cloudflare",
    label: "Cloudflare Workers AI",
    keyUrl: "https://dash.cloudflare.com/profile/api-tokens",
    // The account id is part of the path and is not a secret: it appears in
    // dashboard URLs and in Cloudflare's own documentation. The token is the
    // secret, and that is what goes in the key field.
    baseUrl: "https://api.cloudflare.com/client/v4/accounts/YOUR_ACCOUNT_ID/ai/v1",
    defaultModel: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    supports: { chat: true, search: false, images: true, speech: true, voices: false, models: false },
    imageApi: "cloudflare-run",
    note:
      "Replace YOUR_ACCOUNT_ID in the base URL with the account id from your Cloudflare dashboard. Chat works as-is: the endpoint is OpenAI-compatible. Two honest limits: there is no /v1/models listing, so Test cannot discover models and the id is typed by hand; and images go through Workers AI's own /ai/run/{model} path rather than the OpenAI images endpoint, which Cloudflare does not implement.",
  },
];

/**
 * Whether a base URL belongs to a provider that has its own search endpoint.
 *
 * Only xKiro serves POST /search. For everyone else, search comes from a
 * separately configured search provider, and if there is not one the toggle
 * has to admit it did nothing.
 *
 * Host-based like providerForUrl, so a self-hosted router on localhost is not
 * mistaken for xKiro and an unrecognised host is not assumed to have search.
 */
export function providerSupportsSearch(baseUrl: string): boolean {
  return providerForUrl(baseUrl)?.supports.search === true;
}

/**
 * Text-to-image models on Cloudflare Workers AI.
 *
 * Taken from the published catalogue rather than guessed.
 * `google/nano-banana-2-lite` is deliberately absent: it is a Gemini image
 * model and Cloudflare does not host it, so offering it would put an entry
 * in the picker that fails every time.
 */
export const CLOUDFLARE_IMAGE_MODELS = [
  "@cf/black-forest-labs/flux-1-schnell",
  "@cf/black-forest-labs/flux-2-dev",
  "@cf/black-forest-labs/flux-2-klein-4b",
  "@cf/black-forest-labs/flux-2-klein-9b",
  "@cf/lykon/dreamshaper-8-lcm",
  "@cf/leonardo/lucid-origin",
  "@cf/leonardo/phoenix-1.0",
  "@cf/stabilityai/stable-diffusion-xl-base-1.0",
  "@cf/stabilityai/stable-diffusion-xl-lightning",
];

export const CLOUDFLARE_DEFAULT_IMAGE_MODEL = CLOUDFLARE_IMAGE_MODELS[0];

export function findProvider(id: string): ProviderDef | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/**
 * Which preset a base URL corresponds to.
 *
 * Matches on hostname, because that is what actually identifies a provider. The
 * earlier version tried to prefix-match the whole base URL and fell over on a
 * URL that had been typed with a trailing slash or a different path.
 */
export function providerForUrl(url: string): ProviderDef | undefined {
  const raw = url.trim();
  if (!raw) return undefined;
  let host: string;
  try {
    host = new URL(raw).hostname.toLowerCase();
  } catch {
    return undefined;
  }
  // Anything on the loopback interface is a self-hosted router, whatever URL the
  // user typed.
  if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "[::1]") {
    return findProvider("freellmapi");
  }
  return PROVIDERS.find((p) => {
    try {
      return new URL(p.baseUrl).hostname.toLowerCase() === host;
    } catch {
      return false;
    }
  });
}