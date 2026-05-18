import { describe, expect, it } from 'vitest';

import {
  buildPitchSheetCallouts,
  buildCharacterPitchSheetPrompt,
  defaultCharacterPitchSheetInput,
  inferProps,
  sanitizeVisibleBoardLanguage,
  type CharacterPitchSheetRenderStyle,
  type CharacterPitchSheetInput,
} from '../../../prompts/characterPitchSheetPrompts';
import { SHEET_STYLE_LOCK_NEGATIVE_TEXT, buildSheetStyleLockContract, withSheetStyleLockContract } from '../../../prompts/sheetStyleLock';
import { buildStyleCategoryContract, buildStyleCorrectionPrompt, buildStyleNegativePrompt, buildStyleValidationPrompt } from '../../../prompts/styleContracts';

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
    expect(prompt).toContain('CALLOUT TARGET ACCURACY RULE');
    expect(prompt).toContain('CALLOUT CATEGORY PLACEMENT RULE');
    expect(prompt).toContain('PROP CALLOUT RULE');
    expect(prompt).toContain('VISIBLE-ONLY CALLOUT RULE');
    expect(prompt).toContain('CALLOUT OMISSION RULE');
    expect(prompt).toContain('CALLOUT COUNT RULE');
    expect(prompt).toContain('WORLD / ERA CALLOUT VOCABULARY RULE');
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
      'premium_animated_3d',
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
      expect(prompt).toContain('CHARACTER ANATOMY INTEGRITY CONTRACT');
      expect(prompt).toContain('No extra forearms');
      expect(prompt).toContain('No spare arm emerging from torso or sleeve');
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

  it('uses trademark-safe premium animated 3D language and normalizes old saved style ids', () => {
    const oldBrandedStyleId = ['p', 'i', 'x', 'a', 'r'].join('');
    const prompt = buildCharacterPitchSheetPrompt(buildInput({
      characterRenderStyle: oldBrandedStyleId as CharacterPitchSheetRenderStyle,
    }));

    expect(prompt).toContain('Premium animated-feature 3D style');
    expect(prompt).toContain('expressive actor-based face');
    expect(prompt.toLowerCase()).not.toContain(oldBrandedStyleId);
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
    expect(prompt).toContain('color blocking / palette inset: inherit style_family "stylized_3D" exactly.');
    expect(prompt).toContain('any inset containing the character, body, head, hands, costume, or footwear: inherit style_family "stylized_3D" exactly.');
    expect(prompt).toContain('annotations and callout presentation: inherit style_family "stylized_3D" exactly.');
    expect(prompt).toContain(SHEET_STYLE_LOCK_NEGATIVE_TEXT);
  });

  it('maps claymation sheets to a tactile stop-motion style family', () => {
    const lock = buildSheetStyleLockContract('claymation', {
      source: 'user_selected',
      selectedStyleLabel: 'Claymation',
    });

    expect(lock).toContain('"style_family": "claymation_tactile"');
    expect(lock).toContain('tactile stop-motion / claymation character rendering');
    expect(lock).toContain('photographed miniature/puppet feel');
    expect(lock).toContain('visible handmade material response');
    expect(lock).not.toContain('"style_family": "toon_cartoon"');
  });

  it('hardens claymation prompts against premium animated 3D drift', () => {
    const prompt = buildCharacterPitchSheetPrompt(buildInput({
      characterRenderStyle: 'claymation',
      boardPresentationStyle: 'premium_film_board',
    }));
    const styleContract = buildStyleCategoryContract('claymation');
    const negativePrompt = buildStyleNegativePrompt('claymation');

    expect(prompt).toContain('Claymation / tactile stop-motion style: handcrafted sculpted character');
    expect(prompt).toContain('plasticine/clay material feel');
    expect(prompt).toContain('photographed miniature puppet presence');
    expect(prompt).toContain('visible hand-shaped surface irregularity');
    expect(prompt).toContain('Do not drift into premium animated-feature 3D, polished CG, or Pixar-like rendering.');
    expect(prompt).toContain('"style_family": "claymation_tactile"');
    expect(prompt).toContain('STRICT CLAYMATION STYLE LOCK');
    expect(prompt).toContain('Every panel containing the character must read as the same tactile stop-motion / claymation rendering family.');
    expect(prompt).toContain('Preserve actor likeness, but translate it into clay/plasticine form.');
    expect(prompt).toContain('Do not render the character as premium animated-feature 3D, family CG, sleek stylized 3D, Pixar-like CG, or polished modern animation.');
    expect(prompt).toContain('No premium animated 3D drift. No Pixar-like CG drift. No family-animation gloss. No polished sleek CG skin.');
    expect(prompt).not.toContain('"style_family": "toon_cartoon"');
    expect(prompt).not.toContain('subtle clay-like surface texture');

    expect(styleContract).toContain('tactile stop-motion clay character');
    expect(styleContract).toContain('plasticine / clay material feel');
    expect(styleContract).toContain('photographed miniature puppet presence');
    expect(styleContract).toContain('clear separation from polished premium CG');
    expect(styleContract).toContain('Pixar-like polished 3D');
    expect(styleContract).toContain('clean modern CG skin shading');
    expect(styleContract).toContain('The result does not read as premium animated-feature 3D.');
    expect(negativePrompt).toContain('Pixar-like');
    expect(negativePrompt).toContain('premium animated 3D');
    expect(negativePrompt).toContain('polished family 3D');
    expect(negativePrompt).toContain('sleek CG character');
  });

  it('does not infer signature props or weaponized gear when props are blank', () => {
    const input = buildInput({
      characterRenderStyle: 'dslr_capture',
      boardPresentationStyle: 'premium_film_board',
      build: 'athletic, 195 lbs',
      propsSignatureItems: '',
      wardrobeDirection: 'Modern jacket, plain shirt, fitted trousers, practical shoes.',
      worldEra: 'Contemporary drama',
    });
    const prompt = buildCharacterPitchSheetPrompt(input);

    expect(inferProps(input)).toBe('');
    expect(prompt).toContain('Props and signature items: No signature props specified.');
    expect(prompt).toContain('WEAPON / PROP SAFETY RULE');
    expect(prompt).toContain('Do not invent weapons, combat props, tactical gear, holsters, utility rigs, armor, shields, or action accessories');
    expect(prompt).toContain('If no props are specified, do not add a weapon.');
    expect(prompt).toContain('Do not invent weapons, combat poses, or combat props.');
    expect(prompt).toContain('Do not invent armor, tactical harnesses, bags, straps, holsters, prop attachment points, or weapons');
    expect(prompt).not.toContain('One or two signature items inferred');
    expect(prompt).not.toContain('Props and signature items: One or two');
  });

  it('adds a strict rendered-family lock for DSLR capture pitch sheets', () => {
    const prompt = buildCharacterPitchSheetPrompt(buildInput({
      characterRenderStyle: 'dslr_capture',
      boardPresentationStyle: 'premium_film_board',
      propsSignatureItems: '',
    }));

    expect(prompt).toContain('STRICT RENDERED FAMILY LOCK');
    expect(prompt).toContain('Hero portrait, turnaround figures, head studies, expression study, and gesture study must all look like the same rendering family.');
    expect(prompt).toContain('Do not switch secondary panels into concept art, painted concept sheet style, comic style, cel style, line-art model sheet style, diagram style, flat-color character thumbnail style, or semi-illustrated board style.');
    expect(prompt).toContain('For DSLR Capture, all character-containing panels must read as DSLR-style rendered imagery, not drawn or painted concept art.');
    expect(prompt).toContain('CHARACTER PANEL STYLE PURITY');
    expect(prompt).toContain('Board presentation style may affect layout and typography only.');
    expect(prompt).toContain('Premium film-board presentation is a layout treatment, not permission to mix rendering families.');
  });

  it('forbids off-style flat color-blocking character thumbnails', () => {
    const prompt = buildCharacterPitchSheetPrompt(buildInput({
      characterRenderStyle: 'premium_animated_3d',
      wardrobeDirection: 'Black polo, dark trousers, polished shoes.',
      materialCostumeNotes: 'Simple black fabric with subtle color blocking and collar construction.',
    }));

    expect(prompt).toContain('STYLE-LOCKED INSET RULE');
    expect(prompt).toContain('Do not generate "Character Color Blocking" or any palette panel as flat 2D/vector/cartoon miniature character drawings');
    expect(prompt).toContain('Color-blocking information should appear as material swatches, palette chips, or cropped costume/material details.');
    expect(prompt).toContain('No flat color-blocking character miniatures');
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
      'premium_animated_3d',
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
        expectedLabels: ['Tailored Jacket', 'Shirt Collar Construction', 'Leather Grain', 'Polished Shoe Construction', 'Tablet Prop'],
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
        expectedLabels: ['Reinforced Tech Jacket', 'Utility Harness', 'Synthetic Material Finish', 'Tactical Boot Construction', 'Wrist Projector'],
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
      expect(labels.join(' '), testCase.name).not.toMatch(/\b(Construction Detail|Material Read|Design Detail|Object Detail|Accessory Detail|Primary Garment|Primary Material Swatch)\b/i);

      if (testCase.forbiddenLabels) {
        expect(labels.join(' '), testCase.name).not.toMatch(testCase.forbiddenLabels);
      }
    }
  });

  it('keeps footwear, prop, material, and performance callouts aimed at the correct target categories', () => {
    const callouts = buildPitchSheetCallouts(buildInput({
      worldEra: 'modern adventure film',
      wardrobeDirection: 'Canvas field jacket, leather belt, metal buckle, hiking boots.',
      propsSignatureItems: 'field journal, folded map',
      performanceDirection: 'watchful stance with guarded hand gesture',
    }));

    const footwear = callouts.find(callout => callout.category === 'footwear');
    const prop = callouts.find(callout => callout.category === 'prop');
    const leather = callouts.find(callout => callout.label === 'Leather Grain');
    const performance = callouts.find(callout => callout.category === 'performance');

    expect(footwear?.target).toMatch(/boot|footwear/i);
    expect(prop?.label).toBe('Field Journal');
    expect(prop?.target).toMatch(/field journal|prop inset/i);
    expect(prop?.placementHint).toMatch(/never to face|body|clothing|empty space/i);
    expect(leather?.target).toMatch(/leather/i);
    expect(performance?.target).toMatch(/expression|stance|gesture|pose/i);
  });

  it('keeps controlled callout plans specific and omits vague fallback labels', () => {
    const callouts = buildPitchSheetCallouts(buildInput({
      worldEra: 'modern adventure film',
      wardrobeDirection: 'Canvas field jacket with visible pocket flaps, layered shirt, rugged boots, leather map case.',
      propsSignatureItems: 'map case',
      materialCostumeNotes: 'Canvas weave, aged leather pouch, folded map case.',
    }));
    const prompt = buildCharacterPitchSheetPrompt(buildInput({
      worldEra: 'modern adventure film',
      wardrobeDirection: 'Canvas field jacket with visible pocket flaps, layered shirt, rugged boots, leather map case.',
      propsSignatureItems: 'map case',
      materialCostumeNotes: 'Canvas weave, aged leather pouch, folded map case.',
    }));
    const labels = callouts.map(callout => callout.label);

    expect(labels).toContain('Field Jacket');
    expect(labels).toContain('Map Case');
    expect(labels.join(' ')).not.toMatch(/\b(Construction Detail|Material Read|Design Detail|Object Detail|Accessory Detail|Primary Garment|Primary Material Swatch)\b/i);
    expect(prompt).toContain('Every callout arrow must point directly to the exact visible object');
    expect(prompt).toContain('Do not point a prop label to a face, body part, or garment.');
    expect(prompt).toContain('Do not label a face, profile, head, body, garment, or background area as a prop or prop construction detail.');
    expect(prompt).toContain('It is better to have 4 correct callouts than 8 inaccurate ones.');
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

  it('treats 200 lb as board metadata instead of recasting biometric plus character pitch sheets', () => {
    const prompt = buildCharacterPitchSheetPrompt(buildInput({
      identitySource: 'biometric_plus_character',
      characterStyleReferenceUrl: 'data:image/png;base64,character',
      referenceImages: [
        { angle: 'center', imageUrl: 'data:image/png;base64,center' },
        { angle: 'left', imageUrl: 'data:image/png;base64,left' },
        { angle: 'right', imageUrl: 'data:image/png;base64,right' },
      ],
      build: 'athletic, 200 lbs',
      weightLbs: 200,
      physiquePriority: 'match_face_impression',
    }));

    expect(prompt).toContain('Structured height/build/weight values are metadata and subtle fit guidance only');
    expect(prompt).toContain('must not override biometric identity');
    expect(prompt).toContain('Weight/build metadata must not recast the actor');
    expect(prompt).toContain('Numeric weight values are metadata');
    expect(prompt).toContain('build/body metadata: 200 lb');
    expect(prompt).toContain('Body guide: athletic.');
    expect(prompt).not.toContain('Body guide: 200 lb.');
    expect(prompt).not.toContain('unless explicit structured UI values override them');
    expect(prompt).not.toContain('single source of truth for character name, codename, visual age, height, build, and body settings');
  });

  it('uses the same identity-safe body authority for 195 lb and 200 lb metadata', () => {
    const buildWeightedPrompt = (weightLbs: number) => buildCharacterPitchSheetPrompt(buildInput({
      identitySource: 'biometric_plus_character',
      characterStyleReferenceUrl: 'data:image/png;base64,character',
      referenceImages: [
        { angle: 'center', imageUrl: 'data:image/png;base64,center' },
        { angle: 'left', imageUrl: 'data:image/png;base64,left' },
        { angle: 'right', imageUrl: 'data:image/png;base64,right' },
      ],
      build: `athletic, ${weightLbs} lbs`,
      weightLbs,
      physiquePriority: 'match_face_impression',
    }));
    const prompt195 = buildWeightedPrompt(195);
    const prompt200 = buildWeightedPrompt(200);
    const authorityRule = "Image A is the body, outfit, silhouette, costume, stance, and proportion authority. Structured height/build/weight values are metadata and subtle fit guidance only";

    expect(prompt195).toContain(authorityRule);
    expect(prompt200).toContain(authorityRule);
    expect(prompt195).toContain('Body guide: athletic.');
    expect(prompt200).toContain('Body guide: athletic.');
    expect(prompt195).not.toContain('Body guide: 195 lb.');
    expect(prompt200).not.toContain('Body guide: 200 lb.');
  });

  it('allows strict body specs as controlled proportional guidance without changing actor identity', () => {
    const prompt = buildCharacterPitchSheetPrompt(buildInput({
      identitySource: 'biometric_plus_character',
      characterStyleReferenceUrl: 'data:image/png;base64,character',
      referenceImages: [
        { angle: 'center', imageUrl: 'data:image/png;base64,center' },
        { angle: 'left', imageUrl: 'data:image/png;base64,left' },
        { angle: 'right', imageUrl: 'data:image/png;base64,right' },
      ],
      build: 'athletic, 200 lbs',
      weightLbs: 200,
      physiquePriority: 'strict_body_specs',
    }));

    expect(prompt).toContain('Apply structured body specs only as a controlled proportional adjustment');
    expect(prompt).toContain('do not recast the actor, change the face, change the head, change the age impression');
    expect(prompt).toContain('Because strict body specs is enabled, apply body specs more directly, but still preserve the same actor identity, same face, same head, same age impression, and same character source.');
    expect(prompt).toContain('Body guide: 200 lb.');
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
    expect(prompt).toContain('height: 6\'0"; build/body metadata: 6\'0", 205 lb');
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
