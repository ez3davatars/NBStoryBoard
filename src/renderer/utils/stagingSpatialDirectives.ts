import type { ReferenceSlot, StageAnnotation, StageToken } from '../context/AppContext';

export type SpatialFrame = {
  w?: number;
  h?: number;
  width?: number;
  height?: number;
};

type NormalizedRect = {
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
};

type NormalizedPoint = {
  x: number;
  y: number;
};

const DEFAULT_FRAME = { width: 1024, height: 576 };
const CONTROL_UNITS = 1000;

const DIRECTIVE_PATTERN =
  /\b(zone|box|bbox|arrow|marker|place|placement|position|stand|standing|sit|sitting|lean|point|pointing|look|looking|gaze|face|facing|smile|gesture|reach|hold|inside|where|beside|behind|front|left|right|height|taller|shorter|scale|sizing|size|picture|photo|image|board|sheet|visible|prop)\b/i;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const finite = (value: unknown, fallback = 0): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

export const resolveSpatialFrame = (frame?: SpatialFrame): { width: number; height: number } => {
  const width = finite(frame?.w ?? frame?.width, DEFAULT_FRAME.width);
  const height = finite(frame?.h ?? frame?.height, DEFAULT_FRAME.height);

  return {
    width: Math.max(1, width),
    height: Math.max(1, height)
  };
};

export const normalizePoint = (point: { x: number; y: number }, frame?: SpatialFrame): NormalizedPoint => {
  const resolved = resolveSpatialFrame(frame);
  return {
    x: Math.round(clamp(point.x / resolved.width, 0, 1) * CONTROL_UNITS),
    y: Math.round(clamp(point.y / resolved.height, 0, 1) * CONTROL_UNITS)
  };
};

export const normalizeRect = (
  rect: { x: number; y: number; w: number; h: number },
  frame?: SpatialFrame
): NormalizedRect => {
  const p1 = normalizePoint({ x: rect.x, y: rect.y }, frame);
  const p2 = normalizePoint({ x: rect.x + rect.w, y: rect.y + rect.h }, frame);
  const x = Math.min(p1.x, p2.x);
  const y = Math.min(p1.y, p2.y);
  const right = Math.max(p1.x, p2.x);
  const bottom = Math.max(p1.y, p2.y);

  return {
    x,
    y,
    w: Math.max(1, right - x),
    h: Math.max(1, bottom - y),
    cx: Math.round((x + right) / 2),
    cy: Math.round((y + bottom) / 2)
  };
};

const tokenRect = (token: StageToken) => {
  const width = Math.max(1, finite(token.width, 1));
  const height = Math.max(1, finite(token.height, 1));
  const anchorX = clamp(finite(token.anchorX, 0.5), 0, 1);
  const anchorY = clamp(finite(token.anchorY, 0.8), 0, 1);

  return {
    x: finite(token.x, 0) - width * anchorX,
    y: finite(token.y, 0) - height * anchorY,
    w: width,
    h: height
  };
};

const annotationRect = (annotation: StageAnnotation) => ({
  x: finite(annotation.x, 0),
  y: finite(annotation.y, 0),
  w: Math.max(1, finite(annotation.width, annotation.type === 'arrow' ? 60 : 150)),
  h: Math.max(1, finite(annotation.height, annotation.type === 'arrow' ? 60 : 100))
});

