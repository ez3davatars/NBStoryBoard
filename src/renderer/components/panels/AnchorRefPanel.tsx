import { useEffect, useRef, useState } from 'react';
import { ImageIcon, X, Upload as UploadIcon, RefreshCcw, Maximize2, Lock, ChevronDown, Sparkles, Wand2 } from 'lucide-react';
import { SidebarPanel } from '../ui/SidebarPanel';
import { Dropdown } from '../ui/Dropdown';
import { getEffectiveResultAnchorForScene } from '../../context/AppContext';
import type { Action, AppState, DirectorMergeStrategy } from '../../context/AppContext';
import { LIGHTING_PRESETS } from '../../../prompts/portraitPrompts';
import { SHOT_PRESETS } from '../../utils/shotsPresets';
import type { ShotPresetDefinition } from '../../utils/shotsPresets';

type ExtractedStyleSummary = {
  styleSummary?: string;
} | null;

type SceneIntentSummary = {
  location?: string;
  action?: string;
  furniture?: string[];
  propContext?: string[];
} | null;

type PromptPresetCategoryId = 'lighting' | 'camera' | 'mood' | 'action' | 'environment';

type PromptPreset = {
  id: string;
  label: string;
  description?: string;
  text: string;
  group: string;
};

const PROMPT_MIN_HEIGHT = 72;
const PROMPT_MAX_HEIGHT = 176;
const PROMPT_HEIGHT_STORAGE_KEY = 'nb_staging_prompt_height';
const PROMPT_STUDIO_LAST_OPEN_KEY = 'nb_staging_prompt_studio_last_open';
const CAMERA_PRESET_BLOCK_REGEX = /(?:\n)?=== CAMERA PRESET \(SHOTS\):[\s\S]*?(?:Priority rule:.*|Camera framing priority only:.*)(?:\n)?/g;

const formatCameraPresetPrompt = (preset: ShotPresetDefinition): string => {
  const cameraNegatives = preset.negatives.filter((neg) => {
    const lower = neg.toLowerCase();
    const actionBlockingConflicts = /(pose|clothing|wardrobe|headwear|gesture|limb|re-stage|actor count|props?|jewelry|staff|weapon|hand|arm|leg)/.test(lower);
    if (actionBlockingConflicts) return false;
    return /(camera|crop|frame|wide|close|profile|front|angle|focus|perspective|lens|orbit|shot|level|view|foreground|background)/.test(lower);
  });

  const negatives = cameraNegatives.length
    ? cameraNegatives.map((neg) => `- ${neg}`).join('\n')
    : '- Do not deviate from this camera framing intent.';

  return [
    `=== CAMERA PRESET (SHOTS): ${preset.label} ===`,
    `CRITICAL CAMERA DIRECTIVE: ${preset.shotInstruction}`,
    `Lens note: ${preset.defaultLensNote}`,
    `Crop rule: ${preset.cropRule}`,
    `Elevation: ${preset.elevation}. Orbit: ${preset.orbit}. Framing: ${preset.framing}. Placement: ${preset.placement}.`,
    'CAMERA NEGATIVES (MUST FOLLOW):',
    negatives,
    'Camera framing priority only: apply this preset without overriding explicit subject actions or blocking in the user prompt.'
  ].join('\n');
};

const LIGHTING_PROMPT_PRESETS: PromptPreset[] = LIGHTING_PRESETS
  .filter((preset) => !preset.disabled && preset.prompt.trim())
  .map((preset) => ({
    id: preset.key,
    label: preset.label,
    description: preset.description,
    text: `Lighting: ${preset.prompt}`,
    group: preset.category || 'Lighting'
  }));

const CAMERA_PROMPT_PRESETS: PromptPreset[] = Object.values(SHOT_PRESETS).map((preset) => ({
  id: preset.id,
  label: preset.label,
  description: preset.description,
  text: formatCameraPresetPrompt(preset),
  group:
    preset.targetMode === 'scene'
      ? 'Scene Coverage'
      : preset.targetMode === 'pair'
        ? 'Two-Subject Coverage'
        : 'Single-Subject Coverage'
}));

