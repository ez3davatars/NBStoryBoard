import type { NanoIdentityAnchor } from "./nanoTypes";

const clampPercent = (value: number): number => {
  if (!Number.isFinite(value)) return 95;
  return Math.max(0, Math.min(100, Math.round(value)));
};

export const buildNanoIdentityContract = (anchor: NanoIdentityAnchor): string => {
  const identityLock = clampPercent(anchor.identityLock);
  const source = anchor.sourceImageId || "the uploaded biometric scan references";
  const highLockRule = identityLock > 90
    ? "- Identity lock is above 90, so use maximum identity preservation. Style, body, wardrobe, hair, and logo controls are modifiers only."
    : "- Identity lock still requires preserving the scanned subject; do not use lower identity strength as permission to recast.";
  const ageRule = typeof anchor.apparentAge === "number" && Number.isFinite(anchor.apparentAge)
    ? `- Approximate age provided: ${Math.round(anchor.apparentAge)}. Preserve that apparent age when it is consistent with the biometric scan and never age-shift away from the scanned person.`
    : "- Preserve the apparent age impression from the biometric scan.";
  const genderRule = anchor.genderMode
    ? `- Gender mode (${anchor.genderMode}) guides presentation only and must not override biometric identity, face geometry, age impression, or recognizable likeness.`
    : "- Gender presentation must follow the biometric identity and explicit user choices only.";
  const summaryRule = anchor.biometricSummary
    ? `- Biometric summary: ${anchor.biometricSummary}`
    : "- Use all provided biometric views as evidence for the same person, with the front/center view as the primary likeness anchor when available.";

  return `NANO CAST IMMUTABLE IDENTITY CONTRACT:
- The scanned biometric subject is the only identity source.
- Identity source: ${source}.
- Do not invent a new person.
- Do not recast the actor.
- Do not average the subject with the morphology guide, style protocol, outfit prompt, logo, or reference art.
- Preserve facial structure, skull shape, age impression, facial proportions, eye spacing, nose structure, mouth shape, jaw/chin structure, and recognizable likeness.
- Preserve visible hairstyle, baldness pattern, facial hair or clean-shaven state, skin tone value, ethnicity cues, marks, and asymmetries when present in the scan.
${highLockRule}
${ageRule}
${genderRule}
${summaryRule}`;
};
