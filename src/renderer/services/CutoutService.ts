import { removeBackground } from "@imgly/background-removal";
import type { Config } from "@imgly/background-removal";

export type CutoutResult = {
    cutoutUrl: string;
    alphaMaskUrl: string;
};

export class CutoutService {

    /**
     * Resolves the proper local asset path based on the Vite/Electron runtime environment.
     * Must end with a trailing slash as per @imgly documentation.
     */
    private static getLocalAssetPath(): string {
        // Use a safe origin construction that supports both web dev and Electron 'app://' protocols
        let origin = '';
        if (typeof window !== 'undefined' && window.location && window.location.origin) {
            origin = window.location.origin;
            // Electron sometimes reports origin as 'null' or 'file://' depending on protocol intercept. 
            // In these cases, falling back to a clean absolute path helps.
            if (origin === 'null' || origin === 'file://') {
                origin = '';
            }
        }
        
        // Ensure standard trailing slash format
        return `${origin}/assets/imgly/`;
    }

    /**
     * Pre-validates that the required local models exist to avoid cryptic silent library failures.
     */
    private static async validateLocalAssets(basePath: string): Promise<void> {
        // As of @imgly/background-removal 1.7.0, resources.json is strictly required to map assets.
        const requiredFiles = [
            `${basePath}resources.json`,
            `${basePath}isnet_fp16.onnx`
        ];

        for (const fileUrl of requiredFiles) {
            try {
                const headRes = await fetch(fileUrl, { method: 'HEAD' });
                if (!headRes.ok) {
                    throw new Error(`HTTP ${headRes.status} on ${fileUrl}`);
                }
            } catch (error) {
                console.error(`[CutoutService] Asset Validation Failed for ${fileUrl}:`, error);
                throw new Error(
                    `Local @imgly background removal models are missing or unreachable.\n` +
                    `The app requires 'resources.json', 'isnet_fp16.onnx' and associated WASM files to be packaged locally.\n` +
                    `Expected path: public/assets/imgly/ (Resolving to: ${basePath})\n` +
                    `Original Error: ${error instanceof Error ? error.message : 'Unknown'}`
                );
            }
        }
    }

    /**
     * Builds and pre-validates a safe local Configuration object for @imgly calls globally.
     */
    static async getImglyConfig(onProgress?: (key: string, current: number, total: number) => void): Promise<Config> {
        const localPath = this.getLocalAssetPath();
        await this.validateLocalAssets(localPath);
        return {
            publicPath: localPath,
            model: "isnet_fp16",
            progress: onProgress || (() => {})
        };
    }

