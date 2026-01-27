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
