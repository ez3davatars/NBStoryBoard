import { removeBackground } from '@imgly/background-removal';

type Rect = { x: number; y: number; width: number; height: number };
type Component = {
  pixels: number[];
  area: number;
  bbox: Rect;
  cx: number;
  cy: number;
  touchesTop: boolean;
  touchesBottom: boolean;
};

export type DecompositionAssets = {
  primarySubjectLayerUrl: string;
  foregroundOccluderLayerUrls: string[];
  groundPlaneLayerUrl: string;
  midgroundStructureLayerUrl: string;
  backgroundEnvelopeLayerUrl: string;
  depthMapUrl: string;
  subjectAnchor: {
    x: number;
    y: number;
    bounds: Rect;
  };

  // Backward-compatible aliases for any lingering legacy callsites.
  subjectLayerUrl: string;
  leftPillarLayerUrl: string;
  rightPillarLayerUrl: string;
  floorLayerUrl: string;
  rearCrowdLayerUrl: string;
};

const extractionCache = new Map<string, DecompositionAssets>();

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

function createEmptyCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function createTransparentDataUrl(width: number, height: number): string {
  return createEmptyCanvas(width, height).toDataURL('image/png');
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
  return img;
}

function toImageData(canvas: HTMLCanvasElement): ImageData {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not acquire 2D context');
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function createSyntheticDepthCanvas(sourceCanvas: HTMLCanvasElement): HTMLCanvasElement {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const out = createEmptyCanvas(w, h);
  const src = toImageData(sourceCanvas).data;
  const outCtx = out.getContext('2d');
  if (!outCtx) return out;

  const outData = outCtx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const yNorm = y / Math.max(1, h - 1);
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const r = src[idx];
      const g = src[idx + 1];
      const b = src[idx + 2];
      const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

      // Nearness proxy: lower screen + darker structural regions tend to be closer.
      const near = clamp(0.68 * yNorm + 0.22 * (1 - luma) + 0.1 * (1 - Math.abs((x / w) - 0.5)), 0, 1);
      const gray = Math.round(near * 255);

      outData.data[idx] = gray;
      outData.data[idx + 1] = gray;
      outData.data[idx + 2] = gray;
      outData.data[idx + 3] = 255;
    }
  }
  outCtx.putImageData(outData, 0, 0);
  return out;
}

function maskFromAlpha(data: Uint8ClampedArray, alphaThreshold = 16): Uint8Array {
  const mask = new Uint8Array(data.length / 4);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    if (data[i + 3] >= alphaThreshold) mask[j] = 1;
  }
  return mask;
}

function boundsFromMask(mask: Uint8Array, width: number, height: number): Rect | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!mask[i]) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function dilate(mask: Uint8Array, width: number, height: number, iterations = 1): Uint8Array {
  let curr = mask.slice();
  for (let it = 0; it < iterations; it++) {
    const next = curr.slice();
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (curr[i]) continue;
        const x0 = Math.max(0, x - 1);
        const x1 = Math.min(width - 1, x + 1);
        const y0 = Math.max(0, y - 1);
        const y1 = Math.min(height - 1, y + 1);
        let hit = 0;
        for (let ny = y0; ny <= y1 && !hit; ny++) {
          for (let nx = x0; nx <= x1; nx++) {
            if (curr[ny * width + nx]) {
              hit = 1;
              break;
            }
          }
        }
        if (hit) next[i] = 1;
      }
    }
    curr = next;
  }
  return curr;
}

function erode(mask: Uint8Array, width: number, height: number, iterations = 1): Uint8Array {
  let curr = mask.slice();
  for (let it = 0; it < iterations; it++) {
    const next = curr.slice();
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (!curr[i]) continue;
        const x0 = Math.max(0, x - 1);
        const x1 = Math.min(width - 1, x + 1);
        const y0 = Math.max(0, y - 1);
        const y1 = Math.min(height - 1, y + 1);
        let keep = 1;
        for (let ny = y0; ny <= y1 && keep; ny++) {
          for (let nx = x0; nx <= x1; nx++) {
            if (!curr[ny * width + nx]) {
              keep = 0;
              break;
            }
          }
        }
        if (!keep) next[i] = 0;
      }
    }
    curr = next;
  }
  return curr;
}

