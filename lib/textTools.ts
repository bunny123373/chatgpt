"use client";

/**
 * Text, developer and calculator utilities.
 *
 * All pure functions — no network, no dependencies. Each returns a plain
 * string so the Tools page can drop the result straight into its output box.
 */

export interface CountResult {
  chars: number;
  charsNoSpaces: number;
  words: number;
  sentences: number;
  paragraphs: number;
  lines: number;
  readingMinutes: number;
  speakingMinutes: number;
}

export function countText(input: string): CountResult {
  const chars = input.length;
  const charsNoSpaces = input.replace(/\s/g, "").length;
  const words = input.trim() ? input.trim().split(/\s+/).filter(Boolean).length : 0;
  const sentences = (input.match(/[^.!?…]+[.!?…]+(\s|$)/g) ?? []).length || (input.trim() ? 1 : 0);
  const paragraphs = input.trim() ? input.trim().split(/\n{2,}/).filter((p) => p.trim()).length : 0;
  const lines = input ? input.split(/\r?\n/).length : 0;
  return {
    chars,
    charsNoSpaces,
    words,
    sentences,
    paragraphs,
    lines,
    // ~225 wpm reading, ~130 wpm speaking.
    readingMinutes: Math.round((words / 225) * 10) / 10,
    speakingMinutes: Math.round((words / 130) * 10) / 10,
  };
}

export type CaseMode = "upper" | "lower" | "title" | "sentence" | "camel" | "pascal" | "snake" | "kebab" | "constant" | "inverse" | "alternating";

/** Split into words, tolerating camelCase, snake_case, kebab-case and spaces. */
function words(input: string): string[] {
  return input
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
}

export function convertCase(input: string, mode: CaseMode): string {
  const w = words(input);
  if (!w.length) return "";
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  switch (mode) {
    case "upper":
      return input.toUpperCase();
    case "lower":
      return input.toLowerCase();
    case "title":
      return w.map(cap).join(" ");
    case "sentence": {
      const s = w.join(" ").toLowerCase();
      return s.charAt(0).toUpperCase() + s.slice(1);
    }
    case "camel":
      return w.map((s, i) => (i === 0 ? s.toLowerCase() : cap(s))).join("");
    case "pascal":
      return w.map(cap).join("");
    case "snake":
      return w.map((s) => s.toLowerCase()).join("_");
    case "kebab":
      return w.map((s) => s.toLowerCase()).join("-");
    case "constant":
      return w.map((s) => s.toUpperCase()).join("_");
    case "inverse":
      return Array.from(input)
        .map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()))
        .join("");
    case "alternating":
      return Array.from(input)
        .map((c, i) => (i % 2 === 0 ? c.toUpperCase() : c.toLowerCase()))
        .join("");
  }
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/* ------------------------------- formatters ------------------------------ */

export function formatJson(input: string, indent: number): string {
  return JSON.stringify(JSON.parse(input), null, indent);
}

export function minifyJson(input: string): string {
  return JSON.stringify(JSON.parse(input));
}

export function formatXml(input: string, indent: number): string {
  const pad = " ".repeat(indent);
  // Split tags onto their own lines, then indent by depth.
  const tokens = input
    .replace(/>\s*</g, "><")
    .replace(/></g, ">\n<")
    .split("\n")
    .filter((t) => t.trim());
  let depth = 0;
  const out: string[] = [];
  for (const t of tokens) {
    if (/^<\//.test(t)) depth = Math.max(0, depth - 1);
    out.push(pad.repeat(depth) + t);
    if (/^<[^!?/]/.test(t) && !/\/>$/.test(t) && !/<\/[^>]+>$/.test(t)) depth++;
  }
  return out.join("\n");
}

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

/** RFC-4180-ish CSV parser: handles quotes, escaped quotes and CRLF. */
export function parseCsv(input: string): ParsedCsv {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (c !== "\r") cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  if (!rows.length) return { headers: [], rows: [] };
  return { headers: rows[0].map((h) => h.trim()), rows: rows.slice(1).filter((r) => r.some((c) => c !== "")) };
}

export function toCsv(headers: string[], rows: string[][]): string {
  const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [headers.map(cell).join(","), ...rows.map((r) => r.map(cell).join(","))].join("\n");
}

export function csvToJson(input: string): string {
  const { headers, rows } = parseCsv(input);
  const out = rows.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])));
  return JSON.stringify(out, null, 2);
}

export function jsonToCsv(input: string): string {
  const data: unknown = JSON.parse(input);
  if (!Array.isArray(data) || !data.length) throw new Error("Expected a non-empty array of objects.");
  const headers: string[] = [];
  for (const row of data as Record<string, unknown>[]) {
    for (const k of Object.keys(row ?? {})) if (!headers.includes(k)) headers.push(k);
  }
  const rows = (data as Record<string, unknown>[]).map((row) => headers.map((h) => (row?.[h] == null ? "" : String(row[h]))));
  return toCsv(headers, rows);
}

/* -------------------------------- base64 --------------------------------- */

export function encodeBase64(input: string): string {
  // encodeURIComponent first so non-Latin1 characters survive.
  return btoa(unescape(encodeURIComponent(input)));
}

