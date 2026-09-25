"use client";

/**
 * A minimal, dependency-free PDF writer.
 *
 * The print-window approach is awkward on phones — iOS in particular buries
 * "Save as PDF" behind the share sheet — so this builds a real PDF byte stream
 * and hands it to the browser as an ordinary download. Behaviour is identical
 * on mobile and desktop, and there is no library to load.
 *
 * Scope matches what these tools need:
 *   - JPEG pages embedded verbatim with /DCTDecode, so no re-encoding
 *   - Text drawn with the base-14 fonts (Helvetica, Helvetica-Bold, Courier),
 *     which every PDF reader already has, so nothing has to be embedded
 *
 * Geometry is in PostScript points (1/72 inch). A4 is 595.28 x 841.89.
 */

const A4: [number, number] = [595.28, 841.89];
const LETTER: [number, number] = [612, 792];

export type PageSizeName = "A4" | "Letter";
export type PageOrientation = "portrait" | "landscape";

export function pageDims(size: PageSizeName, orientation: PageOrientation): { w: number; h: number } {
  const [w, h] = size === "Letter" ? LETTER : A4;
  return orientation === "landscape" ? { w: h, h: w } : { w, h };
}

/** Latin-1 means one char is one byte, so recorded offsets stay accurate. */
function latin1(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

export function dataUrlToBytes(url: string): Uint8Array {
  const b64 = url.slice(url.indexOf(",") + 1);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Escape a string for use inside a PDF literal string. */
function pdfText(s: string): string {
  // WinAnsi cannot encode arbitrary Unicode, so fold what it cannot represent.
  const folded = s
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2014/g, "-")
    .replace(/\u2013/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    .replace(/[^\u0020-\u007E\u00A0-\u00FF]/g, "?");
  return folded.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/** Either a plain dictionary object, or a dictionary plus raw stream bytes. */
type Body = string | { dict: string; bytes: Uint8Array };
class PdfDoc {
  private bodies: Body[] = [];

  /** Number the next object will get. */
  get next(): number {
    return this.bodies.length + 1;
  }

  dict(body: string): number {
    this.bodies.push(body);
    return this.bodies.length;
  }

  /** A stream object: dictionary entries plus the raw bytes. */
  stream(dictEntries: string, bytes: Uint8Array): number {
    this.bodies.push({ dict: dictEntries, bytes });
    return this.bodies.length;
  }

  toBlob(): Blob {
    const chunks: Uint8Array[] = [];
    const offsets: number[] = [];
    let len = 0;
    const push = (data: string | Uint8Array) => {
      const bytes = typeof data === "string" ? latin1(data) : data;
      chunks.push(bytes);
      len += bytes.length;
    };

    // The binary comment tells tools the file is not plain text.
    push("%PDF-1.4\n");
    push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

    this.bodies.forEach((body, i) => {
      offsets.push(len);
      push(`${i + 1} 0 obj\n`);
      if (typeof body === "string") {
        push(body);
      } else {
        push(`<< ${body.dict} /Length ${body.bytes.length} >>\nstream\n`);
        push(body.bytes);
        push("\nendstream");
      }
      push("\nendobj\n");
    });

    const xrefAt = len;
    const n = this.bodies.length;
    let xref = `xref\n0 ${n + 1}\n0000000000 65535 f \n`;
    for (const off of offsets) xref += `${String(off).padStart(10, "0")} 00000 n \n`;
    xref += `trailer\n<< /Size ${n + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
    push(xref);

    return new Blob(chunks as BlobPart[], { type: "application/pdf" });
  }
}

const F1 = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
const F2 = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
const F3 = "<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>";

/* ------------------------------ image pages ------------------------------ */

export interface PdfImagePage {
  /** A JPEG data URL. Non-JPEG sources are skipped. */
  dataUrl: string;
  /** Intrinsic pixel size, needed for /Width and /Height. */
  width: number;
  height: number;
  caption?: string;
}

export interface ImagePdfOptions {
  title?: string;
  pageSize?: PageSizeName;
  orientation?: PageOrientation;
  /** Margin in millimetres. */
  margin?: number;
  /** contain = whole image visible; cover = fills and crops. */
  fit?: "contain" | "cover";
  coverPage?: boolean;
  showCaptions?: boolean;
}

const CHAR_W = 0.5;

export function buildImagePdf(pages: PdfImagePage[], opts: ImagePdfOptions = {}): Blob | null {
  const usable = pages.filter((p) => p.dataUrl.startsWith("data:image/jpeg") && p.width > 0 && p.height > 0);
  if (!usable.length) return null;

  const { w: pageW, h: pageH } = pageDims(opts.pageSize ?? "A4", opts.orientation ?? "portrait");
  const margin = ((opts.margin ?? 12) * 72) / 25.4;
  const innerW = pageW - margin * 2;
  const innerH = pageH - margin * 2;
  const fit = opts.fit ?? "contain";
  const showCaptions = opts.showCaptions ?? false;
  const captionH = showCaptions ? 18 : 0;
  const wantCover = Boolean(opts.coverPage && opts.title);

  const doc = new PdfDoc();
  // 1 = Catalog, 2 = Pages, 3 = font, then page/content/image triples.
  const PAGES = 2;
  const FONT = 3;
  let next = 4;

  // Reserve object numbers up front so /Kids can reference them. The cover
  // needs two (page + content stream), each image page needs three.
  const coverRef = wantCover ? next++ : 0;
  const coverContentRef = wantCover ? next++ : 0;
  const pageRefs: number[] = [];
  const triples: { page: number; content: number; image: number; src: PdfImagePage }[] = [];
  for (let i = 0; i < usable.length; i++) {
    const page = next++;
    const content = next++;
    const image = next++;
    pageRefs.push(page);
    triples.push({ page, content, image, src: usable[i] });
  }

  const kids = [...(wantCover ? [coverRef] : []), ...pageRefs];

  doc.dict(`<< /Type /Catalog /Pages ${PAGES} 0 R >>`); // 1
  doc.dict(`<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`); // 2
  doc.dict(F1); // 3

  if (wantCover) {
    doc.dict(
      `<< /Type /Page /Parent ${PAGES} 0 R /MediaBox [0 0 ${pageW.toFixed(2)} ${pageH.toFixed(2)}] ` +
        `/Resources << /Font << /F1 ${FONT} 0 R >> >> /Contents ${coverContentRef} 0 R >>`
    );
    const cover =
      `BT /F1 26 Tf ${margin.toFixed(2)} ${(pageH / 2).toFixed(2)} Td (${pdfText(opts.title!)}) Tj ET\n` +
      `BT /F1 10 Tf ${margin.toFixed(2)} ${(pageH / 2 - 22).toFixed(2)} Td (${pdfText(
        `${usable.length} image${usable.length === 1 ? "" : "s"}`
      )}) Tj ET\n`;
    doc.stream("", latin1(cover));
  }

  for (const t of triples) {
    const { page, content, image, src } = t;
    doc.dict(
      `<< /Type /Page /Parent ${PAGES} 0 R /MediaBox [0 0 ${pageW.toFixed(2)} ${pageH.toFixed(2)}] ` +
        `/Resources << /XObject << /Im0 ${image} 0 R >> /Font << /F1 ${FONT} 0 R >> >> /Contents ${content} 0 R >>`
    );

    const availH = innerH - captionH;
    const scale =
      fit === "cover"
        ? Math.max(innerW / src.width, availH / src.height)
        : Math.min(innerW / src.width, availH / src.height);
    const dw = src.width * scale;
    const dh = src.height * scale;
    const dx = (pageW - dw) / 2;
    const dy = captionH + (availH - dh) / 2 + margin;

    let ops = `q\n${dw.toFixed(2)} 0 0 ${dh.toFixed(2)} ${dx.toFixed(2)} ${dy.toFixed(2)} cm\n/Im0 Do\nQ\n`;
    if (showCaptions && src.caption) {
      const fs = 9;
      const w = src.caption.length * fs * CHAR_W;
      const x = Math.max(margin, (pageW - w) / 2);
      ops += `BT /F1 ${fs} Tf ${x.toFixed(2)} ${(margin + 3).toFixed(2)} Td (${pdfText(src.caption)}) Tj ET\n`;
    }
    doc.stream("", latin1(ops));

    // The JPEG is embedded byte-for-byte; /DCTDecode means no re-encoding.
    const bytes = dataUrlToBytes(src.dataUrl);
    doc.stream(
      `/Type /XObject /Subtype /Image /Width ${Math.round(src.width)} /Height ${Math.round(src.height)} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`,
      bytes
    );
  }

  doc.dict(`<< /Title (${pdfText(opts.title ?? "Images")}) /Producer (Next AI) /Creator (Next AI) >>`);
  return doc.toBlob();
}

/* ------------------------------- text pages ------------------------------ */

export interface TextSection {
  heading?: string;
  paragraphs: string[];
  code?: string;
}

export interface TextPdfOptions {
  title: string;
  subtitle?: string;
  sections: TextSection[];
  pageSize?: PageSizeName;
  orientation?: PageOrientation;
  margin?: number;
}

const FONT_SIZE = 10.5;
const LINE_H = 14.5;

/** Helvetica averages ~0.5em per character, which is close enough to wrap on. */
function wrap(text: string, fontSize: number, maxWidth: number): string[] {
  const perLine = Math.max(8, Math.floor(maxWidth / (fontSize * CHAR_W)));
  const out: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    if (!para) {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of para.split(/\s+/)) {
      if (word.length > perLine) {
        if (line) out.push(line);
        let rest = word;
        while (rest.length > perLine) {
          out.push(rest.slice(0, perLine));
          rest = rest.slice(perLine);
        }
        line = rest;
        continue;
      }
      if (line.length + word.length + 1 <= perLine) line = line ? `${line} ${word}` : word;
      else {
        out.push(line);
        line = word;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

export function buildTextPdf(opts: TextPdfOptions): Blob {
  const { w: pageW, h: pageH } = pageDims(opts.pageSize ?? "A4", opts.orientation ?? "portrait");
  const margin = ((opts.margin ?? 18) * 72) / 25.4;
  const innerW = pageW - margin * 2;

  // Lay the document out first; only then emit content streams, whose byte
  // lengths must be known before they can be written.
  const pagesOut: string[][] = [];
  let ops: string[] = [];
  let y = pageH - margin;

  const newPage = () => {
    if (ops.length) pagesOut.push(ops);
    ops = [];
    y = pageH - margin;
  };
  const need = (h: number) => {
    if (y - h < margin + 22) newPage();
  };

  y -= 24;
  ops.push(`BT /F2 23 Tf ${margin.toFixed(2)} ${y.toFixed(2)} Td (${pdfText(opts.title)}) Tj ET`);
  if (opts.subtitle) {
    y -= 15;
    ops.push(`BT /F1 9.5 Tf ${margin.toFixed(2)} ${y.toFixed(2)} Td (${pdfText(opts.subtitle)}) Tj ET`);
  }
  y -= 10;
  ops.push(`0.75 w 0.72 0.72 0.72 RG ${margin.toFixed(2)} ${y.toFixed(2)} m ${(pageW - margin).toFixed(2)} ${y.toFixed(2)} l S`);

  for (const sec of opts.sections) {
    if (sec.heading) {
      need(34);
      y -= 19;
      ops.push(`BT /F2 13.5 Tf ${margin.toFixed(2)} ${y.toFixed(2)} Td (${pdfText(sec.heading)}) Tj ET`);
      y -= 3;
    }
    for (const para of sec.paragraphs) {
      for (const line of wrap(para, FONT_SIZE, innerW)) {
        if (!line) {
          y -= LINE_H * 0.55;
          continue;
        }
        need(LINE_H);
        y -= LINE_H;
        ops.push(`BT /F1 ${FONT_SIZE} Tf ${margin.toFixed(2)} ${y.toFixed(2)} Td (${pdfText(line)}) Tj ET`);
      }
      y -= 4;
    }
    if (sec.code) {
      need(LINE_H);
      y -= LINE_H;
      ops.push(`BT /F3 ${FONT_SIZE - 1} Tf ${margin.toFixed(2)} ${y.toFixed(2)} Td (${pdfText(sec.code)}) Tj ET`);
      y -= 8;
    }
  }
  if (ops.length) pagesOut.push(ops);

  const doc = new PdfDoc();
  const PAGES = 2;
  const FONTS = 3;
  doc.dict(`<< /Type /Catalog /Pages ${PAGES} 0 R >>`);
  const kids = pagesOut.map((_, i) => `${3 + i * 2} 0 R`);
  doc.dict(`<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pagesOut.length} >>`);
  doc.dict(F1);
  doc.dict(F2);
  doc.dict(F3);

  pagesOut.forEach((bodyOps, i) => {
    const pageObj = 3 + i * 2;
    const contentObj = 4 + i * 2;
    const foot = `BT /F1 8 Tf ${margin.toFixed(2)} ${(margin - 15).toFixed(2)} Td (${pdfText(opts.title)}) Tj ET`;
    const body = bodyOps.join("\n") + "\n" + foot + "\n";
    doc.dict(
      `<< /Type /Page /Parent ${PAGES} 0 R /MediaBox [0 0 ${pageW.toFixed(2)} ${pageH.toFixed(2)}] ` +
        `/Resources << /Font << /F1 ${FONTS} 0 R /F2 ${FONTS + 1} 0 R /F3 ${FONTS + 2} 0 R >> >> ` +
        `/Contents ${contentObj} 0 R >>`
    );
    doc.stream("", latin1(body));
    void pageObj;
  });

  doc.dict(`<< /Title (${pdfText(opts.title)}) /Producer (Next AI) /Creator (Next AI) >>`);
  return doc.toBlob();
}

/* -------------------------------- download ------------------------------- */

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on a delay so the download has definitely started.
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function pdfFilename(name: string): string {
  const base = name.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]+/g, "-").trim() || "document";
  return `${base.slice(0, 80)}.pdf`;
}
