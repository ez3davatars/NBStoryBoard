export type HeadshotWardrobeContinuityStrictness =
    | 'standard'
    | 'reference_sheet'
    | 'forensic_board'
    | 'headshot_strip';

export type HeadshotWardrobeContinuityIntent = {
    identitySource?: string;
    wardrobeAuthority?: string;
    finalLookReference?: string;
    appliesTo?: string;
    allowSourceClothingAsFinalWardrobe?: boolean;
    strictness?: HeadshotWardrobeContinuityStrictness;
};

export type HeadshotWardrobeValidationResult = {
    wardrobeCoherent: boolean;
    requiresRetry: boolean;
    confidence: number;
    issueSummary?: string;
    mismatchedPanels?: string[];
    observedHeadshotClothing?: string;
    approvedCostumeClothing?: string;
};

const DEFAULT_IDENTITY_SOURCE =
    'source/reference identity images and biometric face anchors';

const DEFAULT_WARDROBE_AUTHORITY =
    'the approved/generated final character costume, structured wardrobe prompt, main character render, or turnaround views';

const DEFAULT_APPLIES_TO =
    'all cropped headshots, profile heads, facial-angle strips, bust crops, expression panels, and head-study panels';

export const buildHeadshotWardrobeNegativeTokens = (): string =>
    [
        'source-photo shirt in headshot',
        'original identity-reference collar',
        'source polo collar',
        'source t-shirt neckline',
        'source casual clothing in face panel',
        'blue shirt from source photo',
        'headshot clothing mismatch',
        'headshot collar different from main costume',
        'headshot neckline different from turnaround',
        'raw source wardrobe leakage',
        'portrait shirt remnant',
        'source-photo jacket remnant',
        'cropped source shoulders',
        'identity reference clothing preserved in headshot'
    ].join(', ');

export const buildHeadshotWardrobeContinuityContract = (
    intent: HeadshotWardrobeContinuityIntent = {}
): string => {
    const identitySource = intent.identitySource || DEFAULT_IDENTITY_SOURCE;
    const wardrobeAuthority = intent.wardrobeAuthority || DEFAULT_WARDROBE_AUTHORITY;
    const finalLookReference = intent.finalLookReference || 'the final character design context in this generation';
    const appliesTo = intent.appliesTo || DEFAULT_APPLIES_TO;
    const strictness = intent.strictness || 'standard';
    const sourceClothingException = intent.allowSourceClothingAsFinalWardrobe
        ? '- Source-photo clothing may appear only if the prompt explicitly defines that same clothing as the final approved costume.'
        : '- Source-photo clothing is never wardrobe authority for headshot panels.';

    return `HEADSHOT WARDROBE CONTINUITY CONTRACT:
IDENTITY VS WARDROBE INHERITANCE:
- Applies to: ${appliesTo}.
- Identity source: ${identitySource}.
- Wardrobe authority: ${wardrobeAuthority}.
- Final look reference: ${finalLookReference}.
- strictness: ${strictness}.

IDENTITY SOURCE MAY PROVIDE ONLY:
- face identity, skull/head shape, skin tone, facial structure, baldness/hairstyle, facial hair, age impression, expression intent, and head angle/viewpoint.
- It must not provide the visible shirt, jacket, collar, neckline, shoulders, upper chest fabric, or background.

HEADSHOT CLOTHING MUST COME FROM THE CHARACTER COSTUME:
- Replace all visible clothing in every headshot with the generated character costume.
- The neckline, collar, shoulders, lapels, upper chest fabric, robe/jacket/tunic/armor/uniform details, trim, colors, materials, and near-neck accessories must match the final character design.
- Generate headshots as costume-aware bust/head-and-shoulders views of the character, not as raw crops from the source photo.
- Every facial-angle panel must visually belong to the same outfit shown in the hero render, body views, turnaround views, or wardrobe directive.

WARDROBE AUTHORITY ORDER:
1. Approved/generated final character costume for this sheet or board.
2. Structured wardrobe/outfit object or typed outfit directive.
3. Main generated character render, style reference, or turnaround image used as the final look authority.

SOURCE-CLOTHING EXCLUSION:
${sourceClothingException}
- Do not retain the source-photo shirt, polo collar, t-shirt neckline, jacket, casual clothing, or source background remnants.
- If a headshot crop includes shoulders or upper chest, that crop must show the final character wardrobe at the collar/neck/shoulders.
- If wardrobe and identity conflict, preserve facial identity while replacing clothing with the final character costume.`;
};

export const withHeadshotWardrobeContinuityContract = (
    prompt: string,
    intent: HeadshotWardrobeContinuityIntent = {}
): string => {
    if (/HEADSHOT WARDROBE CONTINUITY CONTRACT/i.test(prompt)) return prompt;
    return `${prompt.trim()}\n\n${buildHeadshotWardrobeContinuityContract(intent)}`;
};

const BOARD_OR_STRIP_RE =
    /\b(head-study|head study|head panel|face panel|facial[-\s]?angle|expression panel|profile head|reference sheet|character sheet|forensic board|identity row|identity strip|angle strip|portrait strip)\b/i;

const CROPPED_HEADSHOT_RE =
    /\b(headshot|head shot|bust crop)\b/i;

const HEADSHOT_CONTEXT_RE =
    /\b(strip|row|panel|sheet|board|turnaround|forensic)\b/i;

