import type { NanoActorBlueprint } from "./nanoTypes";

const isYouthMode = (mode: NanoActorBlueprint["identityAnchor"]["genderMode"]): boolean =>
  mode === "youthBoy" || mode === "youthGirl";

export const validateNanoBlueprint = (blueprint: NanoActorBlueprint): string[] => {
  const messages: string[] = [];
  const { identityAnchor, morphologyKey, styleKey, stylization, wardrobe } = blueprint;

  if (!morphologyKey) {
    messages.push("ERROR: morphologyKey is required.");
  }

  if (!styleKey) {
    messages.push("ERROR: styleKey is required.");
  }

  if (!Number.isFinite(identityAnchor.identityLock)) {
    messages.push("ERROR: identityLock must be a finite number.");
  } else if (identityAnchor.identityLock < 0 || identityAnchor.identityLock > 100) {
    messages.push("WARNING: identityLock must be clamped 0-100.");
  }

  if (!Number.isFinite(stylization)) {
    messages.push("ERROR: stylization must be a finite number.");
  } else if (stylization < 0 || stylization > 100) {
    messages.push("WARNING: stylization must be clamped 0-100.");
  }

  if (typeof identityAnchor.apparentAge === "number" && Number.isFinite(identityAnchor.apparentAge)) {
    if (identityAnchor.apparentAge < 18 && !isYouthMode(identityAnchor.genderMode)) {
      messages.push("ERROR: apparentAge under 18 requires youthBoy or youthGirl genderMode.");
    }

    if (morphologyKey === "sprite" && identityAnchor.apparentAge >= 18 && !isYouthMode(identityAnchor.genderMode)) {
      messages.push("ERROR: sprite cannot be used with adult apparent age unless genderMode is youthBoy or youthGirl.");
    }
  }

  if (wardrobe.logoPlacement?.trim() && !wardrobe.hasLogo) {
    messages.push("WARNING: logoPlacement was provided without hasLogo.");
  }

  return messages;
};
