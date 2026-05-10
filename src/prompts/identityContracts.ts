export const PROMPT_PRIORITY_ORDER_LABEL = "premium board quality > actor identity > costume/world > views > callouts > metadata/body";

export const PROMPT_PRIORITY_ORDER_BLOCK = `PROMPT PRIORITY ORDER:
1. Premium cinematic board quality.
2. One consistent actor-based identity.
3. Costume / world presentation.
4. Turnaround and head-study consistency.
5. Accurate restrained callouts.
6. Metadata / body consistency.

Keep the board premium and cinematic first. Preserve one consistent actor-based subject across panels while allowing costume, world, and film-board presentation to stay rich and production-ready.`;

type IdentityContractOptions = {
    sourceDescription: string;
    identityRangeText?: string;
    generatedLayoutReferenceText?: string;
};

export const buildAuthoritativeIdentityContract = ({
    sourceDescription,
    identityRangeText,
    generatedLayoutReferenceText
}: IdentityContractOptions): string => {
    const sourceLine = identityRangeText
        ? `Use ${identityRangeText} from ${sourceDescription} as the authoritative identity reference.`
        : `Use ${sourceDescription} as the authoritative identity reference.`;
    const generatedReferenceLine = generatedLayoutReferenceText
        ? `Generated sheets, styled portraits, previews, recent generations, or prior outputs may be used only as optional presentation/layout guidance: ${generatedLayoutReferenceText}. They must never replace the original identity anchors.`
        : "Generated sheets, styled portraits, previews, recent generations, or prior outputs must not replace the original identity anchors.";

    return `AUTHORITATIVE IDENTITY CONTRACT:
- ${sourceLine}
- Preserve the same real person across every panel and every angle.
- Do not substitute a similar-looking person.
- Do not beautify, average, age-shift, ethnicity-shift, skin-tone-shift, or redesign the face.
- Preserve facial proportions, brow shape, eye spacing, nose bridge and tip shape, mouth shape, jaw proportions, hairline, forehead, ear shape, skin tone family, and age impression.
- Render style may change the presentation only, not the identity.
- ${generatedReferenceLine}`;
};
