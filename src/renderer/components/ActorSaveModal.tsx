
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FolderPlus, User } from 'lucide-react';

// Types
export interface ActorSaveModalProps {
 isOpen: boolean;
 initialName: string;
 onClose: () => void;
 onSave: (name: string, category: string) => void;
 // Optional: Pass in style images if we want to avoid re-importing them all here
 // or we can just import representative ones.
 backgrounds: {
 realism: string;
 animation: string;
 illustration: string;
 scifi: string;
 };
}

const STUDIOS = [
 {
 id: 'realism',
 label: 'REALISM',
 sub: 'Photorealistic Portraiture & Raw Detail',
 bgKey: 'realism',
 color: 'border-purple-500' // Accent color
 },
 {
 id: 'anim',
 label: 'STYLIZED CARTOON',
 sub: 'Modern 3D Animation & Soft Lighting',
 bgKey: 'animation',
 color: 'border-blue-500'
 },
 {
 id: 'illustration',
 label: 'ILLUSTRATION',
 sub: 'Anime, Noir & Graphic',
 bgKey: 'illustration',
 color: 'border-pink-500'
 },
 {
 id: 'scifi',
 label: 'SCI-FI',
 sub: 'Cyberpunk & High Tech',
 bgKey: 'scifi',
 color: 'border-cyan-500'
 },
 {
 id: 'uncategorized',
 label: 'UNSORTED',
 sub: 'No Specific Style',
 bgKey: 'realism', // Fallback or separate
 color: 'border-gray-500'
 }
];

const ActorSaveModal: React.FC<ActorSaveModalProps> = ({ isOpen, initialName, onClose, onSave, backgrounds }) => {
 const [name, setName] = useState(initialName);
 const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

 // Update local name when initialName changes (if modal re-opens)
 React.useEffect(() => {
 setName(initialName);
 }, [initialName]);

 const handleSave = () => {
 if (name && selectedCategory) {
 onSave(name, selectedCategory);
 }
 };

 return (
 <AnimatePresence>
 {isOpen && (
 <div className="fixed inset-0 z-[3000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-8 animate-in fade-in duration-200">
 <motion.div
 initial={{ opacity: 0, scale: 0.95 }}
 animate={{ opacity: 1, scale: 1 }}
 exit={{ opacity: 0, scale: 0.95 }}
 className="bg-[#0f0f11] border border-white/10 p-8 rounded-3xl max-w-xl w-full relative overflow-hidden flex flex-col max-h-[90vh]"
 >
 {/* HEADER */}
 <div className="mb-6">
 <h3 className="text-2xl font-black text-white uppercase tracking-wider mb-2 flex items-center gap-3">
 <FolderPlus className="w-6 h-6 text-purple-500" /> Save to Actor Library
 </h3>
 <p className="text-gray-400 text-sm">
 Select a Studio for <span className="text-white font-bold">{name || 'this actor'}</span>. This will determine its directory structure.
 </p>
 </div>

 {/* NAME INPUT */}
 <div className="mb-6">
 <label className="text-[10px] uppercase font-bold text-gray-500 block mb-2 tracking-widest">Actor Identity Name</label>
 <div className="relative group">
 <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-purple-500 transition-colors" />
 <input
 type="text"
 value={name}
 onChange={(e) => setName(e.target.value)}
 className="w-full bg-[#18181b] border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white font-bold text-lg focus:border-purple-500 outline-none transition-all placeholder:text-gray-700"
 placeholder="Enter Name..."
 />
 </div>
 </div>

 {/* STUDIO GRID */}
 <div className="flex-grow overflow-y-auto space-y-3 p-2 -mx-2">
 {STUDIOS.map((studio) => (
 <button
 key={studio.id}
 onClick={() => setSelectedCategory(studio.id)}
 className={`w-full relative h-28 rounded-2xl overflow-hidden group transition-all duration-200 border-2 text-left ${selectedCategory === studio.id
 ? `border-blue-500 scale-[1.02] -[0_0_20px_rgba(59,130,246,0.4)] z-10`
 : 'border-transparent hover:border-white/20 opacity-80 hover:opacity-100 hover:scale-[1.01]'
 }`}
 >
 {/* Background Image */}
 <div className="absolute inset-0 z-0 bg-black">
 <img
 src={backgrounds[studio.bgKey as keyof typeof backgrounds] || backgrounds.realism}
 alt={studio.label}
 className="w-full h-full object-cover object-[80%_25%] opacity-70 group-hover:opacity-100 transition-all duration-500"
 />
 <div className="absolute inset-0 bg-gradient-to-r from-black via-black/50 to-transparent" />
 </div>

 {/* Content */}
 <div className="relative z-10 h-full flex flex-col justify-center px-8 w-2/3">
 <h4 className="text-2xl font-black italic text-white uppercase tracking-tighter leading-none mb-1 ">
 {studio.label}
 </h4>
 <div className="flex items-center gap-2">
 <div className={`w-1 h-3 ${selectedCategory === studio.id ? 'bg-blue-500' : 'bg-purple-500'} `} />
 <span className="text-xs font-bold text-gray-200 tracking-wide uppercase ">
 {studio.sub}
 </span>
 </div>
 </div>
 </button>
 ))}
 </div>

 {/* FOOTER ACTIONS */}
 <div className="pt-6 mt-2 flex justify-end gap-4">
 <button
 onClick={onClose}
 className="px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-widest text-gray-500 hover:text-white transition-colors"
 >
 Cancel
 </button>
 <button
 onClick={handleSave}
 disabled={!selectedCategory || !name.trim()}
 className="px-8 py-3 rounded-xl text-xs font-black uppercase tracking-widest bg-white text-emerald-600 hover:bg-emerald-500 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed transition-all "
 >
 Save Actor
 </button>
 </div>

 </motion.div>
 </div>
 )}
 </AnimatePresence>
 );
};

export default ActorSaveModal;