function closeMask(mask: Uint8Array, width: number, height: number, iterations = 1): Uint8Array {
  return erode(dilate(mask, width, height, iterations), width, height, iterations);
}

function subtractMask(base: Uint8Array, remove: Uint8Array): Uint8Array {
  const out = base.slice();
  for (let i = 0; i < out.length; i++) {
    if (remove[i]) out[i] = 0;
  }
  return out;
}

function orMask(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = a.slice();
  for (let i = 0; i < out.length; i++) {
    if (b[i]) out[i] = 1;
  }
  return out;
}

function invertMask(mask: Uint8Array): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) out[i] = mask[i] ? 0 : 1;
  return out;
}

function fillMaskHoles(mask: Uint8Array, width: number, height: number): Uint8Array {
  const inv = invertMask(mask);
  const visited = new Uint8Array(inv.length);
  const queue: number[] = [];

  const pushIfExterior = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const idx = y * width + x;
    if (!inv[idx] || visited[idx]) return;
    visited[idx] = 1;
    queue.push(idx);
  };

  for (let x = 0; x < width; x++) {
    pushIfExterior(x, 0);
    pushIfExterior(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    pushIfExterior(0, y);
    pushIfExterior(width - 1, y);
  }

  for (let q = 0; q < queue.length; q++) {
    const idx = queue[q];
    const x = idx % width;
    const y = (idx / width) | 0;
    pushIfExterior(x - 1, y);
    pushIfExterior(x + 1, y);
    pushIfExterior(x, y - 1);
    pushIfExterior(x, y + 1);
  }

  const out = mask.slice();
  for (let i = 0; i < inv.length; i++) {
    if (inv[i] && !visited[i]) out[i] = 1;
  }
  return out;
}

function connectedComponents(mask: Uint8Array, width: number, height: number, minArea = 1): Component[] {
  const visited = new Uint8Array(mask.length);
  const components: Component[] = [];

  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || visited[i]) continue;

    const queue: number[] = [i];
    visited[i] = 1;

    let area = 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    let sumX = 0;
    let sumY = 0;
    let touchesTop = false;
    let touchesBottom = false;

    for (let q = 0; q < queue.length; q++) {
      const idx = queue[q];
      const x = idx % width;
      const y = (idx / width) | 0;

      area++;
      sumX += x;
      sumY += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (y === 0) touchesTop = true;
      if (y === height - 1) touchesBottom = true;

      if (x > 0) {
        const n = idx - 1;
        if (mask[n] && !visited[n]) {
          visited[n] = 1;
          queue.push(n);
        }
      }
      if (x < width - 1) {
        const n = idx + 1;
        if (mask[n] && !visited[n]) {
          visited[n] = 1;
          queue.push(n);
        }
      }
      if (y > 0) {
        const n = idx - width;
        if (mask[n] && !visited[n]) {
          visited[n] = 1;
          queue.push(n);
        }
      }
      if (y < height - 1) {
        const n = idx + width;
        if (mask[n] && !visited[n]) {
          visited[n] = 1;
          queue.push(n);
        }
      }
    }

    if (area >= minArea) {
      components.push({
        pixels: queue,
        area,
        bbox: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
        cx: sumX / Math.max(1, area),
        cy: sumY / Math.max(1, area),
        touchesTop,
        touchesBottom
      });
    }
  }

  return components;
}

function componentsToMask(components: Component[], totalPixels: number): Uint8Array {
  const mask = new Uint8Array(totalPixels);
  for (const comp of components) {
    for (const idx of comp.pixels) mask[idx] = 1;
  }
  return mask;
}

function quantile(values: number[], q: number): number {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const idx = Math.floor(clamp(q, 0, 1) * (sorted.length - 1));
  return sorted[idx];
}

