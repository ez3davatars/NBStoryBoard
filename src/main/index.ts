import electron from 'electron';
const { app, shell, BrowserWindow, ipcMain, dialog } = electron;
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';

let isQuitting = false;

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    autoHideMenuBar: true,
    icon: join(__dirname, '../../resources/icon.ico'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('close', (e) => {
    if (isQuitting) return; // Allow natural close

    // Tell renderer that app is trying to close, so it shows the custom UI prompt.
    e.preventDefault();
    mainWindow.webContents.send('request-app-close');
  });

  // Listen for the renderer to say it has finished cleanup/saving
  ipcMain.on('confirm-discard-session', () => {
    isQuitting = true;
    app.quit();
  });
  ipcMain.on('confirm-close', () => {
    isQuitting = true;
    app.quit();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.nanobanana.studio');

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // Enable SharedArrayBuffer for @imgly
  const { session } = electron;
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp'
      }
    });
  });

  createWindow();

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Native File System Handlers
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

ipcMain.handle('dialog:openDirectory', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  if (canceled) {
    return null;
  } else {
    return filePaths[0];
  }
});

ipcMain.handle('dialog:showSaveDialog', async (_event, options) => {
  const result = await dialog.showSaveDialog(options);
  if (result.canceled) {
    return null;
  }
  return result.filePath;
});

ipcMain.handle('dialog:showOpenDialog', async (_event, options) => {
  const result = await dialog.showOpenDialog(options);
  if (result.canceled) {
    return null;
  }
  return result.filePaths;
});

ipcMain.handle('file:read', async (_event, filePath) => {
  try {
    const content = await fs.readFile(filePath);
    return content.toString('base64');
  } catch (error) {
    console.error("Read Error:", error);
    return null;
  }
});

ipcMain.handle('file:write', async (_event, filePath, buffer) => {
  try {
    // Ensure directory exists
    const dirname = path.dirname(filePath);
    await fs.mkdir(dirname, { recursive: true });

    await fs.writeFile(filePath, Buffer.from(buffer));
    return true;
  } catch (error) {
    console.error("Write Error:", error);
    return false;
  }
});

ipcMain.handle('dir:create', async (_event, dirPath) => {
  try {
    await fs.mkdir(dirPath, { recursive: true });
    return true;
  } catch (error) {
    console.error("Create Dir Error:", error);
    return false;
  }
});

ipcMain.handle('file:exists', async (_event, filePath) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('file:delete', async (_event, filePath) => {
  try {
    await fs.unlink(filePath);
    return true;
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      console.error("Delete Error:", error);
    }
    return false;
  }
});

ipcMain.handle('file:list', async (_event, folderPath) => {
  try {
    const entries = await fs.readdir(folderPath, { withFileTypes: true });
    return entries
      .filter(e => e.isFile() && /\.(png|jpg|jpeg)$/i.test(e.name)) // Simple filter
      .map(e => e.name);
  } catch {
    return [];
  }
});

ipcMain.handle('path:join', async (_event, ...args: string[]) => {
  return path.join(...args);
});

ipcMain.handle('file:hash', async (_event, filePath: string) => {
  try {
    const buffer = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(buffer).digest('hex');
  } catch (error) {
    console.error("Hash Error:", error);
    return null;
  }
});

