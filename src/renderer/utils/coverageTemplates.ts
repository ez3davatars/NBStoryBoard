import type { CoverageSceneType, CoverageTemplate } from '../types/shots';

export const COVERAGE_TEMPLATES: Record<CoverageSceneType, CoverageTemplate> = {
  courtroom: {
    sceneType: 'courtroom',
    label: 'Courtroom Drama',
    shots4: [
      { presetId: 'wide', purpose: 'establishing wide of courtroom' },
      { presetId: 'medium', purpose: 'judge medium', targetRole: 'judge' },
      { presetId: 'medium', purpose: 'defendant/counsel medium', targetRole: 'defendant' },
      { presetId: 'closeup', purpose: 'reaction close-up on one side' }
    ],
    shots6: [
      { presetId: 'wide', purpose: 'establishing wide of courtroom' },
      { presetId: 'closeup', purpose: 'judge close-up', targetRole: 'judge' },
      { presetId: 'medium', purpose: 'defendant/counsel medium', targetRole: 'defendant' },
      { presetId: 'medium', purpose: 'side two-shot exchange' },
      { presetId: 'closeup', purpose: 'reaction close-up on one side' },
      { presetId: 'profile', purpose: 'profile exchange shot' }
    ],
    shots9: [
      { presetId: 'wide', purpose: 'establishing wide of courtroom' },
      { presetId: 'closeup', purpose: 'judge close-up', targetRole: 'judge' },
      { presetId: 'medium', purpose: 'judge medium', targetRole: 'judge' },
      { presetId: 'medium', purpose: 'defendant/counsel medium', targetRole: 'defendant' },
      { presetId: 'medium', purpose: 'side two-shot exchange' },
      { presetId: 'closeup', purpose: 'reaction close-up on one side' },
      { presetId: 'medium', purpose: 'reverse medium on opposing side' },
      { presetId: 'profile', purpose: 'profile exchange shot' },
      { presetId: 'wide', purpose: 'procedural wide with bench and standing figures' }
    ]
  },
  action: {
    sceneType: 'action',
    label: 'Action / Thriller',
    shots4: [
      { presetId: 'wide', purpose: 'geography wide' },
      { presetId: 'medium', purpose: 'hero medium', targetRole: 'hero' },
      { presetId: 'closeup', purpose: 'impact close-up' },
      { presetId: 'lowAngleHero', purpose: 'low kinetic angle' }
    ],
    shots6: [
      { presetId: 'wide', purpose: 'geography wide' },
      { presetId: 'medium', purpose: 'hero medium', targetRole: 'hero' },
      { presetId: 'closeup', purpose: 'impact close-up' },
      { presetId: 'medium', purpose: 'pursuit medium-wide' },
      { presetId: 'lowAngleHero', purpose: 'low kinetic angle' },
      { presetId: 'wide', purpose: 'aftermath wide' }
    ],
    shots9: [
      { presetId: 'wide', purpose: 'geography wide' },
      { presetId: 'medium', purpose: 'hero medium', targetRole: 'hero' },
      { presetId: 'closeup', purpose: 'impact close-up' },
      { presetId: 'medium', purpose: 'pursuit medium-wide' },
      { presetId: 'lowAngleHero', purpose: 'low kinetic angle' },
      { presetId: 'closeup', purpose: 'reaction close-up' },
      { presetId: 'wide', purpose: 'danger/environment shot' },
      { presetId: 'medium', purpose: 'confrontation two-shot' },
      { presetId: 'wide', purpose: 'aftermath wide' }
    ]
  },
  commercial: {
    sceneType: 'commercial',
    label: 'Commercial / Advertising',
    shots4: [
      { presetId: 'wide', purpose: 'clean hero wide' },
      { presetId: 'closeup', purpose: 'product/subject beauty close-up', targetRole: 'product' },
      { presetId: 'medium', purpose: 'medium lifestyle shot' },
      { presetId: 'medium', purpose: 'brand-friendly mid shot' }
    ],
    shots6: [
      { presetId: 'wide', purpose: 'clean hero wide' },
      { presetId: 'closeup', purpose: 'product/subject beauty close-up', targetRole: 'product' },
      { presetId: 'medium', purpose: 'medium lifestyle shot' },
      { presetId: 'closeup', purpose: 'detail insert' },
      { presetId: 'closeup', purpose: 'reaction/smile close-up' },
      { presetId: 'medium', purpose: 'final hero frame' }
    ],
    shots9: [
      { presetId: 'wide', purpose: 'clean hero wide' },
      { presetId: 'closeup', purpose: 'product/subject beauty close-up', targetRole: 'product' },
      { presetId: 'medium', purpose: 'medium lifestyle shot' },
      { presetId: 'closeup', purpose: 'detail insert' },
      { presetId: 'threeQuarterLeft', purpose: 'polished side angle' },
      { presetId: 'closeup', purpose: 'reaction/smile close-up' },
      { presetId: 'medium', purpose: 'brand-friendly mid shot' },
      { presetId: 'wide', purpose: 'contextual wide' },
      { presetId: 'medium', purpose: 'final hero frame' }
    ]
  },
  dialogue: {
    sceneType: 'dialogue',
    label: 'Intimate Dialogue',
    shots4: [
      { presetId: 'wide', purpose: 'establishing wide' },
      { presetId: 'medium', purpose: 'speaker A medium', targetRole: 'speaker' },
      { presetId: 'medium', purpose: 'speaker B medium' },
      { presetId: 'closeup', purpose: 'reaction close-up' }
    ],
    shots6: [
      { presetId: 'wide', purpose: 'establishing wide' },
      { presetId: 'medium', purpose: 'speaker A medium', targetRole: 'speaker' },
      { presetId: 'medium', purpose: 'speaker B medium' },
      { presetId: 'medium', purpose: 'over the shoulder' },
      { presetId: 'closeup', purpose: 'reaction close-up' },
      { presetId: 'medium', purpose: 'final two-shot' }
    ],
    shots9: [
      { presetId: 'wide', purpose: 'establishing wide' },
      { presetId: 'medium', purpose: 'speaker A medium', targetRole: 'speaker' },
      { presetId: 'medium', purpose: 'speaker B medium' },
      { presetId: 'medium', purpose: 'over the shoulder' },
      { presetId: 'closeup', purpose: 'reaction close-up' },
      { presetId: 'profile', purpose: 'profile exchange' },
      { presetId: 'closeup', purpose: 'tight close-up' },
      { presetId: 'highAngle', purpose: 'high angle observer' },
      { presetId: 'medium', purpose: 'final two-shot' }
    ]
  },
  generic: {
    sceneType: 'generic',
    label: 'Standard Coverage',
    shots4: [
      { presetId: 'wide', purpose: 'establishing wide framing' },
      { presetId: 'medium', purpose: 'standard medium shot' },
      { presetId: 'closeup', purpose: 'standard close-up' },
      { presetId: 'threeQuarterLeft', purpose: 'dynamic three-quarter angle' }
    ],
    shots6: [
      { presetId: 'wide', purpose: 'establishing wide framing' },
      { presetId: 'medium', purpose: 'standard medium shot' },
      { presetId: 'closeup', purpose: 'standard close-up' },
      { presetId: 'threeQuarterLeft', purpose: 'dynamic three-quarter angle' },
      { presetId: 'profile', purpose: 'side profile variation' },
      { presetId: 'lowAngleHero', purpose: 'low heroic angle' }
    ],
    shots9: [
      { presetId: 'wide', purpose: 'establishing wide framing' },
      { presetId: 'mediumClose', purpose: 'medium close-up variation' },
      { presetId: 'medium', purpose: 'standard medium shot' },
      { presetId: 'profile', purpose: 'side profile variation' },
      { presetId: 'closeup', purpose: 'standard close-up' },
      { presetId: 'threeQuarterLeft', purpose: 'left three-quarter angle' },
      { presetId: 'threeQuarterRight', purpose: 'right three-quarter angle' },
      { presetId: 'lowAngleHero', purpose: 'low heroic angle' },
      { presetId: 'wide', purpose: 'final wide context' }
    ]
  },
  interview: {
    sceneType: 'interview',
    label: 'Interview',
    shots4: [
      { presetId: 'wide', purpose: 'room establishing wide' },
      { presetId: 'medium', purpose: 'subject medium portrait', targetRole: 'speaker' },
      { presetId: 'closeup', purpose: 'tight emotional close-up', targetRole: 'speaker' },
      { presetId: 'medium', purpose: 'interviewer over the shoulder' }
    ],
    shots6: [
      { presetId: 'wide', purpose: 'room establishing wide' },
      { presetId: 'medium', purpose: 'subject medium portrait', targetRole: 'speaker' },
      { presetId: 'mediumClose', purpose: 'subject punch-in medium close', targetRole: 'speaker' },
      { presetId: 'closeup', purpose: 'tight emotional close-up', targetRole: 'speaker' },
      { presetId: 'medium', purpose: 'interviewer over the shoulder' },
      { presetId: 'profile', purpose: 'side profile b-roll angle' }
    ],
    shots9: [
      { presetId: 'wide', purpose: 'room establishing wide' },
      { presetId: 'medium', purpose: 'subject medium portrait', targetRole: 'speaker' },
      { presetId: 'mediumClose', purpose: 'subject punch-in medium close', targetRole: 'speaker' },
      { presetId: 'closeup', purpose: 'tight emotional close-up', targetRole: 'speaker' },
      { presetId: 'medium', purpose: 'interviewer over the shoulder' },
      { presetId: 'profile', purpose: 'side profile b-roll angle' },
      { presetId: 'threeQuarterLeft', purpose: 'dynamic alternative angle' },
      { presetId: 'medium', purpose: 'reaction shot of interviewer' },
      { presetId: 'wide', purpose: 'final concluding wide' }
    ]
  },
  fashion: {
    sceneType: 'fashion',
    label: 'Fashion Editorial',
    shots4: [
      { presetId: 'wide', purpose: 'full body fashion wide' },
      { presetId: 'medium', purpose: 'torso and garment medium' },
      { presetId: 'closeup', purpose: 'accessory/fabric close-up' },
      { presetId: 'lowAngleHero', purpose: 'low angle fashion pose' }
    ],
    shots6: [
      { presetId: 'wide', purpose: 'full body fashion wide' },
      { presetId: 'medium', purpose: 'torso and garment medium' },
      { presetId: 'closeup', purpose: 'accessory/fabric close-up' },
      { presetId: 'lowAngleHero', purpose: 'low angle fashion pose' },
      { presetId: 'threeQuarterLeft', purpose: 'dynamic runway angle' },
      { presetId: 'closeup', purpose: 'beauty portrait close-up' }
    ],
    shots9: [
      { presetId: 'wide', purpose: 'full body fashion wide' },
      { presetId: 'wide', purpose: 'environmental fashion context' },
      { presetId: 'medium', purpose: 'torso and garment medium' },
      { presetId: 'mediumClose', purpose: 'upper body portrait' },
      { presetId: 'closeup', purpose: 'accessory/fabric close-up' },
      { presetId: 'lowAngleHero', purpose: 'low angle fashion pose' },
      { presetId: 'threeQuarterLeft', purpose: 'dynamic runway angle' },
      { presetId: 'profile', purpose: 'side silhouette' },
      { presetId: 'closeup', purpose: 'beauty portrait close-up' }
    ]
  },
  office: {
    sceneType: 'office',
    label: 'Corporate / Office',
    shots4: [
      { presetId: 'wide', purpose: 'office scene establishing wide' },
      { presetId: 'medium', purpose: 'boardroom/desk medium' },
      { presetId: 'mediumClose', purpose: 'coworker exchange' },
      { presetId: 'closeup', purpose: 'working detail close-up' }
    ],
    shots6: [
      { presetId: 'wide', purpose: 'office scene establishing wide' },
      { presetId: 'medium', purpose: 'boardroom/desk medium' },
      { presetId: 'mediumClose', purpose: 'coworker exchange' },
      { presetId: 'closeup', purpose: 'working detail close-up' },
      { presetId: 'profile', purpose: 'side angle conversation' },
      { presetId: 'medium', purpose: 'corporate hero shot' }
    ],
    shots9: [
      { presetId: 'wide', purpose: 'office scene establishing wide' },
      { presetId: 'wide', purpose: 'team dynamic wide' },
      { presetId: 'medium', purpose: 'boardroom/desk medium' },
      { presetId: 'mediumClose', purpose: 'coworker exchange' },
      { presetId: 'closeup', purpose: 'working detail close-up' },
      { presetId: 'profile', purpose: 'side angle conversation' },
      { presetId: 'threeQuarterLeft', purpose: 'collaborative group angle' },
      { presetId: 'closeup', purpose: 'listening reaction shot' },
      { presetId: 'medium', purpose: 'corporate hero shot' }
    ]
  }
};
