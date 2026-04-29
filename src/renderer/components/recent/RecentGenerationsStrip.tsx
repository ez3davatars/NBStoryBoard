import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, FolderOutput, Clock, ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { useRecentGenerationsStore } from '../../stores/useRecentGenerationsStore';
import type { RecentGenerationStudio, RecentGeneration } from '../../stores/useRecentGenerationsStore';

// --- PROPS ---

export type RecentGenerationsStripProps = {
  studio: RecentGenerationStudio;
  compact?: boolean;
  collapsible?: boolean;
  showSingle?: boolean;
  className?: string;
  onSelectGeneration?: (generation: RecentGeneration) => void;
  onExportGeneration?: (generation: RecentGeneration) => void;
};

// --- COMPONENT ---

export default function RecentGenerationsStrip({
  studio,
  compact = false,
  collapsible = false,
  showSingle = false,
  className = '',
  onSelectGeneration,
  onExportGeneration,
}: RecentGenerationsStripProps) {
  const {
    recentGenerations,
    activeRecentGenerationIdByStudio,
    setActiveRecentGeneration,
    removeRecentGeneration,
    initStore,
    initialized,
  } = useRecentGenerationsStore();

  // Filter generations for this studio
  const studioGenerations = recentGenerations.filter((g) => g.studio === studio);
  const activeId = activeRecentGenerationIdByStudio[studio] || null;
  const [isCollapsed, setIsCollapsed] = useState(false);
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
    if (!initialized) {
      initStore();
    }
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
  }, [studioGenerations.length, isCollapsed, updateScrollState]);

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

  const thumbSize = compact ? 'w-12 h-12' : 'w-16 h-16';
  const thumbSizePx = compact ? 48 : 64;

  // --- EMPTY STATE ---
  if (studioGenerations.length === 0) {
    return null;
  }
  
  // Only hide on 1 generation IF we haven't crossed the 2+ threshold yet (to respect initial load preference)
  if (!showSingle && !hasTriggered && studioGenerations.length <= 1) {
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
        {!isCollapsed && (
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
        {collapsible && (
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="!p-1 !bg-transparent !border-transparent !min-w-0 !min-h-0 text-gray-500 hover:text-white transition-colors rounded"
          >
            {isCollapsed ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div
      className={`bg-[#0a0a0c] border border-white/5 rounded-xl overflow-hidden ${className}`}
    >
      {headerContent}

      <AnimatePresence initial={false}>
        {!isCollapsed && (
          <motion.div
            initial={collapsible ? { height: 0, opacity: 0 } : false}
            animate={{ height: 'auto', opacity: 1 }}
            exit={collapsible ? { height: 0, opacity: 0 } : undefined}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
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
                          title={generation.prompt || 'Recent generation'}
                        >
                          <img
                            src={generation.displayUrl}
                            alt=""
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />

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

            {/* Removed the bottom Export to Library action bar as requested to reduce vertical height */}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
