import type { StageAnnotation, StageToken } from '../context/AppContext';

export type HumanPlacementIntent = {
    actorTokenId: string;
    actorLabel: string;
    action?: 'sit' | 'stand' | 'lean' | 'lookAt' | 'walk' | 'interact' | 'kneel' | 'crouch' | 'run' | 'lie' | 'hold' | 'reach';
    anchorKind?: 
    | 'seat'
    | 'floor'
    | 'wall'
    | 'counter'
    | 'table'
    | 'rail'
    | 'doorway'
    | 'bed'
    | 'stairs'
    | 'vehicle'
    | 'object'
    | 'path'
    | 'gazeTarget';
    targetAnnotationId?: string;
    targetTokenId?: string;
    bodyOrientation?:
    | 'front'
    | 'back'
    | 'left'
    | 'right'
    | 'threeQuarterLeft'
    | 'threeQuarterRight';
    motionDirection?: 'left' | 'right' | 'forward' | 'backward';
    gazeTargetAnnotationId?: string;
    occlusionMode?: 'allow' | 'avoid' | 'preferForegroundContact';
    preserveIdentity?: boolean;
    preserveWardrobe?: boolean;
    notes?: string;
    
    // Automatic Inference Additions
    supportSurface?: 'floor' | 'seat' | 'chair' | 'bench' | 'couch' | 'wall' | 'rail' | 'counter' | 'table' | 'bed' | 'path' | 'stairs' | 'object';
    sourceFraming?: 'head' | 'bust' | 'waist' | 'threeQuarter' | 'fullBody';
    poseCompletionMode?: 'none' | 'extendToFullBody';
    relightMode?: 'matchEnvironment';
    placementRelation?: 'beside' | 'near' | 'behind' | 'inFrontOf';
    relativeToExistingSubject?: boolean;
    isInferred?: boolean;
};

export const inferSourceFramingForToken = (token: StageToken): HumanPlacementIntent['sourceFraming'] | undefined => {
    if (token.sourceFraming) return token.sourceFraming;
    
    const aspect = (token.width || 50) / (token.height || 100);
    // Conservatives: only assume non-full-body if aspect is clearly wide
    if (aspect >= 0.9) return 'head';
    if (aspect >= 0.75) return 'bust';
    if (aspect >= 0.55) return 'waist';
    
    // Default to undefined to avoid forced completions if not explicitly known
    return undefined;
};

// --- AUTO INFERENCE ---
export const inferPlacementIntentForToken = (
    token: StageToken,
    tokens: StageToken[],
    annotations: StageAnnotation[]
): Partial<HumanPlacementIntent> | null => {
    // 1. Gather scene evidence based on token footprint
    const tx = token.x;
    const ty = token.y; // bottom center broadly
    const th = token.height || 100;
    const tw = token.width || 50;

    let bestSupportSurface: HumanPlacementIntent['supportSurface'] = undefined;
    let bestAction: HumanPlacementIntent['action'] | undefined = undefined;
    let bestRelation: HumanPlacementIntent['placementRelation'] = undefined;
    let relativeId: string | undefined = undefined;

    // Check overlaps with anchors
    const sortedAnnos = [...annotations].sort((a, b) => b.zIndex - a.zIndex);
    for (const anno of sortedAnnos) {
        if (anno.type !== 'zone') continue;
        
        // Simple bounding box overlap check
        const axMin = anno.x - anno.width / 2;
        const axMax = anno.x + anno.width / 2;
        const ayMin = anno.y - anno.height / 2;
        const ayMax = anno.y + anno.height / 2;

        const overlaps = tx >= axMin && tx <= axMax && ty >= ayMin && ty <= ayMax;
        
        if (overlaps) {
            const kind = anno.anchorKind;
            if (kind === 'seat') {
                const label = (anno.label || '').toLowerCase();
                if (label.includes('chair')) bestSupportSurface = 'chair';
                else if (label.includes('bench')) bestSupportSurface = 'bench';
                else if (label.includes('couch') || label.includes('sofa')) bestSupportSurface = 'couch';
                else bestSupportSurface = 'seat';
                bestAction = 'sit';
                break;
            } else if (kind === 'bed') {
                bestSupportSurface = 'bed';
                bestAction = 'lie';
                break;
            } else if (kind === 'table' || kind === 'counter') {
                bestSupportSurface = kind;
                bestAction = token.elementType === 'prop' ? undefined : 'lean';
                break;
            } else if (kind === 'wall' || kind === 'rail') {
                bestSupportSurface = kind;
                bestAction = 'lean';
                break;
            } else if (kind === 'path' || kind === 'stairs') {
                bestSupportSurface = kind;
                bestAction = 'walk';
                break;
            } else if (kind === 'floor') {
                bestSupportSurface = 'floor';
                bestAction = 'stand';
                break;
            }
        }
    }

    // fallback to generic floor if no zone overlap
    if (!bestSupportSurface) {
        bestSupportSurface = 'floor';
        bestAction = 'stand';
    }

    // Check Multi-Subject Relation
    if (token.elementType === 'actor' || !token.elementType) {
        // Is there another actor nearby?
        for (const other of tokens) {
            if (other.id === token.id) continue;
            if (other.elementType !== 'actor' && other.elementType) continue;

            // Distance check (roughly "near" horizontally, similar vertically)
            const dx = Math.abs(other.x - tx);
            const dy = Math.abs(other.y - ty);

            if (dx < tw * 2 && dy < th * 0.5) {
                // If it's a seat and they are both near it, it's beside
                if (bestSupportSurface === 'seat' || bestSupportSurface === 'chair' || bestSupportSurface === 'bench' || bestSupportSurface === 'couch') {
                    bestRelation = 'beside';
                    relativeId = other.id;
                    break;
                } else if (dx < tw * 1.5) {
                    bestRelation = 'near';
                    relativeId = other.id;
                    break;
                }
            }
        }
    }

    // For props, default to on the support surface (no action)
    if (token.elementType === 'prop') {
        bestAction = undefined;
    }

    return {
        action: bestAction,
        supportSurface: bestSupportSurface,
        placementRelation: bestRelation,
        relativeToExistingSubject: !!relativeId,
        targetTokenId: relativeId,
        isInferred: true
    };
};

