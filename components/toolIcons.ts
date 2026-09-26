"use client";

import type { ComponentType } from "react";
import { FileIcon, ImageIcon, PdfIcon, SearchIcon, TemplateIcon, WrenchIcon } from "./Icons";
import type { ToolId } from "@/lib/toolMeta";

/**
 * Icons for the tools, keyed by id.
 *
 * Separate from the metadata in lib/tools.ts because that table is imported by a
 * server component, and an icon is a client reference. The pairing lives here so
 * both the Tools panel and the standalone pages use the same icon for a tool,
 * and neither has to import the other.
 */
export const TOOL_ICONS: Record<ToolId, ComponentType<{ size?: number }>> = {
  pdf: PdfIcon,
  image: ImageIcon,
  colour: TemplateIcon,
  qr: WrenchIcon,
  url: SearchIcon,
  data: FileIcon,
  make: SearchIcon,
};
