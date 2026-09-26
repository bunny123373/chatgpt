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
  /**
   * Data URL, present only for images up to MAX_INLINE. Sent to the model in
   * preference to the remote URL, because a vision endpoint has to be able to
   * reach that URL itself and often cannot.
   */
  dataUrl?: string;
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

/**
 * Read intrinsic pixel dimensions from the blob.
 *
 * Purely informational, so it must never fail the download: if there is no
 * Image constructor, or the blob will not decode, report 0x0 and carry on.
 */
function readSize(blob: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    if (typeof Image === "undefined" || typeof URL.createObjectURL !== "function") {
      resolve({ width: 0, height: 0 });
      return;
    }
    let url = "";
    try {
      url = URL.createObjectURL(blob);
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
    } catch {
      if (url) URL.revokeObjectURL(url);
      resolve({ width: 0, height: 0 });
    }
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

  return {
    ok: true,
    blob,
    url: URL.createObjectURL(blob),
    type,
    bytes: blob.size,
    filename,
    width,
    height,
    /** Only set when the image is small enough to inline as a data URL. */
    dataUrl: blob.size <= MAX_INLINE ? await blobToDataUrl(blob) : undefined,
  };
}

/**
 * Above this, inlining as a data URL bloats the request past what most vision
 * endpoints accept, so the model gets the URL instead.
 */
export const MAX_INLINE = 4 * 1024 * 1024;

/**
 * Base64-encode a blob. Optional detail, so any failure yields undefined rather
 * than losing the download.
 */
function blobToDataUrl(blob: Blob): Promise<string | undefined> {
  return new Promise((resolve) => {
    if (typeof FileReader === "undefined") {
      resolve(undefined);
      return;
    }
    try {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result ?? "") || undefined);
      fr.onerror = () => resolve(undefined);
      fr.readAsDataURL(blob);
    } catch {
      resolve(undefined);
    }
  });
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

/* ------------------- detection inside chat text -------------------------- */

/** Every format the browser can decode and hand back to a canvas. */
export const IMAGE_EXTENSIONS = [
  "png", "jpg", "jpeg", "webp", "gif", "avif", "svg", "bmp", "ico", "tif", "tiff", "apng", "jfif",
] as const;

const URL_RE = /\bhttps?:\/\/[^\s<>"'`)\]]+/gi;

/** Pull every http(s) URL out of a block of text, in order, without duplicates. */
export function extractUrls(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(URL_RE)) {
    // Trailing punctuation is almost never part of the URL.
    const cleaned = m[0].replace(/[.,;:!?]+$/, "");
    if (cleaned && !out.includes(cleaned)) out.push(cleaned);
  }
  return out;
}

/** True when the URL's path looks like an image, so no network call is needed. */
export function looksLikeImageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const last = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() ?? "").toLowerCase();
    const dot = last.lastIndexOf(".");
    if (dot < 0) return false;
    return (IMAGE_EXTENSIONS as readonly string[]).includes(last.slice(dot + 1));
  } catch {
    return false;
  }
}

/**
 * Decide whether a URL is an image, and return it if so.
 *
 * A known extension means the answer is yes without a network call. Anything
 * else is fetched once and judged by its content type, which is the only way to
 * recognise the many image URLs that carry no extension. Returns null when the
 * URL is not an image, so callers can treat that as "just a link".
 */
export async function probeImageUrl(url: string): Promise<FetchedImage | FetchError | null> {
  const res = await fetchImage(url);
  if (!res.ok) return null;
  return res;
}

/** Load an image element from a URL, for the inline preview. */
export function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Needed so a cross-origin image can be measured and re-encoded.
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load that image for preview."));
    img.src = src;
  });
}
