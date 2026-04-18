import * as THREE from 'three';
import { SHOT_PRESETS } from './shotsPresets';
import type { ShotPresetId } from '../types/shots';
import { extractSceneAssets } from './sceneDecompositionHelpers';

export type ReprojectedShotResult = {
  imageUrl: string;
  holeMaskUrl?: string;
  repairMaskUrl?: string;
  protectedMaskUrl?: string;
  debugUrl?: string;
  metadata: {
    presetId: string;
    subjectAnchorPoint: { x: number; y: number };
    lookTargetPoint: { x: number; y: number };
    cameraTransform: {
      x: number;
      y: number;
      z: number;
      yaw: number;
      pitch: number;
      fov: number;
    };
  };
};

type AlphaBounds = { x: number; y: number; width: number; height: number };
type BinaryMask = Uint8Array;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

function parseAspectRatio(aspectRatio?: string): number {
  if (!aspectRatio) return 16 / 9;
  const m = aspectRatio.match(/^(\d+)\s*:\s*(\d+)$/);
  if (!m) return 16 / 9;
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return 16 / 9;
  return w / h;
}

function loadTexture(url: string): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(
      url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        resolve(tex);
      },
      undefined,
      reject
    );
  });
}

function alphaToMask(canvas: HTMLCanvasElement, isWhite: (alpha: number) => boolean): BinaryMask {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return new Uint8Array(canvas.width * canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const mask = new Uint8Array(canvas.width * canvas.height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    mask[p] = isWhite(data[i + 3]) ? 1 : 0;
  }
  return mask;
}

function dilateMask(mask: BinaryMask, width: number, height: number, iterations = 1): BinaryMask {
  let curr = mask.slice();
  for (let iter = 0; iter < iterations; iter++) {
    const out = new Uint8Array(curr.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let hit = 0;
        for (let oy = -1; oy <= 1 && !hit; oy++) {
          const ny = y + oy;
          if (ny < 0 || ny >= height) continue;
          for (let ox = -1; ox <= 1; ox++) {
            const nx = x + ox;
            if (nx < 0 || nx >= width) continue;
            if (curr[ny * width + nx]) {
              hit = 1;
              break;
            }
          }
        }
        out[y * width + x] = hit;
      }
    }
    curr = out;
  }
  return curr;
}

function erodeMask(mask: BinaryMask, width: number, height: number, iterations = 1): BinaryMask {
  let curr = mask.slice();
  for (let iter = 0; iter < iterations; iter++) {
    const out = new Uint8Array(curr.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let keep = 1;
        for (let oy = -1; oy <= 1 && keep; oy++) {
          const ny = y + oy;
          if (ny < 0 || ny >= height) {
            keep = 0;
            break;
          }
          for (let ox = -1; ox <= 1; ox++) {
            const nx = x + ox;
            if (nx < 0 || nx >= width || !curr[ny * width + nx]) {
              keep = 0;
              break;
            }
          }
        }
        out[y * width + x] = keep;
      }
    }
    curr = out;
  }
  return curr;
}

function closeMask(mask: BinaryMask, width: number, height: number, iterations = 1): BinaryMask {
  return erodeMask(dilateMask(mask, width, height, iterations), width, height, iterations);
}

function subtractMask(base: BinaryMask, subtract: BinaryMask): BinaryMask {
  const out = new Uint8Array(base.length);
  for (let i = 0; i < base.length; i++) out[i] = base[i] && !subtract[i] ? 1 : 0;
  return out;
}

function invertMask(mask: BinaryMask): BinaryMask {
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) out[i] = mask[i] ? 0 : 1;
  return out;
}

function borderConnectedMask(mask: BinaryMask, width: number, height: number): BinaryMask {
  const out = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  let qh = 0;
  let qt = 0;

  const push = (x: number, y: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const idx = y * width + x;
    if (!mask[idx] || out[idx]) return;
    out[idx] = 1;
    queue[qt++] = idx;
  };

  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    push(0, y);
    push(width - 1, y);
  }

  while (qh < qt) {
    const idx = queue[qh++];
    const x = idx % width;
    const y = (idx / width) | 0;
    if (x > 0) push(x - 1, y);
    if (x + 1 < width) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y + 1 < height) push(x, y + 1);
  }

  return out;
}

