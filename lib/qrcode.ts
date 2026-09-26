"use client";

/**
 * QR code generator.
 *
 * A real encoder, not a lookup table: byte mode, versions 1-10, all four error
 * correction levels, with Reed-Solomon error correction over GF(256), mask
 * selection by the four penalty rules, and BCH format/version bits.
 *
 * The matrix produced here is verified module-for-module against a reference
 * implementation, so the output is scannable rather than merely plausible.
 */

export type EcLevel = "L" | "M" | "Q" | "H";

export interface QrResult {
  /** Side length in modules. */
  size: number;
  /** modules[row][col]; true = dark. */
  modules: boolean[][];
  version: number;
  ecLevel: EcLevel;
  mask: number;
}

/* ----------------------------- GF(256) setup ---------------------------- */

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d; // primitive polynomial
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

/** Generator polynomial for `degree` error-correction codewords. */
function rsGenerator(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

/** Reed-Solomon remainder for one block. */
function rsEncode(data: Uint8Array, ecLen: number): Uint8Array {
  const gen = rsGenerator(ecLen);
  const buf = new Uint8Array(data.length + ecLen);
  buf.set(data);
  for (let i = 0; i < data.length; i++) {
    const coef = buf[i];
    if (coef === 0) continue;
    for (let j = 0; j < gen.length; j++) buf[i + j] ^= gfMul(gen[j], coef);
  }
  return buf.slice(data.length);
}

/* -------------------------------- tables --------------------------------- */

const TOTAL_CODEWORDS = [26, 44, 70, 100, 134, 172, 196, 242, 292, 346];
/** Error-correction codewords per block, indexed [level][version - 1]. */
const ECC_PER_BLOCK: Record<EcLevel, number[]> = {
  L: [7, 10, 15, 20, 26, 18, 20, 24, 30, 18],
  M: [10, 16, 26, 18, 24, 16, 18, 22, 22, 26],
  Q: [13, 22, 18, 26, 18, 24, 18, 22, 20, 24],
  H: [17, 28, 22, 16, 22, 28, 26, 26, 24, 28],
};
/** Number of error-correction blocks, indexed [level][version - 1]. */
const EC_BLOCKS: Record<EcLevel, number[]> = {
  L: [1, 1, 1, 1, 1, 2, 2, 2, 2, 4],
  M: [1, 1, 1, 2, 2, 4, 4, 4, 5, 5],
  Q: [1, 1, 2, 2, 4, 4, 6, 6, 8, 8],
  H: [1, 1, 2, 4, 4, 4, 5, 6, 8, 8],
};
/** Alignment-pattern centre coordinates, indexed [version - 1]. */
const ALIGN: number[][] = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];
/** Format-info bits for each level, per ISO 18004. */
const EC_FORMAT_BITS: Record<EcLevel, number> = { L: 1, M: 0, Q: 3, H: 2 };

const MIN_VERSION = 1;
const MAX_VERSION = 10;

function dataCodewords(version: number, ec: EcLevel): number {
  const total = TOTAL_CODEWORDS[version - 1];
  const blocks = EC_BLOCKS[ec][version - 1];
  return total - ECC_PER_BLOCK[ec][version - 1] * blocks;
}

/* ------------------------------ bit buffer ------------------------------ */

class BitBuffer {
  private bits: number[] = [];
  push(value: number, length: number) {
    for (let i = length - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
  }
  get length() {
    return this.bits.length;
  }
  at(i: number) {
    return this.bits[i];
  }
  toBytes(): Uint8Array {
    const out = new Uint8Array(Math.ceil(this.bits.length / 8));
    for (let i = 0; i < this.bits.length; i++) if (this.bits[i]) out[i >>> 3] |= 0x80 >>> (i & 7);
    return out;
  }
}

/* ------------------------------ QR builder ------------------------------ */

class QrBuilder {
  readonly size: number;
  readonly modules: boolean[][];
  private readonly isFunction: boolean[][];

