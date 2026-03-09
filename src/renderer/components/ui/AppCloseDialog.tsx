import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Save, Trash2, X, AlertCircle } from 'lucide-react';

export interface AppCloseDialogProps {
 isOpen: boolean;
 onClose: () => void;
 onSave: () => void;
 onDiscard: () => void;
}

export const AppCloseDialog: React.FC<AppCloseDialogProps> = ({ isOpen, onClose, onSave, onDiscard }) => {
 return (
 <AnimatePresence>
 {isOpen && (
 <div className="fixed inset-0 z-[99999] bg-black/80 backdrop-blur-md flex items-center justify-center p-8">
 <motion.div
 initial={{ opacity: 0, scale: 0.9, y: 20 }}
 animate={{ opacity: 1, scale: 1, y: 0 }}
 exit={{ opacity: 0, scale: 0.9, y: 20 }}
 className="bg-[#111113] border border-white/10 rounded-3xl max-w-md w-full relative overflow-hidden"
 >
 {/* Top accent line - Blue and Yellow gradient for Save/Info */}
 <div className="h-1 w-full bg-gradient-to-r from-blue-500 to-[#eab308]" />

 <div className="p-8">
 <div className="flex items-center gap-4 mb-4">
 <AlertCircle className="w-6 h-6 text-blue-500" />
 <h3 className="text-xl font-black text-white uppercase tracking-wider">
 Closing Studio
 </h3>
 </div>

 <p className="text-gray-400 text-sm leading-relaxed mb-8">
 Do you want to save your current session before closing? If you choose to <span className="text-red-400 font-semibold">Discard</span>, your staging area and generated shots will be cleared.
 </p>

 <div className="flex flex-col gap-3">
 <button
 onClick={() => { onClose(); onSave(); }}
 className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-black uppercase tracking-[0.2em] bg-blue-500/10 hover:bg-blue-500 text-blue-500 hover:text-white border border-blue-500/20 transition-all "
 >
 <Save className="w-4 h-4" /> Save Session
 </button>

 <button
 onClick={() => { onClose(); onDiscard(); }}
 className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-black uppercase tracking-[0.2em] bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white border border-red-500/20 transition-all "
 >
 <Trash2 className="w-4 h-4" /> Discard Session
 </button>

 <button
 onClick={onClose}
 className="w-full py-3 px-4 mt-2 rounded-xl text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500 hover:text-white hover:bg-white/5 transition-all"
 >
 Cancel
 </button>
 </div>
 </div>

 {/* Close icon for quick exit */}
 <button
 onClick={onClose}
 className="absolute top-4 right-4 text-gray-600 hover:text-white transition-colors"
 >
 <X className="w-4 h-4" />
 </button>
 </motion.div>
 </div>
 )}
 </AnimatePresence>
 );
};
