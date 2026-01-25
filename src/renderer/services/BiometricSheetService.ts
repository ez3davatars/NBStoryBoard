
export interface BiometricCaptures {
    center: string;
    left: string;
    right: string;
    up: string;
    down: string;
}

interface ExportOptions {
    subjectId: string;
    captures: BiometricCaptures;
    quality?: Record<string, string>;
}

const loadImage = (url: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
    });
};

const drawTile = (
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    scale: number
) => {
    // Config
    const borderSize = 2 * scale;
    const fontSize = 24 * scale;
    const padding = 10 * scale;

    // containment logic: fit image inside the tile fully
    const scaleFactor = Math.min(w / img.width, h / img.height);
    const destW = img.width * scaleFactor;
    const destH = img.height * scaleFactor;
    const destX = x + (w - destW) / 2;
    const destY = y + (h - destH) / 2;

    // Draw Image
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.drawImage(img, 0, 0, img.width, img.height, destX, destY, destW, destH);
    ctx.restore();

    // Draw Border
    ctx.lineWidth = borderSize;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";

    // Draw Label Badge
    ctx.font = `900 ${fontSize}px "Inter", sans-serif`;
    const textMetrics = ctx.measureText(label);
    const bgW = textMetrics.width + (padding * 2);
    const bgH = fontSize + (padding * 1.5);

    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(x, y, bgW, bgH);

    ctx.fillStyle = "#fbbf24"; // Amber-400
    ctx.fillText(label, x + padding, y + fontSize); // Approx baseline
};

export const exportBiometricReferenceSheet = async (options: ExportOptions) => {
    const { subjectId, captures } = options;

    // Helper to attempt generation at specific resolution
    const tryGenerate = async (width: number, height: number, scale: number) => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error("Could not get canvas context");

        // 1. Background
        const grad = ctx.createLinearGradient(0, 0, 0, height);
        grad.addColorStop(0, "#070914");
        grad.addColorStop(1, "#0b1220");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);

        // Grid details (subtle)
        ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
        ctx.lineWidth = 1 * scale;
        const gridSize = 100 * scale;
        for (let x = 0; x < width; x += gridSize) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
        }
        for (let y = 0; y < height; y += gridSize) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
        }

        // 2. Load Images
        const [imgCenter, imgLeft, imgRight, imgUp, imgDown] = await Promise.all([
            loadImage(captures.center),
            loadImage(captures.left),
            loadImage(captures.right),
            loadImage(captures.up),
            loadImage(captures.down),
        ]);

        // 3. Layout Constants (Maximized 2x3 Grid)
        // Canvas is 16:9. 
        // We have 6 slots (2 rows, 3 cols). 5 Images + 1 Info Slot.

        const margin = 40 * scale; // Reduced margin
        const colGap = 20 * scale;
        const rowGap = 20 * scale;

        // Calculate Tile Sizes
        // Total Width = (3 * tileW) + (2 * colGap) + (2 * margin)
        // Total Height = (2 * tileH) + (1 * rowGap) + (2 * margin)
        const tileW = (width - (2 * margin) - (2 * colGap)) / 3;
        const tileH = (height - (2 * margin) - rowGap) / 2;

        // Slot Coordinates Helper
        const getSlot = (col: number, row: number) => {
            const x = margin + (col * (tileW + colGap));
            const y = margin + (row * (tileH + rowGap));
            return { x, y };
        };

        // --- DRAW IMAGES (Slots: 0,1,2 (Top) and 1,2 (Bottom)) ---
        // Row 1
        const p1 = getSlot(0, 0); drawTile(ctx, imgLeft, p1.x, p1.y, tileW, tileH, "LEFT PROFILE", scale);
        const p2 = getSlot(1, 0); drawTile(ctx, imgCenter, p2.x, p2.y, tileW, tileH, "CENTER FRONT", scale);
        const p3 = getSlot(2, 0); drawTile(ctx, imgRight, p3.x, p3.y, tileW, tileH, "RIGHT PROFILE", scale);

        // Row 2 (Shifted: Title in Col 1, Images in Col 2 & 3)
        // Actually, user might prefer symmetry. 
        // Center is usually anchor.
        // Let's put Title in Bottom-Left (Col 0), Up in Col 1, Down in Col 2.
        const p4 = getSlot(1, 1); drawTile(ctx, imgUp, p4.x, p4.y, tileW, tileH, "TOP DOWN", scale);
        const p5 = getSlot(2, 1); drawTile(ctx, imgDown, p5.x, p5.y, tileW, tileH, "BOTTOM UP", scale);

        // --- DRAW INFO (Slot: Bottom Left - Col 0, Row 1) ---
        const infoSlot = getSlot(0, 1);

        // Vertical center the text block in the slot
        const textBlockY = infoSlot.y + (tileH * 0.4);

        ctx.fillStyle = "#ffffff";
        ctx.font = `900 ${42 * scale}px "Inter", sans-serif`;
        ctx.fillText("BIOMETRIC", infoSlot.x, textBlockY);
        ctx.fillText("REFERENCE SHEET", infoSlot.x, textBlockY + (50 * scale));

        // Separator
        ctx.strokeStyle = "#fbbf24"; // Amber
        ctx.lineWidth = 4 * scale;
        ctx.beginPath();
        ctx.moveTo(infoSlot.x, textBlockY + (70 * scale));
        ctx.lineTo(infoSlot.x + (100 * scale), textBlockY + (70 * scale));
        ctx.stroke();

        // Metadata
        ctx.fillStyle = "#9ca3af"; // Gray-400
        ctx.font = `500 ${20 * scale}px "Inter", sans-serif`;
        ctx.fillText(`SUBJECT ID:`, infoSlot.x, textBlockY + (110 * scale));
        ctx.fillStyle = "#ffffff";
        ctx.fillText(subjectId.toUpperCase(), infoSlot.x + (140 * scale), textBlockY + (110 * scale));

        ctx.fillStyle = "#9ca3af";
        ctx.fillText(`DATE:`, infoSlot.x, textBlockY + (140 * scale));
        ctx.fillStyle = "#ffffff";
        ctx.fillText(new Date().toLocaleDateString(), infoSlot.x + (140 * scale), textBlockY + (140 * scale));

        // Tiny Footer Note (at very bottom of info slot)
        ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
        ctx.font = `400 ${14 * scale}px monospace`;
        ctx.fillText("NanoCast Biometric Scanner", infoSlot.x, infoSlot.y + tileH - (10 * scale));

        return canvas;
    };

    try {
        // Attempt 4K
        try {
            const canvas4k = await tryGenerate(3840, 2160, 2);
            canvas4k.toBlob((blob) => {
                if (!blob) throw new Error("Canvas blob failed");
                downloadBlob(blob, `NanoCast_BiometricSheet_${subjectId}_4K.png`);
            }, 'image/png');
            return { success: true, quality: '4K' };
        } catch (e) {
            console.warn("4K Export failed, falling back to 1080p", e);
            // Fallback 1080p
            const canvas1080 = await tryGenerate(1920, 1080, 1);
            canvas1080.toBlob((blob) => {
                if (!blob) throw new Error("Canvas blob failed");
                downloadBlob(blob, `NanoCast_BiometricSheet_${subjectId}_1080p.png`);
            }, 'image/png');
            return { success: true, quality: '1080p', warning: "Exported at 1080p due to device limits." };
        }
    } catch (finalErr: any) {
        console.error("Biometric Sheet Generation Failed", finalErr);
        throw new Error(finalErr.message || "Export failed completely.");
    }
};

const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};
