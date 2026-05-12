import { describe, expect, it } from 'vitest';
import {
  buildPoseCoherenceCorrectionPrompt,
  buildPoseCoherenceValidationPrompt,
  buildTurnaroundPoseCoherenceContract,
  buildTurnaroundViewDefinitionContract,
  getTurnaroundPanelOrientations,
  parsePoseCoherenceValidation
} from '../../../prompts/poseCoherence';

describe('pose coherence head-axis lock', () => {
  it('adds strict head orientation rules to turnaround panel maps', () => {
    const contract = buildTurnaroundPoseCoherenceContract([
      { label: 'front panel', viewAngle: 'front', degrees: 0, bodyFacing: 'front-facing unified axis' },
      { label: 'profile panel', viewAngle: 'left_profile', degrees: 90, bodyFacing: 'true side profile axis' },
      { label: 'back panel', viewAngle: 'back', degrees: 180, bodyFacing: 'rear-facing unified axis' }
    ]);

    expect(contract).toContain('HEAD ORIENTATION CONTRACT (HEAD AXIS LOCK)');
    expect(contract).toContain('headFacing: straight front-facing head');
    expect(contract).toContain('headFacing: true 90-degree left side profile head');
    expect(contract).toContain('headFacing: back of head only, no front facial features');
    expect(contract).toContain('profile body with a 3/4 head');
    expect(contract).toContain('neck, skull, jaw, nose direction, and facial plane');
  });

  it('asks validation to reject head-angle drift separately from body-axis drift', () => {
    const prompt = buildPoseCoherenceValidationPrompt({
      viewAngle: 'left_profile',
      bodyFacing: 'true 90-degree side profile axis',
      headTurnAllowed: false,
      profileStrictness: 'technical',
      angleTolerance: 'tight'
    }, 'LEFT PROFILE PANEL: strict 90-degree side view.');

    expect(prompt).toContain('"headCoherent": true');
    expect(prompt).toContain('90-degree side/profile panel with a 3/4 head');
    expect(prompt).toContain('Prompt context containing panel/view requirements');

    const parsed = parsePoseCoherenceValidation(JSON.stringify({
      poseCoherent: true,
      headCoherent: false,
      requiresRetry: true,
      confidence: 0.82,
      headFacing: '3/4 toward camera',
      intendedHeadFacing: 'true profile',
      headBodyAlignment: 'body profile, head 3/4',
      headIssueSummary: 'head drifted from profile into 3/4'
    }));

    expect(parsed.poseCoherent).toBe(true);
    expect(parsed.headCoherent).toBe(false);
    expect(parsed.requiresRetry).toBe(true);
    expect(parsed.headIssueSummary).toContain('3/4');
  });

  it('adds stricter head-axis retry language when correcting a failed render', () => {
    const retryPrompt = buildPoseCoherenceCorrectionPrompt(
      'Create a reference sheet with a left profile panel.',
      {
        poseCoherent: true,
        headCoherent: false,
        requiresRetry: true,
        confidence: 0.9,
        headIssueSummary: 'profile body but head turned toward camera'
      },
      { viewAngle: 'left_profile', headTurnAllowed: false }
    );

    expect(retryPrompt).toContain('head-angle drift');
    expect(retryPrompt).toContain('HEAD ORIENTATION CONTRACT (HEAD AXIS LOCK)');
    expect(retryPrompt).toContain('true 90-degree left side profile head');
    expect(retryPrompt).toContain('profileStrictness: technical');
  });

  it('defines FB as true front plus true back only', () => {
    const contract = buildTurnaroundViewDefinitionContract('FRONT_BACK');

    expect(contract).toContain('TURNAROUND MODE CONTRACT: FRONT_BACK');
    expect(contract).toContain('true straight-on front-facing full-body view');
    expect(contract).toContain('true rear full-body view');
    expect(contract).toContain('Back view must not leak front facial features');
    expect(contract).toContain('Internal view tags must remain explicit: front, back, left_profile, right_profile');
  });

  it('defines LR as true left profile plus reinforced true right profile', () => {
    const contract = buildTurnaroundViewDefinitionContract('LEFT_RIGHT');

    expect(contract).toContain('TURNAROUND MODE CONTRACT: LEFT_RIGHT');
    expect(contract).toContain('true anatomical left-side full-body profile');
    expect(contract).toContain('true anatomical right-side full-body profile');
    expect(contract).toContain('RIGHT PROFILE ENFORCEMENT');
    expect(contract).toContain("subject's actual right side");
    expect(contract).toContain('The left and right profiles must face opposite directions');
    expect(contract).toContain('The right profile must not face the same direction as the left profile');
    expect(contract).toContain('Do not create a near-front, front-biased, 3/4 right');
  });

  it('exposes strict internal view tags for LR prompt assembly', () => {
    const orientations = getTurnaroundPanelOrientations('LEFT_RIGHT');
    const prompt = buildTurnaroundPoseCoherenceContract(orientations);

    expect(orientations.map((orientation) => orientation.viewAngle)).toEqual([
      'left_profile',
      'right_profile'
    ]);
    expect(prompt).toContain('left profile view: 90 degrees');
    expect(prompt).toContain('right profile view: 270 degrees');
    expect(prompt).toContain('true 90-degree right side profile head');
    expect(prompt).toContain('facial plane must all obey this assigned panel axis');
  });
});