export function decodeBase64(input: string): string {
  return decodeURIComponent(escape(atob(input.replace(/\s+/g, ""))));
}

export function urlEncode(input: string): string {
  return encodeURIComponent(input);
}

export function urlDecode(input: string): string {
  return decodeURIComponent(input.replace(/\+/g, " "));
}

/* --------------------------------- hashes -------------------------------- */

export async function sha256(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function md5ish(input: string): Promise<string> {
  // Not real MD5 — SHA-256 truncated, labelled honestly in the UI.
  return (await sha256(input)).slice(0, 32);
}

export function crc32(input: string): string {
  let crc = 0xffffffff;
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i);
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, "0");
}

/* --------------------------------- random -------------------------------- */

export function uuidV4(): string {
  const c: Crypto = window.crypto;
  if (typeof c.randomUUID === "function") return c.randomUUID();
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function randomString(len: number, alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"): string {
  const a = new Uint32Array(len);
  window.crypto.getRandomValues(a);
  return Array.from(a, (x) => alphabet[x % alphabet.length]).join("");
}

export function password(len = 20): string {
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";
  const sym = "!@#$%^&*()-_=+[]{}?";
  const all = upper + lower + digits + sym;
  const buf = new Uint32Array(1);
  const pick = (s: string): string => {
    window.crypto.getRandomValues(buf);
    return s[buf[0] % s.length];
  };
  // Guarantee one of each class so the result always satisfies the basics.
  const chars: string[] = [pick(upper), pick(lower), pick(digits), pick(sym)];
  while (chars.length < len) chars.push(pick(all));
  // Fisher-Yates with a crypto source.
  const out = new Uint32Array(chars.length);
  window.crypto.getRandomValues(out);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = out[i] % (i + 1);
    const tmp = chars[i];
    chars[i] = chars[j];
    chars[j] = tmp;
  }
  return chars.slice(0, len).join("");
}

/* ---------------------------------- time --------------------------------- */

export function unixTimestamp(ms: number): string {
  return String(Math.floor(ms / 1000));
}

export function fromUnix(sec: string): string {
  const n = Number(sec.trim());
  if (!Number.isFinite(n)) throw new Error("Enter a numeric Unix timestamp.");
  return new Date(n * 1000).toISOString();
}

export function humanBytesTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [d ? `${d}d` : "", h ? `${h}h` : "", m ? `${m}m` : "", `${sec}s`].filter(Boolean).join(" ");
}

/* ------------------------------- calculator ------------------------------ */

/** Tokenise a numeric expression, then evaluate it with a shunting-yard pass. */
export function evaluateExpression(input: string): number {
  const src = input.replace(/\s+/g, "").replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-");
  if (!src) throw new Error("Enter an expression.");
  if (!/^[0-9+\-*/().%^]+$/.test(src)) throw new Error("Only numbers and + - * / ( ) % ^ are allowed.");

  const tokens = src.match(/\d+\.?\d*|[+\-*/()^%]/g) ?? [];
  const prec: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2, "%": 2, "^": 3 };
  const output: string[] = [];
  const ops: string[] = [];

  for (const t of tokens) {
    if (/^\d/.test(t)) output.push(t);
    else if (t === "(") ops.push(t);
    else if (t === ")") {
      while (ops.length && ops[ops.length - 1] !== "(") output.push(ops.pop() as string);
      if (!ops.length) throw new Error("Unbalanced brackets.");
      ops.pop();
    } else if (t === "u" || t === "i") {
      // unary minus/plus folded into 0 so the parser stays simple
      output.push("0");
      ops.push(t === "u" ? "-" : "+");
    } else {
      // ^ is right-associative, everything else is left-associative.
      while (ops.length && prec[ops[ops.length - 1]] >= prec[t] && t !== "^") output.push(ops.pop() as string);
      ops.push(t);
    }
  }
  while (ops.length) {
    const op = ops.pop() as string;
    if (op === "(") throw new Error("Unbalanced brackets.");
    output.push(op);
  }

  const stack: number[] = [];
  for (const t of output) {
    if (/^\d/.test(t)) stack.push(Number(t));
    else {
      const b = stack.pop();
      const a = stack.pop();
      if (a === undefined || b === undefined) throw new Error("Malformed expression.");
      switch (t) {
        case "+": stack.push(a + b); break;
        case "-": stack.push(a - b); break;
        case "*": stack.push(a * b); break;
        case "/":
          if (b === 0) throw new Error("Division by zero.");
          stack.push(a / b);
          break;
        case "%": stack.push(a % b); break;
        case "^": stack.push(a ** b); break;
        default: throw new Error(`Unexpected "${t}".`);
      }
    }
  }
  if (stack.length !== 1 || !Number.isFinite(stack[0])) throw new Error("Could not evaluate that.");
  return stack[0];
}

/* ---------------------------- unit conversions --------------------------- */

export interface UnitDef {
  id: string;
  label: string;
  /** Multiply by this to get the base unit. */
  toBase: number;
  offset?: number;
}

