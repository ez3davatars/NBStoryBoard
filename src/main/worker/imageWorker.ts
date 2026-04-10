import { app, ipcMain } from 'electron';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';
import { ChildProcess, spawn as spawnProcess } from 'child_process';
import { existsSync } from 'fs';

let isWorkerQuitting = false;
let imageWorkerProcess: ChildProcess | null = null;
let cleanupWorkerProcess: ChildProcess | null = null;
let imageWorkerStatus: 'stopped' | 'starting' | 'online' | 'error' | 'disabled' = 'stopped';
let imageWorkerLastError: string | null = null;
let imageWorkerStartedAt: number | null = null;
let imageWorkerRestartAttempts = 0;

let cleanupWorkerStatus: 'stopped' | 'starting' | 'online' | 'error' | 'disabled' = 'stopped';
let cleanupWorkerLastError: string | null = null;
let cleanupWorkerStartedAt: number | null = null;
let cleanupWorkerRestartAttempts = 0;

const MAX_IMAGE_WORKER_RESTARTS = 3;
const MAX_CLEANUP_WORKER_RESTARTS = 3;

export function setImageWorkerQuitting(quitting: boolean) {
  isWorkerQuitting = quitting;
}

export function getImageWorkerStatus() {
  return {
    imageWorker: {
      status: imageWorkerStatus,
      lastError: imageWorkerLastError,
      startedAt: imageWorkerStartedAt,
      pid: imageWorkerProcess?.pid ?? null
    },
    cleanupWorker: {
      status: cleanupWorkerStatus,
      lastError: cleanupWorkerLastError,
      startedAt: cleanupWorkerStartedAt,
      pid: cleanupWorkerProcess?.pid ?? null
    }
  };
}

function hasHostedWorkerEnv(): boolean {
  const env = process.env;
  if (!env.SUPABASE_SECRET_KEY || 
      !env.GEMINI_API_KEY || 
      !env.R2_ACCOUNT_ID || 
      !env.R2_ACCESS_KEY_ID || 
      !env.R2_SECRET_ACCESS_KEY || 
      !env.R2_BUCKET_NAME) {
    return false;
  }
  return true;
}

