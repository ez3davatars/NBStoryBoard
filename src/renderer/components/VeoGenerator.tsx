import React, { useEffect, useMemo, useState } from 'react';
import {
  Clapperboard, Trash2, MonitorPlay, Image as ImageIcon,
  X, Lock, Unlock, Sparkles, RotateCw, Film, Copy, ArrowRight, Download
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { GeminiService } from '../services/GeminiService';
import type { StoryboardGeneration } from '../context/AppContext';

// FEATURE FLAG: Enable Storyboard Expansion Grid (Set to false for basic build)
const ENABLE_STORYBOARD_GRID = false;

const VeoGenerator = () => {
  const { state, dispatch } = useAppContext();
  const [analysisResult, setAnalysisResult] = useState<string>('');
  const [analysisSpec, setAnalysisSpec] = useState<any>(null); // Store the parsed JSON bible
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [strictCharacterAds, setStrictCharacterAds] = useState(true);
  const [continuityLockEnabled, setContinuityLockEnabled] = useState(true);
  const [noExtraObjects, setNoExtraObjects] = useState(true);
  const [noMorph, setNoMorph] = useState(true);
  const [activeSlot, setActiveSlot] = useState<1 | 2>(1);


  // --- Shot Sync (from AppContext Shot List) ---
  const activeShot = useMemo(() => {
    const shots = (state as any).shots as any[] | undefined;
    const activeShotId = (state as any).activeShotId as string | undefined;
    if (!shots || !activeShotId) return null;
    return shots.find((s) => s.id === activeShotId) || null;
  }, [state]);

  const loadFramesFromActiveShot = () => {
    if (!activeShot) return;

    const startUrl = activeShot.startFrameUrl as string | undefined;
    const endUrl = activeShot.endFrameUrl as string | undefined;

    if (startUrl) {
      dispatch({ type: 'SET_STORYBOARD_SOURCE', payload: { url: startUrl } });
    }
    if (endUrl) {
      dispatch({ type: 'SET_STORYBOARD_END_SOURCE', payload: { url: endUrl } });
    }

    dispatch({
      type: 'ADD_LOG',
      payload: {
        message: `Loaded frames from Active Shot: ${activeShot.name || activeShot.id}`,
        type: 'success'
      }
    });
  };

  // Auto-load frames if user has an active shot and both slots are empty.
  useEffect(() => {
    if (!activeShot) return;
    if (state.storyboardSource || state.storyboardEndSource) return;

    const startUrl = activeShot.startFrameUrl as string | undefined;
    const endUrl = activeShot.endFrameUrl as string | undefined;

    if (startUrl) dispatch({ type: 'SET_STORYBOARD_SOURCE', payload: { url: startUrl } });
    if (endUrl) dispatch({ type: 'SET_STORYBOARD_END_SOURCE', payload: { url: endUrl } });
  }, [activeShot, state.storyboardSource, state.storyboardEndSource, dispatch]);


  const ANGLES = [
    {
      id: 'extreme_closeup',
      label: 'Extreme Close-Up',
      suffix:
        'Reframe only. EXTREME CLOSE-UP of the prop/hand/trigger area; crop out most of face. Camera 0.3–0.5m away, 100mm macro lens, shallow DOF. Subject fills 80–90% of frame.'
    },
    {
      id: 'closeup_subject',
      label: 'Close-Up (Subject)',
      suffix:
        'Reframe only. CLOSE-UP head-and-shoulders. Camera 1–1.3m away, 85mm lens. Eyes on upper third. Background heavily defocused.'
    },
    {
      id: 'low_wide_hero',
      label: 'Low Wide (Hero)',
      suffix:
        'Reframe only. LOW-ANGLE WIDE hero framing. Camera 4–6m away, 0.7m height, 24mm lens. Subject dominates foreground; environment visible.'
    },

    {
      id: 'wide_establishing',
      label: 'Wide Establishing',
      suffix:
        'Reframe only. WIDE establishing shot showing full room. Camera 8–12m away, 1.6m height, 24mm lens. Subjects small in frame, full environment visible.'
    },
    {
      id: 'over_shoulder',
      label: 'Over-The-Shoulder',
      suffix:
        'Reframe only. OVER-THE-SHOULDER. Foreground shoulder/head occupies 20–30% of frame; main subject mid-frame. Camera 1.5–2.5m away, 50mm lens.'
    },
    {
      id: 'top_down',
      label: 'Top-Down',
      suffix:
        'Reframe only. TOP-DOWN overhead shot. Camera directly above, perpendicular to floor, 24–35mm lens. Subjects centered; strong geometric layout.'
    },

    {
      id: 'two_shot_medium',
      label: 'Medium Two-Shot',
      suffix:
        'Reframe only. MEDIUM two-shot (waist-up) of both characters. Camera 3–4m away, 35–50mm lens. Balanced composition.'
    },
    {
      id: 'profile_side',
      label: 'Profile Side',
      suffix:
        'Reframe only. SIDE PROFILE (90°) medium close-up. Camera 2–3m away, 50mm lens. Subject profile dominates; background falls off.'
    },
    {
      id: 'foreground_object',
      label: 'Foreground Object',
      suffix:
        'Reframe only. FOREGROUND object/prop in extreme foreground, main subject in mid-background. Camera 0.5–1m from foreground object, 35mm lens. Rack focus style implied (but keep single frame sharpness).'
    }
  ];



  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>, slot: 1 | 2) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const payload = { url: ev.target?.result as string };
        dispatch({ type: slot === 1 ? 'SET_STORYBOARD_SOURCE' : 'SET_STORYBOARD_END_SOURCE', payload });
      };
      reader.readAsDataURL(file);
    }
  };

  const runSmartAnalyze = async () => {
    // Prefer Active Shot frames; fallback to manually loaded storyboard slots
    const startUrl = (activeShot?.startFrameUrl as string | undefined) ?? state.storyboardSource?.url;
    const endUrl = (activeShot?.endFrameUrl as string | undefined) ?? state.storyboardEndSource?.url;
    if (!startUrl && !endUrl) return;
    setIsAnalyzing(true);
    setAnalysisResult('');
    setAnalysisSpec(null);

    try {
      let prompt = "";
      const frames: { url: string; label: string }[] = [];

      // 1. Build the Gemini Instruction Prompt (JSON Request)
      if (state.storyboardSource && state.storyboardEndSource) {
        prompt = `
          Perform a forensic cinematic analysis for Veo 3.1 Video Generation.
          
          TASK: Analyze the temporal interpolation between [FRAME 1] and [FRAME 2] and extract the Scene Bibles.
          
          OUTPUT FORMAT:
          You must return a SINGLE VALID JSON OBJECT. Do not include markdown code blocks.
          
          JSON SCHEMA:
          {
            "characterBible": {
              "identity": "string",
              "wardrobe": "string",
              "emotionalState": "string",
              "lockedTraits": ["string", "string"] 
            },
            "styleBible": {
              "visualStyle": "string",
              "lighting": "string",
              "colorPalette": "string",
              "lensLanguage": "string"
            },
            "environmentBible": {
              "setting": "string",
              "props": ["string", "string"],
              "weatherTime": "string",
              "lockedElements": ["string", "string"]
            },
            "motionDelta": {
              "cameraMovement": "string",
              "characterAction": "string"
            },
            "frame1Description": "string",
            "frame2Description": "string"
          }
          
          CRITICAL: "lockedTraits" must list physical features that MUST NOT MORPH.
        `;
        frames.push({ url: startUrl!, label: "START_FRAME" });
        frames.push({ url: endUrl!, label: "END_FRAME" });
      } else {
        // Single frame logic could also be updated to JSON, but focusing on Dual Frame per request.
        // For consistency/types, we will keep single frame as text for now or implement a tailored JSON schema later if requested.
        // Reducing scope to Dual Frame as primary request.
        const sourceUrl = startUrl || endUrl;
        prompt = `
            Analyze this master cinematic frame. Return a JSON object with:
            {
                "characterBible": { ... },
                "styleBible": { ... },
                "environmentBible": { ... },
                "motion": { "cameraMovement": "Static", "characterAction": "None" },
                "frame1Description": "Detailed visual description",
                "frame2Description": "Same as frame 1"
            }
        `;
        frames.push({ url: sourceUrl as string, label: "MASTER_REFERENCE" });
      }

      // 2. Call Gemini with Strict JSON
      let spec: any;
      try {
        spec = await GeminiService.analyzeMultiFrameJson(prompt, state.apiKey, state.model, frames);
      } catch (jsonErr) {
        throw new Error("Failed to extract Scene Bibles. Please retry.");
      }

      // 4. Inject Strict Character Overrides from Casting Forge
      const castingForgeLocks: string[] = [];
      if (strictCharacterAds) {
        state.tokens.forEach(t => {
          if (t.profile) {
            castingForgeLocks.push(`${t.profile.identity} (${t.profile.wardrobe})`);
          }
        });
      }

      // Merge locks
      if (spec.characterBible && castingForgeLocks.length > 0) {
        spec.characterBible.lockedTraits = [
          ...(spec.characterBible.lockedTraits || []),
          ...castingForgeLocks
        ];
      }

      // Map JSON to Veo31Spec structure and STORE IT
      const veoSpec = {
        character: spec.characterBible,
        style: spec.styleBible,
        environment: spec.environmentBible,
        motion: spec.motionDelta || spec.motion, // Handle potential key mismatch
        frame1Description: spec.frame1Description,
        frame2Description: spec.frame2Description
      };
      setAnalysisSpec(veoSpec); // <--- PERSIST FOR STORYBOARD GENERATION

      // 5. Build Final Prompt
      // Import dynamically to avoid top-level issues if needed, or assume standard import
      const { buildVeo31Prompt } = await import('../promptEngine/PromptBuilder');

      const { prompt: finalPrompt, negatives } = buildVeo31Prompt(veoSpec, {
        continuityLock: continuityLockEnabled,
        noExtraObjects,
        noMorph,
        lockEnvironment: true,
        lockLighting: true,
        lockLens: true,
        lockStyle: true,
      });

      const displayOutput = `${finalPrompt}\n\nNEGATIVE_PROMPT: ${negatives}`;

      setAnalysisResult(displayOutput);
      dispatch({ type: 'ADD_LOG', payload: { message: "Veo 3.1 JSON Prompt Engine: Success", type: 'success' } });

    } catch (err: any) {
      dispatch({ type: 'ADD_LOG', payload: { message: `Analysis failed: ${err.message}`, type: 'error' } });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGenerateStoryboards = async () => {
    if (!state.storyboardSource) return;

    // Initialize Placeholders
    const newGenerations: StoryboardGeneration[] = ANGLES.map(a => ({
      id: a.id,
      angle: a.label,
      promptSuffix: a.suffix,
      url: null,
      status: 'pending'
    }));

    dispatch({ type: 'SET_STORYBOARD_GENERATIONS', payload: newGenerations });
    dispatch({ type: 'SET_PROCESSING', payload: true });

    // --- DETERMINISTIC BIBLE ASSEMBLY ---
    let charBlock = "";
    let envBlock = "";
    let styleBlock = "";
    let continuityLock = "";

    if (analysisSpec) {
      // Safe join helper for potential string/array mismatches from JSON
      const safeJoin = (val: any) => Array.isArray(val) ? val.join(", ") : (typeof val === 'string' ? val : "");

      // Use the extracted bibles
      charBlock = `SUBJECT: ${analysisSpec.character.identity}. ${analysisSpec.character.wardrobe}.`;
      envBlock = `CONTEXT: ${analysisSpec.environment.setting}. ${safeJoin(analysisSpec.environment.props)}.`;
      styleBlock = `STYLE: ${analysisSpec.style.visualStyle}, ${analysisSpec.style.lighting}`;

      continuityLock = `CONTINUITY LOCK (HARD): Identity, wardrobe, lighting, and environment must match the reference exactly. Locked Traits: ${safeJoin(analysisSpec.character.lockedTraits)}.`;
    } else {
      // Fallback Construction
      const castingForgeIdentity = state.tokens.map(t => t.profile ? `${t.profile.identity} (${t.profile.wardrobe})` : "").filter(Boolean).join(" ");
      charBlock = castingForgeIdentity ? `SUBJECT: ${castingForgeIdentity}` : "SUBJECT: The character from the reference image.";
      envBlock = "CONTEXT: The exact environment from the reference image.";
      styleBlock = "STYLE: High-fidelity, cinematic, matching the reference style exactly.";
      continuityLock = "CONTINUITY LOCK (HARD): Maintain exact character identity and visual style from the reference.";
    }

    // Get negatives
    const { buildNegatives } = await import('../promptEngine/negatives');
    // Mock spec for negatives if missing
    const negSpec = analysisSpec || { style: { visualStyle: 'Cinematic' } };
    const negativePrompt = buildNegatives(negSpec as any).join(", ");

    const referenceImages = [{ url: state.storyboardSource!.url, label: "Master Style Reference" }];
    // Add secondary reference if available
    if (state.storyboardEndSource) {
      referenceImages.push({ url: state.storyboardEndSource.url, label: "Secondary Continuity Reference" });
    }

    const promises = ANGLES.map(async (angle) => {
      try {
        // --- DETERMINISTIC PROMPT CONSTRUCTION ---
        const fullPrompt = [
          continuityLock,
          `CINEMATOGRAPHY: ${angle.suffix}`,
          charBlock,
          envBlock,
          styleBlock,
          "Render this specific camera angle."
        ].join("\n\n");

        // We pass the negative prompt appended to the prompt for Gemini/Imagen if supported, 
        // or rely on the strong positive instruction. 
        // The current GeminiService doesn't explicitly accept a separate negative arg for generateImage, 
        // so we append it clearly.
        const finalPayload = `${fullPrompt}\n\nNEGATIVE_PROMPT: ${negativePrompt}`;

        const url = await GeminiService.generateImage(
          finalPayload,
          state.apiKey,
          state.model,
          referenceImages,
          { aspectRatio: '16:9' }
        );
        dispatch({ type: 'UPDATE_STORYBOARD_GENERATION', payload: { id: angle.id, url, status: 'success' } });
      } catch (err: any) {
        dispatch({ type: 'UPDATE_STORYBOARD_GENERATION', payload: { id: angle.id, status: 'error' } });
      }
    });

    await Promise.all(promises);
    dispatch({ type: 'SET_PROCESSING', payload: false });
  };

  const handleDownloadImage = (url: string, label: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = `storyboard_${label.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    dispatch({ type: 'ADD_LOG', payload: { message: `Downloaded ${label}`, type: 'success' } });
  };

  return (
    <div className="h-full bg-[#0f0f11] p-8 overflow-y-auto">
      <div className="max-w-[1600px] mx-auto space-y-8 pb-12">

        {/* Header */}
        <div className="flex justify-between items-end border-b border-gray-800 pb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-xl border border-blue-500/20">
              <Clapperboard className="w-8 h-8 text-blue-500" />
            </div>
            <div>
              <h2 className="text-3xl font-black text-white tracking-tighter uppercase">Storyboard Studio</h2>
              <p className="text-gray-500 font-mono text-[10px] uppercase tracking-[0.3em]">VEO 3.1 PROMPT ENGINE</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                dispatch({ type: 'SET_STORYBOARD_SOURCE', payload: null });
                dispatch({ type: 'SET_STORYBOARD_END_SOURCE', payload: null });
                dispatch({ type: 'SET_STORYBOARD_GENERATIONS', payload: [] });
                setAnalysisResult('');
              }}
              className="text-[10px] font-bold text-gray-500 hover:text-red-500 uppercase tracking-widest transition-colors flex items-center gap-2 px-4 py-2 bg-white/5 rounded-lg border border-white/5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Reset Studio
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

          {/* LEFT COLUMN: SOURCE INPUT & PROMPT ENGINE */}
          <div className="lg:col-span-4 space-y-6">

            <div className="bg-[#18181b] border border-gray-800 rounded-2xl p-6 space-y-6 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-indigo-500"></div>

              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                  <MonitorPlay className="w-4 h-4 text-blue-500" />
                  Temporal Director
                </h3>
                <div className="flex bg-black/40 p-1 rounded-lg border border-white/5">
                  <button
                    onClick={() => setActiveSlot(1)}
                    className={`px-3 py-1 rounded text-[9px] font-bold uppercase transition-all ${activeSlot === 1 ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-600 hover:text-gray-400'}`}
                  >Start</button>
                  <button
                    onClick={() => setActiveSlot(2)}
                    className={`px-3 py-1 rounded text-[9px] font-bold uppercase transition-all ${activeSlot === 2 ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-600 hover:text-gray-400'}`}
                  >End</button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* START FRAME SLOT */}
                <div className={`relative aspect-[3/4] rounded-xl border-2 border-dashed overflow-hidden group transition-all ${state.storyboardSource ? 'border-blue-500/50 bg-black' : 'border-gray-800 bg-black/50 hover:border-gray-700'}`}>
                  {state.storyboardSource ? (
                    <img src={state.storyboardSource.url} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-700">
                      <ImageIcon className="w-8 h-8 mb-2 opacity-30" />
                      <span className="text-[8px] font-black uppercase tracking-widest">Start Plate</span>
                    </div>
                  )}
                  <input type="file" onChange={(e) => handleUpload(e, 1)} className="absolute inset-0 opacity-0 cursor-pointer" accept="image/*" />
                  <div className="absolute top-2 left-2 px-2 py-0.5 bg-blue-600 text-[8px] font-black text-white rounded uppercase">VEO_START</div>
                  {state.storyboardSource && (
                    <button
                      onClick={(e) => { e.stopPropagation(); dispatch({ type: 'SET_STORYBOARD_SOURCE', payload: null }); }}
                      className="absolute top-2 right-2 p-1.5 bg-black/60 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                    ><X className="w-3 h-3" /></button>
                  )}
                </div>

                {/* END FRAME SLOT */}
                <div className={`relative aspect-[3/4] rounded-xl border-2 border-dashed overflow-hidden group transition-all ${state.storyboardEndSource ? 'border-indigo-500/50 bg-black' : 'border-gray-800 bg-black/50 hover:border-gray-700'}`}>
                  {state.storyboardEndSource ? (
                    <img src={state.storyboardEndSource.url} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-700">
                      <ImageIcon className="w-8 h-8 mb-2 opacity-30" />
                      <span className="text-[8px] font-black uppercase tracking-widest">End Plate</span>
                    </div>
                  )}
                  <input type="file" onChange={(e) => handleUpload(e, 2)} className="absolute inset-0 opacity-0 cursor-pointer" accept="image/*" />
                  <div className="absolute top-2 left-2 px-2 py-0.5 bg-indigo-600 text-[8px] font-black text-white rounded uppercase">VEO_END</div>
                  {state.storyboardEndSource && (
                    <button
                      onClick={(e) => { e.stopPropagation(); dispatch({ type: 'SET_STORYBOARD_END_SOURCE', payload: null }); }}
                      className="absolute top-2 right-2 p-1.5 bg-black/60 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                    ><X className="w-3 h-3" /></button>
                  )}
                </div>
              </div>


              {/* Shot Sync (optional) */}
              {activeShot && (
                <div className="mt-4 p-3 bg-black/40 rounded-xl border border-white/5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Active Shot</div>
                    <div className="text-[10px] font-mono text-gray-300 truncate">
                      {activeShot.name || activeShot.id}
                    </div>
                    <div className="text-[9px] font-mono text-gray-600">
                      Start: {activeShot.startFrameUrl ? 'Set' : '—'} • End: {activeShot.endFrameUrl ? 'Set' : '—'}
                    </div>
                  </div>
                  <button
                    onClick={loadFramesFromActiveShot}
                    className="px-3 py-2 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white font-bold text-[9px] uppercase tracking-widest rounded-xl transition-all border border-white/5 whitespace-nowrap"
                    title="Load start/end frames from the active shot (created in SceneCanvas / Production Console)"
                  >
                    Load Frames
                  </button>
                  <button
                    onClick={async () => {
                      if (!activeShot) return;
                      loadFramesFromActiveShot();
                      // Run analysis immediately (uses Active Shot URLs directly)
                      await runSmartAnalyze();
                    }}
                    className="px-3 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 hover:text-blue-200 font-bold text-[9px] uppercase tracking-widest rounded-xl transition-all border border-blue-500/20 whitespace-nowrap"
                    title="Generate prompt from Active Shot (loads frames + runs Smart Analyze)"
                  >
                    Generate
                  </button>
                </div>
              )}

              <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between p-3 bg-black/40 rounded-xl border border-white/5">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Character DNA Adherence</span>
                    <span className="text-[9px] text-gray-600 font-mono">Inject Casting Forge Whitelist</span>
                  </div>
                  <button
                    onClick={() => setStrictCharacterAds(!strictCharacterAds)}
                    className={`p-2 rounded-lg border transition-all ${strictCharacterAds ? 'bg-green-500/20 border-green-500/40 text-green-500' : 'bg-gray-800 border-gray-700 text-gray-500'}`}
                  >
                    {strictCharacterAds ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                  </button>
                </div>

                <div className="p-3 bg-black/40 rounded-xl border border-white/5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Continuity Lock</span>
                      <span className="text-[9px] text-gray-600 font-mono">Anti-morph + no drift</span>
                    </div>
                    <button
                      onClick={() => setContinuityLockEnabled(!continuityLockEnabled)}
                      className={`p-2 rounded-lg border transition-all ${continuityLockEnabled ? 'bg-blue-500/20 border-blue-500/30 text-blue-300' : 'bg-gray-800 border-gray-700 text-gray-500'}`}
                      title="Toggle continuity lock block injection"
                    >
                      {continuityLockEnabled ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">No Extra Objects</span>
                    <button
                      onClick={() => setNoExtraObjects(!noExtraObjects)}
                      className={`px-3 py-1 rounded-lg text-[9px] font-bold uppercase border transition-all ${noExtraObjects ? 'bg-blue-500/10 border-blue-500/20 text-blue-200' : 'bg-gray-900 border-gray-700 text-gray-500'}`}
                    >
                      {noExtraObjects ? 'ON' : 'OFF'}
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">No Morphing</span>
                    <button
                      onClick={() => setNoMorph(!noMorph)}
                      className={`px-3 py-1 rounded-lg text-[9px] font-bold uppercase border transition-all ${noMorph ? 'bg-blue-500/10 border-blue-500/20 text-blue-200' : 'bg-gray-900 border-gray-700 text-gray-500'}`}
                    >
                      {noMorph ? 'ON' : 'OFF'}
                    </button>
                  </div>
                </div>

                <button
                  onClick={runSmartAnalyze}
                  disabled={(!(activeShot?.startFrameUrl || state.storyboardSource) && !(activeShot?.endFrameUrl || state.storyboardEndSource)) || isAnalyzing}
                  className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-xs uppercase tracking-[0.2em] rounded-xl shadow-lg shadow-blue-500/20 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 border border-white/10"
                >
                  {isAnalyzing ? <RotateCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {isAnalyzing ? 'Analyzing Temporal DNA...' : 'Smart Analyze (Veo 3.1)'}
                </button>

                {ENABLE_STORYBOARD_GRID && (
                  <button
                    onClick={handleGenerateStoryboards}
                    disabled={!state.storyboardSource || state.isProcessing}
                    className="w-full py-3 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white font-bold text-[10px] uppercase tracking-widest rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed border border-white/5 flex items-center justify-center gap-2"
                  >
                    <Clapperboard className="w-3.5 h-3.5" />
                    Generate Storyboard Set (9 Angles)
                  </button>
                )}
              </div>
            </div>

            <div className="bg-blue-500/5 border border-blue-500/10 p-4 rounded-2xl">
              <h4 className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Director's Note</h4>
              <p className="text-[10px] text-blue-400/60 leading-relaxed font-mono italic">
                For Temporal Interpolation, load Start and End frames. The power engine will analyze pixel movement, lighting delta, and maintain absolute character identity.
              </p>
            </div>

          </div>

          {/* RIGHT COLUMN: PROMPT OUTPUT & GRID */}
          <div className="lg:col-span-8 space-y-6">

            {/* VEO 3.1 PROMPT OUTPUT AREA */}
            <div className="bg-[#1c1c20] border border-gray-700/50 rounded-2xl p-6 shadow-2xl relative overflow-hidden group">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
                  <h3 className="text-xs font-black text-white uppercase tracking-[0.2em]">Veo 3.1 Prompt Output</h3>
                </div>
                {analysisResult && (
                  <button
                    onClick={() => navigator.clipboard.writeText(analysisResult)}
                    className="p-2 bg-white/5 hover:bg-white/20 text-gray-400 hover:text-white rounded-lg transition-all flex items-center gap-2 text-[9px] font-bold uppercase border border-white/5"
                  >
                    <Copy className="w-3 h-3" />
                    Copy Logic
                  </button>
                )}
              </div>

              <div className={`w-full min-h-[160px] max-h-[300px] bg-black/40 rounded-xl border border-white/5 p-5 font-mono text-[11px] leading-relaxed overflow-y-auto custom-scrollbar relative ${isAnalyzing ? 'animate-pulse' : ''}`}>
                {isAnalyzing ? (
                  <div className="flex flex-col items-center justify-center h-40 text-blue-500">
                    <RotateCw className="w-6 h-6 animate-spin mb-2" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Synthesizing Cinematic Reasoning...</span>
                  </div>
                ) : analysisResult ? (
                  <div className="text-gray-300">
                    <span className="text-blue-400 font-bold block mb-4 border-b border-blue-500/20 pb-2">STRICT_CONSISTENCY_PROTOCOL_v3.1</span>
                    {analysisResult.split('\\n').map((line, i) => (
                      <p key={i} className={line.startsWith('[') ? 'text-blue-500 font-bold mt-2' : ''}>{line}</p>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-40 opacity-20 text-gray-500">
                    <Film className="w-10 h-10 mb-4" />
                    <span className="text-xs font-black uppercase tracking-widest text-center">Run "Smart Analyze" to generate<br />the Veo 3.1 Power Prompt</span>
                  </div>
                )}
              </div>
            </div>

            {/* STORYBOARD GRID - FEATURE FLAGGED */}
            {ENABLE_STORYBOARD_GRID && (
              <div className="space-y-4">
                <div className="flex justify-between items-center px-2">
                  <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Storyboard Expansion Grid</h3>
                  <span className="text-[9px] font-mono text-gray-700 uppercase">9 Cinematic Reference Points</span>
                </div>

                <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
                  {(state.storyboardGenerations.length === 0 ? ANGLES : state.storyboardGenerations).map((item: any) => {
                    const isGen = 'status' in item;
                    const status = isGen ? item.status : 'idle';
                    const label = isGen ? item.angle : item.label;
                    const suffix = isGen ? item.promptSuffix : item.suffix;

                    return (
                      <div key={item.id} className="aspect-video bg-[#09090b] rounded-xl border border-gray-800 overflow-hidden relative group transition-all hover:border-blue-500/30">
                        {status === 'success' && item.url ? (
                          <img src={item.url} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center">
                            {status === 'pending' ? (
                              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                            ) : (
                              <Film className="w-6 h-6 text-gray-800 mb-2 opacity-20" />
                            )}
                            <span className="text-[8px] font-mono text-gray-700 uppercase tracking-widest">
                              {status === 'pending' ? 'Rendering...' : (status === 'error' ? 'Failed' : 'Empty Slot')}
                            </span>
                          </div>
                        )}

                        {/* Hover Overlay */}
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all flex flex-col justify-between p-4 backdrop-blur-sm">
                          <div className="flex justify-between items-start">
                            <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">{label}</span>
                            {status === 'success' && (
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleDownloadImage(item.url, item.angle)}
                                  className="p-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-all shadow-lg"
                                  title="Download Image"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => {
                                    dispatch({ type: activeSlot === 1 ? 'SET_STORYBOARD_SOURCE' : 'SET_STORYBOARD_END_SOURCE', payload: { url: item.url } });
                                    dispatch({ type: 'ADD_LOG', payload: { message: `Shot promoted to Slot ${activeSlot}`, type: 'success' } });
                                  }}
                                  className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-all shadow-lg shadow-blue-600/20"
                                  title={`Promote to Slot ${activeSlot}`}
                                >
                                  <ArrowRight className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                          <p className="text-[9px] text-gray-400 leading-tight font-mono opacity-80">{suffix}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VeoGenerator;
