import React, { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { FolderInput, User, Folder } from 'lucide-react';
import { useAppContext } from '../context/AppContext';

// Types
export interface ActorSaveModalProps {
  isOpen: boolean;
  initialName: string;
  onClose: () => void;
  onSave: (name: string, category: string) => void;
  backgrounds?: {
    realism?: string;
    animation?: string;
    illustration?: string;
    scifi?: string;
  };
}

import coverRealism from '../assets/cover-realism.png';
import coverAnim from '../assets/cover-anim.png';
import coverIllustration from '../assets/cover-illustration.png';
import coverScifi from '../assets/cover-scifi.png';

const STUDIO_FOLDERS = [
  { id: 'realism', label: 'REALISM', description: "Photorealistic Portraiture & Raw Detail", image: coverRealism },
  { id: 'anim', label: 'STYLIZED CARTOON', description: "Modern 3D Animation & Soft Lighting", image: coverAnim },
  { id: 'illustration', label: 'ILLUSTRATION', description: "Anime, Noir & Graphic", image: coverIllustration },
  { id: 'scifi', label: 'SCI-FI', description: "Cyberpunk & High Tech", image: coverScifi },
  { id: 'uncategorized', label: 'UNSORTED', description: "No Specific Style", image: null }
];

const ActorSaveModal: React.FC<ActorSaveModalProps> = ({
  isOpen,
  initialName,
  onClose,
  onSave,
  backgrounds
}) => {
  const { state } = useAppContext();
  const [name, setName] = useState('');

  // Update local name when initialName changes (if modal re-opens)
  React.useEffect(() => {
    setName(initialName || '');
  }, [initialName, isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div 
          className="fixed inset-0 z-[3000] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={onClose}
        >
          <div 
            className="bg-[#18181b] border border-gray-700 rounded-2xl p-6 max-w-md w-full relative overflow-hidden flex flex-col max-h-[90vh]"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-black text-white uppercase tracking-widest mb-2 flex items-center gap-2">
              <FolderInput className="w-5 h-5 text-emerald-500" /> Save to Actor Library
            </h3>
            <p className="text-xs text-gray-400 mb-4">Select a Studio Folder to organize this actor:</p>

            {/* NAME INPUT */}
            <div className="mb-4">
              <div className="relative group">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-emerald-500 transition-colors" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-black/40 border border-[#27272a] rounded-lg pl-9 pr-3 py-2 text-xs font-bold text-white placeholder:text-gray-600 focus:border-emerald-500/50 outline-none transition-all"
                  placeholder="Enter Actor Name..."
                  autoFocus
                />
              </div>
            </div>

            {/* STUDIO FOLDERS */}
            <div className="grid grid-cols-1 gap-2 mb-4 overflow-y-auto pr-1 custom-scrollbar flex-grow">
              {STUDIO_FOLDERS.map((folder) => {
                const bgOverrides = {
                  realism: backgrounds?.realism,
                  anim: backgrounds?.animation,
                  illustration: backgrounds?.illustration,
                  scifi: backgrounds?.scifi,
                };
                
                const activeImage =
                  state.customCovers[folder.id] ||
                  bgOverrides[folder.id as keyof typeof bgOverrides] ||
                  folder.image;
                return (
                  <button
                    key={folder.id}
                    onClick={() => {
                        if(name.trim()) onSave(name, folder.id);
                    }}
                    disabled={!name.trim()}
                    className={`group relative h-24 w-full rounded-xl overflow-hidden border border-white/10 transition-all text-left ${
                      name.trim() ? "hover:scale-[1.02] hover:border-emerald-500 cursor-pointer" : "opacity-50 cursor-not-allowed"
                    }`}
                  >
                    {/* Background Image */}
                    {activeImage ? (
                      <img src={activeImage as string} className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 opacity-60 group-hover:opacity-100" />
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-gray-800 to-black flex items-center justify-center">
                        <Folder className="w-8 h-8 text-white/10" />
                      </div>
                    )}

                    {/* Cinematic Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/40 to-transparent flex flex-col justify-center px-6">
                      <div>
                        <h3 className={`text-xl font-black italic tracking-tighter uppercase transition-colors leading-none ${name.trim() ? "text-white group-hover:text-emerald-400" : "text-gray-400"}`}>
                          {folder.label}
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                          <p className={`text-[10px] font-bold border-l-2 pl-2 border-emerald-500 ${name.trim() ? "text-gray-300" : "text-gray-500"}`}>
                            {folder.description}
                          </p>
                        </div>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>

            <div className="flex justify-end mt-2 pt-2 border-t border-white/5">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default ActorSaveModal;
