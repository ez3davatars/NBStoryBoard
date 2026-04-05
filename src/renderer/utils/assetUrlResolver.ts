export type ResolveAssetUrlInput = {
  localUrl?: string | null;
  localPath?: string | null;
  
  localFinalPath?: string | null;
  localPreviewPath?: string | null;
  sourceFinalUrl?: string | null;
  sourcePreviewUrl?: string | null;

  sourceUrl?: string | null;

  previewUrl?: string | null;
  finalUrl?: string | null;
  remoteUrl?: string | null;
};

export async function resolveDisplayUrl(input: ResolveAssetUrlInput): Promise<string | null> {
  // 1. Direct local blobl/data URL is safest runtime asset
  if (input.localUrl && (input.localUrl.startsWith('blob:') || input.localUrl.startsWith('data:'))) {
    return input.localUrl;
  }
  
  if (input.finalUrl && (input.finalUrl.startsWith('blob:') || input.finalUrl.startsWith('data:'))) {
    return input.finalUrl;
  }
  
  if (input.previewUrl && (input.previewUrl.startsWith('blob:') || input.previewUrl.startsWith('data:'))) {
    return input.previewUrl;
  }

  // 2. Native file system path read (strictly from canonical or legacy native paths)
  const candidatePath = input.localFinalPath || input.localPreviewPath || input.localPath || 
    (input.finalUrl && (input.finalUrl.startsWith('/') || input.finalUrl.startsWith('file://') || /^[a-zA-Z]:\\/.test(input.finalUrl)) ? input.finalUrl : null);
    
  if (candidatePath && window.electronAPI) {
      try {
        const cleanlyFormattedPath = candidatePath.startsWith('file://') ? candidatePath.slice(7) : candidatePath;
        const exists = await window.electronAPI.exists(cleanlyFormattedPath);
        if (exists) {
           const base64 = await window.electronAPI.readFile(cleanlyFormattedPath);
           if (base64) {
             const ext = cleanlyFormattedPath.split('.').pop()?.toLowerCase() || 'png';
             return `data:image/${ext};base64,${base64}`;
           }
        }
      } catch (error) {
        // Suppress failure noise and fallback gracefully
      }
    }

  // 3. Fallback to remote URLs
  if (input.sourceUrl && input.sourceUrl.startsWith('http')) return input.sourceUrl;
  if (input.sourceFinalUrl && input.sourceFinalUrl.startsWith('http')) return input.sourceFinalUrl;
  if (input.sourcePreviewUrl && input.sourcePreviewUrl.startsWith('http')) return input.sourcePreviewUrl;
  if (input.finalUrl && input.finalUrl.startsWith('http')) return input.finalUrl;
  if (input.previewUrl && input.previewUrl.startsWith('http')) return input.previewUrl;
  if (input.remoteUrl && input.remoteUrl.startsWith('http')) return input.remoteUrl;
  
  // Last resorts (just return what we have as raw to avoid completely breaking things)
  return input.localPath || input.localUrl || input.sourceUrl || input.sourceFinalUrl || input.sourcePreviewUrl || input.finalUrl || input.previewUrl || input.remoteUrl || null;
}
