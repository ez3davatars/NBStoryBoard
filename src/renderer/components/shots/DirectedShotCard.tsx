import React from 'react';
import type { DirectedShotSlot, ShotTargetType, CameraFlavor, ShotPresetId } from '../../types/shots';
import type { ShotsActorOption } from '../../context/AppContext';
import { SHOT_PRESETS } from '../../utils/shotsPresets';

export type DirectedShotCardProps = {
  slot: DirectedShotSlot;
  actors: ShotsActorOption[];
  onChange: (slot: DirectedShotSlot) => void;
  disabled?: boolean;
};

export const DirectedShotCard: React.FC<DirectedShotCardProps> = ({ slot, actors, onChange, disabled }) => {
  const update = (updates: Partial<DirectedShotSlot>) => {
    onChange({ ...slot, ...updates });
  };

  const presetEntries = Object.entries(SHOT_PRESETS) as [ShotPresetId, any][];
  const flavors: CameraFlavor[] = ['neutral', 'dramatic', 'procedural', 'commercial_clean', 'intimate', 'kinetic'];

  return (
    <div className="flex flex-col gap-2 p-3 bg-gray-900 border border-gray-800 rounded text-xs text-gray-200">
      <div className="flex items-center justify-between font-medium text-gray-400">
        <span>Shot {slot.index + 1}</span>
        {slot.targetType === 'pair' && !slot.secondaryActorId && (
           <span className="text-red-400">Needs Secondary Actor</span>
        )}
      </div>
      
      {/* Top Row: Type & Target */}
      <div className="flex gap-2">
        <select
          value={slot.shotType}
          onChange={e => update({ shotType: e.target.value as ShotPresetId })}
          disabled={disabled}
          className="bg-gray-800 border-gray-700 rounded px-2 py-1 outline-none flex-1"
        >
          {presetEntries.map(([id, preset]) => (
            <option key={id} value={id}>{preset.label}</option>
          ))}
        </select>
        
        <select
          value={slot.targetType}
          onChange={e => {
            const tType = e.target.value as ShotTargetType;
            if (tType === 'scene') update({ targetType: tType, targetActorId: undefined, secondaryActorId: undefined });
            else update({ targetType: tType });
          }}
          disabled={disabled}
          className="bg-gray-800 border-gray-700 rounded px-2 py-1 outline-none w-24"
        >
          <option value="actor">Actor</option>
          <option value="scene">Scene</option>
          <option value="pair">Pair</option>
          <option value="object">Object</option>
        </select>
      </div>

      {/* Target Ref Selectors */}
      {slot.targetType !== 'scene' && slot.targetType !== 'object' && (
        <div className="flex gap-2">
          {actors.length === 0 ? (
            <div className="bg-gray-800 border-gray-700 rounded px-2 py-1 flex-1 text-gray-500 italic">No named actors available</div>
          ) : (
            <>
              <select
            value={slot.targetActorId || ''}
            onChange={e => update({ targetActorId: e.target.value })}
            disabled={disabled}
            className="bg-gray-800 border-gray-700 rounded px-2 py-1 outline-none flex-1 truncate"
          >
            <option value="">Select Primary Actor...</option>
            {actors.map(a => (
              <option key={a.actorId} value={a.actorId}>{a.actorLabel}</option>
            ))}
          </select>

          {slot.targetType === 'pair' && (
            <select
              value={slot.secondaryActorId || ''}
              onChange={e => update({ secondaryActorId: e.target.value })}
              disabled={disabled}
              className="bg-gray-800 border-gray-700 rounded px-2 py-1 outline-none flex-1 truncate"
            >
              <option value="">Select Secondary Actor...</option>
              {actors.map(a => (
                <option key={a.actorId} value={a.actorId}>{a.actorLabel}</option>
              ))}
            </select>
          )}
            </>
          )}
        </div>
      )}

      {/* Action Text */}
      <input
        type="text"
        placeholder="Action / Intent (e.g., pointing angrily)"
        value={slot.actionText || ''}
        onChange={e => update({ actionText: e.target.value })}
        disabled={disabled}
        className="bg-gray-800 border border-gray-700 rounded px-2 py-1 w-full outline-none"
      />

      {/* Bottom Row: Flavor & Notes */}
      <div className="flex gap-2">
        <select
          value={slot.cameraFlavor || 'neutral'}
          onChange={e => update({ cameraFlavor: e.target.value as CameraFlavor })}
          disabled={disabled}
          className="bg-gray-800 border-gray-700 rounded px-2 py-1 outline-none w-1/3 capitalize"
        >
          {flavors.map(f => (
            <option key={f} value={f}>{f.replace('_', ' ')}</option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Optional notes..."
          value={slot.shotNotes || ''}
          onChange={e => update({ shotNotes: e.target.value })}
          disabled={disabled}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 flex-1 outline-none"
        />
      </div>
    </div>
  );
};
