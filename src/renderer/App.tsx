import { useEffect, useState, Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
// ... existing imports ...


import SceneCanvas from './components/SceneCanvas';
import ProductionConsole from './components/ProductionConsole';
import WardrobeStudio from './components/WardrobeStudio';
import PropAccessoryStudio from './components/PropAccessoryStudio';
import PortraitStudio from './components/PortraitStudio';
import VeoPromptStudio from './components/VeoPromptStudio';
import { StorageService } from './services/StorageService';
import { LOGO_BASE64 } from './assets/logo';

import type {
  ViewMode,
  AppState,
  CastMember
} from './context/AppContext';
import {
  useAppContext,
  AppContext
} from './context/AppContext';
import { HelpProvider } from './context/HelpContext';
import CastingForge from './components/CastingForge';
import NanoCastingDirector from './components/NanoCastingDirector';
import { FileMenu } from './components/ui/FileMenu';
import { AppCloseDialog } from './components/ui/AppCloseDialog';

import {
  Settings,
  Clapperboard,
  UserPlus,
  Download,
  Copy,
  X,
  Hammer
} from 'lucide-react';

// --- 1. TYPES & INTERFACES ---

import { NanobananaThinking } from './components/ui/NanobananaThinking';

const ImageInspector = () => {
  const { state, dispatch } = useAppContext();
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);

  if (!state.inspectImage) return null;

  const closeInspector = () => {
    dispatch({ type: 'SET_INSPECT_IMAGE', payload: null });
    dispatch({ type: 'SET_INSPECT_MASK', payload: null });
  };

  return (
    <div
      className="fixed inset-0 z-[2000] bg-black/60 backdrop-blur-xl flex items-center justify-center p-4 sm:p-8 animate-in fade-in duration-300"
      onClick={closeInspector}
    >
      <div className="relative w-full h-full flex items-center justify-center p-2 sm:p-4">
        <button
          className="fixed top-3 right-3 sm:top-6 sm:right-6 text-white/40 hover:text-white transition-colors flex items-center gap-2 uppercase font-black tracking-widest text-[10px] sm:text-xs z-[2001] bg-black/60 px-3 sm:px-4 py-2 rounded-lg border border-white/10 backdrop-blur-md"
          onClick={(e) => { e.stopPropagation(); closeInspector(); }}
        >
          Close <X className="w-4 h-4" />
        </button>

        <div className="w-full h-full flex flex-col md:flex-row items-center justify-center gap-4 sm:gap-8 px-2 sm:px-4 pt-14 sm:pt-12 pb-36 sm:pb-12 overflow-y-auto overflow-x-hidden">
          <div className="w-full md:flex-1 flex flex-col items-center min-w-0">
            <span className="text-[10px] items-center gap-2 mb-2 font-black uppercase tracking-[0.3em] text-white/50 bg-white/5 px-3 py-1 rounded-full border border-white/10 backdrop-blur-md">Original Content</span>
            <img
              src={state.inspectImage}
              className="max-w-full max-h-[calc(100dvh-16rem)] sm:max-h-[70vh] object-contain rounded-xl -[0_0_150px_rgba(0,0,0,1)] animate-in zoom-in duration-500 cursor-default ring-1 ring-white/10"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          {state.inspectMask && (
            <div className="w-full md:flex-1 flex flex-col items-center min-w-0">
              <span className="text-[10px] items-center gap-2 mb-2 font-black uppercase tracking-[0.3em] text-yellow-400/70 bg-yellow-400/5 px-3 py-1 rounded-full border border-yellow-400/10 backdrop-blur-md">Generated Mask</span>
              <img
                src={state.inspectMask}
                className="max-w-full max-h-[calc(100dvh-16rem)] sm:max-h-[70vh] object-contain rounded-xl -[0_0_150px_rgba(0,0,0,1)] animate-in zoom-in duration-700 cursor-default ring-1 ring-yellow-500/20"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}
        </div>

        {/* Save Confirmation Toast */}
        {showSaveConfirm && (
          <div className="fixed bottom-28 sm:bottom-32 left-1/2 -translate-x-1/2 z-[2005] max-w-[calc(100vw-2rem)] bg-black/80 backdrop-blur-xl border border-yellow-500/30 px-4 sm:px-8 py-4 rounded-2xl -[0_0_50px_rgba(234,179,8,0.25)] animate-in slide-in-from-bottom-5 fade-in duration-300 flex flex-col items-center gap-2">
            <div className="flex items-center gap-3 text-yellow-400">
              <UserPlus className="w-5 h-5 -[0_0_8px_rgba(234,179,8,0.5)]" />
              <span className="font-black uppercase tracking-[0.2em] text-xs">Asset Secured</span>
            </div>
            <div className="flex items-center gap-2 w-full justify-center">
              <span className="h-[1px] w-8 bg-gradient-to-r from-transparent to-blue-500/50"></span>
              <span className="text-[10px] text-blue-400/80 font-mono tracking-wider uppercase">Saved to Actors</span>
              <span className="h-[1px] w-8 bg-gradient-to-l from-transparent to-blue-500/50"></span>
            </div>
          </div>
        )}

        <div className="fixed bottom-4 sm:bottom-12 left-1/2 -translate-x-1/2 flex flex-wrap justify-center gap-2 sm:gap-4 z-[2001] max-w-[calc(100vw-1.5rem)] bg-black/40 backdrop-blur-2xl border border-white/10 p-2 rounded-2xl ">
          <button
            onClick={(e) => {
              e.stopPropagation();
              const newCast: CastMember = {
                id: `cast-insp-${Date.now()}`,
                url: state.inspectImage!,
                tag: 'front',
                name: 'New Cast Member',
                profile: { identity: 'Unknown', wardrobe: '', accessories: '', style: '' }
              };
              dispatch({ type: 'ADD_CAST', payload: newCast });
              dispatch({ type: 'ADD_LOG', payload: { message: "Added to Cast", type: 'success' } });
            }}
            className="w-12 h-12 sm:w-14 sm:h-14 bg-emerald-500/20 hover:bg-emerald-500 text-emerald-500 hover:text-white rounded-xl transition-all transform hover:scale-110 flex items-center justify-center border border-emerald-500/30"
            title="Add to Cast"
          >
            <UserPlus className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.5]" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              dispatch({ type: 'SET_LAST_CASTED_IMAGE', payload: state.inspectImage });
              dispatch({ type: 'SET_VIEW', payload: 'casting' });
              closeInspector();
              dispatch({ type: 'ADD_LOG', payload: { message: "Loaded into Forge", type: 'success' } });
            }}
            className="w-12 h-12 sm:w-14 sm:h-14 bg-blue-500/20 hover:bg-blue-500 text-blue-500 hover:text-white rounded-xl transition-all transform hover:scale-110 flex items-center justify-center border border-blue-500/30"
            title="Load to Forge"
          >
            <Hammer className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.5]" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); closeInspector(); }}
            className="w-12 h-12 sm:w-14 sm:h-14 bg-red-500/20 hover:bg-red-500 text-red-500 hover:text-white rounded-xl transition-all transform hover:scale-110 flex items-center justify-center border border-red-500/30"
            title="Close"
          >
            <X className="w-5 h-5 sm:w-6 sm:h-6 stroke-[3]" />
          </button>
          <button
            onClick={async (e) => {
              e.stopPropagation();
              if (state.saveDirectoryHandle) {
                try {
                  const actorsDir = await state.saveDirectoryHandle.getDirectoryHandle('Actors', { create: true });
                  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                  const filename = `Inspect-Actor-${timestamp}.png`;
                  const fileHandle = await actorsDir.getFileHandle(filename, { create: true });
                  const writable = await fileHandle.createWritable();
                  const response = await fetch(state.inspectImage!);
                  const blob = await response.blob();
                  await writable.write(blob);
                  await writable.close();
                  setShowSaveConfirm(true);
                  setTimeout(() => setShowSaveConfirm(false), 2000);
                  dispatch({ type: 'ADD_LOG', payload: { message: `Saved to Actors/${filename}`, type: 'success' } });
                } catch (err: any) {
                  console.error("Save failed", err);
                  dispatch({ type: 'ADD_LOG', payload: { message: `Save failed: ${err.message}`, type: 'error' } });
                }
              } else {
                const link = document.createElement('a');
                link.href = state.inspectImage!;
                link.download = `NB-Inspect-${Date.now()}.png`;
                link.click();
              }
            }}
            className="w-12 h-12 sm:w-14 sm:h-14 bg-white/10 hover:bg-white text-white hover:text-black rounded-xl transition-all transform hover:scale-110 flex items-center justify-center border border-white/20"
            title={state.saveDirectoryHandle ? "Save to Actors Folder" : "Download to Disk"}
          >
            <Download className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.5]" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(state.inspectImage!);
              dispatch({ type: 'ADD_LOG', payload: { message: "Image Data URL copied to clipboard", type: 'info' } });
            }}
            className="w-12 h-12 sm:w-14 sm:h-14 bg-blue-500/20 hover:bg-blue-600 text-blue-400 hover:text-white rounded-xl transition-all transform hover:scale-110 flex items-center justify-center border border-blue-500/30"
            title="Copy Raw Data"
          >
            <Copy className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.5]" />
          </button>
        </div>
      </div>
    </div>
  );
};

