import type { NextRequest } from "next/server";

/**
 * Voice list for the picker — proxies xKiro `GET /v1/audio/voices`
 * (public endpoint; the key is forwarded in case the account filters by it).
 */
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const apiKey =
    req.headers.get("x-api-key")?.trim() ||
    process.env.XKIRO_API_KEY?.trim() ||
    process.env.OPENAI_API_KEY?.trim() ||
    "";
  const baseUrl = (
    req.headers.get("x-base-url")?.trim() ||
    process.env.XKIRO_BASE_URL?.trim() ||
    process.env.OPENAI_BASE_URL?.trim() ||
    "https://api.xkiro.com/v1"
  ).replace(/\/+$/, "");

  try {
    const upstream = await fetch(`${baseUrl}/audio/voices?limit=300`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal: AbortSignal.timeout(10000),
    });
    if (!upstream.ok) return Response.json({ voices: [] }, { status: 200 });
    const data = (await upstream.json()) as {
      voices?: Array<{ id?: string; name?: string }>;
    };
    const voices = (data.voices ?? [])
      .filter((v) => typeof v?.id === "string" && v.id)
      .map((v) => ({ id: v.id as string, name: v.name || v.id as string }));
    return Response.json({ voices });
  } catch {
    return Response.json({ voices: [] }, { status: 200 });
  }
}