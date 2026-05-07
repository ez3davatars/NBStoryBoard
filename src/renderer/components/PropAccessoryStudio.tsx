import { useState, useEffect, useRef, useCallback } from 'react';
import {
    Package, RefreshCcw, Maximize, Sparkles,
    Download, X, Save, Upload, Trash2, ArrowRight, FolderOutput
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { GeminiService } from '../services/GeminiService';
import { nativeJoinPath, nativeListFiles, nativeWriteFile, isNativeParams } from '../utils/NativeFileAssets';
import type { PropItem, CastMember } from '../context/AppContext';
import ConfirmDialog from './ui/ConfirmDialog';
import ActorSaveModal from './ActorSaveModal';
import { LibraryAssetMaterializer } from '../services/LibraryAssetMaterializer';
import { WearableLandmarkService } from '../services/WearableLandmarkService';
import { WearableAnchorEngine } from '../services/WearableAnchorEngine';
import { WearableOverlayComposer } from '../services/WearableOverlayComposer';
import { WearableRefinementValidator } from '../services/WearableRefinementValidator';
import { WearableAdjustmentCanvas } from './WearableAdjustmentCanvas';
import type { WearableAnchorContract, WearablePlacement, WearableClass } from '../services/WearableAnchorEngine';
import { useRecentGenerationsStore } from '../stores/useRecentGenerationsStore';
import { RecentGenerationsCacheService } from '../services/RecentGenerationsCacheService';
import RecentGenerationsStrip from './recent/RecentGenerationsStrip';
import { createUniqueDownloadFilename } from '../utils/downloadFilenames';

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

const actorLibraryStyleForCategory = (category: string): string => {
    switch (category) {
        case 'anim':
            return 'family_3d';
        case 'illustration':
            return 'retro_anime';
        case 'scifi':
            return 'cyberpunk_neon';
        case 'realism':
        case 'uncategorized':
        default:
            return 'exact_studio';
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

const PropLibrarySkeletonCard = () => (
    <div className="aspect-square rounded-lg border border-gray-800 overflow-hidden bg-black/40 relative">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-[shimmer_1.8s_linear_infinite]" />
        <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10" />
        </div>
    </div>
);

const PropAccessoryStudio = () => {
    const [libraryLoading, setLibraryLoading] = useState(false);
    const [adjustmentState, setAdjustmentState] = useState<{
        subjectUrl: string;
        propUrl: string;
        fitClass: WearableClass;
        anchorContract: WearableAnchorContract;
        initialOffsetX?: number;
        initialOffsetY?: number;
        initialScale?: number;
    } | null>(null);
    const [lastConfirmedPlacement, setLastConfirmedPlacement] = useState<{
        placement: WearablePlacement;
        precompositeUrl: string;
        propId: string;
        offsets: {x: number, y: number, scaleMultiplier: number};
    } | null>(null);
    void lastConfirmedPlacement; // suppress TS6133
    const { state, dispatch } = useAppContext();
    const {
        activeTab,
        designerPrompt,
        designerImage,
        selectedProp,
        selectedCharacter,
        appliedImage,
        applyNote
    } = state.propStudioState;

    const setPropState = (payload: Partial<typeof state.propStudioState>) => {
        dispatch({ type: 'SET_PROP_STUDIO_STATE', payload });
    };

    const setActiveTab = (val: typeof activeTab) => setPropState({ activeTab: val });
    const setDesignerPrompt = (val: string) => setPropState({ designerPrompt: val });
    const setDesignerImage = (val: string | null) => setPropState({ designerImage: val });
    const setSelectedProp = (val: PropItem | null) => setPropState({ selectedProp: val });
    const setSelectedCharacter = (val: CastMember | null) => setPropState({ selectedCharacter: val });
    const setAppliedImage = (val: string | null) => setPropState({ appliedImage: val });
    const setApplyNote = (val: string) => setPropState({ applyNote: val });
    const [showActorSaveModal, setShowActorSaveModal] = useState(false);
    const [pendingActorSave, setPendingActorSave] = useState<{
        sourceUrl: string;
        initialName: string;
        recentGenerationId?: string;
    } | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);



    const withLibraryTransition = (work: () => void | Promise<void>, minMs = 180) => {
        setLibraryLoading(true);
        const started = Date.now();

        Promise.resolve(work()).finally(() => {
            const elapsed = Date.now() - started;
            const remaining = Math.max(0, minMs - elapsed);
            window.setTimeout(() => setLibraryLoading(false), remaining);
        });
    };

    const scanProps = useCallback(async () => {
        // 1. NATIVE MODE
        if (isNativeParams() && state.saveDirectoryPath) {
            try {
                const propsPath = await nativeJoinPath(state.saveDirectoryPath, 'props');
                const files = await nativeListFiles(propsPath);
                const items: PropItem[] = [];

                for (const filename of files) {
                    if (/\.(png|jpg|jpeg|webp)$/i.test(filename)) {
                        const fullPath = await nativeJoinPath(propsPath, filename);
                        const base64 = await window.electronAPI?.readFile?.(fullPath);
                        if (base64) {
                            items.push({
                                id: filename,
                                url: `data:image/png;base64,${base64}`,
                                localPath: fullPath,
                                filename: filename,
                                name: filename.replace('.png', '').split('-').slice(1).join(' '),
                                prompt: "Saved prop asset",
                                timestamp: Date.now() // Native list doesn't give timestamp easily yet, using Now serves sort-of-ok or we can stat
                            });
                        }
                    }
                }
                dispatch({ type: 'SET_PROP_ITEMS', payload: items.sort((a, b) => b.timestamp - a.timestamp) });
            } catch {
                // Folder might not exist yet, which is fine
            }
            return;
        }

        // 2. WEB MODE
        if (!state.saveDirectoryHandle) return;
        try {
            const saveDirectoryHandle = state.saveDirectoryHandle as PermissionAwareDirectoryHandle;
            if (saveDirectoryHandle.queryPermission && (await saveDirectoryHandle.queryPermission({ mode: 'read' })) !== 'granted') return;

            const propsHandle = await state.saveDirectoryHandle.getDirectoryHandle('props', { create: true });
            const items: PropItem[] = [];
            const iterablePropsHandle = propsHandle as PermissionAwareDirectoryHandle;
            if (!iterablePropsHandle.values) return;
            for await (const entry of iterablePropsHandle.values()) {
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
                        prompt: "Saved prop asset",
                        timestamp: file.lastModified
                    });
                }
            }
            dispatch({ type: 'SET_PROP_ITEMS', payload: items.sort((a, b) => b.timestamp - a.timestamp) });
        } catch (error: unknown) {
            dispatch({ type: 'ADD_LOG', payload: { message: `Props scan failed: ${getErrorMessage(error)}`, type: 'error' } });
        }
    }, [dispatch, state.saveDirectoryHandle, state.saveDirectoryPath]);



    const [confirmDelete, setConfirmDelete] = useState<PropItem | null>(null);

    const executeDelete = async () => {
        if (!confirmDelete) return;
        const item = confirmDelete;

        try {
            let deleted = false;
            if (state.saveDirectoryPath && window.electronAPI?.deleteFile && window.electronAPI?.joinPath) {
                const filePath = await window.electronAPI.joinPath(state.saveDirectoryPath, 'props', item.id);
                deleted = await window.electronAPI.deleteFile(filePath);
            }

            if (!deleted && state.saveDirectoryHandle) {
                const propsHandle = await state.saveDirectoryHandle.getDirectoryHandle('props', { create: false });
                await propsHandle.removeEntry(item.id);
                deleted = true;
            }

            if (!deleted) throw new Error("File deletion failed or permission denied on disk.");

            // Update State
            const newItems = state.propItems.filter(p => p.id !== item.id);
            dispatch({ type: 'SET_PROP_ITEMS', payload: newItems });
            if (selectedProp?.id === item.id) setSelectedProp(null);
            dispatch({ type: 'ADD_LOG', payload: { message: `Deleted prop: ${item.name}`, type: 'success' } });

        } catch (error: unknown) {
            dispatch({ type: 'ADD_LOG', payload: { message: `Delete failed: ${getErrorMessage(error)}`, type: 'error' } });
        } finally {
            setConfirmDelete(null);
        }
    };

    const handleUploadProp = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const file = e.target.files[0];

        try {
            // DUPLICATE CHECK
            if (state.propItems.some(p => p.id.includes(file.name) || p.name === file.name.split('.')[0])) {
                alert("Item already exists in library.");
                return;
            }

            const safeName = `Custom-Prop-${Date.now()}-${file.name.replace(/[^a-z0-9.]/gi, '_')}`;

            // 1. NATIVE MODE
            if (isNativeParams() && state.saveDirectoryPath) {
                const propsPath = await nativeJoinPath(state.saveDirectoryPath, 'props');
                // Ensure props folder exists (implied or we might fail writing if parent doesn't exist, Electron typically handles? No, usually need fs.mkdir. 
                // Assuming main process ensures 'props' exists or writeFile does recursive? 
                // Safest to just try write with the path.
                const fullPath = await nativeJoinPath(propsPath, safeName);
                const success = await nativeWriteFile(fullPath, file);

                if (!success) {
                    throw new Error("Native write failed");
                }
            }
            // 2. WEB MODE
            else if (state.saveDirectoryHandle) {
                const propsHandle = await state.saveDirectoryHandle.getDirectoryHandle('props', { create: true });
                const fileHandle = await propsHandle.getFileHandle(safeName, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(file);
                await writable.close();
            } else {
                return; // No save method
            }

            // Read for immediate display
            const reader = new FileReader();
            reader.onload = async () => {
                const dataUrl = reader.result as string;

                let localPath: string | undefined;
                if (isNativeParams() && state.saveDirectoryPath) {
                    const propsPath = await nativeJoinPath(state.saveDirectoryPath, 'props');
                    localPath = await nativeJoinPath(propsPath, safeName);
                }

                const newItem: PropItem = {
                    id: safeName,
                    url: dataUrl,
                    localPath: localPath,
                    filename: safeName,
                    name: file.name.split('.')[0].substring(0, 20),
                    prompt: "User Upload",
                    timestamp: Date.now()
                };
                dispatch({ type: 'ADD_PROP_ITEM', payload: newItem });
                dispatch({ type: 'ADD_LOG', payload: { message: `Uploaded: ${file.name}`, type: 'success' } });
            };
            reader.readAsDataURL(file);

        } catch (error: unknown) {
            dispatch({ type: 'ADD_LOG', payload: { message: `Upload failed: ${getErrorMessage(error)}`, type: 'error' } });
        } finally {
            // Reset input
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    useEffect(() => {
        scanProps();
    }, [scanProps]);
    // --- Reference Slot quick-bind (Shift+Click power-user shortcut) ---
    const bindToFirstEmptyRefSlot = (url: string, name: string) => {
        const slots = state.referenceSlots || [];
        if (!slots.length) {
            dispatch({ type: 'ADD_LOG', payload: { message: 'No reference slots available to bind.', type: 'error' } });
            return;
        }
        const slot = slots.find((s) => !s.url) ?? slots[0];
        const index = typeof slot.index === 'number' ? slot.index : 0;

        dispatch({
            type: 'UPDATE_REF_SLOT',
            payload: {
                index,
                updates: {
                    url,
                    name,
                    active: true,
                    status: 'ready',
                    analysis: '',
                },
            },
        });

        dispatch({
            type: 'ADD_LOG',
            payload: { message: `Bound to Reference Slot ${index + 1}: ${name}`, type: 'success' },
        });
    };



    const saveToProps = async (imageUrl: string, prompt: string) => {
        if (!state.saveDirectoryHandle && !state.saveDirectoryPath) return; // Need at least one
        try {
            const mat = await LibraryAssetMaterializer.materializePropAsset({
                sourceUrl: imageUrl,
                saveDirectoryPath: state.saveDirectoryPath
            });

            const newItem: PropItem = {
                id: mat.filename || `PROP-${Date.now()}.png`,
                url: mat.url,
                localPath: mat.localPath || undefined,
                sourceUrl: mat.sourceUrl,
                filename: mat.filename,
                name: prompt.substring(0, 20),
                prompt: prompt,
                timestamp: Date.now()
            };
            dispatch({ type: 'ADD_PROP_ITEM', payload: newItem });
            
            // Immediate local pivot
            if (mat.url) setDesignerImage(mat.url);
            dispatch({ type: 'ADD_LOG', payload: { message: `Prop saved to library: ${mat.filename || "Storage"}`, type: 'success' } });
        } catch (error: unknown) {
            dispatch({ type: 'ADD_LOG', payload: { message: `Failed to save prop: ${getErrorMessage(error)}`, type: 'error' } });
        }
    };

    const handleDesignerGenerate = async () => {
        const billingMode = state.billingEntitlements.effectiveBillingMode;

        if (!designerPrompt) {
            dispatch({
                type: 'ADD_LOG',
                payload: { message: 'Enter a prop description first.', type: 'error' }
            });
            return;
        }

        if (billingMode === 'byok' && !state.apiKey) {
            dispatch({
                type: 'ADD_LOG',
                payload: { message: 'API Key required for BYOK Prop Designer.', type: 'error' }
            });
            return;
        }

        dispatch({ type: 'SET_PROCESSING', payload: true });

        let currentPercent = 5;
        dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: { percent: currentPercent, text: "Designing Prop" } });
        const etaMs = state.imageResolution === '4K' ? 35000 : (state.imageResolution === '2K' ? 25000 : 15000);
        const increment = (1000 / etaMs) * 100;
        const progressInterval = window.setInterval(() => {
            currentPercent += increment;
            if (currentPercent > 95) currentPercent = 95;

            let text = "Designing Prop";
            if (currentPercent > 30) text = "Refining Object Geometry...";
            if (currentPercent > 60) text = "Applying Materials & Textures...";
            if (currentPercent > 80) text = "Finalizing Render...";
            if (currentPercent >= 95) text = "Finalizing Render... (Still working, please wait)";

            dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: { percent: currentPercent, text } });
        }, 1000);

        const submittedAt = Date.now();
        let actualAcceptedAt = 0;

        try {
            let actualGenId = '';
            const res = await GeminiService.generateImage(
                `Create a single image.

PROP AUTHORITY
- Create one standalone prop based exactly on this description: ${designerPrompt}.
- Preserve the intended shape, silhouette, proportions, materials, and visible construction.
- Do not add extra objects, extra parts, extra straps, text, labels, hands, people, or scenery.

RENDER RULES
- Professional standalone object photography.
- High detail texture.
- Realistic studio lighting.
- Solid black studio background (#000000) only.
- Single prop only, centered, fully visible.

NEGATIVE CONSTRAINTS:
extra objects, duplicate prop, altered proportions, floating parts, text, label, watermark, people, hands, scenery, pedestal, table, stand.`,
                state.apiKey,
                state.model,
                [],
                { 
                    aspectRatio: '1:1', imageSize: state.imageResolution, thinkingLevel: state.enableImageThinking, googleGrounding: false, strictMode: true, billingMode: state.billingEntitlements.effectiveBillingMode as 'hosted'|'byok', entitlements: state.billingEntitlements,
                    onJobAccepted: (id, acceptedAt) => {
                        actualGenId = id;
                        actualAcceptedAt = acceptedAt || Date.now();
                        dispatch({ type: 'ADD_BACKGROUND_JOB', payload: { id, status: 'polling_foreground', context: 'prop_designer', startedAt: Date.now(), timing: { submittedAt, edgeAcceptedAt: actualAcceptedAt } } });
                    }
                }
            );

            if (actualGenId) dispatch({ type: 'REMOVE_BACKGROUND_JOB', payload: actualGenId });

            const rawUrl = res;

            let safeUrl = rawUrl;
            try {
                safeUrl = await materializeDisplayUrl(rawUrl);
            } catch (e) {
                console.warn("Failed to materialize prop designer result:", e);
            }

            setDesignerImage(safeUrl);
            dispatch({ type: 'ADD_LOG', payload: { message: "Prop generated on black studio background.", type: 'success' } });

            // --- RECENT GENERATIONS: Cache result silently ---
            const recentStore = useRecentGenerationsStore.getState();
            if (recentStore.cacheDirPath && safeUrl) {
                RecentGenerationsCacheService.cacheGeneration({
                    imageDataUrl: safeUrl,
                    studio: 'props',
                    cacheDirPath: recentStore.cacheDirPath,
                }).then((cacheResult) => {
                    if (cacheResult.success && cacheResult.localCachePath && cacheResult.displayUrl) {
                        recentStore.addRecentGeneration({
                            studio: 'props',
                            localCachePath: cacheResult.localCachePath,
                            displayUrl: cacheResult.displayUrl,
                            createdAt: Date.now(),
                            prompt: designerPrompt,
                            mode: (state.billingEntitlements.effectiveBillingMode as 'hosted' | 'byok') || 'byok',
                        });
                    }
                }).catch((e) => {
                    console.warn('[PropDesigner] Recent generation caching failed:', e);
                });
            }
        } catch (error: unknown) {
            if (isPendingGenerationError(error) && error.generationId) {
                dispatch({ type: 'UPDATE_BACKGROUND_JOB', payload: { id: error.generationId, updates: { status: 'pending_background', timing: { submittedAt, edgeAcceptedAt: actualAcceptedAt, clientTimeoutAt: Date.now() } } } });
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



    const executeRefinement = async (fitClass: WearableClass, subjectUrl: string, propUrl: string, lockedPlacement: WearablePlacement, precompositeUrl: string) => {
        console.warn(`[DEBUG_PATH] executeRefinement called for ${fitClass}`);
        let finalUrl = precompositeUrl;
        let refinementAccepted = false;

        dispatch({
            type: 'ADD_LOG',
            payload: { message: 'Running wearable refinement pass...', type: 'info' }
        });

        const lockedRefinementPrompt = `Create a single image.

[IMAGE 1] is the exact subject.
[IMAGE 2] is the exact ${fitClass} reference.
[IMAGE 3] is the locked precomposite geometry that must be preserved exactly.

PRIMARY RULE
- IMAGE 3 already contains the correct wearable size and placement.
- Preserve the geometry from IMAGE 3 exactly.
- Do not resize the wearable.
- Do not reposition the wearable.
- Do not rotate the wearable.
- Do not redesign the wearable.
- Treat the wearable in IMAGE 3 as placement-locked and scale-locked.

ALLOWED CHANGES ONLY
- Improve edge integration.
- Add subtle realistic overlap where appropriate (e.g. hair over straps).
- Add subtle contact shadowing.
- Improve realism of blending and material response.
- Clean compositing artifacts only.

FORBIDDEN CHANGES
- No enlargement.
- No shrinkage.
- No re-centering.
- No floating placement.
- No theatrical scale.
- No identity change.
- No pose change.
- No wardrobe change.
- No background change.

OUTPUT GOAL
- The final image must look exactly like IMAGE 3 geometrically, but naturally integrated.
- When uncertain, preserve IMAGE 3 rather than changing geometry.

NEGATIVE CONSTRAINTS
oversized wearable, resized wearable, moved wearable, floating wearable, theatrical overscaling, altered subject, changed pose, changed wardrobe, changed background, text, watermark.`;

        try {
            const refinedRes = await GeminiService.generateImage(
                lockedRefinementPrompt,
                state.apiKey,
                state.model,
                [
                    { url: subjectUrl, label: 'Subject Reference' },
                    { url: propUrl, label: `${fitClass} Reference` },
                    { url: precompositeUrl, label: 'Locked Wearable Overlay' }
                ],
                {
                    aspectRatio: '1:1',
                    imageSize: state.imageResolution,
                    thinkingLevel: state.enableImageThinking,
                    googleGrounding: false,
                    strictMode: true,
                    billingMode: state.billingEntitlements.effectiveBillingMode as 'hosted' | 'byok',
                    entitlements: state.billingEntitlements
                }
            );

            const refinedRaw = refinedRes;

            if (refinedRaw) {
                const materializedRefined = await materializeDisplayUrl(refinedRaw);
                const isValid = await WearableRefinementValidator.validate({
                    refinedUrl: materializedRefined,
                    lockedPlacement,
                    fitClass
                });

                if (isValid) {
                    finalUrl = materializedRefined;
                    refinementAccepted = true;
                } else {
                    console.warn('Refined wearable result drifted; keeping locked precomposite.');
                    dispatch({
                        type: 'ADD_LOG',
                        payload: { message: 'Refinement rejected due to drift; keeping locked overlay.', type: 'error' }
                    });
                }
            }
        } catch (e) {
            console.warn('Failed to materialize or validate refined wearable result:', e);
            dispatch({ type: 'ADD_LOG', payload: { message: 'Refinement failed; using locked overlay.', type: 'info' } });
        }

        setAppliedImage(finalUrl);

        dispatch({
            type: 'ADD_LOG',
            payload: {
                message: refinementAccepted
                    ? 'Wearable integrated with locked refinement.'
                    : 'Wearable integrated using locked pre-fit overlay.',
                type: 'info'
            }
        });
    };

    const handleConfirmFit = async (placement: WearablePlacement, precompositeUrl: string, persistedOffsets: {x: number, y: number, scaleMultiplier: number}) => {
        console.warn(`[DEBUG_PATH] handleConfirmFit called`);
        if (!adjustmentState) return;
        const { fitClass, subjectUrl, propUrl } = adjustmentState;
        
        setAdjustmentState(null);
        setLastConfirmedPlacement({
            placement,
            precompositeUrl,
            propId: selectedProp?.id || '',
            offsets: persistedOffsets
        });

        dispatch({ type: 'SET_PROCESSING', payload: true });
        let currentPercent = 5;
        dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: { percent: currentPercent, text: "Integrating Prop" } });
        const progressInterval = window.setInterval(() => {
            currentPercent += 20;
            if (currentPercent > 95) currentPercent = 95;
            dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: { percent: currentPercent, text: "Finalizing Output..." } });
        }, 1000);

        try {
            if (fitClass === 'headwear') {
                console.warn(`[DEBUG_PATH] headwear bypass: skipping full-frame refinement per architectural rule`);
                setAppliedImage(precompositeUrl);
                dispatch({
                    type: 'ADD_LOG',
                    payload: { message: 'Wearable integrated using direct locked composite (Refinement bypassed).', type: 'info' }
                });
            } else {
                await executeRefinement(fitClass, subjectUrl, propUrl, placement, precompositeUrl);
            }
        } catch (error: unknown) {
            dispatch({ type: 'ADD_LOG', payload: { message: getErrorMessage(error), type: 'error' } });
        } finally {
            clearInterval(progressInterval);
            dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: null });
            dispatch({ type: 'SET_PROCESSING', payload: false });
        }
    };

    const handleApply = async () => {
        console.warn(`[DEBUG_PATH] handleApply invoked! Button was clicked.`);
        const billingMode = state.billingEntitlements.effectiveBillingMode;

        if (!selectedCharacter || !selectedProp) {
            dispatch({
                type: 'ADD_LOG',
                payload: { message: 'Select both a subject and a prop before applying.', type: 'error' }
            });
            return;
        }

        if (billingMode === 'byok' && !state.apiKey) {
            dispatch({
                type: 'ADD_LOG',
                payload: { message: 'API Key required for BYOK Prop Application.', type: 'error' }
            });
            return;
        }
        
        dispatch({
            type: 'ADD_LOG',
            payload: {
                message: `Starting Prop Application (${state.billingEntitlements.effectiveBillingMode.toUpperCase()})...`,
                type: 'info'
            }
        });


        dispatch({ type: 'SET_PROCESSING', payload: true });

        let currentPercent = 5;
        dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: { percent: currentPercent, text: "Integrating Prop" } });
        const etaMs = state.imageResolution === '4K' ? 35000 : (state.imageResolution === '2K' ? 25000 : 15000);
        const increment = (1000 / etaMs) * 100;
        const progressInterval = window.setInterval(() => {
            currentPercent += increment;
            if (currentPercent > 95) currentPercent = 95;

            let text = "Integrating Prop";
            if (currentPercent > 30) text = "Matching Lighting & Perspective...";
            if (currentPercent > 60) text = "Blending Elements...";
            if (currentPercent > 80) text = "Finalizing Output...";
            if (currentPercent >= 95) text = "Finalizing Output... (Still working, please wait)";

            dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: { percent: currentPercent, text } });
        }, 1000);

        const submittedAt = Date.now();
        let actualAcceptedAt = 0;

        try {
            let actualGenId = '';
            const fitClass = WearableAnchorEngine.inferClass(selectedProp?.name, selectedProp?.prompt, applyNote);
            const subtype = fitClass === 'headwear' ? WearableAnchorEngine.inferHeadwearSubtype(selectedProp?.name, selectedProp?.prompt, applyNote) : undefined;
            const subjectUrl = selectedCharacter.previewUrl || selectedCharacter.url;

            console.warn(`[DEBUG_PATH] fitClass inferred: ${fitClass} for prop: ${selectedProp?.name}`);

            if (fitClass === 'headwear' || fitClass === 'eyewear') {
                console.warn(`[DEBUG_PATH] Deterministic branch entered for: ${fitClass}`);
                dispatch({
                    type: 'ADD_LOG',
                    payload: { message: `Building deterministic wearable overlay for ${fitClass}...`, type: 'info' }
                });

                const framedSubjectUrl = await WearableOverlayComposer.buildFramedSubject(subjectUrl, state.imageResolution);

                const landmarks = await WearableLandmarkService.detect(framedSubjectUrl);
                const placement = WearableAnchorEngine.computePlacement(fitClass, landmarks, applyNote, subtype);
                
                if (fitClass === 'headwear') {
                    console.warn(`[DEBUG_PATH] headwear branch entered`);
                    
                    const reuseOffsets = lastConfirmedPlacement?.propId === selectedProp.id 
                        ? lastConfirmedPlacement.offsets 
                        : null;

                    setAdjustmentState({
                        subjectUrl: framedSubjectUrl,
                        propUrl: selectedProp.url,
                        fitClass,
                        anchorContract: placement,
                        initialOffsetX: reuseOffsets?.x,
                        initialOffsetY: reuseOffsets?.y,
                        initialScale: reuseOffsets?.scaleMultiplier
                    });
                    console.warn(`[DEBUG_PATH] adjustmentState set`);
                    
                    clearInterval(progressInterval);
                    dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: null });
                    dispatch({ type: 'SET_PROCESSING', payload: false });
                    console.warn(`[DEBUG_PATH] early return executed for confirm mode`);
                    return;
                }

                console.warn(`[DEBUG_PATH] old deterministic auto-apply pipeline entered for ${fitClass}`);

                const overlay = await WearableOverlayComposer.compose({
                    subjectUrl: framedSubjectUrl,
                    propUrl: selectedProp.url,
                    anchorContract: placement
                });

                setAppliedImage(overlay.precompositeUrl);

                dispatch({
                    type: 'ADD_LOG',
                    payload: {
                        message: 'Locked wearable fit established. Refinement will preserve this geometry.',
                        type: 'info'
                    }
                });

                await executeRefinement(fitClass, subjectUrl, selectedProp.url, overlay.placement, overlay.precompositeUrl);
            } else {
                const res = await GeminiService.generateImage(
                    `Create a single image.

SUBJECT LOCK
- [IMAGE 1] is the target SUBJECT.
- Preserve the subject exactly: same face, same body, same pose, same camera angle.
- Output must contain exactly one human subject.

PROP AUTHORITY
- [IMAGE 2] is the standalone PROP reference.
- Copy the prop exactly. Preserve exact shape, silhouette, colors, materials, visible construction, and proportions.
- Do not redesign, stylize, recolor, age, or decorate the prop.

PLACEMENT LOCK
- Place the prop only at this requested location: ${applyNote || "Clean professional placement in the correct grasp or on-body position."}
- Pay strict attention to left/right instructions.
- Preserve correct real-world scale relative to the subject.
- Do not add extra props, straps, attachments, duplicates, or supporting objects unless visible in the prop reference.

INTEGRATION
- Match lighting and perspective to the subject.
- The prop must look physically present, not composited.
- Keep the solid black studio background (#000000).

NEGATIVE CONSTRAINTS:
extra props, duplicated prop, wrong hand, wrong side, wrong scale, altered prop colors, altered prop materials, prop redesign, extra straps, extra attachments, extra people, text, watermark.`,
                    state.apiKey,
                    state.model,
                    [
                        { url: subjectUrl, label: "Subject Reference" },
                        { url: selectedProp.url, label: "Prop Reference" }
                    ],
                    {
                        aspectRatio: '1:1',
                        imageSize: state.imageResolution,
                        thinkingLevel: state.enableImageThinking,
                        googleGrounding: false,
                        strictMode: true,
                        billingMode: state.billingEntitlements.effectiveBillingMode as 'hosted' | 'byok',
                        entitlements: state.billingEntitlements,
                        onJobAccepted: (id, acceptedAt) => {
                            actualGenId = id;
                            actualAcceptedAt = acceptedAt || Date.now();
                            dispatch({
                                type: 'ADD_BACKGROUND_JOB',
                                payload: {
                                    id,
                                    status: 'polling_foreground',
                                    context: 'prop_applied',
                                    startedAt: Date.now(),
                                    timing: { submittedAt, edgeAcceptedAt: actualAcceptedAt }
                                }
                            });
                        }
                    }
                );

                if (actualGenId) dispatch({ type: 'REMOVE_BACKGROUND_JOB', payload: actualGenId });

                const rawUrl = res;

                let safeUrl = rawUrl;
                try {
                    safeUrl = await materializeDisplayUrl(rawUrl);
                } catch (e) {
                    console.warn("Failed to materialize applied prop result:", e);
                }

                setAppliedImage(safeUrl);
                dispatch({ type: 'ADD_LOG', payload: { message: "Prop integrated.", type: 'info' } });

                // --- RECENT GENERATIONS: Cache applied prop result ---
                const recentStore = useRecentGenerationsStore.getState();
                if (recentStore.cacheDirPath && safeUrl) {
                    RecentGenerationsCacheService.cacheGeneration({
                        imageDataUrl: safeUrl,
                        studio: 'props',
                        cacheDirPath: recentStore.cacheDirPath,
                    }).then((cacheResult) => {
                        if (cacheResult.success && cacheResult.localCachePath && cacheResult.displayUrl) {
                            recentStore.addRecentGeneration({
                                studio: 'props',
                                localCachePath: cacheResult.localCachePath,
                                displayUrl: cacheResult.displayUrl,
                                createdAt: Date.now(),
                                prompt: applyNote || 'Prop application',
                                mode: (state.billingEntitlements.effectiveBillingMode as 'hosted' | 'byok') || 'byok',
                            });
                        }
                    }).catch((e) => {
                        console.warn('[PropApp] Recent generation caching failed:', e);
                    });
                }
            }

        } catch (error: unknown) {
            if (isPendingGenerationError(error) && error.generationId) {
                dispatch({ type: 'UPDATE_BACKGROUND_JOB', payload: { id: error.generationId, updates: { status: 'pending_background', timing: { submittedAt, edgeAcceptedAt: actualAcceptedAt, clientTimeoutAt: Date.now() } } } });
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

    const handleSendToCastForge = () => {
        if (!appliedImage) return;
        dispatch({ type: 'SET_LAST_CASTED_IMAGE', payload: appliedImage });
        dispatch({ type: 'SET_LAST_CASTED_PROMPT', payload: `Prop application result: ${applyNote || ''}` });
        dispatch({ type: 'SET_VIEW', payload: 'casting' });
    };


    const openActorSaveModal = (sourceUrl = appliedImage || '', recentGenerationId?: string) => {
        if (!sourceUrl) return;
        setPendingActorSave({
            sourceUrl,
            initialName: `${selectedCharacter?.name || 'Prop Actor'} (Prop)`,
            recentGenerationId,
        });
        setShowActorSaveModal(true);
    };

    const handleSaveToActors = async (name: string, category: string) => {
        const finalUrl = pendingActorSave?.sourceUrl || appliedImage;
        if (!finalUrl) return;
        try {
            const mat = await LibraryAssetMaterializer.materializeCastAsset({
                sourceUrl: finalUrl,
                saveDirectoryPath: state.saveDirectoryPath,
                actorName: name,
                category
            });

            dispatch({
                type: 'ADD_ACTOR_LIBRARY',
                payload: {
                    id: crypto.randomUUID(),
                    url: mat.previewUrl,
                    localPath: mat.localPath || undefined,
                    sourceUrl: mat.sourceUrl,
                    previewUrl: mat.previewUrl,
                    filename: mat.filename,
                    tag: 'front',
                    name,
                    profile: {
                        identity: selectedCharacter?.profile?.identity || "Unknown",
                        wardrobe: selectedCharacter?.profile?.wardrobe || "",
                        accessories: selectedProp?.name || "Prop",
                        style: actorLibraryStyleForCategory(category)
                    }
                }
            });
            
            // Immediate UX pivot
            if (mat.previewUrl && finalUrl === appliedImage) setAppliedImage(mat.previewUrl);
            if (pendingActorSave?.recentGenerationId) {
                useRecentGenerationsStore.getState().markExported(pendingActorSave.recentGenerationId);
            }
            
            dispatch({ type: 'ADD_LOG', payload: { message: `Saved to Actor Library: ${mat.filename || name}`, type: 'success' } });
            setShowActorSaveModal(false);
            setPendingActorSave(null);
        } catch (error: unknown) {
            dispatch({ type: 'ADD_LOG', payload: { message: `Failed to save actor: ${getErrorMessage(error)}`, type: 'error' } });
        }
    };

    return (
        <div className="h-full min-h-0 min-w-0 bg-[#0f0f11] flex overflow-hidden">
            <div className="w-96 border-r border-gray-800 bg-[#18181b] flex flex-col min-h-0">
                <div className="p-4 border-b border-gray-800 flex justify-between items-center shrink-0">
                    <h2 className="text-sm font-black text-white tracking-widest uppercase">Prop Library</h2>
                    <div className="flex gap-1.5">
                        <input
                            type="file"
                            ref={fileInputRef}
                            className="hidden"
                            accept="image/png,image/jpeg,image/webp"
                            onClick={(e) => { (e.target as HTMLInputElement).value = ''; }}
                            onChange={handleUploadProp}
                        />
                        <button onClick={() => fileInputRef.current?.click()} className="p-1.5 hover:bg-gray-700 rounded transition-colors text-gray-400" title="Upload Prop">
                            <Upload className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => withLibraryTransition(scanProps)} className="p-1.5 hover:bg-gray-700 rounded transition-colors text-gray-400">
                            <RefreshCcw className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                <div className="flex-grow min-h-0 overflow-y-auto custom-scrollbar p-4 space-y-4">
                    <div className="grid grid-cols-2 gap-2">
                        {libraryLoading ? (
                            Array.from({ length: 8 }).map((_, i) => (
                                <PropLibrarySkeletonCard key={`prop-skeleton-${i}`} />
                            ))
                        ) : (
                            state.propItems.map(item => (
                                <div
                                    key={item.id}
                                    onClick={(e) => {
                                        if (e.shiftKey) {
                                            bindToFirstEmptyRefSlot(item.url, item.name || 'Prop');
                                            return;
                                        }
                                        setSelectedProp(item);
                                    }}
                                    className={`aspect-square rounded-lg border overflow-hidden transition-all group relative cursor-pointer ${selectedProp?.id === item.id ? 'border-blue-500 border-2' : 'border-gray-800 hover:border-gray-600'}`}
                                >
                                    <img src={item.url} className="w-full h-full transition-transform group-hover:scale-110 object-contain" draggable={false} />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                        <button
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                dispatch({ type: 'SET_INSPECT_IMAGE', payload: item.url });
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' || e.key === ' ') {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    dispatch({ type: 'SET_INSPECT_IMAGE', payload: item.url });
                                                }
                                            }}
                                            className="bg-blue-500/80 hover:bg-blue-500 text-white p-1.5 rounded-full"
                                            title="Inspect Large"
                                        >
                                            <Maximize className="w-3.5 h-3.5" />
                                        </button>

                                        <button
                                            onClick={(e) => { e.stopPropagation(); setConfirmDelete(item); }}
                                            className="bg-red-500/80 hover:bg-red-500 text-white p-1.5 rounded-full transition-transform hover:scale-110"
                                            title="Delete Prop"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>

                                    <span className="text-[8px] font-bold text-white uppercase truncate absolute bottom-2 left-2 right-2 text-center">{item.name}</span>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            <div className="flex-grow min-w-0 flex flex-col bg-[#09090b]">
                <div className="flex shrink-0 overflow-x-auto custom-scrollbar bg-[#18181b] px-4 pt-4 gap-4 border-b border-gray-800">
                    <button onClick={() => setActiveTab('designer')} className={`pb-3 px-4 text-xs font-bold uppercase tracking-widest border-b-2 transition-all ${activeTab === 'designer' ? 'border-blue-500 text-blue-500' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>Prop Designer</button>
                    <button onClick={() => setActiveTab('library')} className={`pb-3 px-4 text-xs font-bold uppercase tracking-widest border-b-2 transition-all ${activeTab === 'library' ? 'border-blue-500 text-blue-500' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>Application Room</button>
                </div>

                <div className="flex-grow min-h-0 overflow-hidden p-4 flex flex-col">
                    {activeTab === 'designer' ? (
                        <>
                        <div className="w-full h-full flex gap-6 min-h-0 min-w-0 overflow-hidden">
                            {/* LEFT: DESIGN CONTROLS */}
                            <div className="w-[clamp(18rem,34vw,380px)] shrink-0 flex flex-col h-full min-h-0">
                                <div className="flex-1 bg-[#18181b] p-6 rounded-2xl border border-gray-800 flex flex-col min-h-0">
                                    <h3 className="text-xs font-black text-gray-400 uppercase mb-4 tracking-widest">Designer Workshop</h3>
                                    <textarea value={designerPrompt} onChange={(e) => setDesignerPrompt(e.target.value)} className="w-full min-h-[10rem] bg-[#09090b] border border-[#27272a] p-4 rounded-xl text-sm text-gray-200 flex-grow resize-y overflow-y-auto custom-scrollbar mb-4 focus:border-blue-500 focus:outline-none" placeholder="Describe the object..." />
                                    <button onClick={handleDesignerGenerate} disabled={
                                        state.isProcessing || !designerPrompt ||
                                        (state.billingEntitlements.effectiveBillingMode === 'byok' && !state.apiKey)
                                    } className="w-full shrink-0 bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl font-black text-xs uppercase transition-all active:scale-95 disabled:opacity-50">Generate Prop</button>
                                </div>
                            </div>

                            {/* RIGHT: LARGE VIEWPORT */}
                            <div className="flex-grow min-w-0 min-h-0 h-full bg-black rounded-2xl border border-gray-800 flex items-center justify-center overflow-hidden relative group">
                                {designerImage ? (
                                    <div className="relative w-full h-full">
                                        <img src={designerImage} className="w-full h-full object-contain" />
                                        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-3 z-50">
                                            <button onClick={() => { setDesignerPrompt(''); setDesignerImage(null); useRecentGenerationsStore.getState().clearRecentGenerationsForStudio('props'); }} className="bg-red-600/80 hover:bg-red-500 text-white px-8 py-3 rounded-full font-black text-[10px] uppercase tracking-widest border border-red-500/50 transition-all active:scale-95 flex items-center gap-3"><X className="w-4 h-4" /> Clear</button>
                                            <button onClick={() => saveToProps(designerImage!, designerPrompt)} className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-full font-black text-[10px] uppercase tracking-widest border border-blue-400 transition-all active:scale-95 flex items-center gap-3"><FolderOutput className="w-4 h-4" /> Export to Library</button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center opacity-20">
                                        <Package className="w-16 h-16 mb-4" />
                                        <span className="text-xs font-black uppercase tracking-widest text-[#a1a1aa]">Awaiting Design</span>
                                    </div>
                                )}

                                {/* RECENT GENERATIONS STRIP (Prop Designer viewport) */}
                                <div className="absolute bottom-2 left-0 right-0 z-50 pointer-events-auto flex justify-center px-4">
                                    <RecentGenerationsStrip
                                        studio="props"
                                        className="w-full max-w-3xl bg-black/80 backdrop-blur-md rounded-2xl border border-white/10"
                                        onSelectGeneration={(gen) => {
                                            setDesignerImage(gen.displayUrl);
                                        }}
                                        onExportGeneration={(gen) => {
                                            saveToProps(gen.displayUrl, gen.prompt || designerPrompt);
                                            useRecentGenerationsStore.getState().markExported(gen.id);
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                        </>
                    ) : (
                        <div className="w-full h-full flex gap-4 min-h-0 min-w-0 overflow-hidden">
                            {/* LEFT COLUMN: Inputs (Split into 2 cards) */}
                            <div className="w-80 shrink-0 flex flex-col space-y-4 h-full min-h-0 overflow-y-auto custom-scrollbar pr-1">
                                {/* Card A: Clean Selections */}
                                <div className="bg-[#18181b] p-4 lg:p-6 rounded-2xl border border-gray-800 shrink-0">
                                    <h3 className="text-xs font-black text-gray-400 uppercase mb-4 tracking-widest">1. Subject</h3>
                                    <div className="flex gap-1.5 mb-4 flex-wrap max-h-14 overflow-y-auto custom-scrollbar">
                                        {state.cast.map(c => (
                                            <button key={c.id} onClick={() => setSelectedCharacter(c)} className={`!p-0 !m-0 !min-w-0 !min-h-0 w-11 h-11 shrink-0 rounded-lg border-2 overflow-hidden transition-all ${selectedCharacter?.id === c.id ? 'border-green-500 ring-1 ring-green-500 scale-95' : 'border-gray-800 hover:border-gray-600'}`}><img src={c.previewUrl || c.url} className="w-full h-full object-cover" /></button>
                                        ))}
                                    </div>
                                    <h3 className="text-xs font-black text-gray-400 uppercase mb-4 tracking-widest border-t border-gray-800 pt-5">2. Active Prop</h3>
                                    <div className="h-[clamp(7rem,22vh,12rem)] bg-[#09090b] rounded-xl border border-gray-800 flex items-center justify-center overflow-hidden relative group">
                                        {selectedProp ? (
                                            <>
                                                <img src={selectedProp.url} className="w-full h-full object-contain p-2" />
                                                <button
                                                    onClick={() => setSelectedProp(null)}
                                                    className="absolute top-2 right-2 bg-black/50 hover:bg-red-500/80 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-colors backdrop-blur-sm"
                                                    title="Remove Prop"
                                                >
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </>
                                        ) : (
                                            <Package className="w-10 h-10 opacity-10" />
                                        )}
                                    </div>
                                </div>

                                {/* Card B: Action Area */}
                                <div className="bg-[#18181b] p-4 lg:p-6 rounded-2xl border border-gray-800 flex-1 min-h-[13rem] flex flex-col">
                                    <h3 className="text-xs font-black text-gray-400 uppercase mb-4 tracking-widest">3. Placement Notes</h3>
                                    <textarea className="w-full bg-[#09090b] border border-[#27272a] p-3 rounded-lg text-xs text-gray-300 flex-1 min-h-[6rem] max-h-64 mb-4 focus:border-blue-500 focus:outline-none resize-y overflow-y-auto custom-scrollbar" placeholder="Where should the prop be?..." value={applyNote} onChange={(e) => setApplyNote(e.target.value)} />
                                    


                                    <button onClick={handleApply} disabled={
                                        state.isProcessing ||
                                        !selectedCharacter ||
                                        !selectedProp ||
                                        (state.billingEntitlements.effectiveBillingMode === 'byok' && !state.apiKey)
                                    } className="w-full bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95 disabled:opacity-50 transition-all">Apply to Character</button>
                                </div>
                            </div>

                            {/* RESULT COLUMN */}
                            <div className="flex-grow min-w-0 min-h-0 flex flex-row bg-[#09090b] rounded-2xl overflow-hidden border border-gray-800 relative">
                                {adjustmentState && (
                                    <WearableAdjustmentCanvas
                                        subjectUrl={adjustmentState.subjectUrl}
                                        propUrl={adjustmentState.propUrl}
                                        anchorContract={adjustmentState.anchorContract}
                                        initialOffsetX={adjustmentState.initialOffsetX}
                                        initialOffsetY={adjustmentState.initialOffsetY}
                                        initialScale={adjustmentState.initialScale}
                                        onConfirm={handleConfirmFit}
                                        onCancel={() => {
                                            setAdjustmentState(null);
                                            dispatch({ type: 'ADD_LOG', payload: { message: 'Fit calibration aborted.', type: 'info' } });
                                        }}
                                    />
                                )}
                                <div className="flex-grow min-w-0 min-h-0 h-full bg-black flex flex-col border-r border-gray-800 relative overflow-hidden">
                                    {/* Stage Header */}
                                    <div className="min-h-[3.5rem] border-b border-gray-800 bg-white/5 flex items-center justify-between gap-3 px-4 lg:px-6 py-3 shrink-0 backdrop-blur-md">
                                        <div className="flex min-w-0 items-center gap-3">
                                            <div className={`w-2 h-2 rounded-full ${appliedImage ? 'bg-emerald-500 -[0_0_8px_rgba(16,185,129,0.6)]' : 'bg-gray-600'}`} />
                                            <span className="min-w-0 truncate text-xs font-black uppercase tracking-widest text-gray-400">Preview Stage</span>
                                        </div>

                                        {/* Header Actions */}
                                        {appliedImage && (
                                            <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 animate-in fade-in duration-300">
                                                <button onClick={(e) => {
                                                    if (e.shiftKey) {
                                                        const finalUrl = appliedImage;
                                                        if (finalUrl) bindToFirstEmptyRefSlot(finalUrl, `${selectedCharacter?.name || 'Subject'} + Prop Result`);
                                                        return;
                                                    }
                                                    handleSendToCastForge();
                                                }} className="h-8 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg flex items-center gap-2 transition-all text-[10px] uppercase font-black tracking-wider hover:scale-105 active:scale-95 shadow-[0_0_15px_rgba(16,185,129,0.3)]"><Sparkles className="w-3.5 h-3.5" /> Send to Cast Forge <ArrowRight className="w-3.5 h-3.5" /></button>

                                                <div className="h-4 w-px bg-gray-700 mx-2" />

                                                <button onClick={() => openActorSaveModal()} className="p-1.5 hover:bg-indigo-500/20 text-gray-400 hover:text-indigo-400 rounded-lg transition-colors" title="Save to Actor Library"><Save className="w-4 h-4" /></button>
                                                <button onClick={() => { const l = document.createElement('a'); l.href = appliedImage!; l.download = createUniqueDownloadFilename("applied-prop.png"); l.click(); }} className="p-1.5 hover:bg-white/10 text-gray-400 hover:text-white rounded-lg transition-colors" title="Download"><Download className="w-4 h-4" /></button>
                                                <button onClick={() => { setAppliedImage(null); useRecentGenerationsStore.getState().clearRecentGenerationsForStudio('props'); }} className="p-1.5 hover:bg-red-500/20 text-gray-400 hover:text-red-400 rounded-lg transition-colors" title="Clear Stage"><X className="w-4 h-4" /></button>
                                            </div>
                                        )}
                                    </div>

                                    {/* Stage Content */}
                                    <div className="flex-1 min-h-0 relative w-full overflow-auto custom-scrollbar flex items-center justify-center p-4 lg:p-8 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-gray-900/50 to-black">
                                        {appliedImage ? (
                                            <div className="relative flex h-full min-h-[18rem] w-full items-center justify-center">
                                                <img src={appliedImage} className={'max-w-full max-h-full object-contain '} />
                                            </div>
                                        ) : (
                                            <div className="flex min-h-[18rem] flex-col items-center justify-center gap-4 text-gray-800 select-none pointer-events-none">
                                                <Package className="w-24 h-24 opacity-10" />
                                                <span className="text-xs font-black uppercase tracking-widest opacity-20">Select Subject & Prop</span>
                                            </div>
                                        )}
                                    </div>
                                    {/* RECENT GENERATIONS STRIP (Application Room) */}
                                    <div className="absolute bottom-2 left-0 right-0 z-50 pointer-events-auto flex justify-center px-4">
                                        <RecentGenerationsStrip
                                            studio="props"
                                            className="w-full max-w-3xl bg-black/80 backdrop-blur-md rounded-2xl border border-white/10"
                                            onSelectGeneration={(gen) => {
                                                setAppliedImage(gen.displayUrl);
                                            }}
                                            onExportGeneration={(gen) => {
                                                setAppliedImage(gen.displayUrl);
                                                openActorSaveModal(gen.displayUrl, gen.id);
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                    )}
                </div>
            </div>


            <ActorSaveModal
                isOpen={showActorSaveModal}
                initialName={pendingActorSave?.initialName || `${selectedCharacter?.name || 'Prop Actor'} (Prop)`}
                onClose={() => {
                    setShowActorSaveModal(false);
                    setPendingActorSave(null);
                }}
                onSave={(name, category) => {
                    void handleSaveToActors(name, category);
                }}
                title="Save to Actor Library"
                description="Select a Studio Folder to organize this actor:"
            />

            {/* DELETE CONFIRMATION MODAL */}
            <ConfirmDialog
                isOpen={!!confirmDelete}
                onClose={() => setConfirmDelete(null)}
                onConfirm={() => {
                    if (confirmDelete) executeDelete();
                    setConfirmDelete(null);
                }}
                title="Delete Prop?"
                message={
                    <>
                        Are you sure you want to delete <span className="text-white font-bold">{confirmDelete?.name}</span>? This cannot be undone.
                    </>
                }
                confirmText="Delete Forever"
                cancelText="Cancel"
                variant="danger"
            />
        </div>

    );
};

export default PropAccessoryStudio;



