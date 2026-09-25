"use client";

/**
 * Any supported file → PDF.
 *
 * Reuses the print-window approach already used for image → PDF: build a
 * print-ready document, then hand it to the browser's print dialog where the
 * user picks "Save as PDF". No PDF library, nothing uploaded for text/images.
 *
 * Routing by type:
 *   image/*            → one image per page          (lib/imagesPdf.ts)
 *   application/pdf    → straight download, no re-render
 *   .docx              → text via /api/files, then typeset
 *   text / code / csv  → read in-browser, then typeset
 *   .html / .rtf       → tags and control words stripped, then typeset
 */

import { filesToImages, prepareImageForPdf, printImagesPdf } from "./imagesPdf";
import { buildImagePdf, buildTextPdf, type TextSection } from "./pdfWriter";

const MAX_BYTES = 8 * 1024 * 1024; // matches the chat upload limit

/** Extensions we can typeset as flowing text. */
const TEXT_EXT =
  /\.(txt|md|markdown|csv|tsv|json|ya?ml|xml|html?|rtf|log|ini|toml|env|sql|sh|py|js|ts|tsx|jsx|css|scss|go|rs|java|rb|php|c|h|cpp|cs|swift|kt|vue|svelte|astro|conf|gitignore)$/i;

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function ext(name: string): string {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i).toLowerCase();
}

function baseName(name: string): string {
  const i = name.lastIndexOf(".");
  return i < 0 ? name : name.slice(0, i);
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result ?? ""));
    fr.onerror = () => reject(new Error(`Could not read ${file.name}`));
    fr.readAsText(file);
  });
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result ?? ""));
    fr.onerror = () => reject(new Error(`Could not read ${file.name}`));
    fr.readAsDataURL(file);
  });
}

