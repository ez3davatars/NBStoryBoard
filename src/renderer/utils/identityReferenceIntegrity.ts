/**
 * Identity reference integrity guards.
 *
 * Enforces the identity-pipeline invariant: a missing, empty, or corrupt reference image
 * must fail BEFORE provider invocation (and before any billing/storage upload), rather than
 * silently reaching the model as blank/usable-less pixels. Sending empty reference bytes is the
 * deterministic mechanism behind "a previously accurate scan generates a random character" — the
 * model invents a face when no real identity pixels are present.
 *
 * The base64 of even a 2x2 PNG comfortably exceeds the floor below, while real reference photos
 * are tens of thousands of characters. The floor only rejects empty / blank / truncated payloads,
 * never a legitimate reference.
 */

export const MIN_REFERENCE_IMAGE_BASE64_LENGTH = 64;

/** Strips a data-URI prefix if present, returning just the base64 payload. */
const stripDataUriPrefix = (value: string): string => {
  const marker = 'base64,';
  const idx = value.indexOf(marker);
  return idx >= 0 ? value.slice(idx + marker.length) : value;
};

/** True when `data` looks like real, non-empty base64 image bytes. */
export const isPlausibleReferenceImageData = (data: unknown): data is string => {
  if (typeof data !== 'string') return false;
  const payload = stripDataUriPrefix(data).trim();
  return payload.length >= MIN_REFERENCE_IMAGE_BASE64_LENGTH;
};

export class EmptyReferenceImageError extends Error {
  readonly index: number;
  readonly label: string;

  constructor(index: number, label: string) {
    super(
      `Reference image [${index}] (${label}) resolved to empty or corrupt image data. ` +
        'Aborting before provider invocation to prevent identity hallucination ' +
        '(a blank reference would cause the model to generate a random character).'
    );
    this.name = 'EmptyReferenceImageError';
    this.index = index;
    this.label = label;
  }
}

/**
 * Asserts that `data` is plausible reference image data, throwing {@link EmptyReferenceImageError}
 * otherwise. Returns the validated string for fluent use.
 */
export const assertReferenceImageData = (params: {
  index: number;
  label: string;
  data: unknown;
}): string => {
  if (!isPlausibleReferenceImageData(params.data)) {
    throw new EmptyReferenceImageError(params.index, params.label);
  }
  return params.data;
};
