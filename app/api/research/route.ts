import { runTool, TOOL_DEFS } from "@/lib/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Deep Research — a multi-step pipeline that mirrors chatgpt.com's:
 *   1. Decompose the question into 3-5 focused search queries (model call).
 *   2. Run every query against xKiro web search.
 *   3. Synthesise a cited report from the collected sources (model call).
 *
 * Streams progress as SSE frames the client understands, then a final
 * `report` frame with the Markdown answer.
 */

type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
interface InMsg {
  role: "user" | "assistant" | "system";
  content: string | ContentPart[];
}

const enc = new TextEncoder();
const sse = (payload: unknown) => enc.encode(`data: ${JSON.stringify(payload)}\n\n`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function msgText(m: InMsg): string {
  if (typeof m.content === "string") return m.content;
  return m.content
    .filter((p) => p.type === "text")
    .map((p) => p.text)
    .join(" ");
}

async function webSearch(
  queries: string[],
  apiKey: string,
  baseUrl: string
): Promise<Array<{ query: string; results: Array<{ title?: string; url?: string; snippet?: string }> }>> {
  const out: Array<{ query: string; results: Array<{ title?: string; url?: string; snippet?: string }> }> = [];
  // Run the queries in parallel — xKiro accepts an array per call.
  await Promise.all(
    queries.map(async (query) => {
      try {
        const r = await fetch(`${baseUrl}/search`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model: "xkiro/web-search", query: query.slice(0, 300), max_results: 5 }),
          signal: AbortSignal.timeout(15000),
        });
        if (!r.ok) return;
        const data = (await r.json()) as { results?: Array<{ title?: string; url?: string; snippet?: string }> };
        out.push({ query, results: (data.results ?? []).slice(0, 5) });
      } catch {
        /* a failed query just contributes nothing */
      }
    })
  );
  return out;
}

export async function POST(req: Request) {
  let body: { question?: string; model?: string; apiKey?: string; baseUrl?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const question = (body.question || "").trim();
  if (!question) return Response.json({ error: "A question is required." }, { status: 400 });

  const model = body.model && body.model !== "demo" ? body.model : "qwen/qwen3.5-flash:free";
  const apiKey = (body.apiKey || "").trim() || process.env.XKIRO_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim() || "";
  const baseUrl = (
    body.baseUrl?.trim() || process.env.XKIRO_BASE_URL?.trim() || "https://api.xkiro.com/v1"
  ).replace(/\/+$/, "");

  if (!apiKey) {
    return Response.json({ error: "Deep Research needs an API key (add it in Settings)." }, { status: 400 });
  }

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const close = () => {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      try {
        // ---- Step 1: plan the searches ----
        controller.enqueue(sse({ stage: "planning", message: "Planning research…" }));

        let queries: string[] = [];
        try {
          const plan = await fetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              model,
              temperature: 0.2,
              stream: false,
              max_tokens: 220,
              messages: [
                {
                  role: "system",
                  content:
                    "You break a research question into web searches. Reply with ONLY 3-5 search queries, one per line, no numbering, no commentary. Each query must be self-contained.",
                },
                { role: "user", content: question },
              ],
            }),
            signal: AbortSignal.timeout(30000),
          });
          if (plan.ok) {
            const data = (await plan.json()) as { choices?: Array<{ message?: { content?: string | null } }> };
            const raw = data.choices?.[0]?.message?.content ?? "";
            queries = raw
              .split("\n")
              .map((l) => l.replace(/^[\s\-*\d.)]+/, "").trim())
              .filter((l) => l.length > 3)
              .slice(0, 5);
          }
        } catch {
          /* fall back to the original question */
        }
        if (!queries.length) queries = [question];

        // ---- Step 2: search ----
        controller.enqueue(sse({ stage: "searching", message: `Searching the web (${queries.length} queries)…`, queries }));
        const batches = await webSearch(queries, apiKey, baseUrl);
        const sources = batches.flatMap((b) => b.results);
        if (!sources.length) {
          controller.enqueue(sse({ error: "No web results found. Try rephrasing the question." }));
          controller.enqueue(enc.encode("data: [DONE]\n\n"));
          close();
          return;
        }

        // Dedup by URL.
        const seen = new Set<string>();
        const unique = sources.filter((s) => {
          const u = s.url || "";
          if (!u || seen.has(u)) return false;
          seen.add(u);
          return true;
        });

        controller.enqueue(sse({ stage: "reading", message: `Reading ${unique.length} sources…`, sources: unique.length }));

        const context = batches
          .map(
            (b) =>
              `Search: ${b.query}\n` +
              b.results
                .map((r, i) => `${i + 1}. ${r.title ?? "Result"}${r.url ? ` — ${r.url}` : ""}\n   ${(r.snippet ?? "").trim()}`)
                .join("\n")
          )
          .join("\n\n");

        // ---- Step 3: synthesise the cited report ----
        controller.enqueue(sse({ stage: "writing", message: "Writing the report…" }));

        const report = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model,
            temperature: 0.4,
            stream: false,
            messages: [
              {
                role: "system",
                content:
                  "You are a research analyst. Write a thorough, well-structured Markdown report that answers the question using ONLY the provided sources. Cite sources inline as [n] matching the numbered list. If the sources disagree, say so. Add a short 'Sources' list at the end as numbered links. If the sources don't answer the question, say so plainly rather than inventing facts.",
              },
              { role: "user", content: `Question: ${question}\n\nSources:\n${context}` },
            ],
          }),
          signal: AbortSignal.timeout(120000),
        });

        if (!report.ok) {
          controller.enqueue(sse({ error: `The model returned ${report.status}. Try again.` }));
          controller.enqueue(enc.encode("data: [DONE]\n\n"));
          close();
          return;
        }

        const data = (await report.json()) as { choices?: Array<{ message?: { content?: string | null } }> };
        const text = data.choices?.[0]?.message?.content ?? "";
        controller.enqueue(sse({ report: text, sources: unique }));
        controller.enqueue(enc.encode("data: [DONE]\n\n"));
        close();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        controller.enqueue(sse({ error: `Deep Research failed: ${message}` }));
        controller.enqueue(enc.encode("data: [DONE]\n\n"));
        close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
