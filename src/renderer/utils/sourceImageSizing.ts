import type { RegionSourceImageMeta } from '../context/AppContext';

export const clampToMaxLongEdge = (
  width: number,
  height: number,
  maxLongEdge = 4096
): { width: number; height: number } | null => {
  if (!width || !height) return null;

  const longEdge = Math.max(width, height);

  if (longEdge <= maxLongEdge) {
    return { width: Math.round(width), height: Math.round(height) };
  }

  const scale = maxLongEdge / longEdge;

  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale)
  };
};

export const getImageIntrinsicSize = (url: string): Promise<{ width: number; height: number }> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      if (!width || !height) {
        reject(new Error('Image dimensions are unavailable.'));
        return;
      }
      resolve({ width, height });
    };
    img.onerror = () => reject(new Error('Failed to read image dimensions.'));
    img.src = url;
  });

export const buildSourceImageMeta = (
  width: number,
  height: number,
  maxLongEdge = 4096
): RegionSourceImageMeta | null => {
  const derived = clampToMaxLongEdge(width, height, maxLongEdge);
  if (!derived) return null;

  return {
    width: Math.round(width),
    height: Math.round(height),
    derivedRenderWidth: derived.width,
    derivedRenderHeight: derived.height,
    aspectRatio: width / height
  };
};
