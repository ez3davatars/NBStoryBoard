import electron from 'electron';
const { app, shell, BrowserWindow } = electron;
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';

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
import { ipcMain, dialog } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';

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

