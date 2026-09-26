import type { MetadataRoute } from "next";
import { INDEXABLE_ROUTES, SITE_URL } from "@/lib/site";

/**
 * Sitemap, generated from the single route table in lib/site.ts.
 *
 * `alternates.canonical` on each page points at the same origin, so the sitemap
 * and the canonical tags cannot disagree. Only genuinely public pages are
 * listed: the chat view is included because it is reachable and indexable as a
 * landing surface, but it is never a useful search result beyond its own name.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return INDEXABLE_ROUTES.map((r) => ({
    url: `${SITE_URL}${r.path === "/" ? "" : r.path}`,
    lastModified,
    changeFrequency: r.changefreq,
    priority: r.priority,
  }));
}
