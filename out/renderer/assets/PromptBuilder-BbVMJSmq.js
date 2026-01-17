import { b as buildContinuityLockBlock } from "./index-81N86aGn.js";
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
function buildNegatives(spec) {
  let negatives = [...BASE_NEGATIVES];
  const style = (spec.style?.visualStyle || "").toLowerCase();
  if (style.includes("realistic") || style.includes("cinematic")) {
    negatives = [...negatives, ...STYLE_NEGATIVES];
  }
  const uniqueNegatives = Array.from(new Set(negatives));
  uniqueNegatives.sort((a, b) => a.localeCompare(b));
  return uniqueNegatives;
}
const safeJoin = (val) => {
  if (Array.isArray(val)) return val.filter(Boolean).join(", ");
  if (typeof val === "string") return val;
  return "";
};
function buildVeo31Prompt(spec, opts = {}) {
  const character = spec.character ?? {};
  const style = spec.style ?? {};
  const environment = spec.environment ?? {};
  const motion = spec.motion ?? {};
  const identityLocks = Array.isArray(character.lockedTraits) ? character.lockedTraits : [];
  const continuityOn = opts.continuityLock !== false;
  const continuityBlock = continuityOn ? buildContinuityLockBlock({
    identityLocks,
    lockEnvironment: opts.lockEnvironment ?? true,
    lockLighting: opts.lockLighting ?? true,
    lockLens: opts.lockLens ?? true,
    lockStyle: opts.lockStyle ?? true,
    noExtraObjects: opts.noExtraObjects ?? true,
    noMorph: opts.noMorph ?? true
  }) : "";
  const charBlock = [
    "CHARACTER BIBLE:",
    `- Identity: ${safeJoin(character.identity) || "Match the reference character exactly."}`,
    `- Wardrobe: ${safeJoin(character.wardrobe) || "Maintain wardrobe continuity."}`,
    character.emotionalState ? `- Emotional State: ${safeJoin(character.emotionalState)}` : "",
    identityLocks.length ? `- Locked Traits: ${safeJoin(identityLocks)}` : ""
  ].filter(Boolean).join("\n");
  const styleBlock = [
    "STYLE BIBLE:",
    style.visualStyle ? `- Visual Style: ${safeJoin(style.visualStyle)}` : "- Visual Style: Cinematic, high fidelity.",
    style.lighting ? `- Lighting: ${safeJoin(style.lighting)}` : "",
    style.colorPalette ? `- Color Palette: ${safeJoin(style.colorPalette)}` : "",
    style.lensLanguage ? `- Lens Language: ${safeJoin(style.lensLanguage)}` : ""
  ].filter(Boolean).join("\n");
  const envBlock = [
    "ENVIRONMENT BIBLE:",
    environment.setting ? `- Setting: ${safeJoin(environment.setting)}` : "- Setting: Match the reference environment.",
    environment.weatherTime ? `- Weather/Time: ${safeJoin(environment.weatherTime)}` : "",
    environment.props ? `- Key Props: ${safeJoin(environment.props)}` : "",
    environment.lockedElements ? `- Locked Elements: ${safeJoin(environment.lockedElements)}` : ""
  ].filter(Boolean).join("\n");
  const motionBlock = [
    "MOTION DELTA:",
    motion.cameraMovement ? `- Camera: ${safeJoin(motion.cameraMovement)}` : "- Camera: Smooth, realistic.",
    motion.characterAction ? `- Character Action: ${safeJoin(motion.characterAction)}` : ""
  ].filter(Boolean).join("\n");
  const frame1Block = spec.frame1Description ? `FRAME 1 DESCRIPTION:
${safeJoin(spec.frame1Description)}` : "";
  const frame2Block = spec.frame2Description ? `FRAME 2 DESCRIPTION:
${safeJoin(spec.frame2Description)}` : "";
  const fullPromptParts = [
    "VEO 3.1 DIRECTOR SPEC (STRICT):",
    continuityBlock,
    charBlock,
    envBlock,
    styleBlock,
    motionBlock,
    frame1Block,
    frame2Block,
    "OUTPUT: Generate a coherent video that matches the bibles above. Obey continuity locks."
  ].filter(Boolean);
  const fullPrompt = fullPromptParts.join("\n\n");
  const negatives = buildNegatives(spec).join(", ");
  return {
    prompt: fullPrompt,
    negatives,
    debug: { spec, opts, continuityOn }
  };
}
export {
  buildVeo31Prompt
};
