// Sanitizer to enforce identity precedence over loose style abstraction.

export function stripIdentityOverridingAnalysis(text: string | undefined): string {
  if (!text) return '';
  
  // This removes verbose facial/body characterizations that would otherwise conflict with explicit image anchors.
  // We aggressively strip out adjectives describing the person, face, identity, archetype to prevent style drift.
  
  let sanitized = text;
  
  // Example pass: strip explicit role-based or generalized facial summaries
  const removals = [
    /handsome|beautiful|ugly|striking|prominent jaw|sharp cheekbones/gi,
    /young|old|middle-aged|elderly|teenage/gi,
    /archetype|typical|classic|generic/gi,
    /face like a|looks like|resembles|similar to/gi
  ];
  
  removals.forEach(regex => {
    sanitized = sanitized.replace(regex, '');
  });
  
  // Condense spaces
  return sanitized.replace(/\s{2,}/g, ' ').trim();
}

type SanitizableStyle = {
  mood?: string;
  subject?: unknown;
  [key: string]: unknown;
};

/**
 * Helper to safely demote extracted styles if strict actors are present.
 */
export function sanitizeStyleForStrictIdentity<T extends SanitizableStyle | null | undefined>(styleObj: T): T {
  if (!styleObj) return styleObj;
  
  // We preserve the environment/cinematic styling, but we scrub the summary/mood if it describes the human.
  return {
    ...styleObj,
    mood: stripIdentityOverridingAnalysis(styleObj.mood),
    // We explicitly clear any 'subject' field if the backend passed one
    subject: undefined 
  } as T;
}
