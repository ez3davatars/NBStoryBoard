import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
    selectFolder: () => ipcRenderer.invoke('dialog:openDirectory'),
    readFile: (path: string) => ipcRenderer.invoke('file:read', path),
    readTextFile: (path: string) => ipcRenderer.invoke('file:readText', path),
    writeFile: (path: string, buffer: Uint8Array) => ipcRenderer.invoke('file:write', path, buffer),
    exists: (path: string) => ipcRenderer.invoke('file:exists', path),
    listFiles: (path: string) => ipcRenderer.invoke('file:list', path),
    createDir: (path: string) => ipcRenderer.invoke('dir:create', path),
    joinPath: (...args: string[]) => ipcRenderer.invoke('path:join', ...args),
    hashFile: (path: string) => ipcRenderer.invoke('file:hash', path),
    generateDepth: (inputPath: string) => ipcRenderer.invoke('depth:generate', inputPath),
    onRequestDiscardSession: (callback: () => void) => {
        ipcRenderer.on('request-discard-session', () => callback());
    },
    confirmDiscardSession: () => ipcRenderer.send('confirm-discard-session'),
    onRequestAppClose: (callback: () => void) => {
        ipcRenderer.on('request-app-close', () => callback());
    },
    confirmClose: () => ipcRenderer.send('confirm-close'),
    showSaveDialog: (options: any) => ipcRenderer.invoke('dialog:showSaveDialog', options),
    showOpenDialog: (options: any) => ipcRenderer.invoke('dialog:showOpenDialog', options),
    deleteFile: (path: string) => ipcRenderer.invoke('file:delete', path),
    renameFile: (oldPath: string, newPath: string) => ipcRenderer.invoke('file:rename', oldPath, newPath),
    getWorkerStatus: () => ipcRenderer.invoke('worker:getStatus'),
    restartWorker: () => ipcRenderer.invoke('worker:restart')
});
