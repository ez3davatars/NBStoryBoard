import type { SceneTruthSnapshot } from '../types/shots';
import type { ShotPresetDefinition } from './shotsPresets';

type NormalizedBBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type RenderContinuityShotImageArgs = {
  sourceImageUrl: string;
  preset: ShotPresetDefinition;
  sceneTruth?: SceneTruthSnapshot;
  outputWidth?: number;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const loadImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load continuity shot source image.'));
    img.src = url;
  });

const unionBBoxes = (boxes: NormalizedBBox[]): NormalizedBBox | null => {
  const valid = boxes.filter((box) => (
    Number.isFinite(box.x) &&
    Number.isFinite(box.y) &&
    Number.isFinite(box.width) &&
    Number.isFinite(box.height) &&
    box.width > 0 &&
    box.height > 0
  ));
  if (valid.length === 0) return null;

  const left = Math.min(...valid.map((box) => box.x));
  const top = Math.min(...valid.map((box) => box.y));
  const right = Math.max(...valid.map((box) => box.x + box.width));
  const bottom = Math.max(...valid.map((box) => box.y + box.height));

  return {
    x: clamp(left, 0, 1),
    y: clamp(top, 0, 1),
    width: clamp(right - left, 0.05, 1),
    height: clamp(bottom - top, 0.05, 1)
  };
};

const getSceneSubjectBounds = (sceneTruth?: SceneTruthSnapshot): NormalizedBBox => {
  const actorBoxes = (sceneTruth?.actors || [])
    .map((actor) => actor.bbox)
    .filter((box): box is NormalizedBBox => !!box);

  const union = unionBBoxes(actorBoxes);
  if (union) return union;

  return { x: 0.34, y: 0.18, width: 0.32, height: 0.62 };
};

const cropScaleForPreset = (preset: ShotPresetDefinition): number => {
  switch (preset.framing) {
    case 'closeup':
      return 0.44;
    case 'mediumClose':
      return 0.58;
    case 'medium':
      return 0.72;
    case 'wide':
      return 1;
    case 'full':
      return 0.92;
    default:
      return 0.78;
  }
};

export async function renderContinuityShotImage(args: RenderContinuityShotImageArgs): Promise<string> {
  const img = await loadImage(args.sourceImageUrl);
  const sourceW = Math.max(1, img.naturalWidth || img.width);
  const sourceH = Math.max(1, img.naturalHeight || img.height);
  const aspect = sourceW / sourceH;

  const outputW = Math.max(1, Math.round(args.outputWidth || sourceW));
  const outputH = Math.max(1, Math.round(outputW / aspect));
  const canvas = document.createElement('canvas');
  canvas.width = outputW;
  canvas.height = outputH;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas context unavailable for continuity shot render.');

  const subject = getSceneSubjectBounds(args.sceneTruth);
  const subjectCx = subject.x + (subject.width / 2);
  const subjectCy = subject.y + (subject.height / 2);

  let cropW = sourceW * cropScaleForPreset(args.preset);
  let cropH = cropW / aspect;

  const subjectPixelW = subject.width * sourceW;
  const subjectPixelH = subject.height * sourceH;
  const minPadding = args.preset.framing === 'closeup' ? 1.25 : 1.45;
  cropW = Math.max(cropW, subjectPixelW * minPadding);
  cropH = Math.max(cropH, subjectPixelH * (args.preset.framing === 'closeup' ? 0.7 : 1.05));

  if (cropW / cropH > aspect) {
    cropH = cropW / aspect;
  } else {
    cropW = cropH * aspect;
  }

  cropW = Math.min(sourceW, cropW);
  cropH = Math.min(sourceH, cropH);

  let centerX = subjectCx * sourceW;
  let centerY = subjectCy * sourceH;

  if (args.preset.placement === 'leftThird') {
    centerX -= cropW * 0.08;
  } else if (args.preset.placement === 'rightThird') {
    centerX += cropW * 0.08;
  }

  if (args.preset.elevation === 'high') {
    centerY += cropH * 0.07;
  } else if (args.preset.elevation === 'low') {
    centerY -= cropH * 0.07;
  }

  if (args.preset.framing === 'closeup') {
    centerY = (subject.y + Math.min(subject.height * 0.38, 0.34)) * sourceH;
  }

  const cropX = clamp(centerX - (cropW / 2), 0, sourceW - cropW);
  const cropY = clamp(centerY - (cropH / 2), 0, sourceH - cropH);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, outputW, outputH);
  ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, outputW, outputH);

  return canvas.toDataURL('image/png');
}
