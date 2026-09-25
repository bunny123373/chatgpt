/**
 * Built-in tools the chat model can call via OpenAI-style function calling.
 * All tools are deterministic and run server-side — no external API needed.
 */

export interface ToolCallArgs {
  name: string;
  arguments: Record<string, unknown>;
}

/** OpenAI-compatible function definitions we expose to the model. */
export const TOOL_DEFS = [
  {
    type: "function",
    function: {
      name: "get_current_time",
      description:
        "Get the current local time, including the timezone. Call whenever the user asks what time it is or about schedules.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_current_date",
      description:
        "Get today's date. Call whenever the user asks what day/date it is or about deadlines, age, or calendars.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "calculate",
      description:
        "Evaluate a math expression safely. Supports + - * / ^ % and parentheses.",
      parameters: {
        type: "object",
        properties: {
          expression: {
            type: "string",
            description: 'Example: "(3 + 4) * 2 ^ 3"',
          },
        },
        required: ["expression"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "convert_units",
      description:
        "Convert between common units: length (m, km, cm, mm, mi, ft, in, yd), mass (kg, g, mg, lb, oz, t), temperature (c, f, k), volume (l, ml, gal, qt, cup).",
      parameters: {
        type: "object",
        properties: {
          value: { type: "number", description: "The numeric amount" },
          from: { type: "string", description: "Source unit" },
          to: { type: "string", description: "Target unit" },
        },
        required: ["value", "from", "to"],
      },
    },
  },
] as const;

type ToolResult = { ok: true; text: string } | { ok: false; text: string };

/** Execute one tool call. Returns a plain string the model can quote from. */
export function runTool(name: string, args: Record<string, unknown>): ToolResult {
  switch (name) {
    case "get_current_time": {
      const d = new Date();
      return {
        ok: true,
        text: `Current local time: ${d.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })} (${Intl.DateTimeFormat().resolvedOptions().timeZone})`,
      };
    }
    case "get_current_date": {
      const d = new Date();
      return {
        ok: true,
        text: `Today's date: ${d.toLocaleDateString([], {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        })}`,
      };
    }
    case "calculate": {
      const expression = String(args.expression ?? "");
      const value = safeEval(expression);
      return value === null
        ? { ok: false, text: `Could not parse expression: "${expression}". Ask the user to write it differently.` }
        : { ok: true, text: `${expression} = ${value}` };
    }
    case "convert_units": {
      const value = Number(args.value);
      const from = String(args.from ?? "").toLowerCase();
      const to = String(args.to ?? "").toLowerCase();
      if (!Number.isFinite(value)) return { ok: false, text: "Value must be a number." };
      const out = convert(value, from, to);
      return out === null
        ? { ok: false, text: `Unknown unit pair "${from}" → "${to}". Supported: length, mass, temperature, volume.` }
        : { ok: true, text: `${value} ${from} = ${out} ${to}` };
    }
    default:
      return { ok: false, text: `Unknown tool "${name}".` };
  }
}

/* ---------------- Safe arithmetic evaluator ---------------- */

const TOKEN =
  /(\d+(?:\.\d+)?|\.\d+|[+\-*/^%()])/g;

function tokenize(s: string): string[] {
  return (s.match(TOKEN) ?? []).filter((t) => t.trim() !== "");
}

/** Recursive-descent parser producing a number. Null on any error. */
export function safeEval(expression: string): number | null {
  const tokens = tokenize(expression);
  let pos = 0;

  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  function atom(): number | null {
    const t = next();
    if (t === "(") {
      const v = expr();
      if (v === null || next() !== ")") return null;
      return v;
    }
    if (t === "-") {
      const v = atom();
      return v === null ? null : -v;
    }
    if (t === "+") return atom();
    if (t === undefined || !/^-?\d/.test(t)) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }

  function power(): number | null {
    const base = atom();
    if (base === null) return null;
    if (peek() === "^") {
      next();
      const exp = power();
      if (exp === null) return null;
      return Math.pow(base, exp);
    }
    return base;
  }

  function term(): number | null {
    let v = power();
    if (v === null) return null;
    while (peek() === "*" || peek() === "/" || peek() === "%") {
      const op = next();
      const r = power();
      if (r === null) return null;
      v = op === "*" ? v * r : op === "/" ? (r === 0 ? null : v / r) : v % r;
      if (v === null) return null;
    }
    return v;
  }

  function expr(): number | null {
    let v = term();
    if (v === null) return null;
    while (peek() === "+" || peek() === "-") {
      const op = next();
      const r = term();
      if (r === null) return null;
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }

  const value = expr();
  if (value === null || pos !== tokens.length) return null;
  return Math.round(value * 1e10) / 1e10;
}

/* ---------------- Unit conversion ---------------- */

const LENGTH: Record<string, number> = { m: 1, km: 1000, cm: 0.01, mm: 0.001, mi: 1609.344, ft: 0.3048, in: 0.0254, yd: 0.9144 };
const MASS: Record<string, number> = { kg: 1, g: 0.001, mg: 1e-6, lb: 0.45359237, oz: 0.028349523125, t: 1000 };
const VOLUME: Record<string, number> = { l: 1, ml: 0.001, gal: 3.785411784, qt: 0.946352946, cup: 0.2365882365 };

function convert(value: number, from: string, to: string): number | null {
  if (LENGTH[from] && LENGTH[to]) return round((value * LENGTH[from]) / LENGTH[to]);
  if (MASS[from] && MASS[to]) return round((value * MASS[from]) / MASS[to]);
  if (VOLUME[from] && VOLUME[to]) return round((value * VOLUME[from]) / VOLUME[to]);
  if ((from === "c" || from === "f" || from === "k") && (to === "c" || to === "f" || to === "k")) {
    let c = from === "c" ? value : from === "f" ? ((value - 32) * 5) / 9 : value - 273.15;
    if (to === "c") return round(c);
    if (to === "f") return round((c * 9) / 5 + 32);
    return round(c + 273.15);
  }
  return null;
}

function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}