// --- ERROR BOUNDARY ---
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-[9999] bg-black text-red-500 p-10 font-mono overflow-auto">
          <h1 className="text-4xl font-black mb-4">CRITICAL SYSTEM FAILURE</h1>
          <h2 className="text-xl text-white mb-2">Error Details:</h2>
          <pre className="bg-red-900/20 p-4 border border-red-500 rounded text-sm whitespace-pre-wrap">
            {this.state.error?.toString()}
          </pre>
          <div className="mt-8">
            <h3 className="text-gray-400">Stack Trace:</h3>
            <pre className="text-xs text-gray-500 mt-2">
              {this.state.error?.stack}
            </pre>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="mt-8 bg-red-600 hover:bg-red-500 text-white px-6 py-3 rounded-lg font-bold"
          >
            SYSTEM REBOOT (RELOAD)
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// --- 5. MAIN APP SHELL ---

const App = () => {
  const { state, dispatch } = useAppContext();

  useEffect(() => {
    console.log('[NBStoryBoard] VITE_APP_ENV =', import.meta.env.VITE_APP_ENV ?? '(undefined)');
  }, []);

  // Master Storyboard Toggle Redirect
  useEffect(() => {
    if (!state.isStoryboardEnabled && state.view === 'veo') {
      dispatch({ type: 'SET_VIEW', payload: 'staging' });
      dispatch({ type: 'ADD_LOG', payload: { message: "Storyboard is disabled.", type: 'info' } });
    }
  }, [state.isStoryboardEnabled, state.view, dispatch]);

  const performDiscardSession = async () => {
    // Clear Context State
    dispatch({ type: 'DISCARD_SESSION' });

    // Clear Persistence Storage
    try {
      await Promise.all([
        StorageService.remove('nano_shots'),
        StorageService.remove('nano_tokens'),
        StorageService.remove('nano_annotations'),
        StorageService.remove('nano_wardrobe'),
        StorageService.remove('nano_props')
      ]);

      localStorage.removeItem('nano_bg_url');
      localStorage.removeItem('nano_depth_url');
      localStorage.removeItem('nano_depth_hash');
      localStorage.removeItem('nano_source_hash');
      localStorage.removeItem('nano_active_shot_id');
    } catch (e) {
      console.error("Failed to clear session storage during discard", e);
    }

    // Signal Main Process to finally close
    if (window.electronAPI?.confirmDiscardSession) {
      window.electronAPI?.confirmDiscardSession();
    }
  };

  // Session Discard Interception (From Main)
  useEffect(() => {
    if (window.electronAPI?.onRequestDiscardSession) {
      window.electronAPI.onRequestDiscardSession(() => performDiscardSession());
    }
  }, [dispatch]);

  // App Close Interception (Custom Dialog)
  const [showAppCloseDialog, setShowAppCloseDialog] = useState(false);
  useEffect(() => {
    if (window.electronAPI?.onRequestAppClose) {
      window.electronAPI.onRequestAppClose(() => {
        setShowAppCloseDialog(true);
      });
    }
  }, []);

  const handleSaveClose = () => {
    window.dispatchEvent(new CustomEvent('trigger-save-on-close'));
  };

  // Persistence: Restore Save Directory Handle
  useEffect(() => {
    const restoreHandle = async () => {
      const savedHandle = await StorageService.load<FileSystemDirectoryHandle | null>('nano_save_handle', null);
      if (savedHandle) {
        // Verify permission (optional but good practice, though browsers may prompt or fail quietly if not granted)
        // For now, we just restore it. If it fails later, we'll catch it.
        dispatch({ type: 'SET_SAVE_DIRECTORY', payload: savedHandle });
        dispatch({ type: 'ADD_LOG', payload: { message: `Restored save folder: ${savedHandle.name}`, type: 'success' } });
      }
    };
    restoreHandle();
  }, [dispatch]);

  // Sync View to Settings Modal
  useEffect(() => {
    if (state.view === 'settings') {
      setShowSettings(true);
    }
  }, [state.view]);

  // Settings Modal State
  const [showSettings, setShowSettings] = useState(false);
  const [tempKey, setTempKey] = useState(state.apiKey);
  const [tempModel, setTempModel] = useState<AppState['model']>(state.model);

  const closeSettings = () => {
    setShowSettings(false);
    if (state.view === 'settings') {
      dispatch({ type: 'SET_VIEW', payload: 'casting' }); // Fallback to casting
    }
  };

  const saveSettings = () => {
    dispatch({ type: 'SET_API_KEY', payload: tempKey });
    dispatch({ type: 'SET_MODEL', payload: tempModel });
    closeSettings();
    dispatch({ type: 'ADD_LOG', payload: { message: "Settings saved", type: 'success' } });
  };


  // Sync Actors from Disk Handle (External Folder)
  useEffect(() => {
    const syncFromDisk = async () => {
      // In Native Electron mode, ignore Web Handlers to avoid double-sync or conflicts
      if (window.electronAPI || !state.saveDirectoryHandle) return;

      // @ts-ignore
      if ((await state.saveDirectoryHandle.queryPermission({ mode: 'read' })) !== 'granted') return;

      try {
        // dispatch({ type: 'ADD_LOG', payload: { message: "Scanning external actors folder...", type: 'info' } });

        let actorsDir;
        try {
          actorsDir = await state.saveDirectoryHandle.getDirectoryHandle('Actors', { create: false });
        } catch (e) {
          // Actors dir doesn't exist yet, nothing to sync
          return;
        }

        const externalActors: CastMember[] = [];
        // Iterate files
        // @ts-ignore - FileSystemDirectoryHandle is iterable in modern browsers
        for await (const entry of actorsDir.values()) {
          if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.png')) {
            try {
              // Parse filename: Actor-{index}-{safename}.png
              const nameParts = entry.name.match(/Actor-(\d+)-(.*)\.png/i);
              let displayName = entry.name.replace('.png', '');
              let identity = "Imported Actor";

              if (nameParts) {
                // Cleaner name extraction
                displayName = nameParts[2].replace(/_/g, ' ');
                identity = displayName;
              }

              // Deduplicate based on ID scheme
              const diskId = `disk-${entry.name}`;
              // Avoid re-reading if already in library
              // However, we can't easily check state inside async loop without updated ref or dependency
              // We'll filter later or hope state is fresh enough on mount

              const file = await entry.getFile();
              // Read as DataURL
              const reader = new FileReader();
              const dataUrl = await new Promise<string>((resolve) => {
                reader.onload = (e) => resolve(e.target?.result as string);
                reader.readAsDataURL(file);
              });

              externalActors.push({
                id: diskId,
                url: dataUrl,
                tag: 'front', // Default for single files
                name: displayName,
                profile: {
                  identity: identity,
                  wardrobe: "",
                  accessories: "",
                  style: "External Asset"
                },
                filename: entry.name
              });
            } catch (err) {
              console.warn("Failed to load actor file:", entry.name, err);
            }
          }
        }

        if (externalActors.length > 0) {
          // Functional update dispatch if possible, or just dispatch SET with merged list
          // Since we can't easily access latest 'state' inside this async closure if it's stale,
          // we rely on the specific dependency [state.saveDirectoryHandle] which implies this runs once per folder change.
          // But we should check duplicates against the *current* state at dispatch time.
          // We can pass a function to dispatch if it was setState, but here it's useReducer.
          // We will just dispatch a new action 'MERGE_ACTOR_LIBRARY' if it existed, or just SET.
          // I'll grab the latest state from the closure (it closed over state).
          // NOTE: If state.actorLibrary changes often, we might miss updates unless we include it in deps.
          // Inclusion in deps might cause loop.
          // Let's assume SET_ACTOR_LIBRARY is idempotent if we merge carefully.

          // To be safe, let's just dispatch ADD for each one? No, too many renders.
          // We will use SET_ACTOR_LIBRARY with a merge strategy.

          // MERGE STRATEGY:
          // 1. New items from disk -> Add
          // 2. Existing items matching disk -> Update filename (preserve name/tags)

          const libraryMap = new Map(state.actorLibrary.map((a: CastMember) => [a.id, a]));
          let hasChanges = false;

          const existingFilenamesMap = new Map<string, CastMember>();
          state.actorLibrary.forEach(a => {
            if (a.filename) existingFilenamesMap.set(a.filename, a);
          });

          externalActors.forEach(diskActor => {
            const existingById = libraryMap.get(diskActor.id);

            if (existingById) {
              // Exists by exact ID. Update if missing filename
              if (!existingById.filename) {
                libraryMap.set(diskActor.id, { ...existingById, filename: diskActor.filename });
                hasChanges = true;
              }
            } else {
              // Check if exists by Filename (UUID scheme vs disk- scheme)
              const existingByFilename = diskActor.filename ? existingFilenamesMap.get(diskActor.filename) : undefined;

              if (existingByFilename) {
                // The memory zombie exists! We should securely upgrade it to the new disk standard
                // We REMOVE the old UUID zombie from the library
                libraryMap.delete(existingByFilename.id);
                // We insert the fresh disk actor, but rescue any metadata from the zombie
                libraryMap.set(diskActor.id, {
                  ...diskActor,
                  profile: {
                    identity: existingByFilename.profile?.identity || diskActor.profile?.identity || "Imported Actor",
                    wardrobe: existingByFilename.profile?.wardrobe || diskActor.profile?.wardrobe || "",
                    accessories: existingByFilename.profile?.accessories || diskActor.profile?.accessories || "",
                    style: existingByFilename.profile?.style || diskActor.profile?.style || "External Asset"
                  }
                });
                hasChanges = true;
              } else {
                // Truly new from disk
                libraryMap.set(diskActor.id, diskActor);
                hasChanges = true;
              }
            }
          });

          if (hasChanges) {
            const merged = Array.from(libraryMap.values());
            // Sort by latest added (optional, but keep consistent)
            // merged.sort(...) 
            dispatch({ type: 'SET_ACTOR_LIBRARY', payload: merged });
            dispatch({ type: 'ADD_LOG', payload: { message: `Synced ${externalActors.length} actors from disk.`, type: 'success' } });
          }
        }
      } catch (e: any) {
        console.error("Disk sync error:", e);
        dispatch({ type: 'ADD_LOG', payload: { message: `Disk scan failed: ${e.message}`, type: 'error' } });
      }
    };

    if (state.saveDirectoryHandle) {
      syncFromDisk();
    }
  }, [state.saveDirectoryHandle]); // Only run when folder connection changes

  // --- NATIVE DISK SYNC (Electron) ---
  useEffect(() => {
    const syncFromNative = async () => {
      if (!window.electronAPI || !state.saveDirectoryPath) return;

      try {

        const actorsPath = await window.electronAPI.joinPath(state.saveDirectoryPath, 'Actors');

        // Categories to scan + Root (empty string)
        const SCAN_TARGETS = ['', 'Realism', 'Stylized Cartoon', 'Illustration', 'Sci-Fi', 'Uncategorized', 'Extras'];
        const externalActors: CastMember[] = [];

        // Parallel Scan of All Targets
        await Promise.all(SCAN_TARGETS.map(async (catOrRoot) => {
          const catPath = catOrRoot
            ? await window.electronAPI!.joinPath(actorsPath, catOrRoot)
            : actorsPath;

          if (!await window.electronAPI!.exists(catPath)) return;

          const filenames = await window.electronAPI!.listFiles(catPath);
          if (!filenames || filenames.length === 0) return;

          // Map Category to Style for Metadata Consistency
          const catToStyle: Record<string, string> = {
            "Realism": "exact_studio",
            "Stylized Cartoon": "family_3d",
            "Illustration": "retro_anime",
            "Sci-Fi": "cyberpunk_neon",
            "Extras": "exact_studio"
          };
          const defaultStyle = catToStyle[catOrRoot] || "exact_studio";

          await Promise.all(filenames.map(async (filename) => {
            if (!filename.toLowerCase().endsWith('.png')) return;

            try {
              const fullPath = await window.electronAPI!.joinPath(catPath, filename);
              const base64 = await window.electronAPI!.readFile(fullPath);

              if (!base64) return;

              const diskId = `disk-${catOrRoot || 'root'}-${filename}`; // Ensure ID uniqueness
              const displayName = filename.replace(/\.(png|jpg|jpeg)$/i, '');

              externalActors.push({
                id: diskId,
                url: `data:image/png;base64,${base64}`,
                tag: 'front',
                name: displayName,
                filename: catOrRoot ? `${catOrRoot}/${filename}` : filename,
                profile: {
                  identity: displayName,
                  wardrobe: '',
                  accessories: '',
                  style: defaultStyle
                }
              });
            } catch (e) {
              console.warn(`Failed to load ${filename} from ${catOrRoot}`, e);
            }
          }));
        }));

        if (externalActors.length > 0 || state.actorLibrary.some(a => a.id.startsWith('disk-'))) {
          // SYNC TYPE: AUTHORITATIVE DISK SYNC
          // We must remove 'disk-' actors that are NO LONGER in the folder (e.g. they were from Root, or deleted)
          // And add/update the ones that are present.

          const foundIds = new Set(externalActors.map(a => a.id));
          console.log(`[Native Sync] Found ${externalActors.length} files on disk. Mapping existing state...`);

          // 1. Keep non-disk actors (created in-app)
          const preservedActors = state.actorLibrary.filter(a => !a.id.startsWith('disk-'));
          console.log(`[Native Sync] Preserving ${preservedActors.length} memory-based actors.`);

          // 2. Keep disk actors that STILL exist (preserve their metadata if any)
          const existingDiskActors = state.actorLibrary.filter(a => a.id.startsWith('disk-') && foundIds.has(a.id));
          console.log(`[Native Sync] Retaining ${existingDiskActors.length} valid disk-linked actors.`);

          // 3. Merge New/Updated from Scan
          // We prioritize the *Scan* for URL/Path updates, but might want to keep *Tags/Name* from Memory?
          // For now, let's just use the Scan Result as truth for "External Assets", 
          // but maybe preserve Profile/Name if ID matches?

          // Better: Create a map of Existing for lookups
          const existingMap = new Map(existingDiskActors.map(a => [a.id, a]));

          // NEW: Deduplicate memory zombies (from before disk- ID schemes or WardrobeStudio)
          // Find any preserved actors whose basename ALREADY exists as a disk actor
          const newlyDiscoveredBasenames = new Set(externalActors.map(a => a.filename?.split(/[\\/]/).pop() || ""));

          // Filter out preserved actors if their base filename corresponds to an actual file we just synced from disk.
          const cleanPreservedActors = preservedActors.filter(pa => {
            const basename = pa.filename?.split(/[\\/]/).pop();
            // If the disk scanner found this image natively, we DROP the memory zombie and let finalDiskActors handle it
            if (basename && newlyDiscoveredBasenames.has(basename)) return false;
            return true;
          });

          const finalDiskActors = externalActors.map(newActor => {
            const existing = existingMap.get(newActor.id);
            if (existing) {
              return { ...newActor, ...existing, url: newActor.url, filename: newActor.filename }; // Update URL and Path, keep metadata
            }

            // Also check if there was a memory zombie (UUID id scheme) that we just purged, 
            // and rescue its custom profile/metadata (like specific identity fields)
            const basename = newActor.filename?.split(/[\\/]/).pop() || "";
            const memoryZombie = preservedActors.find(pa => pa.filename?.split(/[\\/]/).pop() === basename);
            if (memoryZombie) {
              return { ...newActor, ...memoryZombie, id: newActor.id, url: newActor.url, filename: newActor.filename };
            }

            return newActor;
          });

          // Combine
          const newLibrary = [...cleanPreservedActors, ...finalDiskActors];

          // Only dispatch if count changed or we forced a refresh
          // (Simple check: length diff or deep check. For safety, just dispatch.)
          dispatch({ type: 'SET_ACTOR_LIBRARY', payload: newLibrary });

          console.log(`Native Sync: Pruned and Synced. Total: ${newLibrary.length}`);
        }

      } catch (err) {
        console.error("Native Sync Error:", err);
      }
    };



    if (state.saveDirectoryPath && window.electronAPI) {
      syncFromNative();
    }
  }, [state.saveDirectoryPath]);

  return (
    <ErrorBoundary>
      <HelpProvider>
        <AppContext.Provider value={{ state, dispatch }}>
          <div className="flex min-h-screen h-[100dvh] min-w-0 flex-col overflow-hidden bg-[#0f0f11] text-gray-200 font-sans select-none">

            {/* Header */}
            <header className="border-b border-white/5 bg-[#18181b] grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 sm:gap-3 lg:gap-4 px-3 sm:px-4 lg:px-6 py-3 z-50 relative [style='-webkit-app-region:drag;']">
              {/* Left Logo & Title */}
              <div className="flex min-w-0 items-center gap-2.5 sm:gap-3.5 pr-1 sm:pr-2">
                <div className="relative flex h-11 w-11 sm:h-12 sm:w-12 lg:h-14 lg:w-14 items-center justify-center rounded-xl border border-white/5 bg-white/5 shrink-0">
                  <img
                    src={`data:image/png;base64,${LOGO_BASE64}`}
                    alt="Branding Logo"
                    className="h-8 w-8 sm:h-9 sm:w-9 lg:h-10 lg:w-10 object-contain -[0_0_10px_rgba(234,179,8,0.45)] hover:scale-105 transition-all duration-300 cursor-pointer"
                  />
                </div>

                <div className="min-w-0 max-w-[clamp(280px,34vw,560px)] overflow-hidden">
                  <div className="flex items-center gap-1 sm:gap-1.5 overflow-hidden whitespace-nowrap font-black leading-none tracking-tight text-[clamp(1.15rem,1.85vw,2.3rem)]" role="heading" aria-level={1}>
                    <span className="min-w-0 truncate text-white">CAST DIRECTOR</span>
                    <span className="shrink-0 text-yellow-500">STUDIO</span>
                  </div>

                  <div className="mt-1.5 min-w-0 overflow-hidden">
                    <div className="flex min-w-0 flex-col gap-0.5 lg:flex-row lg:items-center lg:gap-3">
                      <p className="min-w-0 lg:flex-1 truncate text-[clamp(0.4rem,0.48vw,0.5rem)] font-black uppercase tracking-[0.18em] text-zinc-500/70">
                        CAST · WARDROBE · PROPS · STAGE · ACTION
                      </p>
                      <span className="shrink-0 whitespace-nowrap text-[clamp(0.4rem,0.48vw,0.5rem)] font-bold uppercase tracking-[0.2em] text-zinc-600 lg:text-right">
                        powered by <span className="text-zinc-500">Nanobanana 2</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Center Navigation */}
              <div className="self-start mt-2 sm:mt-2.5 lg:mt-3 flex items-start justify-center min-w-0 overflow-hidden [style='-webkit-app-region:no-drag;']">
                <div className="w-full overflow-x-auto pb-3">
                  <nav className="mx-auto flex w-max rounded-lg border border-[#27272a] bg-[#09090b] p-1">
                    {(['casting', 'nano_cast', 'portrait', 'wardrobe', 'props', 'staging', 'production', 'veo'] as ViewMode[])
                      .filter(mode => mode !== 'veo' || state.isStoryboardEnabled)
                      .map(mode => (
                        <button
                          key={mode}
                          onClick={() => dispatch({ type: 'SET_VIEW', payload: mode })}
                          className={`px-2.5 sm:px-3 lg:px-4 py-1.5 rounded text-[9px] sm:text-[10px] lg:text-xs font-bold uppercase transition-all flex items-center gap-1 sm:gap-1.5 whitespace-nowrap ${state.view === mode ? 'bg-[#27272a] text-white ' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                          {mode === 'veo' ? (
                            <div className="flex items-center gap-1 lg:gap-1.5">
                              <span>STORYBOARD</span>
                              <span className="text-[7px] font-black bg-yellow-500 text-black px-1 py-0.5 rounded-sm leading-none tracking-widest -[0_0_5px_rgba(234,179,8,0.4)]">EXP</span>
                              <Clapperboard className={`hidden md:block w-3.5 h-3.5 ${state.view === 'veo' ? 'text-yellow-500' : 'text-yellow-600/50'}`} />
                            </div>
                          ) : mode === 'casting' ? 'CAST' : mode === 'nano_cast' ? 'NANO CAST' : mode === 'staging' ? 'STAGING' : mode === 'props' ? 'PROPS' : mode}
                        </button>
                      ))}
                  </nav>
                </div>
              </div>

              {/* Right Settings & File Menu */}
              <div className="self-start mt-2 sm:mt-2.5 lg:mt-3 flex items-start shrink-0 pr-1 [style='-webkit-app-region:no-drag;']">
                <nav className="flex items-center rounded-lg border border-[#27272a] bg-[#09090b] p-1 gap-1">
                  <FileMenu />
                  <button
                    onClick={() => setShowSettings(true)}
                    className="px-2 lg:px-3 py-1.5 rounded text-[10px] lg:text-xs font-bold uppercase transition-all flex items-center justify-center text-gray-500 hover:text-gray-300 hover:bg-white/5 focus:outline-none"
                    title="Settings"
                  >
                    <Settings className="w-4 h-4 shrink-0" />
                  </button>
                </nav>
              </div>
            </header>
            {/* Main Content Area */}
            <main className="relative flex-1 min-h-0 overflow-hidden">
              {state.view === 'casting' && <CastingForge />}
              {state.view === 'nano_cast' && <NanoCastingDirector />}
              {state.view === 'portrait' && <PortraitStudio />}
              {state.view === 'wardrobe' && <WardrobeStudio />}
              {state.view === 'props' && <PropAccessoryStudio />}
              {state.view === 'staging' && <SceneCanvas />}
              {state.view === 'production' && <ProductionConsole />}
              {state.view === 'veo' && <VeoPromptStudio />}
            </main>

            {/* Cinematic Loading Overlay */}
            {state.isProcessing && <NanobananaThinking />}

            <AppCloseDialog
              isOpen={showAppCloseDialog}
              onClose={() => setShowAppCloseDialog(false)}
              onSave={handleSaveClose}
              onDiscard={performDiscardSession}
            />

            <ImageInspector />

            {/* Footer / Logs */}
            <footer className="border-t border-[#27272a] bg-black px-3 sm:px-4 py-2 text-[10px] font-mono">
              <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-gray-500">
                  <span>ARCH: REACT_SPA</span>
                  <span>MODE: {state.apiKey ? 'PRO (API ACTIVE)' : 'DEMO (SIMULATION)'}</span>
                  {state.sessionName && (
                    <span className="text-yellow-500 font-bold uppercase tracking-widest border-l border-[#27272a] pl-4 ml-2">
                      SESSION: {state.sessionName}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex items-center gap-2 sm:justify-end">
                  {state.logs.length > 0 && (
                    <span
                      className={`block max-w-full truncate ${state.logs[state.logs.length - 1].type === 'error' ? 'text-red-500' : 'text-green-500'}`}
                      title={state.logs[state.logs.length - 1].message}
                    >
                      {state.logs[state.logs.length - 1].message}
                    </span>
                  )}
                </div>
              </div>
            </footer>

            {/* Settings Modal */}
            {
              showSettings && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[4000] flex items-center justify-center p-3 sm:p-6">
                  <div className="bg-[#18181b] border border-gray-700 p-4 sm:p-6 rounded-xl w-full max-w-2xl max-h-[90dvh] overflow-y-auto animate-in fade-in zoom-in duration-200">
                    <h2 className="text-lg font-bold text-white mb-4">Configuration</h2>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Gemini API Key</label>
                        <input
                          type="password"
                          className="w-full bg-[#09090b] border border-[#27272a] p-2 rounded text-sm text-white focus:border-yellow-500 focus:outline-none"
                          placeholder="AIzaSy..."
                          value={tempKey}
                          onChange={(e) => setTempKey(e.target.value)}
                        />
                        <p className="text-[10px] text-gray-500 mt-2">
                          Required for the Service Layer to connect to Google Cloud. If empty, the app runs in Simulation Mode.
                        </p>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Render Save Folder</label>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <button
                            onClick={async () => {
                              try {
                                // NATIVE ELECTRON MODE
                                if (window.electronAPI) {
                                  const path = await window.electronAPI.selectFolder();
                                  if (path) {
                                    dispatch({ type: 'SET_SAVE_PATH', payload: path });
                                    dispatch({ type: 'ADD_LOG', payload: { message: `Save path set: ${path}`, type: 'success' } });
                                  }
                                  return;
                                }

                                // WEB MODE
                                console.log("Requesting directory handle...");
                                const handle = await (window as any).showDirectoryPicker();
                                console.log("Directory handle received:", handle);
                                dispatch({ type: 'SET_SAVE_DIRECTORY', payload: handle });
                                await StorageService.save('nano_save_handle', handle);
                                dispatch({ type: 'ADD_LOG', payload: { message: `Save folder set: ${handle.name}`, type: 'success' } });
                              } catch (e: any) {
                                console.error("Directory picker error:", e);
                                if (e.name !== 'AbortError') {
                                  dispatch({ type: 'ADD_LOG', payload: { message: `Failed to set folder: ${e.message}`, type: 'error' } });
                                }
                              }
                            }}
                            className="min-w-0 flex-1 truncate bg-gray-800 hover:bg-gray-700 text-left text-white px-3 py-2 rounded text-xs font-bold transition-colors border border-gray-700"
                          >
                            {state.saveDirectoryPath
                              ? `Folder: ...${state.saveDirectoryPath.split(/[/\\]/).pop()}`
                              : state.saveDirectoryHandle
                                ? `Folder: ${state.saveDirectoryHandle.name}`
                                : 'Choose Save Folder...'}
                          </button>
                          {(state.saveDirectoryHandle || state.saveDirectoryPath) && (
                            <button
                              onClick={async () => {
                                dispatch({ type: 'SET_SAVE_DIRECTORY', payload: null });
                                dispatch({ type: 'SET_SAVE_PATH', payload: null });
                                await StorageService.remove('nano_save_handle');
                                localStorage.removeItem('nano_save_path');
                              }}
                              className="bg-red-500/10 hover:bg-red-500/20 text-red-500 px-3 py-2 rounded text-xs transition-colors border border-red-500/30"
                              title="Reset folder (use browser downloads)"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        <p className="text-[10px] text-gray-500 mt-2">
                          When set, rendered photos will save directly to this location.
                        </p>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase mb-2 tracking-wider">Active Engine</label>
                        <div className="grid grid-cols-1 gap-2">
                          {[
                            { id: 'gemini-2.5-flash-image', name: 'Gemini 2.5 Flash (Image)', desc: 'Lightning fast multi-modal image generation (Recommended)' },
                            { id: 'gemini-3.1-flash-image-preview', name: 'Gemini 3.1 Flash (Preview)', desc: 'Reasoning-capable 4k model (Requires proper billing quota)' },
                            { id: 'imagen-4.0-generate-001', name: 'Imagen 4.0', desc: 'Text-to-image focus' }
                          ].map(m => (
                            <button
                              key={m.id}
                              onClick={() => setTempModel(m.id as any)}
                              className={`text-left p-3 rounded-lg border transition-all ${tempModel === m.id ? 'bg-yellow-500/10 border-yellow-500 ' : 'bg-[#09090b] border-[#27272a] hover:border-gray-600'}`}
                            >
                              <div className="flex justify-between items-center mb-1">
                                <span className={`text-xs font-bold ${tempModel === m.id ? 'text-yellow-500' : 'text-gray-200'}`}>{m.name}</span>
                                {tempModel === m.id && <div className="w-2 h-2 rounded-full bg-yellow-500 -[0_0_8px_rgba(234,179,8,0.6)]"></div>}
                              </div>
                              <p className="text-[10px] text-gray-500">{m.desc}</p>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="pt-2 border-t border-white/5 space-y-4">
                        <div className="flex items-start justify-between gap-4">
                          <label className="text-xs font-bold text-gray-500 uppercase">Show Help Hints</label>
                          <button
                            onClick={() => dispatch({ type: 'SET_SHOW_HELP_HINTS', payload: !state.showHelpHints })}
                            className={`shrink-0 relative inline-flex h-5 w-9 items-center rounded-full transition-colors`}
                            style={{ backgroundColor: state.showHelpHints ? '#eab308' : '#52525b' }}
                          >
                            <span
                              className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${state.showHelpHints ? 'translate-x-5' : 'translate-x-1'}`}
                            />
                          </button>
                        </div>

                        {/* GEMINI 3.1 OPTIMIZATIONS */}
                        <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Image Resolution (Gemini 3.1)</label>
                          <select
                            className="w-full bg-[#09090b] border border-[#27272a] rounded px-2 py-1.5 text-xs text-white focus:border-yellow-500 outline-none"
                            value={state.imageResolution}
                            onChange={(e) => dispatch({ type: 'SET_IMAGE_RESOLUTION', payload: e.target.value as '1K' | '2K' | '4K' })}
                          >
                            <option value="1K">1K (Fastest)</option>
                            <option value="2K">2K (High Quality)</option>
                            <option value="4K">4K (Ultra HD - Slow)</option>
                          </select>
                        </div>

                        <div className="flex items-start justify-between gap-4 pt-2">
                          <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase">Thinking Mode (Gemini 3.1)</label>
                            <p className="text-[9px] text-gray-500">Improves prompt adherence at the cost of speed.</p>
                          </div>
                          <button
                            onClick={() => dispatch({ type: 'SET_ENABLE_IMAGE_THINKING', payload: !state.enableImageThinking })}
                            className={`shrink-0 relative inline-flex h-5 w-9 items-center rounded-full transition-colors`}
                            style={{ backgroundColor: state.enableImageThinking ? '#3b82f6' : '#52525b' }}
                          >
                            <span
                              className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${state.enableImageThinking ? 'translate-x-5' : 'translate-x-1'}`}
                            />
                          </button>
                        </div>
                        <div className="flex items-start justify-between gap-4 pt-2">
                          <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase">Google Image Search Grounding</label>
                            <p className="text-[9px] text-gray-500">Enable Google Search grounding for increased accuracy.</p>
                          </div>
                          <button
                            onClick={() => dispatch({ type: 'SET_ENABLE_GOOGLE_GROUNDING', payload: !state.enableGoogleGrounding })}
                            className={`shrink-0 relative inline-flex h-5 w-9 items-center rounded-full transition-colors`}
                            style={{ backgroundColor: state.enableGoogleGrounding ? '#10b981' : '#52525b' }} // Emerald
                          >
                            <span
                              className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${state.enableGoogleGrounding ? 'translate-x-5' : 'translate-x-1'}`}
                            />
                          </button>
                        </div>

                        {/* VEO STORYBOARD TOGGLE */}
                        <div className="pt-4 mt-2 border-t border-white/5">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                              <label className="text-xs font-bold text-gray-500 uppercase">Enable Storyboard (Veo 3.1)</label>
                              <span className="text-[9px] font-black uppercase tracking-wider text-yellow-500 border border-yellow-500/20 bg-yellow-500/10 px-1.5 py-0.5 rounded-sm">Experimental</span>
                            </div>
                            <button
                              onClick={() => dispatch({ type: 'SET_STORYBOARD_ENABLED', payload: !state.isStoryboardEnabled })}
                              className={`shrink-0 relative inline-flex h-5 w-9 items-center rounded-full transition-colors`}
                              style={{ backgroundColor: state.isStoryboardEnabled ? '#eab308' : '#52525b' }}
                            >
                              <span
                                className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${state.isStoryboardEnabled ? 'translate-x-5' : 'translate-x-1'}`}
                              />
                            </button>
                          </div>
                          <p className="text-[10px] text-gray-500 mt-1">
                            Unlocks the purely experimental Veo 3.1 storyboarding interface under the Storyboard tab. Please do not have expectations for production results yet.
                          </p>
                        </div>
                      </div>

                      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <button onClick={closeSettings} className="w-full sm:w-auto px-4 py-2 text-gray-400 text-xs hover:text-white">Cancel</button>
                        <button onClick={saveSettings} className="w-full sm:w-auto bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-xs font-bold">Save Config</button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            }

          </div>
        </AppContext.Provider>
      </HelpProvider >
    </ErrorBoundary >
  );
};

export default App;



