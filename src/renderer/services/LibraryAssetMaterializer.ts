import { resolveDisplayUrl } from '../utils/assetUrlResolver';

export const LibraryAssetMaterializer = {
    async materializeCastAsset(args: {
        sourceUrl: string;
        saveDirectoryPath: string | null;
        actorName: string;
        category?: string;
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
            const safeName = args.actorName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            const timestamp = Date.now();
            const filename = `actor_${args.category ? args.category.toLowerCase() + '_' : ''}${safeName}_${timestamp}.png`;
            const relativeFolder = args.category ? `Actors/${args.category}` : 'Actors';

            const folderPath = await window.electronAPI.joinPath(args.saveDirectoryPath, relativeFolder);
            await window.electronAPI.createDir(folderPath);
            const finalPath = await window.electronAPI.joinPath(folderPath, filename);

            const response = await fetch(args.sourceUrl);
            const blob = await response.blob();
            const buffer = await blob.arrayBuffer();

            const success = await window.electronAPI.writeFile(finalPath, new Uint8Array(buffer));
            if (!success) throw new Error('Failed to write file to disk');

            const displayUrl = await resolveDisplayUrl({ localPath: finalPath });
            if (!displayUrl) throw new Error('Materialized file could not be natively resolved.');

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

            const displayUrl = await resolveDisplayUrl({ localPath: finalPath });
            if (!displayUrl) throw new Error('Materialized ref file could not be resolved.');

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
            const relativeFolder = 'Props';
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
