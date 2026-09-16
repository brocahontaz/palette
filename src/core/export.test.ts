import { describe, expect, it } from 'vitest';
import { generateCssVariables, paletteToJson, toPlainList, type ExportColor } from './export';

describe('generateCssVariables', () => {
  it('produces the exact :root block with positional names', () => {
    expect(generateCssVariables([{ hex: '#aabbcc' }, { hex: '#112233' }])).toBe(
      ':root {\n  --color-1: #aabbcc;\n  --color-2: #112233;\n}',
    );
  });

  it('derives stable names from optional names', () => {
    expect(generateCssVariables([{ hex: '#123456', name: 'Deep Sea' }])).toBe(
      ':root {\n  --deep-sea: #123456;\n}',
    );
  });

  it('mixes named and positional colors without shifting indexes', () => {
    const colors: ExportColor[] = [{ hex: '#111111' }, { hex: '#222222', name: 'Navy' }];
    expect(generateCssVariables(colors)).toBe(
      ':root {\n  --color-1: #111111;\n  --navy: #222222;\n}',
    );
  });

  it('slugifies punctuation and repeated names deterministically', () => {
    const colors: ExportColor[] = [
      { hex: '#111111', name: 'My Color!' },
      { hex: '#222222', name: '  spaced---out  ' },
    ];
    expect(generateCssVariables(colors)).toBe(
      ':root {\n  --my-color: #111111;\n  --spaced-out: #222222;\n}',
    );
    expect(generateCssVariables(colors)).toBe(generateCssVariables(colors));
  });

  it('falls back to the index when a name slugs to nothing', () => {
    expect(generateCssVariables([{ hex: '#111111', name: '!!!' }])).toBe(
      ':root {\n  --color-1: #111111;\n}',
    );
  });

  it('normalizes hex casing', () => {
    expect(generateCssVariables([{ hex: '#AABBCC' }])).toBe(':root {\n  --color-1: #aabbcc;\n}');
  });

  it('returns an empty string for an empty palette', () => {
    expect(generateCssVariables([])).toBe('');
  });
});

describe('paletteToJson', () => {
  it('produces valid JSON with hex, rgb and hsl entries', () => {
    const json = paletteToJson([{ hex: '#ff0000' }, { hex: '#808080' }]);
    const parsed: unknown = JSON.parse(json);
    expect(parsed).toEqual([
      {
        hex: '#ff0000',
        rgb: { r: 255, g: 0, b: 0 },
        hsl: { h: 0, s: 100, l: 50 },
      },
      {
        hex: '#808080',
        rgb: { r: 128, g: 128, b: 128 },
        hsl: { h: 0, s: 0, l: 50 },
      },
    ]);
  });

  it('pretty-prints with two-space indentation', () => {
    const json = paletteToJson([{ hex: '#ffffff' }]);
    expect(json.split('\n')).toEqual([
      '[',
      '  {',
      '    "hex": "#ffffff",',
      '    "rgb": {',
      '      "r": 255,',
      '      "g": 255,',
      '      "b": 255',
      '    },',
      '    "hsl": {',
      '      "h": 0,',
      '      "s": 0,',
      '      "l": 100',
      '    }',
      '  }',
      ']',
    ]);
  });

  it('round-trips through JSON.parse', () => {
    const colors: ExportColor[] = [{ hex: '#4cc2ff' }, { hex: '#0b0f14' }];
    const parsed = JSON.parse(paletteToJson(colors)) as Array<{ hex: string }>;
    expect(parsed.map((entry) => entry.hex)).toEqual(['#4cc2ff', '#0b0f14']);
  });

  it('returns "[]" for an empty palette', () => {
    expect(paletteToJson([])).toBe('[]');
  });
});

describe('toPlainList', () => {
  it('joins hex values with newlines', () => {
    expect(toPlainList([{ hex: '#aabbcc' }, { hex: '#112233' }])).toBe('#aabbcc\n#112233');
  });

  it('returns an empty string for an empty palette', () => {
    expect(toPlainList([])).toBe('');
  });
});