const MOOD_PROMPT_PRESETS: PromptPreset[] = [
  { id: 'mood-tense', label: 'Tense Anticipation', description: 'Low comfort, held breath energy.', text: 'Mood: tense anticipation with controlled stillness and emotional pressure.', group: 'Dramatic' },
  { id: 'mood-triumphant', label: 'Triumphant', description: 'Momentum and emotional lift.', text: 'Mood: triumphant, victorious emotional tone with uplifting momentum.', group: 'Dramatic' },
  { id: 'mood-melancholic', label: 'Melancholic', description: 'Reflective and subdued.', text: 'Mood: melancholic and introspective, with softened emotional intensity.', group: 'Dramatic' },
  { id: 'mood-mysterious', label: 'Mysterious', description: 'Uncertainty and intrigue.', text: 'Mood: mysterious, ambiguous, and atmospheric with subtle unease.', group: 'Atmospheric' },
  { id: 'mood-ominous', label: 'Ominous', description: 'Foreboding and danger.', text: 'Mood: ominous and foreboding, as if danger is imminent.', group: 'Atmospheric' },
  { id: 'mood-dreamlike', label: 'Dreamlike', description: 'Surreal and poetic.', text: 'Mood: dreamlike and surreal with poetic visual softness.', group: 'Atmospheric' },
  { id: 'mood-grounded', label: 'Grounded Realism', description: 'Believable and natural.', text: 'Mood: grounded realism, believable behavior and restrained drama.', group: 'Naturalistic' },
  { id: 'mood-intimate', label: 'Intimate', description: 'Close emotional connection.', text: 'Mood: intimate and personal, emphasizing emotional closeness.', group: 'Naturalistic' }
];

const ACTION_PROMPT_PRESETS: PromptPreset[] = [
  { id: 'action-hero-enter', label: 'Hero Entrance', description: 'Strong reveal moment.', text: 'Action: the main subject enters frame with clear, deliberate purpose and confident body language.', group: 'Character Beats' },
  { id: 'action-confrontation', label: 'Confrontation', description: 'Conflict-driven blocking.', text: 'Action: subjects are in active confrontation, eye-lines locked, posture tense, conflict escalating.', group: 'Character Beats' },
  { id: 'action-conversation', label: 'Dialogue Exchange', description: 'Conversational beat.', text: 'Action: a natural dialogue exchange with subtle gestures, responsive eye contact, and conversational rhythm.', group: 'Character Beats' },
  { id: 'action-investigation', label: 'Investigation', description: 'Searching and discovery.', text: 'Action: subject carefully investigates the environment, scanning details and reacting to discoveries.', group: 'Task-Driven' },
  { id: 'action-movement', label: 'Directional Movement', description: 'Travel through space.', text: 'Action: subject moves with purpose across the environment, creating directional flow and spatial progression.', group: 'Task-Driven' },
  { id: 'action-pause', label: 'Quiet Pause', description: 'Stillness with intent.', text: 'Action: subject pauses in stillness for a reflective beat, letting emotion carry the moment.', group: 'Pacing' },
  { id: 'action-chaos', label: 'Chaotic Motion', description: 'Urgency and instability.', text: 'Action: dynamic and chaotic motion, reactive body language, urgency in movement.', group: 'Pacing' }
];

const ENVIRONMENT_PROMPT_PRESETS: PromptPreset[] = [
  { id: 'env-layered-depth', label: 'Layered Depth', description: 'Foreground, midground, background.', text: 'Environment details: strong depth layering with distinct foreground, midground, and background storytelling elements.', group: 'Composition' },
  { id: 'env-practicals', label: 'Practical Light Sources', description: 'Motivated lighting anchors.', text: 'Environment details: practical light sources visible in scene (lamps, sconces, signage) to motivate lighting direction.', group: 'Composition' },
  { id: 'env-texture', label: 'Texture Rich Surfaces', description: 'Material storytelling.', text: 'Environment details: texture-rich surfaces (stone, wood, fabric, metal) with believable wear and tactile detail.', group: 'Material' },
  { id: 'env-weathered', label: 'Weathered Age', description: 'Lived-in imperfection.', text: 'Environment details: weathered surfaces, subtle damage, patina, dust, and lived-in imperfections.', group: 'Material' },
  { id: 'env-atmosphere', label: 'Atmospheric Particles', description: 'Haze/fog/light shafts.', text: 'Environment details: atmospheric particles and volumetric haze that make light direction visible.', group: 'Atmosphere' },
  { id: 'env-weather', label: 'Weather Impact', description: 'Rain, mist, wind evidence.', text: 'Environment details: weather influence visible in surfaces and air (mist, moisture, wind movement cues).', group: 'Atmosphere' },
  { id: 'env-story-props', label: 'Story Props', description: 'Objects with narrative clues.', text: 'Environment details: intentional props that imply recent activity and narrative context.', group: 'Story' },
  { id: 'env-period-cues', label: 'Period Cues', description: 'Specific era/world signals.', text: 'Environment details: architecture, props, and design cues clearly signal the intended era/world.', group: 'Story' }
];

