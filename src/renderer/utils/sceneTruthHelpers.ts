import type { ActorIdentityReferenceSet, ShotsActorOption, StageToken } from '../context/AppContext';
import type { SceneTruthSnapshot, SceneTruthActor } from '../types/shots';

export function buildSceneTruthSnapshot(args: {
  sourceResultUrl: string;
  expectedActorCount?: number;
  actorIdentitySets?: ActorIdentityReferenceSet[];
  shotsActorOptions?: ShotsActorOption[];
  tokens?: StageToken[];
  environmentText?: string;
}): SceneTruthSnapshot {
  
  const { sourceResultUrl, expectedActorCount: passedExpectedActorCount, actorIdentitySets = [], shotsActorOptions = [], tokens = [], environmentText = '' } = args;

  // 1. Compute Actor Count
  const expectedActorCount = Math.max(passedExpectedActorCount || 0, tokens.length, actorIdentitySets.length, 0);

  // 2. Derive Left-to-Right order and postures from Tokens or Actor Sets
  const actors: SceneTruthActor[] = [];
  
  // If we have tokens, we have actual spatial data (x, y coords)
  if (tokens.length > 0) {
    // Sort tokens strictly left to right
    const sortedTokens = [...tokens].sort((a, b) => a.x - b.x);
    
    sortedTokens.forEach((t, i) => {
      const center = t.x + t.width / 2;
      const relX = center / 1024; // assume 1024 standard width
      
      let zone: 'left' | 'center' | 'right' | 'unknown' = 'center';
      if (relX < 0.38) zone = 'left';
      else if (relX > 0.62) zone = 'right';

      let role: 'seated' | 'standing' | 'unknown' = 'unknown';
      const safeAction = String(t.actionNote || t.intelligence || '').toLowerCase();
      if (safeAction.includes('sit') || safeAction.includes('seated') || safeAction.includes('chair') || safeAction.includes('bench') || safeAction.includes('table')) {
         role = 'seated';
      } else if (safeAction.includes('stand') || safeAction.includes('walk') || safeAction.includes('lean')) {
         role = 'standing';
      }

      // Find identity match
      const identitySet = actorIdentitySets.find(s => s.actorId === t.castId);
      const actorId = identitySet?.actorId || t.castId || `Anonymous-${i}`;
      const option = shotsActorOptions.find(o => o.actorId === actorId);
      const actorLabel = option?.actorLabel || identitySet?.actorLabel || t.tag || `Subject ${i + 1}`;

      actors.push({
        actorId,
        actorLabel,
        leftToRightIndex: i,
        approxZone: zone,
        role,
        targetInScene: t.tag
      });
    });
  } else if (actorIdentitySets.length > 0) {
    // Fallback to identity sets if no tokens (happens if uploading a raw image without staging context)
    // We can't guarantee geographic spacing here, so we default everything
    actorIdentitySets.forEach((set, i) => {
       const option = shotsActorOptions.find(o => o.actorId === set.actorId);
       const actorLabel = option?.actorLabel || set.actorLabel || `Subject ${i + 1}`;
       actors.push({
         actorId: set.actorId,
         actorLabel,
         leftToRightIndex: i, // Unreliable but required
         approxZone: 'unknown',
         role: 'unknown'
       });
    });
  }

  // 3. Structural and set dressing cues
  // Ideally this would be powered by VQA or Gemini inference, but for now we regex the environmentText
  const safeEnvText = environmentText || '';
  const envTextLower = safeEnvText.toLowerCase();
  
  const structuralKeywords = ['wall', 'window', 'ceiling', 'floor', 'glass partition', 'column', 'pillars', 'arch', 'door', 'hallway'];
  const dressingKeywords = ['desk', 'chair', 'table', 'bench', 'monitor', 'microphone', 'lamp', 'plant', 'sofa', 'rug', 'bookshelf'];

  const matchedStructs = structuralKeywords.filter(k => envTextLower.includes(k));
  const matchedDressing = dressingKeywords.filter(k => envTextLower.includes(k));

  // If we had no explicit text, we inject defensive generics
  const structuralCues = matchedStructs.length > 0 ? matchedStructs : ["walls", "room layout", "architectural boundaries"];
  const setDressingCues = matchedDressing.length > 0 ? matchedDressing : ["existing surfaces", "existing seating"];

  if (envTextLower.includes('courtroom') || envTextLower.includes('court')) {
     structuralCues.push('judge bench structure', 'gallery rail');
     setDressingCues.push('microphones', 'desks');
  }

  // 4. Safe camera defaults
  const cameraConstraints = {
    allowOverhead: false,
    allowDutch: false,
    allowExtremeTopDown: false
  };

  return {
    sourceResultUrl,
    expectedActorCount,
    actors,
    environment: {
      structuralCues: [...new Set(structuralCues)],
      setDressingCues: [...new Set(setDressingCues)]
    },
    cameraConstraints
  };
}

export function buildSceneTruthSnapshotBlock(sceneTruth: SceneTruthSnapshot): string {
  const lines: string[] = [];
  lines.push(`### SCENE TRUTH SNAPSHOT (FROZEN PHYSICAL REALITY):`);
  lines.push(`CRITICAL DIRECTIVE: You MUST perfectly mirror the physical reality recorded below.`);
  
  if (sceneTruth.expectedActorCount === 0) {
    lines.push(`- Visible Actor Count: preserve all visible people already present in the anchor image`);
    lines.push(`- Do not add, remove, duplicate, or merge visible people`);
  } else {
    lines.push(`- Visible Actor Count: EXACTLY ${sceneTruth.expectedActorCount}`);
  }
  
  if (sceneTruth.actors.length > 0) {
    const actorOrder = sceneTruth.actors
       .sort((a, b) => a.leftToRightIndex - b.leftToRightIndex)
       .map(a => a.actorLabel)
       .join(", ");
    lines.push(`- Left-to-Right Actor Order: ${actorOrder}`);

    sceneTruth.actors.forEach(a => {
      let line = `- ${a.actorLabel}: `;
      const traits: string[] = [];
      if (a.role !== 'unknown') traits.push(`remains **${a.role.toUpperCase()}**`);
      if (a.approxZone !== 'unknown') traits.push(`positioned in the **${a.approxZone} zone**`);
      
      if (traits.length > 0) {
        line += traits.join(" and ");
      } else {
        line += "preserve original posture and position";
      }
      lines.push(line);
    });
  }

  lines.push(`- Preserved Structural Architecture: ${sceneTruth.environment.structuralCues.map(s => s.toUpperCase()).join(', ')}`);
  lines.push(`- Preserved Set Dressing & Furniture: ${sceneTruth.environment.setDressingCues.map(s => s.toUpperCase()).join(', ')}`);
  
  const badCams: string[] = [];
  if (!sceneTruth.cameraConstraints.allowOverhead) badCams.push('OVERHEAD');
  if (!sceneTruth.cameraConstraints.allowDutch) badCams.push('DUTCH/TILT');
  if (!sceneTruth.cameraConstraints.allowExtremeTopDown) badCams.push('TOP-DOWN');
  
  if (badCams.length > 0) {
    lines.push(`- Forbidden Camera Classes: NO ${badCams.join(', NO ')} allowed. Generate standard eye-level or slight hi/low angles only.`);
  }

  lines.push(`\nOMNIPOTENT RULE: This is one single fixed point in time and space. Reframe the camera ONLY. Do not invent a different timeline, a different variation of the room, or alter the characters' physical states.\n`);

  return lines.join('\n');
}
