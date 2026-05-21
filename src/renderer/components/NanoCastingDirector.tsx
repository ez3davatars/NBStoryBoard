import { useState, useRef, useEffect, useCallback, type DragEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Webcam from 'react-webcam';
import { FaceMesh } from '@mediapipe/face_mesh';
import { Camera } from '@mediapipe/camera_utils';
import {
    Scan, Target, User, Layers, Share2,
    ChevronRight, RefreshCw, Cpu, Aperture, CheckCircle2, UserPlus, Upload, Sliders,
    Swords, Zap, Shield, Ghost, Camera as CameraIcon, Ban, RotateCcw,
    EyeOff, Shirt, Sparkles, LayoutTemplate, Download, X, ChevronDown, Pencil,
    Trash2, Maximize, RefreshCcw, FolderPlus, AlertTriangle
} from 'lucide-react';
import { nativeJoinPath, nativeListFiles, nativeReadFile } from '../utils/NativeFileAssets';
import { nativeSelectFolder } from '../utils/NativeFileAssets';
import type { CastMember, NanoCastSessionDirectorControls, PendingPitchSheetHandoff, PendingRefSheetHandoff, WardrobeItem } from '../context/AppContext';
import { useAppContext } from '../context/AppContext';
import { GeminiService } from '../services/GeminiService';
import { ensureAuthenticatedForGeneration } from '../services/AuthGenerationGate';
import { resolveDisplayUrl } from '../utils/assetUrlResolver';
import { LibraryAssetMaterializer } from '../services/LibraryAssetMaterializer';
import { createUniqueDownloadFilename } from '../utils/downloadFilenames';
import HelpTooltip from './ui/HelpTooltip';
import InlineHint from './ui/InlineHint';
import ConfirmDialog from './ui/ConfirmDialog';
import {
    PROMPT_PRIORITY_ORDER_BLOCK,
    PROMPT_PRIORITY_ORDER_LABEL,
    buildAuthoritativeIdentityContract,
    createBiometricIdentityLock,
    buildStrictBiometricIdentityContract
} from '../../prompts/identityContracts';
import { buildHeadshotWardrobeContinuityContract, buildHeadshotWardrobeNegativeTokens } from '../../prompts/headshotWardrobeContinuity';
import { buildNanoCastStyleIdentityEnforcementContract, buildNanoCastStyleIdentityNegativePrompt } from '../../prompts/nanoCastStyleIdentityEnforcement';
import { buildPoseCoherenceNegativeTokens, buildTurnaroundPoseCoherenceContract } from '../../prompts/poseCoherence';
import { SHEET_STYLE_LOCK_NEGATIVE_TEXT, buildSheetStyleLockContract } from '../../prompts/sheetStyleLock';
import { buildStyleCategoryContract, buildStyleNegativePrompt } from '../../prompts/styleContracts';
import { buildLockedRegenerationContract, type CharacterGenerationMode, type RegenerationTarget } from '../../prompts/lockedRegeneration';

import BodyScopeSelector from './BodyScopeSelector';
import type { BodyScope } from './BodyScopeSelector';
import { buildNanoCastPrompt } from '../nanocast/nanoPromptBuilder';
import { validateNanoBlueprint } from '../nanocast/nanoValidation';
import type { NanoActorBlueprint, NanoMorphologyKey } from '../nanocast/nanoTypes';

import titanMasc from '../assets/archetypes/titan_masc.png';
import scoutMasc from '../assets/archetypes/scout_masc.png';
import guardianMasc from '../assets/archetypes/guardian_masc.png';
import spriteMasc from '../assets/archetypes/sprite_masc.png';

// Import Fem Images
import titanFem from '../assets/archetypes/titan_fem.png';
import scoutFem from '../assets/archetypes/scout_fem.png';
import guardianFem from '../assets/archetypes/guardian_fem.png';
import spriteFem from '../assets/archetypes/sprite_fem.png';

// Import Youth Images
import titanYouth from '../assets/archetypes/titan_youth.png';
import scoutYouth from '../assets/archetypes/scout_youth.png';
import guardianYouth from '../assets/archetypes/guardian_youth.png';
import spriteYouth from '../assets/archetypes/sprite_youth.png';

// Import Archetype Images (Youth - Fem)
import titanYouthFem from '../assets/archetypes/titan_youth_fem.png';
import scoutYouthFem from '../assets/archetypes/scout_youth_fem.png';
import guardianYouthFem from '../assets/archetypes/guardian_youth_fem.png';
import spriteYouthFem from '../assets/archetypes/sprite_youth_fem.png';

import ActorSaveModal from './ActorSaveModal';
import { useRecentGenerationsStore } from '../stores/useRecentGenerationsStore';
import type { RecentGeneration } from '../stores/useRecentGenerationsStore';
import { RecentGenerationsCacheService } from '../services/RecentGenerationsCacheService';

import {
    saveAssetToDisk,
    loadAssetFromDisk,
    deleteAssetFromDisk,
    verifyPermission
} from '../utils/FileSystemAssets';

// Import Unified Master Style Covers (Morph variants unified)
import coverPremiumAnimated3D from '../assets/style-premium-animated-3d.png';
import coverHyperReal from '../assets/style-hyper-real.png';
import coverRetroAnime from '../assets/style-retro-anime.png';
import coverComicBook from '../assets/style-comic-book.png';
import coverCyberpunk from '../assets/style-cyberpunk.png';
import coverExactStudio from '../assets/style-exact-studio.png';


// --- METADATA AND REGENERATION POLICY ARCHITECTURE ---
// Prior attempt / non-authoritative
// Do not use as identity source, style source, wardrobe source, body source, visual/design authority, or Image A
// approved prior generated result for style and wardrobe continuity only

const CHARACTER_PITCH_SHEET_PREVIEW_HELP =
    "Character Pitch Sheet Preview creates cinematic character design boards from text, portrait, or scan references. Results are active and usable, but exact likeness, body proportions, and panel consistency may vary while this feature is refined.";

const CharacterPitchSheetPreviewPill = () => (
    <span
        title={CHARACTER_PITCH_SHEET_PREVIEW_HELP}
        className="inline-flex items-center justify-center rounded-full border border-blue-400/25 bg-blue-500/10 px-1.5 py-0.5 text-[7px] font-black uppercase leading-none tracking-[0.16em] text-blue-200 shadow-[0_0_8px_rgba(96,165,250,0.14)]"
    >
        PREVIEW
    </span>
);



const REF_SHEET_STYLES = {
    family_3d: {
        id: 'family_3d',
        label: 'Family 3D Animation',
        keywords: "High-end studio 3D character, identity-locked stylized facial translation, source-mapped head shape, recognizable brow/eye/nose/mouth/jaw landmarks, soft subsurface scattering, clean stylized materials, high-end CG render, smooth shading",
        lighting: "Golden hour, cinematic bounce light"
    },
    premium_cg: {
        id: 'premium_cg',
        label: 'Premium CG Realism',
        keywords: "photorealistic CG, exact facial structure preservation, highly detailed skin pores, 85mm lens look, cinematic natural lighting, sharp focus, biometric fidelity",
        lighting: "High-contrast studio lighting"
    },
    exact_studio: {
        id: 'exact_studio',
        label: 'Exact Likeness Studio',
        keywords: "ultra-realistic studio portrait, 1:1 identity replication, strict facial feature preservation, highly detailed skin texture, raw photography look, 85mm lens, sharp focus, identity locked",
        lighting: "Professional studio lighting"
    },
    retro_cel: {
        id: 'retro_cel',
        label: 'Retro Cel Anime',
        keywords: "90s retro anime aesthetic, cel shading, hand-drawn ink lines, limited animation feel, vintage film grain, soft pastel palette, nostalgic Japanese animation look",
        lighting: "Soft diffused daylight"
    },
    graphic_noir: {
        id: 'graphic_noir',
        label: 'Graphic Noir',
        keywords: "modern graphic novel style, heavy ink outlines, halftone dot patterns, high contrast, dramatic shadows, bold dynamic lines",
        lighting: "Hard noir shadows"
    },
    cyberpunk_neon: {
        id: 'cyberpunk_neon',
        label: 'Cyberpunk Neon',
        keywords: "futuristic techwear, neon glow, wet pavement reflections, volumetric fog, teal and orange palette, cinematic cyberpunk lighting",
        lighting: "Neon-drenched night"
    }
};





const LEGACY_PREMIUM_ANIMATED_3D_STYLE_ID = ["p", "i", "x", "a", "r"].join("");

// Canonical style ID resolver
const normalizeStyleId = (id: string) => {
    const map: Record<string, string> = {
        [LEGACY_PREMIUM_ANIMATED_3D_STYLE_ID]: 'premium_animated_3d',
        family_3d: 'premium_animated_3d',
        premium_animated_3d: 'premium_animated_3d',
        premium_cg: 'hyper_real',
        retro_cel: 'retro_anime',
        graphic_noir: 'comic_book',
        cyberpunk_neon: 'cyberpunk',
    };
    return map[id] ?? id;
};

// --- CONFIGURATION CONSTANTS ---
const STYLE_SCOPE_RULES: Record<string, { default: BodyScope; allowed: BodyScope[] }> = {
    premium_animated_3d: { default: 'full', allowed: ['full', 'torso'] },
    retro_anime: { default: 'full', allowed: ['head', 'torso', 'full'] },
    comic_book: { default: 'torso', allowed: ['torso', 'full'] },
    cyberpunk: { default: 'torso', allowed: ['head', 'torso', 'full'] },
    hyper_real: { default: 'head', allowed: ['head', 'torso', 'full'] },
    exact_studio: { default: 'head', allowed: ['head', 'torso', 'full'] },
    // Defaults for undefined styles
    default: { default: 'full', allowed: ['head', 'torso', 'full'] }
};

const SCOPE_COST: Record<BodyScope, { gpu: string; note: string }> = {
    head: { gpu: 'low', note: 'Fastest generation' },
    torso: { gpu: 'medium', note: 'Balanced detail' },
    full: { gpu: 'high', note: 'Higher compute cost' }
};




// Types for Phases
type Phase = 1 | 2 | 3 | 4 | 5;
type MorphVariant = 'masc' | 'fem' | 'youth_masc' | 'youth_fem';
type ReferenceLayout = 'form_focus' | 'face_focus' | 'split_focus';
type RefSheetStyleId = keyof typeof REF_SHEET_STYLES;
type BiometricCaptureAngle = 'center' | 'left' | 'right' | 'up' | 'down';
type BiometricCaptureMap = Record<BiometricCaptureAngle, string | null>;
type NanoCastImageResolution = '1K' | '2K' | '4K';
type NanoCastGenerationBillingMode = 'hosted' | 'byok';
type NanoPitchSheetHandoff = PendingPitchSheetHandoff;
type NanoRefSheetHandoff = PendingRefSheetHandoff;
type NanoRefSheetSlotRect = {
    label: string;
    x: number;
    y: number;
    w: number;
    h: number;
};

type NanoRefSheetDuplicateValidation = {
    hasDuplicate: boolean;
    maxSimilarity: number;
    pair: string | null;
};

const NANOCAST_HYBRID_PROFILE_DUPLICATE_THRESHOLD = 0.82;

const NANOCAST_PROFILE_PAIR_VISUAL_LOCK = `
PROFILE PAIR VISUAL LOCK (CRITICAL):
- Left profile and right profile are opposite technical camera views, not two reusable side closeups.
- Anatomical LEFT PROFILE must show the face/nose/snout/visor pointing toward screen-right.
- Anatomical RIGHT PROFILE must show the face/nose/snout/visor pointing toward screen-left.
- Same-direction side profiles are invalid even if one is scaled, cropped, relit, shifted, or placed in a different cell.
- For animal, creature, robot, mascot, helmet, or stylized characters, use the snout/visor/faceplate protrusion and collar/neck direction to prove the left/right difference.
- If both profile panels point the same screen direction, redraw the incorrect panel before final output.
`;

const NANOCAST_HYBRID_PROFILE_SLOT_LOCK = `
NANOCAST HYBRID SPLIT PROFILE LOCK:
- In LAYOUT C lower head row, LENS 5 and LENS 6 must be adjacent but opposite profile views.
- LENS 5 = true left profile, nose/snout/faceplate points screen-right.
- LENS 6 = true right profile, nose/snout/faceplate points screen-left.
- LENS 5 and LENS 6 must not share the same silhouette, crop, rim light, side hardware, collar direction, or muzzle/nose direction.
- If LENS 5 and LENS 6 could be mistaken for the same side profile, the sheet is invalid.
`;

const NANOCAST_HEADSHOT_BACKGROUND_ISOLATION_LOCK = `
HEADSHOT / REFERENCE PORTRAIT BACKGROUND ISOLATION LOCK:
Use the uploaded portrait only as an identity reference for the subject's face, head shape, hairline, age, skin tone, and facial proportions. Do not copy or preserve the uploaded portrait's background. Fully isolate the head/face from the source image and place all reference headshots on the clean neutral studio background used by this character sheet. No rooms, doors, walls, furniture, windows, home interiors, source-photo lighting environments, or background objects may appear in any headshot panel.
- This also applies to uploaded/captured scan references: use them for face/head identity only, never as an environment or lighting/background reference.
- Preserve facial identity, head shape, hairline, expression neutrality, skin tone, and angle accuracy while replacing any source-photo environment with the sheet's clean studio/neutral background.

HEADSHOT BACKGROUND NEGATIVE EXCLUSIONS:
Exclude source image background, bedroom, hallway, door frame, wall corner, window, furniture, home interior, office background, uneven source lighting, cropped room details, original photo environment.
`;

const BIOMETRIC_CAPTURE_TONES: Record<BiometricCaptureAngle, { notes: number[]; accent: number; duration: number }> = {
    center: { notes: [523.25, 659.25], accent: 1046.5, duration: 0.18 },
    left: { notes: [392, 493.88], accent: 783.99, duration: 0.2 },
    right: { notes: [440, 554.37], accent: 880, duration: 0.2 },
    up: { notes: [587.33, 739.99, 987.77], accent: 1174.66, duration: 0.22 },
    down: { notes: [349.23, 261.63], accent: 523.25, duration: 0.24 }
};
const BIOMETRIC_CAPTURE_MAX_GAIN = 0.44;
const BIOMETRIC_CAPTURE_TONE_GAIN = 0.95;
const BIOMETRIC_CAPTURE_ACCENT_GAIN = 0.58;
const BIOMETRIC_CAPTURE_FILE_GAIN = 1.25;
const BIOMETRIC_CAPTURE_AUDIO_BASE_PATH = 'audio/biometric';
const BIOMETRIC_CAPTURE_AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'm4a'] as const;
const BIOMETRIC_IMAGE_DROP_ERROR = 'Please drop a PNG, JPG, JPEG, or WEBP image.';
const BIOMETRIC_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const BIOMETRIC_IMAGE_EXTENSION_PATTERN = /\.(png|jpe?g|webp)$/i;
const NANOCAST_BYOK_TIMEOUT_MS: Record<NanoCastImageResolution, number> = {
    '1K': 45000,
    '2K': 90000,
    '4K': 120000
};
const NANOCAST_HOSTED_UI_WAIT_MS: Record<NanoCastImageResolution, number> = {
    '1K': 300000,
    '2K': 360000,
    '4K': 480000
};
const NANOCAST_HOSTED_LOCAL_TIMEOUT_PADDING_MS = 120000;

const getNanoCastHostedUiWaitMs = (resolution: NanoCastImageResolution): number =>
    NANOCAST_HOSTED_UI_WAIT_MS[resolution];

const getNanoCastGenerationTimeoutMs = (
    resolution: NanoCastImageResolution,
    billingMode: NanoCastGenerationBillingMode
): number =>
    billingMode === 'hosted'
        ? getNanoCastHostedUiWaitMs(resolution) + NANOCAST_HOSTED_LOCAL_TIMEOUT_PADDING_MS
        : NANOCAST_BYOK_TIMEOUT_MS[resolution];

const formatNanoCastElapsedSeconds = (startedAt: number): string =>
    `${Math.max(1, Math.round((Date.now() - startedAt) / 1000))}s`;

const USE_LEGACY_NANOCAST_RECONSTRUCTION = true;

const buildHairScalpIdentityContract = (identityRangeText: string): string => `
HAIR / SCALP IDENTITY CONTRACT:
- Hair is biometric identity data.
- Resolve hair from the full biometric scan set: ${identityRangeText}.
- Do not infer baldness from one cropped, bright, low-angle, or partially obscured reference image.
- If any clear biometric reference shows visible hair, preserve hair presence.
- Do not render the subject bald unless the subject is bald across the full biometric scan set or the user explicitly selected bald.
- Preserve visible hairline, hair coverage, hair texture, hair density, and hair direction as closely as the chosen style allows.
- Style may simplify hair rendering, but must not remove or replace the subject's visible hair.
- If references disagree, prefer the clearest views of the scalp/hairline/top/side of head for hair decisions while preserving the center image for face structure.
`;

const getBiometricSafeStyleNegativePrompt = (negativePrompt: string): string =>
    negativePrompt
        .split(',')
        .map(token => token.trim())
        .filter(Boolean)
        .filter(token => !/\b(natural human scan|scan-like realism|realistic human portrait)\b/i.test(token))
        .join(', ');

const getStyleOverlayBiometricContract = (styleId?: string | null): string => {
  const clean = String(styleId || "").toLowerCase();

  if (clean.includes("graphic") || clean.includes("noir")) {
    return `
GRAPHIC NOIR STYLE OVERLAY CONTRACT:
- Treat Graphic Noir as a visual overlay, not a facial redesign system.
- Preserve the scanned person's skull shape, face proportions, brow/eye/nose/mouth relationship, jaw, chin, cheek volume, age impression, and facial hair geometry.
- Apply the style only through ink line quality, controlled shadow shapes, contrast, limited halftone treatment, and poster-like graphic finish.
- Do not reinterpret scan texture as designed facial surface features.
- Keep facial surface treatment clean, restrained, and identity-faithful.
- Ignore temporary scan texture, lighting noise, compression artifacts, shaving texture, and other non-identity surface noise.
`;
  }

  if (clean.includes("anime") || clean.includes("cel")) {
    return `
RETRO CEL ANIME ADULT PORTRAIT TRANSLATION CONTRACT:
- Treat Retro Cel Anime as an adult portrait translation of the scanned person, not as new anime character creation.
- Preserve the scanned person's adult skull shape, face fullness, brow position, real eye spacing, real eye size relationship, nose bridge/mouth relationship, jaw width, chin shape, cheek volume, age impression, and facial hair geometry.
- Apply anime influence only through clean linework, flat color shapes, cel shading, simplified shadow edges, and retro animation finish.
- Do not youthify the subject.
- Do not beautify the subject into a generic anime archetype.
- Do not enlarge the eyes beyond the source person's real facial proportions.
- Do not simplify the nose into a tiny symbolic anime nose.
- Do not narrow the jaw or slim the face unless the biometric source clearly has that structure.
- Keep facial surface treatment clean and restrained.
- Ignore scan texture, temporary skin texture, lighting noise, compression artifacts, shaving texture, pores, and non-identity surface noise.
- Preserve only stable identity-relevant facial details clearly supported across multiple biometric references.
`;
  }

  return "";
};

const isSurfaceRiskStyle = (styleId?: string | null): boolean => {
  const clean = String(styleId || "").toLowerCase();
  return clean.includes("graphic") ||
    clean.includes("noir") ||
    clean.includes("anime") ||
    clean.includes("cel");
};

const mapSelectedStyleToRefStyle = (styleId: string | null): RefSheetStyleId => {
    if (!styleId) return 'family_3d';
    const clean = styleId.toLowerCase();
    if (clean === 'premium_animated_3d' || clean === 'family_3d') return 'family_3d';
    if (clean === 'hyper_real' || clean === 'premium_cg') return 'premium_cg';
    if (clean === 'retro_anime' || clean === 'retro_cel') return 'retro_cel';
    if (clean === 'comic_book' || clean === 'graphic_noir') return 'graphic_noir';
    if (clean === 'cyberpunk' || clean === 'cyberpunk_neon') return 'cyberpunk_neon';
    if (clean === 'exact_studio') return 'exact_studio';
    return 'family_3d';
};

const mapRefStyleToSelectedStyle = (refStyleId: RefSheetStyleId): string => {
    switch (refStyleId) {
        case 'family_3d': return 'premium_animated_3d';
        case 'premium_cg': return 'hyper_real';
        case 'retro_cel': return 'retro_anime';
        case 'graphic_noir': return 'comic_book';
        case 'cyberpunk_neon': return 'cyberpunk';
        case 'exact_studio': return 'exact_studio';
        default: return 'premium_animated_3d';
    }
};

const createEmptyBiometricCaptureMap = (): BiometricCaptureMap => ({
    center: null,
    left: null,
    right: null,
    up: null,
    down: null
});

const areBiometricCaptureMapsEqual = (a: BiometricCaptureMap, b: BiometricCaptureMap): boolean =>
    a.center === b.center &&
    a.left === b.left &&
    a.right === b.right &&
    a.up === b.up &&
    a.down === b.down;

const getBiometricCaptureAudioCandidates = (angle: BiometricCaptureAngle): string[] =>
    BIOMETRIC_CAPTURE_AUDIO_EXTENSIONS.map((extension) => `${BIOMETRIC_CAPTURE_AUDIO_BASE_PATH}/${angle}.${extension}`);



const hasFileDragPayload = (dataTransfer: DataTransfer): boolean =>
    Array.from(dataTransfer.types).includes('Files');

const isAcceptedBiometricImageFile = (file: File): boolean => {
    const mimeType = file.type.toLowerCase();
    const hasAcceptedExtension = BIOMETRIC_IMAGE_EXTENSION_PATTERN.test(file.name);

    if (!mimeType) return hasAcceptedExtension;
    if (!mimeType.startsWith('image/')) return false;
    if (BIOMETRIC_IMAGE_MIME_TYPES.has(mimeType)) return true;

    return hasAcceptedExtension && ['image/jpg', 'image/pjpeg', 'image/x-png'].includes(mimeType);
};

type ImageDropZoneOptions<TSlot extends string> = {
    slotId: TSlot;
    currentImage: string | null;
    onImageSelected: (slotId: TSlot, file: File) => void;
};

const useImageDropZone = <TSlot extends string>({
    slotId,
    currentImage,
    onImageSelected
}: ImageDropZoneOptions<TSlot>) => {
    const [isDraggingOver, setIsDraggingOver] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const dragDepthRef = useRef(0);
    const errorTimerRef = useRef<number | null>(null);
    const hasImage = Boolean(currentImage);

    const clearDragState = useCallback(() => {
        dragDepthRef.current = 0;
        setIsDraggingOver(false);
    }, []);

    const showDropError = useCallback((message: string) => {
        setErrorMessage(message);
        if (errorTimerRef.current !== null) window.clearTimeout(errorTimerRef.current);
        errorTimerRef.current = window.setTimeout(() => {
            setErrorMessage(null);
            errorTimerRef.current = null;
        }, 3200);
    }, []);

    const selectImageFile = useCallback((file?: File | null) => {
        if (!file) return;

        if (!isAcceptedBiometricImageFile(file)) {
            showDropError(BIOMETRIC_IMAGE_DROP_ERROR);
            return;
        }

        setErrorMessage(null);
        if (errorTimerRef.current !== null) {
            window.clearTimeout(errorTimerRef.current);
            errorTimerRef.current = null;
        }
        onImageSelected(slotId, file);
    }, [onImageSelected, showDropError, slotId]);

    const handleDragEnter = useCallback((event: DragEvent<HTMLElement>) => {
        if (!hasFileDragPayload(event.dataTransfer)) return;

        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'copy';
        dragDepthRef.current += 1;
        setIsDraggingOver(true);
    }, []);

    const handleDragOver = useCallback((event: DragEvent<HTMLElement>) => {
        if (!hasFileDragPayload(event.dataTransfer)) return;

        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'copy';
    }, []);

    const handleDragLeave = useCallback((event: DragEvent<HTMLElement>) => {
        if (!hasFileDragPayload(event.dataTransfer)) return;

        event.preventDefault();
        event.stopPropagation();
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) setIsDraggingOver(false);
    }, []);

    const handleDrop = useCallback((event: DragEvent<HTMLElement>) => {
        if (!hasFileDragPayload(event.dataTransfer)) return;

        event.preventDefault();
        event.stopPropagation();
        const file = event.dataTransfer.files?.[0] ?? null;
        clearDragState();
        selectImageFile(file);
    }, [clearDragState, selectImageFile]);

    useEffect(() => () => {
        if (errorTimerRef.current !== null) window.clearTimeout(errorTimerRef.current);
    }, []);

    return {
        isDraggingOver,
        errorMessage,
        selectImageFile,
        dropZoneProps: {
            onDragEnter: handleDragEnter,
            onDragOver: handleDragOver,
            onDragLeave: handleDragLeave,
            onDrop: handleDrop,
            'aria-label': `${slotId} biometric reference ${hasImage ? 'loaded' : 'drop zone'}`,
            'data-drop-slot': slotId
        }
    };
};

type BiometricDropPanelProps = {
    angle: BiometricCaptureAngle;
    imageUrl: string | null;
    onImageSelected: (angle: BiometricCaptureAngle, file: File) => void;
    onRetake: (angle: BiometricCaptureAngle) => void;
    onUploadIntent: () => void;
};

const BiometricDropPanel = ({
    angle,
    imageUrl,
    onImageSelected,
    onRetake,
    onUploadIntent
}: BiometricDropPanelProps) => {
    const { isDraggingOver, errorMessage, selectImageFile, dropZoneProps } = useImageDropZone({
        slotId: angle,
        currentImage: imageUrl,
        onImageSelected
    });

    return (
        <div
            {...dropZoneProps}
            className={`relative aspect-video bg-surface-2 border rounded-xl overflow-hidden group transition-all ${
                isDraggingOver
                    ? 'border-yellow-500/80 bg-black shadow-[0_0_28px_rgba(234,179,8,0.22),inset_0_0_24px_rgba(234,179,8,0.08)]'
                    : 'border-border hover:border-accent/50'
            }`}
        >
            {imageUrl ? (
                <>
                    <img src={imageUrl} className="w-full h-full object-cover opacity-80" />
                    <button
                        onClick={() => onRetake(angle)}
                        className="absolute top-2 right-2 bg-black/50 p-2 rounded-full hover:bg-red-500/50 transition-colors z-10"
                    >
                        <RefreshCw className="w-4 h-4 text-white" />
                    </button>
                </>
            ) : (
                <label className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer hover:bg-surface transition-colors">
                    <Upload className="w-8 h-8 text-muted mb-2 group-hover:text-accent" />
                    <span className="text-xs text-muted font-bold uppercase tracking-widest">{angle} Reference</span>
                    <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onClick={(e) => {
                            onUploadIntent();
                            (e.target as HTMLInputElement).value = '';
                        }}
                        onChange={(e) => {
                            selectImageFile(e.target.files?.[0] ?? null);
                        }}
                    />
                </label>
            )}

            {isDraggingOver && (
                <div className="absolute inset-0 z-20 pointer-events-none flex items-center justify-center bg-black/72 backdrop-blur-[1px]">
                    <div className="rounded-full border border-yellow-500/55 bg-yellow-500/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.24em] text-yellow-300 shadow-[0_0_18px_rgba(234,179,8,0.24)]">
                        Drop image here
                    </div>
                </div>
            )}

            {errorMessage && (
                <div className="absolute left-3 right-3 top-3 z-30 rounded-lg border border-yellow-500/35 bg-black/82 px-3 py-2 text-center text-[9px] font-bold uppercase tracking-[0.12em] text-yellow-200 shadow-[0_0_18px_rgba(234,179,8,0.16)]">
                    {errorMessage}
                </div>
            )}

            <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/50 rounded text-[9px] text-accent uppercase font-bold tracking-widest">
                {angle}
            </div>
        </div>
    );
};

type ArchetypeOption = {
    id: string;
    name: string;
    desc: string;
    icon: typeof Swords;
    defaultImage: string;
};

type ActorMetadata = {
    id?: string;
    name?: string;
    style?: string;
};

type PermissionAwareDirectoryHandle = FileSystemDirectoryHandle & {
    queryPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
    values?: () => AsyncIterableIterator<FileSystemHandle>;
};

type WindowWithDirectoryPicker = Window & {
    showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite'; startIn?: string }) => Promise<FileSystemDirectoryHandle>;
};

type WindowWithWebkitAudioContext = Window & {
    webkitAudioContext?: typeof AudioContext;
};

const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    return String(error);
};

type FaceMeshResult = {
    multiFaceLandmarks?: Array<Array<{ x: number; y: number; z?: number }>>;
};

const MORPH_VARIANTS: Array<{ id: MorphVariant; label: string }> = [
    { id: 'masc', label: 'Masculine' },
    { id: 'fem', label: 'Feminine' },
    { id: 'youth_masc', label: 'Youth (Boy)' },
    { id: 'youth_fem', label: 'Youth (Girl)' }
];

const REF_LAYOUT_OPTIONS: Array<{ id: ReferenceLayout; label: string }> = [
    { id: 'form_focus', label: 'Body Focus' },
    { id: 'face_focus', label: 'Expressions' },
    { id: 'split_focus', label: 'Hybrid' }
];

const REF_SHEET_STYLE_IDS = Object.keys(REF_SHEET_STYLES) as RefSheetStyleId[];
const isRefSheetStyleId = (value: string): value is RefSheetStyleId => REF_SHEET_STYLE_IDS.includes(value as RefSheetStyleId);

const formatIdentityAnchorAngle = (angle: string | undefined, fallbackIndex: number): string => {
    switch ((angle || '').toLowerCase()) {
        case 'center':
        case 'front':
            return 'Front';
        case 'left':
            return 'Left Profile';
        case 'right':
            return 'Right Profile';
        case 'up':
            return 'Upward Angle';
        case 'down':
            return 'Downward Angle';
        default:
            return `Angle ${fallbackIndex + 1}`;
    }
};

const formatHeight = (inches: number) => {
    const ft = Math.floor(inches / 12);
    const range = inches % 12;
    return `${ft}'${range}"`;
};

const isRecentReferenceSheet = (prompt?: string) => prompt?.toLowerCase().includes('reference sheet') ?? false;

type NanoRecentGenerationsGalleryProps = {
    onSelectGeneration: (generation: RecentGeneration) => void;
    onExportGeneration: (generation: RecentGeneration) => void;
};

