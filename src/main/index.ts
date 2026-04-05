import electron from 'electron';
const { app, shell, BrowserWindow, ipcMain } = electron;
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import { config as dotenvConfig } from 'dotenv';
import { startImageWorker, stopImageWorker, registerWorkerIpcHandlers, setImageWorkerQuitting } from './worker/imageWorker';
import { registerFileIpcHandlers } from './ipc/fileIpc';
import { registerDepthIpcHandlers } from './ipc/depthIpc';

dotenvConfig({ path: join(__dirname, '../../.env') });

let isQuitting = false;

let appCloseIpcRegistered = false;

function registerAppCloseIpcHandlers(): void {
  if (appCloseIpcRegistered) return;
  appCloseIpcRegistered = true;

  ipcMain.on('confirm-discard-session', () => {
    isQuitting = true;
    setImageWorkerQuitting(true);
    app.quit();
  });

  ipcMain.on('confirm-close', () => {
    isQuitting = true;
    setImageWorkerQuitting(true);
    app.quit();
  });
}

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

  registerWorkerIpcHandlers();
  registerAppCloseIpcHandlers();
  registerFileIpcHandlers();
  registerDepthIpcHandlers();
  
  createWindow();
  startImageWorker();

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

app.on('before-quit', () => {
  isQuitting = true;
  setImageWorkerQuitting(true);
  stopImageWorker();
});
