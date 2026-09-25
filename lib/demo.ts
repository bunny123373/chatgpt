/**
 * Offline demo engine — used when no API key is configured (or model === "demo").
 * It is a deterministic, keyword-routed canned generator so the UI is fully
 * usable without credentials. Real answers need an OpenAI-compatible key.
 */

const NOTE =
  "_Offline **demo mode** — no API key detected. Add one in **Settings → API key** to get real model answers._\n\n";

function topicOf(prompt: string): string {
  const cleaned = prompt.replace(/[?!.;,]+$/g, "").trim();
  const m = cleaned.match(
    /(?:what is|what are|whats|what's|who is|explain|define|tell me about|how does|how do i|how to|why is|why do|can you)\s+(.{2,70})/i
  );
  if (m) return m[1].replace(/^(a|an|the)\s+/i, "").trim();
  const words = cleaned.split(/\s+/).filter((w) => w.length > 2);
  return words.slice(0, 7).join(" ") || "your question";
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function demoReply(prompt: string, history: { role: string }[] = []): string {
  const p = prompt.toLowerCase();
  const topic = topicOf(prompt);
  const T = titleCase(topic);

  if (/^(hi|hey|hello|yo|good (morning|evening|afternoon))\b/.test(p.trim()) || p.trim().length < 4) {
    return (
      NOTE +
      `Hey! I'm **Next AI** running in offline demo mode. I can still show you the full experience:\n\n` +
      `- **Streaming** replies token by token\n` +
      `- **Markdown** rendering (headings, lists, tables, code)\n` +
      `- Chat **history** saved in your browser\n\n` +
      `Try asking me to *explain something*, *write a function*, or *compare two options*.`
    );
  }

  if (/code|function|script|python|javascript|typescript|react|sql|regex|api|component|bug|error/.test(p)) {
    const lang = /python/.test(p) ? "python" : /sql/.test(p) ? "sql" : /react|component/.test(p) ? "tsx" : "javascript";
    const snip =
      lang === "python"
        ? `from dataclasses import dataclass, field\n\n@dataclass\nclass Message:\n    role: str\n    content: str\n    tokens: int = 0\n\ndef total_tokens(messages: list[Message]) -> int:\n    """Sum tokens across a conversation."""\n    return sum(m.tokens for m in messages)`
        : lang === "sql"
        ? `SELECT c.id,\n       c.title,\n       COUNT(m.id) AS message_count\nFROM chats c\nLEFT JOIN messages m ON m.chat_id = c.id\nGROUP BY c.id, c.title\nHAVING COUNT(m.id) > 0\nORDER BY message_count DESC\nLIMIT 10;`
        : lang === "tsx"
        ? `type Props = { title: string; onSend: (text: string) => void };\n\nexport default function Composer({ title, onSend }: Props) {\n  const [value, setValue] = React.useState("");\n\n  function submit(e: React.FormEvent) {\n    e.preventDefault();\n    const text = value.trim();\n    if (!text) return;\n    onSend(text);\n    setValue("");\n  }\n\n  return <form onSubmit={submit}>{title}</form>;\n}`
        : `async function streamChat(messages, { onDelta, signal } = {}) {\n  const res = await fetch("/api/chat", {\n    method: "POST",\n    headers: { "Content-Type": "application/json" },\n    body: JSON.stringify({ messages, stream: true }),\n    signal,\n  });\n  if (!res.ok) throw new Error(\`HTTP \${res.status}\`);\n\n  const reader = res.body.getReader();\n  const decoder = new TextDecoder();\n  let buffer = "";\n\n  while (true) {\n    const { done, value } = await reader.read();\n    if (done) break;\n    buffer += decoder.decode(value, { stream: true });\n    const frames = buffer.split("\\n\\n");\n    buffer = frames.pop() ?? "";\n    for (const frame of frames) {\n      const line = frame.replace(/^data:\\s*/, "");\n      if (!line || line === "[DONE]") continue;\n      onDelta?.(JSON.parse(line));\n    }\n  }\n}`;

    return (
      NOTE +
      `Here's a starting point for **${topic}**:\n\n` +
      "```" +
      lang +
      "\n" +
      snip +
      "\n```\n\n" +
      `### Why this shape\n\n` +
      `1. **Streaming** keeps perceived latency low — first token beats a full render.\n` +
      `2. **The server holds the key.** The browser only ever sees your own server-side API route.\n` +
      `3. **Failures are visible.** A non-2xx response throws instead of silently rendering nothing.\n\n` +
      `Want me to wire this into the Next.js route handler, or adapt it to another provider (Anthropic, Groq, Ollama)?`
    );
  }

  if (/compare|versus|vs\.?|difference between|better than|which should i/.test(p)) {
    return (
      NOTE +
      `### ${T}: side by side\n\n` +
      `| Dimension | Option A | Option B |\n` +
      `| --- | --- | --- |\n` +
      `| Setup cost | Low — works out of the box | Higher — needs configuration |\n` +
      `| Flexibility | Opinionated defaults | Fine-grained control |\n` +
      `| Scaling | Fine to ~thousands of users | Built for heavy load |\n` +
      `| Ecosystem | Large, active | Smaller but focused |\n\n` +
      `**Pick A if** you want to ship this week and your workload is modest.\n\n` +
      `**Pick B if** you already know your bottlenecks and need room to tune them.\n\n` +
      `> Rule of thumb: choose the simplest option that survives your *next* order of magnitude, then re-evaluate.`
    );
  }

  if (/list|ideas|steps|plan|checklist|how to|guide|tutorial/.test(p)) {
    return (
      NOTE +
      `### A practical path for ${topic}\n\n` +
      `1. **Clarify the outcome** — write one sentence describing what "done" looks like.\n` +
      `2. **Collect constraints** — time, budget, people, and anything non-negotiable.\n` +
      `3. **Draft the smallest version** that produces a real result you can react to.\n` +
      `4. **Test it on one real case** rather than ten imagined ones.\n` +
      `5. **Iterate** — keep what worked, delete what didn't, and repeat.\n\n` +
      `**Common pitfalls**\n\n` +
      `- Optimising step 3 before you know step 1\n` +
      `- Adding tooling to solve a problem you don't have yet\n` +
      `- Skipping the "one real case" — plans rarely fail on paper\n\n` +
      `Want this expanded into a checklist with owners and dates?`
    );
  }

  if (/write|draft|email|essay|story|post|caption|poem|blog/.test(p)) {
    return (
      NOTE +
      `Here's a draft about **${topic}**:\n\n` +
      `**Subject:** ${T} — a quick update\n\n` +
      `Hi there,\n\n` +
      `I wanted to share where things stand with ${topic}. The short version: we made real progress, and there is one decision left.\n\n` +
      `What changed:\n` +
      `- The core approach is settled and working.\n` +
      `- Open questions have narrowed to a single trade-off.\n` +
      `- Next steps are small enough to finish this week.\n\n` +
      `Could you let me know your preference by Friday? Happy to jump on a call if it's easier.\n\n` +
      `Thanks,\n*— Next AI (demo)*\n\n` +
      `Tell me the **tone** (warm, formal, playful) and **length** and I'll redraft it.`
    );
  }

  if (/summar/.test(p)) {
    return (
      NOTE +
      `### Summary\n\n` +
      `**${T}** comes down to three points:\n\n` +
      `- **What it is** — the essential definition, stripped of jargon.\n` +
      `- **Why it matters** — the trade-off it resolves for you.\n` +
      `- **What to do next** — the single action with the best payoff.\n\n` +
      `Paste the full text you'd like condensed and I'll produce bullet points, key numbers, and open questions.`
    );
  }

  const turns = history.filter((h) => h.role === "user").length;
  return (
    NOTE +
    `Good question about **${topic}**. A useful way to approach it:\n\n` +
    `- **Start from the goal** — what would a good answer let you do differently?\n` +
    `- **Separate the certain from the speculative** — most confusion mixes the two.\n` +
    `- **Find the smallest decisive test** — one check that rules out the biggest branch.\n\n` +
    `` +
    (turns > 1 ? `We're ${turns} messages in, so I have some context to work with. ` : "") +
    `Add your API key in **Settings** and I'll answer with a real model instead of this canned demo.`
  );
}
