
export const COVERS_DIR_NAME = 'Covers';

type FsHandlePermissionDescriptor = {
    mode?: 'read' | 'readwrite';
};

type PermissionCapableHandle = FileSystemHandle & {
    queryPermission: (descriptor?: FsHandlePermissionDescriptor) => Promise<PermissionState>;
    requestPermission: (descriptor?: FsHandlePermissionDescriptor) => Promise<PermissionState>;
};

const isPermissionCapableHandle = (handle: FileSystemHandle): handle is PermissionCapableHandle =>
    typeof (handle as { queryPermission?: unknown }).queryPermission === 'function' &&
    typeof (handle as { requestPermission?: unknown }).requestPermission === 'function';

const getErrorName = (error: unknown): string =>
    typeof error === 'object' && error !== null && 'name' in error ? String((error as { name: unknown }).name) : '';

/**
 * Helper to get or create the 'Covers' subdirectory handle.
 */
export const getCoversDir = async (rootDir: FileSystemDirectoryHandle): Promise<FileSystemDirectoryHandle> => {
    return await rootDir.getDirectoryHandle(COVERS_DIR_NAME, { create: true });
};

/**
 * Save a Blob (or File) to the Covers directory with a specific filename.
 */
export const saveAssetToDisk = async (
    rootDir: FileSystemDirectoryHandle,
    filename: string,
    blob: Blob
): Promise<void> => {
    try {
        const coversDir = await getCoversDir(rootDir);
        const fileHandle = await coversDir.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
    } catch (error) {
        console.error(`Failed to save asset ${filename} to disk:`, error);
        throw error;
    }
};

/**
 * Load an asset from the Covers directory. 
 * Returns a blob URL (object URL) that can be used in <img src="...">.
 * Returns null if file not found.
 */
export const loadAssetFromDisk = async (
    rootDir: FileSystemDirectoryHandle,
    filename: string
): Promise<string | null> => {
    try {
        const coversDir = await getCoversDir(rootDir);
        const fileHandle = await coversDir.getFileHandle(filename, { create: false });
        const file = await fileHandle.getFile();
        return URL.createObjectURL(file);
    } catch (error: unknown) {
        // NotFoundError is expected if file doesn't exist yet
        if (getErrorName(error) === 'NotFoundError') {
            return null;
        }
        console.warn(`Failed to load asset ${filename} from disk:`, error);
        return null;
    }
};

/**
 * Delete an asset from the Covers directory.
 */
export const deleteAssetFromDisk = async (
    rootDir: FileSystemDirectoryHandle,
    filename: string
): Promise<void> => {
    try {
        const coversDir = await getCoversDir(rootDir);
        await coversDir.removeEntry(filename);
    } catch (error: unknown) {
        if (getErrorName(error) !== 'NotFoundError') {
            console.error(`Failed to delete asset ${filename}:`, error);
        }
    }
};

/**
 * Calculate the canonical filename for a Studio Cover.
 * e.g. "Studio_realism.png"
 */
export const getStudioCoverFilename = (studioId: string) => `Studio_${studioId}.png`;

/**
 * Calculate the canonical filename for an Archetype Cover.
 * e.g. "Archetype_titan_masc.png"
 */
/**
 * Verify that the user has granted permission to read or write to the handle.
 * If permission is 'prompt', it will trigger the browser popup.
 */
// DEBUG: Trace Entry
export const verifyPermission = async (
    fileHandle: FileSystemHandle,
    readWrite: boolean = false,
    autoRequest: boolean = true
): Promise<boolean> => {
    console.log("verifyPermission: Checking handle", { name: fileHandle.name, kind: fileHandle.kind, readWrite, autoRequest });

    // SAFETY CHECK: Ensure handle has methods (IndexedDB serialization check)
    if (!isPermissionCapableHandle(fileHandle)) {
        console.error("verifyPermission: Handle is invalid (missing methods). It may be a stale clone.", fileHandle);
        return false;
    }

    try {
        const options: FsHandlePermissionDescriptor = {};
        if (readWrite) {
            options.mode = 'readwrite';
        }

        // Check if permission was already granted
        const status = await fileHandle.queryPermission(options);
        console.log("verifyPermission: Current Status:", status);

        if (status === 'granted') {
            return true;
        }

        // If not auto-requesting, fail if not granted
        if (!autoRequest) {
            console.warn("verifyPermission: Permission not granted and autoRequest is false. Status:", status);
            return false;
        }

        // Request permission using the user gesture that triggered this
        console.log("verifyPermission: Requesting permission...");
        const requestStatus = await fileHandle.requestPermission(options);
        console.log("verifyPermission: Request Status:", requestStatus);

        if (requestStatus === 'granted') {
            return true;
        }
    } catch (error: unknown) {
        console.error("verifyPermission: Error during check:", error);
        // Don't swallow error completely so we can see it in logs
        // But return false to indicate failure
    }

    return false;
};