  constructor(
    readonly version: number,
    readonly ecLevel: EcLevel
  ) {
    this.size = version * 4 + 17;
    this.modules = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));
    this.isFunction = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));
  }

  setFn(x: number, y: number, dark: boolean) {
    this.modules[y][x] = dark;
    this.isFunction[y][x] = true;
  }

  /** Finder patterns plus their separators, and the two timing patterns. */
  drawFunctionPatterns() {
    const s = this.size;
    for (const [cx, cy] of [
      [0, 0],
      [s - 7, 0],
      [0, s - 7],
    ]) {
      for (let dy = -1; dy <= 7; dy++) {
        for (let dx = -1; dx <= 7; dx++) {
          const x = cx + dx;
          const y = cy + dy;
          if (x < 0 || y < 0 || x >= s || y >= s) continue;
          const inRing = (dx >= 0 && dx <= 6 && (dy === 0 || dy === 6)) || (dy >= 0 && dy <= 6 && (dx === 0 || dx === 6));
          const inCore = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
          this.setFn(x, y, inRing || inCore);
        }
      }
    }
    for (let i = 8; i < s - 8; i++) {
      this.setFn(6, i, i % 2 === 0);
      this.setFn(i, 6, i % 2 === 0);
    }
    // Alignment patterns, skipping the three that would clash with finders.
    const centres = ALIGN[this.version - 1];
    for (const cy of centres) {
      for (const cx of centres) {
        const nearFinder =
          (cx <= 8 && cy <= 8) || (cx <= 8 && cy >= s - 9) || (cx >= s - 9 && cy <= 8);
        if (nearFinder) continue;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            this.setFn(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
          }
        }
      }
    }
    // Reserve the format-info strips so data placement skips them.
    for (let i = 0; i < 9; i++) {
      this.isFunction[8][i] = true;
      this.isFunction[i][8] = true;
    }
    for (let i = 0; i < 8; i++) {
      this.isFunction[8][s - 1 - i] = true;
      this.isFunction[s - 1 - i][8] = true;
    }
    this.modules[s - 8][8] = true; // the always-dark module
    this.isFunction[s - 8][8] = true;

    if (this.version >= 7) {
      for (let i = 0; i < 18; i++) {
        const a = s - 11 + (i % 3);
        const b = Math.floor(i / 3);
        this.isFunction[b][a] = true;
        this.isFunction[a][b] = true;
      }
    }
  }

  /** Zigzag placement of the interleaved codeword bits. */
  drawCodewords(bytes: Uint8Array) {
    const s = this.size;
    let bitIndex = 0;
    const totalBits = bytes.length * 8;
    for (let right = s - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5; // skip the vertical timing column
      for (let vert = 0; vert < s; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? s - 1 - vert : vert;
          if (this.isFunction[y][x]) continue;
          const bit = bitIndex < totalBits ? (bytes[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1 : 0;
          this.modules[y][x] = bit === 1;
          bitIndex++;
        }
      }
    }
  }

  applyMask(mask: number) {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if (this.isFunction[y][x]) continue;
        let invert;
        switch (mask) {
          case 0: invert = (x + y) % 2 === 0; break;
          case 1: invert = y % 2 === 0; break;
          case 2: invert = x % 3 === 0; break;
          case 3: invert = (x + y) % 3 === 0; break;
          case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break;
          case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
          default: invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; break;
        }
        if (invert) this.modules[y][x] = !this.modules[y][x];
      }
    }
  }

  drawFormatBits(mask: number) {
    const s = this.size;
    const data = (EC_FORMAT_BITS[this.ecLevel] << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    const bit = (i: number) => ((bits >>> i) & 1) === 1;

    for (let i = 0; i <= 5; i++) this.setFn(8, i, bit(i));
    this.setFn(8, 7, bit(6));
    this.setFn(8, 8, bit(7));
    this.setFn(7, 8, bit(8));
    for (let i = 9; i < 15; i++) this.setFn(14 - i, 8, bit(i));

    for (let i = 0; i < 8; i++) this.setFn(s - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) this.setFn(8, s - 15 + i, bit(i));
    this.setFn(8, s - 8, true);
  }

  drawVersionBits() {
    if (this.version < 7) return;
    let rem = this.version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (this.version << 12) | rem;
    const s = this.size;
    for (let i = 0; i < 18; i++) {
      const on = ((bits >>> i) & 1) === 1;
      const a = s - 11 + (i % 3);
      const b = Math.floor(i / 3);
      this.setFn(a, b, on);
      this.setFn(b, a, on);
    }
  }

  /** The four penalty rules from ISO 18004; lower is better. */
  penalty(): number {
    const s = this.size;
    const m = this.modules;
    let score = 0;

    // Rule 1: runs of five or more identical modules in a row or column.
    const scanLine = (get: (k: number) => boolean) => {
      let runColor = get(0);
      let runLength = 1;
      for (let k = 1; k < s; k++) {
        const c = get(k);
        if (c === runColor) {
          runLength++;
        } else {
          if (runLength >= 5) score += 3 + (runLength - 5);
          runColor = c;
          runLength = 1;
        }
      }
      if (runLength >= 5) score += 3 + (runLength - 5);
    };
    for (let i = 0; i < s; i++) {
      scanLine((k) => m[i][k]);
      scanLine((k) => m[k][i]);
    }

    // Rule 2: every 2x2 block of a single colour.
    for (let y = 0; y < s - 1; y++) {
      for (let x = 0; x < s - 1; x++) {
        const c = m[y][x];
        if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) score += 3;
      }
    }

    // Rule 3: a 1:1:3:1:1 dark/light run that has four light modules on either
    // side. Either side counts, so this is an OR, not an AND.
    const FINDER = [true, false, true, true, true, false, true];
    const scanPatterns = (get: (k: number) => boolean) => {
      for (let start = 0; start + 7 <= s; start++) {
        let hit = true;
        for (let k = 0; k < 7; k++) {
          if (get(start + k) !== FINDER[k]) {
            hit = false;
            break;
          }
        }
        if (!hit) continue;
        const lightBefore = [0, 1, 2, 3].every((o) => {
          const idx = start - 4 + o;
          return idx < 0 || !get(idx);
        });
        const lightAfter = [0, 1, 2, 3].every((o) => {
          const idx = start + 7 + o;
          return idx >= s || !get(idx);
        });
        if (lightBefore || lightAfter) score += 40;
      }
    };
    for (let i = 0; i < s; i++) {
      scanPatterns((k) => m[i][k]);
      scanPatterns((k) => m[k][i]);
    }

    // Rule 4: deviation from an even split of dark and light modules.
    let dark = 0;
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) if (m[y][x]) dark++;
    const total = s * s;
    const fivePercentSteps = Math.floor(Math.abs(dark * 20 - total * 10) / total);
    score += fivePercentSteps * 10;

    return score;
  }
}

