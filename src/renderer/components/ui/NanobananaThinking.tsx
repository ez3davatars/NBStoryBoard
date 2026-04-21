import { useAppContext } from '../../context/AppContext';

interface ProgressData {
 phase: string;
 percent: number;
 text?: string;
}

export const NanobananaThinking = ({ progress: localProgress }: { progress?: ProgressData | null }) => {
 const { state } = useAppContext();
 const progress = localProgress || state.globalProgress;

 return (
 <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/60 backdrop-blur-xl animate-in fade-in duration-500 select-none">
 <div className="relative flex items-center justify-center scale-110">
 {/* Cinematic Outer Glow/Ring */}
 <div className="absolute w-64 h-64 bg-yellow-500/10 rounded-full blur-3xl animate-pulse"></div>

 {/* Outer Cinematic Spinner */}
 <div className="w-56 h-56 border-[3px] border-transparent border-t-yellow-500 border-b-yellow-500 rounded-full animate-spin -[0_0_40px_rgba(234,179,8,0.3)]"></div>

 {/* Inner Reverse Spinner */}
 <div className="absolute w-44 h-44 border-[3px] border-transparent border-l-blue-500 border-r-blue-500 rounded-full animate-spin-reverse -[0_0_30px_rgba(59,130,246,0.3)]"></div>

 {/* Central Core (Banana) */}
 <div className="absolute flex flex-col items-center">
 <div className="text-[72px] animate-bounce-slow -[0_0_20px_rgba(234,179,8,0.8)] filter brightness-110 grayscale-0">
 🍌
 </div>
 </div>

 {/* Text Terminal Indicator */}
 <div className="absolute -bottom-32 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 w-full text-center min-w-[300px]">
        <div className="flex items-center justify-center gap-3 w-full">
          <span className="h-[1px] flex-1 bg-gradient-to-r from-transparent to-yellow-500/50"></span>
          <p className="text-yellow-500 font-black tracking-[0.3em] uppercase text-[12px] animate-pulse whitespace-nowrap drop-shadow-md">
            {progress ? `${('phase' in progress ? progress.phase : 'PROCESSING') || 'PROCESSING'} - ${Math.round(progress.percent)}%` : 'Nanobanana is thinking'}
          </p>
          <span className="h-[1px] flex-1 bg-gradient-to-l from-transparent to-yellow-500/50"></span>
        </div>

 {progress ? (
 <div className="flex flex-col items-center gap-2 w-full px-4">
 <p className="text-blue-400/80 text-[10px] font-mono uppercase tracking-[0.2em]">
 // {progress.text} {Math.round(progress.percent)}%
 </p>
 {/* Cinematic Progress Bar */}
 <div className="w-48 h-1 bg-black/50 border border-white/5 rounded-full overflow-hidden mt-1 -[0_0_10px_rgba(0,0,0,0.5)_inset]">
 <div
 className="h-full bg-gradient-to-r from-blue-600 via-yellow-500 to-yellow-400 rounded-full transition-all duration-300 ease-out -[0_0_8px_rgba(234,179,8,0.5)]"
 style={{ width: `${Math.min(100, progress.percent)}%` }}
 />
 </div>
 </div>
 ) : (
 <p className="text-blue-400/60 text-[9px] font-mono uppercase tracking-[0.2em] animate-pulse delay-75">
 // Neural Matrix Synthesis Active...
 </p>
 )}
 </div>
 </div>
 </div>
 );
};
