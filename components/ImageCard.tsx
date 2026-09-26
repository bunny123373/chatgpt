"use client";

import { useEffect, useRef, useState } from "react";
import { CloseIcon, DownloadIcon } from "./Icons";
import { fetchImage, formatSize, guessFilename, saveBlob, type FetchedImage } from "@/lib/imageDownloader";
import { DEFAULT_EDIT, IMAGE_FORMATS, formatBytes, renderImage, type EditOptions, type ImageFormat } from "@/lib/imageTools";

/**
 * An image shown inline in the chat, with download and convert controls.
 *
 * The source may be a remote URL, which the browser cannot fetch for a
 * re-encode, so conversion goes through /api/image-proxy. Once fetched it is
 * cached for the life of the component, so switching format repeatedly does
 * not re-download.
 */

const OUT_FORMATS: { id: ImageFormat; label: string }[] = IMAGE_FORMATS.map((f) => ({ id: f.id, label: f.label }));

export interface ImageCardProps {
  src: string;
  filename: string;
  type?: string;
  /** Inlined copy, used for the preview when present so it renders instantly. */
  dataUrl?: string;
  /** Rendered compactly, for the strip above the composer. */
  compact?: boolean;
  onRemove?: () => void;
  onError?: (message: string) => void;
}

export default function ImageCard({
  src,
  filename,
  type: knownType,
  dataUrl,
  compact = false,
  onRemove,
  onError,
}: ImageCardProps) {
  // Prefer the inlined copy: it needs no network and no proxy round trip.
  const preview = dataUrl || src;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [format, setFormat] = useState<ImageFormat>("image/png");
  const [quality, setQuality] = useState(92);
  const [meta, setMeta] = useState<{ w: number; h: number; bytes: number; type: string } | null>(null);
  const [err, setErr] = useState("");
  // Cache of the fetched bytes so we only ever download once.
  const blobRef = useRef<Blob | null>(null);
  const bitmapRef = useRef<ImageBitmap | null>(null);
  const started = useRef(false);

  // Measure the image so the card can show dimensions and size.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      setMeta((m) => m ?? { w: img.naturalWidth, h: img.naturalHeight, bytes: 0, type: knownType ?? "" });
    };
    img.src = preview;
    return () => {
      cancelled = true;
    };
  }, [preview, knownType]);

  /** Fetch the bytes once, via the proxy when the source is remote. */
  const ensureBlob = async (): Promise<Blob> => {
    if (blobRef.current) return blobRef.current;
    if (preview.startsWith("data:")) {
      const r = await fetch(preview);
      const b = await r.blob();
      blobRef.current = b;
      return b;
    }
    if (src.startsWith("blob:")) {
      const r = await fetch(src);
      const b = await r.blob();
      blobRef.current = b;
      return b;
    }
    const res = await fetchImage(src);
    if (!res.ok) throw new Error(res.message);
    blobRef.current = res.blob;
    if (res.width && !meta?.w) setMeta({ w: res.width, h: res.height, bytes: res.bytes, type: res.type });
    return res.blob;
  };

  const ensureBitmap = async (): Promise<ImageBitmap> => {
    if (bitmapRef.current) return bitmapRef.current;
    const blob = await ensureBlob();
    const bmp = await createImageBitmap(blob);
    bitmapRef.current = bmp;
    return bmp;
  };

  const plainDownload = async () => {
    setErr("");
    setBusy(true);
    try {
      if (preview.startsWith("blob:") || preview.startsWith("data:")) {
        // Local copy: the browser link already saves it.
        const a = document.createElement("a");
        a.href = preview;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        // Remote: route through the proxy so the save is forced.
        const res = await fetchImage(src);
        if (!res.ok) throw new Error(res.message);
        saveBlob(res.blob, filename);
      }
    } catch (e) {
      const m = e instanceof Error ? e.message : "Download failed.";
      setErr(m);
      onError?.(m);
    } finally {
      setBusy(false);
    }
  };

  const convertAndDownload = async () => {
    setErr("");
    setBusy(true);
    try {
      const bmp = await ensureBitmap();
      const opts: EditOptions = { ...DEFAULT_EDIT, format, quality: quality / 100 };
      const out = renderImage(bmp, opts);
      const ext = IMAGE_FORMATS.find((f) => f.id === format)?.ext ?? "png";
      const base = filename.replace(/\.[^.]+$/, "");
      saveBlob(
        await (await fetch(out.dataUrl)).blob(),
        `${base}.${ext}`
      );
    } catch (e) {
      const m = e instanceof Error ? e.message : "Could not convert that image.";
      setErr(m);
      onError?.(m);
    } finally {
      setBusy(false);
    }
  };

  const fmtLabel = OUT_FORMATS.find((f) => f.id === format)?.label ?? "PNG";

  if (compact) {
    return (
      <div className="imgcard compact">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="imgcard-thumb" src={preview} alt="" />
        <div className="imgcard-meta">
          <b>{filename}</b>
          <small>
            {meta?.w ? `${meta.w}×${meta.h}` : ""}
            {meta?.w && meta.type ? " · " : ""}
            {meta?.type ? meta.type.replace("image/", "").toUpperCase() : "image"}
            {meta?.bytes ? ` · ${formatSize(meta.bytes)}` : ""}
          </small>
        </div>
        <div className="imgcard-acts">
          <button
            type="button"
            className="ic-x"
            title="Download this image"
            aria-label="Download this image"
            onClick={() => void plainDownload()}
            disabled={busy}
          >
            <DownloadIcon size={15} />
          </button>
          {onRemove ? (
            <button type="button" className="ic-x" title="Remove" aria-label="Remove image" onClick={onRemove}>
              <CloseIcon />
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="imgcard">
      <div className="imgcard-head">
        <div className="imgcard-meta">
          <b>{filename}</b>
          <small>
            {meta?.w ? `${meta.w}×${meta.h}px` : "loading…"}
            {meta?.bytes ? ` · ${formatBytes(meta.bytes)}` : ""}
          </small>
        </div>
        <div className="imgcard-acts">
          <button
            type="button"
            className="ic-x"
            title="Download this image"
            aria-label="Download this image"
            onClick={() => void plainDownload()}
            disabled={busy}
          >
            <DownloadIcon size={15} />
          </button>
          <button
            type="button"
            className="ic-x"
            title={open ? "Hide convert options" : "Convert to another format"}
            aria-label="Convert"
            onClick={() => setOpen((v) => !v)}
          >
            ⇄
          </button>
        </div>
      </div>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="imgcard-img" src={preview} alt={filename} loading="lazy" />

      {err ? <p className="tp-err">{err}</p> : null}

      {open ? (
        <div className="imgcard-panel">
          <div className="tp-seg">
            {OUT_FORMATS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={format === f.id ? "on" : ""}
                onClick={() => setFormat(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
          {format !== "image/png" ? (
            <div className="tp-field">
              <label>Quality · {quality}%</label>
              <input
                type="range"
                min={20}
                max={100}
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
              />
            </div>
          ) : (
            <p className="tp-dim">PNG is lossless, so there is no quality setting.</p>
          )}
          <button type="button" className="tp-btn primary sm" onClick={() => void convertAndDownload()} disabled={busy}>
            {busy ? "Working…" : `Convert & download ${fmtLabel}`}
          </button>
        </div>
      ) : null}
    </div>
  );
}