/** Crude RTF cleanup: drop control words, keep the readable text. */
function stripRtf(src: string): string {
  return src
    .replace(/\\'([0-9a-f]{2})/gi, (_m, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\par[d]?/g, "\n\n")
    .replace(/\\line/g, "\n")
    .replace(/\\tab/g, "\t")
    .replace(/\{\\\*[^{}]*\}/g, "")
    .replace(/\\[a-z]+-?\d* ?/gi, "")
    .replace(/[{}]/g, "");
}

/** HTML → readable text, keeping paragraph and list breaks. */
function stripHtml(src: string): string {
  const doc = new DOMParser().parseFromString(src, "text/html");
  doc.querySelectorAll("script,style,noscript,head").forEach((n) => n.remove());
  doc.querySelectorAll("br").forEach((n) => n.replaceWith("\n"));
  doc.querySelectorAll("p,div,section,article,h1,h2,h3,h4,h5,h6,li,tr,blockquote,pre").forEach((n) => {
    n.append("\n\n");
  });
  return (doc.body.textContent ?? "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Light formatting so prose reads well and code keeps its shape. */
function typeset(text: string): string {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  let inCode = false;

  const looksLikeCode = (l: string) =>
    /^\s*(import |export |const |let |var |function |class |def |return |if \(|for \(|while \(|#include|package |public |private )/.test(l) ||
    /[{};]\s*$/.test(l);

  for (const raw of lines) {
    const line = esc(raw);
    const isFence = /^\s*(```|~~~)/.test(raw);
    if (isFence) {
      out.push(inCode ? "</pre></code></div>" : '<div class="code"><pre><code>');
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      out.push(line);
      continue;
    }
    if (!raw.trim()) {
      out.push("");
      continue;
    }
    const h = raw.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const lvl = Math.min(h[1].length + 1, 6);
      out.push(`<h${lvl}>${esc(h[2])}</h${lvl}>`);
      continue;
    }
    if (/^\s*[-*+]\s+/.test(raw)) {
      out.push(`<li>${esc(raw.replace(/^\s*[-*+]\s+/, ""))}</li>`);
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(raw)) {
      out.push(`<li>${esc(raw.replace(/^\s*\d+[.)]\s+/, ""))}</li>`);
      continue;
    }
    if (raw.startsWith(">")) {
      out.push(`<blockquote>${esc(raw.replace(/^\s*>\s?/, ""))}</blockquote>`);
      continue;
    }
    if (looksLikeCode(raw) && /[;{}=]|\(\)/.test(raw)) {
      out.push(`<div class="code"><pre><code>${line}</code></pre></div>`);
      continue;
    }
    out.push(`<p>${line}</p>`);
  }
  if (inCode) out.push("</code></pre></div>");
  return out.join("\n");
}

/**
 * Typeset text into a paginated print document and open the print dialog.
 * Long documents flow across pages; the footer repeats on every page.
 */
export function printTextPdf(opts: { title: string; body: string; source: string; note?: string }): boolean {
  if (typeof window === "undefined") return false;

  const doc = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>${esc(opts.title)}</title>
<style>
  @page { size: A4; margin: 20mm 16mm 18mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #111; }
  body {
    font: 11.5pt/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  header.doc { border-bottom: 1.5px solid #e3e3e3; padding-bottom: 10px; margin-bottom: 22px; }
  header.doc h1 { font-size: 21pt; line-height: 1.25; margin: 0 0 6px; letter-spacing: -0.01em; }
  header.doc p { margin: 0; font-size: 9.5pt; color: #777; }
  h1,h2,h3,h4,h5,h6 { line-height: 1.3; margin: 20px 0 8px; letter-spacing: -0.01em; }
  h2 { font-size: 15pt; } h3 { font-size: 13pt; } h4,h5,h6 { font-size: 11.5pt; }
  p { margin: 0 0 10px; }
  ul { margin: 0 0 10px; padding-left: 0; list-style: none; }
  li { margin: 0 0 5px; padding-left: 16px; position: relative; }
  li::before { content: "•"; position: absolute; left: 4px; color: #999; }
  blockquote {
    margin: 0 0 10px; padding: 6px 0 6px 12px;
    border-left: 3px solid #ddd; color: #444; font-style: italic;
  }
  .code {
    background: #f6f7f9; border: 1px solid #e6e8eb; border-radius: 6px;
    padding: 9px 11px; margin: 0 0 11px; overflow: hidden;
  }
  pre { margin: 0; white-space: pre-wrap; word-break: break-word; }
  code { font: 9.5pt/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  /* position:fixed repeats on every printed page in Chromium/WebKit.
     Negative bottom pulls the rule down into the @page bottom margin. */
  footer.doc {
    position: fixed; bottom: -9mm; left: 0; right: 0;
    padding-top: 2mm; border-top: 1px solid #eee;
    font-size: 8pt; color: #999;
    display: flex; justify-content: space-between; gap: 12px;
  }
  .note { margin-top: 26px; padding-top: 12px; border-top: 1px solid #eee; font-size: 9pt; color: #888; }
</style></head>
<body>
  <header class="doc">
    <h1>${esc(opts.title)}</h1>
    <p>Converted from ${esc(opts.source)} · ${esc(new Date().toLocaleString())} · Next AI</p>
  </header>
  ${opts.body}
  ${opts.note ? `<p class="note">${esc(opts.note)}</p>` : ""}
  <footer class="doc">
    <span>${esc(opts.title)}</span>
    <span>${esc(opts.source)}</span>
  </footer>
</body></html>`;

  // `noopener` makes window.open() return null per spec, which loses the handle
  // and leaves a blank window that never prints. We fill the window ourselves,
  // so sever the opener reference explicitly instead.
  const win = window.open("", "_blank", "width=900,height=1100");
  if (!win) return false;
  try {
    win.opener = null;
  } catch {
    /* some engines make this read-only */
  }
  win.document.open();
  win.document.write(doc);
  win.document.close();

  // Wait for load rather than a fixed delay, so nothing is cut off mid-paint.
  const fire = () => {
    try {
      win.focus();
      win.print();
    } catch {
      /* user can print manually */
    }
  };
  if (win.document.readyState === "complete") win.setTimeout(fire, 150);
  else win.addEventListener("load", () => win.setTimeout(fire, 150), { once: true });
  // Safety net in case the load event never arrives.
  win.setTimeout(fire, 1200);
  return true;
}

/** Save bytes straight to disk — used when the source is already a PDF. */
export function downloadPdf(file: File): void {
  void readAsDataUrl(file).then((url) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name.toLowerCase().endsWith(".pdf") ? file.name : `${baseName(file.name)}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  });
}

/** Pull plain text out of a .docx by asking the existing ingestion route. */
async function docxText(file: File): Promise<string> {
  const dataUrl = await readAsDataUrl(file);
  const r = await fetch("/api/files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ files: [{ name: file.name, type: file.type, dataUrl }] }),
  });
  if (!r.ok) throw new Error(`Could not read ${file.name}`);
  const j = (await r.json()) as { files?: Array<{ text?: string; error?: string }> };
  const first = j.files?.[0];
  if (!first?.text) throw new Error(first?.error || `No text found in ${file.name}`);
  return first.text;
}

export interface ConvertResult {
  ok: boolean;
  message: string;
}

/**
 * Convert one picked file to PDF and open the print dialog.
 * Never throws — failures come back as `{ ok: false, message }`.
 */
export async function convertFileToPdf(file: File): Promise<ConvertResult> {
  if (file.size > MAX_BYTES) {
    return { ok: false, message: `${file.name} is larger than 8 MB.` };
  }

  try {
    // Already a PDF — hand it back untouched.
    if (file.type === "application/pdf" || ext(file.name) === ".pdf") {
      downloadPdf(file);
      return { ok: true, message: `Downloaded ${file.name}` };
    }

    // Images — one per page, reusing the image exporter.
    if (file.type.startsWith("image/")) {
      const images = await filesToImages([file]);
      if (!images.length) return { ok: false, message: `Could not read ${file.name} as an image.` };
      const opened = printImagesPdf({ title: baseName(file.name), images });
      return opened
        ? { ok: true, message: `${file.name} ready to save as PDF` }
        : { ok: false, message: "The browser blocked the print window. Allow pop-ups and try again." };
    }

    // DOCX — reuse the server-side extractor, then typeset.
    if (ext(file.name) === ".docx" || file.type.includes("wordprocessingml")) {
      const text = await docxText(file);
      const opened = printTextPdf({
        title: baseName(file.name),
        body: typeset(text),
        source: file.name,
        note: "Converted from DOCX. Basic styling only — original fonts and layout are not preserved.",
      });
      return opened
        ? { ok: true, message: `${file.name} ready to save as PDF` }
        : { ok: false, message: "The browser blocked the print window. Allow pop-ups and try again." };
    }

    // Everything else must be text-ish.
    if (file.type.startsWith("text/") || TEXT_EXT.test(file.name) || !file.type) {
      const raw = await readAsText(file);
      const text = ext(file.name) === ".rtf" ? stripRtf(raw) : /\.(html?|xml)$/i.test(file.name) ? stripHtml(raw) : raw;
      if (!text.trim()) return { ok: false, message: `${file.name} looks empty.` };
      const opened = printTextPdf({ title: baseName(file.name), body: typeset(text), source: file.name });
      return opened
        ? { ok: true, message: `${file.name} ready to save as PDF` }
        : { ok: false, message: "The browser blocked the print window. Allow pop-ups and try again." };
    }

    return {
      ok: false,
      message: `${file.name} (${file.type || "unknown type"}) can't be converted. Try PDF, DOCX, an image, or a text file.`,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : `Could not convert ${file.name}.` };
  }
}

/* --------------------- direct download (no print dialog) ------------------ */

/** Convert the plain-text typeset() understands into PDF sections. */
function toSections(text: string): TextSection[] {
  const lines = text.split(/\r?\n/);
  const sections: TextSection[] = [];
  let para: string[] = [];
  let inCode = false;
  let code: string[] = [];

  const flushPara = () => {
    if (para.length) {
      sections.push({ paragraphs: para });
      para = [];
    }
  };
  const flushCode = () => {
    if (code.length) {
      sections.push({ paragraphs: [], code: code.join(" ") });
      code = [];
    }
  };

  for (const raw of lines) {
    if (/^\s*(```|~~~)/.test(raw)) {
      if (inCode) flushCode();
      else flushPara();
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      // One line per section keeps it inside the page width.
      if (raw.trim()) {
        flushCode();
        code.push(raw);
      }
      continue;
    }
    if (!raw.trim()) {
      flushPara();
      continue;
    }
    const h = raw.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushPara();
      sections.push({ heading: h[2], paragraphs: [] });
      continue;
    }
    if (/^\s*[-*+]\s+/.test(raw) || /^\s*\d+[.)]\s+/.test(raw)) {
      flushPara();
      sections.push({ paragraphs: [`\u2022 ${raw.replace(/^\s*([-*+]|\d+[.)])\s+/, "")}`] });
      continue;
    }
    if (raw.startsWith(">")) {
      flushPara();
      sections.push({ paragraphs: [raw.replace(/^\s*>\s?/, "")] });
      continue;
    }
    if (/^\s*(import |export |const |let |var |function |class |def |return |if \(|for \(|#include|public |private )/.test(raw)) {
      flushPara();
      flushCode();
      sections.push({ paragraphs: [], code: raw });
      continue;
    }
    para.push(raw);
  }
  flushPara();
  flushCode();
  return sections;
}

export interface PdfBlobResult {
  ok: boolean;
  blob?: Blob;
  filename?: string;
  message: string;
}

/**
 * Build a real .pdf file for direct download, bypassing the print dialog.
 *
 * This is the path that works on phones: iOS buries "Save as PDF" inside the
 * share sheet, whereas an <a download> saves straight to Files.
 */
export async function convertFileToPdfBlob(file: File): Promise<PdfBlobResult> {
  if (file.size > MAX_BYTES) {
    return { ok: false, message: `${file.name} is larger than 8 MB.` };
  }
  const base = baseName(file.name);

  try {
    // Already a PDF: hand back the original bytes untouched.
    if (file.type === "application/pdf" || ext(file.name) === ".pdf") {
      return {
        ok: true,
        blob: new Blob([new Uint8Array(await file.arrayBuffer())], { type: "application/pdf" }),
        filename: `${base}.pdf`,
        message: `Downloaded ${base}.pdf`,
      };
    }

    if (file.type.startsWith("image/")) {
      const prepped = await prepareImageForPdf(file);
      if (!prepped) return { ok: false, message: `Could not read ${file.name} as an image.` };
      const blob = buildImagePdf(
        [{ dataUrl: prepped.url, width: prepped.width, height: prepped.height }],
        { title: base, coverPage: false }
      );
      if (!blob) return { ok: false, message: "Couldn't build a PDF from that image." };
      return { ok: true, blob, filename: `${base}.pdf`, message: `Downloaded ${base}.pdf` };
    }

    if (ext(file.name) === ".docx" || file.type.includes("wordprocessingml")) {
      const text = await docxText(file);
      const blob = buildTextPdf({
        title: base,
        subtitle: `Converted from DOCX \u00b7 ${new Date().toLocaleString()}`,
        sections: toSections(text),
      });
      return { ok: true, blob, filename: `${base}.pdf`, message: `Downloaded ${base}.pdf` };
    }

    if (file.type.startsWith("text/") || TEXT_EXT.test(file.name) || !file.type) {
      const raw = await readAsText(file);
      const text = ext(file.name) === ".rtf" ? stripRtf(raw) : /\.(html?|xml)$/i.test(file.name) ? stripHtml(raw) : raw;
      if (!text.trim()) return { ok: false, message: `${file.name} looks empty.` };
      const blob = buildTextPdf({
        title: base,
        subtitle: `Converted from ${file.name} \u00b7 ${new Date().toLocaleString()}`,
        sections: toSections(text),
      });
      return { ok: true, blob, filename: `${base}.pdf`, message: `Downloaded ${base}.pdf` };
    }

    return {
      ok: false,
      message: `${file.name} (${file.type || "unknown type"}) can't be converted. Try PDF, DOCX, an image, or a text file.`,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : `Could not convert ${file.name}.` };
  }
}