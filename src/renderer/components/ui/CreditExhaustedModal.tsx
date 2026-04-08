import { useAppContext } from '../../context/AppContext';
import { X, AlertCircle } from 'lucide-react';

export const CreditExhaustedModal = () => {
  const { state, dispatch } = useAppContext();

  if (!state.showCreditModal) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-xl flex items-center justify-center p-4">
      <div className="bg-[#18181b] border border-red-500/30 p-6 sm:p-8 rounded-2xl w-full max-w-md animate-in zoom-in fade-in duration-300 relative shadow-[0_0_50px_rgba(239,68,68,0.15)] flex flex-col items-center text-center">
        
        <button
          onClick={() => dispatch({ type: 'SET_CREDIT_MODAL', payload: false })}
          className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="w-16 h-16 bg-red-500/10 border border-red-500/30 rounded-full flex items-center justify-center mb-6">
          <AlertCircle className="w-8 h-8 text-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]" />
        </div>

        <h2 className="text-xl font-black text-white mb-2 uppercase tracking-wide">Out of Credits</h2>
        <p className="text-sm text-gray-400 mb-8 leading-relaxed">
          You’ve used all available Hosted credits. Add more credits or switch to BYOK to continue.
        </p>

        <div className="flex flex-col sm:flex-row w-full gap-3">
          <button
            onClick={() => dispatch({ type: 'SET_CREDIT_MODAL', payload: false })}
            className="flex-1 py-3 px-4 bg-[#27272a] hover:bg-[#3f3f46] text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-colors border border-white/5"
          >
            Dismiss
          </button>
          <button
            onClick={() => {
              dispatch({ type: 'SET_CREDIT_MODAL', payload: false });
              dispatch({ type: 'SET_VIEW', payload: 'settings' });
            }}
            className="flex-1 py-3 px-4 bg-yellow-500 hover:bg-yellow-400 text-black text-xs font-black uppercase tracking-wider rounded-lg transition-colors shadow-[0_0_20px_rgba(234,179,8,0.3)]"
          >
            Switch to BYOK
          </button>
        </div>
      </div>
    </div>
  );
};
