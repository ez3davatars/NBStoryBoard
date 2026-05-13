export type CharacterAnatomyIntegrityIntent = {
    appliesTo?: string;
};

const CHARACTER_PROMPT_PATTERN =
    /\b(character|characters|person|people|human|humanoid|actor|actress|subject|model|cast|body|full[-\s]?body|portrait|headshot|bust|turnaround|reference sheet|character sheet|pitch sheet|try[-\s]?on|wearing|wardrobe|costume|pose|gesture|standing|seated|walking|arms?|hands?|fingers?|legs?|feet|footwear)\b/i;

const NO_CHARACTER_PROMPT_PATTERN =
    /\b(no person|no people|no human|no humans|no model|no mannequin|standalone garment only|single standalone garment only|garment product photo|product photo \(not a person wearing it\)|empty room|landscape only)\b/i;

const CHARACTER_REFERENCE_LABEL_PATTERN =
    /\b(subject|character|actor|actress|cast|person|identity|portrait|headshot|body|wardrobe try[-\s]?on|try[-\s]?on target)\b/i;

export const CHARACTER_ANATOMY_INTEGRITY_CONTRACT = `CHARACTER ANATOMY INTEGRITY CONTRACT:
- Applies to every visible character, actor, subject, model, wearer, body panel, headshot, portrait, turnaround, gesture pose, action pose, or person in the generated image.
- Every complete humanoid character must resolve to one continuous believable body: one head, one neck, one torso/pelvis, two shoulders, two arms, two hands, two legs, and two feet.
- Visible hands must each have one palm and a believable finger count. Do not add stray fingers, duplicate hands, partial extra palms, or detached wrists.
- If the character is non-human, creature, mascot, robot, armor, or stylized, preserve the exact appendage count implied by the source image or prompt. Do not add extra heads, torsos, arms, hands, fingers, legs, feet, tails, wings, tentacles, or mechanical appendages beyond the approved design.
- Occlusion is allowed and preferred over invention: hidden limbs may remain hidden by pose, clothing, props, crop, or camera angle. Never add a phantom limb to make anatomy visible.
- Crossed-arm, hand-on-chin, folded-arm, seated, holding-prop, and action poses must still use exactly the intended arms and hands. No third forearm, extra wrist, duplicate hand, repeated elbow, or spare fingers emerging from the torso, sleeve, armpit, or silhouette.
- Multi-panel sheets must pass this test in every panel independently. Panel borders, callouts, material swatches, and overlapping insets must not create ghost limbs, duplicate bodies, or fused anatomy.
- Reject the image if any character has extra limbs, missing impossible limbs, fused limbs, duplicated hands, malformed hands, detached body parts, conjoined torsos, or anatomy that cannot belong to one continuous body.`;

export const CHARACTER_ANATOMY_NEGATIVE_TEXT =
    "No extra limbs. No extra arms. No extra forearms. No extra elbows. No extra wrists. No extra hands. No extra fingers. No duplicate palms. No detached hands. No spare arm emerging from torso or sleeve. No extra legs. No extra feet. No duplicated body parts. No conjoined torsos. No ghost limbs. No fused limbs. No malformed hands. No impossible crossed arms. No anatomy that cannot belong to one continuous body.";

export const shouldApplyCharacterAnatomyIntegrity = (
    prompt: string,
    referenceLabels: string[] = []
): boolean => {
    const combinedLabels = referenceLabels.join(" ");
    const hasCharacterSignal =
        CHARACTER_PROMPT_PATTERN.test(prompt) ||
        CHARACTER_REFERENCE_LABEL_PATTERN.test(combinedLabels);

    if (!hasCharacterSignal) return false;

    const hasNoCharacterSignal = NO_CHARACTER_PROMPT_PATTERN.test(prompt);
    const hasExplicitCharacterOutput =
        /\b(try[-\s]?on|portrait|headshot|turnaround|reference sheet|character sheet|pitch sheet|pose|gesture|standing|seated|walking|full[-\s]?body)\b/i.test(prompt);

    return !hasNoCharacterSignal || hasExplicitCharacterOutput;
};

export const withCharacterAnatomyIntegrityContract = (
    prompt: string,
    intent: CharacterAnatomyIntegrityIntent = {}
): string => {
    if (/CHARACTER ANATOMY INTEGRITY CONTRACT/i.test(prompt)) return prompt;

    const appliesTo = intent.appliesTo
        ? `\n- Applies specifically to: ${intent.appliesTo}.`
        : "";

    return `${prompt.trim()}

${CHARACTER_ANATOMY_INTEGRITY_CONTRACT}${appliesTo}

ANATOMY NEGATIVE CONSTRAINTS:
${CHARACTER_ANATOMY_NEGATIVE_TEXT}`;
};
