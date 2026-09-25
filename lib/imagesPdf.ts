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
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function printImagesPdf(opts: { title: string; images: PdfImage[]; subtitle?: string }): boolean {
  if (typeof window === "undefined") return false;
  if (!opts.images.length) return false;

  const pages = opts.images
    .map(
      (img, i) => `
    <section class="page">
      <figure>
        <img src="${esc(img.url)}" alt="" />
        ${img.caption ? `<figcaption>${esc(img.caption)}</figcaption>` : ""}
      </figure>
      <span class="num">${i + 1} / ${opts.images.length}</span>
    </section>`
    )
    .join("\n");

  const doc = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>${esc(opts.title)}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  .page {
    position: relative;
    width: 210mm;
    height: 297mm;
    padding: 12mm;
    display: flex;
    align-items: center;
    justify-content: center;
    page-break-after: always;
    break-after: page;
    overflow: hidden;
  }
  .page:last-child { page-break-after: auto; break-after: auto; }
  figure { margin: 0; max-width: 100%; max-height: 100%; display: flex; flex-direction: column; align-items: center; gap: 6mm; }
  img {
    max-width: 100%;
    max-height: 258mm;
    width: auto;
    height: auto;
    object-fit: contain;
    display: block;
  }
  figcaption {
    font: 12px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #555;
    text-align: center;
    max-width: 90%;
  }
  .num {
    position: absolute;
    bottom: 6mm; left: 0; right: 0;
    text-align: center;
    font: 10px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #999;
  }
  header.doc { page-break-after: always; break-after: page; }
</style></head>
<body>
  <header class="doc">
    <h1>${esc(opts.title)}</h1>
    <p>${opts.images.length} image${opts.images.length === 1 ? "" : "s"}${
      opts.subtitle ? ` · ${esc(opts.subtitle)}` : ""
    } · Exported ${esc(new Date().toLocaleString())} · Next AI</p>
  </header>
  ${pages}
</body></html>`;

  const win = window.open("", "_blank", "noopener,noreferrer,width=1000,height=1100");
  if (!win) return false;
  win.document.open();
  win.document.write(doc);
  win.document.close();

  // Wait for the images to decode before printing, otherwise pages can come out blank.
  const imgs = Array.from(win.document.images);
  const ready = Promise.all(
    imgs.map(
      (im) =>
        new Promise<void>((resolve) => {
          if (im.complete) return resolve();
          im.onload = () => resolve();
          im.onerror = () => resolve();
        })
    )
  );
  void ready.then(() => {
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
