import { describe, expect, it } from 'vitest';
import type { ReferenceSlot, StageAnnotation, StageToken } from '../../context/AppContext';
import {
  buildStagingSpatialControlBlock,
  normalizeRect,
  resolveArrowEndpoints,
  shouldAttachSpatialControlOverlay
} from '../stagingSpatialDirectives';

const token: StageToken = {
  id: 'token-1',
  castId: 'actor-1',
  url: 'data:image/png;base64,abc',
  x: 500,
  y: 400,
  width: 160,
  height: 280,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  pitch: 0,
  yaw: 0,
  anchorX: 0.5,
  anchorY: 0.8,
  tag: 'Erki',
  uniformScale: true,
  zIndex: 10,
  visible: true
};

const zone: StageAnnotation = {
  id: 'zone-1',
  type: 'zone',
  x: 360,
  y: 210,
  width: 180,
  height: 260,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  text: 'Stand here',
  label: 'hero placement',
  hard: true,
  zIndex: 20,
  visible: true
};

const tallZone: StageAnnotation = {
  ...zone,
  id: 'zone-2',
  x: 600,
  y: 80,
  width: 220,
  height: 400,
  label: 'taller placement'
};

const arrow: StageAnnotation = {
  id: 'arrow-1',
  type: 'arrow',
  x: 700,
  y: 250,
  width: 120,
  height: 120,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  text: 'point to the board',
  relation: 'lookAt',
  zIndex: 21,
  visible: true
};

const refSlot: ReferenceSlot = {
  index: 1,
  url: 'data:image/png;base64,ref',
  name: 'Erik',
  analysis: 'Standing where the zone box is and he points to his picture with a smile',
  active: true,
  status: 'ready',
  castId: 'actor-1'
};

describe('staging spatial directives', () => {
  it('serializes reference notes, zones, arrows, and staged regions as hard controls', () => {
    const block = buildStagingSpatialControlBlock({
      referenceSlots: [refSlot],
      tokens: [token],
      annotations: [zone, arrow],
      spatialFrame: { w: 1000, h: 500 },
      includeTokenMap: true
    });

    expect(block).toContain('STAGING CONTROL CONTRACT (HARD)');
    expect(block).toContain('REF_SLOT_1 (Erik)');
    expect(block).toContain('identity_image_label=REFERENCE_1');
    expect(block).toContain('Do not invent, recast, substitute, or genericize');
    expect(block).toContain('Standing where the zone box is');
    expect(block).toContain('ZONE_1: bbox=[360,420,180,520]');
    expect(block).toContain('ZONE CONTAINMENT / GROUND / SCALE LOCK (HARD)');
    expect(block).toContain('ARROW_1:');
    expect(block).toContain('REGION_1 (Erki):');
    expect(block).toContain('preserve the visible staged board/sheet');
  });

  it('serializes zone height ranking so actor scale follows zone size', () => {
    const secondRef: ReferenceSlot = {
      ...refSlot,
      index: 2,
      name: 'Matty',
      url: 'data:image/png;base64,matty',
      castId: 'actor-2'
    };

    const block = buildStagingSpatialControlBlock({
      referenceSlots: [refSlot, secondRef],
      annotations: [zone, tallZone],
      spatialFrame: { w: 1000, h: 500 }
    });

    expect(block).toContain('Height ranking, tallest to shortest: ZONE_2(h=800) > ZONE_1(h=520).');
    expect(block).toContain('REF_SLOT_1 -> ZONE_1, REF_SLOT_2 -> ZONE_2');
    expect(block).toContain('ZONE_2: top_y=160, bottom_y=960, ground_line_y=960, height=800, scale_rank=1');
    expect(block).toContain('containment="full body inside; feet on ground_line"');
    expect(block).toContain('The actor in ZONE_2 should be visibly taller than the actor in ZONE_1');
    expect(block).toContain('Hard failure: an actor extends outside the assigned zone');
  });

  it('normalizes rectangles into the 0-1000 control frame', () => {
    expect(normalizeRect({ x: 100, y: 50, w: 200, h: 100 }, { w: 1000, h: 500 })).toEqual({
      x: 100,
      y: 100,
      w: 200,
      h: 200,
      cx: 200,
      cy: 200
    });
  });

  it('resolves fallback arrow endpoints from the visible arrow box', () => {
    const endpoints = resolveArrowEndpoints(arrow);
    expect(Math.round(endpoints.start.x)).toBe(700);
    expect(Math.round(endpoints.start.y)).toBe(370);
    expect(Math.round(endpoints.end.x)).toBe(820);
    expect(Math.round(endpoints.end.y)).toBe(250);
  });

  it('requests a control overlay for visual annotations or directive-like reference notes', () => {
    expect(shouldAttachSpatialControlOverlay({ referenceSlots: [refSlot], annotations: [] })).toBe(true);
    expect(shouldAttachSpatialControlOverlay({ referenceSlots: [], annotations: [zone] })).toBe(true);
    expect(shouldAttachSpatialControlOverlay({ referenceSlots: [], annotations: [] })).toBe(false);
  });
});
