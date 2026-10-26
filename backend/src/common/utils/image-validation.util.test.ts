import { describe, it, expect } from 'vitest';
import { decodeAndValidateImage, sniffImageType, ImageValidationError } from './image-validation.util';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);
const HEIC = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic'), Buffer.alloc(4)]);
const PDF = Buffer.from('%PDF-1.7\n');
const b64 = (buf: Buffer) => buf.toString('base64');

describe('sniffImageType', () => {
  it.each([
    [JPEG, 'image/jpeg'],
    [PNG, 'image/png'],
    [WEBP, 'image/webp'],
    [HEIC, 'image/heic'],
    [PDF, null],
    [Buffer.alloc(0), null],
  ])('detects %#', (bytes, expected) => {
    expect(sniffImageType(bytes)).toBe(expected);
  });
});

describe('decodeAndValidateImage', () => {
  it('returns bytes, detected type and size', () => {
    const result = decodeAndValidateImage(b64(PNG), 'image/png', 1024);
    expect(result.mimeType).toBe('image/png');
    expect(result.size).toBe(PNG.length);
  });

  it('accepts a data URI and common MIME aliases', () => {
    expect(decodeAndValidateImage(`data:image/jpeg;base64,${b64(JPEG)}`, 'image/jpg', 1024).mimeType).toBe('image/jpeg');
    expect(decodeAndValidateImage(b64(HEIC), 'image/heif', 1024).mimeType).toBe('image/heic');
  });

  it('uses the sniffed type when none is declared', () => {
    expect(decodeAndValidateImage(b64(WEBP), undefined, 1024).mimeType).toBe('image/webp');
  });

  it('rejects files that are not allowed images', () => {
    expect(() => decodeAndValidateImage(b64(PDF), 'image/jpeg', 1024)).toThrow(/Unsupported/);
  });

  it('rejects a declared type that contradicts the content', () => {
    expect(() => decodeAndValidateImage(b64(PNG), 'image/jpeg', 1024)).toThrow(/declared as image\/jpeg/);
  });

  it('rejects oversized files (before and after decoding)', () => {
    expect(() => decodeAndValidateImage(b64(Buffer.concat([JPEG, Buffer.alloc(5000)])), undefined, 1000)).toThrow(
      ImageValidationError,
    );
    expect(() => decodeAndValidateImage(b64(PNG), undefined, PNG.length - 1)).toThrow(/larger than/);
  });

  it('rejects empty input', () => {
    expect(() => decodeAndValidateImage('', undefined, 1024)).toThrow(/empty/);
  });
});
