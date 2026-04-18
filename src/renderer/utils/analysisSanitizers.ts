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

const SHOT_DIRECTIVE_REGEX = /\b(extreme close[- ]?up|close[- ]?up|medium close(?:[- ]?up)?|medium shot|wide shot|long shot|establishing shot|two[- ]?shot|over[- ]the[- ]shoulder|ots|profile shot|three[- ]quarter|3\/4 shot|camera angle|camera move|camera orbit|lens choice|focal length|shot size|framing|crop)\b/i;
const SHOT_DIRECTIVE_PHRASE_REGEX = /\b(extreme close[- ]?up|close[- ]?up|medium close(?:[- ]?up)?|medium shot|wide shot|long shot|establishing shot|two[- ]?shot|over[- ]the[- ]shoulder|ots|profile shot|three[- ]quarter|3\/4 shot|shot size|framing|camera angle|camera move|camera orbit|lens choice|focal length)\b/gi;

export function stripShotDirectiveContamination(text: string | undefined): string {
  if (!text) return '';

  const parts = text
    .split(/\r?\n+/)
    .flatMap(line => line.split(/[.;!?]+/))
    .map(part => part.trim())
    .filter(Boolean);

  const cleaned = parts
    .map(part => {
      let candidate = part;
      const hadDirective = SHOT_DIRECTIVE_REGEX.test(candidate);

      candidate = candidate
        .replace(SHOT_DIRECTIVE_PHRASE_REGEX, ' ')
        .replace(/\b(in|as|for|with)\s+(a|an)\s*$/gi, ' ')
        .replace(/\s{2,}/g, ' ')
        .replace(/^[,\-\s]+|[,\-\s]+$/g, '')
        .trim();

      if (!candidate) return '';
      if (hadDirective && candidate.split(/\s+/).length <= 2) return '';
      return candidate;
    })
    .filter(Boolean);

  return cleaned.join('. ').trim();
}

/**
 * Helper to safely demote extracted styles if strict actors are present.
 */
export function sanitizeStyleForStrictIdentity(styleObj: any): any {
  if (!styleObj) return styleObj;
  
  // We preserve the environment/cinematic styling, but we scrub the summary/mood if it describes the human.
  return {
    ...styleObj,
    mood: stripIdentityOverridingAnalysis(styleObj.mood),
    // We explicitly clear any 'subject' field if the backend passed one
    subject: undefined 
  };
}
