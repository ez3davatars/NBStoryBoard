import { describe, expect, it } from 'vitest';
import {
  buildSourcePreservingReferenceImages,
  buildStagingSourcePreservationPromptBlock,
  resolveStagingIntent
} from '../stagingSourceIntent';

describe('staging source-to-deliverable intent', () => {
  it('detects uploaded source image conversion into an Instagram deliverable', () => {
    const intent = resolveStagingIntent({
      prompt: 'Convert this character sheet into an Instagram image',
      hasUploadedSourceImage: true
    });

    expect(intent.mode).toBe('source_preserving_layout_transform');
    expect(intent.deliverableKind).toBe('instagram_post');
    expect(intent.recommendedAspectRatio).toBe('1:1');
  });

  it('detects promo/social transformations without requiring UI changes', () => {
    const intent = resolveStagingIntent({
      prompt: 'Make this a promo post for social media',
      hasUploadedSourceImage: true
    });

    expect(intent.mode).toBe('source_preserving_layout_transform');
    expect(intent.deliverableKind).toBe('promo_post');
  });

  it('does not switch normal scene generation when no uploaded source exists', () => {
    const intent = resolveStagingIntent({
      prompt: 'Create an Instagram post showing a neon city',
      hasUploadedSourceImage: false
    });

    expect(intent.mode).toBe('standard_scene_generation');
    expect(intent.source).toBe('none');
  });

  it('keeps explicit restyles opt-in while preserving identity/source content', () => {
    const intent = resolveStagingIntent({
      prompt: 'Convert this into anime style for a promo post',
      hasUploadedSourceImage: true
    });
    const block = buildStagingSourcePreservationPromptBlock(intent);

    expect(intent.explicitRestyleRequested).toBe(true);
    expect(block).toContain('The user explicitly requested a style change');
    expect(block).toContain('preserving the same identity');
  });

  it('builds the hard source preservation prompt block', () => {
    const intent = resolveStagingIntent({
      prompt: 'Turn this into a poster',
      hasUploadedSourceImage: true
    });
    const block = buildStagingSourcePreservationPromptBlock(intent, {
      selectedAspectRatio: '3:4'
    });

    expect(block).toContain('STAGING SOURCE-PRESERVING LAYOUT TRANSFORM');
    expect(block).toContain('Image A is the uploaded source image');
    expect(block).toContain('This is a layout and presentation transformation, not a character redesign');
    expect(block).toContain('Do not treat the source as loose inspiration');
    expect(block).toContain('3:4');
  });

  it('places the uploaded source image first as Image A before supporting references', () => {
    const ordered = buildSourcePreservingReferenceImages('source://sheet', [
      { url: 'source://identity', label: 'ACTOR IDENTITY ANCHOR' },
      { url: 'source://sheet', label: 'Environment/Lighting Anchor' },
      { url: 'source://style', label: 'Style Reference' }
    ]);

    expect(ordered.map((reference) => reference.url)).toEqual([
      'source://sheet',
      'source://identity',
      'source://style'
    ]);
    expect(ordered[0]?.label).toContain('Image A');
    expect(ordered[0]?.label).toContain('authoritative visual');
  });
});
