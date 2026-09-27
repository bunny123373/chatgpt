/**
 * Web search providers.
 *
 * This file is the only place a search provider is described, and it is
 * deliberately free of any endpoint the user can type.
 *
 * That is the whole design decision here. Search needs a key, and a key sent to
 * a URL the client chose is the same bug that was just fixed in /api/chat,
 * where the server's credential was forwarded to a host the user picked. So the
 * endpoint is fixed per provider and the client only ever names which one it
 * wants. There is no field to point search at an arbitrary address, which means
 * there is nothing to validate and nothing to leak.
 *
 * Client-safe: no secrets, safe to import from a "use client" module.
 */

export interface SearchProviderDef {
  id: string;
  label: string;
  /** Shown under the label in Settings. Honest about cost and limits. */
  note: string;
  /** What the key looks like, so the user knows they pasted the right thing. */
  keyHint: string;
  /** Where to get one. */
  signup: string;
  /**
   * Most results we will ever ask for. Providers cap this differently and
   * reject an over-large value outright, so it is clamped per provider in
   * lib/search.ts rather than trusted from the client.
   */
  maxResults: number;
  /** True when every query is billed separately, so batching costs more. */
  billedPerQuery: boolean;
}

export const SEARCH_PROVIDERS: SearchProviderDef[] = [
  {
    id: "tavily",
    label: "Tavily",
    note: "Built for agents. Cheapest of the three, and returns clean text rather than scraped HTML. One credit per query on the free tier.",
    keyHint: "tvly-…",
    signup: "https://app.tavily.com",
    maxResults: 20,
    billedPerQuery: true,
  },
  {
    id: "brave",
    label: "Brave Search",
    note: "Real web index, independent of Google. Has a free tier with a monthly query allowance.",
    keyHint: "BSA…",
    signup: "https://brave.com/search/api/",
    maxResults: 20,
    billedPerQuery: true,
  },
  {
    id: "serper",
    label: "Serper",
    note: "Google results without a Google API key. 2,500 free queries per month, then per-query pricing.",
    keyHint: "a hex string",
    signup: "https://serper.dev",
    maxResults: 100,
    billedPerQuery: true,
  },
];

export function searchProviderDef(id: string): SearchProviderDef | undefined {
  return SEARCH_PROVIDERS.find((p) => p.id === id);
}