ipcMain.handle('depth:generate', async (_event, input: string) => {
  let inputPath = input;
  let isTemp = false;
  let inputBuffer: Buffer;

  try {
    // Handle Data URL input (from Gemini or browser upload)
    if (input.startsWith('data:')) {
      const mimeType = input.substring(input.indexOf(':') + 1, input.indexOf(';'));
      const ext = mimeType.split('/')[1] || 'png';
      const b64Data = input.split('base64,')[1];
      inputBuffer = Buffer.from(b64Data, 'base64');

      const tempDir = path.join(app.getPath('userData'), 'depth_temp');
      await fs.mkdir(tempDir, { recursive: true });

      inputPath = path.join(tempDir, `input_${Date.now()}.${ext}`);
      await fs.writeFile(inputPath, inputBuffer);
      isTemp = true;
      console.log(`[IPC] Saved Data URL to temp path: ${inputPath}`);
    } else {
      inputBuffer = await fs.readFile(inputPath);
    }

    // 1. Compute Source Background Hash for Binding Invariant
    const sourceHash = crypto.createHash('sha256').update(inputBuffer).digest('hex');

    // Determine output paths
    const ext = path.extname(inputPath);
    const outputPath = inputPath.replace(ext, `_depth.png`);
    const metaPath = inputPath.replace(ext, `_depth.json`);

    // IPC AUTHORITY GATE: Check for Binding Violation
    try {
      const metaExists = await fs.access(metaPath).then(() => true).catch(() => false);
      if (metaExists) {
        const metaRaw = await fs.readFile(metaPath, 'utf-8');
        const meta = JSON.parse(metaRaw);

        if (meta.sourceHash !== sourceHash) {
          console.warn(`[IPC] GEOMETRIC BINDING VIOLATION detected. Background changed. Invalidating depth map: ${outputPath}`);
          // Force regeneration by deleting old files
          await fs.chmod(outputPath, 0o666).catch(() => { });
          await fs.chmod(metaPath, 0o666).catch(() => { });
          await fs.unlink(outputPath).catch(() => { });
          await fs.unlink(metaPath).catch(() => { });
        } else {
          console.log(`[IPC] Valid depth binding found for source: ${sourceHash}. Returning cached result.`);
          const outputBuffer = await fs.readFile(outputPath);
          const dataUrl = `data:image/png;base64,${outputBuffer.toString('base64')}`;

          // Cleanup current temp input if cached but was temp
          if (isTemp) await fs.unlink(inputPath).catch(() => { });

          return { dataUrl, hash: meta.depthHash, sourceHash };
        }
      }
    } catch (e) {
      console.error("[IPC] Binding check failed, proceeding to full regeneration.", e);
    }

    return new Promise((resolve, reject) => {
      // Path to the python script
      const scriptPath = is.dev
        ? path.join(app.getAppPath(), 'scripts', 'depth_inference.py')
        : path.join(process.resourcesPath, 'scripts', 'depth_inference.py');

      console.log(`[IPC] Triggering depth generation for: ${inputPath}`);

      // Always prefer the active virtual environment Python
      const pythonPath = process.env.VIRTUAL_ENV
        ? path.join(process.env.VIRTUAL_ENV, 'Scripts', 'python.exe')
        : 'python';

      console.log(`[IPC] Using Python interpreter: ${pythonPath}`);

      const pythonProcess = spawn(pythonPath, [
        scriptPath,
        '--input',
        inputPath,
        '--output',
        outputPath
      ]);


      let errorData = '';
      let stdoutData = '';

      pythonProcess.stdout.on('data', (data) => {
        stdoutData += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        errorData += data.toString();
      });

      pythonProcess.on('close', async (code) => {
        if (code === 0) {
          console.log(`[IPC] Depth Generation Success: ${stdoutData}`);

          try {
            const outputBuffer = await fs.readFile(outputPath);

            // 1. Calculate SHA-256 Hash for Depth Integrity
            const depthHash = crypto.createHash('sha256').update(outputBuffer).digest('hex');

            // 2. Save Sidecar Metadata for Binding Invariant
            const metadata = {
              sourceHash,
              depthHash,
              timestamp: Date.now()
            };
            await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2));

            // 3. Set files to Read-Only at OS level (0o444)
            await fs.chmod(outputPath, 0o444);
            await fs.chmod(metaPath, 0o444);
            console.log(`[IPC] Depth Map & Metadata marked as READ-ONLY: ${outputPath}`);

            const dataUrl = `data:image/png;base64,${outputBuffer.toString('base64')}`;

            // Cleanup temp files if they were created
            if (isTemp) {
              await fs.unlink(inputPath).catch(() => { });
              // Note: outputPath is read-only, we might need to chmod back to delete it in temp dir
              await fs.chmod(outputPath, 0o666).catch(() => { });
              await fs.chmod(metaPath, 0o666).catch(() => { });
              await fs.unlink(outputPath).catch(() => { });
              await fs.unlink(metaPath).catch(() => { });
            }

            resolve({ dataUrl, hash: depthHash, sourceHash });
          } catch (readErr) {
            reject(new Error(`Failed to process generated depth map: ${readErr}`));
          }
        } else {
          console.error(`[IPC] Depth Generation Failed Code ${code}:`, errorData);
          reject(new Error(`Depth generation failed (Code ${code}): ${errorData}`));
        }
      });

      pythonProcess.on('error', (err) => {
        console.error("[IPC] Failed to spawn Python process:", err);
        reject(new Error(`Failed to start Python inference. Ensure 'python' is in PATH.`));
      });
    });
  } catch (err: any) {
    console.error("[IPC] Depth Generation Error:", err);
    throw err;
  }
});

