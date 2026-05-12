export type PoseViewAngle =
    | 'front'
    | 'front_3_4_left'
    | 'left_profile'
    | 'back'
    | 'right_profile'
    | 'front_3_4_right'
    | 'custom'
    | 'unspecified';

export type PoseCoherenceStrictness =
    | 'standard'
    | 'scene'
    | 'try_on'
    | 'turnaround'
    | 'side_view';

export type PoseCoherenceSubjectScope =
    | 'visible_body'
    | 'partial_body'
    | 'full_body';

export type HeadProfileStrictness = 'standard' | 'high' | 'technical';
export type HeadAngleTolerance = 'loose' | 'standard' | 'tight';

export type PoseCoherencePanelOrientation = {
    label: string;
    viewAngle: PoseViewAngle | string;
    degrees?: number;
    bodyFacing?: string;
    headFacing?: PoseViewAngle | string;
    headTurnAllowed?: boolean;
    headTurnDegrees?: number;
    profileStrictness?: HeadProfileStrictness;
    angleTolerance?: HeadAngleTolerance;
};

export type PoseCoherenceIntent = {
    viewAngle?: PoseViewAngle | string;
    panelViewAngle?: PoseViewAngle | string;
    cameraYaw?: PoseViewAngle | string;
    bodyFacing?: string;
    headFacing?: PoseViewAngle | string;
    headTurnAllowed?: boolean;
    headTurnDegrees?: number;
    profileStrictness?: HeadProfileStrictness;
    angleTolerance?: HeadAngleTolerance;
    twistAllowed?: boolean;
    twistIntensity?: number;
    stanceType?: 'neutral_grounded' | 'anchor_preserved' | 'action_pose' | string;
    footingMode?: 'directionally_aligned' | 'anchor_preserved' | string;
    strictness?: PoseCoherenceStrictness;
    subjectScope?: PoseCoherenceSubjectScope;
    panelOrientations?: PoseCoherencePanelOrientation[];
};

export type TurnaroundPairMode = 'FRONT_BACK' | 'LEFT_RIGHT';

export type PoseCoherenceValidationResult = {
    poseCoherent: boolean;
    headCoherent?: boolean;
    requiresRetry: boolean;
    confidence: number;
    upperBodyFacing?: string;
    lowerBodyFacing?: string;
    feetFacing?: string;
    headFacing?: string;
    intendedHeadFacing?: string;
    headBodyAlignment?: string;
    headIssueSummary?: string;
    issueSummary?: string;
};

const DEFAULT_PANEL_ORIENTATIONS: PoseCoherencePanelOrientation[] = [
    { label: 'front', viewAngle: 'front', degrees: 0, bodyFacing: 'front-facing unified axis' },
    { label: '3/4 left', viewAngle: 'front_3_4_left', degrees: 45, bodyFacing: 'single 45-degree three-quarter left axis' },
    { label: 'left profile', viewAngle: 'left_profile', degrees: 90, bodyFacing: 'true 90-degree left profile axis' },
    { label: 'back', viewAngle: 'back', degrees: 180, bodyFacing: 'straight rear-facing unified axis' },
    { label: '3/4 right', viewAngle: 'front_3_4_right', degrees: 315, bodyFacing: 'single 45-degree three-quarter right axis' },
    { label: 'right profile', viewAngle: 'right_profile', degrees: 270, bodyFacing: 'true 90-degree right profile axis' }
];

