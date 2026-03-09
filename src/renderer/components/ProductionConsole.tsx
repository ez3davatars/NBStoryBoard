import React, { useState, useEffect, useRef } from 'react';
import {
 RotateCw, MonitorPlay, Maximize, ImagePlus, Download,
 BoxSelect, Clapperboard, Trash2, Image as ImageIcon, User, FileText
} from 'lucide-react';
import { useAppContext, APP_SCHEMA_VERSION } from '../context/AppContext';
import { GeminiService } from '../services/GeminiService';
import { StorageService } from '../services/StorageService';
import {
 buildMasterStyleKeywords,
 mergeNegatives,
 SCENE_LOCK_NEGATIVE_TOKENS,
 getActiveReferenceSlots,
 compileV3DirectorPrompt,
 buildContinuityLockBlock
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

 // Shots (storyboard) support (added in AppContext)
 const activeShot = React.useMemo(() => {
 if (!('shots' in state) || !('activeShotId' in state)) return null as any;
 const shots = (state as any).shots as any[];
 const id = (state as any).activeShotId as string | null;
 if (!id) return null;
 return shots.find(s => s.id === id) || null;
 }, [state]);

 const sanitizeName = (name: string) =>
 name.replace(/[^a-z0-9-_ ]/gi, '').trim().replace(/\s+/g, '_').slice(0, 50) || 'Shot';

 const writeFileToDir = async (dir: FileSystemDirectoryHandle, filename: string, blob: Blob) => {
 const handle = await dir.getFileHandle(filename, { create: true });
 const writable = await handle.createWritable();
 await writable.write(blob);
 await writable.close();
 };

 const writeDataUrlPng = async (dir: FileSystemDirectoryHandle, filename: string, dataUrl: string) => {
 const res = await fetch(dataUrl);
 const blob = await res.blob();
 await writeFileToDir(dir, filename, blob);
 };

 const writeTextFile = async (dir: FileSystemDirectoryHandle, filename: string, text: string) => {
 await writeFileToDir(dir, filename, new Blob([text], { type: 'text/plain' }));
 };

 const redactStateForDiagnostics = () => {
 const { apiKey, saveDirectoryHandle, ...rest } = state as any;
 return {
 ...rest,
 apiKey: apiKey ? `REDACTED_${String(apiKey).length}` : '',
 hasSaveDirectory: Boolean(saveDirectoryHandle),
 };
 };

 const handleExportDiagnostics = async () => {
 if (!state.saveDirectoryHandle) {
 dispatch({ type: 'ADD_LOG', payload: { message: 'No save directory selected (Settings).', type: 'error' } });
 return;
 }
 try {
 const root = await state.saveDirectoryHandle.getDirectoryHandle('Diagnostics', { create: true });
 const folderName = `DIAG-${Date.now()}`;
 const dir = await root.getDirectoryHandle(folderName, { create: true });

 const schemaLocal = localStorage.getItem('nano_schema_version') || '';
 const schemaStored = await StorageService.load<number>('nano_schema_version', 0);

 const diag = {
 app: 'NBStoryBoard',
 createdAt: new Date().toISOString(),
 appSchemaVersion: APP_SCHEMA_VERSION,
 schemaLocalStorage: schemaLocal,
 schemaStorageService: schemaStored,
 userAgent: navigator.userAgent,
 view: state.view,
 activeShotId: (state as any).activeShotId ?? null,
 shotCount: (state as any).shots?.length ?? 0,
 note: 'State snapshot is redacted (apiKey removed).',
 state: redactStateForDiagnostics(),
 logs: state.logs?.slice(-200) ?? [],
 };

 await writeFileToDir(dir, 'diagnostics.json', new Blob([JSON.stringify(diag, null, 2)], { type: 'application/json' }));
 await writeTextFile(dir, 'logs.txt', (state.logs || []).slice(-200).map(l => `${l.timestamp} [${l.type}] ${l.message}`).join('\n'));

 dispatch({ type: 'ADD_LOG', payload: { message: `Diagnostics exported: Diagnostics/${folderName}`, type: 'success' } });
 } catch (e: any) {
 dispatch({ type: 'ADD_LOG', payload: { message: `Diagnostics export failed: ${e?.message || e}`, type: 'error' } });
 }
 };

 const verifyFilesExist = async (dir: FileSystemDirectoryHandle, required: string[]) => {
 const missing: string[] = [];
 for (const name of required) {
 try {
 await dir.getFileHandle(name);
 } catch {
 missing.push(name);
 }
 }
 return missing;
 };


 // Export Region Edit assets (masks/prompts/outputs) into a shot folder
 const exportRegionEditAssets = async (shotDir: FileSystemDirectoryHandle, regionEdit: any) => {
 try {
 if (!regionEdit) return;

 const regionDir = await shotDir.getDirectoryHandle('region_edit', { create: true });

 // Protection mask (white = protected)
 if (regionEdit.protectMaskDataUrl) {
 await writeDataUrlPng(regionDir, 'protect_mask.png', regionEdit.protectMaskDataUrl);
 }
 await writeTextFile(regionDir, 'protect_enabled.txt', String(Boolean(regionEdit.protectEnabled)));

 // Queue JSON snapshot
 await writeFileToDir(
 regionDir,
 'queue.json',
 new Blob([JSON.stringify(regionEdit, null, 2)], { type: 'application/json' })
 );

 // Per-layer assets
 const layers: any[] = Array.isArray(regionEdit.layers) ? regionEdit.layers : [];
 const outDir = await regionDir.getDirectoryHandle('outputs', { create: true });

 for (const layer of layers) {
 const id = String(layer.id || '').toUpperCase();
 const safeId = id && ['A', 'B', 'C'].includes(id) ? id : 'X';

 // prompt
 await writeTextFile(regionDir, `prompt_${safeId}.txt`, layer.prompt || '');

 // mask
 if (layer.maskDataUrl) {
 await writeDataUrlPng(regionDir, `mask_${safeId}.png`, layer.maskDataUrl);
 }

 // output
 if (layer.lastOutputUrl) {
 await writeDataUrlPng(outDir, `out_${safeId}.png`, layer.lastOutputUrl);
 }
 }
 } catch (e: any) {
 dispatch({ type: 'ADD_LOG', payload: { message: `Region edit export warning: ${e?.message || e}`, type: 'error' } });
 }
 };

 const handleSaveActiveShot = () => {
 if (!activeShot) {
 dispatch({ type: 'ADD_LOG', payload: { message: 'No active shot selected.', type: 'error' } });
 return;
 }
 dispatch({ type: 'SAVE_ACTIVE_SHOT', payload: { touchUpdatedAt: true } } as any);
 dispatch({ type: 'ADD_LOG', payload: { message: `Saved snapshot for shot: ${activeShot.name}`, type: 'success' } });
 };

 const handleSetShotFrame = (which: 'start' | 'end') => {
 if (!activeShot) {
 dispatch({ type: 'ADD_LOG', payload: { message: 'No active shot selected.', type: 'error' } });
 return;
 }
 if (!state.resultImage) {
 dispatch({ type: 'ADD_LOG', payload: { message: 'No result image to set as a frame.', type: 'error' } });
 return;
 }
 dispatch({ type: 'SET_SHOT_FRAME', payload: { id: activeShot.id, which, url: state.resultImage } } as any);
 dispatch({ type: 'ADD_LOG', payload: { message: `Set ${which.toUpperCase()} frame for shot: ${activeShot.name}`, type: 'success' } });
 };

 const handleExportActiveShotPack = async () => {
 if (!activeShot) {
 dispatch({ type: 'ADD_LOG', payload: { message: 'No active shot selected.', type: 'error' } });
 return;
 }
 if (!state.saveDirectoryHandle) {
 dispatch({ type: 'ADD_LOG', payload: { message: 'No save directory selected (Settings).', type: 'error' } });
 return;
 }

 dispatch({ type: 'SET_PROCESSING', payload: true });
 try {
 // Ensure snapshot is current
 dispatch({ type: 'SAVE_ACTIVE_SHOT', payload: { touchUpdatedAt: true } } as any);

 const root = await state.saveDirectoryHandle.getDirectoryHandle('ShotPacks', { create: true });
 const folderName = `SHOT-${Date.now()}-${sanitizeName(activeShot.name)}`;
 const shotDir = await root.getDirectoryHandle(folderName, { create: true });

 // Build pack metadata from current state (so it's always up-to-date)
 const pack = {
 app: 'NBStoryBoard',
 exportedAt: new Date().toISOString(),
 shot: {
 id: activeShot.id,
 name: activeShot.name,
 createdAt: activeShot.createdAt,
 updatedAt: Date.now(),
 notes: activeShot.notes || '',
 },
 render: {
 strictMode,
 model: state.model,
 aspectRatio: state.director.aspectRatio,
 },
 director: state.director,
 anchorDNA,
 compiledPrompt,
 stage: {
 backgroundUrl: state.backgroundUrl || null,
 tokens: state.tokens.map(t => ({
 id: t.id,
 tag: t.tag,
 castId: t.castId,
 x: t.x, y: t.y, width: t.width, height: t.height,
 rotation: t.rotation,
 scaleX: t.scaleX, scaleY: t.scaleY,
 anchorX: t.anchorX, anchorY: t.anchorY,
 zIndex: t.zIndex,
 actionNote: t.actionNote || '',
 intelligence: t.intelligence || '',
 })),
 annotations: state.annotations,
 referenceSlots: state.referenceSlots,
 },
 frames: {
 start: ((activeShot as any).startFrameUrl ?? null) as string | null,
 end: ((activeShot as any).endFrameUrl ?? null) as string | null,
 lastResult: state.resultImage || null,
 }
 };

 await writeFileToDir(shotDir, 'shot.json', new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' }));
 await writeFileToDir(shotDir, 'prompt.txt', new Blob([compiledPrompt || ''], { type: 'text/plain' }));

 // Save images (best-effort)
 if (state.backgroundUrl) await writeDataUrlPng(shotDir, 'background.png', state.backgroundUrl);
 if ((activeShot as any).startFrameUrl) await writeDataUrlPng(shotDir, 'start.png', (activeShot as any).startFrameUrl);
 if ((activeShot as any).endFrameUrl) await writeDataUrlPng(shotDir, 'end.png', (activeShot as any).endFrameUrl);
 if (state.resultImage) await writeDataUrlPng(shotDir, 'last_result.png', state.resultImage);

 // Save active references + token cutouts used
 const refsDir = await shotDir.getDirectoryHandle('refs', { create: true });
 const activeRefs = getActiveReferenceSlots(state.referenceSlots);
 for (const r of activeRefs) {
 if (!r.url) continue;
 await writeDataUrlPng(refsDir, `ref_${r.index}.png`, r.url);
 }

 const tokensDir = await shotDir.getDirectoryHandle('tokens', { create: true });
 for (const t of state.tokens) {
 if (!t.url) continue;
 await writeDataUrlPng(tokensDir, `token_${sanitizeName(t.tag || t.id)}.png`, t.url);
 }

 // Region edit assets (masks/prompts/outputs)
 await exportRegionEditAssets(shotDir, state.regionEdit);

 // Export integrity check
 const required = ['shot.json', 'prompt.txt'];
 if (state.backgroundUrl) required.push('background.png');
 if ((activeShot as any).startFrameUrl) required.push('start.png');
 if ((activeShot as any).endFrameUrl) required.push('end.png');
 const missing = await verifyFilesExist(shotDir, required);
 if (missing.length > 0) {
 dispatch({ type: 'ADD_LOG', payload: { message: `Shot Pack exported with missing files: ${missing.join(', ')}`, type: 'error' } });
 } else {
 dispatch({ type: 'ADD_LOG', payload: { message: `Shot Pack exported: ShotPacks/${folderName}`, type: 'success' } });
 }
 } catch (e: any) {
 dispatch({ type: 'ADD_LOG', payload: { message: `Shot Pack export failed: ${e.message || e}`, type: 'error' } });
 } finally {
 dispatch({ type: 'SET_PROCESSING', payload: false });
 }
 };
 const handleExportAllShotPacks = async () => {
 if (!state.saveDirectoryHandle) {
 dispatch({ type: 'ADD_LOG', payload: { message: 'No save directory selected (Settings).', type: 'error' } });
 return;
 }
 const shots = state.shots || [];
 if (shots.length === 0) {
 dispatch({ type: 'ADD_LOG', payload: { message: 'No shots available to export.', type: 'error' } });
 return;
 }

 dispatch({ type: 'SET_PROCESSING', payload: true });
 try {
 const root = await state.saveDirectoryHandle.getDirectoryHandle('ShotPacks', { create: true });
 const batchName = `BATCH-${Date.now()}`;
 const batchDir = await root.getDirectoryHandle(batchName, { create: true });

 const manifest: any = {
 app: 'NBStoryBoard',
 exportedAt: new Date().toISOString(),
 batch: batchName,
 shotCount: shots.length,
 shots: [] as any[],
 };

 for (let i = 0; i < shots.length; i++) {
 const shot = shots[i];
 const shotName = sanitizeName(shot.name || `Shot_${i + 1}`);
 const folderName = `SHOT-${String(i + 1).padStart(2, '0')}-${shotName}`;
 const shotDir = await batchDir.getDirectoryHandle(folderName, { create: true });

 const promptForShot = compileV3DirectorPrompt(shot.director, shot.referenceSlots, shot.tokens);

 const pack = {
 app: 'NBStoryBoard',
 exportedAt: new Date().toISOString(),
 shot: {
 id: shot.id,
 name: shot.name,
 createdAt: shot.createdAt,
 updatedAt: shot.updatedAt,
 notes: shot.notes || '',
 index: i + 1,
 },
 director: shot.director,
 anchorDNA: {
 environment: shot.director.environment,
 lighting: shot.director.lighting,
 camera: shot.director.camera,
 },
 compiledPrompt: promptForShot,
 stage: {
 backgroundUrl: shot.backgroundUrl || null,
 tokens: shot.tokens,
 annotations: shot.annotations,
 referenceSlots: shot.referenceSlots,
 },
 frames: {
 start: shot.startFrameUrl ?? null,
 end: shot.endFrameUrl ?? null,
 }
 };

 await writeFileToDir(shotDir, 'shot.json', new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' }));
 await writeFileToDir(shotDir, 'prompt.txt', new Blob([promptForShot || ''], { type: 'text/plain' }));

 if (shot.backgroundUrl) await writeDataUrlPng(shotDir, 'background.png', shot.backgroundUrl);
 if (shot.startFrameUrl) await writeDataUrlPng(shotDir, 'start.png', shot.startFrameUrl);
 if (shot.endFrameUrl) await writeDataUrlPng(shotDir, 'end.png', shot.endFrameUrl);

 const refsDir = await shotDir.getDirectoryHandle('refs', { create: true });
 const activeRefs = getActiveReferenceSlots(shot.referenceSlots);
 for (const r of activeRefs) {
 if (!r.url) continue;
 await writeDataUrlPng(refsDir, `ref_${r.index}.png`, r.url);
 }

 const tokensDir = await shotDir.getDirectoryHandle('tokens', { create: true });
 for (const t of shot.tokens) {
 if (!t.url) continue;
 const tag = t.tag || t.id;
 await writeDataUrlPng(tokensDir, `token_${sanitizeName(tag)}.png`, t.url);
 }

 // Region edit assets for this shot (if present)
 await exportRegionEditAssets(shotDir, (shot as any).regionEdit);

 manifest.shots.push({
 id: shot.id,
 name: shot.name,
 folder: `ShotPacks/${batchName}/${folderName}`,
 startFrame: !!shot.startFrameUrl,
 endFrame: !!shot.endFrameUrl,
 });
 }

 await writeFileToDir(batchDir, 'manifest.json', new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }));

 dispatch({ type: 'ADD_LOG', payload: { message: `Exported ALL shot packs: ShotPacks/${batchName}`, type: 'success' } });
 } catch (e: any) {
 dispatch({ type: 'ADD_LOG', payload: { message: `Export ALL shot packs failed: ${e.message || e}`, type: 'error' } });
 } finally {
 dispatch({ type: 'SET_PROCESSING', payload: false });
 }
 };



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

 // Correct for Anchor Point (t.x/t.y is the anchor, e.g. center/bottom)
 // We need Top-Left for BBOX
 const ax = t.anchorX ?? 0.5;
 const ay = t.anchorY ?? 0.8;
 const tlx = t.x - (t.width * ax);
 const tly = t.y - (t.height * ay);

 const nx = (tlx / STAGE_W).toFixed(3);
 const ny = (tly / STAGE_H).toFixed(3);
 const nw = (t.width / STAGE_W).toFixed(3);
 const nh = (t.height / STAGE_H).toFixed(3);

 const flip = t.scaleX < 0 ? "true" : "false";

 return [
 `REGION ${r.region}:`,
 `- BBOX_NORM: x=${nx}, y=${ny}, w=${nw}, h=${nh}`,
 `- BBOX_ABS: x=${Math.round(tlx * RENDER_SCALE)}px, y=${Math.round(tly * RENDER_SCALE)}px, w=${Math.round(t.width * RENDER_SCALE)}px, h=${Math.round(t.height * RENDER_SCALE)}px`,
 `- TRANSFORM: rotation_deg=${t.rotation}, flipX=${flip}, zIndex=${t.zIndex}`,
 `- USE_REFERENCE: IMAGE labeled "REGION ${r.region} REFERENCE"`,
 `- ALLOWED_IDENTITY: ${p.identity || "none"}`,
 `- ALLOWED_WARDROBE: ${p.wardrobe || "none"}`,
 `- ALLOWED_ACCESSORIES: ${p.accessories || "none"}`,
 `- STYLE_LOCK: ${p.style || "none"}`,
 `- ACTION: ${t.actionNote || "maintain anchor pose"}`,
 `- INTELLIGENCE: ${t.intelligence || "none"}`,
 `- FACE_FIDELITY: MAXIMUM. Do not denoise or simplify facial features. Use pixel details from "REGION ${r.region} REFERENCE".`,
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

 // Create strong continuity lock for strict mode
 const continuityBlock = buildContinuityLockBlock({
 identityLocks: ["ALL ACTORS"],
 lockStyle: true,
 noMorph: true,
 noExtraObjects: true
 });

 const rules = [
 refStackBlock ? `### REFERENCE CONSISTENCY STACK:\n${refStackBlock}\n` : "",
 masterStyleLine,
 safetyLine,
 continuityBlock,
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
 "- LIGHTING OVERRIDE: Absolutely DO NOT carry over the original lighting from the character references. You MUST re-light the characters entirely from scratch to naturally match the environment's ambient light and the specified Cinematography lighting.",
 "- NEGATIVE SPACE: Ignore any solid or white studio backgrounds present in the REGION_REFS. Treat flat white areas (such as inside a hollow helmet, or between arms and torso) as transparent, and fill them perfectly with the scene environment.",
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

 p += `Character ${i + 1} (${t.tag}) is ${posH} at vertical level ${(relY * 100).toFixed(0)}%`;
 if (t.actionNote) p += `, doing action: ${t.actionNote}`;
 if (t.intelligence) p += `, with intelligence directives: ${t.intelligence}`;
 p += ". ";
 });

 const notes = state.annotations.filter(a => a.type === 'note' && a.text).map(a => a.text).join(". ");
 if (notes) p += ` DIRECTOR NOTES: ${notes}.`;

 if (dna.environment) p += ` ENVIRONMENT: ${dna.environment}.`;
 if (dna.camera) p += ` CAMERA: ${dna.camera}.`;
 if (dna.lighting) p += ` LIGHTING: ${dna.lighting}.`;

 const constraints = " CRITICAL PERMISSION RULES: Do NOT add any new people, furniture, or objects that are not explicitly described. Do NOT rearrange the scene layout. Maintain empty space. No text/watermarks. NEGATIVE SPACE REPAIR: Treat solid white/gray studio backgrounds or gaps between character limbs/accessories as empty space and fill them perfectly with the scene Environment. LIGHTING OVERRIDE: Re-light all characters to match the ambient Environment light; ignore original reference lighting.";

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

 const ax = (t.anchorX ?? 0.5) * t.width;
 const ay = (t.anchorY ?? 0.8) * t.height;

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

 let currentPercent = 5;
 dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: { percent: currentPercent, text: "Analyzing Character Profiles" } });
 const etaMs = 15000;
 const increment = (1000 / etaMs) * 100;
 const progressInterval = window.setInterval(() => {
 currentPercent += increment;
 if (currentPercent > 95) currentPercent = 95;

 let text = "Analyzing Character Profiles";
 if (currentPercent > 50) text = "Extracting Identity Data...";
 if (currentPercent >= 95) text = "Finalizing Analysis... (Still working, please wait)";

 dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: { percent: currentPercent, text } });
 }, 1000);

 try {
 await ensureTokenProfiles(state.tokens, { force: true });
 } finally {
 clearInterval(progressInterval);
 dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: null });
 dispatch({ type: 'SET_PROCESSING', payload: false });
 }
 };

 const handleRender = async () => {
 dispatch({ type: 'SET_PROCESSING', payload: true });

 let currentPercent = 5;
 dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: { percent: currentPercent, text: "Initializing Production Render" } });
 const etaMs = state.imageResolution === '4K' ? 45000 : 30000;
 const increment = (1000 / etaMs) * 100;
 const progressInterval = window.setInterval(() => {
 currentPercent += increment;
 if (currentPercent > 95) currentPercent = 95;

 let text = "Initializing Production Render";
 if (currentPercent > 20) text = "Building Spatial Composition Plan...";
 if (currentPercent > 40) text = "Compiling Director Prompt...";
 if (currentPercent > 60) text = "Rendering Cinematic Shot...";
 if (currentPercent >= 95) text = "Rendering Cinematic Shot... (Still working, please wait)";

 dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: { percent: currentPercent, text } });
 }, 1000);

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
 { aspectRatio: '16:9', imageSize: state.imageResolution, thinkingLevel: state.enableImageThinking, googleGrounding: state.enableGoogleGrounding }
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
 { aspectRatio: state.director.aspectRatio, imageSize: state.imageResolution, thinkingLevel: state.enableImageThinking, googleGrounding: state.enableGoogleGrounding }
 );

 dispatch({ type: 'SET_RESULT_IMAGE', payload: img });
 dispatch({ type: 'ADD_LOG', payload: { message: "Render Complete", type: 'success' } });
 }
 } catch (e: any) {
 dispatch({ type: 'ADD_LOG', payload: { message: e.message, type: 'error' } });
 } finally {
 clearInterval(progressInterval);
 dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: null });
 dispatch({ type: 'SET_PROCESSING', payload: false });
 }
 };

 // Status counts
 const tokenProfilesReady = state.tokens.filter(t => !!t.profile).length;
 const tokenProfilesTotal = state.tokens.length;

 return (
 <div className="h-full bg-[#0f0f11] p-8 overflow-y-auto">
 <div className="">
 <div className="bg-[#18181b] rounded-2xl border border-gray-800 p-8 relative overflow-hidden">
 <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-yellow-500 via-orange-500 to-red-500"></div>

 <div className="flex justify-between items-start mb-8 gap-6">
 <div>
 <h2 className="text-2xl font-bold text-white mb-2">Production Console</h2>
 <p className="text-gray-500 text-sm">Strict compositor mode: anchor plate + region plan + per-token whitelist.</p>
 </div>

 <button
 onClick={handleRender}
 disabled={state.isProcessing}
 className="bg-gradient-to-r from-yellow-500 via-orange-500 to-yellow-600 hover:from-yellow-400 hover:via-orange-400 hover:to-yellow-500 text-black px-10 py-4 rounded-xl font-black text-xl -[0_0_30px_rgba(234,179,8,0.4)] hover:-[0_0_50px_rgba(234,179,8,0.6)] border border-white/20 transition-all flex items-center gap-3 uppercase tracking-[0.1em] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
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

 {/* SHOT PACK CONTROLS (Storyboarding) - Conditional */}
 {state.isStoryboardEnabled && (
 <div className="flex flex-wrap items-center justify-between gap-3 mb-8 bg-[#09090b] border border-gray-800 rounded-xl p-4">
 <div className="flex items-center gap-3">
 <div className="text-xs font-bold text-gray-400 uppercase">
 Active Shot: <span className="text-gray-200">{activeShot ? activeShot.name : 'None'}</span>
 </div>
 {!activeShot && (
 <button
 onClick={() => dispatch({ type: 'ADD_SHOT_FROM_STAGE', payload: {} } as any)}
 className="flex justify-center items-center h-6 px-3 bg-yellow-500/20 text-yellow-500 hover:bg-yellow-500/40 rounded-md text-[10px] font-black uppercase tracking-wider transition-colors border border-yellow-500/30"
 >
 Create New Shot
 </button>
 )}
 </div>
 <div className="flex flex-wrap items-center gap-2">
 <button
 onClick={handleSaveActiveShot}
 disabled={!activeShot || state.isProcessing}
 className="text-[10px] bg-gradient-to-r from-gray-700 to-gray-800 hover:from-gray-600 hover:to-gray-700 text-white px-4 py-2 rounded-lg font-black tracking-wider uppercase transition-all disabled:opacity-50 active:scale-95 border border-gray-600/50"
 title="Save the current stage snapshot into the active shot"
 >
 Save Shot Snapshot
 </button>

 <button
 onClick={() => handleSetShotFrame('start')}
 disabled={!activeShot || !state.resultImage || state.isProcessing}
 className="text-[10px] bg-gradient-to-r from-blue-700 to-blue-800 hover:from-blue-600 hover:to-blue-700 text-white px-4 py-2 rounded-lg font-black tracking-wider uppercase transition-all disabled:opacity-50 active:scale-95 border border-blue-600/50"
 title="Set current result image as the START keyframe for the active shot"
 >
 Set Start Frame
 </button>

 <button
 onClick={() => handleSetShotFrame('end')}
 disabled={!activeShot || !state.resultImage || state.isProcessing}
 className="text-[10px] bg-gradient-to-r from-indigo-700 to-indigo-800 hover:from-indigo-600 hover:to-indigo-700 text-white px-4 py-2 rounded-lg font-black tracking-wider uppercase transition-all disabled:opacity-50 active:scale-95 border border-indigo-600/50"
 title="Set current result image as the END keyframe for the active shot"
 >
 Set End Frame
 </button>

 <button
 onClick={handleExportActiveShotPack}
 disabled={!activeShot || state.isProcessing}
 className="text-[10px] bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 text-black px-4 py-2 rounded-lg font-black tracking-wider uppercase transition-all disabled:opacity-50 active:scale-95 border border-white/10"
 title="Export a Veo-ready pack (frames, prompt, refs, tokens) to your selected save directory"
 >
 Export Shot Pack
 </button>


 <button
 onClick={handleExportAllShotPacks}
 disabled={!state.saveDirectoryHandle || state.shots.length === 0 || state.isProcessing}
 className="text-[10px] bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-black px-4 py-2 rounded-lg font-black tracking-wider uppercase transition-all disabled:opacity-50 active:scale-95 border border-white/10"
 title="Export ALL shots as packs (writes manifest.json + per-shot folders)"
 >
 Export All Shot Packs
 </button>
 <button
 onClick={handleExportDiagnostics}
 disabled={!state.saveDirectoryHandle}
 className="text-[10px] bg-white/10 hover:bg-white/20 text-white font-black uppercase tracking-[0.2em] px-4 py-3 rounded-xl transition-all disabled:opacity-50 active:scale-95 border border-white/10"
 title="Export redacted diagnostics bundle for support"
 >
 Export Diagnostics
 </button>
 </div>
 </div>
 )}

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

 {/* Pro Utility Toolbar (Compact Icon-Only Design) */}
 <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-6 backdrop-blur-[2px]">
 <button
 onClick={() => dispatch({ type: 'SET_INSPECT_IMAGE', payload: state.resultImage! })}
 className="w-16 h-16 bg-blue-500/20 hover:bg-blue-600 text-blue-400 hover:text-white rounded-2xl transition-all transform hover:scale-110 flex items-center justify-center border border-blue-500/30 -[0_0_15px_rgba(59,130,246,0.2)]"
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
 className="w-16 h-16 bg-white/10 hover:bg-white text-white hover:text-black rounded-2xl transition-all transform hover:scale-110 flex items-center justify-center border border-white/20 -[0_0_15px_rgba(255,255,255,0.1)]"
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
 className="w-16 h-16 bg-yellow-500/20 hover:bg-yellow-500 text-yellow-500 hover:text-black rounded-2xl transition-all transform hover:scale-110 flex items-center justify-center border border-yellow-500/30 -[0_0_15px_rgba(234,179,8,0.2)]"
 title="Send to Blocking"
 >
 <BoxSelect className="w-10 h-10 stroke-[3]" size={40} />
 </button>

 <button
 onClick={() => {
 dispatch({ type: 'SET_LAST_CASTED_IMAGE', payload: state.resultImage! });
 dispatch({ type: 'SET_VIEW', payload: 'casting' });
 dispatch({ type: 'ADD_LOG', payload: { message: "Sent to Casting Forge", type: 'success' } });
 }}
 className="w-16 h-16 bg-purple-500/20 hover:bg-purple-500 text-purple-500 hover:text-white rounded-2xl transition-all transform hover:scale-110 flex items-center justify-center border border-purple-500/30 -[0_0_15px_rgba(168,85,247,0.2)]"
 title="Send to Casting Forge"
 >
 <User className="w-10 h-10 stroke-[3]" size={40} />
 </button>

 {state.isStoryboardEnabled && (
 <button
 onClick={() => {
 dispatch({
 type: 'SET_STORYBOARD_SOURCE',
 payload: { url: state.resultImage!, dna: compiledPrompt }
 });
 if (activeShot) dispatch({ type: 'SET_SHOT_FRAME', payload: { id: activeShot.id, which: 'start', url: state.resultImage! } } as any);
 dispatch({ type: 'ADD_LOG', payload: { message: "Sent to Start Plate", type: 'success' } });
 dispatch({ type: 'SET_VIEW', payload: 'veo' });
 }}
 className="w-16 h-16 bg-blue-500/20 hover:bg-blue-600 text-blue-400 hover:text-white rounded-2xl transition-all font-black text-[9px] flex flex-col items-center justify-center border border-blue-500/30 gap-1"
 title="Set as Start Plate"
 >
 <Clapperboard className="w-6 h-6" />
 START
 </button>
 )}

 {state.isStoryboardEnabled && (
 <button
 onClick={() => {
 dispatch({
 type: 'SET_STORYBOARD_END_SOURCE',
 payload: { url: state.resultImage!, dna: compiledPrompt }
 });
 if (activeShot) dispatch({ type: 'SET_SHOT_FRAME', payload: { id: activeShot.id, which: 'end', url: state.resultImage! } } as any);
 dispatch({ type: 'ADD_LOG', payload: { message: "Sent to End Plate", type: 'success' } });
 dispatch({ type: 'SET_VIEW', payload: 'veo' });
 }}
 className="w-16 h-16 bg-indigo-500/20 hover:bg-indigo-600 text-indigo-400 hover:text-white rounded-2xl transition-all font-black text-[9px] flex flex-col items-center justify-center border border-indigo-500/30 gap-1"
 title="Set as End Plate"
 >
 <Clapperboard className="w-6 h-6" />
 END
 </button>
 )}

 {state.isStoryboardEnabled && (
 <button
 onClick={() => {
 dispatch({ type: 'SET_VIEW', payload: 'veo' });
 }}
 className="w-16 h-16 bg-emerald-500/20 hover:bg-emerald-600 text-emerald-400 hover:text-white rounded-2xl transition-all font-black text-[9px] flex flex-col items-center justify-center border border-emerald-500/30 gap-1"
 title="Open Prompt Builder"
 >
 <FileText className="w-6 h-6" />
 PROMPT
 </button>
 )}

 <button
 onClick={() => dispatch({ type: 'SET_RESULT_IMAGE', payload: null })}
 className="w-16 h-16 bg-red-500/20 hover:bg-red-500 text-red-500 hover:text-white rounded-2xl transition-all transform hover:scale-110 flex items-center justify-center border border-red-500/30 -[0_0_15px_rgba(239,68,68,0.2)]"
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


