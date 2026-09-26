/**
 * Site-wide constants.
 *
 * One place for the canonical origin, the contact channel and the legal dates,
 * so the sitemap, robots, metadata and the four policy pages cannot drift apart.
 */

/**
 * Canonical origin, without a trailing slash.
 *
 * Overridable at build time with NEXT_PUBLIC_SITE_URL, which is what you want in
 * preview deployments: a preview build that hardcodes the production origin will
 * emit canonicals and a sitemap pointing at production, which is exactly the kind
 * of thing that quietly poisons search results.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://chatgpt-ashy-six-93.vercel.app"
).replace(/\/+$/, "");

export const SITE_NAME = "Next AI";

/** Short description. Used for metadata, the sitemap and share cards. */
export const SITE_DESCRIPTION =
  "A fast AI chat client with streaming replies, image understanding, file attachments, web search and a full set of browser-based tools. Your conversations stay in your browser.";

/**
 * Where to report a problem.
 *
 * Deliberately the public issue tracker rather than an invented email address.
 * A support page that lists an address nobody reads is worse than one that
 * points at a channel that is actually monitored.
 *
 * Set CONTACT_EMAIL to add a monitored address; the contact page will show it
 * alongside the tracker. Left empty, it is simply not rendered.
 */
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || "";
export const REPO_URL = "https://github.com/bunny123373/chatgpt";
export const ISSUES_URL = `${REPO_URL}/issues`;

/**
 * When the policies were last revised. Shown on all four pages, because a
 * privacy policy with no date is not something anyone can hold you to.
 */
export const POLICY_REVISED = "26 September 2026";

/** Every indexable route, with the schedule each one wants in the sitemap. */
export const INDEXABLE_ROUTES: { path: string; changefreq: "daily" | "weekly" | "monthly" | "yearly"; priority: number }[] = [
  { path: "/", changefreq: "weekly", priority: 1 },
  { path: "/chat", changefreq: "daily", priority: 0.9 },
  { path: "/help", changefreq: "monthly", priority: 0.6 },
  { path: "/privacy", changefreq: "yearly", priority: 0.4 },
  { path: "/terms", changefreq: "yearly", priority: 0.4 },
  { path: "/contact", changefreq: "yearly", priority: 0.4 },
];
