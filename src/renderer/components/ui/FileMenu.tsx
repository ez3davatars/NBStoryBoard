import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAppContext } from '../../context/AppContext';
import { SessionService } from '../../services/SessionService';
import { File, Save, FolderOpen, FilePlus, SaveAll, BookOpen, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ConfirmDialog from './ConfirmDialog';

export const FileMenu = () => {
    const { state, dispatch } = useAppContext();
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const [showNewSessionConfirm, setShowNewSessionConfirm] = useState(false);
    const [showOpenConfirm, setShowOpenConfirm] = useState(false);
    const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Hardcoded absolute positioning prevents disturbing the header flexbox
    const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (
                menuRef.current && !menuRef.current.contains(e.target as Node) &&
                triggerRef.current && !triggerRef.current.contains(e.target as Node)
            ) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            // Calculate absolute position based on trigger
            if (triggerRef.current) {
                const rect = triggerRef.current.getBoundingClientRect();
                // w-56 is 14rem = 224px. Align right side.
                setMenuPosition({ top: rect.bottom + 4, left: rect.right - 224 });
            }
        } else {
            document.removeEventListener('mousedown', handleClickOutside);
        }

        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    const doSave = async (isSaveAs: boolean = false): Promise<boolean> => {
        if (!window.electronAPI) {
            dispatch({ type: 'ADD_LOG', payload: { message: "File API not available in Browser environment.", type: 'error' } });
            return false;
        }

        let defaultPath = state.sessionFilePath;
        if (!defaultPath || isSaveAs) {
            // Suggest a location
            if (state.saveDirectoryPath) {
                try {
                    const sessionName = state.sessionName || 'New Session';
                    const sessionDir = await window.electronAPI.joinPath(state.saveDirectoryPath, 'Sessions', sessionName);
                    // Pre-create the folder so the Save Dialog can see it and open inside it
                    await window.electronAPI.createDir(sessionDir);
                    defaultPath = await window.electronAPI.joinPath(sessionDir, `${sessionName}.cds`);
                } catch (e) {
                    console.error("Path Prep Error:", e);
                    defaultPath = null;
                }
            }

            if (window.electronAPI.showSaveDialog) {
                const savePath = await window.electronAPI.showSaveDialog({
                    title: 'Save Cast Director Session',
                    defaultPath: defaultPath || undefined,
                    filters: [{ name: 'Session Files', extensions: ['cds'] }]
                });

                if (!savePath) return false; // Canceled
                defaultPath = savePath;
            } else {
                return false; // Not supported
            }
        }

        dispatch({ type: 'ADD_LOG', payload: { message: "Saving session...", type: 'info' } });

        try {
            // Export state
            const json = SessionService.exportSession(state);
            const dataArray = new TextEncoder().encode(json);

            const success = await window.electronAPI.writeFile(defaultPath, dataArray);
            if (success) {
                // Extract filename to use as session name
                const filename = defaultPath.split(/[/\\]/).pop()?.replace('.cds', '') || 'Saved Session';
                dispatch({ type: 'SET_SESSION_INFO', payload: { name: filename, path: defaultPath } });
                dispatch({ type: 'ADD_LOG', payload: { message: `Saved session: ${filename}`, type: 'success' } });
                return true;
            } else {
                dispatch({ type: 'ADD_LOG', payload: { message: "Failed to save session.", type: 'error' } });
                return false;
            }
        } catch (error: any) {
            console.error("Session Save Error:", error);
            dispatch({ type: 'ADD_LOG', payload: { message: `Save error: ${error.message || error}`, type: 'error' } });
            return false;
        }
    };

    const doOpen = async () => {
        try {
            if (!window.electronAPI || !window.electronAPI.showOpenDialog) return;

            let defaultPath = undefined;
            if (state.saveDirectoryPath) {
                defaultPath = await window.electronAPI.joinPath(state.saveDirectoryPath, 'Sessions');
                // Ensure root sessions folder exists for the Open dialog
                await window.electronAPI.createDir(defaultPath);
            }

            const filePaths = await window.electronAPI.showOpenDialog({
                title: 'Open Cast Director Session',
                defaultPath,
                filters: [{ name: 'Session Files', extensions: ['cds'] }],
                properties: ['openFile']
            });

            if (filePaths && filePaths.length > 0) {
                dispatch({ type: 'ADD_LOG', payload: { message: "Loading session...", type: 'info' } });
                const p = filePaths[0];
                const jsonText = await window.electronAPI!.readTextFile(p);
                if (jsonText) {
                    const loadedState = SessionService.parseSession(jsonText);
                    if (loadedState) {
                        dispatch({ type: 'LOAD_SESSION_STATE', payload: loadedState });
                        const filename = p.split(/[/\\]/).pop()?.replace('.cds', '') || 'Loaded Session';
                        dispatch({ type: 'SET_SESSION_INFO', payload: { name: filename, path: p } });
                        dispatch({ type: 'ADD_LOG', payload: { message: `Loaded session: ${filename}`, type: 'success' } });
                    } else {
                        dispatch({ type: 'ADD_LOG', payload: { message: "Failed to parse session file. File might be corrupted.", type: 'error' } });
                    }
                }
            }
        } catch (error: any) {
            console.error("Session Open Error:", error);
            dispatch({ type: 'ADD_LOG', payload: { message: `Open error: ${error.message || error}`, type: 'error' } });
        }
    };

    // Listen for internal Save-on-Close from AppCloseDialog
    useEffect(() => {
        const handleInternalSaveRequest = async () => {
            const success = await doSave();
            // If save was successful we confirm close. 
            // If they canceled the save dialog, we do NOT confirm close, keeping the app open.
            if (success && window.electronAPI?.confirmClose) {
                window.electronAPI.confirmClose();
            }
        };

        window.addEventListener('trigger-save-on-close', handleInternalSaveRequest);
        return () => window.removeEventListener('trigger-save-on-close', handleInternalSaveRequest);
    }, [doSave]);

    const handleMouseEnter = () => {
        if (closeTimeoutRef.current) {
            clearTimeout(closeTimeoutRef.current);
            closeTimeoutRef.current = null;
        }
    };

    const handleMouseLeave = () => {
        closeTimeoutRef.current = setTimeout(() => {
            setIsOpen(false);
        }, 250);
    };

    return (
        <>
            <button
                ref={triggerRef}
                onClick={() => setIsOpen(!isOpen)}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                className={`text-[11px] lg:text-[12px] font-semibold tracking-wide uppercase transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap px-3 py-1.5 ${isOpen ? 'text-white' : 'text-[#888] hover:text-white'} focus:outline-none`}
                style={{ backgroundColor: 'transparent', boxShadow: 'none' }}
                title="File Menu"
            >
                <File className="w-[15px] h-[15px] shrink-0" />
                <span className="hidden sm:inline">FILE</span>
            </button>

            {isOpen && window.document.body && createPortal(
                <div
                    ref={menuRef}
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={handleMouseLeave}
                    className="fixed z-[9999] w-56 bg-[#1a1a1c] border border-gray-700 rounded-md py-1 shadow-[0_10px_40px_rgba(0,0,0,0.5)]"
                    style={{ top: menuPosition.top, left: menuPosition.left }}
                >
                    <div className="px-3 py-1 mb-1 border-b border-gray-700/50">
                        <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">File</span>
                    </div>

                    <MenuButton icon={<FilePlus className="w-3.5 h-3.5" />} label="New Session" shortcut="Ctrl+N" onClick={() => {
                        setShowNewSessionConfirm(true);
                        setIsOpen(false);
                    }} />

                    <MenuButton icon={<FolderOpen className="w-3.5 h-3.5" />} label="Open Session..." shortcut="Ctrl+O" onClick={() => {
                        setShowOpenConfirm(true);
                        setIsOpen(false);
                    }} />

                    <div className="h-px bg-gray-700/50 my-1 mx-2" />

                    <MenuButton icon={<Save className="w-3.5 h-3.5" />} label="Save Session" shortcut="Ctrl+S" onClick={() => {
                        setIsOpen(false);
                        doSave(false);
                    }} />

                    <MenuButton icon={<SaveAll className="w-3.5 h-3.5" />} label="Save Session As..." shortcut="Ctrl+Shift+S" onClick={() => {
                        setIsOpen(false);
                        doSave(true);
                    }} />

                    <div className="h-px bg-gray-700/50 my-1 mx-2" />

                    <MenuButton icon={<BookOpen className="w-3.5 h-3.5 text-yellow-500" />} label="Help & Guides" onClick={() => {
                        setIsOpen(false);
                        dispatch({ type: 'SET_HELP_SECTION', payload: 'start' });
                        dispatch({ type: 'TOGGLE_HELP', payload: true });
                    }} />

                </div>,
                document.body
            )}

            {window.document.body && createPortal(
                <>
                    <ConfirmDialog
                        isOpen={showNewSessionConfirm}
                        onClose={() => setShowNewSessionConfirm(false)}
                        onConfirm={() => {
                            dispatch({ type: 'DISCARD_SESSION' });
                            dispatch({ type: 'ADD_LOG', payload: { message: "New session started", type: 'success' } });
                        }}
                        title="New Session"
                        message="Clear current session? Unsaved changes will be lost."
                        confirmText="Clear Session"
                        variant="danger"
                    />

                    <AnimatePresence>
                        {showOpenConfirm && (
                            <div className="fixed inset-0 z-[99999] bg-black/80 backdrop-blur-md flex items-center justify-center p-8">
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.9, y: 20 }}
                                    className="bg-[#111113] border border-white/10 rounded-3xl max-w-xl w-full relative overflow-hidden"
                                >
                                    <div className="h-1 w-full bg-blue-500" />
                                    <div className="p-8">
                                        <div className="flex items-center gap-4 mb-4">
                                            <FolderOpen className="w-6 h-6 text-blue-500" />
                                            <h3 className="text-xl font-black text-white uppercase tracking-wider">
                                                Open Session
                                            </h3>
                                        </div>
                                        <p className="text-gray-400 text-sm leading-relaxed mb-8">
                                            Do you want to save the current session before opening a new one? Unsaved changes will be lost.
                                        </p>
                                        <div className="flex flex-wrap items-center justify-end gap-2">
                                            <button
                                                onClick={() => setShowOpenConfirm(false)}
                                                className="flex-grow py-3 px-4 whitespace-nowrap rounded-xl text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500 hover:text-white hover:bg-white/5 transition-all"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                onClick={async () => {
                                                    setShowOpenConfirm(false);
                                                    doOpen();
                                                }}
                                                className="flex-grow py-3 px-4 whitespace-nowrap rounded-xl text-[10px] font-bold uppercase tracking-[0.2em] text-red-500 hover:text-white bg-red-500/10 hover:bg-red-500 border border-red-500/20 hover:border-red-500 transition-all"
                                            >
                                                Don't Save
                                            </button>
                                            <button
                                                onClick={async () => {
                                                    setShowOpenConfirm(false);
                                                    const saved = await doSave(false);
                                                    if (saved) doOpen();
                                                }}
                                                className="flex-grow py-3 px-4 whitespace-nowrap rounded-xl text-[10px] font-black uppercase tracking-[0.2em] text-blue-500 hover:text-white bg-blue-500/10 hover:bg-blue-500 border border-blue-500/20 transition-all"
                                            >
                                                Save & Open
                                            </button>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setShowOpenConfirm(false)}
                                        className="absolute top-4 right-4 text-gray-600 hover:text-white transition-colors"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </motion.div>
                            </div>
                        )}
                    </AnimatePresence>
                </>,
                window.document.body
            )}
        </>
    );
};

const MenuButton = ({ icon, label, shortcut, onClick }: { icon: React.ReactNode, label: string, shortcut?: string, onClick: () => void }) => (
    <button
        className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-gray-300 hover:bg-blue-600 hover:text-white transition-colors group"
        onClick={onClick}
    >
        <div className="flex items-center gap-2">
            <span className="text-gray-500 group-hover:text-blue-200">{icon}</span>
            <span>{label}</span>
        </div>
        {shortcut && <span className="text-[10px] text-gray-500 group-hover:text-blue-200/70">{shortcut}</span>}
    </button>
);
