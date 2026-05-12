import { describe, expect, it } from 'vitest';

import {
  buildPitchSheetCallouts,
  buildCharacterPitchSheetPrompt,
  defaultCharacterPitchSheetInput,
  sanitizeVisibleBoardLanguage,
  type CharacterPitchSheetRenderStyle,
  type CharacterPitchSheetInput,
} from '../../../prompts/characterPitchSheetPrompts';
import { SHEET_STYLE_LOCK_NEGATIVE_TEXT, withSheetStyleLockContract } from '../../../prompts/sheetStyleLock';
import { buildStyleCorrectionPrompt, buildStyleValidationPrompt } from '../../../prompts/styleContracts';

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
      'exact_studio',
      'photorealism',
      'dslr_capture',
      'stylized_realism',
      'animated_feature',
      'family_3d',
      'pixar',
      'claymation',
      'editorial_illustration',
      'concept_art',
      'retro_cel',
      'retro_anime',
      'comic_book',
      'graphic_novel',
      'graphic_noir',
      'anime_manga',
      'cyberpunk_neon',
      'cyberpunk',
      'no_specific_style',
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
      expect(prompt).toContain('Style affects rendering language only.');
      expect(prompt).toContain('It must not change skull shape, face structure, hairline, eyes, brows, nose, mouth, jaw, facial asymmetry, age impression, body type, costume package, footwear, props, or world/era unless the user explicitly requests that.');
      expect(prompt).toContain('Source images are the identity authority when supplied.');
      expect(prompt).toContain('If style and likeness conflict, likeness wins.');
      expect(prompt).toContain('Head studies must preserve the same exact subject, and turnaround figures must not use generic mannequin faces.');
      expect(prompt).toContain('Source panel mode must not weaken identity; it only controls whether source references are visible, hidden, or costume matched.');
      expect(prompt).toContain('costume');
      expect(prompt).toContain('footwear');
      expect(prompt).toContain('props');
      expect(prompt).toContain('world/era');

      if (characterRenderStyle.includes('_')) {
        const promptWithoutInternalStyleLock = prompt.replace(/SHEET STYLE LOCK:[\s\S]*?AUTHORITATIVE IDENTITY CONTRACT:/, 'AUTHORITATIVE IDENTITY CONTRACT:');
        expect(promptWithoutInternalStyleLock).not.toContain(characterRenderStyle);
      }
    }
  });

  it('maps render styles to concise active prompt language', () => {
    expect(buildCharacterPitchSheetPrompt(buildInput({
      characterRenderStyle: 'cinematic_photoreal',
    }))).toContain('Cinematic Photoreal: premium film-grade character board');

    expect(buildCharacterPitchSheetPrompt(buildInput({
      characterRenderStyle: 'exact_studio',
    }))).toContain('Exact Studio realism: clean professional studio lighting, accurate actor likeness');

    expect(buildCharacterPitchSheetPrompt(buildInput({
      characterRenderStyle: 'dslr_capture',
    }))).toContain('DSLR capture look: real camera portraiture');

    expect(buildCharacterPitchSheetPrompt(buildInput({
      characterRenderStyle: 'family_3d',
    }))).toContain('High-end family 3D animation style');

    expect(buildCharacterPitchSheetPrompt(buildInput({
      characterRenderStyle: 'retro_cel',
    }))).toContain('Retro cel animation style');

    expect(buildCharacterPitchSheetPrompt(buildInput({
      characterRenderStyle: 'cyberpunk_neon',
    }))).toContain('Cyberpunk neon style');

    const noSpecificStylePrompt = buildCharacterPitchSheetPrompt(buildInput({
      characterRenderStyle: 'no_specific_style',
    }));

    expect(noSpecificStylePrompt).toContain("No specific style override: follow the user's brief");
    expect(noSpecificStylePrompt).toContain('Preserve the exact source subject while translating only the rendering style.');
    expect(noSpecificStylePrompt).not.toContain('Active render style contract');
    expect(noSpecificStylePrompt).not.toContain('no_specific_style');
  });

  it('adds one sheet-level style lock that every pitch-sheet panel inherits', () => {
    const prompt = buildCharacterPitchSheetPrompt(buildInput({
      characterRenderStyle: 'family_3d',
      boardPresentationStyle: 'premium_film_board',
    }));

    expect(prompt).toContain('SHEET STYLE LOCK');
    expect(prompt).toContain('"style_lock"');
    expect(prompt).toContain('"style_family": "stylized_3D"');
    expect(prompt).toContain('"allow_mixed_styles": false');
    expect(prompt).toContain('hero full-body render: inherit style_family "stylized_3D" exactly.');
    expect(prompt).toContain('front head: inherit style_family "stylized_3D" exactly.');
    expect(prompt).toContain('3/4 head: inherit style_family "stylized_3D" exactly.');
    expect(prompt).toContain('side profile head: inherit style_family "stylized_3D" exactly.');
    expect(prompt).toContain('action pose / gesture study: inherit style_family "stylized_3D" exactly.');
    expect(prompt).toContain('footwear and material detail insets: inherit style_family "stylized_3D" exactly.');
    expect(prompt).toContain('annotations and callout presentation: inherit style_family "stylized_3D" exactly.');
    expect(prompt).toContain(SHEET_STYLE_LOCK_NEGATIVE_TEXT);
  });

  it('teaches the style validator and retry prompt to reject mixed-style sheets', () => {
    const prompt = buildCharacterPitchSheetPrompt(buildInput({
      characterRenderStyle: 'family_3d',
    }));
    const validationPrompt = buildStyleValidationPrompt(prompt, 'family_3d', {
      selectedStyleLabel: 'Family 3D Animation',
    });
    const correctionPrompt = buildStyleCorrectionPrompt(prompt, {
      styleCoherent: false,
      requiresRetry: true,
      confidence: 0.9,
      issueSummary: 'head studies drifted into flat illustration',
      driftTraits: ['flat illustration head studies'],
    }, 'family_3d', {
      selectedStyleLabel: 'Family 3D Animation',
    });

    expect(validationPrompt).toContain('Also evaluate sheet-level style consistency');
    expect(validationPrompt).toContain(SHEET_STYLE_LOCK_NEGATIVE_TEXT);
    expect(correctionPrompt).toContain('SHEET STYLE LOCK CORRECTION PASS');
    expect(correctionPrompt).toContain('Correct style only. Do not change character likeness, proportions, wardrobe, identity, pose, head angle, or callouts.');
    expect(correctionPrompt).toContain(SHEET_STYLE_LOCK_NEGATIVE_TEXT);
  });

  it('can centrally add a sheet style lock to future character-sheet prompts', () => {
    const prompt = withSheetStyleLockContract(
      'Create a character reference sheet with hero render, turnaround panels, head studies, action pose, and footwear detail.',
      'family_3d',
      {
        source: 'user_selected',
        selectedStyleLabel: 'Family 3D Animation',
      }
    );

    expect(prompt).toContain('SHEET STYLE LOCK');
    expect(prompt).toContain('"style_family": "stylized_3D"');
    expect(prompt).toContain('hero full-body render: inherit style_family "stylized_3D" exactly.');
    expect(prompt).toContain('footwear detail inset: inherit style_family "stylized_3D" exactly.');
    expect(prompt).toContain(SHEET_STYLE_LOCK_NEGATIVE_TEXT);
  });

  it('adds exact subject preservation language to app-library render style mappings', () => {
    const appLibraryStyles: CharacterPitchSheetRenderStyle[] = [
      'exact_studio',
      'photorealism',
      'dslr_capture',
      'family_3d',
      'pixar',
      'claymation',
      'retro_cel',
      'retro_anime',
      'comic_book',
      'graphic_noir',
      'cyberpunk_neon',
      'cyberpunk',
      'no_specific_style',
    ];

    for (const characterRenderStyle of appLibraryStyles) {
      const prompt = buildCharacterPitchSheetPrompt(buildInput({ characterRenderStyle }));

      expect(prompt).toContain('Preserve the exact source subject while translating only the rendering style.');
    }
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

    expect(prompt).toContain('Biometric Realism: realistic actor-based character design sheet');
    expect(prompt).toContain('face-reference likeness');
    expect(prompt).toContain('realistic skin, wardrobe, and materials');
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

    expect(prompt).toContain('Cinematic Photoreal: premium film-grade character board');
    expect(prompt).toContain('realistic actor-based likeness, cinematic lighting, believable wardrobe, strong production presentation');
    expect(prompt).not.toContain('CINEMATIC PHOTOREAL CONTRACT');
    expect(prompt).not.toContain('REALISM MODE IDENTITY PRIORITY');
    expect(prompt).not.toContain('REALISM NEGATIVE CONSTRAINTS');
  });
});
