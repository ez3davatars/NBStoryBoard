export type PropApplicationPromptArgs = {
    applyNote?: string;
    propTypeHint?: string;
    styleContract?: string;
    styleNegativePrompt?: string;
};

export function buildPropApplicationPrompt({
    applyNote,
    propTypeHint,
    styleContract = '',
    styleNegativePrompt = ''
}: PropApplicationPromptArgs): string {
    const instruction = applyNote?.trim() || 'Add the selected prop naturally to the subject.';
    const typeHint = propTypeHint?.trim();
    const typeHintLine = typeHint
        ? `- Simple prop type hint: ${typeHint}. Use this only to clarify placement; do not add extra objects or change the edit pipeline.`
        : '';
    const styleBlock = styleContract.trim()
        ? `
STYLE LOCK
${styleContract.trim()}`
        : '';
    const negativeStyle = styleNegativePrompt ? `, ${styleNegativePrompt}` : '';

    return `Create a single image.

TASK
- Edit IMAGE 1 by adding IMAGE 2 as the selected prop/accessory.
- Apply the prop according to this user instruction: "${instruction}".
${typeHintLine}
- The final image must look like the same subject from IMAGE 1 with the prop from IMAGE 2 added.

SUBJECT LOCK
- Preserve IMAGE 1 exactly except for the added prop.
- Keep the same face, identity, age, expression, skin, hair, hairstyle, body, pose, clothing, costume, anatomy, lighting, camera angle, and black background.
- Do not redesign, restyle, beautify, mechanize, age, slim, enlarge, shrink, or alter the subject.
- Do not add extra accessories, clothing, armor, wires, panels, scenery, people, or background elements.

PROP LOCK
- Use IMAGE 2 as the only prop to add.
- Preserve the prop's visible design, color, material, texture, proportions, and recognizable structure.
- Do not redesign the prop.
- Do not duplicate the prop.
- Do not turn the prop into scenery, a background object, a frame, a halo, a throne, architecture, or a new costume.

PLACEMENT
- Place the prop only where requested by the user.
- Match the subject's perspective, lighting, and scale.
- The prop should look physically present, not floating or pasted.
- Use only minimal natural contact shadow or occlusion where needed.

HEADWEAR CLARIFICATION
- If the selected prop is headwear, place it on the top/head/hairline area at realistic wearable scale.
- Preserve the headwear's shape and structure.
- Do not deform it into a helmet, wrap, armor, or background decoration.
- Do not cover the eyes.

OUTPUT
- Same subject.
- Same black background.
- One added prop only.
- No text or watermark.
${styleBlock}

NEGATIVE CONSTRAINTS
changed subject, changed face, changed identity, changed hair, changed hairstyle, changed clothing, changed costume, changed body, changed pose, changed background, extra people, extra props, duplicated prop, redesigned prop, oversized prop, prop turned into scenery, halo, throne, frame, background object, pasted sticker, floating object, eyes covered${negativeStyle}, text, watermark.`;
}
