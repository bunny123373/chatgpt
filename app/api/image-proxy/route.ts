export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Image download proxy.
 *
 * Generated images live on a CDN that often omits CORS headers, so a direct
 * `fetch()` from the browser fails and we can only open a new tab. This route
 * fetches the image server-side and returns it with
 * `Content-Disposition: attachment`, which makes the browser save the file
 * directly regardless of the origin.
 *
 *   GET /api/image-proxy?url=<absolute https url>&name=<optional filename>
 */

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB ceiling

/** Reject anything that isn't a public http(s) URL (SSRF guard). */
function isSafeRemoteUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;

  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) return false;

  // Literal private / loopback / link-local addresses.
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
  if (host === "::1" || host === "[::1]" || host.startsWith("fc") || host.startsWith("fd")) return false;
  if (host === "0.0.0.0" || host.startsWith("0.")) return false;

  return true;
}

const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/svg+xml": "svg",
};

/** Strip anything that could break a Content-Disposition header. */
function safeFilename(name: string, fallbackExt: string): string {
  const cleaned = (name || "")
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  if (!cleaned) return `image.${fallbackExt}`;
  return /\.[a-z0-9]{2,5}$/i.test(cleaned) ? cleaned : `${cleaned}.${fallbackExt}`;
}

export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get("url") || "";
  const name = new URL(req.url).searchParams.get("name") || "";

  if (!isSafeRemoteUrl(url)) {
    return Response.json({ error: "Invalid or blocked image URL." }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      // Needed for a few CDNs that redirect or require a UA.
      headers: { Accept: "image/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    return Response.json({ error: "Could not reach the image host." }, { status: 502 });
  }

  if (!upstream.ok) {
    return Response.json({ error: `Image host returned ${upstream.status}.` }, { status: 502 });
  }

  const type = (upstream.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (type && !type.startsWith("image/") && type !== "application/octet-stream") {
    return Response.json({ error: "That URL is not an image." }, { status: 415 });
  }

  const lengthHeader = Number(upstream.headers.get("content-length") || "0");
  if (lengthHeader && lengthHeader > MAX_BYTES) {
    return Response.json({ error: "Image is too large to download." }, { status: 413 });
  }

  const bytes = new Uint8Array(await upstream.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) {
    return Response.json({ error: "Image is too large to download." }, { status: 413 });
  }

  const outType = type || "image/png";
  const ext = EXT_BY_TYPE[outType] || "png";
  const filename = safeFilename(name, ext);

  // Honour the upstream filename when we weren't given one.
  const cd = upstream.headers.get("content-disposition") || "";
  const upstreamName = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd)?.[1];
  const finalName = name ? filename : upstreamName ? safeFilename(decodeURIComponent(upstreamName), ext) : filename;

  return new Response(bytes, {
    headers: {
      "Content-Type": outType,
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `attachment; filename="${finalName}"`,
      "Cache-Control": "private, max-age=600",
    },
  });
}
