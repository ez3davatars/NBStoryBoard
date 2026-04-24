import type { RecentGenerationStudio } from '../stores/useRecentGenerationsStore';

/**
 * RecentGenerationsCacheService
 *
 * Handles all file-system operations for the Recent Generations cache.
 * All operations are scoped to the app-managed cache folder.
 * Uses the existing secure electronAPI bridge — no new IPC channels needed for file ops.
 */

// --- FILENAME GENERATION ---

function generateShortId(): string {
  return Math.random().toString(36).slice(2, 8);
}

function padZero(n: number): string {
  return n.toString().padStart(2, '0');
}

export function generateSafeFilename(
  studio: RecentGenerationStudio,
  extension: string = 'png'
): string {
  const now = new Date();
  const date = `${now.getFullYear()}-${padZero(now.getMonth() + 1)}-${padZero(now.getDate())}`;
  const time = `${padZero(now.getHours())}-${padZero(now.getMinutes())}-${padZero(now.getSeconds())}`;
  const shortId = generateShortId();
  return `${studio}_${date}_${time}_${shortId}.${extension}`;
}

// --- PATH VALIDATION ---

/**
 * Validates that a path is inside the Recent Generations cache.
 * Prevents accidental deletion of user Library or system files.
 */
function isInsideCacheDir(filePath: string, cacheDirPath: string): boolean {
  if (!filePath || !cacheDirPath) return false;
  // Normalize path separators for comparison
  const normalizedFile = filePath.replace(/\\/g, '/').toLowerCase();
  const normalizedCache = cacheDirPath.replace(/\\/g, '/').toLowerCase();
  return normalizedFile.startsWith(normalizedCache);
}

// --- DATA URL TO UINT8ARRAY ---

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split('base64,')[1];
  if (!base64) throw new Error('Invalid data URL');
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// --- CACHE SERVICE ---

export const RecentGenerationsCacheService = {
  /**
   * Cache a generation result to disk.
   * Accepts either a data URL (base64) or a remote URL.
   * Returns the local cache path and a display URL on success.
   */
  async cacheGeneration(args: {
    imageDataUrl: string; // base64 data URL of the image
    studio: RecentGenerationStudio;
    cacheDirPath: string;
  }): Promise<{
    success: boolean;
    localCachePath?: string;
    displayUrl?: string;
    error?: string;
  }> {
    try {
      const { imageDataUrl, studio, cacheDirPath } = args;

      if (!window.electronAPI) {
        return { success: false, error: 'electronAPI not available' };
      }

      // Ensure studio subfolder exists
      const studioDir = await window.electronAPI.joinPath(cacheDirPath, studio);
      await window.electronAPI.createDir(studioDir);

      // Generate safe filename
      const filename = generateSafeFilename(studio);
      const localCachePath = await window.electronAPI.joinPath(studioDir, filename);

      // Convert data URL to binary and write
      const buffer = dataUrlToUint8Array(imageDataUrl);
      const success = await window.electronAPI.writeFile(localCachePath, buffer);

      if (!success) {
        return { success: false, error: 'Failed to write cache file to disk' };
      }

      return {
        success: true,
        localCachePath,
        displayUrl: imageDataUrl, // The data URL is already suitable for display
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn('[RecentGenerationsCache] cacheGeneration failed:', message);
      return { success: false, error: message };
    }
  },

  /**
   * Delete a cached file from the Recent Generations cache.
   * Will refuse to delete files outside the cache directory.
   */
  async deleteFromCache(
    localCachePath: string,
    cacheDirPath: string
  ): Promise<boolean> {
    try {
      if (!window.electronAPI?.deleteFile) return false;

      // Safety: validate the path is inside our cache
      if (!isInsideCacheDir(localCachePath, cacheDirPath)) {
        console.error('[RecentGenerationsCache] Refusing to delete file outside cache:', localCachePath);
        return false;
      }

      return await window.electronAPI.deleteFile(localCachePath);
    } catch (error) {
      console.warn('[RecentGenerationsCache] deleteFromCache failed:', error);
      return false;
    }
  },

  /**
   * Export a cached generation to the user's Library.
   * Uses LibraryAssetMaterializer patterns for consistency.
   * Does NOT delete the cached file — it remains in Recent Generations.
   */
  async exportToLibrary(args: {
    displayUrl: string;
    saveDirectoryPath: string | null;
    studio: RecentGenerationStudio;
    actorName?: string;
    category?: string;
  }): Promise<{
    success: boolean;
    localPath?: string;
    previewUrl?: string;
    filename?: string;
    error?: string;
  }> {
    try {
      const { displayUrl, saveDirectoryPath, studio } = args;

      if (!saveDirectoryPath || !window.electronAPI) {
        return { success: false, error: 'Save directory not configured or electronAPI unavailable' };
      }

      // Determine subfolder and filename based on studio
      let relativeFolder = 'Exports';
      let filenamePrefix = 'export';

      if (studio === 'portrait') {
        relativeFolder = 'Actors';
        filenamePrefix = 'portrait';
      } else if (studio === 'props') {
        relativeFolder = 'Props';
        filenamePrefix = 'prop';
      } else if (studio === 'wardrobe') {
        relativeFolder = 'Wardrobe';
        filenamePrefix = 'wardrobe';
      }

      const timestamp = Date.now();
      const filename = `${filenamePrefix}_${timestamp}.png`;

      const folderPath = await window.electronAPI.joinPath(saveDirectoryPath, relativeFolder);
      await window.electronAPI.createDir(folderPath);
      const finalPath = await window.electronAPI.joinPath(folderPath, filename);

      // Fetch the image data from the display URL
      const response = await fetch(displayUrl);
      const blob = await response.blob();
      const buffer = await blob.arrayBuffer();

      const success = await window.electronAPI.writeFile(finalPath, new Uint8Array(buffer));
      if (!success) {
        return { success: false, error: 'Failed to write export file' };
      }

      // Generate display URL for immediate use
      const base64 = await window.electronAPI.readFile(finalPath);
      const previewUrl = base64 ? `data:image/png;base64,${base64}` : displayUrl;

      return {
        success: true,
        localPath: finalPath,
        previewUrl,
        filename,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn('[RecentGenerationsCache] exportToLibrary failed:', message);
      return { success: false, error: message };
    }
  },
};
