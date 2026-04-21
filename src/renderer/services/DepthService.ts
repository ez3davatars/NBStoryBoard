import type { FloorPlane, OccupiedVolume } from '../context/AppContext';

// Basic cache to avoid re-loading the same depth map image repeatedly
const depthCanvasCache: Record<string, HTMLCanvasElement> = {};
const depthDataCache: Record<string, Uint8Array> = {}; // Synchronous access cache (Legacy)
const depthImageCache = new Map<string, ImageData>();
const isDevMode = Boolean(import.meta.env?.DEV);

export function clearDepthCacheExcept(activeUrl?: string | null) {
    // Clear Canvas Cache
    Object.keys(depthCanvasCache).forEach(key => {
        if (key !== activeUrl) delete depthCanvasCache[key];
    });
    // Clear Legacy Data Cache
    Object.keys(depthDataCache).forEach(key => {
        if (key !== activeUrl) delete depthDataCache[key];
    });
    // Clear New ImageData Cache
    for (const key of depthImageCache.keys()) {
        if (key !== activeUrl) depthImageCache.delete(key);
    }
}

export async function getDepthImageData(url: string): Promise<ImageData | null> {
    if (depthImageCache.has(url)) {
        return depthImageCache.get(url)!;
    }

    const canvas = await getCachedCanvas(url);
    if (!canvas) return null;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    const finalData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    depthImageCache.set(url, finalData);
    return finalData;
}

async function getCachedCanvas(url: string | null): Promise<HTMLCanvasElement | null> {
    if (!url) return null; // Handle null URL early
    if (depthCanvasCache[url]) return depthCanvasCache[url];

    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) {
                resolve(null);
                return;
            }
            ctx.drawImage(img, 0, 0);
            depthCanvasCache[url] = canvas;

            // Pre-cache Uint8 data for synchronous collision checks
            const ctx2d = canvas.getContext('2d', { willReadFrequently: true });
            if (ctx2d) {
                const idata = ctx2d.getImageData(0, 0, canvas.width, canvas.height);
                const raw = idata.data;
                const res = new Uint8Array(canvas.width * canvas.height);
                for (let i = 0; i < raw.length; i += 4) {
                    res[i / 4] = raw[i]; // Grayscale R=G=B, take R
                }
                depthDataCache[url] = res;
            }
            resolve(canvas);
        };
        img.onerror = () => resolve(null);
        img.src = url;
    });
}

/**
 * AUTHORITATIVE DEPTH SERVICE
 * Refactored to a class to support strict runtime immutability guards.
 */
class DepthServiceBase {
    // CONSTANT: Defines the depth convention (White=Near implies higher value is closer)
    readonly DEPTH_NEAR_IS_HIGH = true;

    /**
     * Clamps a depth value so it never goes "below" the ground.
     * With DEPTH_NEAR_IS_HIGH = true, "below" means "smaller value" (farther away)?
     * Wait, White (255) = Near. Black (0) = Far.
     * Floor is "back". Table is "front" (near).
     * If I am at 0.8 (table), and floor is 0.2.
     * I should be allowed to be at 0.8.
     * If I am at 0.1 (behind floor?), I should be clamped to 0.2?
     *
     * User said: "Math.min(d, ground)" if Near = High.
     * Let's trace:
     * Ground = 0.2 (Far/Dark).
     * Table = 0.8 (Near/Bright).
     *
     * If my feet are on table, depthAtFeet = 0.8.
     * Math.min(0.8, 0.2) = 0.2.
     * This pushes me BACK to the floor.
     *
     * Wait. If I am standing on a table, I *should* be at 0.8.
     * The user says: "clamped so they never come 'closer' than the floor plane"
     * "feet never sink below the floor" -> feet shouldn't go deeper than floor?
     *
     * Let's re-read user request:
     * "If depthAtFeet is 'Nearer' (higher value) than the floor (e.g. standing on a table top in the depth map), the actor is 'pushed back' to the floor depth. This effectively 'masks' the actor behind foreground objects."
     *
     * AH! The goal is to putting actors BEHIND tables.
     * "Table occludes only where it should"
     * "feet remain visible" is confusing if they are behind table.
     *
     * Re-reading User:
     * "legs fall behind table in depth space" -> "depth logic hides them"
     * The issue is "feet stop clipping".
     *
     * Correct Logic per User:
     * "Math.min(depthAtFeet, groundDepth)" (assuming Near=High).
     * If Ground=0.2, Table=0.8.
     * Act at Table -> 0.8.
     * Clamped -> 0.2.
     * Actor Depth becomes 0.2 (Floor depth).
     * Actor is drawn at depth 0.2.
     * Table is at depth 0.8 (Z-Buffer / Occlusion logic).
     * Since 0.8 > 0.2, Table IS IN FRONT OF Actor.
     * Actor is OCCLUDED.
     * This sounds correct for "masking".
     *
     * What if I am on the floor?
     * DepthAtFeet = 0.2.
     * Clamped = 0.2.
     * Correct.
     *
     * What if I am floating in air (foreground)?
     * DepthAtFeet (from map? No, map is solid surface).
     * Map at that point is whatever is behind me.
     * If I place actor on a wall which is at 0.5.
     * Ground is 0.2.
     * Clamped -> 0.2.
     * So I stick to the floor.
     *
     * This logic effectively treating the depth map as "The Max Depth Boundary".
     * You can't be closer than the floor?
     * No, "clamped so they never come 'closer' than the floor plane".
     * That means max depth is floor depth (0.2).
     * Anything closer (0.8) is clamped to 0.2.
     * So you are ALWAYS on the floor (or farther?).
     *
     * If I walk behind a pillar (Limit 0.5).
     * Ground 0.2.
     * Map says 0.5.
     * Clamped -> 0.2.
     * I am at 0.2.
     * Pillar is at 0.5.
     * Pillar occludes me. Correct.
     *
     * It seems this logic forces the actor to ALWAYS be on the global floor plane.
     * It prevents "walking up onto the table".
     * It solves "legs in front of table" by putting legs BEHIND table.
     *
     * Okay, I will implement exactly as User requested:
     * DEPTH_NEAR_IS_HIGH = true;
     * clamp = Math.min(d, ground);
     */
    clampDepthToGround(depth: number, ground: number): number {
        return this.DEPTH_NEAR_IS_HIGH
            ? Math.min(depth, ground)
            : Math.max(depth, ground);
    }

