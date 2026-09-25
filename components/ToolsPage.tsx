"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { CloseIcon, PdfIcon, ImageIcon, TemplateIcon, WrenchIcon, FileIcon, SearchIcon } from "./Icons";
import { convertFileToPdf } from "@/lib/fileToPdf";
import {
  DEFAULT_EDIT,
  IMAGE_FORMATS,
  downloadDataUrl,
  formatBytes,
  loadImageFile,
  renderImage,
  type EditOptions,
  type ImageFormat,
} from "@/lib/imageTools";
import {
  TEMPERATURES,
  UNIT_CATEGORIES,
  convertCase,
  convertTemp,
  convertUnit,
  countText,
  crc32,
  decodeBase64,
  encodeBase64,
  evaluateExpression,
  formatJson,
  formatXml,
  fromUnix,
  humanBytesTime,
  jsonToCsv,
  csvToJson,
  minifyJson,
  password,
  randomString,
  sha256,
  slugify,
  unixTimestamp,
  urlDecode,
  urlEncode,
  uuidV4,
  type CaseMode,
} from "@/lib/textTools";
import { coerceRows, parseCsv as parseCsvRows, useSandbox } from "@/lib/sandbox";

type Tab = "pdf" | "image" | "text" | "calc" | "data" | "make";

const TABS: { id: Tab; label: string; icon: (p: { size?: number }) => ReactElement }[] = [
  { id: "pdf", label: "PDF", icon: PdfIcon },
  { id: "image", label: "Image", icon: ImageIcon },
  { id: "text", label: "Text & developer", icon: TemplateIcon },
  { id: "calc", label: "Calculators", icon: WrenchIcon },
  { id: "data", label: "Data analysis", icon: FileIcon },
  { id: "make", label: "Generate", icon: SearchIcon },
];

/* ============================== PDF tools =============================== */

