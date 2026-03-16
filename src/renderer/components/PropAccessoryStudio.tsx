import { useState, useEffect, useRef } from 'react';
import {
    Package, RefreshCcw, Maximize, Sparkles,
    Download, UserPlus, X, Eraser, Save, Upload, Trash2
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { GeminiService } from '../services/GeminiService';
import { removeBackground } from "@imgly/background-removal";
import { CutoutService } from "../services/CutoutService";
import { nativeJoinPath, nativeListFiles, nativeReadFile, nativeWriteFile, isNativeParams, safeFetchBlob } from '../utils/NativeFileAssets';
import type { PropItem, CastMember } from '../context/AppContext';
import ConfirmDialog from './ui/ConfirmDialog';

const PropAccessoryStudio = () => {
    const { state, dispatch } = useAppContext();
    const {
        activeTab,
        designerPrompt,
        designerImage,
        selectedProp,
        selectedCharacter,
        appliedImage,
        applyNote,
        applyMask,
        removeApplyBg,
        applyAiMaskActive,
        applyTolerance,
        applySpillSuppression,
        applyMaskSoftening,
        applyInvertBg,
        matteErosion,
        processedApplyUrl
    } = state.propStudioState;

    const setPropState = (payload: Partial<typeof state.propStudioState>) => {
        dispatch({ type: 'SET_PROP_STUDIO_STATE', payload });
    };

    const setActiveTab = (val: typeof activeTab) => setPropState({ activeTab: val });
    const setDesignerPrompt = (val: string) => setPropState({ designerPrompt: val });
    const setDesignerImage = (val: string | null) => setPropState({ designerImage: val });
    const setSelectedProp = (val: PropItem | null) => setPropState({ selectedProp: val });
    const setSelectedCharacter = (val: CastMember | null) => setPropState({ selectedCharacter: val });
    const setAppliedImage = (val: string | null) => setPropState({ appliedImage: val });
    const setApplyNote = (val: string) => setPropState({ applyNote: val });
    const setApplyMask = (val: string | null) => setPropState({ applyMask: val });
    const setRemoveApplyBg = (val: boolean) => setPropState({ removeApplyBg: val });
    const setApplyAiMaskActive = (val: boolean) => setPropState({ applyAiMaskActive: val });
    const setApplyTolerance = (val: number) => setPropState({ applyTolerance: val });
    const setApplySpillSuppression = (val: number) => setPropState({ applySpillSuppression: val });
    const setApplyMaskSoftening = (val: number) => setPropState({ applyMaskSoftening: val });
    const setMatteErosion = (val: number) => setPropState({ matteErosion: val });
    const setProcessedApplyUrl = (val: string | null) => setPropState({ processedApplyUrl: val });

    const applyImgRef = useRef<HTMLImageElement>(null);
    const applyMaskImgRef = useRef<HTMLImageElement>(null);
    const applyCanvasRef = useRef<HTMLCanvasElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const runApplyIsolation = (): string | null => {
        if (removeApplyBg && appliedImage && applyImgRef.current && applyCanvasRef.current) {
            const canvas = applyCanvasRef.current;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            const img = applyImgRef.current;
            if (!img.complete || img.naturalWidth === 0) return null;

            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            ctx?.clearRect(0, 0, canvas.width, canvas.height);

            if (applyAiMaskActive && applyMask && applyMaskImgRef.current) {
                const maskImg = applyMaskImgRef.current;
                if (maskImg.complete && maskImg.naturalWidth > 0) {
                    const tempCanvas = document.createElement('canvas');
                    tempCanvas.width = canvas.width;
                    tempCanvas.height = canvas.height;
                    const tempCtx = tempCanvas.getContext('2d');
                    tempCtx?.drawImage(maskImg, 0, 0, canvas.width, canvas.height);

                    let maskData = tempCtx?.getImageData(0, 0, canvas.width, canvas.height);

                    if (matteErosion > 0 && maskData) {
                        const originalData = new Uint8ClampedArray(maskData.data);
                        const width = canvas.width;
                        const height = canvas.height;
                        const eroded = maskData.data;
                        const radius = matteErosion;

                        for (let y = radius; y < height - radius; y++) {
                            for (let x = radius; x < width - radius; x++) {
                                const idx = (y * width + x) * 4;
                                let minLuminance = 255;
                                for (let dy = -radius; dy <= radius; dy++) {
                                    for (let dx = -radius; dx <= radius; dx++) {
                                        const nIdx = ((y + dy) * width + (x + dx)) * 4;
                                        const lum = (originalData[nIdx] + originalData[nIdx + 1] + originalData[nIdx + 2]) / 3;
                                        if (lum < minLuminance) minLuminance = lum;
                                        if (minLuminance === 0) break;
                                    }
                                    if (minLuminance === 0) break;
                                }
                                eroded[idx] = eroded[idx + 1] = eroded[idx + 2] = minLuminance;
                            }
                        }
                        tempCtx?.putImageData(maskData, 0, 0);
                    }

                    if (applyMaskSoftening > 0 && tempCtx) {
                        const blurCanvas = document.createElement('canvas');
                        blurCanvas.width = canvas.width;
                        blurCanvas.height = canvas.height;
                        const blurCtx = blurCanvas.getContext('2d');
                        if (blurCtx) {
                            blurCtx.filter = `blur(${applyMaskSoftening}px)`;
                            blurCtx.drawImage(tempCanvas, 0, 0);
                            maskData = blurCtx.getImageData(0, 0, canvas.width, canvas.height);
                        }
                    }

                    ctx?.drawImage(img, 0, 0);
                    const imgData = ctx?.getImageData(0, 0, canvas.width, canvas.height);
                    const finalMaskData = maskData || tempCtx?.getImageData(0, 0, canvas.width, canvas.height);

                    if (imgData && finalMaskData) {
                        const data = imgData.data;
                        const mask = finalMaskData.data;
                        for (let i = 0; i < data.length; i += 4) {
                            const maskLum = (mask[i] + mask[i + 1] + mask[i + 2]) / 3;
                            data[i + 3] = applyInvertBg ? (255 - maskLum) : maskLum;

                            if (applySpillSuppression > 0 && data[i + 3] > 0) {
                                const r = data[i]; const g = data[i + 1]; const b = data[i + 2];
                                const avgRB = (r + b) / 2;
                                if (g > avgRB) {
                                    const factor = applySpillSuppression / 100;
                                    data[i + 1] = g * (1 - factor) + avgRB * factor;
                                }
                            }
                        }
                        ctx?.putImageData(imgData, 0, 0);
                        setProcessedApplyUrl(canvas.toDataURL('image/png'));
                        return canvas.toDataURL('image/png');
                    }
                }
            }

            ctx?.drawImage(img, 0, 0);
            const imageData = ctx?.getImageData(0, 0, canvas.width, canvas.height);
            if (imageData) {
                const data = imageData.data;
                const key = { r: data[0], g: data[1], b: data[2] };
                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i]; const g = data[i + 1]; const b = data[i + 2];
                    const isMatch = Math.abs(r - key.r) < applyTolerance && Math.abs(g - key.g) < applyTolerance && Math.abs(b - key.b) < applyTolerance;

                    if (applyInvertBg) { if (!isMatch) data[i + 3] = 0; }
                    else { if (isMatch) data[i + 3] = 0; }

                    if (applySpillSuppression > 0 && data[i + 3] > 0) {
                        const rP = data[i]; const gP = data[i + 1]; const bP = data[i + 2];
                        const avgRB = (rP + bP) / 2;
                        if (gP > avgRB) {
                            const factor = applySpillSuppression / 100;
                            data[i + 1] = gP * (1 - factor) + avgRB * factor;
                        }
                    }
                }
                ctx?.putImageData(imageData, 0, 0);
                const res = canvas.toDataURL('image/png');
                setProcessedApplyUrl(res);
                return res;
            }
        } else {
            setProcessedApplyUrl(null);
        }
        return null;
    };

    useEffect(() => {
        runApplyIsolation();
    }, [removeApplyBg, applyTolerance, matteErosion, appliedImage, applyMask, applyAiMaskActive, applySpillSuppression, applyMaskSoftening, applyInvertBg]);

    const scanProps = async () => {
        // 1. NATIVE MODE
        if (isNativeParams() && state.saveDirectoryPath) {
            try {
                const propsPath = await nativeJoinPath(state.saveDirectoryPath, 'props');
                const files = await nativeListFiles(propsPath);
                const items: PropItem[] = [];

                for (const filename of files) {
                    if (/\.(png|jpg|jpeg|webp)$/i.test(filename)) {
                        const fullPath = await nativeJoinPath(propsPath, filename);
                        const dataUrl = await nativeReadFile(fullPath);
                        if (dataUrl) {
                            items.push({
                                id: filename,
                                url: dataUrl,
                                name: filename.replace('.png', '').split('-').slice(1).join(' '),
                                prompt: "Saved prop asset",
                                timestamp: Date.now() // Native list doesn't give timestamp easily yet, using Now serves sort-of-ok or we can stat
                            });
                        }
                    }
                }
                dispatch({ type: 'SET_PROP_ITEMS', payload: items.sort((a, b) => b.timestamp - a.timestamp) });
            } catch (e) {
                // Folder might not exist yet, which is fine
            }
            return;
        }

        // 2. WEB MODE
        if (!state.saveDirectoryHandle) return;
        try {
            // @ts-ignore
            if ((await state.saveDirectoryHandle.queryPermission({ mode: 'read' })) !== 'granted') return;

            const propsHandle = await state.saveDirectoryHandle.getDirectoryHandle('props', { create: true });
            const items: PropItem[] = [];
            // @ts-ignore
            for await (const entry of (propsHandle as any).values()) {
                if (entry.kind === 'file' && /\.(png|jpg|jpeg|webp)$/i.test(entry.name)) {
                    const file = await entry.getFile();
                    const reader = new FileReader();
                    const dataUrl = await new Promise<string>((resolve) => {
                        reader.onload = () => resolve(reader.result as string);
                        reader.readAsDataURL(file);
                    });
                    items.push({
                        id: entry.name,
                        url: dataUrl,
                        name: entry.name.replace('.png', '').split('-').slice(1).join(' '),
                        prompt: "Saved prop asset",
                        timestamp: file.lastModified
                    });
                }
            }
            dispatch({ type: 'SET_PROP_ITEMS', payload: items.sort((a, b) => b.timestamp - a.timestamp) });
        } catch (e: any) {
            dispatch({ type: 'ADD_LOG', payload: { message: `Props scan failed: ${e.message}`, type: 'error' } });
        }
    };



    const [confirmDelete, setConfirmDelete] = useState<PropItem | null>(null);

    const executeDelete = async () => {
        if (!confirmDelete) return;
        const item = confirmDelete;

        try {
            let deleted = false;
            if (state.saveDirectoryPath && window.electronAPI?.deleteFile && window.electronAPI?.joinPath) {
                const filePath = await window.electronAPI.joinPath(state.saveDirectoryPath, 'props', item.id);
                deleted = await window.electronAPI.deleteFile(filePath);
            }

            if (!deleted && state.saveDirectoryHandle) {
                const propsHandle = await state.saveDirectoryHandle.getDirectoryHandle('props', { create: false });
                await propsHandle.removeEntry(item.id);
                deleted = true;
            }

            if (!deleted) throw new Error("File deletion failed or permission denied on disk.");

            // Update State
            const newItems = state.propItems.filter(p => p.id !== item.id);
            dispatch({ type: 'SET_PROP_ITEMS', payload: newItems });
            if (selectedProp?.id === item.id) setSelectedProp(null);
            dispatch({ type: 'ADD_LOG', payload: { message: `Deleted prop: ${item.name}`, type: 'success' } });

        } catch (e: any) {
            dispatch({ type: 'ADD_LOG', payload: { message: `Delete failed: ${e.message}`, type: 'error' } });
        } finally {
            setConfirmDelete(null);
        }
    };

    const handleUploadProp = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const file = e.target.files[0];

        try {
            // DUPLICATE CHECK
            if (state.propItems.some(p => p.id.includes(file.name) || p.name === file.name.split('.')[0])) {
                alert("Item already exists in library.");
                return;
            }

            const safeName = `Custom-Prop-${Date.now()}-${file.name.replace(/[^a-z0-9.]/gi, '_')}`;

            // 1. NATIVE MODE
            if (isNativeParams() && state.saveDirectoryPath) {
                const propsPath = await nativeJoinPath(state.saveDirectoryPath, 'props');
                // Ensure props folder exists (implied or we might fail writing if parent doesn't exist, Electron typically handles? No, usually need fs.mkdir. 
                // Assuming main process ensures 'props' exists or writeFile does recursive? 
                // Safest to just try write with the path.
                const fullPath = await nativeJoinPath(propsPath, safeName);
                const success = await nativeWriteFile(fullPath, file);

                if (!success) {
                    throw new Error("Native write failed");
                }
            }
            // 2. WEB MODE
            else if (state.saveDirectoryHandle) {
                const propsHandle = await state.saveDirectoryHandle.getDirectoryHandle('props', { create: true });
                const fileHandle = await propsHandle.getFileHandle(safeName, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(file);
                await writable.close();
            } else {
                return; // No save method
            }

            // Read for immediate display
            const reader = new FileReader();
            reader.onload = () => {
                const dataUrl = reader.result as string;
                const newItem: PropItem = {
                    id: safeName,
                    url: dataUrl,
                    name: file.name.split('.')[0].substring(0, 20),
                    prompt: "User Upload",
                    timestamp: Date.now()
                };
                dispatch({ type: 'ADD_PROP_ITEM', payload: newItem });
                dispatch({ type: 'ADD_LOG', payload: { message: `Uploaded: ${file.name}`, type: 'success' } });
            };
            reader.readAsDataURL(file);

        } catch (err: any) {
            dispatch({ type: 'ADD_LOG', payload: { message: `Upload failed: ${err.message}`, type: 'error' } });
        } finally {
            // Reset input
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    useEffect(() => {
        scanProps();
    }, [state.saveDirectoryHandle, state.saveDirectoryPath]); // Add path dep
    // --- Reference Slot quick-bind (Shift+Click power-user shortcut) ---
    const bindToFirstEmptyRefSlot = (url: string, name: string) => {
        const slots: any[] = (state as any).referenceSlots || [];
        if (!slots.length) {
            dispatch({ type: 'ADD_LOG', payload: { message: 'No reference slots available to bind.', type: 'error' } });
            return;
        }
        const slot = slots.find((s) => !s.url) ?? slots[0];
        const index = typeof slot.index === 'number' ? slot.index : 0;

        dispatch({
            type: 'UPDATE_REF_SLOT',
            payload: {
                index,
                updates: {
                    url,
                    name,
                    active: true,
                    status: 'ready',
                    analysis: '',
                },
            },
        });

        dispatch({
            type: 'ADD_LOG',
            payload: { message: `Bound to Reference Slot ${index + 1}: ${name}`, type: 'success' },
        });
    };

    const getFinalAppliedUrl = (): string | null => {
        const freshUrl = runApplyIsolation();
        return freshUrl || processedApplyUrl || appliedImage || null;
    };

    const saveToProps = async (imageUrl: string, prompt: string) => {
        if (!state.saveDirectoryHandle && !state.saveDirectoryPath) return; // Need at least one
        try {
            const filename = `PROP-${Date.now()}.png`;

            // 1. NATIVE MODE
            if (isNativeParams() && state.saveDirectoryPath) {
                const propsPath = await nativeJoinPath(state.saveDirectoryPath, 'props');
                const fullPath = await nativeJoinPath(propsPath, filename);

                // Fetch blob to write
                const res = await fetch(imageUrl);
                const blob = await res.blob();

                await nativeWriteFile(fullPath, blob);
            }
            // 2. WEB MODE
            else if (state.saveDirectoryHandle) {
                const propsHandle = await state.saveDirectoryHandle.getDirectoryHandle('props', { create: true });
                const fileHandle = await propsHandle.getFileHandle(filename, { create: true });
                const writable = await fileHandle.createWritable();
                const res = await fetch(imageUrl);
                const blob = await res.blob();
                await writable.write(blob);
                await writable.close();
            }

            const newItem: PropItem = {
                id: filename,
                url: imageUrl,
                name: prompt.substring(0, 20),
                prompt: prompt,
                timestamp: Date.now()
            };
            dispatch({ type: 'ADD_PROP_ITEM', payload: newItem });
            dispatch({ type: 'ADD_LOG', payload: { message: `Prop saved to library: ${filename}`, type: 'success' } });
        } catch (e: any) {
            dispatch({ type: 'ADD_LOG', payload: { message: `Failed to save prop: ${e.message}`, type: 'error' } });
        }
    };

    const handleDesignerGenerate = async () => {
        if (!designerPrompt || !state.apiKey) return;
        dispatch({ type: 'SET_PROCESSING', payload: true });

        let currentPercent = 5;
        dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: { percent: currentPercent, text: "Designing Prop" } });
        const etaMs = state.imageResolution === '4K' ? 35000 : (state.imageResolution === '2K' ? 25000 : 15000);
        const increment = (1000 / etaMs) * 100;
        const progressInterval = window.setInterval(() => {
            currentPercent += increment;
            if (currentPercent > 95) currentPercent = 95;

            let text = "Designing Prop";
            if (currentPercent > 30) text = "Refining Object Geometry...";
            if (currentPercent > 60) text = "Applying Materials & Textures...";
            if (currentPercent > 80) text = "Finalizing Render...";
            if (currentPercent >= 95) text = "Finalizing Render... (Still working, please wait)";

            dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: { percent: currentPercent, text } });
        }, 1000);

        try {
            const res = await GeminiService.generateImage(
                `Create a single image.

PROP AUTHORITY
- Create one standalone prop based exactly on this description: ${designerPrompt}.
- Preserve the intended shape, silhouette, proportions, materials, and visible construction.
- Do not add extra objects, extra parts, extra straps, text, labels, hands, people, or scenery.

RENDER RULES
- Professional standalone object photography.
- High detail texture.
- Realistic studio lighting.
- Solid black studio background (#000000) only.
- Single prop only, centered, fully visible.

NEGATIVE CONSTRAINTS:
extra objects, duplicate prop, altered proportions, floating parts, text, label, watermark, people, hands, scenery, pedestal, table, stand.`,
                state.apiKey,
                state.model,
                [],
                { aspectRatio: '1:1', imageSize: state.imageResolution, thinkingLevel: state.enableImageThinking, googleGrounding: false, strictMode: true }
            );
            setDesignerImage(res);
            dispatch({ type: 'ADD_LOG', payload: { message: "Prop generated on black studio background.", type: 'success' } });
        } catch (e: any) {
            dispatch({ type: 'ADD_LOG', payload: { message: e.message, type: 'error' } });
        } finally {
            clearInterval(progressInterval);
            dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: null });
            dispatch({ type: 'SET_PROCESSING', payload: false });
        }
    };

    const regenerateMask = async () => {
        if (!appliedImage || !state.apiKey) return;
        dispatch({ type: 'SET_PROCESSING', payload: true });
        dispatch({ type: 'ADD_LOG', payload: { message: "Regenerating AI Mask...", type: 'info' } });

        let currentPercent = 5;
        dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: { percent: currentPercent, text: "Generating Alpha Mask" } });
        const etaMs = 15000;
        const increment = (1000 / etaMs) * 100;
        const progressInterval = window.setInterval(() => {
            currentPercent += increment;
            if (currentPercent > 95) currentPercent = 95;

            let text = "Generating Alpha Mask";
            if (currentPercent > 40) text = "Detecting Subject Edges...";
            if (currentPercent > 70) text = "Refining Matte Segmentation...";
            if (currentPercent >= 95) text = "Processing Silhouette... (Still working, please wait)";

            dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: { percent: currentPercent, text } });
        }, 1000);

        // Clear existing mask first
        setApplyMask(null);
        setApplyAiMaskActive(true);

        try {
            const blob = await safeFetchBlob(appliedImage!);
            const config = await CutoutService.getImglyConfig(
                (_key: string, current: number, total: number) => {
                    if (total) {
                        currentPercent = Math.round((current / total) * 100);
                        if (currentPercent > 95) currentPercent = 95;
                        dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: { percent: currentPercent, text: "Isolating Matte..." } });
                    }
                }
            );
            const maskResBlob = await removeBackground(blob, config);
            const maskResDataUrl = URL.createObjectURL(maskResBlob);
            setApplyMask(maskResDataUrl);
            dispatch({ type: 'ADD_LOG', payload: { message: "AI Mask refreshed via local engine.", type: 'success' } });
        } catch (e: any) {
            console.error(e);
            dispatch({ type: 'ADD_LOG', payload: { message: "Mask isolation failed.", type: 'error' } });
        } finally {
            clearInterval(progressInterval);
            dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: null });
            dispatch({ type: 'SET_PROCESSING', payload: false });
        }
    };

    const handleApply = async () => {
        if (!selectedCharacter || !selectedProp || !state.apiKey) return;
        setRemoveApplyBg(false);
        setApplyMask(null);
        dispatch({ type: 'SET_PROCESSING', payload: true });

        let currentPercent = 5;
        dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: { percent: currentPercent, text: "Integrating Prop" } });
        const etaMs = state.imageResolution === '4K' ? 35000 : (state.imageResolution === '2K' ? 25000 : 15000);
        const increment = (1000 / etaMs) * 100;
        const progressInterval = window.setInterval(() => {
            currentPercent += increment;
            if (currentPercent > 95) currentPercent = 95;

            let text = "Integrating Prop";
            if (currentPercent > 30) text = "Matching Lighting & Perspective...";
            if (currentPercent > 60) text = "Blending Elements...";
            if (currentPercent > 80) text = "Finalizing Output...";
            if (currentPercent >= 95) text = "Finalizing Output... (Still working, please wait)";

            dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: { percent: currentPercent, text } });
        }, 1000);

        try {
            const res = await GeminiService.generateImage(
                `Create a single image.

SUBJECT LOCK
- [IMAGE 1] is the target SUBJECT.
- Preserve the subject exactly: same face, same body, same pose, same camera angle.
- Output must contain exactly one human subject.

PROP AUTHORITY
- [IMAGE 2] is the standalone PROP reference.
- Copy the prop exactly. Preserve exact shape, silhouette, colors, materials, visible construction, and proportions.
- Do not redesign, stylize, recolor, age, or decorate the prop.

PLACEMENT LOCK
- Place the prop only at this requested location: ${applyNote || "Clean professional placement in the correct grasp or on-body position."}
- Pay strict attention to left/right instructions.
- Preserve correct real-world scale relative to the subject.
- Do not add extra props, straps, attachments, duplicates, or supporting objects unless visible in the prop reference.

INTEGRATION
- Match lighting and perspective to the subject.
- The prop must look physically present, not composited.
- Keep the solid black studio background (#000000).

NEGATIVE CONSTRAINTS:
extra props, duplicated prop, wrong hand, wrong side, wrong scale, altered prop colors, altered prop materials, prop redesign, extra straps, extra attachments, extra people, text, watermark.`,
                state.apiKey,
                state.model,
                [
                    { url: selectedCharacter.url, label: "Subject Reference" },
                    { url: selectedProp.url, label: "Prop Reference" }
                ],
                { aspectRatio: '1:1', imageSize: state.imageResolution, thinkingLevel: state.enableImageThinking, googleGrounding: false, strictMode: true }
            );
            setAppliedImage(res);
            dispatch({ type: 'ADD_LOG', payload: { message: "Prop integrated. Creating character edge mask...", type: 'info' } });

            // Inline generation for the first run, using same prompt logic as regenerate
            try {
                const maskRes = await GeminiService.generateImage(
                    "DIGITAL CHARACTER SEGMENTATION MASK: Create a precise black and white silhouette of the character and the prop. \nRULES:\n1. White = Character, Clothing, and Prop.\n2. Black = Background.\n3. CRITICAL: Do NOT mask out the shirt or clothing. The entire subject must be White.",
                    state.apiKey,
                    state.model,
                    [{ url: res, label: "Reference" }],
                    { aspectRatio: '1:1', imageSize: state.imageResolution, thinkingLevel: state.enableImageThinking, googleGrounding: false, strictMode: true }
                );
                setApplyMask(maskRes);
            } catch { }
        } catch (e: any) {
            dispatch({ type: 'ADD_LOG', payload: { message: e.message, type: 'error' } });
        } finally {
            clearInterval(progressInterval);
            dispatch({ type: 'SET_GLOBAL_PROGRESS', payload: null });
            dispatch({ type: 'SET_PROCESSING', payload: false });
        }
    };

    const handleAddToCast = () => {
        const freshUrl = runApplyIsolation();
        const finalUrl = freshUrl || processedApplyUrl || appliedImage;
        if (!finalUrl || !selectedCharacter) return;
        dispatch({
            type: 'ADD_CAST',
            payload: {
                id: `propfit-${Date.now()}`,
                url: finalUrl,
                tag: 'front',
                name: `${selectedCharacter.name} + Prop`,
                profile: {
                    identity: selectedCharacter.profile?.identity || selectedCharacter.name,
                    wardrobe: selectedCharacter.profile?.wardrobe || "",
                    accessories: selectedProp?.prompt || "Selected Accessory",
                    style: selectedCharacter.profile?.style || ""
                }
            }
        });
    };


    const handleSaveToActors = async () => {
        const freshUrl = runApplyIsolation();
        const finalUrl = freshUrl || processedApplyUrl || appliedImage;
        if (!finalUrl || !state.saveDirectoryHandle) return;
        try {
            const actorsDir = await state.saveDirectoryHandle.getDirectoryHandle('Actors', { create: true });
            const safeName = (selectedCharacter?.name || 'PropActor').slice(0, 30).replace(/[^a-z0-9]/gi, '_');
            const filename = `Actor-Prop-${Date.now()}-${safeName}.png`;
            const fileHandle = await actorsDir.getFileHandle(filename, { create: true });
            const writable = await fileHandle.createWritable();
            const res = await fetch(finalUrl);
            const blob = await res.blob();
            await writable.write(blob);
            await writable.close();
            dispatch({
                type: 'ADD_ACTOR_LIBRARY',
                payload: {
                    id: `actor-prop-${Date.now()}`,
                    url: finalUrl,
                    tag: 'front',
                    name: `${selectedCharacter?.name} (Prop)`,
                    profile: {
                        identity: selectedCharacter?.profile?.identity || "Unknown",
                        wardrobe: selectedCharacter?.profile?.wardrobe || "",
                        accessories: selectedProp?.name || "Prop",
                        style: "Prop Application"
                    }
                }
            });
            dispatch({ type: 'ADD_LOG', payload: { message: `Saved to Actors Library: ${filename}`, type: 'success' } });
        } catch (e: any) {
            dispatch({ type: 'ADD_LOG', payload: { message: `Failed to save actor: ${e.message}`, type: 'error' } });
        }
    };

    return (
        <div className="h-full bg-[#0f0f11] flex overflow-hidden">
            <div className="w-96 border-r border-gray-800 bg-[#18181b] flex flex-col ">
                <div className="p-4 border-b border-gray-800 flex justify-between items-center">
                    <h2 className="text-sm font-black text-white tracking-widest uppercase">Prop Library</h2>
                    <div className="flex gap-1.5">
                        <input
                            type="file"
                            ref={fileInputRef}
                            className="hidden"
                            accept="image/png,image/jpeg,image/webp"
                            onChange={handleUploadProp}
                        />
                        <button onClick={() => fileInputRef.current?.click()} className="p-1.5 hover:bg-gray-700 rounded transition-colors text-gray-400" title="Upload Prop">
                            <Upload className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={scanProps} className="p-1.5 hover:bg-gray-700 rounded transition-colors text-gray-400">
                            <RefreshCcw className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                <div className="flex-grow overflow-y-auto p-4 grid grid-cols-2 gap-2 content-start">
                    {state.propItems.map(item => (
                        <div
                            key={item.id}
                            onClick={(e) => {
                                if ((e as any).shiftKey) {
                                    bindToFirstEmptyRefSlot(item.url, item.name || 'Prop');
                                    return;
                                }
                                setSelectedProp(item);
                            }}
                            className={`aspect-square rounded-lg border overflow-hidden transition-all group relative cursor-pointer ${selectedProp?.id === item.id ? 'border-blue-500 border-2' : 'border-gray-800 hover:border-gray-600'}`}
                        >
                            <img src={item.url} className="w-full h-full object-contain" />

                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                <button
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        dispatch({ type: 'SET_INSPECT_IMAGE', payload: item.url });
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            dispatch({ type: 'SET_INSPECT_IMAGE', payload: item.url });
                                        }
                                    }}
                                    className="bg-blue-500/80 hover:bg-blue-500 text-white p-1.5 rounded-full "
                                    title="Inspect Large"
                                >
                                    <Maximize className="w-3.5 h-3.5" />
                                </button>

                                <button
                                    onClick={(e) => { e.stopPropagation(); setConfirmDelete(item); }}
                                    className="bg-red-500/80 hover:bg-red-500 text-white p-1.5 rounded-full transition-transform hover:scale-110"
                                    title="Delete Prop"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="flex-grow flex flex-col bg-[#09090b]">
                <div className="flex bg-[#18181b] px-4 pt-4 gap-4 border-b border-gray-800">
                    <button onClick={() => setActiveTab('designer')} className={`pb-3 px-4 text-xs font-bold uppercase tracking-widest border-b-2 transition-all ${activeTab === 'designer' ? 'border-blue-500 text-blue-500' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>Prop Designer</button>
                    <button onClick={() => setActiveTab('library')} className={`pb-3 px-4 text-xs font-bold uppercase tracking-widest border-b-2 transition-all ${activeTab === 'library' ? 'border-blue-500 text-blue-500' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>Application Room</button>
                </div>

                <div className="flex-grow min-h-0 overflow-hidden p-4 flex flex-col">
                    {activeTab === 'designer' ? (
                        <div className="w-full h-full flex gap-6 min-h-0">
                            {/* LEFT: DESIGN CONTROLS */}
                            <div className="w-[380px] shrink-0 flex flex-col h-full min-h-0">
                                <div className="bg-[#18181b] p-6 rounded-2xl border border-gray-800 flex flex-col min-h-0">
                                    <h3 className="text-xs font-black text-gray-400 uppercase mb-4 tracking-widest">Designer Workshop</h3>
                                    <textarea value={designerPrompt} onChange={(e) => setDesignerPrompt(e.target.value)} className="w-full bg-[#09090b] border border-[#27272a] p-4 rounded-xl text-sm text-gray-200 flex-grow resize-none mb-4 focus:border-blue-500 focus:outline-none" placeholder="Describe the object..." />
                                    <button onClick={handleDesignerGenerate} disabled={state.isProcessing || !designerPrompt} className="w-full shrink-0 bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl font-black text-xs uppercase transition-all active:scale-95">Generate Prop</button>
                                </div>
                            </div>

                            {/* RIGHT: LARGE VIEWPORT */}
                            <div className="flex-grow min-w-0 h-full bg-black rounded-2xl border border-gray-800 flex items-center justify-center overflow-hidden relative group bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')]">
                                {designerImage ? (
                                    <div className="relative w-full h-full">
                                        <img src={designerImage} className="w-full h-full object-contain" />
                                        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-3 z-50">
                                            <button onClick={() => saveToProps(designerImage!, designerPrompt)} className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-full font-black text-[10px] uppercase tracking-widest border border-blue-400 transition-all active:scale-95 flex items-center gap-3"><Save className="w-4 h-4" /> Save to Library</button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center opacity-20">
                                        <Package className="w-16 h-16 mb-4" />
                                        <span className="text-xs font-black uppercase tracking-widest text-[#a1a1aa]">Awaiting Design</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="w-full h-full flex gap-4 min-h-0">
                            {/* LEFT COLUMN: Inputs (Split into 2 cards) */}
                            <div className="w-80 shrink-0 flex flex-col space-y-4 h-full overflow-hidden">
                                {/* Card A: Clean Selections */}
                                <div className="bg-[#18181b] p-6 rounded-2xl border border-gray-800 shrink-0">
                                    <h3 className="text-xs font-black text-gray-400 uppercase mb-4 tracking-widest">1. Subject</h3>
                                    <div className="grid grid-cols-4 gap-2 mb-6 h-32 overflow-y-auto custom-scrollbar">
                                        {state.cast.map(c => (
                                            <button key={c.id} onClick={() => setSelectedCharacter(c)} className={`aspect-square rounded-lg border-2 overflow-hidden transition-all ${selectedCharacter?.id === c.id ? 'border-blue-500 -[0_0_0_2px_rgba(59,130,246,0.3)] scale-95' : 'border-gray-800 hover:border-gray-600'}`}><img src={c.url} className="w-full h-full object-cover" /></button>
                                        ))}
                                    </div>
                                    <h3 className="text-xs font-black text-gray-400 uppercase mb-4 tracking-widest border-t border-gray-800 pt-6">2. Active Prop</h3>
                                    <div className="h-48 bg-[#09090b] rounded-xl border border-gray-800 flex items-center justify-center overflow-hidden">
                                        {selectedProp ? <img src={selectedProp.url} className="w-full h-full object-contain p-2" /> : <Package className="w-10 h-10 opacity-10" />}
                                    </div>
                                </div>

                                {/* Card B: Action Area */}
                                <div className="bg-[#18181b] p-6 rounded-2xl border border-gray-800 flex-grow flex flex-col min-h-0">
                                    <h3 className="text-xs font-black text-gray-400 uppercase mb-4 tracking-widest">3. Placement Notes</h3>
                                    <textarea className="w-full bg-[#09090b] border border-[#27272a] p-3 rounded-lg text-xs text-gray-300 flex-grow mb-4 focus:border-blue-500 focus:outline-none resize-none min-h-[80px]" placeholder="Where should the prop be?..." value={applyNote} onChange={(e) => setApplyNote(e.target.value)} />
                                    <button onClick={handleApply} disabled={state.isProcessing || !selectedCharacter || !selectedProp} className="w-full bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95 disabled:opacity-50 transition-all">Apply to Character</button>
                                </div>
                            </div>

                            {/* RESULT COLUMN */}
                            <div className="flex-grow flex flex-row bg-[#09090b] rounded-2xl overflow-hidden border border-gray-800 relative min-w-0">
                                <div className="flex-grow h-full bg-black flex flex-col border-r border-gray-800 relative overflow-hidden ">
                                    {/* Stage Header */}
                                    <div className="h-14 border-b border-gray-800 bg-white/5 flex items-center justify-between px-6 shrink-0 backdrop-blur-md">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-2 h-2 rounded-full ${appliedImage ? 'bg-emerald-500 -[0_0_8px_rgba(16,185,129,0.6)]' : 'bg-gray-600'}`} />
                                            <span className="text-xs font-black uppercase tracking-widest text-gray-400">Preview Stage</span>
                                        </div>

                                        {/* Header Actions (Moved from floating toolbar) */}
                                        {appliedImage && (
                                            <div className="flex items-center gap-2 animate-in fade-in duration-300">
                                                <button onClick={(e) => {
                                                    if ((e as any).shiftKey) {
                                                        const finalUrl = getFinalAppliedUrl();
                                                        if (finalUrl) bindToFirstEmptyRefSlot(finalUrl, `${selectedCharacter?.name || 'Subject'} + Prop Result`);
                                                        return;
                                                    }
                                                    handleAddToCast();
                                                }} className="h-8 px-3 bg-emerald-500/20 text-emerald-500 rounded-lg flex items-center gap-2 border border-emerald-500/30 hover:bg-emerald-500/30 transition-all text-[10px] uppercase font-bold tracking-wider hover:scale-105 active:scale-95"><UserPlus className="w-3.5 h-3.5" /> Add to Cast</button>

                                                <div className="h-4 w-px bg-gray-700 mx-2" />

                                                <button onClick={handleSaveToActors} className="p-1.5 hover:bg-indigo-500/20 text-gray-400 hover:text-indigo-400 rounded-lg transition-colors" title="Save to Actors"><Save className="w-4 h-4" /></button>
                                                <button onClick={() => { const l = document.createElement('a'); l.href = processedApplyUrl || appliedImage!; l.download = "applied-prop.png"; l.click(); }} className="p-1.5 hover:bg-white/10 text-gray-400 hover:text-white rounded-lg transition-colors" title="Download"><Download className="w-4 h-4" /></button>
                                                <button onClick={() => setAppliedImage(null)} className="p-1.5 hover:bg-red-500/20 text-gray-400 hover:text-red-400 rounded-lg transition-colors" title="Clear Stage"><X className="w-4 h-4" /></button>
                                            </div>
                                        )}
                                    </div>

                                    {/* Stage Content */}
                                    <div className="flex-grow relative w-full flex items-center justify-center p-8 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-gray-900/50 to-black">
                                        {appliedImage ? (
                                            <div className="relative w-full h-full flex items-center justify-center">
                                                <img ref={applyImgRef} src={appliedImage} className={processedApplyUrl ? 'hidden' : 'max-w-full max-h-full object-contain '} />
                                                {processedApplyUrl && <img src={processedApplyUrl} className="max-w-full max-h-full object-contain " />}
                                                <canvas ref={applyCanvasRef} className="hidden" />
                                                {applyMask && <img ref={applyMaskImgRef} src={applyMask} className="hidden" />}
                                            </div>
                                        ) : (
                                            <div className="flex flex-col items-center gap-4 text-gray-800 select-none pointer-events-none">
                                                <Package className="w-24 h-24 opacity-10" />
                                                <span className="text-xs font-black uppercase tracking-widest opacity-20">Select Subject & Prop</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* RIGHT COLUMN: Magic Tools (Preserved) */}
                                <div className="w-96 shrink-0 bg-[#18181b]/50 h-full flex flex-col p-6 space-y-6 overflow-y-auto custom-scrollbar">
                                    {appliedImage ? (
                                        <div className="bg-[#18181b] p-6 rounded-2xl border border-gray-800 space-y-6 animate-in slide-in-from-right-4 duration-300">
                                            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                                <Sparkles className="w-3 h-3 text-blue-500" /> Magic Tools
                                            </h3>

                                            <div className="space-y-4">
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center justify-between cursor-pointer p-3 bg-black/40 rounded-lg border border-white/5 hover:border-white/10 transition-colors">
                                                    <span className="flex items-center gap-2"><Eraser className="w-3.5 h-3.5" /> Remove Background</span>
                                                    <input type="checkbox" checked={removeApplyBg} onChange={(e) => setRemoveApplyBg(e.target.checked)} className="w-4 h-4 accent-blue-500 rounded" />
                                                </label>

                                                {applyMask && (
                                                    <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest flex items-center justify-between cursor-pointer p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
                                                        <span className="flex items-center gap-2"><Sparkles className="w-3 h-3" /> AI Masking</span>
                                                        <input type="checkbox" checked={applyAiMaskActive} onChange={(e) => setApplyAiMaskActive(e.target.checked)} className="w-3.5 h-3.5 accent-blue-500 rounded" />
                                                    </label>
                                                )}
                                            </div>

                                            {removeApplyBg && (
                                                <div className="space-y-4 pt-2 border-t border-gray-800">
                                                    <div className="space-y-2">
                                                        <div className="flex items-center justify-between text-[9px] font-bold text-gray-500 uppercase tracking-wider"><span>Tolerance</span><span>{applyTolerance}%</span></div>
                                                        <input type="range" min="1" max="100" value={applyTolerance} onChange={(e) => setApplyTolerance(parseInt(e.target.value))} className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer" />
                                                    </div>

                                                    {applyMask && applyAiMaskActive && (
                                                        <>
                                                            <div className="space-y-2">
                                                                <div className="flex items-center justify-between text-[9px] font-bold text-blue-400/60 uppercase"><span>Matte Contraction</span><span>{matteErosion}px</span></div>
                                                                <input type="range" min="0" max="10" step="1" value={matteErosion} onChange={(e) => setMatteErosion(parseInt(e.target.value))} className="w-full h-1 bg-blue-900/30 rounded-lg appearance-none cursor-pointer" />
                                                            </div>
                                                            <div className="space-y-2">
                                                                <div className="flex items-center justify-between text-[9px] font-bold text-blue-400/60 uppercase"><span>Mask Softening</span><span>{applyMaskSoftening}px</span></div>
                                                                <input type="range" min="0" max="10" step="0.5" value={applyMaskSoftening} onChange={(e) => setApplyMaskSoftening(parseFloat(e.target.value))} className="w-full h-1 bg-blue-900/30 rounded-lg appearance-none cursor-pointer" />
                                                            </div>
                                                        </>
                                                    )}

                                                    <div className="space-y-2">
                                                        <div className="flex items-center justify-between text-[9px] font-bold text-green-400/60 uppercase"><span>Spill Suppression</span><span>{applySpillSuppression}%</span></div>
                                                        <input type="range" min="0" max="100" value={applySpillSuppression} onChange={(e) => setApplySpillSuppression(parseInt(e.target.value))} className="w-full h-1 bg-green-900/30 rounded-lg appearance-none cursor-pointer" />
                                                    </div>

                                                    {/* Mask Reset Action */}
                                                    <div className="pt-4 border-t border-gray-800">
                                                        <button
                                                            onClick={() => {
                                                                setApplyTolerance(10);
                                                                setMatteErosion(0);
                                                                setApplyMaskSoftening(1.0);
                                                                setApplySpillSuppression(50);
                                                                setApplyAiMaskActive(true);
                                                                regenerateMask();
                                                            }}
                                                            disabled={state.isProcessing}
                                                            className="w-full py-3 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-[10px] font-bold uppercase tracking-widest text-gray-400 rounded-lg transition-all flex items-center justify-center gap-2 group hover:text-white"
                                                        >
                                                            <RefreshCcw className={`w-3 h-3 ${state.isProcessing ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`} />
                                                            {state.isProcessing ? 'Regenerating...' : 'Reset Mask Settings'}
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="h-full border-l border-gray-800 border-dashed rounded-2xl flex items-center justify-center">
                                            <div className="text-center opacity-30">
                                                <Sparkles className="w-12 h-12 mx-auto mb-2" />
                                                <p className="text-[10px] uppercase font-black tracking-widest">Tools awaiting image</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                    )}
                </div>
            </div>


            {/* DELETE CONFIRMATION MODAL */}
            <ConfirmDialog
                isOpen={!!confirmDelete}
                onClose={() => setConfirmDelete(null)}
                onConfirm={() => {
                    if (confirmDelete) executeDelete();
                    setConfirmDelete(null);
                }}
                title="Delete Prop?"
                message={
                    <>
                        Are you sure you want to delete <span className="text-white font-bold">{confirmDelete?.name}</span>? This cannot be undone.
                    </>
                }
                confirmText="Delete Forever"
                cancelText="Cancel"
                variant="danger"
            />
        </div>

    );
};

export default PropAccessoryStudio;



