import { useState } from 'react';
import { GeminiService } from '../services/GeminiService';
import type { Action, StageToken } from '../context/AppContext';
import type { VeoFivePartDraft } from '../promptEngine/veoFivePart';
import type { Veo31Spec } from '../promptEngine/types';

type PromptDraftOverride = Partial<VeoFivePartDraft> & { concept?: string };

type RawAnalysisSpec = {
    characterBible?: {
        identity?: string;
        wardrobe?: string;
        emotionalState?: string;
        lockedTraits?: string[];
    };
    styleBible?: {
        visualStyle?: string;
        lighting?: string;
        colorPalette?: string;
        lensLanguage?: string;
    };
    environmentBible?: {
        setting?: string;
        props?: string[];
        weatherTime?: string;
        lockedElements?: string[];
    };
    motionDelta?: {
        cameraMovement?: string;
        characterAction?: string;
    };
    motion?: {
        cameraMovement?: string;
        characterAction?: string;
    };
    frame1Description?: string;
    frame2Description?: string;
};

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
    dispatch: React.Dispatch<Action>;
    injectPromptDraft?: PromptDraftOverride;
}

export function useVeoSmartAnalyze() {
    const [analysisResult, setAnalysisResult] = useState<string>('');
    const [analysisSpec, setAnalysisSpec] = useState<Veo31Spec | null>(null);
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
            let spec: RawAnalysisSpec;
            try {
                spec = await GeminiService.analyzeMultiFrameJson(prompt, apiKey, model || 'gemini-2.5-flash', frames);
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
            if (castingForgeLocks.length > 0) {
                const existingTraits = spec.characterBible?.lockedTraits || [];
                spec.characterBible = {
                    ...(spec.characterBible || {}),
                    lockedTraits: [...existingTraits, ...castingForgeLocks]
                };
            }

            // Map JSON to Veo31Spec structure and STORE IT
            const motionSource = spec.motionDelta || spec.motion;
            const veoSpec: Veo31Spec = {
                character: {
                    identity: spec.characterBible?.identity || '',
                    wardrobe: spec.characterBible?.wardrobe || '',
                    emotionalState: spec.characterBible?.emotionalState || '',
                    lockedTraits: spec.characterBible?.lockedTraits || []
                },
                style: {
                    visualStyle: spec.styleBible?.visualStyle || '',
                    lighting: spec.styleBible?.lighting || '',
                    colorPalette: spec.styleBible?.colorPalette || '',
                    lensLanguage: spec.styleBible?.lensLanguage || ''
                },
                environment: {
                    setting: spec.environmentBible?.setting || '',
                    props: spec.environmentBible?.props || [],
                    weatherTime: spec.environmentBible?.weatherTime || '',
                    lockedElements: spec.environmentBible?.lockedElements || []
                },
                motion: {
                    cameraMovement: motionSource?.cameraMovement || '',
                    characterAction: motionSource?.characterAction || ''
                },
                frame1Description: spec.frame1Description || '',
                frame2Description: spec.frame2Description || spec.frame1Description || ''
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
            const message = err instanceof Error ? err.message : String(err);
            dispatch({ type: 'ADD_LOG', payload: { message: `Analysis failed: ${message}`, type: 'error' } });
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