function PdfTools({ notify }: { notify: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<{ name: string; ok: boolean; msg: string }[]>([]);
  const pdfRef = useRef<HTMLInputElement | null>(null);

  const handle = useCallback(
    async (list: FileList | null) => {
      if (!list?.length) return;
      setBusy(true);
      const next: typeof log = [];
      for (const file of Array.from(list)) {
        const res = await convertFileToPdf(file);
        next.push({ name: file.name, ok: res.ok, msg: res.message });
      }
      setLog((prev) => [...next, ...prev]);
      setBusy(false);
      notify(next.some((n) => n.ok) ? "PDF ready — choose Save as PDF" : next[0]?.msg || "Nothing converted");
    },
    [notify],
  );

  return (
    <div className="tp-col">
      <p className="tp-lede">
        Turn anything into a PDF. Images get one page each, documents and text files are typeset into a paginated
        document, and an existing PDF passes straight through. Everything runs in your browser.
      </p>

      <input
        ref={pdfRef}
        type="file"
        multiple
        accept=".pdf,.docx,image/*,.txt,.md,.markdown,.csv,.tsv,.json,.yaml,.yml,.html,.htm,.xml,.rtf,.log,text/*,application/pdf"
        hidden
        onChange={(e) => {
          void handle(e.target.files);
          e.target.value = "";
        }}
      />

      <div className="tp-drop" onClick={() => pdfRef.current?.click()} role="button" tabIndex={0}>
        <PdfIcon size={26} />
        <b>{busy ? "Converting…" : "Choose files to convert"}</b>
        <small>PDF · DOCX · images · TXT · MD · CSV · JSON · HTML · RTF and 30+ code formats</small>
      </div>

      {log.length ? (
        <ul className="tp-list">
          {log.map((r, i) => (
            <li key={`${r.name}-${i}`} className={r.ok ? "ok" : "bad"}>
              <span className="nm">{r.name}</span>
              <span className="ms">{r.msg}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/* ============================ Image tools =============================== */

function ImageTools({ notify }: { notify: (m: string) => void }) {
  const [src, setSrc] = useState<HTMLImageElement | null>(null);
  const [name, setName] = useState("image");
  const [opts, setOpts] = useState<EditOptions>(DEFAULT_EDIT);
  const [wIn, setWIn] = useState("");
  const [hIn, setHIn] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  const set = <K extends keyof EditOptions>(k: K, v: EditOptions[K]) => setOpts((o) => ({ ...o, [k]: v }));

  const out = useMemo(() => {
    if (!src) return null;
    try {
      return renderImage(src, opts);
    } catch {
      return null;
    }
  }, [src, opts]);

  const srcBytes = useMemo(() => {
    if (!src) return 0;
    const c = document.createElement("canvas");
    c.width = src.naturalWidth;
    c.height = src.naturalHeight;
    const ctx = c.getContext("2d");
    if (!ctx) return 0;
    ctx.drawImage(src, 0, 0);
    const url = c.toDataURL("image/png");
    return Math.floor(((url.length - url.indexOf(",")) * 3) / 4);
  }, [src]);

  const pick = async (f: File | undefined) => {
    if (!f) return;
    try {
      const img = await loadImageFile(f);
      setSrc(img);
      setName(f.name);
      setWIn(String(img.naturalWidth));
      setHIn(String(img.naturalHeight));
      setOpts((o) => ({ ...o, width: img.naturalWidth, height: img.naturalHeight, format: o.format }));
      notify(`Loaded ${f.name}`);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not read that image");
    }
  };

  const meta = IMAGE_FORMATS.find((f) => f.id === opts.format) ?? IMAGE_FORMATS[0];

  return (
    <div className="tp-col">
      <p className="tp-lede">Convert, resize, compress, rotate and flip. Nothing is uploaded.</p>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          void pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {!src ? (
        <div className="tp-drop" onClick={() => fileRef.current?.click()} role="button" tabIndex={0}>
          <ImageIcon size={26} />
          <b>Choose an image</b>
          <small>PNG, JPEG, WebP, GIF, AVIF, SVG and more</small>
        </div>
      ) : (
        <div className="tp-img">
          <div className="tp-img-side">
            <div className="tp-field">
              <label>Source</label>
              <p className="tp-dim">
                {name} · {src.naturalWidth}×{src.naturalHeight} · {formatBytes(srcBytes)}
              </p>
              <button type="button" className="tp-btn" onClick={() => fileRef.current?.click()}>
                Replace
              </button>
            </div>

            <div className="tp-field">
              <label>Format</label>
              <div className="tp-seg">
                {IMAGE_FORMATS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className={opts.format === f.id ? "on" : ""}
                    onClick={() => set("format", f.id as ImageFormat)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {opts.format !== "image/png" ? (
              <>
                <div className="tp-field">
                  <label>
                    Quality · {Math.round(opts.quality * 100)}%
                  </label>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    value={Math.round(opts.quality * 100)}
                    onChange={(e) => set("quality", Number(e.target.value) / 100)}
                  />
                </div>
                {!meta.alpha ? (
                  <div className="tp-field">
                    <label>Background (no transparency)</label>
                    <input type="color" value={opts.background} onChange={(e) => set("background", e.target.value)} />
                  </div>
                ) : null}
              </>
            ) : null}

            <div className="tp-field">
              <label>Size</label>
              <div className="tp-row">
                <input
                  type="number"
                  min={1}
                  placeholder="width"
                  value={wIn}
                  onChange={(e) => {
                    setWIn(e.target.value);
                    set("width", e.target.value ? Number(e.target.value) : null);
                  }}
                />
                <span className="tp-x">×</span>
                <input
                  type="number"
                  min={1}
                  placeholder="height"
                  value={hIn}
                  onChange={(e) => {
                    setHIn(e.target.value);
                    set("height", e.target.value ? Number(e.target.value) : null);
                  }}
                />
              </div>
              <div className="tp-btns">
                {[
                  ["50%", 0.5],
                  ["25%", 0.25],
                  ["200%", 2],
                ].map(([label, k]) => (
                  <button
                    key={label as string}
                    type="button"
                    className="tp-btn sm"
                    onClick={() => {
                      const w = Math.max(1, Math.round(src.naturalWidth * (k as number)));
                      const h = Math.max(1, Math.round(src.naturalHeight * (k as number)));
                      setWIn(String(w));
                      setHIn(String(h));
                      setOpts((o) => ({ ...o, width: w, height: h }));
                    }}
                  >
                    {label as string}
                  </button>
                ))}
                <button
                  type="button"
                  className="tp-btn sm"
                  onClick={() => {
                    setWIn(String(src.naturalWidth));
                    setHIn(String(src.naturalHeight));
                    setOpts((o) => ({ ...o, width: src.naturalWidth, height: src.naturalHeight }));
                  }}
                >
                  Original
                </button>
              </div>
            </div>

            <div className="tp-field">
              <label>Rotate &amp; flip</label>
              <div className="tp-btns">
                {([0, 90, 180, 270] as const).map((deg) => (
                  <button key={deg} type="button" className={`tp-btn sm${opts.rotate === deg ? " on" : ""}`} onClick={() => set("rotate", deg)}>
                    {deg}°
                  </button>
                ))}
                <button type="button" className={`tp-btn sm${opts.flipH ? " on" : ""}`} onClick={() => set("flipH", !opts.flipH)}>
                  Flip H
                </button>
                <button type="button" className={`tp-btn sm${opts.flipV ? " on" : ""}`} onClick={() => set("flipV", !opts.flipV)}>
                  Flip V
                </button>
              </div>
            </div>
          </div>

          <div className="tp-img-main">
            {out ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={out.dataUrl} alt="Result" />
                <div className="tp-img-meta">
                  <span>
                    {out.width}×{out.height}
                  </span>
                  <span>{formatBytes(out.bytes)}</span>
                  {srcBytes ? (
                    <span className={out.bytes <= srcBytes ? "good" : "bad"}>
                      {out.bytes <= srcBytes ? "−" : "+"}
                      {Math.abs(Math.round(((out.bytes - srcBytes) / srcBytes) * 100))}%
                    </span>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="tp-btn primary"
                  onClick={() => {
                    const base = name.replace(/\.[^.]+$/, "") || "image";
                    downloadDataUrl(out.dataUrl, `${base}.${meta.ext}`);
                    notify(`Saved ${base}.${meta.ext}`);
                  }}
                >
                  Download {meta.label}
                </button>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

/* ========================= Text and developer =========================== */

const CASES: { id: CaseMode; label: string }[] = [
  { id: "upper", label: "UPPERCASE" },
  { id: "lower", label: "lowercase" },
  { id: "title", label: "Title Case" },
  { id: "sentence", label: "Sentence case" },
  { id: "camel", label: "camelCase" },
  { id: "pascal", label: "PascalCase" },
  { id: "snake", label: "snake_case" },
  { id: "kebab", label: "kebab-case" },
  { id: "constant", label: "CONSTANT_CASE" },
  { id: "alternating", label: "aLtErNaTiNg" },
  { id: "inverse", label: "iNVERSE" },
];

function TextTools({ notify }: { notify: (m: string) => void }) {
  const [input, setInput] = useState("");
  const [out, setOut] = useState("");
  const [err, setErr] = useState("");

  const run = (label: string, fn: () => string | Promise<string>) => {
    setErr("");
    try {
      const r = fn();
      if (typeof r === "string") {
        setOut(r);
        notify(`${label} done`);
      } else {
        void r.then((v) => {
          setOut(v);
          notify(`${label} done`);
        });
      }
    } catch (e) {
      const m = e instanceof Error ? e.message : "That input could not be processed.";
      setErr(m);
      setOut("");
      notify(m);
    }
  };

  const counts = useMemo(() => countText(input), [input]);

  const copy = () => {
    void navigator.clipboard
      .writeText(out)
      .then(() => notify("Copied"))
      .catch(() => notify("Copy failed — select the text manually"));
  };

  return (
    <div className="tp-col">
      <p className="tp-lede">Word counts, case conversion, formatters, encoding and generators. All local.</p>

      <div className="tp-io">
        <div className="tp-io-in">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Paste or type text, JSON, XML, CSV, base64, a URL…"
            spellCheck={false}
          />
          <div className="tp-stats">
            <span>{counts.words} words</span>
            <span>{counts.chars} chars</span>
            <span>{counts.sentences} sentences</span>
            <span>{counts.paragraphs} paragraphs</span>
            <span>~{counts.readingMinutes} min read</span>
            <span>~{counts.speakingMinutes} min speech</span>
          </div>
        </div>

        <div className="tp-io-mid">
          <div className="tp-grp">
            <b>Change case</b>
            <div className="tp-btns">
              {CASES.map((c) => (
                <button key={c.id} type="button" className="tp-btn sm" onClick={() => run(c.label, () => convertCase(input, c.id))}>
                  {c.label}
                </button>
              ))}
            </div>
            <div className="tp-btns">
              <button type="button" className="tp-btn sm" onClick={() => run("Slug", () => slugify(input))}>
                Slug
              </button>
              <button
                type="button"
                className="tp-btn sm"
                onClick={() =>
                  run("Reversed", () => Array.from(input).reverse().join(""))
                }
              >
                Reverse
              </button>
              <button
                type="button"
                className="tp-btn sm"
                onClick={() =>
                  run("Deduped", () =>
                    Array.from(new Set(input.split("\n").map((l) => l.trim()).filter(Boolean))).join("\n")
                  )
                }
              >
                Dedupe lines
              </button>
            </div>
          </div>

          <div className="tp-grp">
            <b>Format</b>
            <div className="tp-btns">
              <button type="button" className="tp-btn sm" onClick={() => run("JSON", () => formatJson(input, 2))}>
                JSON pretty
              </button>
              <button type="button" className="tp-btn sm" onClick={() => run("JSON", () => minifyJson(input))}>
                JSON minify
              </button>
              <button type="button" className="tp-btn sm" onClick={() => run("XML", () => formatXml(input, 2))}>
                XML pretty
              </button>
              <button type="button" className="tp-btn sm" onClick={() => run("CSV", () => csvToJson(input))}>
                CSV → JSON
              </button>
              <button type="button" className="tp-btn sm" onClick={() => run("JSON", () => jsonToCsv(input))}>
                JSON → CSV
              </button>
            </div>
          </div>

          <div className="tp-grp">
            <b>Encode</b>
            <div className="tp-btns">
              <button type="button" className="tp-btn sm" onClick={() => run("Base64", () => encodeBase64(input))}>
                Base64 encode
              </button>
              <button type="button" className="tp-btn sm" onClick={() => run("Base64", () => decodeBase64(input))}>
                Base64 decode
              </button>
              <button type="button" className="tp-btn sm" onClick={() => run("URL", () => urlEncode(input))}>
                URL encode
              </button>
              <button type="button" className="tp-btn sm" onClick={() => run("URL", () => urlDecode(input))}>
                URL decode
              </button>
            </div>
          </div>

          <div className="tp-grp">
            <b>Hashes</b>
            <div className="tp-btns">
              <button type="button" className="tp-btn sm" onClick={() => run("SHA-256", () => sha256(input))}>
                SHA-256
              </button>
              <button type="button" className="tp-btn sm" onClick={() => run("CRC32", () => crc32(input))}>
                CRC32
              </button>
            </div>
          </div>

          <div className="tp-grp">
            <b>Generate</b>
            <div className="tp-btns">
              <button type="button" className="tp-btn sm" onClick={() => run("UUID", () => uuidV4())}>
                UUID v4
              </button>
              <button type="button" className="tp-btn sm" onClick={() => run("Password", () => password(20))}>
                Password
              </button>
              <button type="button" className="tp-btn sm" onClick={() => run("Token", () => randomString(32))}>
                32-char token
              </button>
              <button type="button" className="tp-btn sm" onClick={() => run("Timestamp", () => unixTimestamp(Date.now()))}>
                Unix now
              </button>
              <button type="button" className="tp-btn sm" onClick={() => run("Date", () => fromUnix(input))}>
                Unix → date
              </button>
              <button type="button" className="tp-btn sm" onClick={() => run("ISO", () => new Date().toISOString())}>
                ISO now
              </button>
            </div>
          </div>
        </div>

        <div className="tp-io-out">
          <div className="tp-out-head">
            <b>Output</b>
            <div className="tp-btns">
              <button type="button" className="tp-btn sm" onClick={copy} disabled={!out}>
                Copy
              </button>
              <button
                type="button"
                className="tp-btn sm"
                disabled={!out}
                onClick={() => {
                  setOut("");
                  setErr("");
                }}
              >
                Clear
              </button>
            </div>
          </div>
          {err ? <p className="tp-err">{err}</p> : null}
          <textarea value={out} readOnly placeholder="Results appear here" spellCheck={false} />
        </div>
      </div>
    </div>
  );
}

/* ============================ Calculators =============================== */

function CalcTools() {
  const [expr, setExpr] = useState("");
  const [res, setRes] = useState("");
  const [err, setErr] = useState("");

  const [catId, setCatId] = useState(UNIT_CATEGORIES[0].id);
  const cat = UNIT_CATEGORIES.find((c) => c.id === catId) ?? UNIT_CATEGORIES[0];
  const [fromId, setFromId] = useState(cat.units[2].id);
  const [toId, setToId] = useState(cat.units[2].id);
  const [amount, setAmount] = useState("1");

  useEffect(() => {
    // Unit ids repeat across categories, so reset both sides when it changes.
    const mid = cat.units[Math.floor(cat.units.length / 2)];
    setFromId(mid.id);
    setToId(mid.id);
  }, [cat]);

  const [tVal, setTVal] = useState("0");
  const [tFrom, setTFrom] = useState("C");
  const [tTo, setTTo] = useState("F");

  const [pct, setPct] = useState({ a: "", b: "", mode: "of" });

  const evaluate = () => {
    setErr("");
    try {
      setRes(String(evaluateExpression(expr)));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not evaluate");
      setRes("");
    }
  };

  const from = cat.units.find((u) => u.id === fromId) ?? cat.units[0];
  const to = cat.units.find((u) => u.id === toId) ?? cat.units[0];
  const n = Number(amount);
  const unitOut = Number.isFinite(n) ? convertUnit(n, from, to) : NaN;
  const tn = Number(tVal);
  const tempOut = Number.isFinite(tn) ? convertTemp(tn, tFrom, tTo) : NaN;
  const pa = Number(pct.a);
  const pb = Number(pct.b);
  const pctOut = (() => {
    if (!Number.isFinite(pa) || !Number.isFinite(pb)) return NaN;
    if (pct.mode === "of") return (pa * pb) / 100;
    if (pct.mode === "what") return pb === 0 ? NaN : (pa / pb) * 100;
    return pa + (pa * pb) / 100;
  })();

  const fmt = (v: number) => (Number.isFinite(v) ? String(Math.round(v * 1e10) / 1e10) : "—");

  return (
    <div className="tp-col">
      <p className="tp-lede">Instant maths. Nothing is sent anywhere.</p>

      <div className="tp-cards">
        <section className="tp-card">
          <h3>Calculator</h3>
          <p className="tp-dim">Supports + − × ÷ % ^ and brackets.</p>
          <input
            className="tp-big"
            value={expr}
            onChange={(e) => setExpr(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") evaluate();
            }}
            placeholder="(12 + 8) * 3 / 4"
            spellCheck={false}
          />
          <div className="tp-btns">
            <button type="button" className="tp-btn primary" onClick={evaluate}>
              Calculate
            </button>
            {["+", "−", "×", "÷", "(", ")", "%", "^"].map((k) => (
              <button key={k} type="button" className="tp-btn sm" onClick={() => setExpr((s) => s + k)}>
                {k}
              </button>
            ))}
            <button type="button" className="tp-btn sm" onClick={() => setExpr("")}>
              Clear
            </button>
          </div>
          {err ? <p className="tp-err">{err}</p> : null}
          {res ? <p className="tp-result">{res}</p> : null}
        </section>

        <section className="tp-card">
          <h3>Unit converter</h3>
          <select value={catId} onChange={(e) => setCatId(e.target.value)}>
            {UNIT_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <div className="tp-row">
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <select value={fromId} onChange={(e) => setFromId(e.target.value)}>
              {cat.units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>
          <div className="tp-row">
            <span className="tp-x">=</span>
            <select value={toId} onChange={(e) => setToId(e.target.value)}>
              {cat.units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>
          <p className="tp-result">{fmt(unitOut)}</p>
        </section>

        <section className="tp-card">
          <h3>Temperature</h3>
          <input type="number" value={tVal} onChange={(e) => setTVal(e.target.value)} />
          <div className="tp-row">
            <select value={tFrom} onChange={(e) => setTFrom(e.target.value)}>
              {TEMPERATURES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            <span className="tp-x">→</span>
            <select value={tTo} onChange={(e) => setTTo(e.target.value)}>
              {TEMPERATURES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <p className="tp-result">{fmt(tempOut)}</p>
        </section>

        <section className="tp-card">
          <h3>Percentages</h3>
          <div className="tp-seg">
            {[
              ["of", "% of"],
              ["what", "X is what %"],
              ["change", "increase by %"],
            ].map(([id, label]) => (
              <button key={id} type="button" className={pct.mode === id ? "on" : ""} onClick={() => setPct((p) => ({ ...p, mode: id }))}>
                {label}
              </button>
            ))}
          </div>
          <div className="tp-row">
            <input type="number" placeholder="A" value={pct.a} onChange={(e) => setPct((p) => ({ ...p, a: e.target.value }))} />
            <input type="number" placeholder="B" value={pct.b} onChange={(e) => setPct((p) => ({ ...p, b: e.target.value }))} />
          </div>
          <p className="tp-result">{fmt(pctOut)}</p>
        </section>
      </div>
    </div>
  );
}

/* =========================== Data analysis ============================== */

const DEFAULT_CODE = `// rows is an array of objects. Use console.log() to print results.
const cols = Object.keys(rows[0] || {});
console.log(cols.join(", "), "→", rows.length, "rows");

// Numeric column totals
for (const c of cols) {
  const nums = rows.map(r => Number(r[c])).filter(n => Number.isFinite(n));
  if (nums.length === rows.length && nums.length) {
    const sum = nums.reduce((a, b) => a + b, 0);
    const avg = sum / nums.length;
    console.log(c, "sum:", sum, "avg:", Math.round(avg * 100) / 100,
                "min:", Math.min(...nums), "max:", Math.max(...nums));
  }
}
`;

function DataTools({ notify }: { notify: (m: string) => void }) {
  const [csv, setCsv] = useState("");
  const [code, setCode] = useState(DEFAULT_CODE);
  const { run, running } = useSandbox();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const parsed = useMemo(() => {
    if (!csv.trim()) return null;
    try {
      const p = parseCsvRows(csv);
      return { ...p, typed: coerceRows(p.rows) };
    } catch {
      return null;
    }
  }, [csv]);

  const go = async () => {
    if (!parsed) return notify("Load a CSV first");
    const res = await run(code, parsed.typed);
    if (!res.ok) notify(res.error || "Analysis failed");
  };

  return (
    <div className="tp-col">
      <p className="tp-lede">
        Drop in a CSV, then write JavaScript against it. Your code runs in a locked-down Web Worker with no network or
        storage access, and is killed after 5 seconds.
      </p>

      <input
        ref={fileRef}
        type="file"
        accept=".csv,.tsv,text/csv"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setCsv(await f.text());
          notify(`Loaded ${f.name}`);
        }}
      />

      <div className="tp-io">
        <div className="tp-io-in">
          <div className="tp-out-head">
            <b>CSV data</b>
            <button type="button" className="tp-btn sm" onClick={() => fileRef.current?.click()}>
              Load CSV
            </button>
          </div>
          <textarea value={csv} onChange={(e) => setCsv(e.target.value)} placeholder="name,qty,price&#10;Widget,3,9.99" spellCheck={false} />
          {parsed ? (
            <div className="tp-stats">
              <span>{parsed.typed.length} rows</span>
              <span>{parsed.columns.length} columns</span>
              {parsed.columns.slice(0, 4).map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="tp-io-mid">
          <div className="tp-out-head">
            <b>Analysis code</b>
            <button type="button" className="tp-btn primary sm" onClick={() => void go()} disabled={running || !parsed}>
              {running ? "Running…" : "Run"}
            </button>
          </div>
          <textarea className="tp-code" value={code} onChange={(e) => setCode(e.target.value)} spellCheck={false} />
        </div>
      </div>
    </div>
  );
}

/* ============================== Generate ================================ */

interface GenProps {
  model: string;
  apiKey: string;
  baseUrl: string;
  signedIn: boolean;
  notify: (m: string) => void;
}

function GenerateTools({ model, apiKey, baseUrl, signedIn, notify }: GenProps) {
  const [kind, setKind] = useState<"doc" | "image">("doc");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [imgUrl, setImgUrl] = useState("");
  const [err, setErr] = useState("");

  const go = async () => {
    if (!prompt.trim()) return notify("Describe what you want first");
    if (kind === "image" && !signedIn) return notify("Log in to create images");
    setBusy(true);
    setErr("");
    setResult("");
    setImgUrl("");

    try {
      if (kind === "doc") {
        const r = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(apiKey ? { "x-api-key": apiKey } : {}) },
          body: JSON.stringify({ messages: [{ role: "user", content: prompt }], model, stream: false }),
        });
        if (!r.ok) {
          const j = await r.json().catch(() => ({ error: r.statusText }));
          throw new Error(j.error || `Request failed (${r.status})`);
        }
        const j = await r.json();
        const text: string = j.content ?? j.text ?? j.choices?.[0]?.message?.content ?? "";
        setResult(String(text).trim());
      } else {
        const r = await fetch("/api/image", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(apiKey ? { "x-api-key": apiKey } : {}) },
          body: JSON.stringify({ prompt, baseUrl, size: "1024x1024" }),
        });
        const j = await r.json();
        if (!r.ok || j.error) throw new Error(j.error || "Image generation failed");
        setImgUrl(j.url || j.dataUrl || "");
      }
    } catch (e) {
      const m = e instanceof Error ? e.message : "Something went wrong";
      setErr(m);
      notify(m);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tp-col">
      <p className="tp-lede">One-shot generation with no chat thread. Answers come from the live model.</p>

      <div className="tp-seg">
        <button type="button" className={kind === "doc" ? "on" : ""} onClick={() => setKind("doc")}>
          Document or answer
        </button>
        <button type="button" className={kind === "image" ? "on" : ""} onClick={() => setKind("image")}>
          Image
        </button>
      </div>

      <textarea
        className="tp-prompt"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={
          kind === "doc"
            ? "e.g. Write a one-page project brief for a habit-tracking app, with goals and milestones."
            : "e.g. A minimalist line illustration of a desk lamp at dusk, warm palette"
        }
      />

      <div className="tp-btns">
        <button type="button" className="tp-btn primary" onClick={() => void go()} disabled={busy}>
          {busy ? "Working…" : kind === "doc" ? "Generate" : "Create image"}
        </button>
        {result ? (
          <>
            <button
              type="button"
              className="tp-btn sm"
              onClick={() => void navigator.clipboard.writeText(result).then(() => notify("Copied"))}
            >
              Copy
            </button>
            <button
              type="button"
              className="tp-btn sm"
              onClick={() => {
                setPrompt("");
                setResult("");
                setErr("");
              }}
            >
              Clear
            </button>
          </>
        ) : null}
      </div>

      {err ? <p className="tp-err">{err}</p> : null}

      {result ? (
        <div className="tp-io-out">
          <div className="tp-out-head">
            <b>Result</b>
            <span className="tp-dim">{model}</span>
          </div>
          <textarea value={result} readOnly />
        </div>
      ) : null}

      {imgUrl ? (
        <div className="tp-gen-img">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imgUrl} alt="Generated" />
          <a className="tp-btn sm" href={`/api/image-proxy?url=${encodeURIComponent(imgUrl)}`} download>
            Download
          </a>
        </div>
      ) : null}
    </div>
  );
}

/* ================================ page ================================== */

export default function ToolsPage({
  onClose,
  notify,
  model,
  apiKey,
  baseUrl,
  signedIn,
}: GenProps & { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("pdf");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="tools-page" role="dialog" aria-modal="true" aria-label="Tools">
      <header className="tp-head">
        <h1>Tools</h1>
        <button type="button" className="tp-close" onClick={onClose} aria-label="Close tools" title="Close">
          <CloseIcon />
        </button>
      </header>

      <nav className="tp-tabs" role="tablist">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`tp-tab${tab === t.id ? " on" : ""}`}
              onClick={() => setTab(t.id)}
            >
              <Icon size={16} />
              {t.label}
            </button>
          );
        })}
      </nav>

      <div className="tp-body">
        {tab === "pdf" ? <PdfTools notify={notify} /> : null}
        {tab === "image" ? <ImageTools notify={notify} /> : null}
        {tab === "text" ? <TextTools notify={notify} /> : null}
        {tab === "calc" ? <CalcTools /> : null}
        {tab === "data" ? <DataTools notify={notify} /> : null}
        {tab === "make" ? (
          <GenerateTools model={model} apiKey={apiKey} baseUrl={baseUrl} signedIn={signedIn} notify={notify} />
        ) : null}
      </div>
    </div>
  );
}
