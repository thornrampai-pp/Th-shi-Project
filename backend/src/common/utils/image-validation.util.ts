/**
 * Slip images are validated from their actual bytes, not the client-declared MIME type:
 * a renamed PDF/HTML file would otherwise sail through as "image/jpeg".
 */
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const;
export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

export const IMAGE_EXTENSION: Record<AllowedImageType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
};

export class ImageValidationError extends Error {}

/** Detects the image type from magic bytes; null when it isn't one of the allowed types. */
export function sniffImageType(bytes: Buffer): AllowedImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  if (bytes.length >= 12 && bytes.toString('ascii', 4, 8) === 'ftyp') {
    const brand = bytes.toString('ascii', 8, 12);
    if (['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1'].includes(brand)) return 'image/heic';
  }
  return null;
}

/** Normalizes the aliases clients commonly send (image/jpg, image/heif). */
function normalizeDeclaredType(mimeType: string): string {
  const lower = mimeType.trim().toLowerCase();
  if (lower === 'image/jpg' || lower === 'image/pjpeg') return 'image/jpeg';
  if (lower === 'image/heif') return 'image/heic';
  return lower;
}

/**
 * Decodes and validates an uploaded image. Rejects: empty/oversized files, types
 * outside the allow-list, and a declared MIME type that contradicts the real bytes.
 */
export function decodeAndValidateImage(
  base64: string,
  declaredMimeType: string | undefined,
  maxBytes: number,
): { bytes: Buffer; mimeType: AllowedImageType; size: number } {
  // Accept both raw base64 and a full data URI.
  const payload = base64.replace(/^data:[^;,]+;base64,/, '');

  // Reject before decoding when the encoded length alone already proves it's too big.
  if (Math.floor((payload.length * 3) / 4) - 2 > maxBytes) {
    throw new ImageValidationError(`Image is larger than ${formatBytes(maxBytes)}`);
  }

  const bytes = Buffer.from(payload, 'base64');
  if (bytes.length === 0) throw new ImageValidationError('Image is empty or not valid base64');
  if (bytes.length > maxBytes) throw new ImageValidationError(`Image is larger than ${formatBytes(maxBytes)}`);

  const detected = sniffImageType(bytes);
  if (!detected) {
    throw new ImageValidationError(`Unsupported file type — allowed: ${ALLOWED_IMAGE_TYPES.join(', ')}`);
  }

  if (declaredMimeType && normalizeDeclaredType(declaredMimeType) !== detected) {
    throw new ImageValidationError(`File content is ${detected} but was declared as ${declaredMimeType}`);
  }

  return { bytes, mimeType: detected, size: bytes.length };
}

function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}
