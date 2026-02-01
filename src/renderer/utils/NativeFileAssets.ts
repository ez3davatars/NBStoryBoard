
// Wrapper for Native Electron API
// Replicates the logic of FileSystemAssets.ts but uses direct paths instead of handles

export const isNativeParams = (): boolean => {
    return !!window.electronAPI;
};

export const nativeSelectFolder = async (): Promise<string | null> => {
    if (!window.electronAPI) return null;
    return await window.electronAPI.selectFolder();
};

export const nativeGetCoverPath = async (rootPath: string, studioId: string): Promise<string> => {
    if (!window.electronAPI) return '';
    // Mirrors getStudioCoverFilename logic: "Covers/Studio_{id}.png"
    // But normalized using native path separators
    const filename = `Studio_${studioId}.png`;
    return await window.electronAPI.joinPath(rootPath, 'Covers', filename);
};

export const nativeLoadCover = async (rootPath: string, studioId: string): Promise<string | null> => {
    if (!window.electronAPI) return null;

    const fullPath = await nativeGetCoverPath(rootPath, studioId);
    console.log(`[CustomCovers] NativeLoadCover checking path: "${fullPath}"`);

    // Check existence first to avoid console noise
    const exists = await window.electronAPI.exists(fullPath);
    if (!exists) {
        console.warn(`[CustomCovers] File NOT found at: "${fullPath}"`);
        return null;
    }

    const base64 = await window.electronAPI.readFile(fullPath);
    if (!base64) {
        console.error(`[CustomCovers] File found but read returned empty: "${fullPath}"`);
        return null; // or empty string
    }

    console.log(`[CustomCovers] Successfully loaded cover for ${studioId}`);
    // Convert base64 to Blob URL for consistency with existing Image components
    // (Or just return data:image/png;base64,... but Blob URL is often better for memory)
    // Actually, simple base64 data URI is fine for covers.
    return `data:image/png;base64,${base64}`;
};

export const nativeSaveCover = async (rootPath: string, studioId: string, file: File): Promise<boolean> => {
    if (!window.electronAPI) return false;

    const fullPath = await nativeGetCoverPath(rootPath, studioId);

    try {
        const buffer = await file.arrayBuffer();
        return await window.electronAPI.writeFile(fullPath, buffer);
    } catch (e) {
        console.error("Native Save Failed:", e);
        return false;
    }
};


export const nativeListFiles = async (rootPath: string): Promise<string[]> => {
    if (!window.electronAPI) return [];
    return await window.electronAPI.listFiles(rootPath);
};

export const nativeJoinPath = async (...paths: string[]): Promise<string> => {
    if (!window.electronAPI) return paths.join('/'); // Fallback (shouldn't happen in native)
    return await window.electronAPI.joinPath(...paths);
};

export const nativeReadFile = async (fullPath: string): Promise<string | null> => {
    if (!window.electronAPI) return null;
    const exists = await window.electronAPI.exists(fullPath);
    if (!exists) return null;
    const base64 = await window.electronAPI.readFile(fullPath);
    return base64 ? `data:image/png;base64,${base64}` : null; // Assuming PNG for now, can be made generic
};

export const nativeWriteFile = async (fullPath: string, file: File | Blob): Promise<boolean> => {
    if (!window.electronAPI) return false;
    try {
        const buffer = await file.arrayBuffer();
        return await window.electronAPI.writeFile(fullPath, buffer);
    } catch (e) {
        console.error("Native Write Failed:", e);
        return false;
    }
};


