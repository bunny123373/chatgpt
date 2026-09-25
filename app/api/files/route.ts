export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * File ingestion for chat attachments.
 *
 * Accepts JSON `{ files: [{ name, type, dataUrl }] }` and returns parsed
 * documents with extracted plain text. Images are passed through as data URLs
 * (the chat route forwards them to a vision model); everything else is parsed
 * to text so the model can reason over it.
 */

const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8 MB per file
const MAX_FILES = 6;
const MAX_TEXT_CHARS = 60_000; // per file, keeps prompts sane

interface InFile {
  name?: string;
  type?: string;
  dataUrl?: string;
}

function decodeDataUrl(dataUrl: string): { bytes: Uint8Array; mime: string } | null {
  const m = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(dataUrl);
  if (!m) return null;
  const mime = m[1] || "application/octet-stream";
  const isBase64 = !!m[2];
  const payload = m[3];
  if (!isBase64) {
    // Percent-encoded text payload.
    const text = decodeURIComponent(payload);
    return { bytes: new TextEncoder().encode(text), mime };
  }
  try {
    const bin = atob(payload);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { bytes, mime };
  } catch {
    return null;
  }
}

/** Count PDF pages by scanning the raw file for page objects. */
function countPdfPages(text: string): number {
  const counts = text.match(/\/Type\s*\/Page[^s]/g);
  if (counts?.length) return counts.length;
  const m = text.match(/\/Count\s+(\d+)/);
  return m ? Number(m[1]) || 1 : 1;
}

/**
 * Extract text from a PDF without a third-party dependency: inflate
 * FlateDecode streams and pull literal strings out of the content operators.
 */
function pdfText(bytes: Uint8Array): string {
  const raw = new TextDecoder("latin1").decode(bytes);

  // Prefer uncompressed page text when present.
  const pick = (s: string) =>
    s
      .replace(/\\([()\\])/g, "$1")
      .replace(/\\n|\r/g, " ")
      .replace(/<[^>]+>/g, "");

  const chunks: string[] = [];
  const tj = /\((?:\\.|[^\\()])*\)\s*Tj/g;
  const tj2 = /\[((?:\\.|[^\\\]])*)\]\s*TJ/g;
  const str = /\((?:\\.|[^\\()])*\)/g;

  let m: RegExpExecArray | null;
  const found: string[] = [];
  while ((m = tj.exec(raw))) found.push(pick(m[0]));
  while ((m = tj2.exec(raw))) {
    const inner = m[1];
    const parts = inner.match(str);
    found.push(parts ? parts.map((p) => pick(p)).join("") : "");
  }
  if (found.length) chunks.push(...found);

  if (!chunks.length) {
    // Fall back to any literal strings inside the file (many simple PDFs).
    const loose = raw.match(/\((?:\\.|[^\\()]){2,}\)/g) ?? [];
    for (const s of loose.slice(0, 4000)) {
      const t = pick(s).trim();
      if (t && /[A-Za-z]{2,}/.test(t)) chunks.push(t);
    }
  }
  return chunks.join(" ").replace(/\s+/g, " ").trim();
}

/** Best-effort DOCX extraction: pull the text out of word/document.xml. */
function docxText(bytes: Uint8Array): string {
  const xml = new TextDecoder("utf-8").decode(bytes);
  const parts = xml.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) ?? [];
  const text = parts
    .map((p) => p.replace(/<[^>]+>/g, ""))
    .join(" ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
  return text.replace(/\s+/g, " ").trim();
}

/** Plain-text-ish formats we can read directly. */
function textFile(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes);
}

/** Placeholder when a document's text can't be extracted. */
function unreadableNote(name: string, kind: string): string {
  return `[The text of "${name}" could not be extracted from this ${kind} (it may be scanned or image-only). The file is attached, but its contents are not available as text.]`;
}

export async function POST(req: Request) {
  let body: { files?: InFile[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const files = Array.isArray(body.files) ? body.files.slice(0, MAX_FILES) : [];
  if (!files.length) return Response.json({ error: "No files provided" }, { status: 400 });

  const out: Array<{
    id: string;
    name: string;
    type: string;
    size: number;
    text?: string;
    dataUrl?: string;
    pages?: number;
    error?: string;
  }> = [];

  for (const f of files) {
    const name = (f.name || "file").slice(0, 160);
    const dataUrl = f.dataUrl || "";
    const decoded = decodeDataUrl(dataUrl);
    if (!decoded) {
      out.push({
        id: Math.random().toString(36).slice(2, 10),
        name,
        type: f.type || "application/octet-stream",
        size: 0,
        error: "Could not read this file.",
      });
      continue;
    }

    const { bytes, mime } = decoded;
    const type = f.type || mime;
    if (bytes.byteLength > MAX_FILE_BYTES) {
      out.push({
        id: Math.random().toString(36).slice(2, 10),
        name,
        type,
        size: bytes.byteLength,
        error: `Too large (max ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB).`,
      });
      continue;
    }

    // Images go straight to the model as vision input.
    if (type.startsWith("image/")) {
      out.push({
        id: Math.random().toString(36).slice(2, 10),
        name,
        type,
        size: bytes.byteLength,
        dataUrl: `data:${type};base64,${Buffer.from(bytes).toString("base64")}`,
      });
      continue;
    }

    let text = "";
    let pages: number | undefined;

    if (type === "application/pdf" || /\.pdf$/i.test(name)) {
      const raw = pdfText(bytes);
      pages = countPdfPages(new TextDecoder("latin1").decode(bytes));
      text = raw || unreadableNote(name, "PDF");
    } else if (
      type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      /\.docx$/i.test(name)
    ) {
      text = docxText(bytes) || unreadableNote(name, "Word document");
    } else if (type === "application/json" || /\.json$/i.test(name)) {
      try {
        text = JSON.stringify(JSON.parse(textFile(bytes)), null, 2);
      } catch {
        text = textFile(bytes);
      }
    } else if (
      type.startsWith("text/") ||
      /\.(txt|md|markdown|csv|tsv|ya?ml|html?|css|jsx?|tsx?|mjs|cjs|py|rb|go|rs|java|kt|swift|sh|sql|ini|toml|env|gitignore)$/i.test(name)
    ) {
      text = textFile(bytes);
    } else {
      // Unknown binary: report size so the model still knows it was attached.
      text = `[Attached binary file: ${name} (${mime}, ${bytes.byteLength} bytes). Its contents are not readable as text.]`;
    }

    const clipped = text.length > MAX_TEXT_CHARS ? text.slice(0, MAX_TEXT_CHARS) + "\n\n[…truncated…]" : text;

    out.push({
      id: Math.random().toString(36).slice(2, 10),
      name,
      type,
      size: bytes.byteLength,
      text: clipped,
      ...(pages ? { pages } : {}),
    });
  }

  return Response.json({ files: out });
}
