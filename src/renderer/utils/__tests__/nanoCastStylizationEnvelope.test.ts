import { describe, expect, it } from 'vitest';
import {
  clampStylizationByStyle,
  buildStylizationEnvelope,
  buildNanoCastStyleIdentityContract
} from '../../../prompts/nanoCastStyleIdentityEnforcement';

describe('nanoCastStylizationEnvelope', () => {
  it('correctly clamps stylization values by style preset ceilings', () => {
    expect(clampStylizationByStyle('premium_animated_3d', 100)).toBe(100);
    expect(clampStylizationByStyle('premium_animated_3d', 120)).toBe(100);

    expect(clampStylizationByStyle('graphic_novel_noir', 95)).toBe(90);
    expect(clampStylizationByStyle('graphic_novel_noir', 50)).toBe(50);

    expect(clampStylizationByStyle('retro_cel_anime', 90)).toBe(85);
    expect(clampStylizationByStyle('cyberpunk_v2', 80)).toBe(75);
    expect(clampStylizationByStyle('premium_cg_realism', 60)).toBe(55);
    expect(clampStylizationByStyle('exact_likeness_studio', 30)).toBe(25);
  });

  it('correctly maps clamped stylization values to qualitative tiers and envelopes', () => {
    const envelope0 = buildStylizationEnvelope('premium_cg_realism', 0);
    expect(envelope0.tier).toBe('source_faithful');
    expect(envelope0.proportionFlex).toBe('none');
    expect(envelope0.shadingFlex).toBe('minimal');

    const envelope50 = buildStylizationEnvelope('premium_animated_3d', 50);
    expect(envelope50.tier).toBe('strong');
    expect(envelope50.proportionFlex).toBe('light');
    expect(envelope50.shadingFlex).toBe('strong');

    const envelope100 = buildStylizationEnvelope('premium_animated_3d', 100);
    expect(envelope100.tier).toBe('max_safe');
    expect(envelope100.proportionFlex).toBe('moderate');
    expect(envelope100.shadingFlex).toBe('strong');
  });

  it('generates a robust additive stylization contract with strict biometric locks', () => {
    const contract = buildNanoCastStyleIdentityContract({
      styleKey: 'cyberpunk_v2',
      bodyScope: 'full_body',
      stylizationValue: 70
    });

    expect(contract).toContain('NANOCAST HIGH-PRIORITY IDENTITY LOCK');
    expect(contract).not.toContain('skull'); // Rule: No skull in active prompt text
    expect(contract).toContain('head shape');
    expect(contract).toContain('scalp outline');
    expect(contract).toContain('STYLE FAMILY LOCK');
    expect(contract).toContain('Cyberpunk V2');
    expect(contract).toContain('BODY-SCOPE LOCK');
    expect(contract).toContain('FULL BODY');
    expect(contract).toContain('STYLIZATION BEHAVIOR SPECIFICATION');
    expect(contract).toContain('Slider Value: 70/100');
    expect(contract).toContain('Stylization Tier: HIGH');
  });
});