export const buildHumanPlacementIntents = (tokens: StageToken[], annotations: StageAnnotation[]): HumanPlacementIntent[] => {
    const intents: HumanPlacementIntent[] = [];
    const actorsAndProps = tokens.filter(t => t.elementType === 'actor' || !t.elementType || t.elementType === 'prop');

    for (const actor of actorsAndProps) {
        let action: HumanPlacementIntent['action'] = 'stand';
        let anchorKind: HumanPlacementIntent['anchorKind'] = undefined;
        let targetAnnotationId: string | undefined = undefined;
        let targetTokenId: string | undefined = undefined;
        let gazeTargetAnnotationId: string | undefined = undefined;
        
        // Auto-Inference Additions
        let supportSurface: HumanPlacementIntent['supportSurface'] = undefined;
        let placementRelation: HumanPlacementIntent['placementRelation'] = undefined;
        let relativeToExistingSubject: boolean | undefined = undefined;
        let isInferred = false;

        const placementAnnos = annotations.filter(a => a.relation === 'place' && (a.targetTokenId === actor.id || a.targetId === actor.id));
        const lookAtAnnos = annotations.filter(a => (a.relation === 'lookAt' || a.role === 'lookAt') && (a.sourceId === actor.id));

        if (placementAnnos.length > 0) {
            const anno = placementAnnos[0];
            targetAnnotationId = anno.id;
            anchorKind = anno.anchorKind;

            if (anchorKind === 'seat') {
                action = 'sit';
                const label = (anno.label || '').toLowerCase();
                if (label.includes('chair')) supportSurface = 'chair';
                else if (label.includes('bench')) supportSurface = 'bench';
                else if (label.includes('couch') || label.includes('sofa')) supportSurface = 'couch';
                else supportSurface = 'seat';
            } else if (anchorKind === 'wall' || anchorKind === 'rail' || anchorKind === 'counter') {
                action = 'lean';
            } else if (anchorKind === 'bed') {
                action = 'lie';
            } else if (anchorKind === 'object' || anchorKind === 'table') {
                action = 'interact';
            } else if (anchorKind === 'path' || anchorKind === 'stairs' || anno.blueprintType === 'pathArrow') {
                action = 'walk';
            } else if (anchorKind === 'floor') {
                action = 'stand';
            }

            const lowerNotes = (anno.text || actor.notes || actor.actionNote || '').toLowerCase();
            if (lowerNotes.includes('kneel')) action = 'kneel';
            if (lowerNotes.includes('crouch')) action = 'crouch';
            if (lowerNotes.includes('run')) action = 'run';
            if (lowerNotes.includes('lie') || lowerNotes.includes('lay')) action = 'lie';
        } else {
            const pathAnno = annotations.find(a => a.blueprintType === 'pathArrow' && a.sourceId === actor.id);
            if (pathAnno) {
                action = 'walk';
                targetAnnotationId = pathAnno.id;
            } else {
                // --- APPLY AUTO-INFERENCE IF NO EXPLICIT ARROWS EXIST ---
                const inferred = inferPlacementIntentForToken(actor, tokens, annotations);
                if (inferred) {
                    action = inferred.action;
                    supportSurface = inferred.supportSurface;
                    placementRelation = inferred.placementRelation;
                    relativeToExistingSubject = inferred.relativeToExistingSubject;
                    targetTokenId = inferred.targetTokenId;
                    isInferred = true;
                }
            }
        }

        if (lookAtAnnos.length > 0) {
             const gazeAnno = lookAtAnnos[0];
             gazeTargetAnnotationId = gazeAnno.targetId || gazeAnno.id;
             if (action === 'stand') {
                 action = 'lookAt';
             }
        }
        
        // Only refine basic action from notes if it wasn't inferred dynamically (don't break 'sit' generated from seat drop)
        if (action === 'stand' && !isInferred) {
            const lowerNotes = (actor.notes || actor.actionNote || '').toLowerCase();
            if (lowerNotes.includes('kneel')) action = 'kneel';
            if (lowerNotes.includes('crouch')) action = 'crouch';
            if (lowerNotes.includes('sit')) action = 'sit';
        }

        // For props, ensure action is cleared
        if (actor.elementType === 'prop') {
            action = undefined;
        }

        // Add new fields
        const sourceFraming = inferSourceFramingForToken(actor);
        let poseCompletionMode: HumanPlacementIntent['poseCompletionMode'] = 'none';
        const relightMode: HumanPlacementIntent['relightMode'] = 'matchEnvironment';

        // IF support surface expects full body but source is cropped
        if (sourceFraming && sourceFraming !== 'fullBody' && sourceFraming !== 'threeQuarter') {
            const isFullBodySupport = ['seat', 'chair', 'bench', 'couch', 'bed', 'floor', 'path', 'stairs'].includes(supportSurface || anchorKind || '');
            if (isFullBodySupport) {
                poseCompletionMode = 'extendToFullBody';
            }
        }

        intents.push({
            actorTokenId: actor.id,
            actorLabel: actor.tag || 'Unknown',
            action,
            anchorKind,
            targetAnnotationId,
            targetTokenId,
            gazeTargetAnnotationId,
            preserveIdentity: actor.preserveIdentity,
            preserveWardrobe: actor.preserveWardrobe,
            notes: actor.notes || actor.actionNote,
            
            // Add new fields
            supportSurface,
            sourceFraming,
            poseCompletionMode,
            relightMode,
            placementRelation,
            relativeToExistingSubject,
            isInferred
        });
    }
    return intents;
};

