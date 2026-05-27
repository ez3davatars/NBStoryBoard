
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Upload, RefreshCcw, Maximize, Shirt, Sparkles, Download,
    UserPlus, X, Trash2, CheckCircle2, FolderPlus, Zap, HelpCircle,
    ChevronDown, History
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { GeminiService } from '../services/GeminiService';
import { ensureAuthenticatedForGeneration } from '../services/AuthGenerationGate';
import type { WardrobeItem, CastMember, WardrobeState } from '../context/AppContext';
import { nativeJoinPath, nativeListFiles, nativeWriteFile } from '../utils/NativeFileAssets';
// Style Imports for Save Modal
import styleRealism from '../assets/cover-realism.png';
import styleAnimation from '../assets/cover-anim.png';
import styleIllustration from '../assets/cover-illustration.png';
import styleScifi from '../assets/cover-scifi.png';
import wardrobeLibraryPlaceholder from '../assets/Wardrobe.jpg';
import ActorSaveModal from './ActorSaveModal';
import HelpTooltip from './ui/HelpTooltip';
import InlineHint from './ui/InlineHint';
import ConfirmDialog from './ui/ConfirmDialog';
import { LibraryAssetMaterializer } from '../services/LibraryAssetMaterializer';
import { useRecentGenerationsStore } from '../stores/useRecentGenerationsStore';
import { RecentGenerationsCacheService } from '../services/RecentGenerationsCacheService';
import RecentGenerationsStrip from './recent/RecentGenerationsStrip';
import { createUniqueDownloadFilename, createUniqueNumericLabel } from '../utils/downloadFilenames';
import {
    buildTryOnIdentityAnchorReferenceLabel,
    buildTryOnLrFullBodyAxisLockBlock,
    buildWardrobeTryOnSourceLockBlock,
    type TryOnIdentityAnchorSource
} from '../utils/wardrobeTryOnSourceLocks';
import {
    buildPoseCoherenceNegativeTokens,
    buildTurnaroundPoseCoherenceContract,
    buildTurnaroundViewDefinitionContract,
    getTurnaroundPanelOrientations
} from '../../prompts/poseCoherence';
import { buildStyleCategoryContract, buildStyleNegativePrompt } from '../../prompts/styleContracts';

type PermissionAwareDirectoryHandle = FileSystemDirectoryHandle & {
    queryPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
    values?: () => AsyncIterableIterator<FileSystemHandle>;
};

type PendingGenerationError = Error & { generationId?: string };

const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    return String(error);
};

