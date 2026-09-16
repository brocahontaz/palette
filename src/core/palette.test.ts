import { describe, expect, it } from 'vitest';
import { extractPalette, NEAR_BLACK_MAX, NEAR_WHITE_MIN } from './palette';

/** Builds RGBA pixel data from a flat list of RGB colors. */
function pixelsOf(colors: Array<[number, number, number]>, alpha = 255): Uint8ClampedArray {
  const data = new Uint8ClampedArray(colors.length * 4);
  colors.forEach(([r, g, b], i) => {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = alpha;
  });
  return data;
}

const RED: [number, number, number] = [255, 0, 0];
const GREEN: [number, number, number] = [0, 255, 0];
const BLUE: [number, number, number] = [0, 0, 255];

describe('extractPalette', () => {
  it('returns an empty palette for empty input', () => {
    expect(extractPalette(new Uint8ClampedArray(0), 8)).toEqual([]);
  });

  it('returns an empty palette for fully transparent input', () => {
    expect(extractPalette(pixelsOf([RED, BLUE, GREEN], 0), 8)).toEqual([]);
  });

  it('returns an empty palette for a maxColors of 0', () => {
    expect(extractPalette(pixelsOf([RED]), 0)).toEqual([]);
  });

  it('returns a single color for a uniform image', () => {
    const pixels = pixelsOf([RED, RED, RED, RED]);
    expect(extractPalette(pixels, 8)).toEqual([{ hex: '#ff0000', count: 4 }]);
  });

  it('ignores near-transparent, near-white and near-black pixels', () => {
    const opaqueRed: [number, number, number] = [255, 0, 0];
    const pixels = new Uint8ClampedArray([
      // opaque red, kept
      ...opaqueRed,
      255,
      // half-transparent red, dropped
      ...opaqueRed,
      100,
      // near-white, dropped
      255,
      255,
      255,
      255,
      // off-white just below the threshold, kept
      NEAR_WHITE_MIN - 1,
      255,
      255,
      255,
      // near-black (at the threshold), dropped
      NEAR_BLACK_MAX,
      NEAR_BLACK_MAX,
      NEAR_BLACK_MAX,
      255,
    ]);
    const palette = extractPalette(pixels, 8);
    expect(palette).toHaveLength(2);
    // equal counts: tie broken deterministically by hex order
    expect(palette.map((c) => c.hex)).toEqual(['#f9ffff', '#ff0000']);
  });

  it('separates a two-color image into its pure colors', () => {
    const pixels = pixelsOf([...Array(8).fill(RED), ...Array(8).fill(BLUE)]);
    const palette = extractPalette(pixels, 2);
    // equal counts: tie broken deterministically by hex order
    expect(palette).toEqual([
      { hex: '#0000ff', count: 8 },
      { hex: '#ff0000', count: 8 },
    ]);
  });

  it('returns one averaged box when maxColors is 1', () => {
    const pixels = pixelsOf([...Array(8).fill(RED), ...Array(8).fill(BLUE)]);
    const palette = extractPalette(pixels, 1);
    // the single box averages red and blue to (128, 0, 128)
    expect(palette).toEqual([{ hex: '#800080', count: 16 }]);
  });

  it('puts the dominant color first for a three-color image', () => {
    // 8 red, 4 blue, 4 green: the first median split isolates red (8 px),
    // the second splits blue from green cleanly.
    const pixels = pixelsOf([
      ...Array(8).fill(RED),
      ...Array(4).fill(BLUE),
      ...Array(4).fill(GREEN),
    ]);
    const palette = extractPalette(pixels, 3);
    expect(palette).toEqual([
      { hex: '#ff0000', count: 8 },
      { hex: '#0000ff', count: 4 },
      { hex: '#00ff00', count: 4 },
    ]);
  });

  it('caps the result at maxColors', () => {
    const pixels = pixelsOf([
      ...Array(8).fill(RED),
      ...Array(4).fill(BLUE),
      ...Array(4).fill(GREEN),
    ]);
    const palette = extractPalette(pixels, 2);
    expect(palette).toHaveLength(2);
    // the two boxes tie at 8 px each; red is always present, the other box
    // averages blue and green to (0, 128, 128)
    expect(palette.map((c) => c.hex)).toEqual(['#008080', '#ff0000']);
  });

  it('sorts by count descending and sums merged boxes', () => {
    const pixels = pixelsOf([
      ...Array(8).fill(RED),
      ...Array(4).fill(BLUE),
      ...Array(4).fill(GREEN),
    ]);
    const palette = extractPalette(pixels, 4);
    for (let i = 1; i < palette.length; i++) {
      expect(palette[i - 1].count).toBeGreaterThanOrEqual(palette[i].count);
    }
    expect(palette.reduce((sum, c) => sum + c.count, 0)).toBeLessThanOrEqual(16);
    expect(palette.every((c) => /^#[0-9a-f]{6}$/.test(c.hex))).toBe(true);
  });

  it('is deterministic across runs', () => {
    const pixels = new Uint8ClampedArray(64 * 4);
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = (i * 7) % 256;
      pixels[i + 1] = (i * 13) % 256;
      pixels[i + 2] = (i * 29) % 256;
      pixels[i + 3] = 255;
    }
    const a = extractPalette(pixels, 8);
    const b = extractPalette(pixels, 8);
    expect(a).toEqual(b);
  });
});
