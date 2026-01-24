import { useEffect, useState } from 'react';
import SceneCanvas from './components/SceneCanvas';
import ProductionConsole from './components/ProductionConsole';
import WardrobeStudio from './components/WardrobeStudio';
import PropAccessoryStudio from './components/PropAccessoryStudio';
import VeoGenerator from './components/VeoGenerator';
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
import CastingForge from './components/CastingForge';
import NanoCastingDirector from './components/NanoCastingDirector';

import {
  Settings,
  Clapperboard,
  UserPlus,
  Download,
  Copy,
  X
} from 'lucide-react';

// --- 1. TYPES & INTERFACES ---

const NanobananaThinking = () => {
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 backdrop-blur-xl animate-in fade-in duration-500 select-none">
      <div className="relative flex items-center justify-center">
        {/* Cinematic Outer Glow/Ring */}
        <div className="absolute w-64 h-64 bg-yellow-500/5 rounded-full blur-3xl animate-pulse"></div>

        {/* Outer Cinematic Spinner */}
        <div className="w-56 h-56 border-[3px] border-transparent border-t-yellow-500 border-b-yellow-500 rounded-full animate-spin shadow-[0_0_40px_rgba(234,179,8,0.2)]"></div>

        {/* Inner Reverse Spinner */}
        <div className="absolute w-44 h-44 border-[3px] border-transparent border-l-blue-500 border-r-blue-500 rounded-full animate-spin-reverse shadow-[0_0_30px_rgba(59,130,246,0.2)]"></div>

        {/* Central Core (Banana) */}
        <div className="absolute flex flex-col items-center">
          <div className="text-[72px] animate-bounce-slow drop-shadow-[0_0_20px_rgba(234,179,8,0.6)] filter brightness-110">
            🍌
          </div>
        </div>

        {/* Text Terminal Indicator */}
        <div className="absolute -bottom-24 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 w-full text-center">
          <div className="flex items-center justify-center gap-3">
            <span className="w-8 h-[1px] bg-gradient-to-r from-transparent to-yellow-500/50"></span>
            <p className="text-yellow-500 font-black tracking-[0.4em] uppercase text-[11px] animate-pulse">
              Nanobanana is thinking
            </p>
            <span className="w-8 h-[1px] bg-gradient-to-l from-transparent to-yellow-500/50"></span>
          </div>
          <p className="text-white/20 text-[8px] font-mono uppercase tracking-[0.2em] animate-float">
            Analyzing cinematic parameters...
          </p>
        </div>
      </div>
    </div>
  );
};

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
          className="fixed top-6 right-6 text-white/40 hover:text-white transition-colors flex items-center gap-2 uppercase font-black tracking-widest text-xs z-[2001] bg-black/60 px-4 py-2 rounded-lg border border-white/10 backdrop-blur-md"
          onClick={(e) => { e.stopPropagation(); closeInspector(); }}
        >
          Close <X className="w-4 h-4" />
        </button>

        <div className="w-full h-full flex flex-col md:flex-row items-center justify-center gap-8 px-4 py-12 overflow-y-auto">
          <div className="flex-1 flex flex-col items-center">
            <span className="text-[10px] items-center gap-2 mb-2 font-black uppercase tracking-[0.3em] text-white/50 bg-white/5 px-3 py-1 rounded-full border border-white/10 backdrop-blur-md">Original Content</span>
            <img
              src={state.inspectImage}
              className="max-w-full max-h-[70vh] object-contain rounded-xl shadow-[0_0_150px_rgba(0,0,0,1)] animate-in zoom-in duration-500 cursor-default ring-1 ring-white/10"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          {state.inspectMask && (
            <div className="flex-1 flex flex-col items-center">
              <span className="text-[10px] items-center gap-2 mb-2 font-black uppercase tracking-[0.3em] text-yellow-400/70 bg-yellow-400/5 px-3 py-1 rounded-full border border-yellow-400/10 backdrop-blur-md">Generated Mask</span>
              <img
                src={state.inspectMask}
                className="max-w-full max-h-[70vh] object-contain rounded-xl shadow-[0_0_150px_rgba(0,0,0,1)] animate-in zoom-in duration-700 cursor-default ring-1 ring-yellow-500/20"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}
        </div>

        {/* Save Confirmation Toast */}
        {showSaveConfirm && (
          <div className="fixed bottom-32 left-1/2 -translate-x-1/2 z-[2005] bg-black/80 backdrop-blur-xl border border-yellow-500/30 px-8 py-4 rounded-2xl shadow-[0_0_50px_rgba(234,179,8,0.25)] animate-in slide-in-from-bottom-5 fade-in duration-300 flex flex-col items-center gap-2">
            <div className="flex items-center gap-3 text-yellow-400">
              <UserPlus className="w-5 h-5 drop-shadow-[0_0_8px_rgba(234,179,8,0.5)]" />
              <span className="font-black uppercase tracking-[0.2em] text-xs">Asset Secured</span>
            </div>
            <div className="flex items-center gap-2 w-full justify-center">
              <span className="h-[1px] w-8 bg-gradient-to-r from-transparent to-blue-500/50"></span>
              <span className="text-[10px] text-blue-400/80 font-mono tracking-wider uppercase">Saved to Actors</span>
              <span className="h-[1px] w-8 bg-gradient-to-l from-transparent to-blue-500/50"></span>
            </div>
          </div>
        )}

        <div className="fixed bottom-12 left-1/2 -translate-x-1/2 flex gap-4 z-[2001] bg-black/40 backdrop-blur-2xl border border-white/10 p-2 rounded-2xl shadow-2xl">
          <button
            onClick={(e) => { e.stopPropagation(); closeInspector(); }}
            className="w-14 h-14 bg-red-500/20 hover:bg-red-500 text-red-500 hover:text-white rounded-xl transition-all transform hover:scale-110 flex items-center justify-center border border-red-500/30"
            title="Close"
          >
            <X className="w-6 h-6 stroke-[3]" />
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
            className="w-14 h-14 bg-white/10 hover:bg-white text-white hover:text-black rounded-xl transition-all transform hover:scale-110 flex items-center justify-center border border-white/20"
            title={state.saveDirectoryHandle ? "Save to Actors Folder" : "Download to Disk"}
          >
            <Download className="w-6 h-6 stroke-[2.5]" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(state.inspectImage!);
              dispatch({ type: 'ADD_LOG', payload: { message: "Image Data URL copied to clipboard", type: 'info' } });
            }}
            className="w-14 h-14 bg-blue-500/20 hover:bg-blue-600 text-blue-400 hover:text-white rounded-xl transition-all transform hover:scale-110 flex items-center justify-center border border-blue-500/30"
            title="Copy Raw Data"
          >
            <Copy className="w-6 h-6 stroke-[2.5]" />
          </button>
        </div>
      </div>
    </div>
  );
};

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

  // Settings Modal State
  const [showSettings, setShowSettings] = useState(false);
  const [tempKey, setTempKey] = useState(state.apiKey);
  const [tempModel, setTempModel] = useState<AppState['model']>(state.model);

  const saveSettings = () => {
    dispatch({ type: 'SET_API_KEY', payload: tempKey });
    dispatch({ type: 'SET_MODEL', payload: tempModel });
    setShowSettings(false);
    dispatch({ type: 'ADD_LOG', payload: { message: "Settings saved", type: 'success' } });
  };


  // Sync Actors from Disk Handle (External Folder)
  useEffect(() => {
    const syncFromDisk = async () => {
      if (!state.saveDirectoryHandle) return;

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
                }
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

          const existingIds = new Set(state.actorLibrary.map((a: CastMember) => a.id));
          const newOnes = externalActors.filter((a: CastMember) => !existingIds.has(a.id));

          if (newOnes.length > 0) {
            const merged = [...state.actorLibrary, ...newOnes];
            dispatch({ type: 'SET_ACTOR_LIBRARY', payload: merged });
            dispatch({ type: 'ADD_LOG', payload: { message: `Imported ${newOnes.length} actors from disk.`, type: 'success' } });
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
  }, [state.saveDirectoryHandle, state.actorLibrary.length]); // Re-run if folder changes or library size changes (to allow re-sync)

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      <div className="flex flex-col h-screen bg-[#0f0f11] text-gray-200 font-sans selection:bg-yellow-500/30">

        {/* Header */}
        <header className="h-20 border-b border-white/5 bg-[#18181b] flex items-center justify-between px-6 z-50 shadow-2xl">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center p-0.5 bg-white/5 rounded-lg border border-white/5 shadow-inner">
              <img
                src={`data:image/png;base64,${LOGO_BASE64}`}
                alt="Branding Logo"
                className="w-11 h-11 object-contain drop-shadow-[0_0_8px_rgba(234,179,8,0.4)] hover:scale-105 transition-all duration-300 cursor-pointer"
              />
            </div>
            <div className="flex flex-col gap-0.5">
              <h1 className="font-black text-xl tracking-tight leading-none flex items-center gap-2 whitespace-nowrap">
                <span className="text-white">CAST DIRECTOR</span>
                <span className="text-yellow-500">STUDIO</span>
              </h1>
              <div className="flex items-center gap-2">
                <p className="text-[10px] font-black text-zinc-500 tracking-[0.3em] uppercase opacity-60">
                  CAST · WARDROBE · STAGE · ACTION
                </p>
                <div className="h-px w-4 bg-zinc-800"></div>
                <span className="text-[9px] text-zinc-600 font-bold uppercase tracking-wider">
                  powered by <span className="text-zinc-500">Nanobanana Pro</span>
                </span>
              </div>
            </div>
          </div>

          <nav className="flex bg-[#09090b] p-1 rounded-lg border border-[#27272a]">
            {(['casting', 'nano_cast', 'wardrobe', 'props', 'staging', 'production', 'veo'] as ViewMode[])
              .filter(mode => mode !== 'veo' || state.isStoryboardEnabled)
              .map(mode => (
                <button
                  key={mode}
                  onClick={() => dispatch({ type: 'SET_VIEW', payload: mode })}
                  className={`px-4 py-1.5 rounded text-xs font-bold uppercase transition-all flex items-center gap-2 ${state.view === mode ? 'bg-[#27272a] text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                >
                  {mode === 'veo' ? (
                    <>
                      STORYBOARD
                      <Clapperboard className={`w-3.5 h-3.5 ${state.view === 'veo' ? 'text-yellow-500' : 'text-yellow-600/50'}`} />
                    </>
                  ) : mode === 'casting' ? 'CAST' : mode === 'nano_cast' ? 'NANO CAST' : mode === 'staging' ? 'STAGING' : mode === 'props' ? 'PROPS' : mode}
                </button>
              ))}
          </nav>

          <button onClick={() => setShowSettings(true)} className="text-gray-400 hover:text-white transition-colors">
            <Settings className="w-5 h-5" />
          </button>
        </header>

        {/* Main Content Area */}
        <main className="flex-grow overflow-hidden relative">
          {state.view === 'casting' && <CastingForge />}
          {state.view === 'nano_cast' && <NanoCastingDirector />}
          {state.view === 'wardrobe' && <WardrobeStudio />}
          {state.view === 'props' && <PropAccessoryStudio />}
          {state.view === 'staging' && <SceneCanvas />}
          {state.view === 'production' && <ProductionConsole />}
          {state.view === 'veo' && <VeoGenerator />}
        </main>

        {/* Cinematic Loading Overlay */}
        {state.isProcessing && <NanobananaThinking />}
        <ImageInspector />

        {/* Footer / Logs */}
        <footer className="h-8 border-t border-[#27272a] bg-black flex items-center px-4 text-[10px] font-mono justify-between">
          <div className="flex items-center gap-4 text-gray-500">
            <span>ARCH: REACT_SPA</span>
            <span>MODE: {state.apiKey ? 'PRO (API ACTIVE)' : 'DEMO (SIMULATION)'}</span>
          </div>
          <div className="flex items-center gap-2">
            {state.logs.length > 0 && (
              <span className={`${state.logs[state.logs.length - 1].type === 'error' ? 'text-red-500' : 'text-green-500'}`}>
                {state.logs[state.logs.length - 1].message}
              </span>
            )}
          </div>
        </footer>

        {/* Settings Modal */}
        {showSettings && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center">
            <div className="bg-[#18181b] border border-gray-700 p-6 rounded-xl w-96 shadow-2xl animate-in fade-in zoom-in duration-200">
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
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        try {
                          const handle = await (window as any).showDirectoryPicker();
                          dispatch({ type: 'SET_SAVE_DIRECTORY', payload: handle });
                          await StorageService.save('nano_save_handle', handle);
                          dispatch({ type: 'ADD_LOG', payload: { message: `Save folder set: ${handle.name}`, type: 'success' } });
                        } catch (e: any) {
                          if (e.name !== 'AbortError') {
                            dispatch({ type: 'ADD_LOG', payload: { message: `Failed to set folder: ${e.message}`, type: 'error' } });
                          }
                        }
                      }}
                      className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-2 rounded text-xs font-bold transition-colors border border-gray-700"
                    >
                      {state.saveDirectoryHandle ? `Folder: ${state.saveDirectoryHandle.name}` : 'Choose Save Folder...'}
                    </button>
                    {state.saveDirectoryHandle && (
                      <button
                        onClick={async () => {
                          dispatch({ type: 'SET_SAVE_DIRECTORY', payload: null });
                          await StorageService.remove('nano_save_handle');
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
                      { id: 'gemini-2.5-flash-image', name: 'Gemini 2.5 Flash (Image)', desc: 'Optimized for efficient image creation' },
                      { id: 'gemini-3-pro-image-preview', name: 'Gemini 3 Pro (Vision Ultra)', desc: 'Advanced reasoning & high-fidelity output' },
                      { id: 'imagen-4.0-generate-001', name: 'Imagen 4.0 (Legacy)', desc: 'Text-to-image focus' }
                    ].map(m => (
                      <button
                        key={m.id}
                        onClick={() => setTempModel(m.id as any)}
                        className={`text-left p-3 rounded-lg border transition-all ${tempModel === m.id ? 'bg-yellow-500/10 border-yellow-500 shadow-lg shadow-yellow-500/5' : 'bg-[#09090b] border-[#27272a] hover:border-gray-600'}`}
                      >
                        <div className="flex justify-between items-center mb-1">
                          <span className={`text-xs font-bold ${tempModel === m.id ? 'text-yellow-500' : 'text-gray-200'}`}>{m.name}</span>
                          {tempModel === m.id && <div className="w-2 h-2 rounded-full bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.6)]"></div>}
                        </div>
                        <p className="text-[10px] text-gray-500">{m.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-6">
                  <button onClick={() => setShowSettings(false)} className="px-4 py-2 text-gray-400 text-xs hover:text-white">Cancel</button>
                  <button onClick={saveSettings} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-xs font-bold">Save Config</button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </AppContext.Provider>
  );
};

export default App;
