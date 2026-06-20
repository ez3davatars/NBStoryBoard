import { useEffect, useState, Component, useCallback, useRef, useMemo, lazy, Suspense } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LibraryAssetMaterializer } from './services/LibraryAssetMaterializer';
import { resolveDisplayUrl, materializeDisplayUrl } from './utils/assetUrlResolver';

const SceneCanvas = lazy(() => import('./components/SceneCanvas'));
const WardrobeStudio = lazy(() => import('./components/WardrobeStudio'));
const PropAccessoryStudio = lazy(() => import('./components/PropAccessoryStudio'));
const PortraitStudio = lazy(() => import('./components/PortraitStudio'));
const VeoPromptStudio = lazy(() => import('./components/VeoPromptStudio'));
import { StorageService } from './services/StorageService';
import { LOGO_BASE64 } from './assets/logo';
import { SupabaseAuth, supabase } from './services/SupabaseClient';
import { DeviceFingerprint } from './services/DeviceFingerprint';
import { SIGN_IN_REQUIRED_EVENT } from './services/AuthGenerationGate';
import { dumpBrowserStorage } from './utils/resetVolatileWorkspaceState';

import type {
  ViewMode,
  CastMember
} from './context/AppContext';
import {
  useAppContext
} from './context/AppContext';
import { NANO_BANANA_2_IMAGE_MODEL } from './constants/generationModels';
import { HelpProvider } from './context/HelpContext';
import CastingForge from './components/CastingForge';
import NanoCastingDirector from './components/NanoCastingDirector';
import { FileMenu } from './components/ui/FileMenu';
import { AppCloseDialog } from './components/ui/AppCloseDialog';
import { HelpCenterDrawer } from './components/ui/HelpCenterDrawer';
import { WelcomeModal } from './components/ui/WelcomeModal';
import { CreateProductionActorWorkflow } from './components/workflows/CreateProductionActorWorkflow';
import { InsufficientCreditModal } from './components/ui/InsufficientCreditModal';
import { useRecentGenerationsStore } from './stores/useRecentGenerationsStore';
import {
  INSUFFICIENT_HOSTED_CREDITS_EVENT,
  type InsufficientCreditModalState
} from './utils/billingProducts';
import { createUniqueDownloadFilename } from './utils/downloadFilenames';
import { getHostedUsageCredits, getHostedUsageLabel, type HostedUsageRow } from './utils/hostedUsageLabels';

import {
  Settings,
  Clapperboard,
  UserPlus,
  Download,
  Copy,
  X,
  Hammer,
  HelpCircle,
  RefreshCw
} from 'lucide-react';

// --- 1. TYPES & INTERFACES ---

import { CastDirectorThinking } from './components/ui/CastDirectorThinking';

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


const isMissingColumnError = (error: unknown, columnName: string): boolean => {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes(columnName.toLowerCase()) && (
    message.includes('does not exist') ||
    message.includes('could not find') ||
    message.includes('schema cache')
  );
};

const isMissingBillingMetadataColumn = (error: unknown): boolean =>
  isMissingColumnError(error, 'billing_metadata');

const isMissingCreditLedgerResetColumn = (error: unknown): boolean =>
  isMissingColumnError(error, 'credit_ledger_reset_at');

const POST_LAUNCH_BACKGROUND_WORK_DELAY_MS = 8500;

const formatHostedUsageDate = (value?: string | null): string => {
  if (!value) return 'Unknown time';
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return 'Unknown time';
  return timestamp.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return String(error);
};

const getImageDownloadExtension = (url: string, mimeType?: string): string => {
  const mimeExtension = mimeType?.match(/^image\/([a-z0-9.+-]+)/i)?.[1];
  const dataUrlExtension = url.match(/^data:image\/([a-z0-9.+-]+)[;,]/i)?.[1];
  const pathExtension = url
    .split(/[?#]/)[0]
    .match(/\.([a-z0-9]+)$/i)?.[1];
  const extension = (mimeExtension || dataUrlExtension || pathExtension || 'png')
    .toLowerCase()
    .replace(/^x-/, '')
    .replace(/\+xml$/, '');

  if (extension === 'jpeg') return 'jpg';
  if (['png', 'jpg', 'webp', 'gif', 'avif'].includes(extension)) return extension;
  return 'png';
};

const triggerImageDownload = (url: string, filename: string): void => {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
};

const ImageInspector = () => {
  const { state, dispatch } = useAppContext();
  const [resolvedDisplay, setResolvedDisplay] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      setToast(null);
    }, 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  const handleInspectAddToCast = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isAdding) return;

    setIsAdding(true);
    try {
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
      setToast({ message: "Added to Cast", type: 'success' });
    } catch (err: unknown) {
      console.error("Inspector add to cast failed", err);
      dispatch({ type: 'ADD_LOG', payload: { message: `Could not add to Cast: ${getErrorMessage(err)}`, type: 'error' } });
      setToast({ message: "Could not add to Cast", type: 'error' });
    } finally {
      setIsAdding(false);
    }
  };

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

  const getInspectorSourceUrl = () => resolvedDisplay || state.inspectImage || state.inspectImageSourceUrl || '';

  const downloadInspectorImage = async () => {
    const sourceUrl = resolvedDisplay || state.inspectImage || state.inspectImageSourceUrl || '';
    if (!sourceUrl) return;

    try {
      if (/^https?:\/\//i.test(sourceUrl)) {
        const response = await fetch(sourceUrl, { mode: 'cors' });
        if (!response.ok) {
          throw new Error(`Download request failed: ${response.status}`);
        }

        const blob = await response.blob();
        const extension = getImageDownloadExtension(sourceUrl, blob.type);
        const filename = createUniqueDownloadFilename(`CDS_Inspect.${extension}`, extension);
        const objectUrl = URL.createObjectURL(blob);

        try {
          triggerImageDownload(objectUrl, filename);
        } finally {
          setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
        }
      } else {
        const extension = getImageDownloadExtension(sourceUrl);
        const filename = createUniqueDownloadFilename(`CDS_Inspect.${extension}`, extension);
        triggerImageDownload(sourceUrl, filename);
      }

      dispatch({ type: 'ADD_LOG', payload: { message: "Image downloaded to your computer", type: 'success' } });
    } catch (err: unknown) {
      console.error("Inspector download failed", err);
      const fallbackUrl = getInspectorSourceUrl();
      if (fallbackUrl) {
        const extension = getImageDownloadExtension(fallbackUrl);
        const filename = createUniqueDownloadFilename(`CDS_Inspect.${extension}`, extension);
        triggerImageDownload(fallbackUrl, filename);
        dispatch({ type: 'ADD_LOG', payload: { message: "Image download started", type: 'info' } });
        return;
      }
      dispatch({ type: 'ADD_LOG', payload: { message: `Download failed: ${getErrorMessage(err)}`, type: 'error' } });
    }
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

        <div className="fixed bottom-4 sm:bottom-12 left-1/2 -translate-x-1/2 flex flex-wrap justify-center gap-2 sm:gap-4 z-[2001] max-w-[calc(100vw-1.5rem)] bg-black/40 backdrop-blur-2xl border border-white/10 p-2 rounded-2xl ">
          {toast && (
            <div 
              className="inspect-large-action-message absolute bottom-[calc(100%+12px)] left-1/2"
              style={toast.type === 'error' ? { 
                borderColor: 'rgba(239, 68, 68, 0.35)', 
                boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.65), 0 10px 26px rgba(0, 0, 0, 0.42), 0 0 22px rgba(239, 68, 68, 0.16)' 
              } : {}}
              onClick={(e) => e.stopPropagation()}
            >
              {toast.message}
            </div>
          )}
          <button
            onClick={handleInspectAddToCast}
            disabled={isAdding}
            className={`w-12 h-12 sm:w-14 sm:h-14 bg-emerald-500/20 hover:bg-emerald-500 text-emerald-500 hover:text-white rounded-xl transition-all transform hover:scale-110 flex items-center justify-center border border-emerald-500/30 ${
              isAdding ? 'opacity-60 cursor-not-allowed scale-95' : ''
            }`}
            title="Add to Cast"
          >
            {isAdding ? (
              <RefreshCw className="w-5 h-5 sm:w-6 sm:h-6 animate-spin stroke-[2.5]" />
            ) : (
              <UserPlus className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.5]" />
            )}
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
            onClick={(e) => {
              e.stopPropagation();
              void downloadInspectorImage();
            }}
            className="w-12 h-12 sm:w-14 sm:h-14 bg-white/10 hover:bg-white text-white hover:text-black rounded-xl transition-all transform hover:scale-110 flex items-center justify-center border border-white/20"
            title="Download to Computer"
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


const FramedPanel = ({ children, className = '', trackClassName = 'px-3 py-1 gap-1' }: { children: React.ReactNode, className?: string, trackClassName?: string }) => {
  return (
    <div className={`inline-flex bg-[#2a2a2c] rounded-xl p-[4px] border border-[#111] shadow-[0_1px_1px_rgba(255,255,255,0.05)] ${className}`}>
      <div className={`flex items-center bg-[#161618] rounded-lg shadow-[inset_0_3px_6px_rgba(0,0,0,0.6),inset_0_0_0_1px_rgba(0,0,0,0.8)] w-full ${trackClassName}`}>
        {children}
      </div>
    </div>
  );
};

