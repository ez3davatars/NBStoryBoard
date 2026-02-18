/**
 * SPATIAL HELPERS
 * Pure functions for geometric and depth calculations.
 * No async, no ML, no side effects.
 */

export type DepthLayer = 'foreground' | 'midground' | 'background';

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
