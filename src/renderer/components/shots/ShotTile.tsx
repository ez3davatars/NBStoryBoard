import React, { useState, useEffect } from 'react';
// Lucide removed from tile action buttons because icon styling is being overridden in this context
import type { ShotVariant } from '../../types/shots';
import { resolveDisplayUrl } from '../../utils/assetUrlResolver';

interface ShotTileProps {
  variant: ShotVariant;
  onToggleSelected: (variantId: string, selected: boolean) => void;
  onSave?: (variantId: string) => void;
  onRegenerateOne?: (variantId: string) => void;
  onInspect?: (variantId: string) => void;
}

export const ShotTile: React.FC<ShotTileProps> = ({ variant, onToggleSelected, onSave, onRegenerateOne, onInspect }) => {
  const isGenerating = variant.status === 'queued' || variant.status === 'generating';
  const isRerendering = variant.status === 'rerendering';
  const hasImage = !!variant.previewUrl || !!variant.finalUrl;
  const rawUrl =
    variant.finalUrl ||
    variant.previewUrl ||
    variant.sourceFinalUrl ||
    variant.sourcePreviewUrl ||
    null;

  const [displayUrl, setDisplayUrl] = useState<{ source: string; url: string } | null>(null);
  const [localExpired, setLocalExpired] = useState(false);
  const effectiveStatus = localExpired ? 'expired' : variant.status;

  useEffect(() => {
    if (!rawUrl) return;

    let isMounted = true;
    const sourceUrl = rawUrl;

    resolveDisplayUrl({
      localPath: variant.localFinalPath || variant.localPreviewPath,
      finalUrl: variant.finalUrl,
      previewUrl: variant.previewUrl,
      sourceFinalUrl: variant.sourceFinalUrl,
      sourcePreviewUrl: variant.sourcePreviewUrl,
    }).then(resolved => {
      if (isMounted) {
        setDisplayUrl({ source: sourceUrl, url: resolved || sourceUrl });
      }
    }).catch(() => {
      if (isMounted) {
        setDisplayUrl({ source: sourceUrl, url: sourceUrl });
      }
    });

    return () => {
      isMounted = false;
    };
  }, [
    variant.localFinalPath,
    variant.localPreviewPath,
    variant.finalUrl,
    variant.previewUrl,
    variant.sourceFinalUrl,
    variant.sourcePreviewUrl,
    rawUrl
  ]);

  const effectiveUrl = displayUrl?.source === rawUrl ? displayUrl.url : rawUrl;

  return (
    <div 
      className={`
        relative flex flex-col min-w-0 overflow-hidden rounded-xl border bg-[#111111] transition-all duration-200
        ${variant.selected ? 'border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)]' : 'border-[#27272a] hover:border-gray-500'}
        ${isGenerating ? 'opacity-75' : 'opacity-100'}
      `}
    >
      {/* Image / Status Container */}
      <div 
        className={`w-full relative flex items-center justify-center cursor-pointer group overflow-hidden rounded-t-lg shrink-0 transition-all ${effectiveUrl && effectiveStatus !== 'expired' ? '' : 'py-6 bg-[#0a0a0a]'}`}
        style={effectiveUrl && effectiveStatus !== 'expired' ? { aspectRatio: '16/9' } : { minHeight: '60px' }}
        onClick={() => {
          if (effectiveStatus === 'done' || effectiveStatus === 'error') {
            onToggleSelected(variant.id, !variant.selected);
          }
        }}
      >
        {effectiveUrl && effectiveStatus !== 'expired' ? (
          <>
            <img 
              src={effectiveUrl} 
              alt={variant.label}
              className="w-full h-full object-cover"
              onError={(e) => {
                if (effectiveUrl.includes('r2.dev') || effectiveUrl.includes('cloudflare')) {
                  // If the remote blob 404s, explicitly trap it as an expiration rather than just broken text
                  e.currentTarget.style.display = 'none';
                  setLocalExpired(true);
                }
              }}
            />
            {isGenerating && (
              <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center z-10 rounded-t-lg backdrop-blur-[2px]">
                <svg className="animate-spin h-8 w-8 text-white mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span className="text-white text-xs font-bold tracking-widest uppercase shadow-black drop-shadow-md">
                    Generating
                </span>
              </div>
            )}
          </>
        ) : (
          <div className="text-gray-600 text-sm flex flex-col items-center">
            {isGenerating && (
              <svg className="animate-spin h-8 w-8 text-gray-400 mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            )}
            {variant.status === 'error' && <span className="text-red-400 mb-2 text-xl">⚠️</span>}
            {variant.status === 'expired' && <span className="text-orange-400 mb-2 text-xl">⏳</span>}
            <span>{variant.status.toUpperCase()}</span>
          </div>
        )}

        {/* Selection Checkbox Overlay */}
        {(variant.status === 'done' || variant.status === 'error') && (
          <div className="absolute top-2 left-2 flex items-center justify-center z-20">
            <input 
              type="checkbox" 
              checked={variant.selected}
              onChange={(e) => onToggleSelected(variant.id, e.target.checked)}
              className="w-5 h-5 cursor-pointer accent-blue-500"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}



        {/* Action Badge - Regenerate, Inspect, Download */}
        {hasImage && (
          <div className="absolute top-2 right-2 flex gap-1 z-20 bg-black/55 p-1 rounded-lg backdrop-blur-sm">
            {onRegenerateOne && (
              <button
                onClick={(e) => { e.stopPropagation(); onRegenerateOne(variant.id); }}
                className="bg-[#1a1a1c] border border-[#3f3f46] hover:bg-[#27272a] hover:border-gray-400 transition-colors w-8 h-8 flex items-center justify-center rounded shadow-lg group/btn"
                title="Regenerate Shot"
                style={{ color: '#ffffff', WebkitTextFillColor: '#ffffff' }}
              >
                <span
                  className="w-4 h-4 flex items-center justify-center pointer-events-none group-hover/btn:scale-110 transition-transform"
                  style={{ minWidth: 16, minHeight: 16 }}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="block drop-shadow-md"
                    style={{
                      display: 'block',
                      width: '16px',
                      height: '16px',
                      minWidth: '16px',
                      minHeight: '16px',
                      overflow: 'visible',
                      opacity: 1,
                      visibility: 'visible',
                      color: '#ffffff',
                      stroke: '#ffffff',
                      flexShrink: 0
                    }}
                  >
                    <polyline style={{ stroke: '#ffffff' }} points="23 4 23 10 17 10" />
                    <polyline style={{ stroke: '#ffffff' }} points="1 20 1 14 7 14" />
                    <path style={{ stroke: '#ffffff' }} d="M3.51 9a9 9 0 0 1 14.13-3.36L23 10" />
                    <path style={{ stroke: '#ffffff' }} d="M20.49 15a9 9 0 0 1-14.13 3.36L1 14" />
                  </svg>
                </span>
              </button>
            )}

            {onInspect && (
              <button
                onClick={(e) => { e.stopPropagation(); onInspect(variant.id); }}
                className="bg-[#1a1a1c] border border-[#3f3f46] hover:bg-[#27272a] hover:border-gray-400 transition-colors w-8 h-8 flex items-center justify-center rounded shadow-lg group/btn"
                title="Inspect Large"
                style={{ color: '#ffffff', WebkitTextFillColor: '#ffffff' }}
              >
                <span
                  className="w-4 h-4 flex items-center justify-center pointer-events-none group-hover/btn:scale-110 transition-transform"
                  style={{ minWidth: 16, minHeight: 16 }}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="block drop-shadow-md"
                    style={{
                      display: 'block',
                      width: '16px',
                      height: '16px',
                      minWidth: '16px',
                      minHeight: '16px',
                      overflow: 'visible',
                      opacity: 1,
                      visibility: 'visible',
                      color: '#ffffff',
                      stroke: '#ffffff',
                      flexShrink: 0
                    }}
                  >
                    <polyline style={{ stroke: '#ffffff' }} points="15 3 21 3 21 9" />
                    <polyline style={{ stroke: '#ffffff' }} points="9 21 3 21 3 15" />
                    <line style={{ stroke: '#ffffff' }} x1="21" y1="3" x2="14" y2="10" />
                    <line style={{ stroke: '#ffffff' }} x1="3" y1="21" x2="10" y2="14" />
                  </svg>
                </span>
              </button>
            )}

            {onSave && (
              <button
                onClick={(e) => { e.stopPropagation(); onSave(variant.id); }}
                className="bg-[#1a1a1c] border border-[#3f3f46] hover:bg-[#27272a] hover:border-gray-400 transition-colors w-8 h-8 flex items-center justify-center rounded shadow-lg group/btn"
                title={variant.finalUrl ? "Download 4K" : "Download preview"}
                style={{ color: '#ffffff', WebkitTextFillColor: '#ffffff' }}
              >
                <span
                  className="w-4 h-4 flex items-center justify-center pointer-events-none group-hover/btn:scale-110 transition-transform"
                  style={{ minWidth: 16, minHeight: 16 }}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="block drop-shadow-md"
                    style={{
                      display: 'block',
                      width: '16px',
                      height: '16px',
                      minWidth: '16px',
                      minHeight: '16px',
                      overflow: 'visible',
                      opacity: 1,
                      visibility: 'visible',
                      color: '#ffffff',
                      stroke: '#ffffff',
                      flexShrink: 0
                    }}
                  >
                    <path style={{ stroke: '#ffffff' }} d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline style={{ stroke: '#ffffff' }} points="7 10 12 15 17 10" />
                    <line style={{ stroke: '#ffffff' }} x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Info Bar */}
      <div className="min-w-0 p-3 flex flex-col flex-grow justify-between bg-[#111111] border-t border-[#27272a]">
        <div className="min-w-0 pr-1">
          <div className="truncate text-gray-200 font-medium text-sm m-0 p-0 leading-tight">{variant.label}</div>
          <div className="text-xs text-gray-500 mt-1 leading-snug line-clamp-2" title={variant.description}>
            {variant.description}
          </div>
        </div>

        {/* Error/Info Footer Actions */}
        {variant.error && variant.status !== 'done' && (
          <div className={`mt-2 text-[10px] line-clamp-2 leading-tight ${variant.status === 'error' || variant.status === 'expired' ? 'text-red-400' : 'text-yellow-500 font-bold'}`} title={variant.error}>
            {variant.status === 'error' ? '⚠️ ' : variant.status === 'expired' ? '⏳ ' : '🔄 '}{variant.error}
          </div>
        )}
      </div>

      {/* Persistent Status Badges (Bottom Right Card Anchor) */}
      <div className="absolute bottom-3 right-3 flex gap-2 z-10 pointer-events-none">
        {variant.finalUrl && (
          <span className="bg-yellow-500 text-black text-[10px] font-bold px-2 py-1 rounded shadow-md border border-yellow-400">
            4K READY
          </span>
        )}
        {isRerendering && (
          <span className="bg-blue-600 text-white text-[10px] font-bold px-2 py-1 rounded shadow-md animate-pulse border border-blue-500">
            RENDERING 4K...
          </span>
        )}
      </div>
    </div>
  );
};