export const resolveArrowEndpoints = (annotation: StageAnnotation): { start: { x: number; y: number }; end: { x: number; y: number } } => {
  if (
    annotation.x1 !== undefined &&
    annotation.y1 !== undefined &&
    annotation.x2 !== undefined &&
    annotation.y2 !== undefined
  ) {
    return {
      start: { x: finite(annotation.x1), y: finite(annotation.y1) },
      end: { x: finite(annotation.x2), y: finite(annotation.y2) }
    };
  }

  const rect = annotationRect(annotation);
  const center = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
  const rotation = (finite(annotation.rotation, 0) * Math.PI) / 180;
  const scaleX = finite(annotation.scaleX, 1);
  const scaleY = finite(annotation.scaleY, 1);
  const startLocal = { x: (-rect.w / 2) * scaleX, y: (rect.h / 2) * scaleY };
  const endLocal = { x: (rect.w / 2) * scaleX, y: (-rect.h / 2) * scaleY };

  const rotate = (point: { x: number; y: number }) => ({
    x: center.x + point.x * Math.cos(rotation) - point.y * Math.sin(rotation),
    y: center.y + point.x * Math.sin(rotation) + point.y * Math.cos(rotation)
  });

  return {
    start: rotate(startLocal),
    end: rotate(endLocal)
  };
};

const labelFor = (value: string | undefined, fallback: string): string => {
  const text = (value || '').trim();
  return text || fallback;
};

