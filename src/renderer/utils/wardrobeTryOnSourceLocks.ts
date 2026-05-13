export type TryOnIdentityAnchorSource = 'upload' | 'selected-subject';

export const buildTryOnIdentityAnchorReferenceLabel = (
  imageRole: string,
  source: TryOnIdentityAnchorSource | null
): string => {
  if (source === 'selected-subject') {
    return `${imageRole} - Manual Selected Subject Identity Anchor: the current selected subject image, used as a hard identity, hair, grooming, body-silhouette, and source-style lock. Not a new character prompt and not a loose style reference.`;
  }

  return `${imageRole} - Character Sheet Identity Anchor: face/head identity reference only, not output format, layout, body source, or wardrobe source.`;
};

export const buildWardrobeTryOnSourceLockBlock = (args: {
  subjectImageRole: string;
  costumeImageRole: string;
  identityAnchorImageRole?: string | null;
  identityAnchorSource?: TryOnIdentityAnchorSource | null;
  mode: 'front' | 'turnaround';
}): string => {
  const selectedSubjectAnchorRule = args.identityAnchorSource === 'selected-subject' && args.identityAnchorImageRole
    ? `
 MANUAL SELECTED-SUBJECT ANCHOR
 - ${args.identityAnchorImageRole} was loaded with Use Selected Subject.
 - ${args.identityAnchorImageRole} is the same active subject identity as ${args.subjectImageRole}, not a separate person and not a generic character sheet.
 - Preserve the exact visible person from these subject anchors: face, head shape, skin tone, hairstyle, hairline, grooming, body silhouette, proportions, and source render style.
 - Do not replace the selected subject with a similar-looking generated wearer.
`
    : '';

  const modeRule = args.mode === 'turnaround'
    ? `
 TURNAROUND SOURCE ROTATION RULE
 - Turnaround views must rotate the same selected subject wearing the same selected wardrobe.
 - Unknown back or side details must be conservative continuations of ${args.costumeImageRole}, not new costume design.
 - The FRONT/BACK sheet is invalid if it introduces a new wearer, new hairstyle, new face, new body type, or new same-category costume.
 - The LEFT/RIGHT sheet is invalid if it changes the wearer or redesigns the wardrobe established by ${args.costumeImageRole} and the canonical front/back result.
`
    : `
 FRONT TRY-ON SOURCE RULE
 - The front try-on is invalid if it swaps in a new wearer or a new same-category outfit.
`;

  return `
 HARD SOURCE IMAGE LOCK
 - ${args.subjectImageRole} and ${args.costumeImageRole} are hard visual anchors, not mood boards and not inspiration.
 - ${args.subjectImageRole} is the exact person being dressed. Do not generate a random actor, different face, different hairstyle, different age impression, different body type, or generic fashion-model replacement.
 - ${args.costumeImageRole} is the exact selected wardrobe design. Do not generate a same-category redesign, alternate astronaut suit, alternate armor, alternate helmet, alternate boots, alternate gloves, or generic version of the costume.
 - The output must be recognizable as ${args.subjectImageRole} wearing ${args.costumeImageRole}.
 - If the result looks like it merely belongs to the same genre as the costume reference, it is wrong.
 - If ${args.costumeImageRole} visually shows a structured suit, armor, helmet, mascot, full-body costume, head covering, enclosed collar, backpack, boots, gloves, lights, panels, padding, or shell geometry, preserve those visible structures exactly even if the item name is generic or numeric.
 - Visual evidence in ${args.costumeImageRole} overrides filename text, category labels, generic astronaut/fashion priors, and ordinary-apparel fitting defaults.
${selectedSubjectAnchorRule}
${modeRule}
`;
};

export const buildTryOnLrFullBodyAxisLockBlock = (): string => `
 LR FULL-BODY SIDE-AXIS ACCEPTANCE TEST
 - Both LR panels must be full-body side profiles, not portrait-profile heads on front or 3/4 bodies.
 - LEFT PANEL: the entire body faces screen-right toward the center divider. Head, nose, neck, sternum/chest plane, abdomen, pelvis, knees, toes, boots, backpack, shoulder armor, torso shell, arm silhouette, and costume side edge all share that same screen-right side axis.
 - RIGHT PANEL: the entire body faces screen-left toward the center divider. Head, nose, neck, sternum/chest plane, abdomen, pelvis, knees, toes, boots, backpack, shoulder armor, torso shell, arm silhouette, and costume side edge all share that same screen-left side axis.
 - A panel fails if the face is profile but the chest plate, torso, pelvis, knees, boots, or costume shell still face the camera.
 - A panel fails if it shows broad front chest armor, symmetrical shoulder pads, both arms equally, front-facing hip plates, front-facing boots, or a visible front-body panel spread.
 - A panel fails if it is a 3/4 fashion angle, near-front pose, over-the-shoulder pose, or head-turn pose.
 - The side silhouette should be narrow and continuous from head through helmet/collar, chest, backpack, pelvis, knees, ankles, and boots.
 - Do not favor face visibility over body-axis accuracy. If needed, show less of the face, but keep the whole body in true side profile.
`;
