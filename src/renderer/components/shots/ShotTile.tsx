import React from 'react';
import type { ShotVariant } from '../../types/shots';

interface ShotTileProps {
  variant: ShotVariant;
  onToggleSelected: (variantId: string, selected: boolean) => void;
  onSave?: (variantId: string) => void;
  onRegenerateOne?: (variantId: string) => void;
}

export const ShotTile: React.FC<ShotTileProps> = ({ variant, onToggleSelected, onSave, onRegenerateOne }) => {
  const isGenerating = variant.status === 'queued' || variant.status === 'generating';
  const isRerendering = variant.status === 'rerendering';
  const hasImage = !!variant.previewUrl || !!variant.finalUrl;
  const displayUrl = variant.finalUrl || variant.previewUrl;

  return (
    <div 
      className={`
        relative flex flex-col bg-gray-900 border overflow-hidden transition-all duration-200
        ${variant.selected ? 'border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)]' : 'border-gray-700 hover:border-gray-500'}
        ${isGenerating ? 'opacity-75' : 'opacity-100'}
      `}
      style={{ borderRadius: '8px' }}
    >
      {/* Aspect Ratio Container (16:9) */}
      <div 
        className="w-full relative bg-gray-950 flex items-center justify-center cursor-pointer group"
        style={{ aspectRatio: '16/9' }}
        onClick={() => {
          if (variant.status === 'done' || variant.status === 'error') {
            onToggleSelected(variant.id, !variant.selected);
          }
        }}
      >
        {displayUrl ? (
          <img 
            src={displayUrl} 
            alt={variant.label}
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="text-gray-600 text-sm flex flex-col items-center">
            {isGenerating && (
              <svg className="animate-spin h-8 w-8 text-gray-400 mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            )}
            {variant.status === 'error' && <span className="text-red-400 mb-2 text-xl">⚠️</span>}
            <span>{variant.status.toUpperCase()}</span>
          </div>
        )}

        {/* Selection Checkbox Overlay */}
        {(variant.status === 'done' || variant.status === 'error') && (
          <div className="absolute top-2 left-2 flex items-center justify-center">
            <input 
              type="checkbox" 
              checked={variant.selected}
              onChange={(e) => onToggleSelected(variant.id, e.target.checked)}
              className="w-5 h-5 cursor-pointer accent-blue-500"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}

        {/* Status Badges */}
        <div className="absolute top-2 right-2 flex gap-2">
          {variant.finalUrl && (
            <span className="bg-yellow-500 text-black text-xs font-bold px-2 py-1 rounded shadow-lg">
              4K READY
            </span>
          )}
          {isRerendering && (
            <span className="bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded shadow-lg animate-pulse">
              RENDERING 4K...
            </span>
          )}
        </div>
      </div>

      {/* Info Bar */}
      <div className="p-3 flex flex-col flex-grow justify-between bg-gray-900 border-t border-gray-800">
        <div>
          <h4 className="text-gray-200 font-medium text-sm m-0 p-0 leading-tight">{variant.label}</h4>
          <p className="text-gray-500 text-xs mt-1 leading-snug line-clamp-2" title={variant.description}>
            {variant.description}
          </p>
        </div>

        {/* Footer Actions */}
        <div className="flex justify-between items-center mt-3 h-6">
          {variant.status === 'error' && variant.error && (
            <span className="text-red-400 text-[10px] truncate max-w-[70%]" title={variant.error}>
              {variant.error}
            </span>
          )}
          
          <div className="flex-grow" />

          {hasImage && onSave && (
            <button 
              onClick={(e) => { e.stopPropagation(); onSave(variant.id); }}
              className="text-gray-400 hover:text-white transition-colors"
              title={variant.finalUrl ? "Download 4K" : "Download preview"}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
            </button>
          )}
          
          {variant.status === 'error' && onRegenerateOne && (
            <button 
              onClick={(e) => { e.stopPropagation(); onRegenerateOne(variant.id); }}
              className="text-gray-400 hover:text-white transition-colors ml-2"
              title="Retry Generation"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10"></polyline>
                <polyline points="23 20 23 14 17 14"></polyline>
                <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path>
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
