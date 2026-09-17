import { describe, expect, it } from 'vitest';
import {
  clamp,
  contrastRatio,
  evaluateWcag,
  formatHsl,
  formatRgb,
  hslToRgb,
  isLargeText,
  parseHex,
  relativeLuminance,
  rgbToHex,
  rgbToHsl,
} from './color';

describe('parseHex', () => {
  it('parses 6-digit hex with hash', () => {
    expect(parseHex('#aabbcc')).toEqual({ r: 170, g: 187, b: 204 });
  });

  it('parses 6-digit hex without hash', () => {
    expect(parseHex('aabbcc')).toEqual({ r: 170, g: 187, b: 204 });
  });

  it('parses uppercase hex', () => {
    expect(parseHex('#AABBCC')).toEqual({ r: 170, g: 187, b: 204 });
  });

  it('parses 3-digit shorthand, upper and lower case', () => {
    expect(parseHex('#abc')).toEqual({ r: 170, g: 187, b: 204 });
    expect(parseHex('#ABC')).toEqual({ r: 170, g: 187, b: 204 });
    expect(parseHex('f00')).toEqual({ r: 255, g: 0, b: 0 });
  });

  it('rejects invalid input', () => {
    expect(parseHex('')).toBeNull();
    expect(parseHex('#')).toBeNull();
    expect(parseHex('#ab')).toBeNull();
    expect(parseHex('#abbcc')).toBeNull();
    expect(parseHex('#aabbc')).toBeNull();
    expect(parseHex('#aabbbcc')).toBeNull();
    expect(parseHex('#ggg')).toBeNull();
    expect(parseHex('#abcg')).toBeNull();
    expect(parseHex('not a color')).toBeNull();
  });
});

describe('clamp', () => {
  it('clamps to the range', () => {
    expect(clamp(300, 0, 255)).toBe(255);
    expect(clamp(-5, 0, 255)).toBe(0);
    expect(clamp(128, 0, 255)).toBe(128);
  });
});

describe('rgbToHex', () => {
  it('formats lowercase two-digit channels', () => {
    expect(rgbToHex({ r: 170, g: 187, b: 204 })).toBe('#aabbcc');
    expect(rgbToHex({ r: 0, g: 0, b: 0 })).toBe('#000000');
    expect(rgbToHex({ r: 255, g: 255, b: 255 })).toBe('#ffffff');
  });

  it('clamps and rounds out-of-range channels', () => {
    expect(rgbToHex({ r: 300, g: -20, b: 0 })).toBe('#ff0000');
    expect(rgbToHex({ r: 12.4, g: 12.6, b: 0 })).toBe('#0c0d00');
  });
});

