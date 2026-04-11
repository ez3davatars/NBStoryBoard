import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FolderInput, User, Folder, Check } from 'lucide-react';
import { useAppContext } from '../context/AppContext';

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
  title?: string;
  description?: string;
  hideNameInput?: boolean;
}

import coverRealism from '../assets/cover-realism.png';
import coverAnim from '../assets/cover-anim.png';
import coverIllustration from '../assets/cover-illustration.png';
import coverScifi from '../assets/cover-scifi.png';

const STUDIO_FOLDERS = [
  {
    id: 'realism',
    label: 'Realism',
    description: 'Photorealistic portraiture and raw detail',
    image: coverRealism,
  },
  {
    id: 'anim',
    label: 'Stylized Cartoon',
    description: 'Modern 3D animation and soft lighting',
    image: coverAnim,
  },
  {
    id: 'illustration',
    label: 'Illustration',
    description: 'Anime, noir, and graphic looks',
    image: coverIllustration,
  },
  {
    id: 'scifi',
    label: 'Sci-Fi',
    description: 'Cyberpunk and high-tech aesthetics',
    image: coverScifi,
  },
  {
    id: 'uncategorized',
    label: 'Unsorted',
    description: 'No specific style',
    image: null,
  },
] as const;

const ActorSaveModal: React.FC<ActorSaveModalProps> = ({
  isOpen,
  initialName,
  onClose,
  onSave,
  backgrounds,
  title = 'Save to Actor Library',
  description = 'Select a Studio Folder to organize this actor:',
  hideNameInput = false,
}) => {
  const { state } = useAppContext();
  const [name, setName] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);

  React.useEffect(() => {
    setName(initialName || '');
    setSelectedFolder(null); // Reset selection explicitly when modal opens
  }, [initialName, isOpen]);

  const finalName = hideNameInput ? initialName.trim() : name.trim();
  const canSave = !!finalName && !!selectedFolder;

  const bgOverrides = useMemo(
    () => ({
      realism: backgrounds?.realism,
      anim: backgrounds?.animation,
      illustration: backgrounds?.illustration,
      scifi: backgrounds?.scifi,
    }),
    [backgrounds]
  );

  const handleSave = () => {
    if (!canSave || !selectedFolder) return;
    onSave(finalName, selectedFolder);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[3000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="relative w-full max-w-[560px] max-h-[90vh] overflow-hidden rounded-[24px] border border-white/10 bg-[#15161a] shadow-[0_20px_80px_rgba(0,0,0,0.45)] flex flex-col"
            initial={{ opacity: 0, y: 18, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.99 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-7 pt-7 pb-5 border-b border-white/6">
              <div className="flex items-center gap-3 mb-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-400/15">
                  <FolderInput className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-[22px] font-black text-white uppercase tracking-[0.08em]">
                    {title}
                  </h3>
                  <p className="text-sm text-gray-400 mt-1">{description}</p>
                </div>
              </div>

              {!hideNameInput && (
                <div className="mt-5">
                  <label className="block text-[11px] font-bold uppercase tracking-[0.16em] text-gray-500 mb-2">
                    Actor Name
                  </label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full h-12 rounded-2xl bg-[#0f1013] border border-white/8 pl-11 pr-4 text-sm font-semibold text-white placeholder:text-gray-600 focus:outline-none focus:border-emerald-400/40 transition-colors"
                      placeholder="Enter actor name..."
                      autoFocus
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="px-7 py-5 overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-1 gap-3">
                {STUDIO_FOLDERS.map((folder) => {
                  const activeImage =
                    state.customCovers[folder.id] ||
                    bgOverrides[folder.id as keyof typeof bgOverrides] ||
                    folder.image;

                  const isSelected = selectedFolder === folder.id;

                  return (
                    <button
                      key={folder.id}
                      type="button"
                      onClick={() => setSelectedFolder(folder.id)}
                      className={[
                        'group relative w-full rounded-[20px] border transition-all text-left overflow-hidden',
                        isSelected
                          ? 'border-emerald-400/45 bg-[#1b1d22] shadow-[0_0_0_1px_rgba(16,185,129,0.18)]'
                          : 'border-white/8 bg-[#191b20] hover:border-white/15 hover:bg-[#1c1e24]'
                      ].join(' ') }
                    >
                      <div className="flex items-stretch min-h-[92px]">
                        <div className="w-[118px] shrink-0 relative border-r border-white/6 bg-[#111216]">
                          {activeImage ? (
                            <>
                              <img
                                src={activeImage as string}
                                alt={folder.label}
                                className={['absolute inset-0 w-full h-full object-cover transition-opacity', isSelected ? 'opacity-100' : 'opacity-70 group-hover:opacity-80'].join(' ')}
                              />
                              <div className={['absolute inset-0 transition-colors', isSelected ? 'bg-black/10' : 'bg-black/45'].join(' ')} />
                            </>
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <Folder className="w-8 h-8 text-white/10" />
                            </div>
                          )}
                        </div>

                        <div className="flex-1 min-w-0 px-5 py-4 flex items-center justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-1.5">
                              <div
                                className={[
                                  'h-2.5 w-2.5 rounded-full transition-colors',
                                  isSelected ? 'bg-emerald-400' : 'bg-white/12'
                                ].join(' ')}
                              />
                              <h4 className="text-[18px] font-extrabold text-white tracking-[-0.02em]">
                                {folder.label}
                              </h4>
                            </div>
                            <p className="text-[13px] leading-snug text-gray-400 max-w-[280px]">
                              {folder.description}
                            </p>
                          </div>

                          <div
                            className={[
                              'shrink-0 flex items-center justify-center w-8 h-8 rounded-full border transition-all',
                              isSelected
                                ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300'
                                : 'border-white/8 bg-black/20 text-transparent group-hover:text-gray-400'
                            ].join(' ')}
                          >
                            <Check className="w-4 h-4" />
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="px-7 py-5 border-t border-white/6 bg-[#121318] flex items-center justify-between gap-3">
              <div className="text-xs text-gray-500">
                {selectedFolder ? `Selected: ${STUDIO_FOLDERS.find(f => f.id === selectedFolder)?.label}` : 'Select a folder'}
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={onClose}
                  className="h-11 px-5 rounded-2xl border border-white/8 bg-white/[0.03] text-[12px] font-bold uppercase tracking-[0.14em] text-gray-300 hover:text-white hover:bg-white/[0.06] transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={!canSave}
                  className={[
                    'h-11 px-6 rounded-2xl text-[12px] font-black uppercase tracking-[0.14em] transition-all',
                    canSave
                      ? 'bg-emerald-500/20 border border-emerald-400/50 text-emerald-400 hover:bg-emerald-500/30 hover:border-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)]'
                      : 'bg-white/10 text-gray-400 cursor-not-allowed border border-transparent'
                  ].join(' ')}
                >
                  Save Actor
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ActorSaveModal;