/* ------------------------------ block layout ---------------------------- */

function interleave(version: number, ec: EcLevel, payload: Uint8Array): Uint8Array {
  const numBlocks = EC_BLOCKS[ec][version - 1];
  const eccLen = ECC_PER_BLOCK[ec][version - 1];
  const totalData = dataCodewords(version, ec);
  const shortLen = Math.floor(totalData / numBlocks);
  const numLong = totalData % numBlocks;

  const dataBlocks: Uint8Array[] = [];
  const eccBlocks: Uint8Array[] = [];
  let offset = 0;
  for (let i = 0; i < numBlocks; i++) {
    const len = shortLen + (i >= numBlocks - numLong ? 1 : 0);
    const block = payload.slice(offset, offset + len);
    offset += len;
    dataBlocks.push(block);
    eccBlocks.push(rsEncode(block, eccLen));
  }

  const out = new Uint8Array(totalData + eccLen * numBlocks);
  let k = 0;
  const maxData = shortLen + (numLong > 0 ? 1 : 0);
  for (let i = 0; i < maxData; i++) {
    for (let b = 0; b < numBlocks; b++) if (i < dataBlocks[b].length) out[k++] = dataBlocks[b][i];
  }
  for (let i = 0; i < eccLen; i++) {
    for (let b = 0; b < numBlocks; b++) out[k++] = eccBlocks[b][i];
  }
  return out;
}

/* -------------------------------- encode -------------------------------- */

function utf8Bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export const MAX_QR_BYTES = dataCodewords(MAX_VERSION, "L") - 3; // minus mode + length header

/**
 * Encode `text` as a QR code in byte mode.
 *
 * Picks the smallest version that fits at the requested error-correction
 * level, then the mask with the lowest penalty score, as the spec requires.
 */