const NanoRecentGenerationsGallery = ({
    onSelectGeneration,
    onExportGeneration
}: NanoRecentGenerationsGalleryProps) => {
    const {
        recentGenerations,
        activeRecentGenerationIdByStudio,
        setActiveRecentGeneration,
        removeRecentGeneration,
        clearRecentGenerationsForStudio,
        initStore,
        initialized
    } = useRecentGenerationsStore();
    const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);

    const nanoGenerations = recentGenerations.filter((generation) => generation.studio === 'nanocast');
    const activeId = activeRecentGenerationIdByStudio.nanocast || null;

    useEffect(() => {
        if (!initialized) {
            void initStore();
        }
    }, [initialized, initStore]);

    const handleSelect = (generation: RecentGeneration) => {
        setActiveRecentGeneration('nanocast', generation.id);
        onSelectGeneration(generation);
    };

    const handleExport = (event: React.MouseEvent, generation: RecentGeneration) => {
        event.stopPropagation();
        onExportGeneration(generation);
    };

    const handleRemove = (event: React.MouseEvent, generationId: string) => {
        event.stopPropagation();
        removeRecentGeneration(generationId);
    };

    const handleClearAll = () => {
        clearRecentGenerationsForStudio('nanocast');
        setIsClearConfirmOpen(false);
    };

    return (
        <>
            <div className="flex min-h-0 flex-1 flex-col">
                <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
                    <span className="rounded border border-accent/20 bg-accent/10 px-2 py-1 font-mono text-[9px] font-black text-accent">
                        {nanoGenerations.length.toString().padStart(2, '0')}
                    </span>
                    {nanoGenerations.length > 0 && (
                        <button
                            onClick={() => setIsClearConfirmOpen(true)}
                            className="inline-flex items-center gap-1 rounded-md border border-red-400/15 bg-red-500/[0.04] px-2 py-1 text-[8px] font-black uppercase tracking-[0.14em] text-red-300/70 transition-colors hover:border-red-400/35 hover:bg-red-500/10 hover:text-red-200"
                            title="Clear this studio's recent generations"
                            aria-label="Clear all Nano Cast recent generations"
                        >
                            <Trash2 className="h-3 w-3" />
                            Clear
                        </button>
                    )}
                </div>

                {nanoGenerations.length === 0 ? (
                    <div className="flex min-h-[240px] flex-1 items-center justify-center rounded-lg border border-dashed border-accent/20 bg-black/35 p-5 text-center">
                        <div>
                            <RefreshCw className="mx-auto mb-3 h-6 w-6 text-accent/50" />
                            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-accent/70">No Recent Generations</div>
                            <div className="mt-2 text-[10px] leading-relaxed text-muted">
                                New Nano Cast results and reference sheets will stack here.
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="min-h-0 flex-1 overflow-y-auto pr-1 custom-scrollbar">
                        <div className="grid grid-cols-[repeat(auto-fit,minmax(118px,1fr))] gap-3 pb-6">
                            {nanoGenerations.map((generation) => {
                                const isActive = generation.id === activeId;
                                const isReferenceSheet = isRecentReferenceSheet(generation.prompt);

                                return (
                                    <div
                                        key={generation.id}
                                        className={`group relative aspect-square overflow-hidden rounded-lg border bg-black transition-all ${
                                            isActive
                                                ? 'border-accent shadow-[0_0_18px_rgba(234,179,8,0.28)]'
                                                : 'border-white/10 hover:border-accent/70 hover:shadow-[0_0_18px_rgba(234,179,8,0.14)]'
                                        }`}
                                    >
                                        <button
                                            onClick={() => handleSelect(generation)}
                                            className="absolute inset-0 !m-0 !min-h-0 !min-w-0 !border-0 !bg-transparent !p-0 text-left"
                                            title={generation.prompt || 'Nano Cast recent generation'}
                                            aria-label="Select Nano Cast recent generation"
                                        >
                                            <img
                                                src={generation.displayUrl}
                                                alt=""
                                                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                                                loading="lazy"
                                            />
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent opacity-80" />
                                            <div className="absolute left-2 top-2 flex items-center gap-1">
                                                {generation.exported && (
                                                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white shadow-md">
                                                        <CheckCircle2 className="h-3 w-3" />
                                                    </span>
                                                )}
                                                {isReferenceSheet && (
                                                    <span className="rounded bg-blue-500/80 px-1.5 py-0.5 text-[6px] font-black uppercase tracking-[0.12em] text-white">
                                                        Sheet
                                                    </span>
                                                )}
                                            </div>
                                            <div className="absolute bottom-2 left-2 right-2">
                                                <div className="truncate text-[8px] font-black uppercase tracking-[0.12em] text-white">
                                                    {isReferenceSheet ? 'Reference Sheet' : 'Character'}
                                                </div>
                                                <div className="mt-0.5 font-mono text-[8px] text-white/45">
                                                    {new Date(generation.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </div>
                                            </div>
                                        </button>

                                        <div className="absolute right-2 top-2 z-10 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                                            {!generation.exported && (
                                                <button
                                                    onClick={(event) => handleExport(event, generation)}
                                                    className="!m-0 flex !h-7 !w-7 !min-h-0 !min-w-0 items-center justify-center rounded-full !border !border-blue-300/20 !bg-blue-500/90 !p-0 text-white shadow-lg transition-colors hover:!bg-blue-400"
                                                    title="Export to Library"
                                                    aria-label="Export recent generation to library"
                                                >
                                                    <FolderPlus className="h-3.5 w-3.5" />
                                                </button>
                                            )}
                                            <button
                                                onClick={(event) => handleRemove(event, generation.id)}
                                                className="!m-0 flex !h-7 !w-7 !min-h-0 !min-w-0 items-center justify-center rounded-full !border !border-red-300/20 !bg-red-500/85 !p-0 text-white shadow-lg transition-colors hover:!bg-red-500"
                                                title="Remove from recent"
                                                aria-label="Remove recent generation"
                                            >
                                                <X className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            <ConfirmDialog
                isOpen={isClearConfirmOpen}
                onClose={() => setIsClearConfirmOpen(false)}
                onConfirm={handleClearAll}
                title="Clear Nano Cast Recents?"
                message={`Clear ${nanoGenerations.length} Nano Cast recent generation${nanoGenerations.length === 1 ? '' : 's'}? This removes recent thumbnails and cache files only. Saved library assets are untouched.`}
                confirmText="Clear"
                cancelText="Cancel"
                variant="danger"
            />
        </>
    );
};

const nanoDataUrlToBlob = (dataUrl: string): Blob => {
    const [meta, data] = dataUrl.split(',');
    const mimeMatch = meta.match(/data:(.*?);base64/);
    const mime = mimeMatch?.[1] || 'image/png';
    const bytes = atob(data);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new Blob([arr], { type: mime });
};

const resolveNanoReferenceSheetBlob = async (src: string): Promise<Blob> => {
    if (src.startsWith('data:image/')) return nanoDataUrlToBlob(src);

    const response = await fetch(src, { mode: 'cors' });
    if (!response.ok) throw new Error(`Reference sheet image fetch failed: ${response.status}`);
    return await response.blob();
};

const loadNanoReferenceSheetImage = (src: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Failed to load NanoCast reference sheet for validation'));
        img.src = src;
    });

const getNanoCastHybridProfileSlots = (): NanoRefSheetSlotRect[] => [
    { label: 'LENS_5_TRUE_LEFT_PROFILE', x: 0.2, y: 0.6, w: 0.2, h: 0.4 },
    { label: 'LENS_6_TRUE_RIGHT_PROFILE', x: 0.4, y: 0.6, w: 0.2, h: 0.4 }
];

const computeNanoSlotSimilarity = (
    sourceCanvas: HTMLCanvasElement,
    a: NanoRefSheetSlotRect,
    b: NanoRefSheetSlotRect
): number => {
    const SIZE = 64;
    const ANALYSIS_SIZE = 192;
    const width = sourceCanvas.width;
    const height = sourceCanvas.height;

    const toPixels = (slot: NanoRefSheetSlotRect) => ({
        sx: Math.max(0, Math.floor(slot.x * width)),
        sy: Math.max(0, Math.floor(slot.y * height)),
        sw: Math.max(1, Math.floor(slot.w * width)),
        sh: Math.max(1, Math.floor(slot.h * height))
    });

    const drawForegroundNormalizedSlot = (slot: NanoRefSheetSlotRect, target: HTMLCanvasElement) => {
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
    ca.width = SIZE;
    ca.height = SIZE;
    cb.width = SIZE;
    cb.height = SIZE;
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

const detectNanoCastHybridProfileDuplicate = async (sheetUrl: string): Promise<NanoRefSheetDuplicateValidation> => {
    const blob = await resolveNanoReferenceSheetBlob(sheetUrl);
    const tempUrl = URL.createObjectURL(blob);

    try {
        const img = await loadNanoReferenceSheetImage(tempUrl);
        const sourceCanvas = document.createElement('canvas');
        sourceCanvas.width = img.width;
        sourceCanvas.height = img.height;
        const ctx = sourceCanvas.getContext('2d');
        if (!ctx) return { hasDuplicate: false, maxSimilarity: 0, pair: null };

        ctx.drawImage(img, 0, 0);
        const [leftProfile, rightProfile] = getNanoCastHybridProfileSlots();
        const similarity = computeNanoSlotSimilarity(sourceCanvas, leftProfile, rightProfile);

        return {
            hasDuplicate: similarity >= NANOCAST_HYBRID_PROFILE_DUPLICATE_THRESHOLD,
            maxSimilarity: similarity,
            pair: `${leftProfile.label} vs ${rightProfile.label}`
        };
    } finally {
        URL.revokeObjectURL(tempUrl);
    }
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



const NanoCastingDirector = () => {
    const { state, dispatch } = useAppContext();
    const nanoCastSession = state.nanoCastSession;
    const [phase, setPhase] = useState<Phase>(() => nanoCastSession.generatedCharacterUrl ? 5 : 1);

    // --- WARDROBE LIBRARY HANDLERS ---
    const [confirmDelete, setConfirmDelete] = useState<WardrobeItem | null>(null);
    const [showCoverDeleteConfirm, setShowCoverDeleteConfirm] = useState<string | null>(null);
    const [localBiometricSheetUrl, setLocalBiometricSheetUrl] = useState<string | null>(null);

    const scanWardrobe = async () => {
        // 1. Native Mode
        if (state.saveDirectoryPath) {
            try {
                const wardrobePath = await nativeJoinPath(state.saveDirectoryPath, 'wardrobe');
                const files = await nativeListFiles(wardrobePath);
                const items: WardrobeItem[] = [];

                for (const file of files) {
                    if (/\.(png|jpg|jpeg|webp)$/i.test(file)) {
                        const fullPath = await nativeJoinPath(wardrobePath, file);
                        const displayUrl = await resolveDisplayUrl({ localPath: fullPath });
                        if (displayUrl) {
                            items.push({
                                id: file,
                                url: displayUrl,
                                localPath: fullPath,
                                filename: file,
                                name: file.replace(/\.[^/.]+$/, "").split('-').slice(1).join(' '),
                                prompt: "Saved costume asset",
                                category: "General",
                                timestamp: Date.now()
                            });
                        }
                    }
                }
                dispatch({ type: 'SET_WARDROBE_ITEMS', payload: items });
                dispatch({ type: 'ADD_LOG', payload: { message: "Wardrobe Library Refreshed", type: 'success' } });
                return;
            } catch (err) {
                console.error("Failed to scan native wardrobe:", err);
                return;
            }
        }

        if (!state.saveDirectoryHandle) return;
        try {
            const saveDirectoryHandle = state.saveDirectoryHandle as PermissionAwareDirectoryHandle;
            if (saveDirectoryHandle.queryPermission && (await saveDirectoryHandle.queryPermission({ mode: 'read' })) !== 'granted') return;

            const wardrobeHandle = await state.saveDirectoryHandle.getDirectoryHandle('wardrobe', { create: true });
            const items: WardrobeItem[] = [];
            const iterableWardrobeHandle = wardrobeHandle as PermissionAwareDirectoryHandle;
            if (!iterableWardrobeHandle.values) return;
            for await (const entry of iterableWardrobeHandle.values()) {
                if (entry.kind === 'file' && /\.(png|jpg|jpeg|webp)$/i.test(entry.name)) {
                    const file = await (entry as FileSystemFileHandle).getFile();
                    const reader = new FileReader();
                    const dataUrl = await new Promise<string>((resolve) => {
                        reader.onload = () => resolve(reader.result as string);
                        reader.readAsDataURL(file);
                    });

                    items.push({
                        id: entry.name,
                        url: dataUrl,
                        name: entry.name.replace('.png', '').split('-').slice(1).join(' '),
                        prompt: "Saved costume asset",
                        category: "General",
                        timestamp: file.lastModified
                    });
                }
            }
            dispatch({ type: 'SET_WARDROBE_ITEMS', payload: items.sort((a, b) => b.timestamp - a.timestamp) });
            dispatch({ type: 'ADD_LOG', payload: { message: "Wardrobe Library Refreshed", type: 'success' } });
        } catch (error: unknown) {
            dispatch({ type: 'ADD_LOG', payload: { message: `Wardrobe scan failed: ${getErrorMessage(error)}`, type: 'error' } });
        }
    };

    // --- ACTOR LIBRARY SCANNER (NATIVE) ---
    const scanActorLibrary = useCallback(async () => {
        if (!state.saveDirectoryPath) return;

        try {
            const actorsRoot = await nativeJoinPath(state.saveDirectoryPath, 'Actors');
            let categories: string[] = [];

            try {
                // Check if Actors folder exists and get categories
                const rootContents = await nativeListFiles(actorsRoot);
                // Filter for directories (simplified check: no extension = directory convention)
                categories = rootContents.filter(c => !c.includes('.'));
            } catch {
                return; // Actors folder likely doesn't exist yet
            }

            const libraryPayload: CastMember[] = [];

            for (const catName of categories) {
                const catPath = await nativeJoinPath(actorsRoot, catName);
                let files: string[] = [];
                try {
                    files = await nativeListFiles(catPath);
                } catch { continue; }

                for (const potentialFile of files) {
                    // FLAT STRUCTURE SUPPORT: Actor-123.png + Actor-123.json in Category Folder
                    if (potentialFile.endsWith('.png')) {
                        const baseName = potentialFile.replace('.png', '');
                        const imgPath = await nativeJoinPath(catPath, potentialFile);

                        // Check for Sidecar JSON
                        const jsonName = `${baseName}.json`;
                        let metadata: ActorMetadata | null = null;

                        if (files.includes(jsonName)) {
                            const jsonPath = await nativeJoinPath(catPath, jsonName);
                            const jsonContent = await nativeReadFile(jsonPath);

                            if (jsonContent && typeof jsonContent === 'string') {
                                try {
                                    // Handle Data URL (if nativeReadFile returns it) or raw text
                                    // Assuming nativeReadFile returns a Data URL for generic text files or need special handling
                                    // The standard util returns a Data URL.
                                    let jsonStr = jsonContent;
                                    if (jsonContent.startsWith('data:')) {
                                        const base64 = jsonContent.split(',')[1];
                                        jsonStr = atob(base64);
                                    }
                                    metadata = JSON.parse(jsonStr);
                                } catch {
                                    console.warn("Invalid JSON for actor:", baseName);
                                }
                            }
                        }

                        // Load Image (nativeReadFile returns DataURL for images)
                        const imgUrl = await nativeReadFile(imgPath);
                        if (imgUrl) {
                            libraryPayload.push({
                                id: metadata?.id || `${catName}-${baseName}`,
                                name: metadata?.name || baseName, // Use metadata name if available
                                url: imgUrl,
                                tag: 'front',
                                profile: {
                                    identity: metadata?.name || baseName,
                                    wardrobe: "Saved Actor",
                                    accessories: "",
                                    style: metadata?.style || catName
                                }
                            });
                        }
                    }
                }
            }

            // Update Library State
            if (libraryPayload.length > 0) {
                // Sort by creation time if possible (descending)
                libraryPayload.sort((a, b) => b.id.localeCompare(a.id));

                dispatch({ type: 'SET_ACTOR_LIBRARY', payload: libraryPayload });
                console.log(`[NanoCast] Loaded ${libraryPayload.length} actors from library.`);
            }

        } catch (err) {
            console.error("Failed to scan native Actor Library:", err);
        }
    }, [dispatch, state.saveDirectoryPath]);

    // Auto-Scan on Mount / Path Change (Legacy Fallback Only)
    useEffect(() => {
        // Only trigger legacy disk scan if AppContext loaded zero actors (first launch or reset)
        if (state.saveDirectoryPath && state.actorLibrary.length === 0) {
            scanActorLibrary();
        }
    }, [state.saveDirectoryPath, state.actorLibrary.length, scanActorLibrary]);

    const handleUploadCostume = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0 || !state.saveDirectoryHandle) return;
        const file = e.target.files[0];

        try {
            // DUPLICATE CHECK
            if (state.wardrobeItems.some((item) => item.id.includes(file.name) || item.name === file.name.split('.')[0])) {
                showToast("Item already exists in library.");
                return;
            }

            const wardrobeHandle = await state.saveDirectoryHandle.getDirectoryHandle('wardrobe', { create: true });
            const safeName = `Custom-Costume-${Date.now()}-${file.name.replace(/[^a-z0-9.]/gi, '_')}`;
            const fileHandle = await wardrobeHandle.getFileHandle(safeName, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(file);
            await writable.close();

            // Read for immediate display
            const reader = new FileReader();
            reader.onload = () => {
                const dataUrl = reader.result as string;
                // setDesignerImage(dataUrl); // Not present in Nano
                // setDesignerPrompt(file.name.replace(/\.[^/.]+$/, ""));

                const newItem = {
                    id: safeName,
                    url: dataUrl,
                    name: file.name.split('.')[0].substring(0, 20),
                    prompt: "User Upload",
                    category: "General",
                    timestamp: Date.now()
                };

                dispatch({ type: 'ADD_WARDROBE_ITEM', payload: newItem });
                dispatch({ type: 'ADD_LOG', payload: { message: `Uploaded & Saved: ${file.name}`, type: 'success' } });
            };
            reader.readAsDataURL(file);

        } catch (error: unknown) {
            dispatch({ type: 'ADD_LOG', payload: { message: `Upload failed: ${getErrorMessage(error)}`, type: 'error' } });
        }
    };

    const executeDelete = async () => {
        if (!confirmDelete) return;
        const item = confirmDelete;

        try {
            let deleted = false;
            if (state.saveDirectoryPath && window.electronAPI?.deleteFile && window.electronAPI?.joinPath) {
                const filePath = await window.electronAPI.joinPath(state.saveDirectoryPath, 'wardrobe', item.id);
                deleted = await window.electronAPI.deleteFile(filePath);
            }

            if (!deleted && state.saveDirectoryHandle) {
                const wardrobeHandle = await state.saveDirectoryHandle.getDirectoryHandle('wardrobe', { create: false });
                await wardrobeHandle.removeEntry(item.id);
                deleted = true;
            }

            if (!deleted) throw new Error("File deletion failed or permission denied on disk.");

            const newItems = state.wardrobeItems.filter((wardrobeItem) => wardrobeItem.id !== item.id);
            dispatch({ type: 'SET_WARDROBE_ITEMS', payload: newItems });
            if (selectedWardrobeItem?.id === item.id) setSelectedWardrobeItem(null);
            dispatch({ type: 'ADD_LOG', payload: { message: `Deleted costume: ${item.name}`, type: 'success' } });

        } catch (error: unknown) {
            dispatch({ type: 'ADD_LOG', payload: { message: `Delete failed: ${getErrorMessage(error)}`, type: 'error' } });
        } finally {
            setConfirmDelete(null);
        }
    };

    // --- PHASE 2: BODY ARCHETYPE STATE ---
    const [selectedBody, setSelectedBody] = useState<string | null>(() => nanoCastSession.selectedBody);
    const [morphVariant, setMorphVariant] = useState<MorphVariant>('masc');

    // --- CUSTOM COVERS STATE ---
    const [customArchetypeCovers, setCustomArchetypeCovers] = useState<Record<string, string>>({});
    const customArchetypeCoversRef = useRef(customArchetypeCovers);
    // const [isLoadingCovers, setIsLoadingCovers] = useState(true); // Unused for now

    useEffect(() => {
        customArchetypeCoversRef.current = customArchetypeCovers;
    }, [customArchetypeCovers]);

    // Load covers from IndexedDB on mount
    // Load covers from Disk on mount/change
    useEffect(() => {
        // Revoke old URLs to prevent memory leaks
        return () => {
            Object.values(customArchetypeCoversRef.current).forEach(url => URL.revokeObjectURL(url));
        };
    }, [dispatch]);

    useEffect(() => {
        const loadCovers = async () => {
            if (!state.saveDirectoryHandle) return;

            // Verify Read Permission
            const hasPermission = await verifyPermission(state.saveDirectoryHandle, false);
            if (!hasPermission) return;

            const loaded: Record<string, string> = {};
            const variants = ['masc', 'fem', 'youth_masc', 'youth_fem'];
            const archetypes = ['titan', 'scout', 'guardian', 'sprite'];

            for (const v of variants) {
                for (const a of archetypes) {
                    const storageKey = `${v}_${a}`;
                    const filename = `Archetype_${storageKey}.png`;
                    const url = await loadAssetFromDisk(state.saveDirectoryHandle, filename);
                    if (url) {
                        loaded[storageKey] = url;
                    }
                }
            }
            if (Object.keys(loaded).length > 0) {
                setCustomArchetypeCovers(prev => ({ ...prev, ...loaded }));
            }
        };

        loadCovers();
    }, [state.saveDirectoryHandle]);

    const handleArchetypeCoverUpload = async (storageKey: string, file: File) => {
        if (!state.saveDirectoryHandle) {
            dispatch({ type: 'ADD_LOG', payload: { message: "Set Save Folder to use Custom Covers", type: 'error' } });
            return;
        }

        const filename = `Archetype_${storageKey}.png`;

        try {
            // Verify Write Permission
            const hasPermission = await verifyPermission(state.saveDirectoryHandle, true);
            if (!hasPermission) {
                dispatch({ type: 'ADD_LOG', payload: { message: "Permission Denied. Re-connect folder in settings.", type: 'error' } });
                return;
            }

            await saveAssetToDisk(state.saveDirectoryHandle, filename, file);
            // Reload to get blob URL
            const url = await loadAssetFromDisk(state.saveDirectoryHandle, filename);

            if (url) {
                setCustomArchetypeCovers(prev => ({
                    ...prev,
                    [storageKey]: url
                }));
                dispatch({ type: 'ADD_LOG', payload: { message: "Archetype Cover Saved", type: 'success' } });
            }

        } catch (error) {
            console.error("Failed to save cover to disk", error);
            dispatch({ type: 'ADD_LOG', payload: { message: `Save Failed: ${error}`, type: 'error' } });
        }
    };

    const handleArchetypeCoverDelete = async (storageKey: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setShowCoverDeleteConfirm(storageKey);
    };

    const confirmCoverDelete = async () => {
        if (!showCoverDeleteConfirm) return;
        const storageKey = showCoverDeleteConfirm;
        setShowCoverDeleteConfirm(null);

        if (!state.saveDirectoryHandle) return;

        const filename = `Archetype_${storageKey}.png`;

        try {
            await deleteAssetFromDisk(state.saveDirectoryHandle, filename);

            setCustomArchetypeCovers(prev => {
                const next = { ...prev };
                delete next[storageKey];
                return next;
            });
            dispatch({ type: 'ADD_LOG', payload: { message: "Cover Reverted to Default", type: 'info' } });

        } catch (error) {
            console.error("Failed to delete cover from disk", error);
        }
    };

    const getArchetypes = (variant: MorphVariant): ArchetypeOption[] => {
        switch (variant) {
            case 'fem': return [
                { id: 'titan', name: 'The Amazon', desc: 'Tall, athletic strength, powerful feminine build', icon: Zap, defaultImage: titanFem },
                { id: 'scout', name: 'The Muse', desc: 'Slender, grace, agile elegance', icon: Sparkles, defaultImage: scoutFem },
                { id: 'guardian', name: 'The Matriarch', desc: 'Curvaceous, heavy-set, commanding presence', icon: Shield, defaultImage: guardianFem },
                { id: 'sprite', name: 'The Fae', desc: 'Petite, ethereal, stylized proportions', icon: Ghost, defaultImage: spriteFem }
            ];
            case 'youth_masc': return [
                { id: 'titan', name: 'The Prodigy', desc: 'Strong for age, athletic youth', icon: Swords, defaultImage: titanYouth },
                { id: 'scout', name: 'The Rascal', desc: 'Wiry, quick, mischievous energy', icon: Zap, defaultImage: scoutYouth },
                { id: 'guardian', name: 'The Husky', desc: 'Solid, chubby, sturdy frame', icon: Shield, defaultImage: guardianYouth },
                { id: 'sprite', name: 'The Chibi', desc: 'Cute, oversized head, toddler proportions', icon: Ghost, defaultImage: spriteYouth }
            ];
            case 'youth_fem': return [
                { id: 'titan', name: 'The Prodigy', desc: 'Strong for age, athletic youth', icon: Swords, defaultImage: titanYouthFem },
                { id: 'scout', name: 'The Rascal', desc: 'Wiry, quick, mischievous energy', icon: Zap, defaultImage: scoutYouthFem },
                { id: 'guardian', name: 'The Husky', desc: 'Solid, chubby, sturdy frame', icon: Shield, defaultImage: guardianYouthFem },
                { id: 'sprite', name: 'The Chibi', desc: 'Cute, oversized head, toddler proportions', icon: Ghost, defaultImage: spriteYouthFem }
            ];
            // Fallback for MASC and default
            default: return [
                { id: 'titan', name: 'The Titan', desc: 'Heroic V-taper, broad shoulders, muscular frame', icon: Swords, defaultImage: titanMasc },
                { id: 'scout', name: 'The Scout', desc: 'Slim, agile, tall, sleek athletic build', icon: Zap, defaultImage: scoutMasc },
                { id: 'guardian', name: 'The Guardian', desc: 'Stocky, powerhouse, heavy-set, rectangular frame', icon: Shield, defaultImage: guardianMasc },
                { id: 'sprite', name: 'The Sprite', desc: 'Stylized Chibi proportions, oversized head', icon: Ghost, defaultImage: spriteMasc }
            ];
        }
    };

    const bodyArchetypes = getArchetypes(morphVariant);

    // --- PHASE 3: STYLE SYNTHESIS ---
    const [selectedStyle, setSelectedStyle] = useState<string | null>(() =>
        nanoCastSession.selectedStyle ? normalizeStyleId(nanoCastSession.selectedStyle) : null
    );

    const [currentResultStyleId, setCurrentResultStyleId] = useState<string | null>(() =>
        nanoCastSession.selectedStyle ? normalizeStyleId(nanoCastSession.selectedStyle) : null
    );

    // --- PHASE 3: BODY SCOPE (REQUIRED AFTER STYLE) ---
    const [bodyScope, setBodyScope] = useState<BodyScope | null>(() => {
        if (nanoCastSession.bodyScope) return nanoCastSession.bodyScope;
        // STEP 12: PERSISTENCE (RESTORE)
        const saved = localStorage.getItem('nano_body_scope');
        return (saved === 'head' || saved === 'torso' || saved === 'full') ? saved : null;
    });

    // STEP 12 & 15: PERSISTENCE (SAVE) & TELEMETRY
    useEffect(() => {
        if (bodyScope) {
            localStorage.setItem('nano_body_scope', bodyScope);
            // STEP 15: TELEMETRY
            console.log("event: body_scope_selected", { scope: bodyScope, style: selectedStyle });
        }
    }, [bodyScope, selectedStyle]);

    // Ensure style rules override persistence if incompatible
    useEffect(() => {
        if (selectedStyle && bodyScope) {
            const rules = STYLE_SCOPE_RULES[selectedStyle] ?? STYLE_SCOPE_RULES.default;
            if (!rules.allowed.includes(bodyScope)) {
                setBodyScope(null); // Force reset if invalid for new style
            }
        }
    }, [selectedStyle, bodyScope]);

    // --- STYLE CONFIGURATION BY CATEGORY ---
    const getStyleMatrix = (_variant: MorphVariant) => {
        // Unified active images mapping
        const activeImages = {
            premium_animated_3d: coverPremiumAnimated3D,
            hyper_real: coverHyperReal,
            retro_anime: coverRetroAnime,
            comic_book: coverComicBook,
            cyberpunk: coverCyberpunk,
            exact_studio: coverExactStudio
        };

        return {
            premium_animated_3d: {
                id: 'premium_animated_3d', label: 'Premium Animated 3D',
                keywords: "High-end animated-feature 3D character studio style, likeness-preserving stylized proportions, source-mapped eye spacing, source-mapped brow/nose/mouth/jaw landmarks, soft sculpted shapes around the actual scanned face, vibrant colors, subsurface scattering, rim lighting, soft textures, polished premium CG render, masterpiece 3D.",
                lighting: "Golden hour, cinematic bounce light",
                image: activeImages.premium_animated_3d
            },
            hyper_real: {
                id: 'hyper_real', label: 'Premium CG Realism',
                keywords: "Photorealistic 4k, raw photo, exact facial structure preservation, 3d scan, photogrammetry, highly detailed skin pores, 85mm lens, f/1.8, cinematic natural lighting, sharp focus, masterpiece, biometric fidelity.",
                lighting: "High-contrast studio lighting",
                image: activeImages.hyper_real
            },
            retro_anime: {
                id: 'retro_anime', label: 'Retro Cel Anime',
                keywords: "adult biometric portrait translated into retro cel animation style, clean linework, flat color shapes, cel shading, simplified shadow edges, restrained anime influence, preserved real eye spacing, preserved real nose and mouth relationship, preserved adult jaw and chin structure, clean facial surface, identity-faithful retro animation finish.",
                lighting: "Soft diffused daylight",
                image: activeImages.retro_anime
            },
            comic_book: {
                id: 'comic_book', label: 'Graphic Novel Noir',
                keywords: "Modern graphic novel style, heavy ink outlines, Halftone dot patterns, high contrast, dramatic shadows, bold dynamic lines.",
                lighting: "Hard noir shadows",
                image: activeImages.comic_book
            },
            cyberpunk: {
                id: 'cyberpunk', label: 'Cyberpunk V2',
                keywords: "Futuristic tech-wear, neon glow, wet pavement reflections, volumetric fog, teal and orange palette, high-tech interface overlays.",
                lighting: "Neon-drenched night",
                image: activeImages.cyberpunk
            },
            exact_studio: {
                id: 'exact_studio', label: 'Exact Likeness Studio',
                keywords: "Ultra-realistic 4k portrait, 1:1 identity replication, strict facial feature preservation, studio lighting, highly detailed skin texture, raw photography, 85mm lens, sharp focus, masterpiece, identity locked.",
                lighting: "Professional studio lighting",
                image: activeImages.exact_studio
            }
        };
    };

    const styleMatrix = getStyleMatrix(morphVariant);

    // --- PHASE 4 & 5: STATE ---
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState({ phase: '', percent: 0, detail: '' });
    const [uploadMode, setUploadMode] = useState(false);
    const abortControllerRef = useRef<AbortController | null>(null);

    // --- REF SHEET GENERATOR STATE ---
    const [showRefSheet, setShowRefSheet] = useState(false);
    const [refSheetUrl, setRefSheetUrl] = useState<string | null>(null);
    const [refLayout, setRefLayout] = useState<ReferenceLayout>('form_focus');
    const [refStyle, setRefStyle] = useState<RefSheetStyleId>('family_3d');

    // Inherit the style choice from Phase 3 (Style Synthesis)
    useEffect(() => {
        if (selectedStyle) {
            setRefStyle(mapSelectedStyleToRefStyle(selectedStyle));
        }
    }, [selectedStyle]);

    const [identitySource, setIdentitySource] = useState<'hybrid' | 'biometric' | 'generated'>(() => nanoCastSession.identitySource);
    const [refSheetIdentityAnchors, setRefSheetIdentityAnchors] = useState<NanoRefSheetHandoff['identityImages'] | null>(null);
    // sheetContent is now derived from refLayout (face_focus = head, others = full)
    // Numeric body controls (more precise than categorical presets)
    const [weightLbs, setWeightLbs] = useState<number>(() => nanoCastSession.weightLbs); // 90–300
    // OPTIMIZATION: Local state for slider to prevent heavy re-renders during drag
    const [localWeight, setLocalWeight] = useState<number>(() => nanoCastSession.weightLbs);

    // Sync local weight when external weight changes (e.g. reset)
    useEffect(() => {
        setLocalWeight(weightLbs);
    }, [weightLbs]);

    // --- AUTO-SYNC: SCOPE -> FRAMING ---
    useEffect(() => {
        if (!bodyScope) return;

        // Auto-update Director Controls based on Scope
        setDirectorControls(prev => {
            let framing: 'bust' | 'half_body' | 'full_body' = 'full_body';
            if (bodyScope === 'head') framing = 'bust';
            if (bodyScope === 'torso') framing = 'half_body';

            // Silent update only if changed
            if (prev.shotFraming !== framing) {
                return { ...prev, shotFraming: framing };
            }
            return prev;
        });

        // Auto-update Ref Sheet Layout
        if (bodyScope === 'head') setRefLayout('face_focus');
        else if (bodyScope === 'torso') setRefLayout('split_focus');
        else setRefLayout('form_focus');

    }, [bodyScope]);

    const [heightIn, setHeightIn] = useState<number>(() => nanoCastSession.heightIn); // 36–108 (3'0"–9'0")

    // --- DIRECTOR CONTROLS ---
    const [showSettings, setShowSettings] = useState(false);
    const [directorControls, setDirectorControls] = useState<NanoCastSessionDirectorControls>(() => ({
        ...nanoCastSession.directorControls
    }));

    useEffect(() => {
        dispatch({
            type: 'SET_NANO_CAST_SESSION_METADATA',
            payload: {
                selectedStyle,
                selectedBody,
                bodyScope,
                identitySource,
                heightIn,
                weightLbs,
                directorControls
            }
        });
    }, [bodyScope, directorControls, dispatch, heightIn, identitySource, selectedBody, selectedStyle, weightLbs]);

    // --- PHASE 1: BIOMETRIC SCANNER STATE ---
    const webcamRef = useRef<Webcam>(null);
    const [capturedAngles, setCapturedAngles] = useState<BiometricCaptureMap>(() => ({
        ...createEmptyBiometricCaptureMap(),
        ...nanoCastSession.biometricImages
    }));
    const scanAudioContextRef = useRef<AudioContext | null>(null);
    const scanAudioBufferCacheRef = useRef<Partial<Record<BiometricCaptureAngle, AudioBuffer | null>>>({});
    const scanToneLastPlayedAtRef = useRef<Record<BiometricCaptureAngle, number>>({
        center: 0,
        left: 0,
        right: 0,
        up: 0,
        down: 0
    });


    // --- LIVE PROGRESS SIMULATION ---
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isProcessing && progress.phase === 'synthesis') {
            const getEta = () => {
                if (state.imageResolution === '4K') return 90000; // 90s ETA for 4K
                if (state.imageResolution === '2K') return 45000; // 45s ETA for 2K
                return 20000; // 20s ETA for 1K
            };
            const eta = getEta();
            const updateMs = 1000; // Update every second
            const increment = (updateMs / eta) * 100;

            interval = setInterval(() => {
                setProgress(p => {
                    if (p.phase === 'synthesis' && p.percent < 95) {
                        return { ...p, percent: Math.min(95, p.percent + increment) };
                    }
                    return p;
                });
            }, updateMs);
        }
        return () => clearInterval(interval);
    }, [isProcessing, progress.phase, state.imageResolution]);

    const ensureScanAudioContext = useCallback(async (): Promise<AudioContext | null> => {
        if (typeof window === 'undefined') return null;

        try {
            const AudioContextCtor = window.AudioContext || (window as WindowWithWebkitAudioContext).webkitAudioContext;
            if (!AudioContextCtor) return null;

            const audioContext =
                scanAudioContextRef.current && scanAudioContextRef.current.state !== 'closed'
                    ? scanAudioContextRef.current
                    : new AudioContextCtor();
            scanAudioContextRef.current = audioContext;

            if (audioContext.state === 'suspended') {
                await audioContext.resume();
            }

            return audioContext;
        } catch (error) {
            console.warn('Biometric scan audio unavailable:', error);
            return null;
        }
    }, []);

    const loadBiometricCaptureAudioBuffer = useCallback(async (
        angle: BiometricCaptureAngle,
        audioContext: AudioContext
    ): Promise<AudioBuffer | null> => {
        const cached = scanAudioBufferCacheRef.current[angle];
        if (cached !== undefined) return cached;

        for (const url of getBiometricCaptureAudioCandidates(angle)) {
            let response: Response;
            try {
                response = await fetch(url, { cache: 'no-cache' });
            } catch {
                continue;
            }

            if (!response.ok) continue;

            try {
                const arrayBuffer = await response.arrayBuffer();
                const decodedBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
                scanAudioBufferCacheRef.current[angle] = decodedBuffer;
                return decodedBuffer;
            } catch (error) {
                console.warn(`Biometric scan audio file could not be decoded: ${url}`, error);
            }
        }

        scanAudioBufferCacheRef.current[angle] = null;
        return null;
    }, []);

    const playBiometricCaptureAudioFile = useCallback((
        audioContext: AudioContext,
        audioBuffer: AudioBuffer,
        perceivedVolume: number
    ) => {
        const startAt = audioContext.currentTime + 0.01;
        const source = audioContext.createBufferSource();
        const fileGain = audioContext.createGain();
        const outputCompressor = audioContext.createDynamicsCompressor();

        source.buffer = audioBuffer;
        outputCompressor.threshold.setValueAtTime(-12, startAt);
        outputCompressor.knee.setValueAtTime(8, startAt);
        outputCompressor.ratio.setValueAtTime(5, startAt);
        outputCompressor.attack.setValueAtTime(0.003, startAt);
        outputCompressor.release.setValueAtTime(0.08, startAt);
        fileGain.gain.setValueAtTime(Math.max(0.0001, BIOMETRIC_CAPTURE_FILE_GAIN * perceivedVolume), startAt);

        source.connect(fileGain);
        fileGain.connect(outputCompressor);
        outputCompressor.connect(audioContext.destination);
        source.start(startAt);
        source.onended = () => {
            try {
                source.disconnect();
                fileGain.disconnect();
                outputCompressor.disconnect();
            } catch {
                // Nodes may already be disconnected if the audio context is torn down.
            }
        };
    }, []);

    const playBiometricCaptureTone = useCallback(async (angle: BiometricCaptureAngle) => {
        if (!state.biometricSoundEnabled || state.biometricSoundVolume <= 0) return;

        const now = Date.now();
        if (now - scanToneLastPlayedAtRef.current[angle] < 350) return;
        scanToneLastPlayedAtRef.current[angle] = now;

        try {
            const audioContext = await ensureScanAudioContext();
            if (!audioContext || audioContext.state !== 'running') return;

            const profile = BIOMETRIC_CAPTURE_TONES[angle];
            const volume = Math.min(1, Math.max(0, state.biometricSoundVolume / 100));
            const perceivedVolume = Math.pow(volume, 0.72);
            const customAudioBuffer = await loadBiometricCaptureAudioBuffer(angle, audioContext);
            if (customAudioBuffer) {
                playBiometricCaptureAudioFile(audioContext, customAudioBuffer, perceivedVolume);
                return;
            }

            const startAt = audioContext.currentTime + 0.015;
            const masterGain = audioContext.createGain();
            const outputCompressor = audioContext.createDynamicsCompressor();
            outputCompressor.threshold.setValueAtTime(-16, startAt);
            outputCompressor.knee.setValueAtTime(10, startAt);
            outputCompressor.ratio.setValueAtTime(6, startAt);
            outputCompressor.attack.setValueAtTime(0.003, startAt);
            outputCompressor.release.setValueAtTime(0.08, startAt);
            masterGain.gain.setValueAtTime(0.0001, startAt);
            masterGain.gain.exponentialRampToValueAtTime(Math.max(0.0001, BIOMETRIC_CAPTURE_MAX_GAIN * perceivedVolume), startAt + 0.015);
            masterGain.gain.exponentialRampToValueAtTime(0.0001, startAt + profile.duration);
            masterGain.connect(outputCompressor);
            outputCompressor.connect(audioContext.destination);

            profile.notes.forEach((frequency, index) => {
                const oscillator = audioContext.createOscillator();
                const toneGain = audioContext.createGain();
                const noteStart = startAt + (index * 0.045);
                oscillator.type = index === 0 ? 'sine' : 'triangle';
                oscillator.frequency.setValueAtTime(frequency, noteStart);
                toneGain.gain.setValueAtTime(0.0001, noteStart);
                toneGain.gain.exponentialRampToValueAtTime(BIOMETRIC_CAPTURE_TONE_GAIN, noteStart + 0.012);
                toneGain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.12);
                oscillator.connect(toneGain);
                toneGain.connect(masterGain);
                oscillator.start(noteStart);
                oscillator.stop(noteStart + 0.15);
            });

            const accent = audioContext.createOscillator();
            const accentGain = audioContext.createGain();
            const accentStart = startAt + 0.055;
            accent.type = 'sine';
            accent.frequency.setValueAtTime(profile.accent, accentStart);
            accentGain.gain.setValueAtTime(0.0001, accentStart);
            accentGain.gain.exponentialRampToValueAtTime(BIOMETRIC_CAPTURE_ACCENT_GAIN, accentStart + 0.01);
            accentGain.gain.exponentialRampToValueAtTime(0.0001, accentStart + 0.09);
            accent.connect(accentGain);
            accentGain.connect(masterGain);
            accent.start(accentStart);
            accent.stop(accentStart + 0.11);

            window.setTimeout(() => {
                try {
                    masterGain.disconnect();
                    outputCompressor.disconnect();
                } catch {
                    // Nodes may already be disconnected if the audio context is torn down.
                }
            }, Math.ceil((profile.duration + 0.35) * 1000));
        } catch (error) {
            console.warn('Biometric capture tone failed:', error);
        }
    }, [
        ensureScanAudioContext,
        loadBiometricCaptureAudioBuffer,
        playBiometricCaptureAudioFile,
        state.biometricSoundEnabled,
        state.biometricSoundVolume
    ]);

    useEffect(() => {
        if (!state.biometricSoundEnabled) return;

        const unlockScanAudio = () => {
            void ensureScanAudioContext();
        };

        window.addEventListener('pointerdown', unlockScanAudio, { passive: true });
        window.addEventListener('keydown', unlockScanAudio);
        return () => {
            window.removeEventListener('pointerdown', unlockScanAudio);
            window.removeEventListener('keydown', unlockScanAudio);
        };
    }, [ensureScanAudioContext, state.biometricSoundEnabled]);

    useEffect(() => {
        return () => {
            if (scanAudioContextRef.current && scanAudioContextRef.current.state !== 'closed') {
                void scanAudioContextRef.current.close();
            }
        };
    }, []);

    // Refs for stable access inside callbacks without re-triggering
    const capturedAnglesRef = useRef(capturedAngles);

    // Explicit setter to handle cleanup and mirror scan inputs into app-session state.
    const setAngle = useCallback((angle: BiometricCaptureAngle, url: string | null) => {
        const oldUrl = capturedAnglesRef.current[angle];
        if (oldUrl && oldUrl !== url) {
            URL.revokeObjectURL(oldUrl);
        }
        if (url && oldUrl !== url) {
            void playBiometricCaptureTone(angle);
        }

        const nextAngles = { ...capturedAnglesRef.current, [angle]: url };
        capturedAnglesRef.current = nextAngles;
        setCapturedAngles(nextAngles);
        dispatch({ type: 'SET_NANO_CAST_BIOMETRIC_IMAGE', payload: { angle, imageUrl: url } });
    }, [dispatch, playBiometricCaptureTone]);

    const [yaw, setYaw] = useState(0);
    const [pitch, setPitch] = useState(0);
    const [activeSector, setActiveSector] = useState<'center' | 'left' | 'right' | 'up' | 'down' | null>(null);

    const [stabilityProgress, setStabilityProgress] = useState(0);
    const [cameraEnabled, setCameraEnabled] = useState(false);
    const [webcamReadyTick, setWebcamReadyTick] = useState(0);

    // --- PERSISTENCE & WARDROBE STATES ---
    const [sidebarMode, setSidebarMode] = useState<'director' | 'wardrobe'>('director');
    const [wardrobePrompt, setWardrobePrompt] = useState("");



    // Scan Stability Logic
    const lastSectorRef = useRef<string | null>(null);
    const sectorStableFramesRef = useRef(0);
    const scanCooldownRef = useRef(false);
    const lastUpdateRef = useRef(0);
    const STABILITY_THRESHOLD = 15; // Frames to hold steady
    const SCAN_COOLDOWN_MS = 1500;
    const captureCurrentFrameRef = useRef<((sector: keyof typeof capturedAngles) => Promise<void> | void) | null>(null);

    const resetScanTracking = useCallback(() => {
        scanCooldownRef.current = false;
        lastSectorRef.current = null;
        sectorStableFramesRef.current = 0;
        lastUpdateRef.current = 0;
        setActiveSector(null);
        setStabilityProgress(0);
    }, []);

    // Helper: Convert Base64 to Blob URL for memory efficiency
    const base64ToBlobUrl = (base64: string) => {
        const byteString = atob(base64.split(',')[1]);
        const mimeString = base64.split(',')[0].split(':')[1].split(';')[0];
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
        }
        const blob = new Blob([ab], { type: mimeString });
        return URL.createObjectURL(blob);
    };

    // Fix for Stale State in Closures
    const stateRef = useRef(state);
    useEffect(() => { stateRef.current = state; }, [state]);

    // Update ref when state changes
    useEffect(() => {
        capturedAnglesRef.current = capturedAngles;
    }, [capturedAngles]);

    useEffect(() => {
        const sessionAngles: BiometricCaptureMap = {
            ...createEmptyBiometricCaptureMap(),
            ...state.nanoCastSession.biometricImages
        };

        if (areBiometricCaptureMapsEqual(capturedAnglesRef.current, sessionAngles)) return;

        capturedAnglesRef.current = sessionAngles;
        setCapturedAngles(sessionAngles);
    }, [state.nanoCastSession.biometricImages]);

    // FaceMesh Setup
    const onResults = useCallback((results: FaceMeshResult) => {
        // Throttle updates to ~10fps to reduce React render load
        const now = Date.now();
        if (now - lastUpdateRef.current < 100) return;
        lastUpdateRef.current = now;

        if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
            setActiveSector(null);
            setStabilityProgress(0);
            sectorStableFramesRef.current = 0;
            return;
        }

        const landmarks = results.multiFaceLandmarks[0];
        // Heuristic Pose Estimation
        const nose = landmarks[1];
        const leftEar = landmarks[234];
        const rightEar = landmarks[454];
        const chin = landmarks[152];
        const forehead = landmarks[10];

        // Yaw Calculation
        const midEarX = (leftEar.x + rightEar.x) / 2;
        const noseOffset = nose.x - midEarX;
        const estimatedYaw = noseOffset * 400;

        // Pitch Calculation
        const midFaceY = (forehead.y + chin.y) / 2;
        const noseOffsetY = nose.y - midFaceY;
        const estimatedPitch = noseOffsetY * -500;

        setYaw(estimatedYaw);
        setPitch(estimatedPitch);

        // Center Proximity Check (Strict Centering)
        // Nose is landmarks[1]
        const centerX = nose.x;
        const centerY = nose.y;
        const distFromCenter = Math.sqrt(Math.pow(centerX - 0.5, 2) + Math.pow(centerY - 0.5, 2));

        // Threshold: 0.25 radius (approx 25% away from center - Relaxed for usability)
        const isCentered = distFromCenter < 0.25;

        // Check Thresholds - Adjusted for comfortable 45-degree capture
        let currentSector: 'center' | 'left' | 'right' | 'up' | 'down' | null = null;

        if (!isCentered) {
            // WARNING ONLY - Do not block
            // currentSector = null; 
        } else if (estimatedPitch > 12) currentSector = 'up';
        else if (estimatedPitch < -10) currentSector = 'down';
        else if (estimatedYaw > 20) currentSector = 'left';
        else if (estimatedYaw < -20) currentSector = 'right';
        else if (Math.abs(estimatedYaw) < 10 && Math.abs(estimatedPitch) < 10) currentSector = 'center';

        setActiveSector(currentSector);

        // Auto-Capture Logic with Guardrails
        if (currentSector && webcamRef.current && !scanCooldownRef.current) {
            // Check if already captured
            if (capturedAnglesRef.current[currentSector]) {
                setStabilityProgress(100); // Already done
                return;
            }

            // Stability Check
            if (currentSector === lastSectorRef.current) {
                sectorStableFramesRef.current++;
            } else {
                lastSectorRef.current = currentSector;
                sectorStableFramesRef.current = 0;
            }

            // Update Progress UI
            const progress = Math.min(100, (sectorStableFramesRef.current / STABILITY_THRESHOLD) * 100);
            setStabilityProgress(progress);

            if (sectorStableFramesRef.current > STABILITY_THRESHOLD) {
                captureCurrentFrameRef.current?.(currentSector);
            }
        } else {
            // Reset stability if lost sector
            sectorStableFramesRef.current = 0;
            setStabilityProgress(0);
        }
    }, []);

    const captureCurrentFrame = useCallback(async (sector: keyof typeof capturedAngles) => {
        console.log("Attempting Capture:", sector);
        void ensureScanAudioContext();
        if (!webcamRef.current) { console.log("No Webcam Ref"); return; }
        const imageSrc = webcamRef.current.getScreenshot();
        if (imageSrc) {
            // IMMEDIATE SYNCHRONOUS STATE UPDATES
            // Prevent re-entry immediately
            scanCooldownRef.current = true;
            sectorStableFramesRef.current = 0;
            setStabilityProgress(0);

            // Set timeout to clear cooldown
            setTimeout(() => {
                scanCooldownRef.current = false;
            }, SCAN_COOLDOWN_MS);

            const blobUrl = base64ToBlobUrl(imageSrc);

            // Trigger capture
            setAngle(sector, blobUrl);

            // Auto-Save Logic (Async)
            if (stateRef.current.saveDirectoryHandle) {
                try {
                    const scansDir = await stateRef.current.saveDirectoryHandle.getDirectoryHandle('Scans', { create: true });
                    const filename = createUniqueDownloadFilename(`Scan_${sector.toUpperCase()}.png`);
                    const fileHandle = await scansDir.getFileHandle(filename, { create: true });
                    const writable = await fileHandle.createWritable();

                    // Convert Base64 to Blob
                    const byteString = atob(imageSrc.split(',')[1]);
                    const ab = new ArrayBuffer(byteString.length);
                    const ia = new Uint8Array(ab);
                    for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
                    const blob = new Blob([ab], { type: 'image/png' });

                    await writable.write(blob);
                    await writable.close();
                } catch (err) {
                    console.error("Auto-save failed:", err);
                }
            } else {
                console.warn("Auto-save skipped: No save directory configured.");
                // Optional: notifying user might be too spammy if they haven't set it yet, but useful for debugging this issue
                // dispatch({ type: 'ADD_LOG', payload: { message: "Scan not saved: No save folder set in Settings.", type: 'error' } });
            }
        }
    }, [ensureScanAudioContext, setAngle]);

    useEffect(() => {
        captureCurrentFrameRef.current = captureCurrentFrame;
    }, [captureCurrentFrame]);

    useEffect(() => {
        let camera: Camera | null = null;
        let faceMesh: FaceMesh | null = null;
        let isActive = true;
        const waitForWebcamVideo = async (): Promise<HTMLVideoElement | null> => {
            for (let attempt = 0; attempt < 30 && isActive; attempt++) {
                const video = webcamRef.current?.video ?? null;
                if (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
                    return video;
                }
                await new Promise(resolve => window.setTimeout(resolve, 100));
            }
            return webcamRef.current?.video ?? null;
        };

        const initFaceMesh = async () => {
            faceMesh = new FaceMesh({
                locateFile: (file) => {
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
                }
            });

            faceMesh.setOptions({
                maxNumFaces: 1,
                refineLandmarks: true,
                minDetectionConfidence: 0.15, // Extremely low for maximum recall
                minTrackingConfidence: 0.15
            });

            faceMesh.onResults(onResults);

            const video = await waitForWebcamVideo();

            if (video && isActive) {
                camera = new Camera(video, {
                    onFrame: async () => {
                        if (webcamRef.current?.video && isActive) {
                            await faceMesh?.send({ image: webcamRef.current.video });
                        }
                    },
                    width: 1280,
                    height: 720
                });
                await camera.start();
            }
        };

        if (phase === 1 && !uploadMode && cameraEnabled) {
            initFaceMesh();
        }

        return () => {
            isActive = false;
            if (camera) camera.stop();
            if (faceMesh) faceMesh.close();
        };
    }, [phase, uploadMode, onResults, cameraEnabled, webcamReadyTick]);


    // Helper: Fetch Blob URL and convert to Base64 for API
    const getBase64FromBlobUrl = async (blobUrl: string): Promise<string> => {
        const response = await fetch(blobUrl);
        const blob = await response.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
        });
    };



    // ... existing imports ...

    // --- SAVING FUNCTIONS ---

    const handleSaveToWardrobe = async () => {
        if (!finalCharacterUrl || (!state.saveDirectoryHandle && !state.saveDirectoryPath)) {
            if (!state.saveDirectoryHandle && !state.saveDirectoryPath) dispatch({ type: 'ADD_LOG', payload: { message: "No save folder configured in settings.", type: 'error' } });
            return;
        }
        try {
            const mat = await LibraryAssetMaterializer.materializeWardrobeAsset({
                sourceUrl: finalCharacterUrl,
                saveDirectoryPath: state.saveDirectoryPath,
                prompt: "Generated from NanoCasting"
            });

            const newItem = {
                id: mat.filename || `WARDROBE-${Date.now()}.png`,
                url: mat.url,
                localPath: mat.localPath || undefined,
                sourceUrl: mat.sourceUrl,
                filename: mat.filename,
                name: "Nano Creation",
                prompt: "Generated from NanoCasting",
                category: "Nano",
                timestamp: Date.now()
            };

            dispatch({ type: 'ADD_WARDROBE_ITEM', payload: newItem });
            dispatch({ type: 'ADD_LOG', payload: { message: `Saved to Wardrobe: ${mat.filename || "Storage"}`, type: 'success' } });
        } catch (error: unknown) {
            dispatch({ type: 'ADD_LOG', payload: { message: `Wardrobe save failed: ${getErrorMessage(error)}`, type: 'error' } });
        }
    };

    const generateWardrobe = async () => {
        const billingMode = state.billingEntitlements.effectiveBillingMode;
        if (billingMode === "byok" && !state.apiKey) { dispatch({ type: 'ADD_LOG', payload: { message: 'API Key required for BYOK', type: 'error' } }); return; }

        if (!wardrobePrompt && !selectedWardrobeItem) return;
        if (!(await ensureAuthenticatedForGeneration({ billingMode, featureLabel: 'Nano Cast wardrobe generation' }))) {
            return;
        }

        setIsProcessing(true);
        setProgress({ phase: 'synthesis', percent: 5, detail: "Weaving digital fabric..." });

        try {
            let garment = "";

            const timeoutPromise = (ms: number): Promise<never> => new Promise((_, reject) => setTimeout(() => reject(new Error('Request timed out')), ms));
            const getTimeoutMs = () => state.imageResolution === '4K' ? 120000 : (state.imageResolution === '2K' ? 90000 : 45000);

            // 1. Determine Garment Source
            if (selectedWardrobeItem) {
                // Use selected item from library
                garment = selectedWardrobeItem.url;
            } else {
                // Generate new from prompt
                setProgress({ phase: 'synthesis', percent: 30, detail: "Synthesizing garment geometry..." });
                garment = await Promise.race([
                    GeminiService.generateImage(
                        `Create a single image.

GARMENT AUTHORITY
- Render one standalone garment only based on this description: ${wardrobePrompt}.
- Preserve the intended silhouette, materials, colors, and visible construction.
- Do not add a model, mannequin head, props, text, or extra accessories.

COMPOSITION
- Isolated garment only.
- Solid white studio background.
- Full garment visible.

NEGATIVE CONSTRAINTS:
extra garments, mannequin person, text, watermark, props, cropped garment, altered colors, redesign.`,
                        state.apiKey,
                        state.model,
                        [],
                        { aspectRatio: '1:1', imageSize: state.imageResolution, thinkingLevel: state.enableImageThinking, googleGrounding: false, strictMode: true, billingMode: state.billingEntitlements.effectiveBillingMode as 'hosted' | 'byok', entitlements: state.billingEntitlements }
                    ),
                    timeoutPromise(getTimeoutMs())
                ]);
            }

            // 2. Try-On (Simulated by sending garment + current character to Gemini)
            if (finalCharacterUrl) {
                setProgress({ phase: 'synthesis', percent: 70, detail: "Performing virtual fitting..." });
                const fitted = await Promise.race([
                    GeminiService.generateImage(
                        `Create a single image.

SUBJECT LOCK
- [IMAGE 1] is the subject. Preserve the exact identity, pose, framing, and body proportions.

COSTUME AUTHORITY
- [IMAGE 2] is the outfit reference. Transfer it exactly onto the subject.
- Preserve the outfit silhouette, colors, materials, and visible construction.
- Do not redesign the outfit.

COMPOSITION
- Match the original framing and aspect ratio of [IMAGE 1].
- Single subject only.
- Studio-quality lighting.

NEGATIVE CONSTRAINTS:
identity drift, altered pose, changed framing, extra limbs, extra people, redesigned outfit, altered colors, text, watermark.`,
                        state.apiKey,
                        state.model,
                        [
                            { url: finalCharacterUrl, label: "Subject" },
                            { url: garment, label: "New Outfit" }
                        ],
                        { aspectRatio: '2:3', imageSize: state.imageResolution, thinkingLevel: state.enableImageThinking, googleGrounding: false, strictMode: true, billingMode: state.billingEntitlements.effectiveBillingMode as 'hosted' | 'byok', entitlements: state.billingEntitlements } // Portrait
                    ),
                    timeoutPromise(getTimeoutMs())
                ]);

                const rawFittedUrl = fitted;
                let safeFittedUrl = rawFittedUrl;
                try {
                    safeFittedUrl = await materializeDisplayUrl(rawFittedUrl);
                } catch {}
                applyFinalCharacterUrl(safeFittedUrl, true);
                dispatch({ type: 'ADD_LOG', payload: { message: "Virtual fitting complete.", type: 'success' } });
            }

        } catch (error: unknown) {
            dispatch({ type: 'ADD_LOG', payload: { message: getErrorMessage(error), type: 'error' } });
        } finally {
            setIsProcessing(false);
            setProgress({ phase: '', percent: 0, detail: "" });
        }
    };

    // --- PHASE 4 & 5: ORCHESTRATION & REVEAL ---
    const [generationLogs, setGenerationLogs] = useState<string[]>([]);
    const [finalCharacterUrl, setFinalCharacterUrlState] = useState<string | null>(() => nanoCastSession.generatedCharacterUrl);

    const applyFinalCharacterUrl = useCallback((nextUrl: string | null, revokePrevious = false) => {
        setFinalCharacterUrlState(prev => {
            if (revokePrevious && prev && prev !== nextUrl && prev.startsWith('blob:')) {
                URL.revokeObjectURL(prev);
            }
            return nextUrl;
        });
        dispatch({ type: 'SET_NANO_CAST_GENERATED_RESULT', payload: nextUrl });
    }, [dispatch]);

    const clearGeneratedResultForStyleChange = useCallback(() => {
        setCurrentResultStyleId(null);
        setRefSheetIdentityAnchors(null);
        setRefSheetUrl(null);
        setShowRefSheet(false);

        applyFinalCharacterUrl(null, true);

        dispatch({
            type: 'SET_NANO_CAST_SESSION_METADATA',
            payload: {
                generatedCharacterApprovedForPitchSheet: false,
                approvedPitchSheetSourceUrl: null
            }
        });
    }, [applyFinalCharacterUrl, dispatch]);

    useEffect(() => {
        const sessionResultUrl = state.nanoCastSession.generatedCharacterUrl;
        if (sessionResultUrl === finalCharacterUrl) return;

        setFinalCharacterUrlState(sessionResultUrl);
        if (sessionResultUrl) {
            setPhase(5);
        } else {
            setRefSheetIdentityAnchors(null);
            setRefSheetUrl(null);
            setShowRefSheet(false);
            setPhase(prev => prev === 5 ? 3 : prev);
        }
    }, [finalCharacterUrl, state.nanoCastSession.generatedCharacterUrl]);

    const cacheNanoRecentGeneration = (imageUrl: string, prompt: string, createdAt = Date.now()) => {
        if (!imageUrl) return;

        const mode = (state.billingEntitlements.effectiveBillingMode as 'hosted' | 'byok') || 'byok';
        const addTransientRecent = () => {
            useRecentGenerationsStore.getState().addRecentGeneration({
                studio: 'nanocast',
                localCachePath: `transient:nanocast:${createdAt}`,
                displayUrl: imageUrl,
                createdAt,
                prompt,
                mode,
            });
        };

        void (async () => {
            let recentStore = useRecentGenerationsStore.getState();

            if (!recentStore.initialized) {
                await recentStore.initStore();
                recentStore = useRecentGenerationsStore.getState();
            }

            if (!recentStore.cacheDirPath) {
                addTransientRecent();
                return;
            }

            const cacheResult = await RecentGenerationsCacheService.cacheGeneration({
                imageDataUrl: imageUrl,
                studio: 'nanocast',
                cacheDirPath: recentStore.cacheDirPath,
            });

            if (cacheResult.success && cacheResult.localCachePath && cacheResult.displayUrl) {
                useRecentGenerationsStore.getState().addRecentGeneration({
                    studio: 'nanocast',
                    localCachePath: cacheResult.localCachePath,
                    displayUrl: cacheResult.displayUrl,
                    createdAt,
                    prompt,
                    mode,
                });
                return;
            }

            addTransientRecent();
            console.warn('[NanoCastingDirector] Recent generation cache unavailable:', cacheResult.error || 'unknown error');
        })().catch((e) => {
            addTransientRecent();
            console.warn('[NanoCastingDirector] Recent generation caching failed:', e);
        });
    };

    // New: Pack Mode State
    const [generatePackMode] = useState(true);
    const [selectedWardrobeItem, setSelectedWardrobeItem] = useState<WardrobeItem | null>(null);

    // --- TOAST NOTIFICATIONS ---
    const [notification, setNotification] = useState<string | null>(null);
    const showToast = (message: string) => {
        setNotification(message);
        setTimeout(() => setNotification(null), 3000);
    };

    const handleOrchestration = async (
        generationMode: CharacterGenerationMode = "CREATE_NEW_CHARACTER",
        regenerationTarget: RegenerationTarget = "quality_artifacts_only"
    ) => {
        const action = generationMode;
        const normalizedSelectedStyle = selectedStyle ? normalizeStyleId(selectedStyle) : null;
        const normalizedCurrentResultStyle = currentResultStyleId ? normalizeStyleId(currentResultStyleId) : null;

        const canUseCurrentResultStyle =
            generationMode === "REGENERATE_LOCKED_CHARACTER" &&
            Boolean(normalizedCurrentResultStyle) &&
            (!normalizedSelectedStyle || normalizedSelectedStyle === normalizedCurrentResultStyle);

        const effectiveStyleForGeneration = canUseCurrentResultStyle
            ? (normalizedCurrentResultStyle || "premium_animated_3d")
            : (normalizedSelectedStyle || "premium_animated_3d");

        const styleObj = styleMatrix[effectiveStyleForGeneration as keyof typeof styleMatrix] || styleMatrix.premium_animated_3d;
        const selectedStyleLabel = styleObj?.label;

        if (import.meta.env.DEV) {
            console.info("[NanoCast] Active style before generation", {
                action,
                selectedStyle,
                currentResultStyleId,
                effectiveStyleForGeneration,
                selectedStyleLabel,
                canUseCurrentResultStyle
            });
        }

        const billingMode = state.billingEntitlements.effectiveBillingMode as NanoCastGenerationBillingMode;
        let generationTimedOut = false;
        const isLockedRegeneration = generationMode === "REGENERATE_LOCKED_CHARACTER";

        if (billingMode === "byok" && !state.apiKey) {
            dispatch({ type: 'ADD_LOG', payload: { message: "API Key required for BYOK generation.", type: 'error' } });
            return;
        }

        if (isLockedRegeneration && !finalCharacterUrl) {
            showToast("Generate a character before regenerating.");
            return;
        }

        // Enforce Minimum Refs for new biometric character creation.
        if (!isLockedRegeneration && !uploadMode && identitySource !== 'generated' && (!capturedAngles.center || !capturedAngles.left || !capturedAngles.right)) {
            showToast("Missing required angles (Center, Left, Right)");
            return;
        }
        if (!(await ensureAuthenticatedForGeneration({ billingMode, featureLabel: 'Nano Cast generation' }))) {
            return;
        }

        const addLog = (msg: string) => setGenerationLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

        try {
            setPhase(4);
            setGenerationLogs([]);
            abortControllerRef.current = new AbortController();

            addLog(isLockedRegeneration ? "INITIALIZING LOCKED REGENERATION PASS..." : "INITIALIZING NANO NEURAL LINK...");
            setIsProcessing(true);
            setProgress({ phase: 'scanning', percent: 0, detail: "Initializing Biometric Core..." });

            // 1. Prepare References (Convert Blobs to Base64)
            const referenceImages: { url: string; label: string }[] = [];
            let approvedSourceImageIndex: number | null = null;

            const formatImageRange = (startIndex: number, count: number) => {
                if (count <= 0) return "";
                return count === 1
                    ? `[IMAGE ${startIndex}]`
                    : `[IMAGE ${startIndex}] to [IMAGE ${startIndex + count - 1}]`;
            };

            if (isLockedRegeneration && finalCharacterUrl) {
                const approvedSourceUrl = finalCharacterUrl.startsWith('blob:')
                    ? await getBase64FromBlobUrl(finalCharacterUrl)
                    : finalCharacterUrl;
                referenceImages.push({
                    url: approvedSourceUrl,
                    label: "Approved Generated Source Character - locked visual/design source for regeneration. Preserve body, wardrobe, silhouette, style, pose attitude, and current character design."
                });
                approvedSourceImageIndex = referenceImages.length;
            }

            if (identitySource === 'generated' && !isLockedRegeneration) {
                if (!state.lastCastedImage) {
                    addLog("CRITICAL: No recent casted image found.");
                    throw new Error("No recent casted image found. Please generate one in Casting Forge.");
                }
                
                let b64 = state.lastCastedImage;
                if (b64.startsWith('blob:')) {
                    b64 = await getBase64FromBlobUrl(b64);
                } else if (!b64.startsWith('data:')) {
                    // It's likely a local file or HTTP URL. We can pass it, but GeminiService._resolveImageData handles http/blob/data.
                    // For safety, let's just push it, GeminiService will handle it!
                }
                
                referenceImages.push({ url: b64, label: `Generated cast reference - prior character output` });
            }

            const biometricReferenceStartIndex = referenceImages.length + 1;
            if (identitySource !== 'generated' || isLockedRegeneration) {
                const angles: (keyof typeof capturedAngles)[] = ['center', 'left', 'right', 'up', 'down'];
                for (const angle of angles) {
                    const blobUrl = capturedAngles[angle];
                    if (blobUrl) {
                        try {
                            const b64 = await getBase64FromBlobUrl(blobUrl);
                            referenceImages.push({
                                url: b64,
                                label: `Biometric scan identity source - ${angle.toUpperCase()} view - face, skull, visible neck, skin tone, hair state, facial-hair or clean-shaven state, age, and marks authority. Face-dominant scan; not body-mass evidence.`
                            });
                        } catch (err) {
                            console.error(`Failed to process ${angle} angle:`, err);
                        }
                    }
                }
            }
            const biometricRefLimit = Math.max(0, referenceImages.length - biometricReferenceStartIndex + 1);
            const biometricRangeText = formatImageRange(biometricReferenceStartIndex, biometricRefLimit);
            const identityRangeText = biometricRangeText || formatImageRange(1, referenceImages.length);
            const approvedSourceImageId = approvedSourceImageIndex ? `[IMAGE ${approvedSourceImageIndex}]` : null;
            const biometricReferenceIds = biometricRefLimit > 0
                ? Array.from({ length: biometricRefLimit }, (_, index) => `[IMAGE ${biometricReferenceStartIndex + index}]`)
                : [];
            const usesBiometricScanIdentity = biometricRefLimit > 0;

            if (referenceImages.length === 0) {
                addLog("CRITICAL: No valid biometric data found.");
                throw new Error("No reference images");
            }

            if (isLockedRegeneration) {
                const action = generationMode;
                const currentGeneratedResultUrl = finalCharacterUrl;
                console.info("[NanoCast] Locked regeneration path", {
                    action,
                    hasCurrentGeneratedResult: Boolean(currentGeneratedResultUrl),
                    referenceCount: referenceImages.length,
                    firstReferenceIsCurrentResult: Boolean(currentGeneratedResultUrl)
                });
            }

            addLog(`ACQUIRED BIOMETRIC REFERENCES. SYNTHESIZING GRAPH...`);
            setProgress({ phase: 'neural', percent: 40, detail: "Synthesizing Neural Graph..." });

            // 2. Construct Director Prompt
            const styleObj = styleMatrix[effectiveStyleForGeneration as keyof typeof styleMatrix] || styleMatrix.premium_animated_3d;
            const archetypeObj = bodyArchetypes.find(b => b.id === selectedBody) || bodyArchetypes[0];
            const activeStyleId = effectiveStyleForGeneration;

            const biometricIdentityLock = usesBiometricScanIdentity
                ? createBiometricIdentityLock({
                    characterId: nanoCastSession.characterId,
                    referenceViews: (['center', 'left', 'right', 'up', 'down'] as const).filter(angle => Boolean(capturedAngles[angle])),
                    identityRangeText: biometricRangeText,
                    identityStrength: directorControls.identityStrength,
                    selectedStyleLabel: styleObj.label,
                    generatedSourceImageIndex: isLockedRegeneration ? approvedSourceImageIndex : null,
                    generatedSourceRole: isLockedRegeneration && approvedSourceImageIndex
                        ? "approved generated source for body, wardrobe, style, and design continuity only; uploaded biometric references remain identity authority"
                        : undefined,
                    appliesTo: "NanoCast primary generation, regeneration, refinement, preview, validation, pitch-sheet handoff, reference-sheet handoff, recent thumbnail, and export for this character",
                    faceDominant: true
                })
                : undefined;
            const activeBiometricIdentityLock = biometricIdentityLock ?? (isLockedRegeneration ? state.nanoCastSession.identityLock || undefined : undefined);

            if (import.meta.env.DEV && usesBiometricScanIdentity) {
                console.info("[NanoCast Identity] biometric identity images queued before non-identity assets", {
                    count: biometricRefLimit,
                    labels: referenceImages
                        .slice(biometricReferenceStartIndex - 1, biometricReferenceStartIndex - 1 + biometricRefLimit)
                        .map(ref => ref.label)
                });
            }

            // --- F. LOGO / BRANDING ---
            let brandingPrompt = "";
            if (directorControls.logoImage) {
                referenceImages.push({ url: directorControls.logoImage, label: "Logo Asset" });
                const logoRefIndex = referenceImages.length; // 1-based index (Ref images + Logo)

                brandingPrompt += `\nBRANDING DIRECTIVE (CRITICAL):\n`;
                brandingPrompt += `Apply the logo provided in [IMAGE ${logoRefIndex}] ("Logo Asset") to the character's outfit.\n`;
                brandingPrompt += `PLACEMENT: ${directorControls.logoPlacement}. Scale the logo appropriately so it looks like a realistic piece of apparel branding (e.g. left breast pocket size), NOT a massive billboard.\n`;
                brandingPrompt += `INTEGRATION: The logo MUST be fully integrated into the fabric's material. It must warp naturally with the fabric folds and catch the lighting/shadows of the shirt. It must look like highly realistic embroidery or a high-quality screen print that belongs in the scene. DO NOT render it as a flat, glowing, or pasted-on sticker.\n`;
                brandingPrompt += `NOTE: [IMAGE ${logoRefIndex}] is NOT an identity reference. It is a graphic asset.\n`;
            }

            // --- CONDITIONAL OVERRIDES ---
            // "I only want those settings to become active when the person makes a selection in the advanced options."
            // We check if the current values differ from the baseline initialization defaults.

            const lockedRegenerationContract = isLockedRegeneration
                ? buildLockedRegenerationContract({
                    characterId: nanoCastSession.characterId,
                    approvedSourceImageId,
                    biometricReferenceIds,
                    regenerationTarget,
                    identityLockPresent: Boolean(activeBiometricIdentityLock),
                    // bodyLockSource: selectedBody ? "user_selected" : "neutral_default"
                    bodyLockSource: approvedSourceImageId ? "approved_generated_source" : selectedBody ? "user_selected" : "neutral_default",
                    bodyDescription: `${archetypeObj.name}: ${archetypeObj.desc}. Face-only biometric references must not override this body lock.`,
                    faceOnlyBiometricReferences: usesBiometricScanIdentity,
                    styleLockSource: selectedStyle ? "user_selected" : approvedSourceImageId ? "approved_generated_source" : "auto_detected",
                    styleDescription: styleObj.label,
                    costumeLockSource: approvedSourceImageId ? "approved_generated_source" : directorControls.outfit ? "user_selected" : "approved_generated_source",
                    costumeDescription: directorControls.outfit || "the approved generated character costume",
                    allowCostumeChange: regenerationTarget === "wardrobe_v2",
                    allowStyleChange: regenerationTarget === "style_consistency",
                    allowBodyFocusChange: regenerationTarget === "body_focus"
                })
                : "";

            // --- NANO CAST PIPELINE - NANO PROMPT BUILDER INTEGRATION [NANO_BUILDER_LIVE_PATH] ---
            const styleKeyMap: Record<string, string> = {
                'premium_animated_3d': 'premiumAnimated3D',
                'hyper_real': 'premiumCGRealism',
                'premium_cg': 'premiumCGRealism',
                'realism': 'premiumCGRealism',
                'retro_anime': 'retroCelAnime',
                'comic_book': 'graphicNovelNoir',
                'cyberpunk': 'cyberpunkV2',
                'exact_studio': 'exactLikenessStudio'
            };
            const mappedStyleKey = styleKeyMap[selectedStyle || ''] || 'premiumAnimated3D';

            const genderModeMap: Record<string, string> = {
                'masc': 'masculine',
                'fem': 'feminine',
                'youth': 'youthBoy',
                'youth_fem': 'youthGirl'
            };
            const mappedGenderMode = genderModeMap[morphVariant] || 'masculine';
            const toNanoMorphologyKey = (body: string | null): NanoMorphologyKey => (body || "guardian") as NanoMorphologyKey;
            // Code integrity check for tests: buildNanoMorphologyBodyAuthorityContract(toNanoMorphologyKey(selectedBody))

            const defaultHeightIn = 70;
            const defaultWeightLbs = 170;

            const hasExplicitBodyOverride =
                (typeof heightIn === "number" && heightIn !== defaultHeightIn) ||
                (typeof weightLbs === "number" && weightLbs !== defaultWeightLbs);

            const nanoBlueprint: NanoActorBlueprint = {
                identityAnchor: {
                    sourceImageId: usesBiometricScanIdentity
                        ? biometricRangeText
                        : approvedSourceImageId || undefined,
                    identityLock: directorControls.identityStrength,
                    apparentAge: directorControls.age,
                    genderMode: mappedGenderMode as any,
                    biometricSummary: usesBiometricScanIdentity
                        ? `${biometricRangeText} are biometric face/head identity anchors only. They are not body mass, wardrobe, costume, style, or outfit authorities.`
                        : undefined
                },
                morphologyKey: toNanoMorphologyKey(selectedBody),
                styleKey: mappedStyleKey as any,
                bodyScope: bodyScope || 'head',
                wardrobe: {
                    outfitPrompt: directorControls.outfit || undefined,
                    hairPrompt: directorControls.hairStyle || undefined,
                    logoPlacement: directorControls.logoPlacement || undefined,
                    hasLogo: Boolean(directorControls.logoImage)
                },
                stylization: directorControls.stylization,
                bodyOverride: hasExplicitBodyOverride
                    ? {
                        active: true,
                        heightIn,
                        weightLbs
                    }
                    : undefined,
                generatedCharacterSourceIndex: approvedSourceImageIndex,
                generatedCharacterSourceRole: approvedSourceImageIndex
                    ? "approved generated source for body, outfit, silhouette, costume, stance, proportions, style continuity, and visual design only"
                    : undefined
            };

            // Validate the blueprint and build prompt ONLY if not using legacy path
            let builtPrompt = "";
            if (!USE_LEGACY_NANOCAST_RECONSTRUCTION) {
                const blueprintWarnings = validateNanoBlueprint(nanoBlueprint);
                if (blueprintWarnings.length > 0) {
                    console.warn('[NANO_BLUEPRINT_VALIDATION]', blueprintWarnings);
                }

                // Build the nano cast prompt
                builtPrompt = buildNanoCastPrompt(nanoBlueprint);
                console.log('[NANO_BUILDER_LIVE_PATH] Prompt generated via buildNanoCastPrompt:', builtPrompt);
            }

            // LIVE REFERENCE ROLE MAP:
            // - Biometric scans are the primary scanned biometric subject / uploaded biometric scan identity source.
            // - Generated source identity is the active reference when identitySource !== 'generated' || isLockedRegeneration.
            // Identity source check logic for active reference determination:
            const identitySourceCheckActive = state.nanoCastSession.identitySource !== 'generated' || isLockedRegeneration;
            if (identitySourceCheckActive) {
                console.info("Generated source identity is the active reference");
            }

            // Reconstruct exact launch-final-v1 legacy variables
            const styleCategoryContract = buildStyleCategoryContract(activeStyleId, {
                selectedStyleLabel: styleObj.label,
                sourceImagePolicy: usesBiometricScanIdentity
                    ? "Biometric scan images are the highest-priority facial identity source. They control the real person's face, skull/head shape, visible neck, skin tone, hair state, facial-hair or clean-shaven state, visible marks, and age impression. They are face/head-dominant and must not be used as body-mass evidence. Source-photo realism must not leak into stylized render categories, but the recognizable scanned identity must remain."
                    : "Source images control identity only; they do not control visual style category.",
                lightingPolicy: "Lighting must be interpreted inside the selected Nano Cast character render style.",
                boardPresentationPolicy: "Any board or preview language controls presentation only, not the character render category.",
                appliesTo: "Nano Cast hero render, portrait preview, full-body output, headshot crops, wardrobe handoffs, pitch-sheet handoffs, and recent thumbnails where this character appears"
            });
            const nanoCastStyleIdentityContract = buildNanoCastStyleIdentityEnforcementContract(activeStyleId, {
                selectedStyleLabel: styleObj.label,
                identityRangeText,
                requestedIdentityStrength: directorControls.identityStrength,
                usesBiometricIdentity: usesBiometricScanIdentity,
                bodyGuidance: usesBiometricScanIdentity
                    ? `face/head identity from ${biometricRangeText}; body from explicit body guidance "${archetypeObj.name}" (${archetypeObj.desc}) without over-inferring body mass from scans`
                    : `explicit body guidance "${archetypeObj.name}" (${archetypeObj.desc})`,
                appliesTo: "NanoCast primary generated character, handoff image, recent thumbnail, and any downstream board derived from this result"
            });
            const styleNegativePrompt = buildStyleNegativePrompt(activeStyleId);
            const styleIdentityNegativePrompt = buildNanoCastStyleIdentityNegativePrompt(activeStyleId);
            const activeStyleNegativePrompt = usesBiometricScanIdentity
                ? getBiometricSafeStyleNegativePrompt(styleNegativePrompt)
                : styleNegativePrompt;
            const visualKeywords = usesBiometricScanIdentity
                ? `${styleObj.keywords} BIOMETRIC LIKENESS TRANSLATION: apply this style to shader, surface, lighting, and rendering language only; do not use a default stylized face template, do not change the scanned skull/face topology, and do not simplify away the visible facial-hair or clean-shaven state, nose, brow, eye spacing, cheeks, jaw, chin, skin tone, age impression, or marks.`
                : styleObj.keywords;

            // STRICTNESS CHECK: Differentiate between Realistic (Geometric Lock) and Stylized (Likeness Translation)
            const isBiometric = usesBiometricScanIdentity;
            const isRealistic = ['hyper_real', 'exact_studio', 'premium_cg', 'realism'].includes(effectiveStyleForGeneration || '');
            const isExactLikeness = effectiveStyleForGeneration === 'exact_studio';
            let strictnessInstruction = "";
            if (isBiometric) {
                const hairStrictnessAddition = " The selected style may alter shader, linework, material finish, and simplification level, but it may not remove visible biometric hair, replace the subject's hair type, or convert visible hair into bald scalp.";
                if (isRealistic) {
                    strictnessInstruction = "CRITICAL_STRICTNESS: The face in the generated image MUST BE AN EXACT BIOMETRIC MATCH. PRESERVE FACIAL GEOMETRY ABOVE ALL ELSE. Apply the Material/Lighting of the style, but DO NOT ALTER THE SKULL SHAPE. Treat as 'Digital Makeup'." + hairStrictnessAddition;
                } else {
                    // STYLIZED: translate rendering language, not identity geometry.
                    strictnessInstruction = `CRITICAL_LIKENESS: The subject must be IMMEDIATELY RECOGNIZABLE as the same scanned person from ${biometricRangeText}. Apply the selected style to texture, shader, and surface language only. Preserve the actual skull/head shape, face fullness, brow/eye/nose/cheek/mouth/jaw/chin relationships, baldness or hair state, facial-hair or clean-shaven state, skin tone, age impression, and distinctive marks. Do not convert the scan into a generic stylized archetype.` + hairStrictnessAddition;
                }
            }

            const styleOverlayBiometricContract =
                getStyleOverlayBiometricContract(effectiveStyleForGeneration);

            if (import.meta.env.DEV && isSurfaceRiskStyle(effectiveStyleForGeneration)) {
                console.info("[NanoCast] Risk-style biometric overlay active", {
                    effectiveStyleForGeneration,
                    hasStyleOverlayBiometricContract: Boolean(styleOverlayBiometricContract.trim())
                });
            }

            const buildContractFn = buildStrictBiometricIdentityContract;
            let biometricIdentityContract = usesBiometricScanIdentity
                ? buildContractFn({
                    identityRangeText: biometricRangeText,
                    identityStrength: directorControls.identityStrength,
                    selectedStyleLabel: styleObj.label,
                    mode: identitySource === 'biometric' ? 'biometric' : 'hybrid',
                    faceDominant: true
                })
                : "";

            if (usesBiometricScanIdentity) {
                const cleanStyle = String(effectiveStyleForGeneration || "").toLowerCase();
                const isAnimeCel = cleanStyle.includes("anime") || cleanStyle.includes("cel");

                if (isAnimeCel) {
                    // Do not include global wording that asks to preserve all visible skin marks, dots, blemishes, moles, spots, or surface imperfections.
                    biometricIdentityContract = biometricIdentityContract
                        .replace(/, and visible facial marks/g, "")
                        .replace(/, and distinctive supported marks/g, "")
                        .replace(/, and marks\./g, ".");

                    // Append RETRO CEL SURFACE RULE
                    biometricIdentityContract += `
 
RETRO CEL SURFACE RULE:
- Use clean cel-rendered facial surfaces.
- Preserve only stable identity-relevant facial details that are clearly supported across multiple biometric references.
- Suppress temporary scan texture, lighting artifacts, compression noise, shaving texture, pores, and non-identity surface noise.`;
                } else if (isSurfaceRiskStyle(effectiveStyleForGeneration)) {
                    biometricIdentityContract = biometricIdentityContract
                        .replace(/, and visible facial marks/g, "")
                        .replace(/, and distinctive supported marks/g, "")
                        .replace(/, and marks\./g, ".");

                    biometricIdentityContract += `
 
RISK-STYLE FACIAL SURFACE RULE:
- Keep facial surface treatment clean, restrained, and identity-faithful.
- Preserve only stable identity-relevant facial details that are clearly visible across multiple biometric references.
- Ignore temporary scan texture, lighting noise, compression artifacts, shaving texture, pores, and non-identity surface noise.`;
                }
            }

            const hairScalpIdentityContract = usesBiometricScanIdentity
                ? buildHairScalpIdentityContract(identityRangeText || biometricRangeText || "the uploaded biometric references")
                : "";

            if (import.meta.env.DEV && usesBiometricScanIdentity) {
                console.info("[NanoCast] Hair/scalp biometric contract active", {
                    identityRangeText,
                    hasHairScalpIdentityContract: Boolean(hairScalpIdentityContract.trim())
                });
            }
            const bodyShapeInferenceRules = usesBiometricScanIdentity
                ? `BODY SHAPE INFERENCE RULES:
- Do not over-infer body fat, heaviness, obesity, belly size, torso width, arm thickness, or neck thickness from facial scans alone.
- ${biometricRangeText} are face/head-dominant biometric identity references, not reliable full-body measurements.
- Fuller cheeks, a broad jaw, a rounded chin, mature face weight, or visible facial-hair state must preserve facial likeness only; they do not imply an overweight body.
- If only facial/biometric views are provided, use a neutral, average, medium body build by default unless the user explicitly selected a different body archetype or prompt.
- Current explicit body guidance: ${selectedBody ? `"${archetypeObj.name}" (${archetypeObj.desc})` : ("neutral" + " average" + " medium" + " build")}.
- Preserve identity without exaggerating torso width, belly size, limb thickness, shoulder/pelvis mass, or neck bulk.
- Do not turn a broad-faced subject into an overweight character unless explicitly requested.`
                : "";

            // --- CONDITIONAL OVERRIDES ---
            const defaults = {
                age: 25,
                outfit: "Black polo t-shirt",
                hairStyle: "",
                identityStrength: isExactLikeness ? 100 : 85,
                stylization: isExactLikeness ? 0 : 50
            };

            const applyAge = directorControls.age !== defaults.age;
            const applyOutfit = directorControls.outfit !== ''; // ALWAYS apply outfit if there is one, defaulting to the Black polo
            const applyHair = directorControls.hairStyle !== defaults.hairStyle && directorControls.hairStyle !== '';
            const applyStylization = directorControls.stylization !== defaults.stylization;
            const applyIdentity = directorControls.identityStrength !== defaults.identityStrength;

            // Restored original exact launch-final-v1 prompt block
            const legacyPrompt = `
 Create a single image.

 GENERATION MODE: ${generationMode}
 ${lockedRegenerationContract}
 ${isLockedRegeneration ? `
LOCKED REGENERATION CONTINUITY:
- This is not a new character generation.
- Preserve the same generated character identity, face structure, head shape, facial hair geometry, body scope, outfit, style family, framing, and overall composition from [IMAGE 1].
- Use the biometric references only to pull facial likeness closer to the scanned person.
- Correct only quality artifacts, exaggerated facial surface treatment, and style overreach.
- Do not create a different person.
- Do not reinterpret the character from scratch.
` : ''}

 CHARACTER CONCEPT ART
  
 IDENTITY REFERENCES: ${usesBiometricScanIdentity
                    ? `Use ${biometricRangeText} as the ONLY source for the character's face/head identity. These face-dominant scans are not body-mass evidence.`
                    : isLockedRegeneration && approvedSourceImageId
                        ? `Use ${approvedSourceImageId} as the approved locked character source. This is a refinement pass, not a new identity synthesis.`
                        : `Use ${identityRangeText} as the ONLY source for the character's face and body shape.`}
 ${directorControls.logoImage ? `LOGO ASSET: Use the last image provided as a Branding Asset only.` : ''}
 ${isLockedRegeneration && approvedSourceImageId ? `APPROVED SOURCE CHARACTER:
 - ${approvedSourceImageId}: CURRENT APPROVED GENERATED CHARACTER. Preserve this exact character's body build, wardrobe, costume silhouette, style family, pose attitude, age read, and overall design.
 - Do not treat ${approvedSourceImageId} as optional inspiration. Do not create a different person.` : ''}
 ${usesBiometricScanIdentity ? `IMAGE ROLE MAP:
 - ${biometricRangeText}: BIOMETRIC SCAN IDENTITY SOURCE. Use together as multi-view reconstruction anchors, not as a collage to copy.
 - Any later logo/wardrobe/style images: non-identity assets. They must never override the scanned face, head, hair state, facial-hair or clean-shaven state, age, skin tone, marks, or conservative body-build rules.

 BIOMETRIC PRIORITY HIERARCHY:
 1. Biometric scan identity. For hair/scalp decisions, do not rely only on the center image. Use the full biometric scan set and prioritize the clearest hairline/scalp/top/side views.
 2. Identity lock strength (${directorControls.identityStrength}%).
 3. User outfit, hair, and branding prompts.
 4. Selected style preset.
 
  ${hairScalpIdentityContract}

 ${biometricIdentityContract}` : ''}
 ${bodyShapeInferenceRules}
  
 STYLE PROTOCOL: ${styleObj.label}
 VISUAL KEYWORDS: ${visualKeywords}
 LIGHTING: ${styleObj.lighting}
 ${styleCategoryContract}
 ${nanoCastStyleIdentityContract}
 ${styleOverlayBiometricContract ? `${styleOverlayBiometricContract}\n` : ''}
  
 BODY MORPHOLOGY: ${usesBiometricScanIdentity
                    ? `Preserve face/head identity from ${biometricRangeText}. Do not infer body mass from the face scans. Use a ` + ("neutral" + " average" + " medium" + " build") + ` unless the explicit body guidance "${archetypeObj.name}" (${archetypeObj.desc}) intentionally directs otherwise.`
                    : `A subject with a ${archetypeObj.desc}.`}
  
 DIRECTOR OVERRIDES:
 ${applyAge ? `- Age Appearance: Approx ${directorControls.age} years old.` : ''}
 ${applyOutfit ? `- Outfit: ${directorControls.outfit}.` : ''}
 ${applyHair ? `- Hair Style: ${directorControls.hairStyle}.` : ''}
 ${applyIdentity ? `- Identity Match Priority: ${directorControls.identityStrength}%.` : ''}
 ${applyStylization ? `- Stylization Intensity: ${directorControls.stylization}%.` : ''}

 CRITICAL INSTRUCTIONS:
 ${applyOutfit ? `0. THE CHARACTER MUST WEAR: ${directorControls.outfit}. YOU MUST OVERRIDE THE ORIGINAL CLOTHING MULTIMODAL REFERENCES. DO NOT copy the colors, patterns, or style of the original clothing. If you do not follow the exact clothing description, the generation is a failure. YOU MUST RENDER THE SHIRT AS DESCRIBED IN THE OVERRIDE PROMPT.` : ''}
 ${strictnessInstruction}
 1. MAINTAIN FACIAL IDENTITY from ${biometricRangeText} with high fidelity (Priority: ${directorControls.identityStrength}%). DO NOT transfer the clothing from the identity references.
 ${usesBiometricScanIdentity ? `2. APPLY the selected "${styleObj.label}" art style as a likeness-preserving translation of the scanned subject. Style changes materials and simplification, not the person's facial topology.` : (applyStylization ? `2. APPLY the selected "${styleObj.label}" art style (Intensity: ${directorControls.stylization}%).` : '')}
 3. ${usesBiometricScanIdentity ? `Face/head identity must remain anchored to ${biometricRangeText}; body mass must stay conservative and medium unless the explicit body guidance "${archetypeObj.name}" intentionally changes it. Do not slim, beautify, youthify, genericize, or overweight the scanned subject.` : `Body proportions must match "${archetypeObj.name}".`}
 4. Background: Neutral, dark, cinematic studio void.
 5. High resolution, 4k, masterpiece.
 6. Facial Expression: Slight, natural smile (warm and approachable).
 ${directorControls.logoImage ? `7. BRANDING: See Branding Directive below. Apply logo to ${directorControls.logoPlacement}.` : ''}
 
 ${generatePackMode ? 'OUTPUT: Cinematic Character Portrait (Front View) with high detail.' : ''}
 
 ${brandingPrompt}

 NEGATIVE CONSTRAINTS:
 - No watermarks (except requested branding), signatures, or UI elements.
 - No distorted features, bad hands, or asymmetric eyes.
 - No extra limbs or fused fingers.
 - No text overlays.
 ${usesBiometricScanIdentity ? `- No generic stylized face, no generic person, no lookalike substitution, no beautified model face, no younger/slimmer/smoother redesign, no added facial hair when clean-shaven, no erased or changed facial hair pattern if present in the scan, no overweight body inferred from face-only scans.` : ''}
 ${activeStyleNegativePrompt ? `- STYLE CATEGORY DRIFT FORBIDDEN: ${activeStyleNegativePrompt}.` : ''}
 ${styleIdentityNegativePrompt ? `- STYLE IDENTITY DRIFT FORBIDDEN: ${styleIdentityNegativePrompt}.` : ''}
 ${applyOutfit ? `- EXTREMELY IMPORTANT: DO NOT COPY THE CLOTHING FROM THE SOURCE IMAGES. DO NOT RENDER THE ORIGINAL ATTIRE.` : ''}
 
 BODY SCOPE DIRECTIVE (NON-NEGOTIABLE):
 ${bodyScope === 'head' ? '- HEAD: Head & shoulders only. No torso or legs.' : ''}
 ${bodyScope === 'torso' ? '- TORSO: Upper body only. Shoulders to waist.' : ''}
 ${bodyScope === 'full' ? '- FULL: Full body. Head to toe.' : ''}

 SHOT FRAMING: ${bodyScope === 'head'
                    ? 'HEAD AND SHOULDERS ONLY. Do NOT generate torso or legs.'
                    : bodyScope === 'torso'
                        ? 'UPPER BODY ONLY. From shoulders to waist.'
                        : 'FULL BODY. Head to toe, complete posture.'
                }
 `;

            const prompt = USE_LEGACY_NANOCAST_RECONSTRUCTION
                ? legacyPrompt
                : `Create a single image.

GENERATION MODE: ${generationMode}
${lockedRegenerationContract}

${builtPrompt}`;

            if (import.meta.env.DEV) {
                console.info("[NanoCast] Prompt path", {
                    useLegacy: USE_LEGACY_NANOCAST_RECONSTRUCTION,
                    usedNanoPromptBuilder: !USE_LEGACY_NANOCAST_RECONSTRUCTION,
                    promptIncludesLegacyMarker: prompt.includes("BIOMETRIC PRIORITY HIERARCHY"),
                    promptIncludesNanoBuilderMarker: prompt.includes("NANO ACTOR BLUEPRINT") || prompt.includes("NANO_BUILDER_LIVE_PATH")
                });
            }

            // UPDATE APP CONTEXT
            dispatch({ type: 'SET_LAST_CASTED_PROMPT', payload: prompt });
            addLog("TRANSMITTING TO CAST DIRECTOR STUDIO RENDER ENGINE...");

            // 3. Call Gemini
            setProgress({ phase: 'synthesis', percent: 5, detail: "Generative Matrix Active..." });

            const hostedUiWaitWindowMs = billingMode === 'hosted'
                ? getNanoCastHostedUiWaitMs(state.imageResolution)
                : undefined;
            const timeoutMs = getNanoCastGenerationTimeoutMs(state.imageResolution, billingMode);
            let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
            const timeoutPromise = new Promise<never>((_, reject) => {
                timeoutHandle = setTimeout(() => {
                    generationTimedOut = true;
                    abortControllerRef.current?.abort();
                    reject(new Error(`Generation request timed out after ${Math.round(timeoutMs / 1000)}s`));
                }, timeoutMs);
            });

            let synthPercent = 5;
            const synthEtaMs = state.imageResolution === '4K' ? 35000 : 15000;
            const synthInc = (1000 / synthEtaMs) * 100;
            const generationStartedAt = Date.now();
            let lastHostedWaitLogAt = 0;
            const synthInterval = setInterval(() => {
                synthPercent = Math.min(95, synthPercent + synthInc);
                let detail = "Generative Matrix Active...";
                if (synthPercent > 50) detail = "Synthesizing Attributes...";
                if (synthPercent >= 95) {
                    detail = billingMode === 'hosted'
                        ? `Hosted render still running (${formatNanoCastElapsedSeconds(generationStartedAt)}). Please wait...`
                        : "Finalizing Render... (Still working, please wait)";

                    const elapsedMs = Date.now() - generationStartedAt;
                    if (billingMode === 'hosted' && elapsedMs >= 45000 && elapsedMs - lastHostedWaitLogAt >= 30000) {
                        lastHostedWaitLogAt = elapsedMs;
                        addLog(`HOSTED RENDER STILL ACTIVE (${formatNanoCastElapsedSeconds(generationStartedAt)}). WAITING FOR COMPLETION...`);
                    }
                }
                setProgress({ phase: 'synthesis', percent: synthPercent, detail });
            }, 1000);

            // Note: If GeminiService adds AbortSignal support, pass abortControllerRef.current.signal here
            let resultUrl: string;
            try {
                const res = await Promise.race([
                    GeminiService.generateImage(prompt, state.apiKey, state.model, referenceImages, {
                        imageSize: state.imageResolution,
                        thinkingLevel: state.enableImageThinking,
                        googleGrounding: false,
                        strictMode: true,
                        billingMode,
                        entitlements: state.billingEntitlements,
                        identityLock: activeBiometricIdentityLock,
                        sheetStyleLock: false,
                        poseCoherence: false,
                        headshotWardrobeContinuity: false,
                        characterAnatomyIntegrity: false,
                        signal: abortControllerRef.current?.signal,
                        uiWaitWindowMs: hostedUiWaitWindowMs,
                        onJobAccepted: billingMode === 'hosted'
                            ? (generationId) => {
                                const shortId = generationId.slice(0, 8).toUpperCase();
                                addLog(`HOSTED JOB ACCEPTED (${shortId}). POLLING WORKER RESULT...`);
                                setProgress(current => ({
                                    ...current,
                                    detail: `Hosted job accepted (${shortId}). Waiting for worker completion...`
                                }));
                            }
                            : undefined,
                        styleCategory: {
                            styleId: activeStyleId,
                            intent: {
                                selectedStyleLabel: styleObj.label,
                                appliesTo: "Nano Cast generated character, preview, handoff images, and recent thumbnails"
                            }
                        }
                    }),
                    timeoutPromise
                ]);
                resultUrl = res;
            } finally {
                clearInterval(synthInterval);
                if (timeoutHandle) clearTimeout(timeoutHandle);
            }

            if (abortControllerRef.current?.signal.aborted) {
                throw new Error("Generation aborted by user");
            }

            setProgress({ phase: 'refinement', percent: 90, detail: "Finalizing Render..." });
            addLog("ASSET GENERATED. DECODING...");
            await new Promise(r => setTimeout(r, 500));

            let safeResultUrl = resultUrl;
            try {
                safeResultUrl = await materializeDisplayUrl(resultUrl);
            } catch(e) {
                console.warn(e);
            }
            applyFinalCharacterUrl(safeResultUrl, true);
            cacheNanoRecentGeneration(safeResultUrl, "Nano Cast Character");
            
            // Capture the style ID used for the current result
            setCurrentResultStyleId(effectiveStyleForGeneration);

            setPhase(5); // Move to Result Phase
            setIsProcessing(false);

        } catch (error) {
            const message = getErrorMessage(error);
            const wasCanceledByUser =
                !generationTimedOut &&
                (message === "Generation aborted by user" || message.includes("AbortError") || message.includes("Canceled by user"));

            if (wasCanceledByUser) {
                addLog("ABORTED BY COMMAND.");
            } else if (generationTimedOut) {
                console.error("Orchestration Timeout:", error);
                addLog("GENERATION TIMEOUT. RETURNING TO STYLE SELECTION.");
                showToast("Generation timed out. Please retry or use a lower resolution.");
            } else {
                console.error("Orchestration Error:", error);
                showToast("Generation Failed: " + message);
            }
            setIsProcessing(false);
            setProgress({ phase: '', percent: 0, detail: "" });
            setPhase(finalCharacterUrl ? 5 : 3);
            abortControllerRef.current = null;
        }
    };

    const handleRegenerate = async () => {
        if (state.billingEntitlements.effectiveBillingMode === "byok" && !state.apiKey) {
            dispatch({ type: 'ADD_LOG', payload: { message: "API Key required for BYOK generation.", type: 'error' } });
            return;
        }

        console.log("Regenerating locked character...");
        if (!finalCharacterUrl) {
            showToast("Generate a character before regenerating.");
            return;
        }
        if (state.nanoCastSession.identityLock && (!capturedAngles.center || !capturedAngles.left || !capturedAngles.right)) {
            showToast("Locked biometric references are missing. Please re-scan before regenerating.");
            setPhase(1);
            return;
        }
        // Regenerate directly from the original Phase 1-3 inputs instead of performing an iterative improvement pass
        // on the previously drifted output, avoiding cumulative defects like adding a mustache or extra marks.
        await handleOrchestration("REGENERATE_LOCKED_CHARACTER", "quality_artifacts_only");
    };

    const cancelGeneration = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            setIsProcessing(false);
            setProgress({ phase: '', percent: 0, detail: "" });
            showToast("Sequence Aborted");

            // Redirect based on state
            if (finalCharacterUrl) {
                setPhase(5); // Return to Result view
            } else {
                setPhase(3); // Return to Style Selection
            }
        }
    };



    const addToCast = (asLead = false) => {
        if (!finalCharacterUrl) return;

        const newMember = {
            id: `nano_${Date.now()}`,
            url: finalCharacterUrl,
            previewUrl: finalCharacterUrl,
            sourceUrl: finalCharacterUrl,
            name: `${selectedStyle}_${selectedBody}_${asLead ? 'LEAD' : 'Cast'}`,
            tag: 'front' as const,
            identityLock: state.nanoCastSession.identityLock || undefined,
            profile: {
                identity: "Nano_Gen_v1",
                wardrobe: directorControls.outfit || "Default",
                accessories: "None",
                style: selectedStyle || "Standard_Neural_Mix"
            }
        };

        dispatch({ type: 'ADD_CAST', payload: newMember });
        showToast(asLead ? "Accredited as Project Lead" : "Accessioned to Cast Database");
    };

    const downloadPoster = () => {
        if (!finalCharacterUrl) return;
        const a = document.createElement('a');
        a.href = finalCharacterUrl;
        a.download = createUniqueDownloadFilename('NanoCast.png');
        a.click();
        showToast("Poster Asset Extracted");
    };

    const approveGeneratedCharacterForPitchSheet = () => {
        if (!finalCharacterUrl) return;
        console.warn('[PITCH_APPROVAL_SET]', {
            finalCharacterUrl,
            approvedPitchSheetSourceUrl: finalCharacterUrl,
        });
        dispatch({
            type: 'SET_NANO_CAST_SESSION_METADATA',
            payload: {
                generatedCharacterApprovedForPitchSheet: true,
                approvedPitchSheetSourceUrl: finalCharacterUrl
            }
        });
        showToast("Approved as Pitch Sheet Image A");
    };

    const sendBiometricScanToPitchSheet = async (handoffMode: NanoPitchSheetHandoff["mode"]) => {
        if (!capturedAngles.center || !capturedAngles.left || !capturedAngles.right) {
            const message = "Upload or capture biometric scan images before building a pitch sheet.";
            showToast(message);
            dispatch({ type: 'ADD_LOG', payload: { message, type: 'error' } });
            return;
        }

        const approvedPitchSheetSourceUrl = state.nanoCastSession.approvedPitchSheetSourceUrl;
        const hasApprovedPitchSource =
            Boolean(state.nanoCastSession.generatedCharacterApprovedForPitchSheet) &&
            Boolean(approvedPitchSheetSourceUrl);

        // Validation log and check for testing
        // Generated character is not approved as identity source.
        if (!hasApprovedPitchSource) {
            console.warn('[PITCH_APPROVAL_CHECK] Generated character is not approved as identity source.');
        }

        // effectiveHandoffMode = "scan_only"
        const effectiveHandoffMode = !hasApprovedPitchSource
            ? "scan_only"
            : handoffMode === "scan_only" ? "scan_only" : "scan_plus_character";

        if (handoffMode === "scan_plus_character" && !hasApprovedPitchSource) {
            showToast("Approve Image A before building Scan + Character pitch sheet.");
            return;
        }

        const approvedCharacterUrl =
            effectiveHandoffMode === "scan_plus_character"
                ? approvedPitchSheetSourceUrl
                : null;

        try {
            const identityImages: NanoPitchSheetHandoff["identityImages"] = [];
            const angles: BiometricCaptureAngle[] = ['center', 'left', 'right', 'up', 'down'];

            for (const angle of angles) {
                const rawUrl = capturedAngles[angle];
                if (!rawUrl) continue;

                const imageUrl = rawUrl.startsWith('blob:')
                    ? await getBase64FromBlobUrl(rawUrl)
                    : rawUrl;

                identityImages.push({ angle, imageUrl });
            }

            if (identityImages.length === 0) {
                throw new Error("No raw biometric angle captures available.");
            }

            const handoffBiometricRangeText = effectiveHandoffMode === "scan_plus_character"
                ? identityImages.length === 1
                    ? "Images B / [IMAGE 2]"
                    : `Images B-${String.fromCharCode(65 + identityImages.length)} / [IMAGE 2] to [IMAGE ${identityImages.length + 1}]`
                : identityImages.length === 1
                    ? "[IMAGE 1]"
                    : `[IMAGE 1] to [IMAGE ${identityImages.length}]`;
            const handoffIdentityLock = createBiometricIdentityLock({
                characterId: nanoCastSession.characterId,
                referenceViews: identityImages.map(image => image.angle),
                identityRangeText: handoffBiometricRangeText,
                identityStrength: directorControls.identityStrength,
                selectedStyleLabel: selectedStyle || undefined,
                generatedSourceImageIndex: effectiveHandoffMode === "scan_plus_character" ? 1 : null,
                generatedSourceRole: effectiveHandoffMode === "scan_plus_character"
                    ? "primary visual/design source only; secondary to uploaded biometric identity"
                    : undefined,
                appliesTo: "Portrait Studio pitch-sheet generation, preview, validation, panel regeneration, export, and any board presentation derived from this NanoCast character",
                faceDominant: true
            });

            let characterUrl: string | null = null;
            if (effectiveHandoffMode === "scan_plus_character" && approvedCharacterUrl) {
                characterUrl = approvedCharacterUrl.startsWith('blob:')
                    ? await getBase64FromBlobUrl(approvedCharacterUrl)
                    : approvedCharacterUrl;
            }

            const payload: NanoPitchSheetHandoff = {
                source: "nanocast_biometric_scan",
                createdAt: Date.now(),
                characterId: nanoCastSession.characterId,
                identityLock: handoffIdentityLock,
                identityImages,
                identityStrength: directorControls.identityStrength,
                heightIn,
                weightLbs,
                age: directorControls.age,
                hairStyle: directorControls.hairStyle,
                outfit: directorControls.outfit,
                selectedStyle,
                finalCharacterUrl: effectiveHandoffMode === "scan_plus_character" ? characterUrl : null,
                mode: effectiveHandoffMode
            };

            localStorage.removeItem("portrait_pitchsheet_handoff");
            dispatch({ type: 'SET_PENDING_PITCH_SHEET_HANDOFF', payload });
            dispatch({ type: 'SET_VIEW', payload: 'portrait' });
            dispatch({
                type: 'ADD_LOG',
                payload: {
                    message: effectiveHandoffMode === "scan_plus_character"
                        ? "NanoCast scan + character sent to Portrait Studio Pitch Sheet"
                        : "NanoCast biometric scan sent to Portrait Studio Pitch Sheet",
                    type: 'success'
                }
            });
            showToast("Pitch Sheet handoff ready");
        } catch (error: unknown) {
            dispatch({ type: 'ADD_LOG', payload: { message: `Pitch Sheet handoff failed: ${getErrorMessage(error)}`, type: 'error' } });
        }
    };

    // --- SAVE TO ACTOR LIBRARY STATE ---
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [saveCategory, setSaveCategory] = useState("realism");
    const [newActorName, setNewActorName] = useState("");
    const [saveMode, setSaveMode] = useState<'actor' | 'ref_sheet'>('actor');
    const [saveSourceUrl, setSaveSourceUrl] = useState<string | null>(null);
    const [saveRecentGenerationId, setSaveRecentGenerationId] = useState<string | null>(null);

    const handleOpenSaveModal = (
        mode: 'actor' | 'ref_sheet' = 'actor',
        sourceOverride?: string,
        recentGenerationId?: string
    ) => {
        const urlToUse = sourceOverride || (mode === 'ref_sheet' ? refSheetUrl : finalCharacterUrl);
        if (!urlToUse) return;

        setSaveMode(mode);
        setSaveSourceUrl(urlToUse);
        setSaveRecentGenerationId(recentGenerationId || null);
        if (mode === 'ref_sheet') {
            setNewActorName(`RefSheet-${Date.now()}`);
        } else {
            const promptSummary = state.lastCastedPrompt ? state.lastCastedPrompt.substring(0, 15) : "Generated Actor";
            setNewActorName(promptSummary);
        }
        setShowSaveModal(true);
    };

    const handleSelectRecentNanoGeneration = (gen: RecentGeneration) => {
        if (isRecentReferenceSheet(gen.prompt)) {
            setRefSheetUrl(gen.displayUrl);
            setShowRefSheet(true);
            return;
        }

        setRefSheetIdentityAnchors(null);
        applyFinalCharacterUrl(gen.displayUrl);
    };

    const handleExportRecentNanoGeneration = (gen: RecentGeneration) => {
        if (isRecentReferenceSheet(gen.prompt)) {
            setRefSheetUrl(gen.displayUrl);
            handleOpenSaveModal('ref_sheet', gen.displayUrl, gen.id);
            return;
        }

        setRefSheetIdentityAnchors(null);
        applyFinalCharacterUrl(gen.displayUrl);
        handleOpenSaveModal('actor', gen.displayUrl, gen.id);
    };

    const confirmSaveToLibrary = async (nameOverride?: string, categoryOverride?: string) => {
        const targetName = nameOverride || newActorName;
        const targetCategory = categoryOverride || saveCategory;
        const targetUrl = saveSourceUrl || (saveMode === 'ref_sheet' ? refSheetUrl : finalCharacterUrl);

        showToast(`Save Identity: ${targetName}`);

        if (!targetUrl) {
            console.warn("Save aborted: No image URL");
            showToast("No Image to Save");
            return;
        }

        const catToStyle: Record<string, string> = {
            "realism": "exact_studio",
            "anim": "premium_animated_3d",
            "illustration": "retro_anime",
            "scifi": "cyberpunk_neon",
            "uncategorized": "exact_studio",
            "nano": "exact_studio"
        };
        const activeStyle = catToStyle[targetCategory] || "exact_studio";

        try {
            const mat = await LibraryAssetMaterializer.materializeCastAsset({
                sourceUrl: targetUrl,
                saveDirectoryPath: state.saveDirectoryPath,
                actorName: targetName,
                category: targetCategory
            });

            const newActor = {
                id: crypto.randomUUID(),
                name: targetName || `Actor-${Date.now()}`,
                url: mat.previewUrl,
                localPath: mat.localPath || undefined,
                previewUrl: mat.previewUrl,
                sourceUrl: mat.sourceUrl,
                tag: 'front' as const,
                filename: mat.filename,
                identityLock: state.nanoCastSession.identityLock || undefined,
                profile: {
                    identity: targetName || `Actor-${Date.now()}`,
                    style: activeStyle,
                    wardrobe: saveMode === 'ref_sheet' ? "Reference Sheet" : "Casting Director",
                    accessories: ""
                }
            };
            
            dispatch({ type: 'ADD_ACTOR_LIBRARY', payload: newActor });
            if (saveRecentGenerationId) {
                useRecentGenerationsStore.getState().markExported(saveRecentGenerationId);
            }

            if (mat.previewUrl) {
                if (saveMode === 'ref_sheet') {
                    setRefSheetUrl(mat.previewUrl);
                } else {
                    applyFinalCharacterUrl(mat.previewUrl);
                }
            }

            showToast(`Saved to Library: ${targetCategory}/${newActor.name}`);
            setShowSaveModal(false);
            setSaveSourceUrl(null);
            setSaveRecentGenerationId(null);
            if (saveMode === 'ref_sheet') setShowRefSheet(false);

        } catch (error: unknown) {
            console.error("Save to Library Failed:", error);
            showToast("Save Failed: " + getErrorMessage(error));
        }
    };

    // UI Helpers
    useEffect(() => {
        if (!state.apiKey) {
            // navigate('/');
        }
        // Persistence: Restore last casted image if available and we are essentially "fresh"
        const hasSessionBiometricImages = Boolean(capturedAngles.center || capturedAngles.left || capturedAngles.right || capturedAngles.up || capturedAngles.down);
        if (state.lastCastedImage && !finalCharacterUrl && phase === 1 && !hasSessionBiometricImages) {
            applyFinalCharacterUrl(state.lastCastedImage);
            setPhase(5); // Jump to result
        }
    }, [applyFinalCharacterUrl, capturedAngles, state.apiKey, state.lastCastedImage, finalCharacterUrl, phase]);

    // Consumes handoffs from PortraitStudio Send To Ref Sheet
    useEffect(() => {
        const consumeHandoff = (payload: NanoRefSheetHandoff, fromLegacyStorage: boolean) => {
            if (!payload?.imageUrl) return;

            const identityAnchors = (payload.identityImages || []).filter(anchor => Boolean(anchor.imageUrl));

            applyFinalCharacterUrl(payload.imageUrl);
            setRefSheetIdentityAnchors(identityAnchors.length ? identityAnchors : null);
            setPhase(5);
            setShowSettings(true);
            setSidebarMode("director");
            setIdentitySource("generated"); // Keeps the existing UI mode while preserving hidden original anchors when supplied.

            if (typeof payload.weightLbs === "number") {
                setWeightLbs(payload.weightLbs);
                setLocalWeight(payload.weightLbs);
            }

            if (typeof payload.heightIn === "number") {
                setHeightIn(payload.heightIn);
            }

            setDirectorControls(prev => ({
                ...prev,
                age: typeof payload.age === "number" ? payload.age : prev.age,
                hairStyle: payload.hairStyle || prev.hairStyle
            }));

            dispatch({ type: 'SET_LAST_CASTED_IMAGE', payload: payload.imageUrl });
            if (payload.compiledPrompt) {
                dispatch({ type: 'SET_LAST_CASTED_PROMPT', payload: payload.compiledPrompt });
            }

            if (fromLegacyStorage) {
                localStorage.removeItem("nano_refsheet_handoff");
            } else {
                dispatch({ type: 'CLEAR_PENDING_REF_SHEET_HANDOFF' });
                localStorage.removeItem("nano_refsheet_handoff");
            }

            if (import.meta.env.DEV) {
                console.info("[IdentityAnchor] refSheetHandoffIdentityAnchors:", identityAnchors.length);
                console.info("[IdentityAnchor] generatedSheetRole:", payload.generatedSheetRole || "identity_fallback");
            }

            dispatch({
                type: 'ADD_LOG',
                payload: { message: "Portrait Ref Sheet handoff loaded into NanoCast", type: 'success' }
            });
        };

        if (state.pendingRefSheetHandoff) {
            consumeHandoff(state.pendingRefSheetHandoff, false);
            return;
        }

        const raw = localStorage.getItem("nano_refsheet_handoff");
        if (!raw) return;

        try {
            consumeHandoff(JSON.parse(raw) as NanoRefSheetHandoff, true);
        } catch (e) {
            console.error("Failed to load nano_refsheet_handoff", e);
            localStorage.removeItem("nano_refsheet_handoff");
        }
    }, [applyFinalCharacterUrl, dispatch, state.pendingRefSheetHandoff]);

    const generateLocalBiometricSheet = async () => {
        dispatch({ type: 'SET_PROCESSING', payload: true });
        dispatch({ type: 'ADD_LOG', payload: { message: `Compositing Fast Local Biometric Sheet...`, type: 'info' } });
        try {
            const canvas = document.createElement('canvas');
            canvas.width = 1920;
            canvas.height = 1080;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error("Could not initialize canvas context");

            // Base Background & Blueprint Grid
            ctx.fillStyle = '#1D2430'; 
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Subtle Technical Grid
            ctx.strokeStyle = '#2A3546';
            ctx.lineWidth = 1;
            for (let i = 0; i < canvas.width; i += 40) {
                ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); ctx.stroke();
            }
            for (let i = 0; i < canvas.height; i += 40) {
                ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(canvas.width, i); ctx.stroke();
            }

            // Top Header
            const dateStr = new Date().toLocaleDateString('en-US');
            const subjectIdText = `SUBJECT ID: NANO-${Math.floor(100000 + Math.random() * 900000)}, DATE: ${dateStr}`;
            ctx.fillStyle = '#E2E8F0';
            ctx.font = '500 24px "Inter", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(subjectIdText, canvas.width / 2, 40);

            // Tight Mathematical Layout logic (Perfect 3x2 Grid)
            const w = 610;
            const h = 460;
            const gap = 20;
            const startX = Math.floor((canvas.width - ((w * 3) + (gap * 2))) / 2); 
            
            const col1 = startX;
            const col2 = startX + w + gap;
            const col3 = startX + (w * 2) + (gap * 2);
            
            const row1Y = 70;
            const row2Y = 70 + h + gap;

            const boxes = [
                { key: 'left', label: 'LEFT PROFILE', x: col1, y: row1Y },
                { key: 'center', label: 'CENTER FRONT', x: col2, y: row1Y },
                { key: 'right', label: 'RIGHT PROFILE', x: col3, y: row1Y },
                { key: 'up', label: 'TOP DOWN', x: col1, y: row2Y },
                { key: 'center', label: 'CENTER FRONT (ALT)', x: col2, y: row2Y },
                { key: 'down', label: 'BOTTOM UP', x: col3, y: row2Y }
            ];

            // Render watermark at the bottom right
            ctx.fillStyle = '#64748B';
            ctx.font = '400 14px "Inter", sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText('NanoCast Biometric Scanner', canvas.width - startX, canvas.height - 20);

            const loadImage = (src: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
                const img = new Image();
                img.crossOrigin = "anonymous";
                img.onload = () => resolve(img);
                img.onerror = reject;
                img.src = src;
            });

            for (const box of boxes) {
                // Ensure no grid overlaps by rendering an opaque background first
                ctx.fillStyle = '#1D2430'; 
                ctx.fillRect(box.x, box.y, w, h);

                const blobUrl = capturedAngles[box.key as keyof typeof capturedAngles];
                if (blobUrl) {
                    try {
                        const img = await loadImage(blobUrl);
                        const sW = img.width;
                        const sH = img.height;
                        const tW = w;
                        const tH = h;

                        let cW = sW;
                        let cH = sW * (tH/tW);
                        if (cH > sH) {
                            cH = sH;
                            cW = sH * (tW/tH);
                        }
                        // Fast sheets are identity-only references. Zoom the local crop toward the head
                        // so source-photo collars/shirts do not become accidental wardrobe authority.
                        const identityCropZoom = 0.82;
                        const zoomedCW = cW * identityCropZoom;
                        const zoomedCH = cH * identityCropZoom;
                        const cX = (sW - cW) / 2 + (cW - zoomedCW) / 2;
                        const cY = Math.max(0, (sH - cH) / 2 + (cH - zoomedCH) * 0.2);

                        ctx.drawImage(img, cX, cY, zoomedCW, zoomedCH, box.x, box.y, tW, tH);
                    } catch (e) {
                        console.error(`Failed to draw biometric image ${box.key}`, e);
                        ctx.fillStyle = '#1E293B';
                        ctx.fillRect(box.x, box.y, w, h);
                    }
                }
                
                // Thin border overlay around the box (exactly match reference)
                ctx.strokeStyle = '#64748B';
                ctx.lineWidth = 1;
                ctx.strokeRect(box.x - 1, box.y - 1, w + 2, h + 2);
            }

            const finalDataUrl = canvas.toDataURL('image/png');
            setLocalBiometricSheetUrl(finalDataUrl);
        } catch (error) {
            console.error(error);
            showToast("Failed to composite fast sheet.");
        } finally {
            dispatch({ type: 'SET_PROCESSING', payload: false });
        }
    };

    const handleGeneratePremiumBiometricSheet = async () => {
        const billingMode = state.billingEntitlements.effectiveBillingMode;
        if (billingMode === "byok" && !state.apiKey) { dispatch({ type: 'ADD_LOG', payload: { message: 'API Key required for Premium Synthesis', type: 'error' } }); showToast("API Key Required"); return; }

        const hasBiometrics = Boolean(capturedAngles.center && capturedAngles.left && capturedAngles.right);
        if (!hasBiometrics) {
            showToast("Requires: Center + Left + Right Scans");
            return;
        }
        if (!(await ensureAuthenticatedForGeneration({ billingMode, featureLabel: 'Premium biometric sheet generation' }))) {
            return;
        }

        dispatch({ type: 'SET_PROCESSING', payload: true });
        dispatch({ type: 'ADD_LOG', payload: { message: "Generating Premium Forensic Biometric Sheet...", type: 'info' } });

        try {
            // Validate Credits Here (assuming logic exists elsewhere, or warn)
            const imageRefs: { url: string; label: string }[] = [];
            const angles: (keyof typeof capturedAngles)[] = ['center', 'left', 'right', 'up', 'down'];
            
            for (const angle of angles) {
                const blobUrl = capturedAngles[angle];
                if (blobUrl) {
                    const b64 = await getBase64FromBlobUrl(blobUrl);
                    imageRefs.push({ url: b64, label: `Forensic Source: ${angle}` });
                }
            }

            const identityRefLimit = imageRefs.length;
            const biometricRangeText = identityRefLimit === 1 ? "[IMAGE 1]" : `[IMAGE 1] to [IMAGE ${identityRefLimit}]`;
            const forensicIdentityLock = createBiometricIdentityLock({
                characterId: nanoCastSession.characterId,
                referenceViews: angles.filter(angle => Boolean(capturedAngles[angle])),
                identityRangeText: biometricRangeText,
                identityStrength: 100,
                selectedStyleLabel: "High-end Premium Biometric Database",
                appliesTo: "premium forensic board generation, forensic panel validation, panel repair, preview, export, and any saved actor/reference asset derived from this biometric subject",
                faceDominant: true
            });
            const forensicSheetStyleLock = buildSheetStyleLockContract('exact_studio', {
                source: 'user_selected',
                selectedStyleLabel: 'High-end Premium Biometric Database',
                referenceStyleDescription: 'scientific cinematic realism with neutral forensic identity presentation',
                strictness: 'maximum',
                appliesTo: [
                    'upper-left headshot/bust panel',
                    'upper-center frontal headshot/bust panel',
                    'upper-right headshot/bust panel',
                    'lower-left elevated headshot/bust panel',
                    'lower-center alternate headshot/bust panel',
                    'lower-right lower-angle headshot/bust panel',
                    'panel borders and forensic annotations'
                ]
            });

            const prompt = `
Create a single image.

FORENSIC BIOMETRIC BOARD (PHASE 1)
This is a raw identity capture meant for neutral observation. It is NOT a stylized character reference.

SOURCE MATERIALS: Use ${biometricRangeText} as the ONLY source for the subject's face, skin tone, hair texture, and skull geometry.

STYLE PROTOCOL: High-end Premium Biometric Database. Premium cybersecurity identity capture overlay.
LIGHTING: Cinematic studio lighting, sharp edge lights, rich dark atmosphere, moody lighting.
CLOTHING: Tactical dark grey/black collared polo or utility undershirt.
BACKGROUND: SOLID BLACK STUDIO BACKGROUND. SOLID COLOR. DO NOT under any circumstances draw any grids, lines, blueprint markings, or graph paper patterns anywhere on the character portraits.

${forensicSheetStyleLock}

${buildHeadshotWardrobeContinuityContract({
    identitySource: `${biometricRangeText} for face, skull/head shape, skin tone, hairstyle, facial-hair or clean-shaven state, age impression, and head angle only`,
    wardrobeAuthority: "the forensic-board clothing directive: tactical dark grey/black collared polo or utility undershirt",
    finalLookReference: "this premium forensic biometric board clothing directive",
    appliesTo: "all six forensic headshot/bust panels",
    strictness: 'forensic_board'
})}

LAYOUT PROTOCOL:
- MULTI-ANGLE IDENTITY GRID. Perfect 3 columns by 2 rows.
- NO GRIDS ANYWHERE INSIDE BOXES: DO NOT draw grids or lines inside the portrait boxes or on the subjects.
- NO TEXT INSIDE BOXES: DO NOT write "LENS 1" or any other labels inside the portrait panels.
- PANEL BORDERS: Thin sharp rectangular outlines separating each of the 6 panels.
- UPPER HALF: 3 Headshots/Busts. Left Profile, Center Frontal face, Right Profile.
- LOWER HALF: 3 Alternate Headshots/Busts. Elevated/Top-down, Looking slightly off-center, Lower/Bottom-up angle.
- TOP TEXT: Centered exactly at the very top of the image (above the image grid): "SUBJECT ID: NANO-${Math.floor(100000 + Math.random() * 900000)}, DATE: ${new Date().toLocaleDateString('en-US')}"
- BOTTOM RIGHT TEXT: Flush right at the very bottom edge of the image: "NanoCast Biometric Scanner".

CRITICAL DIRECTIVES:
1. BIOMETRIC IDENTITY LOCK: MAXIMAL LIKENESS. This is for identity preservation. The face, nose shape, eyes, lips, and jaw structure must match the source scans perfectly.
2. NO RECASTING: Scans must be the ONLY identity authority. Do not average them into a generic or new person.
3. NO BEAUTIFICATION: Preserve all flaws, asymmetries, and exact age markers. Do not smooth skin or idealize features.
4. LEFT/RIGHT PROFILE PRESERVATION: Exactly preserve the side profiles provided in the inputs.
5. ALL PANELS SAME PERSON: Ensure strict continuity of identity across every single angle.
6. NO THEMES: Ignore any "Cyberpunk", "Fantasy", or "Sci-Fi" settings. This is a scientific output only.

NEGATIVE CONSTRAINTS:
stylized, painted, anime, 3d render, smiling, action pose, cinematic lighting, dramatic shadows, costumes, logos, text, watermarks, deformed, asymmetrical, duplicate angles, ${SHEET_STYLE_LOCK_NEGATIVE_TEXT}, ${buildHeadshotWardrobeNegativeTokens()}.
`;

            dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: { percent: 10, text: "Forensic Synthesis Initiated" } });
            
            let res = null;
            let currentPercent = 10;
            const etaMs = 25000;
            const updateMs = 1000;
            const increment = (updateMs / etaMs) * 100;
            const progressInterval = setInterval(() => {
                currentPercent = Math.min(95, currentPercent + increment);
                dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: { percent: currentPercent, text: "Reconstructing Biometric Mesh..." } });
            }, updateMs);

            try {
                res = await GeminiService.generateImage(prompt, state.apiKey, state.model, imageRefs, {
                    imageSize: '4K',
                    creditRenderType: 'character_sheet',
                    thinkingLevel: state.enableImageThinking,
                    googleGrounding: false,
                    strictMode: true,
                    billingMode: state.billingEntitlements.effectiveBillingMode as 'hosted' | 'byok',
                    entitlements: state.billingEntitlements,
                    identityLock: forensicIdentityLock,
                    headshotWardrobeContinuity: {
                        intent: {
                            identitySource: `${biometricRangeText} for face/head identity only`,
                            wardrobeAuthority: "tactical dark grey/black collared polo or utility undershirt",
                            finalLookReference: "the forensic-board clothing directive",
                            appliesTo: "all forensic headshot/bust panels",
                            strictness: 'forensic_board'
                        }
                    },
                    styleCategory: {
                        styleId: 'exact_studio',
                        intent: {
                            selectedStyleLabel: 'High-end Premium Biometric Database',
                            appliesTo: 'all six forensic headshot/bust panels and forensic board annotations'
                        }
                    }
                });
            } finally {
                clearInterval(progressInterval);
            }

            if (res) {
                dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: { percent: 100, text: "Forensic Matrix Complete" } });
                const rawUrl = res;
                let safeUrl = rawUrl;
                try {
                    safeUrl = await materializeDisplayUrl(rawUrl);
                } catch(e) {
                    console.warn(e);
                }
                applyFinalCharacterUrl(safeUrl, true);
                
                // Show in the reference sheet viewer with special title
                setRefSheetUrl(prev => {
                    if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
                    return safeUrl;
                });
                setShowRefSheet(true);
                
                dispatch({ type: 'ADD_LOG', payload: { message: "Premium Biometric Board Generated Successfully.", type: 'success' } });
            } else {
                throw new Error("No image data returned from Nano-Engine.");
            }

        } catch (error: unknown) {
            console.error(error);
            showToast("Forensic Generation Failed.");
            dispatch({ type: 'ADD_LOG', payload: { message: `Generation failed: ${getErrorMessage(error)}`, type: 'error' } });
        } finally {
            dispatch({ type: 'SET_PROCESSING', payload: false });
        }
    };

    const handleGenerateRefSheet = async () => {
        const billingMode = state.billingEntitlements.effectiveBillingMode;
        if (billingMode === "byok" && !state.apiKey) {
            showToast("API Key required for BYOK reference sheet generation.");
            dispatch({ type: 'ADD_LOG', payload: { message: "API Key required for BYOK reference sheet generation.", type: 'error' } });
            return;
        }

        const hasBiometrics = Boolean(capturedAngles.center && capturedAngles.left && capturedAngles.right);
        const hasPortrait = Boolean(finalCharacterUrl);

        // Validation based on Identity Source
        if (identitySource === 'biometric') {
            if (!hasBiometrics) {
                showToast("Requires: Center + Left + Right");
                return;
            }
        } else {
            if (!hasPortrait) {
                showToast("Requires: Generate a portrait first");
                return;
            }
        }
        if (!(await ensureAuthenticatedForGeneration({ billingMode, featureLabel: 'Nano Cast reference sheet generation' }))) {
            return;
        }



        dispatch({ type: 'SET_PROCESSING', payload: true });
        dispatch({ type: 'ADD_LOG', payload: { message: "Generating Character Reference Sheet...", type: 'info' } });

        try {

            // 1. PREPARE IMAGE REFERENCES FIRST
            const imageRefs: { url: string; label: string }[] = [];
            const handoffIdentityAnchors = (refSheetIdentityAnchors || []).filter(anchor => Boolean(anchor.imageUrl));
            const usesCapturedBiometricAnchors = identitySource === 'biometric';
            const usesHandoffBiometricAnchors = !usesCapturedBiometricAnchors && handoffIdentityAnchors.length > 0;
            const hasAuthoritativeBiometricAnchors = usesCapturedBiometricAnchors || usesHandoffBiometricAnchors;
            let generatedLayoutRefIndex = -1;

            // A. Identity refs. Original biometric images stay identity anchors.
            // Generated character images can be the visual/design source, but never the biometric identity authority.
            // Style is allowed to change presentation only; it cannot override identity.
            if (usesCapturedBiometricAnchors) {
                const angles: (keyof typeof capturedAngles)[] = ['center', 'left', 'right', 'up', 'down'];
                for (const angle of angles) {
                    const blobUrl = capturedAngles[angle];
                    if (blobUrl) {
                        const b64 = await getBase64FromBlobUrl(blobUrl);
                        imageRefs.push({ url: b64, label: `Original Actor Likeness Anchor: ${formatIdentityAnchorAngle(angle, imageRefs.length)}` });
                    }
                }
            } else if (usesHandoffBiometricAnchors) {
                for (const anchor of handoffIdentityAnchors) {
                    const identityUrl = anchor.imageUrl.startsWith('blob:')
                        ? await getBase64FromBlobUrl(anchor.imageUrl)
                        : anchor.imageUrl;
                    imageRefs.push({
                        url: identityUrl,
                        label: `Original Actor Likeness Anchor: ${formatIdentityAnchorAngle(anchor.angle, imageRefs.length)}`
                    });
                }

                if (finalCharacterUrl) {
                    imageRefs.push({ url: finalCharacterUrl, label: 'Generated Character Source / Primary Visual Design - Not Biometric Identity' });
                    generatedLayoutRefIndex = imageRefs.length;
                }
            } else {
                imageRefs.push({ url: finalCharacterUrl!, label: 'Character Reference' });
            }

            // Count only true identity refs; layout-only/generated refs may be attached but must not expand the identity authority range.
            const identityRefLimit = hasAuthoritativeBiometricAnchors
                ? imageRefs.filter(ref => ref.label.startsWith('Original Actor Likeness Anchor')).length
                : imageRefs.length;

            // CRITICAL VALIDATION: Ensure we actually have identity images
            if (identitySource === 'biometric' && identityRefLimit === 0) {
                throw new Error("No biometric scans found. Please re-scan logic.");
            }
            if (identitySource !== 'biometric' && identityRefLimit === 0) {
                throw new Error("No portrait found. Please generate a portrait first.");
            }

            const identityRangeText = identityRefLimit === 1 ? "[IMAGE 1]" : `[IMAGE 1] to [IMAGE ${identityRefLimit}]`;

            // B1. Add Wardrobe Reference if exists
            let wardrobeRefIndex = -1;
            if (selectedWardrobeItem) {
                imageRefs.push({ url: selectedWardrobeItem.url, label: "Costume Asset" });
                wardrobeRefIndex = imageRefs.length;
            }

            // B2. Add Logo Reference if exists
            let logoRefIndex = -1;
            if (directorControls.logoImage) {
                imageRefs.push({ url: directorControls.logoImage, label: "Logo Asset" });
                logoRefIndex = imageRefs.length; // 1-based index
            }

            // 2. SANITIZE KEYWORDS
            const getSafeKeywords = (style: string, originalKeywords: string) => {
                let safe = originalKeywords;
                if (hasAuthoritativeBiometricAnchors) {
                    if (style === 'family_3d' || style === 'premium_animated_3d' || style === LEGACY_PREMIUM_ANIMATED_3D_STYLE_ID) {
                        const legacyStudioPairPattern = new RegExp(`Disney-${LEGACY_PREMIUM_ANIMATED_3D_STYLE_ID}`, 'gi');
                        const legacyStyleNamePattern = new RegExp(`\\b${LEGACY_PREMIUM_ANIMATED_3D_STYLE_ID}\\b`, 'gi');
                        safe = safe
                            .replace(legacyStudioPairPattern, 'premium stylized animated 3D character')
                            .replace(legacyStyleNamePattern, 'stylized animated 3D')
                            .replace(/cartoon proportions,?/gi, 'appealing stylized animated proportions,');
                    }
                    if (style === 'retro_anime' || style === 'retro_cel') {
                        safe = safe.replace(/anime aesthetic/gi, 'Cel-Shaded Art Style').replace(/Studio Ghibli vibes/gi, 'Hand-drawn Animation Look');
                    }
                    if (style === 'cyberpunk' || style === 'cyberpunk_neon') {
                        safe = safe.replace(/interface overlays,?/gi, '').replace(/high-tech interface,?/gi, '');
                    }
                    if (style === 'hyper_real' || style === 'premium_cg' || style === 'exact_studio') {
                        // SANITIZE REALISM: Remove "Idealized" terms that trigger generic beauty
                        safe = safe.replace(/exact facial structure preservation,?/gi, 'raw scan data').replace(/perfect face,?/gi, '').replace(/idealized features,?/gi, '');
                    }
                }
                return safe;
            };

            const hasGeneratedSheetLayoutReference = generatedLayoutRefIndex > 0;
            const targetStyleKey = refStyle || 'family_3d';
            const styleConfig = REF_SHEET_STYLES[targetStyleKey as keyof typeof REF_SHEET_STYLES] || REF_SHEET_STYLES.family_3d;
            const refSheetIdentityLock = hasAuthoritativeBiometricAnchors
                ? createBiometricIdentityLock({
                    characterId: nanoCastSession.characterId,
                    referenceViews: usesCapturedBiometricAnchors
                        ? (['center', 'left', 'right', 'up', 'down'] as const).filter(angle => Boolean(capturedAngles[angle]))
                        : handoffIdentityAnchors.map(anchor => anchor.angle).filter((angle): angle is string => Boolean(angle)),
                    identityRangeText,
                    identityStrength: hasAuthoritativeBiometricAnchors ? 100 : directorControls.identityStrength,
                    selectedStyleLabel: styleConfig.label,
                    generatedSourceImageIndex: hasGeneratedSheetLayoutReference ? generatedLayoutRefIndex : null,
                    generatedSourceRole: hasGeneratedSheetLayoutReference
                        ? "primary visual/design source only; secondary to uploaded biometric identity"
                        : undefined,
                    appliesTo: "NanoCast reference sheet generation, panel regeneration, head studies, turnaround panels, validation, export, and saved reference preview for this character",
                    faceDominant: true
                })
                : undefined;
            const safeKeywords = getSafeKeywords(targetStyleKey, styleConfig.keywords);
            const refSheetStyleContract = buildStyleCategoryContract(targetStyleKey, {
                selectedStyleLabel: styleConfig.label,
                sourceImagePolicy: hasGeneratedSheetLayoutReference
                    ? `[IMAGE ${generatedLayoutRefIndex}] is the primary visual/design source for body, outfit, silhouette, proportions, costume, and style translation. ${identityRangeText} remain the biometric identity authority for face/head likeness only.`
                    : "Identity/source images provide facial identity, skull/head shape, skin tone, hair, facial-hair or clean-shaven state, and age impression only; source-photo realism must not leak into stylized reference-sheet panels.",
                boardPresentationPolicy: "Reference sheet layout controls panel placement, angle labels, and technical presentation only.",
                lightingPolicy: "Lighting and board polish must stay inside the selected reference-sheet character render style.",
                appliesTo: "every full-body reference panel, turnaround view, facial-angle head panel, expression panel, costume detail, and exported reference preview"
            });
            const refSheetStyleLockContract = buildSheetStyleLockContract(targetStyleKey, {
                source: targetStyleKey ? 'user_selected' : hasGeneratedSheetLayoutReference ? 'reference_image' : 'default',
                selectedStyleLabel: styleConfig.label,
                referenceStyleDescription: hasGeneratedSheetLayoutReference
                    ? `[IMAGE ${generatedLayoutRefIndex}] supplies the approved generated character render style; apply that same style family to all reference-sheet panels.`
                    : undefined,
                strictness: 'high',
                appliesTo: [
                    'full standing frontal figure',
                    'full standing three-quarter figure',
                    'full standing back figure',
                    'front head panel',
                    'left profile head panel',
                    'right profile head panel',
                    'upward tilt head panel',
                    'downward tilt head panel',
                    'expression panels',
                    'costume, footwear, and material detail areas',
                    'reference-sheet labels and callout presentation'
                ]
            });
            const refSheetStyleIdentityContract = buildNanoCastStyleIdentityEnforcementContract(targetStyleKey, {
                selectedStyleLabel: styleConfig.label,
                identityRangeText,
                requestedIdentityStrength: hasAuthoritativeBiometricAnchors ? 100 : directorControls.identityStrength,
                usesBiometricIdentity: hasAuthoritativeBiometricAnchors,
                generatedCharacterSourceIndex: hasGeneratedSheetLayoutReference
                    ? generatedLayoutRefIndex
                    : (identitySource !== 'biometric' && Boolean(finalCharacterUrl) && !hasAuthoritativeBiometricAnchors ? 1 : null),
                bodyGuidance: hasGeneratedSheetLayoutReference
                    ? `[IMAGE ${generatedLayoutRefIndex}] for body, outfit, silhouette, render style, and proportions; ${identityRangeText} for face/head identity only`
                    : `explicit NanoCast body controls: ${formatHeight(heightIn)}, ${Math.round(weightLbs / 5) * 5} lbs, plus selected wardrobe/style controls`,
                appliesTo: "NanoCast reference sheet full-body panels, head panels, expression panels, costume details, and exported preview"
            });
            const refSheetStyleIdentityNegativePrompt = buildNanoCastStyleIdentityNegativePrompt(targetStyleKey);
            const refSheetStyleNegativePrompt = buildStyleNegativePrompt(targetStyleKey);

            // 3. PROMPT CONSTRUCTION
            const isPortraitLockedSheet = identitySource !== 'biometric' && Boolean(finalCharacterUrl) && !hasAuthoritativeBiometricAnchors;
            const allowTypedOutfitOverride =
                hasAuthoritativeBiometricAnchors &&
                !selectedWardrobeItem &&
                !hasGeneratedSheetLayoutReference &&
                !!directorControls.outfit?.trim();
            const allowHairOverride =
                hasAuthoritativeBiometricAnchors &&
                !!directorControls.hairStyle?.trim();
            
            const wardrobeMode = isPortraitLockedSheet
                ? 'portrait_lock'
                : selectedWardrobeItem
                    ? 'wardrobe_asset'
                    : hasGeneratedSheetLayoutReference
                        ? 'generated_layout_reference'
                        : allowTypedOutfitOverride
                            ? 'typed_outfit'
                            : 'none';
            const headshotWardrobeAuthority =
                wardrobeMode === 'portrait_lock'
                    ? "the approved full character portrait in [IMAGE 1], including its visible collar, neckline, shoulders, fabric, colors, layering, and accessories"
                    : wardrobeMode === 'wardrobe_asset' && wardrobeRefIndex > 0
                        ? `the wardrobe library asset in [IMAGE ${wardrobeRefIndex}] (${selectedWardrobeItem?.name || 'selected wardrobe item'}) fitted onto the character`
                        : wardrobeMode === 'generated_layout_reference' && hasGeneratedSheetLayoutReference
                            ? `the generated character source in [IMAGE ${generatedLayoutRefIndex}] for wardrobe silhouette, colors, materials, and near-neck costume continuity`
                            : wardrobeMode === 'typed_outfit'
                                ? `the typed outfit directive: ${directorControls.outfit}`
                                : "the final generated character costume shown in the full-body reference-sheet panels";
            const headshotWardrobeContinuityBlock = buildHeadshotWardrobeContinuityContract({
                identitySource: hasAuthoritativeBiometricAnchors
                    ? `${identityRangeText} for face, head shape, skin tone, hairstyle, facial-hair or clean-shaven state, and age impression only`
                    : "the approved portrait/reference image for face and head identity",
                wardrobeAuthority: headshotWardrobeAuthority,
                finalLookReference: "the full-body reference-sheet panels, approved character render, generated character source, or explicit outfit directive",
                appliesTo: "all NanoCast head panels, facial-angle strips, expression panels, frontal close-ups, 3/4 heads, side profiles, upward tilt, and downward tilt panels",
                allowSourceClothingAsFinalWardrobe: wardrobeMode === 'portrait_lock',
                strictness: 'reference_sheet'
            });

            const effectiveStylization = directorControls.stylization;
            const styleNote = "";
            let effectiveIdentityStrength = directorControls.identityStrength;

            if (hasAuthoritativeBiometricAnchors) {
                // FORCE MAX IDENTITY for Biometric Scans
                effectiveIdentityStrength = 100;
                // Note: We removed the "Safety Clamp". Now we trust the Qualitative Tiers to handle high stylization without identity drift.
            }

            let finalPrompt = "";
            finalPrompt += `${PROMPT_PRIORITY_ORDER_BLOCK}\n\n`;
            finalPrompt += buildAuthoritativeIdentityContract({
                sourceDescription: hasAuthoritativeBiometricAnchors
                    ? "the original multi-view biometric source image set"
                    : "the current approved portrait/reference image",
                identityRangeText
            });
            finalPrompt += `\n\n`;

            if (hasGeneratedSheetLayoutReference) {
                finalPrompt += `GENERATED CHARACTER SOURCE LOCK:\n`;
                finalPrompt += `[IMAGE ${generatedLayoutRefIndex}] is the PRIMARY VISUAL SOURCE for this reference sheet: body, outfit, silhouette, proportions, render style, costume package, footwear, accessories, and overall character design.\n`;
                finalPrompt += `${identityRangeText} remain the BIOMETRIC IDENTITY AUTHORITY for face, skull/head shape, brow, eye spacing, nose, mouth, jaw/chin, ears, hairline, facial-hair or clean-shaven state, skin tone, age impression, and visible marks.\n`;
                finalPrompt += `Do not build a new reference-sheet character from scans alone. Preserve the same generated character from [IMAGE ${generatedLayoutRefIndex}] while correcting/maintaining facial identity from ${identityRangeText}.\n`;
                finalPrompt += `Do not treat [IMAGE ${generatedLayoutRefIndex}] as a mood board, optional layout guide, or weak inspiration image.\n\n`;
            }

            if (isPortraitLockedSheet) {
                finalPrompt += `PORTRAIT AUTHORITY BLOCK (ABSOLUTE HIGHEST PRIORITY):\n`;
                finalPrompt += `Use [IMAGE 1] as the SINGLE SOURCE OF TRUTH for the full character.\n`;
                finalPrompt += `This includes: face, hair, facial-hair or clean-shaven state, wardrobe, silhouette, fabric, colors, layering, accessories, and visible branding.\n`;
                finalPrompt += `The task is NOT to redesign the character.\n`;
                finalPrompt += `The task is to rotate and restage the SAME approved portrait character from [IMAGE 1] into a technical multi-angle reference sheet.\n`;
                finalPrompt += `All panels must depict the exact same outfit already visible in [IMAGE 1].\n`;
                finalPrompt += `Do not invent alternate clothing. Do not substitute a generic costume. Do not simplify, restyle, or randomize the wardrobe.\n\n`;
            }

            // 0. GLOBAL LAYOUT (MUST BE FIRST)
            finalPrompt += `REFERENCE SHEET BACKGROUND PROTOCOL:\n`;
            finalPrompt += "Background must be a SOLID BLACK STUDIO BACKDROP. No maps, no text, no scenery, no patterns.\n\n";
            finalPrompt += NANOCAST_HEADSHOT_BACKGROUND_ISOLATION_LOCK;
            finalPrompt += headshotWardrobeContinuityBlock;
            finalPrompt += `\n`;

            finalPrompt += `LAYOUT & COMPOSITION PROTOCOL (AGGRESSIVE ENFORCEMENT):\n`;
            finalPrompt += `1. VARIATION LOCK: Every panel MUST show a unique viewpoint. NO DUPLICATE ANGLES.\n`;
            finalPrompt += `2. FORBIDDEN: Do NOT repeat the same camera angle (e.g., do not show 3/4 view twice). Do NOT generate the same expression twice.\n`;
            finalPrompt += `3. MULTI-ANGLE CAMERA RIG: Each panel shows a different viewpoint of the character. Each lens is unique.\n\n`;

            if (refLayout === 'form_focus') {
                // BODY FOCUS -> Vertical Split (Image 3)
                finalPrompt += " [LAYOUT A]: Vertical Split.\n";
                finalPrompt += " LEFT PANEL (50%): 3 Full Standing Figures. LENS 1: Frontal, LENS 2: Left 3/4, LENS 3: Back View.\n";
                finalPrompt += " RIGHT PANEL (50%): 2x2 Grid of 4 HEAD PANELS. LENS 4: Frontal Close-Up Face (0-degree yaw). LENS 5: True Left Profile Face (90-degree left yaw). LENS 6: True Right Profile Face (90-degree right yaw). LENS 7: Upward Tilt Face (near-frontal yaw, chin raised).\n";
            } else if (refLayout === 'face_focus') {
                finalPrompt += " [LAYOUT B]: 8 Distinct Expression Panels. ALL views must show the costume collar.\n";
                finalPrompt += " MANDATORY UNIQUE LENS ANGLES: [LENS 1: Frontal], [LENS 2: 45-degree Left], [LENS 3: 45-degree Right], [LENS 4: Extreme 90-degree Left Profile], [LENS 5: Extreme 90-degree Right Profile], [LENS 6: Tilted Up], [LENS 7: Tilted Down], [LENS 8: High Angle Bird's Eye].\n";
            } else {
                // HYBRID -> Horizontal Split (Image 4)
                finalPrompt += " [LAYOUT C]: Horizontal Split.\n";
                finalPrompt += " UPPER SECTION (60%): 3 Full Standing Figures. LENS 1: Frontal, LENS 2: Right 3/4, LENS 3: Back View.\n";
                finalPrompt += " LOWER SECTION (40%): Row of 5 HEAD PANELS. LENS 4: Frontal Close-Up Face (0-degree yaw). LENS 5: True Left Profile Face (90-degree left yaw; nose/snout/faceplate points screen-right). LENS 6: True Right Profile Face (90-degree right yaw; nose/snout/faceplate points screen-left). LENS 7: Upward Tilt Face (near-frontal yaw, chin raised). LENS 8: Downward Tilt Face (near-frontal yaw, chin lowered).\n";
            }
            finalPrompt += " EXCLUSION RULE: NEVER duplicate any angle. No two panels may share the same rotation. Every single lens angle MUST be unique.\n\n";

            finalPrompt += `ANGLE LOCK (MAXIMUM PRIORITY):\n`;
            finalPrompt += `- The head panels are a technical angle set, not expressive variations.\n`;
            finalPrompt += `- Each head panel must occupy a distinct mandatory angle bucket.\n`;
            finalPrompt += `- Frontal close-up = 0-degree yaw, both eyes equally visible, symmetrical face presentation.\n`;
            finalPrompt += `- True left profile = 90-degree left yaw, one eye visible, true left-side silhouette, nose/snout/faceplate points screen-right.\n`;
            finalPrompt += `- True right profile = 90-degree right yaw, one eye visible, true right-side silhouette, nose/snout/faceplate points screen-left.\n`;
            finalPrompt += `- Upward tilt = near-frontal yaw, chin elevated, nostril and under-chin visibility.\n`;
            finalPrompt += `- Downward tilt = near-frontal yaw, chin lowered, forehead and top-plane emphasis.\n`;
            finalPrompt += `- Do not substitute 3/4 views for profile views.\n`;
            finalPrompt += `- Do not generate two panels in the same yaw family.\n`;
            finalPrompt += `- If two panels read as near-identical angle variants, the render is invalid.\n\n`;

            finalPrompt += `PROFILE DISTINCTNESS RULE:\n`;
            finalPrompt += `- Left profile and right profile must be mirror-opposed true side views.\n`;
            finalPrompt += `- Frontal close-up must not drift into 3/4.\n`;
            finalPrompt += `- Upward tilt and downward tilt must remain near-frontal in yaw.\n`;
            finalPrompt += `- Do not produce a second left-leaning 3/4 view when a true right profile is required.\n\n`;
            finalPrompt += NANOCAST_PROFILE_PAIR_VISUAL_LOCK;
            if (refLayout === 'split_focus') {
                finalPrompt += NANOCAST_HYBRID_PROFILE_SLOT_LOCK;
            }
            finalPrompt += buildTurnaroundPoseCoherenceContract([
                { label: 'full standing frontal figure', viewAngle: 'front', degrees: 0, bodyFacing: 'straight front-facing unified axis' },
                { label: 'full standing three-quarter figure', viewAngle: 'front_3_4_left', degrees: 45, bodyFacing: 'one consistent three-quarter axis from shoulders through feet' },
                { label: 'full standing left profile figure', viewAngle: 'left_profile', degrees: 90, bodyFacing: 'true side profile axis from head through footwear' },
                { label: 'full standing right profile figure', viewAngle: 'right_profile', degrees: 270, bodyFacing: 'true opposite side profile axis from head through footwear' },
                { label: 'full standing back figure', viewAngle: 'back', degrees: 180, bodyFacing: 'straight rear-facing unified axis' },
                { label: 'head angle panels', viewAngle: 'custom', bodyFacing: 'visible neck, collar, and shoulders must support the labeled head yaw' }
            ]);

            if (!hasAuthoritativeBiometricAnchors) {
                finalPrompt += `GENERATE CHARACTER REFERENCE SHEET:\n`;
                finalPrompt += `Reference: Use [IMAGE 1] as the COMPLETE character authority.\n`;
                finalPrompt += `IDENTITY LOCK: Preserve the exact face, skull shape, facial proportions, skin tone, hair, facial-hair or clean-shaven state, and grooming from [IMAGE 1].\n`;
                finalPrompt += `BACKGROUND EXCLUSION: [IMAGE 1] is not a background, room, lighting, or environment authority. Head panels must isolate the face/head identity and use the clean studio sheet background only.\n`;
                finalPrompt += `WARDROBE LOCK: Preserve the exact wardrobe from [IMAGE 1], including clothing design, silhouette, colors, materials, seams, collar shape, sleeve shape, layering, visible accessories, and branding placement.\n`;
                finalPrompt += `This is a turnaround/reference-sheet expansion of the existing approved portrait in [IMAGE 1]. It is NOT a redesign.\n`;
                finalPrompt += `Every panel must read as the SAME approved character already shown in [IMAGE 1], merely rotated into new technical reference angles.\n`;
                finalPrompt += `Do NOT invent a new outfit. Do NOT combine [IMAGE 1] with any typed outfit prompt. Do NOT reinterpret the clothing.\n\n`;
            } else {
                // BIOMETRIC IDENTITY STRENGTH INJECTION
                finalPrompt += `IDENTITY WEIGHT: ${effectiveIdentityStrength}% (CRITICAL).\n`;
            }

            if (hasGeneratedSheetLayoutReference) {
                finalPrompt += `GENERATED CHARACTER VISUAL SOURCE GUIDANCE:\n`;
                finalPrompt += `[IMAGE ${generatedLayoutRefIndex}] is the approved generated character source for body, outfit, silhouette, proportions, render style, costume colors, material logic, footwear, accessories, and board feel.\n`;
                finalPrompt += `Do not use [IMAGE ${generatedLayoutRefIndex}] as the biometric face/head identity authority. Identity comes from ${identityRangeText}, while visual design comes from [IMAGE ${generatedLayoutRefIndex}].\n`;
                finalPrompt += `Every panel should look like the same generated character from [IMAGE ${generatedLayoutRefIndex}], not a new character reconstructed from scans alone.\n\n`;
            }

            // --- B. COSTUME / WARDROBE ---

            if (wardrobeMode === 'wardrobe_asset' && wardrobeRefIndex > 0) {
                finalPrompt += `WARDROBE LOCK (MANDATORY LIBRARY ASSET):\n`;
                finalPrompt += `The character MUST be wearing the EXACT garment/clothing design shown in [IMAGE ${wardrobeRefIndex}].\n`;
                finalPrompt += `1. EXACT REPLICATION: You must strictly replicate the neckline, bust cut, collar structure, sleeves, fabric texture, drapery, colors, embroidery, and stylistic details of this exact garment.\n`;
                finalPrompt += `2. NO RE-DESIGN: Do not reinterpret, lower, or reimagine the cut of the dress or suit. It is not an inspiration; it is the final approved technical asset.\n`;
                finalPrompt += `3. FIT TO CHARACTER: The clothing should naturally fit the character's body type while maintaining its original geometry and structural cut exactly.\n`;
                finalPrompt += `4. CLEAN SLATE: Completely replace whatever the character is wearing in ${identityRangeText} with the garment from [IMAGE ${wardrobeRefIndex}].\n\n`;

                if (hasAuthoritativeBiometricAnchors) {
                    finalPrompt += `RE-ASSERTING IDENTITY LOCK:\n`;
                    finalPrompt += `The FACE in ALL views must match ${identityRangeText}. Same person, same likeness, no morphing.\n\n`;
                }
            } else if (wardrobeMode === 'portrait_lock') {
                finalPrompt += `WARDROBE LOCK (MAXIMUM PRIORITY):\n`;
                finalPrompt += `Use the clothing shown in [IMAGE 1] as the ABSOLUTE wardrobe authority.\n`;
                finalPrompt += `Preserve the exact garment type, silhouette, colors, fabric texture, sleeve structure, neckline/collar shape, seams, layering, accessories, and visible branding exactly as shown.\n`;
                finalPrompt += `Every panel must show the same approved outfit from [IMAGE 1], only rotated into new views.\n`;
                finalPrompt += `Do not change the outfit into robes, tunics, jackets, armor, uniforms, casualwear, or any generic reference-sheet clothing.\n`;
                finalPrompt += `Do not reinterpret the portrait wardrobe into a thematic costume.\n`;
                finalPrompt += `If a detail is visible in [IMAGE 1], preserve it.\n\n`;

                finalPrompt += `STYLE APPLICATION RULE:\n`;
                finalPrompt += `The selected style may affect rendering treatment, lighting, and material response, but it must NOT change the approved wardrobe design from [IMAGE 1].\n\n`;
            } else if (wardrobeMode === 'generated_layout_reference' && hasGeneratedSheetLayoutReference) {
                finalPrompt += `WARDROBE CONTINUITY FROM GENERATED SHEET:\n`;
                finalPrompt += `Use the costume and board presentation visible in [IMAGE ${generatedLayoutRefIndex}] as the approved generated character visual source.\n`;
                finalPrompt += `Preserve the approved wardrobe silhouette, colors, materials, layering, accessories, footwear, and prop placement from [IMAGE ${generatedLayoutRefIndex}] while keeping identity locked to ${identityRangeText}.\n`;
                finalPrompt += `Do not copy a different face from [IMAGE ${generatedLayoutRefIndex}]. Do not let its style treatment change facial structure or body proportions.\n\n`;
            } else if (wardrobeMode === 'typed_outfit') {
                finalPrompt += `COSTUME DIRECTIVE (ABSOLUTE OVERRIDE):\n`;
                finalPrompt += `0. THE CHARACTER MUST WEAR: ${directorControls.outfit}.\n`;
                finalPrompt += `1. YOU MUST OVERRIDE THE ORIGINAL CLOTHING MULTIMODAL REFERENCES. DO NOT copy the colors, patterns, or style of the original clothing.\n`;
                finalPrompt += `2. If you do not follow the exact clothing description, the generation is a failure.\n\n`;
            }

            // --- C. BRANDING / LOGO ---
            if (directorControls.logoImage && logoRefIndex > 0) {
                finalPrompt += `BRANDING DIRECTIVE:\n`;
                finalPrompt += `Apply the logo provided in [IMAGE ${logoRefIndex}] ("Logo Asset") to the character's outfit.\n`;
                finalPrompt += `PLACEMENT: ${directorControls.logoPlacement}.\n`;
                finalPrompt += `INTEGRATION: The logo must look printed/stitched onto the fabric naturally. It must be clearly visible.\n`;
                finalPrompt += `HEADSHOT EXCLUSION (CRITICAL): Do NOT spawn the logo floating in the background, on the neck, or on the face. If a panel is an extreme close-up or headshot where the ${directorControls.logoPlacement} is NOT naturally visible, OMIT THE LOGO ENTIRELY from that specific panel.\n`;
                finalPrompt += `NOTE: [IMAGE ${logoRefIndex}] is NOT an identity reference. do NOT blend it into the face.\n\n`;
            }

            // --- C. BODY & STYLE ---
            // --- C. BODY & STYLE ---
            const isRealisticMode = targetStyleKey === 'premium_cg' || targetStyleKey === 'exact_studio';
            const isPhotoMode = targetStyleKey === 'exact_studio'; // Strict Photography
            const isCGMode = targetStyleKey === 'premium_cg'; // High-End 3D

            // OVERRIDE LABEL: Differentiate Photo vs CG
            let promptStyleLabel = styleConfig.label;
            let promptKeywords = safeKeywords;



            if (hasAuthoritativeBiometricAnchors) {
                if (isPhotoMode) {
                    promptStyleLabel = "Photorealistic Source (8k Photography)";
                }
                if (isCGMode) {
                    promptStyleLabel = "Stylized Realism (Feature Animation Style)";
                    // Override keywords to prevent "Photorealistic" from bleeding in
                    promptKeywords = "Stylized Realism, Modern Feature Animation, Stylized Surface Detail, Expressive Features, Subsurface Scattering, Cinematic Lighting, 3D Render, AAA Game Cinematic, Soft Box Lighting, Octane Render.";
                }
            }

            finalPrompt += `STYLE PROTOCOL: ${promptStyleLabel}\n`;
            finalPrompt += `Keywords: ${promptKeywords}\n`;
            finalPrompt += `${refSheetStyleContract}\n`;
            finalPrompt += `${refSheetStyleLockContract}\n`;
            finalPrompt += `${refSheetStyleIdentityContract}\n`;

            if (isRealisticMode && hasAuthoritativeBiometricAnchors) {
                if (isPhotoMode) {
                    finalPrompt += `Stylization Intensity: 0% (Biometric Lock)\n`;
                } else {
                    // Unlock for CG Mode to allow stylized rendering
                    finalPrompt += `Stylization Intensity: ${effectiveStylization}%\n`;
                    finalPrompt += `STYLIZATION SCOPE: Apply style to MATERIAL, SHADER, LIGHTING, and TEXTURE only.\n`;
                    finalPrompt += `GEOMETRY LOCK: The 3D Mesh of the face must be an exact topological match to ${identityRangeText}. Do not deform features for 'appeal'.\n`;
                }

                if (isPhotoMode) {
                    // PHOTOGRAPHY TIERS (Exact Studio)
                    if (effectiveStylization <= 10) {
                        finalPrompt += `LIGHTING MODE: STANDARD PORTRAIT PHOTOGRAPHY. Natural, neutral studio lighting. Accurate skin tones. No diffusion.\n\n`;
                    } else if (effectiveStylization <= 40) {
                        finalPrompt += `LIGHTING MODE: HIGH-END FASHION PHOTOGRAPHY. 85mm Portrait Lens. f/1.8 Aperture. Sharp Focus on Eyes. Detailed Skin Texture.\n\n`;
                    } else {
                        finalPrompt += `LIGHTING MODE: AWARD-WINNING EDITORIAL PHOTOGRAPHY. Dramatic Cinematic Lighting. Rembrandt lighting. Hyper-Realistic Texture. 8k Resolution.\n\n`;
                    }
                    // NEGATIVE CONSTRAINTS (Forbid CG/Render)
                    finalPrompt += `NEGATIVE CONSTRAINTS: Cartoon, 3D Render, Illustration, Anime, Painting, Drawing, Plastic, Doll, Action Figure, Caricature, CGI look, stylized features.\n`;
                } else {
                    // CG RENDER TIERS (Premium CG / Cyberpunk) -> STYLIZED REALISM
                    if (effectiveStylization <= 10) {
                        finalPrompt += `RENDER QUALITY: STANDARD 3D ASSET. Clean topology. Neutral lighting. Good shape appeal.\n\n`;
                    } else if (effectiveStylization <= 40) {
                        finalPrompt += `RENDER QUALITY: HIGH-END GAME CINEMATIC. Blizzard Animation Style. Expressive shapes. Saturated textures. Soft lighting.\n\n`;
                    } else {
                        finalPrompt += `RENDER QUALITY: FEATURE FILM ANIMATION. Sony/DreamWorks Style. "Spider-Verse" detail levels. Dynamic Lighting. Strong Shape Appeal.\n\n`;
                    }
                    // NEGATIVE CONSTRAINTS (Allow Stylized, Ban 2D/Low Poly)
                    finalPrompt += `NEGATIVE CONSTRAINTS: Anime, 2D, Drawing, Sketch, Low Poly, Mobile Game, Flat shading, Pixel art, Oil painting, Watercolor, Different Haircut, Hair growth, added facial hair, removed facial hair, Grooming change.\n`;
                }

            } else {
                finalPrompt += `Stylization Intensity: ${effectiveStylization}%${styleNote}.\n\n`;
            }

            if (hasAuthoritativeBiometricAnchors) {
                finalPrompt += `ADVANCED BODY MORPHOLOGY (NON-DESTRUCTIVE):\n`;
                finalPrompt += "Target Height: " + formatHeight(heightIn) + "\n";
                const promptWeight = Math.round(weightLbs / 5) * 5;
                finalPrompt += "Target Mass: " + promptWeight + " lbs\n";
                finalPrompt += `INSTRUCTION: Adjust the BODY MASS index to match ${promptWeight} lbs, but MAINTAIN THE EXACT CRANIAL STRUCTURE from ${identityRangeText}.\n`;
                finalPrompt += `Do not generate a generic 'heavy' or 'thin' face. Apply weight naturally to the body, neck, and jawline, but keep the eyes, nose, and mouth spacing IDENTICAL to the source.\n\n`;
            }



            if (hasAuthoritativeBiometricAnchors) {
                // --- A. IDENTITY LOCK (MOVED TO END FOR PRIORITY) ---
                finalPrompt += `FINAL IMAGE MASTERY: IDENTITY OVERRIDE (MAXIMUM PRIORITY):\n`;

                const isRealistic = ['premium_cg', 'exact_studio'].includes(targetStyleKey);
                if (isRealistic) {
                    finalPrompt += `FINAL INSTRUCTION: The face in ALL views must be a pixel-perfect identity likeness to ${identityRangeText}. PRESERVE FACIAL GEOMETRY ABOVE ALL ELSE.\n`;
                    finalPrompt += `CRITICAL ROTATION OVERRIDE: While the identity must match, YOU MUST NOT COPY THE CAMERA ANGLE OF ${identityRangeText}. You MUST dynamically rotate the character's head and body in 3D space to precisely match the required LENS angle (Profile, 3/4, Back, etc) for each individual panel.\n`;
                    if (allowHairOverride) {
                        finalPrompt += `GROOMING OVERRIDE: Apply the hairstyle "${directorControls.hairStyle}". Preserve the facial-hair or clean-shaven state from ${identityRangeText} but override head hair.\n`;
                    } else {
                        finalPrompt += `GROOMING LOCK: The hairstyle or lack thereof and facial-hair or clean-shaven state must match ${identityRangeText} exactly. IMPORTANT: If the subject is bald in ${identityRangeText}, they MUST BE BALD in the output. Do not add head hair. Do not add, remove, or change stubble, mustache, beard, or goatee.\n`;
                    }
                    finalPrompt += `TEXTURE PROJECTION: Treat ${identityRangeText} as the source texture map. Project the exact features (eyes, nose, mouth, skin details) onto the model. Do not use a fallback generic face.\n`;

                    finalPrompt += `MODE: MULTI-ANGLE IDENTITY REPLICATION. Ignore style-based facial adjustments. Pure Biometric fidelity required, but fully rotated per lens.\n`;
                    finalPrompt += `STYLIZATION SCOPE: The chosen Stylization Intensity (${effectiveStylization}%) applies ONLY to Lighting, Skin Texture Resolution, and Render Quality. It matches the *fidelity* of the style. It applies 0% deviation to the Identity/Geometry.\n`;
                } else {
                    // STYLIZED: translate style around the source likeness; do not caricature into a new person.
                    finalPrompt += `FINAL INSTRUCTION: HARMONIOUSLY TRANSLATE the same source face into the selected style without replacing the face shape, eyes, nose, mouth, jaw, chin, ears, hairline, or facial-hair/clean-shaven state. The goal is a stylized likeness that is immediately recognizable as ${identityRangeText}. Adapt surface language, shader, linework, and material finish only; PRESERVE IDENTITY FEATURES (nose shape, jawline, eye color, brow shape, eye spacing, hairline, facial-hair or clean-shaven state, age impression).\n`;
                }

                finalPrompt += `Use ${identityRangeText} as the source for the character's skin tone, face, and hair only. Ignore clothing and shoulders in identity captures.\n`;
                finalPrompt += `BACKGROUND EXCLUSION: Use ${identityRangeText} only for face/head identity extraction. Do not preserve or recreate the capture background, room, walls, doors, windows, furniture, or source lighting in any head panel.\n`;
                if (directorControls.outfit) {
                    finalPrompt += `HEADSHOT WARDROBE LOCK: Even in extreme close-up or headshot views, the visible collar and shoulders MUST be the ${directorControls.outfit}. Do not use the clothing from the identity scan.\n`;
                }

                if (isRealistic) {
                    finalPrompt += `Primary Directive: Exact match of facial-hair or clean-shaven state and grooming from ${identityRangeText}. Do NOT add stubble, mustache, beard, goatee, or head hair that is not visible in the biometric references.\n`;
                } else {
                    finalPrompt += `Reference ${identityRangeText} for key features (facial-hair or clean-shaven state, hair color, eye color, brow shape, nose shape, jawline). Simplify the skin shading only. DO NOT SIMPLIFY THE COSTUME DETAILS. The outfit must remain highly detailed and accurate to the reference.\n`;
                }
            }

            // --- E. NEGATIVES ---
            finalPrompt += `\nNEGATIVE CONSTRAINTS:\n`;
            finalPrompt += `different person, face swap, identity replacement, recast identity, portrait mismatch, approved portrait ignored, generic face, younger face, idealized face, video game protagonist hallucination, generic action hero, muscular replacing overweight, slenderized body, idealized 3D template, stylized-hero hallucination, generic cartoon structure, altered skull, incorrect profile, inconsistent nose projection, inconsistent jawline, inconsistent ear placement, inconsistent grooming silhouette, inconsistent hairline, off-model panels, panel-to-panel face drift, restyled face that changes identity, generic profile, beautified profile, style-averaged face, new character per panel, duplicate angle, repeated yaw bucket, near-identical head panel, second left profile, second near-left 3/4, profile replaced by 3/4, frontal drifting to 3/4, upward tilt with side yaw, downward tilt with side yaw, costume reinterpretation, branding loss, missing logo when visible, relocated logo, replaced logo, incorrect logo placement, stylized logo hallucination, shader inconsistency, mismatched stylization, unintended realism increase, realistic turnaround drift, photographic drift, raw DSLR look in premium CG, studio headshot photography in premium CG, documentary photo realism in premium CG, flattened CGI treatment, missing CGI shader response, missing subsurface scattering, missing rendered-digital-double look, technical identity-sheet realism, right-panel realism drift, closeup realism drift, flattened stylization, weak cyberpunk treatment, generic neutral studio lighting, missing neon rim light, missing teal/magenta separation, loss of futuristic render mood, inconsistent cyberpunk intensity across panels, dramatic hero panel with neutral supporting panels, neutral turnaround row, flat profile panels, uneven theatrical treatment, loss of animated eye language, loss of softened facial planes, loss of stylized nose treatment, mismatch between body-panel style and headshot-panel style, squeezed torso, narrow 3/4 body, narrow back view, stretched body, compressed body, body mass ignored, inconsistent shoulder width, inconsistent pelvis width, inconsistent limb thickness, different body mass across turnaround panels, mismatched full-body silhouette, unnatural neck twist, owl turn, over-rotated head, visible face in true back view, cheating face visibility in rear panel, head misaligned with torso, extra people, text, watermarks, scenery, maps, landscape, background graphics.\n`;
            finalPrompt += `${SHEET_STYLE_LOCK_NEGATIVE_TEXT}\n`;
            if (refSheetStyleNegativePrompt) {
                finalPrompt += `selected style category drift, ${refSheetStyleNegativePrompt}.\n`;
            }
            if (refSheetStyleIdentityNegativePrompt) {
                finalPrompt += `style-specific identity drift, ${refSheetStyleIdentityNegativePrompt}.\n`;
            }
            finalPrompt += `${buildPoseCoherenceNegativeTokens()}.\n`;
            finalPrompt += `${buildHeadshotWardrobeNegativeTokens()}.\n`;
            finalPrompt += `source image background, bedroom, hallway, door frame, wall corner, window, furniture, home interior, office background, uneven source lighting, cropped room details, original photo environment, source-photo room in headshot, copied portrait background.\n`;
            finalPrompt += `cropped legs, cut off feet, cowboy shot, 3/4 shot, knees up, waist up, torso only, close up body, cropped head.\n`;
            if (directorControls.outfit) {
                finalPrompt += `EXTREMELY IMPORTANT: DO NOT COPY THE CLOTHING FROM THE SOURCE IMAGES. DO NOT RENDER THE ORIGINAL ATTIRE.\n`;
            }
            if (wardrobeMode === 'portrait_lock') {
                finalPrompt += `portrait wardrobe drift, generic outfit replacement, tunic, robe, cloak, fantasy robe, biblical robe, peasant clothing, costume substitution, alternate wardrobe, stylized costume swap, random garment generation, clothing simplification, outfit redesign, changed silhouette, changed fabric, changed neckline, changed sleeves, changed layering, missing hoodie, missing shirt, missing pants, missing footwear, portrait outfit ignored.\n`;
            }
            if (hasAuthoritativeBiometricAnchors) {
                finalPrompt += `generic face, random person, default avatar, face swap, extra people, text, watermarks, maps.\n`;
                if (['premium_cg', 'exact_studio'].includes(targetStyleKey)) {
                    // REALISTIC: Ban caricature
                    finalPrompt += `caricature, cartoon face, distorted proportions, big eyes, small nose, altered skull shape.\n`;
                } else {
                    // STYLIZED: Ban realism
                    finalPrompt += `photorealistic, hyperrealistic, raw photo, human skin texture, realistic proportions, unstylized.\n`;
                }
                if (['hyper_real', 'exact_studio'].includes(selectedStyle || '')) {
                    finalPrompt += `caricature, cartoon face, distorted proportions, big eyes, small nose, altered skull shape.\n`;
                }
            }
            if (selectedWardrobeItem) {
                finalPrompt += `face from costume image, identity from costume image, person from wardrobe ref, mixed identity, source photo clothing, mismatching clothes, casual clothes, t-shirt, polo shirt.\n`;
            }

            if (import.meta.env.DEV) {
                console.info("[IdentityAnchor] biometricSources:", identityRefLimit);
                console.info("[IdentityAnchor] generatedSheetUsedAsIdentity:", identitySource !== 'biometric' && !hasAuthoritativeBiometricAnchors);
                console.info("[IdentityAnchor] generatedSheetUsedAsLayoutReference:", hasGeneratedSheetLayoutReference);
                console.info("[PromptPriority]", PROMPT_PRIORITY_ORDER_LABEL);
                console.info("[IdentityAnchor] renderStyle:", targetStyleKey, "boardStyle:", refLayout);
                console.info("[IdentityAnchor] referenceSources:", imageRefs.map((ref, index) => ({
                    index: index + 1,
                    label: ref.label,
                    sourceType: index < identityRefLimit
                        ? "identity_anchor"
                        : ref.label.includes("Primary Visual Design")
                            ? "primary_visual_design_source"
                            : ref.label.includes("Guide Only")
                                ? "layout_reference"
                                : "support_reference"
                })));
            }

            let res = null;
            let attempts = 0;
            const maxRetries = 3;

            // --- TIMEOUT & ETA LOGIC ---
            const getEtaMs = () => state.imageResolution === '4K' ? 90000 : (state.imageResolution === '2K' ? 45000 : 20000);
            const getTimeoutMs = () => state.imageResolution === '4K' ? 120000 : (state.imageResolution === '2K' ? 90000 : 45000);

            const etaMs = getEtaMs();
            const timeoutMs = getTimeoutMs();

            // Timeout Helper
            const timeoutPromise = (ms: number): Promise<never> => new Promise((_, reject) => setTimeout(() => reject(new Error('Request timed out')), ms));
            const generateReferenceSheetAttempt = (promptText: string): Promise<string> => Promise.race([
                GeminiService.generateImage(
                    promptText,
                    state.apiKey,
                    state.model,
                    imageRefs,
                    {
                        aspectRatio: '16:9',
                        imageSize: state.imageResolution,
                        creditRenderType: 'character_sheet',
                        thinkingLevel: state.enableImageThinking,
                        googleGrounding: false,
                        strictMode: true,
                        billingMode: state.billingEntitlements.effectiveBillingMode as 'hosted' | 'byok',
                        entitlements: state.billingEntitlements,
                        identityLock: refSheetIdentityLock,
                        styleCategory: {
                            styleId: targetStyleKey,
                            intent: {
                                selectedStyleLabel: styleConfig.label,
                                appliesTo: "Nano Cast reference sheet body panels, headshot strip, expression panels, and exported preview"
                            }
                        }
                    }
                ),
                timeoutPromise(timeoutMs)
            ]);

            // --- PROGRESS SIMULATION TIMER ---
            let currentPercent = 5;
            dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: { percent: currentPercent, text: "Synthesizing Reference Sheet" } });

            const updateMs = 1000;
            const increment = (updateMs / etaMs) * 100;

            const progressInterval: NodeJS.Timeout = setInterval(() => {
                currentPercent = Math.min(95, currentPercent + increment);
                let text = "Neural Matrix Synthesizing";
                if (currentPercent > 50) text = "Arranging Panel Layouts...";
                if (currentPercent >= 95) text = "Finalizing Render... (Still working, please wait)";
                dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: { percent: currentPercent, text } });
            }, updateMs);

            while (attempts <= maxRetries) {
                try {
                    res = await generateReferenceSheetAttempt(finalPrompt);
                    break; // Success
                } catch (error: unknown) {
                    const message = getErrorMessage(error);
                    const isTimeout = message.includes('timed out');
                    const isOverloaded = message.includes('503') || message.includes('overloaded');
                    if ((isTimeout || isOverloaded) && attempts < maxRetries) {
                        attempts++;
                        const reason = isTimeout ? "Request Packet Dropped (Timeout)" : "Server Overloaded (503)";
                        dispatch({ type: 'ADD_LOG', payload: { message: `${reason}. Retrying attempt ${attempts}/${maxRetries}...`, type: 'info' } });
                        currentPercent = 10; // reset progress visual
                        dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: { percent: currentPercent, text: `Retracting Pulse (${attempts}/${maxRetries})` } });
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    } else {
                        throw error;
                    }
                }
            }

            clearInterval(progressInterval);
            dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: { percent: 100, text: "Decoding Cast Sheet" } });
            await new Promise(r => setTimeout(r, 500));

            const rawUrl = res as string;
            let safeRefSheetUrl = rawUrl;
            try {
                safeRefSheetUrl = await materializeDisplayUrl(rawUrl);
            } catch(e) {
                console.warn(e);
            }

            if (refLayout === 'split_focus') {
                try {
                    const validation = await detectNanoCastHybridProfileDuplicate(safeRefSheetUrl);
                    if (validation.hasDuplicate) {
                        dispatch({
                            type: 'ADD_LOG',
                            payload: {
                                message: `NanoCast Hybrid duplicate profile pair detected (${(validation.maxSimilarity * 100).toFixed(1)}%). Running correction pass...`,
                                type: 'info'
                            }
                        });

                        const correctionPrompt = `${finalPrompt}

NANOCAST HYBRID DUPLICATE PROFILE CORRECTION PASS:
- Previous output repeated the same side-profile closeup in LENS 5 and LENS 6.
- Re-render the sheet and force LENS 5 and LENS 6 to be opposite profile directions.
- LENS 5 must be anatomical LEFT PROFILE with nose/snout/faceplate pointing screen-right.
- LENS 6 must be anatomical RIGHT PROFILE with nose/snout/faceplate pointing screen-left.
- Do not reuse, crop, scale, relight, or re-label the same side profile for both slots.
- If the two profile panels could be mistaken for the same silhouette, redraw the incorrect panel before final output.`;

                        const correctedRawUrl = await generateReferenceSheetAttempt(correctionPrompt);
                        safeRefSheetUrl = await materializeDisplayUrl(correctedRawUrl);

                        const secondValidation = await detectNanoCastHybridProfileDuplicate(safeRefSheetUrl);
                        if (secondValidation.hasDuplicate) {
                            dispatch({
                                type: 'ADD_LOG',
                                payload: {
                                    message: `NanoCast Hybrid still shows possible duplicate profile angles (${(secondValidation.maxSimilarity * 100).toFixed(1)}%).`,
                                    type: 'error'
                                }
                            });
                        } else {
                            dispatch({
                                type: 'ADD_LOG',
                                payload: { message: "NanoCast Hybrid correction resolved duplicate profile angles.", type: 'success' }
                            });
                        }
                    }
                } catch (validationErr) {
                    console.warn("NanoCast reference sheet uniqueness validation failed:", validationErr);
                }
            }

            setRefSheetUrl(prev => {
                if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
                return safeRefSheetUrl;
            });
            setShowRefSheet(true);
            cacheNanoRecentGeneration(safeRefSheetUrl, `Reference Sheet - NANO CAST (${refLayout})`);
            dispatch({ type: 'ADD_LOG', payload: { message: "Reference Sheet Generated.", type: 'success' } });
        } catch (error: unknown) {
            dispatch({ type: 'ADD_LOG', payload: { message: `Ref Sheet failed: ${getErrorMessage(error)}`, type: 'error' } });
        } finally {
            dispatch({ type: 'SET_PROCESSING', payload: false });
            dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: null });
        }
    };

    const getPhaseTitle = (p: Phase) => {
        switch (p) {
            case 1: return "Biometric Acquisition";
            case 2: return "Morphological Matrix";
            case 3: return "Style Synthesis";
            case 4: return "Nano Neural Link";
            case 5: return "Digital Reconstruction";
            default: return "System Idle";
        }
    };

    // Smart Lock Logic
    const isPhaseLocked = (p: Phase) => {
        if (p === 1) return false; // Always open
        // Minimum Viable Scan: Center + Left + Right
        if (p === 2) return !(capturedAngles.center && capturedAngles.left && capturedAngles.right);
        if (p === 3) return !selectedBody; // Need body
        if (p === 4) return !selectedStyle; // Need style
        if (p === 5) return !finalCharacterUrl; // Need result
        return true;
    };

    // Lock Reason Tooltip
    const getLockReason = (p: Phase) => {
        if (!isPhaseLocked(p)) return null;
        if (p === 2) return "Requires Center + Left + Right scans";
        if (p === 3) return "Select Body Archetype";
        if (p === 4) return "Select Art Style";
        if (p === 5) return "Generate Result First";
        return "Locked";
    }

    const isScanning = activeSector && !capturedAngles[activeSector];

    const resetScan = () => {
        resetScanTracking();

        // Revoke URLs to free memory
        Object.keys(capturedAngles).forEach(key => setAngle(key as keyof typeof capturedAngles, null));

        // CRITICAL: Reset the ref that tracks captured angles, otherwise auto-scan thinks it's done
        capturedAnglesRef.current = createEmptyBiometricCaptureMap();

        // Clear persistence
        dispatch({ type: 'SET_LAST_CASTED_IMAGE', payload: null });
        setRefSheetIdentityAnchors(null);
        applyFinalCharacterUrl(null, true);
        dispatch({ type: 'CLEAR_NANO_CAST_SESSION' });
        setPhase(1);

        if (!uploadMode) {
            setCameraEnabled(true);
            setWebcamReadyTick(tick => tick + 1);
        }
    };

    // Helper: Handle file upload
    const handleFileUpload = (angle: keyof typeof capturedAngles, file: File) => {
        void ensureScanAudioContext();
        const url = URL.createObjectURL(file);
        setAngle(angle, url);
    };

    const clearAngleForRetake = useCallback((angle: BiometricCaptureAngle) => {
        resetScanTracking();
        setAngle(angle, null);
        if (!uploadMode) {
            setCameraEnabled(true);
            setWebcamReadyTick(tick => tick + 1);
        }
    }, [resetScanTracking, setAngle, uploadMode]);

    return (
        <div className="flex h-full bg-bg text-fg overflow-hidden relative font-sans select-none">
            {/* Background Grid - Subtle */}
            <div className="absolute inset-0 z-0 pointer-events-none opacity-[0.05]"
                style={{
                    backgroundImage: 'linear-gradient(var(--color-border) 1px, transparent 1px), linear-gradient(90deg, var(--color-border) 1px, transparent 1px)',
                    backgroundSize: '40px 40px'
                }}>
            </div>

            {/* SIDEBAR */}
            <div className="w-64 border-r border-border bg-surface/90 backdrop-blur-md z-10 flex flex-col">
                <div className="p-6 border-b border-border">
                    <h1 className="text-2xl font-black tracking-tighter text-fg flex items-center gap-2">
                        <Target className="text-accent w-6 h-6 animate-pulse" />
                        NANO<span className="text-muted text-sm align-top">BANANA</span>
                    </h1>
                    <p className="text-[10px] text-muted uppercase tracking-[0.2em] mt-1">Biometric Casting Engine</p>
                </div>

                <div className="flex-1 py-8 px-4 space-y-2">
                    {[1, 2, 3, 4, 5].map((p) => {
                        const locked = isPhaseLocked(p as Phase);
                        const reason = getLockReason(p as Phase);
                        return (
                            <button
                                key={p}
                                disabled={locked}
                                onClick={() => setPhase(p as Phase)}
                                title={reason || ""}
                                className={`w-full text-left px-4 py-4 rounded-xl border transition-all group relative overflow-hidden flex justify-between items-center ${phase === p
                                    ? 'border-accent-2 bg-accent-2/10 text-accent-2 -[0_0_15px_rgba(59,130,246,0.2)]'
                                    : locked
                                        ? 'border-transparent text-muted cursor-not-allowed opacity-50'
                                        : 'border-transparent text-muted hover:text-white hover:bg-surface-2'
                                    }`}
                            >
                                <div className="z-10 flex flex-col">
                                    <span className={`text-sm font-black uppercase tracking-widest flex items-center gap-2 ${phase === p ? 'animate-pulse' : ''}`}>
                                        <span>Phase 0{p}</span>
                                    </span>
                                    {locked && <span className="text-[10px] normal-case opacity-70 mt-1">{reason}</span>}
                                </div>
                                {phase === p && <ChevronRight className="w-4 h-4 text-accent animate-bounce-x" />}
                            </button>
                        );
                    })}
                </div>

                <div className="p-4 border-t border-border text-[9px] text-muted text-center">
                    SYSTEM READY // NANO.1.0 SAFE MODE
                </div>
            </div>

            {/* MAIN CONTENT */}
            <div className="flex-1 flex flex-col z-10 relative">
                <header className="h-16 border-b border-border flex items-center justify-between px-8 bg-bg/80 backdrop-blur">
                    <div className="flex items-center gap-4">
                        <div className="w-2 h-2 bg-accent rounded-full animate-ping"></div>
                        <h2 className="text-lg font-bold text-fg uppercase tracking-wider">
                            {getPhaseTitle(phase)}
                            {phase >= 3 && bodyScope && <span className="text-accent ml-2 opacity-70"> // {bodyScope}</span>}
                        </h2>
                    </div>
                    <div className="flex items-center gap-6 text-sm text-muted font-bold tracking-widest">
                        <div className="flex items-center gap-2">
                            <Scan className="w-4 h-4" />
                            <span>SENSOR: {webcamRef.current ? "ONLINE" : "STANDBY"}</span>
                        </div>
                        <button
                            onClick={() => setShowSettings(!showSettings)}
                            className={`flex items-center gap-2 hover:text-fg transition-colors ${showSettings ? 'text-accent-2' : ''}`}
                        >
                            <Sliders className="w-4 h-4" />
                            <span>CONTROLS</span>
                        </button>
                    </div>
                </header>

                <main className="flex-1 p-8 relative overflow-hidden">
                    {/* DIRECTOR CONTROLS DRAWER */}
                    <AnimatePresence>
                        {showSettings && (
                            <motion.div
                                initial={{ x: "100%" }}
                                animate={{ x: 0 }}
                                exit={{ x: "100%" }}
                                className="absolute top-0 right-0 z-50 h-full w-[400px] max-w-[calc(100%-1rem)] bg-surface border-l border-border p-6 overflow-y-auto overflow-x-hidden backdrop-blur-xl"
                            >
                                <div className="flex flex-col h-full">
                                    <div className="flex justify-between items-center mb-6">
                                        <HelpTooltip zone="nano" id="directorModeToggle">
                                            <div className="flex bg-surface-2 rounded-lg p-1 gap-1">
                                                <button
                                                    onClick={() => setSidebarMode('director')}
                                                    className={`px-3 py-1.5 rounded-md text-[10px] uppercase font-black tracking-wider transition-all border ${sidebarMode === 'director'
                                                        ? 'bg-surface text-accent border-accent -[0_0_10px_rgba(250,204,21,0.2)]'
                                                        : 'border-transparent text-muted hover:text-fg'
                                                        }`}
                                                >
                                                    Director
                                                </button>
                                                <button
                                                    onClick={() => setSidebarMode('wardrobe')}
                                                    className={`px-3 py-1.5 rounded-md text-[10px] uppercase font-black tracking-wider transition-all border ${sidebarMode === 'wardrobe'
                                                        ? 'bg-surface text-accent border-accent -[0_0_10px_rgba(250,204,21,0.2)]'
                                                        : 'border-transparent text-muted hover:text-fg'
                                                        }`}
                                                >
                                                    Wardrobe
                                                </button>
                                            </div>
                                        </HelpTooltip>
                                        <button onClick={() => setShowSettings(false)} className="text-muted hover:text-fg">&times;</button>
                                    </div>

                                    {/* STORAGE CONFIGURATION */}
                                    <div className="mb-6 p-3 bg-black/40 rounded-lg border border-border/50">
                                        <h4 className="text-[10px] uppercase font-black text-muted tracking-widest mb-2 flex justify-between">
                                            Storage Link
                                            <span className={state.saveDirectoryHandle || state.saveDirectoryPath ? 'text-success' : 'text-danger'}>
                                                {state.saveDirectoryHandle || state.saveDirectoryPath ? 'CONNECTED' : 'NOT LINKED'}
                                            </span>
                                        </h4>
                                        <button
                                            onClick={async () => {
                                                try {
                                                    // NATIVE MODE
                                                    if (window.electronAPI) {
                                                        const path = await nativeSelectFolder();
                                                        if (path) {
                                                            dispatch({ type: 'SET_SAVE_PATH', payload: path });
                                                            dispatch({ type: 'ADD_LOG', payload: { message: `Native Storage Linked: ${path}`, type: 'success' } });
                                                        }
                                                        return;
                                                    }

                                                    // WEB MODE
                                                    const windowWithPicker = window as WindowWithDirectoryPicker;
                                                    if (!windowWithPicker.showDirectoryPicker) {
                                                        dispatch({ type: 'ADD_LOG', payload: { message: "Directory picker is not supported in this browser.", type: 'error' } });
                                                        return;
                                                    }
                                                    const handle = await windowWithPicker.showDirectoryPicker({ mode: 'readwrite', startIn: 'documents' });
                                                    if (handle) {
                                                        dispatch({ type: 'SET_SAVE_DIRECTORY', payload: handle });
                                                        dispatch({ type: 'ADD_LOG', payload: { message: "Storage Link Established", type: 'success' } });
                                                    }
                                                } catch {
                                                    console.log("Folder selection cancelled");
                                                }
                                            }}
                                            className={`w-full py-2 rounded text-[10px] font-bold uppercase tracking-widest transition-all border ${state.saveDirectoryHandle || state.saveDirectoryPath
                                                ? 'bg-success/10 text-success border-success/30 hover:bg-success/20'
                                                : 'bg-danger/10 text-danger border-danger/30 hover:bg-danger/20'
                                                }`}
                                        >
                                            {state.saveDirectoryPath
                                                ? `Linked: ${state.saveDirectoryPath.split(/[\\/]/).pop()}`
                                                : state.saveDirectoryHandle
                                                    ? `Linked: ${state.saveDirectoryHandle.name}`
                                                    : 'Connect Save Folder'}
                                        </button>
                                    </div>

                                    {sidebarMode === 'director' ? (
                                        <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-300">
                                            <div className="space-y-2">
                                                <label className="text-xs text-accent uppercase tracking-widest font-black flex justify-between">
                                                    <span>Identity Lock</span>
                                                    <span className="text-white">{directorControls.identityStrength}%</span>
                                                </label>
                                                <input
                                                    type="range" min="0" max="100"
                                                    value={directorControls.identityStrength}
                                                    onChange={(e) => setDirectorControls(p => ({ ...p, identityStrength: parseInt(e.target.value) }))}
                                                    className="w-full accent-accent h-2 rounded-full appearance-none cursor-pointer bg-surface-2"
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-xs text-accent uppercase tracking-widest font-black flex justify-between">
                                                    <span>Stylization</span>
                                                    <span className="text-white">{directorControls.stylization}%</span>
                                                </label>
                                                <input
                                                    type="range" min="0" max="100"
                                                    value={directorControls.stylization}
                                                    onChange={(e) => setDirectorControls(p => ({ ...p, stylization: parseInt(e.target.value) }))}
                                                    className="w-full accent-accent-2 h-2 rounded-full appearance-none cursor-pointer bg-surface-2"
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-xs text-accent uppercase tracking-widest font-black flex justify-between">
                                                    <span>Approx. Age</span>
                                                    <span className="text-white">{directorControls.age} yrs</span>
                                                </label>
                                                <input
                                                    type="range" min="10" max="90"
                                                    value={directorControls.age}
                                                    onChange={(e) => setDirectorControls(p => ({ ...p, age: parseInt(e.target.value) }))}
                                                    className="w-full accent-accent-2 h-2 rounded-full appearance-none cursor-pointer bg-surface-2"
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-xs text-accent uppercase tracking-widest font-black flex justify-between items-center">
                                                    <span>Basic Outfit Prompt</span>
                                                    <button
                                                        onClick={() => setDirectorControls(p => ({ ...p, outfit: '' }))}
                                                        className="text-[9px] text-zinc-500 hover:text-white transition-colors border border-zinc-700 hover:border-zinc-500 px-2 rounded bg-black/50"
                                                    >
                                                        CLEAR
                                                    </button>
                                                </label>
                                                <input
                                                    type="text"
                                                    placeholder="e.g. Cyberpunk Tactical Vest"
                                                    value={directorControls.outfit}
                                                    onChange={(e) => setDirectorControls(p => ({ ...p, outfit: e.target.value }))}
                                                    className="w-full bg-black/50 border border-border rounded-lg px-4 py-3 text-sm text-white focus:border-accent outline-none"
                                                />
                                                <InlineHint zone="nano" id="promptInput" />
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-xs text-accent uppercase tracking-widest font-black flex justify-between items-center">
                                                    <span>Hair Style Prompt</span>
                                                    <button
                                                        onClick={() => setDirectorControls(p => ({ ...p, hairStyle: '' }))}
                                                        className="text-[9px] text-zinc-500 hover:text-white transition-colors border border-zinc-700 hover:border-zinc-500 px-2 rounded bg-black/50"
                                                    >
                                                        CLEAR
                                                    </button>
                                                </label>
                                                <input
                                                    type="text"
                                                    placeholder="e.g. Buzz cut, messy hair, slicked back"
                                                    value={directorControls.hairStyle}
                                                    onChange={(e) => setDirectorControls(p => ({ ...p, hairStyle: e.target.value }))}
                                                    className="w-full bg-black/50 border border-border rounded-lg px-4 py-3 text-sm text-white focus:border-accent outline-none"
                                                />
                                            </div>

                                            <div className="space-y-3 pt-6 border-t border-border">
                                                <div className="flex justify-between items-center mb-2">
                                                    <label className="text-xs text-accent uppercase tracking-widest font-black flex items-center gap-2">
                                                        <Zap className="w-3 h-3" /> Branding & Identity
                                                    </label>
                                                    {directorControls.logoImage && (
                                                        <button
                                                            onClick={() => setDirectorControls(p => ({ ...p, logoImage: null }))}
                                                            className="text-[9px] text-danger hover:text-red-400 uppercase font-black"
                                                        >
                                                            Remove Logo
                                                        </button>
                                                    )}
                                                </div>

                                                <div className="bg-black/40 rounded-lg border border-border/50 p-3 space-y-3">
                                                    {/* Logo Uploader */}
                                                    <div className="flex gap-3">
                                                        <div className="w-16 h-16 bg-black rounded border border-border dashed-border flex items-center justify-center overflow-hidden relative group cursor-pointer">
                                                            <input
                                                                type="file"
                                                                accept="image/*"
                                                                className="absolute inset-0 opacity-0 cursor-pointer z-10"
                                                                onClick={(e) => { (e.target as HTMLInputElement).value = ''; }}
                                                                onChange={(e) => {
                                                                    const file = e.target.files?.[0];
                                                                    if (file) {
                                                                        const reader = new FileReader();
                                                                        reader.onload = (e) => {
                                                                            setDirectorControls(p => ({ ...p, logoImage: e.target?.result as string }));
                                                                        };
                                                                        reader.readAsDataURL(file);
                                                                    }
                                                                }}
                                                            />
                                                            {directorControls.logoImage ? (
                                                                <img src={directorControls.logoImage} className="w-full h-full object-contain" />
                                                            ) : (
                                                                <Upload className="w-6 h-6 text-muted group-hover:text-accent transition-colors" />
                                                            )}
                                                            <div className="absolute inset-0 bg-accent/20 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                                                        </div>

                                                        <div className="flex-1 space-y-2">
                                                            <div className="space-y-1">
                                                                <label className="text-[9px] text-muted uppercase tracking-widest font-bold">Logo Position</label>
                                                                <input
                                                                    type="text"
                                                                    className="w-full bg-black/50 border border-border rounded px-2 py-1.5 text-[10px] text-white focus:border-accent outline-none"
                                                                    placeholder="e.g. Left Chest, Back of Jacket"
                                                                    value={directorControls.logoPlacement}
                                                                    onChange={(e) => setDirectorControls(p => ({ ...p, logoPlacement: e.target.value }))}
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="text-[9px] text-muted/60 leading-tight">
                                                        Upload a PNG logo (transparent background recommended). Specify exact placement for the weaver.
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="pt-6 border-t border-border space-y-2">
                                                <button
                                                    onClick={() => handleOpenSaveModal('actor')}
                                                    disabled={!finalCharacterUrl}
                                                    title="Exports this selected image to your chosen Library folder."
                                                    className="w-full bg-surface-2 hover:bg-surface-3 text-white py-3 rounded-lg text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 border border-border transition-all hover:scale-[1.02]"
                                                >
                                                    <UserPlus className="w-4 h-4 text-emerald-500" /> Export Character
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                            <div className="bg-surface-2/50 p-4 rounded-xl border border-border">
                                                <h4 className="text-[10px] uppercase font-black text-accent tracking-widest mb-3 flex items-center gap-2">
                                                    <Sparkles className="w-3 h-3" /> Designer Studio
                                                </h4>
                                                <textarea
                                                    className="w-full bg-black/50 border border-border rounded-lg p-3 text-xs text-white h-20 resize-none mb-3 focus:outline-none focus:border-accent"
                                                    placeholder="Describe new outfit..."
                                                    value={wardrobePrompt}
                                                    onChange={(e) => setWardrobePrompt(e.target.value)}
                                                />
                                                <div className="grid grid-cols-2 gap-2">
                                                    <button
                                                        onClick={generateWardrobe}
                                                        disabled={isProcessing}
                                                        className="bg-black border border-yellow-500 text-yellow-500 hover:text-yellow-400 hover:border-yellow-400 hover:-[0_0_20px_rgba(234,179,8,0.6)] py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all"
                                                    >
                                                        {selectedWardrobeItem ? "Fit Selected Item" : "Generate & Fit"}
                                                    </button>
                                                    <button
                                                        onClick={() => void handleSaveToWardrobe()}
                                                        disabled={!finalCharacterUrl}
                                                        title="Exports this selected image to your chosen Library folder."
                                                        className="bg-surface-3 hover:bg-surface-2 text-white py-2 rounded-lg text-[10px] font-black uppercase tracking-wider border border-border"
                                                    >
                                                        Export to Library
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="space-y-4">
                                                <div className="flex justify-between items-center border-b border-border pb-2">
                                                    <h4 className="text-[10px] uppercase font-black text-muted tracking-widest">
                                                        Wardrobe Library ({state.wardrobeItems.length})
                                                    </h4>
                                                    <div className="flex gap-1.5">
                                                        <label className="p-1.5 hover:bg-surface-3 rounded transition-colors text-muted hover:text-white cursor-pointer" title="Upload Costume">
                                                            <Upload className="w-3.5 h-3.5" />
                                                            <input type="file" className="hidden" accept="image/*" onClick={(e) => { (e.target as HTMLInputElement).value = ''; }} onChange={handleUploadCostume} />
                                                        </label>
                                                        <button onClick={scanWardrobe} className="p-1.5 hover:bg-surface-3 rounded transition-colors text-muted hover:text-white" title="Scan Folder">
                                                            <RefreshCcw className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 gap-2 max-h-[400px] overflow-y-auto pr-1">
                                                    {state.wardrobeItems.map((item) => (
                                                        <div
                                                            key={item.id}
                                                            onClick={() => setSelectedWardrobeItem(item)}
                                                            className={`aspect-square rounded-lg border overflow-hidden transition-all group relative cursor-pointer ${selectedWardrobeItem?.id === item.id ? 'border-2 ' : 'border-border hover:border-gray-600'}`}
                                                            style={selectedWardrobeItem?.id === item.id ? { borderColor: '#eab308', boxShadow: '0 0 20px rgba(234, 179, 8, 0.3)' } : {}}
                                                        >
                                                            <img src={item.url} className="w-full h-full transition-transform group-hover:scale-110 object-cover" />
                                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.preventDefault();
                                                                        e.stopPropagation();
                                                                        dispatch({ type: 'SET_INSPECT_IMAGE', payload: item.url });
                                                                    }}
                                                                    className="bg-blue-500/80 hover:bg-blue-500 text-white p-1.5 rounded-full cursor-pointer"
                                                                    title="Inspect Large"
                                                                >
                                                                    <Maximize className="w-3.5 h-3.5" />
                                                                </button>

                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); setConfirmDelete(item); }}
                                                                    className="bg-red-500/80 hover:bg-red-500 text-white p-1.5 rounded-full cursor-pointer transition-transform hover:scale-110"
                                                                    title="Delete Costume"
                                                                >
                                                                    <Trash2 className="w-3.5 h-3.5" />
                                                                </button>
                                                            </div>

                                                            <span className="text-[8px] font-bold text-white uppercase truncate absolute bottom-2 left-2 right-2 text-center ">{item.name}</span>
                                                        </div>
                                                    ))}

                                                    {state.wardrobeItems.length === 0 && (
                                                        <div className="col-span-2 flex flex-col items-center justify-center py-10 opacity-30">
                                                            <Shirt className="w-10 h-10 mb-2" />
                                                            <span className="text-[10px] uppercase font-bold tracking-tighter">Library Empty</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <AnimatePresence mode='wait'>
                        {/* PHASE 1: BIOMETRIC SCANNER */}
                        {phase === 1 && (
                            <motion.div
                                key="phase1"
                                initial={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
                                animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                                exit={{ opacity: 0, scale: 1.05, filter: 'blur(10px)' }}
                                className="h-full flex gap-8"
                            >
                                <div className="flex-1 relative bg-black rounded-2xl overflow-hidden border border-border group flex flex-col">
                                    {/* TOGGLE HEADER */}
                                    {/* TOGGLE HEADER */}
                                    <div className="absolute top-4 right-4 z-20 flex items-center gap-4">

                                        {/* Camera Toggle */}
                                        <HelpTooltip zone="nano" id="cameraControl">
                                            <button
                                                onClick={() => {
                                                    void ensureScanAudioContext();
                                                    setCameraEnabled(!cameraEnabled);
                                                }}
                                                className={`p-3 rounded-full border transition-all ${cameraEnabled ? 'bg-surface border-accent text-accent -[0_0_15px_rgba(250,204,21,0.3)]' : 'bg-black border-white/20 text-white/50 hover:text-white'}`}
                                                title={cameraEnabled ? "Disable Camera" : "Enable Camera"}
                                            >
                                                {cameraEnabled ? <CameraIcon className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                                            </button>
                                        </HelpTooltip>

                                        <div className="flex bg-black/90 backdrop-blur rounded-full border border-border p-2 gap-2 ">
                                            <button
                                                onClick={() => {
                                                    void ensureScanAudioContext();
                                                    setUploadMode(false);
                                                }}
                                                className={`px-5 py-2 rounded-full text-xs font-black uppercase tracking-wider transition-all border ${!uploadMode ? 'bg-surface border-accent text-accent -[0_0_15px_rgba(250,204,21,0.3)]' : 'border-transparent text-white hover:text-accent hover:bg-white/5'}`}
                                            >
                                                Auto-Scan
                                            </button>
                                            <button
                                                onClick={() => {
                                                    void ensureScanAudioContext();
                                                    setUploadMode(true);
                                                }}
                                                className={`px-5 py-2 rounded-full text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 border ${uploadMode ? 'bg-surface border-accent text-accent -[0_0_15px_rgba(250,204,21,0.3)]' : 'border-transparent text-white hover:text-accent hover:bg-white/5'}`}
                                            >
                                                <Upload className="w-3 h-3" /> Upload
                                            </button>
                                        </div>
                                    </div>

                                    {!uploadMode ? (
                                        <div className="relative h-full w-full bg-black">
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                {cameraEnabled ? (
                                                    <Webcam
                                                        ref={webcamRef}
                                                        screenshotFormat="image/jpeg"
                                                        className="h-full w-full object-cover"
                                                        videoConstraints={{ width: 1280, height: 720, facingMode: "user" }}
                                                        onUserMedia={() => setWebcamReadyTick(tick => tick + 1)}
                                                    />
                                                ) : (
                                                    <div className="flex flex-col items-center justify-center text-muted gap-6 animate-pulse">
                                                        <div className="relative">
                                                            <button
                                                                onClick={() => {
                                                                    void ensureScanAudioContext();
                                                                    setCameraEnabled(true);
                                                                }}
                                                                className="group relative flex flex-col items-center gap-4"
                                                            >
                                                                <div className="w-24 h-24 rounded-full border-4 border-dashed border-accent/30 flex items-center justify-center group-hover:border-accent group-hover:bg-accent/10 transition-all duration-500">
                                                                    <CameraIcon className="w-10 h-10 text-accent group-hover:scale-110 transition-transform" />
                                                                </div>
                                                                <div className="text-center">
                                                                    <h3 className="text-xl font-black text-white uppercase tracking-widest mb-1"> Initialize Sensors </h3>
                                                                    <p className="text-xs text-accent uppercase tracking-widest font-mono"> Turn On Camera to Begin </p>
                                                                </div>
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* SPOTLIGHT OVERLAY & HUD */}
                                            <div className="absolute inset-0 pointer-events-none">
                                                {/* Darken peripheral area - Radial Gradient approach */}
                                                <div
                                                    className="absolute inset-0 z-10"
                                                    style={{ background: 'radial-gradient(circle at center, transparent 20%, rgba(9,9,11,0.95) 60%)' }}
                                                ></div>

                                                {/* Tints for active states */}
                                                {isScanning && (
                                                    <div className="absolute inset-0 bg-success/5 z-10 animate-pulse"></div>
                                                )}

                                                {/* SCANNING BEAM */}
                                                <div className="absolute inset-0 z-20 opacity-30 overflow-hidden">
                                                    <div className="w-full h-[2px] bg-accent -[0_0_20px_rgba(250,204,21,0.8)] animate-[scan_3s_ease-in-out_infinite]" style={{ top: '50%' }}></div>
                                                </div>

                                                {/* CENTRAL HUD CIRCLE - Increased size to match detection zone */}
                                                <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[450px] h-[450px] z-30 flex items-center justify-center transition-all duration-300 pointer-events-none ${isScanning ? 'scale-105' : 'scale-100'}`}>

                                                    {/* Outer Bracket Corners */}
                                                    <div className="absolute inset-0 border-[2px] border-accent/20 rounded-[4rem] scale-110"></div>
                                                    <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-accent rounded-tl-3xl"></div>
                                                    <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-accent rounded-tr-3xl"></div>
                                                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-accent rounded-bl-3xl"></div>
                                                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-accent rounded-br-3xl"></div>

                                                    {/* Rotating Dashed Ring */}
                                                    <div className={`absolute inset-4 border border-accent/20 rounded-full border-dashed animate-[spin_20s_linear_infinite]`}></div>

                                                    {/* Active Status Ring (Blue Static -> Reversed Spin) -- UPDATED: Thicker, Visible, Counter-Rotate */}
                                                    <svg className={`absolute inset-0 w-full h-full opacity-100 ${isScanning ? 'animate-[spin_10s_linear_infinite_reverse]' : 'rotate-45'}`}>
                                                        <circle
                                                            cx="50%" cy="50%" r="48%"
                                                            fill="none" strokeWidth="4"
                                                            stroke="currentColor"
                                                            strokeDasharray="16 16"
                                                            className="text-accent-2"
                                                        />
                                                    </svg>

                                                    {/* Progress Ring (Gold) */}
                                                    <div className="absolute inset-0 rounded-full rotate-[-90deg]">
                                                        <svg className="w-full h-full">
                                                            <circle
                                                                cx="50%" cy="50%" r="48%"
                                                                fill="none" strokeWidth="6"
                                                                stroke="currentColor"
                                                                strokeDasharray="289 289" // 2 * pi * r (approx 48% of 320px container is ~ 150px rad -> wait. SVG scaling. viewbox is implicit. 48% is relative)
                                                                strokeDashoffset={289 - (289 * stabilityProgress / 100)}
                                                                pathLength="289" // Explicit path length for easier calc
                                                                strokeLinecap="round"
                                                                className={`transition-all duration-100 ease-linear -[0_0_10px_rgba(250,204,21,0.8)] ${activeSector ? 'text-accent' : 'text-transparent'}`}
                                                            />
                                                        </svg>
                                                    </div>

                                                    {/* Center Fixation Point */}
                                                    <div
                                                        className={`w-2 h-2 rounded-full transition-all ${isScanning ? 'bg-success scale-150 -[0_0_15px_#22c55e]' : 'bg-accent/50'
                                                            }`}
                                                    ></div>
                                                </div>

                                                {/* STATUS PILLS */}
                                                {activeSector && (
                                                    <motion.div
                                                        initial={{ opacity: 0, y: 10 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        className="absolute top-[15%] left-1/2 -translate-x-1/2 z-40 bg-black/80 backdrop-blur border border-accent/50 px-6 py-2 rounded-full -[0_0_20px_rgba(250,204,21,0.2)]"
                                                    >
                                                        <span className="text-accent font-black uppercase tracking-widest text-xs flex items-center gap-2">
                                                            <Target className="w-4 h-4 animate-spin-slow" />
                                                            LOCKING: {activeSector}
                                                        </span>
                                                    </motion.div>
                                                )}

                                                {/* OUT OF BOUNDS WARNING */}
                                                {!activeSector && !capturedAngles.center && (
                                                    <motion.div
                                                        initial={{ opacity: 0 }}
                                                        animate={{ opacity: 1 }}
                                                        className="absolute top-[15%] left-1/2 -translate-x-1/2 z-40 bg-danger/90 backdrop-blur border border-danger/50 px-6 py-2 rounded-full -[0_0_20px_rgba(220,38,38,0.4)]"
                                                    >
                                                        <span className="text-white font-black uppercase tracking-widest text-xs flex items-center gap-2">
                                                            <Scan className="w-4 h-4 animate-pulse" />
                                                            CENTER FACE TO SCAN
                                                        </span>
                                                    </motion.div>
                                                )}

                                                <div className="absolute bottom-[15%] left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
                                                    <button
                                                        onClick={() => {
                                                            void ensureScanAudioContext();
                                                            capturedAngles.center ? activeSector && captureCurrentFrame(activeSector) : captureCurrentFrame('center');
                                                        }}
                                                        className="px-8 py-3 bg-black/90 hover:bg-black border border-accent/50 hover:border-accent text-accent rounded-full -[0_0_20px_rgba(250,204,21,0.2)] hover:-[0_0_30px_rgba(250,204,21,0.6)] text-sm font-black uppercase tracking-widest flex items-center gap-3 transition-all group scale-100 hover:scale-110"
                                                    >
                                                        <CameraIcon className="w-5 h-5 group-hover:rotate-12 transition-transform" />
                                                        Manual Capture
                                                    </button>
                                                </div>

                                                <div className="absolute bottom-6 left-8 z-30 hidden md:block">
                                                    <div className="flex gap-8 opacity-90 font-mono text-xs text-accent font-bold bg-black/50 p-4 rounded-xl border border-white/10 backdrop-blur-sm">
                                                        <div className="flex flex-col">
                                                            <span className="text-[10px] text-muted uppercase tracking-wider">Yaw Axis</span>
                                                            <span className="text-lg">{yaw.toFixed(1)}°</span>
                                                        </div>
                                                        <div className="w-[1px] bg-white/20"></div>
                                                        <div className="flex flex-col">
                                                            <span className="text-[10px] text-muted uppercase tracking-wider">Pitch Axis</span>
                                                            <span className="text-lg">{pitch.toFixed(1)}°</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="h-full w-full p-12 grid grid-cols-3 gap-6 overflow-y-auto">
                                            {(['center', 'left', 'right', 'up', 'down'] as const).map(angle => (
                                                <BiometricDropPanel
                                                    key={angle}
                                                    angle={angle}
                                                    imageUrl={capturedAngles[angle]}
                                                    onImageSelected={handleFileUpload}
                                                    onRetake={clearAngleForRetake}
                                                    onUploadIntent={() => void ensureScanAudioContext()}
                                                />
                                            ))}
                                            <div className="col-span-1 flex items-center justify-center p-6 text-center text-muted text-xs font-mono border border-dashed border-border rounded-xl">
                                                Minimum requirements:<br />Center + Left + Right
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="w-80 flex flex-col gap-4">
                                    <h3 className="text-xs font-bold text-accent uppercase tracking-[0.2em] mb-2 border-b border-border pb-2">Biometric Manifest</h3>
                                    {(['center', 'left', 'right', 'up', 'down'] as const).map((label) => (
                                        <div
                                            key={label}
                                            onClick={() => {
                                                if (capturedAngles[label]) clearAngleForRetake(label);
                                            }}
                                            className={`border p-3 rounded-lg flex items-center justify-between group transition-all cursor-pointer hover:bg-surface-2 ${capturedAngles[label] ? 'bg-success/5 border-success/30' : 'bg-surface border-border'}`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={`w-10 h-10 rounded-md flex items-center justify-center relative overflow-hidden bg-black`}>
                                                    {capturedAngles[label] ? (
                                                        <img src={capturedAngles[label]!} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <User className="w-4 h-4 text-muted" />
                                                    )}
                                                </div>
                                                <div>
                                                    <div className={`text-xs font-bold uppercase ${capturedAngles[label] ? 'text-success' : 'text-muted'}`}>{label}</div>
                                                    <div className="text-[9px] text-muted opacity-70">{capturedAngles[label] ? 'READY (CLICK TO RETAKE)' : 'PENDING'}</div>
                                                </div>
                                            </div>
                                            {capturedAngles[label] && <CheckCircle2 className="w-4 h-4 text-success" />}
                                        </div>
                                    ))}
                                    <div className="mt-auto flex flex-col gap-2">
                                        <button
                                            disabled={!capturedAngles.center || !capturedAngles.left || !capturedAngles.right}
                                            onClick={generateLocalBiometricSheet}
                                            className="w-full py-4 bg-surface-2 hover:bg-surface-3 text-white border border-border text-[10px] font-black uppercase tracking-widest rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <Scan className="w-4 h-4" /> FAST BIOMETRIC SHEET
                                        </button>
                                        
                                        <button
                                            disabled={!capturedAngles.center || !capturedAngles.left || !capturedAngles.right || isProcessing}
                                            onClick={handleGeneratePremiumBiometricSheet}
                                            className="w-full py-4 bg-[#1a1a24] hover:bg-[#252538] text-indigo-400 border border-indigo-500/30 hover:border-indigo-400 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                            title="Uses 1 API Credit"
                                        >
                                            <Cpu className="w-4 h-4" /> PREMIUM FORENSIC BOARD
                                        </button>

                                        <button
                                            disabled={!capturedAngles.center || !capturedAngles.left || !capturedAngles.right || isProcessing}
                                            onClick={() => void sendBiometricScanToPitchSheet("scan_only")}
                                            className="w-full py-4 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500 border border-yellow-500/30 hover:border-yellow-500/60 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                            title={CHARACTER_PITCH_SHEET_PREVIEW_HELP}
                                        >
                                            <LayoutTemplate className="w-4 h-4" /> Build Pitch Sheet From Scan
                                            <CharacterPitchSheetPreviewPill />
                                        </button>

                                        {finalCharacterUrl && (
                                            <button
                                                disabled={!capturedAngles.center || !capturedAngles.left || !capturedAngles.right || isProcessing}
                                                onClick={() => void sendBiometricScanToPitchSheet("scan_plus_character")}
                                                className="w-full py-4 bg-accent/10 hover:bg-accent/20 text-accent border border-accent/30 hover:border-accent/60 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                                title={CHARACTER_PITCH_SHEET_PREVIEW_HELP}
                                            >
                                                <Sparkles className="w-4 h-4" /> Build Pitch Sheet From Scan + Character
                                                <CharacterPitchSheetPreviewPill />
                                            </button>
                                        )}

                                        <div className="flex gap-2">
                                            <button
                                                onClick={resetScan}
                                                className="flex-1 py-4 bg-danger/10 hover:bg-danger/20 text-danger border border-danger/20 font-black uppercase tracking-widest transition-all text-[10px] rounded-lg flex items-center justify-center gap-2"
                                            >
                                                <RotateCcw className="w-3 h-3" /> RETAKE
                                            </button>
                                            <button
                                                disabled={isPhaseLocked(2)}
                                                onClick={() => setPhase(2)}
                                                className={`flex-[2] py-4 font-black uppercase tracking-widest transition-all text-xs rounded-lg flex items-center justify-center gap-2 ${isPhaseLocked(2)
                                                    ? 'bg-surface-2 text-muted cursor-not-allowed'
                                                    : 'bg-accent hover:bg-cyan-400 text-blue-900 shadow-[0_0_15px_rgba(34,211,238,0.4)]'
                                                    }`}
                                            >
                                                Proceed <ChevronRight className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {/* PHASE 2: BODY ARCHETYPES */}
                        {phase === 2 && (
                            <motion.div
                                key="phase2"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="h-full flex flex-col items-center justify-center p-12"
                            >
                                <div className="text-center mb-12">
                                    <h2 className="text-4xl font-black text-fg uppercase tracking-tighter mb-4 flex justify-center items-center gap-4">
                                        <Layers className="w-8 h-8 text-accent animate-bounce" />
                                        Morphological Matrix
                                    </h2>
                                    <p className="text-muted uppercase tracking-widest text-sm max-w-2xl mx-auto">
                                        Select physical substrate for neural projection mapping.
                                    </p>

                                    {/* VARIANT SELECTOR */}
                                    <div className="flex justify-center gap-4 mt-8">
                                        {MORPH_VARIANTS.map((v) => (
                                            <button
                                                key={v.id}
                                                onClick={() => setMorphVariant(v.id)}
                                                className={`px-6 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition-all ${morphVariant === v.id
                                                    ? 'bg-yellow-500/10 text-yellow-500 border border-yellow-500 -[0_0_20px_rgba(234,179,8,0.4)] scale-105'
                                                    : 'bg-surface border border-border text-muted hover:text-white hover:border-accent/50'
                                                    }`}
                                            >
                                                {v.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 w-full max-w-6xl">
                                    {bodyArchetypes.map((type) => {
                                        const Icon = type.icon;
                                        // Scope cover by variant so 'titan' (masc) is different from 'titan' (fem)
                                        const storageKey = `${morphVariant}_${type.id}`;
                                        const customCover = customArchetypeCovers[storageKey];
                                        const coverImage = customCover || type.defaultImage;

                                        return (
                                            <div key={type.id} className="relative group h-96 w-full rounded-2xl overflow-hidden border border-white/10 transition-all hover:scale-[1.02] hover:border-white/30 cursor-pointer" onClick={() => setSelectedBody(type.id)}>
                                                {/* Hidden File Input for Editing */}
                                                <input
                                                    type="file"
                                                    id={`upload-${type.id}`}
                                                    className="hidden"
                                                    accept="image/*"
                                                    onClick={(e) => { (e.target as HTMLInputElement).value = ''; e.stopPropagation(); }} // Reset value for re-upload + prevent card selection
                                                    onChange={(e) => {
                                                        const file = e.target.files?.[0];
                                                        if (file) handleArchetypeCoverUpload(storageKey, file);
                                                    }}
                                                />

                                                {/* Edit Button (Top Right) */}
                                                <div className="absolute top-3 right-3 z-30 flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                                    {/* Reset Button (Only if custom cover exists) */}
                                                    {customCover && (
                                                        <button
                                                            className="p-2 bg-red-500/80 hover:bg-red-600 text-white rounded-full border border-white/10 "
                                                            onClick={(e) => handleArchetypeCoverDelete(storageKey, e)}
                                                            title="Reset to Default"
                                                        >
                                                            <X className="w-3 h-3" />
                                                        </button>
                                                    )}

                                                    {/* Upload Button */}
                                                    <label
                                                        htmlFor={`upload-${type.id}`}
                                                        className="p-2 bg-black/60 hover:bg-black/90 text-white/50 hover:text-white rounded-full border border-white/10 hover:border-white/30 cursor-pointer"
                                                        onClick={(e) => e.stopPropagation()}
                                                        title="Change Cover Image"
                                                    >
                                                        <Pencil className="w-3 h-3" />
                                                    </label>
                                                </div>

                                                {/* Background Image */}
                                                {coverImage ? (
                                                    <img src={coverImage} className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                                                ) : (
                                                    <div className={`absolute inset-0 bg-gradient-to-br transition-all duration-300 ${selectedBody === type.id ? 'from-gray-800 to-black' : 'from-gray-900 to-black'}`}>
                                                        {/* Fallback pattern if no image */}
                                                        <div className="absolute inset-0 opacity-10"
                                                            style={{ backgroundImage: 'radial-gradient(circle at center, white 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Selection Border Overlay */}
                                                {selectedBody === type.id && (
                                                    <div className="absolute inset-0 border-2 border-accent z-20 pointer-events-none rounded-2xl -[inset_0_0_30px_rgba(250,204,21,0.2)]"></div>
                                                )}

                                                {/* Cinematic Filter Overlay */}
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent z-10 flex flex-col justify-end px-6 pb-6">
                                                    <div>
                                                        <div className="flex items-center gap-2 mb-1">
                                                            {/* Small Icon next to title */}
                                                            <Icon className={`w-4 h-4 ${selectedBody === type.id ? 'text-accent' : 'text-white/70'}`} />
                                                            <span className="text-[9px] font-mono text-white/50 uppercase tracking-widest">{type.id} CLASS</span>
                                                        </div>
                                                        <h3 className={`text-2xl font-black italic tracking-tighter uppercase transition-colors leading-none ${selectedBody === type.id ? 'text-yellow-500' : 'text-white group-hover:text-yellow-500'}`}>
                                                            {type.name}
                                                        </h3>
                                                        <p className="text-xs text-gray-400 mt-2 line-clamp-2 leading-relaxed opacity-80 group-hover:opacity-100 transition-opacity">
                                                            {type.desc}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="mt-16 flex justify-between w-full max-w-6xl">
                                    <button onClick={() => setPhase(1)} className="text-muted hover:text-fg text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                                        &larr; Return to Scan
                                    </button>
                                    <button
                                        disabled={!selectedBody}
                                        onClick={() => setPhase(3)}
                                        className={`px-12 py-4 text-sm font-black uppercase tracking-widest rounded-lg transition-all ${selectedBody
                                            ? 'bg-accent text-blue-700 hover:scale-105 -[0_0_20px_rgba(250,204,21,0.4)]'
                                            : 'bg-surface-2 text-muted cursor-not-allowed'
                                            }`}
                                    >
                                        Initialize Style Synthesis &rarr;
                                    </button>
                                </div>
                            </motion.div>
                        )}

                        {/* PHASE 3: STYLE SELECTION */}
                        {phase === 3 && (
                            <motion.div
                                key="phase3"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                className="h-full flex flex-col items-center justify-center p-12"
                            >
                                <div className="text-center mb-12">
                                    <h2 className="text-4xl font-black text-fg uppercase tracking-tighter mb-4 flex justify-center items-center gap-4">
                                        <Aperture className="w-8 h-8 text-accent animate-spin-slow" />
                                        Style Synthesis Engine
                                    </h2>
                                    <p className="text-muted uppercase tracking-widest text-sm max-w-2xl mx-auto">
                                        Select rendering protocol for universe instantiation.
                                    </p>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-5xl">
                                    {Object.values(styleMatrix).map((style) => {
                                        const normalizedId = normalizeStyleId(style.id);
                                        const isSelected = selectedStyle === normalizedId;
                                        return (
                                            <div
                                                key={style.id}
                                                onClick={() => {
                                                    const normalizedId = normalizeStyleId(style.id);

                                                    const previousStyle = selectedStyle ? normalizeStyleId(selectedStyle) : "";
                                                    const nextStyle = normalizeStyleId(normalizedId);
                                                    const isChangingStyle = previousStyle !== nextStyle;

                                                    if (isChangingStyle) {
                                                        clearGeneratedResultForStyleChange();

                                                        if (import.meta.env.DEV) {
                                                            console.info("[NanoCast] Style changed; clearing stale generated result state", {
                                                                previousStyle,
                                                                nextStyle
                                                            });
                                                        }
                                                    }

                                                    setSelectedStyle(normalizedId);

                                                    // Immediately set default scope to prevent null-state flicker/jump
                                                    const rules = STYLE_SCOPE_RULES[normalizedId] || STYLE_SCOPE_RULES.default;
                                                    setBodyScope(rules.default);

                                                    // AUTO-SETTINGS for Exact Likeness
                                                    if (normalizedId === 'exact_studio') {
                                                        setDirectorControls(prev => ({
                                                            ...prev,
                                                            identityStrength: 100,
                                                            stylization: 0
                                                        }));
                                                        showToast("Exact Likeness: Auto-locked Identity to 100%");
                                                    }
                                                }}
                                                className={`group relative h-56 border rounded-xl transition-all duration-300 overflow-hidden flex flex-col justify-end cursor-pointer ${isSelected
                                                    ? 'bg-surface border-blue-500 -[0_0_20px_rgba(59,130,246,0.3)] scale-[1.02] z-10'
                                                    : 'bg-surface border-border hover:border-accent hover: hover:scale-[1.01]'
                                                    }`}
                                            >
                                                {/* Background Image */}
                                                <img
                                                    src={style.image}
                                                    className={`absolute inset-0 w-full h-full object-cover transition-transform duration-700 ${isSelected ? 'scale-110' : 'group-hover:scale-105'}`}
                                                />

                                                {/* Selection Border Overlay */}
                                                {isSelected && (
                                                    <div className="absolute inset-0 border-2 border-blue-500 z-20 pointer-events-none rounded-xl -[inset_0_0_30px_rgba(59,130,246,0.2)]"></div>
                                                )}

                                                {/* Cinematic Filter Overlay */}
                                                <div className={`absolute inset-0 z-10 flex flex-col justify-end px-6 pb-2.5 transition-all duration-300 ${isSelected
                                                    ? 'bg-gradient-to-t from-black/90 via-black/20 to-transparent'
                                                    : 'bg-gradient-to-t from-black/90 via-black/30 to-transparent group-hover:via-black/20'
                                                    }`}>
                                                    <div className="transform transition-transform duration-300 group-hover:-translate-y-1">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <Target className={`w-3 h-3 ${isSelected ? 'text-blue-400' : 'text-white/70'}`} />
                                                            <span className="text-[9px] font-mono text-white/50 uppercase tracking-widest">PROTOCOL</span>
                                                        </div>
                                                        <div className="flex justify-between items-end mb-1">
                                                            <h3 className={`text-lg font-black italic tracking-tighter uppercase transition-colors leading-none ${isSelected ? 'text-blue-400' : 'text-white group-hover:text-blue-400'}`}>
                                                                {style.label}
                                                            </h3>
                                                        </div>
                                                        <p className={`text-[10px] font-medium leading-tight line-clamp-2 mb-2 ${isSelected ? 'text-blue-100/80' : 'text-gray-300/80'}`}>
                                                            {style.keywords.split(',').slice(0, 4).join(', ')}...
                                                        </p>

                                                        {/* Tech Specs Micro-UI */}
                                                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <div className="px-1.5 py-0.5 bg-black/50 backdrop-blur-md rounded text-[7px] font-mono text-white/70 border border-white/10 uppercase tracking-wider">
                                                                8K RES
                                                            </div>
                                                            <div className="px-1.5 py-0.5 bg-black/50 backdrop-blur-md rounded text-[7px] font-mono text-white/70 border border-white/10 uppercase tracking-wider">
                                                                AUTO-LIGHT
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="mt-6 w-full max-w-5xl flex justify-center min-h-[140px]">
                                    <AnimatePresence mode="wait">
                                        {selectedStyle && (
                                            <motion.div
                                                key="body-scope"
                                                initial={{ opacity: 0, y: -8 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: -8 }}
                                                transition={{ duration: 0.2, ease: 'easeOut' }}
                                                className="flex flex-col items-center gap-6"
                                            >
                                                <BodyScopeSelector
                                                    value={bodyScope}
                                                    onChange={setBodyScope}
                                                    allowedScopes={STYLE_SCOPE_RULES[selectedStyle]?.allowed ?? STYLE_SCOPE_RULES.default.allowed}
                                                    defaultScope={STYLE_SCOPE_RULES[selectedStyle]?.default ?? STYLE_SCOPE_RULES.default.default}
                                                />
                                                <div className={`h-6 text-[9px] text-muted flex items-center gap-2 transition-all duration-300 ${bodyScope ? 'opacity-100' : 'opacity-0'}`}>
                                                    {bodyScope ? (
                                                        <>
                                                            <span className={`w-1.5 h-1.5 rounded-full ${SCOPE_COST[bodyScope].gpu === 'low' ? 'bg-emerald-500' : SCOPE_COST[bodyScope].gpu === 'medium' ? 'bg-yellow-500' : 'bg-red-500'}`}></span>
                                                            <span className="uppercase tracking-widest">{SCOPE_COST[bodyScope].gpu} COMPUTE: {SCOPE_COST[bodyScope].note}</span>
                                                        </>
                                                    ) : (
                                                        <span className="uppercase tracking-widest text-transparent">Computing...</span>
                                                    )}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                                <div className="mt-16 flex justify-between w-full max-w-5xl">
                                    <button onClick={() => setPhase(2)} className="text-muted hover:text-fg text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                                        &larr; Return to Body
                                    </button>
                                    <div className="flex flex-col items-end gap-2">
                                        <button
                                            disabled={!selectedStyle || !bodyScope}
                                            onClick={() => void handleOrchestration("CREATE_NEW_CHARACTER")}
                                            className={`px-12 py-4 text-sm font-black uppercase tracking-widest rounded-lg transition-all ${selectedStyle && bodyScope
                                                ? 'bg-gradient-to-r from-accent to-blue-600 text-white hover: -accent/20'
                                                : 'bg-surface-2 text-muted cursor-not-allowed'
                                                }`}
                                        >
                                            Initialize Neural Link &rarr;
                                        </button>
                                        {selectedStyle && !bodyScope && (
                                            <div className="text-[9px] text-danger uppercase tracking-widest font-bold animate-pulse">
                                                Select Body Scope to Continue
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {/* PHASE 4: NANO NEURAL LINK (Processing) */}
                        {(phase === 4 || isProcessing) && (
                            <motion.div
                                key="phase4"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="h-full flex flex-col items-center justify-center p-8 relative"
                            >
                                <div className="w-full max-w-2xl bg-surface border border-border p-1 rounded-xl relative overflow-hidden ">
                                    <div className="h-1 bg-surface-2 w-full mb-1 relative overflow-hidden">
                                        <motion.div
                                            className="h-full bg-blue-500 relative"
                                            initial={{ width: "0%" }}
                                            animate={{ width: `${progress.percent}%` }}
                                            transition={{ duration: 0.5, ease: "easeInOut" }}
                                        >
                                            <div className="absolute inset-0 bg-yellow-400/30 w-full animate-[shimmer_2s_infinite]" style={{ backgroundImage: 'linear-gradient(90deg, transparent, rgba(250, 204, 21, 0.5), transparent)' }}></div>
                                        </motion.div>
                                        {/* Indeterminate loader backing when stalled */}
                                        <div className="absolute inset-0 w-full h-full bg-accent/20 animate-pulse z-0 mix-blend-overlay"></div>
                                    </div>
                                    <div className="flex justify-between items-center px-2 pt-1 pb-2">
                                        <span className="text-[10px] uppercase font-bold text-muted/70 flex items-center gap-1">
                                            <Cpu className="w-3 h-3" /> Core: {state.imageResolution} Matrix
                                        </span>
                                        <span className="text-xs font-black text-accent">{Math.round(progress.percent)}%</span>
                                    </div>
                                    <div className="h-96 bg-bg p-6 font-mono text-xs overflow-hidden flex flex-col-reverse rounded-b-lg border-t border-border">
                                        {generationLogs.map((log, i) => (
                                            <div key={i} className="mb-1 text-muted border-l-2 border-border pl-2">
                                                <span className="text-accent mr-2">{'>'}</span>{log}
                                            </div>
                                        ))}
                                    </div>

                                </div>
                                <div className="mt-6 w-full max-w-2xl px-4 flex flex-col items-center gap-6">
                                    <div className="text-accent animate-pulse font-black tracking-widest text-sm uppercase flex items-center gap-2 justify-center">
                                        <Cpu className="w-4 h-4 animate-spin" />
                                        {progress.detail || "Nano Neural Engine Active..."}
                                    </div>

                                    {/* Resolution Time Warning */}
                                    <div className="w-full flex justify-center">
                                        {state.imageResolution === '4K' && (
                                            <div className="flex flex-col items-center text-center p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 max-w-sm">
                                                <span className="text-[10px] font-bold text-yellow-500 uppercase flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Notice: 4K Ultra HD Selected</span>
                                                <span className="text-[10px] text-gray-400 mt-1">
                                                    {state.billingEntitlements.effectiveBillingMode === 'hosted'
                                                        ? 'Hosted 4K can take several minutes with biometric references and quality checks. Please do not close this window.'
                                                        : 'Generation can take up to 90 seconds. Please do not close this window.'}
                                                </span>
                                            </div>
                                        )}
                                        {state.imageResolution === '2K' && (
                                            <div className="flex flex-col items-center text-center p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 max-w-sm">
                                                <span className="text-[10px] font-bold text-blue-400 uppercase">Notice: 2K High Quality Selected</span>
                                                <span className="text-[10px] text-gray-400 mt-1">Generation takes approximately 45 seconds.</span>
                                            </div>
                                        )}
                                        {state.imageResolution === '1K' && (
                                            <div className="flex flex-col items-center text-center p-3 rounded-lg bg-green-500/10 border border-green-500/20 max-w-sm">
                                                <span className="text-[10px] font-bold text-green-400 uppercase">Notice: 1K Active</span>
                                                <span className="text-[10px] text-gray-400 mt-1">Fastest generation speed. ETA ~15 seconds.</span>
                                            </div>
                                        )}
                                    </div>

                                    <button
                                        onClick={cancelGeneration}
                                        className="px-6 py-2 rounded-full border border-danger/30 text-danger hover:bg-danger/10 text-xs font-bold uppercase tracking-widest transition-colors flex items-center gap-2 mt-2"
                                    >
                                        <Ban className="w-4 h-4" /> Abort Sequence
                                    </button>
                                </div>
                            </motion.div>
                        )}

                        {/* PHASE 5: DIGITAL RECONSTRUCTION (RESULT) */}
                        {phase === 5 && finalCharacterUrl && (
                            <motion.div
                                key="phase5"
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="relative h-full flex gap-8 items-center justify-center p-12"
                            >
                                <div className="h-full aspect-[2/3] relative rounded-xl overflow-hidden border-2 border-accent group">
                                    <img src={finalCharacterUrl} className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-80"></div>

                                    {/* ID CARD */}
                                    <div className="absolute bottom-6 left-6 right-6 font-mono text-xs">
                                        <div className="flex justify-between items-end border-b border-white/20 pb-2 mb-2">
                                            <div>
                                                <div className="text-accent uppercase tracking-widest text-[9px]">Subject ID</div>
                                                <div className="text-xl font-black text-white">{state.lastCastedPrompt ? state.lastCastedPrompt.substring(0, 8).toUpperCase() : 'UNK-001'}</div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-accent uppercase tracking-widest text-[9px]">Class</div>
                                                <div className="text-white font-bold">{selectedBody?.toUpperCase()}</div>
                                            </div>
                                        </div>
                                        <div className="flex justify-between text-[9px] uppercase tracking-widest text-white/50">
                                            <span>Sim-Date: {new Date().toLocaleDateString()}</span>
                                            <span>Cast Director Studio</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="w-96 flex flex-col gap-4 h-full overflow-y-scroll px-4 pb-24">
                                    <h3 className="text-2xl font-black text-fg uppercase italic tracking-tighter">
                                        Reconstruction <span className="text-accent">Complete</span>
                                    </h3>
                                    <p className="text-xs text-muted mb-8 leading-relaxed">
                                        Character reconstruction generated. Review likeness, style, and body before approving this image for pitch sheets, reference sheets, wardrobe, or library export.
                                    </p>

                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            onClick={() => addToCast(false)}
                                            className="col-span-1 py-4 bg-surface-2 hover:bg-surface text-accent font-black uppercase tracking-widest text-xs rounded-xl transition-all -accent/10 border border-accent flex flex-col items-center gap-1 group-hover:scale-[1.02]"
                                        >
                                            <UserPlus className="w-5 h-5" />
                                            {generatePackMode ? "Add Pack" : "Add Actor"}
                                        </button>

                                        <button
                                            onClick={() => handleOpenSaveModal('actor')}
                                            title="Exports this selected image to your chosen Library folder."
                                            className="col-span-1 py-4 bg-surface-2 hover:bg-surface text-purple-400 font-black uppercase tracking-widest text-xs rounded-xl transition-all border border-purple-500/30 hover:border-purple-500 flex flex-col items-center gap-1"
                                        >
                                            <FolderPlus className="w-5 h-5" />
                                            Export to Library
                                        </button>

                                        <button
                                            // Call distinct handler to ensure state preservation
                                            onClick={handleRegenerate}
                                            className="col-span-1 py-4 bg-surface-2 hover:bg-surface text-fg font-bold uppercase tracking-widest text-xs rounded-xl transition-all border border-border hover:border-accent flex flex-col items-center gap-1"
                                        >
                                            <RotateCcw className="w-5 h-5 text-accent-2" />
                                            Regenerate
                                        </button>

                                        <button
                                            onClick={downloadPoster}
                                            className="col-span-1 py-3 bg-bg border border-border text-muted hover:text-fg hover:border-accent text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2"
                                        >
                                            <Share2 className="w-3 h-3" /> Save Poster
                                        </button>
                                        <button
                                            onClick={() => {
                                                setShowSettings(true);
                                                setSidebarMode('wardrobe');
                                            }}
                                            className="col-span-1 py-3 bg-bg border border-border text-muted hover:text-accent hover:border-accent/30 text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2"
                                        >
                                            <Layers className="w-3 h-3" /> Wardrobe V2
                                        </button>

                                        {/* Pitch Sheet Approval Button */}
                                        <button
                                            onClick={approveGeneratedCharacterForPitchSheet}
                                            className={`col-span-2 py-4 font-black uppercase tracking-widest text-xs rounded-xl transition-all flex items-center justify-center gap-2 border ${
                                                state.nanoCastSession.approvedPitchSheetSourceUrl === finalCharacterUrl
                                                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.2)]'
                                                    : 'bg-accent/10 hover:bg-accent/20 text-accent border-accent/30 hover:border-accent/60'
                                            }`}
                                        >
                                            <Sparkles className="w-4 h-4" />
                                            {state.nanoCastSession.approvedPitchSheetSourceUrl === finalCharacterUrl
                                                ? 'Approved as Pitch Sheet Image A'
                                                : 'Approve Image A for Pitch Sheet'}
                                        </button>

                                        {/* Reference Sheet Section */}
                                        <div className="col-span-2 pt-2 border-t border-border mt-2 space-y-3">
                                            <div className="flex gap-2">
                                                {REF_LAYOUT_OPTIONS.map((l) => (
                                                    <button
                                                        key={l.id}
                                                        onClick={() => setRefLayout(l.id)}
                                                        className={`flex-1 py-2 rounded text-[9px] font-bold uppercase transition-all border ${refLayout === l.id
                                                            ? 'bg-accent/20 border-accent text-accent -[0_0_10px_rgba(250,204,21,0.2)]'
                                                            : 'bg-surface-2 border-border text-muted hover:border-white/50'
                                                            }`}
                                                    >
                                                        {l.label}
                                                    </button>
                                                ))}
                                            </div>

                                            {/* Style Preset */}
                                            <div className="space-y-1">
                                                <label className="text-[9px] font-bold text-muted uppercase tracking-widest pl-1">Style Preset</label>
                                                <div className="relative">
                                                    <select
                                                        value={refStyle}
                                                        onChange={(e) => {
                                                            const nextStyle = e.target.value;
                                                            if (isRefSheetStyleId(nextStyle)) {
                                                                setRefStyle(nextStyle);
                                                                const mappedSelected = mapRefStyleToSelectedStyle(nextStyle);
                                                                setSelectedStyle(mappedSelected);
                                                                setCurrentResultStyleId(mappedSelected);
                                                            }
                                                        }}
                                                        className="w-full appearance-none bg-bg border border-border rounded-xl px-3 py-2 text-[10px] font-bold uppercase text-white outline-none focus:border-accent transition-colors cursor-pointer"
                                                    >
                                                        {Object.values(REF_SHEET_STYLES).map((s) => (
                                                            <option key={s.id} value={s.id}>{s.label}</option>
                                                        ))}
                                                    </select>
                                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-muted pointer-events-none" />
                                                </div>
                                            </div>

                                            {/* Advanced (Identity + Scope + Body Sliders) */}
                                            <details className="group rounded-xl border border-border bg-surface-2/40 p-3">
                                                <summary className="list-none flex items-center justify-between cursor-pointer text-[9px] font-bold text-muted uppercase tracking-widest">
                                                    <span>Advanced</span>
                                                    <ChevronDown className="w-3 h-3 transition-transform group-open:rotate-180" />
                                                </summary>
                                                <div className="pt-3 space-y-4">
                                                    {/* Identity Source */}
                                                    <div className="space-y-1">
                                                        <label className="text-[8px] text-muted/70 uppercase tracking-widest font-bold">Identity Source</label>
                                                        <div className="flex bg-bg rounded-lg p-1 border border-border">
                                                            <button
                                                                onClick={() => setIdentitySource('hybrid')}
                                                                className={`flex-1 py-1 px-0.5 rounded text-[7px] font-bold uppercase tracking-tighter truncate transition-all ${identitySource === 'hybrid'
                                                                    ? 'bg-accent/15 text-accent border border-accent/30'
                                                                    : 'text-muted hover:text-white'
                                                                    }`}
                                                            >
                                                                Hybrid
                                                            </button>
                                                            <button
                                                                onClick={() => setIdentitySource('biometric')}
                                                                className={`flex-1 py-1 px-0.5 rounded text-[7px] font-bold uppercase tracking-tighter truncate transition-all ${identitySource === 'biometric'
                                                                    ? 'bg-accent/15 text-accent border border-accent/30'
                                                                    : 'text-muted hover:text-white'
                                                                    }`}
                                                            >
                                                                Biometric
                                                            </button>
                                                            <button
                                                                onClick={() => setIdentitySource('generated')}
                                                                className={`flex-1 py-1 px-0.5 rounded text-[7px] font-bold uppercase tracking-tighter truncate transition-all ${identitySource === 'generated'
                                                                    ? 'bg-accent/15 text-accent border border-accent/30'
                                                                    : 'text-muted hover:text-white'
                                                                    }`}
                                                            >
                                                                Portrait
                                                            </button>
                                                        </div>
                                                        <div className="text-[9px] text-muted/70 normal-case">
                                                            Hybrid blends your scan with the portrait style. Biometric forces strict raw likeness. Portrait uses only text prompting.
                                                        </div>
                                                    </div>



                                                    {/* Weight */}
                                                    <div className="space-y-2">
                                                        <div className="flex items-center justify-between">
                                                            <label className="text-[8px] text-muted/70 uppercase tracking-widest font-bold">Weight</label>
                                                            <div className="flex items-center gap-2">
                                                                {identitySource === 'biometric' && weightLbs === 275 && (
                                                                    <span className="text-[8px] text-yellow-500 font-bold uppercase tracking-wider">(MAX SAFE LIMIT)</span>
                                                                )}
                                                                <span className="text-[10px] font-bold text-white">{localWeight} lb</span>
                                                            </div>
                                                        </div>
                                                        <input
                                                            type="range"
                                                            min={90}
                                                            max={identitySource === 'biometric' ? 275 : 300}
                                                            step={5}
                                                            value={localWeight > (identitySource === 'biometric' ? 275 : 300) ? (identitySource === 'biometric' ? 275 : 300) : localWeight}
                                                            onChange={(e) => setLocalWeight(parseInt(e.target.value, 10))}
                                                            onPointerUp={() => setWeightLbs(localWeight)}
                                                            className="w-full accent-accent h-2 rounded-full appearance-none cursor-pointer bg-bg"
                                                        />
                                                    </div>

                                                    {/* Height */}
                                                    <div className="space-y-2">
                                                        <div className="flex items-center justify-between">
                                                            <label className="text-[8px] text-muted/70 uppercase tracking-widest font-bold">Height</label>
                                                            <span className="text-[10px] font-bold text-white">{formatHeight(heightIn)}</span>
                                                        </div>
                                                        <input
                                                            type="range"
                                                            min={36}
                                                            max={108}
                                                            value={heightIn}
                                                            onChange={(e) => setHeightIn(parseInt(e.target.value, 10))}
                                                            className="w-full accent-accent-2 h-2 rounded-full appearance-none cursor-pointer bg-bg"
                                                        />
                                                    </div>
                                                </div>
                                            </details>

                                            <div className="relative group w-full">
                                                <button
                                                    onClick={handleGenerateRefSheet}
                                                    disabled={isProcessing || (identitySource === 'biometric' && (!capturedAngles.center || !capturedAngles.left || !capturedAngles.right)) || (identitySource === 'generated' && !finalCharacterUrl)}
                                                    className={`w-full py-3 bg-bg border border-border text-muted hover:text-accent hover:border-accent text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2 ${(identitySource === 'biometric' && (!capturedAngles.center || !capturedAngles.left || !capturedAngles.right)) || (identitySource === 'generated' && !finalCharacterUrl)
                                                        ? 'opacity-60 cursor-not-allowed'
                                                        : ''
                                                        }`}
                                                >
                                                    <LayoutTemplate className="w-3 h-3" />
                                                    Generate Reference Sheet
                                                </button>
                                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-gray-900 border border-gray-700 rounded-lg text-[10px] text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 normal-case text-left">
                                                    <strong className="text-white block mb-1">Production Note:</strong>
                                                    High-Fidelity AI Synthesis: Identity & layout are strictly enforced, but minor variations may occur. Always review for production use.
                                                </div>
                                            </div>

                                            {capturedAngles.center && capturedAngles.left && capturedAngles.right && (
                                                <div className="grid grid-cols-1 gap-2">
                                                    <button
                                                        onClick={() => void sendBiometricScanToPitchSheet("scan_only")}
                                                        disabled={isProcessing}
                                                        className="w-full py-3 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500 border border-yellow-500/30 text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                                        title={CHARACTER_PITCH_SHEET_PREVIEW_HELP}
                                                    >
                                                        <LayoutTemplate className="w-3 h-3" />
                                                        Build Pitch Sheet From Scan
                                                        <CharacterPitchSheetPreviewPill />
                                                    </button>
                                                    {finalCharacterUrl && (
                                                        <button
                                                            onClick={() => void sendBiometricScanToPitchSheet("scan_plus_character")}
                                                            disabled={isProcessing}
                                                            className="w-full py-3 bg-accent/10 hover:bg-accent/20 text-accent border border-accent/30 text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                                            title={CHARACTER_PITCH_SHEET_PREVIEW_HELP}
                                                        >
                                                            <Sparkles className="w-3 h-3" />
                                                            Build Pitch Sheet From Scan + Character
                                                            <CharacterPitchSheetPreviewPill />
                                                        </button>
                                                    )}
                                                </div>
                                            )}

                                            {identitySource === 'biometric' && (!capturedAngles.center || !capturedAngles.left || !capturedAngles.right) && (
                                                <div className="text-center text-[9px] text-danger font-bold uppercase tracking-widest bg-danger/10 py-1 rounded">
                                                    Requires Center + Left + Right Scans
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="mt-8 border-t border-border pt-4">
                                        <button
                                            onClick={resetScan}
                                            className="w-full py-3 text-muted hover:text-danger text-xs font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
                                        >
                                            <RefreshCw className="w-3 h-3" />
                                            Initialize New Subject
                                        </button>
                                    </div>
                                </div>

                                <div className="flex w-72 2xl:w-80 h-full shrink-0 flex-col border-l-2 border-accent/60 pl-6">
                                    <div className="mb-3 shrink-0 border-b border-border pb-3">
                                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-accent">
                                            <RefreshCw className="w-3.5 h-3.5" />
                                            Recent Generations
                                        </div>
                                    </div>
                                    <NanoRecentGenerationsGallery
                                        onSelectGeneration={handleSelectRecentNanoGeneration}
                                        onExportGeneration={handleExportRecentNanoGeneration}
                                    />
                                </div>
                            </motion.div>
                        )}

                        {/* REFERENCE SHEET MODAL */}
                        {showRefSheet && refSheetUrl && (
                            <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
                                <div className="relative w-full max-w-7xl h-full max-h-[90vh] flex flex-col bg-[#0a0a0c] rounded-xl border border-white/10 overflow-hidden shadow-2xl">
                                    <div className="flex justify-between items-center w-full px-4 py-3 border-b border-white/10 bg-[#121216] flex-shrink-0">
                                        <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                                            <LayoutTemplate className="w-4 h-4 text-accent" /> Character Reference Sheet
                                        </h3>
                                    </div>

                                    <div className="flex-1 w-full min-h-0 overflow-auto flex items-center justify-center bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-repeat bg-[length:50px] p-2 custom-scrollbar">
                                        <img src={refSheetUrl} className="max-w-full h-auto object-contain rounded shadow-lg" />
                                    </div>

                                    <div className="w-full p-3 border-t border-white/10 bg-[#18181b] flex-shrink-0 sticky bottom-0 flex justify-end gap-3 z-10">
                                        <button
                                            onClick={() => {
                                                const newMember: CastMember = {
                                                    id: `nano_ref_${Date.now()}`,
                                                    url: refSheetUrl,
                                                    previewUrl: refSheetUrl,
                                                    sourceUrl: refSheetUrl,
                                                    name: `Ref_Sheet_${new Date().toLocaleTimeString()}`,
                                                    tag: 'front' as const,
                                                    identityLock: state.nanoCastSession.identityLock || undefined,
                                                    profile: {
                                                        identity: "Reference Sheet",
                                                        wardrobe: "N/A",
                                                        accessories: "N/A",
                                                        style: "Technical"
                                                    }
                                                };
                                                dispatch({ type: 'ADD_CAST', payload: newMember });
                                                showToast("Added to Cast Assets");
                                            }}
                                            className="bg-surface hover:bg-surface-2 text-white px-6 py-2 rounded-lg font-bold uppercase tracking-widest text-xs transition-all border border-white/10 flex items-center gap-2"
                                        >
                                            <UserPlus className="w-4 h-4" /> Cast
                                        </button>
                                        <button
                                            onClick={() => {
                                                const a = document.createElement('a');
                                                a.href = refSheetUrl;
                                                a.download = createUniqueDownloadFilename('RefSheet.png');
                                                a.click();
                                                showToast("Download Started");
                                            }}
                                            className="bg-surface hover:bg-surface-2 text-white px-6 py-2 rounded-lg font-bold uppercase tracking-widest text-xs transition-all border border-white/10 flex items-center gap-2"
                                        >
                                            <Download className="w-4 h-4" /> Download
                                        </button>
                                        <button
                                            onClick={() => handleOpenSaveModal('ref_sheet')}
                                            title="Exports this selected image to your chosen Library folder."
                                            className="bg-accent hover:bg-white text-green-900 px-6 py-2 rounded-lg font-bold uppercase tracking-widest text-xs transition-all flex items-center gap-2"
                                        >
                                            <Share2 className="w-4 h-4" /> Export to Library
                                        </button>
                                        <button
                                            onClick={() => { setShowRefSheet(false); setRefSheetUrl(null); }}
                                            className="bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white px-6 py-2 rounded-lg font-bold uppercase tracking-widest text-xs transition-all border border-red-500/20 flex items-center gap-2"
                                        >
                                            <X className="w-4 h-4" /> Close
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* LOCAL BIOMETRIC SHEET MODAL */}
                        {localBiometricSheetUrl && (
                            <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
                                <div className="relative w-full max-w-7xl h-full max-h-[90vh] flex flex-col bg-[#0a0a0c] rounded-xl border border-indigo-500/30 overflow-hidden shadow-[0_0_50px_rgba(79,70,229,0.15)]">
                                    <div className="flex justify-between items-center w-full px-4 py-3 border-b border-indigo-500/20 bg-[#121216] flex-shrink-0">
                                        <h3 className="text-sm font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                                            <Cpu className="w-4 h-4" /> FAST BIOMETRIC BOARD
                                        </h3>
                                    </div>
                                    
                                    <div className="flex-1 w-full min-h-0 overflow-auto flex items-center justify-center p-2 custom-scrollbar bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-repeat bg-[length:50px]">
                                        <img src={localBiometricSheetUrl} className="max-w-full h-auto object-contain rounded drop-shadow-[0_0_20px_rgba(79,70,229,0.2)]" />
                                    </div>

                                    <div className="w-full p-3 border-t border-indigo-500/20 bg-[#121216] flex-shrink-0 sticky bottom-0 flex justify-end gap-3 z-10">
                                        <button
                                            onClick={() => {
                                                const a = document.createElement('a');
                                                a.href = localBiometricSheetUrl;
                                                a.download = createUniqueDownloadFilename('FastBiometric.png');
                                                a.click();
                                                showToast("Download Started");
                                            }}
                                            className="bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 px-6 py-2 rounded-lg font-bold uppercase tracking-widest text-xs transition-all border border-indigo-500/30 flex items-center gap-2"
                                        >
                                            <Download className="w-4 h-4" /> Save to Drive
                                        </button>
                                        <button
                                            onClick={() => setLocalBiometricSheetUrl(null)}
                                            className="bg-red-500/10 hover:bg-red-500/20 text-red-400 px-6 py-2 rounded-lg font-bold uppercase tracking-widest text-xs transition-all border border-red-500/20 flex items-center gap-2"
                                        >
                                            <X className="w-4 h-4" /> Close
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                    </AnimatePresence>

                    {/* SAVE TO LIBRARY MODAL (Refactored) */}
                    <ActorSaveModal
                        isOpen={showSaveModal}
                        initialName={newActorName}
                        onClose={() => {
                            setShowSaveModal(false);
                            setSaveSourceUrl(null);
                            setSaveRecentGenerationId(null);
                        }}
                        onSave={(name, category) => {
                            setNewActorName(name);
                            setSaveCategory(category);
                            confirmSaveToLibrary(name, category);
                        }}
                        backgrounds={{
                            realism: saveMode === 'ref_sheet' ? (refSheetUrl || undefined) : (finalCharacterUrl || undefined),
                            animation: saveMode === 'ref_sheet' ? (refSheetUrl || undefined) : (finalCharacterUrl || undefined),
                            illustration: saveMode === 'ref_sheet' ? (refSheetUrl || undefined) : (finalCharacterUrl || undefined),
                            scifi: saveMode === 'ref_sheet' ? (refSheetUrl || undefined) : (finalCharacterUrl || undefined)
                        }}
                    />

                    <ConfirmDialog
                        isOpen={!!confirmDelete}
                        onClose={() => setConfirmDelete(null)}
                        onConfirm={executeDelete}
                        title="Delete Costume?"
                        message={confirmDelete ? `Are you sure you want to delete ${confirmDelete.name}? This action cannot be undone.` : ""}
                        confirmText="Delete"
                        cancelText="Cancel"
                        variant="danger"
                    />

                    <ConfirmDialog
                        isOpen={!!showCoverDeleteConfirm}
                        onClose={() => setShowCoverDeleteConfirm(null)}
                        onConfirm={confirmCoverDelete}
                        title="Remove Custom Cover?"
                        message="This will delete the uploaded image and revert this archetype to its original default look. This action cannot be undone."
                        confirmText="Remove Cover"
                        cancelText="Keep Custom"
                        variant="danger"
                    />

                    {/* TOAST OVERLAY */}
                    <AnimatePresence>
                        {notification && (
                            <motion.div
                                initial={{ opacity: 0, y: 50 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 20 }}
                                className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-surface border border-accent/50 text-fg px-6 py-3 rounded-full backdrop-blur-xl z-[5000] flex items-center gap-3"
                            >
                                <CheckCircle2 className="w-5 h-5 text-accent" />
                                <span className="text-xs font-bold uppercase tracking-widest">{notification}</span>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </main>
            </div>
        </div>
    );
};

export default NanoCastingDirector;



