import React from 'react';
import type { ShotVariant } from '../../types/shots';
import { ShotTile } from './ShotTile';

interface ShotGridProps {
  variants: ShotVariant[];
  onToggleSelected: (variantId: string, selected: boolean) => void;
  onSave?: (variantId: string) => void;
  onRegenerateOne?: (variantId: string) => void;
}

export const ShotGrid: React.FC<ShotGridProps> = ({ variants, onToggleSelected, onSave, onRegenerateOne }) => {
  if (!variants || variants.length === 0) {
    return (
      <div className="flex-grow flex items-center justify-center text-gray-500">
        <p>No shots available. Configure and generate above.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4 w-full h-full overflow-y-auto">
      {variants.map((v) => (
        <ShotTile 
          key={v.id}
          variant={v}
          onToggleSelected={onToggleSelected}
          onSave={onSave}
          onRegenerateOne={onRegenerateOne}
        />
      ))}
    </div>
  );
};
