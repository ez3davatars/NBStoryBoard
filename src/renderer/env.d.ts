/// <reference types="vite/client" />
/// <reference types="vite-plugin-svgr/client" />
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

declare global {
  interface ImportMetaEnv {
    readonly VITE_APP_ENV?: 'dev' | 'prod' | 'staging';
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }

  interface DialogFilter {
    name: string;
    extensions: string[];
  }

  interface SaveDialogOptions {
    title?: string;
    defaultPath?: string;
    filters?: DialogFilter[];
  }

  interface OpenDialogOptions extends SaveDialogOptions {
    properties?: string[];
  }
}

declare module '*.png' {
  const value: string;
  export default value;
}

declare module '*.jpg' {
  const value: string;
  export default value;
}

declare module '*.jpeg' {
  const value: string;
  export default value;
}

declare module '*.svg' {
  const value: string;
  export default value;
}

declare global {
  interface ElectronAPI {
    selectFolder: () => Promise<string | null>;
    readFile: (path: string) => Promise<string | null>; // Returns base64 string
    readTextFile: (path: string) => Promise<string | null>; // Returns utf-8 string
    writeFile: (path: string, buffer: Uint8Array) => Promise<boolean>;
    exists: (path: string) => Promise<boolean>;
    listFiles: (path: string) => Promise<string[]>;
    createDir: (path: string) => Promise<boolean>;
    joinPath: (...args: string[]) => Promise<string>;
    hashFile: (path: string) => Promise<string | null>;
    generateDepth: (inputPath: string) => Promise<{ dataUrl: string; hash: string; sourceHash: string }>;
    onRequestDiscardSession?: (callback: () => void) => void;
    confirmDiscardSession?: () => void;
    onRequestAppClose?: (callback: () => void) => void;
    confirmClose?: () => void;
    openExternal?: (url: string) => Promise<boolean>;
    showSaveDialog?: (options: SaveDialogOptions) => Promise<string | null>;
    showOpenDialog?: (options: OpenDialogOptions) => Promise<string[] | null>;
    deleteFile?: (path: string) => Promise<boolean>;
    renameFile?: (oldPath: string, newPath: string) => Promise<boolean>;
    getWorkerStatus?: () => Promise<{
      imageWorker: { status: string; lastError?: string | null; startedAt?: number | null; pid?: number | null };
      cleanupWorker: { status: string; lastError?: string | null; startedAt?: number | null; pid?: number | null };
    }>;
    restartWorker?: () => Promise<{
      imageWorker: { status: string; lastError?: string | null; startedAt?: number | null; pid?: number | null };
      cleanupWorker: { status: string; lastError?: string | null; startedAt?: number | null; pid?: number | null };
    }>;
    // --- Recent Generations Cache ---
    getRecentGenerationsPath?: () => Promise<string | null>;
    cleanupRecentGenerations?: (olderThanDays?: number) => Promise<{ success: boolean; deletedCount: number }>;
  }

  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