describe('rgbToHex round trip', () => {
  it('survives parse → format for a set of colors', () => {
    const inputs = ['#000000', '#ffffff', '#f00', '#4cc2ff', '#123456', '#789AbC'];
    for (const input of inputs) {
      const rgb = parseHex(input);
      expect(rgb).not.toBeNull();
      const hex = rgbToHex(rgb!);
      expect(hex).toMatch(/^#[0-9a-f]{6}$/);
      expect(parseHex(hex)).toEqual(rgb);
    }
  });
});

describe('rgbToHsl', () => {
  it('converts known values', () => {
    expect(rgbToHsl({ r: 255, g: 0, b: 0 })).toEqual({ h: 0, s: 100, l: 50 });
    expect(rgbToHsl({ r: 0, g: 255, b: 0 })).toEqual({ h: 120, s: 100, l: 50 });
    expect(rgbToHsl({ r: 0, g: 0, b: 255 })).toEqual({ h: 240, s: 100, l: 50 });
    expect(rgbToHsl({ r: 0, g: 255, b: 255 })).toEqual({ h: 180, s: 100, l: 50 });
    expect(rgbToHsl({ r: 128, g: 128, b: 128 })).toEqual({ h: 0, s: 0, l: 50 });
    expect(rgbToHsl({ r: 0, g: 0, b: 0 })).toEqual({ h: 0, s: 0, l: 0 });
    expect(rgbToHsl({ r: 255, g: 255, b: 255 })).toEqual({ h: 0, s: 0, l: 100 });
    expect(rgbToHsl({ r: 170, g: 187, b: 204 })).toEqual({ h: 210, s: 25, l: 73 });
  });
});

describe('hslToRgb', () => {
  it('converts known values', () => {
    expect(hslToRgb({ h: 0, s: 100, l: 50 })).toEqual({ r: 255, g: 0, b: 0 });
    expect(hslToRgb({ h: 120, s: 100, l: 50 })).toEqual({ r: 0, g: 255, b: 0 });
    expect(hslToRgb({ h: 240, s: 100, l: 50 })).toEqual({ r: 0, g: 0, b: 255 });
    expect(hslToRgb({ h: 0, s: 0, l: 50 })).toEqual({ r: 128, g: 128, b: 128 });
  });

  it('wraps hue values outside 0–359', () => {
    expect(hslToRgb({ h: 360, s: 100, l: 50 })).toEqual({ r: 255, g: 0, b: 0 });
    expect(hslToRgb({ h: 480, s: 100, l: 50 })).toEqual({ r: 0, g: 255, b: 0 });
    expect(hslToRgb({ h: -120, s: 100, l: 50 })).toEqual({ r: 0, g: 0, b: 255 });
    expect(hslToRgb({ h: -360, s: 0, l: 0 })).toEqual({ r: 0, g: 0, b: 0 });
  });
});

describe('rgb ↔ hsl round trip', () => {
  it('stays within integer-quantization error of the original color', () => {
    // HSL components are rounded to whole percent for display, so the round
    // trip can drift by up to 2/255 per channel.
    const colors = [
      { r: 255, g: 0, b: 0 },
      { r: 0, g: 128, b: 255 },
      { r: 170, g: 187, b: 204 },
      { r: 18, g: 52, b: 86 },
      { r: 250, g: 240, b: 230 },
    ];
    for (const rgb of colors) {
      const back = hslToRgb(rgbToHsl(rgb));
      expect(Math.abs(back.r - rgb.r)).toBeLessThanOrEqual(2);
      expect(Math.abs(back.g - rgb.g)).toBeLessThanOrEqual(2);
      expect(Math.abs(back.b - rgb.b)).toBeLessThanOrEqual(2);
    }
  });
});

describe('relativeLuminance', () => {
  it('maps black to 0 and white to 1', () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBe(0);
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 12);
  });
});

describe('contrastRatio', () => {
  it('is 21 for black on white', () => {
    expect(contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })).toBeCloseTo(21, 10);
  });

  it('is 1 for identical colors', () => {
    expect(contrastRatio({ r: 66, g: 135, b: 245 }, { r: 66, g: 135, b: 245 })).toBeCloseTo(1, 10);
  });

  it('is symmetric', () => {
    const a = { r: 255, g: 0, b: 0 };
    const b = { r: 0, g: 0, b: 255 };
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 12);
  });

  it('matches the known value for #777 vs #fff (≈ 4.48)', () => {
    expect(contrastRatio({ r: 119, g: 119, b: 119 }, { r: 255, g: 255, b: 255 })).toBeCloseTo(
      4.48,
      2,
    );
  });
});

describe('evaluateWcag', () => {
  it.each([
    { ratio: 2.9, aaNormal: false, aaLarge: false, aaaNormal: false, aaaLarge: false },
    { ratio: 3, aaNormal: false, aaLarge: true, aaaNormal: false, aaaLarge: false },
    { ratio: 4.4, aaNormal: false, aaLarge: true, aaaNormal: false, aaaLarge: false },
    { ratio: 4.5, aaNormal: true, aaLarge: true, aaaNormal: false, aaaLarge: true },
    { ratio: 6.9, aaNormal: true, aaLarge: true, aaaNormal: false, aaaLarge: true },
    { ratio: 7, aaNormal: true, aaLarge: true, aaaNormal: true, aaaLarge: true },
  ])('evaluates ratio $ratio correctly', ({ ratio, ...expected }) => {
    expect(evaluateWcag(ratio)).toEqual(expected);
  });
});

describe('isLargeText', () => {
  it('treats ≥ 24px as large regardless of weight', () => {
    expect(isLargeText(24, false)).toBe(true);
    expect(isLargeText(28, true)).toBe(true);
    expect(isLargeText(23.9, false)).toBe(false);
  });

  it('treats ≥ 18.66px bold as large', () => {
    expect(isLargeText(18.66, true)).toBe(true);
    expect(isLargeText(19, true)).toBe(true);
    expect(isLargeText(18, true)).toBe(false);
    expect(isLargeText(18.66, false)).toBe(false);
  });
});

describe('formatting', () => {
  it('formats rgb() and hsl() strings', () => {
    expect(formatRgb({ r: 18, g: 52, b: 86 })).toBe('rgb(18, 52, 86)');
    expect(formatHsl({ h: 210, s: 25, l: 73 })).toBe('hsl(210, 25%, 73%)');
  });
});
