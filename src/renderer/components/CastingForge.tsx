import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Scissors,
  Trash2, Upload, RotateCw, MonitorPlay,
  Eraser, RefreshCw, X,
  Download, UserPlus, Sparkles,
  Search, Calendar, Type, Layers, Folder, HelpCircle,
  Maximize, LayoutTemplate, Share2, Info, CheckCircle2,
  ArrowDownUp, Edit2, FolderInput, Hammer, Lock,
  Zap, Clapperboard
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { GeminiService } from '../services/GeminiService';
import { ensureAuthenticatedForGeneration } from '../services/AuthGenerationGate';
import HelpTooltip from './ui/HelpTooltip';
import InlineHint from './ui/InlineHint';
import ActorSaveModal from './ActorSaveModal';
import ConfirmDialog from './ui/ConfirmDialog';

// Types are exported from AppContext
import type { CastMember } from '../context/AppContext';
import {
  saveAssetToDisk,
  loadAssetFromDisk,
  getStudioCoverFilename,
  verifyPermission
} from '../utils/FileSystemAssets';
import { isNativeParams, nativeLoadCover, nativeSaveCover, nativeWriteFile, nativeJoinPath } from '../utils/NativeFileAssets';
import { useRecentGenerationsStore } from '../stores/useRecentGenerationsStore';
import { RecentGenerationsCacheService } from '../services/RecentGenerationsCacheService';
import RecentGenerationsStrip from './recent/RecentGenerationsStrip';
import { createUniqueDownloadFilename } from '../utils/downloadFilenames';
import { buildHeadshotWardrobeContinuityContract, buildHeadshotWardrobeNegativeTokens } from '../../prompts/headshotWardrobeContinuity';
import { buildPoseCoherenceNegativeTokens, buildTurnaroundPoseCoherenceContract } from '../../prompts/poseCoherence';
import { SHEET_STYLE_LOCK_NEGATIVE_TEXT, buildSheetStyleLockContract } from '../../prompts/sheetStyleLock';
import { buildStyleCategoryContract, buildStyleNegativePrompt } from '../../prompts/styleContracts';

import coverRealism from '../assets/cover-realism.png';
import coverAnim from '../assets/cover-anim.png';
import coverIllustration from '../assets/cover-illustration.png';
import coverScifi from '../assets/cover-scifi.png';

// Import distinct Actor Library covers
import libRealism from '../assets/library-realism.png';
import libAnim from '../assets/library-anim.png';
import libIllustration from '../assets/library-illustration.png';
import libScifi from '../assets/library-scifi.png';
import libUnsorted from '../assets/library-unsorted.png';

const REFERENCE_SHEET_PROMPT = `
Create a professional, 8k resolution character reference sheet
based strictly on the provided fitted character image.

IMPORTANT:
This is a DOCUMENTATION task, not a refitting task.

ABSOLUTE RULES:

1. NO RE-FITTING
- Do NOT alter costume proportions, openings, or geometry.
- Do NOT reposition the face, head, or neck.
- Do NOT reinterpret anatomy.
- Preserve the exact fitted result as-is.

2. IDENTITY PRESERVATION
- The subject must remain the same person across all views.
- Facial features must remain consistent where visible.
- Do NOT invent or exaggerate facial structure.

3. COSTUME PRESERVATION
- The mascot costume is rigid.
- Jaw, mouth opening, and neck opening must remain fixed.
- No stretching, sliding, or reshaping across views.

4. VIEW CONSISTENCY
- Each view shows the SAME fitted character from a different camera angle.
- No duplicates.
- No symmetry mirroring tricks.

5. CAMERA SET
- Full Body: Front, Left Profile, Right Profile, Rear
- Head Close-ups: Front, Left 3/4, Right 3/4, Side Profile

6. COMPOSITION
- Solid black studio background (#000000).
- Empty negative space.
- No floating heads.
- No disembodied parts.
- No extra characters.

7. OUTPUT QUALITY
- Crisp, production-ready.
- No artifacts.
- No stylization drift.

NEGATIVE CONSTRAINTS:
refitting, reinterpreting anatomy, moving openings,
elongated necks, stretched costume,
floating heads, mannequins, text, watermarks.
`;

const REFERENCE_SHEET_GLOBAL_HARD_CONSTRAINTS = `
ANATOMY INTEGRITY (NON-NEGOTIABLE):
- Each full-body panel must contain exactly ONE complete subject.
- Exactly ONE head and ONE neck per subject. Never two heads on one body.
- Never create fused anatomy, conjoined silhouettes, duplicate torsos, ghost overlays, or extra limbs.
- If uncertain, simplify to one clean subject and preserve identity rather than inventing parts.

PANEL COMPLETENESS:
- Fill every required slot exactly once.
- Do not leave blank slots.
- Do not overlap two camera views in one slot.
- Do not add extra slots, bonus panels, unlabeled duplicate views, or a second row where a single row is specified.
`;

const REFERENCE_SHEET_SPLIT_HARD_CONSTRAINTS = `
SPLIT LAYOUT SLOT MAP (STRICT):
- LEFT COLUMN (top to bottom, exactly 3 slots):
  L1 = full body FRONT view
  L2 = full body LEFT PROFILE view (single head, single neck)
  L3 = full body BACK/REAR view

- RIGHT GRID (2x2, exactly 4 slots):
  R1 = headshot FRONT
  R2 = headshot EXTREME LEFT PROFILE (anatomical left-side profile; nose/snout points toward screen-right)
  R3 = headshot EXTREME RIGHT PROFILE (anatomical right-side profile; nose/snout points toward screen-left)
  R4 = headshot LOOKING UP (still same identity)

SPLIT PROFILE PAIR LOCK:
- R2 and R3 are paired technical opposite views, not two generic side closeups.
- R2 must show the subject looking toward screen-right with the nose/snout/face protruding to the RIGHT edge of its panel.
- R3 must show the subject looking toward screen-left with the nose/snout/face protruding to the LEFT edge of its panel.
- R2 and R3 must have opposite silhouettes. The ear/head-back mass, muzzle/nose direction, collar direction, and visible side hardware/clothing edge must all flip.
- If R2 and R3 both point the same screen direction, the sheet is invalid and must be internally redrawn before final output.

HARD FAILURE CONDITIONS (MUST NOT OCCUR):
- Two heads in one body slot
- Mirrored twin-head body
- Partial second body in any slot
- Empty slot in the 7-slot sheet
`;

const REFERENCE_SHEET_FORM_HARD_CONSTRAINTS = `
FORM LAYOUT SLOT MAP (STRICT):
- TOP ROW (exactly 3 full-body slots):
  T1 = FRONT
  T2 = LEFT PROFILE
  T3 = BACK/REAR

- BOTTOM SINGLE HORIZONTAL ROW (exactly 4 headshot slots, one row only):
  B1 = FRONT
  B2 = EXTREME LEFT PROFILE (anatomical left-side profile; nose/snout points toward screen-right)
  B3 = EXTREME RIGHT PROFILE (anatomical right-side profile; nose/snout points toward screen-left)
  B4 = LOOKING UP

FORM LAYOUT HARD RULE:
- The bottom band is one horizontal strip with four equal-width cells: B1, B2, B3, B4.
- Do not make a 2x2 grid, do not stack two rows of headshots, and do not add unlabeled duplicate headshots above the labeled row.
- Total sheet count is exactly 7 panels: 3 full-body panels plus 4 headshot panels.
`;

const REFERENCE_SHEET_FACE_HARD_CONSTRAINTS = `
FACE LAYOUT SLOT MAP (STRICT):
- TOP ROW (exactly 4 headshot slots):
  T1 = FRONT
  T2 = EXTREME LEFT PROFILE (anatomical left-side profile; nose/snout points toward screen-right)
  T3 = EXTREME RIGHT PROFILE (anatomical right-side profile; nose/snout points toward screen-left)
  T4 = LOOKING UP

- BOTTOM ROW (exactly 3 full-body slots):
  B1 = FRONT
  B2 = LEFT PROFILE
  B3 = BACK/REAR
`;

const REFERENCE_SHEET_CALLOUT_LABELS_BASE = `
CALLOUT LABELS ENABLED:
Create the reference sheet with clean professional annotation labels and thin leader lines. The annotation priority is WARDROBE FIRST: clothing construction, collar/neckline, sleeve shape, gloves, panels, seams, piping/trim, belts/waist details, leg panels, boots/footwear, accessories, logo placement, and view angles. Do not invent measurements, materials, brand names, character names, height, or hidden details. If height is not provided, do not add a height scale. Keep labels minimal, readable, correctly spelled, and placed outside the character silhouette whenever possible.

CALLOUT TEXT RULES:
- Callout labels are the only permitted text on the sheet.
- Every view-angle label must match the artwork in that exact slot. A label is invalid if the face/body angle underneath it does not match.
- At least 70 percent of non-view callouts must describe clothing, accessories, footwear, or logo placement.
- Facial callouts are limited to one or two identity-critical marks only, such as a distinctive scar, facial hair, makeup, or eyewear.
- Do not label generic facial anatomy such as green eyes, refined facial features, jaw detail, gaze direction, nostrils, cheekbones, lips, or nose unless the user explicitly requested that exact detail.
- In headshot panels, use visible collar, neckline, shoulder, trim, jewelry, headwear, or hairstyle callouts before any face-anatomy callouts.
- Do not add captions, paragraphs, watermarks, brand names, character names, ages, heights, measurements, or material claims.
- If an item is ambiguous, use generic wardrobe wording such as Collar Detail, Sleeve Panel, Chest Panel, Waist Detail, Glove Detail, Boot Detail, Footwear Detail, Accessory Detail, Wardrobe Detail, or Logo Placement.
- Do not let labels or leader lines cover the face, eyes, silhouette read, logo, or key costume details.
- Avoid clutter; use only the most important visible labels.
`;

const getReferenceSheetCalloutPrompt = (layout: RefSheetLayoutMode, logoPlacement?: string) => {
  let prompt = REFERENCE_SHEET_CALLOUT_LABELS_BASE;

  if (layout === 'form_focus') {
    prompt += `
FORM SHEET CALLOUT FOCUS:
- Prioritize wardrobe documentation across the full-body row: collar/neckline, chest panels, shoulder/sleeve construction, gloves, waist/hip details, leg panels, back panels, boots/footwear${logoPlacement ? `, and Logo Placement at ${logoPlacement}` : ', and logo placement only if visible or explicitly provided'}.
- Headshot labels should mostly identify visible collar, neckline, shoulder trim, hairstyle, headwear, jewelry, or eyewear. Avoid generic face labels.
- Use general wardrobe labels when a precise clothing detail is not visible.`;
  } else if (layout === 'face_focus') {
    prompt += `
FACE SHEET CALLOUT FOCUS:
- Even in face-focus mode, prioritize visible wardrobe and styling anchors: collar/neckline, shoulder panels, trim/piping, headwear, earrings, eyewear, hair silhouette, and logo placement if naturally visible.
- Keep facial labels rare. Do not call out eyes, jawline, gaze, nostrils, lips, cheekbones, facial proportions, or generic beauty/identity terms.
- Use facial labels only for explicit user-provided or visually distinctive marks such as scars, facial hair, makeup, or glasses.`;
  } else {
    prompt += `
SPLIT SHEET CALLOUT FOCUS:
- Prioritize wardrobe match and construction continuity: front garment features, side-profile garment thickness, rear/back-panel details, sleeves, gloves, pants/leg panels, boots/footwear, accessories${logoPlacement ? `, and Logo Placement at ${logoPlacement}` : ', and logo placement only if visible or explicitly provided'}.
- Use headshot callouts for visible collar/neckline, trim, headwear, hair silhouette, jewelry, or eyewear before face details.
- Keep source/generated labels clear and do not imply invented identity facts.`;
  }

  return `${prompt}\n`;
};

const REFERENCE_SHEET_UNIQUENESS_AUDIT = `
ANGLE UNIQUENESS AUDIT (MANDATORY BEFORE FINAL OUTPUT):
- Every full-body slot must belong to a different yaw bucket.
- Every headshot profile slot must belong to a different yaw bucket.
- Do not repeat FRONT, BACK, LEFT PROFILE, or RIGHT PROFILE buckets.
- FRONT signature: both eyes and chest are centered and symmetric.
- LEFT PROFILE signature: one eye visible, anatomical left side shown, nose/snout points to screen-right.
- RIGHT PROFILE signature: one eye visible, anatomical right side shown, nose/snout points to screen-left.
- BACK signature: no face or nose/snout visible, back-of-head and spine dominate.
- The left-profile and right-profile headshots must face opposite screen directions. Never draw both noses pointing the same way.
- Opposite profile slots must not share the same silhouette, crop, rim light, facial side, muzzle/nose direction, collar direction, or visible side clothing/hardware.
- If any slot duplicates another slot's yaw bucket, regenerate internally before returning.
`;

const REFERENCE_SHEET_DUPLICATE_SIMILARITY_THRESHOLD = 0.94;
const REFERENCE_SHEET_HEADSHOT_PROFILE_DUPLICATE_SIMILARITY_THRESHOLD = 0.86;
const REFERENCE_SHEET_SPLIT_HEADSHOT_PROFILE_DUPLICATE_SIMILARITY_THRESHOLD = 0.82;
const REFERENCE_SHEET_FORM_REPEATED_HEADSHOT_ROW_THRESHOLD = 0.82;

const REFERENCE_SHEET_FORM_ROW_CONTRACT = `
FORM LAYOUT ROW CONTRACT (CRITICAL):
- The form sheet has exactly two horizontal bands.
- Top band: exactly 3 full-body panels in one row.
- Bottom band: exactly 4 headshot panels in one row.
- The bottom band must never become two stacked rows, a 2x2 grid, a 2x4 grid, or a set of repeated unlabeled head tiles.
- B1, B2, B3, and B4 are the only headshot panels. Do not create extra front heads, extra profile heads, or duplicate crops above them.
`;

const REFERENCE_SHEET_DIRECTION_LABEL_CONTRACT = `
CAMERA DIRECTION AND LABEL CONTRACT (MAXIMUM PRIORITY):
- Treat panel labels as a binding technical contract, not decorative text.
- The visible artwork in each slot must match the slot label directly beneath or beside it.
- EXTREME LEFT PROFILE means an anatomical left-side profile: one eye visible, face in true 90-degree side silhouette, nose/snout pointing toward screen-right.
- EXTREME RIGHT PROFILE means an anatomical right-side profile: one eye visible, face in true 90-degree side silhouette, nose/snout pointing toward screen-left.
- B2/T2/R2 and B3/T3/R3 must be screen-opposed silhouettes. One profile must look right, the other must look left.
- Do not reuse, clone, mirror-label, or slightly crop the same profile image for both profile slots.
- If the generated head angle and the label disagree, correct the artwork before final output; do not merely change the label.
- Do not substitute a 3/4 head view when a true 90-degree profile is requested.
`;

const REFERENCE_SHEET_PROFILE_PAIR_VISUAL_LOCK = `
PROFILE PAIR VISUAL LOCK (CRITICAL):
- Before final output, compare the two profile headshot slots as silhouettes.
- They must read as opposite camera yaw directions at a glance.
- Same-direction side profiles are not acceptable even if one is scaled, cropped, relit, shifted, mirrored in label text, or placed in a different grid cell.
- Do not reuse the same side profile portrait for both profile slots.
- For animal, creature, robot, mascot, helmet, or stylized characters, use the snout/visor/faceplate/nose protrusion and collar/neck direction to prove the left/right difference.
`;

type RefSheetLayoutMode = 'form_focus' | 'face_focus' | 'split_focus';

type SlotRect = {
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

type DuplicateAngleValidation = {
  hasDuplicate: boolean;
  maxSimilarity: number;
  pair: string | null;
  scope: 'full-body' | 'headshot-profile' | 'layout';
};

type PermissionRequestDirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission?: (descriptor: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (descriptor: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
};

const REF_LAYOUT_OPTIONS: Array<{ id: RefSheetLayoutMode; label: string }> = [
  { id: 'form_focus', label: 'Form' },
  { id: 'face_focus', label: 'Face' },
  { id: 'split_focus', label: 'Split' }
];

const STUDIO_FOLDERS = [
  { id: 'realism', label: 'Realism', description: "Photorealistic Portraiture & Raw Detail", image: libRealism, styles: ['exact_studio', 'photorealism', 'dslr_capture'] },
  { id: 'anim', label: 'Stylized Cartoon', description: "Modern 3D Animation & Soft Lighting", image: libAnim, styles: ['family_3d', 'premium_animated_3d', 'claymation'] },
  { id: 'illustration', label: 'Illustration', description: "Anime, Noir & Graphic", image: libIllustration, styles: ['retro_cel', 'graphic_noir', 'retro_anime', 'comic_book'] },
  { id: 'scifi', label: 'Sci-Fi', description: "Cyberpunk & High Tech", image: libScifi, styles: ['cyberpunk_neon', 'cyberpunk'] },
  { id: 'uncategorized', label: 'Unsorted', description: "No Specific Style", image: libUnsorted, styles: [] as string[] }
];

// Aggressive normalization: "Family 3D" == "family_3d" == "family-3d"
const normalizeStyle = (s: string | undefined | null) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const isHttpUrl = (value?: string | null) => !!value && /^https?:\/\//i.test(value);

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return String(error);
};

const isRecentReferenceSheet = (prompt?: string) => prompt?.toLowerCase().includes('reference sheet') ?? false;

const stripUnsafeFilenameChars = (value: string): string => {
  const forbidden = new Set(['<', '>', ':', '"', '/', '\\', '|', '?', '*']);
  return Array.from(value).filter((ch) => !forbidden.has(ch) && ch.charCodeAt(0) >= 32).join('');
};

const dataUrlToBlob = (dataUrl: string): Blob => {
  const [meta, data] = dataUrl.split(',');
  const mimeMatch = meta.match(/data:(.*?);base64/);
  const mime = mimeMatch?.[1] || 'image/png';
  const bytes = atob(data);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
};



const resolveImageBlob = async (src: string): Promise<Blob> => {
  if (!src) throw new Error('Missing image source');

  if (src.startsWith('data:image/')) {
    return dataUrlToBlob(src);
  }

  if (src.startsWith('blob:') || isHttpUrl(src)) {
    const response = await fetch(src, { mode: 'cors' });
    if (!response.ok) {
      throw new Error(`Remote image fetch failed: ${response.status}`);
    }
    return await response.blob();
  }

  throw new Error('Unsupported image source format: ' + src);
};

const loadImageElement = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image for validation'));
    img.src = src;
  });

const getFullBodySlotRects = (layout: RefSheetLayoutMode): SlotRect[] => {
  if (layout === 'form_focus') {
    const y = 0;
    const h = 0.65;
    return [
      { label: 'T1_FRONT', x: 0, y, w: 1 / 3, h },
      { label: 'T2_LEFT_PROFILE', x: 1 / 3, y, w: 1 / 3, h },
      { label: 'T3_BACK_REAR', x: 2 / 3, y, w: 1 / 3, h }
    ];
  }

  if (layout === 'face_focus') {
    const y = 0.55;
    const h = 0.45;
    return [
      { label: 'B1_FRONT', x: 0, y, w: 1 / 3, h },
      { label: 'B2_LEFT_PROFILE', x: 1 / 3, y, w: 1 / 3, h },
      { label: 'B3_BACK_REAR', x: 2 / 3, y, w: 1 / 3, h }
    ];
  }

  const x = 0;
  const w = 0.45;
  return [
    { label: 'L1_FRONT', x, y: 0, w, h: 1 / 3 },
    { label: 'L2_LEFT_PROFILE', x, y: 1 / 3, w, h: 1 / 3 },
    { label: 'L3_BACK_REAR', x, y: 2 / 3, w, h: 1 / 3 }
  ];
};

const getHeadshotProfileSlotRects = (layout: RefSheetLayoutMode): SlotRect[] => {
  if (layout === 'form_focus') {
    return [
      { label: 'B2_EXTREME_LEFT_PROFILE_HEADSHOT', x: 0.25, y: 0.66, w: 0.25, h: 0.27 },
      { label: 'B3_EXTREME_RIGHT_PROFILE_HEADSHOT', x: 0.5, y: 0.66, w: 0.25, h: 0.27 }
    ];
  }

  if (layout === 'face_focus') {
    return [
      { label: 'T2_EXTREME_LEFT_PROFILE_HEADSHOT', x: 0.25, y: 0.02, w: 0.25, h: 0.47 },
      { label: 'T3_EXTREME_RIGHT_PROFILE_HEADSHOT', x: 0.5, y: 0.02, w: 0.25, h: 0.47 }
    ];
  }

  return [
    { label: 'R2_EXTREME_LEFT_PROFILE_HEADSHOT', x: 0.725, y: 0.02, w: 0.275, h: 0.43 },
    { label: 'R3_EXTREME_RIGHT_PROFILE_HEADSHOT', x: 0.45, y: 0.52, w: 0.275, h: 0.43 }
  ];
};

