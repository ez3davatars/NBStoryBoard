import { describe, expect, it } from 'vitest';

import { PropMetadataService } from '../../services/PropMetadataService';
import { WearableAnchorEngine } from '../../services/WearableAnchorEngine';
import { buildEffectivePropApplicationNote, buildPropApplicationPrompt } from '../propApplicationPrompt';

describe('prop application guardrails', () => {
  it('classifies explicit head fitting as headwear for guided application prompts', () => {
    expect(WearableAnchorEngine.inferClass('PROP_172658062.png', 'Saved prop asset', 'Fit to her head')).toBe('headwear');
    expect(WearableAnchorEngine.inferClass('uploaded prop', '', 'place on top of her head')).toBe('headwear');
    expect(WearableAnchorEngine.inferClass('uploaded prop', '', 'background above her head')).toBe('generic_prop');
    expect(WearableAnchorEngine.inferClass('royal crown.png', 'Saved prop asset', '')).toBe('headwear');
    expect(WearableAnchorEngine.inferClass('wide brim hat.png', '', '')).toBe('headwear');
    expect(WearableAnchorEngine.inferClass('helmet.png', '', '')).toBe('headwear');
    expect(WearableAnchorEngine.inferClass('veil.png', '', '')).toBe('headwear');
    expect(WearableAnchorEngine.inferClass('headband.png', '', '')).toBe('headwear');
    expect(WearableAnchorEngine.inferClass('wig.png', '', '')).toBe('headwear');
  });

  it('detects universal headwear subtypes', () => {
    expect(WearableAnchorEngine.inferHeadwearSubtype('royal crown.png', '', '')).toBe('crown');
    expect(WearableAnchorEngine.inferHeadwearSubtype('silver tiara.png', '', '')).toBe('tiara');
    expect(WearableAnchorEngine.inferHeadwearSubtype('baseball cap.png', '', '')).toBe('hat');
    expect(WearableAnchorEngine.inferHeadwearSubtype('combat helmet.png', '', '')).toBe('helmet');
    expect(WearableAnchorEngine.inferHeadwearSubtype('bridal veil.png', '', '')).toBe('veil');
    expect(WearableAnchorEngine.inferHeadwearSubtype('winter hood.png', '', '')).toBe('hood');
    expect(WearableAnchorEngine.inferHeadwearSubtype('sports headband.png', '', '')).toBe('headband');
    expect(WearableAnchorEngine.inferHeadwearSubtype('curly wig.png', '', '')).toBe('hairpiece');
  });

  it('uses subtype-aware headwear sizing and vertical anchors', () => {
    const landmarks = {
      imageWidth: 1024,
      imageHeight: 1024,
      faceCenter: { x: 512, y: 520 },
      foreheadCenter: { x: 512, y: 350 },
      hairlineCenter: { x: 512, y: 330 },
      leftEye: { x: 455, y: 455 },
      rightEye: { x: 570, y: 455 },
      faceWidthPx: 250,
      faceHeightPx: 360,
      headWidthPx: 290,
      headHeightPx: 430
    };

    const crown = WearableAnchorEngine.computePlacement('headwear', landmarks, 'fit on head', 'crown');
    const hat = WearableAnchorEngine.computePlacement('headwear', landmarks, 'fit on head', 'hat');
    const helmet = WearableAnchorEngine.computePlacement('headwear', landmarks, 'fit on head', 'helmet');
    const headband = WearableAnchorEngine.computePlacement('headwear', landmarks, 'fit on head', 'headband');

    expect(crown.targetWidthPx).toBeLessThan(hat.targetWidthPx);
    expect(hat.targetWidthPx).toBeLessThanOrEqual(helmet.targetWidthPx);
    expect(headband.targetWidthPx).toBeGreaterThan(crown.targetWidthPx);

    expect(crown.anchorCenter.y).toBeLessThan(landmarks.hairlineCenter.y);
    expect(hat.anchorCenter.y).toBeLessThan(landmarks.hairlineCenter.y);
    expect(helmet.anchorCenter.y).toBeGreaterThanOrEqual(crown.anchorCenter.y);
  });

  it('lets durable prop metadata win over anonymous saved names', () => {
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

  it('keeps fallback prop application edit-only and forbids invented scene dressing', () => {
    const prompt = buildPropApplicationPrompt({
      applyNote: 'Fit to her head',
      styleContract: 'STYLE LOCK',
      styleNegativePrompt: 'style drift'
    });

    expect(prompt).toContain('This is a locked prop application/editing pass');
    expect(prompt).toContain('Add exactly one instance of the selected prop');
    expect(prompt).toContain('Do not invent any additional objects');
    expect(prompt).toContain('FIT SEMANTICS - UNIVERSAL');
    expect(prompt).toContain('Interpret the user\'s instruction as a fitting/integration request');
    expect(prompt).toContain('This fit rule applies to every subject, body type, age, hairstyle, camera angle, render style, and prop category.');
    expect(prompt).toContain('HEAD FIT STRICTNESS');
    expect(prompt).toContain('fit the prop to the head geometry, not merely on top of it');
    expect(prompt).toContain('no visible air gap');
    expect(prompt).toContain('Hair must be contained under or behind the fitted head prop');
    expect(prompt).toContain('no hair should poke through solid metal, fabric, frame, jewels, bands, arches, holes, trim, or decorative openings');
    expect(prompt).toContain('subject pixels must never visibly pass through the prop');
    expect(prompt).toContain('Do not extend the prop behind the shoulders');
    expect(prompt).toContain('enlarge into a backdrop');
    expect(prompt).toContain('royal throne');
    expect(prompt).toContain('background crown');
    expect(prompt).toContain('Fit to her head');
    expect(prompt).toContain('STYLE LOCK');
    expect(prompt).toContain('style drift');
  });

  it('strengthens headwear notes for guided image edit routing', () => {
    const effectiveNote = buildEffectivePropApplicationNote('fit the crown naturally on her head', 'headwear');
    const prompt = buildPropApplicationPrompt({
      applyNote: effectiveNote
    });

    expect(effectiveNote).toContain('fit the crown naturally on her head');
    expect(effectiveNote).toContain('Fit the selected headwear naturally onto the subject\'s head');
    expect(effectiveNote).toContain('Do not place it too high above the head');
    expect(effectiveNote).toContain('Do not turn it into a background object, halo, throne, frame, or oversized decoration');
    expect(prompt).toContain('HEAD FIT STRICTNESS');
    expect(prompt).toContain('The headwear must be worn by the subject at natural scale');
    expect(prompt).toContain('Keep the solid black studio background (#000000).');
  });

  it('leaves non-headwear notes unchanged', () => {
    expect(buildEffectivePropApplicationNote('hold the microphone naturally', 'held_prop')).toBe('hold the microphone naturally');
  });

  it('adds universal fit semantics for non-head prop targets too', () => {
    const prompt = buildPropApplicationPrompt({
      applyNote: 'Fit the bracelet around his wrist'
    });

    expect(prompt).toContain('FIT SEMANTICS - UNIVERSAL');
    expect(prompt).toContain('scaled, aligned, perspective-matched, and contact-locked');
    expect(prompt).toContain('subject hair, skin, clothing, fingers, or body parts must not poke through solid prop surfaces');
    expect(prompt).toContain('wrist');
    expect(prompt).not.toContain('HEAD FIT STRICTNESS');
  });
});
