import { buildGlobalCharacterInvariantContract, buildSurfaceMarkFidelityContract } from "../../prompts/identityContracts";
import { buildNanoCastStyleIdentityEnforcementContract, resolveNanoCastStyleIdentityEnforcementConfig, getFallbackNanoCastStyleConfig } from "../../prompts/nanoCastStyleIdentityEnforcement";
import { resolveRenderFamily } from "../../prompts/styleContracts";
import { buildNanoIdentityContract } from "./nanoIdentityAnchor";
import { buildNanoMorphologyBodyAuthorityContract } from "./nanoMorphologyGuides";
import { NANO_STYLE_PROTOCOLS, buildNanoStyleProtocol } from "./nanoStyleProtocols";
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

const NANO_STYLE_KEY_TO_STYLE_ID: Record<NanoActorBlueprint["styleKey"], string> = {
  premiumAnimated3D: "premium_animated_3d",
  premiumCGRealism: "premium_cg",
  retroCelAnime: "retro_anime",
  graphicNovelNoir: "graphic_noir",
  cyberpunkV2: "cyberpunk",
  exactLikenessStudio: "exact_studio"
};

const NEGATIVE_CONSTRAINTS = [
  "different person",
  "new actor",
  "recast identity",
  "face replacement",
  "generic style-template face",
  "identity averaging",
  "morphology guide becoming the person",
  "style sample becoming the person",
  "surface mark drift",
  "invented body marks",
  "random skin dots",
  "face/head/neck marks relocated to arms or body",
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
  const selectedStyleId = NANO_STYLE_KEY_TO_STYLE_ID[blueprint.styleKey];
  const selectedStyleLabel = NANO_STYLE_PROTOCOLS[blueprint.styleKey].label;
  const hasGeneratedCharacterSource =
    typeof blueprint.generatedCharacterSourceIndex === "number" &&
    Number.isFinite(blueprint.generatedCharacterSourceIndex);
  const ageLine = typeof blueprint.identityAnchor.apparentAge === "number" && Number.isFinite(blueprint.identityAnchor.apparentAge)
    ? `- Apparent age target: approximately ${Math.round(blueprint.identityAnchor.apparentAge)}. Preserve the biometric age impression and do not age-shift away from the scanned person.`
    : "- Preserve the apparent age from the biometric scan.";

  const styleConfig = resolveNanoCastStyleIdentityEnforcementConfig(selectedStyleId) ?? getFallbackNanoCastStyleConfig();
  const combinedNegatives = [
    ...NEGATIVE_CONSTRAINTS,
    ...styleConfig.negativeRules
  ];

  return [
    buildNanoIdentityContract({
      ...blueprint.identityAnchor,
      identityLock
    }),
    buildGlobalCharacterInvariantContract({
      hasBiometricIdentity: true,
      hasGeneratedCharacterSource: hasGeneratedCharacterSource,
      selectedStyleId,
      selectedStyleFamily: resolveRenderFamily(selectedStyleId),
      hasExplicitBodyOverride: Boolean(blueprint.bodyOverride?.active),
      hasExplicitProps: Boolean(blueprint.wardrobe.outfitPrompt?.trim() || blueprint.wardrobe.hasLogo)
    }),
    buildSurfaceMarkFidelityContract(),
    `BIOMETRIC SOURCE RULE:
- Use ${source} as the biometric source for the actor.
- Biometric Scan -> Identity Anchor -> Actor Blueprint -> Morphology Modifier -> Style Translator -> Wardrobe / Hair / Logo Surface Layer -> Generation Prompt -> Validation Guard.
- Only the biometric scan defines the person.
- Morphology, style, wardrobe, hair, and branding modify presentation only.`,
    `AGE / GENDER PRESENTATION RULES:
${ageLine}
- ${describeGenderMode(blueprint.identityAnchor.genderMode)}
- Gender mode guides presentation only and must not override biometric identity.`,
    buildNanoMorphologyBodyAuthorityContract(blueprint.morphologyKey, blueprint.bodyOverride),
    buildNanoStyleProtocol(blueprint.styleKey, stylization),
    buildNanoCastStyleIdentityEnforcementContract(selectedStyleId, {
      selectedStyleLabel,
      identityRangeText: source,
      requestedIdentityStrength: identityLock,
      usesBiometricIdentity: true,
      bodyGuidance: hasGeneratedCharacterSource
        ? `[IMAGE ${blueprint.generatedCharacterSourceIndex}] controls body silhouette, outfit, costume, proportions, stance, and visual design. Biometric scans control face/head identity only.`
        : "selected Morphological Matrix controls body silhouette only; Advanced height/weight applies only when explicitly active",
      appliesTo: "Nano Cast primary generated actor render, handoff image, recent thumbnail, and any downstream character-derived output",
      generatedCharacterSourceIndex: blueprint.generatedCharacterSourceIndex
    }),
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
- ${combinedNegatives.join(", ")}.`
  ].join("\n\n");
};
