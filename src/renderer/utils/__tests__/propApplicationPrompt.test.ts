import { describe, expect, it } from 'vitest';

import { PropMetadataService } from '../../services/PropMetadataService';
import { WearableAnchorEngine } from '../../services/WearableAnchorEngine';
import { buildPropApplicationPrompt } from '../propApplicationPrompt';

describe('prop application guardrails', () => {
  it('keeps simple classification available for metadata without routing the apply flow', () => {
    expect(WearableAnchorEngine.inferClass('royal crown.png', 'Saved prop asset', '')).toBe('headwear');
    expect(WearableAnchorEngine.inferClass('uploaded prop', '', 'place on top of her head')).toBe('headwear');
    expect(WearableAnchorEngine.inferClass('reading glasses.png', '', 'put on her face')).toBe('eyewear');
    expect(WearableAnchorEngine.inferClass('handheld microphone.png', '', 'place in her hand')).toBe('held_prop');
    expect(WearableAnchorEngine.inferClass('uploaded prop', '', 'background above her head')).toBe('generic_prop');
  });

  it('keeps durable prop metadata available for future hints', () => {
    const resolved = PropMetadataService.resolvePropFitClass({
      selectedProp: {
        name: 'PROP_123.png',
        prompt: 'Saved prop asset',
        classHint: 'headwear',
        subtypeHint: 'crown'
      },
      applyNote: ''
    });

    expect(resolved.fitClass).toBe('headwear');
    expect(resolved.subtype).toBe('crown');
  });

  it('builds one universal guided edit prompt for prop application', () => {
    const prompt = buildPropApplicationPrompt({
      applyNote: 'Place the crown on top of her head.',
      propTypeHint: 'headwear',
      styleContract: 'STYLE LOCK',
      styleNegativePrompt: 'style drift'
    });

    expect(prompt).toContain('Create a single image.');
    expect(prompt).toContain('TASK');
    expect(prompt).toContain('Edit IMAGE 1 by adding IMAGE 2 as the selected prop/accessory.');
    expect(prompt).toContain('Apply the prop according to this user instruction: "Place the crown on top of her head."');
    expect(prompt).toContain('Simple prop type hint: headwear');
    expect(prompt).toContain('The final image must look like the same subject from IMAGE 1 with the prop from IMAGE 2 added.');
    expect(prompt).toContain('SUBJECT LOCK');
    expect(prompt).toContain('Preserve IMAGE 1 exactly except for the added prop.');
    expect(prompt).toContain('Do not redesign, restyle, beautify, mechanize, age, slim, enlarge, shrink, or alter the subject.');
    expect(prompt).toContain('PROP LOCK');
    expect(prompt).toContain('Use IMAGE 2 as the only prop to add.');
    expect(prompt).toContain('Do not turn the prop into scenery, a background object, a frame, a halo, a throne, architecture, or a new costume.');
    expect(prompt).toContain('HEADWEAR CLARIFICATION');
    expect(prompt).toContain('If the selected prop is headwear, place it on the top/head/hairline area at realistic wearable scale.');
    expect(prompt).toContain('Do not deform it into a helmet, wrap, armor, or background decoration.');
    expect(prompt).toContain('OUTPUT');
    expect(prompt).toContain('Same black background.');
    expect(prompt).toContain('STYLE LOCK');
    expect(prompt).toContain('style drift');
  });

  it('does not reintroduce subtype-specific or deterministic-fit prompt language', () => {
    const prompt = buildPropApplicationPrompt({
      applyNote: 'Place the crown on top of her head.',
      propTypeHint: 'headwear'
    });

    expect(prompt).not.toContain('FIT SEMANTICS - UNIVERSAL');
    expect(prompt).not.toContain('HEAD FIT STRICTNESS');
    expect(prompt).not.toContain('RIGID CROWN');
    expect(prompt).not.toContain('CROWN / TIARA');
    expect(prompt).not.toContain('computePlacement');
    expect(prompt).not.toContain('flexible inner fit');
    expect(prompt).not.toContain('conform to the skull');
  });

  it('uses the same prompt structure for held and generic props', () => {
    const prompt = buildPropApplicationPrompt({
      applyNote: 'Place the microphone in her hand.',
      propTypeHint: 'held prop'
    });

    expect(prompt).toContain('Apply the prop according to this user instruction: "Place the microphone in her hand."');
    expect(prompt).toContain('Simple prop type hint: held prop');
    expect(prompt).toContain('Place the prop only where requested by the user.');
    expect(prompt).toContain('One added prop only.');
    expect(prompt).not.toContain('HEAD FIT STRICTNESS');
    expect(prompt).not.toContain('RIGID CROWN');
  });
});
