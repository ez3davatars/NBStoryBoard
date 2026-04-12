import { useState, useEffect, useRef } from 'react';
import { Settings2, RotateCcw, Check, X } from 'lucide-react';
import type { WearableAnchorContract, WearablePlacement } from '../services/WearableAnchorEngine';
import { loadImageElement, makeBlackTransparent, extractNonBlackBounds, canvasToDataUrl } from '../services/WearableOverlayComposer';

type WearableAdjustmentProps = {
    subjectUrl: string;
    propUrl: string;
    anchorContract: WearableAnchorContract;
    initialOffsetX?: number;
    initialOffsetY?: number;
    initialScale?: number;
    onConfirm: (finalPlacement: WearablePlacement, precompositeUrl: string, persistedOffsets: {x: number, y: number, scaleMultiplier: number}) => void;
    onCancel: () => void;
};

export const WearableAdjustmentCanvas = ({ subjectUrl, propUrl, anchorContract, initialOffsetX, initialOffsetY, initialScale, onConfirm, onCancel }: WearableAdjustmentProps) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isReady, setIsReady] = useState(false);
    
    // Loaded assets
    const subjectImgRef = useRef<HTMLImageElement | null>(null);
    const transparentPropCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const propBoundsRef = useRef<{x: number, y: number, width: number, height: number} | null>(null);

    // Adjustment state
    const [offsetY, setOffsetY] = useState(initialOffsetY ?? 0);
    const [offsetX, setOffsetX] = useState(initialOffsetX ?? 0);
    const [scaleMultiplier, setScaleMultiplier] = useState(initialScale ?? 1.0);

    const [isRendering, setIsRendering] = useState(false);

    useEffect(() => {
        let active = true;
        console.log(`[DEBUG_PATH] confirm mode UI mounted`);
        
        async function prep() {
            try {
                const [subj, prop] = await Promise.all([
                    loadImageElement(subjectUrl),
                    loadImageElement(propUrl)
                ]);
                
                if (!active) return;
                
                subjectImgRef.current = subj;
                
                const propCanvas = document.createElement('canvas');
                propCanvas.width = prop.naturalWidth || prop.width;
                propCanvas.height = prop.naturalHeight || prop.height;
                const propCtx = propCanvas.getContext('2d')!;
                propCtx.drawImage(prop, 0, 0, propCanvas.width, propCanvas.height);
                
                makeBlackTransparent(propCtx, propCanvas.width, propCanvas.height);
                const bounds = extractNonBlackBounds(propCtx, propCanvas.width, propCanvas.height);
                
                if (!bounds) throw new Error("Could not detect prop bounds");
                
                transparentPropCanvasRef.current = propCanvas;
                propBoundsRef.current = bounds;
                
                setIsReady(true);
            } catch (err) {
                console.error("Failed to prep interactive assets:", err);
            }
        }
        
        prep();
        return () => { active = false; };
    }, [subjectUrl, propUrl]);

    // Render loop
    useEffect(() => {
        if (!isReady || !canvasRef.current || !subjectImgRef.current || !transparentPropCanvasRef.current || !propBoundsRef.current) return;
        
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d')!;
        
        // 1. Setup dimensions
        const subj = subjectImgRef.current;
        if (canvas.width !== subj.naturalWidth) canvas.width = subj.naturalWidth;
        if (canvas.height !== subj.naturalHeight) canvas.height = subj.naturalHeight;
        
        // 2. Draw Subject
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(subj, 0, 0, canvas.width, canvas.height);
        
        // 3. Compute working placement
        const propBounds = propBoundsRef.current;
        const targetWidthPx = anchorContract.targetWidthPx * scaleMultiplier;
        const scale = targetWidthPx / propBounds.width;
        const targetHeightPx = Math.round(propBounds.height * scale);
        
        // Original logic + offsets
        const finalX = Math.round(anchorContract.anchorCenter.x - targetWidthPx / 2) + offsetX;
        
        let finalY = Math.round(anchorContract.anchorCenter.y - targetHeightPx / 2) + offsetY;
        
        if (anchorContract.verticalMode === 'headwear_base_lock') {
            const baseBandRatioFromTop = 0.72;
            finalY = Math.round(anchorContract.anchorCenter.y - targetHeightPx * baseBandRatioFromTop) + offsetY;
        } else if (anchorContract.verticalMode === 'below_anchor') {
            finalY = Math.round(anchorContract.anchorCenter.y) + offsetY;
        }
        
        const minMargin = 4;
        const clampedX = Math.max(minMargin, Math.min(finalX, canvas.width - targetWidthPx - minMargin));
        const clampedY = Math.max(minMargin, Math.min(finalY, canvas.height - targetHeightPx - minMargin));
        
        // 4. Draw Prop
        ctx.save();
        const centerX = clampedX + targetWidthPx / 2;
        const centerY = clampedY + targetHeightPx / 2;
        ctx.translate(centerX, centerY);
        ctx.rotate(anchorContract.rotationDeg * Math.PI / 180);
        
        ctx.drawImage(
            transparentPropCanvasRef.current,
            propBounds.x, propBounds.y, propBounds.width, propBounds.height,
            -targetWidthPx / 2,
            -targetHeightPx / 2,
            targetWidthPx,
            targetHeightPx
        );
        ctx.restore();
        
        // 5. Draw Guide Overlays
        // Centerline
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.6)'; // emerald-500
        ctx.setLineDash([10, 10]);
        ctx.lineWidth = 3;
        ctx.moveTo(anchorContract.anchorCenter.x, 0);
        ctx.lineTo(anchorContract.anchorCenter.x, canvas.height);
        ctx.stroke();

        // Baseline (Anchor Y)
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.8)'; // blue-500
        ctx.moveTo(anchorContract.anchorCenter.x - 120, anchorContract.anchorCenter.y);
        ctx.lineTo(anchorContract.anchorCenter.x + 120, anchorContract.anchorCenter.y);
        ctx.stroke();
        
        // Bounding Box
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)'; // red-500
        ctx.setLineDash([]);
        ctx.rect(clampedX, clampedY, targetWidthPx, targetHeightPx);
        ctx.stroke();

    }, [isReady, offsetX, offsetY, scaleMultiplier, anchorContract]);

    const handleConfirm = () => {
        setIsRendering(true);
        // We need to re-render ONCE WITHOUT the guide overlays and then dump toDataURL
        
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;
        const subj = subjectImgRef.current!;
        canvas.width = subj.naturalWidth;
        canvas.height = subj.naturalHeight;
        
        ctx.drawImage(subj, 0, 0, canvas.width, canvas.height);
        
        const propBounds = propBoundsRef.current!;
        const targetWidthPx = anchorContract.targetWidthPx * scaleMultiplier;
        const scale = targetWidthPx / propBounds.width;
        const targetHeightPx = Math.round(propBounds.height * scale);
        
        const finalX = Math.round(anchorContract.anchorCenter.x - targetWidthPx / 2) + offsetX;
        let finalY = Math.round(anchorContract.anchorCenter.y - targetHeightPx / 2) + offsetY;
        
        if (anchorContract.verticalMode === 'headwear_base_lock') {
            const baseBandRatioFromTop = 0.72;
            finalY = Math.round(anchorContract.anchorCenter.y - targetHeightPx * baseBandRatioFromTop) + offsetY;
        } else if (anchorContract.verticalMode === 'below_anchor') {
            finalY = Math.round(anchorContract.anchorCenter.y) + offsetY;
        }
        
        const minMargin = 4;
        const clampedX = Math.max(minMargin, Math.min(finalX, canvas.width - targetWidthPx - minMargin));
        const clampedY = Math.max(minMargin, Math.min(finalY, canvas.height - targetHeightPx - minMargin));
        
        ctx.save();
        const centerX = clampedX + targetWidthPx / 2;
        const centerY = clampedY + targetHeightPx / 2;
        ctx.translate(centerX, centerY);
        ctx.rotate(anchorContract.rotationDeg * Math.PI / 180);
        
        ctx.drawImage(
            transparentPropCanvasRef.current!,
            propBounds.x, propBounds.y, propBounds.width, propBounds.height,
            -targetWidthPx / 2,
            -targetHeightPx / 2,
            targetWidthPx,
            targetHeightPx
        );
        ctx.restore();
        
        const precompositeUrl = canvasToDataUrl(canvas);
        
        const finalPlacement: WearablePlacement = {
            ...anchorContract,
            targetWidthPx,
            targetHeightPx,
            finalRect: {
                x: clampedX,
                y: clampedY,
                width: targetWidthPx,
                height: targetHeightPx
            }
        };
        
        setIsRendering(false);
        onConfirm(finalPlacement, precompositeUrl, { x: offsetX, y: offsetY, scaleMultiplier });
    };

    return (
        <div className="absolute inset-0 flex flex-col bg-black overflow-hidden animate-in fade-in z-20 rounded-2xl">
            {/* Header */}
            <div className="h-14 border-b border-gray-800 bg-[#09090b] flex flex-col justify-center px-6 shrink-0 shadow-lg relative z-30">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Settings2 className="w-5 h-5 text-emerald-400" />
                        <span className="text-sm font-black uppercase tracking-widest text-emerald-400">Lock Wearable Fit</span>
                    </div>
                </div>
            </div>

            {/* Content Split */}
            <div className="flex-grow flex min-h-0 relative z-10">
                {/* Visual Canvas (takes majority) */}
                <div className="flex-grow flex items-center justify-center p-8 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-gray-900/50 to-black overflow-hidden relative">
                    
                    {/* CONFIRM MODE BADGE */}
                    <div className="absolute top-4 left-4 bg-purple-600/90 text-white px-4 py-2 rounded-lg font-black text-xs tracking-widest uppercase z-50 shadow-[0_0_15px_rgba(147,51,234,0.5)] border border-purple-400/50 pointer-events-none">
                        🔴 HEADWEAR CONFIRM MODE ACTIVE
                    </div>

                    {!isReady ? (
                        <div className="flex flex-col items-center gap-4">
                            <div className="w-8 h-8 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin"/>
                            <span className="text-xs font-black text-gray-500 uppercase tracking-widest animate-pulse">Prepping Overlay...</span>
                        </div>
                    ) : (
                        <canvas 
                            ref={canvasRef}
                            className="max-w-full max-h-full object-contain pointer-events-none drop-shadow-2xl"
                                style={{ 
                                    imageRendering: 'high-quality' as any,
                                    filter: 'drop-shadow(0 0 20px rgba(0,0,0,0.8))'
                                }}
                        />
                    )}
                </div>

                {/* Right Panel: Controls */}
                <div className="w-80 shrink-0 bg-[#09090b] border-l border-gray-800 flex flex-col p-6 space-y-8 shadow-[inset_1px_0_10px_rgba(0,0,0,0.5)] z-20">
                    <div>
                        <h3 className="text-xs font-black text-gray-400 uppercase mb-6 tracking-widest">Adjust Anchors</h3>
                        
                        <div className="space-y-8">
                            {/* Vertical Nudge */}
                            <div className="bg-[#18181b] p-4 rounded-xl border border-gray-800">
                                <div className="flex justify-between items-center mb-3">
                                    <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Vertical Nudge</label>
                                    <span className="text-[10px] text-blue-400 font-mono font-black">{offsetY > 0 ? '+' : ''}{offsetY}px</span>
                                </div>
                                <input 
                                    type="range" min="-300" max="300" step="2"
                                    value={offsetY} onChange={(e) => setOffsetY(Number(e.target.value))}
                                    className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer hover:bg-gray-700 transition-colors"
                                    style={{ accentColor: '#3b82f6' }}
                                />
                            </div>

                            {/* Horizontal Nudge */}
                            <div className="bg-[#18181b] p-4 rounded-xl border border-gray-800">
                                <div className="flex justify-between items-center mb-3">
                                    <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Horizontal Nudge</label>
                                    <span className="text-[10px] text-emerald-400 font-mono font-black">{offsetX > 0 ? '+' : ''}{offsetX}px</span>
                                </div>
                                <input 
                                    type="range" min="-200" max="200" step="2"
                                    value={offsetX} onChange={(e) => setOffsetX(Number(e.target.value))}
                                    className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer hover:bg-gray-700 transition-colors"
                                    style={{ accentColor: '#10b981' }}
                                />
                            </div>

                            {/* Scale */}
                            <div className="bg-[#18181b] p-4 rounded-xl border border-gray-800">
                                <div className="flex justify-between items-center mb-3">
                                    <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Scale Adjustment</label>
                                    <span className="text-[10px] text-purple-400 font-mono font-black">{Math.round(scaleMultiplier * 100)}%</span>
                                </div>
                                <input 
                                    type="range" min="0.5" max="2.0" step="0.02"
                                    value={scaleMultiplier} onChange={(e) => setScaleMultiplier(Number(e.target.value))}
                                    className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer hover:bg-gray-700 transition-colors"
                                    style={{ accentColor: '#a855f7' }}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="mt-auto space-y-3 pt-6 border-t border-gray-800">
                        <button 
                            onClick={() => { setOffsetX(0); setOffsetY(0); setScaleMultiplier(1); }}
                            className="w-full py-4 bg-[#18181b] hover:bg-gray-700 border border-gray-800 text-gray-300 rounded-xl text-[10px] uppercase font-black tracking-widest flex items-center justify-center gap-2 transition-colors active:scale-95"
                        >
                            <RotateCcw className="w-3.5 h-3.5" /> Auto-Fit Reset
                        </button>
                        
                        <div className="flex gap-2">
                            <button 
                                onClick={onCancel}
                                className="w-16 py-4 bg-red-950/40 hover:bg-red-900/60 text-red-500 rounded-xl flex items-center justify-center transition-colors border border-red-900/50"
                                title="Abort Frame"
                            >
                                <X className="w-5 h-5" />
                            </button>
                            <button 
                                onClick={handleConfirm}
                                disabled={isRendering || !isReady}
                                className="flex-grow py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[11px] uppercase font-black tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 shadow-[0_0_20px_rgba(16,185,129,0.3)] disabled:opacity-50 border border-emerald-400/30"
                            >
                                {isRendering ? 'Locking...' : <><Check className="w-4 h-4" /> Confirm Fit</>}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
