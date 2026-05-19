import { buildGlobalCharacterInvariantContract } from "../../prompts/identityContracts";
import { resolveRenderFamily } from "../../prompts/styleContracts";
import { buildNanoIdentityContract } from "./nanoIdentityAnchor";
import { NANO_MORPHOLOGY_GUIDES, buildNanoMorphologyContract } from "./nanoMorphologyGuides";
import { buildNanoStyleProtocol } from "./nanoStyleProtocols";
import type { NanoActorBlueprint, NanoBodyScope, NanoGenderMode } from "./nanoTypes";

const clampPercent = (value: number): number => {
  if (!Number.isFinite(value)) return 95;
  return Math.max(0, Math.min(100, Math.round(value)));
};

const describeGenderMode = (mode?: NanoGenderMode): string => {
  switch (mode) {
    case "masculine":
      return "Masculine presentation mode. This guides wardrobe/body presentation only and must not override biometric identity.";
    case "feminine":
      return "Feminine presentation mode. This guides wardrobe/body presentation only and must not override biometric identity.";
    case "youthBoy":
      return "Youth boy presentation mode. Use only when the biometric subject is a youth or the user explicitly requested youth mode.";
    case "youthGirl":
      return "Youth girl presentation mode. Use only when the biometric subject is a youth or the user explicitly requested youth mode.";
    default:
      return "No gender presentation override. Preserve the biometric subject's apparent presentation.";
  }
};

const buildBodyScopeSection = (scope: NanoBodyScope): string => {
  switch (scope) {
    case "head":
      return `BODY SCOPE:
- head = head/face portrait only.
- Generate a head and face portrait only.
- Do not request body generation, torso, legs, full-body stance, or reference-sheet views.`;
    case "torso":
      return `BODY SCOPE:
- torso = upper body / torso visible.
- Generate upper body / torso visible from head through shoulders and torso only.
- Torso scope does not request full body, legs, feet, or full-body stance.`;
    case "full":
      return `BODY SCOPE:
- full = full body visible, coherent stance.
- Generate a coherent full body stance with head, torso, arms, legs, hands, and feet physically aligned.
- Full body scope requires coherent full body stance.`;
  }
};

const formatHeight = (inches: number): string => {
  const safeInches = Number.isFinite(inches) ? Math.max(0, Math.round(inches)) : 70;
  const feet = Math.floor(safeInches / 12);
  const remainingInches = safeInches % 12;
  return `${feet}'${remainingInches}"`;
};

const buildBodyMorphologySection = (blueprint: NanoActorBlueprint): string => {
  const guide = NANO_MORPHOLOGY_GUIDES[blueprint.morphologyKey];
  const bodyOverrideActive = Boolean(blueprint.bodyOverride?.active);
  const heightLine = typeof blueprint.bodyOverride?.heightIn === "number" && Number.isFinite(blueprint.bodyOverride.heightIn)
    ? `- Target Height: ${formatHeight(blueprint.bodyOverride.heightIn)}`
    : "- Target Height: user-edited value unavailable";
  const weightLine = typeof blueprint.bodyOverride?.weightLbs === "number" && Number.isFinite(blueprint.bodyOverride.weightLbs)
    ? `- Target Mass: ${Math.round(blueprint.bodyOverride.weightLbs / 5) * 5} lbs`
    : "- Target Mass: user-edited value unavailable";
  const advancedOverrideBlock = bodyOverrideActive
    ? `ADVANCED BODY OVERRIDE ACTIVE:
${heightLine}
${weightLine}
- Apply these user-edited body values to the full-body silhouette only.
- Do not change face, skull, scalp/bald shape, facial hair, expression, skin tone, age impression, or identity.`
    : `ADVANCED BODY OVERRIDE INACTIVE:
- Ignore default height/weight slider values for body generation.
- Use the selected Morphological Matrix archetype as the body silhouette authority.`;

  return `BODY MORPHOLOGY:
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
- Titan means muscular and broad, not fat.
- Guardian means sturdy and solid; it must not become obese unless explicit user body text asks for it.`;
};

const buildWardrobeSection = (outfitPrompt?: string): string => {
  const outfit = outfitPrompt?.trim();
  return `WARDROBE LAYER:
- ${outfit ? `Outfit prompt: ${outfit}.` : "No explicit outfit prompt. Preserve neutral clothing or selected generated costume intent."}
- outfitPrompt changes clothing only.
- Wardrobe must not change face, head shape, body identity, age impression, expression, biometric likeness, hairstyle, or facial hair.`;
};

