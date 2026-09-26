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
  data?: { id?: string }[];
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
    const models = Array.isArray(json.data)
      ? [...new Set(json.data.map((m) => m?.id).filter((id): id is string => typeof id === "string" && id.length > 0))].sort()
      : [];

    return NextResponse.json({ ok: true, count: models.length, models: models.slice(0, 400) });
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