const isPendingGenerationError = (error: unknown): error is PendingGenerationError => {
    if (!(error instanceof Error)) return false;
    return error.name === 'TimeoutError' || error.message.includes('Pending');
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

type ResolvedLookSpec = {
    sourceSummary: string;
    primaryGarments: string[];
    accessories: string[];
    handheldItems: string[];
    jewelry: string[];
    broochPin: string[];
    bagClutch: string[];
    footwear: string[];
    colorFormalityEra: string[];
    explicitBarefoot: boolean;
    structuredCompleteLook: boolean;
    visibilityOcclusionGuidance: string;
};

type BodyFitProfile = {
    presentation: "male" | "female" | "androgynous" | "unspecified";
    frameSize: "small" | "medium" | "broad";
    shoulderWidth: "narrow" | "average" | "broad";
    shoulderSlope: "flat" | "natural" | "sloped";
    chestVolume: "flat" | "average" | "full";
    waistShape: "straight" | "defined" | "tapered" | "fuller";
    hipShape: "narrow" | "average" | "full";
    armThickness: "slim" | "average" | "full";
    posture: "upright" | "neutral" | "relaxed";
    legShape?: "slim" | "average" | "full";
};

type BodyNoteInterpretation = {
    hasBodyDirectives: boolean;
    hasUpperTorsoDirectives: boolean;
    directives: string[];
};

type TryOnGarmentFit = WardrobeState['tryOnGarmentFit'];
type TryOnFabricBehavior = WardrobeState['tryOnFabricBehavior'];
type TryOnOutputFraming = WardrobeState['tryOnOutputFraming'];

const LAUNCH_OUTPUT_FRAMING: TryOnOutputFraming = 'full_body';

const GARMENT_FIT_OPTIONS: Array<{ value: TryOnGarmentFit; label: string }> = [
    { value: 'slim', label: 'Slim Fit' },
    { value: 'tailored', label: 'Tailored Fit' },
    { value: 'standard', label: 'Standard Fit' },
    { value: 'relaxed', label: 'Relaxed Fit' },
    { value: 'oversized', label: 'Oversized' }
];

const FABRIC_BEHAVIOR_OPTIONS: Array<{ value: TryOnFabricBehavior; label: string }> = [
    { value: 'structured_crisp', label: 'Structured / Crisp' },
    { value: 'balanced', label: 'Balanced' },
    { value: 'soft_draped', label: 'Soft / Draped' }
];

const normalizeLookText = (value: string): string =>
    value.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();

const collectTerms = (text: string, terms: string[]) =>
    terms.filter(term => new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?\\b`, 'i').test(text));

const hasAnyLookTerm = (text: string, terms: string[]) =>
    terms.some(term => new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text));

const formatResolvedTerms = (terms: string[], fallback: string): string =>
    terms.length > 0 ? Array.from(new Set(terms)).join(', ') : fallback;

const inferFittingNoteBodyGuidance = (fittingNotes: string): BodyNoteInterpretation => {
    const text = normalizeLookText(fittingNotes);
    const directives: string[] = [];

    const muscularBuild = hasAnyLookTerm(text, [
        'muscular build', 'muscular', 'athletic build', 'athletic', 'powerful build',
        'strong build', 'built', 'physically strong'
    ]);
    const wideChest = hasAnyLookTerm(text, [
        'wide chest', 'broad chest', 'barrel chested', 'large chest', 'full chest',
        'wide upper chest', 'broad upper chest', 'wide ribcage', 'broad ribcage'
    ]);
    const broadShoulders = hasAnyLookTerm(text, [
        'broad shoulders', 'wide shoulders', 'strong shoulders', 'large shoulders',
        'shoulder width', 'wide shoulder line'
    ]);
    const slimBuild = hasAnyLookTerm(text, ['slim build', 'slender build', 'thin build', 'lean build', 'narrow frame']);
    const curvyBuild = hasAnyLookTerm(text, ['curvy', 'hourglass', 'defined waist', 'wide hips', 'full hips', 'full bust']);
    const fullerBuild = hasAnyLookTerm(text, ['fuller build', 'plus size', 'heavyset', 'stocky', 'soft body']);

    if (muscularBuild) {
        directives.push('Muscular build: stronger upper torso, more shoulder mass, fuller chest, more athletic arm/torso structure, and visible shirt support from the chest and ribcage.');
    }
    if (wideChest) {
        directives.push('Wide chest: visibly broader pectoral/chest span, wider upper ribcage, stronger front silhouette, and garment drape shaped by chest volume rather than a flat torso.');
    }
    if (broadShoulders) {
        directives.push('Broad shoulders: increased shoulder span, stronger shoulder line, shoulder seams placed near the wider shoulder break, and sleeves hanging from a broader upper frame.');
    }
    if (slimBuild) {
        directives.push('Slim build: reduced torso mass, narrower frame, less chest volume, and garment ease scaled to a lean body.');
    }
    if (curvyBuild) {
        directives.push('Curvy build: stronger waist/hip contour, bust or chest shaping where relevant, and garment drape following the waist and hip transition.');
    }
    if (fullerBuild) {
        directives.push('Fuller build: more body volume through torso/arms/hips where relevant, garment ease that respects the body underneath, and no flattening into a narrow mannequin.');
    }

    return {
        hasBodyDirectives: directives.length > 0,
        hasUpperTorsoDirectives: muscularBuild || wideChest || broadShoulders,
        directives
    };
};

const inferBodyFitProfile = (
    subject: CastMember,
    fittingNotes: string,
    hasCharacterSheet: boolean
): BodyFitProfile => {
    const profile = subject.profile;
    const text = normalizeLookText([
        subject.name,
        profile?.identity,
        profile?.wardrobe,
        profile?.accessories,
        profile?.style,
        fittingNotes,
        hasCharacterSheet ? 'character sheet body anchor' : ''
    ].filter(Boolean).join(' '));

    const feminine = hasAnyLookTerm(text, ['female', 'woman', 'women', 'feminine', 'girl', 'lady', 'mother', 'queen', 'princess', 'heroine', 'wife']);
    const masculine = hasAnyLookTerm(text, ['male', 'man', 'men', 'masculine', 'boy', 'gentleman', 'father', 'king', 'prince', 'hero', 'husband']);
    const androgynous = hasAnyLookTerm(text, ['androgynous', 'nonbinary', 'non binary', 'gender neutral']);

    const presentation: BodyFitProfile['presentation'] = androgynous
        ? 'androgynous'
        : feminine && !masculine
            ? 'female'
            : masculine && !feminine
                ? 'male'
                : 'unspecified';

    const upperTorsoGuidance = inferFittingNoteBodyGuidance(fittingNotes);
    const wideChest = hasAnyLookTerm(text, ['wide chest', 'broad chest', 'barrel chested', 'wide ribcage', 'broad ribcage', 'wide upper chest']);
    const broadShoulders = hasAnyLookTerm(text, ['broad shoulders', 'wide shoulders', 'strong shoulders', 'wide shoulder line']);
    const muscular = hasAnyLookTerm(text, ['muscular', 'muscular build', 'athletic build', 'powerful build', 'strong build']);
    const broadFrame = hasAnyLookTerm(text, ['broad', 'large', 'strong', 'powerful', 'muscular', 'stocky', 'heavy', 'barrel chested', 'wide frame']) ||
        upperTorsoGuidance.hasUpperTorsoDirectives;
    const smallFrame = hasAnyLookTerm(text, ['small', 'petite', 'slim', 'thin', 'narrow', 'delicate', 'youth', 'lean']);
    const curvy = hasAnyLookTerm(text, ['curvy', 'hourglass', 'full bust', 'wide hips', 'full hips', 'busty']);
    const athletic = hasAnyLookTerm(text, ['athletic', 'v shaped', 'v shape', 'tapered', 'broad shouldered']) || muscular;
    const fuller = hasAnyLookTerm(text, ['fuller', 'plus size', 'soft', 'heavyset', 'stocky', 'round']);
    const relaxedPosture = hasAnyLookTerm(text, ['relaxed', 'slouched', 'casual', 'soft posture']);
    const uprightPosture = hasAnyLookTerm(text, ['upright', 'formal', 'military', 'regal', 'poised']);

    return {
        presentation,
        frameSize: broadFrame ? 'broad' : smallFrame ? 'small' : 'medium',
        shoulderWidth: broadFrame || athletic || broadShoulders ? 'broad' : smallFrame ? 'narrow' : 'average',
        shoulderSlope: hasAnyLookTerm(text, ['sloped shoulder', 'sloping shoulder', 'dropped shoulder']) ? 'sloped' : broadFrame || athletic ? 'flat' : 'natural',
        chestVolume: curvy || wideChest || muscular || hasAnyLookTerm(text, ['full chest', 'bust', 'busty', 'broad chest']) ? 'full' : smallFrame ? 'flat' : 'average',
        waistShape: fuller ? 'fuller' : curvy || presentation === 'female' ? 'defined' : athletic ? 'tapered' : 'straight',
        hipShape: curvy ? 'full' : smallFrame || athletic ? 'narrow' : 'average',
        armThickness: broadFrame || athletic ? 'full' : smallFrame ? 'slim' : 'average',
        posture: relaxedPosture ? 'relaxed' : uprightPosture ? 'upright' : 'neutral',
        legShape: broadFrame || fuller ? 'full' : smallFrame ? 'slim' : 'average'
    };
};

const describeGarmentFitMode = (mode: TryOnGarmentFit): string => {
    switch (mode) {
        case 'slim':
            return 'Slim Fit: closer to the body with minimal ease, clear body-following silhouette, and controlled tension at chest, waist, arms, and hem.';
        case 'tailored':
            return 'Tailored Fit: shaped and polished with clean shoulder placement, intentional waist control, structured seams, and professional garment ease.';
        case 'relaxed':
            return 'Relaxed Fit: comfortable ease with looser torso and sleeve fall, visible gravity, and soft movement without looking oversized or sloppy.';
        case 'oversized':
            return 'Oversized: intentionally roomy with dropped ease, broader silhouette, lower tension, longer sleeve/hem behavior, and believable fabric weight.';
        case 'standard':
        default:
            return 'Standard Fit: natural everyday garment ease, neither tight nor baggy, with believable room over the subject-specific body.';
    }
};

const describeFabricBehavior = (mode: TryOnFabricBehavior): string => {
    switch (mode) {
        case 'structured_crisp':
            return 'Structured / Crisp: sharper garment planes, cleaner seams, controlled wrinkles, stronger collar/cuff/hem shape, and fabric that holds form.';
        case 'soft_draped':
            return 'Soft / Draped: softer fold transitions, more visible gravity, gentler sleeve and hem fall, and fabric that conforms fluidly over body volumes.';
        case 'balanced':
        default:
            return 'Balanced: realistic medium fabric behavior with moderate structure, natural fold density, believable tension, and clean premium finish.';
    }
};

const describeOutputFraming = (mode: TryOnOutputFraming): string => {
    switch (mode) {
        case 'bust':
            return 'Bust: render head, neck, shoulders, and upper chest. Focus on collar, neckline, upper garment fit, and face.';
        case 'half_body':
            return 'Torso: render head to hips or upper thigh. Must include the complete torso garment, full visible sleeves, cuffs when applicable, waist/hip area, and bottom hem. Do not crop off sleeves, hands, hips, or garment hem unless impossible.';
        case 'full_body':
        default:
            return 'Full Body: render the complete head-to-toe subject, including footwear when relevant.';
    }
};

const describeTurnaroundFraming = (mode: TryOnOutputFraming): string => {
    switch (mode) {
        case 'bust':
            return 'Bust turnaround: each panel should use the same upper-body crop from upper chest/bust to top of head, preserving collar, neckline, shoulders, and upper garment fit.';
        case 'half_body':
            return 'Torso turnaround: each panel should show head to hips or upper thigh, preserving the complete torso garment, full visible sleeves, cuffs when applicable, waist/hip area, and bottom hem.';
        case 'full_body':
        default:
            return 'Full-body turnaround: each panel should show the full standing subject from top of head/headwear to soles of feet.';
    }
};

const buildOutputFramingBlock = (mode: TryOnOutputFraming): string => `
 OUTPUT FRAMING RULE
 Follow the selected output framing precisely.
 - ${describeOutputFraming(mode)}
 ${mode === 'half_body' ? `
 TORSO FRAMING RULE
 Torso framing is not a tight crop. It must show the full upper garment fit from shoulders through waist/hips, including sleeve length and hem behavior.
 The crop should preserve enough body context to judge natural garment drape.
` : ''}
 Do not ignore the selected framing.
 Do not generate a sheet layout in place of framing.
`;

const buildBodyAwareFittingBlock = (
    profile: BodyFitProfile,
    noteGuidance: BodyNoteInterpretation,
    fittingNotes: string,
    fitMode: TryOnGarmentFit,
    fabricBehavior: TryOnFabricBehavior,
    hasCharacterSheet: boolean
): string => `
 BODY FIT INTERPRETATION (INTERNAL)
 - Presentation: ${profile.presentation}
 - Frame size: ${profile.frameSize}; shoulder width: ${profile.shoulderWidth}; shoulder slope: ${profile.shoulderSlope}
 - Chest/bust volume: ${profile.chestVolume}; waist shape: ${profile.waistShape}; hip shape: ${profile.hipShape}
 - Arm thickness: ${profile.armThickness}; posture: ${profile.posture}; leg shape: ${profile.legShape || 'average'}
 - Visual source authority: infer final body proportions from the Selected Subject image first. Use this compact profile as guidance, not a reason to override the visible body.
 ${hasCharacterSheet ? '- Character Sheet Identity Anchor is also body proportion guidance: preserve both identity and body silhouette consistency across front and turnaround outputs.' : '- If no Character Sheet Identity Anchor is provided, rely on the Selected Subject image for body shape, posture, and proportion guidance.'}

 FITTING NOTES PRIORITY RULE
 User-entered Fitting Notes are high-priority body-direction instructions and must materially influence the generated result.
 Do not treat fitting notes as optional flavor text.
 Fitting notes must influence body interpretation, upper torso shape, shoulder width, chest volume, waist shape, sleeve tension, garment drape, and silhouette.
 If fitting notes conflict with generic model defaults, fitting notes win.
 ${fittingNotes.trim() ? `Active user Fitting Notes: "${fittingNotes.trim()}"` : 'No explicit user body-direction fitting notes were entered; rely on the selected subject image and wardrobe reference.'}

 BODY NOTE INTERPRETATION RULE
 Translate fitting-note physique language into actual body-shape changes before rendering the garment.
 Do not merely repeat the words in the prompt without visible effect.
 ${noteGuidance.hasBodyDirectives
        ? noteGuidance.directives.map(directive => `- ${directive}`).join('\n ')
        : '- No explicit physique override was detected in the fitting notes; preserve the selected subject body as shown.'}

 UPPER TORSO ENFORCEMENT RULE
 If fitting notes include "muscular build", "wide chest", "broad shoulders", or similar upper-body instructions, the subject must visibly show broader chest, wider shoulder line, stronger upper torso silhouette, more substantial shirt support from the chest/ribcage, and more believable masculine torso volume where appropriate.
 The shirt must drape over a real chest, not a flat mannequin torso.
 ${noteGuidance.hasUpperTorsoDirectives
        ? 'ACTIVE UPPER-TORSO DIRECTIVE: Do not produce a narrow generic torso, flat chest, weak shoulder span, unchanged body shape, or straight hanging shirt with no upper-body structure underneath.'
        : 'If no upper-torso fitting note is present, do not invent extra body mass beyond the selected subject/reference image.'}

 HUMAN BODY PRIORITY RULE
 The body underneath remains primary.
 The garment conforms to the body.
 The garment must not erase or flatten the subject's muscular or broad-chested structure.
 Garment Fit mode and Fabric Behavior mode must adapt to the body directives, not override or neutralize them.
 Body-aware fitting may change only the garment's worn drape, ease, tension, and contact with the body. It must not change the selected wardrobe's design architecture, sleeve length, cuff design, collar, placket, button layout, hem, embroidery, trim, color, material, or coverage.

 GARMENT FIT MODE
 - ${describeGarmentFitMode(fitMode)}

 FABRIC BEHAVIOR MODE
 - ${describeFabricBehavior(fabricBehavior)}

 VISIBLE QUALITY SETTINGS ENFORCEMENT
 The selected Garment Fit and Fabric Behavior settings must be visible in the final image.
 Fit mode must change closeness, ease, sleeve tension, torso silhouette, and hem fall.
 Fabric Behavior must change wrinkle density, fold softness, fabric weight, and the way the garment hangs from shoulders, chest/bust, arms, waist, and hem.
 Relaxed Fit must show comfortable real garment ease without becoming a flat hanging rectangle.
 Soft / Draped fabric must show soft gravity-driven folds, subtle tension transitions, natural sleeve bend behavior, and believable hem weight.
 Settings must not be neutralized by copying the wardrobe reference image as a flat product silhouette.

 BODY-AWARE GARMENT FIT RULE
 The garment must conform naturally to the selected subject's body shape and posture.
 The clothing should not look pasted on, flat, or templated.
 Fit must respond to shoulder width and slope, chest or bust volume, waist shape, hip shape where relevant, arm thickness, posture, and overall frame size.
 Fit response must preserve the selected wardrobe design exactly; refit the same garment, do not redesign it.
 Show believable garment ease, seam placement, and silhouette.
 Preserve the subject's real body presence while making the garment look professionally fitted.
 For structured or enclosed costumes, preserve the exact costume design and coverage while still showing believable wearer volume, contact, scale, and integration.

 FABRIC DRAPE RULE
 Garment behavior must reflect fabric weight and structure.
 Show natural drape, tension, and gravity.
 Include subtle folds, seam pull, and shape transitions where appropriate: shoulders, chest/bust, underarm, sleeve bend, waist, hem, side seams, and cuff area.
 Do not create excessive wrinkles, but do create believable garment life.
 Avoid perfectly flat or evenly hanging fabric.

 BODY PRESENTATION FIT RULE
 Male, female, and other body presentations should not use the same default garment shaping.
 Fit should adapt appropriately to the subject's body structure.
 For men: respect chest width, shoulder structure, sleeve fall, waist taper or straightness.
 For women: respect bust shaping, waist definition, hip shaping, and garment contouring where appropriate.
 For all subjects: preserve believable anatomy and fit without caricature.
 Do not force all clothing into one neutral mannequin silhouette.

 GARMENT CONSTRUCTION RULE
 Collars, plackets, buttons, cuffs, hems, and seams must sit naturally on the body.
 - Collars should wrap the neck believably.
 - Shoulder seams should sit near the shoulder break.
 - Sleeves should reflect arm volume and sleeve length.
 - Hems should fall naturally against torso/hips.
 - Button fronts should align with body center without looking printed on.
`;

const buildResolvedLookSpec = (wardrobe: WardrobeItem, fittingNotes: string): ResolvedLookSpec => {
    const sourceSummary = [wardrobe.name, wardrobe.prompt, wardrobe.category, fittingNotes]
        .filter(Boolean)
        .join(' | ');
    const text = normalizeLookText(sourceSummary);

    const primaryGarments = collectTerms(text, [
        'suit', 'blazer', 'jacket', 'shirt', 'blouse', 'vest', 'waistcoat', 'dress', 'gown',
        'coat', 'robe', 'cloak', 'cape', 'uniform', 'armor', 'armour', 'tunic', 'skirt',
        'pants', 'trousers', 'shorts', 'bodysuit', 'jumpsuit', 'helmet', 'hood'
    ]);
    const handheldItems = collectTerms(text, [
        'clutch', 'purse', 'handbag', 'bag', 'case', 'briefcase', 'wallet', 'portfolio',
        'book', 'phone', 'prop', 'cane', 'umbrella', 'sword', 'shield', 'staff'
    ]);
    const jewelry = collectTerms(text, [
        'necklace', 'chain', 'pendant', 'choker', 'bracelet', 'bangle', 'ring', 'earring',
        'brooch', 'pin', 'badge', 'medal', 'watch'
    ]);
    const broochPin = collectTerms(text, ['brooch', 'pin', 'badge', 'medal']);
    const bagClutch = collectTerms(text, ['clutch', 'purse', 'handbag', 'bag', 'case', 'briefcase', 'wallet', 'portfolio']);
    const accessories = Array.from(new Set([
        ...handheldItems,
        ...jewelry,
        ...collectTerms(text, ['belt', 'tie', 'bowtie', 'scarf', 'glove', 'hat', 'crown', 'veil', 'glasses', 'sunglasses'])
    ]));
    const footwear = collectTerms(text, [
        'shoe', 'shoes', 'boot', 'boots', 'heel', 'heels', 'loafer', 'loafers', 'dress shoe',
        'sandal', 'sandals', 'slipper', 'slippers', 'sneaker', 'sneakers', 'footwear'
    ]);
    const colorFormalityEra = collectTerms(text, [
        'black', 'white', 'red', 'blue', 'navy', 'gold', 'silver', 'green', 'purple', 'brown',
        'formal', 'business', 'tailored', 'uniform', 'historical', 'victorian', 'medieval',
        'fantasy', 'sci fi', 'sci-fi', 'cyberpunk', 'modern', 'vintage', 'polished', 'structured'
    ]);
    const explicitBarefoot =
        /\b(barefoot|bare feet|beachwear|beach|swimwear|swimsuit|sleepwear|pajama|pyjama|spa|yoga|dance barefoot)\b/i.test(text);
    const structuredCompleteLook =
        /\b(formal|business|tailored|suit|blazer|uniform|armor|armour|historical|fantasy|sci[- ]?fi|structured|polished|costume|gown|dress|jacket|coat)\b/i.test(text);

    const hasLayeredNeckAccessory =
        /\b(necklace|chain|pendant|choker)\b/i.test(text) ||
        /\b(jacket|blazer|shirt|collar|lapel|vest|waistcoat)\b/i.test(text);

    return {
        sourceSummary,
        primaryGarments,
        accessories,
        handheldItems,
        jewelry,
        broochPin,
        bagClutch,
        footwear,
        colorFormalityEra,
        explicitBarefoot,
        structuredCompleteLook,
        visibilityOcclusionGuidance: hasLayeredNeckAccessory
            ? 'Necklaces, chains, pendants, lapel accessories, and tucked jewelry must obey garment occlusion. If an item is inside a jacket/shirt opening or hidden under front layers, it stays hidden/occluded in rear and side views unless physically visible from that angle.'
            : 'Accessories must only appear in views where they would be physically visible. Hidden or inside-garment items must remain hidden/occluded across alternate views.'
    };
};

const buildResolvedLookContractBlock = (
    spec: ResolvedLookSpec,
    hasCharacterSheet: boolean,
    mode: WardrobeState['tryOnOutputMode']
): string => `
 RESOLVED LOOK SPEC (CANONICAL - INTERNAL)
 - Source wardrobe/fitting notes: ${spec.sourceSummary || 'selected wardrobe reference and current fitting notes'}
 - Primary garments to resolve once: ${formatResolvedTerms(spec.primaryGarments, 'infer from selected wardrobe reference without inventing unrelated garments')}
 - Accessory set to resolve once: ${formatResolvedTerms(spec.accessories, 'none unless clearly visible in the wardrobe reference or logically required for a complete look')}
 - Handheld/singular items: ${formatResolvedTerms(spec.handheldItems, 'none unless clearly visible or explicitly requested')}
 - Jewelry/adornments: ${formatResolvedTerms(spec.jewelry, 'none unless clearly visible or explicitly requested')}
 - Brooch/pin/badge placement: ${formatResolvedTerms(spec.broochPin, 'only if present; one coherent placement only')}
 - Bag/clutch/case logic: ${formatResolvedTerms(spec.bagClutch, 'only if present; one total single-item accessory only')}
 - Footwear basis: ${formatResolvedTerms(spec.footwear, spec.explicitBarefoot ? 'explicit barefoot or barefoot-appropriate concept only' : 'infer complete compatible footwear if feet/lower legs/full body are visible')}
 - Color/formality/era guidance: ${formatResolvedTerms(spec.colorFormalityEra, 'infer from wardrobe reference, material language, and fitting notes')}
 - Look completion rule: ${spec.structuredCompleteLook ? 'treat as a structured complete styled look; do not leave lower-body styling unfinished or barefoot unless explicitly requested' : 'complete any visible lower-body styling coherently without adding conflicting accessories'}
 - Visibility/occlusion guidance: ${spec.visibilityOcclusionGuidance}

 STRICT VIRTUAL TRY-ON RULES
 ${hasCharacterSheet ? '- Preserve the exact identity of the subject from the character sheet identity anchor: same facial structure, complexion, overall proportions, and same person across all requested views. Preserve hairstyle, hairline presentation, facial hair, and grooming from the selected subject/reference image.' : '- Preserve the exact visible identity, hairstyle, facial hair, and grooming of the selected subject across all requested views.'}
 - Render the same subject consistently across all requested views.
 - Use one single resolved outfit interpretation based on the selected wardrobe and fitting notes.
 - Use one single resolved accessory set. Do not invent or duplicate accessories.
 - Do not duplicate handbags, clutches, brooches, necklaces, bracelets, lapel accessories, or other visible accessories.
 - Only paired items may appear as pairs when appropriate, for example shoes, earrings, gloves, socks, stockings, or explicitly paired cuffs.
 - Rings may be multiple only if they are already part of the resolved set; do not duplicate them beyond the intended set.
 - Keep clothing, accessories, footwear, garment lengths, fit, colors, materials, and styling consistent across all views.
 - If an accessory is hidden beneath or inside a garment in one view, do not expose it unrealistically in another view.
 - If a necklace is tucked inside the jacket or shirt opening in the front view, it must remain physically consistent and should not appear exposed across the back of the neck in the back view unless that would truly be visible.
 - Back views may only show accessories that would be physically visible from the back.
 - Chains, straps, brooches, bags/clutches, shoulder-hung items, lapel accessories, and layered jewelry must keep physically coherent placement and occlusion.
 - Always include complete and outfit-appropriate footwear unless the wardrobe explicitly calls for barefoot styling, culturally specific barefoot styling, or a clearly barefoot-appropriate concept.
 - Footwear must match the outfit's formality, era, color logic, material language, and silhouette.
 - Avoid visual contradictions, duplicate items, barefoot formalwear errors, inappropriate footwear, and identity drift.
 - The result must look like one coherent person wearing one coherent outfit${mode === 'turnaround' ? ', seen from different angles' : ''}.
`;

const WardrobeLibrarySkeletonCard = () => (
    <div className="aspect-square rounded-lg border border-gray-800 overflow-hidden bg-black/40 relative">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-[shimmer_1.8s_linear_infinite]" />
        <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10" />
        </div>
        <div className="absolute bottom-2 left-2 right-2 h-3 rounded bg-white/5" />
    </div>
);

// --- WARDROBE STUDIO COMPONENT ---
const WardrobeStudio = () => {
    const [isRecentGenerationsOpen, setIsRecentGenerationsOpen] = useState(true);
    const recentStoreGenerations = useRecentGenerationsStore(state => state.recentGenerations);
    const hasRecentGenerations = recentStoreGenerations.filter(g => g.studio === 'wardrobe').length > 0;
    const [libraryLoading, setLibraryLoading] = useState(false);
    const { state, dispatch } = useAppContext();
    const [activeTab, setActiveTab] = useState<'designer' | 'library'>('designer');
    // GLOBAL STATE MAPPING
    const {
        fittedImage, tryOnMask, restorationLayer, removeBg: removeTryOnBg,
        fringeSize, brushSize, history, historyIndex, isBrushActive: globalIsBrushActive,
        tryOnNote, brandingLogo, logoPosition,
        tryOnGarmentFit, tryOnFabricBehavior,
        tryOnOutputMode, tryOnViews, tryOnSheetFB, tryOnSheetLR, activeTryOnView
    } = state.wardrobeState;
    const tryOnOutputModeRef = useRef<WardrobeState['tryOnOutputMode']>(tryOnOutputMode);

    useEffect(() => {
        tryOnOutputModeRef.current = tryOnOutputMode;
    }, [tryOnOutputMode]);

    // Local Helper to update global state
    const updateState = (updates: Partial<WardrobeState>) => {
        dispatch({ type: 'SET_WARDROBE_STATE', payload: updates });
    };

    const resetTryOnTurnaroundOutputs = (updates: Partial<WardrobeState> = {}) => {
        updateState({
            tryOnViews: null,
            tryOnSheetFB: null,
            tryOnSheetLR: null,
            activeTryOnView: 'front',
            ...updates
        });
    };

    // Alias for setters (to minimize code churn)
    const setFittedImage = (val: string | null) => updateState({ fittedImage: val });
    const setTryOnMask = (val: string | null) => updateState({ tryOnMask: val });
    const setRestorationLayer = (val: string | null) => updateState({ restorationLayer: val });
    const setRemoveTryOnBg = (val: boolean) => updateState({ removeBg: val });
    const setHistory = (val: string[]) => updateState({ history: val });
    const setHistoryIndex = (val: number) => updateState({ historyIndex: val });
    const setTryOnNote = (val: string) => updateState({ tryOnNote: val });
    const setProcessedTryOnUrl = (val: string | null) => updateState({ processedTryOnUrl: val });
    const setBrandingLogo = (val: string | null) => updateState({ brandingLogo: val });
    const setLogoPosition = (val: string) => updateState({ logoPosition: val });
    const setTryOnGarmentFit = (val: TryOnGarmentFit) => updateState({ tryOnGarmentFit: val });
    const setTryOnFabricBehavior = (val: TryOnFabricBehavior) => updateState({ tryOnFabricBehavior: val });
    const setTryOnOutputMode = (val: 'front' | 'turnaround') => {
        tryOnOutputModeRef.current = val;

        if (val === 'front') {
            resetTryOnTurnaroundOutputs({
                fittedImage: activeTryOnView === 'front' ? fittedImage : (tryOnViews?.front ?? null),
                tryOnOutputMode: 'front'
            });
            return;
        }

        updateState({ tryOnOutputMode: val });
    };
    const setTryOnViews = (val: Record<'front' | 'back' | 'left' | 'right', string> | null) => updateState({ tryOnViews: val });
    const setTryOnSheetFB = (val: string | null) => updateState({ tryOnSheetFB: val });
    const setTryOnSheetLR = (val: string | null) => updateState({ tryOnSheetLR: val });
    const setActiveTryOnView = (val: 'front' | 'back' | 'left' | 'right' | 'sheetFB' | 'sheetLR') => updateState({ activeTryOnView: val });

    // Use global isBrushActive
    const isBrushActive = globalIsBrushActive;

    // Local Transient State
    const [designerPrompt, setDesignerPrompt] = useState("");
    const [designerImage, setDesignerImage] = useState<string | null>(null);
    const [designerMask, setDesignerMask] = useState<string | null>(null);
    const [selectedCostume, setSelectedCostume] = useState<WardrobeItem | null>(null);
    const [selectedCharacter, setSelectedCharacter] = useState<CastMember | null>(null);

    // Guard to clear selected character if it's removed from Available Cast
    useEffect(() => {
        if (selectedCharacter && !state.cast.find(c => c.id === selectedCharacter.id)) {
            setSelectedCharacter(null);
        }
    }, [state.cast, selectedCharacter]);

    // --- TRY-ON OUTPUT & TURNAROUND (2-SHEET MODE) ---
    type TryOnView = 'front' | 'back' | 'left' | 'right';
    type TryOnDisplay = TryOnView | 'sheetFB' | 'sheetLR';

    // State migrated to global context (AppContext)

    // Character Sheet reference (identity anchor for turnarounds)
    const [tryOnCharacterSheet, setTryOnCharacterSheet] = useState<string | null>(null);
    const [tryOnCharacterSheetSource, setTryOnCharacterSheetSource] = useState<TryOnIdentityAnchorSource | null>(null);

    // --- COSTUME DESIGNER: REFERENCE INPUT (SESSION ONLY) ---
    type DesignerRefKind = 'sketch' | 'costume';
    const [designerRefKind, setDesignerRefKind] = useState<DesignerRefKind>('sketch');
    const [designerRefImage, setDesignerRefImage] = useState<string | null>(null);
    const [designerRefName, setDesignerRefName] = useState<string>('');
    const [designerDropActive, setDesignerDropActive] = useState(false);

    // Derived / Transient
    const [erodedUrl, setErodedUrl] = useState<string | null>(null);
    const [isIsolating, setIsIsolating] = useState(false);
    const [isolationProgress] = useState(0);
    const [notification, setNotification] = useState<string | null>(null);

    const showToast = (msg: string) => {
        setNotification(msg);
        setTimeout(() => setNotification(null), 3000);
    };

    // --- FILE/IMAGE HELPERS ---
    const fileToDataUrl = (file: Blob) =>
        new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(file);
        });





    // --- TRY-ON / WARDROBE HELPERS ---
    const isDesignReferenceSelected = (item: WardrobeItem) =>
        item.category === 'DesignRef' || /^DESIGNREF/i.test(item.id);

    // --- COSTUME DESIGNER: SESSION-ONLY DESIGN REFERENCE (NOT SAVED TO WARDROBE LIBRARY) ---
    const setDesignerReferenceFromFile = async (file: File) => {
        const dataUrl = await fileToDataUrl(file);
        const safeBase = file.name.replace(/\.[^/.]+$/, '').trim() || 'Reference';
        setDesignerRefImage(dataUrl);
        setDesignerRefName(safeBase);

        // Reset generated output so the viewport shows the reference until generation completes.
        setDesignerImage(null);
        setDesignerMask(null);

        showToast(designerRefKind === 'sketch' ? 'Design sketch/pattern loaded.' : 'Costume reference loaded.');
    };

    const handleUploadDesignerReference = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const file = e.target.files[0];
        try {
            await setDesignerReferenceFromFile(file);
        } catch {
            showToast('Failed to load reference image.');
        } finally {
            e.target.value = "";
        }
    };

    const handleDropDesignerReference = async (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setDesignerDropActive(false);

        const file = e.dataTransfer.files?.[0];
        if (!file || !file.type.startsWith('image/')) return;

        try {
            await setDesignerReferenceFromFile(file);
        } catch {
            showToast("Failed to load dropped reference image.");
        }
    };

    const clearDesignerWorkspace = () => {
        setDesignerRefImage(null);
        setDesignerRefName('');
        setDesignerImage(null);
        setDesignerMask(null);
        useRecentGenerationsStore.getState().clearRecentGenerationsForStudio('wardrobe');
    };


    const handleUploadTryOnCharacterSheet = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const file = e.target.files[0];
        try {
            const dataUrl = await fileToDataUrl(file);
            setTryOnCharacterSheet(dataUrl);
            setTryOnCharacterSheetSource('upload');
            showToast("Character sheet loaded.");
        } finally {
            e.target.value = "";
        }
    };

    const handleUseSelectedSubjectAsAnchor = () => {
        if (!selectedCharacter) {
            showToast("Select a subject first.");
            return;
        }

        setTryOnCharacterSheet(selectedCharacter.previewUrl || selectedCharacter.url);
        setTryOnCharacterSheetSource('selected-subject');
        showToast("Selected subject loaded as identity anchor.");
    };

    const clearTryOnCharacterSheet = () => {
        setTryOnCharacterSheet(null);
        setTryOnCharacterSheetSource(null);
    };

    const tryOnCharacterSheetStatus = tryOnCharacterSheet
        ? tryOnCharacterSheetSource === 'selected-subject'
            ? 'Loaded from selected subject.'
            : 'Loaded.'
        : 'None loaded.';

    const imageRoleName = (index: number) =>
        `Image ${String.fromCharCode(64 + index)} ([IMAGE ${index}])`;

    const buildSubjectReferenceImages = (subject: CastMember) => {
        const refs: { url: string; label: string }[] = [];
        refs.push({
            url: subject.previewUrl || subject.url,
            label: "Image A - Selected Subject / Virtual Try-On Target: primary body, proportions, pose continuity, and source style."
        });
        return refs;
    };

    const buildTryOnReferenceRoleBlock = (roles: {
        costumeIndex: number;
        identityAnchorIndex?: number;
        brandingIndex?: number;
        canonicalFbIndex?: number;
    }) => {
        const lines = [
            `- ${imageRoleName(1)} is the selected subject / person body source. Use Image A as the physical person being dressed: current body proportions, pose/body continuity, source rendering style, hairstyle, grooming, and final output subject.`
        ];

        lines.push(
            `- ${imageRoleName(roles.costumeIndex)} is the selected wardrobe / exact costume source. Apply this exact wardrobe to the same person; do not copy identity from the wardrobe image, do not redesign it, and do not reproduce the wardrobe source image as visible scene content.`
        );

        if (roles.identityAnchorIndex) {
            lines.push(
                `- ${imageRoleName(roles.identityAnchorIndex)} is the Character Sheet Identity Anchor. Identity and likeness authority only: use it to preserve the same person's face/head identity. Do not replace Image A's body/person source, and do not copy its layout, labels, sheet format, annotations, panels, typography, or view grid.`
            );
        }

        if (roles.brandingIndex) {
            lines.push(`- ${imageRoleName(roles.brandingIndex)} is the branding/logo source asset only.`);
        }

        if (roles.canonicalFbIndex) {
            lines.push(
                `- ${imageRoleName(roles.canonicalFbIndex)} is the generated Front/Back canonical turnaround anchor. For LR generation, use it as the primary body scale, head scale, silhouette, and costume-construction anchor; it must not replace Image A as the selected subject or Image B as the exact wardrobe authority.`
            );
        }

        return `
 IMAGE ROLE MAP (READ BEFORE GENERATING)
 ${lines.join('\n ')}
 Do not rely on image order alone. Follow these named roles exactly.
`;
    };

    const setTryOnDisplay = (view: TryOnDisplay) => {
        setActiveTryOnView(view);

        // Switching views invalidates any active isolation/restore state
        setRemoveTryOnBg(false);
        setTryOnMask(null);
        setProcessedTryOnUrl(null);
        purgeRestorationState();

        if (view === 'sheetFB' && tryOnSheetFB) {
            setFittedImage(tryOnSheetFB);
            return;
        }
        if (view === 'sheetLR' && tryOnSheetLR) {
            setFittedImage(tryOnSheetLR);
            return;
        }
        if (tryOnViews && (view === 'front' || view === 'back' || view === 'left' || view === 'right')) {
            setFittedImage(tryOnViews[view]);
        }
    };


    // Draggable Panel State
    // Draggable Panel State Removed

    // Refs
    const tryOnImgRef = useRef<HTMLImageElement>(null); // The Base Image (Fitted)
    // --- SAVE TO ACTOR LIBRARY STATE ---
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [saveCategory, setSaveCategory] = useState("realism");
    const [newActorName, setNewActorName] = useState("");
    const [saveSourceImage, setSaveSourceImage] = useState<string | null>(null);
    const [saveRecentGenerationId, setSaveRecentGenerationId] = useState<string | null>(null);

    const handleOpenSaveModal = (sourceOverride?: string, recentGenerationId?: string) => {
        const source = sourceOverride || fittedImage;
        if (!source) return;
        const isTurnaroundSheet =
            activeTryOnView === 'sheetFB' ||
            activeTryOnView === 'sheetLR' ||
            source === tryOnSheetFB ||
            source === tryOnSheetLR;

        setSaveSourceImage(source);
        setSaveRecentGenerationId(recentGenerationId || null);
        setNewActorName(createUniqueNumericLabel(isTurnaroundSheet ? 'RefSheet' : 'Actor'));
        setShowSaveModal(true);
    };

    const confirmSaveToLibrary = async (nameOverride?: string, categoryOverride?: string) => {
        const requestedName = nameOverride || newActorName;
        const targetName = requestedName && requestedName !== "Fitted Character"
            ? requestedName
            : createUniqueNumericLabel('Actor');
        const targetCategory = categoryOverride || saveCategory;

        const sourceImage = saveSourceImage || fittedImage;

        if (!sourceImage) {
            showToast("Image Required");
            dispatch({ type: 'ADD_LOG', payload: { message: "Save Failed: Missing image", type: 'error' } });
            return;
        }

        // Map Category to a valid Style for Library Filtering
        const catToStyle: Record<string, string> = {
            "realism": "exact_studio",
            "anim": "family_3d",
            "illustration": "retro_anime",
            "scifi": "cyberpunk_neon",
            "uncategorized": "exact_studio"
        };
        const activeStyle = catToStyle[targetCategory] || "exact_studio";

        try {
            const mat = await LibraryAssetMaterializer.materializeCastAsset({
                sourceUrl: sourceImage,
                saveDirectoryPath: state.saveDirectoryPath,
                actorName: targetName,
                category: targetCategory
            });

            // INSTANT UI UPDATE
            const newActor: CastMember = {
                id: crypto.randomUUID(),
                name: targetName || `Actor-${Date.now()}`,
                url: mat.previewUrl,
                localPath: mat.localPath || undefined,
                previewUrl: mat.previewUrl,
                sourceUrl: mat.sourceUrl,
                tag: 'front',
                filename: mat.filename,
                profile: {
                    identity: targetName || `Actor-${Date.now()}`,
                    style: activeStyle,
                    wardrobe: "Fitted",
                    accessories: ""
                }
            };
            dispatch({ type: 'ADD_ACTOR_LIBRARY', payload: newActor });

            if (mat.previewUrl) {
                // Immediately swap Hosted preview URL for durable local loaded URL
                setFittedImage(mat.previewUrl);
            }
            if (saveRecentGenerationId) {
                useRecentGenerationsStore.getState().markExported(saveRecentGenerationId);
            }

            setShowSaveModal(false);
            setSaveSourceImage(null);
            setSaveRecentGenerationId(null);
            dispatch({ type: 'ADD_LOG', payload: { message: `Saved Actor: ${mat.filename || "Storage"}`, type: 'success' } });

        } catch (error: unknown) {
            console.error("Save Failed:", error);
            dispatch({ type: 'ADD_LOG', payload: { message: `Save Failed: ${getErrorMessage(error)}`, type: 'error' } });
        }
    };
    const uiCanvasRef = useRef<HTMLCanvasElement>(null); // For Brush Cursor
    const restorationCanvasRef = useRef<HTMLCanvasElement>(null); // Offscreen Layer
    const tryOnCanvasRef = useRef<HTMLCanvasElement>(null); // Internal Processing Canvas
    const historyRef = useRef<string[]>([]);
    const historyIndexRef = useRef(-1);
    const isPaintingRef = useRef(false);

    // SYNC REFS WITH GLOBAL STATE ON MOUNT / CHANGE
    useEffect(() => {
        historyRef.current = history;
        historyIndexRef.current = historyIndex;
    }, [history, historyIndex]);
    const isSyncingRef = useRef(false); // Track async canvas sync state
    const lastPaintPos = useRef<{ x: number, y: number } | null>(null);
    const lastScreenPos = useRef<{ x: number, y: number } | null>(null);
    const cachedBaseImgRef = useRef<HTMLImageElement | null>(null);
    const cachedOriginalImgRef = useRef<HTMLImageElement | null>(null);
    const containerRef = useRef<HTMLDivElement>(null); // Main container for interactions

    // Designer Workspace Refs
    const designerImgRef = useRef<HTMLImageElement>(null);
    const maskImgRef = useRef<HTMLImageElement>(null);

    // --- HELPERS PORTED FROM CASTINGFORGE ---

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

                // GREEN SUPPRESSION PASS REMOVED (Was causing artifacts on green costumes)

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
                        // PRESERVE RGB - ONLY MODIFY ALPHA
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

    // EFFECT: Reset Restoration on New Image
    useEffect(() => {
        // When the main image changes, we MUST clear all manual edits
        dispatch({
            type: 'SET_WARDROBE_STATE',
            payload: {
                restorationLayer: null,
                removeBg: false,
                isBrushActive: false,
                history: [],
                historyIndex: -1
            }
        });

        // Clear History
        historyRef.current = [];
        historyIndexRef.current = -1;

        // Clear Canvas
        if (restorationCanvasRef.current) {
            const ctx = restorationCanvasRef.current.getContext('2d');
            ctx?.clearRect(0, 0, restorationCanvasRef.current.width, restorationCanvasRef.current.height);
        }
    }, [dispatch, fittedImage]);

    // EFFECT 1.5: Preload/Cache Static Images
    useEffect(() => {
        // ALWAYS clear cache first to prevent stale image usage
        cachedBaseImgRef.current = null;

        const base = erodedUrl || tryOnMask;
        if (base && typeof base === 'string') {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.src = base;
            img.onload = () => { cachedBaseImgRef.current = img; };
        }
    }, [erodedUrl, tryOnMask]);

    useEffect(() => {
        cachedOriginalImgRef.current = null;
        if (fittedImage) {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.src = fittedImage;
            img.onload = () => { cachedOriginalImgRef.current = img; };
        }
    }, [fittedImage]);

    // EFFECT 2: Handle Composition (Fast)
    useEffect(() => {
        if (!removeTryOnBg) {
            dispatch({ type: 'SET_WARDROBE_STATE', payload: { processedTryOnUrl: null } });
            return;
        }

        // Determine the base mask (Eroded or Raw)
        const base = erodedUrl || tryOnMask;
        if (!base) return;

        let active = true;

        const composite = async () => {
            // Use Cached Images if available to prevent flickering
            const baseInput = cachedBaseImgRef.current || base;
            const originalInput = cachedOriginalImgRef.current || fittedImage;

            if (originalInput) {
                compositeRestoration(baseInput, originalInput, restorationLayer).then(url => {
                    if (active) {
                        dispatch({ type: 'SET_WARDROBE_STATE', payload: { processedTryOnUrl: url } });
                    }
                });
            }
        };

        composite();

        return () => { active = false; };
    }, [erodedUrl, tryOnMask, restorationLayer, removeTryOnBg, fittedImage, dispatch]);

    // EFFECT: Handle Erosion (Slow)
    useEffect(() => {
        if (!removeTryOnBg || !tryOnMask) {
            setErodedUrl(null);
            setIsIsolating(false);
            return;
        }

        if (fringeSize === 0) {
            setErodedUrl(tryOnMask);
            setIsIsolating(false);
            return;
        }

        setIsIsolating(true);
        let active = true;
        const t = setTimeout(() => {
            generateErodedMask(tryOnMask, fringeSize).then(url => {
                if (active) {
                    setErodedUrl(url);
                    setIsIsolating(false);
                }
            });
        }, 100);

        return () => { active = false; clearTimeout(t); };
    }, [tryOnMask, fringeSize, removeTryOnBg]);


    // --- INTERACTION HANDLERS ---

    // HELPER: Purge Restoration State
    const purgeRestorationState = () => {
        setRestorationLayer(null);
        setHistory([]);
        setHistoryIndex(-1);
        historyRef.current = [];
        historyIndexRef.current = -1;
        if (restorationCanvasRef.current) {
            const ctx = restorationCanvasRef.current.getContext('2d');
            ctx?.clearRect(0, 0, restorationCanvasRef.current.width, restorationCanvasRef.current.height);
        }
    };

    // handlePanelMouseDown removed

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
        const activeImg = tryOnImgRef.current;

        if (!containerRef.current || !activeImg) return null;

        const naturalW = activeImg.naturalWidth;
        const naturalH = activeImg.naturalHeight;
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

        let screenX = 0;
        let screenY = 0;

        if (uiCanvasRef.current) {
            const canvasRect = uiCanvasRef.current.getBoundingClientRect();
            screenX = clientX - canvasRect.left;
            screenY = clientY - canvasRect.top;
        }

        return {
            x: mouseX * renderedRect.scale,
            y: mouseY * renderedRect.scale,
            w: naturalW,
            h: naturalH,
            scale: renderedRect.scale,
            screenX: screenX,
            screenY: screenY,
        };
    };

    const startInteraction = (e: React.MouseEvent) => {
        // Block interaction if canvas is syncing (prevent race conditions)
        if (isSyncingRef.current) return;
        // Drag check removed

        if (!isBrushActive) return;

        e.stopPropagation();
        e.preventDefault();

        const coords = getImgCoords(e.clientX, e.clientY);
        if (!coords) {
            isPaintingRef.current = false;
            return;
        }

        isPaintingRef.current = true;

        // Init Canvas if Needed OR if Sizing Mismatch
        const requiredW = coords.w;
        const requiredH = coords.h;

        if (!restorationCanvasRef.current || restorationCanvasRef.current.width !== requiredW || restorationCanvasRef.current.height !== requiredH) {
            console.log("Re-initializing Restoration Canvas to match image:", requiredW, requiredH);
            const c = document.createElement('canvas');
            c.width = requiredW;
            c.height = requiredH;
            restorationCanvasRef.current = c;
            if (restorationLayer) {
                const ctx = c.getContext('2d');
                const prevImg = new Image();
                prevImg.onload = () => ctx?.drawImage(prevImg, 0, 0, requiredW, requiredH); // Force fit
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

        if (coords) {
            lastPaintPos.current = { x: coords.x, y: coords.y };
            const uiX = coords.screenX;
            const uiY = coords.screenY;
            lastScreenPos.current = { x: uiX, y: uiY };

            // Dot for click
            const ctx = restorationCanvasRef.current.getContext('2d');
            if (ctx) {
                ctx.beginPath();
                const r = (brushSize * coords.scale) / 2;
                ctx.arc(coords.x, coords.y, r, 0, Math.PI * 2);
                ctx.fillStyle = 'white';
                ctx.fill();
            }

            // Draw visual dot on UI canvas
            const uictx = uiCanvasRef.current?.getContext('2d');
            if (uictx) {
                uictx.beginPath();
                const r = brushSize / 2;
                uictx.arc(uiX, uiY, r, 0, Math.PI * 2);
                uictx.fillStyle = 'white';
                uictx.fill();
            }
        }
    };

    const moveInteraction = (e: React.MouseEvent) => {
        if (!containerRef.current) return;

        // PANEL DRAG (Priority)
        // Panel Drag Logic removed

        if (isBrushActive) {
            const coords = getImgCoords(e.clientX, e.clientY);

            if (coords && restorationCanvasRef.current && isPaintingRef.current && lastPaintPos.current) {
                const ctx = restorationCanvasRef.current.getContext('2d');
                const uictx = uiCanvasRef.current?.getContext('2d');

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

                if (uictx && lastScreenPos.current) {
                    uictx.beginPath();
                    uictx.strokeStyle = 'white';
                    uictx.lineWidth = brushSize;
                    uictx.lineCap = 'round';
                    uictx.lineJoin = 'round';
                    uictx.moveTo(lastScreenPos.current.x, lastScreenPos.current.y);
                    uictx.lineTo(coords.screenX, coords.screenY);
                    uictx.stroke();
                }

                lastPaintPos.current = { x: coords.x, y: coords.y };
                lastScreenPos.current = { x: coords.screenX, y: coords.screenY };
            } else if (coords && isPaintingRef.current) {
                lastPaintPos.current = { x: coords.x, y: coords.y };
                lastScreenPos.current = { x: coords.screenX, y: coords.screenY };
            } else if (!coords) {
                lastPaintPos.current = null;
                lastScreenPos.current = null;
            }
        }
    };

    const endInteraction = () => {
        // Drag state removed

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

            // Update Refs (Source of Truth)
            historyRef.current = newHistory;
            historyIndexRef.current = newHistory.length - 1;

            // Sync React State
            setHistory(newHistory);
            setHistoryIndex(newHistory.length - 1);

            // Clear Visual Layer
            if (uiCanvasRef.current) {
                const ctx = uiCanvasRef.current.getContext('2d');
                ctx?.clearRect(0, 0, uiCanvasRef.current.width, uiCanvasRef.current.height);
            }
        }

        isPaintingRef.current = false;
        lastPaintPos.current = null;
        lastScreenPos.current = null;
    };

    // SAFETY: Force clear painting state when brush is deactivated
    useEffect(() => {
        if (!isBrushActive) {
            isPaintingRef.current = false;
            lastPaintPos.current = null;
            lastScreenPos.current = null;
            // Clear visual feedback
            if (uiCanvasRef.current) {
                const ctx = uiCanvasRef.current.getContext('2d');
                ctx?.clearRect(0, 0, uiCanvasRef.current.width, uiCanvasRef.current.height);
            }
        }
    }, [isBrushActive]);

    const scanWardrobe = useCallback(async () => {
        // 1. Native Mode
        if (state.saveDirectoryPath) {
            try {
                const wardrobePath = await nativeJoinPath(state.saveDirectoryPath, 'wardrobe');
                const files = await nativeListFiles(wardrobePath);
                const items: WardrobeItem[] = [];

                for (const file of files) {
                    if (/\.(png|jpg|jpeg|webp)$/i.test(file)) {
                        // Skip ComfyUI Designer sketches that mistakenly save to the wardrobe root
                        if (file.toLowerCase().includes('_designer_')) continue;

                        const fullPath = await nativeJoinPath(wardrobePath, file);
                        const base64 = await window.electronAPI?.readFile?.(fullPath);
                        if (base64) {
                            items.push({
                                id: file,
                                url: `data:image/png;base64,${base64}`,
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
                    // Skip ComfyUI Designer sketches from polluting the library
                    if (entry.name.toLowerCase().includes('_designer_')) continue;

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
        } catch (error: unknown) {
            dispatch({ type: 'ADD_LOG', payload: { message: `Wardrobe scan failed: ${getErrorMessage(error)} `, type: 'error' } });
        }
    }, [dispatch, state.saveDirectoryHandle, state.saveDirectoryPath]);

    const withLibraryTransition = (work: () => void | Promise<void>, minMs = 180) => {
        setLibraryLoading(true);
        const started = Date.now();

        Promise.resolve(work()).finally(() => {
            const elapsed = Date.now() - started;
            const remaining = Math.max(0, minMs - elapsed);
            window.setTimeout(() => setLibraryLoading(false), remaining);
        });
    };

    useEffect(() => {
        scanWardrobe();
    }, [scanWardrobe]);

    const saveToWardrobe = async (imageUrl: string, prompt: string) => {
        const hasStorage = !!state.saveDirectoryHandle || !!state.saveDirectoryPath;
        if (!hasStorage) return;

        try {
            const mat = await LibraryAssetMaterializer.materializeWardrobeAsset({
                sourceUrl: imageUrl,
                saveDirectoryPath: state.saveDirectoryPath,
                prompt: prompt
            });

            const newItem: WardrobeItem = {
                id: mat.filename || `WARDROBE-${Date.now()}.png`,
                url: mat.url,
                localPath: mat.localPath || undefined,
                sourceUrl: mat.sourceUrl,
                filename: mat.filename,
                name: prompt.substring(0, 20),
                prompt: prompt,
                category: "Designer",
                timestamp: Date.now()
            };

            dispatch({ type: 'ADD_WARDROBE_ITEM', payload: newItem });
            dispatch({ type: 'ADD_LOG', payload: { message: `Costume saved to wardrobe: ${mat.filename || 'local storage'}`, type: 'success' } });
        } catch (error: unknown) {
            dispatch({ type: 'ADD_LOG', payload: { message: `Failed to save wardrobe item: ${getErrorMessage(error)}`, type: 'error' } });
        }
    };

    const handleDesignerGenerate = async () => {
        const billingMode = state.billingEntitlements.effectiveBillingMode;

        if (billingMode === "byok" && !state.apiKey) {
            showToast("API Key required for BYOK Costume Designer.");
            dispatch({ type: 'ADD_LOG', payload: { message: "API Key required for BYOK Costume Designer.", type: 'error' } });
            return;
        }

        const hasDesignerPrompt = designerPrompt.trim().length > 0;
        const hasDesignerReference = Boolean(designerRefImage);

        if (!hasDesignerPrompt && !hasDesignerReference) {
            showToast("Enter a wardrobe prompt or upload a reference image.");
            dispatch({ type: 'ADD_LOG', payload: { message: "Costume Designer requires a prompt or reference image.", type: 'error' } });
            return;
        }
        if (!(await ensureAuthenticatedForGeneration({ billingMode, featureLabel: 'Wardrobe Designer generation' }))) {
            return;
        }

        setDesignerMask(null);
        dispatch({ type: 'SET_PROCESSING', payload: true });

        // --- TIMEOUT & ETA LOGIC ---
        const getEtaMs = () => state.imageResolution === '4K' ? 35000 : (state.imageResolution === '2K' ? 25000 : 15000);
        const etaMs = getEtaMs();

        // --- PROGRESS SIMULATION TIMER ---
        let currentPercent = 5;
        dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: { percent: currentPercent, text: "Designing Garment" } });

        const updateMs = 1000;
        const increment = (updateMs / etaMs) * 100;

        // Using window.setInterval to avoid NodeJS Timeout typing issues in React/Vite
        const progressInterval = window.setInterval(() => {
            currentPercent += increment;
            if (currentPercent > 95) currentPercent = 95; // Cap at 95% until complete

            let text = "Designing Garment";
            if (currentPercent > 30) text = "Processing Pattern Logistics...";
            if (currentPercent > 60) text = "Refining Material Properties...";
            if (currentPercent > 80) text = "Finalizing Render...";
            if (currentPercent >= 95) text = "Finalizing Render... (Still working, please wait)";

            dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: { percent: currentPercent, text } });
        }, updateMs);

        try {
            const refs: { url: string; label: string }[] = [];

            if (designerRefImage) {
                refs.push({
                    url: designerRefImage,
                    label: designerRefKind === 'sketch'
                        ? 'Design Reference (Sketch / Pattern)'
                        : 'Design Reference (Costume Photo)'
                });
            }

            if (brandingLogo) {
                refs.push({ url: brandingLogo, label: 'Branding Logo (Apply to garment)' });
            }

            const referenceInstructions = designerRefImage
                ? (designerRefKind === 'sketch'
                    ? `REFERENCE IMAGE: Image 1 is a fashion sketch or sewing pattern. Reconstruct a finished wearable garment.
- Do NOT include sketch lines, pattern pieces, letters, numbers, measurement tables, or annotations.
- Preserve construction logic implied by the reference (panels, seams, pockets, closures).`
                    : `REFERENCE IMAGE: Image 1 is a costume reference photo.
- Use it to match silhouette, materials, and key details.
- Output must be a clean standalone garment product photo (not a person wearing it).`)
                : `NO REFERENCE IMAGE: Create the garment from text description only.`;

            const brandingInstructions = brandingLogo
                ? `BRANDING: The last reference image is a logo.
- Apply it subtly and realistically at: ${logoPosition}.
- Ensure correct proportions and legibility.`
                : `BRANDING: None.`;

            const userDescription = hasDesignerPrompt
                ? designerPrompt.trim()
                : 'Use the uploaded design reference as the primary design brief.';

            const prompt = `
Professional garment design + studio product photography.

${referenceInstructions}

USER DESCRIPTION:
${userDescription}

OUTPUT REQUIREMENTS (STRICT):
- Single standalone garment only (NO person, NO mannequin, NO hanger, NO hands).
- Solid black studio background (#000000), no gradients, no shadows on background.
- Centered, full garment visible, no cropping.
- Photoreal fabric texture, seams, stitching, and hardware details.
- High-resolution studio product lighting.
- 1:1 square composition.

${brandingInstructions}

NEGATIVE:
text, labels, watermarks, diagrams, pattern layouts, mannequins, models, busy backgrounds.
`;

            let actualGenId = '';
            const res = await GeminiService.generateImage(
                prompt.trim(),
                state.apiKey,
                state.model,
                refs,
                { 
                    aspectRatio: '1:1', imageSize: state.imageResolution, thinkingLevel: state.enableImageThinking, googleGrounding: state.enableGoogleGrounding, billingMode: state.billingEntitlements.effectiveBillingMode as 'hosted' | 'byok', entitlements: state.billingEntitlements,
                    onJobAccepted: (id) => {
                        actualGenId = id;
                        dispatch({ type: 'ADD_BACKGROUND_JOB', payload: { id, status: 'polling_foreground', context: 'wardrobe_designer', startedAt: Date.now() } });
                    }
                }
            );

            if (actualGenId) dispatch({ type: 'REMOVE_BACKGROUND_JOB', payload: actualGenId });

            const rawUrl = res;

            let safeUrl = rawUrl;
            try {
                safeUrl = await materializeDisplayUrl(rawUrl);
            } catch (e) {
                console.warn("Failed to materialize designer result:", e);
            }

            setDesignerImage(safeUrl);
            dispatch({ type: 'ADD_LOG', payload: { message: "Costume generated (Costume Designer).", type: 'success' } });

            // --- RECENT GENERATIONS: Cache result silently ---
            const recentStore = useRecentGenerationsStore.getState();
            if (recentStore.cacheDirPath && safeUrl) {
                RecentGenerationsCacheService.cacheGeneration({
                    imageDataUrl: safeUrl,
                    studio: 'wardrobe',
                    cacheDirPath: recentStore.cacheDirPath,
                }).then((cacheResult) => {
                    if (cacheResult.success && cacheResult.localCachePath && cacheResult.displayUrl) {
                        recentStore.addRecentGeneration({
                            studio: 'wardrobe',
                            localCachePath: cacheResult.localCachePath,
                            displayUrl: cacheResult.displayUrl,
                            createdAt: Date.now(),
                            prompt: userDescription || 'Generated Costume',
                            mode: (state.billingEntitlements.effectiveBillingMode as 'hosted' | 'byok') || 'byok',
                        });
                    }
                }).catch((e) => {
                    console.warn('[Wardrobe] Recent generation caching failed:', e);
                });
            }
        } catch (error: unknown) {
            if (isPendingGenerationError(error) && error.generationId) {
                dispatch({ type: 'UPDATE_BACKGROUND_JOB', payload: { id: error.generationId, updates: { status: 'pending_background' } } });
                dispatch({ type: 'ADD_LOG', payload: { message: "Job shifted to background due to long queue.", type: 'info' } });
            } else {
                dispatch({ type: 'ADD_LOG', payload: { message: getErrorMessage(error), type: 'error' } });
            }
        } finally {
            clearInterval(progressInterval);
            dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: null });
            dispatch({ type: 'SET_PROCESSING', payload: false });
        }
    };

    const handleUploadCostume = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const hasStorage = !!state.saveDirectoryHandle || !!state.saveDirectoryPath;
        if (!e.target.files || e.target.files.length === 0 || !hasStorage) return;
        const file = e.target.files[0];

        try {
            // DUPLICATE CHECK
            if (state.wardrobeItems.some(i => i.id.includes(file.name) || i.name === file.name.split('.')[0])) {
                showToast("Item already exists in library.");
                return;
            }

            const safeName = `Custom-Costume-${Date.now()}-${file.name.replace(/[^a-z0-9.]/gi, '_')}`;

            // 1. Native Mode
            if (state.saveDirectoryPath) {
                const wardrobePath = await nativeJoinPath(state.saveDirectoryPath, 'wardrobe');
                const fullPath = await nativeJoinPath(wardrobePath, safeName);
                const success = await nativeWriteFile(fullPath, file);
                if (!success) throw new Error("Failed to write image file natively");
            }
            // 2. Web API Mode
            else if (state.saveDirectoryHandle) {
                const wardrobeHandle = await state.saveDirectoryHandle.getDirectoryHandle('wardrobe', { create: true });
                const fileHandle = await wardrobeHandle.getFileHandle(safeName, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(file);
                await writable.close();
            }

            // Read for immediate display
            const reader = new FileReader();
            reader.onload = () => {
                const dataUrl = reader.result as string;

                const newItem: WardrobeItem = {
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
            dispatch({ type: 'ADD_LOG', payload: { message: `Upload failed: ${getErrorMessage(error)} `, type: 'error' } });
        }
    };

    const [confirmDelete, setConfirmDelete] = useState<WardrobeItem | null>(null);

    const executeDelete = async () => {
        if (!confirmDelete) return;
        const item = confirmDelete;

        try {
            let deleted = false;
            let diag = "";
            if (state.saveDirectoryPath && window.electronAPI?.deleteFile && window.electronAPI?.joinPath) {
                const filePath = await window.electronAPI.joinPath(state.saveDirectoryPath, 'wardrobe', item.id);
                deleted = await window.electronAPI.deleteFile(filePath);
                diag += `IPC[${deleted}] (${filePath}). `;
            } else {
                diag += `IPC[Missing/NoPath]. `;
            }

            if (!deleted && state.saveDirectoryHandle) {
                const wardrobeHandle = await state.saveDirectoryHandle.getDirectoryHandle('wardrobe', { create: false });
                await wardrobeHandle.removeEntry(item.id);
                deleted = true;
                diag += `Web[Succeed]. `;
            }

            if (!deleted) throw new Error("Disk deletion failed! Trace: " + diag);

            const newItems = state.wardrobeItems.filter(i => i.id !== item.id);
            dispatch({ type: 'SET_WARDROBE_ITEMS', payload: newItems });
            if (selectedCostume?.id === item.id) setSelectedCostume(null);
            dispatch({ type: 'ADD_LOG', payload: { message: `Deleted costume: ${item.name} | ${diag}`, type: 'success' } });

        } catch (error: unknown) {
            dispatch({ type: 'ADD_LOG', payload: { message: `Delete failed: ${getErrorMessage(error)}`, type: 'error' } });
        } finally {
            setConfirmDelete(null);
        }
    };

    const handleTryOn = async () => {
        const billingMode = state.billingEntitlements.effectiveBillingMode;

        if (!selectedCharacter || !selectedCostume) {
            showToast("Select both a subject and a wardrobe item.");
            dispatch({ type: 'ADD_LOG', payload: { message: "Try-On requires a selected subject and wardrobe item.", type: 'error' } });
            return;
        }

        if (billingMode === "byok" && !state.apiKey) {
            showToast("API Key required for BYOK Virtual Try-On.");
            dispatch({ type: 'ADD_LOG', payload: { message: "API Key required for BYOK Virtual Try-On.", type: 'error' } });
            return;
        }
        if (!(await ensureAuthenticatedForGeneration({ billingMode, featureLabel: 'Wardrobe Virtual Try-On' }))) {
            return;
        }

        dispatch({
            type: 'ADD_LOG',
            payload: {
                message: `Starting Virtual Try-On (${billingMode.toUpperCase()})...`,
                type: 'info'
            }
        });

        const requestedTryOnMode = tryOnOutputModeRef.current;
        console.log('TRY-ON MODE:', requestedTryOnMode);

        // Reset output + editing state
        setRemoveTryOnBg(false);
        setTryOnMask(null);
        setProcessedTryOnUrl(null);
        setTryOnViews(null);
        setTryOnSheetFB(null);
        setTryOnSheetLR(null);
        setActiveTryOnView('front');

        purgeRestorationState();
        dispatch({ type: 'SET_PROCESSING', payload: true });

        const getEtaMs = () =>
            requestedTryOnMode === 'turnaround'
                ? (state.imageResolution === '4K' ? 90000 : state.imageResolution === '2K' ? 70000 : 45000)
                : (state.imageResolution === '4K' ? 45000 : state.imageResolution === '2K' ? 35000 : 25000);

        const etaMs = getEtaMs();

        let currentPercent = 5;
        dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: { percent: currentPercent, text: "Initiating Try-On Protocol" } });

        const updateMs = 1000;
        const increment = (updateMs / etaMs) * 100;

        const progressInterval = window.setInterval(() => {
            currentPercent += increment;
            if (currentPercent > 95) currentPercent = 95;

            let text = "Initiating Try-On Protocol";
            if (currentPercent > 20) text = requestedTryOnMode === 'turnaround' ? "Processing Front/Back Sheet..." : "Matching Costume Structure...";
            if (currentPercent > 45) text = requestedTryOnMode === 'turnaround' ? "Processing Left/Right Sheet..." : "Preserving Face Window...";
            if (currentPercent > 75) text = "Finalizing Output...";
            if (currentPercent >= 95) text = "Finalizing Output... (Still working, please wait)";

            dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: { percent: currentPercent, text } });
        }, updateMs);

        try {
            const subjectStyle = selectedCharacter.profile?.style || "Matching Style";
            const subjectStyleId = selectedCharacter.profile?.style || undefined;
            const tryOnIdentityLock = selectedCharacter.identityLock
                ? {
                    ...selectedCharacter.identityLock,
                    generatedSourceImageIndex: 1,
                    generatedSourceRole: "selected subject image is the visual/body/pose source only; uploaded biometric identity remains authoritative for this character_id",
                    appliesTo: "Wardrobe Studio virtual try-on generation, turnaround generation, refinement, preview, saved actor output, and export requests for this character"
                }
                : undefined;
            const tryOnStyleContract = buildStyleCategoryContract(subjectStyleId, {
                selectedStyleLabel: subjectStyle,
                sourceImagePolicy: "Subject and character-sheet references control identity, body, hairstyle, and grooming only; source-photo realism must not override the active character render category.",
                boardPresentationPolicy: "Wardrobe Studio output mode controls framing, turnaround panels, and fitting presentation only.",
                lightingPolicy: "Fitting and relighting must be interpreted within the active character render category.",
                appliesTo: "Wardrobe Studio virtual try-on, front render, side turnaround, front/back turnaround, saved actor preview, and recent thumbnail"
            });
            const tryOnStyleNegativePrompt = buildStyleNegativePrompt(subjectStyleId);
            const costumeName = selectedCostume.name;
            const costumeText = `${costumeName} ${tryOnNote || ''}`.toLowerCase();

            const subjectRefs = buildSubjectReferenceImages(selectedCharacter);
            const hasCharacterSheet = Boolean(tryOnCharacterSheet);
            const subjectImageRole = imageRoleName(1);
            const costumeImageIndex = 2;
            const costumeImageRole = imageRoleName(costumeImageIndex);
            const identityAnchorImageIndex = hasCharacterSheet ? 3 : undefined;
            const identityAnchorImageRole = identityAnchorImageIndex ? imageRoleName(identityAnchorImageIndex) : null;
            const costumeRef = {
                url: selectedCostume.url,
                label: `${costumeImageRole} - Exact Costume Reference / Wardrobe Identity Lock: wardrobe source only, not identity source and not visible scene content. Copy the visible costume design; same-category redesigns are forbidden.`
            };
            const identityAnchorRef = tryOnCharacterSheet && identityAnchorImageRole ? {
                url: tryOnCharacterSheet,
                label: buildTryOnIdentityAnchorReferenceLabel(identityAnchorImageRole, tryOnCharacterSheetSource)
            } : null;

            const isDesignRef = isDesignReferenceSelected(selectedCostume);

            // Keyword hint for extra enclosure emphasis (NOT a gate — all fidelity rules always apply)
            const isEnclosureCostume =
                /costume|mascot|onesie|full[- ]?body|character suit|banana|fruit|food|animal|creature|dinosaur|novelty|plush|foam suit|body suit|bodysuit|robe|shell|armor|helmet|mask|hood|visor|respirator|crown|headpiece|cloak|veil/i.test(costumeText);

            const enclosureEmphasis = isEnclosureCostume ? `
 ENCLOSURE EMPHASIS (keyword-detected wardrobe type)
 - This costume appears to include enclosure, head-coverage, or structural body-wrapping elements.
 - Pay extra attention to preserving face-window boundaries, helmet/hood closure, and full-body enclosure logic.
 - If the Costume Reference shows a dedicated face hole, face window, or visor, the subject's face must appear ONLY through that designed opening.
 - Adjust the subject internally to the costume rather than modifying the costume opening.
` : '';

            // ─── UNIVERSAL WEARABLE FIDELITY CONTRACT ────────────────────────
            // This contract applies to ALL wardrobe items — from open dresses to fully enclosed space suits.
            const WEARABLE_FIDELITY_CONTRACT = `
 WEARABLE FIDELITY CONTRACT (UNIVERSAL — ALWAYS ACTIVE)
 This contract governs the physical relationship between the wardrobe item and the subject.
 It applies equally to all costume types: helmets, masks, crowns, hoods, hats, veils, headwraps,
 goggles, armor, cloaks, respirators, mascot suits, formal gowns, casual clothing, and any wearable.

 CORE PRINCIPLE: Preserve the exact degree of openness or enclosure shown in the Costume Reference.
 - An open neckline stays open. A helmet stays enclosed. A crown stays seated. A hood stays fitted.
 - A mask keeps its exact face window. A cloak keeps its drape. A dress keeps its silhouette.
 - Do NOT increase or decrease the costume's coverage, openness, or enclosure beyond what the reference shows.

 COVERAGE & STRUCTURE PRESERVATION
 - Preserve the coverage area, layering, attachment points, intended fit behavior, and design identity shown in the Costume Reference.
 ${isEnclosureCostume
        ? '- For structured/enclosed costumes, preserve the external costume silhouette, bulk, enclosure, and structural geometry exactly.'
        : '- For ordinary apparel, preserve garment coverage, construction, design identity, and intended fit behavior while adapting the outer silhouette to the selected subject body. Do not copy a flat product/mannequin outline as the final worn silhouette.'}
 - Preserve all structural elements: padding, bulk, armor plates, seams, closures, zippers, straps, buckles, and hardware.
 - Do NOT simplify, flatten, or streamline complex costume geometry.
 - Do NOT convert an enclosed or structured costume into a body-contoured reinterpretation.
 - Do NOT invent extra appendages, extra sleeve shapes, duplicate glove logic, or extra foot logic.

 HEAD & FACE COVERAGE RULE (CRITICAL)
 - Analyze the Costume Reference image to determine how much of the head, face, hair, neck, and ears it covers.
 - Reproduce that exact coverage in the output. No more visible, no less visible.
 - If the costume fully encloses the head (helmet, mascot head, mask), the face appears ONLY through the designed face window or visor.
 - If the costume partially frames the face (hood, crown, headwrap, brimmed hat, veil), preserve the exact framing geometry.
 - If the costume leaves the head completely uncovered, the subject's hair and face appear naturally.
 - Do NOT widen, shrink, move, reshape, or redesign any face opening or head coverage boundary.
 - Do NOT expose additional hair, ears, forehead, jawline, or neck beyond what the costume physically allows.

 BODY EXPOSURE DISCIPLINE
 - Only show skin, hair, or body parts that are explicitly visible through the costume's openings in the reference.
 - Do NOT expose extra neck, chest, shoulders, wrists, ankles, hands, or feet unless the Costume Reference explicitly shows them.
 - If an area's coverage is ambiguous, keep it covered.

 ${enclosureEmphasis}
`;

            // ─── COSTUME RELIGHTING CONTRACT ─────────────────────────────────
            const COSTUME_RELIGHTING_CONTRACT = `
 COSTUME-DRIVEN RELIGHTING (PHYSICAL INTEGRATION)
 The subject's face and body must be lit as if they are physically inside or wearing the costume.

 - If the costume creates an enclosed or semi-enclosed space around the head (helmet, hood, mask, visor, brim),
   render believable occlusion shadows from the surrounding costume geometry onto the face.
 - Apply contact shadows where face, neck, and skin meet garment edges and openings.
 - Render material bounce and color reflection from nearby costume surfaces onto exposed skin.
 - Match the color temperature of skin lighting to the costume's environment — metallic surfaces reflect cool light,
   warm fabrics cast warm ambient light, dark interiors reduce overall face brightness.
 - Reduce "portrait beauty lighting" when the costume physically constrains or shapes the light reaching the face.
 - If the face is behind a visor or translucent material, render the appropriate tint, reflection, and diffusion.
 - For open or minimal costumes, standard studio lighting is appropriate — do not force enclosure lighting.
`;

            // ─── FITTING BLOCK (universal, with enclosure emphasis when detected) ──
            const fittingBlock = `
 GARMENT TRANSFER (STRICT FIDELITY)
 - Transfer the exact garment from the Costume Reference onto the subject.
 - Wardrobe must adapt to the same person; the person must not be replaced or redesigned to fit the wardrobe.
 - The costume may stretch or fit naturally to the person's body, but the designed structure must remain intact.
 ${isEnclosureCostume
        ? '- Preserve silhouette, proportions, coverage, padding, bulk, appendages, colors, materials, and visible construction details.'
        : '- Preserve colors, materials, embroidery, placket, collar, cuff, hem, coverage, proportions, and visible construction details. Refit the garment silhouette around the selected subject instead of copying the product-photo outline.'}
 - Fit the garment naturally only insofar as needed to look physically worn — do NOT redesign.
 - Do NOT convert structured or enclosed costumes into ordinary clothing or body-contoured reinterpretations.
 - If the costume has a dedicated face window, align the same person's face inside it without changing the costume opening or changing facial identity.
`;

            const onBodyGarmentIntegrationBlock = isEnclosureCostume ? `
 STRUCTURED COSTUME ON-BODY INTEGRATION
 Preserve the structured/enclosed costume design while making it physically worn by the selected subject.
 Add contact shadows, believable wearer volume, and material interaction where the costume touches the body.
 Do not flatten structural costume pieces into a pasted overlay.
` : `
 APPAREL ON-BODY RECONSTRUCTION RULE
 The Costume Reference is a garment design reference, not final pasted scene content.
 Reconstruct the shirt/clothing as a real worn garment on the selected subject's body.
 Preserve the design, embroidery, placket, collar, cuff, hem, color, material, and construction details, but do not copy the flat product/mannequin silhouette as the final body shape.
 Reconstructing the garment on-body must not change the garment category, sleeve length, cuff visibility, collar shape, button/placket structure, embroidery layout, hem shape, or coverage shown in the Costume Reference.
 The final shirt must wrap the neck, sit on the shoulders, follow the chest/ribcage volume, hang from the arms, and fall with gravity at the hem.
 Buttons, placket, embroidery, fabric grain, and front panels must subtly follow torso curvature and fabric drape instead of appearing printed on a flat board.
 Add believable contact shadows and occlusion at collar/neck, shoulder seams, underarms, sleeve folds, cuffs/wrists, side seams, and hem/waist.
 For Relaxed Fit and Soft / Draped settings, show comfortable ease, soft folds, natural sleeve compression, gentle fabric pull from the shoulders/chest, and a hem that falls over the lower torso rather than a stiff pasted rectangle.
 The subject remains a person wearing a garment; the garment must not turn the body into a product display mannequin.
`;

            const wardrobeDesignFidelityBlock = `
 WARDROBE DESIGN IDENTITY LOCK
 The selected wardrobe design must remain identical to the Costume Reference.
 Preserve garment architecture exactly: garment category, sleeve length, cuff style, collar shape, neckline, placket, closure type, button count/spacing where visible, panel layout, seam placement, hem shape, pockets, trim, embroidery, logo/ornament placement, motif count/density, color, material, transparency/opacity, and coverage.
 Refit only the worn drape, fabric tension, body contact, fold behavior, and silhouette response around the selected subject. Do not redesign the clothing.

 SLEEVE / CUFF / COVERAGE LOCK
 Sleeve length and cuff design are hard design features.
 If the Costume Reference shows long sleeves ending at the wrists, the output must keep long sleeves ending at the wrists with the same cuffs.
 If the Costume Reference shows short sleeves, sleeveless construction, rolled sleeves, gloves, or exposed forearms, preserve that exact coverage state.
 Do not shorten, roll up, cut off, crop, remove, or reinterpret sleeves to satisfy body fit, framing, or composition.
 Do not expose forearms, wrists, elbows, shoulders, chest, or neck areas that the selected wardrobe covers in the reference.

 EMBROIDERY / TRIM / PLACKET LOCK
 Preserve embroidery and trim as the same design, same side placement, same vertical run, same left/right symmetry or asymmetry, same relationship to the placket/collar/cuffs/hem, and same approximate scale.
 The placket and buttons must remain centered and structurally aligned with the shirt front.
 Design details may follow fabric curvature and folds, but they must not be deleted, moved to new garment zones, multiplied incorrectly, simplified away, or converted into generic decoration.

 DESIGN-FIT PRIORITY RULE
 Body-aware fitting, Garment Fit mode, Fabric Behavior mode, and Fitting Notes must improve how the same selected wardrobe is worn.
 They must not change sleeve length, cuff visibility, collar design, placket shape, button structure, embroidery layout, garment category, color, material, or coverage.
 If natural fit and exact design appear to conflict, preserve the selected wardrobe design and solve fit through drape, folds, ease, tension, and contact shadows.
`;

            const accessoryFootwearComplianceBlock = `
 VIRTUAL TRY-ON ACCESSORY AND FOOTWEAR COMPLIANCE RULES
 - Apply the selected wardrobe cleanly and coherently to the subject.
 - Do not duplicate accessories or outfit items.
 - Any single handheld item such as a clutch, purse, handbag, bag, case, briefcase, wallet, handheld prop, book, phone, or portfolio must appear only once on the subject in each view.
 - Do not place a single-item accessory in both hands. If the wardrobe includes one clutch, purse, handbag, case, briefcase, or prop, render one total item, not one per hand.
 - Singular adornments such as a brooch, pendant, corsage, medal, badge, or statement accessory should remain singular unless the reference clearly shows a matched pair.
 - Only naturally paired items may appear as pairs: shoes, boots, earrings, gloves, socks, stockings, cuffs, or symmetrical paired items explicitly intended as a pair.
 - Do not invent unnecessary extra accessories. Add a completion item only when it is logically needed and does not conflict with the wardrobe reference.
 - Keep accessory usage realistic, intentional, and non-redundant.
 - Ensure the outfit appears complete, polished, believable, and production-ready.

 FOOTWEAR COMPLETION
 - If feet, ankles, lower legs, or full body are visible, include complete footwear or foot coverings appropriate to the wardrobe unless the concept is explicitly intended to be barefoot.
 - Do not leave the subject barefoot for businesswear, formalwear, tailored looks, blazers, structured jacket outfits, uniforms, historical clothing, fantasy armor, sci-fi structured clothing, polished costume looks, or any outfit that visually implies complete styling.
 - Barefoot is allowed only for clearly appropriate cases such as swimwear, sleepwear, beachwear, spa looks, dance/yoga concepts, culturally specific barefoot styling, or an explicit barefoot instruction.
 - If the Costume Reference clearly shows shoes, boots, sandals, heels, slippers, armored boots, shoe covers, or foot coverings, copy that footwear exactly.
 - If the Costume Reference does not clearly show footwear, infer appropriate footwear from outfit formality, styling category, time period, silhouette, and material language.
 - Do not leave lower-body styling unfinished. Footwear must feel like part of the same wardrobe system.

 ACCESSORY OCCLUSION / VISIBILITY
 - Accessories must obey physical visibility from each camera angle.
 - If a necklace, chain, pendant, choker, tie, scarf, lapel accessory, brooch, strap, bag, or shoulder-hung item is tucked inside, hidden beneath, or occluded by a garment in one view, keep it physically consistent in every other view.
 - A necklace tucked inside a jacket or shirt opening in the front view must not become an exposed necklace across the back of the neck in the back view unless that rear exposure would be physically visible from the resolved garment layers.
 - Back views may show only accessories that would actually be visible from the back of the same outfit.
`;

            const headwearOrientationBlock = `
 HEADWEAR ORIENTATION LOCK (3D GEOMETRY)
 - Treat helmets, crowns, horns, crests, plumes, mohawks, brims, visors, and ridge attachments as fixed 3D objects attached to the head.
 - Preserve the exact 3D orientation from the Costume Reference. Do not rotate, flip, or redraw the crest/plume to make a prettier silhouette for a given camera angle.
 - The attachment plane must rotate with the helmet, head, and body across views.
 - If the Costume Reference shows a front-to-back / mohawk / sagittal crest: FRONT and BACK panels show a narrow centered edge or thin stacked crest profile; LEFT and RIGHT profile panels show the broad full fan or length.
 - Do NOT show a broad left-to-right red fan across the forehead or back of helmet in FRONT/BACK panels when the source crest is front-to-back.
 - If the Costume Reference clearly shows a left-to-right / transverse crest: FRONT and BACK panels show the broad span; LEFT and RIGHT panels show a narrow edge.
 - Back view must be the actual rear of the same helmet attachment, not a new front-facing crest pasted onto the rear.
 - If a generic historical costume prior conflicts with the Costume Reference, the Costume Reference wins.
`;

            const designAssemblyBlock = isDesignRef ? `
 DESIGN REFERENCE LOCK
 - Reconstruct only what is explicitly visible in the reference.
 - Preserve visible paneling, seam placement, closures, pockets, color blocking, silhouette, visible coverage, and visible openings exactly.
 - Do NOT infer hidden anatomy exposure, hidden openings, hidden closures, hidden glove logic, hidden footwear logic, or concealed structural details unless clearly shown.
 - If a structural detail is unknown, keep it closed, neutral, and non-revealing.
` : `
 COSTUME REFERENCE LOCK
 - Copy the Costume Reference exactly.
 - Preserve the exact colors, textures, fabrics, silhouette, visible openings, appendages, and visible construction.
 - Do NOT hallucinate new colors, new materials, alternate costume logic, or extra limbs.
`;

            const sideViewLockBlock = `
 SIDE-VIEW LOCK
 - The Costume Reference is the absolute source of truth for the garment, headwear, and worn accessories.
 - Side views must be rotations of the same physical garment in 3D space, not reinterpretations or redesigns.
 - The entire full body must rotate to a true 90-degree side profile: head, neck, shoulders, torso, pelvis, arms, legs, feet, armor/clothing, and accessories all share the same side-facing yaw.
 - Do NOT keep the body/front armor facing the camera while only turning the head.
 - Do NOT invent new openings, new exposed anatomy, new glove separation, new ankle shaping, new footwear logic, or new costume structure.
 - Do NOT reinterpret the original Costume Reference.
 - If a side detail is not visible in the Costume Reference, keep it structurally consistent and non-revealing.
`;

            const trueProfileBodyBlock = `
 TRUE SIDE PROFILE BODY CONTRACT (NON-NEGOTIABLE)
 - This is a technical orthographic costume turnaround using the selected output framing, not a portrait pose and not a fashion 3/4 pose.
 - Each panel must show the subject standing upright in exact 90-degree side profile within the selected crop.
 - LEFT PANEL: show one true side profile facing screen-right toward the center divider; nose, chest side plane, pelvis, knees/toes if visible, and body centerline all point screen-right.
 - RIGHT PANEL: show the opposite true side profile facing screen-left toward the center divider; nose, chest side plane, pelvis, knees/toes if visible, and body centerline all point screen-left.
 - Do not follow any opposite-facing interpretation for LR: the two LR bodies face toward each other across the divider.
 - Body-profile test: only one eye, one ear, one shoulder contour, one arm silhouette, and one side edge of the torso/armor should be visible per panel.
 - Visible torso and pelvis must be narrow side silhouettes. Front-facing chest plates, symmetrical shoulders, both arms equally visible, both knees equally visible, or front skirt/apron spread are invalid.
 - If feet are visible, they must be side-on: toes point screen-right in the left panel and screen-left in the right panel. Do not show front-facing feet.
 - Helmet, hair, plume, headwear, shoulder armor, torso armor, skirt, sleeves, visible legwear, and visible footwear must rotate with the body as one rigid model.
 - The head must stay naturally aligned with the torso. Do not twist the head toward camera to preserve face visibility.
 - Camera is level and centered for the selected crop. Preserve the selected framing consistently in both side panels.
 - Forbidden substitutions: 3/4 view, front-facing body with side-looking head, head-only left/right study, crop that ignores the selected framing, over-the-shoulder pose, contrapposto turn, repeated front view, repeated back view.
`;

            const lowerBodyIntegrityBlock = `
 LOWER BODY INTEGRITY LOCK
 If hips, pelvis, legs, ankles, feet, or shoes are visible under the selected framing, they must remain a coherent human lower body.
 Preserve a natural pelvis-to-thigh-to-knee-to-calf-to-ankle-to-foot chain with believable proportions, weight-bearing stance, and ground contact.
 Pants must drape over two real legs, not a single fused tube, warped column, melted shape, or mannequin stand.
 Shoes must be complete, paired, grounded, correctly scaled, and aligned with the same body orientation as the legs.
 Do not generate fused legs, missing legs, extra legs, duplicated feet, mismatched shoe pairs, broken ankles, warped knees, floating shoes, collapsed calves, one-leg silhouettes, or pants that erase the body structure underneath.

 SIDE TURNAROUND LOWER-BODY RULE
 In left/right profile views, the near and far leg may overlap naturally, but the silhouette must still read as a real standing person with coherent hips, knees, ankles, and a complete pair of shoes.
 The legs, pants, and shoes must rotate with the pelvis and torso into the same 90-degree side profile.
 Do not allow one panel to have a normal lower body while the other panel has a malformed, fused, missing, or mismatched lower body.
`;
            const lrTurnaroundViewDefinitionBlock = buildTurnaroundViewDefinitionContract('LEFT_RIGHT');
            const fbTurnaroundViewDefinitionBlock = buildTurnaroundViewDefinitionContract('FRONT_BACK');
            const tryOnLrPoseCoherenceBlock = buildTurnaroundPoseCoherenceContract(
                getTurnaroundPanelOrientations('LEFT_RIGHT')
            );
            const tryOnFbPoseCoherenceBlock = buildTurnaroundPoseCoherenceContract(
                getTurnaroundPanelOrientations('FRONT_BACK')
            );

            const userFittingNotes = tryOnNote.trim();
            const effectiveTryOnNote = userFittingNotes || "Transfer the garment exactly and preserve the visible design.";
            const resolvedLookSpec = buildResolvedLookSpec(selectedCostume, effectiveTryOnNote);
            const resolvedLookContractBlock = buildResolvedLookContractBlock(
                resolvedLookSpec,
                hasCharacterSheet,
                requestedTryOnMode
            );
            const bodyNoteGuidance = inferFittingNoteBodyGuidance(userFittingNotes);
            const bodyFitProfile = inferBodyFitProfile(selectedCharacter, userFittingNotes, hasCharacterSheet);
            const bodyAwareFittingBlock = buildBodyAwareFittingBlock(
                bodyFitProfile,
                bodyNoteGuidance,
                userFittingNotes,
                tryOnGarmentFit,
                tryOnFabricBehavior,
                hasCharacterSheet
            );
            const outputFramingBlock = buildOutputFramingBlock(LAUNCH_OUTPUT_FRAMING);
            const turnaroundFramingDescription = describeTurnaroundFraming(LAUNCH_OUTPUT_FRAMING);
            const tryOnNegativeConstraintsBlock = `
 TRY-ON NEGATIVE CONSTRAINTS
 Avoid pasted-on clothing, flat clothing overlay, perfect mannequin drape, generic torso template, fabric ignoring body structure, sleeves floating or collapsing unnaturally, hemline stiffness, unrealistic chest flattening, unrealistic female bust suppression or distortion, unrealistic male torso narrowing/widening, mismatched seam placement, and clothing that ignores posture.
 When Torso framing is selected, also avoid cropped sleeves, missing cuffs, missing shirt hem, missing hips, awkward waist cutoff, floating torso crop, hands cut off unnaturally, and garment bottom cropped out.
 Avoid invented stubble, invented beard shadow, invented goatee, invented mustache, aging caused by added facial hair, darker jawline texture that reads as beard growth, and any clean-shaven subject becoming not clean-shaven.
 When fitting notes request muscular build, wide chest, broad shoulders, or similar upper-body direction, avoid narrow generic torso, flat chest, weak shoulder span, body shape unchanged despite fitting notes, and a straight hanging shirt with no upper-body structure underneath.
 Avoid pasted shirt front, product-photo overlay, flat product silhouette, mannequin-shirt body, floating shoulder seams, collar not wrapping the neck, placket printed flat, embroidery printed on a board, missing underarm occlusion, missing cuff contact, missing hem weight, and fabric that ignores the selected Relaxed Fit / Soft Draped settings.
 Avoid changed sleeve length, short sleeves when the reference is long-sleeved, missing cuffs, rolled sleeves unless shown, exposed forearms unless shown, changed collar, changed placket, changed button layout, changed embroidery placement, missing embroidery, changed hem, changed coverage, and redesigned garment category.
 Avoid fused legs, one-leg lower body, melted pants column, mannequin-stand legs, broken knee anatomy, warped calves, missing ankles, floating shoes, duplicated shoes, mismatched shoes, lower body that does not align with the torso, and one turnaround panel having malformed legs while the other is normal.
 Avoid ${buildPoseCoherenceNegativeTokens()}.
`;
            const wardrobeReferenceUsageBlock = `
 WARDROBE REFERENCE USAGE RULE
 Use the selected wardrobe/sketch/costume image only as a garment reference for fit, material, silhouette, trim, embroidery, and construction details.
 Do not reproduce the wardrobe reference image itself inside the final try-on scene.
 Do not generate floating garment panels, duplicate shirt cutouts, side product boards, or large cropped reference inserts unless a dedicated reference-board mode explicitly requests them.
 Current mode is fittingMirror / standard turnaround only; no product-board or wardrobe-board mode is active.
 For ordinary apparel references such as shirts, jackets, blouses, dresses, pants, and tops, preserve the design and construction details while rebuilding the garment as worn clothing on the selected subject. Do not preserve a flat product-photo silhouette if it conflicts with natural body fit.

 DETAIL PRESERVATION RULE
 Preserve garment details such as embroidery, trim, placket shape, collar shape, sleeve length, cuff style, coverage, button layout, hem shape, fit, and fabric behavior.
 Preserve the clothing design itself, not the literal source image framing.
`;
            const frontTryOnCompositionBlock = `
 FRONT TRY-ON COMPOSITION RULE
 Render a single dressed subject in a clean fitting-mirror presentation.
 Show only the subject wearing the selected wardrobe.
 Do not add extra garment cutouts, duplicated costume panels, product cards, floating insets, or reference-image reproductions.
`;
            const turnaroundCompositionBlock = `
 TURNAROUND COMPOSITION RULE
 Render only the requested turnaround views of the dressed subject.
 Do not insert large floating garment reference crops.
 If garment detail insets are ever supported later, they must be explicitly requested by a separate board mode, not standard turnaround.
`;
            const tryOnCompositionNegativeConstraintsBlock = `
 TRY-ON COMPOSITION NEGATIVE CONSTRAINTS
 Avoid floating garment cutouts, duplicated wardrobe panels, reference board layout, product display inserts, side-by-side garment crops, clothing source image reproduction, extra white shirt panels beside the subject, and collage-like composition in fitting mirror mode.
`;
            const identityAnchorUsageRuleBlock = `
 IDENTITY ANCHOR USAGE RULE
 If a Character Sheet / Identity Anchor is loaded, use it only as hidden reference guidance for face likeness, head shape, body silhouette, wardrobe continuity, and turnaround consistency.
 Do not reproduce the character sheet itself in the final try-on result.
 Do not create a reference board, biometric sheet, multi-panel layout, labeled study sheet, or forensic layout unless a separate board mode explicitly requests it.
 If characterSheetIdentityAnchor is provided, use it to preserve both identity and body silhouette consistency across turnaround outputs without changing the final presentation format.
`;
            const standardTryOnPresentationRuleBlock = `
 STANDARD TRY-ON PRESENTATION RULE
 Virtual Try-On Room outputs should default to a single polished image of the dressed subject.
 The output should not become a reference sheet, contact sheet, identity board, or multi-panel study layout.
 For standard try-on generation: one subject, one clean composition, one selected framing, one presentation image.
 FRONT mode = one clean single-person image.
 TURNAROUND mode = clean turnaround presentation of the dressed subject only.
 Neither mode should become a biometric sheet or reference board.
`;
            const tryOnPresentationNegativeConstraintsBlock = `
 TRY-ON PRESENTATION NEGATIVE CONSTRAINTS
 Avoid reference sheet layout, biometric board layout, multi-panel study board, labeled forensic layout, front/side/up/down sheet composition, duplicate subject panels, contact sheet presentation, character design board formatting, and visible identity anchor reproduction.
`;

            const sourceAppearanceContinuityBlock = `
 SOURCE APPEARANCE CONTINUITY LOCK (CRITICAL)
 - Preserve the complete worn appearance package established by the Subject Reference, Costume Reference, and any canonical turnaround sheet available in this prompt.
 - Any element that is worn, attached, styled, or visibly part of the look must remain present and consistent across all generated views unless explicitly instructed otherwise.
 - This includes hairstyle state, headwear, jewelry, eyewear, veils, hoods, scarves, gloves, sleeves, footwear, attached adornments, and any other worn or source-established appearance elements.
 - Do NOT remove, simplify, restyle, reinterpret, swap, or silently omit worn elements in side, back, or profile views.
 - Do NOT trade off one appearance element to preserve another.
 - If multiple appearance elements coexist, preserve all of them together.
 - All turnaround views must be rotations of the same exact worn look, not creative reinterpretations.
`;

            const hairConsistencyBlock = `
 GROOMING LOCK RULE
 Preserve the exact grooming state of the selected subject/reference image.
 Do not add, remove, or reinterpret facial hair unless explicitly requested.
 Preserve clean-shaven state if clean-shaven, stubble only if stubble exists, mustache only if mustache exists, beard/goatee only if beard/goatee exists, facial hair density, facial hair color, gray distribution, trim length, and sideburn connection.
 If the subject is clean-shaven, remain clean-shaven in all outputs.

 HAIR CONSISTENCY RULE
 The subject's hairstyle must remain exactly consistent with the selected subject/reference image.
 Do not restyle, re-cut, re-shape, thicken, thin, curl, straighten, recolor, or otherwise reinterpret the hair.
 Preserve hairline, part direction / part placement, hair length, hair volume, hair texture, curl / wave pattern, temple recession / hair recession if present, sideburn shape, hair color, gray distribution, grooming finish, and silhouette of the hair.
 The subject must read as the same exact person with the same exact hairstyle in every framing and output mode.

 FRAMING DOES NOT CHANGE GROOMING RULE
 Output framing controls only crop and composition.
 It must not change hairstyle, facial hair, grooming, age impression, or facial identity.
 Bust, Torso, and Full Body must all depict the same exact subject with the same exact grooming package.

 SOURCE HAIR AUTHORITY RULE
 The selected subject image is the authority for hairstyle and grooming.
 If a character sheet or identity anchor is loaded, it may reinforce identity, but it must not override the hairstyle from the selected subject unless the subject itself already reflects that hair.
 If likeness and hair styling conflict, the selected subject/reference hairstyle wins.

 FACIAL HAIR CONSISTENCY RULE
 Facial hair must also remain consistent across all outputs.
 Preserve beard / stubble presence or absence, mustache shape, goatee shape, sideburn connection, density, color, gray distribution, and trim length.
 Do not add or remove facial hair unless explicitly requested.

 FACIAL HAIR NEGATIVE CONSTRAINTS
 Avoid invented stubble, invented beard shadow, invented goatee, invented mustache, aging caused by added facial hair, and darker jawline texture that reads as beard growth.

 GROOMING NEGATIVE CONSTRAINTS
 Avoid hairstyle drift, new haircut, different hair texture, fuller or flatter hair than the reference, different hairline, moved part, changed gray pattern, restyled curls/waves, different temple recession, altered sideburns, added or removed facial hair, and age changes caused by hair reinterpretation.

 HAIR STATE LOCK
 - If hair is worn down in the selected subject/reference image, it must remain down in all output modes unless explicitly requested otherwise.
 - Do NOT convert loose hair into a bun, ponytail, braid, pinned style, updo, or tied-back style unless explicitly shown in the selected subject/reference image.
 - Hair continuity must coexist with all worn accessories and headwear.
 - If the costume covers or constrains hair (helmet, hood, headwrap), only the hair visible through costume openings should be shown, and visible hair must still match the selected subject/reference image.
`;

            const identityAnchorBlock = tryOnCharacterSheet ? `
 PRIMARY IDENTITY ANCHOR LOCK (${tryOnCharacterSheetSource === 'selected-subject' ? 'MANUAL SELECTED SUBJECT' : 'CHARACTER SHEET'})
 - ${tryOnCharacterSheetSource === 'selected-subject'
        ? `${identityAnchorImageRole} is the manually loaded selected-subject identity anchor. It reinforces the same active subject from ${subjectImageRole}: identity, hair, grooming, body silhouette, proportions, and source render style.`
        : `${identityAnchorImageRole} is a face/head identity reference only. Use this to preserve the same person's facial identity and likeness.`}
 - ${tryOnCharacterSheetSource === 'selected-subject'
        ? `Do not treat ${identityAnchorImageRole} as a separate person, loose style reference, or optional hint. It is the same selected subject lock as ${subjectImageRole}.`
        : `Do not copy ${identityAnchorImageRole}'s layout, labels, sheet format, annotations, panels, typography, headshot grid, dividers, or callout text.`}
 - ${identityAnchorImageRole} is the highest identity authority for the person's face, head, skin tone, visible neck identity, and overall likeness in every generated view.
 - ${subjectImageRole} remains the highest authority for hairstyle, hairline presentation, facial hair, and grooming package. Do not use the identity anchor to restyle the selected subject's hair or grooming.
 - ${subjectImageRole} is the selected subject for current body/proportion/source style continuity. If it conflicts with ${identityAnchorImageRole}, the identity anchor wins for face/head identity only; the selected subject wins for body proportions, silhouette, hairstyle, facial hair, and grooming.
 - Treat the identity anchor as a hard biometric identity reference, not style inspiration, not a loose mood reference, and not a target composition.
 - Preserve the exact same person shown in the identity anchor. Do not invent a new face, substitute a different person, or convert the subject into a generic fashion-model face.
 - Maintain facial identity, facial structure, skin tone, age range, ethnicity presentation, head shape, nose/eyes/lips/jaw relationships, and overall likeness. Maintain hairstyle, hairline presentation, facial hair, and grooming from the selected subject/reference image.
 - Build one consistent 3D head model from all visible face panels: skull shape, forehead, hairline, brow ridge, eye spacing and depth, eye shape, nose bridge, nose slope, nose tip, nose projection, nostrils, cheekbones, nasolabial folds, mouth width, lip shape, jaw angle, chin shape, ears, ear placement, neck, skin marks, age, and asymmetry. Preserve facial hair and grooming from the selected subject/reference image only.
 - ${tryOnCharacterSheetSource === 'selected-subject'
        ? `FRONT, BACK, LEFT, and RIGHT outputs must preserve the same visible subject from ${subjectImageRole} and ${identityAnchorImageRole}; infer unseen angles conservatively from that same person without changing hairstyle, face, head shape, body type, or source style.`
        : `FRONT output must match the Character Sheet's front face. LEFT and RIGHT profile outputs must match the Character Sheet's side/profile facial geometry when visible.`}
 - ${tryOnCharacterSheetSource === 'selected-subject'
        ? `If the selected-subject anchor lacks a full side/profile view, rotate the same person conservatively. Do NOT invent a prettier profile, new hair, new face, or new body.`
        : `If a side/profile face is not fully visible in the Character Sheet, infer it conservatively from the same skull, nose, jaw, chin, mouth, brow, and ear geometry. Do NOT beautify, idealize, or replace it.`}
 - Identity accuracy applies inside helmets, masks, and face openings: visible nose, mouth, chin, cheek, brow, eye, ear, jaw, and neck must match the identity anchor exactly within the costume limits.
 - Do NOT average the identity anchor with the Subject Reference, Costume Reference, generated LR/FB sheet, or a generic costume wearer. If references conflict, the identity anchor wins for face/head identity, while the selected subject/reference image wins for body, hair, and grooming.
 - Apply the wardrobe to this same person. The wardrobe may change; the person must not change.
 - For turnaround or alternate views, render the same person consistently from the required angle.
 - Camera angle, body angle, lighting, and costume can change. Biometric face/head geometry cannot change.
 - FORBIDDEN: generic male face, generic fashion model face, different person, identity drift, facial substitution, ethnicity drift, age drift, idealized face, beautified profile, aged or rejuvenated face, hairstyle substitution unless explicitly requested, different nose projection, different jawline, different chin, different brow, different eye spacing, different mouth, wrong ear placement, invented profile, face drift between panels.
` : `
 SUBJECT IDENTITY LOCK
 - ${subjectImageRole} is the primary identity reference.
 - Preserve the exact visible identity from the Subject Reference. Same person, no generic replacement, no facial substitution, no ethnicity drift, no age change, no beautification.
 - Preserve the exact hairstyle, hairline presentation, facial hair, and grooming from the Subject Reference.
 - Camera angle, body angle, lighting, and costume can change. Face/head geometry should not be redesigned.
`;

            let brandingInstruction = "";
            const baseImages: { url: string; label: string }[] = [
                ...subjectRefs,
                costumeRef,
                ...(identityAnchorRef ? [identityAnchorRef] : [])
            ];
            let brandingImageIndex: number | undefined;

            if (brandingLogo) {
                brandingImageIndex = baseImages.length + 1;
                baseImages.push({ url: brandingLogo, label: `${imageRoleName(brandingImageIndex)} - Branding Logo` });
                brandingInstruction = `
 BRANDING & IDENTITY (OVERRIDE)
 - Place the Branding Logo onto the clothing.
 - EXACT PLACEMENT: ${logoPosition}.
 - CRITICAL: Preserve the exact color and design of the logo. Do NOT change the logo's color.
 - Integrate the logo realistically with fabric folds and lighting without distorting its color.
 - If the clothing already has a logo at that position, replace it perfectly.
 `;
            }

            const baseImageRoleBlock = buildTryOnReferenceRoleBlock({
                costumeIndex: costumeImageIndex,
                identityAnchorIndex: identityAnchorImageIndex,
                brandingIndex: brandingImageIndex
            });

            const identityPriorityBlock = tryOnCharacterSheet ? `
 ABSOLUTE IDENTITY PRIORITY ORDER (HARD)
 1. ${subjectImageRole} Selected Subject / try-on target: primary physical person, body/proportions, pose continuity, source style, hairstyle, facial hair, and grooming authority.
 2. ${identityAnchorImageRole} Character Sheet Identity Anchor: face/head identity and likeness reinforcement only.
 3. ${costumeImageRole} Costume Reference: wardrobe source only.
 4. Styling notes, lighting, and branding.
 Identity strength does not grant layout authority. Never copy the Character Sheet format into the output.
 Wardrobe must adapt to the same person. The person must not be replaced to fit the wardrobe.
 If any wardrobe/style instruction conflicts with identity, preserve identity first while maintaining physically plausible garment coverage.
 If the Character Sheet and Selected Subject conflict on body, hairstyle, or grooming, preserve the Selected Subject body, hairstyle, and grooming while preserving Character Sheet face/head identity.
` : `
 ABSOLUTE IDENTITY PRIORITY ORDER
 1. ${subjectImageRole} Selected Subject identity, likeness, hairstyle, facial hair, and grooming.
 2. ${costumeImageRole} Costume Reference as wardrobe source only.
 3. Styling notes, lighting, and branding.
 Wardrobe must adapt to the selected subject. Do not replace the person with a different wearer.
`;

            const tryOnPriorityOrderBlock = `
 TRY-ON PRIORITY ORDER
 1. Subject identity.
 2. Hair and facial-hair/grooming preservation.
 3. Exact selected wardrobe design preservation.
 4. Fitting Notes body directives.
 5. Garment Fit mode.
 6. Fabric Behavior mode.
 7. Wardrobe detail preservation.
 8. Full Body framing / crop.
 9. Background simplicity.
 Framing, styling, crop, body notes, garment fit, and fabric behavior must never override the grooming lock or exact selected wardrobe design.
 Fitting-note body directives must be honored by refitting the same wardrobe design, not by changing garment architecture or coverage.
`;

            const sourceFidelityRulesBlock = `
 SOURCE FIDELITY RULES
 - Use ${subjectImageRole} as the selected subject and physical person being dressed.
 - ${identityAnchorImageRole ? `Use ${identityAnchorImageRole} only to reinforce face/head identity and likeness.` : 'No separate Character Sheet Identity Anchor is loaded; preserve identity from the selected subject.'}
 - Use ${costumeImageRole} as the exact selected wardrobe authority.
 - View mode is a camera/view instruction only. It must not override the selected subject, identity anchor, wardrobe source, body proportions, costume geometry, or style family.
 - Do not replace the selected subject with a different actor.
 - Do not redesign the selected wardrobe or create a new costume inspired by it; apply the selected wardrobe.
 - Preserve the costume's silhouette, color palette, materials, panels, lights, boots, gloves, helmet/collar structure, accessories, and major design features.
 - Preserve the subject's head/face identity consistently across every generated view.
`;

            const frontSourceImageLockBlock = buildWardrobeTryOnSourceLockBlock({
                subjectImageRole,
                costumeImageRole,
                identityAnchorImageRole,
                identityAnchorSource: tryOnCharacterSheetSource,
                mode: 'front'
            });

            const turnaroundSourceImageLockBlock = buildWardrobeTryOnSourceLockBlock({
                subjectImageRole,
                costumeImageRole,
                identityAnchorImageRole,
                identityAnchorSource: tryOnCharacterSheetSource,
                mode: 'turnaround'
            });

            const identityAnchorFormatFirewall = tryOnCharacterSheet ? `
 CHARACTER SHEET FORMAT FIREWALL (NON-NEGOTIABLE)
 - ${identityAnchorImageRole} is for identity only. It is not the target output format.
 - Do not output a character sheet.
 - Do not reproduce the reference sheet format.
 - Do not include multiple headshot panels.
 - Do not include labels, callouts, dividers, annotation text, typography, or view names from the identity anchor.
 - Do not copy the layout of the character sheet.
 - Do not include labels like FRONT VIEW, LEFT PROFILE VIEW, RIGHT PROFILE VIEW, BACK VIEW, headshot, profile, or any reference-sheet title.
 - Generate a clean virtual try-on render unless Turnaround is selected.
` : '';

            // FRONT ONLY
            if (requestedTryOnMode === 'front') {
                console.log('Running FRONT branch');

                const res = await GeminiService.generateImage(
                    `Perform a professional virtual try-on and fashion fitting.

 ${baseImageRoleBlock}
 ${identityPriorityBlock}
 ${tryOnPriorityOrderBlock}
 ${sourceFidelityRulesBlock}
 ${frontSourceImageLockBlock}
 ${identityAnchorFormatFirewall}
 ${resolvedLookContractBlock}
 ${identityAnchorUsageRuleBlock}
 ${standardTryOnPresentationRuleBlock}
 ${wardrobeReferenceUsageBlock}
 ${wardrobeDesignFidelityBlock}
 ${outputFramingBlock}
 ${bodyAwareFittingBlock}
 ${onBodyGarmentIntegrationBlock}
 ${lowerBodyIntegrityBlock}
 ${tryOnStyleContract}

 === PRIORITY 3: WARDROBE PHYSICAL STRUCTURE ===

 COSTUME (HARD TRANSFER AUTHORITY)
 - The Costume Reference (${costumeName}) is the absolute authority for the outfit.
 - Copy the garment design exactly as shown.
 ${isEnclosureCostume
        ? '- Preserve the exact visible silhouette, enclosure, coverage, face-window placement, colors, textures, materials, and construction.'
        : '- Preserve the shirt/clothing design, coverage, collar, cuffs, placket, embroidery, colors, textures, materials, and construction while refitting the garment as real clothing on the selected subject.'}
 ${isEnclosureCostume
        ? '- Do NOT reinterpret it into a more wearable, more fitted, more anatomical, or more revealing version.'
        : '- Do NOT redesign the clothing details, but do reconstruct the garment around the subject body so it does not look like a flat product overlay.'}
 - IGNORE filename text if it conflicts with the image.
 ${designAssemblyBlock}
 ${frontTryOnCompositionBlock}

 ${WEARABLE_FIDELITY_CONTRACT}

 ${fittingBlock}
 ${headwearOrientationBlock}
 ${accessoryFootwearComplianceBlock}
 - Remove existing clothing/accessories from the subject before fitting the costume.

 COLOR & MATERIAL LOCK
 - Preserve the exact costume colors from the Costume Reference.
 - Do NOT shift, mute, brighten, darken, replace, or reinterpret the costume colors.
 - Preserve the exact visible material finish and fabric appearance.

 FOOTWEAR (CONTEXTUAL MATCH)
 - If the Costume Reference explicitly shows shoes, feet, or foot coverings, copy them exactly.
 - If footwear is not visible in the Costume Reference and the result shows the lower body, infer footwear appropriate to the wardrobe's formality, period, material language, and silhouette.
 - Do NOT expose bare feet unless the wardrobe concept is explicitly barefoot, beachwear, swimwear, sleepwear, spa, dance/yoga, or otherwise clearly barefoot-appropriate.

 === PRIORITY 4: COSTUME-DRIVEN RELIGHTING ===

 ${COSTUME_RELIGHTING_CONTRACT}

 === IDENTITY ENFORCEMENT DURING FITTING ===

 SUBJECT (HARD IDENTITY LOCK - COSTUME MAY ONLY LIMIT VISIBILITY)
 - Use the named identity reference image(s) to preserve the exact facial identity and likeness of the person.
 - Same face, same person, no morphing, no age change.
 ${identityAnchorBlock}
 ${hairConsistencyBlock}
 - CRITICAL: Identity must be preserved WITHIN the physical limits imposed by the costume.
 - If the costume covers, encloses, or restricts visibility of any body part, identity preservation must NOT cause
   the costume to open, remove, simplify, or expose areas the Costume Reference does not physically allow.
 - The wardrobe adapts to the same person. Do NOT change face, head, skin tone, age, ethnicity presentation, body build, or likeness to fit the garment.

 === PRIORITY 5: STYLE & IMAGE QUALITY ===

 STYLE MATCH
 - The final rendering style should match the Subject Reference style: ${subjectStyle}.
 - Source image controls identity. Character Render Style controls visual category. Wardrobe Studio fitting controls clothing only. Lighting adapts to the selected render style.
 - Do not convert the character into a different visual category because of realistic lighting, costume detail, or source-photo realism.
 ${tryOnStyleContract}
 - If the Subject Reference is a realistic photograph, render the fitted costume as realistic material with realistic texture and lighting.
 - Style instructions must not alter identity, face structure, skin tone, age, ethnicity presentation, hairline, or likeness.

 COMPOSITION
 ${standardTryOnPresentationRuleBlock}
 ${outputFramingBlock}
 ${frontTryOnCompositionBlock}
 - Output exactly one clean front-facing virtual try-on image of the same person wearing the selected wardrobe.
 - Single subject only. Use automatic Full Body framing.
 - Solid black studio background (#000000), no gradients, no shadows on background.
 - No character sheet layout, no reference sheet grid, no headshot panels, no labels, no callouts, no dividers, no annotation text.

 ${brandingInstruction}

 [FITTING NOTES]: ${effectiveTryOnNote}

 ${tryOnNegativeConstraintsBlock}
 ${tryOnCompositionNegativeConstraintsBlock}
 ${tryOnPresentationNegativeConstraintsBlock}

 NEGATIVE CONSTRAINTS:
 character sheet, reference sheet layout, sheet grid, headshot panels, annotation labels, callouts, dividers, typography, FRONT VIEW label, LEFT PROFILE VIEW label, BACK VIEW label,
 opened costume that should be closed, removed headwear, exposed hair under helmet, widened face opening,
 duplicate clutch, duplicate purse, duplicate handbag, duplicate bag, duplicate case, duplicate briefcase, one clutch in both hands, one purse in both hands, duplicated handheld prop, unnecessary extra accessories,
 inappropriate bare feet, barefoot businesswear, barefoot formalwear, barefoot tailored outfit, barefoot uniform, barefoot armor, missing shoes, missing footwear, unfinished lower-body styling, inappropriate shoes, mismatched footwear,
 exposed rear necklace when tucked in front, necklace across back of neck when front-tucked, physically impossible accessory visibility, hidden accessory becoming exposed in another view,
 generic male face, generic fashion model face, different person, identity drift, facial substitution, ethnicity drift, age drift, hairstyle substitution, face drift, beautified profile, wrong nose projection, wrong jawline, wrong chin, wrong brow, wrong eye spacing, wrong mouth shape, wrong ear placement,
 face placed in wrong opening, face placed in decorative cavity, face placed in non-face opening,
 redesigned face hole, widened face window, shrunken face window, moved face window, broken face-window border,
 invented openings, extra cutouts, exposed neck when not shown, exposed wrists when not shown, exposed ankles when not shown, exposed hands when not shown, exposed feet when not shown,
 reshaped gloves, reshaped feet, anatomy contouring, body-hugging reinterpretation, bodysuit reinterpretation, costume redesign,
 extra limbs, duplicate arms, duplicate sleeves, duplicate glove forms, duplicate foot forms, extra costume appendages,
 altered costume colors, shifted palette, desaturated costume, brighter costume, darker costume, material reinterpretation,
 portrait beauty lighting on enclosed face, missing occlusion shadows, missing contact shadows,
 ${tryOnStyleNegativePrompt ? `selected style category drift, ${tryOnStyleNegativePrompt},` : ''}
 flat cutout, bad photoshop, unnatural drape, floating clothes, modified design, text, watermark.`,
                    state.apiKey,
                    state.model,
                    baseImages,
                    {
                        aspectRatio: '1:1',
                        imageSize: state.imageResolution,
                        thinkingLevel: state.enableImageThinking,
                        googleGrounding: state.enableGoogleGrounding,
                        strictMode: true,
                        billingMode: state.billingEntitlements.effectiveBillingMode as 'hosted' | 'byok',
                        entitlements: state.billingEntitlements,
                        identityLock: tryOnIdentityLock,
                        styleCategory: subjectStyleId ? {
                            styleId: subjectStyleId,
                            intent: {
                                selectedStyleLabel: subjectStyle,
                                appliesTo: "Wardrobe Studio front virtual try-on render"
                            }
                        } : undefined
                    }
                );

                const rawUrl = res;

                let safeUrl = rawUrl;
                try {
                    safeUrl = await materializeDisplayUrl(rawUrl);
                } catch (e) {
                    console.warn("Failed to materialize try-on result:", e);
                }

                setFittedImage(safeUrl);
                setActiveTryOnView('front');
                dispatch({ type: 'ADD_LOG', payload: { message: "Front view fitting complete.", type: 'success' } });

                // --- RECENT GENERATIONS: Cache result silently ---
                const recentStore = useRecentGenerationsStore.getState();
                if (recentStore.cacheDirPath && safeUrl) {
                    RecentGenerationsCacheService.cacheGeneration({
                        imageDataUrl: safeUrl,
                        studio: 'wardrobe',
                        cacheDirPath: recentStore.cacheDirPath,
                    }).then((cacheResult) => {
                        if (cacheResult.success && cacheResult.localCachePath && cacheResult.displayUrl) {
                            recentStore.addRecentGeneration({
                                studio: 'wardrobe',
                                localCachePath: cacheResult.localCachePath,
                                displayUrl: cacheResult.displayUrl,
                                createdAt: Date.now(),
                                prompt: tryOnNote || 'Wardrobe try-on',
                                mode: (state.billingEntitlements.effectiveBillingMode as 'hosted' | 'byok') || 'byok',
                            });
                        }
                    }).catch((e) => {
                        console.warn('[Wardrobe] Recent generation caching failed:', e);
                    });
                }
                return;
            }

            console.log('Running TURNAROUND branch');

            const twoPanelFormat = `
 OUTPUT FORMAT (STRICT)
 - Produce ONE square image (1:1) with TWO equal vertical panels (left/right).
 - Subtle center divider is allowed; no frames, no collage borders, no extra panels.
 - Same solid black studio background (#000000) and consistent studio lighting in both panels.
 - ${turnaroundFramingDescription}
 - FOOTWEAR CONSISTENCY (CRITICAL): If feet/lower legs are visible under the selected framing, the subject must have complete, appropriate, matching footwear or foot coverings in both panels unless the concept is explicitly barefoot-appropriate.
 - LOWER BODY CONSISTENCY (CRITICAL): If hips/legs/feet are visible, both panels must show coherent pelvis, thighs, knees, calves, ankles, and complete grounded shoes. No fused legs, missing legs, melted pants columns, or malformed lower-body silhouettes.
 - No text, no labels, no watermarks.
 - Do not include the Character Sheet's headshot grid, annotation labels, typography, callouts, title text, or reference sheet layout.
 - Do not include wardrobe reference crops, product inserts, garment cutout panels, side-by-side source image reproductions, or any product-board composition.
 `;

            const fbSheet = await GeminiService.generateImage(
                `Professional virtual try-on FRONT/BACK TURNAROUND SHEET of the SAME subject and SAME outfit.

 ${twoPanelFormat}

 ${baseImageRoleBlock}
 ${identityPriorityBlock}
 ${tryOnPriorityOrderBlock}
 ${sourceFidelityRulesBlock}
 ${turnaroundSourceImageLockBlock}
 ${identityAnchorFormatFirewall}
 ${resolvedLookContractBlock}
 ${identityAnchorUsageRuleBlock}
 ${standardTryOnPresentationRuleBlock}
 ${wardrobeReferenceUsageBlock}
 ${wardrobeDesignFidelityBlock}
 ${outputFramingBlock}
 ${bodyAwareFittingBlock}
 ${onBodyGarmentIntegrationBlock}
 ${lowerBodyIntegrityBlock}
 ${fbTurnaroundViewDefinitionBlock}
 ${tryOnFbPoseCoherenceBlock}
 ${tryOnStyleContract}

 === PRIORITY 3: WARDROBE PHYSICAL STRUCTURE ===

 COSTUME & APPEARANCE CANON (ABSOLUTE LOCK)
 - Generate this FRONT/BACK sheet first as the canonical turnaround anchor for the try-on session.
 - ${subjectImageRole} is the physical person/body source. ${identityAnchorImageRole ? `${identityAnchorImageRole} reinforces face/head identity.` : 'Preserve identity from the selected subject.'}
 - The Costume Reference (${costumeName}) is the exact wardrobe authority for colors, materials, visible details, and garment design.
 - OUTPUT ANGLE OVERRIDE: this sheet is FRONT/BACK only, not side/profile views.
 - These front/back views must establish the same physical garment on the same person in 3D space, not reinterpretations or redesigns.
 - Preserve the same costume structure, same visible coverage, same accessories, same hairstyle state, same headwear, same worn adornments, and same footwear across all turnaround views.
 - Do NOT add, remove, restyle, simplify, or reinterpret any source-established appearance element.
 - If the source-established look contains multiple simultaneous elements, preserve all of them together.
 ${WEARABLE_FIDELITY_CONTRACT}
 ${headwearOrientationBlock}
 ${fittingBlock}
 ${accessoryFootwearComplianceBlock}
 ${turnaroundCompositionBlock}

 COLOR & MATERIAL LOCK
 - Preserve the exact costume colors established by the Costume Reference.
 - Do NOT shift, mute, brighten, darken, replace, or reinterpret the costume colors.
 - Preserve the exact visible material finish and fabric appearance.

 SILHOUETTE & STRUCTURE (STRICT LOCK)
 ${isEnclosureCostume
        ? `- FRONT/BACK OVERRIDE: preserve the exact volume, bulk, closure, and external silhouette while rotating into front and rear camera angles.
 - Front/back views must preserve the exact volume, bulk, closure, and external silhouette established by the selected subject and Costume Reference.
 - Do NOT invent front/back-specific shaping that exposes more anatomy than the Costume Reference implies.`
        : `- FRONT/BACK OVERRIDE: preserve the same garment design, construction details, coverage, material language, and trim while letting the worn silhouette adapt naturally to the subject's chest, shoulders, arms, waist, and posture.
 - Front/back views must show the same physical shirt/clothing worn on the body, not a pasted flat product silhouette.
 - Do NOT flatten the body, erase chest/shoulder volume, or make the shirt hang like a board to match the product reference.`}

 PANELS
 ${outputFramingBlock}
 ${turnaroundCompositionBlock}
 - LEFT PANEL: FRONT view, straight-on.
 - RIGHT PANEL: BACK view, straight-on.

 STRUCTURE RULE
 - The front and back panels must depict the same exact physical garment from the Costume Reference worn by the same selected subject.
 - Any enclosure or coverage shown in front must remain structurally consistent in back unless the reference explicitly shows otherwise.
 - Do NOT create a back opening or exposed head/neck zone unless explicitly visible in the Costume Reference.

 === PRIORITY 4: COSTUME-DRIVEN RELIGHTING ===

 ${COSTUME_RELIGHTING_CONTRACT}

 === IDENTITY ENFORCEMENT DURING FRONT/BACK TURNAROUND ===

 SUBJECT IDENTITY (HARD LOCK - COSTUME MAY ONLY LIMIT VISIBILITY)
 - The FRONT and BACK panels must depict the exact same person and same worn costume.
 - Preserve face identity and neutral upright posture.
 ${identityAnchorBlock}
 - CRITICAL: Identity must be preserved WITHIN the physical limits imposed by the costume.
 - Do NOT let body anatomy or costume pressure replace, genericize, beautify, age-shift, ethnicity-shift, or facially substitute the person.
 ${sourceAppearanceContinuityBlock}
 ${hairConsistencyBlock}

 ${brandingInstruction}

 [FITTING NOTES]: ${effectiveTryOnNote}

 ${tryOnNegativeConstraintsBlock}
 ${tryOnCompositionNegativeConstraintsBlock}
 ${tryOnPresentationNegativeConstraintsBlock}

 NEGATIVE CONSTRAINTS (FORBIDDEN):
 character sheet, reference sheet layout, sheet grid, headshot panels, annotation labels, callouts, typography, copied identity-anchor layout, extra panels beyond the requested front/back views,
 opened costume that should be closed, removed headwear, exposed hair under helmet, widened face opening,
 duplicate clutch, duplicate purse, duplicate handbag, duplicate bag, duplicate case, duplicate briefcase, one clutch in both hands, one purse in both hands, duplicated handheld prop, unnecessary extra accessories,
 inappropriate bare feet, barefoot businesswear, barefoot formalwear, barefoot tailored outfit, barefoot uniform, barefoot armor, missing shoes, missing footwear, unfinished lower-body styling, inappropriate shoes, mismatched footwear between panels,
 exposed rear necklace when tucked in front, necklace across back of neck when front-tucked, physically impossible accessory visibility, hidden accessory becoming exposed between panels,
 generic male face, generic fashion model face, different person, identity drift, facial substitution, ethnicity drift, age drift, hairstyle substitution, face drift, beautified profile, wrong nose projection, wrong jawline, wrong chin, wrong brow, wrong eye spacing, wrong mouth shape, wrong ear placement,
 face placed in wrong opening, face placed in decorative cavity, face placed in non-face opening,
 redesigned face hole, widened face window, shrunken face window, moved face window, broken face-window border,
 extra limbs, duplicate arms, duplicate sleeves, duplicate gloves, extra costume appendages, invented openings, exposed neck when not shown, exposed wrists when not shown, exposed ankles when not shown,
 exposed hands when not shown, exposed feet when not shown, anatomy contouring, body-hugging reinterpretation, bodysuit reinterpretation,
 costume redesign, outfit mismatch, side-view body in front/back sheet, 3/4 view, three-quarter view, portrait crop,
 rotated helmet crest, flipped plume orientation, camera-facing crest on wrong view, broad front/back plume when source crest is front-to-back, front-facing red fan pasted onto rear helmet, headwear orientation mismatch,
 missing worn accessory, removed accessory, dropped headwear, missing jewelry, removed jewelry, missing eyewear, removed eyewear, missing veil, removed veil, missing hood, removed hood, missing scarf, removed scarf, missing glove, removed glove, missing footwear, removed footwear, missing adornment, simplified adornment, omitted source appearance element, restyled hair, bun hairstyle, updo, tied-back hair, ponytail, braid, pinned hair, shorter hair, different hair volume, different hair silhouette,
 altered costume colors, shifted palette, desaturated costume, brighter costume, darker costume, material reinterpretation,
 portrait beauty lighting on enclosed face, missing occlusion shadows, missing contact shadows,
 ${tryOnStyleNegativePrompt ? `selected style category drift, ${tryOnStyleNegativePrompt},` : ''}
 text, watermark.`,
                state.apiKey,
                state.model,
                baseImages,
                {
                    aspectRatio: '1:1',
                    imageSize: state.imageResolution,
                    thinkingLevel: state.enableImageThinking,
                    googleGrounding: state.enableGoogleGrounding,
                    strictMode: true,
                    billingMode: state.billingEntitlements.effectiveBillingMode as 'hosted' | 'byok',
                    entitlements: state.billingEntitlements,
                    poseCoherence: {
                        enabled: true,
                        validate: true,
                        retry: true,
                        intent: {
                            strictness: 'turnaround',
                            subjectScope: 'full_body',
                            panelOrientations: getTurnaroundPanelOrientations('FRONT_BACK'),
                            twistAllowed: false,
                            headTurnAllowed: false,
                            profileStrictness: 'technical',
                            angleTolerance: 'tight',
                            stanceType: 'neutral_grounded',
                            footingMode: 'directionally_aligned'
                        }
                    },
                    identityLock: tryOnIdentityLock,
                    styleCategory: subjectStyleId ? {
                        styleId: subjectStyleId,
                        intent: {
                            selectedStyleLabel: subjectStyle,
                            appliesTo: "Wardrobe Studio front/back turnaround sheet"
                        }
                    } : undefined
                }
            );

            const canonicalFbImageIndex = baseImages.length + 1;
            const canonicalFbImageRole = imageRoleName(canonicalFbImageIndex);
            const lrImages: { url: string; label: string }[] = [
                ...baseImages,
                {
                    url: fbSheet,
                    label: `${canonicalFbImageRole} - Generated Front/Back Canonical Turnaround Anchor: primary body scale, head scale, silhouette, and costume-construction anchor for LR side views.`
                }
            ];
            const lrImageRoleBlock = buildTryOnReferenceRoleBlock({
                costumeIndex: costumeImageIndex,
                identityAnchorIndex: identityAnchorImageIndex,
                brandingIndex: brandingImageIndex,
                canonicalFbIndex: canonicalFbImageIndex
            });

            const canonicalTurnaroundFidelityBlock = `
 CANONICAL TURNAROUND FIDELITY RULES
 - ${canonicalFbImageRole} is the canonical source for proportions and costume construction in this LR pass.
 - Use the front/back turnaround result as the body/costume proportion anchor, then rotate that already-established actor and suit into true side profiles.
 - Preserve the same actor identity, head scale, neck scale, shoulder width, torso volume, limb proportions, and overall silhouette.
 - Preserve the same costume geometry, panel layout, armor/suit structure, seam placement, lights, accessories, gloves, and boots.
 - Do not reinterpret the character.
 - Do not enlarge the head.
 - Do not exaggerate the helmet/collar, torso depth, shoulder width, limb thickness, glove scale, boot scale, or costume bulk.
 - Do not redesign the suit or alter body mass/proportions between turnaround modes.
 - The left and right profiles must look like the same established character from the FB turnaround, only rotated to accurate side views.
`;

            const leftRightTurnaroundRulesBlock = `
 STRICT LR OUTPUT FORMAT
 - Create a single two-panel left/right profile turnaround image split by one vertical center divider.
 - Exactly two full-body figures total.
 - Exactly one figure per panel only.
 - LEFT PANEL: one true left-side profile of the subject, facing screen-right toward the center divider.
 - RIGHT PANEL: one true right-side profile of the same subject, facing screen-left toward the center divider.
 - The two figures face toward each other across the divider.
 - No additional figures, no duplicates, no extra views, no repeated examples, no comparison lineup.
 - Do not create four figures.
 - Do not duplicate the left profile.
 - Do not duplicate the right profile.
 - Do not make a multi-view sheet, reference sheet, or lineup.
 - Preserve the exact same subject, exact same body proportions, exact same costume, exact same boots, gloves, lights, panels, helmet/collar, and accessories.
 - Only the camera side changes.
`;
            const lrFullBodyAxisLockBlock = buildTryOnLrFullBodyAxisLockBlock();

            const lrSheet = await GeminiService.generateImage(
                `Professional virtual try-on TRUE LEFT/RIGHT SIDE PROFILE TURNAROUND SHEET of the SAME established subject and SAME established outfit.

 ${twoPanelFormat}

 ${lrImageRoleBlock}
 ${identityPriorityBlock}
 ${tryOnPriorityOrderBlock}
 ${sourceFidelityRulesBlock}
 ${turnaroundSourceImageLockBlock}
 ${canonicalTurnaroundFidelityBlock}
 ${identityAnchorFormatFirewall}
 ${resolvedLookContractBlock}
 ${identityAnchorUsageRuleBlock}
 ${standardTryOnPresentationRuleBlock}
 ${wardrobeReferenceUsageBlock}
 ${wardrobeDesignFidelityBlock}
 ${outputFramingBlock}
 ${bodyAwareFittingBlock}
 ${onBodyGarmentIntegrationBlock}
 ${lowerBodyIntegrityBlock}
 ${lrTurnaroundViewDefinitionBlock}
 ${tryOnLrPoseCoherenceBlock}
 ${leftRightTurnaroundRulesBlock}
 ${lrFullBodyAxisLockBlock}
 ${tryOnStyleContract}

 === PRIORITY 3: WARDROBE PHYSICAL STRUCTURE ===

 COSTUME (HARD TRANSFER AUTHORITY)
 - ${canonicalFbImageRole} locks the established head scale, body proportions, silhouette, and worn costume construction for LR.
 - The Costume Reference (${costumeName}) remains the absolute authority for the wardrobe design, colors, materials, panels, lights, boots, gloves, helmet/collar structure, and major details.
 - Copy the same established garment from the FB turnaround and Costume Reference while rotating the whole worn look into true opposite-facing side profiles.
 ${isEnclosureCostume
        ? '- Preserve the exact visible silhouette, enclosure, coverage, designed face-window placement, colors, textures, materials, construction, headwear, helmet, plume, crest, and accessories.'
        : '- Preserve the shirt/clothing design, coverage, collar, cuffs, placket, embroidery, colors, textures, materials, construction, and accessories while refitting the same established garment as real clothing on the selected subject from the side.'}
 - Do NOT reinterpret it into a new suit, new actor, inflated side silhouette, enlarged head, or more generic version.
 - IGNORE filename text if it conflicts with the image.
 ${designAssemblyBlock}
 ${sideViewLockBlock}
 ${trueProfileBodyBlock}
 ${lrFullBodyAxisLockBlock}
 ${turnaroundCompositionBlock}

 ${WEARABLE_FIDELITY_CONTRACT}

 ${fittingBlock}
 ${headwearOrientationBlock}
 ${accessoryFootwearComplianceBlock}

 COLOR & MATERIAL LOCK
 - Preserve the exact costume colors from the Costume Reference and canonical FB result.
 - Do NOT shift, mute, brighten, darken, replace, or reinterpret the costume colors.
 - Preserve the exact visible material finish and fabric appearance.

 SILHOUETTE & STRUCTURE (STRICT LOCK)
 - Preserve proportional parity with ${canonicalFbImageRole}: same head-to-body ratio, neck thickness, shoulder width, torso volume, arm scale, glove scale, leg width, boot scale, helmet/collar scale, and overall suit bulk.
 ${isEnclosureCostume
        ? `- Preserve the exact outer silhouette and visible structure of the Costume Reference and canonical FB result.
 - Preserve all enclosure logic, shell shape, padding, bulk, visible openings, and visible appendages exactly.
 - Do NOT simplify the costume into regular clothing.
 - Do NOT expose body parts unless the Costume Reference explicitly shows them.`
        : `- Preserve the same clothing design, construction, coverage, embroidery, collar, cuffs, placket, hem, colors, and material language from the Costume Reference and canonical FB result.
 - Let the side silhouette respond to the established subject's chest, shoulders, arms, waist, and posture.
 - Do NOT copy the flat product/mannequin silhouette as if it were the subject's body.
 - Do NOT flatten or inflate the wearer into a new side-profile interpretation.`}

 PANELS
 ${outputFramingBlock}
 ${turnaroundCompositionBlock}
 - EXACTLY TWO FIGURES TOTAL: one subject on the left side of the divider and one subject on the right side of the divider.
 - Do not place two figures in either panel.
 - LEFT PANEL: TRUE LEFT-SIDE PROFILE (90 degrees) using the selected framing. The subject's nose, chest, knees/toes, and costume side silhouette face toward the center divider / screen-right.
 - RIGHT PANEL: TRUE RIGHT-SIDE PROFILE (90 degrees) using the selected framing. The subject's nose, chest, knees/toes, and costume side silhouette face toward the center divider / screen-left.
 - The two figures must face toward each other across the center divider, not away from each other and not in the same screen direction.

 PROFILE RULE
 - The entire established body and costume must be rotated side-on: helmet, plume/crest, head, neck, shoulders, torso, pelvis, arms, waist layer, legs, shoes, and accessories.
 - A head-only profile is invalid. A front-facing or 3/4 body with the head turned sideways is invalid.
 - Do NOT show broad frontal chest armor, both shoulder pads symmetrically, both arms equally, front-facing feet, or same-direction duplicated profiles.
 - Side profiles must show a believable standing lower body: pelvis over legs, knees and ankles aligned, pants/armor shaped by two legs, and shoes grounded in the same side-facing direction.

 === PRIORITY 4: COSTUME-DRIVEN RELIGHTING ===

 ${COSTUME_RELIGHTING_CONTRACT}

 === IDENTITY ENFORCEMENT DURING SIDE TURNAROUND ===

 SUBJECT (HARD IDENTITY LOCK - COSTUME MAY ONLY LIMIT VISIBILITY)
 - Use the named identity reference image(s), selected subject, and canonical FB result to preserve the exact same person.
 - The LEFT and RIGHT panels must depict the SAME person and SAME suit from ${canonicalFbImageRole}.
 ${identityAnchorBlock}
 - CRITICAL: Identity must be preserved WITHIN the physical limits imposed by the costume.
 - Do NOT let body anatomy, side-view camera angle, or costume pressure replace, genericize, beautify, age-shift, ethnicity-shift, or facially substitute the person.
 ${sourceAppearanceContinuityBlock}
 ${hairConsistencyBlock}

 ${brandingInstruction}

 [FITTING NOTES]: ${effectiveTryOnNote}

 ${tryOnNegativeConstraintsBlock}
 ${tryOnCompositionNegativeConstraintsBlock}
 ${tryOnPresentationNegativeConstraintsBlock}

 NEGATIVE CONSTRAINTS (FORBIDDEN):
 character sheet, reference sheet layout, sheet grid, headshot panels, annotation labels, callouts, typography, copied identity-anchor layout, multi-view sheet, comparison lineup, repeated examples, extra panels beyond the requested left/right views,
 opened costume that should be closed, removed headwear, exposed hair under helmet, widened face opening,
 duplicate clutch, duplicate purse, duplicate handbag, duplicate bag, duplicate case, duplicate briefcase, one clutch in both hands, one purse in both hands, duplicated handheld prop, unnecessary extra accessories,
 inappropriate bare feet, barefoot businesswear, barefoot formalwear, barefoot tailored outfit, barefoot uniform, barefoot armor, missing shoes, missing footwear, unfinished lower-body styling, inappropriate shoes, mismatched footwear between panels,
 exposed rear necklace when tucked in front, necklace across back of neck when front-tucked, physically impossible accessory visibility, hidden accessory becoming exposed between panels,
 generic male face, generic fashion model face, different person, identity drift, facial substitution, ethnicity drift, age drift, hairstyle substitution, face drift, beautified profile, wrong nose projection, wrong jawline, wrong chin, wrong brow, wrong eye spacing, wrong mouth shape, wrong ear placement,
 face placed in wrong opening, face placed in decorative cavity, face placed in non-face opening,
 redesigned face hole, widened face window, shrunken face window, moved face window, broken face-window border,
 enlarged head, oversized head, head scale drift, neck scale drift, shoulder width drift, torso volume drift, inflated torso depth, oversized helmet, oversized collar, suit bulk drift, glove scale drift, boot scale drift, chest device placement drift, panel placement drift, costume proportion drift,
 extra limbs, duplicate bodies, duplicate full-body figures, four figures, four-body output, multiple variants, multiple examples, duplicate arms, duplicate sleeves, duplicate gloves, extra costume appendages, invented openings, extra cutouts, exposed neck when not shown, exposed wrists when not shown, exposed ankles when not shown, exposed hands when not shown, exposed feet when not shown, anatomy contouring, body-hugging reinterpretation, bodysuit reinterpretation, costume redesign, alternate costume versions, mascot redesign,
 two left profiles, two right profiles, both panels facing the same direction, both profiles facing screen-right, both profiles facing screen-left, profiles facing away from each other, duplicated same side profile, duplicate left profile, duplicate right profile, near-front side view, 3/4 side substitute, 3/4 body in LR panel, profile head on front-facing body, side-turned head on front body, head-only profile turn, broad frontal torso in side view, front-facing chest plate in side view, symmetrical shoulder pads in side view, front-facing hip plates in side view, front-facing feet in side view,
 changed color placement, changed armor panels, changed glowing strips, changed boots, changed gloves, changed collar, changed backpack, changed body proportions,
 rotated helmet crest, flipped plume orientation, camera-facing crest on wrong view, narrow side plume when source crest is front-to-back, headwear orientation mismatch,
 missing worn accessory, removed accessory, dropped headwear, missing jewelry, removed jewelry, missing eyewear, removed eyewear, missing veil, removed veil, missing hood, removed hood, missing scarf, removed scarf, missing glove, removed glove, missing footwear, removed footwear, missing adornment, simplified adornment, omitted source appearance element, restyled hair, bun hairstyle, updo, tied-back hair, ponytail, braid, pinned hair, shorter hair, different hair volume, different hair silhouette,
 altered costume colors, shifted palette, desaturated costume, brighter costume, darker costume, material reinterpretation,
 portrait beauty lighting on enclosed face, missing occlusion shadows, missing contact shadows,
 ${tryOnStyleNegativePrompt ? `selected style category drift, ${tryOnStyleNegativePrompt},` : ''}
 flat cutout, bad photoshop, unnatural drape, floating clothes, modified design, text, watermark.`,
                state.apiKey,
                state.model,
                lrImages,
                {
                    aspectRatio: '1:1',
                    imageSize: state.imageResolution,
                    thinkingLevel: state.enableImageThinking,
                    googleGrounding: state.enableGoogleGrounding,
                    strictMode: true,
                    billingMode: state.billingEntitlements.effectiveBillingMode as 'hosted' | 'byok',
                    entitlements: state.billingEntitlements,
                    poseCoherence: {
                        enabled: true,
                        validate: true,
                        retry: true,
                        intent: {
                            strictness: 'side_view',
                            subjectScope: 'full_body',
                            panelOrientations: getTurnaroundPanelOrientations('LEFT_RIGHT'),
                            twistAllowed: false,
                            headTurnAllowed: false,
                            profileStrictness: 'technical',
                            angleTolerance: 'tight',
                            stanceType: 'neutral_grounded',
                            footingMode: 'directionally_aligned'
                        }
                    },
                    identityLock: tryOnIdentityLock,
                    styleCategory: subjectStyleId ? {
                        styleId: subjectStyleId,
                        intent: {
                            selectedStyleLabel: subjectStyle,
                            appliesTo: "Wardrobe Studio left/right turnaround sheet using canonical FB fidelity anchor"
                        }
                    } : undefined
                }
            );

            // Extract exact view frames from turnaround sheets using offscreen canvas logic
            const extractPanel = (sourceUrl: string, isRightPanel: boolean): Promise<string> => {
                return new Promise((resolve) => {
                    const img = new Image();
                    img.crossOrigin = "anonymous";
                    img.onload = () => {
                        const canvas = document.createElement("canvas");
                        canvas.width = img.width / 2;
                        canvas.height = img.height;
                        const ctx = canvas.getContext("2d");
                        if (!ctx) {
                            resolve(sourceUrl);
                            return;
                        }

                        const srcX = isRightPanel ? img.width / 2 : 0;
                        ctx.drawImage(img, srcX, 0, img.width / 2, img.height, 0, 0, canvas.width, canvas.height);
                        resolve(canvas.toDataURL("image/webp", 1.0));
                    };
                    img.onerror = () => resolve(sourceUrl);
                    img.src = sourceUrl;
                });
            };

            let safeFbSheet = fbSheet;
            let safeLrSheet = lrSheet;

            try {
                safeFbSheet = await materializeDisplayUrl(fbSheet);
            } catch (e) {
                console.warn("Failed to materialize FB sheet:", e);
            }

            try {
                safeLrSheet = await materializeDisplayUrl(lrSheet);
            } catch (e) {
                console.warn("Failed to materialize LR sheet:", e);
            }

            // Extract panels from the safe/materialized sheets
            const frontExtracted = await extractPanel(safeFbSheet, false);
            const backExtracted = await extractPanel(safeFbSheet, true);
            const leftExtracted = await extractPanel(safeLrSheet, false);
            const rightExtracted = await extractPanel(safeLrSheet, true);

            setTryOnSheetFB(safeFbSheet);
            setTryOnSheetLR(safeLrSheet);

            setTryOnViews({
                front: frontExtracted,
                back: backExtracted,
                left: leftExtracted,
                right: rightExtracted
            });

            setFittedImage(safeFbSheet);
            setActiveTryOnView('sheetFB');

            dispatch({ type: 'ADD_LOG', payload: { message: "Turnaround complete (2 sheets generated: FB + LR).", type: 'success' } });

            // --- RECENT GENERATIONS: Cache both turnaround sheets silently ---
            const recentStore = useRecentGenerationsStore.getState();
            if (recentStore.cacheDirPath) {
                const turnaroundRecentSheets = [
                    { imageDataUrl: safeFbSheet, prompt: tryOnNote ? `${tryOnNote} (FB turnaround)` : 'Wardrobe turnaround (FB)' },
                    { imageDataUrl: safeLrSheet, prompt: tryOnNote ? `${tryOnNote} (LR turnaround)` : 'Wardrobe turnaround (LR)' }
                ];

                turnaroundRecentSheets.forEach((sheet, index) => {
                    if (!sheet.imageDataUrl) return;

                    RecentGenerationsCacheService.cacheGeneration({
                        imageDataUrl: sheet.imageDataUrl,
                        studio: 'wardrobe',
                        cacheDirPath: recentStore.cacheDirPath!,
                    }).then((cacheResult) => {
                        if (cacheResult.success && cacheResult.localCachePath && cacheResult.displayUrl) {
                            recentStore.addRecentGeneration({
                                studio: 'wardrobe',
                                localCachePath: cacheResult.localCachePath,
                                displayUrl: cacheResult.displayUrl,
                                createdAt: Date.now() + index,
                                prompt: sheet.prompt,
                                mode: (state.billingEntitlements.effectiveBillingMode as 'hosted' | 'byok') || 'byok',
                            });
                        }
                    }).catch((e) => {
                        console.warn(`[Wardrobe] Recent turnaround ${index === 0 ? 'FB' : 'LR'} caching failed:`, e);
                    });
                });
            }
        } catch (error: unknown) {
            const logType = isPendingGenerationError(error) ? 'info' : 'error';
            dispatch({ type: 'ADD_LOG', payload: { message: getErrorMessage(error), type: logType } });
        } finally {
            clearInterval(progressInterval);
            dispatch({ type: 'SET_PROCESSING', payload: false });
            dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: { percent: 0, text: '' } });
        }
    };

    const handleAddToCast = async () => {
        const finalUrl = fittedImage;
        if (!finalUrl) return;

        const currentView = activeTryOnView;
        let tag: CastMember['tag'] = 'front';
        let label = 'Fitted';

        if (currentView === 'sheetFB') {
            tag = 'front';
            label = 'Turnaround (FB)';
        } else if (currentView === 'sheetLR') {
            tag = 'side';
            label = 'Turnaround (LR)';
        }

        const newMember: CastMember = {
            id: `fitted-${Date.now()}`,
            url: finalUrl,
            previewUrl: finalUrl,
            sourceUrl: finalUrl,
            tag,
            name: selectedCharacter ? `${selectedCharacter.name} (${label})` : `Fitted Character (${label})`,
            identityLock: selectedCharacter?.identityLock,
            profile: {
                identity: selectedCharacter?.profile?.identity || selectedCharacter?.name || "Unknown Identity",
                wardrobe: selectedCostume?.prompt || "Selected Wardrobe",
                accessories: selectedCharacter?.profile?.accessories || "",
                style: selectedCharacter?.profile?.style || ""
            }
        };
        dispatch({ type: 'ADD_CAST', payload: newMember });
        dispatch({ type: 'ADD_LOG', payload: { message: `Character added to cast (${label})`, type: 'success' } });
    };



    const downloadImage = (url: string, filename: string) => {
        const link = document.createElement('a');
        link.href = url;
        link.download = createUniqueDownloadFilename(filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="h-full bg-[#0f0f11] flex overflow-hidden">
            {/* LEFT: WARDROBE LIBRARY */}
            <div className="w-96 border-r border-gray-800 bg-[#18181b] flex flex-col ">
                <div className="p-4 border-b border-gray-800 flex justify-between items-center">
                    <h2 className="text-sm font-black text-white tracking-widest uppercase">Wardrobe Library</h2>
                    <div className="flex gap-1.5">
                        <button onClick={() => document.getElementById('wardrobe-upload-input')?.click()} className="p-1.5 hover:bg-gray-700 rounded transition-colors text-gray-400" title="Upload Costume">
                            <Upload className="w-3.5 h-3.5" />
                            <input id="wardrobe-upload-input" type="file" className="hidden" accept="image/*" onClick={(e) => { (e.target as HTMLInputElement).value = ''; }} onChange={handleUploadCostume} />
                        </button>
                        <button onClick={() => withLibraryTransition(scanWardrobe)} className="p-1.5 hover:bg-gray-700 rounded transition-colors text-gray-400" title="Scan Folder">
                            <RefreshCcw className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                <div className="flex-grow overflow-y-auto p-4 space-y-4">
                    {!state.saveDirectoryHandle && !state.saveDirectoryPath && (
                        <div className="p-4 bg-yellow-500/5 border border-yellow-500/20 rounded-lg">
                            <p className="text-[10px] text-yellow-500 font-bold leading-relaxed">
                                ⚠️ PLEASE SELECT A SAVE FOLDER IN SETTINGS TO ENABLE LOCAL WARDROBE STORAGE.
                            </p>
                        </div>
                    )}

                    {(!libraryLoading && state.wardrobeItems.length === 0) ? (
                        <div className="w-full mt-0">
                            <div className="relative w-full overflow-hidden rounded-2xl border border-white/10 bg-black/30 shadow-[0_0_30px_rgba(0,0,0,0.35)]">
                                <img
                                    src={wardrobeLibraryPlaceholder}
                                    alt="Wardrobe design placeholder"
                                    className="w-full max-h-[580px] object-cover opacity-95"
                                />
                                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/35" />
                                <div className="absolute bottom-4 left-4 right-4">
                                    <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-yellow-400">
                                        Wardrobe Library
                                    </p>
                                    <p className="mt-1 text-xs text-zinc-300 leading-relaxed">
                                        Upload or generate your first costume to begin building this library.
                                    </p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-2">
                            {libraryLoading ? (
                                Array.from({ length: 8 }).map((_, i) => (
                                    <WardrobeLibrarySkeletonCard key={`wardrobe-skeleton-${i}`} />
                                ))
                            ) : (
                                state.wardrobeItems.map(item => (
                                    <div
                                        key={item.id}
                                        onClick={() => setSelectedCostume(item)}
                                        className={`aspect-square rounded-lg border overflow-hidden transition-all group relative cursor-pointer ${selectedCostume?.id === item.id ? 'border-yellow-500 border-2' : 'border-gray-800 hover:border-gray-600'}`}
                                    >
                                        <img src={item.url} className="w-full h-full transition-transform group-hover:scale-110 object-contain" />
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

                                        <span className="text-[8px] font-bold text-white uppercase truncate absolute bottom-2 left-2 right-2 text-center">{item.name}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* CENTER: WORKSPACE */}
            <div className="flex-grow flex flex-col bg-[#09090b]">
                {/* TABS */}
                <div className="flex bg-[#18181b] px-4 pt-4 gap-4 border-b border-gray-800">
                    <button
                        onClick={() => setActiveTab('designer')}
                        className={`pb-3 px-4 text-xs font-bold uppercase tracking-widest border-b-2 transition-all ${activeTab === 'designer' ? 'border-yellow-500 text-yellow-500' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                    >
                        Costume Designer
                    </button>
                    <button
                        onClick={() => setActiveTab('library')}
                        className={`pb-3 px-4 text-xs font-bold uppercase tracking-widest border-b-2 transition-all ${activeTab === 'library' ? 'border-yellow-500 text-yellow-500' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                    >
                        Virtual Try-On Room
                    </button>
                    <div className="flex-grow" />
                    <button
                        onClick={() => {
                            dispatch({ type: 'SET_HELP_SECTION', payload: 'tab' });
                            dispatch({ type: 'TOGGLE_HELP', payload: true });
                        }}
                        title="Wardrobe Help"
                        className="pb-3 px-2 text-gray-500 hover:text-yellow-500 transition-colors"
                    >
                        <HelpCircle className="w-4 h-4" />
                    </button>
                </div>

                <div className={`flex-grow min-h-0 ${activeTab === 'designer' ? 'overflow-hidden p-4' : 'overflow-hidden p-4 flex flex-col'}`}>
                    {activeTab === 'designer' ? (
                        <div className="w-full h-full flex gap-6 min-h-0">
                            {/* LEFT: DESIGN CONTROLS */}
                            <div className="w-[380px] shrink-0 flex flex-col h-full min-h-0">
                                <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-4 scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent">
                                    {/* DESIGN REFERENCE (UPLOAD) */}
                                    <div className="bg-[#18181b] p-6 rounded-2xl border border-gray-800 ">
                                        <h3 className="text-xs font-black text-gray-400 uppercase mb-4 tracking-widest flex items-center gap-2">
                                            <Upload className="w-4 h-4 text-blue-400" /> Design Reference
                                        </h3>

                                        <div className="flex items-center justify-between gap-2 mb-3">
                                            <div className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                                                Reference Type
                                            </div>
                                            <div className="flex items-center gap-1 bg-black/30 border border-white/10 rounded-lg p-1">
                                                <button
                                                    onClick={() => setDesignerRefKind('sketch')}
                                                    className={`px-3 py-1 rounded text-[10px] font-black uppercase tracking-wider transition-all ${designerRefKind === 'sketch'
                                                        ? 'ring-2 ring-white text-white -[0_0_8px_rgba(255,255,255,0.8)] bg-black/60'
                                                        : 'text-gray-400 hover:text-white hover:bg-white/10'
                                                        }`}
                                                >
                                                    Sketch
                                                </button>
                                                <button
                                                    onClick={() => setDesignerRefKind('costume')}
                                                    className={`px-3 py-1 rounded text-[10px] font-black uppercase tracking-wider transition-all ${designerRefKind === 'costume'
                                                        ? 'ring-2 ring-white text-white -[0_0_8px_rgba(255,255,255,0.8)] bg-black/60'
                                                        : 'text-gray-400 hover:text-white hover:bg-white/10'
                                                        }`}
                                                >
                                                    Costume
                                                </button>
                                            </div>
                                        </div>

                                        <div
                                            onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDesignerDropActive(true); }}
                                            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDesignerDropActive(true); }}
                                            onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDesignerDropActive(false); }}
                                            onDrop={handleDropDesignerReference}
                                            className={`rounded-xl border border-dashed p-4 transition-all ${designerDropActive ? 'border-blue-500/70 bg-blue-500/5' : 'border-white/10 bg-black/20'
                                                }`}
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <label className="relative group cursor-pointer shrink-0" title="Upload Design Reference">
                                                        <div className="w-10 h-10 rounded-lg bg-white/5 border border-dashed border-white/10 group-hover:border-blue-500/50 flex items-center justify-center transition-all overflow-hidden">
                                                            {designerRefImage ? (
                                                                <img src={designerRefImage} className="w-full h-full object-cover" alt="Design Reference" />
                                                            ) : (
                                                                <Upload className="w-5 h-5 text-gray-400 group-hover:text-blue-400" />
                                                            )}
                                                        </div>
                                                        <input
                                                            type="file"
                                                            className="hidden"
                                                            accept="image/*"
                                                            onClick={(e) => { (e.target as HTMLInputElement).value = ''; }}
                                                            onChange={handleUploadDesignerReference}
                                                        />
                                                    </label>
                                                    <div className="min-w-0">
                                                        <div className="text-xs font-bold text-white leading-tight">
                                                            {designerRefImage ? 'Reference loaded' : 'Drop a reference image'}
                                                        </div>
                                                        <div className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">
                                                            {designerRefKind === 'sketch' ? 'Sketch/Pattern' : 'Costume Photo'} • Session only
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {designerRefImage && (
                                                <div className="mt-3 flex items-center justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">Active</div>
                                                        <div className="text-sm font-bold text-white truncate">{designerRefName || 'Reference'}</div>
                                                    </div>
                                                    <button
                                                        onClick={clearDesignerWorkspace}
                                                        className="shrink-0 bg-white/5 hover:bg-white/10 text-gray-200 hover:text-white px-3 py-2 rounded-xl border border-white/10 text-[9px] font-black uppercase tracking-wider transition-all"
                                                    >
                                                        Clear
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        <div className="mt-3 text-[10px] text-gray-500 leading-relaxed">
                                            The main viewport shows your uploaded reference until you generate a finished costume.
                                        </div>
                                    </div>

                                    {/* PROMPT + GENERATE */}
                                    <div className="bg-[#18181b] p-6 rounded-2xl border border-gray-800 ">
                                        <h3 className="text-xs font-black text-gray-400 uppercase mb-4 tracking-widest flex items-center gap-2">
                                            <Sparkles className="w-4 h-4 text-yellow-500" /> Designer Workshop
                                        </h3>
                                        <HelpTooltip zone="wardrobe" id="fabricEditor">
                                            <textarea
                                                className="w-full bg-[#09090b] border border-[#27272a] p-4 rounded-xl text-sm text-gray-200 focus:border-yellow-500 focus:outline-none transition-colors h-40 resize-none mb-4"
                                                placeholder="Describe the outfit you want (materials, silhouette, details, colors)..."
                                                value={designerPrompt}
                                                onChange={(e) => setDesignerPrompt(e.target.value)}
                                            />
                                        </HelpTooltip>
                                        <InlineHint zone="wardrobe" id="fabricEditor" className="mb-4" />
                                        <button
                                            onClick={handleDesignerGenerate}
                                            disabled={
                                                state.isProcessing || 
                                                (!designerPrompt.trim() && !designerRefImage) ||
                                                (state.billingEntitlements.effectiveBillingMode === "byok" && !state.apiKey)
                                            }
                                            className="w-full bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-400 hover:to-yellow-500 text-black py-3 rounded-xl font-black text-xs uppercase tracking-[0.2em] transition-all active:scale-95 disabled:opacity-50"
                                        >
                                            Generate Costume
                                        </button>
                                    </div>

                                    {/* BRANDING */}
                                    <div className="bg-[#18181b] p-6 rounded-2xl border border-gray-800 ">
                                        <h3 className="text-xs font-black text-gray-400 uppercase mb-4 tracking-widest flex items-center gap-2">
                                            <Zap className="w-4 h-4 text-[#eab308] fill-[#eab308]" /> Branding & Identity
                                        </h3>

                                        <div className="bg-black/40 border border-white/5 rounded-xl p-4 space-y-4">
                                            <div className="flex items-start gap-4">
                                                <label className="relative group cursor-pointer shrink-0">
                                                    <div className="w-16 h-16 rounded-lg border-2 border-dashed border-white/10 group-hover:border-blue-500/50 flex flex-col items-center justify-center transition-all bg-black/20 overflow-hidden">
                                                        {brandingLogo ? (
                                                            <img src={brandingLogo} className="w-full h-full object-contain" alt="Branding Logo" />
                                                        ) : (
                                                            <Upload className="w-6 h-6 text-gray-500 group-hover:text-blue-400" />
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
                                                            onClick={(e) => { e.preventDefault(); setBrandingLogo(null); }}
                                                            className="absolute -top-2 -right-2 bg-red-500 text-white w-6 h-6 rounded-full flex items-center justify-center hover:bg-red-400 transition-all"
                                                            title="Remove Logo"
                                                        >
                                                            <X className="w-3 h-3" />
                                                        </button>
                                                    )}
                                                </label>

                                                <div className="flex-grow min-w-0">
                                                    <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Logo Position</div>
                                                    <select
                                                        value={logoPosition}
                                                        onChange={(e) => setLogoPosition(e.target.value)}
                                                        className="w-full bg-[#09090b] border border-[#27272a] p-2 rounded-lg text-xs text-gray-200 focus:border-yellow-500 focus:outline-none"
                                                    >
                                                        <option value="Center Chest">Center Chest</option>
                                                        <option value="Left Chest">Left Chest</option>
                                                        <option value="Right Chest">Right Chest</option>
                                                        <option value="Upper Back">Upper Back</option>
                                                        <option value="Lower Back">Lower Back</option>
                                                        <option value="Left Sleeve">Left Sleeve</option>
                                                        <option value="Right Sleeve">Right Sleeve</option>
                                                    </select>
                                                    <div className="mt-2 text-[10px] text-gray-500 leading-relaxed">
                                                        Upload a PNG logo (transparent background recommended). This applies to generated costumes and Try-On results.
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* RIGHT: LARGE VIEWPORT */}
                            <div className="flex-grow min-w-0 h-full bg-black rounded-2xl border border-gray-800 flex items-center justify-center overflow-hidden relative group">
                                {designerImage && (
                                    <img ref={designerImgRef} src={designerImage} className="hidden" />
                                )}
                                {designerMask && (
                                    <img ref={maskImgRef} src={designerMask} className="hidden" />
                                )}

                                {(designerImage || designerRefImage) ? (
                                    <div className="relative w-full h-full">
                                        <img
                                            src={designerImage || designerRefImage || ''}
                                            className="w-full h-full object-contain"
                                        />

                                        {/* ACTIONS */}
                                        <div className="absolute top-4 left-4 flex gap-3 z-50">
                                            {designerImage ? (
                                                <>
                                                    <button
                                                        onClick={() => saveToWardrobe(designerImage!, designerPrompt)}
                                                        className="bg-blue-600 hover:bg-blue-500 text-white !px-3 !py-1.5 !min-w-0 !min-h-0 !w-auto !h-auto rounded-full font-black text-[9px] uppercase tracking-widest border border-blue-400 transition-all active:scale-95 flex items-center gap-2"
                                                    >
                                                        <Shirt className="w-3.5 h-3.5" /> Save to Wardrobe
                                                    </button>
                                                    <button
                                                        onClick={clearDesignerWorkspace}
                                                        className="bg-red-600/80 hover:bg-red-500 text-white !px-3 !py-1.5 !min-w-0 !min-h-0 !w-auto !h-auto rounded-full font-black text-[9px] uppercase tracking-widest border border-red-500/50 transition-all active:scale-95 flex items-center gap-2"
                                                        title="Discard Generated Costume"
                                                    >
                                                        <X className="w-3.5 h-3.5" /> Clear
                                                    </button>
                                                    <button
                                                        onClick={() => downloadImage(designerImage!, 'costume.png')}
                                                        className="bg-white/10 hover:bg-white/20 text-white !px-3 !py-1.5 !min-w-0 !min-h-0 !w-auto !h-auto rounded-full transition-all border border-white/10 active:scale-95 flex items-center justify-center"
                                                        title="Download Generated Costume"
                                                    >
                                                        <Download className="w-3.5 h-3.5" />
                                                    </button>
                                                </>
                                            ) : (
                                                <>
                                                    <button
                                                        onClick={() => downloadImage(designerRefImage!, 'reference.png')}
                                                        className="bg-white/10 hover:bg-white/20 text-white px-6 py-3 rounded-full transition-all border border-white/10 active:scale-95 text-[10px] font-black uppercase tracking-widest flex items-center gap-2"
                                                        title="Download Reference"
                                                    >
                                                        <Download className="w-4 h-4" /> Download
                                                    </button>
                                                    <button
                                                        onClick={clearDesignerWorkspace}
                                                        className="bg-red-500/80 hover:bg-red-500 text-white px-6 py-3 rounded-full transition-all border border-red-400/30 active:scale-95 text-[10px] font-black uppercase tracking-widest flex items-center gap-2"
                                                        title="Clear Reference"
                                                    >
                                                        <Trash2 className="w-4 h-4" /> Clear
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center opacity-20">
                                        <Shirt className="w-16 h-16 mb-4" />
                                        <span className="text-xs font-black uppercase tracking-widest text-[#a1a1aa]">Awaiting Design</span>
                                    </div>
                                )}

                                {/* RECENT GENERATIONS STRIP (Costume Designer viewport) */}
                                {isRecentGenerationsOpen && hasRecentGenerations && (
                                    <div className="absolute bottom-2 left-0 right-0 z-50 pointer-events-none flex justify-center px-4 transition-all duration-200 ease-out opacity-100 translate-y-0">
                                        <div className="relative w-full max-w-3xl pointer-events-auto">
                                            <button
                                                type="button"
                                                className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-[60] bg-[#1a1a1c]/90 border border-white/10 rounded-full p-0.5 text-gray-400 hover:text-white hover:bg-black transition-colors shadow-lg"
                                                aria-label="Hide recent generations"
                                                title="Hide recent generations"
                                                onClick={() => setIsRecentGenerationsOpen(false)}
                                            >
                                                <ChevronDown className="w-4 h-4" />
                                            </button>
                                            <div className="transition-all duration-200 ease-out opacity-100 scale-100">
                                                <RecentGenerationsStrip
                                                    studio="wardrobe"
                                                    showSingle
                                                    className="w-full bg-black/80 backdrop-blur-md rounded-2xl border border-white/10"
                                                    onSelectGeneration={(gen) => {
                                                        setDesignerImage(gen.displayUrl);
                                                    }}
                                                    onExportGeneration={async (gen) => {
                                                        setDesignerImage(gen.displayUrl);
                                                        await saveToWardrobe(gen.displayUrl, gen.prompt || designerPrompt || 'Generated Costume');
                                                        useRecentGenerationsStore.getState().markExported(gen.id);
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className="absolute top-4 right-4 flex items-center gap-2">
                                    {!isRecentGenerationsOpen && hasRecentGenerations && (
                                        <HelpTooltip zone="wardrobe" id="showRecentGenerationsButton">
                                            <button
                                                onClick={() => setIsRecentGenerationsOpen(true)}
                                                aria-label="Show recent generations"
                                                title="Show recent generations"
                                                className="!p-0 bg-gray-500/10 hover:bg-gray-500 text-gray-400 hover:text-white w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-95 border border-gray-500/20"
                                            >
                                                <History className="w-4 h-4" />
                                            </button>
                                        </HelpTooltip>
                                    )}

                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            const img = designerImage || designerRefImage;
                                            if (img) dispatch({ type: 'SET_INSPECT_IMAGE', payload: img });
                                        }}
                                        disabled={!designerImage && !designerRefImage}
                                        className={`bg-black/60 hover:bg-black/80 text-white p-2 rounded-full border border-white/10 backdrop-blur-sm transition-all active:scale-95 ${(!designerImage && !designerRefImage) ? 'opacity-30 cursor-not-allowed' : ''
                                            }`}
                                        title="Inspect Large"
                                    >
                                        <Maximize className="w-4 h-4" />
                                    </button>

                                    <div className="bg-black/60 px-3 py-1.5 rounded-full border border-white/10 text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] backdrop-blur-sm">
                                        Costume Designer
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="w-full h-full flex gap-4">
                            {/* SELECTOR COLUMN */}
                            <div className="w-80 shrink-0 flex flex-col space-y-4 h-full overflow-hidden">
                                <div className="bg-[#18181b] p-4 rounded-2xl border border-gray-800 flex flex-col h-full min-h-0 overflow-hidden">
                                    <div className="flex-grow min-h-0 overflow-y-auto pr-1 space-y-4 scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent">
                                        <div>
                                            <h3 className="text-xs font-black text-gray-400 uppercase mb-2 tracking-widest flex-shrink-0">1. Selected Subject</h3>
                                            <div className="grid grid-cols-4 gap-2 h-32 overflow-y-auto p-2 border border-gray-800/50 rounded-lg bg-black/20">
                                                {state.cast.map(c => (
                                                    <div
                                                        key={c.id}
                                                        className={`relative aspect-square rounded border transition-all overflow-hidden cursor-pointer group ${selectedCharacter?.id === c.id ? 'border-green-500 ring-1 ring-green-500' : 'border-gray-800 hover:border-gray-600'}`}
                                                    >
                                                        <img src={c.previewUrl || c.url} className="w-full h-full object-cover" onClick={() => setSelectedCharacter(c)} />
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                dispatch({ type: 'REMOVE_FROM_AVAILABLE_CAST', payload: { actorId: c.id } });
                                                            }}
                                                            title="Remove from available cast"
                                                            aria-label="Remove from available cast"
                                                            className="absolute top-1 right-1 !p-0 w-6 h-6 bg-black/80 hover:bg-red-500/90 text-gray-400 hover:text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10 flex items-center justify-center"
                                                        >
                                                            <X className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                ))}
                                                {state.cast.length === 0 && (
                                                    <div className="col-span-4 py-8 text-center text-[10px] text-gray-600 uppercase font-bold">No Cast</div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="bg-black/20 border border-white/5 rounded-xl p-3">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Selected Wardrobe</span>
                                                <span className={`text-[9px] font-bold ${selectedCostume ? 'text-emerald-300' : 'text-gray-500'} uppercase tracking-wider`}>
                                                    {selectedCostume ? (isDesignReferenceSelected(selectedCostume) ? 'Sketch/Pattern' : 'Costume') : 'None'}
                                                </span>
                                            </div>
                                            <div className="mt-2 text-xs text-gray-200 font-bold truncate">
                                                {selectedCostume ? selectedCostume.name : 'Choose from Library (or generate & save in Costume Designer).'}
                                            </div>

                                            {selectedCostume && (
                                                <div className="mt-3 h-44 rounded-lg border border-white/10 bg-black/30 overflow-hidden flex items-center justify-center">
                                                    <img src={selectedCostume.url} className="w-full h-full object-contain p-2" />
                                                </div>
                                            )}
                                        </div>

                                        <div>
                                            <h3 className="text-xs font-black text-gray-400 uppercase mb-2 tracking-widest border-t border-gray-800 pt-4 flex-shrink-0">2. Fitting Notes</h3>
                                            <textarea
                                                className="w-full bg-[#09090b] border border-[#27272a] p-3 rounded-lg text-xs text-gray-300 h-20 resize-none focus:border-yellow-500 focus:outline-none"
                                                placeholder="Optional: adjust the fit..."
                                                value={tryOnNote}
                                                onChange={(e) => setTryOnNote(e.target.value)}
                                            />
                                        </div>

                                        <div className="grid grid-cols-2 gap-2">
                                            <label className="block">
                                                <span className="block text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1">
                                                    3. Garment Fit
                                                </span>
                                                <select
                                                    value={tryOnGarmentFit}
                                                    onChange={(e) => setTryOnGarmentFit(e.target.value as TryOnGarmentFit)}
                                                    className="w-full bg-[#09090b] border border-[#27272a] px-2 py-2 rounded-lg text-[10px] text-gray-200 focus:border-yellow-500 focus:outline-none"
                                                >
                                                    {GARMENT_FIT_OPTIONS.map(option => (
                                                        <option key={option.value} value={option.value}>{option.label}</option>
                                                    ))}
                                                </select>
                                            </label>
                                            <label className="block">
                                                <span className="block text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1">
                                                    4. Fabric Behavior
                                                </span>
                                                <select
                                                    value={tryOnFabricBehavior}
                                                    onChange={(e) => setTryOnFabricBehavior(e.target.value as TryOnFabricBehavior)}
                                                    className="w-full bg-[#09090b] border border-[#27272a] px-2 py-2 rounded-lg text-[10px] text-gray-200 focus:border-yellow-500 focus:outline-none"
                                                >
                                                    {FABRIC_BEHAVIOR_OPTIONS.map(option => (
                                                        <option key={option.value} value={option.value}>{option.label}</option>
                                                    ))}
                                                </select>
                                            </label>
                                        </div>
                                    </div>

                                    <div className="mt-4 pt-3 border-t border-gray-800 flex-shrink-0">
                                        <button
                                            onClick={handleTryOn}
                                            disabled={
                                                state.isProcessing || 
                                                !selectedCharacter || 
                                                !selectedCostume ||
                                                (state.billingEntitlements.effectiveBillingMode === "byok" && !state.apiKey)
                                            }
                                            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white py-3 rounded-xl font-black text-[10px] uppercase tracking-[0.25em] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            Execute Virtual Try-On
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* RESULT COLUMN */}
                            <div className="flex-grow flex flex-row bg-black rounded-2xl overflow-hidden border border-gray-800 relative min-w-0">
                                <div
                                    ref={containerRef}
                                    onMouseDown={startInteraction}
                                    onMouseMove={moveInteraction}
                                    onMouseUp={endInteraction}
                                    onMouseLeave={endInteraction}
                                    className="flex-grow h-full bg-black flex items-center justify-center overflow-hidden relative group cursor-crosshair"
                                >
                                    {fittedImage ? (
                                        <>
                                            <img
                                                ref={tryOnImgRef}
                                                src={fittedImage}
                                                className="w-full h-full object-contain pointer-events-none"
                                            />

                                            {/* INTERACTION CANVASES */}
                                            <canvas ref={uiCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-50 opacity-50" />
                                            <canvas ref={restorationCanvasRef} className="hidden" />

                                            {/* Internal Processing Canvas (Hidden) */}
                                            <canvas ref={tryOnCanvasRef} className="hidden" />

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
                                        </>
                                    ) : (
                                        <div className="flex flex-col items-center opacity-10">
                                            <UserPlus className="w-24 h-24 mb-6" />
                                            <span className="text-sm font-black uppercase tracking-[0.5em]">Ready for Fitting</span>
                                        </div>
                                    )}

                                    <div className="absolute top-6 left-6 flex items-center gap-2 z-20">
                                        {!isRecentGenerationsOpen && hasRecentGenerations && (
                                            <HelpTooltip zone="wardrobe" id="showRecentGenerationsButton">
                                                <button
                                                    onClick={() => setIsRecentGenerationsOpen(true)}
                                                    aria-label="Show recent generations"
                                                    title="Show recent generations"
                                                    className="!p-0 bg-gray-500/10 hover:bg-gray-500 text-gray-400 hover:text-white w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-95 border border-gray-500/20"
                                                >
                                                    <History className="w-4 h-4" />
                                                </button>
                                            </HelpTooltip>
                                        )}

                                        <div className="bg-blue-600 text-[10px] font-black uppercase px-3 py-1 rounded-full text-white ">FITTING MIRROR</div>
                                        <div className="bg-black/40 backdrop-blur-md text-[9px] font-bold text-gray-300 px-3 py-1 rounded-full border border-white/10 uppercase tracking-widest">
                                            {selectedCharacter ? selectedCharacter.name : 'No Subject'} + {selectedCostume ? selectedCostume.name : 'No Costume'}
                                        </div>

                                        {(tryOnSheetFB || tryOnSheetLR) && (
                                            <div className="flex items-center gap-1 ml-2">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setTryOnDisplay('sheetFB'); }}
                                                    disabled={!tryOnSheetFB}
                                                    className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border transition-colors ${activeTryOnView === 'sheetFB' ? 'bg-blue-600 text-white border-blue-500 shadow-[0_0_10px_rgba(37,99,235,0.4)]' : 'bg-black/40 text-gray-400 border-white/10 hover:bg-white/10 hover:text-white'} disabled:opacity-40 disabled:cursor-not-allowed`}
                                                    title="Show Front/Back Sheet"
                                                >
                                                    FB
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setTryOnDisplay('sheetLR'); }}
                                                    disabled={!tryOnSheetLR}
                                                    className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border transition-colors ${activeTryOnView === 'sheetLR' ? 'bg-blue-600 text-white border-blue-500 shadow-[0_0_10px_rgba(37,99,235,0.4)]' : 'bg-black/40 text-gray-400 border-white/10 hover:bg-white/10 hover:text-white'} disabled:opacity-40 disabled:cursor-not-allowed`}
                                                    title="Show Left/Right Sheet"
                                                >
                                                    LR
                                                </button>
                                            </div>
                                        )}

                                    </div>

                                    {/* RECENT GENERATIONS STRIP (Try-On Room) */}
                                    {isRecentGenerationsOpen && hasRecentGenerations && (
                                        <div className="absolute bottom-2 left-0 right-0 z-50 pointer-events-none flex justify-center px-4 transition-all duration-200 ease-out opacity-100 translate-y-0">
                                            <div className="relative w-full max-w-3xl pointer-events-auto">
                                                <button
                                                    type="button"
                                                    className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-[60] bg-[#1a1a1c]/90 border border-white/10 rounded-full p-0.5 text-gray-400 hover:text-white hover:bg-black transition-colors shadow-lg"
                                                    aria-label="Hide recent generations"
                                                    title="Hide recent generations"
                                                    onClick={() => setIsRecentGenerationsOpen(false)}
                                                >
                                                    <ChevronDown className="w-4 h-4" />
                                                </button>
                                                <div className="transition-all duration-200 ease-out opacity-100 scale-100">
                                                    <RecentGenerationsStrip
                                                        studio="wardrobe"
                                                        className="w-full bg-black/80 backdrop-blur-md rounded-2xl border border-white/10"
                                                        onSelectGeneration={(gen) => {
                                                            tryOnOutputModeRef.current = 'front';
                                                            resetTryOnTurnaroundOutputs({
                                                                fittedImage: gen.displayUrl,
                                                                tryOnOutputMode: 'front'
                                                            });
                                                        }}
                                                        onExportGeneration={(gen) => {
                                                            tryOnOutputModeRef.current = 'front';
                                                            resetTryOnTurnaroundOutputs({
                                                                fittedImage: gen.displayUrl,
                                                                tryOnOutputMode: 'front'
                                                            });
                                                            handleOpenSaveModal(gen.displayUrl, gen.id);
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                </div>


                                <div className="w-96 shrink-0 border-l border-white/10 bg-[#18181b]/50 h-full flex flex-col">
                                    <div className="p-4 border-b border-white/10 flex items-center justify-between shrink-0">
                                        <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                                            Try-On Setup
                                        </h3>
                                    </div>

                                    <div className="flex-grow p-4 space-y-4 overflow-hidden">
                                        <div className="space-y-4">
                                                <div className="bg-black/30 border border-white/5 rounded-xl p-4 space-y-3">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div className="min-w-0">
                                                            <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 truncate">
                                                                Character Sheet (Identity Anchor)
                                                            </div>
                                                            <div className="text-[9px] text-gray-500 font-bold leading-relaxed">
                                                                Optional • Recommended for Turnaround.
                                                            </div>
                                                        </div>

                                                        <div className="shrink-0 flex items-center gap-1.5">
                                                            <button
                                                                type="button"
                                                                onClick={handleUseSelectedSubjectAsAnchor}
                                                                disabled={!selectedCharacter}
                                                                className="text-[9px] font-bold text-gray-200 hover:text-white disabled:text-gray-500 disabled:cursor-not-allowed bg-white/5 hover:bg-white/10 disabled:hover:bg-white/5 px-2.5 py-1 rounded-lg border border-white/10 transition-colors flex items-center gap-1.5"
                                                                title={selectedCharacter ? 'Use selected subject as identity anchor' : 'Select a subject first'}
                                                            >
                                                                <UserPlus className="w-3.5 h-3.5" /> Use Subject
                                                            </button>
                                                            <label className="text-[9px] font-bold text-gray-200 hover:text-white cursor-pointer bg-white/5 hover:bg-white/10 px-2.5 py-1 rounded-lg border border-white/10 transition-colors flex items-center gap-1.5">
                                                                <Upload className="w-3.5 h-3.5" /> Upload
                                                                <input type="file" className="hidden" accept="image/*" onClick={(e) => { (e.target as HTMLInputElement).value = ''; }} onChange={handleUploadTryOnCharacterSheet} />
                                                            </label>
                                                        </div>
                                                    </div>

                                                    <div className="bg-black/40 border border-white/10 rounded-lg p-2 flex items-center gap-3">
                                                        <div className="w-14 h-14 rounded-md border border-white/10 bg-black/30 overflow-hidden flex items-center justify-center shrink-0">
                                                            {tryOnCharacterSheet ? (
                                                                <img src={tryOnCharacterSheet} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <UserPlus className="w-6 h-6 opacity-20" />
                                                            )}
                                                        </div>

                                                        <div className="min-w-0">
                                                            <div className="text-xs text-gray-200 font-semibold leading-tight">
                                                                {tryOnCharacterSheetStatus}
                                                            </div>
                                                            {tryOnCharacterSheet && (
                                                                <button
                                                                    onClick={clearTryOnCharacterSheet}
                                                                    className="mt-2 text-[9px] font-bold text-red-400 hover:text-red-300 uppercase tracking-widest"
                                                                >
                                                                    Remove
                                                                </button>
                                                            )}
                                                            {!selectedCharacter && !tryOnCharacterSheet && (
                                                                <div className="mt-1 text-[9px] text-gray-500 font-bold">
                                                                    Select a subject first.
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="bg-black/30 border border-white/5 rounded-xl p-4 space-y-3">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">Output Views</div>
                                                        <div className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">
                                                            {tryOnOutputMode === 'front' ? '1 image' : '2 images'}
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-2">
                                                        <button
                                                            onClick={() => setTryOnOutputMode('front')}
                                                            className={`py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border ${tryOnOutputMode === 'front'
                                                                ? 'bg-blue-600 border-blue-500 text-white'
                                                                : 'bg-black/20 border-white/10 text-gray-300 hover:bg-white/5'
                                                                }`}
                                                        >
                                                            Front
                                                        </button>
                                                        <button
                                                            onClick={() => setTryOnOutputMode('turnaround')}
                                                            className={`py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border ${tryOnOutputMode === 'turnaround'
                                                                ? 'bg-blue-600 border-blue-500 text-white'
                                                                : 'bg-black/20 border-white/10 text-gray-300 hover:bg-white/5'
                                                                }`}
                                                        >
                                                            Turnaround
                                                        </button>
                                                    </div>

                                                    <p className="text-[9px] text-gray-500 leading-relaxed">
                                                        Turnaround generates two sheets: <span className="text-gray-300 font-bold">Front+Back</span> and <span className="text-gray-300 font-bold">Left+Right</span>.
                                                    </p>
                                                </div>

                                                <div className="bg-black/20 border border-white/5 rounded-xl p-3 flex items-center justify-between gap-3">
                                                    <div className="text-[9px] text-gray-500 font-bold leading-relaxed">
                                                        Upload Sketch/Costume + Branding in <span className="text-gray-300">Costume Designer</span>.
                                                    </div>
                                                    <button
                                                        onClick={() => setActiveTab('designer')}
                                                        className="shrink-0 bg-white/5 hover:bg-white/10 text-gray-200 px-3 py-2 rounded-lg border border-white/10 text-[9px] font-black uppercase tracking-wider"
                                                    >
                                                        Open
                                                    </button>
                                                </div>
                                            </div>
                                    </div>
                                    <div className="p-4 border-t border-white/10 bg-[#09090b]/50 shrink-0 space-y-3">
                                        <button onClick={handleAddToCast} className="w-full bg-emerald-500/10 hover:bg-emerald-500 text-emerald-500 hover:text-white py-3 rounded-lg transition-all flex items-center justify-center gap-2 border border-emerald-500/20 hover:-[0_0_15px_rgba(16,185,129,0.4)] text-[10px] font-black uppercase tracking-wider" title="Add to Session Cast">
                                            <UserPlus className="w-4 h-4" /> Add to Cast
                                        </button>

                                        <button onClick={() => handleOpenSaveModal()} className="w-full bg-purple-500/10 hover:bg-purple-500 text-purple-500 hover:text-white py-3 rounded-lg transition-all flex items-center justify-center gap-2 border border-purple-500/20 hover:-[0_0_15px_rgba(168,85,247,0.4)] text-[10px] font-black uppercase tracking-wider" title="Save to Actor Library">
                                            <FolderPlus className="w-4 h-4" /> Export to Library
                                        </button>

                                        <div className="grid grid-cols-2 gap-3">
                                            <button onClick={() => downloadImage(fittedImage!, `fitted-${selectedCharacter?.name || 'character'}.png`)} className="w-full bg-blue-600/10 hover:bg-blue-600 text-blue-500 hover:text-white py-3 rounded-lg transition-all flex items-center justify-center gap-2 border border-blue-500/20 hover:-[0_0_15px_rgba(37,99,235,0.4)] text-[10px] font-black uppercase tracking-wider" title="Download">
                                                <Download className="w-4 h-4" /> Save
                                            </button>
                                            <button onClick={() => {
                                                setSelectedCostume(null);
                                                updateState({
                                                    fittedImage: null,
                                                    tryOnMask: null,
                                                    restorationLayer: null,
                                                    removeBg: false,
                                                    history: [],
                                                    historyIndex: -1,
                                                    processedTryOnUrl: null,
                                                    tryOnOutputMode: 'front',
                                                    tryOnViews: null,
                                                    tryOnSheetFB: null,
                                                    tryOnSheetLR: null,
                                                    activeTryOnView: 'front'
                                                });
                                                tryOnOutputModeRef.current = 'front';
                                                useRecentGenerationsStore.getState().clearRecentGenerationsForStudio('wardrobe');
                                            }} className="w-full bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white py-3 rounded-lg transition-all flex items-center justify-center gap-2 border border-red-500/20 hover:-[0_0_15px_rgba(239,68,68,0.4)] text-[10px] font-black uppercase tracking-wider" title="Clear/Discard">
                                                <X className="w-4 h-4" /> Clear
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* RECENT GENERATIONS STRIP */}
                    {!fittedImage && (
                        <RecentGenerationsStrip
                            studio="wardrobe"
                            className="shrink-0 mt-2"
                            onSelectGeneration={(gen) => {
                                tryOnOutputModeRef.current = 'front';
                                resetTryOnTurnaroundOutputs({
                                    fittedImage: gen.displayUrl,
                                    tryOnOutputMode: 'front'
                                });
                            }}
                            onExportGeneration={(gen) => {
                                // Trigger the save modal flow with the selected generation
                                tryOnOutputModeRef.current = 'front';
                                resetTryOnTurnaroundOutputs({
                                    fittedImage: gen.displayUrl,
                                    tryOnOutputMode: 'front'
                                });
                                handleOpenSaveModal(gen.displayUrl, gen.id);
                            }}
                        />
                    )}


                    {/* SAVE TO LIBRARY MODAL (Refactored) */}
                    <ActorSaveModal
                        isOpen={showSaveModal}
                        initialName={newActorName}
                        onClose={() => {
                            setShowSaveModal(false);
                            setSaveSourceImage(null);
                            setSaveRecentGenerationId(null);
                        }}
                        onSave={(name, category) => {
                            setNewActorName(name);
                            setSaveCategory(category);
                            confirmSaveToLibrary(name, category);
                        }}
                        backgrounds={{
                            realism: styleRealism,
                            animation: styleAnimation,
                            illustration: styleIllustration,
                            scifi: styleScifi
                        }}
                    />
                    <ConfirmDialog
                        isOpen={!!confirmDelete}
                        onClose={() => setConfirmDelete(null)}
                        onConfirm={executeDelete}
                        title="Delete Costume?"
                        message={confirmDelete ? (
                            <>
                                Are you sure you want to delete <span className="text-white font-bold">{confirmDelete.name}</span>? This action cannot be undone.
                            </>
                        ) : ""}
                        confirmText="Delete"
                        cancelText="Cancel"
                        variant="danger"
                    />

                    {/* TOAST OVERLAY */}
                    <AnimatePresence>
                        {notification && (
                            <motion.div
                                initial={{ opacity: 0, y: 50 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 20 }}
                                className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-[#09090b] border border-yellow-500/50 text-white px-6 py-3 rounded-full backdrop-blur-xl z-[5000] flex items-center gap-3"
                            >
                                <CheckCircle2 className="w-5 h-5 text-yellow-500" />
                                <span className="text-xs font-bold uppercase tracking-widest">{notification}</span>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
};

export default WardrobeStudio;



