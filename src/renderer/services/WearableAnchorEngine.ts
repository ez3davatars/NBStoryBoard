import type { WearableLandmarks, Point2D } from './WearableLandmarkService';

export type WearableClass =
    | 'headwear'
    | 'eyewear'
    | 'earwear'
    | 'neckwear'
    | 'wristwear'
    | 'belt'
    | 'footwear'
    | 'held_prop'
    | 'generic_prop';

export type HeadwearSubtype =
    | 'crown'
    | 'tiara'
    | 'hat'
    | 'helmet'
    | 'veil'
    | 'hood'
    | 'headband'
    | 'hairpiece'
    | 'generic_headwear';

export type WearableAnchorContract = {
    fitClass: WearableClass;
    subtype?: HeadwearSubtype;
    anchorCenter: Point2D;
    targetWidthPx: number;
    targetHeightPx?: number;
    rotationDeg: number;
    verticalMode?: 'headwear_base_lock' | 'centered' | 'below_anchor';
    anchorNotes: string[];
};

export type WearablePlacement = WearableAnchorContract & {
    finalRect: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
};

type HeadwearSizingProfile = {
    widthFactor: number;
    minFactor: number;
    maxFactor: number;
    yOffsetFaceFactor: number;
};

function getHeadwearSizingProfile(subtype?: HeadwearSubtype): HeadwearSizingProfile {
    switch (subtype) {
        case 'crown':
            return { widthFactor: 0.74, minFactor: 0.62, maxFactor: 0.82, yOffsetFaceFactor: -0.02 };
        case 'tiara':
            return { widthFactor: 0.72, minFactor: 0.60, maxFactor: 0.80, yOffsetFaceFactor: -0.02 };
        case 'hat':
            return { widthFactor: 0.88, minFactor: 0.74, maxFactor: 1.08, yOffsetFaceFactor: -0.08 };
        case 'helmet':
            return { widthFactor: 1.02, minFactor: 0.86, maxFactor: 1.18, yOffsetFaceFactor: 0.02 };
        case 'hood':
            return { widthFactor: 1.08, minFactor: 0.92, maxFactor: 1.24, yOffsetFaceFactor: 0.00 };
        case 'veil':
            return { widthFactor: 0.92, minFactor: 0.72, maxFactor: 1.18, yOffsetFaceFactor: -0.04 };
        case 'headband':
            return { widthFactor: 0.86, minFactor: 0.72, maxFactor: 0.98, yOffsetFaceFactor: -0.02 };
        case 'hairpiece':
            return { widthFactor: 0.42, minFactor: 0.24, maxFactor: 0.70, yOffsetFaceFactor: -0.12 };
        case 'generic_headwear':
        default:
            return { widthFactor: 0.78, minFactor: 0.64, maxFactor: 0.96, yOffsetFaceFactor: -0.08 };
    }
}

export class WearableAnchorEngine {
    static inferClass(propName?: string, prompt?: string, note?: string): WearableClass {
        const text = `${propName || ''} ${prompt || ''} ${note || ''}`.toLowerCase();
        const noteText = (note || '').toLowerCase();

        if (/\b(crown|tiara|hat|cap|helmet|hood|headpiece|veil|turban|wig|headband|hairpiece|fascinator|barrette|bonnet|beanie|beret|fedora|baseball cap|cowboy hat)\b/.test(text)) return 'headwear';
        if (/(glasses|eyeglasses|spectacles|goggles|sunglasses|monocle|visor)/.test(text)) return 'eyewear';
        if (/(earring|earrings|ear cuff|earcuff)/.test(text)) return 'earwear';
        if (/(necklace|choker|pendant|chain|collar|medallion)/.test(text)) return 'neckwear';
        if (/(bracelet|watch|wristband|bangle|cuff)/.test(text)) return 'wristwear';
        if (/(belt|waistband|sash)/.test(text)) return 'belt';
        if (/(shoe|shoes|boot|boots|heel|heels|sandal|sandals)/.test(text)) return 'footwear';
        if (/(staff|scepter|sceptre|wand|sword|shield|bag|purse|umbrella|megaphone|book|phone)/.test(text)) return 'held_prop';

        const hasHeadTarget = /\b(head|hair|forehead|scalp)\b/i.test(noteText);
        const hasWearAction = /\b(fit|fits|fitted|wear|worn|wearing|put|place|placed|attach|attached|on|onto)\b/i.test(noteText);
        const hasExplicitHeadPhrase =
            /\b(on|onto|over|above|top of)\s+(her|his|their|the)?\s*(head|hair|forehead|scalp)\b/i.test(noteText) ||
            /\b(headwear|headpiece)\b/i.test(noteText);
        const isSceneLikeHeadPhrase = /\b(background|behind|backdrop|scene|scenery|halo|frame)\b/i.test(noteText);

        if (!isSceneLikeHeadPhrase && hasHeadTarget && (hasWearAction || hasExplicitHeadPhrase)) {
            return 'headwear';
        }

        return 'generic_prop';
    }

