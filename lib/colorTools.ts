"use client";

/**
 * Colour conversion and WCAG contrast checking.
 *
 * Colours are carried as 0-255 RGB triples internally, so hex/rgb/hsl/hsv
 * conversion is lossless in both directions. Contrast follows the WCAG 2.x
 * relative-luminance definition, which is what the AA/AAA thresholds use.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Hsl {
  h: number;
  s: number; // 0-100
  l: number; // 0-100
}

export interface Hsv {
  h: number;
  s: number; // 0-100
  v: number; // 0-100
}

const clamp = (v: number, lo = 0, hi = 255) => Math.min(hi, Math.max(lo, v));
const round = (v: number) => Math.round(v);

export function hexToRgb(hex: string): Rgb | null {
  const h = hex.trim().replace(/^#/, "");
  const full =
    h.length === 3 || h.length === 4
      ? h
          .slice(0, 3)
          .split("")
          .map((c) => c + c)
          .join("")
      : h.slice(0, 6);
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const pair = (v: number) => clamp(round(v)).toString(16).padStart(2, "0");
  return `#${pair(r)}${pair(g)}${pair(b)}`.toUpperCase();
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      default:
        h = (rn - gn) / d + 4;
    }
    h *= 60;
  }
  return { h: round(h), s: round(s * 100), l: round(l * 100) };
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (hp >= 0 && hp < 1) [rp, gp, bp] = [c, x, 0];
  else if (hp < 2) [rp, gp, bp] = [x, c, 0];
  else if (hp < 3) [rp, gp, bp] = [0, c, x];
  else if (hp < 4) [rp, gp, bp] = [0, x, c];
  else if (hp < 5) [rp, gp, bp] = [x, 0, c];
  else [rp, gp, bp] = [c, 0, x];
  const m = ln - c / 2;
  return { r: clamp((rp + m) * 255), g: clamp((gp + m) * 255), b: clamp((bp + m) * 255) };
}

export function rgbToHsv({ r, g, b }: Rgb): Hsv {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      default:
        h = (rn - gn) / d + 4;
    }
    h *= 60;
  }
  return { h: round(h), s: round((max === 0 ? 0 : d / max) * 100), v: round(max * 100) };
}

export function hsvToRgb({ h, s, v }: Hsv): Rgb {
  const sn = s / 100;
  const vn = v / 100;
  const c = vn * sn;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (hp >= 0 && hp < 1) [rp, gp, bp] = [c, x, 0];
  else if (hp < 2) [rp, gp, bp] = [x, c, 0];
  else if (hp < 3) [rp, gp, bp] = [0, c, x];
  else if (hp < 4) [rp, gp, bp] = [0, x, c];
  else if (hp < 5) [rp, gp, bp] = [x, 0, c];
  else [rp, gp, bp] = [c, 0, x];
  const m = vn - c;
  return { r: clamp((rp + m) * 255), g: clamp((gp + m) * 255), b: clamp((bp + m) * 255) };
}

export function hslToHex(hsl: Hsl): string {
  return rgbToHex(hslToRgb(hsl));
}

/** Accepts hex, rgb(), rgba(), hsl(), hsla() and the CSS colour keywords. */
const NAMED: Record<string, string> = {
  black: "#000000",
  white: "#ffffff",
  red: "#ff0000",
  green: "#008000",
  blue: "#0000ff",
  yellow: "#ffff00",
  cyan: "#00ffff",
  magenta: "#ff00ff",
  gray: "#808080",
  grey: "#808080",
  silver: "#c0c0c0",
  maroon: "#800000",
  olive: "#808000",
  lime: "#00ff00",
  aqua: "#00ffff",
  teal: "#008080",
  navy: "#000080",
  fuchsia: "#ff00ff",
  purple: "#800080",
  orange: "#ffa500",
  transparent: "#000000",
};

