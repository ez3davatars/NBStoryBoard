import React from 'react';
import { useAppContext } from '../../context/AppContext';
import {
    UserCircle,
    UserPlus,
    Shirt,
    Clapperboard,
    ImagePlus,
    Lightbulb
} from 'lucide-react';
import studioLogo from '../../assets/logo-z.png';

export const WelcomeModal: React.FC = () => {
    const { state, dispatch } = useAppContext();

    if (!state.isWelcomeStateReady) return null;
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

    const goalCards: Array<{
        title: string;
        description: string;
        route: typeof state.view;
        sectionOverride?: string;
        icon: React.ElementType;
        iconClassName: string;
        titleClassName: string;
        hoverClassName: string;
        focusClassName: string;
        lightClassName: string;
    }> = [
        {
            title: 'Create a character',
            description: 'Generate a fresh identity from scratch.',
            route: 'casting',
            icon: UserPlus,
            iconClassName: 'bg-blue-500/15 text-blue-300 border-blue-300/20 shadow-[0_0_24px_rgba(59,130,246,0.18)]',
            titleClassName: 'group-hover:text-blue-200',
            hoverClassName: 'hover:border-blue-300/45 hover:shadow-[0_18px_48px_rgba(59,130,246,0.18)]',
            focusClassName: 'focus-visible:ring-blue-300/55',
            lightClassName: 'bg-[radial-gradient(ellipse_at_top_right,rgba(59,130,246,0.22),transparent_58%)]',
        },
        {
            title: 'Build from a photo',
            description: 'Preserve real-world identity from a source image.',
            route: 'nano_cast',
            icon: UserCircle,
            iconClassName: 'bg-emerald-500/15 text-emerald-300 border-emerald-300/20 shadow-[0_0_24px_rgba(16,185,129,0.16)]',
            titleClassName: 'group-hover:text-emerald-200',
            hoverClassName: 'hover:border-emerald-300/45 hover:shadow-[0_18px_48px_rgba(16,185,129,0.16)]',
            focusClassName: 'focus-visible:ring-emerald-300/55',
            lightClassName: 'bg-[radial-gradient(ellipse_at_top_right,rgba(16,185,129,0.2),transparent_58%)]',
        },
        {
            title: 'Style a character',
            description: 'Design costumes, looks, and wardrobe variations.',
            route: 'wardrobe',
            icon: Shirt,
            iconClassName: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-300/20 shadow-[0_0_24px_rgba(217,70,239,0.16)]',
            titleClassName: 'group-hover:text-fuchsia-200',
            hoverClassName: 'hover:border-fuchsia-300/45 hover:shadow-[0_18px_48px_rgba(217,70,239,0.15)]',
            focusClassName: 'focus-visible:ring-fuchsia-300/55',
            lightClassName: 'bg-[radial-gradient(ellipse_at_top_right,rgba(217,70,239,0.2),transparent_58%)]',
        },
        {
            title: 'Stage a scene',
            description: 'Arrange characters, props, and cinematic composition.',
            route: 'staging',
            icon: Clapperboard,
            iconClassName: 'bg-red-500/15 text-red-300 border-red-300/20 shadow-[0_0_24px_rgba(248,113,113,0.14)]',
            titleClassName: 'group-hover:text-red-200',
            hoverClassName: 'hover:border-red-300/45 hover:shadow-[0_18px_48px_rgba(248,113,113,0.14)]',
            focusClassName: 'focus-visible:ring-red-300/55',
            lightClassName: 'bg-[radial-gradient(ellipse_at_top_right,rgba(248,113,113,0.2),transparent_58%)]',
        },
        {
            title: 'Fix part of an image',
            description: 'Retouch local details with region masks.',
            route: 'staging',
            sectionOverride: 'tab-staging',
            icon: ImagePlus,
            iconClassName: 'bg-teal-500/15 text-teal-300 border-teal-300/20 shadow-[0_0_24px_rgba(45,212,191,0.15)]',
            titleClassName: 'group-hover:text-teal-200',
            hoverClassName: 'hover:border-teal-300/45 hover:shadow-[0_18px_48px_rgba(45,212,191,0.14)]',
            focusClassName: 'focus-visible:ring-teal-300/55',
            lightClassName: 'bg-[radial-gradient(ellipse_at_top_right,rgba(45,212,191,0.2),transparent_58%)]',
        },
        {
            title: 'Generate multi-angle shots',
            description: 'Lock the setup and render consistent camera views.',
            route: 'staging',
            sectionOverride: 'tab-shots',
            icon: Clapperboard,
            iconClassName: 'bg-yellow-400/15 text-yellow-300 border-yellow-200/25 shadow-[0_0_28px_rgba(250,204,21,0.18)]',
            titleClassName: 'group-hover:text-yellow-100',
            hoverClassName: 'hover:border-yellow-200/55 hover:shadow-[0_20px_58px_rgba(250,204,21,0.18)]',
            focusClassName: 'focus-visible:ring-yellow-200/60',
            lightClassName: 'bg-[radial-gradient(ellipse_at_top_right,rgba(250,204,21,0.24),transparent_58%)]',
        },
    ];

    return (
        <div className="fixed inset-0 z-[5000] flex items-center justify-center overflow-y-auto bg-[#030305]/90 p-3 text-white backdrop-blur-xl animate-in fade-in duration-300 sm:p-6">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(250,204,21,0.18),transparent_44%),linear-gradient(145deg,rgba(10,11,18,0.96),rgba(0,0,0,0.9)_52%,rgba(23,18,8,0.92))]" />
            <div className="pointer-events-none absolute inset-0 opacity-[0.08] bg-[linear-gradient(90deg,rgba(255,255,255,0.55)_1px,transparent_1px),linear-gradient(180deg,rgba(255,255,255,0.5)_1px,transparent_1px)] bg-[size:42px_42px]" />

            <div className="relative w-full max-w-4xl overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(145deg,rgba(28,28,33,0.9),rgba(8,8,12,0.96)_48%,rgba(26,21,10,0.92))] shadow-[0_32px_120px_rgba(0,0,0,0.7),0_0_70px_rgba(250,204,21,0.08)] ring-1 ring-yellow-200/10 animate-in zoom-in-95 duration-500">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,217,64,0.13),transparent_42%),radial-gradient(ellipse_at_bottom_left,rgba(59,130,246,0.11),transparent_38%)]" />
                <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-yellow-200/60 to-transparent" />
                <div className="relative max-h-[92vh] overflow-y-auto px-5 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-9">
                    <div className="mb-8 text-center">
                        <div className="relative mx-auto mb-5 flex h-28 w-32 items-center justify-center sm:h-32 sm:w-36">
                            <img
                                src={studioLogo}
                                alt="Cast Director Studio logo"
                                className="relative h-24 w-28 object-contain drop-shadow-[0_18px_28px_rgba(0,0,0,0.45)] sm:h-28 sm:w-32"
                                draggable={false}
                            />
                        </div>
                        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-yellow-200/20 bg-yellow-300/10 px-3 py-1 text-[10px] font-black uppercase text-yellow-200/90 shadow-[0_0_24px_rgba(250,204,21,0.1)]">
                            <span className="h-1.5 w-1.5 rounded-full bg-yellow-300 shadow-[0_0_12px_rgba(250,204,21,0.9)]" />
                            Cinematic AI Production Suite
                        </div>
                        <h2 className="mx-auto max-w-3xl text-3xl font-black leading-tight sm:text-4xl">
                            <span className="block text-gray-100">Welcome to</span>
                            <span className="block bg-gradient-to-r from-yellow-200 via-yellow-400 to-amber-500 bg-clip-text text-transparent">Cast Director Studio</span>
                        </h2>
                        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-zinc-400 sm:text-base">
                            Choose the fastest path into your production workflow.
                        </p>
                    </div>

                    <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {goalCards.map((card) => {
                            const Icon = card.icon;

                            return (
                                <button
                                    key={card.title}
                                    onClick={() => handleGoalRoute(card.route, card.sectionOverride)}
                                    className={`group relative flex min-h-[112px] items-start gap-4 overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.075),rgba(255,255,255,0.018)_48%,rgba(0,0,0,0.34))] p-5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_12px_34px_rgba(0,0,0,0.28)] transition-all duration-300 hover:-translate-y-1 hover:bg-white/[0.055] focus-visible:outline-none focus-visible:ring-2 ${card.hoverClassName} ${card.focusClassName}`}
                                >
                                    <span className={`pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100 ${card.lightClassName}`} />
                                    <span className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                                    <span className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border ${card.iconClassName} transition-transform duration-300 group-hover:scale-105`}>
                                        <Icon className="h-6 w-6" />
                                    </span>
                                    <span className="relative min-w-0 pt-0.5">
                                        <span className={`mb-1.5 block text-[15px] font-black leading-snug text-zinc-100 transition-colors ${card.titleClassName}`}>
                                            {card.title}
                                        </span>
                                        <span className="block text-xs leading-5 text-zinc-500 transition-colors group-hover:text-zinc-300">
                                            {card.description}
                                        </span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    <div className="flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
                        <button
                            onClick={handleSkip}
                            className="rounded-xl border border-white/5 bg-white/[0.03] px-4 py-2 text-sm font-bold text-zinc-500 transition-all hover:border-white/15 hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
                        >
                            Skip
                        </button>
                        <button
                            onClick={openHelpCenter}
                            className="flex items-center justify-center gap-2 rounded-xl border border-yellow-200/25 bg-yellow-300/10 px-5 py-2.5 text-sm font-black text-yellow-200 shadow-[0_0_24px_rgba(250,204,21,0.1)] transition-all hover:-translate-y-0.5 hover:border-yellow-200/45 hover:bg-yellow-300/15 hover:text-yellow-100 hover:shadow-[0_0_34px_rgba(250,204,21,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-200/50"
                        >
                            <Lightbulb className="h-4 w-4" /> Open Help Center
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