const TURNAROUND_PAIR_ORIENTATIONS: Record<TurnaroundPairMode, PoseCoherencePanelOrientation[]> = {
    FRONT_BACK: [
        {
            label: 'front view',
            viewAngle: 'front',
            degrees: 0,
            bodyFacing: 'straight-on front-facing full-body axis',
            headFacing: 'straight front-facing head'
        },
        {
            label: 'back view',
            viewAngle: 'back',
            degrees: 180,
            bodyFacing: 'true rear full-body axis',
            headFacing: 'back of head only, no front facial features'
        }
    ],
    LEFT_RIGHT: [
        {
            label: 'left profile view',
            viewAngle: 'left_profile',
            degrees: 90,
            bodyFacing: 'true 90-degree anatomical left-side full-body profile axis',
            headFacing: 'true 90-degree left side profile head'
        },
        {
            label: 'right profile view',
            viewAngle: 'right_profile',
            degrees: 270,
            bodyFacing: 'true 90-degree anatomical right-side full-body profile axis',
            headFacing: 'true 90-degree right side profile head'
        }
    ]
};

const formatAngle = (value?: PoseViewAngle | string) => value || 'match requested camera/view';

const formatBoolean = (value?: boolean) => (value ? 'true' : 'false');

const normalizeViewAngle = (value?: PoseViewAngle | string): string => (value || '').toLowerCase().replace(/[^a-z0-9]+/g, '_');

const defaultHeadFacingForView = (
    viewAngle?: PoseViewAngle | string,
    degrees?: number
): string => {
    const normalized = normalizeViewAngle(viewAngle);
    if (normalized.includes('front_3_4_left') || degrees === 45) return '45-degree three-quarter left head yaw';
    if (normalized.includes('front_3_4_right') || degrees === 315) return '45-degree three-quarter right head yaw';
    if (normalized.includes('left_profile') || degrees === 90) return 'true 90-degree left side profile head';
    if (normalized.includes('right_profile') || degrees === 270) return 'true 90-degree right side profile head';
    if (normalized.includes('back') || degrees === 180) return 'back of head only, no front facial features';
    if (normalized.includes('front') || degrees === 0) return 'straight front-facing head';
    return 'same as the assigned panel/view angle';
};

export const getTurnaroundPanelOrientations = (
    mode: TurnaroundPairMode
): PoseCoherencePanelOrientation[] =>
    TURNAROUND_PAIR_ORIENTATIONS[mode].map((panel) => ({ ...panel }));