const PROMPT_PRESET_CATEGORY_ORDER: PromptPresetCategoryId[] = ['lighting', 'camera', 'mood', 'action', 'environment'];

const PROMPT_PRESET_CATEGORIES: Record<PromptPresetCategoryId, { label: string; helper: string; presets: PromptPreset[] }> = {
  lighting: {
    label: 'Add Lighting',
    helper: 'Use proven studio/cinematic lighting recipes from portrait presets.',
    presets: LIGHTING_PROMPT_PRESETS
  },
  camera: {
    label: 'Add Camera Angle',
    helper: 'Use shot-based framing presets from the shots system.',
    presets: CAMERA_PROMPT_PRESETS
  },
  mood: {
    label: 'Add Mood',
    helper: 'Set emotional tone and atmosphere.',
    presets: MOOD_PROMPT_PRESETS
  },
  action: {
    label: 'Add Action',
    helper: 'Add clear blocking and subject intent.',
    presets: ACTION_PROMPT_PRESETS
  },
  environment: {
    label: 'Add Environment Detail',
    helper: 'Boost scene richness with grounded world details.',
    presets: ENVIRONMENT_PROMPT_PRESETS
  }
};

interface AnchorRefPanelProps {
 state: AppState;
 dispatch: React.Dispatch<Action>;
 bgPrompt: string;
 setBgPrompt: React.Dispatch<React.SetStateAction<string>>;
 generateBg: () => void;
 anchorFileInputRef: React.RefObject<HTMLInputElement | null>;
 fileToDataUrl: (file: File) => Promise<string>;
 setDirector: (updates: Partial<AppState['director']>) => void;
 collapsed: boolean;
 onToggle: (id: string) => void;
 onDragStart: (id: string) => void;
 onDrop: (targetId: string) => void;
 
 // Style Transfer Props
 selectedTokenId: string | null;
 isAnalyzingStyle: boolean;
 extractedStyle: ExtractedStyleSummary;
 handleAutoStyleEnvironment: () => void;
 sceneIntent?: SceneIntentSummary;
 previousBackgroundUrl?: string | null;
 onRestoreBackground?: () => void;
 style?: React.CSSProperties;
}

