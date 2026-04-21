// Sanitizer to enforce identity precedence over loose style abstraction.
import type { ExtractedStyle } from '../services/GeminiService';

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
const CAMERA_DIRECTIVE_REGEX = /\b(recompose|reframe|frame|camera|lens|focal length|zoom|dolly|truck|pan|tilt|orbit|rack focus|depth[- ]of[- ]field|headroom)\b/i;

export function stripShotDirectiveContamination(text: string | undefined): string {
  if (!text) return '';

  const parts = text
    .split(/\r?\n+/)
    .flatMap(line => line.split(/[.;!?]+/))
    .map(part => part.trim())
    .filter(Boolean);

  const cleaned = parts
    .map(part => {
      const candidate = part.replace(/\s{2,}/g, ' ').trim();
      if (!candidate) return '';

      // Drop entire clauses that contain shot/camera directives so preset intent appears only once
      // in the dedicated SHOTS preset block during prompt assembly.
      if (SHOT_DIRECTIVE_REGEX.test(candidate) || CAMERA_DIRECTIVE_REGEX.test(candidate)) {
        return '';
      }

      return candidate;
    })
    .filter(Boolean);

  return cleaned.join('. ').trim();
}

/**
 * Helper to safely demote extracted styles if strict actors are present.
 */
type SanitizableStyle = ExtractedStyle & { subject?: unknown };

export function sanitizeStyleForStrictIdentity(
  styleObj: SanitizableStyle | null | undefined
): SanitizableStyle | null {
  if (!styleObj) return null;
  
  // We preserve the environment/cinematic styling, but we scrub the summary/mood if it describes the human.
  return {
    ...styleObj,
    mood: stripIdentityOverridingAnalysis(styleObj.mood),
    // We explicitly clear any 'subject' field if the backend passed one
    subject: undefined 
  };
}
