import { FaceMesh } from '@mediapipe/face_mesh';
import type { Results } from '@mediapipe/face_mesh';

export type Point2D = { x: number; y: number };

export type WearableLandmarks = {
    imageWidth: number;
    imageHeight: number;

    faceCenter?: Point2D;
    foreheadCenter?: Point2D;
    hairlineCenter?: Point2D;
    leftEye?: Point2D;
    rightEye?: Point2D;
    noseBridge?: Point2D;
    chin?: Point2D;
    leftEar?: Point2D;
    rightEar?: Point2D;
    neckBase?: Point2D;
    leftShoulder?: Point2D;
    rightShoulder?: Point2D;
    leftWrist?: Point2D;
    rightWrist?: Point2D;
    waistCenter?: Point2D;
    leftAnkle?: Point2D;
    rightAnkle?: Point2D;

    headWidthPx?: number;
    headHeightPx?: number;
    faceWidthPx?: number;
    faceHeightPx?: number;
    shoulderWidthPx?: number;
    wristWidthPx?: number;
    waistWidthPx?: number;
};

// Singleton instance to prevent constant reinitialization
let faceMeshInstance: FaceMesh | null = null;
let initializationPromise: Promise<void> | null = null;

function getFaceMeshInstance(): Promise<FaceMesh> {
    if (!faceMeshInstance) {
        faceMeshInstance = new FaceMesh({
            locateFile: (file) => {
                // Return local public asset path
                return `/mediapipe/face_mesh/${file}`;
            }
        });
        
        faceMeshInstance.setOptions({
            maxNumFaces: 1,
            refineLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });

        initializationPromise = faceMeshInstance.initialize().catch(err => {
            console.error("Failed to initialize FaceMesh", err);
            faceMeshInstance = null;
            initializationPromise = null;
            throw err;
        });
    }

    return initializationPromise!.then(() => faceMeshInstance!);
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

function extractNonBlackBounds(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number
) {
    const { data } = ctx.getImageData(0, 0, width, height);

    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];

            const isVisible = a > 10;
            const isNotBlack = (r + g + b) > 30;

            if (isVisible && isNotBlack) {
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
            }
        }
    }

    if (maxX < minX || maxY < minY) return null;

    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;

    return {
        x: minX,
        y: minY,
        width: bw,
        height: bh,
        centerX: minX + bw / 2,
        centerY: minY + bh / 2
    };
}

export class WearableLandmarkService {
    static async detect(imageUrl: string): Promise<WearableLandmarks> {
        const img = await loadImageElement(imageUrl);
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;

        const baseLandmarks: WearableLandmarks = {
            imageWidth: w,
            imageHeight: h
        };

        return new Promise<WearableLandmarks>((resolve) => {
            let faceMeshResolved = false;
            let didResolve = false;

            const resolveOnce = (val: WearableLandmarks) => {
                if (didResolve) return;
                didResolve = true;
                resolve(val);
            };

            const fallback = (reason: string, err?: unknown) => {
                if (err) {
                    console.warn(`WearableLandmarkService: ${reason}. Using silhouette fallback.`, err);
                } else {
                    console.warn(`WearableLandmarkService: ${reason}. Using silhouette fallback.`);
                }
                resolveOnce(WearableLandmarkService.fallbackSilhouetteDetection(img));
            };

            getFaceMeshInstance().then((faceMesh) => {
                faceMesh.onResults((results: Results) => {
                    faceMeshResolved = true;
                    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
                        const landmarks = results.multiFaceLandmarks[0];

                        // Map MediaPipe landmarks (normalized 0-1) to pixel coordinates
                        const pt = (index: number): Point2D => ({
                            x: landmarks[index].x * w,
                            y: landmarks[index].y * h
                        });

                        // standard IDs
                        const noseBridge = pt(168);
                        const chin = pt(152);
                        const foreheadCenter = pt(10);
                        const hairlineCenter = pt(10); // Approximation, usually 10 is high enough
                        const leftEye = pt(159); // top of left eye
                        const rightEye = pt(386); // top of right eye
                        const leftEar = pt(234); // left cheek/ear edge
                        const rightEar = pt(454); // right cheek/ear edge

                        const faceWidthPx = Math.abs(rightEar.x - leftEar.x);
                        const faceHeightPx = Math.abs(chin.y - foreheadCenter.y);

                        resolveOnce({
                            ...baseLandmarks,
                            faceCenter: { x: noseBridge.x, y: (noseBridge.y + chin.y) / 2 },
                            foreheadCenter,
                            hairlineCenter,
                            leftEye,
                            rightEye,
                            noseBridge,
                            chin,
                            leftEar,
                            rightEar,
                            faceWidthPx,
                            faceHeightPx,
                            headWidthPx: faceWidthPx * 1.15, // Approximate skull width based on face width
                            headHeightPx: faceHeightPx * 1.2
                        });
                    } else {
                        fallback("No face detected");
                    }
                });

                faceMesh.send({ image: img }).catch((fmError) => {
                    fallback("FaceMesh failed to run", fmError);
                });

                // Set a timeout just in case it hangs
                setTimeout(() => {
                    if (!faceMeshResolved) {
                        fallback("FaceMesh timed out");
                    }
                }, 3000);
            }).catch((fmError) => {
                fallback("FaceMesh failed to initialize", fmError);
            });
        });
    }

    private static fallbackSilhouetteDetection(img: HTMLImageElement): WearableLandmarks {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error("Failed to get 2d context for fallback detection");

        ctx.drawImage(img, 0, 0, w, h);
        const bounds = extractNonBlackBounds(ctx, w, h);

        if (!bounds) {
            // Ultimate fallback if completely black/transparent
            return { imageWidth: w, imageHeight: h };
        }

        // Estimate using silhouette bounds
        // Assume head is the top 16% of the silhouette width
        const headWidthPx = 0.16 * w;
        const headHeightPx = 0.16 * h;

        // Position head near the top center of the silhouette
        const headCenterX = bounds.centerX;
        const headTopY = bounds.y + bounds.height * 0.05;
        const headCenterY = headTopY + headHeightPx / 2;

        return {
            imageWidth: w,
            imageHeight: h,
            faceCenter: { x: headCenterX, y: headCenterY },
            foreheadCenter: { x: headCenterX, y: headTopY },
            hairlineCenter: { x: headCenterX, y: headTopY - (headHeightPx * 0.1) },
            noseBridge: { x: headCenterX, y: headCenterY - (headHeightPx * 0.1) },
            leftEye: { x: headCenterX - headWidthPx * 0.2, y: headCenterY - (headHeightPx * 0.15) },
            rightEye: { x: headCenterX + headWidthPx * 0.2, y: headCenterY - (headHeightPx * 0.15) },
            chin: { x: headCenterX, y: headTopY + headHeightPx },
            leftEar: { x: headCenterX - headWidthPx / 2, y: headCenterY },
            rightEar: { x: headCenterX + headWidthPx / 2, y: headCenterY },
            faceWidthPx: headWidthPx * 0.85,
            faceHeightPx: headHeightPx * 0.8,
            headWidthPx,
            headHeightPx,
        };
    }
}