    /**
     * Checks if an image blob already has a transparent background.
     */
    private static hasTransparency(blob: Blob): Promise<boolean> {
        return new Promise((resolve) => {
            const tempUrl = URL.createObjectURL(blob);
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                // Downscale for performance
                const MAX_SIZE = 128;
                const scale = Math.min(MAX_SIZE / img.width, MAX_SIZE / img.height, 1);
                canvas.width = Math.max(1, Math.floor(img.width * scale));
                canvas.height = Math.max(1, Math.floor(img.height * scale));
                
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    URL.revokeObjectURL(tempUrl);
                    resolve(false);
                    return;
                }
                
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imageData.data;
                
                let transparentPixels = 0;
                const totalPixels = data.length / 4;
                
                for (let i = 0; i < data.length; i += 4) {
                    if (data[i + 3] < 20) { // Check for mostly transparent pixels
                        transparentPixels++;
                    }
                }
                
                URL.revokeObjectURL(tempUrl);
                // If more than 5% of the image is transparent, assume it's already a cutout
                resolve((transparentPixels / totalPixels) > 0.05);
            };
            img.onerror = () => {
                URL.revokeObjectURL(tempUrl);
                resolve(false);
            };
            img.src = tempUrl;
        });
    }

    /**
     * Processes an image URL to remove its background.
     * Returns a transparent cutout PNG and an alpha mask PNG as Data URLs.
     */
    static async processImage(
        imageUrl: string,
        onProgress?: (msg: string) => void,
        onModelProgress?: (key: string, current: number, total: number) => void,
        bypassRefinement: boolean = false
    ): Promise<CutoutResult> {
        try {
            if (onProgress) onProgress("Fetching image...");
            
            // 1. Fetch image as blob handle both local and remote URLs safely
            const res = await fetch(imageUrl);
            const blob = await res.blob();
            
            // 2. Check if already transparent to prevent artifacts from double-processing
            const isAlreadyTransparent = await this.hasTransparency(blob);
            
            if (isAlreadyTransparent) {
                console.log(`[CutoutService] Image already transparent, skipping AI cutout for: ${imageUrl}`);
                if (onProgress) onProgress("Image already transparent, generating mask...");
                
                // Need to use object URL since raw imageUrl might be a local path that taints canvas in generateAlphaMaskFromCutout
                const tempUrl = URL.createObjectURL(blob);
                const alphaMaskUrl = await this.generateAlphaMaskFromCutout(tempUrl);
                
                return {
                    cutoutUrl: tempUrl, // Return the safe object URL
                    alphaMaskUrl
                };
            }

            if (onProgress) onProgress("Running AI isolation...");

            const config = await this.getImglyConfig(onModelProgress);
            console.log(`[CutoutService] Booting imgly with resolved publicPath: "${config.publicPath}"`);
            
            const rawCutoutBlob = await removeBackground(blob, config);
            const blobResult = bypassRefinement 
                ? rawCutoutBlob 
                : await this.refineCutoutForForegroundPreservation(blob, rawCutoutBlob);

            // 3. Create Cutout URL
            const cutoutUrl = URL.createObjectURL(blobResult);

            if (onProgress) onProgress("Generating alpha mask...");

            // 4. Generate Alpha Mask (White shape, black background)
            const alphaMaskUrl = await this.generateAlphaMaskFromCutout(cutoutUrl);

            return {
                cutoutUrl,
                alphaMaskUrl
            };

        } catch (error: unknown) {
            console.error("[CutoutService] Failed to isolate subject:", error);
            throw error;
        }
    }

    private static async blobToImage(blob: Blob): Promise<HTMLImageElement> {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(blob);
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
                URL.revokeObjectURL(url);
                resolve(img);
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error("Failed to decode blob as image"));
            };
            img.src = url;
        });
    }

    /**
     * Conservative matte recovery pass:
     * - Preserves confident model output.
     * - Recovers edge pixels near confident foreground to reduce clipping.
     */
    private static async refineCutoutForForegroundPreservation(originalBlob: Blob, cutoutBlob: Blob): Promise<Blob> {
        try {
            const [originalImg, cutoutImg] = await Promise.all([
                this.blobToImage(originalBlob),
                this.blobToImage(cutoutBlob)
            ]);

            const width = Math.min(originalImg.width, cutoutImg.width);
            const height = Math.min(originalImg.height, cutoutImg.height);
            if (width <= 0 || height <= 0) return cutoutBlob;

            const srcCanvas = document.createElement('canvas');
            srcCanvas.width = width;
            srcCanvas.height = height;
            const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true });

            const matteCanvas = document.createElement('canvas');
            matteCanvas.width = width;
            matteCanvas.height = height;
            const matteCtx = matteCanvas.getContext('2d', { willReadFrequently: true });

            if (!srcCtx || !matteCtx) return cutoutBlob;

            srcCtx.drawImage(originalImg, 0, 0, width, height);
            matteCtx.drawImage(cutoutImg, 0, 0, width, height);

            const srcImage = srcCtx.getImageData(0, 0, width, height);
            const matteImage = matteCtx.getImageData(0, 0, width, height);
            const src = srcImage.data;
            const matte = matteImage.data;

            const out = new Uint8ClampedArray(src.length);
            const maxX = width - 1;
            const maxY = height - 1;

            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const idx = (y * width + x) * 4;
                    const rawAlpha = matte[idx + 3];
                    let refinedAlpha = rawAlpha;

                    if (rawAlpha < 220) {
                        if (rawAlpha > 0 && rawAlpha < 170) {
                            let maxNeighborAlpha = 0;
                            const x0 = Math.max(0, x - 1);
                            const y0 = Math.max(0, y - 1);
                            const x1 = Math.min(maxX, x + 1);
                            const y1 = Math.min(maxY, y + 1);

                            for (let ny = y0; ny <= y1; ny++) {
                                for (let nx = x0; nx <= x1; nx++) {
                                    if (nx === x && ny === y) continue;
                                    const nIdx = (ny * width + nx) * 4;
                                    const nAlpha = matte[nIdx + 3];
                                    if (nAlpha > maxNeighborAlpha) maxNeighborAlpha = nAlpha;
                                }
                            }

                            if (maxNeighborAlpha >= 225) {
                                refinedAlpha = Math.max(refinedAlpha, 165);
                            }
                        }

                            // Removed aggressive color-distance rescue logic that was causing inner-hole artifacts
                    }

                    out[idx] = src[idx];
                    out[idx + 1] = src[idx + 1];
                    out[idx + 2] = src[idx + 2];
                    out[idx + 3] = refinedAlpha;
                }
            }

            const outCanvas = document.createElement('canvas');
            outCanvas.width = width;
            outCanvas.height = height;
            const outCtx = outCanvas.getContext('2d');
            if (!outCtx) return cutoutBlob;

            outCtx.putImageData(new ImageData(out, width, height), 0, 0);

            const refinedBlob = await new Promise<Blob>((resolve, reject) => {
                outCanvas.toBlob((b) => {
                    if (b) resolve(b);
                    else reject(new Error("Failed to encode refined cutout blob"));
                }, "image/png");
            });

            return refinedBlob;
        } catch (error) {
            console.warn("[CutoutService] Conservative foreground recovery failed. Returning raw cutout.", error);
            return cutoutBlob;
        }
    }

    /**
     * Converts a transparent PNG Data URL into a Black/White Alpha Mask.
     */
    private static generateAlphaMaskFromCutout(cutoutUrl: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error("Failed to get 2D context for mask generation"));
                    return;
                }

                // Fill background with black
                ctx.fillStyle = "#000000";
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                // Draw the transparent image
                ctx.drawImage(img, 0, 0);

                // Convert alpha channel to white pixels
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imageData.data;
                
                for (let i = 0; i < data.length; i += 4) {
                    const alpha = data[i + 3];
                    if (alpha > 10) { // Slight threshold to ignore artifact fringes
                        data[i] = 255;     // R
                        data[i + 1] = 255; // G
                        data[i + 2] = 255; // B
                        data[i + 3] = 255; // Force fully opaque
                    } else {
                        // Ensure perfect black for empty regions
                        data[i] = 0;
                        data[i + 1] = 0;
                        data[i + 2] = 0;
                        data[i + 3] = 255; // Opaque black
                    }
                }
                
                ctx.putImageData(imageData, 0, 0);
                resolve(canvas.toDataURL("image/png"));
            };
            img.onerror = () => reject(new Error("Failed to load cutout image for mask generation"));
            img.src = cutoutUrl;
        });
    }
}
