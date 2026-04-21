import { useEffect, useState, Component, useCallback, useRef } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import SceneCanvas from './components/SceneCanvas';
import WardrobeStudio from './components/WardrobeStudio';
import PropAccessoryStudio from './components/PropAccessoryStudio';
import { LibraryAssetMaterializer } from './services/LibraryAssetMaterializer';
import { resolveDisplayUrl, materializeDisplayUrl } from './utils/assetUrlResolver';
import PortraitStudio from './components/PortraitStudio';
import VeoPromptStudio from './components/VeoPromptStudio';
import { StorageService } from './services/StorageService';
import { LOGO_BASE64 } from './assets/logo';
import { SupabaseAuth } from './services/SupabaseClient';

import type {
  ViewMode,
  AppState,
  CastMember
} from './context/AppContext';
import {
  useAppContext
} from './context/AppContext';
import { HelpProvider } from './context/HelpContext';
import CastingForge from './components/CastingForge';
import NanoCastingDirector from './components/NanoCastingDirector';
import { FileMenu } from './components/ui/FileMenu';
import { AppCloseDialog } from './components/ui/AppCloseDialog';
import { HelpCenterDrawer } from './components/ui/HelpCenterDrawer';
import { WelcomeModal } from './components/ui/WelcomeModal';
import { CreditExhaustedModal } from './components/ui/CreditExhaustedModal';

import {
  Settings,
  Clapperboard,
  UserPlus,
  Download,
  Copy,
  X,
  Hammer,
  HelpCircle
} from 'lucide-react';

// --- 1. TYPES & INTERFACES ---

import { NanobananaThinking } from './components/ui/NanobananaThinking';

type PermissionAwareDirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission?: (descriptor: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
  values?: () => AsyncIterableIterator<FileSystemHandle>;
};

type WindowWithDirectoryPicker = Window & {
  showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
};

type GenerationTimingMetrics = {
  worker_claimed_at?: number;
  provider_started_at?: number;
  provider_finished_at?: number;
  r2_started_at?: number;
  r2_finished_at?: number;
  db_completed_at?: number;
  error?: string;
  error_message?: string;
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return String(error);
};

