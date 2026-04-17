import { Clapperboard } from 'lucide-react';
import { SidebarPanel } from '../ui/SidebarPanel';
import { PropertyField } from '../ui/PropertyField';
import { Dropdown } from '../ui/Dropdown';
import type { DropdownOption } from '../ui/Dropdown';
import { DebouncedTextarea } from '../ui/DebouncedTextarea';
import HelpTooltip from '../ui/HelpTooltip';
import type { AppState, DirectorSpatialLayout } from '../../context/AppContext';
import { SHOT_TYPES } from '../veo/cinematographyOptions';
import { LIGHTING_PRESETS } from '../../../prompts/portraitPrompts';

const lightingOptions: DropdownOption[] = [
 { type: 'option', label: 'Default / Auto', value: '' },
 ...LIGHTING_PRESETS.map((p) => p.disabled
 ? { type: 'group' as const, label: p.label }
 : { type: 'option' as const, label: p.label, value: p.key }
 )
];

const cameraOptions: DropdownOption[] = [
 { type: 'option', label: 'Default / Auto', value: '' },
 ...SHOT_TYPES
];

interface SceneDirectorPanelProps {
 state: AppState;
 setDirector: (updates: Partial<AppState['director']>) => void;
 collapsed: boolean;
 onToggle: (id: string) => void;
 onDragStart: (id: string) => void;
 onDrop: (targetId: string) => void;
}

export const SceneDirectorPanel = ({
 state,
 setDirector,
 collapsed,
 onToggle,
 onDragStart,
 onDrop
}: SceneDirectorPanelProps) => {
 return (
 <SidebarPanel
 key="scene_director"
 id="scene_director"
 title="Scene Director"
 icon={Clapperboard}
 headerColor="text-gray-500"
 collapsed={collapsed}
 onToggle={onToggle}
 onDragStart={onDragStart}
 onDrop={onDrop}
 rightElement={state.director.envAuto && <span className="text-[9px] text-yellow-500 font-mono uppercase border border-yellow-500/30 px-1 rounded">Env Auto</span>}
 >
 <div className="space-y-4">
 <HelpTooltip zone="stage" id="stageInstructions">
 <PropertyField
 label="Subject / Action"
 value={state.director.subject}
 onChange={(v: string) => setDirector({ subject: v })}
 placeholder="Describe the main action..."
 type="textarea"
 />
 </HelpTooltip>

 <div>
 <div className="flex items-center justify-between mb-1">
 <label className="text-[10px] uppercase font-bold text-gray-500">Environment</label>
 {state.director.envAuto && (
 <button onClick={() => setDirector({ envAuto: false })} className="text-[9px] text-gray-500 hover:text-gray-300 uppercase underline decoration-dotted">Unlock</button>
 )}
 </div>
 <DebouncedTextarea
 className={`w-full bg-[#18181b] border rounded px-2 py-2 text-xs text-white h-12 resize-none outline-none transition-colors ${state.director.envAuto ? 'border-yellow-500/50 text-gray-400' : 'border-[#27272a] focus:border-yellow-500'}`}
 value={state.director.environment}
 onChange={(val: string) => setDirector({ environment: val, envAuto: false })}
 readOnly={state.director.envAuto}
 />
 </div>

 <div className="grid grid-cols-2 gap-3">
 <div className="flex flex-col gap-1">
 <label className="text-[10px] uppercase font-bold text-gray-500">Lighting</label>
 <Dropdown
 value={state.director.lighting || ''}
 options={lightingOptions}
 onChange={(v) => setDirector({ lighting: v })}
 />
 </div>
 <div className="flex flex-col gap-1">
 <label className="text-[10px] uppercase font-bold text-gray-500">Camera</label>
 <Dropdown
 value={state.director.camera || ''}
 options={cameraOptions}
 onChange={(v) => setDirector({ camera: v })}
 />
 </div>
 </div>

 <div className="grid grid-cols-2 gap-3">
 <div className="flex flex-col gap-1">
 <label className="text-[10px] uppercase font-bold text-gray-500">Layout</label>
 <Dropdown
 value={state.director.spatialLayout}
 options={['', 'horizontal', 'vertical', 'center'].map(v => ({ type: "option", label: v || "Default", value: v }))}
 onChange={(v) => setDirector({ spatialLayout: v as DirectorSpatialLayout })}
 />
 </div>
 </div>
 </div>
 </SidebarPanel>
 );
};