export function parseColor(input: string): Rgb | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;

  const named = NAMED[s];
  if (named) return hexToRgb(named);

  if (s.startsWith("#")) return hexToRgb(s);

  const fn = /^(rgba?|hsla?)\s*\(([^)]+)\)$/.exec(s);
  if (fn) {
    const parts = fn[2].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3) return null;
    if (fn[1].startsWith("rgb")) {
      const num = (v: string) => (v.endsWith("%") ? (parseFloat(v) / 100) * 255 : parseFloat(v));
      return { r: clamp(num(parts[0])), g: clamp(num(parts[1])), b: clamp(num(parts[2])) };
    }
    const num = (v: string) => (v.endsWith("%") ? parseFloat(v) : parseFloat(v));
    return hslToRgb({ h: num(parts[0]), s: num(parts[1]), l: num(parts[2]) });
  }
  return null;
}

/* ------------------------------- contrast ------------------------------- */

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance({ r, g, b }: Rgb): number {
  const chan = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

/** Contrast ratio, 1:1 to 21:1. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

export interface WcagResult {
  ratio: number;
  /** 4.5:1 */
  aaNormal: boolean;
  /** 7:1 */
  aaaNormal: boolean;
  /** 3:1 — WCAG 1.4.3 for text at >=18pt or >=14pt bold */
  aaLarge: boolean;
  /** 4.5:1 — the 1.4.11 non-text threshold for UI parts */
  aaUi: boolean;
}

export function wcag(fg: Rgb, bg: Rgb): WcagResult {
  const ratio = contrastRatio(fg, bg);
  return {
    ratio,
    aaNormal: ratio >= 4.5,
    aaaNormal: ratio >= 7,
    aaLarge: ratio >= 3,
    aaUi: ratio >= 3,
  };
}

/**
 * Nudge a colour's lightness until it clears `target` contrast against `bg`.
 *
 * Direction matters: if the foreground is already darker than the background
 * we darken it further, and if it is lighter we lighten it. Getting that
 * backwards walks the colour towards the background and never improves it.
 */
export function fixContrast(fg: Rgb, bg: Rgb, target: number): Rgb {
  const goDarker = luminance(fg) < luminance(bg);
  const hsl = rgbToHsl(fg);
  const dir = goDarker ? -1 : 1;

  // Start at the colour's own lightness rather than mid-grey, so the result is
  // the smallest change that clears the target.
  for (let step = 0; step <= 200; step++) {
    const l = hsl.l + dir * step * 0.5;
    if (l < 0 || l > 100) break;
    const candidate = hslToRgb({ ...hsl, l });
    if (contrastRatio(candidate, bg) >= target) return candidate;
  }
  // Out of room on that axis, so fall back to the extreme with more contrast.
  return goDarker ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 };
}

/* --------------------------------- palette ------------------------------ */

export interface PaletteStop {
  hex: string;
  /** 0-100 */
  lightness: number;
  contrastOnWhite: number;
  contrastOnBlack: number;
}

/** A tint/shade ramp from near-white to near-black through `base`. */
export function buildScale(base: Rgb, steps = 9): PaletteStop[] {
  const hsl = rgbToHsl(base);
  const out: PaletteStop[] = [];
  for (let i = 0; i < steps; i++) {
    const l = 95 - (i * 90) / (steps - 1);
    const c = hslToRgb({ ...hsl, l });
    out.push({
      hex: rgbToHex(c),
      lightness: Math.round(l),
      contrastOnWhite: Number(contrastRatio(c, { r: 255, g: 255, b: 255 }).toFixed(2)),
      contrastOnBlack: Number(contrastRatio(c, { r: 0, g: 0, b: 0 }).toFixed(2)),
    });
  }
  return out;
}

/** Pick whichever of black or white reads better on `bg`. */
export function readableInk(bg: Rgb): Rgb {
  return contrastRatio(bg, { r: 0, g: 0, b: 0 }) >= contrastRatio(bg, { r: 255, g: 255, b: 255 })
    ? { r: 0, g: 0, b: 0 }
    : { r: 255, g: 255, b: 255 };
}
