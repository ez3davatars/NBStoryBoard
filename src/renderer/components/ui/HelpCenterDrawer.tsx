import React, { useState } from 'react';
import { useAppContext } from '../../context/AppContext';
import { GuideViewerModal } from './GuideViewerModal';
import {
    X,
    BookOpen,
    Target,
    MapPin,
    Wrench,
    Play,
    UserCircle,
    UserPlus,
    Shirt,
    PackageOpen,
    Clapperboard,
    ImagePlus,
    Lightbulb
} from 'lucide-react';

export const HelpCenterDrawer: React.FC = () => {
    const { state, dispatch } = useAppContext();
    const [guideOpen, setGuideOpen] = useState(false);

    // Contextual Help Mapping
    const getTabHelpContent = () => {
        const activeSection = state.helpContextSection.startsWith('tab-') 
            ? state.helpContextSection.replace('tab-', '') 
            : state.view;

        switch (activeSection) {
            case 'casting':
                return {
                    title: "CAST Help",
                    desc: "Generate new characters from scratch.",
                    actions: [
                        "Use the visual style dropdown to set your universe (Realism vs Anime).",
                        "Describe their age, background, and visual look in the prompt.",
                        "Use Reference Sheets if you need to lock in a character's face from multiple angles.",
                        "Click 'Save to Library' when you find one you want to keep!"
                    ]
                };
            case 'portrait':
                return {
                    title: "PORTRAIT Help",
                    desc: "Build or refine a face with biometric precision.",
                    actions: [
                        "Use 'Synthetic' to build a custom face mathematically.",
                        "Use 'Reference' to upload a real photo or previous AI generation.",
                        "Unlock selective traits (like Hair or Skin) to override portions of an uploaded photo.",
                        "Click 'Clear Result' to durably reset your active workspace to a clean slate without returning ghosts.",
                        "Send to Casting when finished to permanently store them."
                    ]
                };
            case 'nano_cast':
                return {
                    title: "NANO CAST Help",
                    desc: "Import a real person into the Cast Director Studio.",
                    actions: [
                        "For strongest identity preservation, always use front-facing, clear, well-lit reference photos.",
                        "Use the Identity Lock Slider to control how aggressively the AI holds onto their exact bone structure.",
                        "The 'Delete All' button safely clears temporary generation previews without affecting your saved permanent characters."
                    ]
                };
            case 'wardrobe':
                return {
                    title: "WARDROBE Help",
                    desc: "Design costumes and fit them onto actors.",
                    actions: [
                        "Designer vs Try-On: Use SKETCH or COSTUME modes to create clothing first, then use Virtual Try-On to fit it onto your saved actors.",
                        "Use 'Auto-Remove BG' to isolate your actors immediately.",
                        "Your Character Sheet anchors the identity during generation."
                    ]
                };
            case 'props':
                return {
                    title: "PROPS Help",
                    desc: "Create reusable scene assets and objects.",
                    actions: [
                        "Describe a single standalone object and isolate it from the background.",
                        "Application Room: Clear an assigned prop by clicking the 'X' hover button on the active slot.",
                        "Session Reset: Active props clear cleanly upon an app reload to prevent clutter."
                    ]
                };
            case 'staging':
            case 'blocking':
                return {
                    title: "STAGE [PREVIEW] Help",
                    desc: "Arrange your actors and props into a cinematic scene.",
                    actions: [
                        "Remember that STAGE is a preview feature best used for concepting, scene planning, and selective building.",
                        "Drag actors and props from the sidebars onto the canvas.",
                        "Click on a token to manage its Z-Depth, Scale, and Occlusion.",
                        "Describe what the character is doing in 'Actor Intelligence' using the Pose/Action -> Expression format."
                    ]
                };
            case 'shots':
                return {
                    title: "SHOTS Help",
                    desc: (
                        <>
                            <span className="block mb-2">Generate multi-angle cinematic shots from your staged scene.</span>
                            <span className="block mb-2"><strong className="text-yellow-500">Preview Notice:</strong> SHOTS is a powerful preview-stage feature for planning cinematic coverage and exploring multi-angle variations from a staged scene. It already works well for concepting, shot design, and selective production use, but consistency can still vary in more demanding scenes.</span>
                            <span className="block"><strong className="text-yellow-500">Credit Notice:</strong> SHOTS typically consumes more credits than a standard image generation because multiple images are created in one call. Review your pack and settings before running.</span>
                        </>
                    ),
                    actions: [
                        "PREREQUISITE: You must finalize your scene in the STAGE sub-tab and generate at least one composite image to act as your Scene Truth.",
                        "Switch to the SHOTS tab to begin multi-angle generation.",
                        "Select a Pack (e.g., Cinematic) and auto-populate the Directed Shot Plan.",
                        "Click GENERATE to render low-res previews, then select favorites to RENDER 4K."
                    ]
                };
            case 'region_edit':
                return {
                    title: "REGION EDIT Help",
                    desc: "Correct part of an image without rerendering the full scene.",
                    actions: [
                        "Write specific, highly localized masking instructions for best results.",
                        "Toggle Protect Face/Hair to prevent the AI from dissolving critical biometric features.",
                        "Use layers to separate distinct structural and lighting actions."
                    ]
                };
            case 'veo':
                return {
                    title: "STORYBOARD Help",
                    desc: "Generate cinematic video shots [Experimental].",
                    actions: [
                        "Ensure Veo Storyboarding is activated in your options.",
                        "Video rendering can take extensive time and tokens."
                    ]
                };
            default:
                return {
                    title: "General Help",
                    desc: "Navigate through the tabs below to explore features.",
                    actions: []
                };
        }
    };

    const handleGoalRoute = (route: typeof state.view, sectionOverride?: string) => {
        dispatch({ type: 'SET_VIEW', payload: route });
        if (sectionOverride) {
            dispatch({ type: 'SET_HELP_SECTION', payload: sectionOverride });
        } else {
            dispatch({ type: 'TOGGLE_HELP', payload: false });
        }
    };

    if (!state.isHelpOpen) return null;

    const navItems = [
        { id: 'start', label: 'Start Here', icon: Play },
        { id: 'goals', label: 'Work by Goal', icon: Target },
        { id: 'tab', label: 'Current Tab Help', icon: MapPin },
        { id: 'troubleshoot', label: 'Troubleshooting', icon: Wrench },
        { id: 'guide', label: 'Full User Guide', icon: BookOpen },
    ];

    const tabHelp = getTabHelpContent();

    return (
        <div className="fixed inset-y-0 right-0 z-[4999] w-[400px] bg-[#121214] border-l border-[#27272a] shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col">
            {/* Drawer Header */}
            <div className="flex items-center justify-between px-4 py-4 border-b border-[#27272a] bg-[#18181b]">
                <div className="flex items-center gap-2">
                    <Lightbulb className="w-5 h-5 text-yellow-500" />
                    <h2 className="font-bold text-white tracking-widest uppercase">Help Center</h2>
                </div>
                <button
                    onClick={() => dispatch({ type: 'TOGGLE_HELP', payload: false })}
                    className="p-1 rounded-md text-gray-500 hover:text-white hover:bg-white/10"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            <div className="flex flex-1 min-h-0">
                {/* Drawer Sidebar */}
                <div className="w-12 border-r border-[#27272a] bg-[#09090b] flex flex-col items-center py-4 gap-4">
                    {navItems.map(item => {
                        const Icon = item.icon;
                        const isActive = state.helpContextSection === item.id || (item.id === 'tab' && state.helpContextSection.startsWith('tab-'));
                        return (
                            <button
                                key={item.id}
                                onClick={() => {
                                    if (item.id === 'guide') {
                                        setGuideOpen(true);
                                    } else {
                                        dispatch({ type: 'SET_HELP_SECTION', payload: item.id });
                                    }
                                }}
                                className={`p-2.5 rounded-xl transition-all ${isActive ? 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/30' : 'text-zinc-500 hover:text-white hover:bg-white/5'}`}
                                title={item.label}
                            >
                                <Icon className="w-5 h-5" />
                            </button>
                        );
                    })}
                </div>

                {/* Drawer Content */}
                <div className="flex-1 overflow-y-auto p-6 bg-[#0f0f11]">
                    {state.helpContextSection === 'start' && (
                        <div className="space-y-6 animate-in fade-in duration-300">
                            <div>
                                <h3 className="text-xl font-bold text-white mb-2">Welcome to Cast Director</h3>
                                <p className="text-sm text-gray-400">Cast Director Studio helps you create, refine, style, and stage characters for polished visual output.</p>
                            </div>
                            
                            <div className="bg-[#18181b] p-4 rounded-xl border border-white/5 space-y-4">
                                <div>
                                    <h4 className="font-bold text-yellow-500 uppercase text-xs tracking-wider mb-2">Hosted vs BYOK</h4>
                                    <p className="text-xs text-gray-300 hover:text-white transition-colors">Your generation credits and behavior depend on your Active Billing Mode in Settings. Always check whether you are running in Hosted Mode (using credits) or BYOK Mode (Bring Your Own Key).</p>
                                </div>
                                <div className="border-t border-white/5 pt-4">
                                    <h4 className="font-bold text-yellow-500 uppercase text-xs tracking-wider mb-2">Save It or Lose It</h4>
                                    <p className="text-xs text-gray-300 hover:text-white transition-colors">Many generated results remain temporary! If you love an actor, prop, or costume, explicitly click Save. You may need to refresh your library view after saving for it to securely register visually.</p>
                                </div>
                            </div>
                            
                            <div className="bg-[#18181b] p-4 rounded-xl border border-white/5">
                                <h4 className="font-bold text-white uppercase text-xs tracking-wider mb-3 flex items-center gap-2"><Play className="w-3 h-3 text-yellow-500" /> Quick Start Workflow</h4>
                                <ol className="list-decimal list-inside space-y-2 text-sm text-gray-400">
                                    <li>Go to <strong className="text-gray-200">CAST</strong> and generate a character.</li>
                                    <li>Save the character to your library.</li>
                                    <li>Open <strong className="text-gray-200">WARDROBE</strong> and apply a costume.</li>
                                    <li>Open <strong className="text-gray-200">STAGE [PREVIEW]</strong> and place the character on a background.</li>
                                    <li>Click <strong className="text-gray-200">Generate Composite</strong>.</li>
                                </ol>
                            </div>
                            <button 
                                onClick={() => dispatch({ type: 'SET_HELP_SECTION', payload: 'goals' })}
                                className="w-full py-3 bg-white/5 hover:bg-white/10 text-white rounded-lg transition-colors border border-white/10 font-bold"
                            >
                                See detailed Goals →
                            </button>
                        </div>
                    )}

                    {state.helpContextSection === 'goals' && (
                        <div className="space-y-4 animate-in fade-in duration-300">
                            <div>
                                <h3 className="text-xl font-bold text-white mb-2">Work by Goal</h3>
                                <p className="text-sm text-gray-400">Select what you want to do to jump directly into the correct workspace.</p>
                            </div>

                            <button onClick={() => handleGoalRoute('casting')} className="w-full flex items-start text-left gap-3 p-4 bg-[#18181b] hover:bg-[#202022] border border-white/5 hover:border-yellow-500/30 rounded-xl transition-all group">
                                <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg group-hover:scale-110 transition-transform"><UserPlus className="w-5 h-5" /></div>
                                <div>
                                    <h4 className="text-gray-200 font-bold mb-0.5">Create a character</h4>
                                    <p className="text-xs text-gray-500">Generate a fresh identity from scratch.</p>
                                </div>
                            </button>
                            
                            <button onClick={() => handleGoalRoute('nano_cast')} className="w-full flex items-start text-left gap-3 p-4 bg-[#18181b] hover:bg-[#202022] border border-white/5 hover:border-yellow-500/30 rounded-xl transition-all group">
                                <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg group-hover:scale-110 transition-transform"><UserCircle className="w-5 h-5" /></div>
                                <div>
                                    <h4 className="text-gray-200 font-bold mb-0.5">Build from a photo</h4>
                                    <p className="text-xs text-gray-500">Preserve exact real-world identity.</p>
                                </div>
                            </button>

                            <button onClick={() => handleGoalRoute('wardrobe')} className="w-full flex items-start text-left gap-3 p-4 bg-[#18181b] hover:bg-[#202022] border border-white/5 hover:border-yellow-500/30 rounded-xl transition-all group">
                                <div className="p-2 bg-purple-500/10 text-purple-400 rounded-lg group-hover:scale-110 transition-transform"><Shirt className="w-5 h-5" /></div>
                                <div>
                                    <h4 className="text-gray-200 font-bold mb-0.5">Style a character</h4>
                                    <p className="text-xs text-gray-500">Design costumes and try them on.</p>
                                </div>
                            </button>

                            <button onClick={() => handleGoalRoute('props')} className="w-full flex items-start text-left gap-3 p-4 bg-[#18181b] hover:bg-[#202022] border border-white/5 hover:border-yellow-500/30 rounded-xl transition-all group">
                                <div className="p-2 bg-orange-500/10 text-orange-400 rounded-lg group-hover:scale-110 transition-transform"><PackageOpen className="w-5 h-5" /></div>
                                <div>
                                    <h4 className="text-gray-200 font-bold mb-0.5">Create props</h4>
                                    <p className="text-xs text-gray-500">Build isolated objects for scenes.</p>
                                </div>
                            </button>

                            <button onClick={() => handleGoalRoute('staging')} className="w-full flex items-start text-left gap-3 p-4 bg-[#18181b] hover:bg-[#202022] border border-white/5 hover:border-yellow-500/30 rounded-xl transition-all group">
                                <div className="p-2 bg-red-400/10 text-red-400 rounded-lg group-hover:scale-110 transition-transform"><Clapperboard className="w-5 h-5" /></div>
                                <div>
                                    <h4 className="text-gray-200 font-bold mb-0.5">Stage a scene</h4>
                                    <p className="text-xs text-gray-500">Arrange characters and compose lighting.</p>
                                </div>
                            </button>

                            <button onClick={() => handleGoalRoute('staging', 'tab-region_edit')} className="w-full flex items-start text-left gap-3 p-4 bg-[#18181b] hover:bg-[#202022] border border-white/5 hover:border-yellow-500/30 rounded-xl transition-all group">
                                <div className="p-2 bg-teal-500/10 text-teal-400 rounded-lg group-hover:scale-110 transition-transform"><ImagePlus className="w-5 h-5" /></div>
                                <div>
                                    <h4 className="text-gray-200 font-bold mb-0.5">Fix part of an image</h4>
                                    <p className="text-xs text-gray-500">Use Region Edit masks to retouch.</p>
                                </div>
                            </button>

                            <button onClick={() => handleGoalRoute('staging', 'tab-shots')} className="w-full flex items-start text-left gap-3 p-4 bg-[#18181b] hover:bg-[#202022] border border-white/5 hover:border-yellow-500/30 rounded-xl transition-all group">
                                <div className="p-2 bg-yellow-500/10 text-yellow-500 rounded-lg group-hover:scale-110 transition-transform"><Clapperboard className="w-5 h-5" /></div>
                                <div>
                                    <h4 className="text-gray-200 font-bold mb-0.5">Generate multi-angle shots</h4>
                                    <p className="text-xs text-gray-500">Lock the layout and render different camera views.</p>
                                </div>
                            </button>
                        </div>
                    )}

                    {(state.helpContextSection === 'tab' || state.helpContextSection.startsWith('tab-')) && (
                        <div className="space-y-4 animate-in fade-in duration-300">
                            <div>
                                <h3 className="text-xl font-bold text-white mb-2">{tabHelp.title}</h3>
                                <p className="text-sm text-gray-400">{tabHelp.desc}</p>
                            </div>
                            
                            {tabHelp.actions.length > 0 && (
                                <ul className="space-y-3 mt-4">
                                    {tabHelp.actions.map((act, i) => (
                                        <li key={i} className="flex gap-3 text-sm text-gray-300">
                                            <span className="text-yellow-500 font-black mt-0.5">›</span> {act}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}

                    {state.helpContextSection === 'troubleshoot' && (
                        <div className="space-y-4 animate-in fade-in duration-300">
                            <div>
                                <h3 className="text-xl font-bold text-white mb-2">Troubleshooting</h3>
                            </div>
                            
                            <div className="space-y-3">
                                {[
                                    { issue: "Library Not Updating", fix: "Use the scan/refresh control to force a folder re-read." },
                                    { issue: "Green Artifacts", fix: "Verify the background removal toggle is enabled in Wardrobe, or use the manual eraser." },
                                    { issue: "Staging feels inconsistent", fix: "STAGE is a preview feature. Focus on Scene Truth locks to fix background drifting between shots." },
                                    { issue: "Actor Name looks generic on disk", fix: "The generic PNG name prevents file conflicts. The real name is safely stored in the JSON sidecar." },
                                    { issue: "Download or save issues", fix: "Confirm your 'Render Save Folder' is actively assigned and Connected in your settings." }
                                ].map((item, i) => (
                                    <div key={i} className="bg-[#18181b] p-3 rounded-xl border border-white/5">
                                        <h4 className="text-gray-200 font-bold text-sm mb-1">{item.issue}</h4>
                                        <p className="text-xs text-gray-400">{item.fix}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <GuideViewerModal isOpen={guideOpen} onClose={() => setGuideOpen(false)} />
        </div>
    );
};
