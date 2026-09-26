/**
 * Tool page metadata, deliberately free of React.
 *
 * Named toolMeta rather than tools on purpose: lib/tools.ts already exists and
 * holds the model's built-in tool implementations (TOOL_DEFS, runTool), which
 * the chat and research API routes import. Overwriting that with page metadata
 * breaks both routes, and the collision is easy to miss because "tools" is
 * exactly what you would reach for first.
 *
 * This table is imported by app/tools/[tab]/page.tsx, which is a server
 * component. It cannot live in components/ToolsPage.tsx, because that file is
 * "use client" and a server component cannot read a plain value out of one: it
 * receives a client reference proxy instead, and the build dies with
 * "TABS.map is not a function" while collecting page data.
 *
 * Icons therefore live on the client side in components/toolIcons.ts, keyed by
 * id. Keeping ids, labels and descriptions here is what lets the route generate
 * static params, build metadata and render a 404 with no client code in the
 * server graph.
 */

export type ToolId = "pdf" | "image" | "colour" | "qr" | "url" | "data" | "make";

export interface ToolMeta {
  id: ToolId;
  /** Short name: nav label, and the suffix on the page title. */
  label: string;
  /** One honest sentence. Also the meta description. */
  blurb: string;
}

export const TOOL_META: ToolMeta[] = [
  { id: "pdf", label: "PDF", blurb: "Images to PDF, PDF to images, and any document to PDF." },
  { id: "image", label: "Image", blurb: "Edit an image, or download one straight from a URL." },
  { id: "colour", label: "Colours", blurb: "Convert colours, check WCAG contrast, and build tint and shade scales." },
  { id: "qr", label: "QR codes", blurb: "Real QR codes with error correction, exported as PNG or SVG." },
  { id: "url", label: "URL tools", blurb: "Break a URL into its parts, and build one from fields." },
  { id: "data", label: "Data", blurb: "Encode, decode and format structured data." },
  { id: "make", label: "Generate", blurb: "Generate an image from a prompt." },
];

export function findToolMeta(id: string): ToolMeta | undefined {
  return TOOL_META.find((t) => t.id === id);
}