    /**
     * Clears all cached depth data EXCEPT for the currently active URL.
     * Prevents memory leaks in long-running sessions.
     */
    clearCacheExcept(activeUrl?: string | null) {
        clearDepthCacheExcept(activeUrl);
    }

    async computeGroundDepth(depthMapUrl: string): Promise<number> {
        const imageData = await getDepthImageData(depthMapUrl);
        if (!imageData) return 0.5;

        const { data, width, height } = imageData;

        // Sample bottom 12%
        const startY = Math.floor(height * 0.88);
        const values: number[] = [];



        // Flattened loop for speed
        const startIndex = startY * width * 4;
        for (let i = startIndex; i < data.length; i += 4) {
            values.push(data[i] / 255);
        }

        if (values.length === 0) return 0.5;
        values.sort((a, b) => a - b);
        return values[Math.floor(values.length / 2)];
    }


    /**
     * Samples a depth map at a specific normalized (0-1) point.
     * Returns a value from 0.0 (Far) to 1.0 (Near).
     */
    async getDepthAtPoint(depthMapUrl: string, x: number, y: number): Promise<number> {
        const data = depthDataCache[depthMapUrl];
        const canvas = depthCanvasCache[depthMapUrl];
        if (data && canvas) {
            const px = Math.floor(x * canvas.width);
            const py = Math.floor(y * canvas.height);
            const safeX = Math.max(0, Math.min(canvas.width - 1, px));
            const safeY = Math.max(0, Math.min(canvas.height - 1, py));
            return data[safeY * canvas.width + safeX] / 255;
        }

        const canv = await getCachedCanvas(depthMapUrl);
        if (!canv) return 0.5;

        const ctx = canv.getContext('2d', { willReadFrequently: true });
        if (!ctx) return 0.5;

        // RENDERER GUARDRAIL: Ensure context is pristine for sampling
        if (isDevMode) {
            if (ctx.filter !== 'none' || (ctx.getTransform && !ctx.getTransform().isIdentity)) {
                throw new Error("DEPTH IMMUTABILITY VIOLATION: Attempted to sample depth through a modified or filtered context. Depth maps must be sampled as-is.");
            }
        }

        const px = Math.floor(x * canv.width);
        const py = Math.floor(y * canv.height);

        const safeX = Math.max(0, Math.min(canv.width - 1, px));
        const safeY = Math.max(0, Math.min(canv.height - 1, py));

        const pixel = ctx.getImageData(safeX, safeY, 1, 1).data;
        return pixel[0] / 255;
    }

    /**
     * Synchronous depth sampling for collision detection (Requires pre-cached data).
     */
    getDepthAtPointSync(depthMapUrl: string | null, x: number, y: number): number {
        if (!depthMapUrl) return 0.5;
        const data = depthDataCache[depthMapUrl];
        const canvas = depthCanvasCache[depthMapUrl];
        if (!data || !canvas) return 0.5;

        const px = Math.max(0, Math.min(canvas.width - 1, Math.floor(x * canvas.width)));
        const py = Math.max(0, Math.min(canvas.height - 1, Math.floor(y * canvas.height)));
        return data[py * canvas.width + px] / 255;
    }

