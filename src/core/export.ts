// Pure string generators for exporting the palette. String in, string out —
// fully unit-tested in export.test.ts.

import { parseHex, rgbToHex, rgbToHsl } from './color';

export interface ExportColor {
  hex: string;
  name?: string;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Stable variable name: derived from the optional name, else the 1-based index. */
function cssVarName(color: ExportColor, index: number): string {
  const slug = color.name ? slugify(color.name) : '';
  return `--${slug || `color-${index + 1}`}`;
}

function normalizeHex(hex: string): string {
  const rgb = parseHex(hex);
  return rgb ? rgbToHex(rgb) : hex;
}

/**
 * Generates a `:root { … }` CSS custom-property block. Colors without a name
 * get stable positional names (`--color-1`, `--color-2`, …).
 */
export function generateCssVariables(colors: ExportColor[]): string {
  if (colors.length === 0) return '';
  const lines = colors.map((color, i) => `  ${cssVarName(color, i)}: ${normalizeHex(color.hex)};`);
  return `:root {\n${lines.join('\n')}\n}`;
}

/** Pretty-printed JSON array of `{ hex, rgb, hsl }` objects. */
export function paletteToJson(colors: ExportColor[]): string {
  const entries = colors.map((color) => {
    const rgb = parseHex(color.hex) ?? { r: 0, g: 0, b: 0 };
    return {
      hex: rgbToHex(rgb),
      rgb: { ...rgb },
      hsl: { ...rgbToHsl(rgb) },
    };
  });
  return JSON.stringify(entries, null, 2);
}

/** Newline-separated list of hex values for plain-text reuse. */
export function toPlainList(colors: ExportColor[]): string {
  return colors.map((color) => normalizeHex(color.hex)).join('\n');
}
