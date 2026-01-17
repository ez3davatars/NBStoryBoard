// src/renderer/config.ts
export const config = {
  appEnv: (import.meta.env.VITE_APP_ENV as string) ?? 'prod',
};