function kMeans1D(values: number[], k = 3, iterations = 8): number[] {
  if (values.length < k) return [0.2, 0.5, 0.8];
  let centers = [quantile(values, 0.2), quantile(values, 0.5), quantile(values, 0.8)];

  for (let it = 0; it < iterations; it++) {
    const sums = new Array(k).fill(0);
    const counts = new Array(k).fill(0);

    for (const v of values) {
      let best = 0;
      let bestDist = Math.abs(v - centers[0]);
      for (let i = 1; i < k; i++) {
        const d = Math.abs(v - centers[i]);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      }
      sums[best] += v;
      counts[best] += 1;
    }

    centers = centers.map((c, i) => (counts[i] > 0 ? sums[i] / counts[i] : c));
  }

  return centers.sort((a, b) => a - b);
}

function buildNearDepthMap(depthData: Uint8ClampedArray, width: number, height: number): Float32Array {
  const near = new Float32Array(width * height);

  let top = 0;
  let bottom = 0;
  let topCount = 0;
  let bottomCount = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const g = (depthData[idx] + depthData[idx + 1] + depthData[idx + 2]) / (3 * 255);
      if (y < height * 0.2) {
        top += g;
        topCount++;
      } else if (y > height * 0.8) {
        bottom += g;
        bottomCount++;
      }
    }
  }

  const topAvg = topCount ? top / topCount : 0.5;
  const bottomAvg = bottomCount ? bottom / bottomCount : 0.5;
  const whiteMeansNear = bottomAvg >= topAvg;

  for (let i = 0, p = 0; i < depthData.length; i += 4, p++) {
    const g = (depthData[i] + depthData[i + 1] + depthData[i + 2]) / (3 * 255);
    near[p] = whiteMeansNear ? g : 1 - g;
  }

  // Small blur to stabilize hard depth-map noise.
  const smoothed = near.slice();
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      smoothed[i] = (
        near[i] +
        near[i - 1] +
        near[i + 1] +
        near[i - width] +
        near[i + width]
      ) / 5;
    }
  }
  return smoothed;
}

function inferGroundStartY(
  nearDepth: Float32Array,
  nonSubjectMask: Uint8Array,
  width: number,
  height: number,
  subjectBounds: Rect
): number {
  const rowMeans = new Float32Array(height);
  for (let y = 0; y < height; y++) {
    let sum = 0;
    let count = 0;
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!nonSubjectMask[i]) continue;
      sum += nearDepth[i];
      count++;
    }
    rowMeans[y] = count > 0 ? sum / count : y / Math.max(1, height - 1);
  }

  const smooth = rowMeans.slice();
  for (let y = 2; y < height - 2; y++) {
    smooth[y] = (rowMeans[y - 2] + rowMeans[y - 1] + rowMeans[y] + rowMeans[y + 1] + rowMeans[y + 2]) / 5;
  }

  const searchStart = clamp(
    Math.round(Math.max(height * 0.38, subjectBounds.y + subjectBounds.height * 0.32)),
    0,
    height - 1
  );
  const searchEnd = clamp(Math.round(height * 0.93), 0, height - 1);

  let bestY = Math.round(height * 0.62);
  let bestGrad = -Infinity;
  for (let y = searchStart + 2; y <= searchEnd; y++) {
    const grad = smooth[y] - smooth[y - 2];
    if (grad > bestGrad) {
      bestGrad = grad;
      bestY = y;
    }
  }

  return clamp(bestY + Math.round(height * 0.02), Math.round(height * 0.52), Math.round(height * 0.88));
}