export function startImageWorker(): void {
  if (imageWorkerProcess && !imageWorkerProcess.killed) return;

  if (!hasHostedWorkerEnv()) {
    imageWorkerStatus = 'disabled';
    imageWorkerLastError = 'Hosted worker disabled: Missing one or more required environment variables (SUPABASE_SECRET_KEY, GEMINI_API_KEY, R2_ACCOUNT_ID, etc).';
    console.warn(`[ImageWorker] ${imageWorkerLastError}`);
    return;
  }

  imageWorkerStatus = 'starting';
  imageWorkerLastError = null;
  cleanupWorkerStatus = 'starting';
  cleanupWorkerLastError = null;

  if (is.dev) {
    const tsNodePath = join(app.getAppPath(), 'node_modules', 'ts-node', 'dist', 'bin.js');
    const workerScriptPath = join(app.getAppPath(), 'supabase', 'workers', 'image-processor', 'index.ts');
    const cleanupScriptPath = join(app.getAppPath(), 'supabase', 'workers', 'cleanup-cron', 'index.ts');

    if (!existsSync(tsNodePath)) {
      imageWorkerStatus = 'error';
      cleanupWorkerStatus = 'error';
      imageWorkerLastError = `Local dev dependency 'ts-node' not found at ${tsNodePath}. Run 'npm install -D ts-node' to enable the hosted background worker.`;
      cleanupWorkerLastError = imageWorkerLastError;
      console.error(`[HostedWorkers] ${imageWorkerLastError}`);
      return;
    }

    imageWorkerProcess = spawnProcess(process.execPath, [tsNodePath, workerScriptPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
    });

    cleanupWorkerProcess = spawnProcess(process.execPath, [tsNodePath, cleanupScriptPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
    });

    // Cleanup IO
    if (cleanupWorkerProcess.stdout) {
      cleanupWorkerProcess.stdout.on('data', data => {
        const output = data.toString();
        if (output.includes('Booted')) {
          cleanupWorkerStatus = 'online';
          cleanupWorkerStartedAt = Date.now();
          cleanupWorkerRestartAttempts = 0;
        }
        console.log(`[CleanupWorker] ${output.trim()}`);
      });
    }
    if (cleanupWorkerProcess.stderr) {
      cleanupWorkerProcess.stderr.on('data', data => {
        const output = data.toString();
        console.error(`[CleanupWorker:Err] ${output.trim()}`);
        cleanupWorkerLastError = (cleanupWorkerLastError || '') + output;
      });
    }

  } else {
    imageWorkerStatus = 'error';
    imageWorkerLastError = 'Hosted image worker production packaging is not wired yet.';
    
    // Explicitly un-couple cleanup cron dependency in prod
    cleanupWorkerStatus = 'disabled';
    cleanupWorkerLastError = 'Production expiry uses Supabase scheduled Edge Function (r2-expiry-cleanup). Electron cleanup is Dev-only.';
    
    return;
  }

  if (imageWorkerProcess.stdout) {
    imageWorkerProcess.stdout.on('data', (data) => {
      const output = data.toString();
      if (output.includes('Booted & listening for generation jobs')) {
        imageWorkerStatus = 'online';
        imageWorkerStartedAt = Date.now();
        imageWorkerRestartAttempts = 0;
        console.log('[ImageWorker] Worker is online.');
      }
    });
  }

  if (imageWorkerProcess.stderr) {
    imageWorkerProcess.stderr.on('data', (data) => {
      const output = data.toString();
      console.error(`[ImageWorker:Err] ${output}`);
      imageWorkerLastError = (imageWorkerLastError || '') + output;
    });
  }

  imageWorkerProcess.on('exit', (code, signal) => {
    imageWorkerProcess = null;
    if (isWorkerQuitting) {
      imageWorkerStatus = 'stopped';
      return;
    }

    imageWorkerStatus = 'error';
    imageWorkerLastError = imageWorkerLastError || `Process exited with code ${code} and signal ${signal}`;

    if (imageWorkerRestartAttempts < MAX_IMAGE_WORKER_RESTARTS) {
      imageWorkerRestartAttempts++;
      console.log(`[ImageWorker] Restarting worker... Attempt ${imageWorkerRestartAttempts}/${MAX_IMAGE_WORKER_RESTARTS}`);
      setTimeout(() => {
        startImageWorker(); // Restarts both for now since function is coupled
      }, 1500);
    } else {
      console.error('[ImageWorker] Max restart attempts reached. Giving up.');
    }
  });

  cleanupWorkerProcess.on('exit', (code, signal) => {
    cleanupWorkerProcess = null;
    if (isWorkerQuitting) {
      cleanupWorkerStatus = 'stopped';
      return;
    }

    cleanupWorkerStatus = 'error';
    cleanupWorkerLastError = cleanupWorkerLastError || `Process exited with code ${code} and signal ${signal}`;

    if (cleanupWorkerRestartAttempts < MAX_CLEANUP_WORKER_RESTARTS) {
      cleanupWorkerRestartAttempts++;
      console.log(`[CleanupWorker] Restarting worker... Attempt ${cleanupWorkerRestartAttempts}/${MAX_CLEANUP_WORKER_RESTARTS}`);
      setTimeout(() => {
        startImageWorker(); // Couples restarts for now but isolated limits prevent runaway chains
      }, 1500);
    } else {
      console.error('[CleanupWorker] Max restart attempts reached. Giving up.');
    }
  });
}

export function stopImageWorker(): void {
  if (imageWorkerProcess && !imageWorkerProcess.killed) {
    imageWorkerProcess.kill();
  }
  if (cleanupWorkerProcess && !cleanupWorkerProcess.killed) {
    cleanupWorkerProcess.kill();
  }
  imageWorkerProcess = null;
  cleanupWorkerProcess = null;
  imageWorkerStatus = 'stopped';
  cleanupWorkerStatus = 'stopped';
}

export function restartImageWorker() {
  stopImageWorker();
  imageWorkerRestartAttempts = 0;
  startImageWorker();
  return getImageWorkerStatus();
}

let workerIpcRegistered = false;

export function registerWorkerIpcHandlers(): void {
  if (workerIpcRegistered) return;
  workerIpcRegistered = true;

  ipcMain.handle('worker:getStatus', async () => getImageWorkerStatus());

  ipcMain.handle('worker:restart', async () => restartImageWorker());
}