export const AnchorRefPanel = ({
 state,
 dispatch,
 bgPrompt,
 setBgPrompt,
 generateBg,
 anchorFileInputRef,
 fileToDataUrl,
 setDirector,
 collapsed,
 onToggle,
 onDragStart,
 onDrop,
 selectedTokenId,
 isAnalyzingStyle,
 extractedStyle,
 handleAutoStyleEnvironment,
 sceneIntent,
 previousBackgroundUrl,
 onRestoreBackground,
 style
}: AnchorRefPanelProps) => {
  const activeShotId = state.activeShotId || 'default';
  const currentAnchor = getEffectiveResultAnchorForScene(state, activeShotId);
  const isCurrentSource = currentAnchor?.kind === 'uploaded_result' && currentAnchor?.imageUrl === state.backgroundUrl;
  const [isPromptStudioOpen, setIsPromptStudioOpen] = useState(false);
  const [activePresetCategory, setActivePresetCategory] = useState<PromptPresetCategoryId | null>(null);
  const promptTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const promptStudioTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const promptStudioPanelRef = useRef<HTMLDivElement | null>(null);
  const [inlinePromptHeight, setInlinePromptHeight] = useState<number>(() => {
    if (typeof window === 'undefined') return PROMPT_MIN_HEIGHT;
    const storedHeight = Number(window.localStorage.getItem(PROMPT_HEIGHT_STORAGE_KEY));
    if (!Number.isFinite(storedHeight)) return PROMPT_MIN_HEIGHT;
    return Math.min(PROMPT_MAX_HEIGHT, Math.max(PROMPT_MIN_HEIGHT, storedHeight));
  });

  const clampPromptHeight = (height: number) => Math.min(PROMPT_MAX_HEIGHT, Math.max(PROMPT_MIN_HEIGHT, height));
  const canGenerate = !state.isProcessing && !!bgPrompt.trim();

  const triggerGenerate = () => {
    if (!canGenerate) return;
    generateBg();
  };

  const handlePromptKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      triggerGenerate();
    }
  };

  const handleInlineResizeCommit = () => {
    const textarea = promptTextareaRef.current;
    if (!textarea) return;
    setInlinePromptHeight(clampPromptHeight(textarea.offsetHeight));
  };

  const appendPromptPreset = (preset: PromptPreset) => {
    setBgPrompt((prev) => {
      const withoutCameraPresetBlock =
        activePresetCategory === 'camera'
          ? prev.replace(CAMERA_PRESET_BLOCK_REGEX, '\n').replace(/\n{3,}/g, '\n\n').trim()
          : prev;

      const nextBase = withoutCameraPresetBlock.trimEnd();
      if (!nextBase) return preset.text;
      return `${nextBase}\n${preset.text}`;
    });
    if (activePresetCategory === 'camera' && state.director.sceneLock) {
      setDirector({ sceneLock: false });
      dispatch({
        type: 'ADD_LOG',
        payload: { message: 'Scene Lock was disabled so the selected camera preset can be honored.', type: 'info' }
      });
    }
    setActivePresetCategory(null);
    promptStudioTextareaRef.current?.focus();
  };

  const groupPromptPresets = (presets: PromptPreset[]) => {
    const grouped = new Map<string, PromptPreset[]>();
    for (const preset of presets) {
      const existing = grouped.get(preset.group);
      if (existing) {
        existing.push(preset);
      } else {
        grouped.set(preset.group, [preset]);
      }
    }
    return Array.from(grouped.entries());
  };

  const activePresetConfig = activePresetCategory ? PROMPT_PRESET_CATEGORIES[activePresetCategory] : null;
  const styleAnalyzeEnabled = !isAnalyzingStyle && !!selectedTokenId && !!state.tokens.find((token) => token.id === selectedTokenId);

  const handlePromptStudioPanelKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;
    const panel = promptStudioPanelRef.current;
    if (!panel) return;

    const focusableElements = panel.querySelectorAll<HTMLElement>(
      'button, textarea, input, select, a[href], [tabindex]:not([tabindex="-1"])'
    );

    if (!focusableElements.length) return;

    const first = focusableElements[0];
    const last = focusableElements[focusableElements.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
      return;
    }

    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  useEffect(() => {
    const textarea = promptTextareaRef.current;
    if (!textarea) return;

    textarea.style.height = 'auto';
    const measuredHeight = clampPromptHeight(textarea.scrollHeight);
    const nextHeight = Math.max(measuredHeight, inlinePromptHeight);
    textarea.style.height = `${nextHeight}px`;

    if (nextHeight !== inlinePromptHeight) {
      setInlinePromptHeight(nextHeight);
    }
  }, [bgPrompt, inlinePromptHeight]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(PROMPT_HEIGHT_STORAGE_KEY, String(inlinePromptHeight));
  }, [inlinePromptHeight]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(PROMPT_STUDIO_LAST_OPEN_KEY, isPromptStudioOpen ? '1' : '0');

    if (!isPromptStudioOpen) return;

    const focusTimer = window.setTimeout(() => {
      promptStudioTextareaRef.current?.focus();
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
    };
  }, [isPromptStudioOpen]);

  useEffect(() => {
    if (!isPromptStudioOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      if (activePresetCategory) {
        setActivePresetCategory(null);
        return;
      }
      setIsPromptStudioOpen(false);
    };

    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [activePresetCategory, isPromptStudioOpen]);

  useEffect(() => {
    if (!isPromptStudioOpen) {
      setActivePresetCategory(null);
    }
  }, [isPromptStudioOpen]);

  const handlePromoteToResult = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!state.backgroundUrl) return;
    dispatch({
      type: 'SET_SCENE_RESULT_ANCHOR',
      payload: {
        sceneId: activeShotId,
        anchor: { 
          kind: 'uploaded_result', 
          imageUrl: state.backgroundUrl, 
          sourceImageId: 'background',
          visibleActorCount: state.tokens.filter((token) => token.elementType === 'actor' || !token.elementType).length
        }
      }
    });
    dispatch({ type: 'ADD_LOG', payload: { message: "Uploaded image set as SHOTS source.", type: 'success' } });
  };

 return (
 <>
 <SidebarPanel
 key="anchor"
 id="anchor"
 title="Scene Generator"
 icon={ImageIcon}
 headerColor="text-purple-500"
 collapsed={collapsed}
 onToggle={onToggle}
 onDragStart={onDragStart}
 onDrop={onDrop}
 style={style}
 >
 <div className="space-y-3">
 <div className="aspect-video bg-black/40 rounded border border-[#27272a] overflow-hidden relative group cursor-pointer"
 onClick={() => anchorFileInputRef.current?.click()}>
 {state.backgroundUrl ? (
 <>
 <img src={state.backgroundUrl} className="w-full h-full object-contain transition-all duration-500" />
 <div className="absolute top-2 right-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
 <button
 onClick={(e) => {
 e.stopPropagation();
 dispatch({ type: 'SET_BG', payload: null });
 }}
 className="p-1.5 bg-black/60 text-white rounded hover:bg-red-500/80 transition-colors"
 title="Clear Reference"
 >
 <X className="w-3 h-3" />
 </button>
 </div>
 </>
 ) : (
 <div className="w-full h-full flex flex-col items-center justify-center text-gray-700">
 <UploadIcon className="w-6 h-6 mb-2 opacity-20" />
 <span className="text-[9px] font-bold uppercase tracking-widest text-center">Drag / Paste<br />Scene Reference</span>
 </div>
 )}
 <input
 ref={anchorFileInputRef}
 type="file"
 className="hidden"
 accept="image/*"
 onChange={async (e) => {
 const inputEl = anchorFileInputRef.current;
 const file = e.target.files?.[0];
 if (file) {
 const url = await fileToDataUrl(file);
 dispatch({ type: 'SET_BG', payload: url });
 }
 if (inputEl) inputEl.value = '';
 }}
 />
 </div>

  {state.backgroundUrl && (
      <div className="flex items-center justify-between">
          {isCurrentSource ? (
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-orange-400 uppercase tracking-widest bg-orange-500/10 px-2 py-1.5 rounded border border-orange-500/30 w-full justify-center">
                  <ImageIcon className="w-3.5 h-3.5" />
                  Current SHOTS Source
              </div>
          ) : (
              <button
                  onClick={handlePromoteToResult}
                  className="flex items-center gap-1.5 w-full justify-center text-[10px] font-bold text-gray-300 hover:text-white uppercase tracking-widest bg-gray-800 hover:bg-gray-700 px-2 py-1.5 rounded border border-[#27272a] hover:border-gray-500 transition-colors"
                  title="Use this uploaded image as the direct source for SHOTS coverage"
              >
                  <ImageIcon className="w-3.5 h-3.5" />
                  Use as Result
              </button>
          )}
      </div>
  )}

 {/* Anchor Tools */}
            <div className="space-y-3">
                
                <div className="flex flex-col gap-1">
                    <div className="flex gap-2 items-start">
                        <textarea
                            ref={promptTextareaRef}
                            rows={2}
                            style={{ height: inlinePromptHeight, minHeight: PROMPT_MIN_HEIGHT, maxHeight: PROMPT_MAX_HEIGHT }}
                            className="flex-1 bg-[#18181b] border border-[#27272a] rounded px-2 py-1.5 text-[10px] text-gray-300 leading-relaxed resize-y overflow-y-auto focus:border-blue-500 outline-none"
                            placeholder="Describe the scene, mood, lighting, camera angle, and key actions..."
                            value={bgPrompt}
                            onChange={(e) => setBgPrompt(e.target.value)}
                            onKeyDown={handlePromptKeyDown}
                            onMouseUp={handleInlineResizeCommit}
                            onTouchEnd={handleInlineResizeCommit}
                            onBlur={handleInlineResizeCommit}
                        />
                        <div className="flex flex-col gap-2">
                            <button
                                onClick={() => setIsPromptStudioOpen(true)}
                                className="bg-[#18181b] border border-[#27272a] hover:border-blue-500/60 text-gray-300 hover:text-white p-2 rounded flex items-center justify-center transition-colors min-h-9 min-w-9"
                                title="Open Prompt Studio"
                                aria-label="Open Prompt Studio"
                            >
                                <Maximize2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                                onClick={triggerGenerate}
                                disabled={!canGenerate}
                                className="bg-blue-600 hover:bg-blue-500 text-white p-2 rounded flex items-center justify-center disabled:opacity-50 disabled:bg-gray-800 min-h-9 min-w-9"
                                title="Generate Background"
                                aria-label="Generate Background"
                            >
                                {state.isProcessing ? <RefreshCcw className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                            </button>
                        </div>
                    </div>
                    <p className="text-[8px] text-gray-500 italic px-1">
                        Tip: Specific details improve consistency and cinematic quality. Type prompt text to enable Generate.
                    </p>
                    
                    {/* Style Transfer Button */}
                    <div className="flex flex-col gap-1 mt-1">
                        <button
                            onClick={handleAutoStyleEnvironment}
                            disabled={!styleAnalyzeEnabled}
                            className={`w-full py-1 px-2 rounded text-[10px] uppercase font-bold tracking-wider transition-colors flex items-center justify-center gap-2 relative overflow-hidden ${
                                isAnalyzingStyle
                                    ? 'border border-cyan-300/60 bg-gradient-to-r from-cyan-500/25 via-fuchsia-500/25 to-amber-400/25 text-cyan-100 shadow-[0_0_20px_rgba(56,189,248,0.25)]'
                                    : 'border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 disabled:opacity-30 disabled:hover:bg-blue-500/10'
                            }`}
                        >
                            {isAnalyzingStyle ? (
                                <>
                                    <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-pulse" />
                                    <span className="relative flex items-center gap-2">
                                        <RefreshCcw className="w-5 h-5 text-fuchsia-200 animate-spin" />
                                        <span className="text-cyan-50">Analyzing character aesthetic...</span>
                                        <span className="flex items-center gap-1 ml-1">
                                            <span className="w-1 h-1 rounded-full bg-cyan-200 animate-ping" />
                                            <span className="w-1 h-1 rounded-full bg-fuchsia-200 animate-ping [animation-delay:120ms]" />
                                            <span className="w-1 h-1 rounded-full bg-amber-200 animate-ping [animation-delay:240ms]" />
                                        </span>
                                    </span>
                                </>
                            ) : (
                                <>
                                    <Sparkles className="w-3 h-3" />
                                    Auto-Style Environment
                                </>
                            )}
                        </button>
                        {extractedStyle && !isAnalyzingStyle && (
                            <div className="text-[9px] text-blue-300/70 italic px-1 leading-tight border-l border-blue-500/30 ml-1 pl-2">
                                Style locked: {extractedStyle.styleSummary}
                            </div>
                        )}
                        {sceneIntent && !isAnalyzingStyle && (
                            <div className="text-[9px] text-emerald-400/80 italic px-1 leading-tight border-l border-emerald-500/30 ml-1 pl-2 flex justify-between items-start mt-1">
                                <span>Scene Intent: {
                                    [sceneIntent.location, sceneIntent.action, ...(sceneIntent.furniture || []), ...(sceneIntent.propContext || [])]
                                        .filter(Boolean)
                                        .join(', ') || 'No core elements detected'
                                }</span>
                            </div>
                        )}
                        {previousBackgroundUrl && onRestoreBackground && (
                            <button
                                onClick={onRestoreBackground}
                                className="mt-1 text-[8px] uppercase tracking-wider text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded px-1.5 py-0.5 self-start ml-1 transition-colors"
                            >
                                Revert Background
                            </button>
                        )}
                        {!extractedStyle && !isAnalyzingStyle && (
                            <p className="text-[8px] text-gray-500 italic px-1">Select an actor on stage to extract their style.</p>
                        )}
                    </div>

                </div>

                <div className="mt-4 flex gap-2 items-end">
 <div className="flex-1 flex flex-col gap-1">
 <label className="text-[10px] uppercase font-bold text-gray-500">Merge Strategy</label>
 <Dropdown
 value={state.director.mergeStrategy}
 options={['Character Identity', 'Style Transfer', 'Composition Reference', 'Photo Merge'].map(v => ({ type: "option", label: v, value: v }))}
 onChange={(v) => setDirector({ mergeStrategy: v as DirectorMergeStrategy })}
 />
 </div>
 <button
 onClick={() => setDirector({ sceneLock: !state.director.sceneLock })}
 className={`h-[38px] min-w-[50px] rounded flex flex-col items-center justify-center border transition-all ${state.director.sceneLock ? 'bg-purple-500/20 border-purple-500 text-purple-400 -[0_0_15px_rgba(168,85,247,0.15)]' : 'bg-[#18181b] border-[#27272a] text-gray-600 hover:text-gray-400 hover:border-gray-700'}`}
 title={state.director.sceneLock ? "Unlock Anchor Scene" : "Lock Anchor Scene"}
 >
 <Lock className="w-3.5 h-3.5 mb-0.5" />
 <span className="text-[8px] font-bold uppercase tracking-wider">
 {state.director.sceneLock ? "Locked" : "Lock"}
 </span>
 </button>
 </div>
 </div>

 {/* Replacement Logic */}
 <div className="pt-3 border-t border-[#27272a] space-y-2">
 <div className="flex items-center justify-between">
 <label className="text-[10px] uppercase font-bold text-gray-500 flex items-center gap-2 cursor-pointer select-none">
 <input
 type="checkbox"
 checked={state.director.replaceAnchorSubjects ?? false}
 onChange={(e) => setDirector({ replaceAnchorSubjects: e.target.checked })}
 className="w-3 h-3 accent-yellow-500 bg-black"
 />
 Replace Anchor Subjects
 </label>
 {state.director.replaceAnchorSubjects && (
 <button
 onClick={() => setDirector({ globalReplaceTarget: '' })}
 className="px-2 py-0.5 bg-gray-800 hover:bg-gray-700 rounded text-[9px] text-gray-400 uppercase font-bold"
 >
 Wipe
 </button>
 )}
 </div>
 {state.director.replaceAnchorSubjects && (
 <div className="animate-in slide-in-from-top-2 duration-200">
 <input
 type="text"
 className="w-full bg-[#18181b] border border-[#27272a] text-xs text-yellow-500 p-2 rounded focus:border-yellow-500 outline-none placeholder:text-gray-700"
 placeholder="e.g. 'the actor in the center'"
 value={state.director.globalReplaceTarget || ''}
 onChange={(e) => setDirector({ globalReplaceTarget: e.target.value })}
 />
 </div>
 )}
 </div>
 </div>
 </SidebarPanel>
 {isPromptStudioOpen && (
 <div
 className="fixed inset-0 z-[160] bg-black/85 backdrop-blur-sm p-3 sm:p-6"
 onClick={() => setIsPromptStudioOpen(false)}
 >
 <div
 ref={promptStudioPanelRef}
 className="mx-auto h-full w-full max-w-5xl bg-[#09090b] border border-[#27272a] rounded-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200"
 role="dialog"
 aria-modal="true"
 aria-label="Prompt Studio"
 tabIndex={-1}
 onClick={(e) => e.stopPropagation()}
 onKeyDown={handlePromptStudioPanelKeyDown}
 >
 <div className="px-4 sm:px-6 py-4 border-b border-[#27272a] bg-black/30 flex items-start justify-between gap-3">
 <div>
 <h3 className="text-sm font-bold text-white uppercase tracking-widest">Prompt Studio</h3>
 <p className="text-[10px] text-gray-400 mt-1">
 Write detailed scene direction for better composition and lighting results.
 </p>
 </div>
 <button
 onClick={() => setIsPromptStudioOpen(false)}
 className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded transition-colors"
 aria-label="Close Prompt Studio"
 title="Close"
 >
 <X className="w-4 h-4" />
 </button>
 </div>

 <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
 <div className="space-y-3">
 <div className="flex flex-wrap gap-2">
 {PROMPT_PRESET_CATEGORY_ORDER.map((categoryId) => {
 const category = PROMPT_PRESET_CATEGORIES[categoryId];
 const isActive = activePresetCategory === categoryId;
 return (
 <button
 key={categoryId}
 onClick={() => setActivePresetCategory(isActive ? null : categoryId)}
 className={`text-[10px] uppercase tracking-wider px-2.5 py-1.5 rounded border transition-colors flex items-center gap-1.5 ${isActive ? 'border-blue-500 bg-blue-500/20 text-white' : 'border-blue-500/30 text-blue-300 hover:text-white hover:border-blue-500 hover:bg-blue-500/20'}`}
 >
 <span>{category.label}</span>
 <ChevronDown className={`w-3 h-3 transition-transform ${isActive ? 'rotate-180' : ''}`} />
 </button>
 );
 })}
 </div>

 {activePresetConfig && (
 <div className="rounded-xl border border-[#27272a] bg-black/20 overflow-hidden">
 <div className="px-3 py-2 border-b border-[#27272a]">
 <p className="text-[10px] uppercase tracking-widest font-bold text-blue-300">{activePresetConfig.label} Presets</p>
 <p className="text-[10px] text-gray-500 mt-0.5">{activePresetConfig.helper}</p>
 </div>
 <div className="max-h-52 overflow-y-auto px-3 py-2 space-y-3">
 {groupPromptPresets(activePresetConfig.presets).map(([groupLabel, presets]) => (
 <div key={groupLabel} className="space-y-1.5">
 <p className="text-[9px] uppercase tracking-widest text-gray-500">{groupLabel}</p>
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
 {presets.map((preset) => (
 <button
 key={preset.id}
 onClick={() => appendPromptPreset(preset)}
 className="text-left rounded border border-[#2d2d33] hover:border-blue-500/60 bg-[#111116] hover:bg-[#151522] px-2.5 py-2 transition-colors"
 title={preset.text}
 >
 <p className="text-[10px] text-gray-100 font-semibold">{preset.label}</p>
 {preset.description && <p className="text-[9px] text-gray-500 mt-0.5">{preset.description}</p>}
 </button>
 ))}
 </div>
 </div>
 ))}
 </div>
 </div>
 )}
 </div>

 <textarea
ref={promptStudioTextareaRef}
 value={bgPrompt}
 onChange={(e) => setBgPrompt(e.target.value)}
 onKeyDown={handlePromptKeyDown}
 className="w-full min-h-[60vh] bg-[#18181b] border border-[#27272a] rounded-lg p-4 text-sm leading-relaxed text-gray-200 focus:border-blue-500 outline-none resize-y"
 placeholder="Describe the scene, mood, lighting, camera angle, and key actions..."
 />

 <p className="text-[10px] text-gray-500">
 Press Ctrl/Cmd+Enter to generate. Use Enter for line breaks.
 </p>
 </div>

 <div className="px-4 sm:px-6 py-4 border-t border-[#27272a] bg-black/30 flex flex-wrap justify-end gap-2">
 <button
 onClick={() => setIsPromptStudioOpen(false)}
 className="px-3 py-2 rounded text-[10px] uppercase tracking-wider text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
 >
 Cancel
 </button>
 <button
 onClick={() => setIsPromptStudioOpen(false)}
 className="px-3 py-2 rounded text-[10px] uppercase tracking-wider border border-[#3f3f46] text-gray-200 hover:border-white/40 hover:text-white transition-colors"
 >
 Apply to Scene Generator
 </button>
 <button
 onClick={() => {
 setIsPromptStudioOpen(false);
 triggerGenerate();
 }}
 disabled={!canGenerate}
 className="px-3 py-2 rounded text-[10px] uppercase tracking-wider bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:bg-gray-800 transition-colors"
 >
 Apply and Generate
 </button>
 </div>
 </div>
 </div>
 )}
 </>
 );
};




