import type { ShotPresetDefinition } from './shotsPresets';
import type { DirectedShotSlot } from '../types/shots';

export function getBlueprintFrameForPreset(preset: ShotPresetDefinition, width: number, height: number) {
    const fw = width;
    const fh = height;

    let w = fw;
    let h = fh;
    let x = 0;
    let y = 0;

    switch (preset.id) {
        case 'closeup':
            w = fw * 0.22;
            h = fh * 0.38;
            break;
        case 'mediumClose':
            w = fw * 0.42;
            h = fh * 0.60;
            break;
        case 'medium':
            w = fw * 0.68;
            h = fh * 0.85;
            break;
        case 'wide':
            w = fw * 0.96;
            h = fh * 0.96;
            break;
        case 'lowAngleHero':
            w = fw * 0.62;
            h = fh * 0.82;
            break;
        case 'highAngle':
            w = fw * 0.88;
            h = fh * 0.82;
            break;
        case 'threeQuarterLeft':
        case 'threeQuarterRight':
            w = fw * 0.38;
            h = fh * 0.62;
            break;
        case 'profile':
            w = fw * 0.26;
            h = fh * 0.62;
            break;
        case 'overTheShoulder':
            w = fw * 0.48;
            h = fh * 0.56;
            break;
        case 'twoShot':
            w = fw * 0.80;
            h = fh * 0.75;
            break;
        default:
            switch (preset.framing) {
                case 'closeup':
                    w = fw * 0.30;
                    h = fh * 0.44;
                    break;
                case 'mediumClose':
                    w = fw * 0.42;
                    h = fh * 0.58;
                    break;
                case 'medium':
                    w = fw * 0.58;
                    h = fh * 0.70;
                    break;
                case 'wide':
                    w = fw * 0.93;
                    h = fh * 0.92;
                    break;
                case 'full':
                    w = fw * 0.92;
                    h = fh * 0.94;
                    break;
            }
            break;
    }

    x = (fw - w) / 2;
    y = (fh - h) / 2;

    if (preset.elevation === 'low') {
        y -= (fh * 0.18);
    } else if (preset.elevation === 'high') {
        y += (fh * 0.18);
    }

    if (preset.id === 'threeQuarterLeft') {
        x = fw * 0.62;
    } else if (preset.id === 'threeQuarterRight') {
        x = fw * 0.03;
    } else if (preset.id === 'profile') {
        x = fw * 0.45;
    } else if (preset.id === 'lowAngleHero') {
        y -= (fh * 0.12);
    } else if (preset.id === 'highAngle') {
        y += (fh * 0.12);
    } else if (preset.id === 'overTheShoulder') {
        x = preset.placement === 'rightThird' ? (fw * 0.50) : (fw * 0.05);
    }

    if (preset.placement === 'leftThird' && preset.id !== 'threeQuarterRight') {
        x = (fw * 0.33) - (w / 2);
    } else if (preset.placement === 'rightThird' && preset.id !== 'threeQuarterLeft') {
        x = (fw * 0.66) - (w / 2);
    }

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
    ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
    ctx.fillRect(20, 20, 360, 52);

    ctx.fillStyle = '#00FFFF';
    ctx.font = 'bold 24px monospace';
    ctx.textBaseline = 'middle';
    ctx.fillText(`CAM: ${label.toUpperCase()}`, 34, 46);
}

function drawOrbitGuide(ctx: CanvasRenderingContext2D, width: number, height: number, preset: ShotPresetDefinition) {
    ctx.save();
    ctx.strokeStyle = 'rgba(0,255,255,1.0)';
    ctx.fillStyle = 'rgba(0,255,255,1.0)';
    ctx.lineWidth = Math.max(5, width * 0.0035);

    const cy = height * 0.82;
    const r = Math.min(width, height) * 0.16;

    if (preset.id === 'threeQuarterLeft' || preset.id === 'threeQuarterRight') {
        const start = preset.id === 'threeQuarterLeft' ? Math.PI * 1.05 : Math.PI * 1.45;
        const end = preset.id === 'threeQuarterLeft' ? Math.PI * 1.45 : Math.PI * 1.05;
        ctx.beginPath();
        ctx.arc(width / 2, cy, r, start, end, preset.id === 'threeQuarterRight');
        ctx.stroke();
    } else if (preset.id === 'profile') {
        ctx.beginPath();
        ctx.moveTo(width * 0.25, cy);
        ctx.lineTo(width * 0.75, cy);
        ctx.stroke();
    } else if (preset.id === 'lowAngleHero' || preset.id === 'highAngle') {
        ctx.beginPath();
        ctx.moveTo(width * 0.5, preset.id === 'lowAngleHero' ? height * 0.95 : height * 0.60);
        ctx.lineTo(width * 0.5, preset.id === 'lowAngleHero' ? height * 0.60 : height * 0.95);
        ctx.stroke();
    }

    ctx.restore();
}

export function drawOverShoulderGuide(ctx: CanvasRenderingContext2D, width: number, height: number, placement: string) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.95)';
    ctx.beginPath();
    
    // Default OTS on the left foreground, looking right
    if (placement === 'rightThird') {
        // Foreground person on the left
        ctx.moveTo(0, height);
        ctx.lineTo(width * 0.45, height);
        ctx.lineTo(width * 0.35, height * 0.25);
        ctx.lineTo(0, height * 0.25);
    } else {
        // Foreground person on the right
        ctx.moveTo(width, height);
        ctx.lineTo(width * 0.55, height);
        ctx.lineTo(width * 0.65, height * 0.25);
        ctx.lineTo(width, height * 0.25);
    }
    
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 255, 255, 1.0)';
    ctx.font = 'bold 26px monospace';
    if (placement === 'rightThird') {
         ctx.fillText('FG SHOULDER', width * 0.05, height * 0.7);
    } else {
         ctx.fillText('FG SHOULDER', width * 0.65, height * 0.7);
    }
}

