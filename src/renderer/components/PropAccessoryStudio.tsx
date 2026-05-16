import { useState, useEffect, useRef, useCallback } from 'react';
import {
    Package, RefreshCcw, Maximize, Sparkles,
    Download, X, Save, Upload, Trash2, ArrowRight, FolderOutput
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { GeminiService } from '../services/GeminiService';
import { ensureAuthenticatedForGeneration } from '../services/AuthGenerationGate';
import { nativeJoinPath, nativeListFiles, nativeWriteFile, isNativeParams } from '../utils/NativeFileAssets';
import type { PropItem, CastMember } from '../context/AppContext';
import ConfirmDialog from './ui/ConfirmDialog';
import ActorSaveModal from './ActorSaveModal';
import { LibraryAssetMaterializer } from '../services/LibraryAssetMaterializer';
import { WearableAnchorEngine } from '../services/WearableAnchorEngine';
import type { WearableClass, HeadwearSubtype, WearablePlacement } from '../services/WearableAnchorEngine';
import { WearableLandmarkService } from '../services/WearableLandmarkService';
import { WearableOverlayComposer } from '../services/WearableOverlayComposer';
import { WearableRefinementValidator } from '../services/WearableRefinementValidator';
import { useRecentGenerationsStore } from '../stores/useRecentGenerationsStore';
import { RecentGenerationsCacheService } from '../services/RecentGenerationsCacheService';
import RecentGenerationsStrip from './recent/RecentGenerationsStrip';
import { createUniqueDownloadFilename } from '../utils/downloadFilenames';
import { PropMetadataService, type PropMetadataSidecar } from '../services/PropMetadataService';

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

const imageMimeTypeFromFilename = (filename: string): string => {
    const extension = filename.split('.').pop()?.toLowerCase();
    if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
    if (extension === 'webp') return 'image/webp';
    return 'image/png';
};

const imageExtensionFromBlob = (blob: Blob): string => {
    const mime = blob.type.toLowerCase();
    if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
    if (mime.includes('webp')) return 'webp';
    return 'png';
};

const dataUrlFromBlob = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Failed to read prop image data'));
        reader.readAsDataURL(blob);
    });

const propNameFromFilename = (filename: string): string => {
    const stem = filename.replace(/\.(png|jpg|jpeg|webp)$/i, '');
    const withoutKnownPrefix = stem
        .replace(/^Custom-Prop-\d+-/i, '')
        .replace(/^prop[_-]?\d*/i, '')
        .replace(/^PROP[_-]?\d*/i, '');
    return (withoutKnownPrefix || stem).replace(/[_-]+/g, ' ').trim() || stem;
};

