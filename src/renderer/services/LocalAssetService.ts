import { safeFetchBlob } from '../utils/NativeFileAssets';

export type MaterializedAsset = {
  localPath: string | null;
  displayUrl: string;
  sourceUrl: string;
  storageKind: 'native' | 'web-download' | 'ephemeral';
  filename: string;
};

function sanitizeFilename(str: string): string {
  return str.replace(/[^a-z0-9_-]/gi, '_');
}

function buildShotsAssetPath(saveDirectoryPath: string, subdir: string, filename: string): string {
  if (!saveDirectoryPath) return filename;
  return `${saveDirectoryPath}/${subdir}/${filename}`.replace(/\/+/g, '/');
}

async function materializeImageAsset(args: {
  sourceUrl: string;
  sceneId: string;
  variantId: string;
  kind: 'preview' | 'final' | 'blueprint';
  saveDirectoryPath?: string | null;
  preferredSubdir?: string;
  forcePngExtension?: boolean;
}): Promise<MaterializedAsset> {
  const { sourceUrl, sceneId, variantId, kind, saveDirectoryPath, preferredSubdir = 'Shots' } = args;
  
  const filename = `shot_${kind}_${sanitizeFilename(sceneId)}_${sanitizeFilename(variantId)}.png`;

  if (window.electronAPI && saveDirectoryPath) {
    try {
      const folderPath = await window.electronAPI.joinPath(saveDirectoryPath, preferredSubdir);
      await window.electronAPI.createDir(folderPath); // Ensure dir exists
      
      const targetPath = await window.electronAPI.joinPath(folderPath, filename);
      
      // Fetch via Blob
      const blob = await safeFetchBlob(sourceUrl);
      const arrayBuffer = await blob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      
      const success = await window.electronAPI.writeFile(targetPath, uint8Array);
      
      if (success) {
        let finalDisplayUrl = sourceUrl;
        
        // Attempt Native Local Protocol if implemented, otherwise fallback to reading Base64 via IPC to bypass Chromium file:// locks
        if (window.electronAPI?.readFile) {
           try {
               const base64Data = await window.electronAPI.readFile(targetPath);
               if (base64Data) {
                   finalDisplayUrl = `data:image/png;base64,${base64Data}`;
               }
           } catch (readErr) {
               console.warn('[LocalAssetService] Failed to generate data URL via IPC; falling back to source', readErr);
           }
        }

        console.log('[LocalAssetService] Native materialized asset:', {
          targetPath,
          displayUrl: finalDisplayUrl.substring(0, 50) + '...'
        });

        return {
          localPath: targetPath,
          displayUrl: finalDisplayUrl,
          sourceUrl,
          storageKind: 'native',
          filename
        };
      }
    } catch (error) {
      console.warn('[LocalAssetService] Failed to natively materialize asset:', error);
      // Fall through to fallback
    }
  }

  // Web fallback or failure to write
  return {
    localPath: null,
    displayUrl: sourceUrl,
    sourceUrl,
    storageKind: 'ephemeral',
    filename
  };
}

export const LocalAssetService = {
  materializeImageAsset,
  buildShotsAssetPath,
  sanitizeFilename
};
