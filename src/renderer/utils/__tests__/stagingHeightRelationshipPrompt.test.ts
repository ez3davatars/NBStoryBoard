import { describe, expect, it } from 'vitest';
import type { ReferenceSlot, StageAnnotation } from '../../context/AppContext';
import {
  HEIGHT_ANNOTATION_ARROW_GUIDE_PROMPT_TEXT,
  buildHeightRelationshipLockBlock,
  compileV3DirectorPrompt
} from '../promptHelpers';

describe('staging height relationship prompt lock', () => {
  it('omits the lock when no height relationship intent exists', () => {
    const block = buildHeightRelationshipLockBlock({
      notes: 'Two actors stand back to back in a clean lobby.'
    });

    expect(block).toBe('');
  });

  it('converts arrow height wording into a relational body-scale constraint', () => {
    const annotations: StageAnnotation[] = [
      {
        id: 'arrow-1',
        type: 'arrow',
        x: 100,
        y: 80,
        width: 120,
        height: 200,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        text: "Matt's height should reach the tip of the arrow",
        zIndex: 10
      }
    ];

    const block = buildHeightRelationshipLockBlock({ annotations });

    expect(block).toContain('HEIGHT RELATIONSHIP LOCK:');
    expect(block).toContain("Detected height instruction: \"Matt's height should reach the tip of the arrow\".");
    expect(block).toContain('Apply the detected height instruction as a relational body-scale constraint between the named staged actors.');
    expect(block).toContain('Keep both actors on the same floor plane.');
    expect(block).toContain(HEIGHT_ANNOTATION_ARROW_GUIDE_PROMPT_TEXT);
  });

  it('includes the lock in the compiled staging prompt when director text has height intent', () => {
    const prompt = compileV3DirectorPrompt(
      {
        prompt: '',
        aspectRatio: '16:9',
        resolution: '1K',
        qualityMode: 'Standard',
        safety: 'Standard',
        subject: 'Matt is taller than Erki while they stand side by side.',
        environment: 'Modern office lobby.',
        knowledge: '',
        lighting: '',
        camera: '',
        filmStock: '',
        textRender: '',
        textStyle: '',
        envAuto: false,
        mergeStrategy: 'Character Identity',
        replaceAnchorSubjects: false,
        globalReplaceTarget: '',
        spatialLayout: '',
        markerType: '',
        negativePrompt: '',
        sceneLock: false
      },
      [],
      []
    );

    expect(prompt).toContain('HEIGHT RELATIONSHIP LOCK:');
    expect(prompt).toContain('Matt is taller than Erki');
  });

  it('binds active reference stack slots to attached identity image labels', () => {
    const referenceSlots: ReferenceSlot[] = [
      {
        index: 1,
        url: 'data:image/png;base64,matty',
        name: 'Matty',
        analysis: 'Stands where the zone box is and points at Erki.',
        active: true,
        status: 'ready'
      }
    ];

    const prompt = compileV3DirectorPrompt(
      {
        prompt: '',
        aspectRatio: '16:9',
        resolution: '1K',
        qualityMode: 'Standard',
        safety: 'Standard',
        subject: 'Matty presents Erki.',
        environment: 'Modern office lobby.',
        knowledge: '',
        lighting: '',
        camera: '',
        filmStock: '',
        textRender: '',
        textStyle: '',
        envAuto: false,
        mergeStrategy: 'Character Identity',
        replaceAnchorSubjects: false,
        globalReplaceTarget: '',
        spatialLayout: '',
        markerType: '',
        negativePrompt: '',
        sceneLock: false
      },
      referenceSlots,
      []
    );

    expect(prompt).toContain('REFERENCE STACK IDENTITY SOURCES (HARD)');
    expect(prompt).toContain('REF_SLOT_1 (Matty) is attached as REFERENCE_1');
    expect(prompt).toContain('Do not invent a replacement actor or presenter');
  });
});