export const buildTurnaroundViewDefinitionContract = (mode: TurnaroundPairMode): string => {
    const globalConsistency = `TURNAROUND GLOBAL CONSISTENCY LOCK:
- Every view is the same character rotated in space, not a new interpretation.
- Preserve exact identity, head shape, facial structure, body proportions, age read, outfit, garment details, footwear, accessories, hairstyle, grooming, silhouette, and style family across the full pair.
- Do not change body mass, shoulder width, waist relationship, limb thickness, footwear scale, costume fit, material finish, or render family between views.
- Internal view tags must remain explicit: front, back, left_profile, right_profile. Do not collapse profile views into vague "side" wording.`;

    const pairedViewIntegrity = `PAIRED VIEW INTEGRITY LOCK:
- View labels are camera/view constraints only. They must never override the locked subject identity, body source, wardrobe source, accessory continuity, or style family.
- Preserve asymmetric details consistently on the same physical character while rotating the camera side.
- Do not swap left and right anatomy, hairstyle asymmetry, accessories, closures, straps, garment seams, logos, bags, jewelry, weapons, or footwear details.
- Do not reinterpret hairstyle, accessories, clothing structure, body mass, facial structure, or silhouette between views.
- Do not create repeated fronts, repeated backs, repeated same-facing side profiles, 3/4 substitutes, or ambiguous in-between angles.`;

    if (mode === 'FRONT_BACK') {
        return `TURNAROUND MODE CONTRACT: FRONT_BACK
Generate a strict two-panel turnaround pair consisting only of:
1. FRONT / front: true straight-on front-facing full-body view.
2. BACK / back: true rear full-body view.

FRONT/BACK VIEW DEFINITIONS:
- Front means a straight-on front-facing full body: face, chest, pelvis, knees, toes, garment front, closures, and footwear fronts read as front-facing.
- Back means a true rear full body: back of head, rear neck, rear shoulders, back torso, rear hips, backs of knees/calves, heels/soles/backs of shoes, rear closures, straps, hems, bags, armor plates, or garment backs read as rear-facing.
- Back view must not leak front facial features unless explicitly requested.
- Do not substitute side/profile, 3/4, over-the-shoulder, or mirrored front poses for the back view.

${globalConsistency}

${pairedViewIntegrity}`;
    }

    return `TURNAROUND MODE CONTRACT: LEFT_RIGHT
Generate a strict two-panel turnaround pair consisting only of:
1. LEFT / left_profile: true anatomical left-side full-body profile.
2. RIGHT / right_profile: true anatomical right-side full-body profile.

LEFT/RIGHT VIEW DEFINITIONS:
- Left means the subject's actual anatomical left side is visible in a clean 90-degree side profile.
- Right means the subject's actual anatomical right side is visible in a clean 90-degree side profile.
- Both views must be technical profile views, not portraits, fashion 3/4 views, over-the-shoulder poses, or head-only angle studies.
- The head, neck, shoulders, chest, pelvis, hips, knees, ankles, shoes, garment silhouette, headwear, and accessories must all align to the assigned side-profile axis.

RIGHT PROFILE ENFORCEMENT:
- The second LR output must be the subject's true anatomical right profile.
- Show the subject from the subject's actual right side: right ear/right cheek plane, right jaw edge, right shoulder/arm outer contour, right hip, right leg line, and right footwear side should be the readable side when visible.
- The left and right profiles must face opposite directions and represent opposite sides of the same subject.
- The right profile must not face the same direction as the left profile.
- Do not create a near-front, front-biased, 3/4 right, over-the-shoulder, or ambiguous side-ish angle.
- Do not create two left profiles or two right profiles.
- Do not make the right profile weaker, softer, more generic, or less anatomically specific than the left profile.
- Keep the head, torso, hips, legs, shoes, and garment silhouette locked to a clean right-side profile orientation.
- Preserve exact identity, body shape, proportions, outfit continuity, hairstyle, accessories, footwear, and style family from the left view and source references.

PROFILE VIEW QUALITY:
- Each profile must read clearly as side profile with a clean nose/chin/forehead/jaw silhouette when the face is visible.
- Shoulders, torso, hips, knees, and feet must align as a side view.
- Garments must wrap around the side silhouette correctly; do not flatten front garment details onto the side.
- Visible ear placement, hair silhouette, headwear orientation, and accessory visibility must remain anatomically logical.
- No vague in-between angle is acceptable.

${globalConsistency}

${pairedViewIntegrity}`;
};

const buildPanelHeadLines = (panelOrientations: PoseCoherencePanelOrientation[] = []): string => {
    if (panelOrientations.length === 0) return '';

    return panelOrientations
        .map((panel) => {
            const degreeText = typeof panel.degrees === 'number' ? `${panel.degrees} degrees` : 'requested yaw';
            const headFacing = panel.headFacing || defaultHeadFacingForView(panel.viewAngle, panel.degrees);
            const headTurnAllowed = panel.headTurnAllowed === true;
            const headTurnDegrees = Number.isFinite(panel.headTurnDegrees) ? panel.headTurnDegrees : 0;
            const profileStrictness = panel.profileStrictness || 'high';
            const angleTolerance = panel.angleTolerance || 'tight';
            return `- ${panel.label}: ${degreeText}; headFacing: ${headFacing}; headTurnAllowed: ${formatBoolean(headTurnAllowed)}; headTurnDegrees: ${headTurnDegrees}; profileStrictness: ${profileStrictness}; angleTolerance: ${angleTolerance}.`;
        })
        .join('\n');
};