    /**
     * Generates a data URL for an alpha mask where pixels are opaque
     * only if the background depth at that point is >= tokenDepth.
     */
    async generateOcclusionMask(
        depthMapUrl: string,
        tokenDepth: number,
        targetWidth: number,
        targetHeight: number,
        tokenRect?: { x: number; y: number; w: number; h: number }
    ): Promise<{ maskUrl: string; visibilityRatio: number }> {
        const depthCanvas = await getCachedCanvas(depthMapUrl);
        if (!depthCanvas) return { maskUrl: '', visibilityRatio: 1.0 };

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return { maskUrl: '', visibilityRatio: 1.0 };

        // RENDERER GUARDRAIL: Immutability Check
        if (isDevMode && ctx.filter !== 'none') {
            throw new Error("DEPTH IMMUTABILITY VIOLATION: Derived occlusion masks must not apply filters to authoritative depth data.");
        }

        // Draw depth map stretched to viewport
        ctx.drawImage(depthCanvas, 0, 0, targetWidth, targetHeight);

        const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
        const data = imageData.data;
        const threshold = tokenDepth * 255;

        let visiblePixels = 0;
        let totalTokenPixels = 0;

        // Bounding box for sampling (if provided)
        const sampleX = tokenRect ? Math.floor(Math.max(0, tokenRect.x)) : 0;
        const sampleY = tokenRect ? Math.floor(Math.max(0, tokenRect.y)) : 0;
        const sampleW = tokenRect ? Math.floor(Math.min(targetWidth - sampleX, tokenRect.w)) : targetWidth;
        const sampleH = tokenRect ? Math.floor(Math.min(targetHeight - sampleY, tokenRect.h)) : targetHeight;

        for (let i = 0; i < data.length; i += 4) {
            const isVisible = data[i] <= threshold;
            data[i] = 255;
            data[i + 1] = 255;
            data[i + 2] = 255;
            data[i + 3] = isVisible ? 255 : 0;

            // Track visibility ratio within the token's bounding box
            const px = (i / 4) % targetWidth;
            const py = Math.floor((i / 4) / targetWidth);

            if (px >= sampleX && px < sampleX + sampleW && py >= sampleY && py < sampleY + sampleH) {
                totalTokenPixels++;
                if (isVisible) visiblePixels++;
            }
        }

        ctx.putImageData(imageData, 0, 0);

        return {
            maskUrl: canvas.toDataURL(),
            visibilityRatio: totalTokenPixels > 0 ? visiblePixels / totalTokenPixels : 1.0
        };
    }

    /**
     * Floor planes are derived, not authoritative.
     * Only high-confidence detections may be used for grounding.
     * Fallback detections require explicit manual override.
     */
    /**
     * V1 FLOOR PLANE DETECTION
     * Identifies a stable floor depth using ROI sampling and histogram mode estimation.
     * V2+ Consideration: Support for multi-plane floor detection (stairs, platforms).
     */
    async detectFloorPlane(depthMapUrl: string): Promise<FloorPlane | null> {
        const canvas = await getCachedCanvas(depthMapUrl);
        if (!canvas) return null;

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return null;

        const roiHeight = Math.floor(canvas.height * 0.18); // Bottom 18%
        const roiY = canvas.height - roiHeight;

        const imageData = ctx.getImageData(0, roiY, canvas.width, roiHeight);
        const data = imageData.data;

        const histogram = new Uint32Array(256);
        const values: number[] = [];

        for (let i = 0; i < data.length; i += 4) {
            const depth = data[i];
            // Filter extreme near-depth (furniture/noise)
            if (depth < 230) {
                histogram[depth]++;
                values.push(depth);
            }
        }

        if (values.length === 0) return null;

        // Find Mode (Most frequent depth band)
        let mode = 0;
        let maxFreq = 0;
        for (let i = 0; i < 256; i++) {
            if (histogram[i] > maxFreq) {
                maxFreq = histogram[i];
                mode = i;
            }
        }

        // Confidence Check: Is the mode dominant enough?
        // IMPROVEMENT: Sum neighborhood (mode +/- 2) to account for gradient/noise
        let peakMass = 0;
        for (let i = Math.max(0, mode - 2); i <= Math.min(255, mode + 2); i++) {
            peakMass += histogram[i];
        }

        const dominanceRatio = peakMass / values.length;
        const confidence: FloorPlane['confidence'] = dominanceRatio > 0.05 ? 'high' : 'fallback';

        let resultDepth = mode;
        if (confidence === 'fallback') {
            // Heuristic Fallback: Median
            values.sort((a, b) => a - b);
            resultDepth = values[Math.floor(values.length / 2)];
            console.warn(`[DepthService] FLOOR DETECTION FALLBACK: Using heuristic floor depth (${resultDepth})`);
        }

        return {
            depth: resultDepth,
            confidence,
            computedAt: Date.now()
        };
    }

