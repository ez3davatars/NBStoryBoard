// GA image model (the preview `gemini-3.1-flash-image-preview` shuts down 2026-06-25).
export const NANO_BANANA_2_IMAGE_MODEL = 'gemini-3.1-flash-image' as const;

export const LEGACY_IMAGE_GENERATION_MODELS = [
  'gemini-2.5-flash-image',
  'imagen-4.0-generate-001',
  'gemini-3.1-flash-image-preview'
] as const;

export type LegacyImageGenerationModel = typeof LEGACY_IMAGE_GENERATION_MODELS[number];
export type ImageGenerationModel = typeof NANO_BANANA_2_IMAGE_MODEL | LegacyImageGenerationModel;

export const normalizeImageGenerationModel = (_model?: string | null): typeof NANO_BANANA_2_IMAGE_MODEL =>
  NANO_BANANA_2_IMAGE_MODEL;
