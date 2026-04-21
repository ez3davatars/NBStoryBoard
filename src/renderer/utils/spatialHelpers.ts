/**
 * SPATIAL HELPERS
 * Pure functions for geometric and depth calculations.
 * No async, no ML, no side effects.
 */
import type { StageAnnotation, StageToken } from '../context/AppContext';

export type DepthLayer = 'foreground' | 'midground' | 'background';
const toPlacementAction = (value: string | undefined): PlacementIntent['action'] => {
    if (value === 'sit' || value === 'lean') return value;
    return 'stand';
};

interface ActorMinimal {
    scale: number;
    position: { y: number };
    height: number;
    depthLayer?: DepthLayer;
}

interface CanvasMinimal {
    height: number;
}

/**
 * COMPUTE DEPTH SCORE
 * Calculates a normalized depth score (0.0 Near -> 1.0 Far) 
 * using ONLY the provided actor and canvas properties.
 */
export function computeDepthScore(actor: ActorMinimal, canvas: CanvasMinimal): number {
    // 1. scaleNormalized: 0.0 (large/near) -> 1.0 (small/far)
    // Assume scale range [0.2, 2.0]
    const sBase = Math.max(0, Math.min(1, (actor.scale - 0.2) / 1.8));
    const scaleNormalized = 1 - sBase;

    // 2. yNormalized: 0.0 (top/far) -> 1.0 (bottom/near)
    const yNormalized = Math.max(0, Math.min(1, actor.position.y / canvas.height));

    // 3. anchorBias: 0.0 (near) -> 1.0 (far)
    let anchorBias = 0.5; // default midground
    if (actor.depthLayer === 'foreground') anchorBias = 0.0;
    if (actor.depthLayer === 'background') anchorBias = 1.0;

    // 4. Weighted Formula: 
    // depthScore = (scaleNormalized * 0.6) + ((1 - yNormalized) * 0.3) + (anchorBias * 0.1)
    const score = (scaleNormalized * 0.6) + ((1 - yNormalized) * 0.3) + (anchorBias * 0.1);

    return Number(score.toFixed(4));
}

export type PlacementIntent = {
    actorId: string;
    action: 'sit' | 'stand' | 'lean';
    anchorId: string;
    lookAtId?: string;
    poseNotes?: string;
    priority: 'hard' | 'soft';
};

export type AnchorSurface = {
    id: string;
    kind: 'seat' | 'stand' | 'lean';
    label: string;
    rect: { x: number; y: number; w: number; h: number }; // unnormalized for now, matching annotation coords
    surfaceDepth: number;
    floorDepth: number;
    facingDeg?: number;
    hard: boolean;
};

// Helper: infer simple arrow geometry backwards compatibility
const resolveArrowGeometry = (a: StageAnnotation) => {
    if (a.x1 !== undefined && a.x2 !== undefined) {
        return { x1: a.x1, y1: a.y1!, x2: a.x2, y2: a.y2! };
    }
    // Backward compat: inferred from center + rotation/width
    const rad = (a.rotation * Math.PI) / 180;
    const half = (a.width * (a.scaleX || 1)) / 2;
    return {
        x1: a.x - Math.cos(rad) * half,
        y1: a.y - Math.sin(rad) * half,
        x2: a.x + Math.cos(rad) * half,
        y2: a.y + Math.sin(rad) * half,
    };
};

export const buildPlacementIntentsFromAnnotations = (
    annotations: StageAnnotation[],
    tokens: StageToken[]
): PlacementIntent[] => {
    const intents: PlacementIntent[] = [];

    // Find relationships via arrows
    const placeArrows = annotations.filter(a => a.type === 'arrow' && a.relation === 'place');
    const lookArrows = annotations.filter(a => a.type === 'arrow' && a.relation === 'lookAt');

    for (const arrow of placeArrows) {
        // Find token near tail, anchor near head (or use sourceId/targetId)
        const geom = resolveArrowGeometry(arrow);

        let tokenId = arrow.sourceId;
        if (!tokenId) {
            const tk = tokens.find(t =>
                Math.hypot(t.x - geom.x1, (t.y - (t.height || 0) / 2) - geom.y1) < 100
            );
            tokenId = tk?.id;
        }

        let anchorId = arrow.targetId;
        if (!anchorId) {
            const z = annotations.find(an =>
                an.type === 'zone' && an.role === 'anchor' &&
                geom.x2 >= an.x - an.width / 2 && geom.x2 <= an.x + an.width / 2 &&
                geom.y2 >= an.y - an.height / 2 && geom.y2 <= an.y + an.height / 2
            );
            anchorId = z?.id;
        }

        if (tokenId && anchorId) {
            const anchor = annotations.find(a => a.id === anchorId);
            const action = anchor?.anchorKind || 'stand';

            let lookAtId: string | undefined = undefined;
            // Check if there is a look arrow for this token
            const lookArrow = lookArrows.find(la => la.sourceId === tokenId || Math.hypot(resolveArrowGeometry(la).x1 - geom.x1, resolveArrowGeometry(la).y1 - geom.y1) < 100);
            if (lookArrow) {
                if (lookArrow.targetId) lookAtId = lookArrow.targetId;
                else {
                    const lgeom = resolveArrowGeometry(lookArrow);
                    const lookTarget = annotations.find(an =>
                        an.type === 'zone' && an.role === 'lookAt' &&
                        lgeom.x2 >= an.x - an.width / 2 && lgeom.x2 <= an.x + an.width / 2 &&
                        lgeom.y2 >= an.y - an.height / 2 && lgeom.y2 <= an.y + an.height / 2
                    );
                    if (lookTarget) lookAtId = lookTarget.id;
                }
            }

            intents.push({
                actorId: tokenId,
                action: toPlacementAction(action),
                anchorId: anchorId,
                lookAtId: lookAtId,
                priority: arrow.hard ? 'hard' : 'soft'
            });
        }
    }

    return intents;
};

