"use client";

/**
 * PDF → images.
 *
 * Two paths, tried in order:
 *
 *  1. pdf.js (Mozilla) loaded lazily from a CDN. This renders *any* page
 *     faithfully, including text and vector art, at whatever scale you ask
 *     for. It is not bundled, so the app stays dependency-free; the cost is
 *     that the first use needs network access.
 *
 *  2. A dependency-free fallback that scans the raw PDF bytes for embedded
 *     JPEG images and returns those. This works fully offline and handles
 *     image-only PDFs (scans, and the image PDFs this app exports) but cannot
 *     render text or vector pages.
 *
 * If both fail the caller gets a message explaining why, never a silent
 * empty result.
 */

export interface PdfPage {
  dataUrl: string;
  width: number;
  height: number;
  index: number;
}

export interface PdfRenderResult {
  ok: boolean;
  pages: PdfPage[];
  /** True when the embedded-image fallback produced the result. */
  fallback: boolean;
  message: string;
}

const PDFJS_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.6.82/pdf.min.mjs";
const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.6.82/pdf.worker.min.mjs";

/* eslint-disable @typescript-eslint/no-explicit-any */
type PdfJsLib = any;

let pdfJsPromise: Promise<PdfJsLib | null> | null = null;

/** Load pdf.js on first use and reuse it afterwards. */
function loadPdfJs(): Promise<PdfJsLib | null> {
  if (pdfJsPromise) return pdfJsPromise;

  pdfJsPromise = (async () => {
    if (typeof window === "undefined") return null;
    try {
      const mod: any = await import(/* webpackIgnore: true */ PDFJS_URL);
      const lib = mod?.default ?? mod;
      if (!lib?.getDocument) return null;
      lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      return lib as PdfJsLib;
    } catch {
      return null;
    }
  })();

  return pdfJsPromise;
}

/* ------------------------- path 1: pdf.js render ------------------------- */

async function renderWithPdfJs(data: ArrayBuffer, scale: number, maxPages: number): Promise<PdfPage[] | null> {
  const pdfjs = await loadPdfJs();
  if (!pdfjs) return null;

  const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
  const pages: PdfPage[] = [];
  const count = Math.min(doc.numPages, maxPages);

  for (let i = 1; i <= count; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    // JPEG has no alpha, so flatten onto white rather than leaving black.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    pages.push({ dataUrl: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height, index: i });
  }

  try {
    await doc.destroy();
  } catch {
    /* already torn down */
  }
  return pages;
}

/* ------------------- path 2: pull embedded JPEGs out --------------------- */

/**
 * Scan for JPEG streams (SOI ... EOI) inside the raw PDF bytes.
 *
 * Works for image-only PDFs. Returns nothing for text/vector documents,
 * which is reported honestly to the caller.
 */
function extractEmbeddedJpegs(bytes: Uint8Array, maxPages: number): PdfPage[] {
  const SOI = [0xff, 0xd8];
  const EOI = [0xff, 0xd9];
  const found: PdfPage[] = [];
  let i = 0;

  while (i < bytes.length - 3 && found.length < maxPages) {
    if (bytes[i] === SOI[0] && bytes[i + 1] === SOI[1]) {
      // Walk forward to the matching EOI.
      let j = i + 2;
      let end = -1;
      while (j < bytes.length - 1) {
        if (bytes[j] === EOI[0] && bytes[j + 1] === EOI[1]) {
          end = j + 2;
          break;
        }
        j++;
      }
      if (end > 0) {
        const slice = bytes.subarray(i, end);
        const bin = new Uint8Array(slice.length);
        bin.set(slice);
        const blob = new Blob([bin], { type: "image/jpeg" });
        const url = URL.createObjectURL(blob);
        found.push({ dataUrl: url, width: 0, height: 0, index: found.length + 1 });
        i = end;
        continue;
      }
    }
    i++;
  }
  return found;
}

/* ------------------------------- public API ------------------------------ */

export interface PdfToImageOptions {
  /** 1 ≈ 72dpi, 2 ≈ 144dpi, 3 ≈ 216dpi. */
  scale?: number;
  /** Safety cap so a 500-page PDF cannot lock up the tab. */
  maxPages?: number;
}

export async function pdfToImages(file: File, opts: PdfToImageOptions = {}): Promise<PdfRenderResult> {
  const scale = Math.min(Math.max(opts.scale ?? 2, 0.5), 4);
  const maxPages = Math.min(Math.max(opts.maxPages ?? 50, 1), 200);

  let data: ArrayBuffer;
  try {
    data = await file.arrayBuffer();
  } catch {
    return { ok: false, pages: [], fallback: false, message: `Could not read ${file.name}.` };
  }
  if (data.byteLength < 16) {
    return { ok: false, pages: [], fallback: false, message: `${file.name} is empty or not a valid PDF.` };
  }

  // 1) Try the accurate renderer.
  try {
    const pages = await renderWithPdfJs(data, scale, maxPages);
    if (pages && pages.length) {
      return {
        ok: true,
        pages,
        fallback: false,
        message: `Rendered ${pages.length} page${pages.length === 1 ? "" : "s"} at ${scale}×`,
      };
    }
  } catch {
    /* fall through to the offline path */
  }

  // 2) Offline: salvage the embedded images.
  const embedded = extractEmbeddedJpegs(new Uint8Array(data), maxPages);
  if (embedded.length) {
    return {
      ok: true,
      pages: embedded,
      fallback: true,
      message: `Extracted ${embedded.length} embedded image${embedded.length === 1 ? "" : "s"} (offline mode)`,
    };
  }

  return {
    ok: false,
    pages: [],
    fallback: false,
    message:
      "Couldn't render this PDF. The page renderer needs network access on first use, and no embedded images were found as a fallback. Try again while online, or convert it on your device.",
  };
}

export function downloadPage(page: PdfPage, base: string): void {
  // The fallback path hands back blob: URLs, which <a download> handles fine.
  const a = document.createElement("a");
  a.href = page.dataUrl;
  a.download = `${base}-page-${String(page.index).padStart(2, "0")}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Trigger several downloads in sequence; browsers ask for multi-download permission. */
export function downloadPages(pages: PdfPage[], base: string, gapMs = 350): void {
  pages.forEach((p, i) => {
    window.setTimeout(() => downloadPage(p, base), i * gapMs);
  });
}
