"use client";

/**
 * Ask a provider who it is and what it serves.
 *
 * One request does both jobs, because they are the same network call: GET /models
 * is the cheapest thing an OpenAI-compatible server exposes, so it doubles as
 * the reachability check and as the source for a dynamic model list.
 *
 * Shared by the Settings screen and the chat's provider picker so there is one
 * implementation. Two copies would drift, and the symptom would be a model list
 * that appears in one place and not the other -- which is exactly the bug this
 * was extracted to prevent.
 *
 * The key travels in the x-api-key header like every other route, never in a
 * query string, so it cannot end up in a log line or a referrer header.
 */

export interface ProbeResult {
  ok: boolean;
  error?: string;
  status?: number;
  /** How many models are being offered, after any free-only filter. */
  count?: number;
  /** How many the provider has in total, before filtering. */
  total?: number;
  /** True when the provider reported prices and the list was filtered to free. */
  freeOnly?: boolean;
  models?: string[];
}

export async function fetchProviderModels(apiKey: string, baseUrl: string): Promise<ProbeResult> {
  try {
    const r = await fetch("/api/test-provider", {
      headers: {
        "x-api-key": apiKey.trim(),
        "x-base-url": baseUrl.trim(),
      },
    });
    if (!r.ok) return { ok: false, error: `The test endpoint returned ${r.status}.` };
    return (await r.json()) as ProbeResult;
  } catch {
    return { ok: false, error: "Could not reach this site to run the test." };
  }
}
