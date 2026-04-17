import { ipcMain, dialog } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

let fileIpcRegistered = false;

export function registerFileIpcHandlers() {
  if (fileIpcRegistered) return;
  fileIpcRegistered = true;

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

  ipcMain.handle('file:readText', async (_event, filePath) => {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      console.error("Read Text Error:", error);
      return null;
    }
  });

  ipcMain.handle('file:write', async (_event, filePath, buffer) => {
    try {
      console.log(`[IPC file:write] Start writing to: ${filePath}`);
      console.log(`[IPC file:write] Buffer type: ${typeof buffer}, isBuffer: ${Buffer.isBuffer(buffer)}, byteLength: ${buffer?.byteLength}`);
      // Ensure directory exists
      const dirname = path.dirname(filePath);
      await fs.mkdir(dirname, { recursive: true });

      await fs.writeFile(filePath, Buffer.from(buffer));
      console.log(`[IPC file:write] Write successful`);
      return true;
    } catch (error) {
      console.error("[IPC file:write] Write Error:", error);
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
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error("Delete Error:", error);
      }
      return false;
    }
  });

  ipcMain.handle('file:rename', async (_event, oldPath: string, newPath: string) => {
    try {
      const dirname = path.dirname(newPath);
      await fs.mkdir(dirname, { recursive: true });
      await fs.rename(oldPath, newPath);
      return true;
    } catch (error) {
      console.error("Rename Error:", error);
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
}
