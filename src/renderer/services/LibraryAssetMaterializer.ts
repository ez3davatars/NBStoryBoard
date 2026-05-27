import type { ProductionActorProfile } from '../types/ProductionActorProfile';
import { resolveDisplayUrl } from '../utils/assetUrlResolver';

const MAX_REFERENCE_DISPLAY_SIZE = 2048;
const REFERENCE_JPEG_QUALITY = 0.9;

const imageExtensionFromMime = (mimeType: string | undefined, fallbackName?: string): string => {
    const cleanMime = (mimeType || '').toLowerCase();
    if (cleanMime.includes('jpeg') || cleanMime.includes('jpg')) return 'jpg';
    if (cleanMime.includes('webp')) return 'webp';
    if (cleanMime.includes('png')) return 'png';

    const extension = fallbackName?.split('.').pop()?.toLowerCase();
    if (extension && /^[a-z0-9]{2,5}$/.test(extension)) return extension;

    return 'png';
};

const blobToDataUrl = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Failed to read image blob'));
        reader.readAsDataURL(blob);
    });
};

const optimizeReferenceDisplayUrl = async (
    blob: Blob,
    options: { maxSize?: number; quality?: number } = {}
): Promise<string> => {
    const maxSize = options.maxSize ?? MAX_REFERENCE_DISPLAY_SIZE;
    const quality = options.quality ?? REFERENCE_JPEG_QUALITY;

    try {
        const sourceUrl = URL.createObjectURL(blob);
        try {
            const image = new Image();
            image.decoding = 'async';
            await new Promise<void>((resolve, reject) => {
                image.onload = () => resolve();
                image.onerror = () => reject(new Error('Failed to decode reference image'));
                image.src = sourceUrl;
            });

            const ratio = Math.min(1, maxSize / Math.max(image.naturalWidth || 1, image.naturalHeight || 1));
            const width = Math.max(1, Math.round((image.naturalWidth || 1) * ratio));
            const height = Math.max(1, Math.round((image.naturalHeight || 1) * ratio));

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('Canvas context unavailable');

            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(image, 0, 0, width, height);

            return canvas.toDataURL('image/jpeg', quality);
        } finally {
            URL.revokeObjectURL(sourceUrl);
        }
    } catch (error) {
        console.warn('[LibraryAssetMaterializer] Reference display optimization failed; using original data URL:', error);
        return blobToDataUrl(blob);
    }
};

