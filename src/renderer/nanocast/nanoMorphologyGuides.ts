import type { NanoMorphologyKey } from "./nanoTypes";

export type NanoMorphologyGuide = {
  key: NanoMorphologyKey;
  label: string;
  guidance: string;
};

const SHARED_MORPHOLOGY_RULE =
  "Morphology controls BODY SILHOUETTE ONLY. It must not change facial identity, head shape, scalp/bald shape, facial hair, expression, age impression, skin tone, or recognizable likeness from the biometric scan.";

export const NANO_MORPHOLOGY_GUIDES: Record<NanoMorphologyKey, NanoMorphologyGuide> = {
  titan: {
    key: "titan",
    label: "Titan",
    guidance: [
      "STRICT BODY ARCHETYPE: broad-shouldered, powerful, muscular adult frame.",
      "Use a strong V-taper, wider shoulders, thicker arms, athletic chest, and stable heroic stance.",
      "Titan means muscular/broad, not fat.",
      "Do not create an unrelated bodybuilder or change the biometric face.",
      SHARED_MORPHOLOGY_RULE
    ].join(" ")
  },
  scout: {
    key: "scout",
    label: "Scout",
    guidance: [
      "STRICT BODY ARCHETYPE: lean athletic adult frame.",
      "Use a balanced athletic silhouette, moderate shoulders, trim torso, functional build, and agile stance.",
      "Do not make the subject overweight, heavy-set, bulky, stocky, obese, or large-bellied.",
      "Do not infer body fat from neck thickness, full cheeks, broad jaw, facial hair, or close camera crop.",
      SHARED_MORPHOLOGY_RULE
    ].join(" ")
  },
  guardian: {
    key: "guardian",
    label: "Guardian",
    guidance: [
      "STRICT BODY ARCHETYPE: sturdy solid adult frame.",
      "Use a grounded, strong, rectangular silhouette with heavier presence than Scout, but not obese unless explicitly requested in Advanced or Pitch Sheet Brief.",
      "Do not create a large belly or overweight body unless the user explicitly requests overweight/heavy-set/obese/large belly.",
      SHARED_MORPHOLOGY_RULE
    ].join(" ")
  },
  sprite: {
    key: "sprite",
    label: "Sprite",
    guidance: [
      "STRICT BODY ARCHETYPE: small-frame stylized youth-proportion guide.",
      "Use only when Youth mode is selected.",
      "Never apply chibi, childlike, or oversized-head proportions to adult scans.",
      SHARED_MORPHOLOGY_RULE
    ].join(" ")
  }
};

export const buildNanoMorphologyContract = (key: NanoMorphologyKey): string => {
  const guide = NANO_MORPHOLOGY_GUIDES[key];
  return `MORPHOLOGY MATRIX CONTRACT:
- Selected morphology: ${guide.label}.
- This selected morphology is the active body-silhouette authority for Nano Cast.
- ${guide.guidance}
- Biometric scan controls identity. Morphology controls body silhouette. Do not mix those responsibilities.

MORPHOLOGY BODY AUTHORITY MODEL:
1. Biometric scan = face/head/identity authority.
2. Morphological Matrix = strict body archetype authority for Nano Cast body silhouette.
3. Advanced controls = explicit user body override only when active.
4. Pitch Sheet Brief = explicit board/body metadata override only in pitch-sheet workflow.
- Do not infer overweight from neck/face.
- Weight slider values apply only if Advanced override is active.
- Default height/weight slider values must not affect generation.
- Pitch Sheet build/weight must not override generated character source unless explicitly in Pitch Sheet Brief.`;
};
