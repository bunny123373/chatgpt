import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ToolPage from "@/components/ToolPage";
import { TOOL_META, findToolMeta, type ToolId } from "@/lib/toolMeta";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

/**
 * One route per tool: /tools/pdf, /tools/colour, and so on.
 *
 * A dynamic segment rather than seven near-identical page files, so adding a
 * tool means adding an entry to lib/toolMeta.ts and a case in ToolPage, not a
 * new file plus a duplicated shell. `generateStaticParams` prerenders all seven,
 * so these are static pages with real URLs rather than a route resolved per
 * request.
 *
 * Two constraints shape this file, both learned the hard way:
 *
 * 1. The metadata comes from lib/toolMeta.ts, not components/ToolsPage.tsx. That
 *    file is "use client", and a server component reading a plain value out of
 *    one gets a client reference proxy, so `TABS.map` is not a function and the
 *    build dies collecting page data.
 *
 * 2. This page passes only a serialisable object to ToolPage. It does not pass
 *    the tool body: a render prop would be a function, and functions cannot
 *    cross the server-to-client boundary. ToolPage picks the body itself, on
 *    the client, where handing notify to a tool is an ordinary prop.
 */

export function generateStaticParams(): { tab: ToolId }[] {
  return TOOL_META.map((t) => ({ tab: t.id }));
}

/** Anything not in TOOL_META is a 404, not an empty page. */
export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ tab: string }> }): Promise<Metadata> {
  const { tab } = await params;
  const found = findToolMeta(tab);
  if (!found) return { title: `Tool not found — ${SITE_NAME}` };

  const title = `${found.label} — ${SITE_NAME}`;
  const description = found.blurb || SITE_DESCRIPTION;
  return {
    title,
    description,
    alternates: { canonical: `/tools/${found.id}` },
    openGraph: {
      title,
      description,
      url: `/tools/${found.id}`,
      // A utility page, not an article. "website" is the honest type.
      type: "website",
    },
  };
}

export default async function ToolRoute({ params }: { params: Promise<{ tab: string }> }) {
  const { tab } = await params;
  const found = findToolMeta(tab);
  if (!found) notFound();

  return <ToolPage tool={found} />;
}
