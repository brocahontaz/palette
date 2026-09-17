// Image intake: pure validation helpers (unit-tested) plus a thin, untested
// decode adapter around browser canvas APIs.
//
// The decode path (decodeImageFile) touches createImageBitmap, canvas and
// object URLs, which do not exist in plain Node — it stays intentionally thin
// and is exercised manually in the browser rather than by unit tests.

export const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;

/** Hard cap for uploaded files: 20 MB. */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

/** Largest dimension of the canvas used for palette extraction. */
export const EXTRACT_MAX_DIM = 256;

export interface Size {
  width: number;
  height: number;
}

export type FileValidation =
  { ok: true } | { ok: false; reason: 'unsupported-type' | 'too-large'; message: string };

/** Pure validation of a file's MIME type and size. Returns a clear error message on failure. */
export function validateImageFile(file: { type: string; size: number }): FileValidation {
  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
    return {
      ok: false,
      reason: 'unsupported-type',
      message: `Unsupported file type${file.type ? ` “${file.type}”` : ''}. Use PNG, JPEG, WebP or GIF.`,
    };
  }
  if (file.size > MAX_FILE_BYTES) {
    return {
      ok: false,
      reason: 'too-large',
      message: 'File is too large. The maximum size is 20 MB.',
    };
  }
  return { ok: true };
}

/**
 * Proportionally scales a size down so neither dimension exceeds `maxDim`.
 * Sizes already within the limit are returned unchanged; invalid dimensions
 * produce { width: 0, height: 0 }.
 */
export function computeTargetSize(width: number, height: number, maxDim: number): Size {
  if (width <= 0 || height <= 0 || maxDim <= 0) return { width: 0, height: 0 };
  if (width <= maxDim && height <= maxDim) return { width, height };
  const scale = maxDim / Math.max(width, height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export type ImageDecodeError = 'unsupported-type' | 'too-large' | 'corrupt' | 'canvas-unavailable';

export interface DecodedImage {
  /** RGBA pixel data of the extraction canvas (≤ 256px max dimension) */
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  /** Dimensions of the original bitmap, for display purposes */
  sourceWidth: number;
  sourceHeight: number;
  /** Object URL of the original file, for the thumbnail preview */
  objectUrl: string;
}

export type DecodeResult =
  { ok: true; image: DecodedImage } | { ok: false; error: ImageDecodeError; message: string };

/**
 * Validates and decodes an image file, drawing it onto an offscreen canvas
 * capped at 256px max dimension and returning its pixels. Never throws:
 * failures come back as a typed error with a user-facing message.
 */
export async function decodeImageFile(file: File): Promise<DecodeResult> {
  const validation = validateImageFile(file);
  if (!validation.ok) {
    return { ok: false, error: validation.reason, message: validation.message };
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return {
      ok: false,
      error: 'corrupt',
      message: 'The image could not be decoded. The file may be corrupt.',
    };
  }

  const sourceWidth = bitmap.width;
  const sourceHeight = bitmap.height;
  const { width, height } = computeTargetSize(sourceWidth, sourceHeight, EXTRACT_MAX_DIM);
  if (width === 0 || height === 0) {
    bitmap.close();
    return { ok: false, error: 'corrupt', message: 'The image has no decodable dimensions.' };
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    bitmap.close();
    return {
      ok: false,
      error: 'canvas-unavailable',
      message: 'Canvas is unavailable in this browser.',
    };
  }

  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const pixels = ctx.getImageData(0, 0, width, height).data;

  return {
    ok: true,
    image: {
      pixels,
      width,
      height,
      sourceWidth,
      sourceHeight,
      objectUrl: URL.createObjectURL(file),
    },
  };
}
