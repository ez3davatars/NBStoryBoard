import type { ShotPresetDefinition } from './shotsPresets';
import type { DirectedShotSlot } from '../types/shots';

export function getBlueprintFrameForPreset(preset: ShotPresetDefinition, width: number, height: number) {
    const fw = width;
    const fh = height;
    
    let w = fw;
    let h = fh;
    let x = 0;
    let y = 0;

    switch (preset.framing) {
        case 'closeup':
            w = fw * 0.32;
            h = fh * 0.42;
            break;
        case 'mediumClose':
            w = fw * 0.45;
            h = fh * 0.58;
            break;
        case 'medium':
            w = fw * 0.62;
            h = fh * 0.72;
            break;
        case 'wide':
            w = fw * 0.88;
            h = fh * 0.88;
            break;
        case 'full':
            w = fw * 0.95;
            h = fh * 0.95;
            break;
    }

    // Default center
    x = (fw - w) / 2;
    y = (fh - h) / 2;

    // Apply elevation logic
    if (preset.elevation === 'low') {
        y -= (fh * 0.1); // Move frame up relative to center (subject higher in frame)
    } else if (preset.elevation === 'high') {
        y += (fh * 0.1); // Move frame down (subject lower in frame)
    }

    // Apply placement
    if (preset.placement === 'leftThird') {
        x = (fw * 0.33) - (w / 2);
    } else if (preset.placement === 'rightThird') {
        x = (fw * 0.66) - (w / 2);
    }

    // Clamp
    x = Math.max(0, Math.min(x, fw - w));
    y = Math.max(0, Math.min(y, fh - h));

    return { x, y, w, h };
}

export function drawPlacementGuides(ctx: CanvasRenderingContext2D, width: number, height: number) {
    ctx.strokeStyle = 'rgba(255, 255, 0, 0.4)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);

    ctx.beginPath();
    ctx.moveTo(width / 3, 0);
    ctx.lineTo(width / 3, height);
    ctx.moveTo((width / 3) * 2, 0);
    ctx.lineTo((width / 3) * 2, height);
    ctx.stroke();
    ctx.setLineDash([]);
}

export function drawShotLabel(ctx: CanvasRenderingContext2D, label: string) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(20, 20, 240, 50);

    ctx.fillStyle = '#00FFFF';
    ctx.font = 'bold 28px monospace';
    ctx.textBaseline = 'middle';
    ctx.fillText(`CAM: ${label.toUpperCase()}`, 35, 45);
}

export function drawOverShoulderGuide(ctx: CanvasRenderingContext2D, width: number, height: number, placement: string) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.beginPath();
    
    // Default OTS on the left foreground, looking right
    if (placement === 'rightThird') {
        // Foreground person on the left
        ctx.moveTo(0, height);
        ctx.lineTo(width * 0.35, height);
        ctx.lineTo(width * 0.25, height * 0.4);
        ctx.lineTo(0, height * 0.4);
    } else {
        // Foreground person on the right
        ctx.moveTo(width, height);
        ctx.lineTo(width * 0.65, height);
        ctx.lineTo(width * 0.75, height * 0.4);
        ctx.lineTo(width, height * 0.4);
    }
    
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.font = 'bold 20px monospace';
    if (placement === 'rightThird') {
         ctx.fillText('FG SHOULDER', width * 0.05, height * 0.8);
    } else {
         ctx.fillText('FG SHOULDER', width * 0.75, height * 0.8);
    }
}

export const loadDataUrlImage = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = url;
    });

export async function buildShotBlueprintImage(args: {
    anchorImageUrl: string;
    preset: ShotPresetDefinition;
    directedSlot?: DirectedShotSlot;
}): Promise<string> {
    const { anchorImageUrl, preset } = args;

    const img = await loadDataUrlImage(anchorImageUrl);
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context unavailable');

    // Draw base opaque anchor
    ctx.drawImage(img, 0, 0);

    // Matte the whole screen
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const frame = getBlueprintFrameForPreset(preset, canvas.width, canvas.height);

    // Punch out the crop target
    ctx.clearRect(frame.x, frame.y, frame.w, frame.h);
    // Redraw the un-matted anchor area
    ctx.drawImage(img, frame.x, frame.y, frame.w, frame.h, frame.x, frame.y, frame.w, frame.h);

    // Draw the framing box
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.95)'; // Cyan targeting
    ctx.lineWidth = Math.max(4, canvas.width * 0.003);
    ctx.strokeRect(frame.x, frame.y, frame.w, frame.h);

    drawPlacementGuides(ctx, canvas.width, canvas.height);
    drawShotLabel(ctx, preset.label);

    if (preset.orbit === 'overShoulder') {
        drawOverShoulderGuide(ctx, canvas.width, canvas.height, preset.placement);
    }

    return canvas.toDataURL('image/png');
}
