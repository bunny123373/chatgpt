"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CloseIcon, DownloadIcon, PlusIcon, TrashIcon } from "./Icons";
import {
  buildScale,
  fixContrast,
  hslToHex,
  parseColor,
  readableInk,
  rgbToHex,
  rgbToHsl,
  rgbToHsv,
  wcag,
  type Rgb,
} from "@/lib/colorTools";
import { encodeQr, qrCapacity, qrToCanvas, type EcLevel } from "@/lib/qrcode";
import { URL_PRESETS, buildUrl, describeQuery, parseUrl, type BuildOptions } from "@/lib/urlTools";
import { downloadBlob } from "@/lib/pdfWriter";

/* ============================ Colour tools ============================== */

function Swatch({ rgb, label, value }: { rgb: Rgb; label: string; value: string }) {
  const ink = readableInk(rgb);
  return (
    <div className="ct-swatch" style={{ background: rgbToHex(rgb), color: rgbToHex(ink) }}>
      <b>{label}</b>
      <small>{value}</small>
    </div>
  );
}

export function ColourTools() {
  const [text, setText] = useState("#3b82f6");
  const rgb = useMemo(() => parseColor(text), [text]);
  const [bgText, setBgText] = useState("#ffffff");
  const bg = useMemo(() => parseColor(bgText), [bgText]);
  const [fixed, setFixed] = useState<Rgb | null>(null);

  const hsl = rgb ? rgbToHsl(rgb) : null;
  const hsv = rgb ? rgbToHsv(rgb) : null;
  const result = rgb && bg ? wcag(rgb, bg) : null;
  const scale = useMemo(() => (rgb ? buildScale(rgb) : []), [rgb]);

  const copy = (v: string) => void navigator.clipboard.writeText(v);

  return (
    <div className="tp-col">
      <p className="tp-lede">
        Convert between hex, RGB, HSL and HSV, and check the contrast against a background against the WCAG AA and AAA
        thresholds. Everything runs locally.
      </p>

      <div className="tp-io">
        <div className="tp-io-in">
          <div className="tp-out-head">
            <b>Foreground colour</b>
          </div>
          <input className="tp-color-input" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
          <div className="tp-field">
            <label>Native picker</label>
            <input
              type="color"
              value={rgb ? rgbToHex(rgb) : "#000000"}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
          {rgb ? (
            <div className="ct-sliders">
              <label>
                <span>R</span>
                <input
                  type="range"
                  min={0}
                  max={255}
                  value={rgb.r}
                  onChange={(e) => setText(`rgb(${e.target.value}, ${rgb.g}, ${rgb.b})`)}
                />
                <b>{rgb.r}</b>
              </label>
              <label>
                <span>G</span>
                <input
                  type="range"
                  min={0}
                  max={255}
                  value={rgb.g}
                  onChange={(e) => setText(`rgb(${rgb.r}, ${e.target.value}, ${rgb.b})`)}
                />
                <b>{rgb.g}</b>
              </label>
              <label>
                <span>B</span>
                <input
                  type="range"
                  min={0}
                  max={255}
                  value={rgb.b}
                  onChange={(e) => setText(`rgb(${rgb.r}, ${rgb.g}, ${e.target.value})`)}
                />
                <b>{rgb.b}</b>
              </label>
            </div>
          ) : null}
        </div>

        <div className="tp-io-mid">
          <div className="tp-grp">
            <b>Formats — click to copy</b>
            {rgb && hsl && hsv ? (
              <div className="ct-formats">
                <button type="button" onClick={() => copy(rgbToHex(rgb))}>
                  <small>HEX</small>
                  <code>{rgbToHex(rgb)}</code>
                </button>
                <button type="button" onClick={() => copy(`rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`)}>
                  <small>RGB</small>
                  <code>
                    {rgb.r}, {rgb.g}, {rgb.b}
                  </code>
                </button>
                <button type="button" onClick={() => copy(`hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`)}>
                  <small>HSL</small>
                  <code>
                    {hsl.h}, {hsl.s}%, {hsl.l}%
                  </code>
                </button>
                <button type="button" onClick={() => copy(`hsv(${hsv.h}, ${hsv.s}%, ${hsv.v}%)`)}>
                  <small>HSV</small>
                  <code>
                    {hsv.h}, {hsv.s}%, {hsv.v}%
                  </code>
                </button>
              </div>
            ) : (
              <p className="tp-err">Unrecognised colour. Try #3b82f6, rgb(59,130,246), hsl(217,91%,60%) or a name.</p>
            )}
          </div>
        </div>

        <div className="tp-io-out">
          <div className="tp-out-head">
            <b>Contrast against a background</b>
          </div>
          <input className="tp-color-input" value={bgText} onChange={(e) => setBgText(e.target.value)} spellCheck={false} />

          {result && rgb && bg ? (
            <>
              <div className="ct-preview" style={{ background: rgbToHex(bg), color: rgbToHex(rgb) }}>
                <b>The quick brown fox</b>
                <small>jumps over the lazy dog</small>
              </div>
              <p className="ct-ratio">
                {result.ratio.toFixed(2)}<small>:1</small>
              </p>
              <ul className="ct-list">
                <li className={result.aaNormal ? "pass" : "fail"}>
                  AA normal text <em>4.5:1</em>
                </li>
                <li className={result.aaaNormal ? "pass" : "fail"}>
                  AAA normal text <em>7:1</em>
                </li>
                <li className={result.aaLarge ? "pass" : "fail"}>
                  AA large text <em>3:1</em>
                </li>
                <li className={result.aaUi ? "pass" : "fail"}>
                  UI components <em>3:1</em>
                </li>
              </ul>
              {result.aaNormal ? null : (
                <div className="tp-btns">
                  <button
                    type="button"
                    className="tp-btn sm"
                    onClick={() => setFixed(fixContrast(rgb, bg, 4.5))}
                  >
                    Suggest 4.5:1
                  </button>
                  <button
                    type="button"
                    className="tp-btn sm"
                    onClick={() => setFixed(fixContrast(rgb, bg, 7))}
                  >
                    Suggest 7:1
                  </button>
                </div>
              )}
              {fixed ? (
                <div className="ct-fixed">
                  <Swatch rgb={fixed} label="Suggested" value={rgbToHex(fixed)} />
                  <button type="button" className="tp-btn sm" onClick={() => copy(rgbToHex(fixed))}>
                    Copy
                  </button>
                  <button type="button" className="tp-btn sm" onClick={() => setFixed(null)}>
                    Dismiss
                  </button>
                </div>
              ) : null}
            </>
          ) : null}

          {rgb ? (
            <>
              <div className="tp-out-head">
                <b>Tint and shade scale</b>
              </div>
              <div className="ct-scale">
                {scale.map((s) => (
                  <button
                    key={s.hex}
                    type="button"
                    className="ct-stop"
                    style={{ background: s.hex, color: s.contrastOnBlack > s.contrastOnWhite ? "#000" : "#fff" }}
                    onClick={() => copy(s.hex)}
                    title={`${s.hex} — ${s.contrastOnBlack.toFixed(1)}:1 on black, ${s.contrastOnWhite.toFixed(1)}:1 on white`}
                  >
                    <span>{s.lightness}</span>
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ============================== QR codes ================================ */

const EC_LEVELS: { id: EcLevel; label: string; note: string }[] = [
  { id: "L", label: "Low", note: "7% recovery, smallest" },
  { id: "M", label: "Medium", note: "15% recovery" },
  { id: "Q", label: "Quartile", note: "25% recovery" },
  { id: "H", label: "High", note: "30% recovery, most robust" },
];

export function QrTools({ notify }: { notify: (m: string) => void }) {
  const [value, setValue] = useState("https://xkiro.com");
  const [ec, setEc] = useState<EcLevel>("M");
  const [dark, setDark] = useState("#000000");
  const [light, setLight] = useState("#ffffff");
  const [scale, setScale] = useState(8);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState("");

  const bytes = useMemo(() => new TextEncoder().encode(value).length, [value]);
  const capacity = qrCapacity(ec);

  const result = useMemo(() => {
    setError("");
    if (!value.trim()) return null;
    try {
      return encodeQr(value, ec);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not encode that.");
      return null;
    }
  }, [value, ec]);

  // Keep the preview canvas in step with the settings.
  useEffect(() => {
    if (!result || !canvasRef.current) return;
    qrToCanvas(result, canvasRef.current, { scale, border: 4, dark, light });
  }, [result, scale, dark, light]);

  const save = (format: "png" | "svg") => {
    if (!result) return;
    if (format === "svg") {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${result.size + 8} ${result.size + 8}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="${light}"/><path d="${
        result.modules
          .map((row, y) =>
            row.map((on, x) => (on ? `M${x + 4} ${y + 4}h1v1h-1z` : "")).join("")
          )
          .join("")
      }" fill="${dark}"/></svg>`;
      downloadBlob(new Blob([svg], { type: "image/svg+xml" }), "qr-code.svg");
    } else {
      qrToCanvas(result, canvasRef.current!, { scale: Math.max(8, scale * 3), border: 4, dark, light });
      canvasRef.current!.toBlob((blob) => {
        if (blob) downloadBlob(blob, "qr-code.png");
        // Redraw at the on-screen size so the preview stays crisp.
        qrToCanvas(result, canvasRef.current!, { scale, border: 4, dark, light });
      }, "image/png");
    }
    notify(`Saved qr-code.${format}`);
  };

  return (
    <div className="tp-col">
      <p className="tp-lede">
        A real QR code, generated in your browser. Nothing is uploaded and there is no tracking in the image.
      </p>

      <textarea
        className="tp-prompt"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="URL, text, Wi-Fi details, a vCard…"
        spellCheck={false}
      />

      <div className="tp-stats">
        <span className={bytes > capacity ? "over" : ""}>
          {bytes} / {capacity} bytes
        </span>
        {result ? (
          <>
            <span>Version {result.version}</span>
            <span>
              {result.size}×{result.size}
            </span>
            <span>Mask {result.mask}</span>
          </>
        ) : null}
      </div>

      <div className="tp-field">
        <label>Error correction</label>
        <div className="tp-res" role="radiogroup" aria-label="Error correction level">
          {EC_LEVELS.map((l) => (
            <button
              key={l.id}
              type="button"
              role="radio"
              aria-checked={ec === l.id}
              className={`tp-res-tile${ec === l.id ? " on" : ""}`}
              onClick={() => setEc(l.id)}
            >
              <b>{l.label}</b>
              <span className="tp-res-note">{l.note}</span>
            </button>
          ))}
        </div>
        <p className="tp-dim">
          Higher levels survive more damage but make the code denser. Medium suits most uses.
        </p>
      </div>

      <div className="tp-qr-row">
        <div className="tp-field">
          <label>Foreground</label>
          <input type="color" value={dark} onChange={(e) => setDark(e.target.value)} />
        </div>
        <div className="tp-field">
          <label>Background</label>
          <input type="color" value={light} onChange={(e) => setLight(e.target.value)} />
        </div>
        <div className="tp-field">
          <label>Size · {scale}px per module</label>
          <input type="range" min={4} max={20} value={scale} onChange={(e) => setScale(Number(e.target.value))} />
        </div>
      </div>

      {error ? <p className="tp-err">{error}</p> : null}

      {result ? (
        <div className="tp-qr-preview">
          <canvas ref={canvasRef} />
          <div className="tp-btns">
            <button type="button" className="tp-btn primary sm" onClick={() => save("png")}>
              <DownloadIcon size={15} />
              PNG
            </button>
            <button type="button" className="tp-btn sm" onClick={() => save("svg")}>
              SVG
            </button>
          </div>
          <p className="tp-dim">
            Print or display it at least 2&nbsp;cm wide, and test with a second phone before relying on it.
          </p>
        </div>
      ) : null}
    </div>
  );
}

/* ============================ URL tools ================================= */

export function UrlTools({ notify }: { notify: (m: string) => void }) {
  const [input, setInput] = useState("https://example.com/search?q=hello%20world&page=2&debug#results");
  const parsed = useMemo(() => parseUrl(input), [input]);

  const [built, setBuilt] = useState<BuildOptions>({ protocol: "https", host: "example.com", path: "/", params: [] });
  const [buildError, setBuildError] = useState("");
  const [builtUrl, setBuiltUrl] = useState("");

  const query = useMemo(() => (parsed.ok ? describeQuery(parsed.search) : null), [parsed]);

  const setB = <K extends keyof BuildOptions>(k: K, v: BuildOptions[K]) => setBuilt((b) => ({ ...b, [k]: v }));

  const setParam = (i: number, key: string, value: string) =>
    setBuilt((b) => {
      const params = [...(b.params ?? [])];
      params[i] = { ...params[i], key, value };
      return { ...b, params };
    });

  const runBuild = () => {
    try {
      setBuiltUrl(buildUrl(built));
      setBuildError("");
    } catch (e) {
      setBuiltUrl("");
      setBuildError(e instanceof Error ? e.message : "Could not build that URL.");
    }
  };

  const copy = (v: string, what: string) => void navigator.clipboard.writeText(v).then(() => notify(`${what} copied`));

  return (
    <div className="tp-col">
      <p className="tp-lede">
        Break a URL into its parts, read the query string as text or JSON, or assemble one from fields.
      </p>

      <div className="tp-io">
        <div className="tp-io-in">
          <div className="tp-out-head">
            <b>Paste a URL</b>
            {parsed.ok ? (
              <button type="button" className="tp-btn sm" onClick={() => copy(parsed.href, "URL")}>
                Copy normalised
              </button>
            ) : null}
          </div>
          <input
            className="tp-url-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="https://example.com/path?a=1#b"
            spellCheck={false}
          />
          {parsed.ok ? (
            <p className="tp-note">A bare host like example.com/x is read as https.</p>
          ) : (
            <p className="tp-err">{parsed.error}</p>
          )}
        </div>

        <div className="tp-io-mid">
          <div className="tp-grp">
            <b>Parts</b>
            {parsed.ok ? (
              <dl className="url-parts">
                {(
                  [
                    ["Protocol", parsed.protocol],
                    ["Host", parsed.host],
                    ["Path", parsed.prettyPath],
                    ["Query", parsed.search || "(none)"],
                    ["Hash", parsed.hash || "(none)"],
                    ["Params", String(parsed.params.length)],
                    ["Origin", parsed.origin],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd title={v}>{v}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>
        </div>

        <div className="tp-io-out">
          <div className="tp-out-head">
            <b>Query parameters</b>
            {query && parsed.params.length ? (
              <div className="tp-btns">
                <button type="button" className="tp-btn sm" onClick={() => copy(query.decoded, "Parameters")}>
                  Copy list
                </button>
                <button type="button" className="tp-btn sm" onClick={() => copy(query.json, "JSON")}>
                  Copy JSON
                </button>
              </div>
            ) : null}
          </div>
          {query && parsed.params.length ? (
            <textarea value={query.decoded} readOnly spellCheck={false} />
          ) : (
            <p className="tp-note">This URL has no query parameters.</p>
          )}
        </div>
      </div>

      <div className="tp-out-head">
        <b>Build a URL</b>
        <div className="tp-btns">
          {URL_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className="tp-btn sm"
              onClick={() => {
                setBuilt(p.build());
                setBuiltUrl("");
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="url-build">
        <div className="url-build-row">
          <select value={built.protocol ?? "https"} onChange={(e) => setB("protocol", e.target.value)}>
            {["https", "http", "ftp", "ws", "wss"].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <input
            value={built.host ?? ""}
            onChange={(e) => setB("host", e.target.value)}
            placeholder="example.com"
            spellCheck={false}
          />
          <input
            value={built.port ?? ""}
            onChange={(e) => setB("port", e.target.value.replace(/[^\d]/g, ""))}
            placeholder="port"
            inputMode="numeric"
          />
        </div>
        <div className="url-build-row">
          <input
            value={built.path ?? ""}
            onChange={(e) => setB("path", e.target.value)}
            placeholder="/path"
            spellCheck={false}
          />
          <input
            value={built.hash ?? ""}
            onChange={(e) => setB("hash", e.target.value)}
            placeholder="hash"
            spellCheck={false}
          />
        </div>
      </div>

      <div className="tp-grp">
        <b>Query parameters</b>
        {(built.params ?? []).map((p, i) => (
          <div key={i} className="url-param">
            <input
              value={p.key}
              onChange={(e) => setParam(i, e.target.value, p.value)}
              placeholder="key"
              spellCheck={false}
            />
            <input
              value={p.flag ? "" : p.value}
              disabled={p.flag}
              onChange={(e) => setParam(i, p.key, e.target.value)}
              placeholder={p.flag ? "flag (no value)" : "value"}
              spellCheck={false}
            />
            <button
              type="button"
              className={`tp-icon-btn${p.flag ? " on" : ""}`}
              title="Send as a bare flag with no ="
              aria-label="Toggle flag"
              onClick={() =>
                setBuilt((b) => {
                  const params = [...(b.params ?? [])];
                  params[i] = { ...params[i], flag: !p.flag };
                  return { ...b, params };
                })
              }
            >
              ⚑
            </button>
            <button
              type="button"
              className="tp-icon-btn"
              title="Remove"
              aria-label="Remove parameter"
              onClick={() =>
                setBuilt((b) => ({ ...b, params: (b.params ?? []).filter((_, k) => k !== i) }))
              }
            >
              <TrashIcon size={15} />
            </button>
          </div>
        ))}
        <div className="tp-btns">
          <button
            type="button"
            className="tp-btn sm"
            onClick={() => setBuilt((b) => ({ ...b, params: [...(b.params ?? []), { key: "", value: "" }] }))}
          >
            <PlusIcon size={14} />
            Add parameter
          </button>
          <button type="button" className="tp-btn primary sm" onClick={runBuild}>
            Build
          </button>
          {builtUrl ? (
            <button type="button" className="tp-btn sm" onClick={() => copy(builtUrl, "URL")}>
              Copy
            </button>
          ) : null}
        </div>
      </div>

      {buildError ? <p className="tp-err">{buildError}</p> : null}
      {builtUrl ? (
        <div className="url-result">
          <code>{builtUrl}</code>
          <a className="tp-btn sm" href={builtUrl} target="_blank" rel="noreferrer noopener">
            Open
          </a>
        </div>
      ) : null}
    </div>
  );
}
