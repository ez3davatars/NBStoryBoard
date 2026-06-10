import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, FolderOutput, Clock, ChevronDown, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { useRecentGenerationsStore } from '../../stores/useRecentGenerationsStore';
import type { RecentGenerationStudio, RecentGeneration } from '../../stores/useRecentGenerationsStore';
import ConfirmDialog from '../ui/ConfirmDialog';

// --- PROPS ---

export type RecentGenerationsStripProps = {
  studio: RecentGenerationStudio;
  compact?: boolean;
  showSingle?: boolean;
  showEmpty?: boolean;
  className?: string;
  onHide?: () => void;
  onSelectGeneration?: (generation: RecentGeneration) => void;
  onExportGeneration?: (generation: RecentGeneration) => void;
};

const isPitchSheetPreviewGeneration = (generation: RecentGeneration) =>
  generation.featureSource === 'character_pitch_sheet' ||
  generation.displayLabel === 'Pitch Sheet Preview';

const STARTUP_INIT_DELAY_MS = 8500;

// --- COMPONENT ---

export default function RecentGenerationsStrip({
  studio,
  compact = false,
  showSingle = false,
  showEmpty = false,
  className = '',
  onHide,
  onSelectGeneration,
  onExportGeneration,
}: RecentGenerationsStripProps) {
  const {
    recentGenerations,
    activeRecentGenerationIdByStudio,
    setActiveRecentGeneration,
    removeRecentGeneration,
    clearRecentGenerationsForStudio,
    initStore,
    initialized,
  } = useRecentGenerationsStore();

  // Filter generations for this studio
  const studioGenerations = recentGenerations.filter((g) => g.studio === studio);
  const activeId = activeRecentGenerationIdByStudio[studio] || null;
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const [triggerState, setTriggerState] = useState(() => ({
    studio,
    count: studioGenerations.length,
    hasTriggered: studioGenerations.length >= 2,
  }));
  const [scrollState, setScrollState] = useState({ canScrollLeft: false, canScrollRight: false });
  const scrollRef = useRef<HTMLDivElement>(null);

  let hasTriggered = triggerState.hasTriggered;
  if (triggerState.studio !== studio || triggerState.count !== studioGenerations.length) {
    hasTriggered =
      studioGenerations.length >= 2 ||
      (studioGenerations.length > 0 && triggerState.studio === studio && triggerState.hasTriggered);
    setTriggerState({ studio, count: studioGenerations.length, hasTriggered });
  }

  // Initialize store on first mount
  useEffect(() => {
    if (initialized) return;

    const timer = window.setTimeout(() => {
      initStore();
    }, STARTUP_INIT_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [initialized, initStore]);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      setScrollState({ canScrollLeft: false, canScrollRight: false });
      return;
    }

    const maxScrollLeft = Math.max(0, el.scrollWidth - el.clientWidth);
    setScrollState({
      canScrollLeft: el.scrollLeft > 2,
      canScrollRight: el.scrollLeft < maxScrollLeft - 2,
    });
  }, []);

  // Auto-scroll to the newest thumbnail when a new generation is added
  useEffect(() => {
    if (scrollRef.current && studioGenerations.length > 0) {
      scrollRef.current.scrollTo({ left: 0, behavior: 'smooth' });
      window.setTimeout(updateScrollState, 250);
    }
  }, [studioGenerations.length, updateScrollState]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    updateScrollState();
    el.addEventListener('scroll', updateScrollState, { passive: true });
    window.addEventListener('resize', updateScrollState);

    const resizeObserver = new ResizeObserver(updateScrollState);
    resizeObserver.observe(el);

    return () => {
      el.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
      resizeObserver.disconnect();
    };
  }, [updateScrollState]);

  const scrollByPage = (direction: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;

    const distance = Math.max(thumbSizePx * 3, el.clientWidth * 0.7);
    el.scrollBy({
      left: direction === 'left' ? -distance : distance,
      behavior: 'smooth',
    });
  };

  const handleStripWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;

    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (delta === 0) return;

    e.preventDefault();
    el.scrollLeft += delta;
    updateScrollState();
  };

  const handleSelect = (generation: RecentGeneration) => {
    setActiveRecentGeneration(studio, generation.id);
    onSelectGeneration?.(generation);
  };

  const handleExport = (e: React.MouseEvent, generation: RecentGeneration) => {
    e.stopPropagation();
    onExportGeneration?.(generation);
  };

  const handleRemove = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    removeRecentGeneration(id);
  };

  const handleClearAll = () => {
    clearRecentGenerationsForStudio(studio);
  };

  const thumbSize = compact ? 'w-12 h-12' : 'w-16 h-16';
  const thumbSizePx = compact ? 48 : 64;

  // --- EMPTY STATE ---
  if (studioGenerations.length === 0 && !showEmpty) {
    return null;
  }
  
  // Only hide on 1 generation IF we haven't crossed the 2+ threshold yet (to respect initial load preference)
  if (studioGenerations.length > 0 && !showSingle && !hasTriggered && studioGenerations.length <= 1) {
    return null;
  }

  // --- COLLAPSIBLE HEADER ---
  const headerContent = (
    <div className="flex items-center justify-between px-3 py-1.5 shrink-0">
      <div className="flex items-center gap-2">
        <Clock className="w-3 h-3 text-gray-500" />
        <span
          className="text-[9px] font-bold text-gray-500 uppercase tracking-[0.15em]"
          title="Recent Generations are cached locally, including reference sheets, and can survive app restarts. They are not permanent library assets until exported."
        >
          Recent Generations
        </span>
        <span className="text-[9px] text-gray-600 font-mono">{studioGenerations.length}</span>
      </div>
      <div className="flex items-center gap-1">
        {studioGenerations.length > 0 && (
          <button
            onClick={() => setIsClearConfirmOpen(true)}
            className="inline-flex items-center gap-1 rounded-md border border-red-400/10 bg-red-500/[0.035] px-1.5 py-1 text-[8px] font-black uppercase tracking-[0.14em] text-red-300/70 transition-colors hover:border-red-400/25 hover:bg-red-500/10 hover:text-red-200"
            title="Clear this studio's recent generations"
            aria-label="Clear all recent generations for this studio"
          >
            <Trash2 className="w-3 h-3" />
            <span>Clear All</span>
          </button>
        )}
        {studioGenerations.length > 0 && (
          <>
            <button
              onClick={() => scrollByPage('left')}
              disabled={!scrollState.canScrollLeft}
              className="!p-1 !bg-white/5 disabled:!bg-transparent !border-transparent !min-w-0 !min-h-0 text-gray-400 hover:text-white disabled:text-gray-700 transition-colors rounded"
              title="Scroll recent generations left"
              aria-label="Scroll recent generations left"
            >
              <ChevronLeft className="w-3 h-3" />
            </button>
            <button
              onClick={() => scrollByPage('right')}
              disabled={!scrollState.canScrollRight}
              className="!p-1 !bg-white/5 disabled:!bg-transparent !border-transparent !min-w-0 !min-h-0 text-gray-400 hover:text-white disabled:text-gray-700 transition-colors rounded"
              title="Scroll recent generations right"
              aria-label="Scroll recent generations right"
            >
              <ChevronRight className="w-3 h-3" />
            </button>
          </>
        )}
        {onHide && (
          <button
            onClick={onHide}
            className="!p-1 !bg-white/5 !border-transparent !min-w-0 !min-h-0 text-gray-400 hover:text-white transition-colors rounded"
            title="Hide recent generations"
            aria-label="Hide recent generations"
          >
            <ChevronDown className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      <div
        className={`bg-[#0a0a0c] border border-white/5 rounded-xl overflow-hidden ${className}`}
      >
        {headerContent}

        <AnimatePresence initial={false}>
          <motion.div
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            {studioGenerations.length === 0 ? (
              <div className="px-3 pb-3 pt-1">
                <div className="flex h-14 items-center justify-center rounded-lg border border-dashed border-white/10 bg-black/25 text-center text-[9px] font-bold uppercase tracking-[0.14em] text-gray-600">
                  No recent generations yet
                </div>
              </div>
            ) : (
              <div className="relative">
                {scrollState.canScrollLeft && (
                  <div className="pointer-events-none absolute left-0 top-0 bottom-2 z-10 w-8 bg-gradient-to-r from-[#0a0a0c] to-transparent" />
                )}
                {scrollState.canScrollRight && (
                  <div className="pointer-events-none absolute right-0 top-0 bottom-2 z-10 w-8 bg-gradient-to-l from-[#0a0a0c] to-transparent" />
                )}
                <div
                  ref={scrollRef}
                  onWheel={handleStripWheel}
                  className="flex gap-2 px-3 pb-2 overflow-x-auto overflow-y-hidden scrollbar-none scroll-smooth overscroll-x-contain"
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                  <AnimatePresence initial={false}>
                    {studioGenerations.map((generation) => {
                      const isActive = generation.id === activeId;
                      const isPitchSheetPreview = isPitchSheetPreviewGeneration(generation);
                      return (
                        <motion.div
                          key={generation.id}
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.8, opacity: 0 }}
                          transition={{ duration: 0.2, ease: 'easeOut' }}
                          className="relative group shrink-0"
                          style={{ width: thumbSizePx, height: thumbSizePx }}
                        >
                          {/* Thumbnail */}
                          <button
                            onClick={() => handleSelect(generation)}
                            className={`${thumbSize} !p-0 !m-0 !min-w-0 !min-h-0 !bg-transparent rounded-lg overflow-hidden border-2 transition-all duration-200 cursor-pointer relative
                              ${
                                isActive
                                  ? 'border-yellow-500/80 shadow-[0_0_12px_rgba(234,179,8,0.2)]'
                                  : 'border-white/10 hover:border-white/25'
                              }`}
                            title={isPitchSheetPreview ? 'Pitch Sheet Preview' : (generation.prompt || 'Recent generation')}
                          >
                            <img
                              src={generation.displayUrl}
                              alt=""
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />

                            {isPitchSheetPreview && (
                              <div className="absolute left-1 top-1 max-w-[calc(100%-0.5rem)] rounded bg-blue-500/80 border border-blue-200/30 px-1 py-0.5 text-[5.5px] font-black uppercase tracking-wide leading-[0.6rem] text-white shadow-[0_0_8px_rgba(59,130,246,0.25)]">
                                <span className="block">Pitch Sheet</span>
                                <span className="block">Preview</span>
                              </div>
                            )}

                            {/* Exported Badge */}
                            {generation.exported && (
                              <div className="absolute bottom-0.5 right-0.5 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center shadow-md">
                                <Check className="w-2.5 h-2.5 text-white stroke-[3]" />
                              </div>
                            )}
                          </button>

                          {/* Hover Actions */}
                          <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                            {/* Export Button */}
                            {!generation.exported && onExportGeneration && (
                              <button
                                onClick={(e) => handleExport(e, generation)}
                                className="!w-5 !h-5 !p-0 !m-0 !min-w-0 !min-h-0 bg-blue-500/90 hover:bg-blue-400 text-white hover:text-cyan-300 rounded-full flex items-center justify-center shadow-lg transition-all !border-none"
                                title="Export to Library"
                              >
                                <FolderOutput className="w-2.5 h-2.5 stroke-[2.5]" />
                              </button>
                            )}
                            {/* Delete Button */}
                            <button
                              onClick={(e) => handleRemove(e, generation.id)}
                              className="!w-5 !h-5 !p-0 !m-0 !min-w-0 !min-h-0 bg-red-500/80 hover:!bg-red-500 !text-white hover:!text-red-200 rounded-full flex items-center justify-center shadow-lg transition-all !border-none"
                              title="Remove from recent"
                            >
                              <X className="w-2.5 h-2.5 stroke-[3]" />
                            </button>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {createPortal(<ConfirmDialog
        isOpen={isClearConfirmOpen}
        onClose={() => setIsClearConfirmOpen(false)}
        onConfirm={handleClearAll}
        title="Clear Recent Generations?"
        message={`Clear ${studioGenerations.length} recent generation${studioGenerations.length === 1 ? '' : 's'} from this studio? This removes only recent thumbnails and recent-generation cache files when safe. Saved library assets will not be deleted. Actor Library, Wardrobe Library, exported files, and saved assets are untouched.`}
        confirmText="Clear All"
        cancelText="Cancel"
        variant="danger"
      />, document.body)}
    </>
  );
}
