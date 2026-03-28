import type { CoverageSceneType } from '../types/shots';

export function inferCoverageSceneType(args: {
  subjectActionText?: string;
  environmentText?: string;
  sceneDirectorText?: string;
}): CoverageSceneType {
  const combined = [args.subjectActionText, args.environmentText, args.sceneDirectorText]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  // Keyword rules -> deterministic inference
  if (/\\b(courtroom|judge|defendant|attorney|trial|bench|lawyer|prosecutor)\\b/.test(combined)) return 'courtroom';
  if (/\\b(fight|chase|explosion|pursuit|combat|battle|shootout|run|escape)\\b/.test(combined)) return 'action';
  if (/\\b(product|lifestyle|campaign|brand|ad|commercial|perfume|luxury)\\b/.test(combined)) return 'commercial';
  if (/\\b(office|boardroom|meeting|coworker|corporate|desk|boss|colleague)\\b/.test(combined)) return 'office';
  if (/\\b(fashion|runway|vogue|model|garment|editorial|couture|clothing)\\b/.test(combined)) return 'fashion';
  if (/\\b(interview|documentary|podcast|host|guest)\\b/.test(combined)) return 'interview';
  if (/\\b(conversation|argument|discussion|dialog|intimate|exchange|talking)\\b/.test(combined)) return 'dialogue';

  return 'generic';
}

export function extractRoleHints(text?: string): Record<string, boolean> {
  const roles: Record<string, boolean> = {};
  if (!text) return roles;
  
  const lower = text.toLowerCase();
  
  if (/\\b(judge|magistrate|presiding)\\b/.test(lower)) roles['judge'] = true;
  if (/\\b(defendant|accused|client)\\b/.test(lower)) roles['defendant'] = true;
  if (/\\b(attorney|lawyer|counsel|prosecutor)\\b/.test(lower)) roles['attorney'] = true;
  if (/\\b(hero|protagonist|main character)\\b/.test(lower)) roles['hero'] = true;
  if (/\\b(villain|antagonist|bad guy)\\b/.test(lower)) roles['villain'] = true;
  if (/\\b(speaker|subject|host|guest|person)\\b/.test(lower)) roles['speaker'] = true;
  if (/\\b(product|bottle|car|item|brand)\\b/.test(lower)) roles['product'] = true;

  return roles;
}
