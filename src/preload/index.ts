import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
    selectFolder: () => ipcRenderer.invoke('dialog:openDirectory'),
    readFile: (path: string) => ipcRenderer.invoke('file:read', path),
    writeFile: (path: string, buffer: ArrayBuffer) => ipcRenderer.invoke('file:write', path, buffer),
    exists: (path: string) => ipcRenderer.invoke('file:exists', path),
    listFiles: (path: string) => ipcRenderer.invoke('file:list', path),
    createDir: (path: string) => ipcRenderer.invoke('dir:create', path),
    joinPath: (...args: string[]) => ipcRenderer.invoke('path:join', ...args)
});