    /**
     * Occupied volumes are conservative, derived representations of scene geometry.
     * Automatic detection is advisory.
     * Manual volumes are authoritative and take precedence.
     */
    /**
     * V1 OCCUPIED VOLUME DETECTION
     * Detects large foreground regions above the floor plane.
     * V2+ Consideration: Semantic object labeling and AI-driven segmentation.
     */
    async detectOccupiedVolumes(depthMapUrl: string, floorDepth: number): Promise<OccupiedVolume[]> {
        const canvas = await getCachedCanvas(depthMapUrl);
        if (!canvas) return [];

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return [];

        const width = canvas.width;
        const height = canvas.height;
        const floorY = height * 0.82; // Exclude bottom floor band (v1 heuristic)
        const threshold = floorDepth + 45; // Depth must be closer than floor + threshold

        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        // Binary mask of candidate pixels
        const mask = new Uint8Array(width * height);
        for (let y = 0; y < floorY; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                const d = data[idx];
                if (d > threshold && d < 255) {
                    mask[y * width + x] = 1;
                }
            }
        }

        const visited = new Uint8Array(width * height);
        const volumes: OccupiedVolume[] = [];
        const minArea = (width * height) * 0.01; // 1% of image area for filtering

        // Simple BFS for Connected Components
        for (let y = 0; y < floorY; y += 4) { // Step to speed up
            for (let x = 0; x < width; x += 4) {
                const idx = y * width + x;
                if (mask[idx] === 1 && visited[idx] === 0) {
                    // Start new component
                    const component: number[] = [];
                    const queue = [idx];
                    visited[idx] = 1;

                    let minX = x, maxX = x, minY = y, maxY = y;
                    let minD = 255, maxD = 0;

                    while (queue.length > 0) {
                        const curr = queue.shift()!;
                        const cx = curr % width;
                        const cy = Math.floor(curr / width);

                        component.push(curr);

                        // Track bounds
                        if (cx < minX) minX = cx;
                        if (cx > maxX) maxX = cx;
                        if (cy < minY) minY = cy;
                        if (cy > maxY) maxY = cy;

                        const dValue = data[curr * 4];
                        if (dValue < minD) minD = dValue;
                        if (dValue > maxD) maxD = dValue;
                        // Check 4-connected neighbors with step
                        const neighbors = [
                            { nx: cx + 4, ny: cy },
                            { nx: cx - 4, ny: cy },
                            { nx: cx, ny: cy + 4 },
                            { nx: cx, ny: cy - 4 }
                        ];

                        for (const { nx, ny } of neighbors) {
                            if (nx >= 0 && nx < width && ny >= 0 && ny < floorY) {
                                const nidx = ny * width + nx;
                                if (mask[nidx] === 1 && visited[nidx] === 0) {
                                    visited[nidx] = 1;
                                    queue.push(nidx);
                                }
                            }
                        }

                        // Safety break for extreme cases
                        if (component.length > 5000) break;
                    }

                    if (component.length * 16 > minArea) { // *16 because of step
                        // Padding (5%)
                        const padW = (maxX - minX) * 0.05;
                        const padH = (maxY - minY) * 0.05;

                        volumes.push({
                            id: `vol-${Date.now()}-${volumes.length}`,
                            footprint: {
                                x: Math.max(0, minX - padW),
                                y: Math.max(0, minY - padH),
                                w: (maxX - minX) + (padW * 2),
                                h: (maxY - minY) + (padH * 2)
                            },
                            minDepth: minD,
                            maxDepth: maxD,
                            heightEstimate: Math.max(0, (floorY - minY) / height),
                            confidence: 'high'
                        });
                    }
                }
            }
        }

        if (volumes.length === 0) {
            console.log("[DepthService] NO OCCUPIED VOLUMES DETECTED");
        }

        return volumes;
    }
}

// HARD IMMUTABILITY GUARD
// Freeze the prototype to prevent runtime monkey-patching or method redirection.
try {
    Object.freeze(DepthServiceBase.prototype);
    if (!Object.isFrozen(DepthServiceBase.prototype)) {
        throw new Error("Failed to freeze DepthService prototype.");
    }
} catch (e) {
    console.error("CRITICAL: DepthService Immutability Guard Failed!", e);
    if (isDevMode) {
        throw new Error("FATAL: DepthService could not be locked for immutability. This is required for architectural safety.");
    }
}

export const DepthService = new DepthServiceBase();
// Also freeze the instance for double-layer protection
Object.freeze(DepthService);
