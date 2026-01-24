import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Webcam from 'react-webcam';
import { FaceMesh } from '@mediapipe/face_mesh';
import { Camera } from '@mediapipe/camera_utils';
import {
    Scan, Target, User, Layers, Share2,
    ChevronRight, RefreshCw, Cpu, Aperture, CheckCircle2, UserPlus, Upload, Sliders,
    Swords, Zap, Shield, Ghost, Camera as CameraIcon, Ban, RotateCcw,
    EyeOff, Shirt, Sparkles, LayoutTemplate, Download, X
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { GeminiService } from '../services/GeminiService';

const REFERENCE_SHEET_PROMPT = `Create a professional, 8k resolution character reference sheet based strictly on the uploaded reference image. Use a clean, neutral plain background.
CRITICAL COMPOSITION RULES:
- STRICT ADHERENCE to view counts. DO NOT add extra rows or duplicate figures.
- NO ghost images or hallucinations in negative space. Leave empty areas EMPTY.
- Maintain PERFECT facial identity and symmetry across ALL views. No distortion.
- Ensure feet, hands, and facial features are anatomically correct and sharp.
- Lighting must be studio-neutral with no harsh shadows obscuring details.
- Output must be crisp, production-ready, and free of artifacts.
`;

// Types for Phases
type Phase = 1 | 2 | 3 | 4 | 5;

const NanoCastingDirector = () => {
    const { state, dispatch } = useAppContext();
    const [phase, setPhase] = useState<Phase>(1);

    // --- PHASE 2: BODY ARCHETYPE STATE ---
    const [selectedBody, setSelectedBody] = useState<string | null>(null);
    const [morphVariant, setMorphVariant] = useState<'masc' | 'fem' | 'youth'>('masc');

    const getArchetypes = (variant: 'masc' | 'fem' | 'youth') => {
        switch (variant) {
            case 'fem': return [
                { id: 'titan', name: 'The Amazon', desc: 'Tall, athletic strength, powerful feminine build', icon: Zap },
                { id: 'scout', name: 'The Muse', desc: 'Slender, grace, agile elegance', icon: Sparkles },
                { id: 'guardian', name: 'The Matriarch', desc: 'Curvaceous, heavy-set, commanding presence', icon: Shield },
                { id: 'sprite', name: 'The Fae', desc: 'Petite, ethereal, stylized proportions', icon: Ghost }
            ];
            case 'youth': return [
                { id: 'titan', name: 'The Prodigy', desc: 'Strong for age, athletic youth', icon: Swords },
                { id: 'scout', name: 'The Rascal', desc: 'Wiry, quick, mischievous energy', icon: Zap },
                { id: 'guardian', name: 'The Husky', desc: 'Solid, chubby, sturdy frame', icon: Shield },
                { id: 'sprite', name: 'The Chibi', desc: 'Cute, oversized head, toddler proportions', icon: Ghost }
            ];
            default: return [
                { id: 'titan', name: 'The Titan', desc: 'Heroic V-taper, broad shoulders, muscular frame', icon: Swords },
                { id: 'scout', name: 'The Scout', desc: 'Slim, agile, tall, sleek athletic build', icon: Zap },
                { id: 'guardian', name: 'The Guardian', desc: 'Stocky, powerhouse, heavy-set, rectangular frame', icon: Shield },
                { id: 'sprite', name: 'The Sprite', desc: 'Stylized Chibi proportions, oversized head', icon: Ghost }
            ];
        }
    };

    const bodyArchetypes = getArchetypes(morphVariant);

    // --- PHASE 3: STYLE SYNTHESIS ---
    const [selectedStyle, setSelectedStyle] = useState<string | null>(null);

    const styleMatrix = {
        pixar: {
            id: 'pixar', label: 'Family 3D Animation',
            keywords: "3D Disney-Pixar animation style, subsurface scattering, rim lighting, soft textures, Octane Render, masterpiece 3D, expressive features.",
            lighting: "Golden hour, cinematic bounce light"
        },
        hyper_real: {
            id: 'hyper_real', label: 'Premium CG Realism',
            keywords: "Photorealistic 8k, raw photo, exact facial structure preservation, highly detailed skin pores, 85mm lens, f/1.8, cinematic natural lighting, sharp focus, masterpiece, biometric fidelity.",
            lighting: "High-contrast studio lighting"
        },
        retro_anime: {
            id: 'retro_anime', label: 'Retro Cel Anime',
            keywords: "90s retro anime aesthetic, cel-shaded, hand-drawn ink lines, Studio Ghibli vibes, vintage film grain, soft pastel palette.",
            lighting: "Soft diffused daylight"
        },
        comic_book: {
            id: 'comic_book', label: 'Graphic Novel Noir',
            keywords: "Modern graphic novel style, heavy ink outlines, Halftone dot patterns, high contrast, dramatic shadows, bold dynamic lines.",
            lighting: "Hard noir shadows"
        },
        cyberpunk: {
            id: 'cyberpunk', label: 'Cyberpunk V2',
            keywords: "Futuristic tech-wear, neon glow, wet pavement reflections, volumetric fog, teal and orange palette, high-tech interface overlays.",
            lighting: "Neon-drenched night"
        },
        exact_studio: {
            id: 'exact_studio', label: 'Exact Likeness Studio',
            keywords: "Ultra-realistic 8k portrait, 1:1 identity replication, strict facial feature preservation, studio lighting, highly detailed skin texture, raw photography, 85mm lens, sharp focus, masterpiece, identity locked.",
            lighting: "Professional studio lighting"
        }
    };

    // --- PHASE 4 & 5: STATE ---
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState({ phase: '', percent: 0, detail: '' });
    const [uploadMode, setUploadMode] = useState(false);
    const abortControllerRef = useRef<AbortController | null>(null);

    // --- REF SHEET GENERATOR STATE ---
    const [showRefSheet, setShowRefSheet] = useState(false);
    const [refSheetUrl, setRefSheetUrl] = useState<string | null>(null);
    const [refLayout, setRefLayout] = useState<'form_focus' | 'face_focus' | 'split_focus'>('form_focus');

    // --- DIRECTOR CONTROLS ---
    const [showSettings, setShowSettings] = useState(false);
    const [directorControls, setDirectorControls] = useState({
        identityStrength: 85, // 0-100
        stylization: 50,      // 0-100
        age: 25,              // 10-90
        outfit: "",
        lighting: "studio_default",
        negatives: {
            watermarks: true,
            distortion: true,
            extra_limbs: true,
            text: true
        }
    });

    // --- PHASE 1: BIOMETRIC SCANNER STATE ---
    const webcamRef = useRef<Webcam>(null);
    const [capturedAngles, setCapturedAngles] = useState<{
        center: string | null;
        left: string | null;
        right: string | null;
        up: string | null;
        down: string | null;
    }>({
        center: null,
        left: null,
        right: null,
        up: null,
        down: null
    });

    // Explicit setter to handle cleanup
    const setAngle = (angle: keyof typeof capturedAngles, url: string | null) => {
        setCapturedAngles(prev => {
            const oldUrl = prev[angle];
            if (oldUrl && oldUrl !== url) {
                URL.revokeObjectURL(oldUrl);
            }
            return { ...prev, [angle]: url };
        });
    };

    // Refs for stable access inside callbacks without re-triggering
    const capturedAnglesRef = useRef(capturedAngles);
    const [yaw, setYaw] = useState(0);
    const [pitch, setPitch] = useState(0);
    const [activeSector, setActiveSector] = useState<'center' | 'left' | 'right' | 'up' | 'down' | null>(null);

    const [stabilityProgress, setStabilityProgress] = useState(0);
    const [cameraEnabled, setCameraEnabled] = useState(false);

    // --- PERSISTENCE & WARDROBE STATES ---
    const [sidebarMode, setSidebarMode] = useState<'director' | 'wardrobe'>('director');
    const [wardrobePrompt, setWardrobePrompt] = useState("");



    // Scan Stability Logic
    const lastSectorRef = useRef<string | null>(null);
    const sectorStableFramesRef = useRef(0);
    const scanCooldownRef = useRef(false);
    const lastUpdateRef = useRef(0);
    const STABILITY_THRESHOLD = 15; // Frames to hold steady
    const SCAN_COOLDOWN_MS = 1500;

    // Helper: Convert Base64 to Blob URL for memory efficiency
    const base64ToBlobUrl = (base64: string) => {
        const byteString = atob(base64.split(',')[1]);
        const mimeString = base64.split(',')[0].split(':')[1].split(';')[0];
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
        }
        const blob = new Blob([ab], { type: mimeString });
        return URL.createObjectURL(blob);
    };

    // Fix for Stale State in Closures
    const stateRef = useRef(state);
    useEffect(() => { stateRef.current = state; }, [state]);

    // Update ref when state changes
    useEffect(() => {
        capturedAnglesRef.current = capturedAngles;
    }, [capturedAngles]);

    // FaceMesh Setup
    const onResults = useCallback((results: any) => {
        // Throttle updates to ~10fps to reduce React render load
        const now = Date.now();
        if (now - lastUpdateRef.current < 100) return;
        lastUpdateRef.current = now;

        if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
            setActiveSector(null);
            setStabilityProgress(0);
            sectorStableFramesRef.current = 0;
            return;
        }

        const landmarks = results.multiFaceLandmarks[0];
        // Heuristic Pose Estimation
        const nose = landmarks[1];
        const leftEar = landmarks[234];
        const rightEar = landmarks[454];
        const chin = landmarks[152];
        const forehead = landmarks[10];

        // Yaw Calculation
        const midEarX = (leftEar.x + rightEar.x) / 2;
        const noseOffset = nose.x - midEarX;
        const estimatedYaw = noseOffset * 400;

        // Pitch Calculation
        const midFaceY = (forehead.y + chin.y) / 2;
        const noseOffsetY = nose.y - midFaceY;
        const estimatedPitch = noseOffsetY * -500;

        setYaw(estimatedYaw);
        setPitch(estimatedPitch);

        // Center Proximity Check (Strict Centering)
        // Nose is landmarks[1]
        const centerX = nose.x;
        const centerY = nose.y;
        const distFromCenter = Math.sqrt(Math.pow(centerX - 0.5, 2) + Math.pow(centerY - 0.5, 2));

        // Threshold: 0.25 radius (approx 25% away from center - Relaxed for usability)
        const isCentered = distFromCenter < 0.25;

        // Check Thresholds - Adjusted for comfortable 45-degree capture
        let currentSector: 'center' | 'left' | 'right' | 'up' | 'down' | null = null;

        if (!isCentered) {
            // WARNING ONLY - Do not block
            // currentSector = null; 
        } else if (estimatedPitch > 12) currentSector = 'up';
        else if (estimatedPitch < -10) currentSector = 'down';
        else if (estimatedYaw > 20) currentSector = 'left';
        else if (estimatedYaw < -20) currentSector = 'right';
        else if (Math.abs(estimatedYaw) < 10 && Math.abs(estimatedPitch) < 10) currentSector = 'center';

        setActiveSector(currentSector);

        // Auto-Capture Logic with Guardrails
        if (currentSector && webcamRef.current && !scanCooldownRef.current) {
            // Check if already captured
            if (capturedAnglesRef.current[currentSector]) {
                setStabilityProgress(100); // Already done
                return;
            }

            // Stability Check
            if (currentSector === lastSectorRef.current) {
                sectorStableFramesRef.current++;
            } else {
                lastSectorRef.current = currentSector;
                sectorStableFramesRef.current = 0;
            }

            // Update Progress UI
            const progress = Math.min(100, (sectorStableFramesRef.current / STABILITY_THRESHOLD) * 100);
            setStabilityProgress(progress);

            if (sectorStableFramesRef.current > STABILITY_THRESHOLD) {
                captureCurrentFrame(currentSector);
            }
        } else {
            // Reset stability if lost sector
            sectorStableFramesRef.current = 0;
            setStabilityProgress(0);
        }
    }, []);

    const captureCurrentFrame = async (sector: keyof typeof capturedAngles) => {
        console.log("Attempting Capture:", sector);
        if (!webcamRef.current) { console.log("No Webcam Ref"); return; }
        const imageSrc = webcamRef.current.getScreenshot();
        if (imageSrc) {
            // IMMEDIATE SYNCHRONOUS STATE UPDATES
            // Prevent re-entry immediately
            scanCooldownRef.current = true;
            sectorStableFramesRef.current = 0;
            setStabilityProgress(0);

            // Set timeout to clear cooldown
            setTimeout(() => {
                scanCooldownRef.current = false;
            }, SCAN_COOLDOWN_MS);

            const blobUrl = base64ToBlobUrl(imageSrc);

            // Trigger capture
            setAngle(sector, blobUrl);

            // Auto-Save Logic (Async)
            if (stateRef.current.saveDirectoryHandle) {
                try {
                    // @ts-ignore - File System Access API
                    const scansDir = await stateRef.current.saveDirectoryHandle.getDirectoryHandle('Scans', { create: true });
                    const filename = `Scan_${sector.toUpperCase()}_${Date.now()}.png`;
                    // @ts-ignore
                    const fileHandle = await scansDir.getFileHandle(filename, { create: true });
                    // @ts-ignore
                    const writable = await fileHandle.createWritable();

                    // Convert Base64 to Blob
                    const byteString = atob(imageSrc.split(',')[1]);
                    const ab = new ArrayBuffer(byteString.length);
                    const ia = new Uint8Array(ab);
                    for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
                    const blob = new Blob([ab], { type: 'image/png' });

                    await writable.write(blob);
                    await writable.close();
                } catch (err) {
                    console.error("Auto-save failed:", err);
                }
            } else {
                console.warn("Auto-save skipped: No save directory configured.");
                // Optional: notifying user might be too spammy if they haven't set it yet, but useful for debugging this issue
                // dispatch({ type: 'ADD_LOG', payload: { message: "Scan not saved: No save folder set in Settings.", type: 'error' } });
            }
        }
    };

    useEffect(() => {
        let camera: Camera | null = null;
        let faceMesh: FaceMesh | null = null;
        let isActive = true;

        const initFaceMesh = async () => {
            faceMesh = new FaceMesh({
                locateFile: (file) => {
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
                }
            });

            faceMesh.setOptions({
                maxNumFaces: 1,
                refineLandmarks: true,
                minDetectionConfidence: 0.15, // Extremely low for maximum recall
                minTrackingConfidence: 0.15
            });

            faceMesh.onResults(onResults);

            if (webcamRef.current && webcamRef.current.video && isActive) {
                camera = new Camera(webcamRef.current.video, {
                    onFrame: async () => {
                        if (webcamRef.current?.video && isActive) {
                            await faceMesh?.send({ image: webcamRef.current.video });
                        }
                    },
                    width: 1280,
                    height: 720
                });
                await camera.start();
            }
        };

        if (phase === 1 && !uploadMode && cameraEnabled) {
            initFaceMesh();
        }

        return () => {
            isActive = false;
            if (camera) camera.stop();
            if (faceMesh) faceMesh.close();
        };
    }, [phase, uploadMode, onResults, cameraEnabled]);


    // Helper: Fetch Blob URL and convert to Base64 for API
    const getBase64FromBlobUrl = async (blobUrl: string): Promise<string> => {
        const response = await fetch(blobUrl);
        const blob = await response.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
        });
    };

    // --- SAVING FUNCTIONS ---

    const handleSaveToActors = async () => {
        if (!finalCharacterUrl || !state.saveDirectoryHandle) {
            if (!state.saveDirectoryHandle) dispatch({ type: 'ADD_LOG', payload: { message: "No save folder configured in settings.", type: 'error' } });
            return;
        }
        try {
            const actorsDir = await state.saveDirectoryHandle.getDirectoryHandle('Actors', { create: true });
            const safeName = "NanoCast_" + Date.now();
            const filename = `${safeName}.png`;
            const fileHandle = await actorsDir.getFileHandle(filename, { create: true });
            const writable = await fileHandle.createWritable();
            const res = await fetch(finalCharacterUrl);
            const blob = await res.blob();
            await writable.write(blob);
            await writable.close();

            const newActor = {
                id: `actor-${Date.now()}`,
                url: finalCharacterUrl,
                tag: 'front',
                name: "Nano Cast",
                profile: {
                    identity: "Generated",
                    wardrobe: "Standard",
                    accessories: "",
                    style: (selectedStyle && styleMatrix[selectedStyle as keyof typeof styleMatrix]?.label) || "Cinematic"
                }
            };
            // @ts-ignore
            dispatch({ type: 'ADD_ACTOR_LIBRARY', payload: newActor });
            dispatch({ type: 'ADD_LOG', payload: { message: `Saved to Actors: ${filename}`, type: 'success' } });
        } catch (e: any) {
            dispatch({ type: 'ADD_LOG', payload: { message: `Actor save failed: ${e.message}`, type: 'error' } });
        }
    };

    const handleSaveToWardrobe = async () => {
        if (!finalCharacterUrl || !state.saveDirectoryHandle) {
            if (!state.saveDirectoryHandle) dispatch({ type: 'ADD_LOG', payload: { message: "No save folder configured in settings.", type: 'error' } });
            return;
        }
        try {
            const wardrobeDir = await state.saveDirectoryHandle.getDirectoryHandle('wardrobe', { create: true });
            const filename = `WARDROBE-${Date.now()}.png`;
            const fileHandle = await wardrobeDir.getFileHandle(filename, { create: true });
            const writable = await fileHandle.createWritable();
            const res = await fetch(finalCharacterUrl);
            const blob = await res.blob();
            await writable.write(blob);
            await writable.close();

            const newItem = {
                id: filename,
                url: finalCharacterUrl,
                name: "Nano Creation",
                prompt: "Generated from NanoCasting",
                category: "Nano",
                timestamp: Date.now()
            };

            // @ts-ignore
            dispatch({ type: 'ADD_WARDROBE_ITEM', payload: newItem });
            dispatch({ type: 'ADD_LOG', payload: { message: `Saved to Wardrobe: ${filename}`, type: 'success' } });
        } catch (e: any) {
            dispatch({ type: 'ADD_LOG', payload: { message: `Wardrobe save failed: ${e.message}`, type: 'error' } });
        }
    };

    const generateWardrobe = async () => {
        if (!wardrobePrompt || !state.apiKey) return;
        setIsProcessing(true);
        setProgress({ phase: 'wardrobe', percent: 0, detail: "Weaving digital fabric..." });

        try {
            // 1. Generate Outfit
            setProgress({ phase: 'wardrobe', percent: 30, detail: "Synthesizing garment geometry..." });
            const garment = await GeminiService.generateImage(
                `Professional standalone apparel photography: ${wardrobePrompt}. 
                 Film quality, solid white background, isolated garment.`,
                state.apiKey,
                state.model,
                [],
                { aspectRatio: '1:1' }
            );

            // 2. Try-On (Simulated by sending garment + current character to Gemini)
            if (finalCharacterUrl) {
                setProgress({ phase: 'wardrobe', percent: 70, detail: "Performing virtual fitting..." });
                const fitted = await GeminiService.generateImage(
                    `Perform a virtual try-on. 
                     [IMAGE 1] is the SUBJECT. [IMAGE 2] is the COSTUME.
                     Apply the costume in [IMAGE 2] to the subject in [IMAGE 1].
                     Maintain subject identity perfectly. Replace lighting to match studio quality.
                     Strictly maintain the aspect ratio and framing of [IMAGE 1].`,
                    state.apiKey,
                    state.model,
                    [
                        { url: finalCharacterUrl, label: "Subject" },
                        { url: garment, label: "New Outfit" }
                    ],
                    { aspectRatio: '2:3' } // Portrait
                );

                setFinalCharacterUrl(fitted);
                dispatch({ type: 'ADD_LOG', payload: { message: "Virtual fitting complete.", type: 'success' } });
            }

        } catch (e: any) {
            dispatch({ type: 'ADD_LOG', payload: { message: e.message, type: 'error' } });
        } finally {
            setIsProcessing(false);
            setProgress({ phase: '', percent: 0, detail: "" });
        }
    };

    // --- PHASE 4 & 5: ORCHESTRATION & REVEAL ---
    const [generationLogs, setGenerationLogs] = useState<string[]>([]);
    const [finalCharacterUrl, setFinalCharacterUrl] = useState<string | null>(null);

    // New: Pack Mode State
    const [generatePackMode] = useState(true);

    // --- TOAST NOTIFICATIONS ---
    const [notification, setNotification] = useState<string | null>(null);
    const showToast = (message: string) => {
        setNotification(message);
        setTimeout(() => setNotification(null), 3000);
    };

    const handleOrchestration = async () => {
        // Enforce Minimum Refs
        if (!uploadMode && (!capturedAngles.center || !capturedAngles.left || !capturedAngles.right)) {
            showToast("Missing required angles (Center, Left, Right)");
            return;
        }

        const addLog = (msg: string) => setGenerationLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

        try {
            setPhase(4);
            setGenerationLogs([]);
            abortControllerRef.current = new AbortController();

            addLog("INITIALIZING NANO NEURAL LINK...");
            setIsProcessing(true);
            setProgress({ phase: 'scanning', percent: 0, detail: "Initializing Biometric Core..." });

            // 1. Prepare References (Convert Blobs to Base64)
            const referenceImages: { url: string; label: string }[] = [];
            const angles: (keyof typeof capturedAngles)[] = ['center', 'left', 'right', 'up', 'down'];

            for (const angle of angles) {
                const blobUrl = capturedAngles[angle];
                if (blobUrl) {
                    try {
                        const b64 = await getBase64FromBlobUrl(blobUrl);
                        referenceImages.push({ url: b64, label: `Reference Angle: ${angle}` });
                    } catch (err) {
                        console.error(`Failed to process ${angle} angle:`, err);
                    }
                }
            }

            if (referenceImages.length === 0) {
                addLog("CRITICAL: No valid biometric data found.");
                throw new Error("No reference images");
            }

            addLog(`ACQUIRED BIOMETRIC REFERENCES. SYNTHESIZING GRAPH...`);
            setProgress({ phase: 'neural', percent: 40, detail: "Synthesizing Neural Graph..." });

            // 2. Construct Director Prompt
            const styleObj = styleMatrix[selectedStyle as keyof typeof styleMatrix] || styleMatrix.pixar;
            const archetypeObj = bodyArchetypes.find(b => b.id === selectedBody) || bodyArchetypes[0];

            // STRICTNESS CHECK: If the style is one of the realistic ones, we force extreme adherence to reference
            const isStrictLikeness = ['hyper_real', 'exact_studio', 'cyberpunk'].includes(selectedStyle || '');
            const strictnessInstruction = isStrictLikeness
                ? "CRITICAL_STRICTNESS: The face in the generated image MUST BE AN EXACT BIOMETRIC MATCH to the reference. Do not blend faces. Do not 'beautify' if it changes structure. PRESERVE IDENTITY ABOVE ALL ELSE. Treat the reference image as the absolute truth."
                : "";

            const prompt = `
                Generate a CHARACTER CONCEPT ART based on the provided reference face.
                
                STYLE PROTOCOL: ${styleObj.label}
                VISUAL KEYWORDS: ${styleObj.keywords}
                LIGHTING: ${styleObj.lighting}
                
                BODY MORPHOLOGY: ${archetypeObj.name} (${archetypeObj.desc}).
                
                DIRECTOR OVERRIDES:
                - Age Appearance: Approx ${directorControls.age} years old.
                - Outfit: ${directorControls.outfit || "Style-appropriate default attire"}.
                - Identity Match Priority: ${directorControls.identityStrength}%.
                - Stylization Intensity: ${directorControls.stylization}%.

                CRITICAL INSTRUCTIONS:
                ${strictnessInstruction}
                1. MAINTAIN FACIAL IDENTITY from references with high fidelity (Priority: ${directorControls.identityStrength}%).
                2. APPLY the selected "${styleObj.label}" art style (Intensity: ${directorControls.stylization}%).
                3. Body proportions must match "${archetypeObj.name}".
                4. Background: Neutral, dark, cinematic studio void.
                5. High resolution, 4k, masterpiece.
                6. Facial Expression: Slight, natural smile (warm and approachable).
                
                ${generatePackMode ? '6. OUTPUT: Cinematic Character Portrait (Front View) with high detail.' : ''}
                
                NEGATIVE CONSTRAINTS:
                ${directorControls.negatives.watermarks ? '- No watermarks, signatures, or UI elements.' : ''}
                ${directorControls.negatives.distortion ? '- No distorted features, bad hands, or asymmetric eyes.' : ''}
                ${directorControls.negatives.extra_limbs ? '- No extra limbs or fused fingers.' : ''}
                ${directorControls.negatives.text ? '- No text overlays.' : ''}
            `;

            // UPDATE APP CONTEXT
            dispatch({ type: 'SET_LAST_CASTED_PROMPT', payload: prompt });
            addLog("TRANSMITTING TO NANO BANANA PRO CLUSTER...");

            // 3. Call Gemini
            setProgress({ phase: 'synthesis', percent: 60, detail: "Generative Matrix Active..." });

            // Note: If GeminiService adds AbortSignal support, pass abortControllerRef.current.signal here
            const resultUrl = await GeminiService.generateImage(prompt, state.apiKey, state.model, referenceImages);

            if (abortControllerRef.current?.signal.aborted) {
                throw new Error("Generation aborted by user");
            }

            setProgress({ phase: 'refinement', percent: 90, detail: "Finalizing Render..." });
            addLog("ASSET GENERATED. DECODING...");
            await new Promise(r => setTimeout(r, 500));

            setFinalCharacterUrl(resultUrl);
            setPhase(5); // Move to Result Phase
            setIsProcessing(false);

        } catch (error) {
            if ((error as Error).message === "Generation aborted by user") {
                addLog("ABORTED BY COMMAND.");
            } else {
                console.error("Orchestration Error:", error);
                showToast("Generation Failed: " + (error as Error).message);
            }
            setIsProcessing(false);
            // Stay on Ph4 or reset depending on preference? Let's stay Ph4 but stop loading
        }
    };

    const handleRegenerate = () => {
        // Ensure we don't lose state
        console.log("Regenerating...");
        if (!capturedAngles.center) {
            showToast("Error: Biometrics Lost. Please Re-scan.");
            setPhase(1); // Only go back if data is missing
            return;
        }
        handleOrchestration();
    };

    const cancelGeneration = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            setIsProcessing(false);
            showToast("Sequence Aborted");

            // Redirect based on state
            if (finalCharacterUrl) {
                setPhase(5); // Return to Result view
            } else {
                setPhase(3); // Return to Style Selection
            }
        }
    };



    const addToCast = (asLead = false) => {
        if (!finalCharacterUrl) return;

        const newMember = {
            id: `nano_${Date.now()}`,
            url: finalCharacterUrl,
            name: `${selectedStyle}_${selectedBody}_${asLead ? 'LEAD' : 'Cast'}`,
            tag: 'front' as const,
            profile: {
                identity: "Nano_Gen_v1",
                wardrobe: directorControls.outfit || "Default",
                accessories: "None",
                style: selectedStyle || "Standard_Neural_Mix"
            }
        };

        dispatch({ type: 'ADD_CAST', payload: newMember });
        showToast(asLead ? "Accredited as Project Lead" : "Accessioned to Cast Database");
    };

    const downloadPoster = () => {
        if (!finalCharacterUrl) return;
        const a = document.createElement('a');
        a.href = finalCharacterUrl;
        a.download = `NanoCast_${Date.now()}.png`;
        a.click();
        showToast("Poster Asset Extracted");
    };

    // UI Helpers
    useEffect(() => {
        if (!state.apiKey) {
            console.warn("No API Key found in AppContext");
        }
        // Persistence: Restore last casted image if available and we are essentially "fresh"
        if (state.lastCastedImage && !finalCharacterUrl && phase === 1) {
            setFinalCharacterUrl(state.lastCastedImage);
            setPhase(5); // Jump to result
        }
    }, [state.apiKey, state.lastCastedImage, finalCharacterUrl, phase]);

    // Persistence: Save when we get a result
    useEffect(() => {
        if (finalCharacterUrl) {
            dispatch({ type: 'SET_LAST_CASTED_IMAGE', payload: finalCharacterUrl });
        }
    }, [finalCharacterUrl, dispatch]);

    const handleGenerateRefSheet = async () => {
        if (!finalCharacterUrl || !state.apiKey) return;

        dispatch({ type: 'SET_PROCESSING', payload: true });
        dispatch({ type: 'ADD_LOG', payload: { message: "Generating Character Reference Sheet...", type: 'info' } });

        try {
            let finalPrompt = REFERENCE_SHEET_PROMPT;

            if (refLayout === 'form_focus') {
                finalPrompt += " [LAYOUT A - CLASSIC]: Split canvas horizontally. Top 65% height: ROW OF EXACTLY 3 Full Body views (Front, Side, Back). Bottom 35% height: Grid of EXACTLY 4 Headshots. Ensure headshots are MACRO-DETAILED and hyper-sharp.";
            } else if (refLayout === 'face_focus') {
                finalPrompt += " [LAYOUT B - FACE FIRST]: Split canvas horizontally. Top 55% height: Row of EXACTLY 4 Large Headshots (Front, Left, Right, Back). Bottom 45% height: Row of EXACTLY 3 Full Body views. Headshots must maintain perfect identity.";
            } else if (refLayout === 'split_focus') {
                finalPrompt += " [LAYOUT C - STUDIO]: Split canvas vertically. Left 45% width: Vertical stack of EXACTLY 3 Full Body views (Front, Side, Back). DO NOT ADD A FOURTH VIEW. Right 55% width: 2x2 Grid of Large Headshots. Highest possible facial resolution.";
            }

            const res = await GeminiService.generateImage(
                finalPrompt,
                state.apiKey,
                state.model.includes('imagen') ? 'imagen-4.0-generate-001' : 'gemini-3-pro-image-preview', // Force high-reasoning model if available
                [{ url: finalCharacterUrl, label: 'Character Reference' }],
                { aspectRatio: '16:9' }
            );
            setRefSheetUrl(res);
            setShowRefSheet(true);
            dispatch({ type: 'ADD_LOG', payload: { message: "Reference Sheet Generated.", type: 'success' } });
        } catch (e: any) {
            dispatch({ type: 'ADD_LOG', payload: { message: `Ref Sheet failed: ${e.message}`, type: 'error' } });
        } finally {
            dispatch({ type: 'SET_PROCESSING', payload: false });
        }
    };

    const getPhaseTitle = (p: Phase) => {
        switch (p) {
            case 1: return "Biometric Acquisition";
            case 2: return "Morphological Matrix";
            case 3: return "Style Synthesis";
            case 4: return "Nano Neural Link";
            case 5: return "Digital Reconstruction";
            default: return "System Idle";
        }
    };

    // Smart Lock Logic
    const isPhaseLocked = (p: Phase) => {
        if (p === 1) return false; // Always open
        // Minimum Viable Scan: Center + Left + Right
        if (p === 2) return !(capturedAngles.center && capturedAngles.left && capturedAngles.right);
        if (p === 3) return !selectedBody; // Need body
        if (p === 4) return !selectedStyle; // Need style
        if (p === 5) return !finalCharacterUrl; // Need result
        return true;
    };

    // Lock Reason Tooltip
    const getLockReason = (p: Phase) => {
        if (!isPhaseLocked(p)) return null;
        if (p === 2) return "Requires Center + Left + Right scans";
        if (p === 3) return "Select Body Archetype";
        if (p === 4) return "Select Art Style";
        if (p === 5) return "Generate Result First";
        return "Locked";
    }

    const isScanning = activeSector && !capturedAngles[activeSector];

    const resetScan = () => {
        // Revoke URLs to free memory
        Object.keys(capturedAngles).forEach(key => setAngle(key as keyof typeof capturedAngles, null));

        // CRITICAL: Reset the ref that tracks captured angles, otherwise auto-scan thinks it's done
        capturedAnglesRef.current = { center: null, left: null, right: null, up: null, down: null };

        // Reset local scan state
        setActiveSector(null);
        setStabilityProgress(0);
        sectorStableFramesRef.current = 0;

        // Clear persistence
        dispatch({ type: 'SET_LAST_CASTED_IMAGE', payload: null });
        setFinalCharacterUrl(null);
        setPhase(1);
    };

    // Helper: Handle file upload
    const handleFileUpload = (angle: keyof typeof capturedAngles, file: File) => {
        const url = URL.createObjectURL(file);
        setAngle(angle, url);
    };

    return (
        <div className="h-full w-full bg-bg text-fg font-mono overflow-hidden flex relative selection:bg-accent/30">
            {/* Background Grid - Subtle */}
            <div className="absolute inset-0 z-0 pointer-events-none opacity-[0.05]"
                style={{
                    backgroundImage: 'linear-gradient(var(--color-border) 1px, transparent 1px), linear-gradient(90deg, var(--color-border) 1px, transparent 1px)',
                    backgroundSize: '40px 40px'
                }}>
            </div>

            {/* SIDEBAR */}
            <div className="w-64 border-r border-border bg-surface/90 backdrop-blur-md z-10 flex flex-col">
                <div className="p-6 border-b border-border">
                    <h1 className="text-2xl font-black tracking-tighter text-fg flex items-center gap-2">
                        <Target className="text-accent w-6 h-6 animate-pulse" />
                        NANO<span className="text-muted text-sm align-top">BANANA</span>
                    </h1>
                    <p className="text-[10px] text-muted uppercase tracking-[0.2em] mt-1">Biometric Casting Engine</p>
                </div>

                <div className="flex-1 py-8 px-4 space-y-2">
                    {[1, 2, 3, 4, 5].map((p) => {
                        const locked = isPhaseLocked(p as Phase);
                        const reason = getLockReason(p as Phase);
                        return (
                            <button
                                key={p}
                                disabled={locked}
                                onClick={() => setPhase(p as Phase)}
                                title={reason || ""}
                                className={`w-full text-left px-4 py-4 rounded-xl border transition-all group relative overflow-hidden flex justify-between items-center ${phase === p
                                    ? 'border-accent-2 bg-accent-2/10 text-accent-2 shadow-[0_0_15px_rgba(59,130,246,0.2)]'
                                    : locked
                                        ? 'border-transparent text-muted cursor-not-allowed opacity-50'
                                        : 'border-transparent text-muted hover:text-white hover:bg-surface-2'
                                    }`}
                            >
                                <div className="z-10 flex flex-col">
                                    <span className={`text-sm font-black uppercase tracking-widest flex items-center gap-2 ${phase === p ? 'animate-pulse' : ''}`}>
                                        <span>Phase 0{p}</span>
                                    </span>
                                    {locked && <span className="text-[10px] normal-case opacity-70 mt-1">{reason}</span>}
                                </div>
                                {phase === p && <ChevronRight className="w-4 h-4 text-accent animate-bounce-x" />}
                            </button>
                        );
                    })}
                </div>

                <div className="p-4 border-t border-border text-[9px] text-muted text-center">
                    SYSTEM READY // NANO.1.0 SAFE MODE
                </div>
            </div>

            {/* MAIN CONTENT */}
            <div className="flex-1 flex flex-col z-10 relative">
                <header className="h-16 border-b border-border flex items-center justify-between px-8 bg-bg/80 backdrop-blur">
                    <div className="flex items-center gap-4">
                        <div className="w-2 h-2 bg-accent rounded-full animate-ping"></div>
                        <h2 className="text-lg font-bold text-fg uppercase tracking-wider">{getPhaseTitle(phase)}</h2>
                    </div>
                    <div className="flex items-center gap-6 text-sm text-muted font-bold tracking-widest">
                        <div className="flex items-center gap-2">
                            <Scan className="w-4 h-4" />
                            <span>SENSOR: {webcamRef.current ? "ONLINE" : "STANDBY"}</span>
                        </div>
                        <button
                            onClick={() => setShowSettings(!showSettings)}
                            className={`flex items-center gap-2 hover:text-fg transition-colors ${showSettings ? 'text-accent-2' : ''}`}
                        >
                            <Sliders className="w-4 h-4" />
                            <span>CONTROLS</span>
                        </button>
                    </div>
                </header>

                <main className="flex-1 p-8 relative overflow-hidden">
                    {/* DIRECTOR CONTROLS DRAWER */}
                    <AnimatePresence>
                        {showSettings && (
                            <motion.div
                                initial={{ x: "100%" }}
                                animate={{ x: 0 }}
                                exit={{ x: "100%" }}
                                className="absolute top-0 right-0 z-50 h-full w-80 bg-surface border-l border-border shadow-2xl p-6 overflow-y-auto backdrop-blur-xl"
                            >
                                <div className="flex flex-col h-full">
                                    <div className="flex justify-between items-center mb-6">
                                        <div className="flex bg-surface-2 rounded-lg p-1 gap-1">
                                            <button
                                                onClick={() => setSidebarMode('director')}
                                                className={`px-3 py-1.5 rounded-md text-[10px] uppercase font-black tracking-wider transition-all border ${sidebarMode === 'director'
                                                    ? 'bg-surface text-accent border-accent shadow-[0_0_10px_rgba(250,204,21,0.2)]'
                                                    : 'border-transparent text-muted hover:text-fg'
                                                    }`}
                                            >
                                                Director
                                            </button>
                                            <button
                                                onClick={() => setSidebarMode('wardrobe')}
                                                className={`px-3 py-1.5 rounded-md text-[10px] uppercase font-black tracking-wider transition-all border ${sidebarMode === 'wardrobe'
                                                    ? 'bg-surface text-accent border-accent shadow-[0_0_10px_rgba(250,204,21,0.2)]'
                                                    : 'border-transparent text-muted hover:text-fg'
                                                    }`}
                                            >
                                                Wardrobe
                                            </button>
                                        </div>
                                        <button onClick={() => setShowSettings(false)} className="text-muted hover:text-fg">&times;</button>
                                    </div>

                                    {/* STORAGE CONFIGURATION */}
                                    <div className="mb-6 p-3 bg-black/40 rounded-lg border border-border/50">
                                        <h4 className="text-[10px] uppercase font-black text-muted tracking-widest mb-2 flex justify-between">
                                            Storage Link
                                            <span className={state.saveDirectoryHandle ? 'text-success' : 'text-danger'}>
                                                {state.saveDirectoryHandle ? 'CONNECTED' : 'NOT LINKED'}
                                            </span>
                                        </h4>
                                        <button
                                            onClick={async () => {
                                                try {
                                                    // @ts-ignore
                                                    const handle = await window.showDirectoryPicker({ mode: 'readwrite', startIn: 'documents' });
                                                    if (handle) {
                                                        dispatch({ type: 'SET_SAVE_DIRECTORY', payload: handle });
                                                        dispatch({ type: 'ADD_LOG', payload: { message: "Storage Link Established", type: 'success' } });
                                                    }
                                                } catch (e) {
                                                    console.log("Folder selection cancelled");
                                                }
                                            }}
                                            className={`w-full py-2 rounded text-[10px] font-bold uppercase tracking-widest transition-all border ${state.saveDirectoryHandle
                                                ? 'bg-success/10 text-success border-success/30 hover:bg-success/20'
                                                : 'bg-danger/10 text-danger border-danger/30 hover:bg-danger/20'
                                                }`}
                                        >
                                            {state.saveDirectoryHandle ? `Linked: ${state.saveDirectoryHandle.name}` : 'Connect Save Folder'}
                                        </button>
                                    </div>

                                    {sidebarMode === 'director' ? (
                                        <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-300">
                                            <div className="space-y-2">
                                                <label className="text-xs text-accent uppercase tracking-widest font-black flex justify-between">
                                                    <span>Identity Lock</span>
                                                    <span className="text-white">{directorControls.identityStrength}%</span>
                                                </label>
                                                <input
                                                    type="range" min="0" max="100"
                                                    value={directorControls.identityStrength}
                                                    onChange={(e) => setDirectorControls(p => ({ ...p, identityStrength: parseInt(e.target.value) }))}
                                                    className="w-full accent-accent h-2 rounded-full appearance-none cursor-pointer bg-surface-2"
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-xs text-accent uppercase tracking-widest font-black flex justify-between">
                                                    <span>Stylization</span>
                                                    <span className="text-white">{directorControls.stylization}%</span>
                                                </label>
                                                <input
                                                    type="range" min="0" max="100"
                                                    value={directorControls.stylization}
                                                    onChange={(e) => setDirectorControls(p => ({ ...p, stylization: parseInt(e.target.value) }))}
                                                    className="w-full accent-accent-2 h-2 rounded-full appearance-none cursor-pointer bg-surface-2"
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-xs text-accent uppercase tracking-widest font-black flex justify-between">
                                                    <span>Approx. Age</span>
                                                    <span className="text-white">{directorControls.age} yrs</span>
                                                </label>
                                                <input
                                                    type="range" min="10" max="90"
                                                    value={directorControls.age}
                                                    onChange={(e) => setDirectorControls(p => ({ ...p, age: parseInt(e.target.value) }))}
                                                    className="w-full accent-accent-2 h-2 rounded-full appearance-none cursor-pointer bg-surface-2"
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-xs text-accent uppercase tracking-widest font-black">
                                                    Basic Outfit Prompt
                                                </label>
                                                <input
                                                    type="text"
                                                    placeholder="e.g. Cyberpunk Tactical Vest"
                                                    value={directorControls.outfit}
                                                    onChange={(e) => setDirectorControls(p => ({ ...p, outfit: e.target.value }))}
                                                    className="w-full bg-black/50 border border-border rounded-lg px-4 py-3 text-sm text-white focus:border-accent outline-none"
                                                />
                                            </div>

                                            <div className="space-y-3 pt-6 border-t border-border">
                                                <label className="text-xs text-muted uppercase tracking-widest font-bold">
                                                    Negative Constraints
                                                </label>
                                                {Object.entries(directorControls.negatives).map(([key, val]) => (
                                                    <div key={key} className="flex items-center gap-3 p-2 hover:bg-surface-2 rounded-lg cursor-pointer" onClick={() => setDirectorControls(p => ({ ...p, negatives: { ...p.negatives, [key]: !val } }))}>
                                                        <input
                                                            type="checkbox"
                                                            checked={val}
                                                            onChange={(e) => setDirectorControls(p => ({
                                                                ...p,
                                                                negatives: { ...p.negatives, [key]: e.target.checked }
                                                            }))}
                                                            className="w-4 h-4 accent-danger rounded"
                                                        />
                                                        <span className="text-sm text-fg capitalize">{key.replace('_', ' ')}</span>
                                                    </div>
                                                ))}
                                            </div>

                                            <div className="pt-6 border-t border-border space-y-2">
                                                <button
                                                    onClick={handleSaveToActors}
                                                    disabled={!finalCharacterUrl}
                                                    className="w-full bg-surface-2 hover:bg-surface-3 text-white py-3 rounded-lg text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 border border-border transition-all hover:scale-[1.02]"
                                                >
                                                    <UserPlus className="w-4 h-4 text-emerald-500" /> Save Character
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                            <div className="bg-surface-2/50 p-4 rounded-xl border border-border">
                                                <h4 className="text-[10px] uppercase font-black text-accent tracking-widest mb-3 flex items-center gap-2">
                                                    <Sparkles className="w-3 h-3" /> Designer Studio
                                                </h4>
                                                <textarea
                                                    className="w-full bg-black/50 border border-border rounded-lg p-3 text-xs text-white h-20 resize-none mb-3 focus:outline-none focus:border-accent"
                                                    placeholder="Describe new outfit..."
                                                    value={wardrobePrompt}
                                                    onChange={(e) => setWardrobePrompt(e.target.value)}
                                                />
                                                <div className="grid grid-cols-2 gap-2">
                                                    <button
                                                        onClick={generateWardrobe}
                                                        disabled={isProcessing}
                                                        className="bg-accent hover:bg-yellow-400 text-black py-2 rounded-lg text-[10px] font-black uppercase tracking-wider"
                                                    >
                                                        Generate & Fit
                                                    </button>
                                                    <button
                                                        onClick={handleSaveToWardrobe}
                                                        disabled={!finalCharacterUrl}
                                                        className="bg-surface-3 hover:bg-surface-2 text-white py-2 rounded-lg text-[10px] font-black uppercase tracking-wider border border-border"
                                                    >
                                                        Save to Library
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="space-y-4">
                                                <h4 className="text-[10px] uppercase font-black text-muted tracking-widest border-b border-border pb-2">
                                                    Wardrobe Library ({state.wardrobeItems.length})
                                                </h4>
                                                <div className="grid grid-cols-3 gap-2 max-h-[400px] overflow-y-auto pr-1">
                                                    {state.wardrobeItems.map(item => (
                                                        <button
                                                            key={item.id}
                                                            onClick={async () => {
                                                                if (!finalCharacterUrl || isProcessing) return;
                                                                // Trigger quick try-on
                                                                setIsProcessing(true);
                                                                setProgress({ phase: 'wardrobe', percent: 50, detail: `Fitting ${item.name}...` });
                                                                try {
                                                                    const fitted = await GeminiService.generateImage(
                                                                        `Virtual Try-On: Apply costume in [IMAGE 2] to subject [IMAGE 1].
                                                                         Maintain subject identity. Match lighting.`,
                                                                        state.apiKey,
                                                                        state.model,
                                                                        [
                                                                            { url: finalCharacterUrl, label: "Subject" },
                                                                            { url: item.url, label: "Costume" }
                                                                        ],
                                                                        { aspectRatio: '2:3' }
                                                                    );
                                                                    setFinalCharacterUrl(fitted);
                                                                } catch (e) { console.error(e); }
                                                                finally { setIsProcessing(false); setProgress({ phase: '', percent: 0, detail: "" }); }
                                                            }}
                                                            className="aspect-square rounded-lg border border-border overflow-hidden relative group hover:border-accent transition-all"
                                                        >
                                                            <img src={item.url} className="w-full h-full object-cover" />
                                                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                                                <Shirt className="w-4 h-4 text-white" />
                                                            </div>
                                                        </button>
                                                    ))}
                                                    {state.wardrobeItems.length === 0 && (
                                                        <div className="col-span-3 text-center py-4 opacity-50 text-[10px]">
                                                            Library Empty
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <AnimatePresence mode='wait'>
                        {/* PHASE 1: BIOMETRIC SCANNER */}
                        {phase === 1 && (
                            <motion.div
                                key="phase1"
                                initial={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
                                animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                                exit={{ opacity: 0, scale: 1.05, filter: 'blur(10px)' }}
                                className="h-full flex gap-8"
                            >
                                <div className="flex-1 relative bg-black rounded-2xl overflow-hidden border border-border shadow-2xl group flex flex-col">
                                    {/* TOGGLE HEADER */}
                                    {/* TOGGLE HEADER */}
                                    <div className="absolute top-4 right-4 z-20 flex items-center gap-4">

                                        {/* Camera Toggle */}
                                        <button
                                            onClick={() => setCameraEnabled(!cameraEnabled)}
                                            className={`p-3 rounded-full border transition-all ${cameraEnabled ? 'bg-surface border-accent text-accent shadow-[0_0_15px_rgba(250,204,21,0.3)]' : 'bg-black border-white/20 text-white/50 hover:text-white'}`}
                                            title={cameraEnabled ? "Disable Camera" : "Enable Camera"}
                                        >
                                            {cameraEnabled ? <CameraIcon className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                                        </button>

                                        <div className="flex bg-black/90 backdrop-blur rounded-full border border-border p-2 gap-2 shadow-xl">
                                            <button
                                                onClick={() => setUploadMode(false)}
                                                className={`px-5 py-2 rounded-full text-xs font-black uppercase tracking-wider transition-all border ${!uploadMode ? 'bg-surface border-accent text-accent shadow-[0_0_15px_rgba(250,204,21,0.3)]' : 'border-transparent text-white hover:text-accent hover:bg-white/5'}`}
                                            >
                                                Auto-Scan
                                            </button>
                                            <button
                                                onClick={() => setUploadMode(true)}
                                                className={`px-5 py-2 rounded-full text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 border ${uploadMode ? 'bg-surface border-accent text-accent shadow-[0_0_15px_rgba(250,204,21,0.3)]' : 'border-transparent text-white hover:text-accent hover:bg-white/5'}`}
                                            >
                                                <Upload className="w-3 h-3" /> Upload
                                            </button>
                                        </div>
                                    </div>

                                    {!uploadMode ? (
                                        <div className="relative h-full w-full bg-black">
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                {cameraEnabled ? (
                                                    <Webcam
                                                        ref={webcamRef}
                                                        screenshotFormat="image/jpeg"
                                                        className="h-full w-full object-cover"
                                                        videoConstraints={{ width: 1280, height: 720, facingMode: "user" }}
                                                    />
                                                ) : (
                                                    <div className="flex flex-col items-center justify-center text-muted gap-6 animate-pulse">
                                                        <div className="relative">
                                                            <button
                                                                onClick={() => setCameraEnabled(true)}
                                                                className="group relative flex flex-col items-center gap-4"
                                                            >
                                                                <div className="w-24 h-24 rounded-full border-4 border-dashed border-accent/30 flex items-center justify-center group-hover:border-accent group-hover:bg-accent/10 transition-all duration-500">
                                                                    <CameraIcon className="w-10 h-10 text-accent group-hover:scale-110 transition-transform" />
                                                                </div>
                                                                <div className="text-center">
                                                                    <h3 className="text-xl font-black text-white uppercase tracking-widest mb-1"> Initialize Sensors </h3>
                                                                    <p className="text-xs text-accent uppercase tracking-widest font-mono"> Turn On Camera to Begin </p>
                                                                </div>
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* SPOTLIGHT OVERLAY & HUD */}
                                            <div className="absolute inset-0 pointer-events-none">
                                                {/* Darken peripheral area - Radial Gradient approach */}
                                                <div
                                                    className="absolute inset-0 z-10"
                                                    style={{ background: 'radial-gradient(circle at center, transparent 20%, rgba(9,9,11,0.95) 60%)' }}
                                                ></div>

                                                {/* Tints for active states */}
                                                {isScanning && (
                                                    <div className="absolute inset-0 bg-success/5 z-10 animate-pulse"></div>
                                                )}

                                                {/* SCANNING BEAM */}
                                                <div className="absolute inset-0 z-20 opacity-30 overflow-hidden">
                                                    <div className="w-full h-[2px] bg-accent shadow-[0_0_20px_rgba(250,204,21,0.8)] animate-[scan_3s_ease-in-out_infinite]" style={{ top: '50%' }}></div>
                                                </div>

                                                {/* CENTRAL HUD CIRCLE - Increased size to match detection zone */}
                                                <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[450px] h-[450px] z-30 flex items-center justify-center transition-all duration-300 pointer-events-none ${isScanning ? 'scale-105' : 'scale-100'}`}>

                                                    {/* Outer Bracket Corners */}
                                                    <div className="absolute inset-0 border-[2px] border-accent/20 rounded-[4rem] scale-110"></div>
                                                    <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-accent rounded-tl-3xl"></div>
                                                    <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-accent rounded-tr-3xl"></div>
                                                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-accent rounded-bl-3xl"></div>
                                                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-accent rounded-br-3xl"></div>

                                                    {/* Rotating Dashed Ring */}
                                                    <div className={`absolute inset-4 border border-accent/20 rounded-full border-dashed animate-[spin_20s_linear_infinite]`}></div>

                                                    {/* Active Status Ring (Blue Static -> Reversed Spin) -- UPDATED: Thicker, Visible, Counter-Rotate */}
                                                    <svg className={`absolute inset-0 w-full h-full opacity-100 ${isScanning ? 'animate-[spin_10s_linear_infinite_reverse]' : 'rotate-45'}`}>
                                                        <circle
                                                            cx="50%" cy="50%" r="48%"
                                                            fill="none" strokeWidth="4"
                                                            stroke="currentColor"
                                                            strokeDasharray="16 16"
                                                            className="text-accent-2"
                                                        />
                                                    </svg>

                                                    {/* Progress Ring (Gold) */}
                                                    <div className="absolute inset-0 rounded-full rotate-[-90deg]">
                                                        <svg className="w-full h-full">
                                                            <circle
                                                                cx="50%" cy="50%" r="48%"
                                                                fill="none" strokeWidth="6"
                                                                stroke="currentColor"
                                                                strokeDasharray="289 289" // 2 * pi * r (approx 48% of 320px container is ~ 150px rad -> wait. SVG scaling. viewbox is implicit. 48% is relative)
                                                                strokeDashoffset={289 - (289 * stabilityProgress / 100)}
                                                                pathLength="289" // Explicit path length for easier calc
                                                                strokeLinecap="round"
                                                                className={`transition-all duration-100 ease-linear drop-shadow-[0_0_10px_rgba(250,204,21,0.8)] ${activeSector ? 'text-accent' : 'text-transparent'}`}
                                                            />
                                                        </svg>
                                                    </div>

                                                    {/* Center Fixation Point */}
                                                    <div
                                                        className={`w-2 h-2 rounded-full transition-all ${isScanning ? 'bg-success scale-150 shadow-[0_0_15px_#22c55e]' : 'bg-accent/50'
                                                            }`}
                                                    ></div>
                                                </div>

                                                {/* STATUS PILLS */}
                                                {activeSector && (
                                                    <motion.div
                                                        initial={{ opacity: 0, y: 10 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        className="absolute top-[15%] left-1/2 -translate-x-1/2 z-40 bg-black/80 backdrop-blur border border-accent/50 px-6 py-2 rounded-full shadow-[0_0_20px_rgba(250,204,21,0.2)]"
                                                    >
                                                        <span className="text-accent font-black uppercase tracking-widest text-xs flex items-center gap-2">
                                                            <Target className="w-4 h-4 animate-spin-slow" />
                                                            LOCKING: {activeSector}
                                                        </span>
                                                    </motion.div>
                                                )}

                                                {/* OUT OF BOUNDS WARNING */}
                                                {!activeSector && !capturedAngles.center && (
                                                    <motion.div
                                                        initial={{ opacity: 0 }}
                                                        animate={{ opacity: 1 }}
                                                        className="absolute top-[15%] left-1/2 -translate-x-1/2 z-40 bg-danger/90 backdrop-blur border border-danger/50 px-6 py-2 rounded-full shadow-[0_0_20px_rgba(220,38,38,0.4)]"
                                                    >
                                                        <span className="text-white font-black uppercase tracking-widest text-xs flex items-center gap-2">
                                                            <Scan className="w-4 h-4 animate-pulse" />
                                                            CENTER FACE TO SCAN
                                                        </span>
                                                    </motion.div>
                                                )}

                                                <div className="absolute bottom-[15%] left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
                                                    <button
                                                        onClick={() => capturedAngles.center ? activeSector && captureCurrentFrame(activeSector) : captureCurrentFrame('center')}
                                                        className="px-8 py-3 bg-black/90 hover:bg-black border border-accent/50 hover:border-accent text-accent rounded-full shadow-[0_0_20px_rgba(250,204,21,0.2)] hover:shadow-[0_0_30px_rgba(250,204,21,0.6)] text-sm font-black uppercase tracking-widest flex items-center gap-3 transition-all group scale-100 hover:scale-110"
                                                    >
                                                        <CameraIcon className="w-5 h-5 group-hover:rotate-12 transition-transform" />
                                                        Manual Capture
                                                    </button>
                                                </div>

                                                <div className="absolute bottom-6 left-8 z-30 hidden md:block">
                                                    <div className="flex gap-8 opacity-90 font-mono text-xs text-accent font-bold drop-shadow-md bg-black/50 p-4 rounded-xl border border-white/10 backdrop-blur-sm">
                                                        <div className="flex flex-col">
                                                            <span className="text-[10px] text-muted uppercase tracking-wider">Yaw Axis</span>
                                                            <span className="text-lg">{yaw.toFixed(1)}°</span>
                                                        </div>
                                                        <div className="w-[1px] bg-white/20"></div>
                                                        <div className="flex flex-col">
                                                            <span className="text-[10px] text-muted uppercase tracking-wider">Pitch Axis</span>
                                                            <span className="text-lg">{pitch.toFixed(1)}°</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="h-full w-full p-12 grid grid-cols-3 gap-6 overflow-y-auto">
                                            {(['center', 'left', 'right', 'up', 'down'] as const).map(angle => (
                                                <div key={angle} className="relative aspect-video bg-surface-2 border border-border rounded-xl overflow-hidden group hover:border-accent/50 transition-all">
                                                    {capturedAngles[angle] ? (
                                                        <>
                                                            <img src={capturedAngles[angle]!} className="w-full h-full object-cover opacity-80" />
                                                            <button
                                                                onClick={() => setAngle(angle, null)}
                                                                className="absolute top-2 right-2 bg-black/50 p-2 rounded-full hover:bg-red-500/50 transition-colors"
                                                            >
                                                                <RefreshCw className="w-4 h-4 text-white" />
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <label className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer hover:bg-surface transition-colors">
                                                            <Upload className="w-8 h-8 text-muted mb-2 group-hover:text-accent" />
                                                            <span className="text-xs text-muted font-bold uppercase tracking-widest">{angle} Reference</span>
                                                            <input
                                                                type="file"
                                                                accept="image/*"
                                                                className="hidden"
                                                                onChange={(e) => {
                                                                    if (e.target.files?.[0]) handleFileUpload(angle, e.target.files[0]);
                                                                }}
                                                            />
                                                        </label>
                                                    )}
                                                    <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/50 rounded text-[9px] text-accent uppercase font-bold tracking-widest">
                                                        {angle}
                                                    </div>
                                                </div>
                                            ))}
                                            <div className="col-span-1 flex items-center justify-center p-6 text-center text-muted text-xs font-mono border border-dashed border-border rounded-xl">
                                                Minimum requirements:<br />Center + Left + Right
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="w-80 flex flex-col gap-4">
                                    <h3 className="text-xs font-bold text-accent uppercase tracking-[0.2em] mb-2 border-b border-border pb-2">Biometric Manifest</h3>
                                    {(['center', 'left', 'right', 'up', 'down'] as const).map((label) => (
                                        <div
                                            key={label}
                                            onClick={() => {
                                                if (capturedAngles[label]) setAngle(label, null);
                                            }}
                                            className={`border p-3 rounded-lg flex items-center justify-between group transition-all cursor-pointer hover:bg-surface-2 ${capturedAngles[label] ? 'bg-success/5 border-success/30' : 'bg-surface border-border'}`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={`w-10 h-10 rounded-md flex items-center justify-center relative overflow-hidden bg-black`}>
                                                    {capturedAngles[label] ? (
                                                        <img src={capturedAngles[label]!} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <User className="w-4 h-4 text-muted" />
                                                    )}
                                                </div>
                                                <div>
                                                    <div className={`text-xs font-bold uppercase ${capturedAngles[label] ? 'text-success' : 'text-muted'}`}>{label}</div>
                                                    <div className="text-[9px] text-muted opacity-70">{capturedAngles[label] ? 'ACQUIRED (CLICK TO RETAKE)' : 'PENDING'}</div>
                                                </div>
                                            </div>
                                            {capturedAngles[label] && <CheckCircle2 className="w-4 h-4 text-success" />}
                                        </div>
                                    ))}
                                    <div className="mt-auto">
                                        <button
                                            onClick={resetScan}
                                            className="w-full py-4 mb-2 bg-danger hover:bg-red-600 text-accent shadow-lg shadow-danger/20 font-black uppercase tracking-widest transition-all text-xs rounded-lg flex items-center justify-center gap-2"
                                        >
                                            <RotateCcw className="w-4 h-4 text-accent" /> RESET SCAN
                                        </button>
                                        <button
                                            disabled={isPhaseLocked(2)}
                                            onClick={() => setPhase(2)}
                                            className={`w-full py-4 font-black uppercase tracking-widest transition-all text-xs rounded-lg flex items-center justify-center gap-2 ${isPhaseLocked(2)
                                                ? 'bg-surface-2 text-muted cursor-not-allowed'
                                                : 'bg-accent hover:bg-cyan-400 text-black shadow-lg shadow-accent/20'
                                                }`}
                                        >
                                            Processing Matrix <ChevronRight className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {/* PHASE 2: BODY ARCHETYPES */}
                        {phase === 2 && (
                            <motion.div
                                key="phase2"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="h-full flex flex-col items-center justify-center p-12"
                            >
                                <div className="text-center mb-12">
                                    <h2 className="text-4xl font-black text-fg uppercase tracking-tighter mb-4 flex justify-center items-center gap-4">
                                        <Layers className="w-8 h-8 text-accent animate-bounce" />
                                        Morphological Matrix
                                    </h2>
                                    <p className="text-muted uppercase tracking-widest text-sm max-w-2xl mx-auto">
                                        Select physical substrate for neural projection mapping.
                                    </p>

                                    {/* VARIANT SELECTOR */}
                                    <div className="flex justify-center gap-4 mt-8">
                                        {[
                                            { id: 'masc', label: 'Masculine' },
                                            { id: 'fem', label: 'Feminine' },
                                            { id: 'youth', label: 'Youth' }
                                        ].map((v) => (
                                            <button
                                                key={v.id}
                                                onClick={() => setMorphVariant(v.id as any)}
                                                className={`px-6 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition-all ${morphVariant === v.id
                                                    ? 'bg-yellow-500/10 text-yellow-500 border border-yellow-500 shadow-[0_0_20px_rgba(234,179,8,0.4)] scale-105'
                                                    : 'bg-surface border border-border text-muted hover:text-white hover:border-accent/50'
                                                    }`}
                                            >
                                                {v.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 w-full max-w-6xl">
                                    {bodyArchetypes.map((type) => {
                                        const Icon = type.icon;
                                        return (
                                            <button
                                                key={type.id}
                                                onClick={() => setSelectedBody(type.id)}
                                                className={`relative group h-96 border rounded-2xl p-6 flex flex-col items-center justify-between transition-all duration-300 overflow-hidden ${selectedBody === type.id
                                                    ? 'bg-accent/10 border-accent shadow-lg shadow-accent/10'
                                                    : 'bg-surface border-border hover:border-accent/50 group-hover:bg-surface-2'
                                                    }`}
                                            >
                                                <div className="text-center z-10 w-full h-full flex flex-col items-center justify-center">
                                                    <Icon className={`w-12 h-12 mb-4 ${selectedBody === type.id ? 'text-accent' : 'text-muted'}`} />
                                                    <h3 className={`text-xl font-bold uppercase tracking-widest mb-2 ${selectedBody === type.id ? 'text-fg' : 'text-muted group-hover:text-fg'}`}>
                                                        {type.name}
                                                    </h3>
                                                    <p className="text-xs text-muted/60 font-mono leading-relaxed">
                                                        {type.desc}
                                                    </p>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                                <div className="mt-16 flex justify-between w-full max-w-6xl">
                                    <button onClick={() => setPhase(1)} className="text-muted hover:text-fg text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                                        &larr; Return to Scan
                                    </button>
                                    <button
                                        disabled={!selectedBody}
                                        onClick={() => setPhase(3)}
                                        className={`px-12 py-4 text-sm font-black uppercase tracking-widest rounded-lg transition-all ${selectedBody
                                            ? 'bg-accent text-blue-700 hover:scale-105 shadow-[0_0_20px_rgba(250,204,21,0.4)]'
                                            : 'bg-surface-2 text-muted cursor-not-allowed'
                                            }`}
                                    >
                                        Initialize Style Synthesis &rarr;
                                    </button>
                                </div>
                            </motion.div>
                        )}

                        {/* PHASE 3: STYLE SELECTION */}
                        {phase === 3 && (
                            <motion.div
                                key="phase3"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                className="h-full flex flex-col items-center justify-center p-12"
                            >
                                <div className="text-center mb-12">
                                    <h2 className="text-4xl font-black text-fg uppercase tracking-tighter mb-4 flex justify-center items-center gap-4">
                                        <Aperture className="w-8 h-8 text-accent animate-spin-slow" />
                                        Style Synthesis Engine
                                    </h2>
                                    <p className="text-muted uppercase tracking-widest text-sm max-w-2xl mx-auto">
                                        Select rendering protocol for universe instantiation.
                                    </p>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-5xl">
                                    {Object.values(styleMatrix).map((style) => (
                                        <button
                                            key={style.id}
                                            onClick={() => setSelectedStyle(style.id)}
                                            className={`group relative h-40 border rounded-xl transition-all duration-300 overflow-hidden flex flex-col justify-center px-8 ${selectedStyle === style.id
                                                ? 'bg-surface border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.5)] scale-105 z-10'
                                                : 'bg-surface border-border hover:border-accent hover:bg-surface-2'
                                                }`}
                                        >
                                            <div className="flex justify-between items-center mb-2">
                                                <span className={`text-xl font-black uppercase tracking-tighter ${selectedStyle === style.id ? 'text-blue-400' : 'text-fg'}`}>
                                                    {style.label}
                                                </span>
                                                <Target className={`w-5 h-5 ${selectedStyle === style.id ? 'text-blue-400' : 'text-muted'}`} />
                                            </div>
                                            <p className={`text-[10px] font-mono leading-tight line-clamp-2 ${selectedStyle === style.id ? 'text-blue-200/70' : 'text-muted'}`}>
                                                {style.keywords}
                                            </p>
                                            {/* Preview Mockup */}
                                            <div className="flex gap-1 mt-3">
                                                <div className={`w-2 h-2 rounded-full ${selectedStyle === style.id ? 'bg-blue-400' : 'bg-muted'}`}></div>
                                                <div className={`w-2 h-2 rounded-full opacity-50 ${selectedStyle === style.id ? 'bg-blue-400' : 'bg-muted'}`}></div>
                                                <div className={`w-2 h-2 rounded-full opacity-25 ${selectedStyle === style.id ? 'bg-blue-400' : 'bg-muted'}`}></div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                                <div className="mt-16 flex justify-between w-full max-w-5xl">
                                    <button onClick={() => setPhase(2)} className="text-muted hover:text-fg text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                                        &larr; Return to Body
                                    </button>
                                    <button
                                        disabled={!selectedStyle}
                                        onClick={handleOrchestration}
                                        className={`px-12 py-4 text-sm font-black uppercase tracking-widest rounded-lg transition-all ${selectedStyle
                                            ? 'bg-gradient-to-r from-accent to-blue-600 text-white hover:shadow-lg shadow-accent/20'
                                            : 'bg-surface-2 text-muted cursor-not-allowed'
                                            }`}
                                    >
                                        Initialize Neural Link &rarr;
                                    </button>
                                </div>
                            </motion.div>
                        )}

                        {/* PHASE 4: NANO NEURAL LINK (Processing) */}
                        {(phase === 4 || isProcessing) && (
                            <motion.div
                                key="phase4"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="h-full flex flex-col items-center justify-center p-8 relative"
                            >
                                <div className="w-full max-w-2xl bg-surface border border-border p-1 rounded-xl relative overflow-hidden shadow-2xl">
                                    <div className="h-1 bg-surface-2 w-full mb-1 relative overflow-hidden">
                                        <motion.div
                                            className="h-full bg-blue-500 relative"
                                            initial={{ width: "0%" }}
                                            animate={{ width: `${progress.percent}%` }}
                                            transition={{ duration: 0.5, ease: "easeInOut" }}
                                        >
                                            <div className="absolute inset-0 bg-yellow-400/30 w-full animate-[shimmer_2s_infinite]" style={{ backgroundImage: 'linear-gradient(90deg, transparent, rgba(250, 204, 21, 0.5), transparent)' }}></div>
                                        </motion.div>
                                        {/* Indeterminate loader backing when stalled */}
                                        <div className="absolute inset-0 w-full h-full bg-accent/20 animate-pulse z-0 mix-blend-overlay"></div>
                                    </div>
                                    <div className="h-96 bg-bg p-6 font-mono text-xs overflow-hidden flex flex-col-reverse rounded-b-lg">
                                        {generationLogs.map((log, i) => (
                                            <div key={i} className="mb-1 text-muted border-l-2 border-border pl-2">
                                                <span className="text-accent mr-2">{'>'}</span>{log}
                                            </div>
                                        ))}
                                    </div>

                                </div>
                                <div className="mt-8 flex flex-col items-center gap-4">
                                    <div className="text-accent animate-pulse font-black tracking-widest text-sm uppercase flex items-center gap-2 justify-center">
                                        <Cpu className="w-4 h-4 animate-spin" />
                                        {progress.detail || "Nano Neural Engine Active..."}
                                    </div>
                                    <button
                                        onClick={cancelGeneration}
                                        className="px-6 py-2 rounded-full border border-danger/30 text-danger hover:bg-danger/10 text-xs font-bold uppercase tracking-widest transition-colors flex items-center gap-2"
                                    >
                                        <Ban className="w-4 h-4" /> Abort Sequence
                                    </button>
                                </div>
                            </motion.div>
                        )}

                        {/* PHASE 5: DIGITAL RECONSTRUCTION (RESULT) */}
                        {phase === 5 && finalCharacterUrl && (
                            <motion.div
                                key="phase5"
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="h-full flex gap-8 items-center justify-center p-12"
                            >
                                <div className="h-full aspect-[2/3] relative rounded-xl overflow-hidden border-2 border-accent shadow-2xl group">
                                    <img src={finalCharacterUrl} className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-80"></div>

                                    {/* ID CARD */}
                                    <div className="absolute bottom-6 left-6 right-6 font-mono text-xs">
                                        <div className="flex justify-between items-end border-b border-white/20 pb-2 mb-2">
                                            <div>
                                                <div className="text-accent uppercase tracking-widest text-[9px]">Subject ID</div>
                                                <div className="text-xl font-black text-white">{state.lastCastedPrompt ? state.lastCastedPrompt.substring(0, 8).toUpperCase() : 'UNK-001'}</div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-accent uppercase tracking-widest text-[9px]">Class</div>
                                                <div className="text-white font-bold">{selectedBody?.toUpperCase()}</div>
                                            </div>
                                        </div>
                                        <div className="flex justify-between text-[9px] uppercase tracking-widest text-white/50">
                                            <span>Sim-Date: {new Date().toLocaleDateString()}</span>
                                            <span>Nano-Banana Pro</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="w-96 flex flex-col gap-4">
                                    <h3 className="text-2xl font-black text-fg uppercase italic tracking-tighter">
                                        Reconstruction <span className="text-accent">Complete</span>
                                    </h3>
                                    <p className="text-xs text-muted mb-8 leading-relaxed">
                                        Neural synthesis successful. Subject has been re-topologized and is ready for integration into the storyboard matrix.
                                        {generatePackMode && " Full variation pack generated."}
                                    </p>

                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            onClick={() => addToCast(false)}
                                            className="col-span-1 py-4 bg-surface-2 hover:bg-surface text-accent font-black uppercase tracking-widest text-xs rounded-xl transition-all shadow-lg shadow-accent/10 border border-accent flex flex-col items-center gap-1 group-hover:scale-[1.02]"
                                        >
                                            <UserPlus className="w-5 h-5" />
                                            {generatePackMode ? "Add Pack" : "Add Actor"}
                                        </button>

                                        <button
                                            // Call distinct handler to ensure state preservation
                                            onClick={handleRegenerate}
                                            className="col-span-1 py-4 bg-surface-2 hover:bg-surface text-fg font-bold uppercase tracking-widest text-xs rounded-xl transition-all border border-border hover:border-accent flex flex-col items-center gap-1"
                                        >
                                            <RotateCcw className="w-5 h-5 text-accent-2" />
                                            Regenerate
                                        </button>

                                        <button
                                            onClick={downloadPoster}
                                            className="col-span-1 py-3 bg-bg border border-border text-muted hover:text-fg hover:border-accent text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2"
                                        >
                                            <Share2 className="w-3 h-3" /> Save Poster
                                        </button>
                                        <button
                                            onClick={() => {
                                                setShowSettings(true);
                                                setSidebarMode('wardrobe');
                                            }}
                                            className="col-span-1 py-3 bg-bg border border-border text-muted hover:text-accent hover:border-accent/30 text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2"
                                        >
                                            <Layers className="w-3 h-3" /> Wardrobe V2
                                        </button>

                                        {/* Reference Sheet Section */}
                                        <div className="col-span-2 pt-2 border-t border-border mt-2 space-y-2">
                                            <div className="flex gap-2">
                                                {[
                                                    { id: 'form_focus', label: 'Form Focus' },
                                                    { id: 'face_focus', label: 'Face Focus' },
                                                    { id: 'split_focus', label: 'Split Focus' }
                                                ].map((l) => (
                                                    <button
                                                        key={l.id}
                                                        onClick={() => setRefLayout(l.id as any)}
                                                        className={`flex-1 py-2 rounded text-[9px] font-bold uppercase transition-all border ${refLayout === l.id
                                                            ? 'bg-accent/20 border-accent text-accent shadow-[0_0_10px_rgba(250,204,21,0.2)]'
                                                            : 'bg-surface-2 border-border text-muted hover:border-white/50'
                                                            }`}
                                                    >
                                                        {l.label}
                                                    </button>
                                                ))}
                                            </div>
                                            <button
                                                onClick={handleGenerateRefSheet}
                                                disabled={isProcessing}
                                                className="w-full py-3 bg-bg border border-border text-muted hover:text-accent hover:border-accent text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2 group relative"
                                            >
                                                <LayoutTemplate className="w-3 h-3" />
                                                Generate Reference Sheet
                                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-gray-900 border border-gray-700 rounded-lg shadow-xl text-[10px] text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 normal-case text-left">
                                                    <strong className="text-white block mb-1">Production Note:</strong>
                                                    High-Fidelity AI Synthesis: Identity & layout are strictly enforced, but minor variations may occur. Always review for production use.
                                                </div>
                                            </button>
                                        </div>
                                    </div>
                                    <div className="mt-8 border-t border-border pt-4">
                                        <button
                                            onClick={resetScan}
                                            className="w-full py-3 text-muted hover:text-danger text-xs font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
                                        >
                                            <RefreshCw className="w-3 h-3" />
                                            Initialize New Subject
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {/* REFERENCE SHEET MODAL */}
                        {showRefSheet && refSheetUrl && (
                            <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-xl flex items-center justify-center p-8 animate-in fade-in duration-200">
                                <div className="relative w-full max-w-6xl h-[90vh] flex flex-col items-center bg-[#18181b] rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
                                    <div className="flex justify-between items-center w-full p-6 border-b border-white/10 bg-[#09090b] flex-shrink-0">
                                        <h3 className="text-xl font-black text-white uppercase tracking-widest flex items-center gap-3">
                                            <LayoutTemplate className="w-6 h-6 text-accent" /> Character Reference Sheet
                                        </h3>
                                        <div className="flex gap-3">
                                            <button
                                                onClick={() => {
                                                    const newMember = {
                                                        id: `nano_ref_${Date.now()}`,
                                                        url: refSheetUrl,
                                                        name: `Ref_Sheet_${new Date().toLocaleTimeString()}`,
                                                        tag: 'front' as const,
                                                        profile: {
                                                            identity: "Reference Sheet",
                                                            wardrobe: "N/A",
                                                            accessories: "N/A",
                                                            style: "Technical"
                                                        }
                                                    };
                                                    // @ts-ignore
                                                    dispatch({ type: 'ADD_CAST', payload: newMember });
                                                    showToast("Added to Cast Assets");
                                                }}
                                                className="bg-surface hover:bg-surface-2 text-white px-4 py-2 rounded-lg font-bold uppercase tracking-widest text-[10px] transition-all border border-white/10 flex items-center gap-2"
                                            >
                                                <UserPlus className="w-4 h-4" /> Cast
                                            </button>
                                            <button
                                                onClick={() => {
                                                    const a = document.createElement('a');
                                                    a.href = refSheetUrl;
                                                    a.download = `RefSheet-${Date.now()}.png`;
                                                    a.click();
                                                    showToast("Download Started");
                                                }}
                                                className="bg-surface hover:bg-surface-2 text-white px-4 py-2 rounded-lg font-bold uppercase tracking-widest text-[10px] transition-all border border-white/10 flex items-center gap-2"
                                            >
                                                <Download className="w-4 h-4" /> Download
                                            </button>
                                            <button
                                                onClick={async () => {
                                                    if (state.saveDirectoryHandle) {
                                                        try {
                                                            // @ts-ignore - Verify permission
                                                            if ((await state.saveDirectoryHandle.queryPermission({ mode: 'readwrite' })) !== 'granted') {
                                                                // @ts-ignore
                                                                if ((await state.saveDirectoryHandle.requestPermission({ mode: 'readwrite' })) !== 'granted') {
                                                                    throw new Error("Permission denied");
                                                                }
                                                            }

                                                            const root = await state.saveDirectoryHandle.getDirectoryHandle('ReferenceSheets', { create: true });
                                                            const filename = `RefSheet-${Date.now()}.png`;
                                                            const handle = await root.getFileHandle(filename, { create: true });
                                                            const writable = await handle.createWritable();
                                                            const res = await fetch(refSheetUrl);
                                                            const blob = await res.blob();
                                                            await writable.write(blob);
                                                            await writable.close();
                                                            showToast("Saved to ReferenceSheets/");
                                                        } catch (e: any) {
                                                            showToast("Save failed. Downloading instead...");
                                                            const a = document.createElement('a');
                                                            a.href = refSheetUrl;
                                                            a.download = `RefSheet-Backup-${Date.now()}.png`;
                                                            a.click();
                                                        }
                                                    } else {
                                                        showToast("No Save Folder. Downloading instead...");
                                                        const a = document.createElement('a');
                                                        a.href = refSheetUrl;
                                                        a.download = `RefSheet-${Date.now()}.png`;
                                                        a.click();
                                                    }
                                                }}
                                                className="bg-accent hover:bg-white text-black px-6 py-2 rounded-lg font-bold uppercase tracking-widest text-[10px] transition-all flex items-center gap-2"
                                            >
                                                <Share2 className="w-4 h-4" /> Save
                                            </button>
                                            <button
                                                onClick={() => { setShowRefSheet(false); setRefSheetUrl(null); }}
                                                className="bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white px-4 py-2 rounded-lg font-bold uppercase tracking-widest text-[10px] transition-all border border-red-500/20 flex items-center gap-2"
                                            >
                                                <X className="w-4 h-4" /> Close
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex-1 w-full bg-black/50 overflow-hidden flex items-center justify-center relative p-4 min-h-0">
                                        <img src={refSheetUrl} className="max-w-full max-h-full object-contain shadow-2xl" />
                                    </div>
                                </div>
                            </div>
                        )}

                    </AnimatePresence >

                    {/* TOAST OVERLAY */}
                    <AnimatePresence>
                        {
                            notification && (
                                <motion.div
                                    initial={{ opacity: 0, y: 50 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 20 }}
                                    className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-surface border border-accent/50 text-fg px-6 py-3 rounded-full shadow-2xl backdrop-blur-xl z-50 flex items-center gap-3"
                                >
                                    <CheckCircle2 className="w-5 h-5 text-accent" />
                                    <span className="text-xs font-bold uppercase tracking-widest">{notification}</span>
                                </motion.div>
                            )
                        }
                    </AnimatePresence >
                </main >

            </div >
        </div >
    );
};

export default NanoCastingDirector;