export const formatPlacementIntents = (intents: HumanPlacementIntent[]): string => {
    if (intents.length === 0) return '';
    const lines = ['SCENARIO-SPECIFIC ACTOR PLACEMENT:'];
    for (const intent of intents) {
        let base = `- Actor [${intent.actorLabel}]: `;
        const support = intent.supportSurface || intent.anchorKind || 'surface';
        
        const isSupportSurfacePlacement = intent.poseCompletionMode === 'extendToFullBody' || 
            ['seat', 'chair', 'bench', 'couch', 'bed'].includes(support);
        
        if (intent.action) {
            switch (intent.action) {
                case 'stand':
                    base += `place actor standing naturally in the marked region on the ${support}. keep feet grounded to the visible surface. add realistic grounded foot shadows.`;
                    break;
                case 'sit':
                    base += `place actor seated naturally on the marked ${support} anchor. integrate hips and upper legs with the seat surface. DO NOT leave the actor floating or standing in front of the seat. allow physically appropriate overlap/contact with the furniture. add realistic contact shadows beneath hips and feet, and subtle environmental bounce light from the seat.`;
                    break;
                case 'lean':
                    base += `place actor leaning naturally against the marked ${support}. preserve believable body weight/contact with the support. allow physically appropriate overlap/occlusion. add realistic side-contact shadows against the support surface.`;
                    break;
                case 'walk':
                case 'run':
                    base += `place actor moving naturally along the marked ${support} direction. keep feet grounded and aligned with scene perspective. add realistic grounded foot shadows.`;
                    break;
                case 'kneel':
                case 'crouch':
                    base += `place actor kneeling/crouching naturally in the target region on the ${support}. keep ground contact physically plausible.`;
                    break;
                case 'lie':
                    base += `place actor lying/reclining naturally on the marked ${support}. align torso/hips with the surface plane. integrate body contact naturally with the surface. allow physically appropriate overlap/occlusion. add realistic contact shadows and fabric compression beneath the body.`;
                    break;
                case 'lookAt':
                    base += `orient head and gaze naturally toward the marked target.`;
                    break;
                case 'interact':
                case 'hold':
                case 'reach':
                    base += `align the actor naturally with the target object/surface interaction. keep the interaction readable and physically plausible. allow physically appropriate overlap/occlusion with the support object.`;
                    break;
                 default:
                    base += `place actor naturally in the marked region.`;
            }
        } else {
            // Prop or ambiguous token
            base += `place naturally on the ${support}. prevent floating and preserve physical scale/perspective.`;
        }
        
        if (intent.relativeToExistingSubject) {
            const relation = intent.placementRelation || 'beside';
            base += ` do NOT replace the existing original subject. Add the new actor/object ${relation} the existing subject.`;
        }
        if (intent.gazeTargetAnnotationId && intent.action !== 'lookAt') {
            base += ` orient head and gaze naturally toward target.`;
        }

        if (isSupportSurfacePlacement) {
            base += ` The support-surface location is mandatory. Do not relocate the actor away from the marked area or into the foreground.`;
        }

        if (intent.poseCompletionMode === 'extendToFullBody') {
            base += ` EXPLICITLY PRESERVE the visible face, hair, and upper-body identity from the source while naturally COMPLETING the missing body appropriate for the ${support}. Do not keep the actor as a bust-only or portrait-like insert.`;
        } else if (intent.preserveIdentity) {
            base += ` preserve explicit actor identity and poses where possible.`;
        }

        if (intent.preserveWardrobe) {
            base += ` preserve wardrobe perfectly.`;
        }

        if (intent.relightMode === 'matchEnvironment') {
            base += ` Do not preserve source-image lighting or source shading. Replace the source shading with destination-environment shading. Fully relight the actor to match the destination environment's ambient light direction, intensity, color temperature, and shadow softness, and avoid a studio-lit or separately photographed appearance.`;
        }

        if (intent.notes) {
            base += ` (Note: ${intent.notes})`;
        }
        
        lines.push(base);
    }
    lines.push('These action instructions must remain secondary to explicit layout/blueprint authority.');
    return lines.join('\n');
};