export const buildPoseCoherenceNegativeTokens = (): string =>
    [
        'split-direction stance',
        'torso facing one way while pelvis faces another',
        'counter-rotated torso and legs',
        'chest turned opposite hips',
        'feet pointing away from torso direction',
        'side-view torso with front-facing legs',
        'profile chest with three-quarter pelvis',
        'front-facing feet in side profile',
        'twisted hips without request',
        'broken global body axis',
        'misaligned pelvis knees and feet',
        'unintended dramatic torso twist',
        'head angle drift',
        'body side view with three-quarter head',
        'profile body with front-facing head',
        '90-degree profile head drifting to 3/4',
        '3/4 panel with front-facing head',
        'back view leaking front facial features',
        'neck twisted away from assigned panel angle',
        'facial plane not matching body yaw'
    ].join(', ');

// Body-axis coherence keeps torso/pelvis/legs/feet aligned. Head-axis
// coherence separately locks skull, facial plane, jaw, and neck to the same
// panel angle unless an explicit head turn has been requested.
export const buildHeadOrientationContract = (intent: PoseCoherenceIntent = {}): string => {
    const panelViewAngle = formatAngle(intent.panelViewAngle || intent.viewAngle || intent.cameraYaw);
    const headFacing = intent.headFacing || defaultHeadFacingForView(intent.panelViewAngle || intent.viewAngle || intent.cameraYaw);
    const bodyFacing = intent.bodyFacing || 'same as the requested camera/view angle';
    const headTurnAllowed = intent.headTurnAllowed === true;
    const headTurnDegrees = Number.isFinite(intent.headTurnDegrees) ? intent.headTurnDegrees : 0;
    const profileStrictness = intent.profileStrictness || 'high';
    const angleTolerance = intent.angleTolerance || 'tight';
    const panelLines = buildPanelHeadLines(intent.panelOrientations);
    const headTurnRule = headTurnAllowed
        ? `- Head turn is explicitly allowed up to ${headTurnDegrees} degrees; it must be deliberate, anatomically connected through the neck, and described by the shot intent.`
        : '- Head turn is opt-in only: do not counter-rotate the head away from the assigned body or panel angle.';

    return `HEAD ORIENTATION CONTRACT (HEAD AXIS LOCK):
STRUCTURED HEAD-ANGLE INTENT:
- panelViewAngle: ${panelViewAngle}
- bodyFacing: ${bodyFacing}
- headFacing: ${headFacing}
- headTurnAllowed: ${formatBoolean(headTurnAllowed)}
- headTurnDegrees: ${headTurnDegrees}
- profileStrictness: ${profileStrictness}
- angleTolerance: ${angleTolerance}

HEAD-AXIS RULES:
- The head must strictly honor the assigned panel angle.
- Keep head orientation, facial plane, eye line, nose direction, chin direction, jaw line, skull silhouette, neck base, and collar/shoulder connection consistent with the intended view.
- Do not allow the head to drift into a different angle than the body or panel.
- Maintain head-axis coherence from neck through skull and facial plane.
${headTurnRule}
- Front / 0 degrees: face reads clearly front-facing, balanced facial symmetry, no major side-turn drift.
- 3/4 / 45 degrees: face reads clearly three-quarter, far-side facial plane is reduced appropriately, not nearly front-facing and not nearly profile.
- Profile / 90 degrees: render a true technical side profile head; nose, lips, chin, brow, jaw, ear pattern, and skull silhouette read in profile with minimal or no front-face leakage.
- Back / 180 degrees: show the back of the head and body; do not reveal front facial features unless explicitly requested.
- A stylized, animated, anime, illustrated, sci-fi, or realistic character must still obey the same head-angle discipline.
${panelLines ? `\nPANEL HEAD-ANGLE MAP:\n${panelLines}` : ''}`;
};

