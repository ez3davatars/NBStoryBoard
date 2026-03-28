import { useState, useRef, useEffect, useCallback } from 'react';
import type { AppState, Action, StageToken, WhitelistProfile } from '../context/AppContext';
import { GeminiService } from '../services/GeminiService';

export const useAdvancedRender = (state: AppState, dispatch: React.Dispatch<Action>) => {
    const [strictMode, setStrictMode] = useState(true);
    const [autoAnchorDNA, setAutoAnchorDNA] = useState(true);
    const [autoTokenProfiles, setAutoTokenProfiles] = useState(true);
    const [dnaStatus, setDnaStatus] = useState<'idle' | 'analyzing' | 'ready' | 'error'>('idle');
    const lastDnaBgRef = useRef<string | null>(null);

    const anchorDNA = {
        environment: state.director?.environment || '',
        lighting: state.director?.lighting || '',
        camera: state.director?.camera || '',
    };

    const safeParseJson = (raw: string): any | null => {
        try {
            const cleaned = raw.replace(/```json/g, '').replace(/```/g, '').trim();
            return JSON.parse(cleaned);
        } catch {
            return null;
        }
    };

    const analyzeBackgroundDNA = useCallback(async (): Promise<{ environment: string; lighting: string; camera: string } | null> => {
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
    }, [state.backgroundUrl, state.apiKey, state.model, dispatch]);

    // Auto DNA on background change
    useEffect(() => {
        if (!autoAnchorDNA || !state.backgroundUrl || !state.apiKey) return;
        if (state.director?.environment || state.director?.lighting || state.director?.camera) return;
        if (lastDnaBgRef.current === state.backgroundUrl) return;

        analyzeBackgroundDNA();
    }, [autoAnchorDNA, state.backgroundUrl, state.apiKey, state.director?.environment, state.director?.lighting, state.director?.camera, analyzeBackgroundDNA]);

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

        const cache = new Map<string, WhitelistProfile>();

        for (const t of missing) {
            try {
                if (!t.url) continue;
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

    const handleAnalyzeMissingTokenProfiles = async () => {
        if (!state.apiKey || state.tokens.length === 0) return;
        dispatch({ type: 'SET_PROCESSING', payload: true });
        try {
            await ensureTokenProfiles(state.tokens, { force: true });
        } finally {
            dispatch({ type: 'SET_PROCESSING', payload: false });
        }
    };

    const tokenProfilesReady = state.tokens.filter((t: any) => !!t.profile).length;
    const tokenProfilesTotal = state.tokens.length;

    return {
        strictMode,
        setStrictMode,
        autoAnchorDNA,
        setAutoAnchorDNA,
        dnaStatus,
        anchorDNA,
        analyzeBackgroundDNA,
        autoTokenProfiles,
        setAutoTokenProfiles,
        ensureTokenProfiles,
        handleAnalyzeMissingTokenProfiles,
        tokenProfilesReady,
        tokenProfilesTotal
    };
};
