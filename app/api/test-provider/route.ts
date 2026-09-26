import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Probe a provider: does it answer, and what models does it offer?
 *
 * Two jobs in one request, because they are the same network call. GET /models
 * is the cheapest thing an OpenAI-compatible server exposes, so it doubles as
 * the reachability check and as the source for the dynamic model picker.
 *
 * The key is read from the x-api-key header, exactly as /api/chat does, so it
 * never ends up in a query string, a log line or a referrer header.
 *
 * SSRF: this route fetches a URL the caller supplies, which is the same shape
 * of problem /api/image-proxy already solves. The same guard is applied here --
 * public http(s) only, private and loopback addresses refused. Without it this
 * would be an open proxy for anything the Vercel network can reach, including
 * the metadata service.
 */

interface ModelListResponse {
  /**
   * OpenRouter returns a pricing object per model, with prompt and completion
   * as decimal strings. "0" on both means the model is free. Providers that
   * do not return pricing leave it undefined and nothing is filtered.
   */
  data?: {
    id?: string;
    /**
     * Display name, when the provider supplies one. OpenRouter does, and it is
     * the only readable label a model has: the id itself is something like
     * "meta-llama/llama-3.3-70b-instruct:free", and a picker full of those
     * gives the user nothing they can tell apart at a glance.
     */
    name?: string;
    pricing?: { prompt?: string; completion?: string };
  }[];
}

export async function GET(req: Request) {
  const apiKey = (req.headers.get("x-api-key") ?? "").trim();
  const baseUrl = (req.headers.get("x-base-url") ?? "").trim();

  if (!baseUrl) return NextResponse.json({ ok: false, error: "No base URL set." }, { status: 400 });

  let url: URL;
  try {
    url = new URL(baseUrl.replace(/\/+$/, ""));
  } catch {
    return NextResponse.json({ ok: false, error: "That base URL is not a valid URL." }, { status: 400 });
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return NextResponse.json({ ok: false, error: "Base URL must be http or https." }, { status: 400 });
  }

  const host = url.hostname.toLowerCase();
  const blocked =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "[::1]" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    // Cloud metadata endpoints. These hand out credentials to anything that asks.
    host === "169.254.169.254" ||
    host === "metadata.google.internal" ||
    // Private ranges.
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^\[?f[cd][0-9a-f]{2}:/.test(host);

  if (blocked) {
    return NextResponse.json(
      { ok: false, error: "That host is not reachable from the server. Private and loopback addresses are refused." },
      { status: 400 },
    );
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  // Ten seconds: long enough for a cold container, short enough that a dead host
  // does not leave the button spinning.
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 10_000);

  try {
    const res = await fetch(`${url.toString().replace(/\/+$/, "")}/models`, { headers, signal: ac.signal, cache: "no-store" });

    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      return NextResponse.json(
        {
          ok: false,
          status: res.status,
          error:
            res.status === 401 || res.status === 403
              ? "The provider rejected the key."
              : `The provider returned ${res.status}.`,
          detail,
        },
        { status: 200 },
      );
    }

    const json = (await res.json()) as ModelListResponse;
    // id -> display name, built first so the filter below can still work on plain
    // ids while the response carries a label for each one.
    const nameById = new Map<string, string>();
    for (const m of json.data ?? []) {
      if (typeof m?.id !== "string" || !m.id) continue;
      const n = typeof m.name === "string" ? m.name.trim() : "";
      if (n) nameById.set(m.id, n);
    }
    const all = [...nameById.keys()].sort();

    // Free-only, but only when the provider actually tells us the price.
    //
    // Testing the pricing fields rather than matching the ":free" suffix,
    // because the suffix is a convention some providers follow and others do
    // not, while a zero price is the actual thing being asked for. A provider
    // that sends no pricing is left alone rather than having everything filtered
    // out, which would look like the provider offered nothing.
    const priced = json.data?.filter((m) => m?.pricing && typeof m.pricing === "object").length ?? 0;
    const freeOnly = priced > 0;
    const models = freeOnly
      ? all.filter((id) => {
          const m = json.data?.find((d) => d?.id === id);
          const p = m?.pricing;
          return p && Number(p.prompt) === 0 && Number(p.completion) === 0;
        })
      : all;

    return NextResponse.json({
      ok: true,
      count: models.length,
      total: all.length,
      freeOnly,
      models: models.slice(0, 400).map((id) => ({ id, name: nameById.get(id) })),
    });
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return NextResponse.json(
      { ok: false, error: aborted ? "The provider did not answer within 10 seconds." : "Could not reach the provider." },
      { status: 200 },
    );
  } finally {
    clearTimeout(timer);
  }
}