export const buildPoseCoherenceContract = (intent: PoseCoherenceIntent = {}): string => {
    const viewAngle = formatAngle(intent.panelViewAngle || intent.viewAngle || intent.cameraYaw);
    const bodyFacing = intent.bodyFacing || 'same as the requested camera/view angle';
    const twistAllowed = intent.twistAllowed === true;
    const twistIntensity = Number.isFinite(intent.twistIntensity) ? intent.twistIntensity : 0;
    const stanceType = intent.stanceType || 'neutral_grounded';
    const footingMode = intent.footingMode || 'directionally_aligned';
    const strictness = intent.strictness || 'standard';
    const subjectScope = intent.subjectScope || 'visible_body';
    const twistRule = twistAllowed
        ? `- Twist is explicitly allowed only at intensity ${twistIntensity}; keep pelvis, knees, and feet readable as intentional support for the pose.`
        : '- Twist is opt-in only: do not create dramatic torso twist, counter-rotation, or a split-direction stance.';

    return `POSE COHERENCE CONTRACT (GLOBAL BODY AXIS LOCK):
STRUCTURED ORIENTATION INTENT:
- viewAngle: ${viewAngle}
- bodyFacing: ${bodyFacing}
- twistAllowed: ${formatBoolean(twistAllowed)}
- twistIntensity: ${twistIntensity}
- stanceType: ${stanceType}
- footingMode: ${footingMode}
- strictness: ${strictness}
- subjectScope: ${subjectScope}

RULES:
- Keep the entire visible body aligned to one coherent global facing direction.
- The ribcage, sternum, shoulders, pelvis, hips, knees, shins, and feet must agree on the same primary facing direction.
- The pelvis/hip line and foot direction anchor the body axis; feet must support the same facing angle as the torso.
- Do not allow the upper body and lower body to counter-rotate.
${twistRule}
- For exact side views, render one clean unified profile: head, torso, pelvis, knees, shins, and feet all read side-facing.
- For front/back views, align shoulders, hips, knees, and feet symmetrically to the same front/back axis.
- For 3/4 views, torso, hips, knees, and feet must all support the same three-quarter angle.
- If no pose is specified, use a natural balanced stance with grounded feet and coherent anatomy.
- No split-direction stance unless explicitly requested.

${buildHeadOrientationContract(intent)}`;
};

export const buildTurnaroundPoseCoherenceContract = (
    panelOrientations: PoseCoherencePanelOrientation[] = DEFAULT_PANEL_ORIENTATIONS
): string => {
    const panelLines = panelOrientations
        .map((panel) => {
            const degreeText = typeof panel.degrees === 'number' ? `${panel.degrees} degrees` : 'requested yaw';
            const facing = panel.bodyFacing || formatAngle(panel.viewAngle);
            const headFacing = panel.headFacing || defaultHeadFacingForView(panel.viewAngle, panel.degrees);
            return `- ${panel.label}: ${degreeText}; bodyFacing: ${facing}; headFacing: ${headFacing}; shoulders, sternum, pelvis, knees, feet, neck, skull, jaw, nose direction, and facial plane must all obey this assigned panel axis.`;
        })
        .join('\n');

    return `${buildPoseCoherenceContract({
        strictness: 'turnaround',
        subjectScope: 'full_body',
        panelOrientations,
        twistAllowed: false,
        twistIntensity: 0,
        headTurnAllowed: false,
        headTurnDegrees: 0,
        profileStrictness: 'technical',
        angleTolerance: 'tight',
        stanceType: 'neutral_grounded',
        footingMode: 'directionally_aligned'
    })}

TURNAROUND / REFERENCE SHEET AXIS MAP:
${panelLines}
- Every panel is a rotated view of the same coherent body, not a torso rotation pasted onto a different lower-body direction.
- Side and back panels must preserve spine-to-pelvis-to-foot alignment with the intended panel angle.
- Head and body are both technical angle commitments: profile body with a 3/4 head, front body with a side-turned head, or back body with visible front facial features is invalid unless explicitly requested.
- Before final output, internally reject any panel where chest direction, hip direction, knee direction, foot direction, neck alignment, skull yaw, nose direction, jawline, or facial-plane visibility disagrees with the assigned yaw.`;
};