function layerCanvasFromMask(
  srcData: Uint8ClampedArray,
  width: number,
  height: number,
  mask: Uint8Array,
  opts?: { fillTransparent?: boolean; maxFillPasses?: number; forceOpaque?: boolean }
): HTMLCanvasElement {
  const canvas = createEmptyCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const out = ctx.createImageData(width, height);
  for (let p = 0, i = 0; p < mask.length; p++, i += 4) {
    if (!mask[p]) {
      out.data[i + 3] = 0;
      continue;
    }
    out.data[i] = srcData[i];
    out.data[i + 1] = srcData[i + 1];
    out.data[i + 2] = srcData[i + 2];
    out.data[i + 3] = 255;
  }

  if (opts?.fillTransparent) {
    const maxPasses = opts.maxFillPasses ?? 32;
    for (let pass = 0; pass < maxPasses; pass++) {
      let changed = 0;
      const prev = out.data.slice();
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const i = (y * width + x) * 4;
          if (prev[i + 3] > 0) continue;

          let r = 0;
          let g = 0;
          let b = 0;
          let c = 0;
          for (let ny = y - 1; ny <= y + 1; ny++) {
            for (let nx = x - 1; nx <= x + 1; nx++) {
              if (nx === x && ny === y) continue;
              const ni = (ny * width + nx) * 4;
              if (prev[ni + 3] > 0) {
                r += prev[ni];
                g += prev[ni + 1];
                b += prev[ni + 2];
                c++;
              }
            }
          }
          if (c >= 2) {
            out.data[i] = Math.round(r / c);
            out.data[i + 1] = Math.round(g / c);
            out.data[i + 2] = Math.round(b / c);
            out.data[i + 3] = opts.forceOpaque ? 255 : 210;
            changed++;
          }
        }
      }
      if (changed === 0) break;
    }

    // Final sweep to remove residual transparent pinholes in rear/background layers.
    if (opts.forceOpaque) {
      for (let y = 0; y < height; y++) {
        let lastR = 0;
        let lastG = 0;
        let lastB = 0;
        let seen = false;
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          if (out.data[i + 3] > 0) {
            lastR = out.data[i];
            lastG = out.data[i + 1];
            lastB = out.data[i + 2];
            seen = true;
          } else if (seen) {
            out.data[i] = lastR;
            out.data[i + 1] = lastG;
            out.data[i + 2] = lastB;
            out.data[i + 3] = 255;
          }
        }
        seen = false;
        for (let x = width - 1; x >= 0; x--) {
          const i = (y * width + x) * 4;
          if (out.data[i + 3] > 0) {
            lastR = out.data[i];
            lastG = out.data[i + 1];
            lastB = out.data[i + 2];
            seen = true;
          } else if (seen) {
            out.data[i] = lastR;
            out.data[i + 1] = lastG;
            out.data[i + 2] = lastB;
            out.data[i + 3] = 255;
          }
        }
      }
    }
  }

  ctx.putImageData(out, 0, 0);
  return canvas;
}

function buildFallbackSubjectMask(width: number, height: number): Uint8Array {
  const mask = new Uint8Array(width * height);
  const cx = width * 0.5;
  const cy = height * 0.55;
  const rx = width * 0.2;
  const ry = height * 0.35;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = (x - cx) / Math.max(1, rx);
      const ny = (y - cy) / Math.max(1, ry);
      if (nx * nx + ny * ny <= 1) mask[y * width + x] = 1;
    }
  }
  return mask;
}