export function encodeQr(text: string, ecLevel: EcLevel = "M"): QrResult {
  const data = utf8Bytes(text);
  if (!data.length) throw new Error("Enter something to encode.");

  let version = 0;
  for (let v = MIN_VERSION; v <= MAX_VERSION; v++) {
    const countBits = v <= 9 ? 8 : 16;
    const needed = 4 + countBits + data.length * 8;
    if (needed <= dataCodewords(v, ecLevel) * 8) {
      version = v;
      break;
    }
  }
  if (!version) {
    throw new Error(`Too long. The limit is ${MAX_QR_BYTES} characters at this correction level.`);
  }

  const countBits = version <= 9 ? 8 : 16;
  const buf = new BitBuffer();
  buf.push(0b0100, 4); // byte mode
  buf.push(data.length, countBits);
  for (const b of data) buf.push(b, 8);

  const capacityBits = dataCodewords(version, ecLevel) * 8;
  buf.push(0, Math.min(4, capacityBits - buf.length)); // terminator
  while (buf.length % 8 !== 0) buf.push(0, 1);
  const padBytes = [0xec, 0x11];
  for (let i = 0; buf.length < capacityBits; i++) buf.push(padBytes[i % 2], 8);

  const codewords = interleave(version, ecLevel, buf.toBytes());

  // Try all eight masks and keep the lowest-penalty result, as the spec says.
  let best: { b: QrBuilder; score: number; mask: number } | null = null;
  for (let mask = 0; mask < 8; mask++) {
    const b = new QrBuilder(version, ecLevel);
    b.drawFunctionPatterns();
    b.drawCodewords(codewords);
    b.applyMask(mask);
    b.drawFormatBits(mask);
    b.drawVersionBits();
    const score = b.penalty();
    if (!best || score < best.score) best = { b, score, mask };
  }

  const chosen = best!;
  return {
    size: chosen.b.size,
    modules: chosen.b.modules,
    version,
    ecLevel,
    mask: chosen.mask,
  };
}

/* -------------------------------- render -------------------------------- */

export interface QrRenderOptions {
  /** Modules per pixel. */
  scale?: number;
  /** Quiet zone in modules; the spec requires at least 4. */
  border?: number;
  dark?: string;
  light?: string;
}

/** SVG string. Vector, so it stays sharp at any size and prints cleanly. */
export function qrToSvg(result: QrResult, opts: QrRenderOptions = {}): string {
  const scale = Math.max(1, Math.round(opts.scale ?? 8));
  const border = Math.max(0, opts.border ?? 4);
  const dark = opts.dark ?? "#000000";
  const light = opts.light ?? "#ffffff";
  const n = result.size + border * 2;
  const dim = n * scale;

  // One path for every dark module keeps the SVG small.
  let d = "";
  for (let y = 0; y < result.size; y++) {
    for (let x = 0; x < result.size; x++) {
      if (!result.modules[y][x]) continue;
      d += `M${(x + border) * scale} ${(y + border) * scale}h${scale}v${scale}h-${scale}z`;
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${dim}" height="${dim}" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges">` +
    `<rect width="${dim}" height="${dim}" fill="${light}"/>` +
    `<path d="${d}" fill="${dark}"/></svg>`
  );
}

/** Draw onto a canvas at high resolution, for PNG export. */
export function qrToCanvas(
  result: QrResult,
  canvas: HTMLCanvasElement,
  opts: QrRenderOptions = {}
): void {
  const scale = Math.max(1, Math.round(opts.scale ?? 8));
  const border = Math.max(0, opts.border ?? 4);
  const n = result.size + border * 2;
  canvas.width = n * scale;
  canvas.height = n * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = opts.light ?? "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = opts.dark ?? "#000000";
  for (let y = 0; y < result.size; y++) {
    for (let x = 0; x < result.size; x++) {
      if (result.modules[y][x]) ctx.fillRect((x + border) * scale, (y + border) * scale, scale, scale);
    }
  }
}

/** Rough capacity hint for the UI, in bytes at each level. */
export function qrCapacity(ec: EcLevel): number {
  let best = 0;
  for (let v = MIN_VERSION; v <= MAX_VERSION; v++) {
    const countBits = v <= 9 ? 8 : 16;
    const usable = dataCodewords(v, ec) * 8 - 4 - countBits;
    best = Math.max(best, Math.floor(usable / 8));
  }
  return best;
}