const buildHairSection = (hairPrompt?: string): string => {
  const hair = hairPrompt?.trim();
  return `HAIR LAYER:
- ${hair ? `Hair prompt: ${hair}.` : "Empty hair prompt: preserve source hairstyle."}
- hairPrompt changes hair only.
- Never invent facial hair unless explicitly requested.
- Preserve facial hair or clean-shaven state from the biometric scan unless the user explicitly requests a facial-hair change.`;
};

const buildLogoSection = (hasLogo?: boolean, logoPlacement?: string): string => {
  if (!hasLogo) {
    return `BRANDING / LOGO LAYER:
- No logo asset supplied.
- Do not invent logos, badges, patches, symbols, labels, or brand marks.`;
  }

  return `BRANDING / LOGO LAYER:
- Logo asset supplied.
- Logo placement: ${logoPlacement?.trim() || "use natural clothing placement"}.
- Logo placement affects clothing surface only.
- Logo must not change costume structure, body, identity, face, head shape, age impression, or likeness.`;
};

const NEGATIVE_CONSTRAINTS = [
  "different person",
  "new actor",
  "recast identity",
  "face replacement",
  "identity averaging",
  "morphology guide becoming the person",
  "style sample becoming the person",
  "photorealism in animated mode",
  "cartooning in realism mode",
  "mixed style",
  "wrong age",
  "wrong ethnicity cues",
  "invented facial hair",
  "hairstyle change unless requested",
  "torso facing one way while legs face another",
  "duplicate body",
  "extra head",
  "body mass inferred from face/head/neck scans",
  "overweight body inferred from neck thickness, full cheeks, broad jaw, facial hair, or close crop",
  "reference sheet layout",
  "collage",
  "mannequin body replacing the scanned person"
];

export const buildNanoCastPrompt = (blueprint: NanoActorBlueprint): string => {
  const identityLock = clampPercent(blueprint.identityAnchor.identityLock);
  const stylization = clampPercent(blueprint.stylization);
  const source = blueprint.identityAnchor.sourceImageId || "the uploaded biometric scan references";
  const ageLine = typeof blueprint.identityAnchor.apparentAge === "number" && Number.isFinite(blueprint.identityAnchor.apparentAge)
    ? `- Apparent age target: approximately ${Math.round(blueprint.identityAnchor.apparentAge)}. Preserve the biometric age impression and do not age-shift away from the scanned person.`
    : "- Preserve the apparent age from the biometric scan.";

  return [
    buildNanoIdentityContract({
      ...blueprint.identityAnchor,
      identityLock
    }),
    buildGlobalCharacterInvariantContract({
      hasBiometricIdentity: true,
      hasGeneratedCharacterSource: false,
      selectedStyleId: blueprint.styleKey,
      selectedStyleFamily: resolveRenderFamily(blueprint.styleKey),
      hasExplicitBodyOverride: Boolean(blueprint.bodyOverride?.active),
      hasExplicitProps: Boolean(blueprint.wardrobe.outfitPrompt?.trim() || blueprint.wardrobe.hasLogo)
    }),
    `BIOMETRIC SOURCE RULE:
- Use ${source} as the biometric source for the actor.
- Biometric Scan -> Identity Anchor -> Actor Blueprint -> Morphology Modifier -> Style Translator -> Wardrobe / Hair / Logo Surface Layer -> Generation Prompt -> Validation Guard.
- Only the biometric scan defines the person.
- Morphology, style, wardrobe, hair, and branding modify presentation only.`,
    `AGE / GENDER PRESENTATION RULES:
${ageLine}
- ${describeGenderMode(blueprint.identityAnchor.genderMode)}
- Gender mode guides presentation only and must not override biometric identity.`,
    buildNanoMorphologyContract(blueprint.morphologyKey),
    buildBodyMorphologySection(blueprint),
    buildNanoStyleProtocol(blueprint.styleKey, stylization),
    buildBodyScopeSection(blueprint.bodyScope),
    buildWardrobeSection(blueprint.wardrobe.outfitPrompt),
    buildHairSection(blueprint.wardrobe.hairPrompt),
    buildLogoSection(blueprint.wardrobe.hasLogo, blueprint.wardrobe.logoPlacement),
    `ANATOMY INTEGRITY:
- Single coherent character.
- No duplicate bodies.
- No extra heads.
- No twisted torso.
- Torso and legs must face the same direction.
- Hands, limbs, neck, and shoulders must be physically plausible.
- No reference sheet or collage unless explicitly requested.`,
    `REPEATABILITY REQUIREMENT:
- This render must depict the same scanned person as other Nano Cast renders in this session.
- Do not reinterpret, recast, beautify, age-shift, weight-shift, or replace the actor.`,
    `NEGATIVE CONSTRAINTS:
- ${NEGATIVE_CONSTRAINTS.join(", ")}.`
  ].join("\n\n");
};
