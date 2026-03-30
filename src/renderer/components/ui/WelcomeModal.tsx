import React from 'react';
import { useAppContext } from '../../context/AppContext';
import {
    Target,
    UserCircle,
    UserPlus,
    Shirt,
    Clapperboard,
    ImagePlus,
    Lightbulb
} from 'lucide-react';

export const WelcomeModal: React.FC = () => {
    const { state, dispatch } = useAppContext();

    if (state.hasSeenWelcome) return null;

    const handleGoalRoute = (route: typeof state.view, sectionOverride?: string) => {
        dispatch({ type: 'SET_VIEW', payload: route });
        dispatch({ type: 'SET_SEEN_WELCOME', payload: true });
        
        if (sectionOverride) {
            dispatch({ type: 'SET_HELP_SECTION', payload: sectionOverride });
            dispatch({ type: 'TOGGLE_HELP', payload: true });
        }
    };

    const handleSkip = () => {
        dispatch({ type: 'SET_SEEN_WELCOME', payload: true });
    };

    const openHelpCenter = () => {
        dispatch({ type: 'SET_SEEN_WELCOME', payload: true });
        dispatch({ type: 'SET_HELP_SECTION', payload: 'start' });
        dispatch({ type: 'TOGGLE_HELP', payload: true });
    };

    return (
        <div className="fixed inset-0 z-[5000] flex items-center justify-center p-4 sm:p-8 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-[#18181b] border border-[#27272a] rounded-2xl w-full max-w-2xl shadow-2xl p-8 animate-in zoom-in-95 duration-500">
                <div className="text-center mb-10">
                    <div className="w-16 h-16 bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Target className="w-8 h-8" />
                    </div>
                    <h2 className="text-3xl font-black text-white uppercase tracking-tight mb-2">Welcome to Cast Director Studio</h2>
                    <p className="text-gray-400">What would you like to do today?</p>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
                    <button onClick={() => handleGoalRoute('casting')} className="flex items-start text-left gap-4 p-5 bg-[#09090b] hover:bg-[#121214] border border-[#27272a] hover:border-blue-500/50 rounded-xl transition-all group">
                        <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-lg group-hover:scale-110 transition-transform"><UserPlus className="w-6 h-6" /></div>
                        <div>
                            <h4 className="text-gray-200 font-bold mb-1 group-hover:text-blue-400 transition-colors">Create a character</h4>
                            <p className="text-xs text-gray-500">Generate a fresh identity from scratch.</p>
                        </div>
                    </button>
                    
                    <button onClick={() => handleGoalRoute('nano_cast')} className="flex items-start text-left gap-4 p-5 bg-[#09090b] hover:bg-[#121214] border border-[#27272a] hover:border-emerald-500/50 rounded-xl transition-all group">
                        <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-lg group-hover:scale-110 transition-transform"><UserCircle className="w-6 h-6" /></div>
                        <div>
                            <h4 className="text-gray-200 font-bold mb-1 group-hover:text-emerald-400 transition-colors">Build from a photo</h4>
                            <p className="text-xs text-gray-500">Preserve exact real-world identity.</p>
                        </div>
                    </button>

                    <button onClick={() => handleGoalRoute('wardrobe')} className="flex items-start text-left gap-4 p-5 bg-[#09090b] hover:bg-[#121214] border border-[#27272a] hover:border-purple-500/50 rounded-xl transition-all group">
                        <div className="p-2.5 bg-purple-500/10 text-purple-400 rounded-lg group-hover:scale-110 transition-transform"><Shirt className="w-6 h-6" /></div>
                        <div>
                            <h4 className="text-gray-200 font-bold mb-1 group-hover:text-purple-400 transition-colors">Style a character</h4>
                            <p className="text-xs text-gray-500">Design costumes and try them on.</p>
                        </div>
                    </button>

                    <button onClick={() => handleGoalRoute('staging')} className="flex items-start text-left gap-4 p-5 bg-[#09090b] hover:bg-[#121214] border border-[#27272a] hover:border-red-500/50 rounded-xl transition-all group">
                        <div className="p-2.5 bg-red-400/10 text-red-400 rounded-lg group-hover:scale-110 transition-transform"><Clapperboard className="w-6 h-6" /></div>
                        <div>
                            <h4 className="text-gray-200 font-bold mb-1 group-hover:text-red-400 transition-colors">Stage a scene</h4>
                            <p className="text-xs text-gray-500">Arrange characters and compose lighting.</p>
                        </div>
                    </button>

                    <button onClick={() => handleGoalRoute('staging', 'tab-staging')} className="flex items-start text-left gap-4 p-5 bg-[#09090b] hover:bg-[#121214] border border-[#27272a] hover:border-teal-500/50 rounded-xl transition-all group">
                        <div className="p-2.5 bg-teal-500/10 text-teal-400 rounded-lg group-hover:scale-110 transition-transform"><ImagePlus className="w-6 h-6" /></div>
                        <div>
                            <h4 className="text-gray-200 font-bold mb-1 group-hover:text-teal-400 transition-colors">Fix part of an image</h4>
                            <p className="text-xs text-gray-500">Use Region Edit masks to retouch local mistakes.</p>
                        </div>
                    </button>

                    <button onClick={() => handleGoalRoute('staging', 'tab-shots')} className="flex items-start text-left gap-4 p-5 bg-[#09090b] hover:bg-[#121214] border border-[#27272a] hover:border-yellow-500/50 rounded-xl transition-all group sm:col-span-2">
                        <div className="p-2.5 bg-yellow-500/10 text-yellow-500 rounded-lg group-hover:scale-110 transition-transform"><Clapperboard className="w-6 h-6" /></div>
                        <div>
                            <h4 className="text-gray-200 font-bold mb-1 group-hover:text-yellow-400 transition-colors">Generate multi-angle shots</h4>
                            <p className="text-xs text-gray-500">Lock your layout and render different camera views for consistent storytelling.</p>
                        </div>
                    </button>
                </div>
                
                <div className="flex items-center justify-between border-t border-white/5 pt-6 mt-6">
                    <button onClick={handleSkip} className="text-sm font-bold text-gray-500 hover:text-white transition-colors">
                        Skip
                    </button>
                    <button onClick={openHelpCenter} className="flex items-center gap-2 text-sm font-bold text-yellow-500 hover:text-yellow-400 transition-colors bg-yellow-500/10 hover:bg-yellow-500/20 px-4 py-2 rounded-lg border border-yellow-500/20">
                        <Lightbulb className="w-4 h-4" /> Open Help Center
                    </button>
                </div>
            </div>
        </div>
    );
};