const ImageInspector = () => {
  const { state, dispatch } = useAppContext();
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [resolvedDisplay, setResolvedDisplay] = useState<string | null>(null);

  useEffect(() => {
    if (!state.inspectImage) {
      return;
    }

    let isMounted = true;
    resolveDisplayUrl({
      localPath: state.inspectImageLocalPath,
      sourceUrl: state.inspectImageSourceUrl,
      localUrl: state.inspectImage,
      remoteUrl: state.inspectImage.startsWith('http') ? state.inspectImage : null
    }).then(resolved => {
      if (isMounted) setResolvedDisplay(resolved || state.inspectImage!);
    });

    return () => { isMounted = false; };
  }, [state.inspectImage, state.inspectImageLocalPath, state.inspectImageSourceUrl]);

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
              src={resolvedDisplay || state.inspectImage}
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
            onClick={async (e) => {
              e.stopPropagation();
              const sourceFallback = state.inspectImageSourceUrl || state.inspectImage!;

              // Materialize
              const mat = await LibraryAssetMaterializer.materializeCastAsset({
                sourceUrl: sourceFallback,
                saveDirectoryPath: state.saveDirectoryPath,
                actorName: 'New Cast Member',
                category: 'Uncategorized'
              });

              const newCast: CastMember = {
                id: `cast-insp-${Date.now()}`,
                url: mat.previewUrl,
                localPath: mat.localPath || undefined,
                previewUrl: mat.previewUrl,
                sourceUrl: mat.sourceUrl,
                tag: 'front',
                name: 'New Cast Member',
                filename: mat.filename,
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
                  const fetchTarget = state.inspectImageLocalPath && state.inspectImageLocalPath.startsWith('file://')
                    ? state.inspectImageLocalPath : state.inspectImage!;
                  const response = await fetch(fetchTarget);
                  const blob = await response.blob();
                  await writable.write(blob);
                  await writable.close();
                  setShowSaveConfirm(true);
                  setTimeout(() => setShowSaveConfirm(false), 2000);
                  dispatch({ type: 'ADD_LOG', payload: { message: `Saved to Actors/${filename}`, type: 'success' } });
                } catch (err: unknown) {
                  console.error("Save failed", err);
                  dispatch({ type: 'ADD_LOG', payload: { message: `Save failed: ${getErrorMessage(err)}`, type: 'error' } });
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
  constructor(props: { children: ReactNode }) {
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

const renderTabLabel = (mode: string, isActive: boolean) => {
  switch (mode) {
    case 'veo': return (
      <div className="flex items-center gap-1 lg:gap-1.5">
        <span>STORYBOARD</span>
        <span className="text-[7px] font-black bg-yellow-500 text-black px-1 py-0.5 rounded-sm leading-none tracking-widest -[0_0_5px_rgba(234,179,8,0.4)]">EXP</span>
        <Clapperboard className={`hidden md:block w-3.5 h-3.5 ${isActive ? 'text-yellow-500' : 'text-yellow-600/50'}`} />
      </div>
    );
    case 'staging': return (
      <div className="flex flex-row items-center gap-1.5">
        <span>STAGING</span>
        <span className="text-[7px] font-black text-blue-300 bg-blue-500/10 border border-blue-500/20 px-1 py-0.5 rounded uppercase tracking-widest flex items-center justify-center">PREVIEW</span>
      </div>
    );
    case 'casting': return 'CAST';
    case 'nano_cast': return 'NANO CAST';
    case 'portrait': return 'PORTRAIT';
    case 'wardrobe': return 'WARDROBE';
    case 'props': return 'PROPS';
    default: return mode.toUpperCase();
  }
};
const FramedPanel = ({ children, className = '', trackClassName = 'px-3 py-1 gap-1' }: { children: React.ReactNode, className?: string, trackClassName?: string }) => {
  return (
    <div className={`inline-flex bg-[#2a2a2c] rounded-xl p-[4px] border border-[#111] shadow-[0_1px_1px_rgba(255,255,255,0.05)] ${className}`}>
      <div className={`flex items-center bg-[#161618] rounded-lg shadow-[inset_0_3px_6px_rgba(0,0,0,0.6),inset_0_0_0_1px_rgba(0,0,0,0.8)] w-full ${trackClassName}`}>
        {children}
      </div>
    </div>
  );
};

const App = () => {
  const { state, dispatch } = useAppContext();

  // Track previous credits locally for debug metrics without breaking useEffect dependencies
  const prevCreditsRef = useRef(state.hostedCredits);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  useEffect(() => { prevCreditsRef.current = state.hostedCredits; }, [state.hostedCredits]);

  const refreshCreditsNow = useCallback(async () => {
    if (state.billingEntitlements.effectiveBillingMode === 'hosted' && state.hostedSession?.user?.id) {
      const credits = await SupabaseAuth.fetchHostedCredits(state.hostedSession.user.id);

      console.groupCollapsed('[Credit Sync] Refreshing Hosted Credits');
      console.log('Authenticated User ID:', state.hostedSession.user.id);
      console.log('Fetched Balance:', credits);
      console.log('Previous Display:', prevCreditsRef.current);
      console.log('Updated Display:', credits);
      console.groupEnd();

      dispatch({ type: 'SET_HOSTED_CREDITS', payload: credits });
    }
  }, [state.billingEntitlements.effectiveBillingMode, state.hostedSession?.user?.id, dispatch]);

  const refreshCredits = useCallback(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
        refreshCreditsNow();
    }, 1500);
  }, [refreshCreditsNow]);

  useEffect(() => {
    refreshCreditsNow(); // Run immediately on mount or fundamental mode changes
  }, [state.billingEntitlements.effectiveBillingMode, state.hostedSession?.user?.id, refreshCreditsNow]);

  useEffect(() => {
    const handler = () => refreshCredits();
    window.addEventListener('refresh-credits', handler);
    return () => {
        window.removeEventListener('refresh-credits', handler);
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [refreshCredits]);

  useEffect(() => {
    console.log('[NBStoryBoard] VITE_APP_ENV =', import.meta.env.VITE_APP_ENV ?? '(undefined)');
  }, []);

  // Transient Status Auto-Clear
  useEffect(() => {
    if (!state.liveStatus) return;
    const remaining = 60000 - (Date.now() - state.liveStatus.createdAt);
    if (remaining <= 0) {
      dispatch({ type: 'SET_LIVE_STATUS', payload: null });
      return;
    }
    const timer = setTimeout(() => {
      dispatch({ type: 'SET_LIVE_STATUS', payload: null });
    }, remaining);
    return () => clearTimeout(timer);
  }, [state.liveStatus, dispatch]);

  // Enforce Clean Canvas on App Close
  useEffect(() => {
    const handleBeforeUnload = () => {
      localStorage.removeItem('nano_bg_url');
      localStorage.removeItem('nano_depth_url');
      localStorage.removeItem('nano_depth_hash');
      localStorage.removeItem('nano_source_hash');
      localStorage.removeItem('nano_active_shot_id');
      // Intentionally NOT clearing models/api keys here
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // Hosted Mode Background Poller
  useEffect(() => {
    const pendingJobs = state.backgroundJobs.filter(j => j.status === 'pending_background');
    if (pendingJobs.length === 0) return;

    const poller = setInterval(async () => {
      const { supabase } = await import('./services/SupabaseClient');
      if (!supabase) return;

      for (const job of pendingJobs) {
        const { data, error } = await supabase.from('generations').select('status, asset_url, timing_metrics').eq('id', job.id).single();
        if (error) {
          console.error('[BackgroundPoller] Supabase error:', error);
        }
        if (data) {
          if (data.status === 'COMPLETED') {
            const observedCompletedAt = Date.now();
            const t = job.timing;
            const db = (data.timing_metrics || {}) as GenerationTimingMetrics;

            let finalAssetUrl = data.asset_url;
            if (job.context === 'scene_render' && finalAssetUrl) {
                finalAssetUrl = await materializeDisplayUrl(finalAssetUrl);
            }

            dispatch({ type: 'COMPLETE_BACKGROUND_JOB', payload: { id: job.id, assetUrl: finalAssetUrl } });
            dispatch({ type: 'ADD_LOG', payload: { message: `Background job finished: ${job.context}`, type: 'success' } });
            window.dispatchEvent(new CustomEvent('refresh-credits'));

            // Pipeline Diagnostics
            const d = {
              '1. Edge Queue Delay (ms)': (db.worker_claimed_at && t?.edgeAcceptedAt) ? db.worker_claimed_at - t.edgeAcceptedAt : 'N/A',
              '2. Gemini Provider Latency (ms)': (db.provider_finished_at && db.provider_started_at) ? db.provider_finished_at - db.provider_started_at : 'N/A',
              '3. Upload Overhead (ms)': (db.r2_finished_at && db.r2_started_at) ? db.r2_finished_at - db.r2_started_at : 'N/A',
              '4. Poller Observation Lag (ms)': (db.db_completed_at) ? observedCompletedAt - db.db_completed_at : 'N/A',
              'Total End-to-End Time (ms)': t?.submittedAt ? observedCompletedAt - t.submittedAt : 'N/A',
              'Post-Timeout Overrun (ms)': t?.clientTimeoutAt ? observedCompletedAt - t.clientTimeoutAt : 'N/A'
            };
            console.groupCollapsed(`🚀 [HOSTED AUDIT] Generation ${job.id} Timings`);
            console.table(d);
            console.log("Raw Metric Dump:", { client: t, edge: { accepted: t?.edgeAcceptedAt }, worker: db, observationTime: observedCompletedAt });
            console.groupEnd();
          } else if (data.status === 'FAILED' || data.status === 'CANCELED' || data.status === 'EXPIRED') {
            dispatch({ type: 'FAIL_BACKGROUND_JOB', payload: { id: job.id, errorMessage: 'Provider rejected or failed' } });
            dispatch({ type: 'ADD_LOG', payload: { message: `Background job failed: ${job.context}`, type: 'error' } });
            window.dispatchEvent(new CustomEvent('refresh-credits'));
            const errorMsg = data.timing_metrics?.error || data.timing_metrics?.error_message || '';
            if (data.status === 'FAILED' && errorMsg.toLowerCase().includes('insufficient')) {
              dispatch({ type: 'SET_CREDIT_MODAL', payload: true });
            }
          }
        }
      }
    }, 5000);

    return () => clearInterval(poller);
  }, [state.backgroundJobs, dispatch]);

  // Sync Supabase Hosted Auth Session
  useEffect(() => {
    const checkJwtDebug = async (session: unknown) => {
      if (session) {
        try {
          const jwt = await SupabaseAuth.getValidJwt();
          console.group('🔐 [Phase 2A] JWT Retrieval Debug');
          console.log('Token Exists:', !!jwt);
          console.log('Token Prefix:', jwt.substring(0, 20) + '...');
          console.log('Token Length:', jwt.length);
          console.groupEnd();
        } catch (e) {
          console.error('[Phase 2A] JWT Retrieval failed:', e);
        }
      }
    };

    SupabaseAuth.getSession()
      .then((res) => {
        const session = res?.data?.session || null;
        dispatch({ type: 'SET_HOSTED_SESSION', payload: session });
        checkJwtDebug(session);
      })
      .catch((err) => console.error("getSession unhandled error:", err));

    const authRes = SupabaseAuth.onAuthStateChange((_event, session) => {
      dispatch({ type: 'SET_HOSTED_SESSION', payload: session });
      checkJwtDebug(session);
    });

    return () => {
      if (authRes?.data?.subscription?.unsubscribe) {
        authRes.data.subscription.unsubscribe();
      }
    };
  }, [dispatch]);

  // Master Storyboard Toggle Redirect
  useEffect(() => {
    if (!state.isStoryboardEnabled && state.view === 'veo') {
      dispatch({ type: 'SET_VIEW', payload: 'staging' });
      dispatch({ type: 'ADD_LOG', payload: { message: "Storyboard is disabled.", type: 'info' } });
    }
  }, [state.isStoryboardEnabled, state.view, dispatch]);

  const performDiscardSession = useCallback(async () => {
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
  }, [dispatch]);

  // Session Discard Interception (From Main)
  useEffect(() => {
    let cleanup: (() => void) | void;
    if (window.electronAPI?.onRequestDiscardSession) {
      cleanup = window.electronAPI.onRequestDiscardSession(() => performDiscardSession());
    }
    return () => {
      // Clean up the IPC listener on unmount if the bridge returned a function
      if (typeof cleanup === 'function') cleanup();
    };
  }, [dispatch, performDiscardSession]);

  // App Close Interception (Custom Dialog)
  const [showAppCloseDialog, setShowAppCloseDialog] = useState(false);
  useEffect(() => {
    let cleanup: (() => void) | void;
    if (window.electronAPI?.onRequestAppClose) {
      cleanup = window.electronAPI.onRequestAppClose(() => {
        setShowAppCloseDialog(true);
      });
    }
    return () => {
      if (typeof cleanup === 'function') cleanup();
    };
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
  const [tempBillingMode, setTempBillingMode] = useState<'hosted' | 'byok'>(state.billingMode);
  const modelOptions: Array<{ id: AppState['model']; name: string; desc: string }> = [
    { id: 'gemini-2.5-flash-image', name: 'Gemini 2.5 Flash (Image)', desc: 'Lightning fast multi-modal image generation (Recommended)' },
    { id: 'gemini-3.1-flash-image-preview', name: 'Gemini 3.1 Flash (Preview)', desc: 'Reasoning-capable 4k model (Requires proper billing quota)' },
    { id: 'imagen-4.0-generate-001', name: 'Imagen 4.0', desc: 'Text-to-image focus' }
  ];

  // Auth UI State
  const [authEmail, setAuthEmail] = useState('');
  const [authPass, setAuthPass] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  const closeSettings = () => {
    setShowSettings(false);
    if (state.view === 'settings') {
      dispatch({ type: 'SET_VIEW', payload: 'casting' }); // Fallback to casting
    }
  };

  const saveSettings = () => {
    dispatch({ type: 'SET_API_KEY', payload: tempKey });
    dispatch({ type: 'SET_MODEL', payload: tempModel });
    dispatch({ type: 'SET_BILLING_MODE', payload: tempBillingMode });
    closeSettings();
    dispatch({ type: 'ADD_LOG', payload: { message: "Settings saved", type: 'success' } });
  };

  const handleSignIn = async () => {
    setIsAuthLoading(true);
    try {
      const { error } = await SupabaseAuth.signIn(authEmail, authPass);
      if (error) throw error;
      dispatch({ type: 'ADD_LOG', payload: { message: "Signed in successfully", type: 'success' } });
    } catch (e: unknown) {
      dispatch({ type: 'ADD_LOG', payload: { message: `Sign In Failed: ${getErrorMessage(e)}`, type: 'error' } });
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    setIsAuthLoading(true);
    try {
      await SupabaseAuth.signOut();
      dispatch({ type: 'ADD_LOG', payload: { message: "Signed out successfully", type: 'info' } });
    } catch (e: unknown) {
      dispatch({ type: 'ADD_LOG', payload: { message: `Sign Out Failed: ${getErrorMessage(e)}`, type: 'error' } });
    } finally {
      setIsAuthLoading(false);
    }
  };


  // Sync Actors from Disk Handle (External Folder)
  useEffect(() => {
    const syncFromDisk = async () => {
      // In Native Electron mode, ignore Web Handlers to avoid double-sync or conflicts
      if (window.electronAPI || !state.saveDirectoryHandle) return;

      const saveDirHandle = state.saveDirectoryHandle as PermissionAwareDirectoryHandle;
      if (saveDirHandle.queryPermission && (await saveDirHandle.queryPermission({ mode: 'read' })) !== 'granted') return;

      try {
        // dispatch({ type: 'ADD_LOG', payload: { message: "Scanning external actors folder...", type: 'info' } });

        let actorsDir;
        try {
          actorsDir = await state.saveDirectoryHandle.getDirectoryHandle('Actors', { create: false });
        } catch {
          // Actors dir doesn't exist yet, nothing to sync
          return;
        }

        const externalActors: CastMember[] = [];
        // Iterate files
        const actorsDirWithValues = actorsDir as PermissionAwareDirectoryHandle;
        if (!actorsDirWithValues.values) return;
        for await (const entry of actorsDirWithValues.values()) {
          if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.png')) {
            try {
              const fileEntry = entry as FileSystemFileHandle;
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

              const file = await fileEntry.getFile();
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
      } catch (e: unknown) {
        console.error("Disk sync error:", e);
        dispatch({ type: 'ADD_LOG', payload: { message: `Disk scan failed: ${getErrorMessage(e)}`, type: 'error' } });
      }
    };

    if (state.saveDirectoryHandle) {
      syncFromDisk();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.saveDirectoryHandle]); // Only run when folder connection changes

  // Targeted WebFS Thumbnail Rehydrator (Materializes existing library records)
  useEffect(() => {
    const rehydrateLibraryThumbnails = async () => {
      if (window.electronAPI || !state.saveDirectoryHandle || state.actorLibrary.length === 0) return;

      const saveDirHandle = state.saveDirectoryHandle as PermissionAwareDirectoryHandle;
      const permission = saveDirHandle.queryPermission
        ? await saveDirHandle.queryPermission({ mode: 'read' })
        : 'granted';
      if (permission !== 'granted') return;

      const needsHydration = state.actorLibrary.filter(
        a => !a.previewUrl && a.localPath && !a.localPath.startsWith('app://') && !a.localPath.startsWith('file://')
      );

      if (needsHydration.length === 0) return;

      const updatedActors = [...state.actorLibrary];
      let hasChanges = false;

      for (const actor of needsHydration) {
        try {
          const pathParts = actor.localPath!.split('/');
          let currentHandle: FileSystemDirectoryHandle = state.saveDirectoryHandle;

          for (let i = 0; i < pathParts.length - 1; i++) {
            currentHandle = await currentHandle.getDirectoryHandle(pathParts[i], { create: false });
          }

          const filename = pathParts[pathParts.length - 1];
          const fileHandle = await currentHandle.getFileHandle(filename, { create: false });
          const file = await fileHandle.getFile();
          
          const blobUrl = URL.createObjectURL(file);
          
          const index = updatedActors.findIndex(a => a.id === actor.id);
          if (index !== -1) {
            updatedActors[index] = { ...updatedActors[index], previewUrl: blobUrl, url: blobUrl };
            hasChanges = true;
          }
        } catch {
          // Gracefully skip missing WebFS files
        }
      }

      if (hasChanges) {
        dispatch({ type: 'SET_ACTOR_LIBRARY', payload: updatedActors });
      }
    };

    rehydrateLibraryThumbnails();
  }, [dispatch, state.saveDirectoryHandle, state.actorLibrary]);

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
              
              const diskId = `disk-${catOrRoot || 'root'}-${filename}`; // Ensure ID uniqueness
              const displayName = filename.replace(/\.(png|jpg|jpeg)$/i, '');

              externalActors.push({
                id: diskId,
                url: `data:image/png;base64,${base64}`,
                localPath: fullPath,
                previewUrl: undefined,
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
            // Legacy bug cleanup: if it's the hardcoded 'portrait.png' without a path, drop it.
            if (basename === 'portrait.png' && pa.id.startsWith('nano_') === false) return false;
            
            // If the disk scanner found this image natively, we DROP the memory zombie and let finalDiskActors handle it
            if (basename && newlyDiscoveredBasenames.has(basename)) return false;
            return true;
          });

          const finalDiskActors = externalActors.map(newActor => {
            const existing = existingMap.get(newActor.id);
            if (existing) {
              return { 
                ...newActor, 
                ...existing, 
                url: newActor.url, 
                previewUrl: newActor.previewUrl,
                localPath: newActor.localPath,
                filename: newActor.filename 
              }; // Update strictly durable runtime fields, keeping profile metadata
            }

            // Also check if there was a memory zombie (UUID id scheme) that we just purged, 
            // and rescue its custom profile/metadata (like specific identity fields)
            const basename = newActor.filename?.split(/[\\/]/).pop() || "";
            const memoryZombie = preservedActors.find(pa => pa.filename?.split(/[\\/]/).pop() === basename);
            if (memoryZombie) {
              return { 
                  ...newActor, 
                  ...memoryZombie, 
                  id: newActor.id, 
                  url: newActor.url, 
                  previewUrl: newActor.previewUrl, // MUST explicitly override to prevent broken memory URLs from returning
                  filename: newActor.filename 
              };
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.saveDirectoryPath]);

  return (
    <ErrorBoundary>
      <HelpProvider>
        <div className="flex min-h-screen h-[100dvh] min-w-0 flex-col overflow-hidden bg-[#0f0f11] text-gray-200 font-sans select-none">

          {/* Header */}
          <header className="border-b border-white/5 bg-[#18181b] flex w-full items-center justify-between gap-4 px-3 sm:px-4 lg:px-6 py-3 z-50 relative [style='-webkit-app-region:drag;']">
            {/* Left Logo & Title */}
            <div className="flex-shrink-0 flex min-w-0 items-center gap-2.5 sm:gap-3.5">
              <div className="relative flex h-11 w-11 sm:h-12 sm:w-12 lg:h-14 lg:w-14 items-center justify-center rounded-xl border border-white/5 bg-white/5 shrink-0">
                <img
                  src={`data:image/png;base64,${LOGO_BASE64}`}
                  alt="Branding Logo"
                  className="h-8 w-8 sm:h-9 sm:w-9 lg:h-10 lg:w-10 object-contain -[0_0_10px_rgba(234,179,8,0.45)] hover:scale-105 transition-all duration-300 cursor-pointer"
                />
              </div>

              <div className="min-w-0 overflow-hidden">
                <div className="flex items-center gap-1 sm:gap-1.5 overflow-hidden whitespace-nowrap font-black leading-none tracking-tight text-[clamp(1.15rem,1.85vw,2.3rem)]" role="heading" aria-level={1}>
                  <span className="min-w-0 truncate text-white">CAST DIRECTOR</span>
                  <span className="shrink-0 text-yellow-500">STUDIO</span>
                </div>

                <div className="mt-0.5 flex justify-end min-w-0 overflow-hidden">
                  <span className="shrink-0 whitespace-nowrap text-[8px] sm:text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-600">
                    powered by <span className="text-zinc-500">Nanobanana 2</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Center Navigation */}
            <div className="flex-1 flex items-center justify-center min-w-0 [style='-webkit-app-region:no-drag;']">
              <FramedPanel className="mx-auto" trackClassName="px-0.5 py-0.5 gap-0">
                {(['casting', 'nano_cast', 'portrait', 'wardrobe', 'props', 'staging', 'veo'] as ViewMode[])
                  .filter(mode => mode !== 'veo' || state.isStoryboardEnabled)
                  .map(mode => (
                    <button
                      key={mode}
                      onClick={() => dispatch({ type: 'SET_VIEW', payload: mode })}
                      className={`bg-transparent border-none text-[11px] xl:text-[12px] font-semibold px-2 xl:px-2.5 py-1.5 rounded-md cursor-pointer transition-all duration-200 whitespace-nowrap ${state.view === mode ? 'text-white' : 'text-[#888] hover:text-[#ccc]'} focus:outline-none`}
                    >
                      {renderTabLabel(mode, state.view === mode)}
                    </button>
                  ))}
              </FramedPanel>
            </div>

            {/* Right Settings & File Menu (Combined Unified Pill) */}
            <div className="flex-shrink-0 flex items-center justify-end [style='-webkit-app-region:no-drag;']">
              <FramedPanel className="scale-[0.80] origin-right lg:scale-90 pointer-events-auto">
                
                {/* Credits Segment */}
                <div 
                  className="flex items-center gap-3 px-1 cursor-help opacity-90 hover:opacity-100 transition-opacity"
                  title={state.billingEntitlements.effectiveBillingMode === "hosted" ? `Hosted credits remaining: ${state.hostedCredits ?? "—"}` : "BYOK mode uses your own API key"}
                >
                  <span className="text-[#888] text-[12px] font-semibold tracking-[0.5px]">
                    {state.billingEntitlements.effectiveBillingMode === "hosted" ? "HOSTED" : "BYOK"}
                  </span>
                  <div className="w-px h-[18px] bg-[#333]" />
                  <span className="text-white text-[18px] font-semibold flex items-center min-w-[24px] justify-center">
                    {state.billingEntitlements.effectiveBillingMode === "byok" ? "—" : (
                      state.billingEntitlements.effectiveBillingMode === "hosted" && state.hostedCredits === null ? (
                        <div className="w-[18px] h-[18px] border-[2.5px] border-white/20 border-t-white rounded-full animate-spin" title="Loading credits..."></div>
                      ) : (
                        String(state.hostedCredits ?? "—")
                      )
                    )}
                  </span>
                </div>

                <div className="w-px h-[18px] bg-[#333] mx-3" />

                {/* Navigation Segment */}
                <div className="flex items-center gap-1.5 h-full">
                  <FileMenu />
                  
                  <button
                    onClick={() => {
                      dispatch({ type: 'SET_HELP_SECTION', payload: 'start' });
                      dispatch({ type: 'TOGGLE_HELP', payload: true });
                    }}
                    className="flex items-center justify-center w-8 h-8 rounded-md text-[#888] hover:text-white hover:bg-white/5 transition-colors focus:outline-none"
                    title="Help & Guides"
                  >
                    <HelpCircle className="w-[18px] h-[18px] shrink-0" />
                  </button>
                  
                  <button
                    onClick={() => setShowSettings(true)}
                    className="flex items-center justify-center w-8 h-8 rounded-md text-[#888] hover:text-white hover:bg-white/5 transition-colors focus:outline-none"
                    title="Settings"
                  >
                    <Settings className="w-[18px] h-[18px] shrink-0" />
                  </button>
                </div>

              </FramedPanel>
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

          <HelpCenterDrawer />
          <WelcomeModal />
          <CreditExhaustedModal />

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
                {state.backgroundJobs.filter(j => j.status === 'pending_background').length > 0 && (
                  <div className="flex items-center gap-2 px-3 py-1 rounded bg-blue-500/10 text-blue-400 font-bold border border-blue-500/20 mr-2 shrink-0">
                    <Clapperboard className="w-3 h-3 animate-pulse" />
                    {state.backgroundJobs.filter(j => j.status === 'pending_background').length} hosted render still processing
                  </div>
                )}
                {state.liveStatus && (
                  <span
                    className={`block max-w-full truncate ${state.liveStatus.type === 'error' ? 'text-red-500' : state.liveStatus.type === 'success' ? 'text-emerald-500' : 'text-blue-400'}`}
                    title={state.liveStatus.text}
                  >
                    {state.liveStatus.text}
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
                    {/* BILLING MODE & ENTITLEMENTS */}
                    {import.meta.env.DEV ? (
                      <>
                        <div>
                          <label className="block text-xs font-bold text-gray-400 uppercase mb-2 tracking-wider">Billing & Generation Mode (DEV OVERRIDE)</label>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => setTempBillingMode('hosted')}
                              className={`p-3 rounded-lg border transition-all text-left ${tempBillingMode === 'hosted' ? 'bg-blue-500/10 border-blue-500 ' : 'bg-[#09090b] border-[#27272a] hover:border-gray-600'}`}
                            >
                              <span className={`text-xs font-bold ${tempBillingMode === 'hosted' ? 'text-blue-500' : 'text-gray-200'}`}>Hosted Cloud</span>
                              <p className="text-[10px] text-gray-500 mt-1">Uses secure Edge proxy and shared quota.</p>
                            </button>
                            <button
                              onClick={() => setTempBillingMode('byok')}
                              className={`p-3 rounded-lg border transition-all text-left ${tempBillingMode === 'byok' ? 'bg-yellow-500/10 border-yellow-500 ' : 'bg-[#09090b] border-[#27272a] hover:border-gray-600'}`}
                            >
                              <span className={`text-xs font-bold ${tempBillingMode === 'byok' ? 'text-yellow-500' : 'text-gray-200'}`}>Bring Your Own Key</span>
                              <p className="text-[10px] text-gray-500 mt-1">Direct API requests using your local key.</p>
                            </button>
                          </div>
                        </div>

                        {tempBillingMode === 'byok' && (
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
                              Required for BYOK Service Layer to connect directly to Google Cloud.
                            </p>
                          </div>
                        )}

                        {tempBillingMode === 'hosted' && (
                          <div className="p-4 bg-black/40 border border-[#27272a] rounded-lg">
                            <label className="block text-xs font-bold text-blue-500 uppercase mb-2">Hosted Cloud Authentication</label>
                            {state.hostedSession ? (
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-sm text-white">{state.hostedSession.user?.email}</p>
                                  <p className="text-[10px] text-emerald-500 font-mono">Authenticated ✓</p>
                                </div>
                                <button onClick={handleSignOut} disabled={isAuthLoading} className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded text-xs font-bold transition-colors">
                                  {isAuthLoading ? 'Signing out...' : 'Sign Out'}
                                </button>
                              </div>
                            ) : (
                              <div className="space-y-3">
                                <input type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="Email account" className="w-full bg-[#09090b] border border-[#27272a] p-2 rounded text-sm text-white focus:border-blue-500 focus:outline-none" />
                                <input type="password" value={authPass} onChange={(e) => setAuthPass(e.target.value)} placeholder="Password" className="w-full bg-[#09090b] border border-[#27272a] p-2 rounded text-sm text-white focus:border-blue-500 focus:outline-none" />
                                <button onClick={handleSignIn} disabled={isAuthLoading || !authEmail || !authPass} className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded text-sm font-bold transition-colors">
                                  {isAuthLoading ? 'Authenticating...' : 'Sign In'}
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs font-bold text-gray-400 uppercase mb-2 tracking-wider">Active Entitlement</label>
                          {state.billingEntitlements.effectiveBillingMode === 'hosted' ? (
                            <div className="p-4 rounded-lg border border-blue-500/50 bg-blue-500/10 text-blue-400">
                              <span className="font-bold text-sm block mb-1">Hosted Cloud</span>
                              <span className="text-xs">Your generation requests are routed securely through our Edge cloud using your active subscription.</span>
                            </div>
                          ) : state.billingEntitlements.effectiveBillingMode === 'byok' ? (
                            <div className="p-4 rounded-lg border border-yellow-500/50 bg-yellow-500/10 text-yellow-500">
                              <span className="font-bold text-sm block mb-1">Bring Your Own Key</span>
                              <span className="text-xs">You are using your own local Gemini API credentials for generation.</span>
                            </div>
                          ) : (
                            <div className="p-4 rounded-lg border border-red-500/50 bg-red-500/10 text-red-500">
                              <span className="font-bold text-sm block mb-1">No Active Entitlement</span>
                              <span className="text-xs">No active generation entitlement found. Please sign in to a Hosted account or activate a BYOK license.</span>
                            </div>
                          )}
                        </div>

                        {state.billingEntitlements.hasByokAccess && (
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
                              Required for BYOK Service Layer to connect directly to Google Cloud.
                            </p>
                          </div>
                        )}

                        {!state.billingEntitlements.hasHostedAccess && state.billingEntitlements.hasByokAccess ? (
                          <div className="p-4 bg-[#09090b] border border-[#27272a] rounded-lg">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Hosted Cloud</label>
                            <p className="text-[10px] text-gray-400">
                              Your current entitlement is Bring Your Own Key. Hosted Cloud access is not active on this account.<br /><br />
                              Sign in with a Hosted-enabled account or upgrade to use cloud generation.
                            </p>
                          </div>
                        ) : (
                          <div className="p-4 bg-black/40 border border-[#27272a] rounded-lg">
                            <label className="block text-xs font-bold text-blue-500 uppercase mb-2">
                              {!state.billingEntitlements.hasHostedAccess && !state.billingEntitlements.hasByokAccess ? 'Hosted Cloud Access' : 'Hosted Cloud Authentication'}
                            </label>
                            {!state.billingEntitlements.hasHostedAccess && !state.billingEntitlements.hasByokAccess && (
                              <p className="text-[10px] text-gray-400 mb-3">Sign in with a Hosted-enabled account to use cloud generation.</p>
                            )}
                            {state.hostedSession ? (
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-sm text-white">{state.hostedSession.user?.email}</p>
                                  <p className="text-[10px] text-emerald-500 font-mono">Authenticated ✓</p>
                                </div>
                                <button onClick={handleSignOut} disabled={isAuthLoading} className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded text-xs font-bold transition-colors">
                                  {isAuthLoading ? 'Signing out...' : 'Sign Out'}
                                </button>
                              </div>
                            ) : (
                              <div className="space-y-3">
                                <input type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="Email account" className="w-full bg-[#09090b] border border-[#27272a] p-2 rounded text-sm text-white focus:border-blue-500 focus:outline-none" />
                                <input type="password" value={authPass} onChange={(e) => setAuthPass(e.target.value)} placeholder="Password" className="w-full bg-[#09090b] border border-[#27272a] p-2 rounded text-sm text-white focus:border-blue-500 focus:outline-none" />
                                <button onClick={handleSignIn} disabled={isAuthLoading || !authEmail || !authPass} className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded text-sm font-bold transition-colors">
                                  {isAuthLoading ? 'Authenticating...' : 'Sign In'}
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
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
                              const webWindow = window as WindowWithDirectoryPicker;
                              if (!webWindow.showDirectoryPicker) {
                                throw new Error('Directory picker is not supported in this browser.');
                              }
                              const handle = await webWindow.showDirectoryPicker();
                              console.log("Directory handle received:", handle);
                              dispatch({ type: 'SET_SAVE_DIRECTORY', payload: handle });
                              await StorageService.save('nano_save_handle', handle);
                              dispatch({ type: 'ADD_LOG', payload: { message: `Save folder set: ${handle.name}`, type: 'success' } });
                            } catch (e: unknown) {
                              console.error("Directory picker error:", e);
                              if ((e as { name?: string }).name !== 'AbortError') {
                                dispatch({ type: 'ADD_LOG', payload: { message: `Failed to set folder: ${getErrorMessage(e)}`, type: 'error' } });
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
                        {modelOptions.map(m => (
                          <button
                            key={m.id}
                            onClick={() => setTempModel(m.id)}
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
                          Unlocks the Storyboard interface for early-access creative exploration. This feature is still evolving and is best used for testing, concept development, and selective workflows.
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
      </HelpProvider >
    </ErrorBoundary >
  );
};

export default App;



