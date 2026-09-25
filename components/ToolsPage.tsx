"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { CloseIcon, PdfIcon, ImageIcon, TemplateIcon, WrenchIcon, FileIcon, SearchIcon } from "./Icons";
import { convertFileToPdf } from "@/lib/fileToPdf";
import { downloadPage, downloadPages, pdfToImages, type PdfPage } from "@/lib/pdfToImages";
import { prepareImageForPdf, printImagesPdf, type Orientation, type PageFit, type PageSize, type PdfImage } from "@/lib/imagesPdf";
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

type PdfDir = "imagesToPdf" | "toPdf" | "toImages";

/** Pick several images, order them, and export them as one document. */
function ImagesToPdf({ notify }: { notify: (m: string) => void }) {
  const [items, setItems] = useState<PdfImage[]>([]);
  const [names, setNames] = useState<string[]>([]);
  const [rot, setRot] = useState<number[]>([]);
  const [title, setTitle] = useState("Images");
  const [size, setSize] = useState<PageSize>("A4");
  const [orient, setOrient] = useState<Orientation>("portrait");
  const [fit, setFit] = useState<PageFit>("contain");
  const [margin, setMargin] = useState(12);
  const [cover, setCover] = useState(false);
  const [captions, setCaptions] = useState(true);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const ref = useRef<HTMLInputElement | null>(null);

  const add = async (list: FileList | null) => {
    if (!list?.length) return;
    const files = Array.from(list).filter((f) => f.type.startsWith("image/"));
    if (!files.length) return notify("None of those files were images");

    setProgress({ done: 0, total: files.length });
    const added: PdfImage[] = [];
    const addedNames: string[] = [];
    const addedRot: number[] = [];
    let skipped = 0;

    for (let i = 0; i < files.length; i++) {
      // Sequential on purpose: decoding ten 12 MP photos at once thrashes memory.
      const prepped = await prepareImageForPdf(files[i]);
      setProgress({ done: i + 1, total: files.length });
      if (prepped) {
        added.push(prepped);
        addedNames.push(files[i].name);
        addedRot.push(0);
      } else skipped++;
    }

    setProgress(null);
    if (!added.length) return notify("None of those images could be read");
    setItems((prev) => [...prev, ...added]);
    setNames((prev) => [...prev, ...addedNames]);
    setRot((prev) => [...prev, ...addedRot]);
    notify(skipped ? `Added ${added.length}, skipped ${skipped} unreadable` : `Added ${added.length} image${added.length === 1 ? "" : "s"}`);
  };

  /** Re-render one page with a new baked-in rotation. */
  const applyRotation = async (index: number, delta: number) => {
    const src = items[index];
    if (!src) return;
    const next = (rot[index] + delta + 360) % 360;
    setRot((prev) => prev.map((r, k) => (k === index ? next : r)));

    // Re-decode from the already-prepared bitmap for a sharp result.
    const canvas = document.createElement("canvas");
    const img = new Image();
    img.src = src.url;
    try {
      await img.decode();
    } catch {
      return;
    }
    const quarter = next === 90 || next === 270;
    canvas.width = quarter ? img.naturalHeight : img.naturalWidth;
    canvas.height = quarter ? img.naturalWidth : img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingQuality = "high";
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((next * Math.PI) / 180);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    const url = canvas.toDataURL("image/jpeg", 0.92);
    setItems((prev) => prev.map((it, k) => (k === index ? { ...it, url, rotate: 0 } : it)));
  };

  const move = (i: number, delta: number) => {
    setItems((prev) => {
      const next = [...prev];
      const j = i + delta;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setNames((prev) => {
      const next = [...prev];
      const j = i + delta;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setRot((prev) => {
      const next = [...prev];
      const j = i + delta;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const removeAt = (i: number) => {
    setItems((prev) => prev.filter((_, k) => k !== i));
    setNames((prev) => prev.filter((_, k) => k !== i));
    setRot((prev) => prev.filter((_, k) => k !== i));
  };

  const totalBytes = useMemo(
    () => items.reduce((sum, it) => sum + Math.floor(((it.url.length - it.url.indexOf(",")) * 3) / 4), 0),
    [items],
  );

  const exportPdf = () => {
    if (!items.length) return notify("Add at least one image");
    const ok = printImagesPdf({
      title: title.trim() || "Images",
      images: items.map((it, i) => (captions ? { ...it, caption: names[i] ?? it.caption } : { ...it, caption: undefined })),
      pageSize: size,
      orientation: orient,
      fit,
      marginMm: margin,
      coverPage: cover,
    });
    notify(
      ok
        ? `${items.length} page${items.length === 1 ? "" : "s"} ready — choose Save as PDF`
        : "Couldn't open the print window. Allow pop-ups for this site, then try again.",
    );
  };

  return (
    <>
      <input
        ref={ref}
        type="file"
        multiple
        accept="image/*"
        hidden
        onChange={(e) => {
          void add(e.target.files);
          e.target.value = "";
        }}
      />

      <div
        className="tp-drop"
        onClick={() => !progress && ref.current?.click()}
        role="button"
        tabIndex={0}
        aria-busy={Boolean(progress)}
      >
        <ImageIcon size={26} />
        <b>{progress ? `Preparing ${progress.done} / ${progress.total}…` : items.length ? "Add more images" : "Choose images"}</b>
        {progress ? (
          <div className="tp-prog">
            <div className="tp-prog-bar" style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} />
          </div>
        ) : (
          <small>Select as many as you like — they are combined into a single PDF, one page each.</small>
        )}
      </div>

      {items.length ? (
        <>
          <div className="tp-field">
            <label>Document title</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Images" />
          </div>

          <div className="tp-field">
            <label>Page size</label>
            <div className="tp-seg">
              {(["A4", "Letter"] as const).map((s) => (
                <button key={s} type="button" className={size === s ? "on" : ""} onClick={() => setSize(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="tp-field">
            <label>Orientation</label>
            <div className="tp-seg">
              {(["portrait", "landscape"] as const).map((o) => (
                <button key={o} type="button" className={orient === o ? "on" : ""} onClick={() => setOrient(o)}>
                  {o === "portrait" ? "Portrait" : "Landscape"}
                </button>
              ))}
            </div>
          </div>

          <div className="tp-field">
            <label>Image fit</label>
            <div className="tp-seg">
              <button type="button" className={fit === "contain" ? "on" : ""} onClick={() => setFit("contain")}>
                Whole image
              </button>
              <button type="button" className={fit === "cover" ? "on" : ""} onClick={() => setFit("cover")}>
                Fill page
              </button>
            </div>
            <p className="tp-dim">
              {fit === "contain" ? "Whole image visible, with empty space around it." : "Fills the page edge to edge, cropping the overflow."}
            </p>
          </div>

          <div className="tp-field">
            <label>Margin · {margin}mm</label>
            <input type="range" min={0} max={30} value={margin} onChange={(e) => setMargin(Number(e.target.value))} />
          </div>

          <div className="tp-btns">
            <label className="tp-check">
              <input type="checkbox" checked={captions} onChange={(e) => setCaptions(e.target.checked)} />
              Show file names
            </label>
            <label className="tp-check">
              <input type="checkbox" checked={cover} onChange={(e) => setCover(e.target.checked)} />
              Add a title page
            </label>
          </div>

          <div className="tp-order">
            <div className="tp-out-head">
              <b>
                {items.length} page{items.length === 1 ? "" : "s"} · {formatBytes(totalBytes)}
              </b>
              <div className="tp-btns">
                <button type="button" className="tp-btn primary sm" onClick={exportPdf}>
                  Create PDF
                </button>
                <button
                  type="button"
                  className="tp-btn sm"
                  onClick={() => {
                    setItems([]);
                    setNames([]);
                    setRot([]);
                  }}
                >
                  Remove all
                </button>
              </div>
            </div>

            <ul className="tp-order-list">
              {items.map((it, i) => (
                <li key={it.url.slice(-40) + i}>
                  <span className="n">{i + 1}</span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={it.url} alt="" />
                  <span className="nm">{names[i] ?? "image"}</span>
                  <span className="acts">
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => move(i, 1)}
                      disabled={i === items.length - 1}
                      aria-label="Move down"
                    >
                      ↓
                    </button>
                    <button type="button" onClick={() => void applyRotation(i, 90)} aria-label="Rotate 90 degrees">
                      ⟳
                    </button>
                    <button type="button" onClick={() => removeAt(i)} aria-label="Remove">
                      ✕
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : null}
    </>
  );
}

function PdfTools({ notify }: { notify: (m: string) => void }) {
  const [dir, setDir] = useState<PdfDir>("imagesToPdf");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<{ name: string; ok: boolean; msg: string }[]>([]);
  const [scale, setScale] = useState(2);
  const [pages, setPages] = useState<PdfPage[]>([]);
  const [pagesName, setPagesName] = useState("");
  const [fallback, setFallback] = useState(false);
  const [preview, setPreview] = useState<PdfPage | null>(null);
  const toPdfRef = useRef<HTMLInputElement | null>(null);
  const toImgRef = useRef<HTMLInputElement | null>(null);

  // Release blob: URLs from the offline fallback when replacing them.
  useEffect(() => {
    return () => {
      for (const p of pages) if (p.dataUrl.startsWith("blob:")) URL.revokeObjectURL(p.dataUrl);
    };
  }, [pages]);

  const handleToPdf = useCallback(
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

  const handleToImages = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setBusy(true);
      setPreview(null);
      setPages([]);
      const res = await pdfToImages(file, { scale });
      setBusy(false);
      if (!res.ok) {
        setLog((prev) => [{ name: file.name, ok: false, msg: res.message }, ...prev]);
        notify(res.message);
        return;
      }
      setPages(res.pages);
      setPagesName(file.name.replace(/\.[^.]+$/, "") || "document");
      setFallback(res.fallback);
      setPreview(res.pages[0] ?? null);
      setLog((prev) => [{ name: file.name, ok: true, msg: res.message }, ...prev]);
      notify(res.message);
    },
    [notify, scale],
  );

  return (
    <div className="tp-col">
      <p className="tp-lede">
        Convert both ways. Build a PDF from images, documents or text — or turn a PDF back into page images. Everything
        happens in your browser.
      </p>

      <div className="tp-seg">
        <button type="button" className={dir === "imagesToPdf" ? "on" : ""} onClick={() => setDir("imagesToPdf")}>
          Images → PDF
        </button>
        <button type="button" className={dir === "toPdf" ? "on" : ""} onClick={() => setDir("toPdf")}>
          File → PDF
        </button>
        <button type="button" className={dir === "toImages" ? "on" : ""} onClick={() => setDir("toImages")}>
          PDF → images
        </button>
      </div>

      {dir === "imagesToPdf" ? <ImagesToPdf notify={notify} /> : null}

      {dir === "toPdf" ? (
        <>
          <input
            ref={toPdfRef}
            type="file"
            multiple
            accept=".pdf,.docx,image/*,.txt,.md,.markdown,.csv,.tsv,.json,.yaml,.yml,.html,.htm,.xml,.rtf,.log,text/*,application/pdf"
            hidden
            onChange={(e) => {
              void handleToPdf(e.target.files);
              e.target.value = "";
            }}
          />
          <div className="tp-drop" onClick={() => toPdfRef.current?.click()} role="button" tabIndex={0}>
            <PdfIcon size={26} />
            <b>{busy ? "Converting…" : "Choose files to convert to PDF"}</b>
            <small>Images · DOCX · TXT · MD · CSV · JSON · HTML · RTF and 30+ code formats</small>
          </div>
        </>
      ) : (
        <>
          <input
            ref={toImgRef}
            type="file"
            accept=".pdf,application/pdf"
            hidden
            onChange={(e) => {
              void handleToImages(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <div className="tp-field">
            <label>Resolution · {scale}× ({scale * 72} dpi)</label>
            <input type="range" min={1} max={4} step={1} value={scale} onChange={(e) => setScale(Number(e.target.value))} />
          </div>
          <div className="tp-drop" onClick={() => toImgRef.current?.click()} role="button" tabIndex={0}>
            <ImageIcon size={26} />
            <b>{busy ? "Rendering pages…" : "Choose a PDF to turn into images"}</b>
            <small>Each page becomes a PNG. First run downloads the page renderer.</small>
          </div>
        </>
      )}

      {dir === "toImages" && pages.length ? (
        <div className="tp-pages">
          <div className="tp-out-head">
            <b>
              {pages.length} page{pages.length === 1 ? "" : "s"} from {pagesName}.pdf
            </b>
            <div className="tp-btns">
              <button type="button" className="tp-btn primary sm" onClick={() => downloadPages(pages, pagesName)}>
                Download all
              </button>
              <button
                type="button"
                className="tp-btn sm"
                onClick={() => {
                  for (const p of pages) if (p.dataUrl.startsWith("blob:")) URL.revokeObjectURL(p.dataUrl);
                  setPages([]);
                  setPreview(null);
                }}
              >
                Clear
              </button>
            </div>
          </div>

          {fallback ? (
            <p className="tp-note">
              The page renderer wasn&apos;t reachable, so these are the images embedded in the PDF. Text and vector
              pages are not included. Go online and convert again for full pages.
            </p>
          ) : null}

          {preview ? (
            <div className="tp-preview">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview.dataUrl} alt={`Page ${preview.index}`} />
              <div className="tp-btns">
                <button type="button" className="tp-btn sm" onClick={() => downloadPage(preview, pagesName)}>
                  Download page {preview.index}
                </button>
                {preview.width ? (
                  <span className="tp-dim">
                    {preview.width}×{preview.height}px
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="tp-thumbs">
            {pages.map((p) => (
              <button
                key={p.index}
                type="button"
                className={`tp-thumb${preview?.index === p.index ? " on" : ""}`}
                onClick={() => setPreview(p)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.dataUrl} alt="" loading="lazy" />
                <span>{p.index}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

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
    // Stop the chat behind from scrolling while this overlay is open.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
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