function WorkspaceSwitchingShell({ label }: { label: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-[#0a0a0c] text-gray-400 relative overflow-hidden select-none">
      {/* Background gradients for premium feel */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-blue-500/5 blur-[120px] pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full bg-indigo-500/5 blur-[80px] pointer-events-none animate-spin [animation-duration:20s]" />
      
      {/* Center content container with a subtle scale/fade animation */}
      <div className="z-10 flex flex-col items-center max-w-sm px-6 text-center animate-fade-in">
        <div className="relative mb-6">
          {/* Sleek dynamic dual-ring loading spinner */}
          <div className="w-16 h-16 rounded-full border-[3px] border-zinc-800 border-t-blue-500 animate-spin" />
          <div className="absolute inset-0 w-16 h-16 rounded-full border-[3px] border-transparent border-b-indigo-400/60 animate-spin [animation-duration:1.5s] [animation-direction:reverse]" />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">NB</span>
          </div>
        </div>
        
        <h2 className="text-sm font-black text-white tracking-[0.2em] uppercase mb-2">
          Initializing {label}
        </h2>
        <div className="h-[1px] w-12 bg-gradient-to-r from-transparent via-zinc-700 to-transparent mb-3" />
        <p className="text-[10px] text-zinc-500 uppercase tracking-widest leading-relaxed">
          Loading layout resources & assets...
        </p>
      </div>
    </div>
  );
}

const App = () => {
  const { state, dispatch } = useAppContext();
  const [postLaunchBackgroundWorkReady, setPostLaunchBackgroundWorkReady] = useState(false);

  const [mountedWorkspaces, setMountedWorkspaces] = useState<Set<ViewMode>>(() => new Set(["casting", "nano_cast"]));
  const [navPressedTab, setNavPressedTab] = useState<ViewMode | null>(null);
  const prevWorkspaceRef = useRef<ViewMode | null>(null);

  useEffect(() => {
    const from = prevWorkspaceRef.current;
    const to = state.view;
    if (to && from !== to) {
      console.debug("[Workspace Navigation]", {
        from: from || 'none',
        to,
        clickedAt: performance.now(),
      });
      prevWorkspaceRef.current = to;

      setMountedWorkspaces((prev) => {
        if (prev.has(to)) return prev;
        const next = new Set(prev);
        next.add(to);
        console.debug("[Workspace Mounted]", {
          workspace: to,
          mountedAt: performance.now(),
        });
        return next;
      });
    }
  }, [state.view]);

  const handleNavSelect = (mode: ViewMode) => {
    if (import.meta.env.DEV) {
      console.time(`[NAV] switch to ${mode}`);
    }
    // Add the target view to mountedWorkspaces immediately
    setMountedWorkspaces((prev) => {
      if (prev.has(mode)) return prev;
      const next = new Set(prev);
      next.add(mode);
      return next;
    });
    // Switch state.view immediately
    dispatch({ type: 'SET_VIEW', payload: mode });
    if (import.meta.env.DEV) {
      requestAnimationFrame(() => {
        console.timeEnd(`[NAV] switch to ${mode}`);
      });
    }
  };

  const navViewportRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateNavScrollState = useCallback(() => {
    const el = navViewportRef.current;
    if (!el) return;

    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  const scrollHeaderNav = (direction: 'left' | 'right') => {
    const el = navViewportRef.current;
    if (!el) return;

    el.scrollBy({
      left: direction === 'left' ? -220 : 220,
      behavior: 'smooth',
    });
  };

  const handleHeaderNavWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    if (el.scrollWidth <= el.clientWidth) return;

    if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
      event.preventDefault();
      el.scrollLeft += event.deltaY;
      requestAnimationFrame(updateNavScrollState);
    }
  };

  const activeTabRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (activeTabRef.current) {
      activeTabRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      });
    }
    updateNavScrollState();
    const timer = setTimeout(updateNavScrollState, 400);
    return () => clearTimeout(timer);
  }, [state.view, updateNavScrollState]);

  useEffect(() => {
    updateNavScrollState();
    window.addEventListener('resize', updateNavScrollState);
    return () => {
      window.removeEventListener('resize', updateNavScrollState);
    };
  }, [updateNavScrollState]);

  useEffect(() => {
    updateNavScrollState();
    const timer = setTimeout(updateNavScrollState, 100);
    return () => clearTimeout(timer);
  }, [state.isStoryboardEnabled, updateNavScrollState]);

  // Track previous credits locally for debug metrics without breaking useEffect dependencies
  const prevCreditsRef = useRef(state.hostedCredits);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backgroundPollInFlightRef = useRef(false);
  const backgroundPollErrorCountsRef = useRef<Record<string, number>>({});
  const backgroundPollLastWarnAtRef = useRef<Record<string, number>>({});
  const creditUsagePopoverRef = useRef<HTMLDivElement | null>(null);
  const [showCreditUsage, setShowCreditUsage] = useState(false);
  const [creditUsageRows, setCreditUsageRows] = useState<HostedUsageRow[]>([]);
  const [creditUsageLoading, setCreditUsageLoading] = useState(false);
  const [creditUsageError, setCreditUsageError] = useState<string | null>(null);
  const [creditUsageWarning, setCreditUsageWarning] = useState<string | null>(null);
  const [creditUsageResetAt, setCreditUsageResetAt] = useState<string | null>(null);
  
  useEffect(() => { prevCreditsRef.current = state.hostedCredits; }, [state.hostedCredits]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPostLaunchBackgroundWorkReady(true);
    }, POST_LAUNCH_BACKGROUND_WORK_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, []);

  const creditUsageTotal = useMemo(
    () => creditUsageRows.reduce((sum, row) => sum + getHostedUsageCredits(row), 0),
    [creditUsageRows]
  );

  const billingHeaderState = useMemo(() => {
    const mode = state.billingEntitlements.effectiveBillingMode;
    const hostedUserId = state.hostedSession?.user?.id;

    if (mode === 'hosted') {
      if (!hostedUserId) {
        return {
          modeLabel: 'HOSTED',
          valueLabel: 'SIGN IN',
          title: 'Sign in to Hosted Cloud to view or use hosted credits.',
          canOpenUsage: false,
          isLoading: false,
          needsAttention: true
        };
      }

      if (state.hostedCredits === null) {
        return {
          modeLabel: 'HOSTED',
          valueLabel: '',
          title: 'Loading hosted credits...',
          canOpenUsage: false,
          isLoading: true,
          needsAttention: false
        };
      }

      return {
        modeLabel: 'HOSTED',
        valueLabel: String(state.hostedCredits),
        title: `Hosted credits remaining: ${state.hostedCredits}`,
        canOpenUsage: true,
        isLoading: false,
        needsAttention: false
      };
    }

    if (mode === 'byok') {
      const hasApiKey = Boolean(state.apiKey.trim());
      return {
        modeLabel: 'BYOK',
        valueLabel: hasApiKey ? '-' : 'SET KEY',
        title: hasApiKey
          ? 'BYOK mode uses your own API key.'
          : 'Add a Gemini API key before using BYOK generation.',
        canOpenUsage: false,
        isLoading: false,
        needsAttention: !hasApiKey
      };
    }

    return {
      modeLabel: 'NONE',
      valueLabel: 'CONFIG',
      title: 'Configure Hosted Cloud sign-in or a BYOK API key.',
      canOpenUsage: false,
      isLoading: false,
      needsAttention: true
    };
  }, [
    state.apiKey,
    state.billingEntitlements.effectiveBillingMode,
    state.hostedCredits,
    state.hostedSession?.user?.id
  ]);

  useEffect(() => {
    if (!billingHeaderState.canOpenUsage && showCreditUsage) {
      setShowCreditUsage(false);
    }
  }, [billingHeaderState.canOpenUsage, showCreditUsage]);

  const refreshHostedUsage = useCallback(async () => {
    const supabaseClient = supabase;
    const hostedUserId = state.hostedSession?.user?.id;

    if (!supabaseClient || state.billingEntitlements.effectiveBillingMode !== 'hosted' || !hostedUserId) {
      setCreditUsageRows([]);
      setCreditUsageError(null);
      setCreditUsageWarning(null);
      setCreditUsageResetAt(null);
      return;
    }

    setCreditUsageLoading(true);
    setCreditUsageError(null);
    setCreditUsageWarning(null);

    try {
      const warnings: string[] = [];
      let ledgerResetAt: string | null = null;

      const { data: profileData, error: profileError } = await supabaseClient
        .from('profiles')
        .select('credit_ledger_reset_at')
        .eq('id', hostedUserId)
        .single();

      if (profileError) {
        if (isMissingCreditLedgerResetColumn(profileError)) {
          warnings.push('Apply the credit_ledger_reset_at migration to reset this ledger whenever credits are reloaded.');
        } else {
          throw profileError;
        }
      } else {
        const resetAt = (profileData as { credit_ledger_reset_at?: unknown } | null)?.credit_ledger_reset_at;
        ledgerResetAt = typeof resetAt === 'string' && resetAt.trim() ? resetAt : null;
      }

      setCreditUsageResetAt(ledgerResetAt);

      const baseUsageQuery = (select: string) => {
        let query = supabaseClient
          .from('generations')
          .select(select)
          .eq('user_id', hostedUserId);

        if (ledgerResetAt) {
          query = query.gte('created_at', ledgerResetAt);
        }

        return query
          .order('created_at', { ascending: false })
          .limit(25);
      };

      const { data, error } = await baseUsageQuery('id, created_at, status, provider_model, billing_metadata');

      if (error && isMissingBillingMetadataColumn(error)) {
        const fallback = await baseUsageQuery('id, created_at, status, provider_model');
        if (fallback.error) throw fallback.error;

        setCreditUsageRows(
          (fallback.data || []).map((row) => ({
            ...(row as unknown as HostedUsageRow),
            billing_metadata: null
          }))
        );
        warnings.push('Apply the billing_metadata migration to show exact per-generation credit costs. Recent jobs are shown without cost details for now.');
        setCreditUsageWarning(warnings.join(' '));
        return;
      }

      if (error) throw error;

      const rows = (data || []).map((row) => row as unknown as HostedUsageRow);

      setCreditUsageRows(rows);
      setCreditUsageWarning(warnings.length > 0 ? warnings.join(' ') : null);
    } catch (error: unknown) {
      setCreditUsageRows([]);
      setCreditUsageWarning(null);
      setCreditUsageResetAt(null);
      setCreditUsageError(getErrorMessage(error));
    } finally {
      setCreditUsageLoading(false);
    }
  }, [state.billingEntitlements.effectiveBillingMode, state.hostedSession?.user?.id]);

  useEffect(() => {
    if (!showCreditUsage) return;
    void refreshHostedUsage();
  }, [showCreditUsage, refreshHostedUsage, state.hostedCredits]);

  useEffect(() => {
    if (!showCreditUsage) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!creditUsagePopoverRef.current?.contains(event.target as Node)) {
        setShowCreditUsage(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [showCreditUsage]);

  const refreshCreditsNow = useCallback(async () => {
    const hostedUserId = state.hostedSession?.user?.id;
    if (state.billingEntitlements.effectiveBillingMode !== 'hosted' || !hostedUserId) {
      if (state.hostedCredits !== null) {
        dispatch({ type: 'SET_HOSTED_CREDITS', payload: null });
      }
      return;
    }

    const credits = await SupabaseAuth.fetchHostedCredits(hostedUserId);

    if (import.meta.env.DEV) {
      console.groupCollapsed('[Credit Sync] Refreshing Hosted Credits');
      console.log('Authenticated User ID:', hostedUserId);
      console.log('Fetched Balance:', credits);
      console.log('Previous Display:', prevCreditsRef.current);
      console.log('Updated Display:', credits);
      console.groupEnd();
    }

    dispatch({ type: 'SET_HOSTED_CREDITS', payload: credits });
  }, [state.billingEntitlements.effectiveBillingMode, state.hostedCredits, state.hostedSession?.user?.id, dispatch]);

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
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<InsufficientCreditModalState>).detail;
      if (!detail) return;

      dispatch({ type: 'SET_HOSTED_CREDITS', payload: detail.currentCredits });
      dispatch({ type: 'SET_CREDIT_MODAL', payload: detail });
      dispatch({
        type: 'ADD_LOG',
        payload: {
          message: `Generation blocked: needs ${detail.requiredCredits} credits, current balance ${detail.currentCredits}.`,
          type: 'error'
        }
      });
    };

    window.addEventListener(INSUFFICIENT_HOSTED_CREDITS_EVENT, handler);
    return () => window.removeEventListener(INSUFFICIENT_HOSTED_CREDITS_EVENT, handler);
  }, [dispatch]);

  useEffect(() => {
    console.log('[CastDirectorStudio] VITE_APP_ENV =', import.meta.env.VITE_APP_ENV ?? '(undefined)');
  }, []);

  // --- RECENT GENERATIONS: Init store & cleanup on startup ---
  useEffect(() => {
    if (!postLaunchBackgroundWorkReady) return;

    const initRecentGenerations = async () => {
      try {
        await useRecentGenerationsStore.getState().initStore();
        console.log('[RecentGenerations] Store initialized');
      } catch (e) {
        console.warn('[RecentGenerations] Store init failed:', e);
      }

      // Run 30-day cleanup silently
      try {
        const result = await window.electronAPI?.cleanupRecentGenerations?.(30);
        if (result && result.deletedCount > 0) {
          console.log(`[RecentGenerations] Cleaned up ${result.deletedCount} old cached files`);
        }
      } catch (e) {
        console.warn('[RecentGenerations] Cleanup failed:', e);
      }
    };
    initRecentGenerations();
  }, [postLaunchBackgroundWorkReady]);

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

    const POLL_INTERVAL_MS = 5000;
    const BACKGROUND_STALE_MS = 20 * 60 * 1000;
    const MAX_POLL_ERRORS = 24;
    const MAX_NOT_FOUND_ERRORS = 6;
    const WARN_THROTTLE_MS = 30000;

    const poller = setInterval(async () => {
      if (backgroundPollInFlightRef.current) return;
      backgroundPollInFlightRef.current = true;

      try {
        if (!supabase) return;

        const now = Date.now();
        for (const job of pendingJobs) {
          const startedAt = job.timing?.submittedAt || job.startedAt || now;
          const ageMs = now - startedAt;
          if (ageMs > BACKGROUND_STALE_MS) {
            dispatch({ type: 'FAIL_BACKGROUND_JOB', payload: { id: job.id, errorMessage: 'Background render timed out while polling.' } });
            dispatch({ type: 'ADD_LOG', payload: { message: `Background job timed out after ${Math.round(ageMs / 1000)}s: ${job.context}`, type: 'error' } });
            delete backgroundPollErrorCountsRef.current[job.id];
            delete backgroundPollLastWarnAtRef.current[job.id];
            continue;
          }

          const { data, error } = await supabase
            .from('generations')
            .select('status, asset_url, timing_metrics')
            .eq('id', job.id)
            .single();

          if (error) {
            console.error('[BackgroundPoller] Supabase error:', error);
            const previousErrors = backgroundPollErrorCountsRef.current[job.id] || 0;
            const nextErrors = previousErrors + 1;
            backgroundPollErrorCountsRef.current[job.id] = nextErrors;

            const errorCode = String((error as { code?: string } | null)?.code || '').toUpperCase();
            const errorMessage = (error as { message?: string } | null)?.message || 'Unknown polling error.';
            const notFoundLike = errorCode === 'PGRST116' || /no rows|multiple/.test(errorMessage.toLowerCase());
            const shouldFail = nextErrors >= MAX_POLL_ERRORS || (notFoundLike && nextErrors >= MAX_NOT_FOUND_ERRORS);

            if (shouldFail) {
              dispatch({ type: 'FAIL_BACKGROUND_JOB', payload: { id: job.id, errorMessage } });
              dispatch({ type: 'ADD_LOG', payload: { message: `Background job polling failed (${job.context}): ${errorMessage}`, type: 'error' } });
              delete backgroundPollErrorCountsRef.current[job.id];
              delete backgroundPollLastWarnAtRef.current[job.id];
              continue;
            }

            const lastWarnAt = backgroundPollLastWarnAtRef.current[job.id] || 0;
            if (now - lastWarnAt >= WARN_THROTTLE_MS) {
              dispatch({ type: 'ADD_LOG', payload: { message: `Background job still polling (${job.context})...`, type: 'info' } });
              backgroundPollLastWarnAtRef.current[job.id] = now;
            }
            continue;
          }

          delete backgroundPollErrorCountsRef.current[job.id];
          delete backgroundPollLastWarnAtRef.current[job.id];

          if (!data) continue;
          const status = String(data.status || '').toUpperCase();

          if (status === 'COMPLETED') {
            const observedCompletedAt = Date.now();
            const t = job.timing;
            const db = (data.timing_metrics || {}) as GenerationTimingMetrics;

            let finalAssetUrl = data.asset_url || '';
            if (!finalAssetUrl) {
              dispatch({ type: 'FAIL_BACKGROUND_JOB', payload: { id: job.id, errorMessage: 'Completed job missing output asset URL.' } });
              dispatch({ type: 'ADD_LOG', payload: { message: `Background job missing output URL: ${job.context}`, type: 'error' } });
              continue;
            }

            if (job.context === 'scene_render') {
              finalAssetUrl = await materializeDisplayUrl(finalAssetUrl);
            }

            dispatch({ type: 'COMPLETE_BACKGROUND_JOB', payload: { id: job.id, assetUrl: finalAssetUrl } });
            dispatch({ type: 'ADD_LOG', payload: { message: `Background job finished: ${job.context}`, type: 'success' } });
            window.dispatchEvent(new CustomEvent('refresh-credits'));

            const d = {
              '1. Edge Queue Delay (ms)': (db.worker_claimed_at && t?.edgeAcceptedAt) ? db.worker_claimed_at - t.edgeAcceptedAt : 'N/A',
              '2. Gemini Provider Latency (ms)': (db.provider_finished_at && db.provider_started_at) ? db.provider_finished_at - db.provider_started_at : 'N/A',
              '3. Upload Overhead (ms)': (db.r2_finished_at && db.r2_started_at) ? db.r2_finished_at - db.r2_started_at : 'N/A',
              '4. Poller Observation Lag (ms)': (db.db_completed_at) ? observedCompletedAt - db.db_completed_at : 'N/A',
              'Total End-to-End Time (ms)': t?.submittedAt ? observedCompletedAt - t.submittedAt : 'N/A',
              'Post-Timeout Overrun (ms)': t?.clientTimeoutAt ? observedCompletedAt - t.clientTimeoutAt : 'N/A'
            };
            if (import.meta.env.DEV) {
              console.groupCollapsed(`[HOSTED AUDIT] Generation ${job.id} Timings`);
              console.table(d);
              console.log("Raw Metric Dump:", { client: t, edge: { accepted: t?.edgeAcceptedAt }, worker: db, observationTime: observedCompletedAt });
              console.groupEnd();
            }
          } else if (status === 'FAILED' || status === 'CANCELED' || status === 'EXPIRED') {
            dispatch({ type: 'FAIL_BACKGROUND_JOB', payload: { id: job.id, errorMessage: 'Provider rejected or failed' } });
            dispatch({ type: 'ADD_LOG', payload: { message: `Background job failed: ${job.context}`, type: 'error' } });
            window.dispatchEvent(new CustomEvent('refresh-credits'));
            const errorMsg = data.timing_metrics?.error || data.timing_metrics?.error_message || '';
            if (status === 'FAILED' && errorMsg.toLowerCase().includes('insufficient')) {
              dispatch({ type: 'SET_CREDIT_MODAL', payload: true });
            }
          } else if (status !== 'PENDING' && status !== 'PROCESSING') {
            dispatch({ type: 'FAIL_BACKGROUND_JOB', payload: { id: job.id, errorMessage: `Unexpected background status: ${status}` } });
            dispatch({ type: 'ADD_LOG', payload: { message: `Background job entered unexpected status (${status}): ${job.context}`, type: 'error' } });
          }
        }
      } catch (error: unknown) {
        console.error('[BackgroundPoller] Unexpected polling failure:', error);
      } finally {
        backgroundPollInFlightRef.current = false;
      }
    }, POLL_INTERVAL_MS);

    return () => {
      clearInterval(poller);
      backgroundPollInFlightRef.current = false;
    };
  }, [state.backgroundJobs, dispatch]);

  async function refreshLicenses(customSession?: any) {
    const activeSession = customSession || state.hostedSession;
    if (!activeSession) return [];
    setIsLicensesLoading(true);
    setLicensesLoadError(null);
    try {
      const lics = await SupabaseAuth.getMyDesktopLicenses();
      setLicensesList(lics);
      if (lics.length === 1) {
        setSelectedLicenseId(lics[0].id);
      } else {
        setSelectedLicenseId('');
      }
      return lics;
    } catch (err: any) {
      console.error('[Licenses] Failed to refresh licenses:', err);
      const errMsg = err.message || 'Failed to fetch desktop licenses.';
      setLicensesLoadError(errMsg);
      return [];
    } finally {
      setIsLicensesLoading(false);
    }
  }

  async function performActivation(session: any) {
    if (!session) {
      setActivationStatus('idle');
      setActivationError('');
      setActiveLicense(null);
      setActiveActivationId(null);
      setLicensesList([]);
      return;
    }

    setActivationStatus('pending');
    setActivationError('');

    try {
      const fingerprint = await DeviceFingerprint.getStableDeviceFingerprint();
      const label = DeviceFingerprint.getDeviceLabel();

      const savedLicenseId = localStorage.getItem('cds_active_license_id');
      const savedLicenseKey = localStorage.getItem('cds_active_license_key');

      if (savedLicenseId || savedLicenseKey) {
        try {
          const res = await SupabaseAuth.activateDevice(
            fingerprint,
            label,
            '1.0.0',
            savedLicenseKey || undefined,
            savedLicenseId || undefined
          );

          if (res.allowed) {
            setActivationStatus('allowed');
            setActiveActivationId(res.activationId);
            
            const lics = await refreshLicenses(session);
            const activeLic = lics.find((l: any) => l.id === res.licenseId);
            if (activeLic) {
              setActiveLicense(activeLic);
              localStorage.setItem('cds_active_license_id', activeLic.id);
              localStorage.setItem('cds_active_license_type', activeLic.productKey);
              localStorage.setItem('cds_active_license_suffix', activeLic.licenseKeySuffix);
            } else {
              setActiveLicense({
                id: res.licenseId,
                productKey: res.productKey,
                displayName: res.productKey === 'agency_desktop_byok' ? 'Agency Commercial BYOK' : 'Indie Desktop BYOK',
                licenseKeySuffix: savedLicenseKey ? `...${savedLicenseKey.slice(-8)}` : 'Active',
                activationLimit: res.deviceLimit || 2,
                activeDeviceCount: res.activeDevices || 1
              });
            }
            return;
          }
        } catch (err: any) {
          console.warn('[Activation] Saved activation verification failed:', err);
          localStorage.removeItem('cds_active_license_id');
          localStorage.removeItem('cds_active_license_key');
          localStorage.removeItem('cds_active_license_type');
          localStorage.removeItem('cds_active_license_suffix');
        }
      }

      await refreshLicenses(session);
      setActivationStatus('idle');
    } catch (error: any) {
      console.error('[Activation] Startup fetch licenses failed:', error);
      setActivationStatus('denied');
      setActivationError(error.message || 'Failed to fetch desktop licenses.');
    }
  }

  async function handleActivateDevice() {
    setIsActivating(true);
    setActivationError('');
    try {
      const fingerprint = await DeviceFingerprint.getStableDeviceFingerprint();
      const label = DeviceFingerprint.getDeviceLabel();

      let res;
      if (manualLicenseKey.trim()) {
        const cleanedKey = manualLicenseKey.trim();
        res = await SupabaseAuth.activateDevice(fingerprint, label, '1.0.0', cleanedKey, undefined);
        localStorage.setItem('cds_active_license_key', cleanedKey);
        localStorage.removeItem('cds_active_license_id');
      } else if (selectedLicenseId) {
        res = await SupabaseAuth.activateDevice(fingerprint, label, '1.0.0', undefined, selectedLicenseId);
        localStorage.setItem('cds_active_license_id', selectedLicenseId);
        localStorage.removeItem('cds_active_license_key');
      } else {
        throw new Error('Please select a license or enter a license key.');
      }

      if (res.allowed) {
        setActivationStatus('allowed');
        setActiveActivationId(res.activationId);
        
        const lics = await refreshLicenses();
        const activeLic = lics.find((l: any) => l.id === res.licenseId);
        if (activeLic) {
          setActiveLicense(activeLic);
          localStorage.setItem('cds_active_license_id', activeLic.id);
          localStorage.setItem('cds_active_license_type', activeLic.productKey);
          localStorage.setItem('cds_active_license_suffix', activeLic.licenseKeySuffix);
        } else {
          setActiveLicense({
            id: res.licenseId,
            productKey: res.productKey,
            displayName: res.productKey === 'agency_desktop_byok' ? 'Agency Commercial BYOK' : 'Indie Desktop BYOK',
            licenseKeySuffix: manualLicenseKey ? `...${manualLicenseKey.trim().slice(-8)}` : 'Active',
            activationLimit: res.deviceLimit || 2,
            activeDeviceCount: res.activeDevices || 1
          });
        }
        
        setShowActivationModal(false);
        dispatch({ type: 'ADD_LOG', payload: { message: "Device successfully activated!", type: 'success' } });
      } else {
        throw new Error(res.error || 'Activation denied by server.');
      }
    } catch (err: any) {
      console.error('[Activation] Activation failed:', err);
      setActivationError(err.message || 'Activation failed.');
      dispatch({ type: 'ADD_LOG', payload: { message: `Activation failed: ${err.message || 'Activation failed.'}`, type: 'error' } });
    } finally {
      setIsActivating(false);
    }
  }

  async function handleDeactivateDevice() {
    if (!activeActivationId) return;
    setIsActivating(true);
    setActivationError('');
    try {
      await SupabaseAuth.deactivateDevice(activeActivationId);
      setActivationStatus('idle');
      setActiveLicense(null);
      setActiveActivationId(null);
      
      localStorage.removeItem('cds_active_license_id');
      localStorage.removeItem('cds_active_license_key');
      localStorage.removeItem('cds_active_license_type');
      localStorage.removeItem('cds_active_license_suffix');

      if (state.hostedSession) {
        await refreshLicenses();
      }

      dispatch({ type: 'ADD_LOG', payload: { message: "Device deactivated.", type: 'success' } });
    } catch (err: any) {
      console.error('[Activation] Deactivation failed:', err);
      setActivationError(err.message || 'Deactivation failed.');
      dispatch({ type: 'ADD_LOG', payload: { message: `Deactivation failed: ${err.message}`, type: 'error' } });
    } finally {
      setIsActivating(false);
    }
  }

  // Sync Supabase Hosted Auth Session
  useEffect(() => {
    const checkJwtDebug = async (session: unknown) => {
      if (import.meta.env.DEV && session) {
        try {
          const jwt = await SupabaseAuth.getValidJwt();
          console.debug('[Phase 2A] JWT retrieval', { tokenPresent: Boolean(jwt) });
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
        performActivation(session);
      })
      .catch((err) => console.error("getSession unhandled error:", err));

    const authRes = SupabaseAuth.onAuthStateChange((_event, session) => {
      dispatch({ type: 'SET_HOSTED_SESSION', payload: session });
      checkJwtDebug(session);
      performActivation(session);
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
    if (!postLaunchBackgroundWorkReady) return;

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
  }, [dispatch, postLaunchBackgroundWorkReady]);

  // Sync View to Settings Modal
  useEffect(() => {
    if (state.view === 'settings') {
      setShowSettings(true);
    }
  }, [state.view]);

  // Settings Modal State
  const [showSettings, setShowSettings] = useState(false);
  const [showSignInRequiredModal, setShowSignInRequiredModal] = useState(false);
  const [activationStatus, setActivationStatus] = useState<'idle' | 'pending' | 'allowed' | 'denied'>('idle');
  const [activationError, setActivationError] = useState('');
  const [activeLicense, setActiveLicense] = useState<{
    id: string;
    productKey: string;
    displayName: string;
    licenseKeySuffix: string;
    activationLimit: number;
    activeDeviceCount: number;
  } | null>(null);
  const [activeActivationId, setActiveActivationId] = useState<string | null>(null);
  const [licensesList, setLicensesList] = useState<any[]>([]);
  const [selectedLicenseId, setSelectedLicenseId] = useState<string>('');
  const [manualLicenseKey, setManualLicenseKey] = useState<string>('');
  const [showActivationModal, setShowActivationModal] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const [isLicensesLoading, setIsLicensesLoading] = useState(false);
  const [licensesLoadError, setLicensesLoadError] = useState<string | null>(null);
  const [tempKey, setTempKey] = useState(state.apiKey);
  const [tempBillingMode, setTempBillingMode] = useState<'hosted' | 'byok'>(state.billingMode);

  // Auth UI State
  const [authEmail, setAuthEmail] = useState('');
  const [authPass, setAuthPass] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  useEffect(() => {
    dumpBrowserStorage('after React mount');
  }, []);

  useEffect(() => {
    if (!showSettings) return;
    setTempKey(state.apiKey);
    setTempBillingMode(state.billingMode);
  }, [showSettings, state.apiKey, state.billingMode]);

  useEffect(() => {
    const handleSignInRequired = () => {
      setShowSignInRequiredModal(true);
    };

    window.addEventListener(SIGN_IN_REQUIRED_EVENT, handleSignInRequired);
    return () => window.removeEventListener(SIGN_IN_REQUIRED_EVENT, handleSignInRequired);
  }, []);

  useEffect(() => {
    if (state.hostedSession?.user?.id) {
      setShowSignInRequiredModal(false);
    }
  }, [state.hostedSession?.user?.id]);

  const closeSettings = () => {
    setShowSettings(false);
    if (state.view === 'settings') {
      dispatch({ type: 'SET_VIEW', payload: 'casting' }); // Fallback to casting
    }
  };

  const saveSettings = () => {
    dispatch({ type: 'SET_API_KEY', payload: tempKey });
    dispatch({ type: 'SET_MODEL', payload: NANO_BANANA_2_IMAGE_MODEL });
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
      // In Native Electron mode, ignore WebFS handlers completely.
      // Native sync owns actorLibraryStatus/isActorLibraryLoading. Setting the legacy
      // boolean here caused the library to flash as "ready/empty" before native sync began.
      if (window.electronAPI) {
        console.debug('[Native Sync] Skipping WebFS sync because Electron native sync owns actor library hydration.');
        return;
      }

      if (!state.saveDirectoryHandle) {
        dispatch({ type: 'SET_ACTOR_LIBRARY_STATUS', payload: 'ready' });
        dispatch({ type: 'SET_ACTOR_LIBRARY_LOADING', payload: false });
        return;
      }

      const saveDirHandle = state.saveDirectoryHandle as PermissionAwareDirectoryHandle;
      if (saveDirHandle.queryPermission && (await saveDirHandle.queryPermission({ mode: 'read' })) !== 'granted') {
        dispatch({ type: 'SET_ACTOR_LIBRARY_STATUS', payload: 'ready' });
        dispatch({ type: 'SET_ACTOR_LIBRARY_LOADING', payload: false });
        return;
      }

      dispatch({ type: 'SET_ACTOR_LIBRARY_STATUS', payload: 'hydrating' });
      dispatch({ type: 'SET_ACTOR_LIBRARY_LOADING', payload: true });
      console.debug('[ActorLibrary Hydration]', { status: 'hydrating' });
      console.debug('[ActorLibrary Loading]', {
        phase: 'native-sync-start',
      });

      let finalCountedLibrary: CastMember[] = [...state.actorLibrary];
      let success = true;

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
            dispatch({ type: 'SET_ACTOR_LIBRARY', payload: merged });
            finalCountedLibrary = merged;
            dispatch({ type: 'ADD_LOG', payload: { message: `Synced ${externalActors.length} actors from disk.`, type: 'success' } });
          }
        }
      } catch (e: unknown) {
        success = false;
        console.error("Disk sync error:", e);
        console.warn("[ActorLibrary Hydration]", { status: "error", error: e });
        dispatch({ type: 'SET_ACTOR_LIBRARY_STATUS', payload: 'error' });
        dispatch({ type: 'ADD_LOG', payload: { message: `Disk scan failed: ${getErrorMessage(e)}`, type: 'error' } });
      } finally {
        const knownStylesList = [
          'exact_studio', 'photorealism', 'dslr_capture',
          'family_3d', 'premium_animated_3d', 'claymation',
          'retro_cel', 'graphic_noir', 'retro_anime', 'comic_book',
          'cyberpunk_neon', 'cyberpunk'
        ];
        const knownStyles = new Set(knownStylesList.map(s => s.toLowerCase().replace(/[^a-z0-9]/g, '')));
        
        const categoryCounts = {
          production_actors: 0,
          realism: 0,
          anim: 0,
          illustration: 0,
          scifi: 0,
          uncategorized: 0
        };

        finalCountedLibrary.forEach(a => {
          if (a.isProductionActor) {
            categoryCounts.production_actors++;
            return;
          }
          const s = (a.profile?.style || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          if (!s || !knownStyles.has(s)) {
            categoryCounts.uncategorized++;
            return;
          }
          if (['exact_studio', 'photorealism', 'dslr_capture'].map(x => x.replace(/[^a-z0-9]/g, '')).includes(s)) {
            categoryCounts.realism++;
          } else if (['family_3d', 'premium_animated_3d', 'claymation'].map(x => x.replace(/[^a-z0-9]/g, '')).includes(s)) {
            categoryCounts.anim++;
          } else if (['retro_cel', 'graphic_noir', 'retro_anime', 'comic_book'].map(x => x.replace(/[^a-z0-9]/g, '')).includes(s)) {
            categoryCounts.illustration++;
          } else if (['cyberpunk_neon', 'cyberpunk'].map(x => x.replace(/[^a-z0-9]/g, '')).includes(s)) {
            categoryCounts.scifi++;
          } else {
            categoryCounts.uncategorized++;
          }
        });

        console.debug('[ActorLibrary Loading]', {
          phase: 'native-sync-complete',
          actorCount: finalCountedLibrary.length,
          categoryCounts,
        });

        dispatch({ type: 'SET_ACTOR_LIBRARY_LOADING', payload: false });
        if (success) {
          console.debug("[ActorLibrary Hydration]", {
            status: "ready",
            actorCount: finalCountedLibrary.length,
            categoryCounts,
          });
          dispatch({ type: 'SET_ACTOR_LIBRARY_STATUS', payload: 'ready' });
        }
      }
    };

    syncFromDisk();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.saveDirectoryHandle]); // Only run when folder connection changes

  // Targeted WebFS Thumbnail Rehydrator (Materializes existing library records)
  useEffect(() => {
    if (!postLaunchBackgroundWorkReady) return;

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
  }, [dispatch, postLaunchBackgroundWorkReady, state.saveDirectoryHandle, state.actorLibrary]);

  // --- NATIVE DISK SYNC (Electron) ---
  useEffect(() => {
    if (!postLaunchBackgroundWorkReady) return;

    const syncFromNative = async () => {
      if (!window.electronAPI || !state.saveDirectoryPath) {
        if (window.electronAPI) {
          dispatch({ type: 'SET_ACTOR_LIBRARY_STATUS', payload: 'ready' });
        }
        dispatch({ type: 'SET_ACTOR_LIBRARY_LOADING', payload: false });
        return;
      }

      dispatch({ type: 'SET_ACTOR_LIBRARY_STATUS', payload: 'hydrating' });
      dispatch({ type: 'SET_ACTOR_LIBRARY_LOADING', payload: true });
      console.debug('[ActorLibrary Hydration]', { status: 'hydrating' });
      console.debug('[ActorLibrary Loading]', {
        phase: 'native-sync-start',
      });

      let finalCountedLibrary: CastMember[] = [...state.actorLibrary];
      let success = true;

      try {
        const externalActors: CastMember[] = [];

        // 1. Direct directory scan under Library/ProductionActors for Organized Production Actor Packages
        const libraryPath = await window.electronAPI.joinPath(state.saveDirectoryPath, 'Library');
        const prodActorsPath = await window.electronAPI.joinPath(libraryPath, 'ProductionActors');
        
        if (await window.electronAPI.exists(prodActorsPath)) {
          try {
            const folderNames = await window.electronAPI.listFiles(prodActorsPath);
            if (folderNames && folderNames.length > 0) {
              for (const folderName of folderNames) {
                // Skip plain files that might be in the root of ProductionActors
                if (folderName.toLowerCase().endsWith('.png') || folderName.toLowerCase().endsWith('.json')) continue;
                
                const packageFolder = await window.electronAPI.joinPath(prodActorsPath, folderName);
                const jsonPath = await window.electronAPI.joinPath(packageFolder, 'actor.json');
                const pngPath = await window.electronAPI.joinPath(packageFolder, 'actor.png');
                
                if (await window.electronAPI.exists(jsonPath) && await window.electronAPI.exists(pngPath)) {
                  try {
                    const jsonText = await window.electronAPI.readTextFile(jsonPath);
                    const pngBase64 = await window.electronAPI.readFile(pngPath);
                    
                    if (jsonText && pngBase64) {
                      const actorMeta = JSON.parse(jsonText);
                      const actorId = actorMeta.id || folderName;
                      const diskId = `disk-packaged-${actorId}`;
                      
                      // Prevent duplicate registration if we scan both ways
                      if (externalActors.some(a => a.id === diskId)) continue;
                      
                      const relativeFilename = `Library/ProductionActors/${folderName}/actor.png`;
                      const displayName = actorMeta.displayName || actorMeta.name || folderName;
                      const hasProfile = Boolean(actorMeta);
                      const isIdentityLocked = actorMeta?.isIdentityLocked;

                      console.debug('[ProductionActor Library Hydrate]', {
                        actorId,
                        displayName,
                        category: 'Production Actors',
                        hasProfile,
                        isIdentityLocked,
                      });
                      
                      externalActors.push({
                        id: diskId,
                        url: `data:image/png;base64,${pngBase64}`,
                        localPath: pngPath,
                        previewUrl: `data:image/png;base64,${pngBase64}`,
                        sourceUrl: `data:image/png;base64,${pngBase64}`,
                        tag: 'front',
                        name: displayName,
                        filename: relativeFilename,
                        source: "production_actor_package",
                        isProductionActor: true,
                        assetType: "production_actor",
                        productionActorProfile: actorMeta,
                        category: "production_actors",
                        studio: "production_actors",
                        categoryKey: "production_actors",
                        productionProfile: {
                          ...actorMeta,
                          sourceImageUrl: `data:image/png;base64,${pngBase64}`,
                          approvedImageUrl: `data:image/png;base64,${pngBase64}`
                        },
                        profile: {
                          identity: displayName,
                          wardrobe: actorMeta.wardrobeSummary || '',
                          accessories: '',
                          style: actorMeta.styleSummary || 'biometric_realism'
                        }
                      });
                    }
                  } catch (err) {
                    console.warn(`Failed to parse production actor subfolder ${folderName}:`, err);
                  }
                }
              }
            }
          } catch (dirErr) {
            console.warn(`Failed to list folders in ${prodActorsPath}:`, dirErr);
          }
        }

        // 1b. Fallback index-based scanner for extra resilience
        const indexPath = await window.electronAPI.joinPath(libraryPath, 'library-index.json');
        if (await window.electronAPI.exists(indexPath)) {
          try {
            const indexText = await window.electronAPI.readTextFile(indexPath);
            if (indexText) {
              const parsedIndex = JSON.parse(indexText);
              if (parsedIndex && Array.isArray(parsedIndex.assets)) {
                for (const asset of parsedIndex.assets) {
                  if (asset.assetType === 'production_actor') {
                    const diskId = `disk-packaged-${asset.id}`;
                    // Skip if already loaded from direct folder scan
                    if (externalActors.some(a => a.id === diskId)) continue;

                    const packageFolder = await window.electronAPI.joinPath(libraryPath, asset.folder);
                    const jsonPath = await window.electronAPI.joinPath(packageFolder, asset.metadata);
                    const pngPath = await window.electronAPI.joinPath(packageFolder, asset.primaryImage);
                    
                    if (await window.electronAPI.exists(jsonPath) && await window.electronAPI.exists(pngPath)) {
                      try {
                        const jsonText = await window.electronAPI.readTextFile(jsonPath);
                        const pngBase64 = await window.electronAPI.readFile(pngPath);
                        
                        if (jsonText && pngBase64) {
                          const actorMeta = JSON.parse(jsonText);
                          const relativeFilename = `Library/${asset.folder}/${asset.primaryImage}`;
                          const displayName = actorMeta.displayName || actorMeta.name || asset.displayName;
                          const actorId = actorMeta.id || asset.id;
                          const hasProfile = Boolean(actorMeta);
                          const isIdentityLocked = actorMeta?.isIdentityLocked;

                          console.debug('[ProductionActor Library Hydrate]', {
                            actorId,
                            displayName,
                            category: 'Production Actors',
                            hasProfile,
                            isIdentityLocked,
                          });
                          
                          externalActors.push({
                            id: diskId,
                            url: `data:image/png;base64,${pngBase64}`,
                            localPath: pngPath,
                            previewUrl: `data:image/png;base64,${pngBase64}`,
                            sourceUrl: `data:image/png;base64,${pngBase64}`,
                            tag: 'front',
                            name: displayName,
                            filename: relativeFilename,
                            source: "production_actor_package",
                            isProductionActor: true,
                            assetType: "production_actor",
                            productionActorProfile: actorMeta,
                            category: "production_actors",
                            studio: "production_actors",
                            categoryKey: "production_actors",
                            productionProfile: {
                              ...actorMeta,
                              sourceImageUrl: `data:image/png;base64,${pngBase64}`,
                              approvedImageUrl: `data:image/png;base64,${pngBase64}`
                            },
                            profile: {
                              identity: displayName,
                              wardrobe: actorMeta.wardrobeSummary || '',
                              accessories: '',
                              style: actorMeta.styleSummary || 'biometric_realism'
                            }
                          });
                        }
                      } catch (err) {
                        console.warn(`Failed to load index-packaged actor ${asset.id}:`, err);
                      }
                    }
                  }
                }
              }
            }
          } catch (indexErr) {
            console.warn(`Failed to read library-index.json:`, indexErr);
          }
        }

        // 2. Fallback / Legacy Flat Scanner
        const actorsPath = await window.electronAPI.joinPath(state.saveDirectoryPath, 'Actors');

        // Categories to scan + Root (empty string)
        const SCAN_TARGETS = ['', 'Realism', 'Stylized Cartoon', 'Illustration', 'Sci-Fi', 'Uncategorized', 'Extras', 'Production Cast'];

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
            "Extras": "exact_studio",
            "Production Cast": "biometric_realism"
          };
          const defaultStyle = catToStyle[catOrRoot] || "exact_studio";

          await Promise.all(filenames.map(async (filename) => {
            if (!filename.toLowerCase().endsWith('.png')) return;

            try {
              const fullPath = await window.electronAPI!.joinPath(catPath, filename);
              const base64 = await window.electronAPI!.readFile(fullPath);
              
              const diskId = `disk-${catOrRoot || 'root'}-${filename}`; // Ensure ID uniqueness
              const displayName = filename.replace(/\.(png|jpg|jpeg)$/i, '');

              // Check for matching .json sidecar
              let productionProfile: any = undefined;
              const jsonFilename = filename.replace(/\.png$/i, '.json');
              const jsonFullPath = await window.electronAPI!.joinPath(catPath, jsonFilename);
              if (await window.electronAPI!.exists(jsonFullPath)) {
                try {
                  const jsonText = await window.electronAPI!.readTextFile(jsonFullPath);
                  if (jsonText) {
                    const parsed = JSON.parse(jsonText);
                    if (parsed && typeof parsed === 'object') {
                      productionProfile = parsed;
                      console.debug('[ProductionActor Load]', { 
                        actorId: parsed.id, 
                        hasJsonSidecar: true, 
                        isIdentityLocked: true 
                      });
                    }
                  }
                } catch (jsonErr) {
                  console.warn(`Failed to read/parse sidecar JSON for ${filename}`, jsonErr);
                }
              }

              const isProd = productionProfile?.assetType === "production_actor" || productionProfile?.isProductionActor || false;
              externalActors.push({
                id: diskId,
                url: `data:image/png;base64,${base64}`,
                localPath: fullPath,
                previewUrl: undefined,
                tag: 'front',
                name: productionProfile?.name || displayName,
                filename: catOrRoot ? `${catOrRoot}/${filename}` : filename,
                isProductionActor: isProd,
                assetType: isProd ? "production_actor" : undefined,
                productionActorProfile: isProd ? productionProfile : undefined,
                productionProfile: productionProfile,
                category: isProd ? "production_actors" : undefined,
                studio: isProd ? "production_actors" : undefined,
                categoryKey: isProd ? "production_actors" : undefined,
                profile: {
                  identity: productionProfile?.name || displayName,
                  wardrobe: productionProfile?.wardrobeSummary || '',
                  accessories: '',
                  style: isProd ? (productionProfile?.styleSummary || 'biometric_realism') : defaultStyle
                }
              });
            } catch (e) {
              console.warn(`Failed to load ${filename} from ${catOrRoot}`, e);
            }
          }));
        }));

        if (externalActors.length > 0 || state.actorLibrary.some(a => a.id.startsWith('disk-'))) {
          // SYNC TYPE: AUTHORITATIVE DISK SYNC
          const foundIds = new Set(externalActors.map(a => a.id));
          console.log(`[Native Sync] Found ${externalActors.length} files on disk. Mapping existing state...`);

          const preservedActors = state.actorLibrary.filter(a => !a.id.startsWith('disk-'));
          const existingDiskActors = state.actorLibrary.filter(a => a.id.startsWith('disk-') && foundIds.has(a.id));
          const existingMap = new Map(existingDiskActors.map(a => [a.id, a]));
          const newlyDiscoveredBasenames = new Set(externalActors.map(a => a.filename?.split(/[\\/]/).pop() || ""));

          const cleanPreservedActors = preservedActors.filter(pa => {
            const basename = pa.filename?.split(/[\\/]/).pop();
            if (basename === 'portrait.png' && pa.id.startsWith('nano_') === false) return false;
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
              };
            }

            const basename = newActor.filename?.split(/[\\/]/).pop() || "";
            const memoryZombie = preservedActors.find(pa => pa.filename?.split(/[\\/]/).pop() === basename);
            if (memoryZombie) {
              return { 
                  ...newActor, 
                  ...memoryZombie, 
                  id: newActor.id, 
                  url: newActor.url, 
                  previewUrl: newActor.previewUrl,
                  filename: newActor.filename 
              };
            }

            return newActor;
          });

          const newLibrary = [...cleanPreservedActors, ...finalDiskActors];
          dispatch({ type: 'SET_ACTOR_LIBRARY', payload: newLibrary });
          finalCountedLibrary = newLibrary;

          console.log(`Native Sync: Pruned and Synced. Total: ${newLibrary.length}`);
        }

      } catch (err) {
        success = false;
        console.error("Native Sync Error:", err);
        console.warn("[ActorLibrary Hydration]", { status: "error", error: err });
        dispatch({ type: 'SET_ACTOR_LIBRARY_STATUS', payload: 'error' });
      } finally {
        const knownStylesList = [
          'exact_studio', 'photorealism', 'dslr_capture',
          'family_3d', 'premium_animated_3d', 'claymation',
          'retro_cel', 'graphic_noir', 'retro_anime', 'comic_book',
          'cyberpunk_neon', 'cyberpunk'
        ];
        const knownStyles = new Set(knownStylesList.map(s => s.toLowerCase().replace(/[^a-z0-9]/g, '')));
        
        const categoryCounts = {
          production_actors: 0,
          realism: 0,
          anim: 0,
          illustration: 0,
          scifi: 0,
          uncategorized: 0
        };

        finalCountedLibrary.forEach(a => {
          if (a.isProductionActor) {
            categoryCounts.production_actors++;
            return;
          }
          const s = (a.profile?.style || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          if (!s || !knownStyles.has(s)) {
            categoryCounts.uncategorized++;
            return;
          }
          if (['exact_studio', 'photorealism', 'dslr_capture'].map(x => x.replace(/[^a-z0-9]/g, '')).includes(s)) {
            categoryCounts.realism++;
          } else if (['family_3d', 'premium_animated_3d', 'claymation'].map(x => x.replace(/[^a-z0-9]/g, '')).includes(s)) {
            categoryCounts.anim++;
          } else if (['retro_cel', 'graphic_noir', 'retro_anime', 'comic_book'].map(x => x.replace(/[^a-z0-9]/g, '')).includes(s)) {
            categoryCounts.illustration++;
          } else if (['cyberpunk_neon', 'cyberpunk'].map(x => x.replace(/[^a-z0-9]/g, '')).includes(s)) {
            categoryCounts.scifi++;
          } else {
            categoryCounts.uncategorized++;
          }
        });

        console.debug('[ActorLibrary Loading]', {
          phase: 'native-sync-complete',
          actorCount: finalCountedLibrary.length,
          categoryCounts,
        });

        dispatch({ type: 'SET_ACTOR_LIBRARY_LOADING', payload: false });
        if (success) {
          console.debug("[ActorLibrary Hydration]", {
            status: "ready",
            actorCount: finalCountedLibrary.length,
            categoryCounts,
          });
          dispatch({ type: 'SET_ACTOR_LIBRARY_STATUS', payload: 'ready' });
        }
      }
    };

    syncFromNative();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postLaunchBackgroundWorkReady, state.saveDirectoryPath]);

  return (
    <ErrorBoundary>
      <HelpProvider>
        <div className="flex min-h-screen h-[100dvh] min-w-0 flex-col overflow-hidden bg-[#0f0f11] text-gray-200 font-sans select-none">

          {/* Header */}
          <header className="app-header relative z-[1000] h-[124px] w-full border-b border-white/10 bg-[#171719] px-2.5">
            {/* LEFT BRAND */}
            <div className="app-header-brand flex shrink-0 items-center gap-3 overflow-visible justify-self-start">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                <img
                  src={`data:image/png;base64,${LOGO_BASE64}`}
                  alt="Cast Director Studio"
                  className="h-10 w-10 object-contain drop-shadow-[0_0_10px_rgba(234,179,8,0.45)]"
                />
              </div>

              <div className="app-header-brand-title min-w-0 overflow-visible">
                <div className="whitespace-nowrap text-[28px] font-black leading-none tracking-tight">
                  <span className="text-white">CAST DIRECTOR </span>
                  <span className="text-yellow-400">STUDIO</span>
                </div>

                <div className="mt-1 whitespace-nowrap text-[9px] font-bold uppercase tracking-[0.28em] text-zinc-500">
                  POWERED BY NANOBANANA 2
                </div>
              </div>
            </div>

            {/* Center Navigation */}
            <div className="app-header-nav-zone">
              <nav className="app-header-nav-frame" aria-label="Main navigation">
                <button
                  type="button"
                  className="app-header-nav-nudge app-header-nav-nudge-left"
                  disabled={!canScrollLeft}
                  onClick={() => scrollHeaderNav('left')}
                  aria-label="Scroll navigation left"
                >
                  ‹
                </button>

                <div
                  ref={navViewportRef}
                  className="app-header-nav-viewport"
                  onScroll={updateNavScrollState}
                  onWheel={handleHeaderNavWheel}
                >
                  <div className="app-header-nav-track">
                    {(['casting', 'nano_cast', 'portrait', 'wardrobe', 'props', 'staging', 'veo'] as ViewMode[])
                      .filter(mode => mode !== 'veo' || state.isStoryboardEnabled)
                      .map(mode => {
                        const isPreview = mode === 'staging';
                        const isExperimental = mode === 'veo';
                        const labelMap: Record<string, string> = {
                          casting: 'CAST',
                          nano_cast: 'NANO CAST',
                          portrait: 'PORTRAIT',
                          wardrobe: 'WARDROBE',
                          props: 'PROPS',
                          staging: 'STAGING',
                          veo: 'STORYBOARD'
                        };
                        const label = labelMap[mode] || mode.toUpperCase();
                        const isActive = state.view === mode;

                        return (
                          <button
                            ref={isActive ? activeTabRef : null}
                            key={mode}
                            type="button"
                            className="app-header-nav-tab"
                            data-active={isActive ? "true" : "false"}
                            data-pressed={navPressedTab === mode ? "true" : "false"}
                            onMouseDown={() => setNavPressedTab(mode)}
                            onMouseUp={() => setNavPressedTab(null)}
                            onMouseLeave={() => setNavPressedTab(null)}
                            onClick={() => handleNavSelect(mode)}
                          >
                            <span>{label}</span>

                            {isPreview && (
                              <span className="nav-preview-badge">PREVIEW</span>
                            )}

                            {isExperimental && (
                              <span className="nav-exp-badge">EXP</span>
                            )}
                          </button>
                        );
                      })}
                  </div>
                </div>

                <button
                  type="button"
                  className="app-header-nav-nudge app-header-nav-nudge-right"
                  disabled={!canScrollRight}
                  onClick={() => scrollHeaderNav('right')}
                  aria-label="Scroll navigation right"
                >
                  ›
                </button>
              </nav>
            </div>

            {/* Right Settings & File Menu (Combined Unified Pill) */}
            <div className="app-header-actions relative z-[1000] flex shrink-0 justify-end justify-self-end [style='-webkit-app-region:no-drag;']">
              <FramedPanel className="scale-[0.80] origin-right lg:scale-90 pointer-events-auto shrink-0">
              
              {/* Credits Segment */}
              <div
                ref={creditUsagePopoverRef}
                className="relative"
                onMouseEnter={() => {
                  if (billingHeaderState.canOpenUsage) setShowCreditUsage(true);
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (billingHeaderState.canOpenUsage) {
                      setShowCreditUsage(prev => !prev);
                    } else if (billingHeaderState.needsAttention) {
                      setShowSettings(true);
                    }
                  }}
                  className={`flex items-center gap-3 px-1 opacity-90 hover:opacity-100 transition-opacity focus:outline-none ${billingHeaderState.canOpenUsage ? 'cursor-help' : 'cursor-pointer'}`}
                  title={billingHeaderState.title}
                >
                <span className="text-[#888] text-[12px] font-semibold tracking-[0.5px]">
                  {billingHeaderState.modeLabel}
                </span>
                <div className="w-px h-[18px] bg-[#333]" />
                <span className={`font-semibold flex items-center justify-center ${billingHeaderState.needsAttention ? 'min-w-[52px] text-[10px] tracking-[0.12em] text-yellow-300' : 'min-w-[24px] text-[18px] text-white'}`}>
                  {billingHeaderState.isLoading ? (
                    <div className="w-[18px] h-[18px] border-[2.5px] border-white/20 border-t-white rounded-full animate-spin" title="Loading credits..."></div>
                  ) : (
                    billingHeaderState.valueLabel
                  )}
                </span>
                </button>

                {showCreditUsage && billingHeaderState.canOpenUsage && createPortal(
                  <div 
                    className="fixed z-[9999] w-[340px] rounded-xl border border-white/10 bg-[#111113] shadow-2xl shadow-black/60 p-3 text-left"
                    style={{
                      top: creditUsagePopoverRef.current ? creditUsagePopoverRef.current.getBoundingClientRect().bottom + 12 : 0,
                      right: creditUsagePopoverRef.current ? window.innerWidth - creditUsagePopoverRef.current.getBoundingClientRect().right : 0,
                    }}
                  >
                    <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-2">
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-400">Hosted Usage</div>
                        <div className="text-xs text-gray-400 mt-1">
                          {creditUsageResetAt ? `Since reload: ${formatHostedUsageDate(creditUsageResetAt)}` : 'Current credit spend ledger'}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] text-gray-500 uppercase font-bold">{creditUsageResetAt ? 'Batch Spend' : 'Known Total'}</div>
                        <div className="text-lg font-black text-white">{creditUsageTotal}</div>
                      </div>
                    </div>

                    {creditUsageWarning && !creditUsageLoading && !creditUsageError && (
                      <div className="mt-2 rounded-lg border border-yellow-500/20 bg-yellow-500/10 px-3 py-2 text-[11px] leading-snug text-yellow-100">
                        {creditUsageWarning}
                      </div>
                    )}

                    <div className="mt-2 max-h-[300px] overflow-y-auto pr-1 space-y-1">
                      {creditUsageLoading ? (
                        <div className="py-6 flex items-center justify-center">
                          <div className="w-5 h-5 border-[2.5px] border-white/20 border-t-white rounded-full animate-spin" />
                        </div>
                      ) : creditUsageError ? (
                        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-[11px] text-red-200">
                          Usage history unavailable: {creditUsageError}
                        </div>
                      ) : creditUsageRows.length === 0 ? (
                        <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-4 text-[11px] text-gray-400">
                          {creditUsageResetAt ? 'No hosted generation charges since the last credit reload.' : 'No hosted generation charges found yet.'}
                        </div>
                      ) : (
                        creditUsageRows.map((row) => {
                          const credits = getHostedUsageCredits(row);
                          const hasKnownCredits = credits > 0;
                          const status = String(row.status || 'UNKNOWN').toUpperCase();
                          const statusClass = status === 'COMPLETED'
                            ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20'
                            : status === 'FAILED' || status === 'CANCELED' || status === 'EXPIRED'
                              ? 'text-red-300 bg-red-500/10 border-red-500/20'
                              : 'text-yellow-300 bg-yellow-500/10 border-yellow-500/20';

                          return (
                            <div key={row.id} className="rounded-lg bg-black/30 border border-white/5 px-3 py-2">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-xs font-bold text-gray-200 truncate">{getHostedUsageLabel(row)}</div>
                                  <div className="text-[10px] text-gray-500 mt-0.5">{formatHostedUsageDate(row.created_at)}</div>
                                </div>
                                <div className="text-right shrink-0">
                                  <div className="text-sm font-black text-white">{hasKnownCredits ? credits : '--'}</div>
                                  <div className="text-[9px] uppercase text-gray-500">{hasKnownCredits ? 'credits' : 'cost n/a'}</div>
                                </div>
                              </div>
                              <div className="flex items-center justify-between gap-2 mt-2">
                                <span className={`text-[9px] uppercase font-black tracking-wider border rounded px-1.5 py-0.5 ${statusClass}`}>{status}</span>
                                <span className="text-[9px] text-gray-600 font-mono">{row.id.slice(0, 8)}</span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => void refreshHostedUsage()}
                      className="mt-2 w-full rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] text-[10px] font-bold uppercase tracking-wider text-gray-300 py-2 transition-colors"
                    >
                      Refresh Usage
                    </button>
                  </div>,
                  document.body
                )}
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
          <main className="relative flex-1 min-h-0 overflow-hidden flex flex-col">
            {activationStatus === 'pending' ? (
              <div className="flex-1 flex flex-col items-center justify-center bg-[#0f0f11] text-gray-400">
                <div className="w-8 h-8 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                <h2 className="text-xl font-bold text-white mb-2 tracking-widest uppercase">Verifying License</h2>
                <p className="text-sm">Securely checking device entitlements...</p>
              </div>
            ) : activationStatus === 'denied' ? (
              <div className="flex-1 flex flex-col items-center justify-center bg-[#0f0f11] text-gray-400 p-6 text-center">
                <div className="w-16 h-16 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mb-6 border border-red-500/50">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </div>
                <h2 className="text-2xl font-black text-white mb-3 tracking-widest uppercase">Access Denied</h2>
                <p className="text-base max-w-md mb-6">{activationError}</p>
                <button
                  onClick={handleSignOut}
                  className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white font-bold rounded-lg transition-colors border border-white/10"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <AnimatePresence mode="wait">
                <div
                  key="casting-container"
                  hidden={state.view !== 'casting'}
                  className="flex-1 min-h-0 w-full flex flex-col"
                >
                  <motion.div
                    className="flex-1 min-h-0 w-full flex flex-col"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{
                      opacity: state.view === 'casting' ? 1 : 0,
                      scale: state.view === 'casting' ? 1 : 0.98,
                      pointerEvents: state.view === 'casting' ? 'auto' : 'none'
                    }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                  >
                    <CastingForge />
                  </motion.div>
                </div>

                <div
                  key="nano-cast-container"
                  hidden={state.view !== 'nano_cast'}
                  className="flex-1 min-h-0 w-full flex flex-col"
                >
                  <motion.div
                    className="flex-1 min-h-0 w-full flex flex-col"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{
                      opacity: state.view === 'nano_cast' ? 1 : 0,
                      scale: state.view === 'nano_cast' ? 1 : 0.98,
                      pointerEvents: state.view === 'nano_cast' ? 'auto' : 'none'
                    }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                  >
                    <NanoCastingDirector />
                  </motion.div>
                </div>

                {mountedWorkspaces.has('portrait') && (
                  <div
                    key="portrait-container"
                    hidden={state.view !== 'portrait'}
                    className="flex-1 min-h-0 w-full flex flex-col"
                  >
                    <motion.div
                      className="flex-1 min-h-0 w-full flex flex-col"
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{
                        opacity: state.view === 'portrait' ? 1 : 0,
                        scale: state.view === 'portrait' ? 1 : 0.98,
                        pointerEvents: state.view === 'portrait' ? 'auto' : 'none'
                      }}
                      transition={{ duration: 0.22, ease: "easeOut" }}
                    >
                      <Suspense fallback={<WorkspaceSwitchingShell label="Portrait" />}>
                        <PortraitStudio />
                      </Suspense>
                    </motion.div>
                  </div>
                )}

                {mountedWorkspaces.has('wardrobe') && (
                  <div
                    key="wardrobe-container"
                    hidden={state.view !== 'wardrobe'}
                    className="flex-1 min-h-0 w-full flex flex-col"
                  >
                    <motion.div
                      className="flex-1 min-h-0 w-full flex flex-col"
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{
                        opacity: state.view === 'wardrobe' ? 1 : 0,
                        scale: state.view === 'wardrobe' ? 1 : 0.98,
                        pointerEvents: state.view === 'wardrobe' ? 'auto' : 'none'
                      }}
                      transition={{ duration: 0.22, ease: "easeOut" }}
                    >
                      <Suspense fallback={<WorkspaceSwitchingShell label="Wardrobe" />}>
                        <WardrobeStudio />
                      </Suspense>
                    </motion.div>
                  </div>
                )}

                {mountedWorkspaces.has('props') && (
                  <div
                    key="props-container"
                    hidden={state.view !== 'props'}
                    className="flex-1 min-h-0 w-full flex flex-col"
                  >
                    <motion.div
                      className="flex-1 min-h-0 w-full flex flex-col"
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{
                        opacity: state.view === 'props' ? 1 : 0,
                        scale: state.view === 'props' ? 1 : 0.98,
                        pointerEvents: state.view === 'props' ? 'auto' : 'none'
                      }}
                      transition={{ duration: 0.22, ease: "easeOut" }}
                    >
                      <Suspense fallback={<WorkspaceSwitchingShell label="Props" />}>
                        <PropAccessoryStudio />
                      </Suspense>
                    </motion.div>
                  </div>
                )}

                {mountedWorkspaces.has('staging') && (
                  <div
                    key="staging-container"
                    hidden={state.view !== 'staging'}
                    className="flex-1 min-h-0 w-full flex flex-col"
                  >
                    <motion.div
                      className="flex-1 min-h-0 w-full flex flex-col"
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{
                        opacity: state.view === 'staging' ? 1 : 0,
                        scale: state.view === 'staging' ? 1 : 0.98,
                        pointerEvents: state.view === 'staging' ? 'auto' : 'none'
                      }}
                      transition={{ duration: 0.22, ease: "easeOut" }}
                    >
                      <Suspense fallback={<WorkspaceSwitchingShell label="Staging" />}>
                        <SceneCanvas />
                      </Suspense>
                    </motion.div>
                  </div>
                )}

                {mountedWorkspaces.has('veo') && (
                  <div
                    key="veo-container"
                    hidden={state.view !== 'veo'}
                    className="flex-1 min-h-0 w-full flex flex-col"
                  >
                    <motion.div
                      className="flex-1 min-h-0 w-full flex flex-col"
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{
                        opacity: state.view === 'veo' ? 1 : 0,
                        scale: state.view === 'veo' ? 1 : 0.98,
                        pointerEvents: state.view === 'veo' ? 'auto' : 'none'
                      }}
                      transition={{ duration: 0.22, ease: "easeOut" }}
                    >
                      <Suspense fallback={<WorkspaceSwitchingShell label="Storyboard" />}>
                        <VeoPromptStudio />
                      </Suspense>
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>
            )}
          </main>

          {/* Cinematic Loading Overlay */}
          {state.isProcessing && <CastDirectorThinking />}

          <AppCloseDialog
            isOpen={showAppCloseDialog}
            onClose={() => setShowAppCloseDialog(false)}
            onSave={handleSaveClose}
            onDiscard={performDiscardSession}
          />

          <ImageInspector />

          <HelpCenterDrawer />
          <WelcomeModal />
          <InsufficientCreditModal />
          <CreateProductionActorWorkflow />

          {showSignInRequiredModal && (
            <div
              className="fixed inset-0 z-[4500] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
              role="dialog"
              aria-modal="true"
              aria-labelledby="sign-in-required-title"
            >
              <div className="sign-in-required-modal w-full max-w-[520px] rounded-xl border border-yellow-400/35 bg-[#17171a] p-6 shadow-[0_24px_90px_rgba(0,0,0,0.62),0_0_34px_rgba(234,179,8,0.08)]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 id="sign-in-required-title" className="text-lg font-black uppercase tracking-[0.16em] text-white">
                      SIGN IN REQUIRED
                    </h2>
                    <p className="mt-4 text-sm leading-relaxed text-zinc-200">
                      Please sign in to use Hosted generation, manage credits, and save your results.
                    </p>
                    <p className="mt-3 text-xs leading-relaxed text-zinc-400">
                      If you want to use your own API key, switch to BYOK mode after signing in or from Settings.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSignInRequiredModal(false)}
                    className="sign-in-required-close flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors focus:outline-none"
                    aria-label="Close sign in required dialog"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setShowSignInRequiredModal(false)}
                    className="sign-in-required-secondary flex min-h-[44px] w-full items-center justify-center rounded-lg px-5 py-3 text-xs font-black uppercase tracking-[0.14em] transition-colors focus:outline-none sm:w-auto sm:min-w-[128px]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowSignInRequiredModal(false);
                      setShowSettings(true);
                    }}
                    className="sign-in-required-primary flex min-h-[44px] w-full items-center justify-center rounded-lg px-5 py-3 text-xs font-black uppercase tracking-[0.14em] transition-colors focus:outline-none sm:w-auto sm:min-w-[128px]"
                  >
                    Sign In
                  </button>
                </div>
              </div>
            </div>
          )}

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
          </footer>          {/* Settings Modal */}
          {
            showSettings && (
              <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[4000] flex items-center justify-center p-3 sm:p-6">
                <div className="bg-[#18181b] border border-gray-700 p-4 sm:p-6 rounded-xl w-full max-w-2xl max-h-[90dvh] overflow-y-auto animate-in fade-in zoom-in duration-200">
                  <h2 className="text-lg font-bold text-white mb-4">Configuration</h2>
                  <div className="space-y-4">
                    {/* SECTION 1: ACCOUNT */}
                    <div className="p-4 bg-black/30 border border-gray-800 rounded-lg space-y-3">
                      <label className="block text-xs font-black uppercase tracking-wider text-gray-400">Account</label>
                      {state.hostedSession ? (
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold text-white">{state.hostedSession.user?.email}</p>
                            <p className="text-[10px] text-emerald-400 font-mono mt-0.5">Signed In ✓</p>
                          </div>
                          <button
                            onClick={handleSignOut}
                            disabled={isAuthLoading}
                            className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500 hover:text-white text-red-400 rounded text-xs font-bold transition-all"
                          >
                            {isAuthLoading ? 'Signing out...' : 'Sign Out'}
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <p className="text-xs text-gray-500">Sign in to your Cast Director Studio account to view your desktop licenses.</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input
                              type="email"
                              value={authEmail}
                              onChange={(e) => setAuthEmail(e.target.value)}
                              placeholder="Email account"
                              className="bg-[#09090b] border border-gray-700 p-2 rounded text-xs text-white focus:border-blue-500 focus:outline-none"
                            />
                            <input
                              type="password"
                              value={authPass}
                              onChange={(e) => setAuthPass(e.target.value)}
                              placeholder="Password"
                              className="bg-[#09090b] border border-gray-700 p-2 rounded text-xs text-white focus:border-blue-500 focus:outline-none"
                            />
                          </div>
                          <button
                            onClick={handleSignIn}
                            disabled={isAuthLoading || !authEmail || !authPass}
                            className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded text-xs font-bold transition-colors"
                          >
                            {isAuthLoading ? 'Authenticating...' : 'Sign In'}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* SECTION 2: DESKTOP LICENSE */}
                    <div className="p-4 bg-black/30 border border-gray-800 rounded-lg space-y-4">
                      <div className="flex justify-between items-center">
                        <label className="block text-xs font-black uppercase tracking-wider text-gray-400">Desktop License</label>
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${activationStatus === 'allowed' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                          {activationStatus === 'allowed' ? 'Activated' : 'Not Activated'}
                        </span>
                      </div>

                      {activationStatus === 'allowed' && activeLicense ? (
                        <div className="grid grid-cols-2 gap-4 text-xs">
                          <div>
                            <span className="text-gray-500 uppercase text-[10px] tracking-wider block">License Type</span>
                            <span className="font-bold text-white mt-1 block">
                              {activeLicense.productKey === 'agency_desktop_byok' || activeLicense.productKey === 'agency_commercial_byok'
                                ? 'Agency Commercial BYOK'
                                : 'Indie Desktop BYOK'}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-500 uppercase text-[10px] tracking-wider block">License Suffix</span>
                            <span className="font-mono text-gray-300 mt-1 block">{activeLicense.licenseKeySuffix || 'N/A'}</span>
                          </div>
                          <div className="col-span-2 flex items-center justify-between border-t border-gray-800/80 pt-3 mt-1">
                            <div>
                              <span className="text-gray-500 uppercase text-[10px] tracking-wider block">Activated Devices</span>
                              <span className="font-bold text-white mt-1 block">
                                {activeLicense.activeDeviceCount} of {activeLicense.activationLimit} active
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={handleDeactivateDevice}
                              disabled={isActivating}
                              className="px-3 py-1.5 bg-red-600/10 hover:bg-red-600 hover:text-white text-red-400 rounded text-xs font-bold transition-all disabled:opacity-50"
                            >
                              {isActivating ? 'Deactivating...' : 'Deactivate This Device'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {state.hostedSession && licensesList.length === 0 && !isLicensesLoading && !licensesLoadError ? (
                            <p className="text-xs text-red-400 font-semibold leading-relaxed">
                              Signed in but no active desktop license found
                            </p>
                          ) : (
                            <p className="text-xs text-gray-500">
                              A valid BYOK desktop license is required to unlock local API integrations.
                            </p>
                          )}
                          {state.hostedSession ? (
                            <button
                              type="button"
                              onClick={() => {
                                setManualLicenseKey('');
                                setActivationError('');
                                setShowActivationModal(true);
                                refreshLicenses();
                              }}
                              className="w-full py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded text-xs font-bold transition-all"
                            >
                              Activate License
                            </button>
                          ) : (
                            <div className="text-xs text-zinc-400 bg-zinc-800/20 border border-zinc-700/30 p-2.5 rounded-lg leading-relaxed">
                              Please sign in to your account first to fetch active desktop licenses, or manually activate below.
                            </div>
                          )}
                          {!state.hostedSession && (
                            <button
                              type="button"
                              onClick={() => {
                                setManualLicenseKey('');
                                setActivationError('');
                                setShowActivationModal(true);
                              }}
                              className="w-full py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded text-xs font-bold transition-all"
                            >
                              Activate Manually
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* SECTION 3: MODEL API KEY / BYOK */}
                    <div className="p-4 bg-black/30 border border-gray-800 rounded-lg space-y-3">
                      <label className="block text-xs font-black uppercase tracking-wider text-gray-400">Generation Billing Mode</label>

                      <div className="grid grid-cols-2 gap-2 bg-[#09090b] p-1 rounded-lg border border-gray-850">
                        <button
                          type="button"
                          onClick={() => setTempBillingMode('hosted')}
                          className={`py-1.5 rounded-md text-xs font-bold transition-all uppercase tracking-wider ${tempBillingMode === 'hosted' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                        >
                          Hosted Cloud
                        </button>
                        <button
                          type="button"
                          onClick={() => setTempBillingMode('byok')}
                          className={`py-1.5 rounded-md text-xs font-bold transition-all uppercase tracking-wider ${tempBillingMode === 'byok' ? 'bg-yellow-600 text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                        >
                          BYOK / API Key
                        </button>
                      </div>

                      {tempBillingMode === 'hosted' ? (
                        <div className="text-xs text-zinc-400 bg-blue-500/5 border border-blue-500/20 p-3 rounded-lg leading-relaxed animate-in fade-in slide-in-from-top-1 duration-150">
                          <p className="font-semibold text-blue-400 uppercase text-[10px] tracking-wider mb-1">Hosted Cloud Mode Active</p>
                          Uses your hosted credits or hosted subscription. No Gemini API key required.
                        </div>
                      ) : (
                        <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-150">
                          <label className="block text-[10px] text-gray-500 uppercase mb-1 tracking-wider">Gemini API Key</label>
                          <input
                            type="password"
                            className="w-full bg-[#09090b] border border-gray-700 p-2 rounded text-xs text-white focus:border-yellow-500 focus:outline-none"
                            placeholder="AIzaSy..."
                            value={tempKey}
                            onChange={(e) => setTempKey(e.target.value)}
                          />
                          <p className="text-[10px] text-gray-500 mt-2 leading-relaxed">
                            Uses your own Gemini API key. Requires an activated Cast Director Studio desktop license. This is separate from the Cast Director Studio desktop license key.
                          </p>
                        </div>
                      )}
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
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-2 tracking-wider">NanoBanana 2 Engine</label>
                      <div className="text-left p-3 rounded-lg border bg-yellow-500/10 border-yellow-500">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-xs font-bold text-yellow-500">NanoBanana 2</span>
                          <div className="w-2 h-2 rounded-full bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.6)]"></div>
                        </div>
                        <p className="text-[10px] text-gray-400">Premium NanoBanana 2 image model locked for biometric character sheets and digital doubles.</p>
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

                      <div className="pt-3 border-t border-white/5 space-y-3">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase">Biometric Scan Sounds</label>
                            <p className="text-[9px] text-gray-500">Angle-complete tones for NanoCast acquisition.</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => dispatch({ type: 'SET_BIOMETRIC_SOUND_ENABLED', payload: !state.biometricSoundEnabled })}
                            className="shrink-0 relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
                            style={{ backgroundColor: state.biometricSoundEnabled ? '#eab308' : '#52525b' }}
                            aria-pressed={state.biometricSoundEnabled}
                          >
                            <span
                              className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${state.biometricSoundEnabled ? 'translate-x-5' : 'translate-x-1'}`}
                            />
                          </button>
                        </div>

                        <div className={`space-y-1 transition-opacity ${state.biometricSoundEnabled ? 'opacity-100' : 'opacity-45'}`}>
                          <div className="flex items-center justify-between gap-3">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Volume</label>
                            <span className="text-[10px] font-mono font-bold text-gray-400">{state.biometricSoundVolume}%</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            step="5"
                            value={state.biometricSoundVolume}
                            disabled={!state.biometricSoundEnabled}
                            onChange={(e) => dispatch({ type: 'SET_BIOMETRIC_SOUND_VOLUME', payload: Number(e.target.value) })}
                            className="w-full accent-yellow-500 disabled:cursor-not-allowed"
                            aria-label="Biometric scan sound volume"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Image Resolution (NanoBanana 2)</label>
                        <select
                          id="render-quality-selector"
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
                          <label className="block text-xs font-bold text-gray-500 uppercase">Thinking Mode (NanoBanana 2)</label>
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

          {/* Activation Modal */}
          {
            showActivationModal && (
              <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[5000] flex items-center justify-center p-4">
                <div className="bg-[#1c1c1f] border border-gray-800 p-6 rounded-xl w-full max-w-md animate-in fade-in zoom-in duration-150">
                  <h3 className="text-base font-bold text-white mb-2">Activate Cast Director Studio</h3>
                  <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
                    {!state.hostedSession ? (
                      "Sign in to use a desktop license from your account, or paste your license key below."
                    ) : isLicensesLoading ? (
                      "Checking your account for active desktop licenses..."
                    ) : licensesLoadError ? (
                      "We could not load desktop licenses from your account. You can still paste a license key below."
                    ) : licensesList.length > 0 ? (
                      "Choose a desktop license from your account, or paste a license key below."
                    ) : (
                      `You are signed in as ${state.hostedSession.user?.email}, but no active desktop license was found on this account. Paste a Cast Director Studio license key below, or purchase/claim a desktop license from your account portal.`
                    )}
                  </p>

                  <div className="space-y-4">
                    {/* If signed in, show license picker if licenses exist and not loading */}
                    {state.hostedSession && licensesList.length > 0 && !isLicensesLoading && (
                      <div className="space-y-2">
                        <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider">Select License</label>
                        <div className="space-y-2 max-h-[160px] overflow-y-auto">
                          {licensesList.map((lic) => (
                            <label
                              key={lic.id}
                              className={`flex items-start gap-3 p-3 rounded-lg border transition-all cursor-pointer ${selectedLicenseId === lic.id ? 'bg-yellow-500/10 border-yellow-500' : 'bg-[#09090b] border-gray-800 hover:border-gray-700'}`}
                            >
                              <input
                                type="radio"
                                name="activation-license"
                                checked={selectedLicenseId === lic.id}
                                onChange={() => {
                                  setSelectedLicenseId(lic.id);
                                  setManualLicenseKey('');
                                }}
                                className="mt-0.5 accent-yellow-500"
                              />
                              <div className="text-xs">
                                <p className="font-bold text-white">
                                  {lic.displayName}
                                </p>
                                <p className="text-[10px] text-gray-400 mt-1">Suffix: {lic.licenseKeySuffix || 'N/A'}</p>
                                <p className="text-[10px] text-gray-400">Limit: {lic.activeDeviceCount} of {lic.activationLimit} active</p>
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Manual Key entry */}
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider">Cast Director Studio License Key</label>
                      <input
                        type="text"
                        className="w-full bg-[#09090b] border border-gray-700 p-2.5 rounded text-xs text-white focus:border-yellow-500 focus:outline-none placeholder-gray-600 font-mono"
                        placeholder="CDS_LIC_..."
                        value={manualLicenseKey}
                        onChange={(e) => {
                          setManualLicenseKey(e.target.value);
                          setSelectedLicenseId(''); // deselect list if typing key manually
                        }}
                      />
                    </div>

                    {activationError && (
                      <p className="text-xs text-red-400 font-bold bg-red-500/10 border border-red-500/25 p-2 rounded-lg leading-relaxed">
                        ⚠️ {activationError}
                      </p>
                    )}

                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        onClick={() => {
                          setShowActivationModal(false);
                          setActivationError('');
                        }}
                        className="px-4 py-2 text-zinc-400 text-xs hover:text-white"
                        disabled={isActivating}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleActivateDevice}
                        className="bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 text-white px-4 py-2 rounded text-xs font-bold transition-all"
                        disabled={
                          isActivating ||
                          !(
                            (Boolean(selectedLicenseId) && !isLicensesLoading) ||
                            manualLicenseKey.trim().length >= 10
                          )
                        }
                      >
                        {isActivating ? 'Activating...' : 'Activate This Device'}
                      </button>
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

