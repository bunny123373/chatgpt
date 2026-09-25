export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Free-tier image model on xKiro (text → image, no source image support). */
const IMAGE_MODEL = "sensenova/sensenova-u1.5-lite";

/**
 * Pixel sizes per aspect ratio. xKiro converts `size` to the nearest aspect
 * ratio the model supports (one image is one unit regardless of size).
 */
const RATIO_SIZES: Record<string, string> = {
  "1:1": "1024x1024",
  "4:3": "1365x1024",
  "16:9": "1792x1024",
  "3:4": "1024x1365",
  "9:16": "1024x1792",
  "21:9": "1792x768",
};
const DEFAULT_RATIO = "1:1";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(req: Request) {
  let body: { prompt?: string; ratio?: string } = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const prompt = (body.prompt ?? "").trim();
  if (!prompt) return Response.json({ error: "A prompt is required." }, { status: 400 });
  const ratio = body.ratio && body.ratio in RATIO_SIZES ? body.ratio : DEFAULT_RATIO;
  const size = RATIO_SIZES[ratio];

  const headerKey = req.headers.get("x-api-key")?.trim() || "";
  const apiKey = headerKey || process.env.XKIRO_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim() || "";
  if (!apiKey) {
    return Response.json(
      { error: "No API key set. Add one in Settings or the .env.local file." },
      { status: 400 }
    );
  }
  const baseUrl = (
    req.headers.get("x-base-url")?.trim() ||
    process.env.XKIRO_BASE_URL?.trim() ||
    process.env.OPENAI_BASE_URL?.trim() ||
    "https://api.xkiro.com/v1"
  ).replace(/\/+$/, "");

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  try {
    // 1) Submit the generation job.
    const createdRes = await fetch(`${baseUrl}/images/generations`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: IMAGE_MODEL,
        prompt,
        n: 1,
        size,
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (!createdRes.ok) {
      const detail = (await createdRes.text().catch(() => "")).slice(0, 400);
      return Response.json(
        { error: `Image request failed (${createdRes.status})${detail ? ` — ${detail}` : ""}` },
        { status: createdRes.status }
      );
    }
    const created = (await createdRes.json()) as { id?: string };
    if (!created.id) {
      return Response.json({ error: "Image service did not return a job id." }, { status: 502 });
    }

    // 2) Poll until the image is ready (jobs take tens of seconds to minutes).
    const deadline = Date.now() + 5 * 60_000;
    let waitMs = 2_000;
    while (Date.now() < deadline) {
      await sleep(waitMs);
      waitMs = Math.min(waitMs * 1.5, 10_000);

      const jobRes = await fetch(`${baseUrl}/images/generations/${created.id}`, {
        headers,
        signal: AbortSignal.timeout(30000),
      });
      if (!jobRes.ok) continue;
      const job = (await jobRes.json()) as {
        status?: string;
        error?: { message?: string } | string;
        data?: Array<{ url?: string }>;
      };

      if (job.status === "succeeded") {
        const url = job.data?.[0]?.url;
        if (!url) return Response.json({ error: "Image finished but no URL was returned." }, { status: 502 });
        return Response.json({ url, model: IMAGE_MODEL, prompt, ratio, size });
      }
      if (job.status === "failed" || job.status === "blocked") {
        const reason =
          typeof job.error === "string"
            ? job.error
            : job.error?.message ?? job.status;
        return Response.json(
          { error: job.status === "blocked" ? `Prompt refused by the provider: ${reason}` : `Image failed: ${reason}` },
          { status: 422 }
        );
      }
    }

    return Response.json({ error: "Image generation timed out after 5 minutes." }, { status: 504 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: `Image generation failed: ${message}` }, { status: 500 });
  }
}