export async function extractSceneAssets(args: {
  sceneImageUrl: string;
  depthMapUrl?: string | null;
}): Promise<DecompositionAssets> {
  const cacheKey = `${args.sceneImageUrl}::${args.depthMapUrl || ''}`;
  const cached = extractionCache.get(cacheKey);
  if (cached) return cached;

  const srcImg = await loadImage(args.sceneImageUrl);
  const srcCanvas = createEmptyCanvas(srcImg.width, srcImg.height);
  const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
  if (!srcCtx) throw new Error('Could not create source canvas context');
  srcCtx.drawImage(srcImg, 0, 0);
  const srcImageData = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);

  // Depth map source (real if provided, otherwise synthesized from scene geometry cues).
  let depthCanvas: HTMLCanvasElement;
  if (args.depthMapUrl) {
    try {
      const depthImg = await loadImage(args.depthMapUrl);
      depthCanvas = createEmptyCanvas(srcCanvas.width, srcCanvas.height);
      depthCanvas.getContext('2d')!.drawImage(depthImg, 0, 0, srcCanvas.width, srcCanvas.height);
    } catch {
      depthCanvas = createSyntheticDepthCanvas(srcCanvas);
    }
  } else {
    depthCanvas = createSyntheticDepthCanvas(srcCanvas);
  }
  const depthImageData = toImageData(depthCanvas);

  // Primary subject extraction (with fallback if background-removal model fails).
  let subjectCanvas = createEmptyCanvas(srcCanvas.width, srcCanvas.height);
  try {
    const subjectBlob = await removeBackground(args.sceneImageUrl, { debug: false, model: 'isnet' });
    const subjectObjUrl = URL.createObjectURL(subjectBlob);
    try {
      const subjectImg = await loadImage(subjectObjUrl);
      const sctx = subjectCanvas.getContext('2d');
      if (!sctx) throw new Error('Could not create subject canvas context');
      sctx.drawImage(subjectImg, 0, 0, srcCanvas.width, srcCanvas.height);
    } finally {
      URL.revokeObjectURL(subjectObjUrl);
    }
  } catch {
    // Degrade gracefully: central human-sized proxy mask rather than failing the whole pipeline.
    const fallbackMask = buildFallbackSubjectMask(srcCanvas.width, srcCanvas.height);
    subjectCanvas = layerCanvasFromMask(
      srcImageData.data,
      srcCanvas.width,
      srcCanvas.height,
      fallbackMask
    );
  }

  let subjectMask = maskFromAlpha(toImageData(subjectCanvas).data, 16);
  subjectMask = closeMask(subjectMask, srcCanvas.width, srcCanvas.height, 1);
  let subjectBounds = boundsFromMask(subjectMask, srcCanvas.width, srcCanvas.height);
  if (!subjectBounds || subjectBounds.width * subjectBounds.height < srcCanvas.width * srcCanvas.height * 0.01) {
    subjectMask = buildFallbackSubjectMask(srcCanvas.width, srcCanvas.height);
    subjectBounds = boundsFromMask(subjectMask, srcCanvas.width, srcCanvas.height);
  }
  if (!subjectBounds) {
    throw new Error('Failed to derive primary subject bounds');
  }

  const totalPixels = srcCanvas.width * srcCanvas.height;
  const nonSubjectMask = new Uint8Array(totalPixels);
  for (let i = 0; i < totalPixels; i++) nonSubjectMask[i] = subjectMask[i] ? 0 : 1;

  const nearDepth = buildNearDepthMap(depthImageData.data, srcCanvas.width, srcCanvas.height);

  // 1D depth clustering into far/mid/near groups.
  const sample: number[] = [];
  const stride = Math.max(1, Math.floor(totalPixels / 12000));
  for (let i = 0; i < totalPixels; i += stride) {
    if (nonSubjectMask[i]) sample.push(nearDepth[i]);
  }
  const centers = kMeans1D(sample, 3, 8);
  const t1 = (centers[0] + centers[1]) * 0.5;
  const t2 = (centers[1] + centers[2]) * 0.5;

  const farLabel = 0;
  const midLabel = 1;
  const nearLabel = 2;
  const labels = new Uint8Array(totalPixels);
  for (let i = 0; i < totalPixels; i++) {
    const d = nearDepth[i];
    labels[i] = d <= t1 ? farLabel : d <= t2 ? midLabel : nearLabel;
  }

  // Ground-plane inference from depth trend in lower rows.
  const groundStartY = inferGroundStartY(nearDepth, nonSubjectMask, srcCanvas.width, srcCanvas.height, subjectBounds);

  // Foreground occluders: nearest large vertical masses near subject anchor.
  const subjectCx = subjectBounds.x + subjectBounds.width * 0.5;
  const occluderCandidateMask = new Uint8Array(totalPixels);
  for (let y = 0; y < srcCanvas.height; y++) {
    for (let x = 0; x < srcCanvas.width; x++) {
      const i = y * srcCanvas.width + x;
      if (!nonSubjectMask[i]) continue;
      if (labels[i] !== nearLabel) continue;
      if (y > groundStartY + srcCanvas.height * 0.15) continue;
      occluderCandidateMask[i] = 1;
    }
  }

  const occluderComponents = connectedComponents(
    closeMask(occluderCandidateMask, srcCanvas.width, srcCanvas.height, 1),
    srcCanvas.width,
    srcCanvas.height,
    Math.round(totalPixels * 0.004)
  );

  const scoredOccluders = occluderComponents
    .map((c) => {
      const verticality = c.bbox.height / Math.max(1, c.bbox.width);
      const proximity = 1 - clamp(Math.abs(c.cx - subjectCx) / (srcCanvas.width * 0.65), 0, 1);
      const areaNorm = c.area / totalPixels;
      const verticalCoverage = c.bbox.height / srcCanvas.height;
      const score = areaNorm * 20 + verticality * 0.8 + proximity * 1.15 + verticalCoverage * 1.1;
      return { comp: c, score };
    })
    .filter((s) => s.comp.bbox.height > srcCanvas.height * 0.24 && s.comp.area > totalPixels * 0.005)
    .sort((a, b) => b.score - a.score);

  const leftBest = scoredOccluders.find((s) => s.comp.cx < subjectCx);
  const rightBest = scoredOccluders.find((s) => s.comp.cx >= subjectCx);
  const selectedOccluders: Component[] = [];
  if (leftBest) selectedOccluders.push(leftBest.comp);
  if (rightBest) selectedOccluders.push(rightBest.comp);
  if (!selectedOccluders.length && scoredOccluders[0]) selectedOccluders.push(scoredOccluders[0].comp);
  if (selectedOccluders.length === 1 && scoredOccluders[1]) selectedOccluders.push(scoredOccluders[1].comp);

  const occluderMasks = selectedOccluders.map((comp) => {
    const mask = new Uint8Array(totalPixels);
    for (const idx of comp.pixels) mask[idx] = 1;
    return dilate(mask, srcCanvas.width, srcCanvas.height, 1);
  });

  let occludersUnion: Uint8Array = new Uint8Array(totalPixels);
  for (const m of occluderMasks) occludersUnion = orMask(occludersUnion, m);

  // Ground plane layer.
  let groundMask: Uint8Array = new Uint8Array(totalPixels);
  for (let y = 0; y < srcCanvas.height; y++) {
    for (let x = 0; x < srcCanvas.width; x++) {
      const i = y * srcCanvas.width + x;
      if (!nonSubjectMask[i]) continue;
      if (y >= groundStartY && labels[i] !== farLabel) groundMask[i] = 1;
      if (y > srcCanvas.height * 0.9) groundMask[i] = 1;
    }
  }
  groundMask = subtractMask(groundMask, occludersUnion);
  groundMask = fillMaskHoles(closeMask(groundMask, srcCanvas.width, srcCanvas.height, 2), srcCanvas.width, srcCanvas.height);
  const groundComponents = connectedComponents(groundMask, srcCanvas.width, srcCanvas.height, Math.round(totalPixels * 0.004));
  groundMask = componentsToMask(
    groundComponents.filter((c) => c.touchesBottom || c.area > totalPixels * 0.01),
    totalPixels
  );
  if (!groundComponents.length) {
    for (let y = Math.round(srcCanvas.height * 0.72); y < srcCanvas.height; y++) {
      for (let x = 0; x < srcCanvas.width; x++) {
        const i = y * srcCanvas.width + x;
        if (nonSubjectMask[i]) groundMask[i] = 1;
      }
    }
  }

  // Midground structures.
  let midgroundMask: Uint8Array = new Uint8Array(totalPixels);
  for (let y = 0; y < srcCanvas.height; y++) {
    for (let x = 0; x < srcCanvas.width; x++) {
      const i = y * srcCanvas.width + x;
      if (!nonSubjectMask[i]) continue;
      if (labels[i] !== midLabel) continue;
      if (y > groundStartY + srcCanvas.height * 0.2) continue;
      midgroundMask[i] = 1;
    }
  }
  midgroundMask = subtractMask(midgroundMask, occludersUnion);
  midgroundMask = subtractMask(midgroundMask, groundMask);
  midgroundMask = closeMask(midgroundMask, srcCanvas.width, srcCanvas.height, 1);
  const midComponents = connectedComponents(midgroundMask, srcCanvas.width, srcCanvas.height, Math.round(totalPixels * 0.002));
  midgroundMask = componentsToMask(midComponents, totalPixels);

  // Background envelope (farthest continuous scene) with aggressive hole reduction.
  let backgroundMask: Uint8Array = new Uint8Array(totalPixels);
  for (let y = 0; y < srcCanvas.height; y++) {
    for (let x = 0; x < srcCanvas.width; x++) {
      const i = y * srcCanvas.width + x;
      if (!nonSubjectMask[i]) continue;
      if (labels[i] === farLabel || y < groundStartY - srcCanvas.height * 0.04) backgroundMask[i] = 1;
    }
  }
  backgroundMask = subtractMask(backgroundMask, occludersUnion);
  backgroundMask = closeMask(backgroundMask, srcCanvas.width, srcCanvas.height, 2);
  backgroundMask = fillMaskHoles(backgroundMask, srcCanvas.width, srcCanvas.height);
  const bgComponents = connectedComponents(backgroundMask, srcCanvas.width, srcCanvas.height, Math.round(totalPixels * 0.004));
  backgroundMask = componentsToMask(
    bgComponents.filter((c) => c.touchesTop || c.area > totalPixels * 0.08),
    totalPixels
  );
  let bgCoverage = 0;
  for (let i = 0; i < backgroundMask.length; i++) bgCoverage += backgroundMask[i];
  if (bgCoverage < totalPixels * 0.15) {
    backgroundMask = subtractMask(nonSubjectMask, groundMask);
    backgroundMask = subtractMask(backgroundMask, occludersUnion);
    backgroundMask = fillMaskHoles(closeMask(backgroundMask, srcCanvas.width, srcCanvas.height, 2), srcCanvas.width, srcCanvas.height);
  }

  // Build final layer images.
  const subjectCanvasFinal = layerCanvasFromMask(
    srcImageData.data,
    srcCanvas.width,
    srcCanvas.height,
    subjectMask
  );

  const foregroundOccluderLayerUrls = occluderMasks.map((m) =>
    layerCanvasFromMask(srcImageData.data, srcCanvas.width, srcCanvas.height, m).toDataURL('image/png')
  );

  const groundPlaneLayerUrl = layerCanvasFromMask(
    srcImageData.data,
    srcCanvas.width,
    srcCanvas.height,
    groundMask,
    { fillTransparent: true, maxFillPasses: 12 }
  ).toDataURL('image/png');

  const midgroundStructureLayerUrl = layerCanvasFromMask(
    srcImageData.data,
    srcCanvas.width,
    srcCanvas.height,
    midgroundMask,
    { fillTransparent: true, maxFillPasses: 8 }
  ).toDataURL('image/png');

  const backgroundEnvelopeLayerUrl = layerCanvasFromMask(
    srcImageData.data,
    srcCanvas.width,
    srcCanvas.height,
    backgroundMask,
    { fillTransparent: true, maxFillPasses: 96, forceOpaque: true }
  ).toDataURL('image/png');

  const subjectAnchor = {
    x: (subjectBounds.x + subjectBounds.width * 0.5) / srcCanvas.width,
    y: (subjectBounds.y + subjectBounds.height * 0.5) / srcCanvas.height,
    bounds: subjectBounds
  };

  const leftOccluder = foregroundOccluderLayerUrls[0] || createTransparentDataUrl(srcCanvas.width, srcCanvas.height);
  const rightOccluder = foregroundOccluderLayerUrls[1] || createTransparentDataUrl(srcCanvas.width, srcCanvas.height);

  const assets: DecompositionAssets = {
    primarySubjectLayerUrl: subjectCanvasFinal.toDataURL('image/png'),
    foregroundOccluderLayerUrls,
    groundPlaneLayerUrl,
    midgroundStructureLayerUrl,
    backgroundEnvelopeLayerUrl,
    depthMapUrl: depthCanvas.toDataURL('image/png'),
    subjectAnchor,

    // Legacy aliases
    subjectLayerUrl: subjectCanvasFinal.toDataURL('image/png'),
    leftPillarLayerUrl: leftOccluder,
    rightPillarLayerUrl: rightOccluder,
    floorLayerUrl: groundPlaneLayerUrl,
    rearCrowdLayerUrl: backgroundEnvelopeLayerUrl
  };

  extractionCache.set(cacheKey, assets);
  return assets;
}