export const withPoseCoherenceContract = (
    prompt: string,
    intent: PoseCoherenceIntent = {}
): string => {
    if (/POSE COHERENCE CONTRACT/i.test(prompt)) return prompt;
    return `${prompt.trim()}\n\n${buildPoseCoherenceContract(intent)}`;
};

const PERSON_PROMPT_RE =
    /\b(person|people|human|actor|actress|character|subject|model|body|full[-\s]?body|torso|pelvis|hips?|legs?|feet|footwear|wardrobe|costume|try[-\s]?on|portrait|headshot|head study|facial[-\s]?angle|head panel|reference sheet|turnaround|staged|shot|pose|standing|walking|seated)\b/i;

const PRODUCT_ONLY_RE =
    /\b(no person|no people|no human|no humans|no model|no mannequin|no hands|standalone garment only|garment product photo|product photo \(not a person wearing it\)|empty room|landscape only)\b/i;

export const shouldApplyPoseCoherence = (
    prompt: string,
    referenceLabels: string[] = []
): boolean => {
    const corpus = `${prompt}\n${referenceLabels.join('\n')}`;
    if (PRODUCT_ONLY_RE.test(corpus)) return false;
    return PERSON_PROMPT_RE.test(corpus);
};

export const shouldValidatePoseCoherence = (
    prompt: string,
    referenceLabels: string[] = []
): boolean => {
    if (!shouldApplyPoseCoherence(prompt, referenceLabels)) return false;
    return /\b(full[-\s]?body|turnaround|reference sheet|character sheet|wardrobe|costume|try[-\s]?on|standing|legs?|feet|footwear|pelvis|hips?|profile|side view|back view|headshot|head study|facial[-\s]?angle|head panel|shot|staged)\b/i.test(
        `${prompt}\n${referenceLabels.join('\n')}`
    );
};

export const buildPoseCoherenceValidationPrompt = (intent: PoseCoherenceIntent = {}, promptContext = ''): string => `
You are a strict pose-coherence quality gate for generated character imagery.

Inspect the visible person/character body axis and head axis. Check whether the upper body, lower body, feet, neck, skull, and facial plane agree with the assigned view.

Structured intent:
- viewAngle: ${formatAngle(intent.panelViewAngle || intent.viewAngle || intent.cameraYaw)}
- bodyFacing: ${intent.bodyFacing || 'same as requested camera/view angle'}
- headFacing: ${intent.headFacing || defaultHeadFacingForView(intent.panelViewAngle || intent.viewAngle || intent.cameraYaw)}
- headTurnAllowed: ${formatBoolean(intent.headTurnAllowed === true)}
- headTurnDegrees: ${Number.isFinite(intent.headTurnDegrees) ? intent.headTurnDegrees : 0}
- profileStrictness: ${intent.profileStrictness || 'high'}
- angleTolerance: ${intent.angleTolerance || 'tight'}
- twistAllowed: ${formatBoolean(intent.twistAllowed === true)}
- twistIntensity: ${Number.isFinite(intent.twistIntensity) ? intent.twistIntensity : 0}
- stanceType: ${intent.stanceType || 'neutral_grounded'}
- footingMode: ${intent.footingMode || 'directionally_aligned'}
${intent.panelOrientations?.length ? `\nPanel angle map:\n${buildPanelHeadLines(intent.panelOrientations)}` : ''}
${promptContext ? `\nPrompt context containing panel/view requirements:\n${promptContext.slice(0, 6000)}` : ''}

Review:
- torso/ribcage/sternum/shoulder facing direction
- pelvis/hip facing direction
- knee/leg/shin direction
- foot/toe/footwear direction
- neck-to-head continuity
- skull yaw and facial-plane visibility
- nose direction, chin direction, jawline/profile consistency
- eye visibility pattern and ear visibility pattern

Reject obvious body-axis failures, such as torso profile with front-facing legs, chest turned left while feet point right, hips facing back while shoulders face side, or side-view body with lower body drifting to front/3/4.
Reject obvious head-angle failures, such as a 90-degree side/profile panel with a 3/4 head, a 45-degree panel with a nearly front-facing head, a front panel with a side-turned head, a back panel leaking front facial features, or a profile body with the head turned toward the viewer.
For a 90-degree profile panel, require a true technical side-profile head, not a close-enough side-ish or 3/4 turn.
If no pelvis, legs, or feet are visible, still evaluate visible head/neck/shoulder angle if the prompt/panel specifies a view.
If twistAllowed is false, any obvious upper/lower counter-rotation should require retry.
If headTurnAllowed is false, any obvious head/body or head/panel angle mismatch should require retry.

Return ONLY valid JSON:
{
  "poseCoherent": true,
  "headCoherent": true,
  "requiresRetry": false,
  "confidence": 0.0,
  "upperBodyFacing": "string",
  "lowerBodyFacing": "string",
  "feetFacing": "string",
  "headFacing": "string",
  "intendedHeadFacing": "string",
  "headBodyAlignment": "string",
  "headIssueSummary": "string",
  "issueSummary": "string"
}
`.trim();

