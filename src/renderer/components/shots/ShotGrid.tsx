import React from 'react';
import type { ShotVariant } from '../../types/shots';
import { ShotTile } from './ShotTile';

interface ShotGridProps {
  variants: ShotVariant[];
  onToggleSelected: (variantId: string, selected: boolean) => void;
  onSave?: (variantId: string) => void;
  onRegenerateOne?: (variantId: string, instruction?: string) => void;
  onInspect?: (variantId: string) => void;
}

export const ShotGrid: React.FC<ShotGridProps> = ({ variants, onToggleSelected, onSave, onRegenerateOne, onInspect }) => {
  if (!variants || variants.length === 0) {
    return (
      <div className="flex-grow flex items-center justify-center text-gray-500">
        <p>No shots available. Configure and generate above.</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-y-auto">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 p-4 w-full content-start auto-rows-max items-stretch">
        {variants.map((v) => (
          <ShotTile 
            key={v.id}
            variant={v}
            onToggleSelected={onToggleSelected}
            onSave={onSave}
            onRegenerateOne={onRegenerateOne}
            onInspect={onInspect}
          />
        ))}
      </div>
    </div>
  );
};
