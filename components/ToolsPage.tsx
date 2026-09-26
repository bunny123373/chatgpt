"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { CloseIcon, PdfIcon, ImageIcon, TemplateIcon, WrenchIcon, FileIcon, SearchIcon } from "./Icons";
import { convertFileToPdf, convertFileToPdfBlob } from "@/lib/fileToPdf";
import { downloadPage, downloadPages, pdfToImages, type PdfPage } from "@/lib/pdfToImages";
import {
  prepareImageForPdf,
  printImagesPdf,
  type Orientation,
  type PageFit,
  type PageSize,
  type PdfImage,
  type PreparedImage,
} from "@/lib/imagesPdf";
import { buildImagePdf, buildTextPdf, downloadBlob, pdfFilename } from "@/lib/pdfWriter";
import { DownloadIcon } from "./Icons";
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
import { coerceRows, parseCsv as parseCsvRows, useSandbox } from "@/lib/sandbox";
import { ColourTools as ColourTab, ImageDownloader, QrTools as QrTab, UrlTools as UrlTab } from "./ToolTabs";

type Tab = "pdf" | "image" | "colour" | "qr" | "url" | "data" | "make";

const TABS: { id: Tab; label: string; icon: (p: { size?: number }) => ReactElement }[] = [
  { id: "pdf", label: "PDF", icon: PdfIcon },
  { id: "image", label: "Image", icon: ImageIcon },
  { id: "colour", label: "Colours", icon: TemplateIcon },
  { id: "qr", label: "QR codes", icon: WrenchIcon },
  { id: "url", label: "URL tools", icon: SearchIcon },
  { id: "data", label: "Data", icon: FileIcon },
  { id: "make", label: "Generate", icon: SearchIcon },
];

/* ============================== PDF tools =============================== */

/**
 * Named resolutions. A bare slider gave no sense of what each step cost or
 * produced, and is awkward to hit on a phone.
 */
const RESOLUTIONS: { scale: number; label: string; note: string; hint: string }[] = [
  { scale: 1, label: "Draft", note: "smallest", hint: "72 dpi. Good for reading on screen, and the files stay small." },
  { scale: 2, label: "Standard", note: "balanced", hint: "144 dpi. Sharp enough for most documents and slides." },
  { scale: 3, label: "High", note: "detailed", hint: "216 dpi. Keeps fine print and diagrams legible." },
  { scale: 4, label: "Print", note: "sharpest", hint: "288 dpi. Best quality, but the largest files and slowest." },
];

type PdfDir = "imagesToPdf" | "toPdf" | "toImages";

/** Pick several images, order them, and export them as one document. */
function ImagesToPdf({ notify }: { notify: (m: string) => void }) {
  const [items, setItems] = useState<PreparedImage[]>([]);
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
    const added: PreparedImage[] = [];
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
    setItems((prev) =>
      prev.map((it, k) => (k === index ? { ...it, url, width: canvas.width, height: canvas.height } : it))
    );
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
    // Direct download: a real .pdf file, so it works the same on phones and
    // desktops with no print dialog in the way.
    const blob = buildImagePdf(
      items.map((it, i) => ({
        dataUrl: it.url,
        width: it.width,
        height: it.height,
        caption: names[i] ?? "",
      })),
      {
        title: title.trim() || "Images",
        pageSize: size,
        orientation: orient,
        fit,
        margin,
        coverPage: cover,
        showCaptions: captions,
      },
    );
    if (!blob) {
      notify("Couldn't build the PDF. Try re-adding the images.");
      return;
    }
    downloadBlob(blob, pdfFilename(title.trim() || "images"));
    notify(`Downloaded ${items.length} page${items.length === 1 ? "" : "s"}`);
  };

  const printPdf = () => {
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
    notify(ok ? "Print dialog opened" : "Couldn't open the print window. Allow pop-ups and try again.");
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
                  <DownloadIcon size={15} />
                  Download PDF
                </button>
                <button type="button" className="tp-btn sm" onClick={printPdf}>
                  Print…
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
      // Direct download rather than a print dialog: on phones the print
      // route buries "Save as PDF" behind a share sheet.
      for (const file of Array.from(list)) {
        const res = await convertFileToPdfBlob(file);
        if (res.ok && res.blob && res.filename) {
          downloadBlob(res.blob, res.filename);
        }
        next.push({ name: file.name, ok: res.ok, msg: res.message });
      }
      setLog((prev) => [...next, ...prev]);
      setBusy(false);
      const okCount = next.filter((n) => n.ok).length;
      notify(okCount ? `Downloaded ${okCount} PDF${okCount === 1 ? "" : "s"}` : next[0]?.msg || "Nothing converted");
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
            <small>Downloads a .pdf straight to your device — no print dialog.</small>
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
            <label>Page resolution</label>
            <div className="tp-res" role="radiogroup" aria-label="Page resolution">
              {RESOLUTIONS.map((r) => (
                <button
                  key={r.scale}
                  type="button"
                  role="radio"
                  aria-checked={scale === r.scale}
                  className={`tp-res-tile${scale === r.scale ? " on" : ""}`}
                  onClick={() => setScale(r.scale)}
                >
                  <b>{r.label}</b>
                  <small>
                    {r.scale}× · {r.scale * 72} dpi
                  </small>
                  <span className="tp-res-note">{r.note}</span>
                </button>
              ))}
            </div>
            <p className="tp-dim">{RESOLUTIONS.find((r) => r.scale === scale)?.hint}</p>
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

function ImageTools({ notify, initialDir }: { notify: (m: string) => void; initialDir?: "edit" | "download" }) {
  const [dir, setDir] = useState<"edit" | "download">(initialDir ?? "edit");
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
      <div className="tp-seg">
        <button type="button" className={dir === "edit" ? "on" : ""} onClick={() => setDir("edit")}>
          Convert &amp; resize
        </button>
        <button type="button" className={dir === "download" ? "on" : ""} onClick={() => setDir("download")}>
          Download from URL
        </button>
      </div>

      {dir === "download" ? (
        <ImageDownloader notify={notify} onSendToEditor={(f: File) => void pick(f)} />
      ) : (
        <>
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
        </>
      )}
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
  initialTab,
  imageDir,
}: GenProps & { onClose: () => void; initialTab?: Tab; imageDir?: "edit" | "download" }) {
  const [tab, setTab] = useState<Tab>(initialTab ?? "pdf");

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
        {tab === "image" ? <ImageTools notify={notify} initialDir={imageDir} /> : null}
        {tab === "colour" ? <ColourTab /> : null}
        {tab === "qr" ? <QrTab notify={notify} /> : null}
        {tab === "url" ? <UrlTab notify={notify} /> : null}
        {tab === "data" ? <DataTools notify={notify} /> : null}
        {tab === "make" ? (
          <GenerateTools model={model} apiKey={apiKey} baseUrl={baseUrl} signedIn={signedIn} notify={notify} />
        ) : null}
      </div>
    </div>
  );
}
