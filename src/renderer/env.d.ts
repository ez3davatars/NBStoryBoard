/// <reference types="vite/client" />
/// <reference types="vite-plugin-svgr/client" />
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

interface ImportMetaEnv {
  readonly VITE_APP_ENV?: 'dev' | 'prod' | 'staging';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
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
  onRequestDiscardSession?: (callback: () => void) => void;
  confirmDiscardSession?: () => void;
  onRequestAppClose?: (callback: () => void) => void;
  confirmClose?: () => void;
  showSaveDialog?: (options: any) => Promise<string | null>;
  showOpenDialog?: (options: any) => Promise<string[] | null>;
  deleteFile?: (path: string) => Promise<boolean>;
  renameFile?: (oldPath: string, newPath: string) => Promise<boolean>;
}

interface Window {
  electronAPI?: ElectronAPI;
}