const HUMAN_REFERENCE_RE =
    /\b(character|actor|person|subject|identity|biometric|face|portrait|wardrobe|costume|outfit|tunic|robe|armor|uniform|jacket|hoodie|blazer|collar|neckline)\b/i;

const PRODUCT_ONLY_RE =
    /\b(no person|no people|no human|no humans|standalone garment only|garment product photo|product photo \(not a person wearing it\)|empty room|landscape only)\b/i;

export const shouldApplyHeadshotWardrobeContinuity = (
    prompt: string,
    referenceLabels: string[] = []
): boolean => {
    const corpus = `${prompt}\n${referenceLabels.join('\n')}`;
    if (PRODUCT_ONLY_RE.test(corpus)) return false;
    const explicitBoardOrStrip = BOARD_OR_STRIP_RE.test(corpus);
    const contextualHeadshot = CROPPED_HEADSHOT_RE.test(corpus) && HEADSHOT_CONTEXT_RE.test(corpus);
    return (explicitBoardOrStrip || contextualHeadshot) && HUMAN_REFERENCE_RE.test(corpus);
};

export const shouldValidateHeadshotWardrobeContinuity = (
    prompt: string,
    referenceLabels: string[] = []
): boolean => shouldApplyHeadshotWardrobeContinuity(prompt, referenceLabels);

export const buildHeadshotWardrobeValidationPrompt = (
    originalPrompt: string,
    intent: HeadshotWardrobeContinuityIntent = {}
): string => `
You are a strict wardrobe-continuity quality gate for generated character reference boards.

Inspect the generated image for cropped headshots, head-study panels, profile heads, bust crops, expression panels, or facial-angle strips.

Task:
- Compare visible clothing in those headshot/bust panels against the approved/generated character outfit visible in the same board, main full-body panels, hero render, turnaround views, or described by the prompt context below.
- Fail the image if any headshot shows source-photo clothing instead of the final character costume.

Prompt context:
${originalPrompt.slice(0, 6000)}

Wardrobe inheritance intent:
- Identity source: ${intent.identitySource || DEFAULT_IDENTITY_SOURCE}
- Wardrobe authority: ${intent.wardrobeAuthority || DEFAULT_WARDROBE_AUTHORITY}
- Final look reference: ${intent.finalLookReference || 'main generated character costume / turnaround / wardrobe directive'}
- Source clothing allowed as final wardrobe: ${intent.allowSourceClothingAsFinalWardrobe === true ? 'true' : 'false'}

Check for:
- wrong shirt color from the source image
- wrong collar type or neckline
- casual source shirt/polo/t-shirt visible in cropped headshots
- headshot shoulders/upper chest that do not match the hero/body/turnaround costume
- missing robe/jacket/tunic/armor/uniform details that should be visible near neck/shoulders

If no headshot/bust panels are visible, or if no clothing/shoulders/neckline are visible in the headshots, pass the image.
Reject only visible mismatches; do not reject for minor lighting, crop, or fabric-fold differences.

Return ONLY valid JSON:
{
  "wardrobeCoherent": true,
  "requiresRetry": false,
  "confidence": 0.0,
  "issueSummary": "string",
  "mismatchedPanels": ["string"],
  "observedHeadshotClothing": "string",
  "approvedCostumeClothing": "string"
}
`.trim();

export const parseHeadshotWardrobeValidation = (text: string): HeadshotWardrobeValidationResult => {
    const fallback: HeadshotWardrobeValidationResult = {
        wardrobeCoherent: true,
        requiresRetry: false,
        confidence: 0,
        issueSummary: 'validator returned non-JSON text'
    };

    const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1) return fallback;

    try {
        const parsed = JSON.parse(cleaned.substring(firstBrace, lastBrace + 1)) as Partial<HeadshotWardrobeValidationResult>;
        const confidence = typeof parsed.confidence === 'number' && Number.isFinite(parsed.confidence)
            ? Math.max(0, Math.min(1, parsed.confidence))
            : 0;

        return {
            wardrobeCoherent: parsed.wardrobeCoherent !== false,
            requiresRetry: parsed.requiresRetry === true,
            confidence,
            issueSummary: parsed.issueSummary,
            mismatchedPanels: Array.isArray(parsed.mismatchedPanels) ? parsed.mismatchedPanels : [],
            observedHeadshotClothing: parsed.observedHeadshotClothing,
            approvedCostumeClothing: parsed.approvedCostumeClothing
        };
    } catch {
        return fallback;
    }
};

export const buildHeadshotWardrobeCorrectionPrompt = (
    originalPrompt: string,
    validation: HeadshotWardrobeValidationResult,
    intent: HeadshotWardrobeContinuityIntent = {}
): string => `${originalPrompt.trim()}

HEADSHOT WARDROBE CONTINUITY CORRECTION PASS (MANDATORY):
- Previous output failed headshot wardrobe continuity: ${validation.issueSummary || 'headshot clothing did not match the generated character costume'}.
- Re-render the board from scratch.
- Preserve facial identity, hairstyle/baldness, facial hair, age impression, head angles, layout, labels, pose coherence, main costume fidelity, and board style.
- Correct the visible clothing in cropped headshots only: replace any source-photo shirt/collar/neckline with the final character costume at the neck, collar, shoulders, and upper chest.
- The headshot clothing must match the generated character outfit, not the source photo.

${buildHeadshotWardrobeContinuityContract(intent)}`;
