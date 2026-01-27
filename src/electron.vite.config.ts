import { resolve } from 'path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

import svgr from 'vite-plugin-svgr';

const projectRoot = resolve(__dirname, '..');

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(projectRoot, 'src/main/index.ts')
        }
      },
      outDir: resolve(projectRoot, 'out/main')
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(projectRoot, 'src/preload/index.ts')
        }
      },
      outDir: resolve(projectRoot, 'out/preload')
    }
  },
  renderer: {
    base: './',
    root: resolve(projectRoot, 'src/renderer'),
    resolve: {
      alias: {
        '@renderer': resolve(projectRoot, 'src')
      }
    },
    plugins: [react(), tailwindcss(), svgr()],
    build: {
      outDir: resolve(projectRoot, 'out/renderer')
    },
    publicDir: resolve(projectRoot, 'public')
  }
});
