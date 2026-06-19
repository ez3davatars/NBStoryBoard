import { describe, expect, it } from 'vitest';
import {
  MIN_REFERENCE_IMAGE_BASE64_LENGTH,
  EmptyReferenceImageError,
  assertReferenceImageData,
  isPlausibleReferenceImageData
} from '../identityReferenceIntegrity';

// A 1x1 transparent PNG — the smallest "real" image. Its base64 still exceeds the floor.
const TINY_REAL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

describe('identity reference integrity guard', () => {
  it('rejects empty, whitespace, and missing reference data', () => {
    expect(isPlausibleReferenceImageData('')).toBe(false);
    expect(isPlausibleReferenceImageData('   ')).toBe(false);
    expect(isPlausibleReferenceImageData(undefined)).toBe(false);
    expect(isPlausibleReferenceImageData(null)).toBe(false);
    expect(isPlausibleReferenceImageData(12345)).toBe(false);
  });

  it('rejects an empty base64 data URI (the 0-byte blob path)', () => {
    expect(isPlausibleReferenceImageData('data:image/png;base64,')).toBe(false);
  });

  it('rejects implausibly short payloads below the floor', () => {
    expect(isPlausibleReferenceImageData('a'.repeat(MIN_REFERENCE_IMAGE_BASE64_LENGTH - 1))).toBe(false);
  });

  it('accepts a real (tiny) PNG, with and without a data-URI prefix', () => {
    expect(isPlausibleReferenceImageData(TINY_REAL_PNG_BASE64)).toBe(true);
    expect(isPlausibleReferenceImageData(`data:image/png;base64,${TINY_REAL_PNG_BASE64}`)).toBe(true);
  });

  it('assertReferenceImageData throws EmptyReferenceImageError before provider invocation on empty data', () => {
    expect(() => assertReferenceImageData({ index: 2, label: 'ACTOR_ID_1', data: '' }))
      .toThrowError(EmptyReferenceImageError);

    try {
      assertReferenceImageData({ index: 2, label: 'ACTOR_ID_1', data: '' });
    } catch (error) {
      expect(error).toBeInstanceOf(EmptyReferenceImageError);
      const typed = error as EmptyReferenceImageError;
      expect(typed.index).toBe(2);
      expect(typed.label).toBe('ACTOR_ID_1');
      expect(typed.message).toContain('random character');
    }
  });

  it('assertReferenceImageData returns the validated data for plausible references', () => {
    expect(assertReferenceImageData({ index: 1, label: 'REFERENCE_1', data: TINY_REAL_PNG_BASE64 }))
      .toBe(TINY_REAL_PNG_BASE64);
  });
});
