import type { Veo31Spec } from './types';

const BASE_NEGATIVES = [
  "morphing",
  "blur",
  "distortion",
  "disfigured",
  "low resolution",
  "text",
  "watermark",
  "bad anatomy",
  "extra limbs",
  "missing limbs",
  "floating objects",
  "mutated hands"
];

const STYLE_NEGATIVES = [
  "cartoon",
  "illustration",
  "painting",
  "sketch",
  "2d",
  "flat",
  "dull colors",
  "overexposed"
];

export function buildNegatives(spec: Veo31Spec): string[] {
  let negatives = [...BASE_NEGATIVES];

  // If the desired style is photorealistic, add cartoonish negatives
  const style = (spec.style?.visualStyle || "").toLowerCase();
  
  if (style.includes('realistic') || 
      style.includes('cinematic')) {
    negatives = [...negatives, ...STYLE_NEGATIVES];
  }

  // Deduplication
  const uniqueNegatives = Array.from(new Set(negatives));

  // Sorting for deterministic output (alphabetical + length)
  uniqueNegatives.sort((a, b) => a.localeCompare(b));

  // Cap length if needed (though strings are cheap, we keep it manageable)
  // Veo doesn't have a strict strict limit documented, but ~20-30 tags is safe.
  
  return uniqueNegatives;
}