const buildScannedPropItem = (args: {
    filename: string;
    dataUrl: string;
    localPath?: string;
    timestamp?: number;
    metadata?: PropMetadataSidecar | null;
}): PropItem => {
    const { filename, dataUrl, localPath, metadata } = args;
    const fallbackName = propNameFromFilename(filename);
    const name = metadata?.name || fallbackName;
    const prompt = metadata?.prompt || metadata?.originalPrompt || filename;
    const fallbackHints = PropMetadataService.inferClassHint({
        name,
        prompt
    });
    const classHint = metadata?.classHint || (metadata?.subtypeHint ? 'headwear' : fallbackHints.classHint);
    const subtypeHint =
        classHint === 'headwear'
            ? metadata?.subtypeHint || fallbackHints.subtypeHint
            : undefined;

    return {
        id: filename,
        url: dataUrl,
        localPath,
        filename,
        name,
        prompt,
        originalPrompt: metadata?.originalPrompt,
        sourceKind: metadata?.sourceKind || 'saved',
        classHint,
        subtypeHint,
        metadataVersion: metadata?.version,
        timestamp: metadata?.updatedAt || args.timestamp || Date.now()
    };
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

    const writePropSidecar = useCallback(async (
        args: {
            imageFilename: string;
            name: string;
            prompt: string;
            originalPrompt?: string;
            sourceKind: PropMetadataSidecar['sourceKind'];
            classHint?: WearableClass;
            subtypeHint?: HeadwearSubtype;
        },
        nativeFolderName = 'props'
    ) => {
        const sidecar = PropMetadataService.buildSidecar(args);

        try {
            if (isNativeParams() && state.saveDirectoryPath) {
                const propsPath = await nativeJoinPath(state.saveDirectoryPath, nativeFolderName);
                await PropMetadataService.writeNativeSidecar(propsPath, sidecar);
                return;
            }

            if (state.saveDirectoryHandle) {
                const propsHandle = await state.saveDirectoryHandle.getDirectoryHandle('props', { create: true });
                await PropMetadataService.writeWebSidecar(propsHandle, sidecar);
            }
        } catch (error) {
            console.warn('[PropAccessoryStudio] Prop metadata sidecar save failed:', error);
        }
    }, [state.saveDirectoryHandle, state.saveDirectoryPath]);

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
                            const metadata = await PropMetadataService.readNativeSidecar(propsPath, filename);
                            items.push(buildScannedPropItem({
                                filename,
                                dataUrl: `data:${imageMimeTypeFromFilename(filename)};base64,${base64}`,
                                localPath: fullPath,
                                metadata,
                                timestamp: metadata?.updatedAt || Date.now()
                            }));
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
                    const metadata = await PropMetadataService.readWebSidecar(propsHandle, entry.name);
                    const reader = new FileReader();
                    const dataUrl = await new Promise<string>((resolve) => {
                        reader.onload = () => resolve(reader.result as string);
                        reader.readAsDataURL(file);
                    });
                    items.push(buildScannedPropItem({
                        filename: entry.name,
                        dataUrl,
                        metadata,
                        timestamp: metadata?.updatedAt || file.lastModified
                    }));
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
                if (deleted) {
                    const sidecarPath = await window.electronAPI.joinPath(
                        state.saveDirectoryPath,
                        'props',
                        PropMetadataService.sidecarNameForImage(item.id)
                    );
                    await window.electronAPI.deleteFile(sidecarPath);
                }
            }

            if (!deleted && state.saveDirectoryHandle) {
                const propsHandle = await state.saveDirectoryHandle.getDirectoryHandle('props', { create: false });
                await propsHandle.removeEntry(item.id);
                try {
                    await propsHandle.removeEntry(PropMetadataService.sidecarNameForImage(item.id));
                } catch {
                    // Sidecars are optional; missing metadata should not block deletion.
                }
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
            const displayName = file.name.replace(/\.(png|jpg|jpeg|webp)$/i, '').substring(0, 20);
            const hints = PropMetadataService.inferClassHint({
                name: file.name,
                prompt: file.name
            });

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
                await writePropSidecar({
                    imageFilename: safeName,
                    name: displayName,
                    prompt: file.name,
                    originalPrompt: 'User Upload',
                    sourceKind: 'uploaded',
                    classHint: hints.classHint,
                    subtypeHint: hints.subtypeHint
                });
            }
            // 2. WEB MODE
            else if (state.saveDirectoryHandle) {
                const propsHandle = await state.saveDirectoryHandle.getDirectoryHandle('props', { create: true });
                const fileHandle = await propsHandle.getFileHandle(safeName, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(file);
                await writable.close();
                await writePropSidecar({
                    imageFilename: safeName,
                    name: displayName,
                    prompt: file.name,
                    originalPrompt: 'User Upload',
                    sourceKind: 'uploaded',
                    classHint: hints.classHint,
                    subtypeHint: hints.subtypeHint
                });
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
                    name: displayName,
                    prompt: file.name,
                    originalPrompt: 'User Upload',
                    sourceKind: 'uploaded',
                    classHint: hints.classHint,
                    subtypeHint: hints.subtypeHint,
                    metadataVersion: 1,
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
            const cleanPrompt = prompt.trim() || 'Generated prop';
            const displayName = cleanPrompt.substring(0, 20);
            const hints = PropMetadataService.inferClassHint({
                name: cleanPrompt,
                prompt: cleanPrompt
            });

            let materialized: {
                id: string;
                url: string;
                localPath?: string;
                sourceUrl: string;
                filename?: string;
                nativeFolderName?: string;
            };

            if (isNativeParams() && state.saveDirectoryPath) {
                const mat = await LibraryAssetMaterializer.materializePropAsset({
                    sourceUrl: imageUrl,
                    saveDirectoryPath: state.saveDirectoryPath
                });
                materialized = {
                    id: mat.filename || `PROP-${Date.now()}.png`,
                    url: mat.url,
                    localPath: mat.localPath || undefined,
                    sourceUrl: mat.sourceUrl,
                    filename: mat.filename,
                    nativeFolderName: 'props'
                };
            } else if (state.saveDirectoryHandle) {
                const response = await fetch(imageUrl);
                const blob = await response.blob();
                const filename = `prop_${Date.now()}.${imageExtensionFromBlob(blob)}`;
                const propsHandle = await state.saveDirectoryHandle.getDirectoryHandle('props', { create: true });
                const fileHandle = await propsHandle.getFileHandle(filename, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(blob);
                await writable.close();

                materialized = {
                    id: filename,
                    url: await dataUrlFromBlob(blob),
                    sourceUrl: imageUrl,
                    filename
                };
            } else {
                return;
            }

            if (materialized.filename) {
                await writePropSidecar({
                    imageFilename: materialized.filename,
                    name: displayName,
                    prompt: cleanPrompt,
                    originalPrompt: cleanPrompt,
                    sourceKind: 'generated',
                    classHint: hints.classHint,
                    subtypeHint: hints.subtypeHint
                }, materialized.nativeFolderName);
            }

            const newItem: PropItem = {
                id: materialized.id,
                url: materialized.url,
                localPath: materialized.localPath,
                sourceUrl: materialized.sourceUrl,
                filename: materialized.filename,
                name: displayName,
                prompt: cleanPrompt,
                originalPrompt: cleanPrompt,
                sourceKind: 'generated',
                classHint: hints.classHint,
                subtypeHint: hints.subtypeHint,
                metadataVersion: materialized.filename ? 1 : undefined,
                timestamp: Date.now()
            };
            dispatch({ type: 'ADD_PROP_ITEM', payload: newItem });
            
            // Immediate local pivot
            if (materialized.url) setDesignerImage(materialized.url);
            dispatch({ type: 'ADD_LOG', payload: { message: `Prop saved to library: ${materialized.filename || "Storage"}`, type: 'success' } });
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
        if (!(await ensureAuthenticatedForGeneration({ billingMode, featureLabel: 'Prop Designer generation' }))) {
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

    const handleApply = async () => {
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
        if (!(await ensureAuthenticatedForGeneration({ billingMode, featureLabel: 'Prop Application generation' }))) {
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
            const subjectUrl = selectedCharacter.previewUrl || selectedCharacter.url;

            const propText = `${selectedProp.name || ''} ${selectedProp.prompt || ''} ${selectedProp.filename || ''}`.toLowerCase();

            const looksLikeHeadwear =
                /\b(crown|tiara|hat|cap|helmet|hood|veil|headband|headpiece|hairpiece|wig|turban)\b/i.test(propText);

            const userInstruction = applyNote?.trim() || (
                looksLikeHeadwear
                    ? "Place the selected headwear on top of the subject's head as a worn accessory. It must appear in front of the hair/head at the contact point, not behind the subject, not behind the shoulders, and not as scenery or a background object."
                    : 'Add the selected prop to the subject.'
            );
            let guideFallbackUrl: string | null = null;
            let guidePlacement: WearablePlacement | null = null;
            let applicationPrompt = `
Create a single edited image.

IMAGE 1 is the locked base subject.
IMAGE 2 is the prop to add.

TASK
Edit IMAGE 1 by adding IMAGE 2 to the subject according to this instruction:
"${userInstruction}"

SUBJECT LOCK
Preserve IMAGE 1 exactly except for the added prop.
Keep the same face, identity, expression, age, skin, hair, hairstyle, body, pose, clothing, lighting, camera angle, and black background.
Do not redesign the subject.
Do not change the subject into another character.
Do not add new clothing, armor, hair, accessories, scenery, wires, mechanical details, or background elements.

PROP LOCK
Use IMAGE 2 as the only prop being added.
Preserve the prop's recognizable design, colors, materials, and structure.
Do not duplicate the prop.
Do not turn the prop into a background object, scenery, halo, throne, frame, architecture, armor, or costume.

PLACEMENT
Place the prop only where the user requested.
The prop should look physically present and naturally scaled.
Match the subject's perspective and lighting.
Use only minimal contact shadow or occlusion where needed.

${looksLikeHeadwear ? `
HEADWEAR CLARIFICATION
The prop in IMAGE 2 is wearable headwear.
Place it on the subject's head as an accessory being worn.
It must appear in front of the hair/head at the contact point.
It must not appear behind the subject, behind the shoulders, or as a background decoration.
Keep it above the eyes.
Do not turn it into a throne, halo, scenery, frame, backdrop, armor, or helmet unless the prop itself is a helmet.
` : ''}

OUTPUT
One subject.
One added prop.
Same black background.
No text.
No watermark.
`;
            let imageRefs = [
                {
                    url: subjectUrl,
                    label: 'IMAGE 1 - LOCKED BASE SUBJECT, preserve exactly'
                },
                {
                    url: selectedProp.url,
                    label: looksLikeHeadwear
                        ? 'IMAGE 2 - WEARABLE HEADWEAR PROP, place on head in foreground'
                        : 'IMAGE 2 - PROP TO ADD'
                }
            ];

            if (looksLikeHeadwear) {
                const subtype = selectedProp.subtypeHint ||
                    WearableAnchorEngine.inferHeadwearSubtype(selectedProp.name, selectedProp.prompt, userInstruction);
                const framedSubjectUrl = await WearableOverlayComposer.buildFramedSubject(subjectUrl, state.imageResolution);
                const landmarks = await WearableLandmarkService.detect(framedSubjectUrl);
                const placement = WearableAnchorEngine.computePlacement(
                    'headwear',
                    landmarks,
                    applyNote,
                    subtype
                );
                const guide = await WearableOverlayComposer.compose({
                    subjectUrl: framedSubjectUrl,
                    propUrl: selectedProp.url,
                    anchorContract: placement
                });

                guideFallbackUrl = guide.precompositeUrl;
                guidePlacement = guide.placement;
                applicationPrompt = `
Create a single edited image.

IMAGE 1 is the locked subject.
IMAGE 2 is the exact headwear prop.
IMAGE 3 is the locked placement guide.

PRIMARY RULE
- Follow IMAGE 3 for the exact headwear position, size, scale, and depth order.
- The headwear placement in IMAGE 3 is already correct.
- Do not move, resize, enlarge, shrink, lower, raise, rotate, reshape, or reinterpret the headwear.
- Do not turn the headwear into hair, costume, armor, scenery, a throne, a halo, or a background object.

SUBJECT LOCK
- Preserve IMAGE 1 exactly.
- Keep the same face, identity, expression, skin, hair, hairstyle, body, clothing, pose, lighting, camera angle, and black background.
- Do not redesign the subject.
- Do not change the hair to fit the headwear.
- Do not weave hair through the crown.
- Do not add new hair, clothing, armor, accessories, wires, panels, scenery, or background elements.

PROP LOCK
- Preserve IMAGE 2 as the selected headwear.
- Preserve its silhouette, structure, jewels, colors, materials, trim, and proportions.
- Do not squash, stretch, flatten, wrap, or deform the headwear.
- Do not separate parts of the headwear.

ALLOWED CHANGES ONLY
- Improve edge blending.
- Add subtle contact shadow.
- Add minimal natural occlusion only at the contact point.
- Clean visible pasted edges.
- Match lighting slightly while preserving the prop design.

FORBIDDEN
- No hair over the front band unless the placement guide already shows it.
- No hair woven through the crown.
- No crown behind the head.
- No crown behind the shoulders.
- No crown as background scenery.
- No changed subject.
- No changed hairstyle.
- No changed clothing.
- No changed face.
- No changed body.
- No extra objects.

OUTPUT
- Same subject.
- Same black background.
- Same headwear placement as IMAGE 3.
- One headwear prop only.
- No text.
- No watermark.
`;
                imageRefs = [
                    { url: framedSubjectUrl, label: 'IMAGE 1 - LOCKED SUBJECT' },
                    { url: selectedProp.url, label: 'IMAGE 2 - EXACT HEADWEAR PROP' },
                    { url: guide.precompositeUrl, label: 'IMAGE 3 - LOCKED PLACEMENT GUIDE' }
                ];
            }

            const res = await GeminiService.generateImage(
                applicationPrompt,
                state.apiKey,
                state.model,
                imageRefs,
                {
                    aspectRatio: '1:1',
                    imageSize: state.imageResolution,
                    thinkingLevel: state.enableImageThinking,
                    googleGrounding: false,
                    strictMode: true,
                    billingMode: state.billingEntitlements.effectiveBillingMode as 'hosted' | 'byok',
                    entitlements: state.billingEntitlements,
                    identityLock: undefined,
                    styleCategory: undefined,
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

            if (looksLikeHeadwear && guideFallbackUrl && guidePlacement) {
                const refinementOk = await WearableRefinementValidator.validate({
                    refinedUrl: safeUrl,
                    lockedPlacement: guidePlacement,
                    fitClass: 'headwear'
                });

                if (!refinementOk) {
                    safeUrl = guideFallbackUrl;
                    dispatch({
                        type: 'ADD_LOG',
                        payload: { message: 'Refinement drifted; using locked placement guide.', type: 'info' }
                    });
                }
            }

            setAppliedImage(safeUrl);
            dispatch({
                type: 'ADD_LOG',
                payload: { message: 'Prop applied.', type: 'info' }
            });

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
                            prompt: userInstruction,
                            mode: (state.billingEntitlements.effectiveBillingMode as 'hosted' | 'byok') || 'byok',
                        });
                    }
                }).catch((e) => {
                    console.warn('[PropApp] Recent generation caching failed:', e);
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
                    identityLock: selectedCharacter?.identityLock,
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



