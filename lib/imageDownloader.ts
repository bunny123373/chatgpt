"use client";

/**
 * Download an image from a URL.
 *
 * The browser cannot fetch most cross-origin images without CORS headers, and
 * it cannot force a save from a plain link either. Both problems are solved by
 * fetching through /api/image-proxy, which returns the bytes with
 * Content-Disposition: attachment.
 *
 * The image is fetched once and kept as a blob: the preview and the download
 * both read from that same blob, so nothing is downloaded twice.
 */

export interface FetchedImage {
  ok: true;
  blob: Blob;
  /** Object URL for the preview; revoke with releaseImage(). */
  url: string;
  type: string;
  bytes: number;
  filename: string;
  width: number;
  height: number;
}

export interface FetchError {
  ok: false;
  message: string;
}

const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/svg+xml": "svg",
  "image/bmp": "bmp",
  "image/tiff": "tiff",
  "image/x-icon": "ico",
};

export type NormalisedUrl = { ok: true; url: string } | FetchError;

/** Reject anything that is not an absolute http(s) URL before hitting the proxy. */
export function normaliseImageUrl(input: string): NormalisedUrl {
  const raw = input.trim();
  if (!raw) return { ok: false, message: "Paste an image URL." };
  // Bare hosts are a common paste; assume https rather than failing.
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  let u: URL;
  try {
    u = new URL(candidate);
  } catch {
    return { ok: false, message: "That does not look like a URL." };
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    return { ok: false, message: "Only http and https URLs are supported." };
  }
  return { ok: true, url: u.href };
}

/** Best-effort filename from the URL path, falling back to a generic name. */
export function guessFilename(url: string, type: string): string {
  const ext = EXT_BY_TYPE[type] ?? "png";
  try {
    const u = new URL(url);
    const last = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() ?? "");
    if (last) {
      const cleaned = last.replace(/[^\w.\-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
      if (cleaned) return /\.[a-z0-9]{2,5}$/i.test(cleaned) ? cleaned : `${cleaned}.${ext}`;
    }
    const host = u.hostname.replace(/[^\w.\-]+/g, "-").slice(0, 40);
    if (host) return `${host}.${ext}`;
  } catch {
    /* fall through */
  }
  return `image.${ext}`;
}

/** Read intrinsic pixel dimensions from the blob. */
function readSize(blob: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve({ width: 0, height: 0 });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

/**
 * Fetch an image through the proxy and return it as a blob ready to preview
 * and to save. Never throws; failures come back as { ok: false, message }.
 */
export async function fetchImage(
  rawUrl: string,
  opts: { name?: string } = {}
): Promise<FetchedImage | FetchError> {
  const norm = normaliseImageUrl(rawUrl);
  if (!norm.ok) return norm;   // type: FetchError

  const proxy = new URL("/api/image-proxy", typeof window === "undefined" ? "http://localhost" : window.location.origin);
  proxy.searchParams.set("url", norm.url);
  if (opts.name) proxy.searchParams.set("name", opts.name);

  let res: Response;
  try {
    res = await fetch(proxy.toString());
  } catch {
    return { ok: false, message: "Could not reach the download proxy. Check your connection." };
  }

  if (!res.ok) {
    let message = `The image host refused the request (${res.status}).`;
    try {
      const j = await res.json();
      if (j?.error) message = String(j.error);
    } catch {
      /* keep the generic message */
    }
    return { ok: false, message };
  }

  const type = (res.headers.get("content-type") || "image/png").split(";")[0].trim().toLowerCase();
  if (!type.startsWith("image/")) {
    return { ok: false, message: `That URL returned ${type || "an unknown type"}, not an image.` };
  }

  const blob = await res.blob();
  if (!blob.size) return { ok: false, message: "The image came back empty." };

  // Prefer the filename the proxy chose, since it honours Content-Disposition.
  const cd = res.headers.get("content-disposition") || "";
  const fromHeader = /filename="?([^";]+)"?/i.exec(cd)?.[1];
  const filename = fromHeader
    ? decodeURIComponent(fromHeader)
    : guessFilename(norm.url, type);

  const { width, height } = await readSize(blob);

  return { ok: true, blob, url: URL.createObjectURL(blob), type, bytes: blob.size, filename, width, height };
}

/** Release the preview object URL when the image is discarded. */
export function releaseImage(img: { url: string } | null): void {
  if (img?.url.startsWith("blob:")) URL.revokeObjectURL(img.url);
}

/** Save a blob to disk under `filename`. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
