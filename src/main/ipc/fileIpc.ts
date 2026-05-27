import { ipcMain, dialog, app } from 'electron';
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
      if ((error as { code?: string }).code !== 'ENOENT') {
        console.error("Delete Error:", error);
      }
      return false;
    }
  });

  ipcMain.handle('file:deleteLibraryPackageFolder', async (_event, packageFolderPath: string) => {
    try {
      const resolvedPath = path.resolve(packageFolderPath);
      const normalizedPath = path.normalize(resolvedPath);
      
      // 1. Check resolved path is inside Library/ProductionActors
      const includesProductionActors = normalizedPath.includes(path.join('Library', 'ProductionActors')) || normalizedPath.includes('ProductionActors');
      if (!includesProductionActors) {
        console.warn("[IPC deleteLibraryPackageFolder] Safe check failed: Path must be inside Library/ProductionActors.", packageFolderPath);
        return false;
      }

      // 2. Check path is a directory
      let isDirectory = false;
      try {
        const stats = await fs.stat(normalizedPath);
        isDirectory = stats.isDirectory();
      } catch (e) {
        console.warn("[IPC deleteLibraryPackageFolder] Path is not a valid directory or accessible:", packageFolderPath);
        return false;
      }
      if (!isDirectory) {
        console.warn("[IPC deleteLibraryPackageFolder] Path is not a directory:", packageFolderPath);
        return false;
      }

      // 3. Check actor.json exists inside the folder OR folder is listed in library-index.json
      const actorJsonPath = path.join(normalizedPath, 'actor.json');
      let actorJsonExists = false;
      try {
        await fs.access(actorJsonPath);
        actorJsonExists = true;
      } catch {}

      let isFolderInIndex = false;
      try {
        // library-index.json lies two directories up (Library/library-index.json)
        const libraryIndexPath = path.join(normalizedPath, '..', '..', 'library-index.json');
        const indexText = await fs.readFile(libraryIndexPath, 'utf-8');
        if (indexText) {
          const parsed = JSON.parse(indexText);
          if (parsed && Array.isArray(parsed.assets)) {
            const folderBaseName = path.basename(normalizedPath);
            isFolderInIndex = parsed.assets.some((a: any) => 
              a.folder === `ProductionActors/${folderBaseName}` || 
              a.folder?.includes(folderBaseName)
            );
          }
        }
      } catch (e) {
        // Safe check error logging
      }

      if (!actorJsonExists && !isFolderInIndex) {
        console.warn("[IPC deleteLibraryPackageFolder] Safe check failed: neither actor.json exists nor is directory listed in library-index.json.", packageFolderPath);
        return false;
      }

      // Execute safe recursive deletion
      await fs.rm(normalizedPath, { recursive: true, force: true });
      return true;
    } catch (error) {
      console.error("[IPC deleteLibraryPackageFolder] Error deleting folder:", error);
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

  // --- RECENT GENERATIONS CACHE ---

  ipcMain.handle('app:getRecentGenerationsPath', async () => {
    try {
      const cachePath = path.join(app.getPath('userData'), 'Recent Generations');
      await fs.mkdir(cachePath, { recursive: true });
      return cachePath;
    } catch (error) {
      console.error('getRecentGenerationsPath Error:', error);
      return null;
    }
  });

  ipcMain.handle('app:cleanupRecentGenerations', async (_event, olderThanDays?: number) => {
    const retentionDays = typeof olderThanDays === 'number' && olderThanDays > 0 ? olderThanDays : 30;
    const cachePath = path.join(app.getPath('userData'), 'Recent Generations');
    let deletedCount = 0;

    try {
      const resolvedCache = path.resolve(cachePath);
      const entries = await fs.readdir(resolvedCache, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = path.join(resolvedCache, entry.name);

        if (entry.isDirectory()) {
          try {
            const subEntries = await fs.readdir(entryPath, { withFileTypes: true });
            for (const sub of subEntries) {
              if (!sub.isFile()) continue;
              const filePath = path.join(entryPath, sub.name);
              try {
                const stat = await fs.stat(filePath);
                const ageMs = Date.now() - stat.mtimeMs;
                const ageDays = ageMs / (1000 * 60 * 60 * 24);
                if (ageDays > retentionDays) {
                  await fs.unlink(filePath);
                  deletedCount++;
                }
              } catch {
                // Skip files we can't stat/delete
              }
            }
          } catch {
            // Skip directories we can't read
          }
        } else if (entry.isFile()) {
          try {
            const stat = await fs.stat(entryPath);
            const ageMs = Date.now() - stat.mtimeMs;
            const ageDays = ageMs / (1000 * 60 * 60 * 24);
            if (ageDays > retentionDays) {
              await fs.unlink(entryPath);
              deletedCount++;
            }
          } catch {
            // Skip files we can't stat/delete
          }
        }
      }

      return { success: true, deletedCount };
    } catch (error) {
      console.error('cleanupRecentGenerations Error:', error);
      return { success: false, deletedCount };
    }
  });
}
