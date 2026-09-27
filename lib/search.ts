/**
 * Server-side web search.
 *
 * Every endpoint is hardcoded per provider. See lib/searchMeta.ts for why the
 * client is not allowed to supply one.
 *
 * The point of this module is that the search toggle in the chat was calling an
 * xKiro-only endpoint, so switching to any other provider silently did nothing.
 * Search now works the same whatever model is answering, and when no search
 * provider is configured the caller is told so rather than being handed an empty
 * result that reads like "nothing relevant was found".
 */

import { searchProviderDef } from "./searchMeta";

export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchOutcome {
  ok: boolean;
  hits: SearchHit[];
  /** Set when something went wrong. Safe to show a user. Never contains a key. */
  error?: string;
  provider?: string;
}

const TIMEOUT_MS = 15000;

/** Only http(s) to a real host. A guard against a malformed constant, mostly. */
function assertEndpoint(url: string): void {
  const u = new URL(url);
  if (u.protocol !== "https:") throw new Error("search endpoint must be https");
}

/**
 * Strip anything that looks like a credential out of a provider's error text.
 *
 * A search API that echoes the key back in an error is unusual but not
 * impossible, and that message goes straight into a chat bubble and then into
 * export files.
 */
function scrub(s: string): string {
  return s
    .replace(/\b(?:tvly|BSA)-[A-Za-z0-9_-]{8,}/g, "[redacted]")
    .replace(/\b[0-9a-f]{32,}\b/gi, "[redacted]")
    .slice(0, 200);
}

async function readError(res: Response): Promise<string> {
  const body = await res.text().catch(() => "");
  let detail = body;
  try {
    const j = JSON.parse(body) as Record<string, unknown>;
    // Tavily puts the message at detail.error, Brave and Serper at message.
    const d = j.detail as { error?: string } | undefined;
    detail = d?.error ?? (j.message as string) ?? (j.error as string) ?? body;
  } catch {
    /* not JSON, use the raw text */
  }
  const kind =
    res.status === 401 || res.status === 403
      ? "the key was rejected"
      : res.status === 429
        ? "the free tier is used up or rate limited"
        : `the provider answered ${res.status}`;
  return `${kind}${detail ? `: ${scrub(String(detail).trim())}` : ""}`;
}

async function tavily(apiKey: string, query: string, max: number): Promise<SearchHit[]> {
  assertEndpoint("https://api.tavily.com/search");
  const r = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ query, max_results: max, search_depth: "basic" }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!r.ok) throw new Error(await readError(r));
  const j = (await r.json()) as { results?: { title?: string; url?: string; content?: string }[] };
  return (j.results ?? [])
    .map((x) => ({ title: x.title ?? "Result", url: x.url ?? "", snippet: (x.content ?? "").trim() }))
    .filter((h) => h.url);
}

async function brave(apiKey: string, query: string, max: number): Promise<SearchHit[]> {
  assertEndpoint("https://api.search.brave.com/res/v1/web/search");
  // GET, so the query goes in the query string. Encoded, never interpolated raw.
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(Math.min(max, 20)));
  const r = await fetch(url, {
    headers: { Accept: "application/json", "X-Subscription-Token": apiKey },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!r.ok) throw new Error(await readError(r));
  const j = (await r.json()) as {
    web?: { results?: { title?: string; url?: string; description?: string }[] };
  };
  return (j.web?.results ?? [])
    .map((x) => ({ title: x.title ?? "Result", url: x.url ?? "", snippet: (x.description ?? "").trim() }))
    .filter((h) => h.url);
}

async function serper(apiKey: string, query: string, max: number): Promise<SearchHit[]> {
  assertEndpoint("https://google.serper.dev/search");
  const r = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-KEY": apiKey },
    body: JSON.stringify({ q: query, num: max }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!r.ok) throw new Error(await readError(r));
  const j = (await r.json()) as { organic?: { title?: string; link?: string; snippet?: string }[] };
  return (j.organic ?? [])
    .map((x) => ({ title: x.title ?? "Result", url: x.link ?? "", snippet: (x.snippet ?? "").trim() }))
    .filter((h) => h.url);
}

const IMPLS: Record<string, (k: string, q: string, m: number) => Promise<SearchHit[]>> = {
  tavily,
  brave,
  serper,
};

export interface SearchRequest {
  provider: string;
  apiKey: string;
  /** One string, or several to search them all. */
  queries: string[];
  /** Results wanted per query. Clamped to the provider's own maximum. */
  maxPerQuery?: number;
}

export async function runSearch(req: SearchRequest): Promise<SearchOutcome> {
  const def = searchProviderDef(req.provider);
  if (!def) {
    return { ok: false, hits: [], error: `Unknown search provider "${String(req.provider).slice(0, 40)}".` };
  }
  if (!req.apiKey.trim()) {
    return { ok: false, hits: [], provider: def.id, error: `${def.label} has no key. Add one in Settings.` };
  }
  const impl = IMPLS[def.id];
  if (!impl) {
    return { ok: false, hits: [], provider: def.id, error: `${def.label} is not implemented.` };
  }

  const queries = req.queries.map((q) => q.trim()).filter(Boolean).slice(0, 5);
  if (!queries.length) return { ok: true, hits: [], provider: def.id };

  const max = Math.max(1, Math.min(req.maxPerQuery ?? 6, def.maxResults));

  // Sequential rather than parallel. Every provider bills per request, and a
  // five-query batch fired at once is five charges landing in the same second
  // against a free tier that may only have a few left. Order is also kept,
  // which makes the citation list readable.
  const hits: SearchHit[] = [];
  const errors: string[] = [];
  for (const q of queries) {
    try {
      const got = await impl(req.apiKey.trim(), q.slice(0, 300), max);
      hits.push(...got.slice(0, max));
    } catch (e) {
      errors.push(scrub(e instanceof Error ? e.message : "failed"));
    }
  }

  // De-duplicate on URL: the same page often ranks for several of the queries in
  // a batch, and repeating it wastes context and makes the citations look broken.
  const seen = new Set<string>();
  const unique = hits.filter((h) => {
    const k = h.url.replace(/[#?].*$/, "").replace(/\/$/, "");
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  if (!unique.length && errors.length) {
    return { ok: false, hits: [], provider: def.id, error: `${def.label}: ${errors[0]}` };
  }
  return {
    ok: true,
    hits: unique,
    provider: def.id,
    // Partial success is worth saying out loud: three of five queries failed and
    // the model is about to answer from two.
    ...(errors.length ? { error: `${errors.length} of ${queries.length} queries failed: ${errors[0]}` } : {}),
  };
}

/**
 * Render hits as the block the model reads.
 *
 * Same shape the xKiro search produced, so nothing downstream had to change.
 * The source of each hit is stated explicitly because a model that sees a URL
 * in its context will otherwise present the content as its own knowledge.
 */
export function formatHits(hits: SearchHit[], label: string): string {
  if (!hits.length) return "";
  const items = hits
    .map((h) => {
      const snip = h.snippet.replace(/\s+/g, " ").trim().slice(0, 400);
      return `- ${h.title}${h.url ? ` (${h.url})` : ""}${snip ? `\n  ${snip}` : ""}`;
    })
    .join("\n");
  return `${label}:\n${items}\n\nCite these by URL when you use them. Say so if they do not answer the question.`;
}
