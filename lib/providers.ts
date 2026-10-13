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
   * A concrete model id. The Test button replaces it with whatever the provider
   * actually lists, and the id can always be typed by hand.
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
     * is used instead. See providerSupportsSearch() below.
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
  note?: string;
}

/**
 * The default base URL is the local one from the project's own quick start.
 * If you host it, change it here, or just overwrite the field: the preset only
 * fills the box.
 *
 * xKiro is the only preset. It is the provider the app is configured for, and
 * the one whose key lives on the server, so it is the only one that works
 * without the user pasting a credential into Settings. The other presets were
 * removed rather than left selectable, because each needed its own key:
 * offering them let the user point the app at an endpoint it had no credential
 * for, which surfaced as a 503 from whatever host was underneath.
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
  // No loopback special case any more. It used to map localhost onto the
  // self-hosted FreeLLMAPI preset; with that preset gone there is nothing to map
  // it to, and falling through to the hostname match below reports it as the
  // custom endpoint it actually is.
  return PROVIDERS.find((p) => {
    try {
      return new URL(p.baseUrl).hostname.toLowerCase() === host;
    } catch {
      return false;
    }
  });
}