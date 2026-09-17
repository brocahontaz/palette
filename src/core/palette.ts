// Pure palette extraction via median-cut quantization over raw RGBA pixels.
// No DOM, no I/O — fully unit-tested in palette.test.ts.
//
// Determinism: ties are broken by channel order, stable sort and hex order,
// so the same input always yields the same palette.

import { rgbToHex } from './color';

export interface PaletteColor {
  hex: string;
  /** Number of source pixels represented by this color */
  count: number;
}

type Pixel = [number, number, number];

interface Box {
  pixels: Pixel[];
}

/** Pixels with alpha below this are treated as transparent and ignored. */
export const ALPHA_MIN = 128;
/** Pixels with every channel ≥ this are near-white and ignored. */
export const NEAR_WHITE_MIN = 250;
/** Pixels with every channel ≤ this are near-black and ignored. */
export const NEAR_BLACK_MAX = 5;

function rangeOf(box: Box): { channel: number; range: number } {
  const min: Pixel = [255, 255, 255];
  const max: Pixel = [0, 0, 0];
  for (const p of box.pixels) {
    for (let c = 0; c < 3; c++) {
      if (p[c] < min[c]) min[c] = p[c];
      if (p[c] > max[c]) max[c] = p[c];
    }
  }
  let channel = 0;
  let range = -1;
  for (let c = 0; c < 3; c++) {
    const r = max[c] - min[c];
    if (r > range) {
      range = r;
      channel = c;
    }
  }
  return { channel, range };
}

/** Splits a box along its widest channel at the median pixel; null if unsplittable. */
function splitBox(box: Box): [Box, Box] | null {
  if (box.pixels.length < 2) return null;
  const { channel, range } = rangeOf(box);
  if (range === 0) return null;
  const sorted = [...box.pixels].sort((a, b) => a[channel] - b[channel]);
  const mid = Math.floor(sorted.length / 2);
  return [{ pixels: sorted.slice(0, mid) }, { pixels: sorted.slice(mid) }];
}

/**
 * Extracts a palette of at most `maxColors` colors from raw RGBA pixel data.
 * Near-transparent, near-white and near-black pixels are ignored. Remaining
 * pixels are quantized with median cut; each resulting box is averaged, boxes
 * are sorted by pixel count (descending, ties broken by hex) and capped.
 */
export function extractPalette(pixels: Uint8ClampedArray, maxColors: number): PaletteColor[] {
  if (maxColors <= 0 || pixels.length < 4) return [];

  const kept: Pixel[] = [];
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] < ALPHA_MIN) continue;
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const min = Math.min(r, g, b);
    const max = Math.max(r, g, b);
    if (min >= NEAR_WHITE_MIN || max <= NEAR_BLACK_MAX) continue;
    kept.push([r, g, b]);
  }
  if (kept.length === 0) return [];

  const boxes: Box[] = [{ pixels: kept }];
  while (boxes.length < maxColors) {
    let target = -1;
    let bestRange = 0;
    let bestSize = 0;
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i];
      const { range } = rangeOf(box);
      if (range <= 0) continue; // unsplittable
      const size = box.pixels.length;
      if (range > bestRange || (range === bestRange && size > bestSize)) {
        bestRange = range;
        bestSize = size;
        target = i;
      }
    }
    if (target === -1) break; // nothing left to split
    const halves = splitBox(boxes[target]);
    if (!halves) break;
    boxes.splice(target, 1, halves[0], halves[1]);
  }

  const merged = new Map<string, number>();
  for (const box of boxes) {
    const n = box.pixels.length;
    if (n === 0) continue;
    let r = 0;
    let g = 0;
    let b = 0;
    for (const p of box.pixels) {
      r += p[0];
      g += p[1];
      b += p[2];
    }
    const hex = rgbToHex({ r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) });
    merged.set(hex, (merged.get(hex) ?? 0) + n);
  }

  return [...merged.entries()]
    .map(([hex, count]) => ({ hex, count }))
    .sort((a, b) => b.count - a.count || a.hex.localeCompare(b.hex))
    .slice(0, maxColors);
}