export const parsePoseCoherenceValidation = (text: string): PoseCoherenceValidationResult => {
    const fallback: PoseCoherenceValidationResult = {
        poseCoherent: true,
        headCoherent: true,
        requiresRetry: false,
        confidence: 0,
        issueSummary: 'validator returned non-JSON text'
    };

    const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1) return fallback;

    try {
        const parsed = JSON.parse(cleaned.substring(firstBrace, lastBrace + 1)) as Partial<PoseCoherenceValidationResult>;
        const confidence = typeof parsed.confidence === 'number' && Number.isFinite(parsed.confidence)
            ? Math.max(0, Math.min(1, parsed.confidence))
            : 0;

        return {
            poseCoherent: parsed.poseCoherent !== false,
            headCoherent: parsed.headCoherent !== false,
            requiresRetry: parsed.requiresRetry === true,
            confidence,
            upperBodyFacing: parsed.upperBodyFacing,
            lowerBodyFacing: parsed.lowerBodyFacing,
            feetFacing: parsed.feetFacing,
            headFacing: parsed.headFacing,
            intendedHeadFacing: parsed.intendedHeadFacing,
            headBodyAlignment: parsed.headBodyAlignment,
            headIssueSummary: parsed.headIssueSummary,
            issueSummary: parsed.issueSummary
        };
    } catch {
        return fallback;
    }
};

export const buildPoseCoherenceCorrectionPrompt = (
    originalPrompt: string,
    validation: PoseCoherenceValidationResult,
    intent: PoseCoherenceIntent = {}
): string => `${originalPrompt.trim()}

POSE COHERENCE CORRECTION PASS (MANDATORY):
- Previous output failed the body/head orientation check: ${validation.issueSummary || validation.headIssueSummary || 'body-axis or head-angle mismatch'}.
- If the failure involved head-angle drift, regenerate with stricter head-axis discipline. The head, neck, jaw, nose direction, eye/ear pattern, skull silhouette, and facial plane must match the assigned panel angle exactly, especially for 90-degree profile panels.
- Re-render the image from scratch with a unified body axis and a locked head axis.
- Keep identity, hairstyle, wardrobe, accessories, footwear, lighting, layout, and camera intent unchanged.
- Correct only the anatomical orientation mismatch.

${buildPoseCoherenceContract({
    ...intent,
    twistAllowed: intent.twistAllowed === true,
    headTurnAllowed: intent.headTurnAllowed === true,
    profileStrictness: intent.profileStrictness || 'technical',
    angleTolerance: intent.angleTolerance || 'tight',
    strictness: intent.strictness || 'turnaround'
})}`;
