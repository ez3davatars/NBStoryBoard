import { app, ipcMain } from 'electron';
import { is } from '@electron-toolkit/utils';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

let depthIpcRegistered = false;

export function registerDepthIpcHandlers() {
  if (depthIpcRegistered) return;
  depthIpcRegistered = true;

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
    } catch (err: unknown) {
      console.error("[IPC] Depth Generation Error:", err);
      throw err instanceof Error ? err : new Error(String(err));
    }
  });
}
