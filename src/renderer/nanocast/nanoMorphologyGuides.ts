import type { NanoMorphologyKey } from "./nanoTypes";

export type NanoMorphologyGuide = {
  key: NanoMorphologyKey;
  label: string;
  guidance: string;
};

export type NanoMorphologyBodyOverride = {
  active: boolean;
  heightIn?: number;
  weightLbs?: number;
};

const SHARED_MORPHOLOGY_RULE =
  "Morphology controls BODY SILHOUETTE ONLY. This morphology guide applies strictly to the body silhouette, muscle definition, and body proportions below the neck. It must never alter facial identity, skull shape, scalp/bald shape, hairline, eye spacing, nose, mouth, jawline, ears, chin, or neck thickness. Those traits are locked by the biometric identity. It must not change facial identity, head shape, scalp/bald shape, facial hair, expression, age impression, skin tone, or recognizable likeness from the biometric scan.";

const formatHeight = (inches: number): string => {
  const safeInches = Number.isFinite(inches) ? Math.max(0, Math.round(inches)) : 70;
  const feet = Math.floor(safeInches / 12);
  const remainingInches = safeInches % 12;
  return `${feet}'${remainingInches}"`;
};

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
- Face/neck scans are not body-mass evidence.

MORPHOLOGY BODY AUTHORITY MODEL:
1. Biometric scan = face/head/identity authority.
2. Morphological Matrix = strict body archetype authority for Nano Cast body silhouette.
3. Advanced controls = explicit user body override only when active.
4. Pitch Sheet Brief = explicit board/body metadata override only in pitch-sheet workflow.
- Do not infer body mass from face/head/neck scans.
- Weight slider values apply only if Advanced override is active.
- Default height/weight slider values must not affect generation.
- Pitch Sheet Brief build/weight only applies to pitch-sheet body metadata unless explicitly used as body override.
- Pitch Sheet build/weight must not override generated character source unless explicitly in Pitch Sheet Brief.`;
};

export const buildNanoMorphologyBodyAuthorityContract = (
  key: NanoMorphologyKey,
  bodyOverride?: NanoMorphologyBodyOverride
): string => {
  const guide = NANO_MORPHOLOGY_GUIDES[key];
  const bodyOverrideActive = Boolean(bodyOverride?.active);
  const advancedOverrideBlock = bodyOverrideActive
    ? [
      "ADVANCED BODY OVERRIDE ACTIVE:",
      typeof bodyOverride?.heightIn === "number" && Number.isFinite(bodyOverride.heightIn)
        ? `- Target Height: ${formatHeight(bodyOverride.heightIn)}`
        : "- Target Height: user-edited value unavailable",
      typeof bodyOverride?.weightLbs === "number" && Number.isFinite(bodyOverride.weightLbs)
        ? `- Target Mass: ${Math.round(bodyOverride.weightLbs / 5) * 5} lbs`
        : "- Target Mass: user-edited value unavailable",
      "- Apply these user-edited body values to the full-body silhouette only.",
      "- Do not change face, skull, scalp/bald shape, facial hair, expression, skin tone, age impression, or identity."
    ].join("\n")
    : [
      "ADVANCED BODY OVERRIDE INACTIVE:",
      "- Ignore default height/weight slider values for body generation.",
      "- Do not include default Target Height or default Target Mass.",
      "- Use the selected Morphological Matrix archetype as the body silhouette authority."
    ].join("\n");

  return `${buildNanoMorphologyContract(key)}

BODY MORPHOLOGY:
- Selected Morphological Matrix: ${guide.label}.
- The selected Morphological Matrix body archetype is strict for this Nano Cast generation.
- Apply ${guide.label} to the generated full-body silhouette.
- Do not infer a different body type from the face/head/neck biometric images.
- Biometric images preserve face/head identity only.
- If Advanced body override is inactive, do not use default height/weight slider values.
- If Advanced body override is active, combine the selected morphology with the edited height/weight while preserving identity.

${advancedOverrideBlock}

FACE/NECK BODY-INFERENCE BAN:
- Do not infer overweight, stocky, obese, bulky, large-bellied, skinny, younger, older, or bodybuilder body type from face/head/neck scans.
- Large neck, full cheeks, broad jaw, rounded chin, mature face weight, facial hair, and close camera crop are facial identity features only, not body-mass evidence.

OVERWEIGHT OUTPUT RULE:
- Overweight/heavy-set/obese/large-belly output is allowed only if Guardian is selected and Advanced override or user text explicitly asks for heavy/overweight.
- Overweight/heavy-set/obese/large-belly output is allowed only if the user explicitly enters overweight/heavy-set/obese/large belly/stocky/bulky in an advanced/custom body field.
- Pitch Sheet Brief build fields may request those traits only in the pitch sheet workflow; do not import those body traits into the base Nano Cast actor unless explicitly passed.
- Scout must never produce overweight, heavy-set, bulky, or large-belly bodies.
- Titan means muscular/broad, not fat.
- Guardian means sturdy/solid; it must not become obese unless explicit user body text asks for it.`;
};
