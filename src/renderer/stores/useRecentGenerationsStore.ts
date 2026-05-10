import { create } from 'zustand';

// --- TYPES ---

export type RecentGenerationStudio =
  | 'portrait'
  | 'props'
  | 'wardrobe'
  | 'staging'
  | 'nanocast'
  | 'general';

export type RecentGeneration = {
  id: string;
  studio: RecentGenerationStudio;
  cloudUrl?: string;
  localCachePath: string;
  displayUrl: string; // base64 data URL for immediate display
  createdAt: number;
  prompt?: string;
  mode?: 'hosted' | 'byok';
  displayLabel?: string;
  generationStatus?: 'preview';
  featureSource?: 'character_pitch_sheet' | string;
  exported: boolean;
};

type ManifestEntry = Omit<RecentGeneration, 'displayUrl'>;

const MANIFEST_KEY = 'recent_generations_manifest';
const MAX_PER_STUDIO = 20;
const DEDUPE_WINDOW_MS = 2000;

// --- MANIFEST PERSISTENCE ---

function loadManifest(): ManifestEntry[] {
  try {
    const raw = localStorage.getItem(MANIFEST_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Basic shape validation
    return parsed.filter(
      (e: unknown) =>
        typeof e === 'object' &&
        e !== null &&
        typeof (e as ManifestEntry).id === 'string' &&
        typeof (e as ManifestEntry).localCachePath === 'string' &&
        typeof (e as ManifestEntry).studio === 'string' &&
        typeof (e as ManifestEntry).createdAt === 'number'
    );
  } catch {
    return [];
  }
}

function saveManifest(generations: RecentGeneration[]) {
  try {
    const entries: ManifestEntry[] = generations.map(
      ({ displayUrl: _displayUrl, ...rest }) => rest
    );
    localStorage.setItem(MANIFEST_KEY, JSON.stringify(entries));
  } catch (e) {
    console.warn('[RecentGenerations] Failed to save manifest:', e);
  }
}

// --- STORE ---

interface RecentGenerationsState {
  recentGenerations: RecentGeneration[];
  activeRecentGenerationIdByStudio: Record<string, string | null>;
  cacheDirPath: string | null;
  initialized: boolean;

  // Actions
  initStore: () => Promise<void>;
  addRecentGeneration: (record: Omit<RecentGeneration, 'id' | 'exported'> & { id?: string }) => void;
  setActiveRecentGeneration: (studio: RecentGenerationStudio, id: string | null) => void;
  markExported: (id: string) => void;
  removeRecentGeneration: (id: string) => void;
  clearRecentGenerationsForStudio: (studio: RecentGenerationStudio) => void;
  clearAllRecentGenerations: () => void;

  // Selectors
  getRecentGenerationsForStudio: (studio: RecentGenerationStudio) => RecentGeneration[];
}

export const useRecentGenerationsStore = create<RecentGenerationsState>((set, get) => ({
  recentGenerations: [],
  activeRecentGenerationIdByStudio: {},
  cacheDirPath: null,
  initialized: false,

  initStore: async () => {
    if (get().initialized) return;

    // 1. Resolve cache directory path
    let cachePath: string | null = null;
    try {
      cachePath = (await window.electronAPI?.getRecentGenerationsPath?.()) ?? null;
    } catch (e) {
      console.warn('[RecentGenerations] Failed to resolve cache path:', e);
    }

    // 2. Load manifest and validate entries
    const manifest = loadManifest();
    const validEntries: RecentGeneration[] = [];

    for (const entry of manifest) {
      // Validate that the cached file still exists on disk
      let fileExists = false;
      try {
        if (window.electronAPI?.exists) {
          fileExists = await window.electronAPI.exists(entry.localCachePath);
        }
      } catch {
        fileExists = false;
      }

      if (fileExists) {
        // Load the image data for display
        let displayUrl = '';
        try {
          if (window.electronAPI?.readFile) {
            const base64 = await window.electronAPI.readFile(entry.localCachePath);
            if (base64) {
              displayUrl = `data:image/png;base64,${base64}`;
            }
          }
        } catch {
          // If we can't read it, skip this entry
          continue;
        }

        if (displayUrl) {
          validEntries.push({ ...entry, displayUrl });
        }
      }
      // If file doesn't exist, silently drop the stale entry
    }

    set({
      cacheDirPath: cachePath,
      recentGenerations: validEntries,
      initialized: true,
    });

    // Save cleaned manifest (removes stale entries)
    saveManifest(validEntries);
  },

  addRecentGeneration: (record) => {
    const state = get();

    // Generate a unique ID if not provided
    const id = record.id || `rg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Deduplication check: same studio + similar timestamp within 2-second window
    const isDuplicate = state.recentGenerations.some(
      (existing) =>
        existing.studio === record.studio &&
        Math.abs(existing.createdAt - record.createdAt) < DEDUPE_WINDOW_MS &&
        (existing.localCachePath === record.localCachePath ||
          (existing.prompt && existing.prompt === record.prompt && existing.displayUrl === record.displayUrl))
    );

    if (isDuplicate) {
      console.log('[RecentGenerations] Skipping duplicate entry');
      return;
    }

    const newGeneration: RecentGeneration = {
      ...record,
      id,
      exported: false,
    };

    // Get existing generations for this studio
    const studioGens = state.recentGenerations.filter((g) => g.studio === record.studio);
    const otherGens = state.recentGenerations.filter((g) => g.studio !== record.studio);

    // FIFO eviction: remove oldest non-exported if at max
    let updatedStudioGens = [newGeneration, ...studioGens];
    if (updatedStudioGens.length > MAX_PER_STUDIO) {
      // Find the oldest non-exported entry to evict
      for (let i = updatedStudioGens.length - 1; i >= 1; i--) {
        if (!updatedStudioGens[i].exported) {
          // Delete from disk silently
          try {
            window.electronAPI?.deleteFile?.(updatedStudioGens[i].localCachePath);
          } catch {
            // Best-effort cleanup
          }
          updatedStudioGens = [
            ...updatedStudioGens.slice(0, i),
            ...updatedStudioGens.slice(i + 1),
          ];
          break;
        }
      }
      // If all are exported and we're still over, remove the oldest anyway
      if (updatedStudioGens.length > MAX_PER_STUDIO) {
        const removed = updatedStudioGens.pop();
        if (removed) {
          try {
            window.electronAPI?.deleteFile?.(removed.localCachePath);
          } catch {
            // Best-effort
          }
        }
      }
    }

    const allGens = [...updatedStudioGens, ...otherGens];

    set({
      recentGenerations: allGens,
      activeRecentGenerationIdByStudio: {
        ...state.activeRecentGenerationIdByStudio,
        [record.studio]: id,
      },
    });

    saveManifest(allGens);
  },

  setActiveRecentGeneration: (studio, id) => {
    set((state) => ({
      activeRecentGenerationIdByStudio: {
        ...state.activeRecentGenerationIdByStudio,
        [studio]: id,
      },
    }));
  },

  markExported: (id) => {
    set((state) => {
      const updated = state.recentGenerations.map((g) =>
        g.id === id ? { ...g, exported: true } : g
      );
      saveManifest(updated);
      return { recentGenerations: updated };
    });
  },

  removeRecentGeneration: (id) => {
    const state = get();
    const target = state.recentGenerations.find((g) => g.id === id);

    // Delete from disk
    if (target) {
      try {
        window.electronAPI?.deleteFile?.(target.localCachePath);
      } catch {
        // Best-effort
      }
    }

    const updated = state.recentGenerations.filter((g) => g.id !== id);

    // Clear active selection if it was the removed one
    const newActive = { ...state.activeRecentGenerationIdByStudio };
    for (const studio of Object.keys(newActive)) {
      if (newActive[studio] === id) {
        newActive[studio] = null;
      }
    }

    set({ recentGenerations: updated, activeRecentGenerationIdByStudio: newActive });
    saveManifest(updated);
  },

  clearRecentGenerationsForStudio: (studio) => {
    const state = get();
    const toRemove = state.recentGenerations.filter((g) => g.studio === studio);
    const remaining = state.recentGenerations.filter((g) => g.studio !== studio);

    // Delete all from disk
    for (const g of toRemove) {
      try {
        window.electronAPI?.deleteFile?.(g.localCachePath);
      } catch {
        // Best-effort
      }
    }

    set({
      recentGenerations: remaining,
      activeRecentGenerationIdByStudio: {
        ...state.activeRecentGenerationIdByStudio,
        [studio]: null,
      },
    });
    saveManifest(remaining);
  },

  clearAllRecentGenerations: () => {
    const state = get();
    for (const g of state.recentGenerations) {
      try {
        window.electronAPI?.deleteFile?.(g.localCachePath);
      } catch {
        // Best-effort
      }
    }
    set({
      recentGenerations: [],
      activeRecentGenerationIdByStudio: {},
    });
    saveManifest([]);
  },

  getRecentGenerationsForStudio: (studio) => {
    return get().recentGenerations.filter((g) => g.studio === studio);
  },
}));
