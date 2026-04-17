import { useState } from 'react';
import type { Dispatch } from 'react';
import { GeminiService } from '../services/GeminiService';
import type { Action, StageToken } from '../context/AppContext';
import type { VeoAudioBlock, VeoFivePartDraft } from '../promptEngine/veoFivePart';
import type { Veo31Spec } from '../promptEngine/types';

type VeoPromptDraft = VeoFivePartDraft & { audio?: VeoAudioBlock; concept?: string; negativePrompt?: string };

type VeoAnalysisSpec = {
    character?: unknown;
    style?: unknown;
    environment?: unknown;
    motion?: unknown;
    frame1Description?: string;
    frame2Description?: string;
} | null;

const asRecord = (value: unknown): Record<string, unknown> =>
    typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};

const getErrorMessage = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

export interface SmartAnalyzeOptions {
    apiKey?: string;
    model?: string;
    startUrl?: string;
    endUrl?: string;
    tokens: StageToken[];
    strictCharacterAds: boolean;
    continuityLockEnabled: boolean;
    noExtraObjects: boolean;
    noMorph: boolean;
    dispatch: Dispatch<Action>;
    injectPromptDraft?: VeoPromptDraft;
}

export function useVeoSmartAnalyze() {
    const [analysisResult, setAnalysisResult] = useState<string>('');
    const [analysisSpec, setAnalysisSpec] = useState<VeoAnalysisSpec>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    const runSmartAnalyze = async ({
        apiKey,
        model,
        startUrl,
        endUrl,
        tokens,
        strictCharacterAds,
        continuityLockEnabled,
        noExtraObjects,
        noMorph,
        dispatch,
        injectPromptDraft
    }: SmartAnalyzeOptions) => {
        if (!startUrl && !endUrl) return;
        setIsAnalyzing(true);
        setAnalysisResult('');
        setAnalysisSpec(null);

        try {
            let prompt = "";
            const frames: { url: string; label: string }[] = [];

            // 1. Build the Gemini Instruction Prompt (JSON Request)
            if (startUrl && endUrl) {
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
                frames.push({ url: startUrl, label: "START_FRAME" });
                frames.push({ url: endUrl, label: "END_FRAME" });
            } else {
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
                if (sourceUrl) frames.push({ url: sourceUrl, label: "MASTER_REFERENCE" });
            }

            // 2. Call Gemini with Strict JSON
            if (!apiKey) throw new Error("API Key required for Smart Analyze");
            let spec: Record<string, unknown>;
            try {
                spec = await GeminiService.analyzeMultiFrameJson<Record<string, unknown>>(prompt, apiKey, model || 'gemini-2.5-flash', frames);
            } catch {
                throw new Error("Failed to extract Scene Bibles. Please retry.");
            }

            // 4. Inject Strict Character Overrides from Casting Forge
            const castingForgeLocks: string[] = [];
            if (strictCharacterAds) {
                tokens.forEach(t => {
                    if (t.profile) {
                        castingForgeLocks.push(`${t.profile.identity} (${t.profile.wardrobe})`);
                    }
                });
            }

            // Merge locks
            if (spec.characterBible && castingForgeLocks.length > 0) {
                const characterBible = asRecord(spec.characterBible);
                const existingLocks = Array.isArray(characterBible.lockedTraits)
                    ? characterBible.lockedTraits.filter((value): value is string => typeof value === 'string')
                    : [];
                characterBible.lockedTraits = [
                    ...existingLocks,
                    ...castingForgeLocks
                ];
                spec.characterBible = characterBible;
            }

            // Map JSON to Veo31Spec structure and STORE IT
            const character = asRecord(spec.characterBible);
            const style = asRecord(spec.styleBible);
            const environment = asRecord(spec.environmentBible);
            const motion = asRecord(spec.motionDelta || spec.motion);

            const veoSpec: Veo31Spec = {
                character: {
                    identity: typeof character.identity === 'string' ? character.identity : '',
                    wardrobe: typeof character.wardrobe === 'string' ? character.wardrobe : '',
                    emotionalState: typeof character.emotionalState === 'string' ? character.emotionalState : '',
                    lockedTraits: Array.isArray(character.lockedTraits)
                        ? character.lockedTraits.filter((value): value is string => typeof value === 'string')
                        : []
                },
                style: {
                    visualStyle: typeof style.visualStyle === 'string' ? style.visualStyle : '',
                    lighting: typeof style.lighting === 'string' ? style.lighting : '',
                    colorPalette: typeof style.colorPalette === 'string' ? style.colorPalette : '',
                    lensLanguage: typeof style.lensLanguage === 'string' ? style.lensLanguage : ''
                },
                environment: {
                    setting: typeof environment.setting === 'string' ? environment.setting : '',
                    props: Array.isArray(environment.props)
                        ? environment.props.filter((value): value is string => typeof value === 'string')
                        : [],
                    weatherTime: typeof environment.weatherTime === 'string' ? environment.weatherTime : '',
                    lockedElements: Array.isArray(environment.lockedElements)
                        ? environment.lockedElements.filter((value): value is string => typeof value === 'string')
                        : []
                },
                motion: {
                    cameraMovement: typeof motion.cameraMovement === 'string' ? motion.cameraMovement : '',
                    characterAction: typeof motion.characterAction === 'string' ? motion.characterAction : ''
                },
                frame1Description: typeof spec.frame1Description === 'string' ? spec.frame1Description : '',
                frame2Description: typeof spec.frame2Description === 'string' ? spec.frame2Description : ''
            };
            setAnalysisSpec(veoSpec); // <--- PERSIST FOR STORYBOARD GENERATION

            // 5. Build Final Prompt
            const { buildVeo31Prompt } = await import('../promptEngine/PromptBuilder');

            const { prompt: finalPrompt, negatives } = buildVeo31Prompt(veoSpec, {
                continuityLock: continuityLockEnabled,
                noExtraObjects,
                noMorph,
                lockEnvironment: true,
                lockLighting: true,
                lockLens: true,
                lockStyle: true,
                injectPromptDraft
            });

            const displayOutput = `${finalPrompt}\n\nNEGATIVE_PROMPT: ${negatives}`;

            setAnalysisResult(displayOutput);
            dispatch({ type: 'ADD_LOG', payload: { message: "Veo 3.1 JSON Prompt Engine: Success", type: 'success' } });

        } catch (err: unknown) {
            dispatch({ type: 'ADD_LOG', payload: { message: `Analysis failed: ${getErrorMessage(err)}`, type: 'error' } });
        } finally {
            setIsAnalyzing(false);
        }
    };

    return {
        isAnalyzing,
        analysisSpec,
        analysisResult,
        runSmartAnalyze,
        setAnalysisResult,
        setAnalysisSpec
    };
}