const compact = (value: string, maxLength = 520): string => {
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}...` : text;
};

export const hasDirectiveLikeReferenceText = (slot: ReferenceSlot): boolean => {
  const text = [slot.target, slot.analysis].filter(Boolean).join(' ');
  return DIRECTIVE_PATTERN.test(text);
};

const buildReferenceDirectiveLines = (slots: ReferenceSlot[]): string[] => {
  const active = slots.filter((slot) => slot.active && (slot.analysis || slot.target || slot.name));
  const directiveLines: string[] = [];

  for (const slot of active) {
    const target = (slot.target || '').trim();
    const analysis = (slot.analysis || '').trim();
    const identityLabel = `REFERENCE_${slot.index}`;
    const pieces: string[] = [];

    pieces.push(`identity_image_label=${identityLabel}`);
    if (target) pieces.push(`target="${compact(target, 240)}"`);
    if (analysis && DIRECTIVE_PATTERN.test(analysis)) {
      pieces.push(`note="${compact(analysis)}"`);
    }

    if (pieces.length === 0) continue;

    const name = labelFor(slot.name, `Reference Slot ${slot.index}`);
    directiveLines.push(`- REF_SLOT_${slot.index} (${name}) => ${identityLabel}: ${pieces.join('; ')}`);
  }

  return directiveLines;
};

const buildZoneScaleLines = (
  zones: StageAnnotation[],
  referenceSlots: ReferenceSlot[],
  frame?: SpatialFrame
): string[] => {
  if (zones.length === 0) return [];

  const activeRefs = referenceSlots
    .filter((slot) => slot.active && slot.url)
    .sort((a, b) => a.index - b.index);
  const zoneEntries = zones.map((zone, index) => {
    const rect = normalizeRect(annotationRect(zone), frame);
    const ref = activeRefs[index];
    return {
      index: index + 1,
      rect,
      label: labelFor(zone.label, zone.anchorKind ? `${zone.anchorKind} zone` : 'unlabeled zone'),
      ref
    };
  });

  const shortest = zoneEntries.reduce((min, entry) => entry.rect.h < min.rect.h ? entry : min, zoneEntries[0]);
  const tallest = zoneEntries.reduce((max, entry) => entry.rect.h > max.rect.h ? entry : max, zoneEntries[0]);
  const heightRanking = [...zoneEntries].sort((a, b) => b.rect.h - a.rect.h);
  const lines = [
    'ZONE CONTAINMENT / GROUND / SCALE LOCK (HARD):',
    'Treat every ZONE as a containment frame for one full actor, not a stretch target. Keep the complete visible body inside the assigned zone unless a user note explicitly requests an arm/hand gesture outside it.',
    'The zone bottom_y is the actor ground line. Place the actor feet/shoes on that bottom_y baseline; do not let the actor float above it or sink below it.',
    'Do not force the head/top to touch the zone top. Natural headroom is allowed. The goal is containment, grounded feet, and correct height order, not filling every pixel of the box.',
    'Compare all zone heights before generation. A taller zone means the actor assigned to that zone should appear taller than an actor assigned to a shorter zone, but only within a natural full-body fit inside each zone.'
  ];

  if (activeRefs.length > 0 && zones.length > 1) {
    lines.push('Default mapping when notes do not explicitly name another target: REF_SLOT_1 -> ZONE_1, REF_SLOT_2 -> ZONE_2, and so on by visual slot/zone order.');
  }

  lines.push(
    `Height ranking, tallest to shortest: ${heightRanking.map((entry) => `ZONE_${entry.index}(h=${entry.rect.h})`).join(' > ')}.`
  );

  zoneEntries.forEach((entry) => {
    const scaleRank = heightRanking.findIndex((ranked) => ranked.index === entry.index) + 1;
    const assigned = entry.ref
      ? `, default_subject=REF_SLOT_${entry.ref.index} (${labelFor(entry.ref.name, `Reference ${entry.ref.index}`)}) via REFERENCE_${entry.ref.index}`
      : '';
    lines.push(
      `- ZONE_${entry.index}: top_y=${entry.rect.y}, bottom_y=${entry.rect.y + entry.rect.h}, ground_line_y=${entry.rect.y + entry.rect.h}, height=${entry.rect.h}, scale_rank=${scaleRank}, containment="full body inside; feet on ground_line"${assigned}.`
    );
  });

  if (zoneEntries.length > 1 && tallest.index !== shortest.index) {
    const ratio = shortest.rect.h > 0 ? tallest.rect.h / shortest.rect.h : 1;
    lines.push(
      `ZONE_${tallest.index} is the tallest containment frame and ZONE_${shortest.index} is the shortest (${ratio.toFixed(2)}x zone-height difference). The actor in ZONE_${tallest.index} should be visibly taller than the actor in ZONE_${shortest.index}, while both remain fully inside their own zones with feet on their own ground_line_y.`
    );
    lines.push('Hard failure: an actor extends outside the assigned zone, floats above the zone bottom, sinks below the zone bottom, or the taller-zone/shorter-zone height order is inverted.');
  }

  return lines;
};

export const buildStagingSpatialControlBlock = (input: {
  referenceSlots?: ReferenceSlot[];
  tokens?: StageToken[];
  annotations?: StageAnnotation[];
  spatialFrame?: SpatialFrame;
  includeTokenMap?: boolean;
}): string => {
  const tokens = (input.tokens || []).filter((token) => token.visible !== false);
  const annotations = (input.annotations || []).filter((annotation) => annotation.visible !== false);
  const zones = annotations.filter((annotation) => annotation.type === 'zone');
  const arrows = annotations.filter((annotation) => annotation.type === 'arrow');
  const notes = annotations.filter((annotation) => annotation.type === 'note' && (annotation.text || annotation.label));
  const referenceDirectiveLines = buildReferenceDirectiveLines(input.referenceSlots || []);

  if (
    zones.length === 0 &&
    arrows.length === 0 &&
    notes.length === 0 &&
    referenceDirectiveLines.length === 0 &&
    (!input.includeTokenMap || tokens.length === 0)
  ) {
    return '';
  }

  const lines: string[] = [
    '### STAGING CONTROL CONTRACT (HARD)',
    'CONTROL COORDINATE FRAME: all x/y/bbox values below are normalized 0-1000, origin top-left, matching the attached stage viewport.',
    'If an image labeled CONTROL_OVERLAY is attached, use it only as a spatial blueprint. Do not render its labels, boxes, arrows, outlines, guide colors, or UI marks in the final image.',
    'Obey these controls before style, mood, or generic composition preferences.'
  ];

  if (referenceDirectiveLines.length > 0) {
    lines.push(
      '',
      'REFERENCE STACK DIRECTIVES (USER NOTES - HARD):',
      ...referenceDirectiveLines,
      'Each REF_SLOT must use its attached REFERENCE_* image as the identity, body, wardrobe, and visible trait source unless the directive explicitly says otherwise.',
      'Do not invent, recast, substitute, or genericize a REF_SLOT subject. A random presenter/actor is a hard failure.',
      'If a reference directive mentions a zone/box/marker, place the named subject inside the corresponding ZONE below. If only one zone exists, that zone is the target.',
      'If a reference directive mentions a picture/photo/image/board/sheet as a target, preserve the visible staged board/sheet in the final scene and direct the actor gesture/gaze toward it.'
    );
  }

  if (zones.length > 0) {
    lines.push('', 'ZONE MAP (HARD PLACEMENT AREAS):');
    zones.forEach((zone, index) => {
      const rect = normalizeRect(annotationRect(zone), input.spatialFrame);
      const label = labelFor(zone.label, zone.anchorKind ? `${zone.anchorKind} zone` : 'unlabeled zone');
      const role = zone.role || 'anchor';
      const text = compact([zone.text, zone.hard ? 'hard=true' : ''].filter(Boolean).join(' '), 260);
      lines.push(
        `- ZONE_${index + 1}: bbox=[${rect.x},${rect.y},${rect.w},${rect.h}], center=[${rect.cx},${rect.cy}], role=${role}, anchor=${zone.anchorKind || 'unspecified'}, label="${label}"${text ? `, instruction="${text}"` : ''}`
      );
    });

    lines.push('', ...buildZoneScaleLines(zones, input.referenceSlots || [], input.spatialFrame));
  }

  if (arrows.length > 0) {
    lines.push('', 'ARROW MAP (HARD DIRECTION/GESTURE GUIDES):');
    arrows.forEach((arrow, index) => {
      const endpoints = resolveArrowEndpoints(arrow);
      const start = normalizePoint(endpoints.start, input.spatialFrame);
      const end = normalizePoint(endpoints.end, input.spatialFrame);
      const label = labelFor(arrow.label, arrow.relation || arrow.blueprintType || 'direction arrow');
      const text = compact(arrow.text || '', 260);
      lines.push(
        `- ARROW_${index + 1}: start=[${start.x},${start.y}], end=[${end.x},${end.y}], relation=${arrow.relation || 'direction'}, label="${label}"${text ? `, instruction="${text}"` : ''}`
      );
    });
  }

  if (notes.length > 0) {
    lines.push('', 'DIRECTOR NOTE MAP (HARD WHEN INSTRUCTIONAL):');
    notes.forEach((note, index) => {
      const rect = normalizeRect(annotationRect(note), input.spatialFrame);
      const label = labelFor(note.label, `Note ${index + 1}`);
      const text = compact(note.text || '', 320);
      lines.push(`- NOTE_${index + 1}: bbox=[${rect.x},${rect.y},${rect.w},${rect.h}], label="${label}"${text ? `, text="${text}"` : ''}`);
    });
  }

  if (input.includeTokenMap && tokens.length > 0) {
    lines.push('', 'STAGED SUBJECT MAP (CURRENT CANVAS GEOMETRY):');
    tokens.forEach((token, index) => {
      const rect = normalizeRect(tokenRect(token), input.spatialFrame);
      const label = labelFor(token.tag, `Subject ${index + 1}`);
      const notes = compact([token.actionNote, token.intelligence, token.notes].filter(Boolean).join(' '), 320);
      lines.push(
        `- REGION_${index + 1} (${label}): bbox=[${rect.x},${rect.y},${rect.w},${rect.h}], center=[${rect.cx},${rect.cy}], depth=${token.anchorLayer || 'unspecified'}${notes ? `, instruction="${notes}"` : ''}`
      );
    });
  }

  return lines.join('\n');
};

export const shouldAttachSpatialControlOverlay = (input: {
  referenceSlots?: ReferenceSlot[];
  annotations?: StageAnnotation[];
}): boolean => {
  const annotations = (input.annotations || []).filter((annotation) => annotation.visible !== false);
  return (
    annotations.some((annotation) => annotation.type === 'zone' || annotation.type === 'arrow' || annotation.type === 'note') ||
    (input.referenceSlots || []).some((slot) => slot.active && hasDirectiveLikeReferenceText(slot))
  );
};
