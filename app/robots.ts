import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * robots.txt.
 *
 * The API routes are disallowed because they are not content, they cost money
 * to serve, and indexing them invites junk traffic. `/chat` is allowed: it is a
 * real destination, and blocking it would deindex the app itself.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/chat", "/help", "/privacy", "/terms", "/contact"],
        disallow: ["/api/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
