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

export class WearableAnchorEngine {
    static inferClass(propName?: string, prompt?: string, note?: string): WearableClass {
        const text = `${propName || ''} ${prompt || ''} ${note || ''}`.toLowerCase();

        if (/(crown|tiara|hat|cap|helmet|hood|headpiece|veil|turban|wig)/.test(text)) return 'headwear';
        if (/(glasses|eyeglasses|spectacles|goggles|sunglasses|monocle|visor)/.test(text)) return 'eyewear';
        if (/(earring|earrings|ear cuff|earcuff)/.test(text)) return 'earwear';
        if (/(necklace|choker|pendant|chain|collar|medallion)/.test(text)) return 'neckwear';
        if (/(bracelet|watch|wristband|bangle|cuff)/.test(text)) return 'wristwear';
        if (/(belt|waistband|sash)/.test(text)) return 'belt';
        if (/(shoe|shoes|boot|boots|heel|heels|sandal|sandals)/.test(text)) return 'footwear';
        if (/(staff|scepter|sceptre|wand|sword|shield|bag|purse|umbrella|megaphone|book|phone)/.test(text)) return 'held_prop';

        return 'generic_prop';
    }

    static inferHeadwearSubtype(propName?: string, prompt?: string, note?: string): HeadwearSubtype {
        const text = `${propName || ''} ${prompt || ''} ${note || ''}`.toLowerCase();
        
        if (/(crown)/.test(text)) return 'crown';
        if (/(tiara)/.test(text)) return 'tiara';
        if (/(hat|cap)/.test(text)) return 'hat';
        if (/(helmet)/.test(text)) return 'helmet';
        if (/(veil)/.test(text)) return 'veil';
        if (/(hood)/.test(text)) return 'hood';
        if (/(headband)/.test(text)) return 'headband';
        if (/(hairpiece|clip|barrette)/.test(text)) return 'hairpiece';

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
                const headWidthPx = landmarks.headWidthPx || 200;
                
                // Crown width should be constrained to roughly 0.78–0.90 * headWidthPx
                let baseWidth = headWidthPx * 0.84;
                const minTargetWidth = headWidthPx * 0.78;
                const maxTargetWidth = headWidthPx * 0.90;
                const targetWidthPx = Math.max(minTargetWidth, Math.min(maxTargetWidth, baseWidth * scaleModifier));

                const anchorX = landmarks.hairlineCenter?.x ?? landmarks.foreheadCenter?.x ?? landmarks.faceCenter!.x;
                let anchorY = landmarks.hairlineCenter?.y ?? landmarks.foreheadCenter?.y ?? (landmarks.faceCenter!.y - landmarks.faceHeightPx! * 0.42);
                
                if (noteText.includes("lower")) {
                    anchorY += 20;
                    anchorNotes.push("adjusted lower");
                }
                if (noteText.includes("higher")) {
                    anchorY -= 20;
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
                let baseWidth = faceWidthPx * 0.90;
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
