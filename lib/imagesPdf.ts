"use client";

/**
 * Images → PDF.
 *
 * Builds a print-ready document with one image per page (A4/Letter, auto-fit)
 * and opens the browser's print dialog, where the user picks "Save as PDF".
 * No PDF library and no upload — images stay in the browser and the output is
 * high quality because the browser rasterises them at print resolution.
 */

export interface PdfImage {
  /** Remote URL (generated image) or a data: URL (local file). */
  url: string;
  /** Optional caption printed under the image. */
  caption?: string;
  /** Clockwise rotation in degrees: 0, 90, 180 or 270. */
  rotate?: number;
}

export type PageSize = "A4" | "Letter";
export type Orientation = "portrait" | "landscape";
export type PageFit = "contain" | "cover";

export interface PrintImagesOptions {
  title: string;
  images: PdfImage[];
  subtitle?: string;
  pageSize?: PageSize;
  orientation?: Orientation;
  /** contain = whole image visible with letterboxing; cover = fills and crops. */
  fit?: PageFit;
  /** Printable margin in mm. */
  marginMm?: number;
  /** Print the title as its own first page. */
  coverPage?: boolean;
}

/** Page box in mm, portrait first. */
const PAGE_MM: Record<PageSize, { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  Letter: { w: 215.9, h: 279.4 },
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function printImagesPdf(opts: PrintImagesOptions): boolean {
  if (typeof window === "undefined") return false;
  if (!opts.images.length) return false;

  const size = PAGE_MM[opts.pageSize ?? "A4"];
  const landscape = (opts.orientation ?? "portrait") === "landscape";
  const pw = landscape ? size.h : size.w;
  const ph = landscape ? size.w : size.h;
  const m = opts.marginMm ?? 12;
  const innerW = pw - m * 2;
  const innerH = ph - m * 2;
  const fit = opts.fit ?? "contain";
  const cover = opts.coverPage ?? true;

  const pages = opts.images
    .map((img, i) => {
      const rot = ((img.rotate ?? 0) % 360 + 360) % 360;
      // A quarter turn swaps which dimension is constrained, so the box the
      // image sits in has to swap too or it overflows the page.
      const quarter = rot === 90 || rot === 270;
      const style = quarter
        ? `max-width:${innerH}mm; max-height:${innerW}mm;`
        : `max-width:${innerW}mm; max-height:${innerH}mm;`;
      return `
    <section class="page">
      <figure>
        <div class="box${quarter ? " quarter" : ""}"><img src="${esc(img.url)}" alt="" style="transform:rotate(${rot}deg); ${style}" /></div>
        ${img.caption ? `<figcaption>${esc(img.caption)}</figcaption>` : ""}
      </figure>
      <span class="num">${i + 1} / ${opts.images.length}</span>
    </section>`;
    })
    .join("\n");

  const doc = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>${esc(opts.title)}</title>
<style>
  @page { size: ${pw}mm ${ph}mm; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  .page {
    position: relative;
    width: ${pw}mm;
    height: ${ph}mm;
    padding: ${m}mm;
    display: flex;
    align-items: center;
    justify-content: center;
    page-break-after: always;
    break-after: page;
    overflow: hidden;
  }
  .page:last-child { page-break-after: auto; break-after: auto; }
  figure { margin: 0; width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5mm; }
  .box {
    display: flex; align-items: center; justify-content: center;
    width: ${fit === "cover" ? "100%" : "auto"};
    height: ${fit === "cover" ? "100%" : "auto"};
    max-width: ${innerW}mm; max-height: ${innerH}mm;
    ${fit === "cover" ? "flex: 1 1 auto; min-height: 0;" : ""}
  }
  .box.quarter { width: ${fit === "cover" ? "100%" : "auto"}; max-width: ${innerH}mm; max-height: ${innerW}mm; }
  img {
    width: ${fit === "cover" ? "100%" : "auto"};
    height: ${fit === "cover" ? "100%" : "auto"};
    max-width: 100%;
    max-height: 100%;
    object-fit: ${fit};
    display: block;
  }
  figcaption {
    font: 12px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #555;
    text-align: center;
    max-width: 90%;
    ${fit === "cover" ? "flex: 0 0 auto;" : ""}
  }
  .num {
    position: absolute;
    bottom: 5mm; left: 0; right: 0;
    text-align: center;
    font: 10px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #999;
  }
  ${cover ? "header.doc { page-break-after: always; break-after: page; }" : ""}
</style></head>
<body>
  ${
    cover
      ? `<header class="doc">
    <h1>${esc(opts.title)}</h1>
    <p>${opts.images.length} image${opts.images.length === 1 ? "" : "s"}${
      opts.subtitle ? ` · ${esc(opts.subtitle)}` : ""
    } · Exported ${esc(new Date().toLocaleString())} · Next AI</p>
  </header>`
      : ""
  }
  ${pages}
</body></html>`;

  // NOTE: do not pass `noopener` here. Per spec window.open() returns null when
  // that feature is set, so we would lose the handle, never write the document
  // and never call print() -- the user got a blank window that did nothing.
  // We open a blank same-origin window and fill it ourselves, so there is no
  // untrusted navigation to protect against; `win.opener = null` below still
  // severs the reference for defence in depth.
  const win = window.open("", "_blank", "width=1000,height=1100");
  if (!win) return false;
  try {
    win.opener = null;
  } catch {
    /* some engines make this read-only */
  }
  win.document.open();
  win.document.write(doc);
  win.document.close();

  // Never print a document whose images failed to decode -- that is what
  // produces blank pages. Bail out with a clear reason instead.
  const imgs = Array.from(win.document.images);
  if (imgs.length !== opts.images.length) {
    win.close();
    return false;
  }

  const ready = Promise.all(
    imgs.map(
      (im) =>
        new Promise<void>((resolve) => {
          if (im.complete && im.naturalWidth > 0) return resolve();
          im.onload = () => resolve();
          im.onerror = () => resolve();
        })
    )
  );
  void ready.then(() => {
    // Belt and braces: if anything is still zero-width, do not print.
    const broken = Array.from(win.document.images).filter((im) => im.naturalWidth === 0).length;
    if (broken > 0) {
      win.close();
      return;
    }
    win.setTimeout(() => {
      try {
        win.focus();
        win.print();
      } catch {
        /* user can print manually */
      }
    }, 250);
  });
  return true;
}

/** Read picked files as data URLs so local images can be converted too. */
export function filesToImages(files: File[]): Promise<PdfImage[]> {
  return Promise.all(
    files
      .filter((f) => f.type.startsWith("image/"))
      .map(
        (f) =>
          new Promise<PdfImage>((resolve) => {
            const fr = new FileReader();
            fr.onload = () => resolve({ url: String(fr.result), caption: f.name });
            fr.onerror = () => resolve({ url: "", caption: f.name });
            fr.readAsDataURL(f);
          })
      )
  ).then((list) => list.filter((i) => i.url));
}

/**
 * Fast path for turning a picked image into a print page.
 *
 * Three things make this quicker than handing the raw file to the print
 * window:
 *
 *  - `createImageBitmap` decodes off the main thread and honours the EXIF
 *    orientation flag, so phone photos come out upright automatically.
 *  - Oversized images are downscaled to `maxEdge` (≈200 dpi across an A4
 *    page). A 12 MP phone photo is ~48 MB as base64; capped it is well under
 *    1 MB, which is what made the old path crawl.
 *  - Rotation is baked into the canvas instead of applied as a CSS transform,
 *    because a transform is painted *after* layout and so does not change the
 *    box the image occupies — rotated pages drifted and got clipped.
 */
export interface PreparedImage {
  /** JPEG (or small PNG) data URL ready to embed. */
  url: string;
  caption: string;
  /** Intrinsic pixel size, needed by the PDF writer for /Width and /Height. */
  width: number;
  height: number;
}

export async function prepareImageForPdf(
  file: File,
  opts: { maxEdge?: number; rotate?: number; quality?: number } = {}
): Promise<PreparedImage | null> {
  const maxEdge = opts.maxEdge ?? 2200;
  const rotate = ((opts.rotate ?? 0) % 360 + 360) % 360;
  const quality = opts.quality ?? 0.92;

  let bitmap: ImageBitmap;
  let w: number;
  let h: number;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    w = bitmap.width;
    h = bitmap.height;
  } catch {
    // Safari < 15 and some older engines lack the options bag.
    try {
      bitmap = await createImageBitmap(file);
      w = bitmap.width;
      h = bitmap.height;
    } catch {
      return null;
    }
  }

  const quarter = rotate === 90 || rotate === 270;
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  const dw = Math.max(1, Math.round(w * scale));
  const dh = Math.max(1, Math.round(h * scale));
  // After a quarter turn the drawn dimensions swap.
  const cw = quarter ? dh : dw;
  const ch = quarter ? dw : dh;

  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close?.();
    return null;
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.translate(cw / 2, ch / 2);
  ctx.rotate((rotate * Math.PI) / 180);
  ctx.drawImage(bitmap, -dw / 2, -dh / 2, dw, dh);
  bitmap.close?.();

  // JPEG for anything sizeable — much smaller and plenty for print.
  // PNG keeps small images crisp and preserves transparency.
  const useJpeg = cw * dh > 400_000;
  const dataUrl = canvas.toDataURL(useJpeg ? "image/jpeg" : "image/png", quality);
  return { url: dataUrl, caption: file.name, width: cw, height: ch };
}
