import type { WearableClass, WearablePlacement } from './WearableAnchorEngine';

function loadImageElement(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

export class WearableRefinementValidator {
    static async validate(params: {
        refinedUrl: string;
        lockedPlacement: WearablePlacement;
        fitClass: WearableClass;
    }): Promise<boolean> {
        const { refinedUrl, lockedPlacement } = params;
        const overlayRect = lockedPlacement.finalRect;

        try {
            const refinedImg = await loadImageElement(refinedUrl);

            const canvas = document.createElement('canvas');
            canvas.width = refinedImg.naturalWidth || refinedImg.width;
            canvas.height = refinedImg.naturalHeight || refinedImg.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return false;

            ctx.drawImage(refinedImg, 0, 0, canvas.width, canvas.height);

            // Localized search window near locked placement
            const marginX = overlayRect.width * 0.40;
            const marginY = overlayRect.height * 0.40;
            const expandedX = Math.max(0, Math.floor(overlayRect.x - marginX));
            const expandedY = Math.max(0, Math.floor(overlayRect.y - marginY));
            const expandedW = Math.min(canvas.width - expandedX, Math.ceil(overlayRect.width + marginX * 2));
            const expandedH = Math.min(canvas.height - expandedY, Math.ceil(overlayRect.height + marginY * 2));

            const crop = ctx.getImageData(expandedX, expandedY, expandedW, expandedH);
            const d = crop.data;

            let minX = expandedW;
            let minY = expandedH;
            let maxX = -1;
            let maxY = -1;

            // Simple non-black subject boundary detection in localized window
            for (let y = 0; y < expandedH; y++) {
                for (let x = 0; x < expandedW; x++) {
                    const i = (y * expandedW + x) * 4;
                    const r = d[i];
                    const g = d[i + 1];
                    const b = d[i + 2];
                    const a = d[i + 3];

                    const visible = a > 10;
                    const notBlack = (r + g + b) > 30;

                    if (visible && notBlack) {
                        if (x < minX) minX = x;
                        if (y < minY) minY = y;
                        if (x > maxX) maxX = x;
                        if (y > maxY) maxY = y;
                    }
                }
            }

            if (maxX < minX || maxY < minY) {
                console.warn('Wearable validation: No visible pixels found in localized window.');
                return false;
            }

            const detectedW = maxX - minX + 1;
            const detectedH = maxY - minY + 1;

            const widthRatio = detectedW / overlayRect.width;
            const heightRatio = detectedH / overlayRect.height;

            const centerX = expandedX + minX + detectedW / 2;
            const centerY = expandedY + minY + detectedH / 2;

            const expectedCenterX = overlayRect.x + overlayRect.width / 2;
            const expectedCenterY = overlayRect.y + overlayRect.height / 2;

            const dx = Math.abs(centerX - expectedCenterX);
            const dy = Math.abs(centerY - expectedCenterY);
            
            // width drift: <= 15%
            // height drift: <= 15%
            // position drift: <= 12% of overlay width/height
            const positionalDriftX = dx / overlayRect.width;
            const positionalDriftY = dy / overlayRect.height;

            const widthOk = widthRatio >= 0.85 && widthRatio <= 1.15;
            const heightOk = heightRatio >= 0.85 && heightRatio <= 1.15;
            const centerOk = positionalDriftX <= 0.12 && positionalDriftY <= 0.12;

            if (!widthOk || !heightOk || !centerOk) {
                console.warn(`Wearable drift detected: W-ratio ${widthRatio.toFixed(2)}, H-ratio ${heightRatio.toFixed(2)}, DX ${positionalDriftX.toFixed(2)}, DY ${positionalDriftY.toFixed(2)}`);
                return false;
            }

            // Note: rotation drift checking is complex purely from pixels of the subject+wearable, 
            // returning true if bounding box properties hold correctly.
            return true;
        } catch (err) {
            console.warn('Wearable validation failed:', err);
            return false;
        }
    }
}
