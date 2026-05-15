import type { WearableAnchorContract, WearablePlacement, HeadwearSubtype } from './WearableAnchorEngine';

export type OverlayResult = {
    precompositeUrl: string;
    placement: WearablePlacement;
};

export function loadImageElement(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

export function canvasToDataUrl(canvas: HTMLCanvasElement): string {
    return canvas.toDataURL('image/png');
}

export function extractNonBlackBounds(
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

export function makeBlackTransparent(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number
) {
    const imageData = ctx.getImageData(0, 0, width, height);
    const d = imageData.data;

    for (let i = 0; i < d.length; i += 4) {
        const r = d[i];
        const g = d[i + 1];
        const b = d[i + 2];
        const a = d[i + 3];

        const luminance = r + g + b;
        const nearBlack = luminance < 36;

        if (a > 0 && nearBlack) {
            d[i + 3] = 0;
        }
    }

    ctx.putImageData(imageData, 0, 0);
}

export type IntegrationParams = {
    contactBandRatio: number;
    occlusion: number;
    shadow: number;
    deformation: number;
    templeBias: number;
    hairOcclusionMode: 'full' | 'temple_only' | 'minimal' | 'none';
    edgeFeatherPx: number;
    shadowBlurPx: number;
    shadowOffsetYPx: number;
};

export const HEADWEAR_PROFILES: Record<HeadwearSubtype, IntegrationParams> = {
    crown: { contactBandRatio: 0.15, occlusion: 0.8, shadow: 0.5, deformation: 0.05, templeBias: 1.5, hairOcclusionMode: 'full', edgeFeatherPx: 12, shadowBlurPx: 12, shadowOffsetYPx: 8 },
    tiara: { contactBandRatio: 0.1, occlusion: 0.6, shadow: 0.4, deformation: 0.03, templeBias: 1.2, hairOcclusionMode: 'temple_only', edgeFeatherPx: 8, shadowBlurPx: 8, shadowOffsetYPx: 4 },
    hat: { contactBandRatio: 0.2, occlusion: 0.4, shadow: 0.7, deformation: 0.02, templeBias: 1.0, hairOcclusionMode: 'temple_only', edgeFeatherPx: 10, shadowBlurPx: 20, shadowOffsetYPx: 15 },
    helmet: { contactBandRatio: 0.3, occlusion: 0.0, shadow: 0.3, deformation: 0.0, templeBias: 0.0, hairOcclusionMode: 'none', edgeFeatherPx: 0, shadowBlurPx: 15, shadowOffsetYPx: 5 },
    veil: { contactBandRatio: 0.05, occlusion: 0.9, shadow: 0.3, deformation: 0.0, templeBias: 2.0, hairOcclusionMode: 'full', edgeFeatherPx: 20, shadowBlurPx: 5, shadowOffsetYPx: 2 },
    hood: { contactBandRatio: 0.25, occlusion: 0.1, shadow: 0.8, deformation: 0.0, templeBias: 0.5, hairOcclusionMode: 'minimal', edgeFeatherPx: 4, shadowBlurPx: 25, shadowOffsetYPx: 10 },
    headband: { contactBandRatio: 0.1, occlusion: 0.7, shadow: 0.4, deformation: 0.04, templeBias: 1.3, hairOcclusionMode: 'full', edgeFeatherPx: 10, shadowBlurPx: 8, shadowOffsetYPx: 4 },
    hairpiece: { contactBandRatio: 0.05, occlusion: 0.9, shadow: 0.3, deformation: 0.0, templeBias: 1.5, hairOcclusionMode: 'full', edgeFeatherPx: 15, shadowBlurPx: 6, shadowOffsetYPx: 2 },
    generic_headwear: { contactBandRatio: 0.1, occlusion: 0.5, shadow: 0.5, deformation: 0.0, templeBias: 1.0, hairOcclusionMode: 'minimal', edgeFeatherPx: 5, shadowBlurPx: 10, shadowOffsetYPx: 6 }
};

function getHeadwearBaseBandRatio(subtype?: HeadwearSubtype): number {
    switch (subtype) {
        case 'crown':
            return 0.82;
        case 'tiara':
            return 0.78;
        case 'hat':
            return 0.70;
        case 'helmet':
            return 0.52;
        case 'hood':
            return 0.36;
        case 'veil':
            return 0.18;
        case 'headband':
            return 0.50;
        case 'hairpiece':
            return 0.70;
        case 'generic_headwear':
        default:
            return 0.68;
    }
}

export class WearableOverlayComposer {
    static async buildFramedSubject(subjectUrl: string, resolutionMode: string = '1K'): Promise<string> {
        const subjectImg = await loadImageElement(subjectUrl);
        
        let targetDimension = 1024;
        if (resolutionMode === '2K') targetDimension = 2048;
        if (resolutionMode === '4K') targetDimension = 4096;

        // Extract native bounds
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = subjectImg.naturalWidth;
        tempCanvas.height = subjectImg.naturalHeight;
        const tempCtx = tempCanvas.getContext('2d');
        if (!tempCtx) return subjectUrl;
        
        tempCtx.drawImage(subjectImg, 0, 0);
        makeBlackTransparent(tempCtx, tempCanvas.width, tempCanvas.height);
        
        const bounds = extractNonBlackBounds(tempCtx, tempCanvas.width, tempCanvas.height);
        if (!bounds) return subjectUrl;

        // Calculate uniform scale
        const safePadding = targetDimension * 0.05; // 5% perimeter padding
        const maxAvailableSpace = targetDimension - (safePadding * 2);
        
        const scaleX = maxAvailableSpace / bounds.width;
        const scaleY = maxAvailableSpace / bounds.height;
        const uniformScale = Math.min(scaleX, scaleY);
        
        const targetWidthPx = bounds.width * uniformScale;
        const targetHeightPx = bounds.height * uniformScale;

        // Draw centered geometry
        const outCanvas = document.createElement('canvas');
        outCanvas.width = targetDimension;
        outCanvas.height = targetDimension;
        const outCtx = outCanvas.getContext('2d');
        if (!outCtx) return subjectUrl;
        
        outCtx.fillStyle = '#000000';
        outCtx.fillRect(0, 0, targetDimension, targetDimension);
        
        const offsetX = (targetDimension - targetWidthPx) / 2;
        const offsetY = (targetDimension - targetHeightPx) / 2;
        
        outCtx.drawImage(
            subjectImg,
            bounds.x, bounds.y, bounds.width, bounds.height,
            offsetX, offsetY, targetWidthPx, targetHeightPx
        );

        return canvasToDataUrl(outCanvas);
    }

    static async compose(params: {
        subjectUrl: string;
        propUrl: string;
        anchorContract: WearableAnchorContract; 
    }): Promise<OverlayResult> {
        const { subjectUrl, propUrl, anchorContract } = params;

        const [subjectImg, propImg] = await Promise.all([
            loadImageElement(subjectUrl),
            loadImageElement(propUrl)
        ]);

        const outCanvas = document.createElement('canvas');
        outCanvas.width = subjectImg.naturalWidth || subjectImg.width;
        outCanvas.height = subjectImg.naturalHeight || subjectImg.height;
        const outCtx = outCanvas.getContext('2d');
        if (!outCtx) throw new Error('Failed to create output canvas.');

        outCtx.drawImage(subjectImg, 0, 0, outCanvas.width, outCanvas.height);

        const propCanvas = document.createElement('canvas');
        propCanvas.width = propImg.naturalWidth || propImg.width;
        propCanvas.height = propImg.naturalHeight || propImg.height;
        const propCtx = propCanvas.getContext('2d');
        if (!propCtx) throw new Error('Failed to create prop canvas.');

        propCtx.drawImage(propImg, 0, 0, propCanvas.width, propCanvas.height);
        makeBlackTransparent(propCtx, propCanvas.width, propCanvas.height);

        const propBounds = extractNonBlackBounds(propCtx, propCanvas.width, propCanvas.height);
        if (!propBounds) throw new Error('Could not detect visible prop bounds.');

        // 1. Finalize Size Math
        const targetWidth = Math.round(anchorContract.targetWidthPx);
        const scale = targetWidth / propBounds.width;
        const targetHeight = Math.round(propBounds.height * scale);

        // 2. Finalize Positioning
        const finalX = Math.round(anchorContract.anchorCenter.x - targetWidth / 2);
        let finalY = Math.round(anchorContract.anchorCenter.y - targetHeight / 2); // default centered

        if (anchorContract.verticalMode === 'headwear_base_lock') {
            const baseBandRatioFromTop = getHeadwearBaseBandRatio(anchorContract.subtype);
            finalY = Math.round(anchorContract.anchorCenter.y - targetHeight * baseBandRatioFromTop);
        } else if (anchorContract.verticalMode === 'below_anchor') {
            finalY = Math.round(anchorContract.anchorCenter.y);
        }

        const minMargin = 4;
        const clampedX = Math.max(minMargin, Math.min(finalX, outCanvas.width - targetWidth - minMargin));
        let clampedY = Math.max(minMargin, Math.min(finalY, outCanvas.height - targetHeight - minMargin));

        if (anchorContract.fitClass === 'headwear') {
            const subtype = anchorContract.subtype;
            const sitsOnHead =
                !subtype ||
                subtype === 'crown' ||
                subtype === 'tiara' ||
                subtype === 'hat' ||
                subtype === 'headband' ||
                subtype === 'hairpiece' ||
                subtype === 'generic_headwear';

            if (sitsOnHead) {
                const lowestAllowedTopY = Math.round(anchorContract.anchorCenter.y - targetHeight * 0.88);
                clampedY = Math.max(minMargin, Math.min(clampedY, lowestAllowedTopY));
            }
        }

        console.log('[WearableOverlayComposer]', {
            fitClass: anchorContract.fitClass,
            anchorCenter: anchorContract.anchorCenter,
            targetWidthPx: anchorContract.targetWidthPx,
            propBounds,
            scaledHeight: targetHeight,
            finalX,
            finalY,
            clampedX,
            clampedY,
            canvasW: outCanvas.width,
            canvasH: outCanvas.height
        });

        const placement: WearablePlacement = {
            ...anchorContract,
            targetHeightPx: targetHeight,
            finalRect: {
                x: clampedX,
                y: clampedY,
                width: targetWidth,
                height: targetHeight
            }
        };

        // Render with rotation context if needed
        outCtx.save();
        
        // Translate to the center of where we want to draw the prop, rotate, then draw shifted
        const centerX = clampedX + targetWidth / 2;
        const centerY = clampedY + targetHeight / 2;
        outCtx.translate(centerX, centerY);
        outCtx.rotate(placement.rotationDeg * Math.PI / 180);
        const isHeadwear = anchorContract.fitClass === 'headwear';
        const profile = isHeadwear && anchorContract.subtype 
            ? HEADWEAR_PROFILES[anchorContract.subtype] || HEADWEAR_PROFILES['generic_headwear']
            : null;

        let finalPropCanvas = propCanvas;
        let finalPropBounds = propBounds;
        let finalTargetHeight = targetHeight;

        if (profile) {
            // Apply Deformation (arc-stretch the contact band down)
            if (profile.deformation > 0) {
                const defCanvas = document.createElement('canvas');
                defCanvas.width = propBounds.width;
                defCanvas.height = propBounds.height * (1 + profile.deformation);
                const defCtx = defCanvas.getContext('2d');
                
                if (defCtx) {
                    const bW = propBounds.width;
                    const bH = propBounds.height;
                    const rigidThreshold = Math.floor(bH * (1.0 - profile.contactBandRatio));
                    const stretchZone = bH - rigidThreshold;

                    for (let x = 0; x < bW; x++) {
                        const maxDip = bH * profile.deformation;
                        const midX = bW / 2;
                        const dist = Math.abs(x - midX) / midX; 
                        const dy = (dist * dist) * maxDip;

                        // Draw top rigid half unaltered
                        defCtx.drawImage(
                            propCanvas, 
                            propBounds.x + x, propBounds.y, 1, rigidThreshold, 
                            x, 0, 1, rigidThreshold
                        );

                        // Draw bottom half stretched vertically by dy
                        defCtx.drawImage(
                            propCanvas,
                            propBounds.x + x, propBounds.y + rigidThreshold, 1, stretchZone,
                            x, rigidThreshold, 1, stretchZone + dy
                        );
                    }
                    finalPropCanvas = defCanvas;
                    finalPropBounds = {
                        x: 0,
                        y: 0,
                        width: defCanvas.width,
                        height: defCanvas.height,
                        centerX: defCanvas.width / 2,
                        centerY: defCanvas.height / 2
                    };
                    finalTargetHeight = targetHeight * (1 + profile.deformation);
                }
            }

            // Create Shadow Canvas
            if (profile.shadow > 0) {
                outCtx.save();
                const shadowCanvas = document.createElement('canvas');
                shadowCanvas.width = finalPropBounds.width;
                shadowCanvas.height = finalPropBounds.height;
                const shadowCtx = shadowCanvas.getContext('2d');
                if (shadowCtx) {
                    shadowCtx.drawImage(
                        finalPropCanvas, 
                        finalPropBounds.x, finalPropBounds.y, finalPropBounds.width, finalPropBounds.height,
                        0, 0, finalPropBounds.width, finalPropBounds.height
                    );
                    shadowCtx.globalCompositeOperation = 'source-in';
                    shadowCtx.fillStyle = `black`;
                    shadowCtx.fillRect(0, 0, shadowCanvas.width, shadowCanvas.height);
                }

                outCtx.shadowColor = `rgba(0, 0, 0, ${profile.shadow})`;
                outCtx.shadowBlur = profile.shadowBlurPx * (targetWidth / 200); 
                outCtx.shadowOffsetY = profile.shadowOffsetYPx * (targetHeight / 200);
                
                outCtx.drawImage(
                    shadowCanvas,
                    0, 0, shadowCanvas.width, shadowCanvas.height,
                    -targetWidth / 2, -targetHeight / 2, targetWidth, finalTargetHeight
                );
                outCtx.restore();
            }

            // Apply Mask Occlusions (Destination-Out)
            if (profile.hairOcclusionMode !== 'none' || profile.edgeFeatherPx > 0) {
                const occCtx = finalPropCanvas.getContext('2d');
                if (occCtx) {
                    occCtx.globalCompositeOperation = 'destination-out';
                    const bW = finalPropBounds.width;
                    const bH = finalPropBounds.height;
                    const bandHeight = Math.max(1, bH * profile.contactBandRatio);

                    let occAlpha = profile.occlusion;
                    if (profile.hairOcclusionMode === 'temple_only') occAlpha *= 0.5;
                    if (profile.hairOcclusionMode === 'minimal') occAlpha *= 0.15;

                    if (profile.hairOcclusionMode !== 'none' && occAlpha > 0) {
                        const cornerRad = Math.max(10, bW * 0.4 * profile.templeBias);
                        
                        const lgRad = occCtx.createRadialGradient(0, bH, 0, 0, bH, cornerRad);
                        lgRad.addColorStop(0, `rgba(0, 0, 0, ${occAlpha})`);
                        lgRad.addColorStop(1, 'rgba(0, 0, 0, 0)');
                        occCtx.fillStyle = lgRad;
                        occCtx.fillRect(0, bH - cornerRad, cornerRad, cornerRad);
                        
                        const rgRad = occCtx.createRadialGradient(bW, bH, 0, bW, bH, cornerRad);
                        rgRad.addColorStop(0, `rgba(0, 0, 0, ${occAlpha})`);
                        rgRad.addColorStop(1, 'rgba(0, 0, 0, 0)');
                        occCtx.fillStyle = rgRad;
                        occCtx.fillRect(bW - cornerRad, bH - cornerRad, cornerRad, cornerRad);

                        if (profile.hairOcclusionMode === 'full') {
                            const centerGrad = occCtx.createLinearGradient(0, bH, 0, bH - bandHeight);
                            centerGrad.addColorStop(0, `rgba(0, 0, 0, ${occAlpha * 0.5})`);
                            centerGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
                            occCtx.fillStyle = centerGrad;
                            occCtx.fillRect(0, bH - bandHeight, bW, bandHeight);
                        }
                    }

                    if (profile.edgeFeatherPx > 0) {
                        const featherScaled = profile.edgeFeatherPx * (bW / targetWidth);
                        const edgeGrad = occCtx.createLinearGradient(0, bH, 0, bH - featherScaled);
                        edgeGrad.addColorStop(0, 'rgba(0,0,0,0.8)');
                        edgeGrad.addColorStop(1, 'rgba(0,0,0,0)');
                        occCtx.fillStyle = edgeGrad;
                        occCtx.fillRect(0, bH - featherScaled, bW, featherScaled);
                    }
                    occCtx.globalCompositeOperation = 'source-over';
                }
            }
        }

        outCtx.drawImage(
            finalPropCanvas,
            finalPropBounds.x,
            finalPropBounds.y,
            finalPropBounds.width,
            finalPropBounds.height,
            -targetWidth / 2,     
            -targetHeight / 2,
            targetWidth,
            finalTargetHeight
        );

        outCtx.restore();

        return {
            precompositeUrl: canvasToDataUrl(outCanvas),
            placement
        };
    }
}