const getFormRepeatedHeadshotRowSlotPairs = (): Array<[SlotRect, SlotRect]> => {
  const rowH = 0.2;
  const topY = 0.57;
  const bottomY = 0.79;
  return [0, 1, 2, 3].map((index) => {
    const x = index * 0.25;
    return [
      { label: `FORM_HEADSHOT_EXTRA_TOP_C${index + 1}`, x, y: topY, w: 0.25, h: rowH },
      { label: `FORM_HEADSHOT_EXPECTED_BOTTOM_C${index + 1}`, x, y: bottomY, w: 0.25, h: rowH }
    ];
  });
};

const computeSlotSimilarity = (
  sourceCanvas: HTMLCanvasElement,
  a: SlotRect,
  b: SlotRect
): number => {
  const SIZE = 64;
  const ANALYSIS_SIZE = 192;
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;

  const toPixels = (r: SlotRect) => {
    const sx = Math.max(0, Math.floor(r.x * width));
    const sy = Math.max(0, Math.floor(r.y * height));
    const sw = Math.max(1, Math.floor(r.w * width));
    const sh = Math.max(1, Math.floor(r.h * height));
    return { sx, sy, sw, sh };
  };

  const drawForegroundNormalizedSlot = (slot: SlotRect, target: HTMLCanvasElement) => {
    const slotCanvas = document.createElement('canvas');
    slotCanvas.width = ANALYSIS_SIZE;
    slotCanvas.height = ANALYSIS_SIZE;
    const slotCtx = slotCanvas.getContext('2d');
    const targetCtx = target.getContext('2d');
    if (!slotCtx || !targetCtx) return;

    const p = toPixels(slot);
    slotCtx.drawImage(sourceCanvas, p.sx, p.sy, p.sw, p.sh, 0, 0, ANALYSIS_SIZE, ANALYSIS_SIZE);

    const imageData = slotCtx.getImageData(0, 0, ANALYSIS_SIZE, ANALYSIS_SIZE);
    const data = imageData.data;
    let minX = ANALYSIS_SIZE;
    let minY = ANALYSIS_SIZE;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < ANALYSIS_SIZE; y++) {
      for (let x = 0; x < ANALYSIS_SIZE; x++) {
        const idx = (y * ANALYSIS_SIZE + x) * 4;
        const alpha = data[idx + 3];
        const luma = (data[idx] * 0.2126) + (data[idx + 1] * 0.7152) + (data[idx + 2] * 0.0722);
        if (alpha > 24 && luma > 22) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }

    if (maxX <= minX || maxY <= minY) {
      targetCtx.drawImage(slotCanvas, 0, 0, ANALYSIS_SIZE, ANALYSIS_SIZE, 0, 0, SIZE, SIZE);
      return;
    }

    const pad = 10;
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(ANALYSIS_SIZE - 1, maxX + pad);
    maxY = Math.min(ANALYSIS_SIZE - 1, maxY + pad);

    targetCtx.drawImage(
      slotCanvas,
      minX,
      minY,
      Math.max(1, maxX - minX + 1),
      Math.max(1, maxY - minY + 1),
      0,
      0,
      SIZE,
      SIZE
    );
  };

  const ca = document.createElement('canvas');
  const cb = document.createElement('canvas');
  ca.width = SIZE; ca.height = SIZE;
  cb.width = SIZE; cb.height = SIZE;
  const ctxA = ca.getContext('2d');
  const ctxB = cb.getContext('2d');
  if (!ctxA || !ctxB) return 0;

  drawForegroundNormalizedSlot(a, ca);
  drawForegroundNormalizedSlot(b, cb);

  const dataA = ctxA.getImageData(0, 0, SIZE, SIZE).data;
  const dataB = ctxB.getImageData(0, 0, SIZE, SIZE).data;

  let sumSqrDiff = 0;
  for (let i = 0; i < dataA.length; i += 4) {
    const dR = dataA[i] - dataB[i];
    const dG = dataA[i + 1] - dataB[i + 1];
    const dB = dataA[i + 2] - dataB[i + 2];
    sumSqrDiff += dR * dR + dG * dG + dB * dB;
  }

  const maxDiff = (255 * 255 * 3) * (SIZE * SIZE);
  return 1 - (sumSqrDiff / maxDiff);
};

const detectDuplicateSlotAngles = async (
  sheetUrl: string,
  slots: SlotRect[],
  threshold: number,
  scope: DuplicateAngleValidation['scope']
): Promise<DuplicateAngleValidation> => {
  const sourceBlob = await resolveImageBlob(sheetUrl);
  const tempUrl = URL.createObjectURL(sourceBlob);

  try {
    const img = await loadImageElement(tempUrl);
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = img.width;
    sourceCanvas.height = img.height;
    const ctx = sourceCanvas.getContext('2d');
    if (!ctx) {
      return { hasDuplicate: false, maxSimilarity: 0, pair: null, scope };
    }

    ctx.drawImage(img, 0, 0);

    let maxSimilarity = 0;
    let maxPair: string | null = null;

    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        const similarity = computeSlotSimilarity(sourceCanvas, slots[i], slots[j]);
        if (similarity > maxSimilarity) {
          maxSimilarity = similarity;
          maxPair = `${slots[i].label} vs ${slots[j].label}`;
        }
      }
    }

    return {
      hasDuplicate: maxSimilarity >= threshold,
      maxSimilarity,
      pair: maxPair,
      scope
    };
  } finally {
    URL.revokeObjectURL(tempUrl);
  }
};

const detectDuplicateFullBodyAngles = async (
  sheetUrl: string,
  layout: RefSheetLayoutMode
): Promise<DuplicateAngleValidation> =>
  detectDuplicateSlotAngles(
    sheetUrl,
    getFullBodySlotRects(layout),
    REFERENCE_SHEET_DUPLICATE_SIMILARITY_THRESHOLD,
    'full-body'
  );

const detectDuplicateHeadshotProfileAngles = async (
  sheetUrl: string,
  layout: RefSheetLayoutMode
): Promise<DuplicateAngleValidation> =>
  detectDuplicateSlotAngles(
    sheetUrl,
    getHeadshotProfileSlotRects(layout),
    layout === 'split_focus'
      ? REFERENCE_SHEET_SPLIT_HEADSHOT_PROFILE_DUPLICATE_SIMILARITY_THRESHOLD
      : REFERENCE_SHEET_HEADSHOT_PROFILE_DUPLICATE_SIMILARITY_THRESHOLD,
    'headshot-profile'
  );

const detectFormRepeatedHeadshotRows = async (
  sheetUrl: string
): Promise<DuplicateAngleValidation> => {
  const sourceBlob = await resolveImageBlob(sheetUrl);
  const tempUrl = URL.createObjectURL(sourceBlob);

  try {
    const img = await loadImageElement(tempUrl);
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = img.width;
    sourceCanvas.height = img.height;
    const ctx = sourceCanvas.getContext('2d');
    if (!ctx) {
      return { hasDuplicate: false, maxSimilarity: 0, pair: null, scope: 'layout' };
    }

    ctx.drawImage(img, 0, 0);

    let maxSimilarity = 0;
    let maxPair: string | null = null;
    let repeatedColumns = 0;

    for (const [topSlot, bottomSlot] of getFormRepeatedHeadshotRowSlotPairs()) {
      const similarity = computeSlotSimilarity(sourceCanvas, topSlot, bottomSlot);
      if (similarity >= REFERENCE_SHEET_FORM_REPEATED_HEADSHOT_ROW_THRESHOLD) {
        repeatedColumns += 1;
      }
      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
        maxPair = `${topSlot.label} vs ${bottomSlot.label}`;
      }
    }

    return {
      hasDuplicate: repeatedColumns >= 2,
      maxSimilarity,
      pair: maxPair,
      scope: 'layout'
    };
  } finally {
    URL.revokeObjectURL(tempUrl);
  }
};

const detectDuplicateReferenceSheetAngles = async (
  sheetUrl: string,
  layout: RefSheetLayoutMode
): Promise<DuplicateAngleValidation> => {
  const checks = await Promise.all([
    detectDuplicateFullBodyAngles(sheetUrl, layout),
    detectDuplicateHeadshotProfileAngles(sheetUrl, layout),
    ...(layout === 'form_focus' ? [detectFormRepeatedHeadshotRows(sheetUrl)] : [])
  ]);

  return checks.reduce((strongest, current) => {
    if (current.hasDuplicate && !strongest.hasDuplicate) return current;
    if (current.hasDuplicate === strongest.hasDuplicate && current.maxSimilarity > strongest.maxSimilarity) return current;
    return strongest;
  });
};

async function materializeDisplayUrl(url: string | null | undefined): Promise<string> {
  if (!url) return '';
  if (url.startsWith('blob:') || url.startsWith('data:')) return url;

  if (/^https?:\/\//i.test(url)) {
    try {
        const res = await fetch(url, { mode: 'cors' });
        if (!res.ok) throw new Error(`Failed to fetch remote display asset: ${res.status}`);
        const fetchedBlob = await res.blob();
        
        // True Base64 Pivot instead of transient blob
        return await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(fetchedBlob);
        });
    } catch (e) {
        console.warn(`Failed to materialize remote display asset to base64:`, e);
        return url;
    }
  }

  return url;
}

const LibraryActorSkeleton = () => (
  <div className="relative aspect-square rounded-xl overflow-hidden bg-black/40 border border-[#27272a]">
    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer" />
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10" />
    </div>
    <div className="absolute bottom-0 inset-x-0 h-8 bg-black/50 border-t border-white/5" />
  </div>
);

const LibraryStudioSkeleton = () => (
  <div className="relative h-48 w-full rounded-3xl overflow-hidden border border-white/10 bg-black/30">
    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer" />
    <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-black/15 to-transparent" />
    <div className="absolute left-6 bottom-6 right-6 space-y-3">
      <div className="h-6 w-40 rounded bg-white/10" />
      <div className="flex items-center gap-3">
        <div className="h-3 w-44 rounded bg-white/10" />
        <div className="h-5 w-16 rounded bg-white/10" />
      </div>
    </div>
  </div>
);

