import { describe, expect, it } from 'vitest';

import {
  buildPitchSheetCallouts,
  buildCharacterPitchSheetPrompt,
  defaultCharacterPitchSheetInput,
  sanitizeVisibleBoardLanguage,
  type CharacterPitchSheetRenderStyle,
  type CharacterPitchSheetInput,
} from '../../../prompts/characterPitchSheetPrompts';

const buildInput = (overrides: Partial<CharacterPitchSheetInput>): CharacterPitchSheetInput => ({
  ...defaultCharacterPitchSheetInput,
  characterName: 'Abner',
  worldEra: 'Ancient Israelite times',
  ...overrides,
});

describe('Character Pitch Sheet visible-language sanitation', () => {
  it('translates internal design and lighting language before prompt assembly', () => {
    const input = buildInput({
      designLanguage: 'NanoCast biometric cinematic character design',
      lightingMood: 'Use the generated NanoCast character image for approved lighting and style, with biometric identity taking priority',
      faceDetails: 'Biometric multi-view scan supplied as the strict actor identity source.',
      materialCostumeNotes: 'Bronze clasp with NanoCast Etching and Integrated Circuitry.',
      productionNotes: 'NanoCast biometric handoff loaded 3 raw angle reference(s).',
    });

    const sanitized = sanitizeVisibleBoardLanguage(input);

    expect(sanitized.designLanguage).toBe('Cinematic ancient character design with actor-based likeness');
    expect(sanitized.lightingMood).toBe('');
    expect(sanitized.faceDetails).toContain('actor likeness study');
    expect(sanitized.materialCostumeNotes).toContain('hand-tooled detail');
    expect(sanitized.materialCostumeNotes).toContain('Bronze');
    expect(sanitized.materialCostumeNotes).not.toMatch(/NanoCast|biometric|circuitry|scanner/i);
    expect(sanitized.productionNotes).toBe('');
  });

  it('supplies adaptive callout rules and cleaned historical callouts without reusing contaminated positive fields', () => {
    const prompt = buildCharacterPitchSheetPrompt(buildInput({
      designLanguage: 'NanoCast biometric cinematic character design',
      wardrobeDirection: 'Woven tunic, weathered cloak, leather belt, bronze clasp, sandals, biometric closures, ergonomic boots.',
      materialCostumeNotes: 'Integrated circuitry, scanner clasp, generated NanoCast character image.',
      lightingMood: 'Use the generated NanoCast character image for approved lighting and style.',
    }));

    expect(prompt).toContain('VISIBLE BOARD LANGUAGE RULE');
    expect(prompt).toContain('NEGATIVE VISIBLE TEXT CONSTRAINTS');
    expect(prompt).toContain('CALLOUT ACCURACY RULE');
    expect(prompt).toContain('CALLOUT CATEGORY PLACEMENT RULE');
    expect(prompt).toContain('CALLOUT COUNT RULE');
    expect(prompt).toContain('WORLD / ERA VISIBLE VOCABULARY');
    expect(prompt).toContain('STYLE-CALLOUT RULE');
    expect(prompt).toContain('CONTROLLED CALLOUT PLAN');
    expect(prompt).toContain('Tunic Construction');
    expect(prompt).toContain('Cloak Layer');
    expect(prompt).toContain('Leather Grain');
    expect(prompt).toContain('Sandal Construction');
    expect(prompt).toContain('- Design language: Cinematic ancient character design with actor-based likeness');
    expect(prompt).not.toContain('- Design language: NanoCast biometric cinematic character design');
    expect(prompt).not.toContain('Use the generated NanoCast character image for approved lighting and style.');
    expect(prompt).not.toContain('with NanoCast Etching');
  });

  it('uses clean source panel labels by default and reserves debug labels for explicit opt-in', () => {
    const input = buildInput({
      identitySource: 'biometric_multiview',
      sourcePanelMode: 'raw_source',
      referenceImages: [
        { angle: 'center', imageUrl: 'data:image/png;base64,center', label: 'IMAGE 1 biometric scanner source image' },
        { angle: 'left', imageUrl: 'data:image/png;base64,left', label: 'IMAGE 2 NanoCast Scanner' },
      ],
    });

    const sanitized = sanitizeVisibleBoardLanguage(input);

    expect(sanitized.referenceImages?.map(reference => reference.label)).toEqual([
      'Actor Reference',
      'Left Profile Reference',
    ]);
  });

  it('locks identity, body, costume, and world across every render style', () => {
    const styles: CharacterPitchSheetRenderStyle[] = [
      'biometric_realism',
      'cinematic_photoreal',
      'stylized_realism',
      'animated_feature',
      'editorial_illustration',
      'concept_art',
      'graphic_novel',
      'anime_manga',
    ];

    for (const characterRenderStyle of styles) {
      const prompt = buildCharacterPitchSheetPrompt(buildInput({
        characterRenderStyle,
        heightIn: 70,
        weightLbs: 170,
        frameSize: 'medium',
        musculature: 'average',
        buildInterpretation: 'lean_average',
        wardrobeDirection: 'Weathered wool cloak, woven linen tunic, leather belt, bronze clasp, sandals.',
      }));

      expect(prompt).toContain('UNIVERSAL STYLE CONSISTENCY CONTRACT');
      expect(prompt).toContain('STYLE DRIFT NEGATIVE CONSTRAINTS');
      expect(prompt).toContain('STYLE-PHYSIQUE RULE');
      expect(prompt).toContain('SOURCE PANEL MODE HAS PRIORITY OVER STYLE');
      expect(prompt).toContain('STYLE-SAFE VISIBLE LABELING');
      expect(prompt).toContain('STYLE-CALLOUT RULE');
      expect(prompt).toContain('Style may change rendering treatment, lighting, texture, color finish, line language, and surface language only.');
      expect(prompt).toContain('Style must not change actor identity, face structure, skull geometry, age impression, body proportions, costume, footwear, accessories, props, or world/era.');
      expect(prompt).toContain('costume');
      expect(prompt).toContain('footwear');
      expect(prompt).toContain('props');
      expect(prompt).toContain('world/era');
    }
  });

  it('keeps critical per-style drift guards in the active prompt', () => {
    expect(buildCharacterPitchSheetPrompt(buildInput({
      characterRenderStyle: 'cinematic_photoreal',
    }))).toContain('Do not turn into a plain corporate reference sheet');

    expect(buildCharacterPitchSheetPrompt(buildInput({
      characterRenderStyle: 'stylized_realism',
    }))).toContain('do not bulk, widen, slim, exaggerate, genericize the face');

    expect(buildCharacterPitchSheetPrompt(buildInput({
      characterRenderStyle: 'animated_feature',
    }))).toContain('translate this actor; do not invent a new animated character');

    expect(buildCharacterPitchSheetPrompt(buildInput({
      characterRenderStyle: 'concept_art',
    }))).toContain('polish, clarify, and resolve; do not redesign');

    expect(buildCharacterPitchSheetPrompt(buildInput({
      characterRenderStyle: 'anime_manga',
    }))).toContain("preserve this subject's identity; do not default to a generic anime face");
  });

  it('builds context-appropriate callouts for modern business, sci-fi, creature, and robot characters', () => {
    const cases: Array<{
      name: string;
      input: Partial<CharacterPitchSheetInput>;
      expectedLabels: string[];
      forbiddenLabels?: RegExp;
    }> = [
      {
        name: 'modern business',
        input: {
          worldEra: 'Modern corporate spokesperson',
          wardrobeDirection: 'Tailored navy jacket, crisp shirt collar, leather watch, polished shoes.',
          propsSignatureItems: 'tablet',
          characterRenderStyle: 'cinematic_photoreal',
        },
        expectedLabels: ['Tailored Jacket', 'Shirt Collar Construction', 'Leather Grain', 'Polished Shoe Construction', 'tablet Detail'],
        forbiddenLabels: /Sandal|Cloak|Tech Jacket|Power Core/i,
      },
      {
        name: 'sci-fi cyberpunk',
        input: {
          worldEra: 'near-future cyberpunk city',
          wardrobeDirection: 'Reinforced tech jacket, illuminated interface trim, utility harness, tactical boots.',
          propsSignatureItems: 'wrist projector',
          characterRenderStyle: 'concept_art',
        },
        expectedLabels: ['Reinforced Tech Jacket', 'Utility Harness', 'Synthetic Material Finish', 'Tactical Boot Construction', 'wrist projector Detail'],
        forbiddenLabels: /Sandal|Tailored Jacket|Fur Pattern/i,
      },
      {
        name: 'creature',
        input: {
          characterName: 'Ashhorn',
          worldEra: 'fantasy creature forest',
          wardrobeDirection: 'Fur mantle, horn ridges, scaled shoulders, leather saddle harness, clawed feet.',
          propsSignatureItems: '',
          characterRenderStyle: 'stylized_realism',
        },
        expectedLabels: ['Fur Pattern', 'Horn / Scale Texture', 'Paw / Claw Construction'],
        forbiddenLabels: /Polished Shoe|Tech Jacket|Tailored Jacket/i,
      },
      {
        name: 'robot',
        input: {
          characterName: 'Unit Vale',
          worldEra: 'industrial robot city',
          wardrobeDirection: 'Mech faceplate, chest power core, metal panel seams, joint assembly, composite feet.',
          propsSignatureItems: '',
          characterRenderStyle: 'graphic_novel',
        },
        expectedLabels: ['Faceplate Design', 'Panel Seam', 'Hard-Surface Finish', 'Foot / Joint Assembly'],
        forbiddenLabels: /Leather Grain|Fabric Drape|Sandal/i,
      },
    ];

    for (const testCase of cases) {
      const callouts = buildPitchSheetCallouts(buildInput(testCase.input));
      const labels = callouts.map(callout => callout.label);

      for (const expected of testCase.expectedLabels) {
        expect(labels, testCase.name).toContain(expected);
      }

      expect(callouts.length, testCase.name).toBeGreaterThanOrEqual(5);
      expect(callouts.length, testCase.name).toBeLessThanOrEqual(7);
      expect(labels.join(' '), testCase.name).not.toMatch(/NanoCast|biometric|source image|reference image|Image 1|Image 2|Image 3|prompt engine|generated image|debug/i);

      if (testCase.forbiddenLabels) {
        expect(labels.join(' '), testCase.name).not.toMatch(testCase.forbiddenLabels);
      }
    }
  });

  it('keeps footwear, prop, material, and performance callouts aimed at the correct target categories', () => {
    const callouts = buildPitchSheetCallouts(buildInput({
      worldEra: 'modern adventure film',
      wardrobeDirection: 'Canvas field jacket, leather belt, metal buckle, hiking boots.',
      propsSignatureItems: 'field journal, compass',
      performanceDirection: 'watchful stance with guarded hand gesture',
    }));

    const footwear = callouts.find(callout => callout.category === 'footwear');
    const prop = callouts.find(callout => callout.category === 'prop');
    const leather = callouts.find(callout => callout.label === 'Leather Grain');
    const performance = callouts.find(callout => callout.category === 'performance');

    expect(footwear?.target).toMatch(/boot|footwear/i);
    expect(prop?.target).toMatch(/field journal|prop inset/i);
    expect(leather?.target).toMatch(/leather/i);
    expect(performance?.target).toMatch(/expression|stance|gesture|pose/i);
  });

  it('prevents uploaded source-photo backgrounds from appearing in head-study panels', () => {
    const prompt = buildCharacterPitchSheetPrompt(buildInput({
      identitySource: 'portrait_reference',
      referenceImageUrl: 'data:image/png;base64,portrait',
      sourcePanelMode: 'costume_matched',
    }));

    expect(prompt).toContain('HEADSHOT / REFERENCE PORTRAIT BACKGROUND ISOLATION');
    expect(prompt).toContain("Use uploaded portraits only as identity references for the subject's face");
    expect(prompt).toContain('Do not copy or preserve any uploaded portrait background.');
    expect(prompt).toContain('clean neutral studio background');
    expect(prompt).toContain('HEADSHOT BACKGROUND NEGATIVE EXCLUSIONS');
    expect(prompt).toContain('source image background, bedroom, hallway, door frame, wall corner, window, furniture');
    expect(prompt).toContain('Head-study panels must use the sheet');
  });

  it('keeps premium board quality first while preserving actor-based identity', () => {
    const prompt = buildCharacterPitchSheetPrompt(buildInput({
      identitySource: 'biometric_multiview',
      referenceImages: [
        { angle: 'center', imageUrl: 'data:image/png;base64,center' },
        { angle: 'left', imageUrl: 'data:image/png;base64,left' },
        { angle: 'right', imageUrl: 'data:image/png;base64,right' },
        { angle: 'up', imageUrl: 'data:image/png;base64,up' },
        { angle: 'down', imageUrl: 'data:image/png;base64,down' },
      ],
      characterRenderStyle: 'anime_manga',
    }));

    expect(prompt).toContain('PROMPT PRIORITY ORDER');
    expect(prompt.indexOf('1. Premium cinematic board quality.')).toBeLessThan(prompt.indexOf('2. One consistent actor-based identity.'));
    expect(prompt).toContain('AUTHORITATIVE IDENTITY CONTRACT');
    expect(prompt).toContain('the original multi-view biometric source image set');
    expect(prompt).toContain('Do not substitute a similar-looking person.');
    expect(prompt).toContain('Preserve facial proportions, brow shape, eye spacing, nose bridge and tip shape');
    expect(prompt).toContain('Render style may change the presentation only, not the identity.');
  });

  it('keeps biometric realism concise and avoids heavy realism constraint blocks', () => {
    const prompt = buildCharacterPitchSheetPrompt(buildInput({
      identitySource: 'biometric_multiview',
      sourcePanelMode: 'costume_matched',
      referenceImages: [
        { angle: 'center', imageUrl: 'data:image/png;base64,center' },
        { angle: 'left', imageUrl: 'data:image/png;base64,left' },
        { angle: 'right', imageUrl: 'data:image/png;base64,right' },
      ],
      characterRenderStyle: 'biometric_realism',
      heightIn: 72,
      weightLbs: 205,
      build: 'broad shouldered',
    }));

    expect(prompt).toContain('Biometric Realism: Realistic actor-based character design sheet.');
    expect(prompt).toContain('Use face references for likeness.');
    expect(prompt).toContain('No illustration or generic substitute casting.');
    expect(prompt).not.toContain('BIOMETRIC REALISM CONTRACT');
    expect(prompt).not.toContain('REALISM MODE IDENTITY PRIORITY');
    expect(prompt).not.toContain('REALISM NEGATIVE CONSTRAINTS');
    expect(prompt).not.toContain('REALISM HEAD STUDY RULE');
    expect(prompt).not.toContain('FULL-BODY LIKENESS RULE');
    expect(prompt).not.toContain('COSTUME MATCHED IDENTITY RULE');
    expect(prompt).toContain('height: 6\'0"; build/body: 6\'0", 205 lb');
  });

  it('keeps cinematic photoreal concise and board-forward', () => {
    const prompt = buildCharacterPitchSheetPrompt(buildInput({
      identitySource: 'biometric_multiview',
      referenceImages: [
        { angle: 'center', imageUrl: 'data:image/png;base64,center' },
        { angle: 'left', imageUrl: 'data:image/png;base64,left' },
        { angle: 'right', imageUrl: 'data:image/png;base64,right' },
      ],
      characterRenderStyle: 'cinematic_photoreal',
    }));

    expect(prompt).toContain('Cinematic Photoreal: Premium film-grade character design board.');
    expect(prompt).toContain('Realistic actor-based likeness, cinematic lighting, believable wardrobe, strong production presentation.');
    expect(prompt).toContain('Do not turn into a plain corporate reference sheet.');
    expect(prompt).not.toContain('CINEMATIC PHOTOREAL CONTRACT');
    expect(prompt).not.toContain('REALISM MODE IDENTITY PRIORITY');
    expect(prompt).not.toContain('REALISM NEGATIVE CONSTRAINTS');
  });
});
