import { demoReply } from "@/lib/demo";
import { runTool, TOOL_DEFS } from "@/lib/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface InMsg {
  role: "user" | "assistant" | "system" | "tool";
  content: string | ContentPart[];
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

const enc = new TextEncoder();

function sse(payload: unknown): Uint8Array {
  return enc.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Extract plain text from a message whose content may include image parts. */
function msgText(m: InMsg): string {
  if (typeof m.content === "string") return m.content;
  return m.content
    .filter((p) => p.type === "text")
    .map((p) => p.text)
    .join(" ");
}

/**
 * Real web search via xKiro `POST /v1/search` (model `xkiro/web-search`),
 * used when the client enables the "search" toggle. Returns ranked,
 * structured results fed to the model with their source URLs.
 * Supports batch: pass an array of up to 5 queries to search all at once.
 */
async function webSearch(
  query: string | string[],
  apiKey: string,
  baseUrl: string
): Promise<string> {
  const queries = Array.isArray(query) ? query : [query];
  if (queries.length === 0) return "";
  try {
    const r = await fetch(`${baseUrl}/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "xkiro/web-search",
        query: queries.map((q) => q.slice(0, 300)),
        max_results: 6,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return "";
    const data = (await r.json()) as {
      results?: Array<{ title?: string; url?: string; snippet?: string }>;
    };
    const items = (data.results ?? [])
      .map((res) => {
        const title = res.title ?? "Result";
        const url = res.url ?? "";
        const snip = (res.snippet ?? "").trim();
        return `- ${title}${url ? ` (${url})` : ""}${snip ? `\n  ${snip}` : ""}`;
      })
      .slice(0, 6 * queries.length);
    return items.length ? `Web search results:\n${items.join("\n")}` : "";
  } catch {
    return "";
  }
}

export async function POST(req: Request) {
  let body: {
    messages?: InMsg[];
    model?: string;
    temperature?: number;
    stream?: boolean;
    search?: boolean;
    tools?: boolean;
    /** Ask for a short ChatGPT-style conversation title instead of a reply. */
    title?: boolean;
    /** Batch web search: up to 5 queries in one request (xKiro supports array). */
    queries?: string[];
  } = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const messages: InMsg[] = Array.isArray(body.messages)
    ? body.messages
        .filter(
          (m) =>
            m &&
            typeof m === "object" &&
            (typeof m.content === "string"
              ? m.content.trim() !== ""
              : Array.isArray(m.content) && m.content.length > 0)
        )
        .slice(-24)
    : [];

  const model = typeof body.model === "string" && body.model ? body.model : "gpt-4o-mini";
  const temperature = typeof body.temperature === "number" ? body.temperature : 0.7;

  const headerKey = req.headers.get("x-api-key")?.trim() || "";
  const apiKey = headerKey || process.env.XKIRO_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim() || "";
  const baseUrl = (
    req.headers.get("x-base-url")?.trim() ||
    process.env.XKIRO_BASE_URL?.trim() ||
    process.env.OPENAI_BASE_URL?.trim() ||
    "https://api.xkiro.com/v1"
  ).replace(/\/+$/, "");

  const useDemo = !apiKey || model === "demo";
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const lastUserText = lastUser ? msgText(lastUser).trim() : "";

  // ---- Title generation: a short 2-5 word name for the conversation ----
  if (body.title === true) {
    const source = lastUserText.slice(0, 1200);
    if (useDemo || !source) return Response.json({ title: "" });
    try {
      const r = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          stream: false,
          messages: [
            {
              role: "system",
              content:
                "You write short conversation titles. Reply with ONLY a title of 2-5 words that summarizes the user's message. No preamble, no quotes, no trailing punctuation.",
            },
            { role: "user", content: source },
          ],
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (r.ok) {
        const data = (await r.json()) as { choices?: Array<{ message?: { content?: string | null } }> };
        const raw = data.choices?.[0]?.message?.content ?? "";
        const title = raw
          .split("\n")[0]
          .trim()
          .replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, "")
          .replace(/[.!?:;。！？]+$/, "")
          .slice(0, 60)
          .trim();
        return Response.json({ title });
      }
    } catch {
      /* keep the client-side titleFrom fallback */
    }
    return Response.json({ title: "" });
  }

  const search = body.search === true && !useDemo;
  const batchQueries = Array.isArray(body.queries) && body.queries.length > 0 ? body.queries.slice(0, 5) : null;
  const webContext = search && batchQueries
    ? await webSearch(batchQueries, apiKey, baseUrl)
    : search && lastUserText
      ? await webSearch(lastUserText, apiKey, baseUrl)
      : "";
  const chatMessages: InMsg[] = webContext
    ? [
        {
          role: "system",
          content:
            "You are a helpful assistant. Prefer facts from the web search results below when they are relevant. When you use a search result, cite it inline with its URL.\n\n" +
            webContext,
        },
        ...messages,
      ]
    : messages;

  const authHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  // ---- Tool-calling pre-pass (only when the client enables it) ----
  // Ask the model once, non-streaming, with the tool definitions. If it wants
  // to call tools, execute them and stream the final answer with the results.
  // If it answers directly, stream that text instead of calling upstream again.
  const wantsTools = body.tools === true && !useDemo;
  let toolsUsed: string[] = [];
  let finalMessages = chatMessages;
  let presetAnswer = "";

  if (wantsTools) {
    try {
      const pre = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          model,
          temperature,
          stream: false,
          messages: chatMessages,
          tools: TOOL_DEFS,
          tool_choice: "auto",
        }),
        signal: AbortSignal.timeout(60000),
      });
      if (pre.ok) {
        const data = (await pre.json()) as {
          choices?: Array<{ message?: { content?: string | null; tool_calls?: ToolCall[] } }>;
        };
        const msg = data.choices?.[0]?.message;
        const calls = Array.isArray(msg?.tool_calls) ? msg.tool_calls : null;
        if (calls && calls.length) {
          const appended: InMsg[] = [
            {
              role: "assistant",
              content: typeof msg?.content === "string" ? msg.content : "",
              tool_calls: calls.map((tc) => ({
                id: tc.id,
                type: "function" as const,
                function: {
                  name: tc.function?.name ?? "unknown",
                  arguments:
                    typeof tc.function?.arguments === "string"
                      ? tc.function.arguments
                      : JSON.stringify(tc.function?.arguments ?? {}),
                },
              })),
            },
          ];
          for (const tc of calls) {
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(tc.function?.arguments ?? "{}");
            } catch {
              /* keep {} */
            }
            const name = tc.function?.name ?? "unknown";
            const result = runTool(name, args);
            appended.push({ role: "tool", tool_call_id: tc.id, content: result.text });
            if (!toolsUsed.includes(name)) toolsUsed.push(name);
          }
          finalMessages = [...chatMessages, ...appended];
        } else if (typeof msg?.content === "string" && msg.content.trim()) {
          // Model answered without calling tools — reuse that answer.
          presetAnswer = msg.content;
        }
      }
    } catch {
      /* tool pre-pass failed — fall back to plain streaming below */
    }
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const close = () => {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      if (useDemo) {
        const text = demoReply(lastUserText, messages);
        const chunks = text.match(/[\s\S]{1,4}/g) ?? [];
        for (const chunk of chunks) {
          controller.enqueue(sse({ delta: chunk }));
          await sleep(12);
        }
        controller.enqueue(enc.encode("data: [DONE]\n\n"));
        close();
        return;
      }

      // Stream a non-tool answer produced by the pre-pass without a 2nd call.
      if (presetAnswer) {
        controller.enqueue(sse({ delta: presetAnswer }));
        controller.enqueue(enc.encode("data: [DONE]\n\n"));
        close();
        return;
      }

      try {
        const upstream = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            model,
            temperature,
            stream: true,
            messages: finalMessages,
          }),
          signal: req.signal, // TODO: forward client cancellation so upstream stops/reserves billing
        });

        if (!upstream.ok || !upstream.body) {
          const detail = (await upstream.text().catch(() => "")).slice(0, 600);
          controller.enqueue(
            sse({
              error:
                `Upstream ${upstream.status} ${upstream.statusText || ""}`.trim() +
                (detail ? ` — ${detail}` : ""),
            })
          );
          controller.enqueue(enc.encode("data: [DONE]\n\n"));
          close();
          return;
        }

        if (toolsUsed.length) {
          controller.enqueue(sse({ delta: "", tools_used: toolsUsed }));
        }

        // Forward the provider's own SSE frames; the client understands both
        // OpenAI-style {choices:[{delta:{content}}]} and plain {delta} frames.
        const reader = upstream.body.getReader();
        let gotAny = false;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value && value.length) {
            gotAny = true;
            controller.enqueue(value);
          }
        }
        if (!gotAny) {
          controller.enqueue(sse({ error: "The provider returned an empty stream." }));
        }
        controller.enqueue(enc.encode("data: [DONE]\n\n"));
        close();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown network error";
        controller.enqueue(sse({ error: `Request failed: ${message}` }));
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