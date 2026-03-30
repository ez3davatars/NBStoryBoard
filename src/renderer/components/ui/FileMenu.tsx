import React, { useState, useRef, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import { SessionService } from '../../services/SessionService';
import { File, Save, FolderOpen, FilePlus, SaveAll, BookOpen } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';

export const FileMenu = () => {
    const { state, dispatch } = useAppContext();
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const [showNewSessionConfirm, setShowNewSessionConfirm] = useState(false);
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
                    dispatch({ type: 'ADD_LOG', payload: { message: "Failed to parse session file.", type: 'error' } });
                }
            }
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
                className={`px-2 lg:px-3 py-1.5 rounded text-[10px] lg:text-xs font-bold uppercase transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${isOpen ? 'bg-[#27272a] text-white ' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'} focus:outline-none`}
                title="File Menu"
            >
                <File className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline">FILE</span>
            </button>

            {isOpen && (
                <div
                    ref={menuRef}
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={handleMouseLeave}
                    className="fixed z-[9999] w-56 bg-[#1a1a1c] border border-gray-700 rounded-md py-1"
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
                        setIsOpen(false);
                        doOpen();
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

                </div>
            )}

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
