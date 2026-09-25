import type { NextRequest } from "next/server";

/**
 * Text-to-speech proxy — xKiro `POST /v1/audio/speech` (model `xkiro-voice`).
 * Returns raw MP3 bytes so the client can play them directly.
 */
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: { text?: string; voice?: string; speed?: number; pitch?: number } = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

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

  const text = typeof body.text === "string" ? body.text.trim().slice(0, 4000) : "";
  const voice = typeof body.voice === "string" && body.voice ? body.voice : "american-female";
  if (!text) return Response.json({ error: "Missing text" }, { status: 400 });
  if (!apiKey) return Response.json({ error: "Missing API key" }, { status: 400 });

  // Voice controls from Settings → Voice (xKiro accepts speed/pitch on /audio/speech).
  const clamp = (v: unknown, min: number, max: number): number | undefined => {
    if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
    return Math.min(max, Math.max(min, v));
  };
  const speed = clamp(body.speed, 0.5, 2);
  const pitch = clamp(body.pitch, -10, 10);

  const upstream = await fetch(`${baseUrl}/audio/speech`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "xkiro-voice",
      input: text,
      voice,
      response_format: "mp3",
      ...(speed !== undefined ? { speed } : {}),
      ...(pitch !== undefined ? { pitch } : {}),
    }),
  });

  if (!upstream.ok) {
    const err = await upstream.text().catch(() => "");
    return Response.json({ error: err || `HTTP ${upstream.status}` }, { status: upstream.status });
  }

  const audio = await upstream.arrayBuffer();
  return new Response(audio, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") || "audio/mpeg",
      "Cache-Control": "private, max-age=86400",
    },
  });
}