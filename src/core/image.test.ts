import { describe, expect, it } from 'vitest';
import { computeTargetSize, validateImageFile } from './image';

describe('validateImageFile', () => {
  it('accepts the supported image types', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/webp', 'image/gif']) {
      expect(validateImageFile({ type, size: 1000 })).toEqual({ ok: true });
    }
  });

  it('rejects unsupported types with a clear message', () => {
    const result = validateImageFile({ type: 'image/bmp', size: 1000 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('unsupported-type');
      expect(result.message).toContain('image/bmp');
      expect(result.message).toContain('PNG');
    }
  });

  it('rejects files without a MIME type', () => {
    const result = validateImageFile({ type: '', size: 1000 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('unsupported-type');
  });

  it('accepts a file at exactly the 20 MB limit', () => {
    expect(validateImageFile({ type: 'image/png', size: 20 * 1024 * 1024 })).toEqual({ ok: true });
  });

  it('rejects files larger than 20 MB', () => {
    const result = validateImageFile({ type: 'image/png', size: 20 * 1024 * 1024 + 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('too-large');
      expect(result.message).toContain('20 MB');
    }
  });
});

describe('computeTargetSize', () => {
  it('scales landscape images down to the max dimension', () => {
    expect(computeTargetSize(1024, 768, 256)).toEqual({ width: 256, height: 192 });
  });

  it('scales portrait images down preserving aspect ratio', () => {
    expect(computeTargetSize(256, 512, 256)).toEqual({ width: 128, height: 256 });
    expect(computeTargetSize(300, 100, 256)).toEqual({ width: 256, height: 85 });
  });

  it('leaves images already within the limit unchanged', () => {
    expect(computeTargetSize(200, 100, 256)).toEqual({ width: 200, height: 100 });
    expect(computeTargetSize(256, 256, 256)).toEqual({ width: 256, height: 256 });
  });

  it('never upscales', () => {
    expect(computeTargetSize(50, 25, 256)).toEqual({ width: 50, height: 25 });
  });

  it('handles degenerate dimensions', () => {
    expect(computeTargetSize(0, 100, 256)).toEqual({ width: 0, height: 0 });
    expect(computeTargetSize(100, 0, 256)).toEqual({ width: 0, height: 0 });
    expect(computeTargetSize(100, 100, 0)).toEqual({ width: 0, height: 0 });
  });
});
