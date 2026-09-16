// Pure color math: conversions, WCAG luminance/contrast, threshold evaluation.
// No DOM, no I/O — fully unit-tested in color.test.ts.

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Hsl {
  /** Hue in degrees, 0–359 */
  h: number;
  /** Saturation in percent, 0–100 */
  s: number;
  /** Lightness in percent, 0–100 */
  l: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

/**
 * Parses a hex color string into RGB. Accepts `#abc`, `abc`, `#aabbcc` and
 * `aabbcc`, case-insensitively. Returns null for anything else.
 */
export function parseHex(input: string): Rgb | null {
  const hex = input.trim().replace(/^#/, '');
  if (!/^[0-9a-f]+$/i.test(hex)) return null;
  if (hex.length === 3) {
    return {
      r: parseInt(hex.charAt(0) + hex.charAt(0), 16),
      g: parseInt(hex.charAt(1) + hex.charAt(1), 16),
      b: parseInt(hex.charAt(2) + hex.charAt(2), 16),
    };
  }
  if (hex.length === 6) {
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }
  return null;
}

/** Formats RGB as a lowercase `#rrggbb` string, clamping channels to 0–255. */
export function rgbToHex(rgb: Rgb): string {
  const channel = (v: number): string => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
  return `#${channel(rgb.r)}${channel(rgb.g)}${channel(rgb.b)}`;
}

/** Converts RGB to HSL. Hue wraps into 0–359, saturation/lightness round to 0–100. */
export function rgbToHsl(rgb: Rgb): Hsl {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h = Math.round((h / 6) * 360) % 360;
  }
  return { h, s: Math.round(s * 100), l: Math.round(l * 100) };
}

/** Converts HSL to RGB. Hue values outside 0–359 wrap around. */
export function hslToRgb(hsl: Hsl): Rgb {
  const h = (((hsl.h % 360) + 360) % 360) / 360;
  const s = clamp01(hsl.s / 100);
  const l = clamp01(hsl.l / 100);
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number): number => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  return {
    r: Math.round(channel(h + 1 / 3) * 255),
    g: Math.round(channel(h) * 255),
    b: Math.round(channel(h - 1 / 3) * 255),
  };
}

/** WCAG 2.x relative luminance of an RGB color. */
export function relativeLuminance(rgb: Rgb): number {
  const linearize = (v: number): number => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * linearize(rgb.r) + 0.7152 * linearize(rgb.g) + 0.0722 * linearize(rgb.b);
}

/** WCAG contrast ratio between two colors, from 1 (identical) to 21 (black/white). */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export interface WcagEvaluation {
  /** ≥ 4.5 */
  aaNormal: boolean;
  /** ≥ 3 */
  aaLarge: boolean;
  /** ≥ 7 */
  aaaNormal: boolean;
  /** ≥ 4.5 */
  aaaLarge: boolean;
}

/**
 * Evaluates a contrast ratio against the WCAG 2.x success criteria.
 * Large text means ≥ 24px regular or ≥ 18.66px bold (see isLargeText).
 */
export function evaluateWcag(ratio: number): WcagEvaluation {
  return {
    aaNormal: ratio >= 4.5,
    aaLarge: ratio >= 3,
    aaaNormal: ratio >= 7,
    aaaLarge: ratio >= 4.5,
  };
}

/** WCAG definition of large text: ≥ 24px at any weight, or ≥ 18.66px when bold. */
export function isLargeText(sizePx: number, bold: boolean): boolean {
  return sizePx >= 24 || (bold && sizePx >= 18.66);
}

export function formatRgb(rgb: Rgb): string {
  return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
}

export function formatHsl(hsl: Hsl): string {
  return `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;
}
