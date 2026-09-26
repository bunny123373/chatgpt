/**
 * The tool registry.
 *
 * One entry per individual tool, not per tab. The old Tools panel grouped seven
 * categories, so reaching "PDF to images" meant landing on "images to PDF" and
 * clicking a second control. Each of these is a real job with its own URL, its
 * own title and its own entry in the sitemap.
 *
 * Granularity is deliberately uneven. Where a tool does genuinely different jobs
 * behind a mode toggle, each job gets its own page, because they share almost no
 * UI. Where a tool is one workflow presented as sections, it stays one page:
 * splitting "URL parser" from "URL builder" would give a page whose other half
 * is a stub, which is worse than one page with both halves.
 *
 *   split:    PDF (3 jobs), Image (2 jobs), Generate (2 jobs)
 *   kept whole: colour, qr, url, data
 *
 * React-free on purpose. This file is imported by app/tools/[tab]/page.tsx,
 * which is a server component, and a server component cannot read a plain value
 * out of a "use client" module: it gets a client reference proxy, and the build
 * dies collecting page data. Icons live client-side in components/toolIcons.ts.
 *
 * Named toolMeta rather than tools because lib/tools.ts already exists and holds
 * the model's built-in tool implementations, which /api/chat and /api/research
 * import.
 */

export type ToolId =
  | "images-to-pdf"
  | "file-to-pdf"
  | "pdf-to-images"
  | "image-editor"
  | "image-downloader"
  | "colour"
  | "qr"
  | "url"
  | "data"
  | "write-document"
  | "create-image";

/** Which component renders it, and which mode that component opens in. */
export type ToolBody = "pdf" | "image" | "colour" | "qr" | "url" | "data" | "generate";

export interface ToolMeta {
  id: ToolId;
  /** Page title and nav label. */
  label: string;
  /** One honest sentence. Also the meta description. */
  blurb: string;
  group: string;
  body: ToolBody;
  /** Mode passed to the component so the page opens on the right job. */
  variant?: string;
}

export const TOOL_META: ToolMeta[] = [
  {
    id: "images-to-pdf",
    label: "Images to PDF",
    blurb: "Combine images into one PDF, with reordering, rotation, page size, margins and fit mode.",
    group: "PDF",
    body: "pdf",
    variant: "imagesToPdf",
  },
  {
    id: "file-to-pdf",
    label: "File to PDF",
    blurb: "Turn a text, document or Markdown file into a PDF, straight from your browser.",
    group: "PDF",
    body: "pdf",
    variant: "toPdf",
  },
  {
    id: "pdf-to-images",
    label: "PDF to images",
    blurb: "Split a PDF into page images, at a resolution you choose.",
    group: "PDF",
    body: "pdf",
    variant: "toImages",
  },
  {
    id: "image-editor",
    label: "Image editor",
    blurb: "Resize, crop, compress, rotate and flip an image. Nothing is uploaded.",
    group: "Image",
    body: "image",
    variant: "edit",
  },
  {
    id: "image-downloader",
    label: "Download from a URL",
    blurb: "Save an image straight from a URL, without opening a new tab.",
    group: "Image",
    body: "image",
    variant: "download",
  },
  { id: "colour", label: "Colours", blurb: "Convert colours, check WCAG contrast, and build tint and shade scales.", group: "Design", body: "colour" },
  { id: "qr", label: "QR codes", blurb: "Real QR codes with error correction, exported as PNG or SVG.", group: "Design", body: "qr" },
  { id: "url", label: "URL tools", blurb: "Break a URL into its parts, and build one from fields.", group: "Design", body: "url" },
  { id: "data", label: "Data", blurb: "Work with CSV, and run analysis code against it.", group: "Data", body: "data" },
  {
    id: "write-document",
    label: "Write a document",
    blurb: "One-shot document generation with no conversation around it.",
    group: "Generate",
    body: "generate",
    variant: "doc",
  },
  {
    id: "create-image",
    label: "Create an image",
    blurb: "Generate an image from a prompt.",
    group: "Generate",
    body: "generate",
    variant: "image",
  },
];

/** Groups in display order, derived so a new tool cannot create a new group silently. */
export const TOOL_GROUPS: string[] = [...new Set(TOOL_META.map((t) => t.group))];

export function findToolMeta(id: string): ToolMeta | undefined {
  return TOOL_META.find((t) => t.id === id);
}