function removeSmallComponents(mask: BinaryMask, width: number, height: number, minArea: number): BinaryMask {
  const out = new Uint8Array(mask.length);
  const seen = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);

  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || seen[i]) continue;
    let qh = 0;
    let qt = 0;
    queue[qt++] = i;
    seen[i] = 1;
    const pixels: number[] = [];

    while (qh < qt) {
      const idx = queue[qh++];
      pixels.push(idx);
      const x = idx % width;
      const y = (idx / width) | 0;

      const visit = (nx: number, ny: number) => {
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) return;
        const n = ny * width + nx;
        if (!mask[n] || seen[n]) return;
        seen[n] = 1;
        queue[qt++] = n;
      };

      visit(x - 1, y);
      visit(x + 1, y);
      visit(x, y - 1);
      visit(x, y + 1);
    }

    if (pixels.length >= minArea) {
      for (const p of pixels) out[p] = 1;
    }
  }

  return out;
}

function maskToDataUrl(mask: BinaryMask, width: number, height: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return '';
  const img = ctx.createImageData(width, height);
  for (let i = 0, p = 0; p < mask.length; p++, i += 4) {
    const v = mask[p] ? 255 : 0;
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

function buildRepairAndProtectionMasks(canvas: HTMLCanvasElement): { repairMaskUrl: string; protectedMaskUrl: string } {
  const width = canvas.width;
  const height = canvas.height;
  const totalPixels = width * height;

  const holeCandidate = alphaToMask(canvas, (alpha) => alpha < 10);
  const borderHole = borderConnectedMask(holeCandidate, width, height);
  let repairMask = subtractMask(holeCandidate, borderHole);

  // Keep the mask focused on true tears/missing islands, not single-pixel specks.
  repairMask = closeMask(repairMask, width, height, 1);
  repairMask = removeSmallComponents(repairMask, width, height, Math.max(12, Math.round(totalPixels * 0.00002)));
  repairMask = dilateMask(repairMask, width, height, 1);

  const protectedMask = invertMask(repairMask);
  return {
    repairMaskUrl: maskToDataUrl(repairMask, width, height),
    protectedMaskUrl: maskToDataUrl(protectedMask, width, height)
  };
}

function getTextureImageSize(tex: THREE.Texture): { width: number; height: number } {
  const img = tex.image as { width: number; height: number };
  return { width: img.width, height: img.height };
}

function getOpaqueBounds(tex: THREE.Texture): AlphaBounds {
  const img = tex.image as CanvasImageSource & { width: number; height: number };
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { x: 0, y: 0, width: img.width, height: img.height };

  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const idx = (y * canvas.width + x) * 4;
      if (data[idx + 3] > 10) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return { x: 0, y: 0, width: img.width, height: img.height };
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1
  };
}

function createBoundedCard(args: {
  texture: THREE.Texture;
  bounds: AlphaBounds;
  imageWidth: number;
  imageHeight: number;
  stageWidth: number;
  stageHeight: number;
  z: number;
  opacity?: number;
}): THREE.Mesh {
  const { texture, bounds, imageWidth, imageHeight, stageWidth, stageHeight, z, opacity = 1 } = args;

  const worldW = (bounds.width / imageWidth) * stageWidth;
  const worldH = (bounds.height / imageHeight) * stageHeight;

  const geo = new THREE.PlaneGeometry(worldW, worldH, 1, 1);
  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity,
    side: THREE.DoubleSide
  });

  const mesh = new THREE.Mesh(geo, mat);
  const cx = bounds.x + bounds.width * 0.5;
  const cy = bounds.y + bounds.height * 0.5;
  mesh.position.x = ((cx / imageWidth) - 0.5) * stageWidth;
  mesh.position.y = (0.5 - (cy / imageHeight)) * stageHeight;
  mesh.position.z = z;
  return mesh;
}

