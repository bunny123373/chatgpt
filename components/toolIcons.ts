"use client";

import { FileIcon, ImageIcon, PdfIcon, SearchIcon, TemplateIcon, WrenchIcon } from "./Icons";
import type { ToolId } from "@/lib/toolMeta";

/**
 * Icons for the tools, keyed by the individual tool id.
 *
 * Separate from the metadata in lib/toolMeta.ts because that table is imported
 * by a server component, and a React component cannot cross that boundary.
 * Keeping the pairing here means the rail and the page agree, and neither has to
 * import the other.
 *
 * A total Record rather than a partial map, so a tool added to the registry
 * without an icon here fails to compile instead of rendering a blank.
 */
export const TOOL_ICONS: Record<ToolId, (p: { size?: number }) => React.ReactElement> = {
  "images-to-pdf": PdfIcon,
  "file-to-pdf": PdfIcon,
  "pdf-to-images": PdfIcon,
  "image-editor": ImageIcon,
  "image-downloader": ImageIcon,
  colour: TemplateIcon,
  qr: WrenchIcon,
  url: SearchIcon,
  data: FileIcon,
  "write-document": SearchIcon,
  "create-image": ImageIcon,
};
