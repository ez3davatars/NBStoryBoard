import { describe, expect, it } from 'vitest';
import {
  buildTryOnIdentityAnchorReferenceLabel,
  buildTryOnLrFullBodyAxisLockBlock,
  buildWardrobeTryOnSourceLockBlock
} from '../wardrobeTryOnSourceLocks';

describe('wardrobe try-on source locks', () => {
  it('labels selected-subject anchors as manual subject locks', () => {
    const label = buildTryOnIdentityAnchorReferenceLabel(
      'Image C ([IMAGE 3])',
      'selected-subject'
    );

    expect(label).toContain('Manual Selected Subject Identity Anchor');
    expect(label).toContain('current selected subject image');
    expect(label).toContain('body-silhouette');
  });

  it('forbids random wearer and same-category costume redesigns in turnaround source locks', () => {
    const block = buildWardrobeTryOnSourceLockBlock({
      subjectImageRole: 'Image A ([IMAGE 1])',
      costumeImageRole: 'Image B ([IMAGE 2])',
      identityAnchorImageRole: 'Image C ([IMAGE 3])',
      identityAnchorSource: 'selected-subject',
      mode: 'turnaround'
    });

    expect(block).toContain('hard visual anchors');
    expect(block).toContain('Do not generate a random actor');
    expect(block).toContain('Do not generate a same-category redesign');
    expect(block).toContain('was loaded with Use Selected Subject');
    expect(block).toContain('Turnaround views must rotate the same selected subject wearing the same selected wardrobe');
  });

  it('defines LR panels as full-body side axes instead of head-only turns', () => {
    const block = buildTryOnLrFullBodyAxisLockBlock();

    expect(block).toContain('full-body side profiles');
    expect(block).toContain('the entire body faces screen-right');
    expect(block).toContain('the entire body faces screen-left');
    expect(block).toContain('face is profile but the chest plate');
    expect(block).toContain('3/4 fashion angle');
    expect(block).toContain('Do not favor face visibility over body-axis accuracy');
  });
});
