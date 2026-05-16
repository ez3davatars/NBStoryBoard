export type PropApplicationPromptArgs = {
    applyNote?: string;
    styleContract?: string;
    styleNegativePrompt?: string;
};

const HEADWEAR_GUIDED_APPLICATION_NOTE = `Fit the selected headwear naturally onto the subject's head. Preserve the subject's exact face, identity, pose, body, clothing, and black studio background. Preserve the selected headwear's design, colors, materials, and proportions. The headwear must be worn by the subject at natural scale, with realistic contact, perspective, and slight overlap or occlusion where appropriate. Do not place it too high above the head. Do not cover the eyes. Do not turn it into a background object, halo, throne, frame, or oversized decoration.`;

export function buildEffectivePropApplicationNote(applyNote?: string, fitClass?: string): string | undefined {
    if (fitClass !== 'headwear') return applyNote;

    const instruction = applyNote?.trim() || 'Fit the selected headwear naturally on the subject head.';
    return `${instruction}

${HEADWEAR_GUIDED_APPLICATION_NOTE}`;
}

export function buildPropApplicationPrompt({
    applyNote,
    styleContract = '',
    styleNegativePrompt = ''
}: PropApplicationPromptArgs): string {
    const instruction = applyNote?.trim() || 'Clean professional fitting in the correct grasp or on-body position.';
    const negativeStyle = styleNegativePrompt ? `, ${styleNegativePrompt}` : '';
    const hasFitIntent = /\b(fit|fits|fitted|wear|worn|wearing|attach|attached|wrap|wrapped|around|on|onto|grasp|hold|held)\b/i.test(instruction);
    const fitIntentBlock = hasFitIntent
        ? `
FIT SEMANTICS - UNIVERSAL
- Interpret the user's instruction as a fitting/integration request, not a simple placement request.
- Fit means the prop must be scaled, aligned, perspective-matched, and contact-locked to the requested body/object target.
- The prop must visibly touch, wrap, rest on, be worn by, be held by, or otherwise integrate with the target area described by the user.
- Do not leave an air gap, floating gap, hovering object, pasted sticker look, or object merely sitting near/above/beside the target.
- Add only natural contact cues: small occlusion, contact shadow, edge blending, and local perspective matching.
- The prop must be the foreground object at every contact/intersection point; subject hair, skin, clothing, fingers, or body parts must not poke through solid prop surfaces.
- If the target body/object would intersect the prop, subtly occlude, tuck, compress, or hide only the intersecting target pixels so the prop fits naturally.
- Preserve the exact prop identity while changing only scale, perspective, and integration needed to fit the target.
- This fit rule applies to every subject, body type, age, hairstyle, camera angle, render style, and prop category.`
        : '';
    const headFitBlock = /\b(head|hair|forehead|scalp)\b/i.test(instruction)
        ? `
HEAD FIT STRICTNESS
- Because the requested target is the head/hair area, fit the prop to the head geometry, not merely on top of it.
- The lower/contact edge of the prop must meet the hair/scalp/forehead line with no visible air gap.
- Match the head width, head tilt, camera perspective, and curvature implied by the subject.
- Hair must be contained under or behind the fitted head prop. Do not let hair protrude through, over, or inside the visible structure of the prop.
- For crown, tiara, hat, helmet, hood, veil, headband, or hairpiece fitting: no hair should poke through solid metal, fabric, frame, jewels, bands, arches, holes, trim, or decorative openings.
- If hair intersects the head prop, gently tuck/compress/occlude only that intersecting hair while preserving the same face, head shape, hairline impression, and visible hairstyle outside the contact area.
- The prop may occlude a small amount of hair naturally, but it must not cover the eyes, face, ears, neck, shoulders, or shirt unless the prop reference itself requires it.
- Keep the face, eyes, cheeks, mouth, ears, neck, shoulders, and clothing unchanged and unobstructed except for natural contact at the top of the head.
- Do not turn the prop into an oversized royal set piece, throne, halo, backplate, background crown, frame, or decorative scenery.
- Do not extend the prop behind the shoulders, around the entire head, or into the background.
- Use natural wearable scale: the prop should be fitted to the head, not dominate the full image.`
        : '';

    return `Create a single image.

APPLICATION MODE
- This is a locked prop application/editing pass, not new character creation and not scene design.
- Add exactly one instance of the selected prop to the selected subject.
- Do not invent any additional objects, set pieces, ornaments, scenery, furniture, backgrounds, crowns, halos, frames, thrones, architectural shapes, or decorative extensions.

SUBJECT LOCK
- [IMAGE 1] is the target SUBJECT.
- Preserve the subject exactly: same face, same body, same pose, same camera angle.
- Output must contain exactly one human subject.

PROP AUTHORITY
- [IMAGE 2] is the standalone PROP reference.
- Copy the prop exactly. Preserve exact shape, silhouette, colors, materials, visible construction, and proportions.
- Do not redesign, stylize, recolor, age, decorate, enlarge into a backdrop, or expand the prop beyond the reference object.
- The prop may only be transformed enough to fit the requested body location.

APPLICATION/FIT LOCK
- Requested application instruction: ${instruction}
- Apply the prop only to the requested target area.
- If the instruction uses "fit", "wear", "attach", "wrap", "hold", "grasp", "on", or "onto", treat it as a physical fitting/integration task.
- Pay strict attention to left/right instructions.
- Preserve correct real-world scale relative to the subject.
- Do not add extra props, straps, attachments, duplicates, supporting objects, or background elements unless they are already visible in the prop reference.
${fitIntentBlock}
${headFitBlock}

INTEGRATION
- Match lighting and perspective to the subject.
- The prop must look physically fitted and present, not floating, hovering, pasted, or merely composited.
- Enforce correct depth order: solid prop pixels must occlude subject pixels at overlaps, and subject pixels must never visibly pass through the prop.
- Keep the solid black studio background (#000000).

STYLE CATEGORY LOCK
- Preserve the selected character render category from the subject. Prop integration changes the prop only, not the subject's style category.
- Source image controls identity. Character Render Style controls visual category. Lighting adapts to the selected render style.
${styleContract}

NEGATIVE CONSTRAINTS:
floating prop, hovering prop, air gap, prop merely placed above target, pasted sticker look, no contact shadow, wrong contact point, hair protruding through prop, hair sticking out of headwear, subject pixels passing through prop, incorrect occlusion order, prop behind intersecting hair, extra props, duplicated prop, repeated prop, enlarged prop backdrop, prop turned into scenery, royal throne, halo, background crown, decorative architecture, invented ornaments, supporting objects, wrong hand, wrong side, wrong scale, altered prop colors, altered prop materials, prop redesign, extra straps, extra attachments, extra people, changed subject identity, changed subject face, changed subject pose, changed wardrobe, changed background, selected style category drift${negativeStyle}, text, watermark.`;
}