export interface UnitCategory {
  id: string;
  label: string;
  base: string;
  units: UnitDef[];
}

export const UNIT_CATEGORIES: UnitCategory[] = [
  {
    id: "length",
    label: "Length",
    base: "m",
    units: [
      { id: "mm", label: "Millimetres", toBase: 0.001 },
      { id: "cm", label: "Centimetres", toBase: 0.01 },
      { id: "m", label: "Metres", toBase: 1 },
      { id: "km", label: "Kilometres", toBase: 1000 },
      { id: "in", label: "Inches", toBase: 0.0254 },
      { id: "ft", label: "Feet", toBase: 0.3048 },
      { id: "yd", label: "Yards", toBase: 0.9144 },
      { id: "mi", label: "Miles", toBase: 1609.344 },
      { id: "nmi", label: "Nautical miles", toBase: 1852 },
    ],
  },
  {
    id: "mass",
    label: "Mass",
    base: "kg",
    units: [
      { id: "mg", label: "Milligrams", toBase: 0.000001 },
      { id: "g", label: "Grams", toBase: 0.001 },
      { id: "kg", label: "Kilograms", toBase: 1 },
      { id: "t", label: "Tonnes", toBase: 1000 },
      { id: "oz", label: "Ounces", toBase: 0.028349523125 },
      { id: "lb", label: "Pounds", toBase: 0.45359237 },
      { id: "st", label: "Stone", toBase: 6.35029318 },
    ],
  },
  {
    id: "area",
    label: "Area",
    base: "m²",
    units: [
      { id: "cm2", label: "Square centimetres", toBase: 0.0001 },
      { id: "m2", label: "Square metres", toBase: 1 },
      { id: "ha", label: "Hectares", toBase: 10000 },
      { id: "km2", label: "Square kilometres", toBase: 1000000 },
      { id: "ft2", label: "Square feet", toBase: 0.09290304 },
      { id: "ac", label: "Acres", toBase: 4046.8564224 },
    ],
  },
  {
    id: "volume",
    label: "Volume",
    base: "L",
    units: [
      { id: "ml", label: "Millilitres", toBase: 0.001 },
      { id: "l", label: "Litres", toBase: 1 },
      { id: "m3", label: "Cubic metres", toBase: 1000 },
      { id: "tsp", label: "Teaspoons (US)", toBase: 0.00492892159375 },
      { id: "tbsp", label: "Tablespoons (US)", toBase: 0.01478676478125 },
      { id: "floz", label: "Fluid ounces (US)", toBase: 0.0295735295625 },
      { id: "cup", label: "Cups (US)", toBase: 0.2365882365 },
      { id: "pt", label: "Pints (US)", toBase: 0.473176473 },
      { id: "gal", label: "Gallons (US)", toBase: 3.785411784 },
    ],
  },
  {
    id: "speed",
    label: "Speed",
    base: "m/s",
    units: [
      { id: "ms", label: "Metres/second", toBase: 1 },
      { id: "kmh", label: "Kilometres/hour", toBase: 1 / 3.6 },
      { id: "mph", label: "Miles/hour", toBase: 0.44704 },
      { id: "kn", label: "Knots", toBase: 0.514444444444 },
      { id: "fts", label: "Feet/second", toBase: 0.3048 },
    ],
  },
  {
    id: "data",
    label: "Data size",
    base: "B",
    units: [
      { id: "b", label: "Bits", toBase: 0.125 },
      { id: "B", label: "Bytes", toBase: 1 },
      { id: "kb", label: "Kilobytes (1000)", toBase: 1000 },
      { id: "Kib", label: "Kibibytes (1024)", toBase: 1024 },
      { id: "mb", label: "Megabytes (1000)", toBase: 1e6 },
      { id: "Mib", label: "Mebibytes (1024)", toBase: 1048576 },
      { id: "gb", label: "Gigabytes (1000)", toBase: 1e9 },
      { id: "Gib", label: "Gibibytes (1024)", toBase: 1073741824 },
    ],
  },
  {
    id: "time",
    label: "Time",
    base: "s",
    units: [
      { id: "ms", label: "Milliseconds", toBase: 0.001 },
      { id: "s", label: "Seconds", toBase: 1 },
      { id: "min", label: "Minutes", toBase: 60 },
      { id: "h", label: "Hours", toBase: 3600 },
      { id: "d", label: "Days", toBase: 86400 },
      { id: "wk", label: "Weeks", toBase: 604800 },
      { id: "yr", label: "Years (365d)", toBase: 31536000 },
    ],
  },
];

export function convertUnit(value: number, from: UnitDef, to: UnitDef): number {
  return (value * from.toBase) / to.toBase;
}

export const TEMPERATURES: { id: string; label: string }[] = [
  { id: "C", label: "Celsius" },
  { id: "F", label: "Fahrenheit" },
  { id: "K", label: "Kelvin" },
];

export function convertTemp(value: number, from: string, to: string): number {
  const c = from === "C" ? value : from === "F" ? ((value - 32) * 5) / 9 : value - 273.15;
  return to === "C" ? c : to === "F" ? (c * 9) / 5 + 32 : c + 273.15;
}