export const LibraryAssetMaterializer = {
    async materializeCastAsset(args: {
        productionProfile?: Omit<ProductionActorProfile, 'approvedImageUrl' | 'sourceImageUrl'>;
        sourceUrl: string;
        saveDirectoryPath: string | null;
        actorName: string;
        category?: string;
        sourcePitchSheetUrl?: string;
    }) {
        if (!args.saveDirectoryPath || !window.electronAPI) {
            return {
                localPath: undefined,
                previewUrl: args.sourceUrl,
                sourceUrl: args.sourceUrl,
                filename: undefined
            };
        }

        try {
            const response = await fetch(args.sourceUrl);
            const blob = await response.blob();
            const buffer = await blob.arrayBuffer();

            // Generate resilient Base64 Data URL for immediate session memory display, matching Bootloader
            const displayUrl = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
            });

            if (args.productionProfile) {
                const profile = args.productionProfile;
                // Organized library package layout
                const cleanName = (profile.name || 'Actor')
                    .replace(/[^a-z0-9\s-_]/gi, '')
                    .trim()
                    .replace(/\s+/g, '_');
                const safePrefix = cleanName || 'Actor';
                const suffix = profile.id.replace('prod-actor-', '');
                const folderName = `${safePrefix}_ProductionActor_${suffix}`;

                const libraryPath = await window.electronAPI.joinPath(args.saveDirectoryPath, 'Library');
                const prodActorsPath = await window.electronAPI.joinPath(libraryPath, 'ProductionActors');
                const packagePath = await window.electronAPI.joinPath(prodActorsPath, folderName);
                
                await window.electronAPI.createDir(packagePath);

                if (args.sourcePitchSheetUrl) {
                    try {
                        const pitchResponse = await fetch(args.sourcePitchSheetUrl);
                        const pitchBlob = await pitchResponse.blob();
                        const pitchBuffer = await pitchBlob.arrayBuffer();
                        const pitchPngPath = await window.electronAPI.joinPath(packagePath, 'source_pitch_sheet.png');
                        await window.electronAPI.writeFile(pitchPngPath, new Uint8Array(pitchBuffer));
                    } catch (pitchErr) {
                        console.warn('[LibraryAssetMaterializer] Failed to optionally write source_pitch_sheet.png:', pitchErr);
                    }
                }

                const actorPngPath = await window.electronAPI.joinPath(packagePath, 'actor.png');
                const pngSuccess = await window.electronAPI.writeFile(actorPngPath, new Uint8Array(buffer));
                if (!pngSuccess) throw new Error('Failed to write actor.png');

                const actorJsonPath = await window.electronAPI.joinPath(packagePath, 'actor.json');
                const actorMetadata = {
                    assetType: "production_actor",
                    schemaVersion: 1,
                    id: profile.id,
                    name: profile.name,
                    displayName: profile.name,
                    folderName: folderName,
                    primaryImage: "actor.png",
                    sourceImage: undefined,
                    identitySummary: profile.identitySummary || "",
                    styleSummary: profile.styleSummary || "",
                    wardrobeSummary: profile.wardrobeSummary || "",
                    preserveRules: profile.preserveRules || [],
                    avoidRules: profile.avoidRules || [],
                    source: "create_production_actor",
                    isIdentityLocked: true,
                    createdAt: profile.createdAt || new Date().toISOString(),
                    updatedAt: profile.updatedAt || new Date().toISOString()
                };

                const jsonStr = JSON.stringify(actorMetadata, null, 2);
                const jsonBuffer = new TextEncoder().encode(jsonStr);
                await window.electronAPI.writeFile(actorJsonPath, new Uint8Array(jsonBuffer));

                // Update index
                const indexPath = await window.electronAPI.joinPath(libraryPath, 'library-index.json');
                let index = { schemaVersion: 1, assets: [] as any[] };
                if (await window.electronAPI.exists(indexPath)) {
                    try {
                        const text = await window.electronAPI.readTextFile(indexPath);
                        if (text) {
                            const parsed = JSON.parse(text);
                            if (parsed && Array.isArray(parsed.assets)) {
                                index = parsed;
                            }
                        }
                    } catch (e) {
                        console.warn('[LibraryAssetMaterializer] Failed to read library index:', e);
                    }
                }
                const existingIndex = index.assets.findIndex((a: any) => a.id === profile.id);
                const newEntry = {
                    id: profile.id,
                    assetType: 'production_actor',
                    displayName: profile.name,
                    folder: `ProductionActors/${folderName}`,
                    primaryImage: 'actor.png',
                    metadata: 'actor.json',
                    createdAt: profile.createdAt || new Date().toISOString()
                };
                if (existingIndex >= 0) {
                    index.assets[existingIndex] = newEntry;
                } else {
                    index.assets.push(newEntry);
                }
                const indexPayload = new TextEncoder().encode(JSON.stringify(index, null, 2));
                await window.electronAPI.writeFile(indexPath, new Uint8Array(indexPayload));

                console.debug('[ProductionActor Save]', {
                    actorId: profile.id,
                    folderName: folderName,
                    primaryImage: 'actor.png',
                    metadataFile: 'actor.json',
                    hasIdentitySummary: Boolean(profile.identitySummary),
                    hasStyleSummary: Boolean(profile.styleSummary),
                    hasWardrobeSummary: Boolean(profile.wardrobeSummary),
                    preserveRuleCount: (profile.preserveRules || []).length,
                    avoidRuleCount: (profile.avoidRules || []).length,
                });

                return {
                    localPath: actorPngPath,
                    previewUrl: displayUrl,
                    sourceUrl: args.sourceUrl,
                    filename: `Library/ProductionActors/${folderName}/actor.png`
                };
            }

            // Fallback for non-packaged/legacy actors
            const safeName = args.actorName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            const timestamp = Date.now();
            const filename = `actor_${args.category ? args.category.replace(/\s+/g, '_').toLowerCase() + '_' : ''}${safeName}_${timestamp}.png`;
            const relativeFolder = args.category ? `Actors/${args.category}` : 'Actors';

            const folderPath = await window.electronAPI.joinPath(args.saveDirectoryPath, relativeFolder);
            await window.electronAPI.createDir(folderPath);
            const finalPath = await window.electronAPI.joinPath(folderPath, filename);

            const success = await window.electronAPI.writeFile(finalPath, new Uint8Array(buffer));
            if (!success) throw new Error('Failed to write file to disk');

            return {
                localPath: finalPath,
                previewUrl: displayUrl,
                sourceUrl: args.sourceUrl,
                filename
            };
        } catch (error) {
            console.warn('[LibraryAssetMaterializer] Failed to materialize cast asset, falling back to source URL:', error);
            return {
                localPath: undefined,
                previewUrl: args.sourceUrl,
                sourceUrl: args.sourceUrl,
                filename: undefined
            };
        }
    },

    async materializeReferenceAsset(args: {
        sourceUrl: string;
        saveDirectoryPath: string | null;
        slotIndex: number;
    }) {
        if (!args.saveDirectoryPath || !window.electronAPI) {
            return {
                localPath: undefined,
                url: args.sourceUrl,
                sourceUrl: args.sourceUrl
            };
        }

        try {
            const timestamp = Date.now();
            const relativeFolder = 'References';
            const filename = `reference_slot_${args.slotIndex}_${timestamp}.png`;

            const folderPath = await window.electronAPI.joinPath(args.saveDirectoryPath, relativeFolder);
            await window.electronAPI.createDir(folderPath);
            const finalPath = await window.electronAPI.joinPath(folderPath, filename);

            const response = await fetch(args.sourceUrl);
            const blob = await response.blob();
            const buffer = await blob.arrayBuffer();

            const success = await window.electronAPI.writeFile(finalPath, new Uint8Array(buffer));
            if (!success) throw new Error('Failed to write file to disk');

            // Keep React state light; the original file is already materialized on disk.
            const displayUrl = await optimizeReferenceDisplayUrl(blob);

            return {
                localPath: finalPath,
                url: displayUrl,
                sourceUrl: args.sourceUrl
            };
        } catch (error) {
            console.warn('[LibraryAssetMaterializer] Failed to materialize reference asset:', error);
            return {
                localPath: undefined,
                url: args.sourceUrl,
                sourceUrl: args.sourceUrl
            };
        }
    },

    async materializeReferenceFile(args: {
        file: File;
        saveDirectoryPath: string | null;
        slotIndex: number;
    }) {
        const displayUrlPromise = optimizeReferenceDisplayUrl(args.file);

        if (!args.saveDirectoryPath || !window.electronAPI) {
            const displayUrl = await displayUrlPromise;
            return {
                localPath: undefined,
                url: displayUrl,
                sourceUrl: displayUrl
            };
        }

        try {
            const timestamp = Date.now();
            const relativeFolder = 'References';
            const extension = imageExtensionFromMime(args.file.type, args.file.name);
            const filename = `reference_slot_${args.slotIndex}_${timestamp}.${extension}`;

            const folderPath = await window.electronAPI.joinPath(args.saveDirectoryPath, relativeFolder);
            await window.electronAPI.createDir(folderPath);
            const finalPath = await window.electronAPI.joinPath(folderPath, filename);

            const buffer = await args.file.arrayBuffer();
            const success = await window.electronAPI.writeFile(finalPath, new Uint8Array(buffer));
            if (!success) throw new Error('Failed to write file to disk');

            const displayUrl = await displayUrlPromise;

            return {
                localPath: finalPath,
                url: displayUrl,
                sourceUrl: displayUrl
            };
        } catch (error) {
            console.warn('[LibraryAssetMaterializer] Failed to materialize reference file:', error);
            const displayUrl = await displayUrlPromise;
            return {
                localPath: undefined,
                url: displayUrl,
                sourceUrl: displayUrl
            };
        }
    },

    async materializeInspectorAsset(args: {
        sourceUrl: string;
        saveDirectoryPath: string | null;
    }) {
        if (!args.saveDirectoryPath || !window.electronAPI) {
            return {
                localPath: undefined,
                displayUrl: args.sourceUrl,
                sourceUrl: args.sourceUrl
            };
        }

        try {
            const timestamp = Date.now();
            const relativeFolder = 'Inspector';
            const filename = `inspect_${timestamp}.png`;

            const folderPath = await window.electronAPI.joinPath(args.saveDirectoryPath, relativeFolder);
            await window.electronAPI.createDir(folderPath);
            const finalPath = await window.electronAPI.joinPath(folderPath, filename);

            const response = await fetch(args.sourceUrl);
            const blob = await response.blob();
            const buffer = await blob.arrayBuffer();

            const success = await window.electronAPI.writeFile(finalPath, new Uint8Array(buffer));
            if (!success) throw new Error('Failed to write file to disk');

            const displayUrl = await resolveDisplayUrl({ localPath: finalPath });
            if (!displayUrl) throw new Error('Failed to resolve inspector materialization.');

            return {
                localPath: finalPath,
                displayUrl,
                sourceUrl: args.sourceUrl
            };
        } catch (error) {
            console.warn('[LibraryAssetMaterializer] Inspector materialization failed:', error);
            return {
                localPath: undefined,
                displayUrl: args.sourceUrl,
                sourceUrl: args.sourceUrl
            };
        }
    },

    async materializeWardrobeAsset(args: {
        sourceUrl: string;
        saveDirectoryPath: string | null;
        prompt?: string;
    }) {
        if (!args.saveDirectoryPath || !window.electronAPI) {
            return {
                localPath: undefined,
                url: args.sourceUrl,
                sourceUrl: args.sourceUrl,
                filename: undefined
            };
        }

        try {
            const timestamp = Date.now();
            const relativeFolder = 'Wardrobe';
            const filename = `wardrobe_${timestamp}.png`;

            const folderPath = await window.electronAPI.joinPath(args.saveDirectoryPath, relativeFolder);
            await window.electronAPI.createDir(folderPath);
            const finalPath = await window.electronAPI.joinPath(folderPath, filename);

            const response = await fetch(args.sourceUrl);
            const blob = await response.blob();
            const buffer = await blob.arrayBuffer();

            const success = await window.electronAPI.writeFile(finalPath, new Uint8Array(buffer));
            if (!success) throw new Error('Failed to write file to disk');

            const base64 = await window.electronAPI.readFile(finalPath);
            if (!base64) throw new Error('Failed to read saved file from disk');

            return {
                localPath: finalPath,
                url: `data:image/png;base64,${base64}`,
                sourceUrl: args.sourceUrl,
                filename
            };
        } catch (error) {
            console.warn('[LibraryAssetMaterializer] Wardrobe materialization failed:', error);
            return {
                localPath: undefined,
                url: args.sourceUrl,
                sourceUrl: args.sourceUrl,
                filename: undefined
            };
        }
    },

    async materializePropAsset(args: {
        sourceUrl: string;
        saveDirectoryPath: string | null;
    }) {
        if (!args.saveDirectoryPath || !window.electronAPI) {
            return {
                localPath: undefined,
                url: args.sourceUrl,
                sourceUrl: args.sourceUrl,
                filename: undefined
            };
        }

        try {
            const timestamp = Date.now();
            const relativeFolder = 'props';
            const filename = `prop_${timestamp}.png`;

            const folderPath = await window.electronAPI.joinPath(args.saveDirectoryPath, relativeFolder);
            await window.electronAPI.createDir(folderPath);
            const finalPath = await window.electronAPI.joinPath(folderPath, filename);

            const response = await fetch(args.sourceUrl);
            const blob = await response.blob();
            const buffer = await blob.arrayBuffer();

            const success = await window.electronAPI.writeFile(finalPath, new Uint8Array(buffer));
            if (!success) throw new Error('Failed to write file to disk');

            const base64 = await window.electronAPI.readFile(finalPath);
            if (!base64) throw new Error('Failed to read saved file from disk');

            return {
                localPath: finalPath,
                url: `data:image/png;base64,${base64}`,
                sourceUrl: args.sourceUrl,
                filename
            };
        } catch (error) {
            console.warn('[LibraryAssetMaterializer] Prop materialization failed:', error);
            return {
                localPath: undefined,
                url: args.sourceUrl,
                sourceUrl: args.sourceUrl,
                filename: undefined
            };
        }
    }
};
