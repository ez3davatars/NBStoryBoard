import React, { useState, useEffect, useRef } from 'react';
import { 
  RotateCw, MonitorPlay, Maximize, ImagePlus, Download, 
  BoxSelect, Clapperboard, Trash2, Image as ImageIcon 
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { GeminiService } from '../services/GeminiService';
import { 
  buildMasterStyleKeywords, 
  mergeNegatives, 
  SCENE_LOCK_NEGATIVE_TOKENS,
  getActiveReferenceSlots
} from '../utils/promptHelpers';
import type { StageToken, WhitelistProfile, CastMember } from '../context/AppContext';

// --- Production Console Component ---
const ProductionConsole: React.FC = () => {
  const { state, dispatch } = useAppContext();
  if (!state || !dispatch) return null;

  const [compiledPrompt, setCompiledPrompt] = useState("");
  // Local result state removed in favor of state.resultImage

  // Superpower Controls
  const [strictMode, setStrictMode] = useState(true);
  const [autoAnchorDNA, setAutoAnchorDNA] = useState(true);
  const [autoTokenProfiles, setAutoTokenProfiles] = useState(true);
  const [autoCastProfiles] = useState(false); // fallback-only (token profiles are primary)

  // Anchor DNA (shared with Director settings)
  const anchorDNA = React.useMemo(() => ({
    environment: state.director.environment,
    lighting: state.director.lighting,
    camera: state.director.camera,
  }), [state.director.environment, state.director.lighting, state.director.camera]);
  const [dnaStatus, setDnaStatus] = useState<'idle' | 'analyzing' | 'ready' | 'error'>('idle');
  const lastDnaBgRef = useRef<string | null>(null);

  const STAGE_W = 960;
  const STAGE_H = 540;
  const RENDER_SCALE = 2; // Scales 960x540 to 1920x1080 for Pro Renders
  // Uses state.model from context


  const safeParseJson = (raw: string): any | null => {
    try {
      const cleaned = raw.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  };

  const loadImage = (url: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  };

  const drawCover = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) => {
    const imgRatio = img.width / img.height;
    const boxRatio = w / h;

    let dw = w;
    let dh = h;
    let dx = x;
    let dy = y;

    if (imgRatio > boxRatio) {
      dh = h;
      dw = h * imgRatio;
      dx = x - (dw - w) / 2;
    } else {
      dw = w;
      dh = w / imgRatio;
      dy = y - (dh - h) / 2;
    }

    ctx.drawImage(img, dx, dy, dw, dh);
  };

  const analyzeBackgroundDNA = async (): Promise<{ environment: string; lighting: string; camera: string } | null> => {
    if (!state.backgroundUrl) {
      dispatch({ type: 'ADD_LOG', payload: { message: "No background set to analyze.", type: 'error' } });
      return null;
    }
    if (!state.apiKey) {
      dispatch({ type: 'ADD_LOG', payload: { message: "API Key required for DNA analysis.", type: 'error' } });
      return null;
    }

    setDnaStatus('analyzing');
    dispatch({ type: 'ADD_LOG', payload: { message: "Analyzing Anchor Scene DNA (env/lighting/camera)...", type: 'info' } });

    try {
      const raw = await GeminiService.analyzeImage(
        "Analyze this image for a film director. Return a JSON object with 3 keys: 'environment' (string, concise setting/vibe), 'lighting' (string, e.g. 'Golden Hour', 'Neon', 'Dark/Moody'), and 'camera' (string, e.g. 'Wide Angle', 'Close Up', 'Drone'). Only return the JSON.",
        state.apiKey,
        state.model,
        state.backgroundUrl
      );

      const parsed = safeParseJson(raw);
      if (!parsed) throw new Error("DNA parse failed (non-JSON response).");

      const dna = {
        environment: String(parsed.environment || ""),
        lighting: String(parsed.lighting || ""),
        camera: String(parsed.camera || "")
      };

      // Share DNA into Director settings (also used by Blocking View / Prompt Terminal)
      dispatch({
        type: 'SET_DIRECTOR',
        payload: {
          environment: dna.environment,
          lighting: dna.lighting,
          camera: dna.camera,
          envAuto: true
        }
      });
      setDnaStatus('ready');
      lastDnaBgRef.current = state.backgroundUrl;

      dispatch({ type: 'ADD_LOG', payload: { message: "Anchor DNA extracted.", type: 'success' } });
      return dna;
    } catch (e: any) {
      setDnaStatus('error');
      dispatch({ type: 'ADD_LOG', payload: { message: e.message || "DNA analysis failed", type: 'error' } });
      return null;
    }
  };

  // Auto DNA on background change
  useEffect(() => {
    if (!autoAnchorDNA) return;
    if (!state.backgroundUrl) return;
    if (!state.apiKey) return;
    // If the director already has DNA values, do not auto-overwrite.
    if (state.director.environment || state.director.lighting || state.director.camera) return;
    if (lastDnaBgRef.current === state.backgroundUrl) return;

    // Fire and forget (UI preview only). Render path awaits when needed.
    analyzeBackgroundDNA();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAnchorDNA, state.backgroundUrl, state.apiKey]);

  const analyzeWhitelistProfile = async (imageUrl: string, label: string): Promise<WhitelistProfile> => {
    const raw = await GeminiService.analyzeImage(
      "Analyze this single character/object cutout. Return a JSON object with keys: " +
      "'identity' (who/what it is), 'wardrobe' (clothing/body/materials), 'accessories' (items held/worn), 'style' (render style/texture cues). " +
      "Keep each value concise (max ~18 words). If unknown, use empty string. ONLY return JSON.",
      state.apiKey!,
      state.model,
      imageUrl
    );

    const parsed = safeParseJson(raw);
    if (!parsed) {
      return { identity: label, wardrobe: "", accessories: "", style: "" };
    }

    return {
      identity: String(parsed.identity || label || ""),
      wardrobe: String(parsed.wardrobe || ""),
      accessories: String(parsed.accessories || ""),
      style: String(parsed.style || "")
    };
  };

  // --- NEW: PER-TOKEN PROFILES (true per StageToken, keyed by token.id via token.profile) ---
  const ensureTokenProfiles = async (
    tokens: StageToken[],
    opts: { force?: boolean } = {}
  ): Promise<Map<string, WhitelistProfile>> => {
    const shouldRun = Boolean(opts.force || autoTokenProfiles);
    const overrides = new Map<string, WhitelistProfile>();

    if (!shouldRun) return overrides;
    if (!state.apiKey) return overrides;

    const missing = tokens.filter(t => !t.profile);
    if (missing.length === 0) return overrides;

    dispatch({ type: 'ADD_LOG', payload: { message: `Analyzing ${missing.length} stage token profile(s) (per-token whitelist)...`, type: 'info' } });

    // Cache by image URL to reduce redundant calls while still storing per-token results
    const cache = new Map<string, WhitelistProfile>();

    for (const t of missing) {
      try {
        const cached = cache.get(t.url);
        const prof = cached || await analyzeWhitelistProfile(t.url, `Token ${t.tag}`);
        if (!cached) cache.set(t.url, prof);

        overrides.set(t.id, prof);
        dispatch({ type: 'UPDATE_TOKEN', payload: { id: t.id, profile: prof } });
      } catch (e: any) {
        dispatch({ type: 'ADD_LOG', payload: { message: `Token profile failed: ${e.message || t.id}`, type: 'error' } });
      }
    }

    dispatch({ type: 'ADD_LOG', payload: { message: "Token whitelist profiles ready.", type: 'success' } });
    return overrides;
  };

  const ensureCastProfiles = async (
    castMembers: CastMember[],
    opts: { force?: boolean } = {}
  ): Promise<Map<string, WhitelistProfile>> => {
    const shouldRun = Boolean(opts.force || autoCastProfiles);
    const overrides = new Map<string, WhitelistProfile>();

    if (!shouldRun) return overrides;
    if (!state.apiKey) return overrides;

    const missing = castMembers.filter(c => !c.profile);
    if (missing.length === 0) return overrides;

    dispatch({ type: 'ADD_LOG', payload: { message: `Analyzing ${missing.length} cast profile(s) (fallback whitelist)...`, type: 'info' } });

    const cache = new Map<string, WhitelistProfile>();

    for (const c of missing) {
      try {
        const cached = cache.get(c.url);
        const prof = cached || await analyzeWhitelistProfile(c.url, `Cast ${c.name}`);
        if (!cached) cache.set(c.url, prof);

        overrides.set(c.id, prof);
        dispatch({ type: 'UPDATE_CAST', payload: { id: c.id, profile: prof } });
      } catch (e: any) {
        dispatch({ type: 'ADD_LOG', payload: { message: `Cast profile failed: ${e.message || c.id}`, type: 'error' } });
      }
    }

    dispatch({ type: 'ADD_LOG', payload: { message: "Cast whitelist profiles ready.", type: 'success' } });
    return overrides;
  };

  const buildRegionPlan = (overrides?: { token?: Map<string, WhitelistProfile>; cast?: Map<string, WhitelistProfile> }) => {
    const sorted = [...state.tokens].sort((a, b) => (a.zIndex - b.zIndex) || (a.x - b.x));

    return sorted.map((t, idx) => {
      const cast = state.cast.find(c => c.id === t.castId) || null;

      const tokenOverride = overrides?.token?.get(t.id);
      const castOverride = overrides?.cast?.get(t.castId);

      const profile =
        tokenOverride ||
        t.profile ||
        castOverride ||
        cast?.profile ||
        { identity: cast?.name || `Token ${t.tag}`, wardrobe: "", accessories: "", style: "" };

      return {
        region: idx + 1,
        token: t,
        cast,
        profile
      };
    });
  };

  // --- V3-style Reference Consistency Stack (for prompt + optional extra refs) ---
  const buildReferenceStackText = (mode: 'strict' | 'loose'): string => {
    const refs = getActiveReferenceSlots(state.referenceSlots);
    if (refs.length === 0 && !state.director.replaceAnchorSubjects && !state.director.negativePrompt) return '';

    const lines: string[] = [];
    const totalRefs = mode === 'strict' 
      ? refs.length + state.tokens.length 
      : refs.length;
      
    lines.push(`[System: Processing ${totalRefs} Reference Image(s) using strategy: ${state.director.mergeStrategy}. Primary fidelity on Ref 1-6.]`);

    // V3 priority: Marker Protocol > Spatial Layout > Replace Anchor Subjects
    if (mode === 'loose' && state.director.markerType) {
      const marker = state.director.markerType;
      lines.push(`MARKER_PROTOCOL: Treat the ${marker} markings as editable regions. Freeze everything outside the markings. Remove marker traces cleanly at the end.`);
      refs.forEach(r => {
        const target = (r.target || '').trim() || `Marker #${r.index}`;
        const desc = (r.analysis || r.name || '').trim() || `Subject from Ref ${r.index}`;
        lines.push(`MARKED_REGION ${r.index}: "${target}" => ${desc}`);
      });
    } else if (mode === 'loose' && state.director.spatialLayout) {
      const s = state.director.spatialLayout;
      lines.push(`SPATIAL_LAYOUT_DIRECTIVE: ${s}. (Use references as composition guidance.)`);
    } else if (state.director.replaceAnchorSubjects) {
      const specific = refs
        .filter(r => (r.target || '').trim().length > 0)
        .map(r => `Replace "${String(r.target).trim()}" with subject from Reference ${r.index}.`);

      const globalTarget = (state.director.globalReplaceTarget || '').trim();
      if (specific.length > 0) {
        lines.push(`{CRITICAL REPLACEMENT MAP: ${specific.join(' ')}}`);
      } else if (globalTarget) {
        lines.push(`{CRITICAL REPLACEMENT DIRECTIVE: Identify "${globalTarget}" in the anchor scene and replace using the most relevant provided Reference image.}`);
      } else {
        lines.push('{CRITICAL REPLACEMENT DIRECTIVE: Replace only the explicitly requested anchor subjects using the provided references.}');
      }
    }

    for (const r of refs) {
      const content = (r.analysis || r.name || '').trim();
      lines.push(`[Ref ${r.index} Content: ${content || 'No analysis provided'}]`);
    }

    const safetyNegs = state.director.safety === 'Strict'
      ? 'nsfw, nudity, violence, blood, gore, disturbing content, inappropriate attire'
      : '';
    const markerNegs = state.director.markerType
      ? 'text, numbers, annotations, outlines, bounding boxes, arrows, circles, ui elements, red lines, green lines, marker strokes, sketches, overlay'
      : '';
    const sceneLockNegs = state.director.sceneLock ? SCENE_LOCK_NEGATIVE_TOKENS : '';
    const neg = mergeNegatives(state.director.negativePrompt || '', safetyNegs, markerNegs, sceneLockNegs).trim();
    if (neg) lines.push(`NEGATIVE_PROMPT (EXCLUSIONS): ${neg}`);

    if (state.director.sceneLock) {
      lines.push('LOCK_SCENE: Do not change the environment, layout, lighting, or camera. Only modify regions explicitly requested.');
    }

    return lines.join('\n');
  };

  const buildStrictPrompt = (
    regionPlan: ReturnType<typeof buildRegionPlan>,
    dna: { environment: string; lighting: string; camera: string }
  ) => {
    const refStackBlock = buildReferenceStackText('strict');
    const notes = state.annotations
      .filter(a => a.type === 'note' && a.text)
      .map(a => a.text)
      .join(" | ");



    const dnaBlock = [
      dna.environment ? `ENVIRONMENT_DNA: ${dna.environment}` : "",
      dna.lighting ? `LIGHTING_DNA: ${dna.lighting}` : "",
      dna.camera ? `CAMERA_DNA: ${dna.camera}` : ""
    ].filter(Boolean).join("\n");

    const regions = regionPlan.map(r => {
      const t = r.token;
      const p = r.profile;

      const nx = (t.x / STAGE_W).toFixed(3);
      const ny = (t.y / STAGE_H).toFixed(3);
      const nw = (t.width / STAGE_W).toFixed(3);
      const nh = (t.height / STAGE_H).toFixed(3);

      const flip = t.scaleX < 0 ? "true" : "false";

      return [
        `REGION ${r.region}:`,
        `- BBOX_NORM: x=${nx}, y=${ny}, w=${nw}, h=${nh}`,
        `- BBOX_ABS: x=${Math.round(t.x * RENDER_SCALE)}px, y=${Math.round(t.y * RENDER_SCALE)}px, w=${Math.round(t.width * RENDER_SCALE)}px, h=${Math.round(t.height * RENDER_SCALE)}px`,
        `- TRANSFORM: rotation_deg=${t.rotation}, flipX=${flip}, zIndex=${t.zIndex}`,
        `- USE_REFERENCE: IMAGE labeled "REGION ${r.region} REFERENCE"`,
        `- ALLOWED_IDENTITY: ${p.identity || "none"}`,
        `- ALLOWED_WARDROBE: ${p.wardrobe || "none"}`,
        `- ALLOWED_ACCESSORIES: ${p.accessories || "none"}`,
        `- STYLE_LOCK: ${p.style || "none"}`,
        `- ACTION: ${t.actionNote || "maintain anchor pose"}`,
        `- INTELLIGENCE: ${t.intelligence || "none"}`,
        `- HARD_RULES: SURGICAL ASPECT RATIO LOCK. Use the exact proportions from your REGION ${r.region} REFERENCE cutout. Ignore the silhouette shape in the ANCHOR PLATE if it appears stretched or squashed. If the BBOX_ABS is a different shape than the reference image, do NOT stretch the character to fit. Maintain natural human proportions and fill any empty BBOX space with pixels from the CLEAN BACKGROUND PLATE.`
      ].join("\n");
    }).join("\n\n");

    // Director (V3) preamble injected into strict compositor header
    const tech = buildMasterStyleKeywords(state.director);
    const masterStyleLine = tech.length > 0 ? `MASTER_STYLE: ${tech.join(', ')}` : "";
    const sceneBriefLine = state.director.subject.trim() ? `DIRECTOR_SCENE_BRIEF: ${state.director.subject.trim()}` : "";
    const knowledgeLine = state.director.knowledge.trim() ? `KNOWLEDGE_INJECTION: ${state.director.knowledge.trim()}` : "";
    const filmLine = state.director.filmStock.trim() ? `FILM_LOOK: ${state.director.filmStock.trim()}` : "";
    const safetyLine = state.director.safety ? `SAFETY_MODE: ${state.director.safety}` : "";

    const textLine = state.director.textRender.trim()
      ? `TEXT_LAYER: Render "${state.director.textRender.trim()}"${state.director.textStyle.trim() ? ` in style of ${state.director.textStyle.trim()}` : ''}.`
      : "";



    const rules = [
      refStackBlock ? `### REFERENCE CONSISTENCY STACK:\n${refStackBlock}\n` : "",
      masterStyleLine,
      safetyLine,
      sceneBriefLine,
      knowledgeLine,
      filmLine,
      textLine,
      "ROLE: MASTER FILM COMPOSITOR & FINISHING ARTIST.",
      "OBJECTIVE: Render a clean, pixel-perfect 16:9 cinematic frame using the provided ANCHOR_GUIDE and REGION_REFS. You must perfectly preserve character identity and position.",
      "",
      "CRITICAL COMMANDS (ZERO TOLERANCE):",
      "1. SINGLE IMAGE OUTPUT: Generate ONLY the final rendered scene. Do NOT render a collage, sidebar, dashboard, or layout showing the references. If the output is not a single clean 16:9 scene, it is a FAILURE.",
      "- UNIFORM ENVIRONMENT: All background details (walls, props, lighting) must remain 100% identical to the CLEAN_BG_PLATE outside of the character regions.",
      "- SEAMLESS BLENDING: The ANCHOR_GUIDE contains a rough composite of the characters. Your job is to blend them naturally into the scene. Match the lighting, shadows, and color grading of the background.",
      "- NO OUTLINES: Do NOT draw any boxes, boundaries, or outlines around the characters. The final image must look like a natural photograph or movie frame.",
      "- NO Hallucinations: Do not add any extra objects, people, or details not requested in the Director Brief or Region Plan.",
      "- ASPECT RATIO LOCK: DO NOT STRETCH OR SQUASH. If a character cutout does not perfectly fill its assigned BBOX_ABS, DO NOT distort the character. Maintain natural proportions and fill any remainder with pixels from the CLEAN_BG_PLATE.",
      "- OVERLAP LOCK: If the ANCHOR_GUIDE shows subjects overlapping, maintain that exact occlusion.",
      "",
      dnaBlock ? `### ANCHOR DNA:\n${dnaBlock}\n` : "",
      notes ? `### DIRECTOR NOTES: ${notes}\n` : "",
      "",
      "### REGION COMPOSITION PLAN (FOLLOW EXACTLY):",
      regions
    ].filter(Boolean).join("\n");

    return rules;
  };

  const buildLoosePrompt = (dna: { environment: string; lighting: string; camera: string }) => {
    const sortedTokens = [...state.tokens].sort((a, b) => a.x - b.x);
    const refStackBlock = buildReferenceStackText('loose');
    const tech = buildMasterStyleKeywords(state.director);

    let p = "";
    if (tech.length > 0) p += `(Master Style: ${tech.join(', ')})\n\n`;

    if (state.director.subject.trim()) p += `Subject: ${state.director.subject.trim()}. `;
    if (state.director.knowledge.trim()) p += `(Reasoning Constraint: Ensure historical/factual accuracy for: \"${state.director.knowledge.trim()}\"). `;
    if (state.director.filmStock.trim()) p += `Film Look: ${state.director.filmStock.trim()}. `;
    if (state.director.textRender.trim()) {
      let t = `Render Text: \"${state.director.textRender.trim()}\"`;
      if (state.director.textStyle.trim()) t += ` in style of ${state.director.textStyle.trim()}`;
      p += `(Text Layer: ${t}). `;
    }

    if (refStackBlock) p += `${refStackBlock}\n\n`;
    p += "Cinematic composition. ";

    sortedTokens.forEach((t, i) => {
      const center = t.x + t.width / 2;
      const relX = center / STAGE_W;
      const relY = (t.y + t.height) / STAGE_H;

      let posH = "in the center";
      if (relX < 0.33) posH = "on the left";
      if (relX > 0.66) posH = "on the right";

      let posD = "midground";
      if (relY > 0.8) posD = "foreground (close to camera)";
      if (relY < 0.4) posD = "background (far away)";

      p += `Character ${i + 1} (${t.tag}) is ${posH} in the ${posD}`;
      if (t.actionNote) p += `, doing action: ${t.actionNote}`;
      if (t.intelligence) p += `, with intelligence directives: ${t.intelligence}`;
      p += ". ";
    });

    const notes = state.annotations.filter(a => a.type === 'note' && a.text).map(a => a.text).join(". ");
    if (notes) p += ` DIRECTOR NOTES: ${notes}.`;

    if (dna.environment) p += ` ENVIRONMENT: ${dna.environment}.`;
    if (dna.camera) p += ` CAMERA: ${dna.camera}.`;
    if (dna.lighting) p += ` LIGHTING: ${dna.lighting}.`;

    const constraints = " CRITICAL: Do NOT add any new people, furniture, or objects that are not explicitly described. Do NOT rearrange the scene layout. Maintain empty space. No text/watermarks.";

    return p + constraints;
  };

  const compilePrompt = () => {
    const previewDna = anchorDNA;
    const plan = buildRegionPlan();
    const p = strictMode ? buildStrictPrompt(plan, previewDna) : buildLoosePrompt(previewDna);
    setCompiledPrompt(p);
  };

  // Recompile prompt when stage changes (preview only)
  useEffect(() => {
    compilePrompt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strictMode, state.tokens, state.annotations, state.backgroundUrl, state.cast, state.referenceSlots, state.director, anchorDNA.environment, anchorDNA.lighting, anchorDNA.camera]);

  const buildAnchorPlate = async (regionPlan: ReturnType<typeof buildRegionPlan>): Promise<string> => {
    const canvas = document.createElement('canvas');
    const PRO_W = STAGE_W * RENDER_SCALE;
    const PRO_H = STAGE_H * RENDER_SCALE;
    canvas.width = PRO_W;
    canvas.height = PRO_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("Canvas context unavailable.");

    // Apply global scale so all stage-coordinate drawing commands hit the Pro resolution
    ctx.scale(RENDER_SCALE, RENDER_SCALE);

    // Base
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, STAGE_W, STAGE_H);

    // Background
    if (state.backgroundUrl) {
      const bg = await loadImage(state.backgroundUrl);
      drawCover(ctx, bg, 0, 0, STAGE_W, STAGE_H);
    }

    // Draw tokens (placeholders) respecting zIndex order
    const tokensByDepth = [...regionPlan].sort((a, b) => a.token.zIndex - b.token.zIndex);
    for (const r of tokensByDepth) {
      const t = r.token;
      const img = await loadImage(t.url);

      const ax = (t.anchorX ?? 50) / 100 * t.width;
      const ay = (t.anchorY ?? 50) / 100 * t.height;

      // START: Object-Contain Logic to match SceneCanvas (Pro-Scale)
      const imgRatio = img.width / img.height;
      const boxRatio = t.width / t.height;
      
      let drawW = t.width;
      let drawH = t.height;
      let offX = 0;
      let offY = 0;

      if (imgRatio > boxRatio) {
        // Image is wider than box: constrain width, center height
        drawW = t.width;
        drawH = t.width / imgRatio;
        offX = 0;
        offY = (t.height - drawH) / 2;
      } else {
        // Image is taller than box: constrain height, center width
        drawH = t.height;
        drawW = t.height * imgRatio;
        offX = (t.width - drawW) / 2;
        offY = 0;
      }
      // END: Object-Contain Logic

      ctx.save();
      // Pivot around the anchor point relative to token's top-left
      ctx.translate(t.x + ax, t.y + ay);
      ctx.rotate((t.rotation * Math.PI) / 180);
      ctx.scale(t.scaleX, t.scaleY || 1);
      
      ctx.drawImage(img, -ax + offX, -ay + offY, drawW, drawH);
      ctx.restore();

      // NUCLEAR OPTION: NO MARKERS.
      // We do NOT draw the colored boxes or numbers anymore.
      // The AI uses the text coordinates (BBOX_ABS) and the visual presence of the character pixels
      // to know where the subject is. This guarantees no "box artifacts" in the final render.
    }

    // Draw zone/arrow annotations as visual guides (optional)
    const annosByZ = [...state.annotations].sort((a, b) => a.zIndex - b.zIndex);
    for (const a of annosByZ) {
      if (a.type === 'zone') {
        ctx.save();
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 4;
        ctx.setLineDash([10, 8]);
        ctx.strokeRect(a.x, a.y, a.width, a.height);
        ctx.restore();
      }
      if (a.type === 'arrow') {
        ctx.save();
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 6;
        ctx.setLineDash([]);
        const x1 = a.x + 10;
        const y1 = a.y + a.height - 10;
        const x2 = a.x + a.width - 10;
        const y2 = a.y + 10;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        const ang = Math.atan2(y2 - y1, x2 - x1);
        const headLen = 14;
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - headLen * Math.cos(ang - Math.PI / 6), y2 - headLen * Math.sin(ang - Math.PI / 6));
        ctx.lineTo(x2 - headLen * Math.cos(ang + Math.PI / 6), y2 - headLen * Math.sin(ang + Math.PI / 6));
        ctx.closePath();
        ctx.fillStyle = '#3b82f6';
        ctx.fill();
        ctx.restore();
      }
    }

    // Region boxes + numbers
    const colors = ['#a855f7', '#f97316', '#22c55e', '#06b6d4', '#eab308', '#ef4444', '#3b82f6', '#f472b6', '#84cc16', '#facc15', '#10b981', '#8b5cf6'];
    for (const r of regionPlan) {
      const t = r.token;
      const col = colors[(r.region - 1) % colors.length];

      ctx.save();
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.strokeRect(t.x, t.y, t.width, t.height);

      ctx.fillStyle = col;
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText(String(r.region), t.x + 4, t.y + 16);
      ctx.restore();
    }

    return canvas.toDataURL('image/png');
  };

  const handleAnalyzeMissingTokenProfiles = async () => {
    if (!state.apiKey) {
      dispatch({ type: 'ADD_LOG', payload: { message: "API Key required for token profile analysis.", type: 'error' } });
      return;
    }
    dispatch({ type: 'SET_PROCESSING', payload: true });
    try {
      await ensureTokenProfiles(state.tokens, { force: true });
    } finally {
      dispatch({ type: 'SET_PROCESSING', payload: false });
    }
  };

  const handleRender = async () => {
    dispatch({ type: 'SET_PROCESSING', payload: true });

    try {
      // If strict mode, do not trust state updates mid-render; use local overrides/maps
      let dnaForRender = anchorDNA;

      if (
        strictMode &&
        autoAnchorDNA &&
        state.backgroundUrl &&
        state.apiKey &&
        !dnaForRender.environment &&
        !dnaForRender.lighting &&
        !dnaForRender.camera &&
        lastDnaBgRef.current !== state.backgroundUrl
      ) {
        const fresh = await analyzeBackgroundDNA();
        if (fresh) dnaForRender = fresh;
      }

      // 1) Profiles
      const tokenOverrides = await ensureTokenProfiles(state.tokens, { force: autoTokenProfiles });

      let castOverrides = new Map<string, WhitelistProfile>();
      if (strictMode && autoCastProfiles) {
        const usedCastIds = new Set(state.tokens.map(t => t.castId));
        const castInScene = state.cast.filter(c => usedCastIds.has(c.id));
        castOverrides = await ensureCastProfiles(castInScene, { force: true });
      }

      if (strictMode) {
        // 2) Region Plan with overrides
        const plan = buildRegionPlan({ token: tokenOverrides, cast: castOverrides });

        // 3) Anchor Plate
        const anchorPlate = await buildAnchorPlate(plan);

        // 4) Strict Prompt
        const strictPrompt = buildStrictPrompt(plan, dnaForRender);
        setCompiledPrompt(strictPrompt);

        // 5) References (keep <= 14)
        const refs: { url: string; label: string }[] = [];
        refs.push({ url: anchorPlate, label: "ANCHOR_GUIDE" });

        if (state.backgroundUrl) {
          refs.push({ url: state.backgroundUrl, label: "CLEAN_BG_PLATE" });
        }

        for (const r of plan) {
          refs.push({ url: r.token.url, label: `REGION_${r.region}_REF` });
        }

        // Optional: add active Reference Stack images only if there is remaining headroom
        if (refs.length < 14) {
          const urls = new Set(refs.map(r => r.url));
          for (const rs of getActiveReferenceSlots(state.referenceSlots)) {
            if (!rs.url) continue;
            if (refs.length >= 14) break;
            if (urls.has(rs.url)) continue;
            refs.push({ url: rs.url, label: `REFERENCE ${rs.index} (global consistency)` });
            urls.add(rs.url);
          }
        }

        const limitedRefs = refs.slice(0, 14);
        if (refs.length > 14) {
          dispatch({ type: 'ADD_LOG', payload: { message: `Reference limit hit: using ${limitedRefs.length}/14. Reduce token count for maximum obedience.`, type: 'error' } });
        }

        const img = await GeminiService.generateImage(
          strictPrompt,
          state.apiKey!,
          state.model,
          limitedRefs,
          { aspectRatio: '16:9' }
        );

        dispatch({ type: 'SET_RESULT_IMAGE', payload: img });
        dispatch({ type: 'ADD_LOG', payload: { message: "Strict render complete.", type: 'success' } });
      } else {
        // Loose Mode: unique cast + background references
        const references: { url: string; label: string }[] = [];

        // V3 preference: use Active Reference Stack (Ref 1-10) when available
        const activeRefs = getActiveReferenceSlots(state.referenceSlots);
        if (activeRefs.length > 0) {
          for (const r of activeRefs) {
            if (!r.url) continue;
            references.push({ url: r.url, label: `REFERENCE ${r.index}: ${r.name || r.analysis || ''}`.trim() });
          }
        } else {
          // Fallback: use unique cast assets that appear on stage
          const uniqueCastIds = new Set(state.tokens.map(t => t.castId));
          uniqueCastIds.forEach(id => {
            const member = state.cast.find(c => c.id === id);
            if (member) references.push({ url: member.url, label: `Character: ${member.name}` });
          });
        }

        if (state.backgroundUrl) references.push({ url: state.backgroundUrl, label: "Environment/Lighting Anchor" });
        if (references.length === 0 && state.cast.length > 0) references.push({ url: state.cast[0].url, label: "Style Reference" });

        const loosePrompt = buildLoosePrompt(dnaForRender);
        setCompiledPrompt(loosePrompt);

        const img = await GeminiService.generateImage(
          loosePrompt,
          state.apiKey!,
          state.model,
          references.slice(0, 14),
          { aspectRatio: state.director.aspectRatio }
        );

        dispatch({ type: 'SET_RESULT_IMAGE', payload: img });
        dispatch({ type: 'ADD_LOG', payload: { message: "Render Complete", type: 'success' } });
      }
    } catch (e: any) {
      dispatch({ type: 'ADD_LOG', payload: { message: e.message, type: 'error' } });
    } finally {
      dispatch({ type: 'SET_PROCESSING', payload: false });
    }
  };

  // Status counts
  const tokenProfilesReady = state.tokens.filter(t => !!t.profile).length;
  const tokenProfilesTotal = state.tokens.length;

  return (
    <div className="h-full bg-[#0f0f11] p-8 overflow-y-auto">
      <div className="">
        <div className="bg-[#18181b] rounded-2xl border border-gray-800 p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-yellow-500 via-orange-500 to-red-500"></div>

          <div className="flex justify-between items-start mb-8 gap-6">
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Production Console</h2>
              <p className="text-gray-500 text-sm">Strict compositor mode: anchor plate + region plan + per-token whitelist.</p>
            </div>

            <button
              onClick={handleRender}
              disabled={state.isProcessing}
              className="bg-gradient-to-r from-yellow-500 via-orange-500 to-yellow-600 hover:from-yellow-400 hover:via-orange-400 hover:to-yellow-500 text-black px-10 py-4 rounded-xl font-black text-xl shadow-[0_0_30px_rgba(234,179,8,0.4)] hover:shadow-[0_0_50px_rgba(234,179,8,0.6)] border border-white/20 transition-all flex items-center gap-3 uppercase tracking-[0.1em] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {state.isProcessing ? <RotateCw className="animate-spin w-6 h-6" /> : <MonitorPlay className="w-6 h-6" />}
              RENDER SCENE
            </button>
          </div>

          {/* SUPERPOWER CONTROLS */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="bg-[#09090b] border border-gray-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-gray-400 uppercase">Strict Mode</span>
                <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={strictMode}
                    onChange={(e) => setStrictMode(e.target.checked)}
                    className="accent-yellow-500"
                  />
                  ON
                </label>
              </div>
              <p className="text-[11px] text-gray-500 leading-relaxed">
                Uses Anchor Plate + numbered regions. Freezes pixels outside regions and blocks new objects.
              </p>
            </div>

            <div className="bg-[#09090b] border border-gray-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-gray-400 uppercase">Anchor DNA</span>
                <span className={`text-[10px] font-mono ${dnaStatus === 'ready' ? 'text-green-500' : dnaStatus === 'analyzing' ? 'text-yellow-500' : dnaStatus === 'error' ? 'text-red-500' : 'text-gray-600'}`}>
                  {dnaStatus.toUpperCase()}
                </span>
              </div>

              <div className="flex items-center justify-between mb-3">
                <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoAnchorDNA}
                    onChange={(e) => setAutoAnchorDNA(e.target.checked)}
                    className="accent-yellow-500"
                  />
                   Auto
                </label>

                <button
                  onClick={analyzeBackgroundDNA}
                  disabled={!state.backgroundUrl || !state.apiKey || state.isProcessing}
                  className="text-[10px] bg-gradient-to-r from-gray-700 to-gray-800 hover:from-gray-600 hover:to-gray-700 text-white px-4 py-2 rounded-lg font-black tracking-wider uppercase transition-all disabled:opacity-50 active:scale-95 border border-gray-600/50"
                >
                  Analyze
                </button>
              </div>

              <div className="text-[11px] text-gray-500 space-y-1">
                <div><span className="text-gray-400">ENV:</span> {anchorDNA.environment || <span className="text-gray-700">auto</span>}</div>
                <div><span className="text-gray-400">LIGHT:</span> {anchorDNA.lighting || <span className="text-gray-700">auto</span>}</div>
                <div><span className="text-gray-400">CAM:</span> {anchorDNA.camera || <span className="text-gray-700">auto</span>}</div>
              </div>
            </div>

            <div className="bg-[#09090b] border border-gray-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-gray-400 uppercase">Per-Token Whitelist</span>
                <span className="text-[10px] font-mono text-gray-500">{tokenProfilesReady}/{tokenProfilesTotal}</span>
              </div>

              <div className="flex items-center justify-between mb-3">
                <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoTokenProfiles}
                    onChange={(e) => setAutoTokenProfiles(e.target.checked)}
                    className="accent-yellow-500"
                  />
                  Auto on Render
                </label>

                <button
                  onClick={handleAnalyzeMissingTokenProfiles}
                  disabled={!state.apiKey || state.tokens.length === 0 || state.isProcessing}
                  className="text-[10px] bg-gradient-to-r from-gray-700 to-gray-800 hover:from-gray-600 hover:to-gray-700 text-white px-4 py-2 rounded-lg font-black tracking-wider uppercase transition-all disabled:opacity-50 active:scale-95 border border-gray-600/50"
                >
                  Analyze Missing
                </button>
              </div>

              <p className="text-[11px] text-gray-500 leading-relaxed">
                Generates a strict whitelist per StageToken (identity/wardrobe/accessories/style) and injects it into each numbered region.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8">
            <div className="space-y-6">

              {/* ACTIVE REFERENCES TRAY */}
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase mb-2 flex justify-between">
                  <span>Active Scene References</span>
                  <span className="text-gray-600">{state.tokens.length + (state.backgroundUrl ? 1 : 0)} / 14 Slots (pre-render)</span>
                </label>
                <div className="flex gap-2 p-4 bg-[#09090b] rounded-xl border border-gray-800 overflow-x-auto whitespace-nowrap min-h-[100px] items-center">

                  {/* Background Slot */}
                  {state.backgroundUrl ? (
                    <div 
                      className="inline-block relative group w-16 h-16 flex-shrink-0 cursor-pointer"
                      onClick={() => dispatch({ type: 'SET_INSPECT_IMAGE', payload: state.backgroundUrl! })}
                    >
                      <img src={state.backgroundUrl} className="w-full h-full object-cover rounded border border-blue-500/50" />
                      <div className="absolute inset-0 bg-blue-500/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Maximize className="w-4 h-4 text-white" />
                      </div>
                      <div className="absolute -top-2 -right-2 bg-blue-500 text-black text-[9px] font-bold px-1.5 rounded-full">ENV</div>
                    </div>
                  ) : (
                    <div className="inline-block w-16 h-16 rounded border border-gray-800 border-dashed flex items-center justify-center text-gray-700 flex-shrink-0">
                      <ImagePlus className="w-6 h-6" />
                    </div>
                  )}

                  {/* Token Slots */}
                  {state.tokens.length > 0 ? (
                    state.tokens.map(t => (
                      <div 
                        key={t.id} 
                        className="inline-block relative group w-16 h-16 flex-shrink-0 cursor-pointer"
                        onClick={() => dispatch({ type: 'SET_INSPECT_IMAGE', payload: t.url })}
                      >
                        <img src={t.url} className="w-full h-full object-contain bg-black rounded border border-green-500/50" />
                        <div className="absolute inset-0 bg-green-500/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <Maximize className="w-4 h-4 text-white" />
                        </div>
                        <div className="absolute -top-2 -right-2 bg-green-500 text-black text-[9px] font-bold px-1.5 rounded-full">{t.tag}</div>
                      </div>
                    ))
                  ) : (
                    <span className="text-xs text-gray-600 ml-2">No characters placed on stage.</span>
                  )}

                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Compiled Director's Prompt</label>
                <textarea
                  className={`w-full bg-[#09090b] p-4 rounded-xl border border-gray-800 text-gray-300 font-mono text-xs h-44 overflow-y-auto focus:border-yellow-500 focus:outline-none resize-none ${strictMode ? 'opacity-90' : ''}`}
                  value={compiledPrompt}
                  onChange={(e) => setCompiledPrompt(e.target.value)}
                  readOnly={strictMode}
                />
                {strictMode && (
                  <p className="text-[10px] text-gray-600 mt-2">
                    Strict Mode: prompt is hardwired and read-only to prevent constraint drift.
                  </p>
                )}
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Final Output</label>
              <div className="aspect-video bg-black rounded-xl border border-gray-800 overflow-hidden flex items-center justify-center relative group">
                {state.resultImage ? (
                  <>
                    <img src={state.resultImage} className="w-full h-full object-contain" />
                    
                    {/* Pro Utility Toolbar (Compact Icon-Only Design) */ }
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-6 backdrop-blur-[2px]">
                      <button 
                        onClick={() => dispatch({ type: 'SET_INSPECT_IMAGE', payload: state.resultImage! })}
                        className="w-16 h-16 bg-blue-500/20 hover:bg-blue-600 text-blue-400 hover:text-white rounded-2xl transition-all transform hover:scale-110 flex items-center justify-center border border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.2)]"
                        title="Inspect Large"
                      >
                        <Maximize className="w-10 h-10 stroke-[3]" size={40} />
                      </button>
                      
                      <button 
                        onClick={async () => {
                          if (state.saveDirectoryHandle) {
                            try {
                              const filename = `NB-Rendered-${Date.now()}.png`;
                              const handle = await state.saveDirectoryHandle.getFileHandle(filename, { create: true });
                              const writable = await handle.createWritable();
                              const res = await fetch(state.resultImage!);
                              const blob = await res.blob();
                              await writable.write(blob);
                              await writable.close();
                              dispatch({ type: 'ADD_LOG', payload: { message: `Saved: ${filename}`, type: 'success' } });
                            } catch (e: any) {
                              dispatch({ type: 'ADD_LOG', payload: { message: `Save failed: ${e.message}`, type: 'error' } });
                            }
                          } else {
                            const link = document.createElement('a');
                            link.href = state.resultImage!;
                            link.download = `NB-Rendered-${Date.now()}.png`;
                            link.click();
                          }
                        }}
                        className="w-16 h-16 bg-white/10 hover:bg-white text-white hover:text-black rounded-2xl transition-all transform hover:scale-110 flex items-center justify-center border border-white/20 shadow-[0_0_15px_rgba(255,255,255,0.1)]"
                        title="Download Original"
                      >
                        <Download className="w-10 h-10 stroke-[3]" size={40} />
                      </button>

                      <button 
                        onClick={() => {
                          dispatch({ type: 'SET_BG', payload: state.resultImage! });
                          dispatch({ type: 'SET_VIEW', payload: 'blocking' });
                          dispatch({ type: 'ADD_LOG', payload: { message: "Sent to Blocking", type: 'success' } });
                        }}
                        className="w-16 h-16 bg-yellow-500/20 hover:bg-yellow-500 text-yellow-500 hover:text-black rounded-2xl transition-all transform hover:scale-110 flex items-center justify-center border border-yellow-500/30 shadow-[0_0_15px_rgba(234,179,8,0.2)]"
                        title="Send to Blocking"
                      >
                        <BoxSelect className="w-10 h-10 stroke-[3]" size={40} />
                      </button>

                      <button 
                        onClick={() => {
                          dispatch({ 
                            type: 'SET_STORYBOARD_SOURCE', 
                            payload: { url: state.resultImage!, dna: compiledPrompt } 
                          });
                          dispatch({ type: 'ADD_LOG', payload: { message: "Sent to Start Plate", type: 'success' } });
                          dispatch({ type: 'SET_VIEW', payload: 'veo' });
                        }}
                        className="w-16 h-16 bg-blue-500/20 hover:bg-blue-600 text-blue-400 hover:text-white rounded-2xl transition-all font-black text-[9px] flex flex-col items-center justify-center border border-blue-500/30 gap-1"
                        title="Set as Start Plate"
                      >
                        <Clapperboard className="w-6 h-6" />
                        START
                      </button>

                      <button 
                        onClick={() => {
                          dispatch({ 
                            type: 'SET_STORYBOARD_END_SOURCE', 
                            payload: { url: state.resultImage!, dna: compiledPrompt } 
                          });
                          dispatch({ type: 'ADD_LOG', payload: { message: "Sent to End Plate", type: 'success' } });
                          dispatch({ type: 'SET_VIEW', payload: 'veo' });
                        }}
                        className="w-16 h-16 bg-indigo-500/20 hover:bg-indigo-600 text-indigo-400 hover:text-white rounded-2xl transition-all font-black text-[9px] flex flex-col items-center justify-center border border-indigo-500/30 gap-1"
                        title="Set as End Plate"
                      >
                        <Clapperboard className="w-6 h-6" />
                        END
                      </button>

                      <button 
                        onClick={() => dispatch({ type: 'SET_RESULT_IMAGE', payload: null })}
                        className="w-16 h-16 bg-red-500/20 hover:bg-red-500 text-red-500 hover:text-white rounded-2xl transition-all transform hover:scale-110 flex items-center justify-center border border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.2)]"
                        title="Delete Result"
                      >
                        <Trash2 className="w-10 h-10 stroke-[3]" size={40} />
                      </button>
                    </div>

                  </>
                ) : (
                  <div className="text-gray-700 flex flex-col items-center">
                    {state.isProcessing ? (
                      <div className="loader w-8 h-8 border-4 border-gray-800 border-t-yellow-500 rounded-full animate-spin mb-4"></div>
                    ) : (
                      <ImageIcon className="w-12 h-12 mb-2 opacity-20" />
                    )}
                    <span className="text-xs font-mono opacity-50">{state.isProcessing ? 'GENERATING PIXELS...' : 'Waiting for render'}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default ProductionConsole;