export const formatRefineIntents = (intents: HumanPlacementIntent[]): string => {
    // Only include actors that have explicit support surfaces requiring relight
    const relightIntents = intents.filter(i => i.supportSurface || i.anchorKind);
    if (relightIntents.length === 0) return '';
    
    const lines = ['SCENARIO-SPECIFIC RELIGHTING & CONTACT:'];
    for (const intent of relightIntents) {
        let base = `- Actor [${intent.actorLabel}]: `;
        const support = intent.supportSurface || intent.anchorKind || 'surface';
        
        // 1) Lock placement & identity
        base += `preserve placement/location exactly. preserve identity, face, hair, clothing, and overall pose. preserve ${support}/background structure. `;
        
        // 2) Aggressive relighting
        base += `Do not preserve source-image lighting or source shading. Replace the source shading with destination-environment shading. Fully relight the actor to match the destination environment. Match ambient color, light direction, intensity, and shadow softness. Avoid a studio-lit or separately photographed appearance. `;
        
        // 3) Support-specific contact
        if (intent.action === 'sit') {
            base += `add realistic seat contact shadows and ground shadow beneath feet/shoes. add subtle environmental bounce/color spill from the seat.`;
        } else if (intent.action === 'lie') {
            base += `add realistic bedding contact shadow/compression and match room light.`;
        } else if (intent.action === 'lean') {
            base += `add realistic support-side contact shadow and bounce.`;
        } else if (intent.action === 'stand' || intent.action === 'walk' || intent.action === 'run') {
            base += `strengthen realistic grounded foot shadows.`;
        }
        
        lines.push(base);
    }
    return lines.join('\n');
};
