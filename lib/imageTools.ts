"use client";

/**
 * Image conversion and editing, entirely in the browser.
 *
 * Everything runs on a <canvas>, so nothing is uploaded and no image library
 * is needed. JPEG/WebP encoding quality is exposed, and transparency is
 * flattened onto a background colour when the target format has no alpha.
 */

export type ImageFormat = "image/png" | "image/jpeg" | "image/webp";

export const IMAGE_FORMATS: { id: ImageFormat; label: string; ext: string; alpha: boolean }[] = [
  { id: "image/png", label: "PNG", ext: "png", alpha: true },
  { id: "image/jpeg", label: "JPEG", ext: "jpg", alpha: false },
  { id: "image/webp", label: "WebP", ext: "webp", alpha: true },
];

export interface EditOptions {
  format: ImageFormat;
  /** 0.1 – 1, ignored for PNG. */
  quality: number;
  /** Target width in px; null keeps the original. */
  width: number | null;
  /** Target height in px; null keeps the original. */
  height: number | null;
  /** Clockwise degrees. */
  rotate: 0 | 90 | 180 | 270;
  flipH: boolean;
  flipV: boolean;
  /** Fills behind transparent pixels when the target has no alpha. */
  background: string;
  /** Constrain width/height scaling to fit inside this box. */
  fit?: "free" | "cover" | "contain";
}

export const DEFAULT_EDIT: EditOptions = {
  format: "image/png",
  quality: 0.92,
  width: null,
  height: null,
  rotate: 0,
  flipH: false,
  flipV: false,
  background: "#ffffff",
  fit: "free",
};

export function loadImageFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not read ${file.name}`));
    };
    img.src = url;
  });
}

function targetSize(w: number, h: number, o: EditOptions): { w: number; h: number } {
  if (o.fit === "cover" || o.fit === "contain") {
    if (o.width && o.height) {
      const scale = o.fit === "cover" ? Math.max(o.width / w, o.height / h) : Math.min(o.width / w, o.height / h);
      return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
    }
  }
  // Only one dimension given: derive the other from the aspect ratio.
  if (o.width && !o.height) return { w: Math.max(1, Math.round(o.width)), h: Math.max(1, Math.round((o.width * h) / w)) };
  if (o.height && !o.width) return { w: Math.max(1, Math.round((o.height * w) / h)), h: Math.max(1, Math.round(o.height)) };
  if (o.width && o.height) return { w: o.width, h: o.height };
  return { w, h };
}

export interface Rendered {
  dataUrl: string;
  width: number;
  height: number;
  bytes: number;
}

export function renderImage(img: HTMLImageElement, o: EditOptions): Rendered {
  const sw = img.naturalWidth || img.width;
  const sh = img.naturalHeight || img.height;
  const size = targetSize(sw, sh, o);
  const swap = o.rotate === 90 || o.rotate === 270;

  // Draw into an unrotated buffer first, then rotate/flip in one pass.
  const base = document.createElement("canvas");
  base.width = size.w;
  base.height = size.h;
  const bx = base.getContext("2d");
  if (!bx) throw new Error("Canvas is unavailable in this browser.");
  if (o.format !== "image/png") {
    bx.fillStyle = o.background;
    bx.fillRect(0, 0, size.w, size.h);
  }
  bx.imageSmoothingEnabled = true;
  bx.imageSmoothingQuality = "high";
  bx.drawImage(img, 0, 0, size.w, size.h);

  const out = document.createElement("canvas");
  out.width = swap ? size.h : size.w;
  out.height = swap ? size.w : size.h;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable in this browser.");
  if (o.format !== "image/png") {
    ctx.fillStyle = o.background;
    ctx.fillRect(0, 0, out.width, out.height);
  }

  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate((o.rotate * Math.PI) / 180);
  ctx.scale(o.flipH ? -1 : 1, o.flipV ? -1 : 1);
  ctx.drawImage(base, -size.w / 2, -size.h / 2);

  const dataUrl = out.toDataURL(o.format, o.quality);
  // base64 -> bytes, accounting for the data-URL prefix.
  const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const bytes = Math.floor((b64.length * 3) / 4);
  return { dataUrl, width: out.width, height: out.height, bytes };
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

/** Crop the centre square out of an image, scaled to `size` px. */
export function centerSquare(img: HTMLImageElement, size: number): Rendered {
  const sw = img.naturalWidth || img.width;
  const sh = img.naturalHeight || img.height;
  const side = Math.min(sw, sh);
  const out = document.createElement("canvas");
  out.width = size;
  out.height = size;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable in this browser.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, (sw - side) / 2, (sh - side) / 2, side, side, 0, 0, size, size);
  const dataUrl = out.toDataURL("image/png");
  return { dataUrl, width: size, height: size, bytes: Math.floor(((dataUrl.length - dataUrl.indexOf(",")) * 3) / 4) };
}