export async function buildReprojectedShot(args: {
  sceneImageUrl: string;
  depthMapUrl?: string | null;
  presetId: string;
  aspectRatio?: string;
  subjectAnchorPoint?: { x: number; y: number } | null;
  lookTargetPoint?: { x: number; y: number } | null;
}): Promise<ReprojectedShotResult> {
  const preset = SHOT_PRESETS[args.presetId as ShotPresetId];
  if (!preset) throw new Error(`Invalid preset ID: ${args.presetId}`);

  const assets = await extractSceneAssets({
    sceneImageUrl: args.sceneImageUrl,
    depthMapUrl: args.depthMapUrl
  });

  const occluderUrls =
    assets.foregroundOccluderLayerUrls.length > 0
      ? assets.foregroundOccluderLayerUrls
      : [assets.leftPillarLayerUrl, assets.rightPillarLayerUrl].filter(Boolean);

  const [subjectTex, groundTex, midTex, rearTex, ...occluderTex] = await Promise.all([
    loadTexture(assets.primarySubjectLayerUrl),
    loadTexture(assets.groundPlaneLayerUrl),
    loadTexture(assets.midgroundStructureLayerUrl),
    loadTexture(assets.backgroundEnvelopeLayerUrl),
    ...occluderUrls.map((url) => loadTexture(url))
  ]);

  const { width: imgW, height: imgH } = getTextureImageSize(rearTex);
  const outputW = 1280;
  const targetAspect = parseAspectRatio(args.aspectRatio);
  const outputH = Math.max(360, Math.round(outputW / targetAspect));

  const stageWidth = 16;
  const stageHeight = stageWidth * (imgH / imgW);

  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    preserveDrawingBuffer: true,
    antialias: true
  });
  renderer.setSize(outputW, outputH);
  renderer.setPixelRatio(1);

  const scene = new THREE.Scene();

  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
  [subjectTex, groundTex, midTex, rearTex, ...occluderTex].forEach((tex) => {
    tex.anisotropy = Math.max(1, Math.min(8, maxAnisotropy));
    tex.needsUpdate = true;
  });

  // Rear envelope plane (continuous coverage to suppress catastrophic tears).
  const rearGeo = new THREE.PlaneGeometry(stageWidth * 3.5, stageHeight * 3.5, 1, 1);
  const rearMat = new THREE.MeshBasicMaterial({
    map: rearTex,
    transparent: false,
    side: THREE.DoubleSide
  });
  const rearMesh = new THREE.Mesh(rearGeo, rearMat);
  rearMesh.position.z = -28;
  scene.add(rearMesh);

  // Midground structures as a separate card for believable parallax separation.
  const midBounds = getOpaqueBounds(midTex);
  const midMesh = createBoundedCard({
    texture: midTex,
    bounds: midBounds,
    imageWidth: imgW,
    imageHeight: imgH,
    stageWidth,
    stageHeight,
    z: -12.5,
    opacity: 0.9
  });
  scene.add(midMesh);

  // Ground as an actual floor plane, inferred from ground-layer footprint.
  const groundBounds = getOpaqueBounds(groundTex);
  const groundCenterX = ((groundBounds.x + groundBounds.width * 0.5) / imgW - 0.5) * stageWidth;
  const groundBottomNorm = (groundBounds.y + groundBounds.height) / imgH;
  const floorY = (0.5 - groundBottomNorm) * stageHeight + stageHeight * 0.11;
  const floorW = Math.max((groundBounds.width / imgW) * stageWidth * 1.45, stageWidth * 1.1);
  const floorD = Math.max(stageWidth * 1.8, floorW * 0.98);
  const floorGeo = new THREE.PlaneGeometry(floorW, floorD, 1, 1);
  const floorMat = new THREE.MeshBasicMaterial({
    map: groundTex,
    transparent: true,
    opacity: 0.96,
    side: THREE.DoubleSide
  });
  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.set(groundCenterX, floorY, -7.4);
  scene.add(floorMesh);

  // Subject as anchor-locked card.
  const subjectBounds = getOpaqueBounds(subjectTex);
  const subjectMesh = createBoundedCard({
    texture: subjectTex,
    bounds: subjectBounds,
    imageWidth: imgW,
    imageHeight: imgH,
    stageWidth,
    stageHeight,
    z: 1.25
  });
  subjectMesh.renderOrder = 20;
  scene.add(subjectMesh);

  // Independent foreground occluders.
  const occluderMeshes: THREE.Mesh[] = occluderTex.map((tex, idx) => {
    const b = getOpaqueBounds(tex);
    const m = createBoundedCard({
      texture: tex,
      bounds: b,
      imageWidth: imgW,
      imageHeight: imgH,
      stageWidth,
      stageHeight,
      z: 6.9 + idx * 1.75
    });

    // Reduce "flat billboard" feel with slight side-dependent orientation and depth refinement.
    const lateralFromCenter = clamp(m.position.x / (stageWidth * 0.5), -1, 1);
    const sideSign = lateralFromCenter >= 0 ? 1 : -1;
    const magnitude = Math.abs(lateralFromCenter);
    m.rotation.y = clamp(sideSign * (0.16 + magnitude * 0.31), -0.52, 0.52);
    m.rotation.x = clamp(-0.04 * (idx + 1), -0.12, -0.015);
    m.position.z += magnitude * 2.7;

    m.renderOrder = 30 + idx;
    return m;
  });
  occluderMeshes.forEach((m) => scene.add(m));

  const fov = preset.fov ?? 42;
  const camera = new THREE.PerspectiveCamera(fov, outputW / outputH, 0.1, 120);

  // Camera orbits around subject/world anchor and looks at an independent framing target.
  const normalizedAnchor = {
    x: clamp01(args.subjectAnchorPoint?.x ?? assets.subjectAnchor.x),
    y: clamp01(args.subjectAnchorPoint?.y ?? assets.subjectAnchor.y)
  };
  const fallbackLookTarget = {
    x: clamp01(normalizedAnchor.x + ((preset.lookTargetXOffset ?? 0) / stageWidth)),
    y: clamp01(normalizedAnchor.y - ((preset.lookTargetYOffset ?? 0) / stageHeight))
  };
  const normalizedLookTarget = {
    x: clamp01(args.lookTargetPoint?.x ?? fallbackLookTarget.x),
    y: clamp01(args.lookTargetPoint?.y ?? fallbackLookTarget.y)
  };

  const anchor = new THREE.Vector3(
    (normalizedAnchor.x - 0.5) * stageWidth,
    (0.5 - normalizedAnchor.y) * stageHeight,
    0
  );
  const lookTarget = new THREE.Vector3(
    (normalizedLookTarget.x - 0.5) * stageWidth,
    (0.5 - normalizedLookTarget.y) * stageHeight,
    0
  );

  const targetOccupancy = clamp(preset.targetOccupancy ?? 0.52, 0.2, 1);
  const occupancyDistanceBias = (0.52 - targetOccupancy) * 1.4;
  const framingMinDistance =
    preset.framing === 'closeup' ? 2.7 : preset.framing === 'mediumClose' ? 2.45 : 2.2;
  const baseDistance = clamp(8 + (preset.cameraOffsetZ ?? 0) + occupancyDistanceBias, framingMinDistance, 18);
  const spherical = new THREE.Spherical(
    baseDistance,
    clamp(Math.PI / 2 - (preset.pitch ?? 0), 0.35, Math.PI - 0.35),
    -(preset.yaw ?? 0)
  );
  const orbitOffset = new THREE.Vector3().setFromSpherical(spherical);
  orbitOffset.x += preset.cameraOffsetX ?? 0;
  orbitOffset.y += preset.cameraOffsetY ?? 0;

  camera.position.copy(anchor.clone().add(orbitOffset));
  camera.lookAt(lookTarget);

  renderer.render(scene, camera);

  const imageUrl = renderer.domElement.toDataURL('image/png');
  const { repairMaskUrl, protectedMaskUrl } = buildRepairAndProtectionMasks(renderer.domElement);

  // Cleanup
  rearGeo.dispose();
  rearMat.dispose();
  floorGeo.dispose();
  floorMat.dispose();
  [midMesh, subjectMesh, ...occluderMeshes].forEach((mesh) => {
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  });
  subjectTex.dispose();
  groundTex.dispose();
  midTex.dispose();
  rearTex.dispose();
  occluderTex.forEach((t) => t.dispose());
  renderer.dispose();

  return {
    imageUrl,
    holeMaskUrl: repairMaskUrl,
    repairMaskUrl,
    protectedMaskUrl,
    metadata: {
      presetId: args.presetId,
      subjectAnchorPoint: normalizedAnchor,
      lookTargetPoint: normalizedLookTarget,
      cameraTransform: {
        x: preset.cameraOffsetX ?? 0,
        y: preset.cameraOffsetY ?? 0,
        z: preset.cameraOffsetZ ?? 0,
        yaw: preset.yaw ?? 0,
        pitch: preset.pitch ?? 0,
        fov
      }
    }
  };
}