// Extremely basic depth sample helper for node environments missing full DepthService implementation 
export const buildAnchorSurfaceFromZone = (
    zone: StageAnnotation,
    getDepthAtPoint?: (x: number, y: number) => number,
    viewportBox?: { w: number; h: number }
): AnchorSurface => {
    let surfaceDepth = 255;
    let floorDepth = 255;

    // Approximate center of zone
    if (getDepthAtPoint && viewportBox) {
        // We use unnormalized x,y here - normalize for depth map
        const nx = zone.x / viewportBox.w;
        const ny = zone.y / viewportBox.h;
        try {
            surfaceDepth = getDepthAtPoint(nx, ny);
            // floor is slightly below the zone
            floorDepth = getDepthAtPoint(nx, Math.min(1, ny + (zone.height / viewportBox.h)));
        } catch {
            // graceful degrade
        }
    }

    return {
        id: zone.id,
        kind: (zone.anchorKind as 'stand' | 'lean' | 'seat') || 'stand',
        label: zone.label || '',
        rect: { x: zone.x - zone.width/2, y: zone.y - zone.height/2, w: zone.width, h: zone.height },
        surfaceDepth,
        floorDepth,
        hard: !!zone.hard
    };
};

/**
 * Given an anchor surface (e.g. seat zone), build a rough body mask allowance
 * as an array of path coordinates, or return sizing parameters.
 */
export const buildAllowanceMaskFromAnchor = (anchor: AnchorSurface): { x: number, y: number, w: number, h: number } => {
    const { rect } = anchor;
    if (anchor.kind === 'seat') {
         // Expands upward for Torso+Head, outward for legs
         return {
            x: rect.x - (rect.w * 0.2),
            y: rect.y - (rect.h * 1.5),
            w: rect.w * 1.4,
            h: rect.h * 2.5
         };
    }
    // default stand mask
    return {
        x: rect.x,
        y: rect.y - (rect.h * 1.2),
        w: rect.w,
        h: rect.h * 2.2
    };
};

/**
 * Builds a protection mask from depth. Degrades gracefully if utilities are absent.
 */
export const buildForegroundProtectMaskFromDepth = async (
    depthMapUrl: string | null,
    allowanceRect: { x: number, y: number, w: number, h: number },
    anchorSurfaceDepth: number,
    viewportBox: { w: number, h: number },
    getDepthAtSync: (url: string, nx: number, ny: number) => number
): Promise<string | null> => {
    if (!depthMapUrl) return null; // graceful degradation

    const MAX_MASK_DIM = 256;
    const canvas = document.createElement('canvas');
    // Ensure canvas exists in headless or jsdom if necessary
    if (!canvas.getContext) return null;
    
    // Create an intersection of allowance
    const scaleFactor = Math.max(1, Math.max(allowanceRect.w, allowanceRect.h) / MAX_MASK_DIM);
    const maskW = Math.max(1, Math.round(allowanceRect.w / scaleFactor));
    const maskH = Math.max(1, Math.round(allowanceRect.h / scaleFactor));

    canvas.width = maskW;
    canvas.height = maskH;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const imgData = ctx.createImageData(maskW, maskH);
    const d = imgData.data;

    const stepX = allowanceRect.w / maskW;
    const stepY = allowanceRect.h / maskH;
    
    // EPSILON threshold 
    const EPS = 0.05; 

    for (let y = 0; y < maskH; y++) {
        const stageY = allowanceRect.y + (y * stepY);
        const stageYClamped = Math.min(Math.max(stageY, 0), viewportBox.h - 1);

        for (let x = 0; x < maskW; x++) {
            const stageX = allowanceRect.x + (x * stepX);
            const stageXClamped = Math.min(Math.max(stageX, 0), viewportBox.w - 1);
            
            let sceneDepth = 255;
            try {
                sceneDepth = getDepthAtSync(depthMapUrl, stageXClamped / viewportBox.w, stageYClamped / viewportBox.h);
            } catch {
                // Ignore, keep 255
            }

            // Depth Map: White(1.0/255) is near. Black(0.0/0) is far.
            // Protect if scene pixel is CLOSER (higher value) than the anchor surface depth + eps.
            const protect = sceneDepth > (anchorSurfaceDepth + EPS);

            const idx = (y * maskW + x) * 4;
            d[idx] = protect ? 255 : 0;
            d[idx + 1] = protect ? 255 : 0;
            d[idx + 2] = protect ? 255 : 0;
            d[idx + 3] = 255; // Alpha
        }
    }

    ctx.putImageData(imgData, 0, 0);
    return canvas.toDataURL('image/png');
};