export function drawLateralRevealGuide(ctx: CanvasRenderingContext2D, width: number, height: number, presetId: string) {
    const isLeftMove = presetId === 'threeQuarterLeft' || presetId === 'profile';
    const isRightMove = presetId === 'threeQuarterRight';

    // Wedge 1: Occluded boundary (the side the camera moved AWAY from)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.95)';
    ctx.beginPath();
    if (isLeftMove) {
        ctx.moveTo(width, 0);
        ctx.lineTo(width * 0.65, 0);
        ctx.lineTo(width * 0.45, height);
        ctx.lineTo(width, height);
    } else if (isRightMove) {
        ctx.moveTo(0, 0);
        ctx.lineTo(width * 0.35, 0);
        ctx.lineTo(width * 0.55, height);
        ctx.lineTo(0, height);
    }
    ctx.fill();

    // Wedge 2: Reveal boundary (the side the camera moved TOWARD)
    ctx.fillStyle = 'rgba(0, 255, 255, 0.15)';
    ctx.beginPath();
    if (isLeftMove) {
        ctx.moveTo(0, 0);
        ctx.lineTo(width * 0.25, 0);
        ctx.lineTo(width * 0.45, height);
        ctx.lineTo(0, height);
    } else if (isRightMove) {
        ctx.moveTo(width, 0);
        ctx.lineTo(width * 0.75, 0);
        ctx.lineTo(width * 0.55, height);
        ctx.lineTo(width, height);
    }
    ctx.fill();
    
    // Depth vectors: abstract graphical lines forcing perspective awareness
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.4)';
    ctx.lineWidth = Math.max(3, width * 0.003);
    ctx.setLineDash([15, 10]);
    ctx.beginPath();
    if (isLeftMove) {
        ctx.moveTo(width * 0.55, height * 0.5);
        ctx.lineTo(width * 0.15, height * 0.2);
        ctx.moveTo(width * 0.55, height * 0.5);
        ctx.lineTo(width * 0.15, height * 0.8);
    } else if (isRightMove) {
        ctx.moveTo(width * 0.45, height * 0.5);
        ctx.lineTo(width * 0.85, height * 0.2);
        ctx.moveTo(width * 0.45, height * 0.5);
        ctx.lineTo(width * 0.85, height * 0.8);
    }
    ctx.stroke();
    ctx.setLineDash([]);
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
    const { anchorImageUrl, preset, directedSlot } = args;

    const sourceImg = await loadDataUrlImage(anchorImageUrl);
    const MAX_BLUEPRINT_WIDTH = 1400;
    const scale = sourceImg.width > MAX_BLUEPRINT_WIDTH ? (MAX_BLUEPRINT_WIDTH / sourceImg.width) : 1;
    const renderWidth = Math.max(1, Math.round(sourceImg.width * scale));
    const renderHeight = Math.max(1, Math.round(sourceImg.height * scale));

    const baseCanvas = document.createElement('canvas');
    baseCanvas.width = renderWidth;
    baseCanvas.height = renderHeight;
    const baseCtx = baseCanvas.getContext('2d');
    if (!baseCtx) throw new Error('Base canvas context unavailable');
    baseCtx.drawImage(sourceImg, 0, 0, renderWidth, renderHeight);

    const canvas = document.createElement('canvas');
    canvas.width = renderWidth;
    canvas.height = renderHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context unavailable');

    // Draw base opaque anchor
    ctx.drawImage(baseCanvas, 0, 0);

    // Matte the whole screen
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const frame = getBlueprintFrameForPreset(preset, canvas.width, canvas.height);

    // Punch out the crop target
    ctx.clearRect(frame.x, frame.y, frame.w, frame.h);
    // Redraw the un-matted anchor area
    ctx.drawImage(baseCanvas, frame.x, frame.y, frame.w, frame.h, frame.x, frame.y, frame.w, frame.h);

    // Draw the framing box
    ctx.strokeStyle = 'rgba(0, 255, 255, 1.0)'; // Cyan targeting
    ctx.lineWidth = Math.max(6, canvas.width * 0.004);
    ctx.strokeRect(frame.x, frame.y, frame.w, frame.h);

    drawPlacementGuides(ctx, canvas.width, canvas.height);
    drawShotLabel(ctx, directedSlot?.cameraFlavor && directedSlot.cameraFlavor !== 'neutral' ? `${preset.label} • ${directedSlot.cameraFlavor}` : preset.label);
    
    if (preset.id === 'threeQuarterLeft' || preset.id === 'threeQuarterRight' || preset.id === 'profile') {
        drawLateralRevealGuide(ctx, canvas.width, canvas.height, preset.id);
    }
    
    drawOrbitGuide(ctx, canvas.width, canvas.height, preset);

    if (preset.orbit === 'overShoulder') {
        drawOverShoulderGuide(ctx, canvas.width, canvas.height, preset.placement);
    }

    // JPEG is substantially smaller than PNG for full-frame guides and reduces hosted payload fallback risk.
    return canvas.toDataURL('image/jpeg', 0.8);
}