    static inferHeadwearSubtype(propName?: string, prompt?: string, note?: string): HeadwearSubtype {
        const text = `${propName || ''} ${prompt || ''} ${note || ''}`.toLowerCase();
        
        if (/\bcrown\b/.test(text)) return 'crown';
        if (/\btiara\b/.test(text)) return 'tiara';
        if (/\b(hat|cap|beanie|beret|fedora|cowboy hat|baseball cap|bonnet)\b/.test(text)) return 'hat';
        if (/\bhelmet\b/.test(text)) return 'helmet';
        if (/\bveil\b/.test(text)) return 'veil';
        if (/\bhood\b/.test(text)) return 'hood';
        if (/\bheadband\b/.test(text)) return 'headband';
        if (/\b(hairpiece|clip|barrette|fascinator|wig)\b/.test(text)) return 'hairpiece';

        return 'generic_headwear';
    }

    static computePlacement(
        fitClass: WearableClass,
        landmarks: WearableLandmarks,
        note?: string,
        subtype?: HeadwearSubtype
    ): WearableAnchorContract {
        const noteText = (note || "").toLowerCase();
        const anchorNotes: string[] = [];

        // Check for specific note modifiers
        let scaleModifier = 1.0;
        if (noteText.includes("oversized") || noteText.includes("large")) scaleModifier = 1.15;
        if (noteText.includes("small") || noteText.includes("tiny")) scaleModifier = 0.85;

        let rotationDeg = 0;
        
        switch (fitClass) {
            case 'headwear': {
                const faceCenter = landmarks.faceCenter || { x: landmarks.imageWidth / 2, y: landmarks.imageHeight / 2 };
                const faceWidthPx = landmarks.faceWidthPx || 220;
                const headWidthPx = landmarks.headWidthPx || faceWidthPx * 1.15;
                const faceHeightPx = landmarks.faceHeightPx || landmarks.headHeightPx || 300;
                const profile = getHeadwearSizingProfile(subtype);
                
                // Use subtype-specific sizing so each headwear category lands at a natural scale.
                const baseWidth = headWidthPx * profile.widthFactor * scaleModifier;
                const minTargetWidth = headWidthPx * profile.minFactor;
                const maxTargetWidth = headWidthPx * profile.maxFactor;
                const targetWidthPx = Math.max(minTargetWidth, Math.min(maxTargetWidth, baseWidth));

                const anchorX = landmarks.hairlineCenter?.x ?? landmarks.foreheadCenter?.x ?? faceCenter.x;
                let anchorY =
                    landmarks.hairlineCenter?.y ??
                    landmarks.foreheadCenter?.y ??
                    (faceCenter.y - faceHeightPx * 0.42);
                anchorY += faceHeightPx * profile.yOffsetFaceFactor;
                
                if (noteText.includes("lower")) {
                    anchorY += faceHeightPx * 0.05;
                    anchorNotes.push("adjusted lower");
                }
                if (noteText.includes("higher")) {
                    anchorY -= faceHeightPx * 0.05;
                    anchorNotes.push("adjusted higher");
                }

                // Default rotation is 0; optional: infer head tilt from eyes
                if (landmarks.leftEye && landmarks.rightEye) {
                    const dx = landmarks.rightEye.x - landmarks.leftEye.x;
                    const dy = landmarks.rightEye.y - landmarks.leftEye.y;
                    rotationDeg = Math.atan2(dy, dx) * (180 / Math.PI);
                    // clamp rotation for sanity
                    if (Math.abs(rotationDeg) > 25) rotationDeg = 0;
                }

                return {
                    fitClass,
                    subtype,
                    anchorCenter: { x: anchorX, y: anchorY },
                    targetWidthPx,
                    rotationDeg,
                    verticalMode: 'headwear_base_lock',
                    anchorNotes
                };
            }

            case 'eyewear': {
                const faceWidthPx = landmarks.faceWidthPx || 200;
                
                // Glasses width constrained to roughly 0.82–0.92 * faceWidthPx
                const baseWidth = faceWidthPx * 0.90;
                const targetWidthPx = baseWidth * scaleModifier;

                // Bridge aligns to noseBridge
                const anchorCenter = landmarks.noseBridge || landmarks.faceCenter || { x: 0, y: 0 };

                // Frame center aligns midway between eyes
                if (landmarks.leftEye && landmarks.rightEye) {
                    const dx = landmarks.rightEye.x - landmarks.leftEye.x;
                    const dy = landmarks.rightEye.y - landmarks.leftEye.y;
                    rotationDeg = Math.atan2(dy, dx) * (180 / Math.PI);
                    
                    // Recalculate anchor to be perfectly between eyes horizontally
                    anchorCenter.x = (landmarks.leftEye.x + landmarks.rightEye.x) / 2;
                }

                if (noteText.includes("lower")) anchorCenter.y += 10;
                if (noteText.includes("higher")) anchorCenter.y -= 10;

                return {
                    fitClass,
                    anchorCenter,
                    targetWidthPx,
                    rotationDeg,
                    verticalMode: 'centered',
                    anchorNotes
                };
            }

            default:
                return {
                    fitClass,
                    anchorCenter: landmarks.faceCenter || { x: landmarks.imageWidth / 2, y: landmarks.imageHeight / 2 },
                    targetWidthPx: landmarks.faceWidthPx || 200,
                    rotationDeg: 0,
                    verticalMode: 'centered',
                    anchorNotes: ["Fallback generic placement"]
                };
        }
    }
}