const CastingForge = () => {
  const { state, dispatch } = useAppContext();
  
  const [libraryViewLoading, setLibraryViewLoading] = useState(false);
  const withLibraryTransition = (next: () => void, delay = 180) => {
    setLibraryViewLoading(true);
    window.setTimeout(() => {
      next();
      window.setTimeout(() => {
        setLibraryViewLoading(false);
      }, delay);
    }, 40);
  };

  // Pre-compute styles locally to ensure consistency
  const knownStyles = React.useMemo(() => {
    return new Set(
      STUDIO_FOLDERS
        .filter(f => f.id !== 'uncategorized')
        .flatMap(f => f.styles)
        .map(s => normalizeStyle(s))
    );
  }, []);

  const mainUploadRef = useRef<HTMLInputElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  // ... (existing state) ...


  const [notification, setNotification] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  }, []);

  // Crop & Edit State
  const [isCropping, setIsCropping] = useState(false);
  const [cropStart, setCropStart] = useState<{ x: number, y: number } | null>(null);
  const [cropRect, setCropRect] = useState<{ x: number, y: number, w: number, h: number } | null>(null);
  const [removeBg, setRemoveBg] = useState(false);


  // Draggable Panel State (Removed - Docked Controls)

  // Auto-reset UI when image is cleared
  useEffect(() => {
    if (!state.lastCastedImage) {
      setRemoveBg(false);
    }
  }, [state.lastCastedImage]);

  const [, setProcessedPreviewUrl] = useState<string | null>(null);
  const [activeHandle, setActiveHandle] = useState<string | null>(null);

  const [showRefSheet, setShowRefSheet] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [refLayout, setRefLayout] = useState<RefSheetLayoutMode>('form_focus');
  const [includeCalloutLabels, setIncludeCalloutLabels] = useState(false);
  const [fringeSize] = useState(0);
  const [isIsolating, setIsIsolating] = useState(false);
  const [isolationProgress] = useState(0);
  const [brandingLogo, setBrandingLogo] = useState<string | null>(null);
  const [logoPosition, setLogoPosition] = useState<string>('');

  // MASK RESTORATION STATE
  const [isBrushActive, setIsBrushActive] = useState(false);
  const [brushSize] = useState(20);
  const [restorationLayer, setRestorationLayer] = useState<string | null>(null); // Data URL of painted mask
  const [erodedUrl, setErodedUrl] = useState<string | null>(null); // Intermediate eroded state
  const [cursorPos, setCursorPos] = useState<{ x: number, y: number } | null>(null);


  // HISTORY STATE
  const [, setHistory] = useState<(string | null)[]>([null]);
  const historyRef = useRef<(string | null)[]>([null]); // Source of Truth for logic
  const [, setHistoryIndex] = useState(0);
  const historyIndexRef = useRef(0); // Synchronous track for rapid undo/redo

  // CACHE REFS (Optimization)
  const cachedBaseImgRef = useRef<HTMLImageElement | null>(null);
  const cachedOriginalImgRef = useRef<HTMLImageElement | null>(null);

    // EFFECT 1: Handle Erosion (Slow)
  useEffect(() => {
    if (!removeBg || !state.lastCastedMask) {
      setErodedUrl(null);
      setIsIsolating(false); // SAFETY RESET
      return;
    }

    if (fringeSize === 0) {
      setErodedUrl(state.lastCastedMask);
      setIsIsolating(false); // SAFETY RESET
      return;
    }

    setIsIsolating(true);
    let active = true;
    const t = setTimeout(() => {
      generateErodedMask(state.lastCastedMask!, fringeSize).then(url => {
        if (active) {
          setErodedUrl(url);
          setIsIsolating(false);
        }
      });
    }, 100);

    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [state.lastCastedMask, fringeSize, removeBg]);

  // EFFECT 1.5: Preload/Cache Static Images
  useEffect(() => {
    cachedBaseImgRef.current = null;
    const base = erodedUrl || state.lastCastedMask;
    if (base && typeof base === 'string') {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = base;
      img.onload = () => { cachedBaseImgRef.current = img; };
    }
  }, [erodedUrl, state.lastCastedMask]);

  useEffect(() => {
    cachedOriginalImgRef.current = null;
    if (state.lastCastedImage) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = state.lastCastedImage;
      img.onload = () => { cachedOriginalImgRef.current = img; };
    }
  }, [state.lastCastedImage]);

  // EFFECT 2: Handle Composition (Fast)
  useEffect(() => {
    if (!removeBg) {
      setProcessedPreviewUrl(null);
      return;
    }

    if (!erodedUrl && !state.lastCastedMask) {
      setProcessedPreviewUrl(null);
      return;
    }

    const base = erodedUrl || state.lastCastedMask;
    if (!base) return;

    let active = true;
    if (restorationLayer && state.lastCastedImage) {
      // USE CACHED IMAGES IF AVAILABLE
      const baseInput = cachedBaseImgRef.current || base;
      const originalInput = cachedOriginalImgRef.current || state.lastCastedImage;

      compositeRestoration(baseInput, originalInput, restorationLayer).then(url => {
        if (active) {
          setProcessedPreviewUrl(url);
        }
      });
    } else {
      setProcessedPreviewUrl(base);
    }
    return () => { active = false; };
  }, [erodedUrl, restorationLayer, removeBg, state.lastCastedImage, state.lastCastedMask]);


  // EFFECT: Reset Restoration on New Image
  useEffect(() => {
    // When the main image changes, we MUST clear all manual edits
    setRestorationLayer(null);
    setRemoveBg(false); // Reset bg toggle
    setIsBrushActive(false); // Reset brush tool

    // Clear History
    const initialHistory = [null];
    setHistory(initialHistory);
    historyRef.current = initialHistory;
    setHistoryIndex(0);
    historyIndexRef.current = 0;

    // Clear Canvas
    if (restorationCanvasRef.current) {
      const ctx = restorationCanvasRef.current.getContext('2d');
      ctx?.clearRect(0, 0, restorationCanvasRef.current.width, restorationCanvasRef.current.height);
    }

    // Reset Cursor
    setCursorPos(null);
  }, [state.lastCastedImage]);

  // EFFECT: Composite Layers (Main + Mask + Restoration) -> Preview
  // Crucial for Undo/Redo visual feedback AND Isolation
  useEffect(() => {
    if (!state.lastCastedImage) {
      setProcessedPreviewUrl(null);
      return;
    }

    // Determine if we are effectively removing BG (Must have checkbox AND mask)
    const effectiveRemoveBg = removeBg && !!state.lastCastedMask;

    // If no layers to composite AND not removing BG, show raw
    if (!restorationLayer && !effectiveRemoveBg) {
      setProcessedPreviewUrl(null);
      return;
    }

    const composite = async () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const mainImg = new Image();
      mainImg.crossOrigin = "anonymous";
      await new Promise(r => {
        mainImg.onload = r;
        mainImg.onerror = r; // Prevent hang
        mainImg.src = state.lastCastedImage!;
      });

      if (mainImg.naturalWidth === 0) {
        console.error("Composite: Main Image failed to load or has 0 width");
        setProcessedPreviewUrl(null);
        return;
      }

      canvas.width = mainImg.naturalWidth;
      canvas.height = mainImg.naturalHeight;

      // 1. Draw Main (Base)
      if (!effectiveRemoveBg) {
        ctx.drawImage(mainImg, 0, 0);
      }

      // 2. Draw Mask (Cutout) if available & active
      if (state.lastCastedMask && effectiveRemoveBg) {
        const maskImg = new Image();
        maskImg.crossOrigin = "anonymous";
        await new Promise(r => {
          maskImg.onload = r;
          maskImg.onerror = r;
          maskImg.src = state.lastCastedMask!;
        });
        // Check if loaded
        if (maskImg.naturalWidth > 0) {
          ctx.drawImage(maskImg, 0, 0);
        } else {
          console.warn("Composite: Mask Failed to Load");
        }
      }

      // 3. Draw Restoration (The Magic Part)
      // We want to "Paint Back" the original image where the user stroked.
      if (restorationLayer && effectiveRemoveBg) {
        // Create a mask from the restoration layer (White Strokes)
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = canvas.width;
        maskCanvas.height = canvas.height;
        const maskCtx = maskCanvas.getContext('2d');

        if (maskCtx) {
          const restImg = new Image();
          await new Promise(r => {
            restImg.onload = r;
            restImg.onerror = r;
            restImg.src = restorationLayer!;
          });

          // Draw Strokes
          if (restImg.naturalWidth > 0) {
            maskCtx.drawImage(restImg, 0, 0);
          } else {
            console.warn("Composite: Restoration Layer Failed to Load");
          }

          // COMPOSITE: 'source-in' -> Keep strict intersection of Stroke + Main Image
          maskCtx.globalCompositeOperation = 'source-in';
          maskCtx.drawImage(mainImg, 0, 0);

          // Now maskCanvas contains "Floating Patches" of the original image

          // Draw these patches onto the main canvas
          ctx.drawImage(maskCanvas, 0, 0);
        }
      }
      // If restoration exists but BG is NOT removed, the restoration is effectively invisible
      // (painting opaque pixels on opaque pixels), so we skip it to save cycles/artifacts.

      // 3. Update Preview
      setProcessedPreviewUrl(canvas.toDataURL());
    };

    composite();
  }, [state.lastCastedImage, restorationLayer, state.lastCastedMask, removeBg]);

  const handleAddToCast = async () => {
    const source = pendingRefSheet || state.lastCastedImage;
    if (!source) return;

    try {
      const blob = await resolveImageBlob(source);
      const localPreviewUrl = URL.createObjectURL(blob);

      const newCast: CastMember = {
        id: `cast-${Date.now()}`,
        url: localPreviewUrl,
        previewUrl: localPreviewUrl,
        sourceUrl: source,
        tag: 'front',
        name: `Cast ${state.cast.length + 1}`,
        profile: {
          identity: state.lastCastedPrompt || "Unknown Identity",
          wardrobe: "",
          accessories: "",
          style: "External Asset"
        }
      };
      dispatch({ type: 'ADD_CAST', payload: newCast });
      dispatch({ type: 'ADD_LOG', payload: { message: "Added to Cast Assets", type: 'success' } });
    } catch (err: unknown) {
      console.error("Add to Cast Failed:", err);
      dispatch({ type: 'ADD_LOG', payload: { message: `Add to Cast Failed: ${getErrorMessage(err)}`, type: 'error' } });
    }
  };

  const [pendingRefSheet, setPendingRefSheet] = useState<string | null>(null);

  const handleSaveToActorLibrary = async (targetFolderOverride?: string, nameOverride?: string) => {
    const isRefSheet = !!pendingRefSheet;
    const finalUrl = pendingRefSheet || state.lastCastedImage;
    if (!finalUrl) return;

    const targetFolderId = targetFolderOverride || activeFolder || 'uncategorized';
    const targetFolder = STUDIO_FOLDERS.find(f => f.id === targetFolderId);
    const assignedStyle = targetFolder ? (targetFolder.styles[0] || 'External Asset') : 'External Asset';

    const timestamp = Date.now();
    const newActorId = isRefSheet ? `ref-${timestamp}` : `actor-${timestamp}`;
    const filename = isRefSheet ? `RefSheet_${timestamp}.png` : `Actor_${timestamp}.png`;
    const name = nameOverride || (isRefSheet ? `Ref Sheet ${new Date().toLocaleTimeString()}` : `Actor ${state.actorLibrary.length + 1}`);
    const identity = isRefSheet ? 'Reference Sheet' : (state.lastCastedPrompt || 'Unknown Identity');
    const targetCategoryLabel = targetFolderId === 'uncategorized' ? '' : (targetFolder?.label || '');

    try {
      const blob = await resolveImageBlob(finalUrl);
      const file = new File([blob], filename, { type: blob.type || 'image/png' });

      const finalFilename = targetCategoryLabel ? `${targetCategoryLabel}/${filename}` : filename;

      let absoluteLocalPath = '';
      let displayUrl = '';
      let previewUrlForState: string | undefined = undefined;

      if (isNativeParams() && state.saveDirectoryPath && window.electronAPI?.readFile) {
        const actorsDir = await nativeJoinPath(state.saveDirectoryPath, 'Actors');
        const targetDir = targetCategoryLabel ? await nativeJoinPath(actorsDir, targetCategoryLabel) : actorsDir;
        const fullPath = await nativeJoinPath(targetDir, filename);

        absoluteLocalPath = fullPath;
        await nativeWriteFile(fullPath, file);

        const base64 = await window.electronAPI.readFile(fullPath);
        if (base64) {
          displayUrl = `data:image/png;base64,${base64}`;
        }
      } else if (state.saveDirectoryHandle) {
        const webPath = targetCategoryLabel ? `Actors/${targetCategoryLabel}/${filename}` : `Actors/${filename}`;
        await saveAssetToDisk(state.saveDirectoryHandle, webPath, file);
        absoluteLocalPath = webPath;

        const stablePreviewUrl = URL.createObjectURL(blob);
        displayUrl = stablePreviewUrl;
        previewUrlForState = stablePreviewUrl;
      } else {
        const stablePreviewUrl = URL.createObjectURL(blob);
        displayUrl = stablePreviewUrl;
        previewUrlForState = stablePreviewUrl;
      }

      const newActor: CastMember = {
        id: newActorId,
        url: displayUrl,
        localPath: absoluteLocalPath || undefined,
        previewUrl: previewUrlForState,
        sourceUrl: finalUrl,
        tag: 'front',
        name,
        filename: finalFilename,
        profile: {
          identity,
          wardrobe: '',
          accessories: '',
          style: assignedStyle
        }
      };

      dispatch({ type: 'ADD_ACTOR_LIBRARY', payload: newActor });
      dispatch({ type: 'ADD_LOG', payload: { message: `Saved to Library (${targetFolderId})`, type: 'success' } });
      setShowSaveModal(false);
      setPendingRefSheet(null);
    } catch (e: unknown) {
      console.error('Save Actor Failed', e);
      dispatch({ type: 'ADD_LOG', payload: { message: `Save Failed: ${getErrorMessage(e)}`, type: 'error' } });
    }
  };

  // ... (Update Ref Sheet Modal Button below) ...


  const [selectedStyleId, setSelectedStyleId] = useState<string | null>(null);
  const selectedStyleMeta = React.useMemo(() => {
    const styleMap: Record<string, { helper: string }> = {
      realism: { helper: 'Best for lifelike actors, cinematic portraits, and grounded characters.' },
      anim: { helper: 'Best for family-friendly animation, charm, and soft stylized personality.' },
      illustration: { helper: 'Best for anime, graphic novel, and expressive illustrated characters.' },
      scifi: { helper: 'Best for futuristic heroes, cyberpunk agents, and high-tech worlds.' }
    };

    return selectedStyleId ? styleMap[selectedStyleId] : null;
  }, [selectedStyleId]);

  const handleGenerate = async () => {
    const billingMode = state.billingEntitlements.effectiveBillingMode;
    if (!(await ensureAuthenticatedForGeneration({ billingMode, featureLabel: 'Casting Forge generation' }))) {
      return;
    }

    // CHANGE: "Character design sheet" triggers text layouts. Use "Full body character portrait" instead.
    let effectivePrompt = state.lastCastedPrompt || "A full body character portrait";
    let styleDirectives = "";
    let negativePrompt = "";
    let selectedStyleLabel = "";
    let styleCategoryContract = "";
    let styleCategoryNegativePrompt = "";

    // INJECT SELECTED STYLE into the prompt if defined
    if (selectedStyleId) {
      const folder = STUDIO_FOLDERS.find(f => f.id === selectedStyleId);
      if (folder) {
        selectedStyleLabel = folder.label;
        styleCategoryContract = buildStyleCategoryContract(selectedStyleId, {
          selectedStyleLabel,
          sourceImagePolicy: "Source/reference images control character identity only; source-photo realism must not override the selected Casting Forge render category.",
          boardPresentationPolicy: "Casting Forge preview presentation controls only isolation, background, and asset framing.",
          lightingPolicy: "Lighting must be interpreted within the selected Casting Forge character style.",
          appliesTo: "Casting Forge portrait, generated full character, restyled subject reference, saved actor preview, and recent thumbnail"
        });
        styleCategoryNegativePrompt = buildStyleNegativePrompt(selectedStyleId);

        // e.g. "Realism studio style, Exact Likeness & Premium CG..."
        const baseStyle = `${folder.label} studio style, ${folder.description}`;

        // STRICT REALISM ENFORCEMENT
        if (selectedStyleId === 'realism') {
          // FORCE PHOTOGRAPHY SEMANTICS
          // PREPEND keywords to prime the model for photography immediately
          effectivePrompt = effectivePrompt.replace("character", "real person");
          effectivePrompt = `Raw unedited candid photo, shot on DSLR. ${effectivePrompt}.`;

          // ROBUST PHOTOGRAPHY PROMPT (Safe but detailed)
          styleDirectives = "Shot on Sony A7R IV, 50mm lens. Harsh realistic lighting, flash photography, visible pores, dermatological details, authentic skin texture, imperfect, grainy, sharp focus. Backlight separation, perfect white balance on subject, no color contamination. DO NOT crop off the top of the head.";

          effectivePrompt += " Standing in front of a solid black studio background (#000000), evenly lit, with no background shadows.";

          // STRICT ANTI-CG CONSTRAINTS
          negativePrompt = "Do not use: digital art, illustration, painting, drawing, cartoon, anime, 3d render, cgi, unreal engine, smooth skin, airbrushed, beauty filter, perfect lighting, symmetry, plastic, doll-like, artistic adaptation, stylized.";
        } else {
          // For other styles, keep the prefix
          effectivePrompt = `${baseStyle}, ${effectivePrompt}`;
        }
      }
    }

    dispatch({ type: 'SET_PROCESSING', payload: true });

    // --- TIMEOUT & ETA LOGIC ---
    const getEtaMs = () => state.imageResolution === '4K' ? 35000 : (state.imageResolution === '2K' ? 25000 : 15000);
    const etaMs = getEtaMs();

    // --- PROGRESS SIMULATION TIMER ---
    let currentPercent = 5;
    dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: { percent: currentPercent, text: "Synthesizing Asset" } });

    const updateMs = 1000;
    const increment = (updateMs / etaMs) * 100;

    // Using window.setInterval to avoid NodeJS Timeout typing issues in React/Vite
    const progressInterval = window.setInterval(() => {
      currentPercent += increment;
      if (currentPercent > 95) currentPercent = 95; // Cap at 95% until complete

      let text = "Synthesizing Asset";
      if (currentPercent > 40) text = "Processing Style Protocol...";
      if (currentPercent > 70) text = "Applying Character Stylization...";
      if (currentPercent >= 95) text = "Finalizing Stylization... (Still working, please wait)";

      dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: { percent: currentPercent, text } });
    }, updateMs);

    dispatch({ type: 'SET_LAST_CASTED_MASK', payload: null });
    setProcessedPreviewUrl(null);

    const currentGenId = Date.now();
    generationIdRef.current = currentGenId;

    try {
      type HostedGenerationResult = string | { asset_url?: string | null };
      let res: HostedGenerationResult;

      let actualGenId = '';
      const onJobAccepted = (id: string) => {
        actualGenId = id;
        dispatch({ type: 'ADD_BACKGROUND_JOB', payload: { id, status: 'polling_foreground', context: 'casting', startedAt: Date.now() } });
      };

      if (state.lastCastedImage) {
        dispatch({ type: 'ADD_LOG', payload: { message: "Applying stylization to character...", type: 'info' } });

        // --- CACHE REFERENCE IMAGE BEFORE RESTYLIZING ---
        const recentStore = useRecentGenerationsStore.getState();
        const isAlreadyCached = recentStore.getRecentGenerationsForStudio('general').some(g => g.displayUrl === state.lastCastedImage || g.cloudUrl === state.lastCastedImage);
        
        if (!isAlreadyCached && recentStore.cacheDirPath) {
            const cacheRefImage = async () => {
                try {
                    let dataUrlToCache = state.lastCastedImage!;
                    // If the reference image is a blob or remote URL, convert it to base64 first
                    if (!state.lastCastedImage!.startsWith('data:')) {
                        const res = await fetch(state.lastCastedImage!);
                        const blob = await res.blob();
                        dataUrlToCache = await new Promise<string>((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onloadend = () => resolve(reader.result as string);
                            reader.onerror = reject;
                            reader.readAsDataURL(blob);
                        });
                    }

                    const cacheResult = await RecentGenerationsCacheService.cacheGeneration({
                        imageDataUrl: dataUrlToCache!,
                        studio: 'general',
                        cacheDirPath: recentStore.cacheDirPath!,
                    });
                    
                    if (cacheResult.success && cacheResult.localCachePath && cacheResult.displayUrl) {
                        recentStore.addRecentGeneration({
                            studio: 'general',
                            localCachePath: cacheResult.localCachePath,
                            displayUrl: cacheResult.displayUrl,
                            createdAt: Date.now() - 1000,
                            prompt: "Reference Image",
                            mode: 'byok',
                        });
                    }
                } catch (e) {
                    console.warn("Failed to cache reference image:", e);
                }
            };
            cacheRefImage();
        }

        const stylizePrompt = `Create a single character portrait.

SUBJECT LOCK
- [IMAGE 1] is the subject reference.
- Preserve the same identity, facial structure, age range, body type, and overall likeness from [IMAGE 1].
- Preserve the same pose/framing unless the prompt explicitly requests otherwise.

STYLE AUTHORITY
- Apply this character description exactly: ${effectivePrompt}
- Apply this style direction exactly: ${styleDirectives}
- Source image controls identity. Character Render Style controls visual category. Lighting adapts to the selected render style.
- The selected character render style is mandatory and must not be diluted by cinematic lighting or source-photo realism.
${styleCategoryContract}
- Keep the output as one clean isolated character on a solid black studio background (#000000), evenly lit, with no background shadows.

COMPOSITION
- Single subject only.
- Full visible character based on the requested framing.
- No HUD, no labels, no overlays, no floating props.

NEGATIVE CONSTRAINTS:
text, labels, HUD, overlays, duplicate subjects, identity drift, extra limbs, fused fingers, wrong background, stylization drift${styleCategoryNegativePrompt ? `, ${styleCategoryNegativePrompt}` : ''}${negativePrompt ? `, ${negativePrompt}` : ''}.`;
        res = await GeminiService.generateImage(
          stylizePrompt,
          state.apiKey,
          state.model,
          [{ url: state.lastCastedImage, label: 'Subject Reference' }],
          {
            imageSize: state.imageResolution,
            thinkingLevel: state.enableImageThinking,
            googleGrounding: false,
            strictMode: true,
            billingMode: state.billingEntitlements.effectiveBillingMode as 'hosted' | 'byok',
            entitlements: state.billingEntitlements,
            onJobAccepted,
            styleCategory: selectedStyleId ? {
              styleId: selectedStyleId,
              intent: {
                selectedStyleLabel: selectedStyleLabel || selectedStyleId,
                appliesTo: "Casting Forge restyled subject and saved character preview"
              }
            } : undefined
          }
        ) as HostedGenerationResult;
      } else {
        const createPrompt = `Create a single character portrait.

SUBJECT DEFINITION
- Generate this character exactly: ${effectivePrompt}
- Apply this style direction exactly: ${styleDirectives}
- Source image controls identity if present. Character Render Style controls visual category. Lighting adapts to the selected render style.
- The selected character render style is mandatory and must not be diluted by cinematic lighting or realism drift.
${styleCategoryContract}

COMPOSITION
- One subject only.
- Solid black studio background (#000000), evenly lit, with no background shadows.
- No text, no labels, no HUD, no overlays.

NEGATIVE CONSTRAINTS:
text, labels, HUD, overlays, duplicate subjects, extra limbs, fused fingers, wrong background, stylization drift${styleCategoryNegativePrompt ? `, ${styleCategoryNegativePrompt}` : ''}${negativePrompt ? `, ${negativePrompt}` : ''}.`;
        res = await GeminiService.generateImage(
          createPrompt,
          state.apiKey,
          state.model,
          [],
          {
            imageSize: state.imageResolution,
            thinkingLevel: state.enableImageThinking,
            googleGrounding: false,
            strictMode: true,
            billingMode: state.billingEntitlements.effectiveBillingMode as 'hosted' | 'byok',
            entitlements: state.billingEntitlements,
            onJobAccepted,
            styleCategory: selectedStyleId ? {
              styleId: selectedStyleId,
              intent: {
                selectedStyleLabel: selectedStyleLabel || selectedStyleId,
                appliesTo: "Casting Forge generated character and saved preview"
              }
            } : undefined
          }
        ) as HostedGenerationResult;
      }

      if (actualGenId) {
        dispatch({ type: 'REMOVE_BACKGROUND_JOB', payload: actualGenId });
      }

      const rawResolvedUrl =
        typeof res === 'string'
          ? res
          : (res && typeof res === 'object' ? res.asset_url || '' : '');

      let safeResolvedUrl = rawResolvedUrl;
      try {
        safeResolvedUrl = await materializeDisplayUrl(rawResolvedUrl);
      } catch (e) {
        console.warn(e);
      }

      if (generationIdRef.current === currentGenId) {
        if (state.lastCastedImage && state.lastCastedImage.startsWith('blob:')) {
          URL.revokeObjectURL(state.lastCastedImage);
        }
        dispatch({ type: 'SET_LAST_CASTED_IMAGE', payload: safeResolvedUrl });
        setProcessedPreviewUrl(null);
      } else {
        return;
      }

      const logMessage = state.lastCastedImage ? "Character stylized" : "Character generated";
      dispatch({ type: 'ADD_LOG', payload: { message: logMessage, type: 'success' } });

      // --- RECENT GENERATIONS: Cache result silently ---
      const recentStore = useRecentGenerationsStore.getState();
      if (recentStore.cacheDirPath && safeResolvedUrl) {
          RecentGenerationsCacheService.cacheGeneration({
              imageDataUrl: safeResolvedUrl,
              studio: 'general', // or 'portrait' if it maps better, but 'general'/'casting' works
              cacheDirPath: recentStore.cacheDirPath,
          }).then((cacheResult) => {
              if (cacheResult.success && cacheResult.localCachePath && cacheResult.displayUrl) {
                  recentStore.addRecentGeneration({
                      studio: 'general',
                      localCachePath: cacheResult.localCachePath,
                      displayUrl: cacheResult.displayUrl,
                      createdAt: Date.now(),
                      prompt: effectivePrompt,
                      mode: (state.billingEntitlements.effectiveBillingMode as 'hosted' | 'byok') || 'byok',
                  });
              }
          }).catch((e) => {
              console.warn('[CastingForge] Recent generation caching failed:', e);
          });
      }

      dispatch({ type: 'SET_LAST_CASTED_PROMPT', payload: '' }); // Clear input as requested
    } catch (e: unknown) {
      const err = e as { name?: string; message?: string; generationId?: string };
      const isTimeout = err.name === 'TimeoutError' || err.message?.includes('Pending');
      if (isTimeout && err.generationId) {
        dispatch({ type: 'UPDATE_BACKGROUND_JOB', payload: { id: err.generationId, updates: { status: 'pending_background' } } });
        dispatch({ type: 'ADD_LOG', payload: { message: "Job shifted to background due to long queue.", type: 'info' } });
      } else {
        dispatch({ type: 'ADD_LOG', payload: { message: getErrorMessage(e), type: 'error' } });
      }
    } finally {
      clearInterval(progressInterval);
      dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: null });
      dispatch({ type: 'SET_PROCESSING', payload: false });
    }
  };


  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // RESTORATION REFS
  const restorationCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const uiCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isPaintingRef = useRef(false);
  const lastPaintPos = useRef<{ x: number, y: number } | null>(null);
  const lastScreenPos = useRef<{ x: number, y: number } | null>(null);
  const isSyncingRef = useRef(false); // Track async canvas sync state

  const generationIdRef = useRef<number>(0);

  // DELETE CONFIRMATION STATE
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'cast' | 'library' | 'cast_all', payload: string, name: string } | null>(null);

  const handleClearForgeCanvas = () => {
    generationIdRef.current += 1;

    dispatch({ type: 'SET_LAST_CASTED_IMAGE', payload: null });
    dispatch({ type: 'SET_LAST_CASTED_MASK', payload: null });
    dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: null });

    setPendingRefSheet(null);
    setRefSheetUrl(null);
    setShowRefSheet(false);
    setProcessedPreviewUrl(null);
    setIsCropping(false);
    setCropStart(null);
    setCropRect(null);
    setRemoveBg(false);
    setRestorationLayer(null);
    setErodedUrl(null);
    setIsBrushActive(false);
    setCursorPos(null);

    if (restorationCanvasRef.current) {
      const ctx = restorationCanvasRef.current.getContext('2d');
      ctx?.clearRect(0, 0, restorationCanvasRef.current.width, restorationCanvasRef.current.height);
    }
    if (uiCanvasRef.current) {
      const ctx = uiCanvasRef.current.getContext('2d');
      ctx?.clearRect(0, 0, uiCanvasRef.current.width, uiCanvasRef.current.height);
    }

    dispatch({ type: 'ADD_LOG', payload: { message: 'Forge canvas cleared.', type: 'info' } });
  };

  const executeDelete = () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === 'cast') {
      dispatch({ type: 'REMOVE_CAST', payload: deleteTarget.payload });
      dispatch({ type: 'ADD_LOG', payload: { message: "Actor removed from Cast List", type: 'info' } });
    } else if (deleteTarget.type === 'cast_all') {
      dispatch({ type: 'CLEAR_CAST' });
      dispatch({ type: 'ADD_LOG', payload: { message: `Removed all ${state.cast.length} actors from Cast List`, type: 'info' } });
    } else {
      // Library Deletion with Disk Persistence
      const actorId = deleteTarget.payload;
      const actor = state.actorLibrary.find(a => a.id === actorId);

      const performDelete = async () => {      // 1. If it's a file-based actor, delete from disk FIRST
        if (actor && actor.filename) {
          try {
            let deleted = false;
            let diag = "";
            if (state.saveDirectoryPath && window.electronAPI?.deleteFile && window.electronAPI?.joinPath) {
              const filePath = await window.electronAPI.joinPath(state.saveDirectoryPath, 'Actors', actor.filename);
              deleted = await window.electronAPI.deleteFile(filePath);
              diag += `IPC[${deleted}] (${filePath}). `;

              // SMART FALLBACK: If direct delete failed, maybe the file moved or category changed?
              if (!deleted && window.electronAPI?.exists) {
                diag += `FallbackSearch... `;
                const possibleCats = ['', 'Realism', 'Stylized Cartoon', 'Illustration', 'Sci-Fi', 'Uncategorized', 'Extras'];
                const basename = actor.filename?.split(/[\\/]/).pop();

                if (basename) {
                  for (const cat of possibleCats) {
                    const testPath = await window.electronAPI.joinPath(state.saveDirectoryPath, 'Actors', cat, basename);
                    if (await window.electronAPI.exists(testPath)) {
                      deleted = await window.electronAPI.deleteFile(testPath);
                      if (deleted) {
                        diag += `FoundIn[${cat || 'Root'}]. `;
                        break;
                      }
                    }
                  }
                }
              }
            } else {
              diag += `IPC[Missing/NoPath]. `;
            }

            if (!deleted && state.saveDirectoryHandle) {
              const hasPermission = await verifyPermission(state.saveDirectoryHandle, true);
              if (!hasPermission) {
                showToast("Permission Denied: Cannot delete file from disk.");
                return; // Abort delete
              }
              let curDir = await state.saveDirectoryHandle.getDirectoryHandle('Actors');
              const pathParts = actor.filename.split(/[\\/]/);
              for (let i = 0; i < pathParts.length - 1; i++) {
                curDir = await curDir.getDirectoryHandle(pathParts[i]);
              }
              await curDir.removeEntry(pathParts[pathParts.length - 1]);
              deleted = true;
              diag += `Web[Succeed]. `;
            }

            if (!deleted) throw new Error("File deletion failed or permission denied on disk. Trace: " + diag);

            dispatch({ type: 'ADD_LOG', payload: { message: `File deleted from disk ${diag}`, type: 'success' } });

            // Only remove from memory if disk delete succeeded
            dispatch({ type: 'REMOVE_ACTOR_LIBRARY', payload: actorId });
            dispatch({ type: 'ADD_LOG', payload: { message: "Actor permanently removed", type: 'info' } });

          } catch (e: unknown) {
            console.error("Disk delete failed", e);
            showToast(`Delete Error: ${getErrorMessage(e)}`);
            dispatch({ type: 'ADD_LOG', payload: { message: `Disk delete failed: ${getErrorMessage(e)}`, type: 'error' } });
            // Do NOT remove from memory if disk delete failed, prevents "zombie" confusion
          }
        } else {
          // Memory-only actor or no handle? Just remove from memory.
          dispatch({ type: 'REMOVE_ACTOR_LIBRARY', payload: actorId });
          dispatch({ type: 'ADD_LOG', payload: { message: "Actor removed (Memory Only)", type: 'info' } });
        }
      };

      performDelete();
    }
    setDeleteTarget(null);
  };

  // DISK PERSISTENCE: Rename or Move Actor
  const handleActorDiskOperation = async (actorId: string, options: { newName?: string, newFolderId?: string }) => {
    const actor = state.actorLibrary.find(a => a.id === actorId);
    if (!actor || !actor.filename) return;

    const isRename = options.newName !== undefined;
    const isMove = options.newFolderId !== undefined;
    if (!isRename && !isMove) return;

    // 1. SANITIZATION
    const rawName = options.newName ?? actor.name;
    // Trim, remove reserved chars prevent empty
    let safeName = stripUnsafeFilenameChars(rawName.trim());
    if (!safeName) safeName = 'Unnamed Actor';

    // Prevent identical no-op
    if (isRename && safeName === actor.name && !isMove) return;

    const targetFolderId = options.newFolderId ?? (
      STUDIO_FOLDERS.find(f => f.styles.includes(normalizeStyle(actor.profile?.style)))?.id || 'uncategorized'
    );
    const targetFolder = STUDIO_FOLDERS.find(f => f.id === targetFolderId) || STUDIO_FOLDERS.find(f => f.id === 'uncategorized')!;
    const newStyle = targetFolder.styles[0] || '';
    const newCatLabel = targetFolder.id === 'uncategorized' ? '' : targetFolder.label;

    const ext = actor.filename.includes('.') ? actor.filename.split('.').pop()! : 'png';
    const baseNewFilename = `${safeName}.${ext}`;

    try {
      let finalFilename = baseNewFilename;
      let finalRelativePath = newCatLabel ? `${newCatLabel}/${finalFilename}` : finalFilename;

      // 2. COLLISION HANDLING (Find a non-colliding filename)
      if (isNativeParams() && state.saveDirectoryPath && window.electronAPI?.exists && window.electronAPI?.joinPath) {
        const actorsDir = await window.electronAPI.joinPath(state.saveDirectoryPath, 'Actors');
        let counter = 1;
        let testPath = await window.electronAPI.joinPath(actorsDir, finalRelativePath);

        const oldFullPath = await window.electronAPI.joinPath(actorsDir, actor.filename);

        while (await window.electronAPI.exists(testPath)) {
          // If the old path and new path are exactly the same (e.g. user typed same name in same folder), we don't need to rename
          if (oldFullPath === testPath) {
            break;
          }
          finalFilename = `${safeName} (${counter}).${ext}`;
          finalRelativePath = newCatLabel ? `${newCatLabel}/${finalFilename}` : finalFilename;
          testPath = await window.electronAPI.joinPath(actorsDir, finalRelativePath);
          counter++;
        }

        // 3. ATOMIC DISK OPERATION
        if (oldFullPath !== testPath) {
          const success = await window.electronAPI.renameFile!(oldFullPath, testPath);
          if (!success) throw new Error("Native Rename IPC Returned False");
        }
      } else if (state.saveDirectoryHandle) {
        // WEB FALLBACK
        const webPath = finalRelativePath;
        const res = await fetch(actor.url);
        const blob = await res.blob();
        const file = new File([blob], finalFilename, { type: `image/${ext === 'jpeg' ? 'jpeg' : 'png'}` });
        await saveAssetToDisk(state.saveDirectoryHandle, webPath, file);

        if (actor.filename !== finalRelativePath) {
          let curDir = await state.saveDirectoryHandle.getDirectoryHandle('Actors');
          const oldParts = actor.filename.split(/[\\/]/);
          for (let i = 0; i < oldParts.length - 1; i++) {
            curDir = await curDir.getDirectoryHandle(oldParts[i]);
          }
          await curDir.removeEntry(oldParts[oldParts.length - 1]);
        }
      }

      // 4. ATOMIC MEMORY UPDATE (Only triggers if disk success)
      const updatedProfile = {
        style: newStyle,
        identity: safeName,
        wardrobe: actor.profile?.wardrobe || "",
        accessories: actor.profile?.accessories || ""
      };

      dispatch({
        type: 'UPDATE_ACTOR_LIBRARY',
        payload: {
          id: actor.id,
          updates: {
            name: safeName,
            filename: finalRelativePath,
            profile: updatedProfile,
            // url: newUrl // Re-evaluating URL update later if necessary, currently base64 is already safe
          }
        }
      });

      dispatch({ type: 'ADD_LOG', payload: { message: `Actor ${isMove ? 'organized' : 'renamed'} successfully`, type: 'success' } });

    } catch (e: unknown) {
      console.error("Rename/Move failed", e);
      showToast(`Disk Update Failed: ${getErrorMessage(e)}`);
      dispatch({ type: 'ADD_LOG', payload: { message: `Actor update failed: ${getErrorMessage(e)}`, type: 'error' } });
    }
  };


  // --- LIBRARY SEARCH & SORT STATE ---
  const [librarySearch, setLibrarySearch] = useState('');
  const [sortOption, setSortOption] = useState<'name' | 'date' | 'type'>('date');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [refSheetUrl, setRefSheetUrl] = useState<string | null>(null);

  // Custom Covers moved to AppContext for persistence
  // const [customCovers, setCustomCovers] = useState<Record<string, string>>({});

  const [needsPermission, setNeedsPermission] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // The following lines are duplicates from the provided diff, keeping the first set.
  // const [librarySearch, setLibrarySearch] = useState("");
  // const [sortOption, setSortOption] = useState<'date' | 'name' | 'type'>('date');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [organizeTarget, setOrganizeTarget] = useState<{ id: string, name: string } | null>(null);
  const [editingActorName, setEditingActorName] = useState<{ id: string, name: string } | null>(null);

  // Load covers from disk if available
  // This useEffect is removed as per instructions, as customCovers are now in AppContext
  // and should not be revoked on component unmount.

  const loadDiskCovers = useCallback(async (autoRequest: boolean = false) => {
    // 1. NATIVE MODE (Electron)
    // 1. NATIVE MODE (Electron)
    if (isNativeParams() && state.saveDirectoryPath) {
      console.log(`[CustomCovers] Native Mode Check. Path: ${state.saveDirectoryPath}`);
      console.log(`[CustomCovers] Current State Keys: ${Object.keys(state.customCovers).join(', ')}`);

      if (Object.keys(state.customCovers).length > 0 && !autoRequest) {
        console.log(`[CustomCovers] Skipping load, covers already in memory.`);
        setNeedsPermission(false);
        return;
      }

      console.log(`[CustomCovers] Loading from disk...`);
      const loaded: Record<string, string> = { ...state.customCovers };

      for (const folder of STUDIO_FOLDERS) {
        try {
          const url = await nativeLoadCover(state.saveDirectoryPath, folder.id);
          if (url) {
            console.log(`[CustomCovers] Loaded ${folder.id} from disk.`);
            loaded[folder.id] = url;
          } else {
            console.log(`[CustomCovers] Failed to load ${folder.id} (not found/empty).`);
          }
        } catch (e) {
          console.error(`[CustomCovers] Error loading ${folder.id}:`, e);
        }
      }

      const loadedCount = Object.keys(loaded).length;
      console.log(`[CustomCovers] Load Complete. Found ${loadedCount} covers.`);

      if (loadedCount > 0) {
        dispatch({ type: 'SET_CUSTOM_COVERS', payload: loaded });
      }
      setNeedsPermission(false);
      return;
    }

    // Fallback log if path missing
    if (isNativeParams() && !state.saveDirectoryPath) {
      // console.warn("[CustomCovers] Native Mode but saveDirectoryPath is empty. Cannot load covers.");
    }

    // 2. WEB MODE (File System Access API)
    // If we receive a saveDirectoryHandle, we MUST verify it still has permission.
    if (!state.saveDirectoryHandle) return;

    // Redundant guard: If we are native, we should NOT be checking handles unless mixed mode (rare)
    if (isNativeParams()) {
      setNeedsPermission(false);
      return;
    }

    try {
      // If autoRequest is false (silent check), capture the failure to show Banner
      const hasPermission = await verifyPermission(state.saveDirectoryHandle, false, autoRequest);

      if (!hasPermission) {
        if (autoRequest) {
          showToast("Permission Denied. Please approve read access.");
        } else {
          // Silent check failed -> Show Resume Banner
          setNeedsPermission(true);
        }
        return;
      }

      // If we got here, we have permission!
      setNeedsPermission(false);

    } catch (err) {
      console.error("loadDiskCovers: Permission check crashed", err);
      return;
    }

    const loaded: Record<string, string> = {};

    for (const folder of STUDIO_FOLDERS) {
      // Unsorted is now INCLUDED
      const filename = getStudioCoverFilename(folder.id);
      try {
        const url = await loadAssetFromDisk(state.saveDirectoryHandle, filename);
        if (url) {
          loaded[folder.id] = url;
        }
      } catch {
        // File likely doesn't exist
      }
    }

    const hasCoverChanges = Object.entries(loaded).some(([folderId, url]) => state.customCovers[folderId] !== url);
    if (Object.keys(loaded).length > 0 && hasCoverChanges) {
      dispatch({ type: 'SET_CUSTOM_COVERS', payload: { ...state.customCovers, ...loaded } });
    }
  }, [state.customCovers, state.saveDirectoryHandle, state.saveDirectoryPath, dispatch, showToast]);

  useEffect(() => {
    loadDiskCovers(false);
  }, [loadDiskCovers]);


  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingFolderId) return;

    // 1. NATIVE MODE
    if (isNativeParams() && state.saveDirectoryPath) {
      const success = await nativeSaveCover(state.saveDirectoryPath, editingFolderId, file);
      if (success) {
        const newUrl = await nativeLoadCover(state.saveDirectoryPath, editingFolderId);
        if (newUrl) {
          dispatch({ type: 'SET_CUSTOM_COVERS', payload: { ...state.customCovers, [editingFolderId]: newUrl } });
          setEditingFolderId(null);
          dispatch({ type: 'ADD_LOG', payload: { message: "Cover updated", type: 'success' } });
        }
      } else {
        dispatch({ type: 'ADD_LOG', payload: { message: "Failed to save cover.", type: 'error' } });
      }
      return;
    }

    // 2. WEB MODE
    if (!state.saveDirectoryHandle) {
      showToast("Please set a Save Directory (Settings) to use Custom Covers.");
      return;
    }
    try {
      // Verify Write Permission
      const hasPermission = await verifyPermission(state.saveDirectoryHandle, true);
      if (!hasPermission) {
        showToast("Permission Denied. Please re-connect folder.");
        return;
      }

      const filename = getStudioCoverFilename(editingFolderId);
      await saveAssetToDisk(state.saveDirectoryHandle, filename, file);

      const newUrl = await loadAssetFromDisk(state.saveDirectoryHandle, filename);
      if (newUrl) {
        dispatch({ type: 'SET_CUSTOM_COVERS', payload: { ...state.customCovers, [editingFolderId]: newUrl } });
        dispatch({ type: 'ADD_LOG', payload: { message: "Cover Saved to Disk", type: 'success' } });
      }
    } catch (err: unknown) {
      console.error("Save failed", err);
      dispatch({ type: 'ADD_LOG', payload: { message: `Save Failed: ${getErrorMessage(err)}`, type: 'error' } });
    }

    e.target.value = ''; // Reset
    setEditingFolderId(null);
  };


  const triggerCoverEdit = (folderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingFolderId(folderId);
    setTimeout(() => fileInputRef.current?.click(), 50);
  };

  // Derived Library List
  const filteredLibrary = React.useMemo(() => {
    let result = state.actorLibrary;

    // 1. Search Filter
    if (librarySearch.trim()) {
      const q = librarySearch.toLowerCase();
      result = result.filter(a => a.name.toLowerCase().includes(q));
    }

    // 2. Folder Filter (NEW)
    if (activeFolder) {
      const folder = STUDIO_FOLDERS.find(f => f.id === activeFolder);
      if (folder) {
        if (folder.id === 'uncategorized') {
          // Robust Unsorted Filter
          result = result.filter(a => {
            const s = normalizeStyle(a.profile?.style);
            // If style is empty OR it is NOT in the known list -> It is Unsorted
            const isUnsorted = !s || !knownStyles.has(s);
            // DEBUG removed
            return isUnsorted;
          });
          // console.log(`Filtered Uncategorized: ${result.length} actors remain of ${state.actorLibrary.length}`);
        } else {
          // Robust Category Filter
          const targetStyles = new Set(folder.styles.map(s => normalizeStyle(s)));
          result = result.filter(a => targetStyles.has(normalizeStyle(a.profile?.style)));
        }
      }
    }

    // 3. Sort Logic
    return [...result].sort((a, b) => { // ... existing logic
      if (sortOption === 'name') {
        return a.name.localeCompare(b.name);
      } else if (sortOption === 'type') {
        const typeA = a.profile?.style || '';
        const typeB = b.profile?.style || '';
        return typeA.localeCompare(typeB);
      } else {
        // Date (Default: Newest First)
        // Heuristic: Extract largest continuous sequence of numbers from ID, Name, URL, or Filename since format varies
        const extractTimestamp = (actor: CastMember) => {
          const strToSearch = `${actor.id} ${actor.name} ${actor.url} ${actor.filename || ''}`;
          const matches = strToSearch.match(/\d{10,14}/);
          return matches ? parseInt(matches[0]) : 0;
        };
        const timeA = extractTimestamp(a);
        const timeB = extractTimestamp(b);

        if (timeA === 0 && timeB === 0) {
          // Un-timestamped fallback: sort natively inverted to bubble newer generic IDs up
          return b.id.localeCompare(a.id);
        }
        return timeB - timeA;
      }
    });
  }, [state.actorLibrary, librarySearch, sortOption, activeFolder, knownStyles]);

  // --- 4. ALPHA MATTE PROCESS ---
  // The 'mask' is now the isolated image URL itself.

  // PHASE 1: EROSION (Heavy - CPU)
  const generateErodedMask = async (srcUrl: string, pixels: number): Promise<string> => {
    const safePixels = Math.max(0, Math.min(4, pixels));
    if (safePixels === 0) return srcUrl;

    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) { resolve(srcUrl); return; }

        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const w = canvas.width;
        const h = canvas.height;

        // Create a copy for reading so we don't read already-modified pixels
        const originalAlphaArr = new Uint8Array(w * h);
        for (let i = 0; i < w * h; i++) {
          originalAlphaArr[i] = data[i * 4 + 3];
        }

        // SUB-PIXEL EROSION
        const rBase = Math.floor(safePixels);
        const rExt = rBase + 1;
        const fraction = safePixels - rBase;

        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const idx = (y * w + x) * 4;
            if (data[idx + 3] === 0) continue;

            let minBase = 255;
            let minExt = 255;

            for (let dy = -rExt; dy <= rExt; dy++) {
              for (let dx = -rExt; dx <= rExt; dx++) {
                const nx = x + dx;
                const ny = y + dy;
                let nAlpha = 0;
                if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                  nAlpha = originalAlphaArr[ny * w + nx];
                }
                const dist = Math.max(Math.abs(dx), Math.abs(dy));
                if (dist <= rBase) { if (nAlpha < minBase) minBase = nAlpha; }
                if (dist <= rExt) { if (nAlpha < minExt) minExt = nAlpha; }
              }
            }
            const finalAlpha = minBase * (1 - fraction) + minExt * fraction;
            data[idx + 3] = finalAlpha;
          }
        }

        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL());
      };
      img.onerror = () => {
        console.error("Failed to load mask for erosion");
        resolve(srcUrl); // Fallback to original
      };
      img.src = srcUrl;
    });
  };

  // PHASE 2: RESTORATION (Light - GPU Composition)
  const compositeRestoration = (
    baseInput: string | HTMLImageElement,
    originalInput: string | HTMLImageElement,
    restoreLayerUrl: string | null
  ): Promise<string> => {
    // console.log("COMPOSITE: Start", { hasRestore: !!restoreLayerUrl, baseType: typeof baseInput });

    // If no restoration layer, return base (if string) or src (if image)
    if (!restoreLayerUrl) {
      return Promise.resolve(typeof baseInput === 'string' ? baseInput : baseInput.src);
    }

    // RETRY LOGIC WRAPPER
    const attemptComposite = (retryCount = 0): Promise<string> => {
      return new Promise((resolve) => {
        // Helper to wait for image if string
        const ensureImage = (input: string | HTMLImageElement): Promise<HTMLImageElement> => {
          if (typeof input !== 'string') return Promise.resolve(input);
          return new Promise((res, rej) => {
            const i = new Image();
            i.crossOrigin = "anonymous";
            i.onload = () => res(i);
            i.onerror = () => {
              console.error(`Failed to load image: ${input.slice(0, 50)}...`);
              rej();
            };
            i.src = input;
          });
        };

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        ensureImage(baseInput).then(baseImg => {
          canvas.width = baseImg.width;
          canvas.height = baseImg.height;

          if (!ctx) { resolve(baseImg.src); return; }

          // 1. Draw Eroded Base
          ctx.drawImage(baseImg, 0, 0);

          // 2. Local Restoration
          const restoreImg = new Image();
          restoreImg.onload = () => {
            ensureImage(originalInput).then(originalImg => {
              const tempCanvas = document.createElement('canvas');
              tempCanvas.width = canvas.width;
              tempCanvas.height = canvas.height;
              const tCtx = tempCanvas.getContext('2d');
              if (tCtx) {
                tCtx.drawImage(restoreImg, 0, 0);
                tCtx.globalCompositeOperation = 'source-in';
                tCtx.drawImage(originalImg, 0, 0);

                ctx.globalCompositeOperation = 'source-over';
                ctx.drawImage(tempCanvas, 0, 0);
              }
              resolve(canvas.toDataURL());
            }).catch(() => {
              console.error("Failed to load original for composite");
              if (retryCount < 1) {
                console.warn("Retrying composite with fresh load...");
                attemptComposite(retryCount + 1).then(resolve);
              } else {
                resolve(baseImg.src);
              }
            });
          };
          restoreImg.onerror = () => {
            console.error("Failed to load restoration mask");
            if (retryCount < 1) {
              console.warn("Retrying composite due to mask load fail...");
              attemptComposite(retryCount + 1).then(resolve);
            } else {
              resolve(baseImg.src);
            }
          };
          restoreImg.src = restoreLayerUrl;

        }).catch(() => {
          console.error("Failed to load base for composite");
          resolve("");
        });
      });
    };

    return attemptComposite(0);
  };

  // EFFECT 1: Handle Erosion (Slow)
  useEffect(() => {
    if (!removeBg || !state.lastCastedMask) {
      setErodedUrl(null);
      setIsIsolating(false); // SAFETY RESET
      return;
    }

    // If no fringe, the "eroded" state is just the mask
    if (fringeSize === 0) {
      setErodedUrl(state.lastCastedMask);
      setIsIsolating(false); // SAFETY RESET
      return;
    }

    setIsIsolating(true);
    let active = true;
    const t = setTimeout(() => {
      generateErodedMask(state.lastCastedMask!, fringeSize).then(url => {
        if (active) {
          setErodedUrl(url);
          setIsIsolating(false);
        }
      });
    }, 100);

    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [state.lastCastedMask, fringeSize, removeBg]);

  // EFFECT 1.5: Preload/Cache Static Images
  useEffect(() => {
    // ALWAYS clear cache first to prevent stale image usage
    cachedBaseImgRef.current = null;

    const base = erodedUrl || state.lastCastedMask;
    if (base && typeof base === 'string') {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = base;
      img.onload = () => { cachedBaseImgRef.current = img; };
    }
  }, [erodedUrl, state.lastCastedMask]);

  useEffect(() => {
    // ALWAYS clear cache first
    cachedOriginalImgRef.current = null;

    if (state.lastCastedImage) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = state.lastCastedImage;
      img.onload = () => { cachedOriginalImgRef.current = img; };
    }
  }, [state.lastCastedImage]);


  // EFFECT 2: Handle Composition (Fast)
  useEffect(() => {
    if (!removeBg) {
      setProcessedPreviewUrl(null);
      return;
    }

    if (!erodedUrl && !state.lastCastedMask) {
      setProcessedPreviewUrl(null);
      return;
    }

    const base = erodedUrl || state.lastCastedMask;
    if (!base) return;

    let active = true;
    if (restorationLayer && state.lastCastedImage) {
      // USE CACHED IMAGES IF AVAILABLE
      const baseInput = cachedBaseImgRef.current || base;
      const originalInput = cachedOriginalImgRef.current || state.lastCastedImage;

      // console.log("EFFECT 2: Triggered. Using Cache?", { baseCached: !!cachedBaseImgRef.current, origCached: !!cachedOriginalImgRef.current });

      // Fast composite
      compositeRestoration(baseInput, originalInput, restorationLayer).then(url => {
        if (active) {
          // console.log("EFFECT 2: Success. Updating Preview.");
          setProcessedPreviewUrl(url);
        } else {
          // console.log("EFFECT 2: Stale result ignored.");
        }
      });
    } else {
      setProcessedPreviewUrl(base);
    }
    return () => { active = false; };
  }, [erodedUrl, restorationLayer, removeBg, state.lastCastedImage, state.lastCastedMask]);









  const handleDownload = async () => {
    const source = state.lastCastedImage;
    if (!source) return;

    try {
      const blob = await resolveImageBlob(source);
      const objectUrl = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = createUniqueDownloadFilename('nano_banana_export.png');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);

      dispatch({ type: 'ADD_LOG', payload: { message: 'Image downloaded.', type: 'info' } });
    } catch (e: unknown) {
      console.error('Download failed', e);
      dispatch({ type: 'ADD_LOG', payload: { message: `Download failed: ${getErrorMessage(e)}`, type: 'error' } });
    }
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const rawDataUrl = ev.target?.result as string;
        const img = new Image();
        img.onload = async () => {
          // Preserve the full image – no forced aspect-ratio crop.
          // Only downscale if either dimension exceeds 2048px for performance.
          const MAX = 2048;
          let w = img.width;
          let h = img.height;
          if (w > MAX || h > MAX) {
            if (w >= h) { h = Math.round(h * MAX / w); w = MAX; }
            else        { w = Math.round(w * MAX / h); h = MAX; }
          }

          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, w, h);
          const standardizedUrl = canvas.toDataURL('image/png');

          dispatch({ type: 'SET_LAST_CASTED_IMAGE', payload: standardizedUrl });
          dispatch({ type: 'SET_LAST_CASTED_MASK', payload: null });
          setProcessedPreviewUrl(null);
        };
        img.src = rawDataUrl;
      };
      reader.readAsDataURL(file);
    }
  };

  const cacheCastingRecentGeneration = (imageUrl: string, prompt: string, createdAt = Date.now()) => {
    const recentStore = useRecentGenerationsStore.getState();
    if (!recentStore.cacheDirPath || !imageUrl) return;

    RecentGenerationsCacheService.cacheGeneration({
      imageDataUrl: imageUrl,
      studio: 'general',
      cacheDirPath: recentStore.cacheDirPath,
    }).then((cacheResult) => {
      if (cacheResult.success && cacheResult.localCachePath && cacheResult.displayUrl) {
        recentStore.addRecentGeneration({
          studio: 'general',
          localCachePath: cacheResult.localCachePath,
          displayUrl: cacheResult.displayUrl,
          createdAt,
          prompt,
          mode: (state.billingEntitlements.effectiveBillingMode as 'hosted' | 'byok') || 'byok',
        });
      }
    }).catch((e) => {
      console.warn('[CastingForge] Recent generation caching failed:', e);
    });
  };

  const handleGenerateRefSheet = async () => {
    if (!state.lastCastedImage) return;

    const billingMode = state.billingEntitlements.effectiveBillingMode;
    if (billingMode === "byok" && !state.apiKey) return;
    if (!(await ensureAuthenticatedForGeneration({ billingMode, featureLabel: 'Casting Forge reference sheet' }))) {
      return;
    }
    dispatch({ type: 'SET_PROCESSING', payload: true });
    dispatch({ type: 'ADD_LOG', payload: { message: "Generating Character Reference Sheet...", type: 'info' } });

    // --- TIMEOUT & ETA LOGIC ---
    const getEtaMs = () => state.imageResolution === '4K' ? 90000 : (state.imageResolution === '2K' ? 45000 : 20000);
    const etaMs = getEtaMs();

    // --- PROGRESS SIMULATION TIMER ---
    let currentPercent = 5;
    dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: { percent: currentPercent, text: "Synthesizing Reference Sheet" } });

    const updateMs = 1000;
    const increment = (updateMs / etaMs) * 100;

    const progressInterval = setInterval(() => {
      currentPercent += increment;
      if (currentPercent > 95) currentPercent = 95; // Cap at 95% until complete

      let text = "Synthesizing Reference Sheet";
      if (currentPercent > 30) text = "Refining Geometry...";
      if (currentPercent > 60) text = "Applying Materials...";
      if (currentPercent > 80) text = "Finalizing Render...";
      if (currentPercent >= 95) text = "Finalizing Render... (Still working, please wait)";

      dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: { percent: currentPercent, text } });
    }, updateMs);

    try {
      let finalPrompt = REFERENCE_SHEET_PROMPT;

      if (refLayout === 'form_focus') {
        finalPrompt += " [LAYOUT A - CLASSIC]: Split canvas horizontally. Top 65% height: SINGLE ROW OF EXACTLY 3 Full Body views with DISTINCT ANGLES (T1 Front, T2 Left Profile Side View, T3 Back). Bottom 35% height: SINGLE HORIZONTAL ROW OF EXACTLY 4 Headshots only (B1 Front, B2 EXTREME LEFT PROFILE nose/snout points screen-right, B3 EXTREME RIGHT PROFILE nose/snout points screen-left, B4 Looking Up). Do not create a second headshot row. Do not make a 2x2 grid. Do not add duplicate unlabeled headshot tiles. Ensure headshots are MACRO-DETAILED and hyper-sharp.";
        finalPrompt += REFERENCE_SHEET_FORM_HARD_CONSTRAINTS;
      } else if (refLayout === 'face_focus') {
        finalPrompt += " [LAYOUT B - FACE FIRST]: Split canvas horizontally. Top 55% height: Row of EXACTLY 4 Large Headshots showing VARIED ANGLES (T1 Front, T2 EXTREME LEFT PROFILE nose/snout points screen-right, T3 EXTREME RIGHT PROFILE nose/snout points screen-left, T4 Looking Up). Bottom 45% height: Row of EXACTLY 3 Full Body views with DISTINCT ANGLES (1. Front, 2. Left Profile Side View, 3. Back). Headshots must maintain perfect identity.";
        finalPrompt += REFERENCE_SHEET_FACE_HARD_CONSTRAINTS;
      } else if (refLayout === 'split_focus') {
        finalPrompt += " [LAYOUT C - STUDIO]: Split canvas vertically. Left 45% width: Vertical stack of EXACTLY 3 Full Body views with DISTINCT ANGLES (1. Front, 2. Left Profile Side View, 3. Back). DO NOT ADD A FOURTH VIEW. Right 55% width: 2x2 Grid of Large Headshots with VARIED ANGLES (R1 Front, R2 EXTREME LEFT PROFILE nose/snout points screen-right, R3 EXTREME RIGHT PROFILE nose/snout points screen-left, R4 Looking Up). Highest possible facial resolution.";
        finalPrompt += REFERENCE_SHEET_SPLIT_HARD_CONSTRAINTS;
      }

      finalPrompt += REFERENCE_SHEET_GLOBAL_HARD_CONSTRAINTS;
      finalPrompt += REFERENCE_SHEET_UNIQUENESS_AUDIT;
      finalPrompt += REFERENCE_SHEET_DIRECTION_LABEL_CONTRACT;
      finalPrompt += REFERENCE_SHEET_PROFILE_PAIR_VISUAL_LOCK;
      finalPrompt += buildHeadshotWardrobeContinuityContract({
        identitySource: 'the uploaded/approved character reference image for face, head shape, skin tone, hairstyle, facial hair, and age impression only',
        wardrobeAuthority: 'the fitted/generated character costume visible in the full-body panels and character reference render',
        finalLookReference: 'the full-body front/profile/back views and approved fitted character image in this same reference sheet request',
        appliesTo: 'all head close-ups, headshot profile slots, looking-up head slots, and facial-angle panels',
        strictness: 'reference_sheet'
      });
      const refSheetStyleFolder = selectedStyleId ? STUDIO_FOLDERS.find(f => f.id === selectedStyleId) : null;
      const refSheetStyleLabel = refSheetStyleFolder?.label || selectedStyleId || 'selected character render style';
      const refSheetStyleContract = buildStyleCategoryContract(selectedStyleId, {
        selectedStyleLabel: refSheetStyleLabel,
        sourceImagePolicy: "Character reference image controls identity and approved costume only; source-photo realism must not override the selected reference-sheet render category.",
        boardPresentationPolicy: "Reference sheet layout controls panel arrangement, labels, and technical presentation only.",
        lightingPolicy: "Reference sheet lighting must stay inside the selected character render category.",
        appliesTo: "Casting Forge full-body reference panels, headshot strip, saved actor preview, and recent thumbnail"
      });
      const refSheetStyleLockContract = buildSheetStyleLockContract(selectedStyleId, {
        source: selectedStyleId ? 'user_selected' : 'reference_image',
        selectedStyleLabel: refSheetStyleLabel,
        referenceStyleDescription: 'the approved character reference image supplies the current visual finish; keep one rendering family across the reference sheet',
        strictness: 'high',
        appliesTo: [
          'full-body front panel',
          'full-body left profile panel',
          'full-body right profile panel',
          'full-body rear panel',
          'front headshot panel',
          'left profile headshot panel',
          'right profile headshot panel',
          'looking-up headshot panel',
          'wardrobe, footwear, logo, and material callouts'
        ]
      });
      const refSheetStyleNegativePrompt = buildStyleNegativePrompt(selectedStyleId);
      if (refSheetStyleContract) {
        finalPrompt += refSheetStyleContract;
      }
      finalPrompt += refSheetStyleLockContract;
      finalPrompt += buildTurnaroundPoseCoherenceContract([
        { label: 'full body FRONT slot', viewAngle: 'front', degrees: 0, bodyFacing: 'straight front-facing unified axis' },
        { label: 'full body LEFT PROFILE slot', viewAngle: 'left_profile', degrees: 90, bodyFacing: 'true 90-degree side profile axis' },
        { label: 'full body RIGHT PROFILE slot', viewAngle: 'right_profile', degrees: 270, bodyFacing: 'true opposite 90-degree side profile axis' },
        { label: 'full body BACK/REAR slot', viewAngle: 'back', degrees: 180, bodyFacing: 'straight rear-facing unified axis' },
        { label: 'headshot profile slots', viewAngle: 'custom', bodyFacing: 'head, neck, collar, and visible shoulders obey the labeled yaw' }
      ]);
      if (refLayout === 'form_focus') {
        finalPrompt += REFERENCE_SHEET_FORM_ROW_CONTRACT;
      }
      if (refLayout === 'split_focus') {
        finalPrompt += `
SPLIT LAYOUT FINAL PROFILE CHECK:
- R2 top-right profile and R3 bottom-left profile must be opposite screen directions.
- R2 must look screen-right. R3 must look screen-left.
- If R2 and R3 could be mistaken for the same side profile, redraw one slot before final output.
`;
      }
      finalPrompt += " EXCLUSION RULE: NEVER put two identical profile views next to each other. The Left Profile and Right Profile MUST face opposite directions.\n";

      finalPrompt += "\n\nCRITICAL ROTATION OVERRIDE: While the identity and costume must match the reference, YOU MUST NOT COPY THE CAMERA ANGLE OF THE REFERENCE IMAGE across all panels. You MUST dynamically rotate the character's head and body in 3D space to precisely match the requested viewpoints (Profile, 3/4, Back, etc) for each individual panel.\n\n";

      if (includeCalloutLabels) {
        finalPrompt += getReferenceSheetCalloutPrompt(refLayout, logoPosition);
        finalPrompt += "\nTEXT EXCEPTION OVERRIDE: The base negative word 'text' does not apply to the requested professional callout labels. It still applies to unrelated captions, watermarks, random text, misspelled filler, signatures, UI text, and decorative typography.\n";
      }

      finalPrompt += `\nSTRICT NEGATIVE ADDENDUM: double-head, two heads on one body, conjoined anatomy, fused torso, ghost body, mirrored twin body, duplicate neck, duplicate torso, extra body in slot, empty panel slot, panel overlap artifacts, extra headshot row, repeated headshot row, duplicate front head, duplicate profile tile, unlabeled headshot tile, 2x2 bottom grid in Form layout, selected style category drift, ${SHEET_STYLE_LOCK_NEGATIVE_TEXT}${refSheetStyleNegativePrompt ? `, ${refSheetStyleNegativePrompt}` : ''}, ${buildPoseCoherenceNegativeTokens()}, ${buildHeadshotWardrobeNegativeTokens()}.\n`;

      // BRANDING INJECTION
      const targetReferenceUrl = state.lastCastedImage;
      const inputImages = [{ url: targetReferenceUrl, label: 'Character Reference' }];

      if (brandingLogo) {
        inputImages.push({ url: brandingLogo, label: 'Branding Logo' });
        finalPrompt += `
 
 8. BRANDING & IDENTITY (OVERRIDE)
 - Place the logo from [IMAGE 2] onto the character's clothing in views where the torso is visible.
 - EXACT PLACEMENT: ${logoPosition || "Chest/Torso"}.
 - Integrate the logo realistically: it must wrap with the fabric's folds, match the lighting, and follow the texture of the garment.
 - The logo must be visible and consistent across all full-body angles (Front, Side, Back).
 - HEADSHOT EXCLUSION (CRITICAL): Do NOT spawn the logo floating in the background, on the neck, or on the face. If a panel is an extreme close-up or headshot where the ${logoPosition || "Chest/Torso"} is NOT naturally visible, OMIT THE LOGO ENTIRELY from that specific panel.`;
      }

      // Split layout needs extra vertical room for 3 full-body slots to avoid panel collisions and fused anatomy artifacts.
      const referenceSheetAspectRatio = refLayout === 'split_focus' ? '4:3' : '1:1';

      const generateRefSheetAttempt = async (promptText: string): Promise<string> => {
        const res = await GeminiService.generateImage(
          promptText,
          state.apiKey,
          state.model,
          inputImages,
          {
            aspectRatio: referenceSheetAspectRatio,
            imageSize: state.imageResolution,
            creditRenderType: 'character_sheet',
            thinkingLevel: state.enableImageThinking,
            googleGrounding: false,
            strictMode: true,
            billingMode: state.billingEntitlements.effectiveBillingMode as 'hosted' | 'byok',
            entitlements: state.billingEntitlements,
            styleCategory: selectedStyleId ? {
              styleId: selectedStyleId,
              intent: {
                selectedStyleLabel: refSheetStyleLabel,
                appliesTo: "Casting Forge generated reference sheet panels and recent thumbnail"
              }
            } : undefined
          }
        );

        let safeRefUrl = res as string;
        if (typeof safeRefUrl === 'string' && safeRefUrl.startsWith('http')) {
          try {
            const blob = await resolveImageBlob(safeRefUrl);
            safeRefUrl = URL.createObjectURL(blob);
          } catch (fetchErr) {
            console.warn("Failed to materialize remote ref sheet:", fetchErr);
          }
        }
        return safeRefUrl;
      };

      let safeRefSheetUrl = await generateRefSheetAttempt(finalPrompt);

      try {
        const validation = await detectDuplicateReferenceSheetAngles(safeRefSheetUrl, refLayout);
        if (validation.hasDuplicate) {
          dispatch({
            type: 'ADD_LOG',
            payload: {
              message: `Reference sheet duplicate ${validation.scope} angle detected (${validation.pair || 'unknown pair'}, ${(validation.maxSimilarity * 100).toFixed(1)}%). Running auto-correction pass...`,
              type: 'info'
            }
          });

          const retryPrompt = `${finalPrompt}

DUPLICATE ANGLE CORRECTION PASS (MANDATORY):
- Previous output repeated one or more requested camera angles.
- Re-render now and force unique yaw buckets for all full-body slots and headshot profile slots.
- Specifically ensure FRONT, LEFT PROFILE, RIGHT PROFILE, and BACK/REAR are all different and visually non-overlapping in silhouette.
- The two profile headshots must be opposite screen directions: LEFT PROFILE nose/snout points screen-right; RIGHT PROFILE nose/snout points screen-left.
- Never place two left-facing profiles or two right-facing profiles in the B2/B3, T2/T3, or R2/R3 slots.
- For split sheets, R2 and R3 must not be the same side closeup. R2 must look screen-right; R3 must look screen-left.
- For Form sheets, the bottom band must be a single row of exactly four labeled headshots: B1, B2, B3, B4. Remove any second row, extra unlabeled headshot, duplicate front head, or duplicated profile tile.
- If one slot risks duplicating another, regenerate that slot internally before returning final image.`;

          safeRefSheetUrl = await generateRefSheetAttempt(retryPrompt);

          const secondValidation = await detectDuplicateReferenceSheetAngles(safeRefSheetUrl, refLayout);
          if (secondValidation.hasDuplicate) {
            dispatch({
              type: 'ADD_LOG',
              payload: {
                message: `Reference sheet still shows possible duplicate ${secondValidation.scope} angles (${(secondValidation.maxSimilarity * 100).toFixed(1)}%).`,
                type: 'error'
              }
            });
          } else {
            dispatch({
              type: 'ADD_LOG',
              payload: { message: "Auto-correction pass resolved duplicate angles.", type: 'success' }
            });
          }
        }
      } catch (validationErr) {
        console.warn("Reference sheet uniqueness validation failed:", validationErr);
      }

      setRefSheetUrl(safeRefSheetUrl);
      setShowRefSheet(true);
      cacheCastingRecentGeneration(safeRefSheetUrl, `Reference Sheet - CAST (${refLayout}${includeCalloutLabels ? ', callout labels' : ''})`);
      dispatch({ type: 'ADD_LOG', payload: { message: "Reference Sheet Generated.", type: 'success' } });
    } catch (e: unknown) {
      dispatch({ type: 'ADD_LOG', payload: { message: `Ref Sheet failed: ${getErrorMessage(e)}`, type: 'error' } });
    } finally {
      clearInterval(progressInterval);
      dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: null });
      dispatch({ type: 'SET_PROCESSING', payload: false });
    }
  };

  const panelDimRef = useRef({ w: 0, h: 0 });
  void panelDimRef;

  // handlePanelMouseDown removed (Docked Controls)

  const getRenderedImageRect = (img: HTMLImageElement) => {
    const rect = img.getBoundingClientRect();
    const style = window.getComputedStyle(img);
    const padLeft = parseFloat(style.paddingLeft) || 0;
    const padTop = parseFloat(style.paddingTop) || 0;
    const padRight = parseFloat(style.paddingRight) || 0;
    const padBottom = parseFloat(style.paddingBottom) || 0;

    const contentLeft = rect.left + padLeft;
    const contentTop = rect.top + padTop;
    const contentWidth = Math.max(1, rect.width - padLeft - padRight);
    const contentHeight = Math.max(1, rect.height - padTop - padBottom);

    const naturalWidth = img.naturalWidth || 1;
    const naturalHeight = img.naturalHeight || 1;
    const fitScale = Math.min(contentWidth / naturalWidth, contentHeight / naturalHeight);
    const width = naturalWidth * fitScale;
    const height = naturalHeight * fitScale;

    return {
      left: contentLeft + (contentWidth - width) / 2,
      top: contentTop + (contentHeight - height) / 2,
      width,
      height,
      scale: naturalWidth / width,
    };
  };

  // MOUSE TO IMAGE COORDINATE MAPPER
  const getImgCoords = (clientX: number, clientY: number) => {
    const activeImg = imgRef.current;

    if (!containerRef.current || !activeImg) return null;

    const container = containerRef.current;
    const containerRect = container.getBoundingClientRect();
    const renderedRect = getRenderedImageRect(activeImg);

    const mouseX = clientX - renderedRect.left;
    const mouseY = clientY - renderedRect.top;

    if (
      mouseX < 0 ||
      mouseY < 0 ||
      mouseX > renderedRect.width ||
      mouseY > renderedRect.height
    ) {
      return null;
    }

    // Relative to Container Content Box (where .absolute children live)
    // screenX = clientX - (containerLeft + borderLeft)
    const borderLeft = container.clientLeft || 0;
    const borderTop = container.clientTop || 0;
    const screenX = clientX - containerRect.left - borderLeft;
    const screenY = clientY - containerRect.top - borderTop;

    return {
      x: mouseX * renderedRect.scale,
      y: mouseY * renderedRect.scale,
      w: activeImg.naturalWidth,
      h: activeImg.naturalHeight,
      scale: renderedRect.scale,
      screenX: screenX,
      screenY: screenY,
    };
  };

  const startInteraction = (e: React.MouseEvent, handle: string | null = null) => {
    // Block interaction if canvas is syncing (prevent race conditions)
    if (isSyncingRef.current) return;

    // Drag logic removed

    // BRUSH INTERACTION
    if (isBrushActive) {
      e.stopPropagation();
      e.preventDefault();

      const coords = getImgCoords(e.clientX, e.clientY);
      if (!coords) {
        isPaintingRef.current = false;
        return;
      }

      isPaintingRef.current = true;

      // Init Canvas if Needed
      if (!restorationCanvasRef.current) {
        const c = document.createElement('canvas');
        c.width = coords.w;
        c.height = coords.h;
        restorationCanvasRef.current = c;

        if (restorationLayer) {
          const ctx = c.getContext('2d');
          const prevImg = new Image();
          prevImg.onload = () => ctx?.drawImage(prevImg, 0, 0);
          prevImg.src = restorationLayer;
        }
      }

      // Init UI Canvas (Visual Feedback)
      if (uiCanvasRef.current && containerRef.current) {
        uiCanvasRef.current.width = containerRef.current.clientWidth;
        uiCanvasRef.current.height = containerRef.current.clientHeight;
        const uictx = uiCanvasRef.current.getContext('2d');
        uictx?.clearRect(0, 0, uiCanvasRef.current.width, uiCanvasRef.current.height);
      }

      lastPaintPos.current = { x: coords.x, y: coords.y };

      const uiX = coords.screenX;
      const uiY = coords.screenY;
      lastScreenPos.current = { x: uiX, y: uiY };

      const ctx = restorationCanvasRef.current.getContext('2d');
      if (ctx) {
        ctx.beginPath();
        const r = (brushSize * coords.scale) / 2;
        ctx.arc(coords.x, coords.y, r, 0, Math.PI * 2);
        ctx.fillStyle = 'white';
        ctx.fill();
      }

      const uictx = uiCanvasRef.current?.getContext('2d');
      if (uictx) {
        uictx.beginPath();
        const r = brushSize / 2;
        uictx.arc(uiX, uiY, r, 0, Math.PI * 2);
        uictx.fillStyle = 'white';
        uictx.fill();
      }
      return;
    }

    if (!isCropping || !containerRef.current) return;

    // CROP INTERACTION
    e.stopPropagation();
    e.preventDefault();

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (handle) {
      setActiveHandle(handle);
    } else {
      setActiveHandle(null);
      setCropStart({ x, y });
      setCropRect({ x, y, w: 0, h: 0 });
    }
  };

  const moveInteraction = (e: React.MouseEvent) => {
    if (!containerRef.current) return;

    // Panel Dragging Logic removed

    // BRUSH MOVE (AND CURSOR TRACKING)
    if (isBrushActive) {
      const coords = getImgCoords(e.clientX, e.clientY);

      // 1. Update Cursor (Always, if coords valid)
      if (coords) {
        // USE CALCULATED SCREEN COORDS (Fixes Alignment)
        const uiX = coords.screenX;
        const uiY = coords.screenY;

        setCursorPos({ x: uiX, y: uiY });

        // 2. Painting Logic (Only if dragging & canvas ready)
        if (restorationCanvasRef.current && isPaintingRef.current && lastPaintPos.current) {
          const ctx = restorationCanvasRef.current.getContext('2d');
          const uictx = uiCanvasRef.current?.getContext('2d');

          // Draw Logic (Image Space)
          if (ctx) {
            ctx.beginPath();
            ctx.strokeStyle = 'white';
            ctx.lineWidth = brushSize * coords.scale;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.moveTo(lastPaintPos.current.x, lastPaintPos.current.y);
            ctx.lineTo(coords.x, coords.y);
            ctx.stroke();
          }

          // Draw Visual (Screen Space)
          if (uictx && lastScreenPos.current) {
            uictx.beginPath();
            uictx.strokeStyle = 'white';
            uictx.lineWidth = brushSize;
            uictx.lineCap = 'round';
            uictx.lineJoin = 'round';
            uictx.moveTo(lastScreenPos.current.x, lastScreenPos.current.y);
            uictx.lineTo(uiX, uiY);
            uictx.stroke();
          }
          lastPaintPos.current = { x: coords.x, y: coords.y };
          lastScreenPos.current = { x: uiX, y: uiY };
        } else if (isPaintingRef.current) {
          lastPaintPos.current = { x: coords.x, y: coords.y };
          lastScreenPos.current = { x: uiX, y: uiY };
        }
      } else {
        setCursorPos(null);
        lastPaintPos.current = null;
        lastScreenPos.current = null;
      }
      return;
    }

    if (!isCropping) return;
    const rect = containerRef.current.getBoundingClientRect();
    const currX = e.clientX - rect.left;
    const currY = e.clientY - rect.top;

    if (activeHandle && cropRect) {
      const newRect = { ...cropRect };
      if (activeHandle.includes('e')) newRect.w = currX - cropRect.x;
      if (activeHandle.includes('s')) newRect.h = currY - cropRect.y;
      if (activeHandle.includes('w')) {
        const diff = cropRect.x - currX;
        newRect.x = currX;
        newRect.w = cropRect.w + diff;
      }
      if (activeHandle.includes('n')) {
        const diff = cropRect.y - currY;
        newRect.y = currY;
        newRect.h = cropRect.h + diff;
      }
      if (newRect.w < 0) { newRect.x += newRect.w; newRect.w = Math.abs(newRect.w); }
      if (newRect.h < 0) { newRect.y += newRect.h; newRect.h = Math.abs(newRect.h); }
      setCropRect(newRect);
    } else if (cropStart) {
      setCropRect({
        x: Math.min(currX, cropStart.x),
        y: Math.min(currY, cropStart.y),
        w: Math.abs(currX - cropStart.x),
        h: Math.abs(currY - cropStart.y)
      });
    }
  };

  const endInteraction = () => {
    // Panel Drag End removed

    // Commit Painting
    if (isPaintingRef.current && restorationCanvasRef.current) {
      const newSnapshot = restorationCanvasRef.current.toDataURL();
      setRestorationLayer(newSnapshot);

      // HISTORY PUSH
      // Use Ref to ensure we slice from the ACTUAL current pointer, not stale state
      const currentIndex = historyIndexRef.current;
      const currentHistory = historyRef.current; // Read from Ref

      const newHistory = currentHistory.slice(0, currentIndex + 1);
      newHistory.push(newSnapshot);
      if (newHistory.length > 20) newHistory.shift(); // Cap history to 20

      console.log("HISTORY PUSH:", { prevIndex: currentIndex, newLength: newHistory.length });

      // Update Refs (Source of Truth)
      historyRef.current = newHistory;
      const nextIndex = newHistory.length - 1;
      historyIndexRef.current = nextIndex;

      // Sync React State
      setHistory(newHistory);
      setHistoryIndex(nextIndex);

      // Clear Visual Layer
      if (uiCanvasRef.current) {
        const ctx = uiCanvasRef.current.getContext('2d');
        ctx?.clearRect(0, 0, uiCanvasRef.current.width, uiCanvasRef.current.height);
      }
    }

    isPaintingRef.current = false;
    lastPaintPos.current = null;
    lastScreenPos.current = null;

    setCropStart(null);
    setActiveHandle(null);
  };

  const handleMouseLeave = () => {
    endInteraction();
    setCursorPos(null);
  };

  const finalizeCrop = () => {
    if (!cropRect || !containerRef.current || cropRect.w < 10) return;
    const sourceElement = imgRef.current;
    if (!sourceElement) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const containerW = containerRect.width;
    const containerH = containerRect.height;

    const naturalW = sourceElement.naturalWidth;
    const naturalH = sourceElement.naturalHeight;

    // The <img> element fills the container (absolute inset-0 w-full h-full) but
    // object-contain renders the image in a smaller letterboxed area within it.
    // We must compute exactly where those pixels land, accounting for CSS padding.
    const style = window.getComputedStyle(sourceElement);
    const padLeft   = parseFloat(style.paddingLeft)   || 0;
    const padTop    = parseFloat(style.paddingTop)    || 0;
    const padRight  = parseFloat(style.paddingRight)  || 0;
    const padBottom = parseFloat(style.paddingBottom) || 0;

    const contentW = containerW - padLeft - padRight;
    const contentH = containerH - padTop  - padBottom;

    const imageAspect   = naturalW / naturalH;
    const contentAspect = contentW / contentH;

    let renderedW: number, renderedH: number;
    if (imageAspect >= contentAspect) {
      renderedW = contentW;
      renderedH = contentW / imageAspect;
    } else {
      renderedH = contentH;
      renderedW = contentH * imageAspect;
    }

    // Letterbox offsets: image is centered within the content area
    const imgLeft = padLeft + (contentW - renderedW) / 2;
    const imgTop  = padTop  + (contentH - renderedH) / 2;

    // Map crop rect (container-relative coords) → image pixel coords
    const scaleX = naturalW / renderedW;
    const scaleY = naturalH / renderedH;
    const sourceX = Math.floor((cropRect.x - imgLeft) * scaleX);
    const sourceY = Math.floor((cropRect.y - imgTop)  * scaleY);
    const sourceW = Math.max(1, Math.floor(cropRect.w * scaleX));
    const sourceH = Math.max(1, Math.floor(cropRect.h * scaleY));

    const safeSx = Math.max(0, sourceX);
    const safeSy = Math.max(0, sourceY);
    const safeDx = Math.max(0, -sourceX);
    const safeDy = Math.max(0, -sourceY);
    const safeW = Math.max(0, Math.min(naturalW - safeSx, sourceW - safeDx));
    const safeH = Math.max(0, Math.min(naturalH - safeSy, sourceH - safeDy));

    const canvas = document.createElement('canvas');
    canvas.width = sourceW;
    canvas.height = sourceH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    if (ctx) {
      ctx.drawImage(sourceElement, safeSx, safeSy, safeW, safeH, safeDx, safeDy, safeW, safeH);
      const tokenUrl = canvas.toDataURL('image/png');

      // Update Viewport with Cropped Image
      dispatch({ type: 'SET_LAST_CASTED_IMAGE', payload: tokenUrl });
      dispatch({ type: 'SET_LAST_CASTED_MASK', payload: null });
      setProcessedPreviewUrl(null);

      // Close Cropper
      setIsCropping(false);
      setCropRect(null);

      // Open Save Modal
      setShowSaveModal(true);
      dispatch({ type: 'ADD_LOG', payload: { message: "Crop applied. Select folder to save.", type: 'info' } });
    }
  };

  const getUiPositions = () => {
    if (!cropRect || !containerRef.current) return { tagsClass: '-top-8 left-1/2 -translate-x-1/2', toolClass: '-top-28' };
    void containerRef.current.clientHeight;
    // Move tags to the top-center of the crop rect to avoid the Recent Generations panel at the bottom
    const tagsClass = (cropRect.y < 40) ? 'top-2 left-1/2 -translate-x-1/2' : '-top-10 left-1/2 -translate-x-1/2';
    const toolClass = (cropRect.y < 130) ? 'top-2 right-2' : '-top-28 right-0';
    return { tagsClass, toolClass };
  };

  const { tagsClass } = getUiPositions();

  return (
    <div className="flex h-full gap-6 p-4">
      {/* 1. LEFT SIDEBAR: Source & Tools */}
      <div className="w-[400px] flex flex-col gap-4 h-full shrink-0 min-h-0 overflow-y-auto pr-1 pb-2">

        {/* Source Material */}
        <div className="bg-[#18181b] p-6 rounded-xl border border-gray-800 shrink-0">
          <div className="flex justify-between items-start mb-4 gap-2">
            <div className="min-w-0 flex-[1]">
              <h2 className="text-[15px] xl:text-base font-black text-white uppercase tracking-wide mb-1 truncate leading-tight">Character Generator</h2>
              <p className="text-[9px] xl:text-[10px] text-zinc-400 font-bold leading-tight">Create or refine an actor before staging.</p>
            </div>
            <button
              onClick={() => dispatch({ type: 'SET_LAST_CASTED_PROMPT', payload: '' })}
              className="text-[9.5px] text-gray-500 hover:text-white transition-colors flex items-center gap-1 uppercase font-bold shrink-0 pt-0.5"
              title="Clear Text"
            >
              <Eraser className="w-2.5 h-2.5" /> Clear
            </button>
          </div>
          <textarea
            ref={promptRef}
            className="w-full bg-[#09090b] border border-[#27272a] p-3 rounded-lg text-sm text-gray-200 focus:border-yellow-500 focus:outline-none transition-colors h-24 resize-none mb-4"
            placeholder="Describe your character..."
            value={state.lastCastedPrompt}
            onChange={(e) => dispatch({ type: 'SET_LAST_CASTED_PROMPT', payload: e.target.value })}
          />

          {/* STYLE SELECTOR */}
          <div className="mb-6 mt-1">
            <label className="text-[10px] text-yellow-500 block mb-3.5 uppercase font-black flex items-center gap-2 tracking-[0.15em]">
              <Sparkles className="w-3 h-3 text-yellow-500" /> Target Studio Style
            </label>
            <div className="grid grid-cols-2 gap-y-4 gap-x-2 px-1">
              {[
                { id: 'realism', label: 'Realism' },
                { id: 'anim', label: 'Stylized Cartoon' },
                { id: 'illustration', label: 'Illustration' },
                { id: 'scifi', label: 'Sci-Fi' }
              ].map(style => {
                const active = selectedStyleId === style.id;
                return (
                  <button
                    key={style.id}
                    onClick={() => setSelectedStyleId(style.id)}
                    className="flex items-center gap-2 group text-left"
                  >
                    <div className={`w-2 h-2 rounded-full transition-colors flex-shrink-0 ${active ? 'bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.5)]' : 'bg-[#27272a] group-hover:bg-[#3f3f46]'
                      }`} />
                    <span className={`text-[11.5px] font-black uppercase tracking-[0.06em] transition-colors ${active ? 'text-gray-300' : 'text-gray-500 group-hover:text-gray-300'
                      }`}>
                      {style.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-2">
            <HelpTooltip zone="cast" id="generateActorButton">
              <button
                onClick={handleGenerate}
                disabled={state.isProcessing}
                className={`flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black transition-all border uppercase tracking-[0.08em] active:scale-95 ${state.isProcessing
                    ? 'bg-[#27272a] text-gray-500 border-[#3f3f46] cursor-not-allowed'
                    : 'bg-[#18181b] text-white border-white/10 hover:bg-[#27272a] hover:border-white/20'
                  }`}
              >
                {state.isProcessing ? (
                  <RotateCw className="animate-spin w-4 h-4" />
                ) : state.lastCastedImage ? (
                  <RefreshCw className="w-4 h-4 opacity-70" />
                ) : (
                  <MonitorPlay className="w-4 h-4 opacity-70" />
                )}
                {state.lastCastedImage ? 'Stylize' : 'Generate'}
              </button>
            </HelpTooltip>
            <label className="flex items-center justify-center gap-2 bg-[#18181b] hover:bg-[#27272a] text-white py-3 rounded-xl text-[10px] font-black transition-all border border-white/10 hover:border-white/20 cursor-pointer uppercase tracking-[0.08em]">
              <Upload className="w-4 h-4 opacity-70" />
              Upload
              <input ref={mainUploadRef} type="file" className="hidden" accept="image/*" onClick={(e) => { (e.target as HTMLInputElement).value = ''; }} onChange={handleUpload} />
            </label>
          </div>
        </div>




        {/* Reference Sheet Generator */}
        <div className="bg-[#18181b] p-6 rounded-xl border border-gray-800 shrink-0">
          <h2 className="text-xs font-bold text-gray-600 uppercase tracking-normal mb-4 flex items-center gap-2">
            <LayoutTemplate className="w-3.5 h-3.5 opacity-50" /> Actor Reference Sheet
            <div className="group relative">
              <Info className="w-3.5 h-3.5 text-gray-400 hover:text-white cursor-help transition-colors" />
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-gray-900 border border-gray-700 rounded-lg text-[10px] text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                <strong className="text-white block mb-1">Production Note:</strong>
                High-Fidelity AI Synthesis: Identity & layout are strictly enforced, but minor variations may occur. Always review for production use.
              </div>
            </div>
          </h2>

          <div className="flex gap-2 mb-4">
            {REF_LAYOUT_OPTIONS.map((l) => (
              <button
                key={l.id}
                onClick={() => setRefLayout(l.id)}
                className={`flex-1 py-2 rounded text-[10px] font-bold uppercase transition-all border ${refLayout === l.id
                  ? 'bg-purple-900 border-purple-500 text-white -[0_0_10px_rgba(168,85,247,0.4)]'
                  : 'bg-black border-gray-700 text-gray-400 hover:border-gray-500'
                  }`}
              >
                {l.label}
              </button>
            ))}
          </div>

          <div className={`mb-4 rounded-xl border p-3 transition-all ${includeCalloutLabels ? 'border-purple-500/35 bg-purple-500/10' : 'border-white/5 bg-black/35'}`}>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={includeCalloutLabels}
                onChange={(e) => setIncludeCalloutLabels(e.target.checked)}
                className="sr-only"
              />
              <span
                className={`mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full border p-0.5 transition-all ${includeCalloutLabels
                  ? 'border-purple-400/70 bg-purple-500/80 shadow-[0_0_12px_rgba(168,85,247,0.35)]'
                  : 'border-white/10 bg-[#09090b]'
                  }`}
                aria-hidden="true"
              >
                <span
                  className={`h-3.5 w-3.5 rounded-full bg-white transition-transform ${includeCalloutLabels ? 'translate-x-4' : 'translate-x-0'}`}
                />
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-gray-200">
                  Add Callout Labels
                  <span className="group relative inline-flex">
                    <Info className="w-3.5 h-3.5 text-gray-500 group-hover:text-purple-300 transition-colors" />
                    <span className="absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 rounded-lg border border-gray-700 bg-gray-900 p-3 text-[10px] font-medium normal-case tracking-normal text-gray-300 opacity-0 shadow-xl transition-opacity pointer-events-none group-hover:opacity-100">
                      Callout labels are generated by AI and should describe only visible or user-provided details. Review labels before using the sheet professionally.
                    </span>
                  </span>
                </span>
                <span className="mt-1 block text-[10px] leading-relaxed text-gray-500">
                  Annotates visible hair, wardrobe, accessories, logo placement, and view angles.
                </span>
              </span>
            </label>
          </div>

          {/* BRANDING SECTION */}
          <div className="bg-black/40 border border-white/5 rounded-xl p-3 mb-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-3.5 h-3.5 text-[#eab308] fill-[#eab308]" />
              <h3 className="text-[10px] font-black uppercase tracking-widest text-[#eab308]">
                Branding & Identity
              </h3>
            </div>

            <div className="flex items-start gap-3">
              <label className="relative group cursor-pointer shrink-0">
                <div className="w-12 h-12 rounded-lg border-2 border-dashed border-white/10 group-hover:border-blue-500/50 flex flex-col items-center justify-center transition-all bg-black/20 overflow-hidden">
                  {brandingLogo ? (
                    <img src={brandingLogo} className="w-full h-full object-contain" alt="Branding Logo" />
                  ) : (
                    <Upload className="w-4 h-4 text-gray-500 group-hover:text-blue-400" />
                  )}
                </div>
                <input
                  type="file"
                  className="hidden"
                  accept="image/*"
                  onClick={(e) => { (e.target as HTMLInputElement).value = ''; }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (ev) => setBrandingLogo(ev.target?.result as string);
                      reader.readAsDataURL(file);
                    }
                  }}
                />
                {brandingLogo && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      setBrandingLogo(null);
                    }}
                    className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600 transition-colors"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
              </label>

              <div className="flex-grow space-y-1">
                <input
                  type="text"
                  value={logoPosition}
                  onChange={(e) => setLogoPosition(e.target.value)}
                  placeholder="Logo Placement (e.g. Chest)"
                  className="w-full bg-black/40 border border-white/10 rounded px-2 py-1.5 text-[10px] text-white placeholder:text-gray-600 focus:outline-none focus:border-blue-500/50 transition-all font-bold"
                />
              </div>
            </div>
          </div>

          <button
            onClick={handleGenerateRefSheet}
            disabled={state.isProcessing || !state.lastCastedImage}
            className={`w-full py-3 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all border ${state.lastCastedImage
              ? 'bg-gradient-to-r from-purple-900 to-indigo-900 hover:from-purple-800 hover:to-indigo-800 text-purple-200 border-purple-500/30'
              : 'bg-gray-800 text-gray-500 cursor-not-allowed border-gray-700'
              }`}
          >
            {state.isProcessing ? <RotateCw className="animate-spin w-4 h-4" /> : <LayoutTemplate className="w-4 h-4" />}
            Generate Reference Sheet
          </button>
        </div>

        {/* REF SHEET MODAL */}
        {showRefSheet && refSheetUrl && (
          <div className="fixed inset-0 z-[2000] bg-black/80 backdrop-blur-xl flex items-center justify-center p-8 animate-in fade-in duration-200">
            <div className="relative w-full max-w-6xl h-[90vh] flex flex-col items-center bg-[#18181b] rounded-2xl border border-white/10 overflow-hidden">
              <div className="flex justify-between items-center w-full p-6 border-b border-white/10 bg-[#09090b] flex-shrink-0">
                <h3 className="text-xl font-black text-white uppercase tracking-widest flex items-center gap-3">
                  <LayoutTemplate className="w-6 h-6 text-purple-400" /> Reference Sheet
                </h3>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setPendingRefSheet(refSheetUrl);
                      setShowSaveModal(true);
                      // REMOVED duplicate dispatch calls. Now handled via Save Modal.
                    }}
                    className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg font-bold uppercase tracking-widest text-[10px] transition-all border border-white/10 flex items-center gap-2"
                  >
                    <UserPlus className="w-4 h-4" /> Add to Library
                  </button>
                  <button
                    onClick={() => {
                      const a = document.createElement('a');
                      a.href = refSheetUrl;
                      a.download = createUniqueDownloadFilename('RefSheet.png');
                      a.click();
                      showToast("Download Started");
                    }}
                    className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg font-bold uppercase tracking-widest text-[10px] transition-all border border-white/10 flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" /> Download
                  </button>
                  <button
                    onClick={async () => {
                      if (state.saveDirectoryHandle) {
                        try {
                          const writableHandle = state.saveDirectoryHandle as PermissionRequestDirectoryHandle;
                          if (writableHandle.queryPermission && (await writableHandle.queryPermission({ mode: 'readwrite' })) !== 'granted') {
                            if (writableHandle.requestPermission && (await writableHandle.requestPermission({ mode: 'readwrite' })) !== 'granted') {
                              throw new Error("Permission denied");
                            }
                          }

                          const root = await state.saveDirectoryHandle.getDirectoryHandle('ReferenceSheets', { create: true });
                          const filename = createUniqueDownloadFilename('RefSheet.png');
                          const handle = await root.getFileHandle(filename, { create: true });
                          const writable = await handle.createWritable();
                          const res = await fetch(refSheetUrl);
                          const blob = await res.blob();
                          await writable.write(blob);
                          await writable.close();
                          showToast("Saved to ReferenceSheets/");
                        } catch {
                          showToast("Save failed. Downloading instead...");
                          // Fallback
                          const a = document.createElement('a');
                          a.href = refSheetUrl;
                          a.download = createUniqueDownloadFilename('RefSheet-Backup.png');
                          a.click();
                        }
                      } else {
                        showToast("No Save Folder. Downloading instead...");
                        const a = document.createElement('a');
                        a.href = refSheetUrl;
                        a.download = createUniqueDownloadFilename('RefSheet.png');
                        a.click();
                      }
                    }}
                    className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-2 rounded-lg font-bold uppercase tracking-widest text-[10px] transition-all flex items-center gap-2"
                  >
                    <Share2 className="w-4 h-4" /> Save Asset
                  </button>
                  <button
                    onClick={() => { setShowRefSheet(false); setRefSheetUrl(null); }}
                    className="bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white px-4 py-2 rounded-lg font-bold uppercase tracking-widest text-[10px] transition-all border border-red-500/20 flex items-center gap-2"
                  >
                    Close
                  </button>
                </div>
              </div>

              <div className="flex-1 w-full bg-black/50 overflow-hidden flex items-center justify-center relative p-4 min-h-0">
                <img src={refSheetUrl} className="max-w-full max-h-full object-contain " />
              </div>
            </div>
          </div>
        )}

        {/* CAST ASSETS (RESTORED) */}
        <div className="bg-[#18181b] p-6 rounded-xl border border-gray-800 flex flex-col shrink-0">
          <h2 className="text-sm font-bold text-gray-400 uppercase mb-4 tracking-wider flex justify-between items-center shrink-0">
            <span>Cast Assets</span>
            <div className="flex items-center gap-2">
              <span className="text-xs bg-gray-800 px-2 py-1 rounded text-gray-500">{state.cast.length} tokens</span>
              {state.cast.length > 0 && (
                <button
                  onClick={() => setDeleteTarget({ type: 'cast_all', payload: 'all', name: 'All Cast Assets' })}
                  className="bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white p-1 rounded-md transition-colors"
                  title="Delete All Cast Assets"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </h2>
          <div className="pb-2">
            <div className="grid grid-cols-3 gap-2">
              {state.cast.map(c => (
                <div
                  key={c.id}
                  className="aspect-square bg-black border border-gray-700 rounded-lg overflow-hidden relative group cursor-pointer hover:border-yellow-500 transition-colors"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'copy';
                    e.dataTransfer.setData('application/x-cast-id', c.id);
                  }}
                >
                  <img src={c.previewUrl || c.url} className="w-full h-full object-contain pointer-events-none" draggable={false} />
                  <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); dispatch({ type: 'SET_INSPECT_IMAGE', payload: c.previewUrl || c.url }); }}
                      className="bg-blue-500/80 hover:bg-blue-500 text-white p-1 rounded-full "
                      title="Inspect Large"
                    >
                      <Maximize className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget({ type: 'cast', payload: c.id, name: c.tag || 'Token' }); }}
                      className="bg-red-500/80 hover:bg-red-500 text-white p-1 rounded-full "
                      title="Delete Asset"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="absolute bottom-0 inset-x-0 bg-black/70 text-[9px] text-center text-gray-300 py-1 font-mono uppercase truncate px-1">
                    {c.tag}
                  </div>
                </div>
              ))}
              {state.cast.length === 0 && (
                <div className="col-span-3 text-center py-10 text-xs text-gray-600 italic">No tokens sliced yet.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 2. CENTER: Viewport */}
      <div className="flex-grow flex flex-col gap-6 overflow-hidden min-h-0">
        <div className="flex-grow bg-[#09090b] rounded-2xl border border-gray-800 flex flex-col overflow-hidden relative ">
          <div className="p-3 bg-[#18181b] border-b border-gray-800 flex justify-between items-center shrink-0">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse border border-green-400/50"></span>
              <span className="text-[10px] font-black uppercase tracking-widest text-[#a1a1aa]">Viewport: Active</span>
            </div>
            <div className="flex items-center gap-4">
              {state.lastCastedImage && (
                <div className="flex items-center gap-3 pr-4 border-r border-white/10">
                  <HelpTooltip zone="cast" id="addToLibraryButton">
                    <button
                      onClick={() => setShowSaveModal(true)}
                      className="bg-emerald-500/10 hover:bg-emerald-500 text-emerald-500 hover:text-white px-4 py-1.5 rounded-full text-[9px] font-black flex items-center gap-2 transition-all uppercase tracking-widest active:scale-95 border border-emerald-500/20"
                    >
                      <UserPlus className="w-4 h-4" /> Add to Library
                    </button>
                  </HelpTooltip>
                  <button
                    onClick={handleAddToCast}
                    className="bg-blue-500/10 hover:bg-blue-500 text-blue-400 hover:text-white px-4 py-1.5 rounded-full text-[9px] font-black flex items-center gap-2 transition-all uppercase tracking-widest active:scale-95 border border-blue-500/20"
                    title="Add to Session Cast"
                  >
                    <UserPlus className="w-4 h-4" /> Add to Cast
                  </button>
                  <button
                    onClick={handleClearForgeCanvas}
                    className="bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white px-3 py-1.5 rounded-full text-[9px] font-black flex items-center gap-2 transition-all uppercase tracking-widest active:scale-95 border border-red-500/20"
                    title="Clear Canvas"
                    aria-label="Clear canvas and return to Forge UI"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleDownload}
                    className="text-gray-500 hover:text-white transition-all transform hover:scale-110 active:scale-90"
                    title="Download PNG"
                  >
                    <Download className="w-3.5 h-3.5" strokeWidth={3} />
                  </button>
                </div>
              )}
              <button
                onClick={() => setIsCropping(!isCropping)}
                className={`text-[9px] px-4 py-1.5 rounded-full font-black flex items-center gap-2 transition-all uppercase tracking-widest active:scale-95 border ${isCropping
                  ? 'bg-blue-600 text-white border-blue-400 '
                  : 'bg-black/40 text-gray-500 border-white/5 hover:border-white/20 hover:text-gray-200'
                  }`}
              >
                <Scissors className="w-3.5 h-3.5" />
                Slicer {isCropping ? 'Active' : 'Idle'}
              </button>
            </div>
          </div>

          <div className="flex flex-row flex-grow overflow-hidden relative">
            <div
              ref={containerRef}
              className={`flex-grow relative bg-[#131313] flex items-center justify-center overflow-hidden select-none group border border-white/5 rounded-2xl m-2 shadow-inner ${isBrushActive ? 'cursor-none' : ''}`}
              style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)', backgroundSize: '32px 32px', backgroundPosition: 'center center' }}
              onMouseDown={(e) => startInteraction(e)}
              onMouseMove={moveInteraction}
              onMouseUp={endInteraction}
              onMouseLeave={handleMouseLeave}
            >
              {/* Visual Feedback Canvas layer */}
              <canvas ref={uiCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-40 opacity-50" />

              {isBrushActive && cursorPos && (
                <div
                  className="absolute pointer-events-none rounded-full border-2 border-white -[0_0_0_1px_rgba(0,0,0,0.5),inset_0_0_0_1px_rgba(0,0,0,0.5)] z-50 transition-none mix-blend-normal"
                  style={{
                    width: `${brushSize}px`,
                    height: `${brushSize}px`,
                    left: cursorPos.x,
                    top: cursorPos.y,
                    transform: 'translate(-50%, -50%)'
                  }}
                />
              )}
              {isIsolating && (
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-200">
                  <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mb-4 -[0_0_15px_rgba(59,130,246,0.5)]"></div>
                  <div className="w-48 h-1.5 bg-gray-800 rounded-full overflow-hidden border border-white/10">
                    <div
                      className="h-full bg-blue-500 transition-all duration-200 ease-out -[0_0_10px_rgba(59,130,246,0.8)]"
                      style={{ width: `${isolationProgress}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-black text-blue-400 mt-2 uppercase tracking-widest animate-pulse">
                    Processing {isolationProgress}%
                  </span>
                </div>
              )}

              {state.lastCastedImage ? (
                <>
                  <img
                    ref={imgRef}
                    src={state.lastCastedImage}
                    crossOrigin="anonymous"
                    className="absolute inset-0 w-full h-full object-contain pointer-events-none py-4 sm:py-8 px-1 sm:px-2"
                    style={{ filter: 'drop-shadow(0 0 2px rgba(255,255,255,0.25)) drop-shadow(0 8px 15px rgba(0,0,0,0.8)) drop-shadow(0 -8px 15px rgba(0,0,0,0.8))' }}
                  />

                  {/* RECENT GENERATIONS STRIP */}
                  <div className="absolute bottom-2 left-0 right-0 z-50 pointer-events-auto flex justify-center px-4">
                      <RecentGenerationsStrip
                          studio="general"
                          showSingle
                          className="w-full max-w-3xl bg-black/80 backdrop-blur-md rounded-2xl border border-white/10"
                          onSelectGeneration={(gen) => {
                              if (isRecentReferenceSheet(gen.prompt)) {
                                  setRefSheetUrl(gen.displayUrl);
                                  setShowRefSheet(true);
                              } else {
                                  dispatch({ type: 'SET_LAST_CASTED_IMAGE', payload: gen.displayUrl });
                              }
                          }}
                          onExportGeneration={(gen) => {
                              if (isRecentReferenceSheet(gen.prompt)) {
                                  setPendingRefSheet(gen.displayUrl);
                              } else {
                                  dispatch({ type: 'SET_LAST_CASTED_IMAGE', payload: gen.displayUrl });
                                  setPendingRefSheet(null);
                              }
                              setShowSaveModal(true);
                              useRecentGenerationsStore.getState().markExported(gen.id);
                          }}
                      />
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center p-2 w-full h-full max-w-4xl mx-auto animate-in fade-in duration-700 font-sans">
                  <div className="w-full max-w-[760px] bg-[#18181b]/45 border border-white/6 rounded-[32px] px-[clamp(1rem,3vw,2rem)] py-[clamp(1rem,2vh,1.5rem)] backdrop-blur-md relative overflow-hidden shadow-2xl min-h-0 flex flex-col justify-center">
                    {/* ambient */}
                    <div className="absolute inset-0 opacity-25 pointer-events-none">
                      <div className="absolute inset-0 bg-gradient-to-br from-blue-600/8 via-transparent to-purple-600/10" />
                      <img src={coverRealism} className="absolute -top-1/4 -right-1/4 w-1/2 opacity-30 blur-3xl" />
                      <img src={coverScifi} className="absolute -bottom-1/4 -left-1/4 w-1/2 opacity-30 blur-3xl" />
                    </div>

                    <div className="relative z-10 flex flex-col min-h-0">
                      {/* header */}
                      <div className="mb-[clamp(0.5rem,1.5vh,1rem)] shrink-0 flex flex-col items-center text-center">
                        <div className="text-[10px] font-black text-yellow-500 uppercase tracking-[0.28em] mb-1.5 flex items-center justify-center gap-1.5 w-full">
                          <Clapperboard className="w-3.5 h-3.5" />
                          <span>STYLE LAUNCH</span>
                          <Clapperboard className="w-3.5 h-3.5 invisible" />
                        </div>
                        <div className="flex items-center justify-center w-full max-w-lg mx-auto gap-3 sm:gap-5">
                          <div className="h-[2px] shrink w-8 sm:w-20 bg-gradient-to-r from-transparent to-white/30 rounded-full" />
                          <h2 className="text-[clamp(1.75rem,5vh,2.25rem)] font-black italic tracking-[-0.06em] uppercase leading-[0.9] text-white shrink-0">
                            FORGE YOUR <span className="text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-500">CAST</span>
                          </h2>
                          <div className="h-[2px] shrink w-8 sm:w-20 bg-gradient-to-l from-transparent to-white/30 rounded-full" />
                        </div>
                        <p className="mt-2 text-[10px] sm:text-xs font-black text-gray-400 uppercase tracking-[0.16em]">
                          Choose a visual language, then define the character.
                        </p>
                      </div>

                      {/* cards */}
                      <div className="grid grid-cols-2 gap-[clamp(0.5rem,1.5vh,1rem)] mb-[clamp(0.5rem,1.5vh,1rem)] shrink-0">
                        {[
                          { id: 'realism', label: 'Realism', desc: 'Photorealistic portraits & grounded detail', img: coverRealism },
                          { id: 'anim', label: 'Stylized Cartoon', desc: 'Modern 3D animation & soft cinematic appeal', img: coverAnim },
                          { id: 'illustration', label: 'Illustration', desc: 'Anime, noir, graphic art & expressive rendering', img: coverIllustration },
                          { id: 'scifi', label: 'Sci-Fi', desc: 'Cyberpunk, futuristic identities & high-tech worlds', img: coverScifi }
                        ].map((style) => {
                          const active = selectedStyleId === style.id;
                          return (
                            <button
                              key={style.id}
                              type="button"
                              onClick={() => setSelectedStyleId(style.id)}
                              className={`relative h-[clamp(4.5rem,12vh,8.5rem)] rounded-2xl overflow-hidden border transition-all duration-300 text-left group/card ${active
                                  ? 'border-yellow-400 scale-[1.02] shadow-[0_0_30px_rgba(234,179,8,0.32)]'
                                  : 'border-white/8 opacity-70 hover:opacity-100 hover:border-white/20'
                                }`}
                            >
                              <img
                                src={style.img}
                                className={`absolute inset-0 w-full h-full object-cover transition-all duration-500 group-hover/card:scale-105 ${active ? 'opacity-100' : 'opacity-78'
                                  }`}
                              />
                              <div className={`absolute inset-0 transition-all duration-300 ${active
                                  ? 'bg-gradient-to-t from-black/70 via-black/15 to-transparent'
                                  : 'bg-gradient-to-t from-black/82 via-black/38 to-black/12'
                                }`} />

                              <div className="absolute inset-x-0 bottom-0 p-[clamp(0.5rem,1.5vh,1rem)]">
                                <div className={`text-[clamp(10px,2vh,14px)] font-black uppercase tracking-[0.08em] leading-none ${active ? 'text-yellow-400' : 'text-white'
                                  }`}>
                                  {style.label}
                                </div>
                                <div className="mt-1 text-[8px] font-bold uppercase tracking-[0.08em] text-gray-300 leading-tight opacity-90 hidden sm:block">
                                  {style.desc}
                                </div>
                              </div>

                              {active && (
                                <div className="absolute top-2 right-2 bg-yellow-400 text-black px-2 py-0.5 rounded-md text-[8px] sm:text-[9px] font-black uppercase tracking-[0.18em] shadow-[0_0_14px_rgba(234,179,8,0.45)]">
                                  Active
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {/* prompt */}
                      <div className="mb-[clamp(0.5rem,1.5vh,1rem)] shrink min-h-0 flex flex-col">
                        <div className="flex items-center gap-2 mb-1.5">
                          <Type className="w-4 h-4 text-blue-400" />
                          <label className="text-[10px] sm:text-xs font-black text-white uppercase tracking-[0.2em]">
                            CHARACTER VISION
                          </label>
                        </div>

                        <div className="text-[8px] sm:text-[9px] text-gray-400 font-bold uppercase tracking-[0.08em] mb-2 min-h-[14px]">
                          {selectedStyleMeta?.helper || 'Select a style to see specific prompt guidance.'}
                        </div>

                        <div className="relative group/prompt">
                          <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500/30 to-purple-500/30 rounded-2xl blur opacity-25 group-focus-within/prompt:opacity-50 transition-opacity duration-300" />
                          <textarea
                            className="relative w-full bg-[#09090b]/92 border border-white/10 rounded-2xl p-[clamp(0.75rem,1.5vh,1rem)] text-sm text-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-all duration-300 h-[clamp(3.5rem,10vh,5.5rem)] resize-none shadow-inner pointer-events-auto"
                            placeholder="Describe the character you want to create... appearance, mood, wardrobe, world, or role."
                            value={state.lastCastedPrompt}
                            onChange={(e) => dispatch({ type: 'SET_LAST_CASTED_PROMPT', payload: e.target.value })}
                          />
                        </div>
                      </div>

                      {/* ctas */}
                      <div className="flex items-center gap-3 w-full shrink-0">
                        <button
                          onClick={handleGenerate}
                          disabled={state.isProcessing}
                          className={`relative group flex-[2] py-3 rounded-2xl font-black uppercase text-[10px] tracking-[0.16em] transition-all flex items-center justify-center gap-2 border overflow-hidden shrink-0 active:scale-[0.98] ${state.isProcessing
                              ? 'bg-[#27272a] text-gray-500 border-[#3f3f46] cursor-not-allowed'
                              : 'bg-[#09090b] hover:bg-black border-white/10 hover:border-purple-500/50'
                            }`}
                        >
                          {!state.isProcessing && <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-pink-500/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>}
                          {state.isProcessing ? (
                            <RotateCw className="w-3.5 h-3.5 animate-spin relative text-gray-400" />
                          ) : (
                            <MonitorPlay className="w-3.5 h-3.5 text-cyan-400 group-hover:text-cyan-300 relative" />
                          )}
                          <span className={`relative transition-colors duration-300 ${state.isProcessing
                              ? 'text-gray-400'
                              : 'text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 group-hover:from-cyan-300 group-hover:via-purple-300 group-hover:to-pink-300'
                            }`}>
                            GENERATE CHARACTER
                          </span>
                        </button>

                        <button
                          onClick={() => mainUploadRef.current?.click()}
                          className="flex-1 py-3 rounded-2xl bg-[#18181b] text-white font-black uppercase text-[10px] tracking-[0.16em] transition-all hover:bg-[#27272a] border border-white/10 hover:border-white/20 active:scale-[0.98] flex items-center justify-center gap-2 shrink-0"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          Upload Ref
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Floating Panel Removed - Moving to Sidebar */}

              {isCropping && cropRect && (
                <div
                  className="absolute border-2 border-yellow-500 bg-yellow-500/20 pointer-events-none"
                  style={{ left: cropRect.x, top: cropRect.y, width: cropRect.w, height: cropRect.h }}
                >
                  <div onMouseDown={(e) => startInteraction(e, 'nw')} className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border border-black cursor-nwse-resize pointer-events-auto z-50"></div>
                  <div onMouseDown={(e) => startInteraction(e, 'ne')} className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border border-black cursor-nesw-resize pointer-events-auto z-50"></div>
                  <div onMouseDown={(e) => startInteraction(e, 'sw')} className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border border-black cursor-nesw-resize pointer-events-auto z-50"></div>
                  <div onMouseDown={(e) => startInteraction(e, 'se')} className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border border-black cursor-nwse-resize pointer-events-auto z-50"></div>

                  {cropRect.w > 20 && (
                    <div className={`absolute flex gap-1 pointer-events-auto z-40 ${tagsClass}`}>
                      {(['front', 'side', '3/4', 'back'] as const).map((tag) => (
                        <button key={tag} onMouseDown={(e) => { e.stopPropagation(); finalizeCrop(); }} className="bg-[#18181b] text-white text-[10px] !px-3 !py-1.5 !min-w-0 !min-h-0 !w-auto !h-auto rounded-md border border-gray-600 hover:bg-yellow-500 hover:text-white uppercase font-bold transition-colors">
                          {tag}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

          </div>
        </div>
      </div>

      {/* SAVE MODAL (Universal) */}
      <ActorSaveModal
        isOpen={showSaveModal}
        initialName={`Actor ${state.actorLibrary.length + 1}`}
        onClose={() => setShowSaveModal(false)}
        title="Save to Actor Library"
        description="Select a Studio Folder to organize this actor:"
        onSave={(name, category) => {
          handleSaveToActorLibrary(category, name);
          setShowSaveModal(false);
        }}
      />

      {/* 3. RIGHT SIDEBAR: Actor Library */}
      <div className="w-96 border-l border-gray-800 bg-[#18181b] flex flex-col shrink-0">
        <div className="p-4 border-b border-gray-800 flex justify-between items-center h-16 bg-black/20">
          <h2 className="text-sm font-black text-white tracking-widest uppercase flex items-center gap-3">
            <UserPlus className="w-4 h-4 text-blue-400" /> Actor Library
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => withLibraryTransition(() => loadDiskCovers(true))}
              title="Reload Custom Assets (Fixes Missing Covers)"
              className="p-1 rounded-full hover:bg-white/10 text-gray-500 hover:text-white transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
            <button
              onClick={() => {
                dispatch({ type: 'SET_HELP_SECTION', payload: 'tab' });
                dispatch({ type: 'TOGGLE_HELP', payload: true });
              }}
              title="Casting Help"
              className="p-1 rounded-full hover:bg-yellow-500/10 text-gray-500 hover:text-yellow-500 transition-colors"
            >
              <HelpCircle className="w-3.5 h-3.5" />
            </button>
            <div className="text-[10px] bg-blue-500/20 px-2 py-0.5 rounded border border-blue-500/30 text-blue-400 font-mono font-bold">{state.actorLibrary.length}</div>
          </div>
        </div>

        <div className="flex-grow overflow-y-scroll flex flex-col scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent">

          <div className="sticky top-0 z-20 bg-[#18181b]/95 backdrop-blur-md px-4 pt-4 pb-2 border-b border-white/5 space-y-4">
            {activeFolder && (
              <div className="flex items-center gap-3 h-[34px]">
                <button
                  onClick={() => withLibraryTransition(() => setActiveFolder(null))}
                  className="flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 text-xs font-bold text-gray-300 hover:text-white transition-all uppercase tracking-wider"
                >
                  <ArrowDownUp className="w-3 h-3 rotate-90" /> Studios
                </button>
                <div className="h-6 w-[1px] bg-white/10" />
                <h3 className="text-xs font-black text-white uppercase tracking-widest text-yellow-500">
                  {STUDIO_FOLDERS.find(f => f.id === activeFolder)?.label}
                </h3>
              </div>
            )}

            {/* SEARCH & SORT (Only show inside a folder) */}
            {activeFolder && (
              <div className="flex items-center gap-2">
                {/* Keep existing search UI */}
                <div className="relative flex-1 group">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-yellow-500 transition-colors" />
                  <input
                    type="text"
                    placeholder="Search actors..."
                    value={librarySearch}
                    onChange={(e) => setLibrarySearch(e.target.value)}
                    className="w-full bg-black/40 border border-[#27272a] rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder:text-gray-600 focus:border-yellow-500/50 focus:outline-none transition-all"
                  />
                </div>
                {/* SORT BUTTON */}
                <div className="relative">
                  <button
                    onClick={() => setShowSortMenu(!showSortMenu)}
                    className={`h-9 px-3 flex items-center justify-center gap-2 rounded-lg border transition-all ${sortOption !== 'date' ? 'bg-yellow-500/10 border-yellow-500 text-yellow-500' : 'bg-purple-600 border-purple-500 text-white hover:bg-purple-500'}`}
                  >
                    {sortOption === 'date' && <Calendar className="w-4 h-4" />}
                    {sortOption === 'name' && <Type className="w-4 h-4" />}
                    {sortOption === 'type' && <Layers className="w-4 h-4" />}
                    <span className="text-[10px] font-bold">SORT</span>
                  </button>
                  {showSortMenu && (
                    <div className="absolute right-0 top-full mt-2 w-32 bg-[#18181b] border border-[#27272a] rounded-xl z-50 overflow-hidden animate-in fade-in zoom-in duration-200">
                      <button onClick={() => { setSortOption('date'); setShowSortMenu(false); }} className="w-full text-left px-3 py-2 text-[10px] font-bold uppercase flex items-center gap-2 hover:bg-white/5 text-gray-400"><Calendar className="w-3 h-3" /> Date</button>
                      <button onClick={() => { setSortOption('name'); setShowSortMenu(false); }} className="w-full text-left px-3 py-2 text-[10px] font-bold uppercase flex items-center gap-2 hover:bg-white/5 text-gray-400"><Type className="w-3 h-3" /> Name</button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>



          {/* CONTENT PADDING WRAPPER */}
          <div className={`p-4 pt-2 transition-opacity duration-200 ${libraryViewLoading ? 'opacity-80' : 'opacity-100'}`}>

            {/* NATIVE MODE: MISSING CONFIG WARNING */}
            {isNativeParams() && !state.saveDirectoryPath && (
              <div className="mb-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 flex items-center gap-4">
                <div className="p-2 bg-yellow-500/20 rounded-lg text-yellow-500">
                  <LayoutTemplate className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-yellow-500 text-sm">Save Folder Not Configured</h3>
                  <p className="text-[11px] text-yellow-200/70">
                    To use Custom Covers in the Desktop App, you must select your project folder in Settings.
                    (Browser settings do not sync to Desktop automatically)
                  </p>
                </div>
                <button
                  onClick={() => dispatch({ type: 'SET_VIEW', payload: 'settings' })}
                  className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-black font-bold text-xs rounded-lg transition-colors"
                >
                  Configure
                </button>
              </div>
            )}

            {/* RESUME SESSION BANNER (Mobile/Desktop friendly) */}
            {needsPermission && (
              <div className="mb-6 p-4 rounded-xl border border-yellow-500/30 bg-yellow-500/10 flex items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-yellow-500/20 text-yellow-500">
                    <Lock className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white uppercase tracking-wider">File Access Needed</h4>
                    <p className="text-xs text-gray-400">Unlock your session to view custom covers.</p>
                  </div>
                </div>
                <button
                  onClick={() => loadDiskCovers(true)}
                  className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-black font-black uppercase text-xs rounded-lg tracking-widest transition-all "
                >
                  Resume
                </button>
              </div>
            )}

            {!activeFolder ? (
              libraryViewLoading ? (
                <div className="flex flex-col gap-4 pb-20">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <LibraryStudioSkeleton key={`studio-skeleton-${i}`} />
                  ))}
                </div>
              ) : (
              // ROOT VIEW: HERO STUDIO CARDS
              <div className="flex flex-col gap-4 pb-20">
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onClick={(e) => { (e.target as HTMLInputElement).value = ''; }} onChange={handleCoverUpload} />

                {STUDIO_FOLDERS.map(folder => {
                  const count = state.actorLibrary.filter(a => {
                    const s = normalizeStyle(a.profile?.style);
                    if (folder.id === 'uncategorized') {
                      return !s || !knownStyles.has(s);
                    }
                    // Robust Category Count
                    const targetStyles = new Set(folder.styles.map(ts => normalizeStyle(ts)));
                    return targetStyles.has(s);
                  }).length;

                  const activeImage = state.customCovers[folder.id] || folder.image;

                  return (
                    <div key={folder.id} className="group relative h-48 w-full rounded-3xl overflow-hidden border border-white/10 transition-all hover:scale-[1.02] hover:border-white/30 cursor-pointer" onClick={() => withLibraryTransition(() => setActiveFolder(folder.id))}>
                      {/* Background Image */}
                      {activeImage ? (
                        <img src={activeImage} className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                      ) : (
                        <div className="absolute inset-0 bg-gradient-to-br from-gray-800 to-black flex items-center justify-center">
                          <HelpCircle className="w-12 h-12 text-white/20" />
                        </div>
                      )}

                      {/* Cinematic Overlay */}
                      <div className="absolute inset-0 bg-gradient-to-r from-black/50 via-black/20 to-transparent flex flex-col justify-end px-6 pb-4 pt-6">
                        <div>
                          <h3 className="text-lg font-black text-white italic tracking-tighter uppercase group-hover:text-yellow-500 transition-colors leading-none">
                            {folder.label}
                          </h3>
                          <div className="flex items-center gap-3 mt-2">
                            <p className="text-xs font-bold text-gray-300 border-l-2 border-yellow-500 pl-2">
                              {folder.description}
                            </p>
                            <span className="bg-white/10 backdrop-blur text-gray-300 text-[10px] font-bold px-2 py-0.5 rounded-sm border border-white/10">
                              {count} ACTORS
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Edit Hotspot (Corner Only) */}
                      <div className="absolute top-0 right-0 p-4 opacity-0 hover:opacity-100 transition-opacity duration-300 z-50">
                        <button
                          onClick={(e) => triggerCoverEdit(folder.id, e)}
                          className="w-auto h-8 px-3 rounded-full bg-black/80 border border-white/20 flex items-center gap-2 transition-all hover:bg-zinc-900 hover:border-yellow-500 group/btn"
                          title="Change Cover Image"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-white group-hover/btn:text-yellow-500 transition-colors" />
                          <span className="text-[10px] font-bold text-white group-hover/btn:text-yellow-500 uppercase tracking-wider transition-colors">Edit</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              )
            ) : (
              // FOLDER VIEW: GRID
              <div className="grid grid-cols-2 gap-4 pb-20">
                {libraryViewLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <LibraryActorSkeleton key={`actor-skeleton-${i}`} />
                  ))
                ) : (
                  <>
                    {filteredLibrary.map(actor => {
                      const safeDisplayUrl = actor.previewUrl || actor.url || '';

                  return (
                    <div key={actor.id} className="group relative aspect-square rounded-xl overflow-hidden bg-black/40 border border-[#27272a] hover:border-yellow-500/50 transition-all hover:">
                      {safeDisplayUrl ? (
                        <img
                          src={safeDisplayUrl}
                          className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500"
                        />
                      ) : (
                        <div className="w-full h-full bg-black/60 animate-pulse" />
                      )}
                      {/* Overlay Actions */}
                      <div className="absolute inset-0 bg-black/80 opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col items-center justify-center gap-2 backdrop-blur-md">
                        {/* Top Row: 3 Actions */}
                        <div className="flex gap-2">
                          <HelpTooltip zone="cast" id="sendToDirectorButton">
                            <button
                              onClick={() => {
                                dispatch({ type: 'SET_LAST_CASTED_IMAGE', payload: safeDisplayUrl });
                                dispatch({ type: 'SET_LAST_CASTED_PROMPT', payload: actor.profile?.identity || "" });
                                dispatch({ type: 'SET_LAST_CASTED_MASK', payload: null });
                                setProcessedPreviewUrl(null);
                                dispatch({ type: 'ADD_LOG', payload: { message: `Loaded ${actor.name} into Viewport`, type: 'info' } });
                              }}
                              className="bg-[#27272a] hover:bg-orange-600 w-8 h-8 rounded-lg border border-white/10 hover:border-orange-400/50 transition-all hover:scale-110 flex items-center justify-center group/btn backdrop-blur-sm"
                              title="Load to Forge / Turnaround"
                            >
                              <Hammer className="w-4 h-4 text-white shrink-0 transition-transform group-hover/btn:scale-110" strokeWidth={2.5} />
                            </button>
                          </HelpTooltip>
                          <InlineHint zone="cast" id="sendToDirectorButton" className="hidden" />
                          <button
                            onClick={() => dispatch({ type: 'SET_INSPECT_IMAGE', payload: safeDisplayUrl })}
                            className="bg-[#27272a] hover:bg-blue-600 w-8 h-8 rounded-lg border border-white/10 hover:border-blue-400/50 transition-all hover:scale-110 flex items-center justify-center group/btn backdrop-blur-sm"
                            title="Inspect Large"
                          >
                            <Maximize className="w-4 h-4 text-white shrink-0 transition-transform group-hover/btn:scale-110" strokeWidth={2.5} />
                          </button>
                          <button
                            onClick={() => {
                              dispatch({
                                type: 'ADD_CAST',
                                payload: {
                                  ...actor,
                                  id: `ref-${Date.now()}-${Math.random()}`,
                                  name: `${actor.name} (Ref)`,
                                  url: safeDisplayUrl,
                                  previewUrl: safeDisplayUrl,
                                  sourceUrl: actor.sourceUrl || actor.url
                                }
                              });
                            }}
                            className="bg-[#27272a] hover:bg-emerald-600 w-8 h-8 rounded-lg border border-white/10 hover:border-emerald-400/50 transition-all hover:scale-110 flex items-center justify-center group/btn backdrop-blur-sm"
                            title="Add to Cast"
                          >
                            <UserPlus className="w-4 h-4 text-white shrink-0 transition-transform group-hover/btn:scale-110" strokeWidth={2.5} />
                          </button>
                        </div>
                        {/* Bottom Row: 2 Actions (Centered) */}
                        <div className="flex gap-2">
                          <button
                            onClick={() => setOrganizeTarget({ id: actor.id, name: actor.name })}
                            className="bg-[#27272a] hover:bg-purple-600 w-8 h-8 rounded-lg border border-white/10 hover:border-purple-400/50 transition-all hover:scale-110 flex items-center justify-center group/btn backdrop-blur-sm"
                            title="Move to Studio Folder"
                          >
                            <FolderInput className="w-4 h-4 text-white shrink-0 transition-transform group-hover/btn:scale-110" strokeWidth={2.5} />
                          </button>
                          <button
                            onClick={() => setDeleteTarget({ type: 'library', payload: actor.id, name: actor.name })}
                            className="bg-[#27272a] hover:bg-red-600 w-8 h-8 rounded-lg border border-white/10 hover:border-red-400/50 transition-all hover:scale-110 flex items-center justify-center group/btn backdrop-blur-sm"
                            title="Remove from Library"
                          >
                            <Trash2 className="w-4 h-4 text-white shrink-0 transition-transform group-hover/btn:scale-110" strokeWidth={2.5} />
                          </button>
                        </div>
                        <span className="text-[9px] font-black uppercase tracking-widest text-white/60 mt-3 pointer-events-none">Add to Stage</span>
                      </div>
                      {/* Centered Editable Label */}
                      <div className="absolute bottom-0 inset-x-0 bg-black/60 backdrop-blur-md border-t border-white/5 p-1.5 flex justify-center items-center">
                        <HelpTooltip zone="cast" id="actorNameDisplay">
                          <input
                            className="bg-transparent text-[10px] font-black uppercase text-center text-white/70 hover:text-white focus:text-white focus:outline-none w-full tracking-wider transition-colors"
                            value={editingActorName?.id === actor.id ? editingActorName.name : actor.name}
                            onChange={(e) => setEditingActorName({ id: actor.id, name: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.currentTarget.blur();
                              }
                            }}
                            onBlur={() => {
                              if (editingActorName?.id === actor.id) {
                                handleActorDiskOperation(actor.id, { newName: editingActorName.name });
                                setEditingActorName(null);
                              }
                            }}
                            onFocus={(e) => {
                              setEditingActorName({ id: actor.id, name: actor.name });
                              e.target.select();
                            }}
                            title="Click to Rename Actor"
                          />
                        </HelpTooltip>
                      </div>
                    </div>
                  )
                })}
                {filteredLibrary.length === 0 && (
                  <div className="col-span-2 py-10 flex flex-col items-center justify-center text-gray-600 gap-2 border border-dashed border-gray-800 rounded-xl">
                    <Folder className="w-8 h-8 opacity-20" />
                    <p className="text-xs uppercase font-bold tracking-widest">Empty Studio</p>
                  </div>
                )}
                </>
              )}
              </div>
            )}
          </div>

          {state.actorLibrary.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 opacity-20 filter grayscale">
              <UserPlus className="w-12 h-12 mb-3 text-gray-500" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-center text-gray-500">Library Empty</span>
            </div>
          )}
        </div>
      </div>

      {/* TOAST OVERLAY */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.8 }}
            transition={{ type: "spring", damping: 15, stiffness: 300 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[5000] bg-gradient-to-br from-zinc-800 to-zinc-900 border border-zinc-700 text-white px-5 py-3 rounded-full flex items-center gap-3"
          >
            <CheckCircle2 className="w-5 h-5 text-green-500" />
            <span className="text-xs font-bold uppercase tracking-widest">{notification}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* DELETE CONFIRMATION MODAL */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={executeDelete}
        title="Delete Asset?"
        message={
          <>
            Are you sure you want to delete <span className="text-white font-bold">{deleteTarget?.name}</span>?
            {deleteTarget?.type === 'library' && " This will permanently remove it from your global actors."}
          </>
        }
        confirmText="Confirm"
        cancelText="Cancel"
        variant="danger"
      />

      <AnimatePresence>

        {/* ORGANIZATION MODAL */}
        {
          organizeTarget && (
            <div className="fixed inset-0 z-[2000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
              <div className="bg-[#18181b] p-6 rounded-2xl border border-gray-800 max-w-md w-full relative overflow-hidden">
                <h3 className="text-lg font-black text-white uppercase tracking-widest mb-2 flex items-center gap-2">
                  <FolderInput className="w-5 h-5 text-purple-500" /> Move Actor
                </h3>
                <p className="text-xs text-gray-400 mb-4">
                  Select a Studio for <span className="text-white font-bold">{organizeTarget.name}</span>. This will update its style tag.
                </p>

                <div className="grid grid-cols-1 gap-2 mb-4">
                  {STUDIO_FOLDERS.filter(f => f.id !== 'uncategorized').map(folder => {
                    const activeImage = state.customCovers[folder.id] || folder.image;
                    return (
                      <div
                        key={folder.id}
                        onClick={() => {
                          handleActorDiskOperation(organizeTarget.id, { newFolderId: folder.id });
                          setOrganizeTarget(null);
                        }}
                        className="group relative h-24 w-full rounded-xl overflow-hidden border border-white/10 transition-all hover:scale-[1.02] hover:border-purple-500 cursor-pointer mb-2"
                      >
                        {/* Background Image */}
                        {activeImage ? (
                          <img src={activeImage} className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 opacity-60 group-hover:opacity-100" />
                        ) : (
                          <div className="absolute inset-0 bg-gradient-to-br from-gray-800 to-black flex items-center justify-center">
                            <HelpCircle className="w-8 h-8 text-white/20" />
                          </div>
                        )}

                        {/* Cinematic Overlay */}
                        <div className="absolute inset-0 bg-gradient-to-r from-black/50 via-black/20 to-transparent flex flex-col justify-center px-6">
                          <div>
                            <h3 className="text-xl font-black text-white italic tracking-tighter uppercase group-hover:text-purple-400 transition-colors leading-none">
                              {folder.label}
                            </h3>
                            <div className="flex items-center gap-2 mt-1">
                              <p className="text-[10px] font-bold text-gray-300 border-l-2 border-purple-500 pl-2">
                                {folder.description}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={() => setOrganizeTarget(null)}
                    className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )
        }
      </AnimatePresence>
    </div>
  );
};

export default CastingForge;



