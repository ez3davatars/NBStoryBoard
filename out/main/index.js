"use strict";
const electron = require("electron");
const path = require("path");
const child_process = require("child_process");
const fs = require("fs/promises");
const crypto = require("crypto");
function _interopNamespaceDefault(e) {
  const n = Object.create(null, { [Symbol.toStringTag]: { value: "Module" } });
  if (e) {
    for (const k in e) {
      if (k !== "default") {
        const d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: () => e[k]
        });
      }
    }
  }
  n.default = e;
  return Object.freeze(n);
}
const path__namespace = /* @__PURE__ */ _interopNamespaceDefault(path);
const fs__namespace = /* @__PURE__ */ _interopNamespaceDefault(fs);
const crypto__namespace = /* @__PURE__ */ _interopNamespaceDefault(crypto);
const is = {
  dev: !electron.app.isPackaged
};
const platform = {
  isWindows: process.platform === "win32",
  isMacOS: process.platform === "darwin",
  isLinux: process.platform === "linux"
};
const electronApp = {
  setAppUserModelId(id) {
    if (platform.isWindows)
      electron.app.setAppUserModelId(is.dev ? process.execPath : id);
  },
  setAutoLaunch(auto) {
    if (platform.isLinux)
      return false;
    const isOpenAtLogin = () => {
      return electron.app.getLoginItemSettings().openAtLogin;
    };
    if (isOpenAtLogin() !== auto) {
      electron.app.setLoginItemSettings({ openAtLogin: auto });
      return isOpenAtLogin() === auto;
    } else {
      return true;
    }
  },
  skipProxy() {
    return electron.session.defaultSession.setProxy({ mode: "direct" });
  }
};
const optimizer = {
  watchWindowShortcuts(window, shortcutOptions) {
    if (!window)
      return;
    const { webContents } = window;
    const { escToCloseWindow = false, zoom = false } = shortcutOptions || {};
    webContents.on("before-input-event", (event, input) => {
      if (input.type === "keyDown") {
        if (!is.dev) {
          if (input.code === "KeyR" && (input.control || input.meta))
            event.preventDefault();
          if (input.code === "KeyI" && (input.alt && input.meta || input.control && input.shift)) {
            event.preventDefault();
          }
        } else {
          if (input.code === "F12") {
            if (webContents.isDevToolsOpened()) {
              webContents.closeDevTools();
            } else {
              webContents.openDevTools({ mode: "undocked" });
              console.log("Open dev tool...");
            }
          }
        }
        if (escToCloseWindow) {
          if (input.code === "Escape" && input.key !== "Process") {
            window.close();
            event.preventDefault();
          }
        }
        if (!zoom) {
          if (input.code === "Minus" && (input.control || input.meta))
            event.preventDefault();
          if (input.code === "Equal" && input.shift && (input.control || input.meta))
            event.preventDefault();
        }
      }
    });
  },
  registerFramelessWindowIpc() {
    electron.ipcMain.on("win:invoke", (event, action) => {
      const win = electron.BrowserWindow.fromWebContents(event.sender);
      if (win) {
        if (action === "show") {
          win.show();
        } else if (action === "showInactive") {
          win.showInactive();
        } else if (action === "min") {
          win.minimize();
        } else if (action === "max") {
          const isMaximized = win.isMaximized();
          if (isMaximized) {
            win.unmaximize();
          } else {
            win.maximize();
          }
        } else if (action === "close") {
          win.close();
        }
      }
    });
  }
};
const { app, shell, BrowserWindow } = electron;
function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    autoHideMenuBar: true,
    icon: path.join(__dirname, "../../resources/icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}
app.whenReady().then(() => {
  electronApp.setAppUserModelId("com.nanobanana.studio");
  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });
  const { session } = electron;
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp"
      }
    });
  });
  createWindow();
  app.on("activate", function() {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
electron.ipcMain.handle("dialog:openDirectory", async () => {
  const { canceled, filePaths } = await electron.dialog.showOpenDialog({
    properties: ["openDirectory"]
  });
  if (canceled) {
    return null;
  } else {
    return filePaths[0];
  }
});
electron.ipcMain.handle("file:read", async (_event, filePath) => {
  try {
    const content = await fs__namespace.readFile(filePath);
    return content.toString("base64");
  } catch (error) {
    console.error("Read Error:", error);
    return null;
  }
});
electron.ipcMain.handle("file:write", async (_event, filePath, buffer) => {
  try {
    const dirname = path__namespace.dirname(filePath);
    await fs__namespace.mkdir(dirname, { recursive: true });
    await fs__namespace.writeFile(filePath, Buffer.from(buffer));
    return true;
  } catch (error) {
    console.error("Write Error:", error);
    return false;
  }
});
electron.ipcMain.handle("dir:create", async (_event, dirPath) => {
  try {
    await fs__namespace.mkdir(dirPath, { recursive: true });
    return true;
  } catch (error) {
    console.error("Create Dir Error:", error);
    return false;
  }
});
electron.ipcMain.handle("file:exists", async (_event, filePath) => {
  try {
    await fs__namespace.access(filePath);
    return true;
  } catch {
    return false;
  }
});
electron.ipcMain.handle("file:list", async (_event, folderPath) => {
  try {
    const entries = await fs__namespace.readdir(folderPath, { withFileTypes: true });
    return entries.filter((e) => e.isFile() && /\.(png|jpg|jpeg)$/i.test(e.name)).map((e) => e.name);
  } catch {
    return [];
  }
});
electron.ipcMain.handle("path:join", async (_event, ...args) => {
  return path__namespace.join(...args);
});
electron.ipcMain.handle("file:hash", async (_event, filePath) => {
  try {
    const buffer = await fs__namespace.readFile(filePath);
    return crypto__namespace.createHash("sha256").update(buffer).digest("hex");
  } catch (error) {
    console.error("Hash Error:", error);
    return null;
  }
});
electron.ipcMain.handle("depth:generate", async (_event, input) => {
  let inputPath = input;
  let isTemp = false;
  let inputBuffer;
  try {
    if (input.startsWith("data:")) {
      const mimeType = input.substring(input.indexOf(":") + 1, input.indexOf(";"));
      const ext2 = mimeType.split("/")[1] || "png";
      const b64Data = input.split("base64,")[1];
      inputBuffer = Buffer.from(b64Data, "base64");
      const tempDir = path__namespace.join(app.getPath("userData"), "depth_temp");
      await fs__namespace.mkdir(tempDir, { recursive: true });
      inputPath = path__namespace.join(tempDir, `input_${Date.now()}.${ext2}`);
      await fs__namespace.writeFile(inputPath, inputBuffer);
      isTemp = true;
      console.log(`[IPC] Saved Data URL to temp path: ${inputPath}`);
    } else {
      inputBuffer = await fs__namespace.readFile(inputPath);
    }
    const sourceHash = crypto__namespace.createHash("sha256").update(inputBuffer).digest("hex");
    const ext = path__namespace.extname(inputPath);
    const outputPath = inputPath.replace(ext, `_depth.png`);
    const metaPath = inputPath.replace(ext, `_depth.json`);
    try {
      const metaExists = await fs__namespace.access(metaPath).then(() => true).catch(() => false);
      if (metaExists) {
        const metaRaw = await fs__namespace.readFile(metaPath, "utf-8");
        const meta = JSON.parse(metaRaw);
        if (meta.sourceHash !== sourceHash) {
          console.warn(`[IPC] GEOMETRIC BINDING VIOLATION detected. Background changed. Invalidating depth map: ${outputPath}`);
          await fs__namespace.chmod(outputPath, 438).catch(() => {
          });
          await fs__namespace.chmod(metaPath, 438).catch(() => {
          });
          await fs__namespace.unlink(outputPath).catch(() => {
          });
          await fs__namespace.unlink(metaPath).catch(() => {
          });
        } else {
          console.log(`[IPC] Valid depth binding found for source: ${sourceHash}. Returning cached result.`);
          const outputBuffer = await fs__namespace.readFile(outputPath);
          const dataUrl = `data:image/png;base64,${outputBuffer.toString("base64")}`;
          if (isTemp) await fs__namespace.unlink(inputPath).catch(() => {
          });
          return { dataUrl, hash: meta.depthHash, sourceHash };
        }
      }
    } catch (e) {
      console.error("[IPC] Binding check failed, proceeding to full regeneration.", e);
    }
    return new Promise((resolve, reject) => {
      const scriptPath = is.dev ? path__namespace.join(app.getAppPath(), "scripts", "depth_inference.py") : path__namespace.join(process.resourcesPath, "scripts", "depth_inference.py");
      console.log(`[IPC] Triggering depth generation for: ${inputPath}`);
      const pythonPath = process.env.VIRTUAL_ENV ? path__namespace.join(process.env.VIRTUAL_ENV, "Scripts", "python.exe") : "python";
      console.log(`[IPC] Using Python interpreter: ${pythonPath}`);
      const pythonProcess = child_process.spawn(pythonPath, [
        scriptPath,
        "--input",
        inputPath,
        "--output",
        outputPath
      ]);
      let errorData = "";
      let stdoutData = "";
      pythonProcess.stdout.on("data", (data) => {
        stdoutData += data.toString();
      });
      pythonProcess.stderr.on("data", (data) => {
        errorData += data.toString();
      });
      pythonProcess.on("close", async (code) => {
        if (code === 0) {
          console.log(`[IPC] Depth Generation Success: ${stdoutData}`);
          try {
            const outputBuffer = await fs__namespace.readFile(outputPath);
            const depthHash = crypto__namespace.createHash("sha256").update(outputBuffer).digest("hex");
            const metadata = {
              sourceHash,
              depthHash,
              timestamp: Date.now()
            };
            await fs__namespace.writeFile(metaPath, JSON.stringify(metadata, null, 2));
            await fs__namespace.chmod(outputPath, 292);
            await fs__namespace.chmod(metaPath, 292);
            console.log(`[IPC] Depth Map & Metadata marked as READ-ONLY: ${outputPath}`);
            const dataUrl = `data:image/png;base64,${outputBuffer.toString("base64")}`;
            if (isTemp) {
              await fs__namespace.unlink(inputPath).catch(() => {
              });
              await fs__namespace.chmod(outputPath, 438).catch(() => {
              });
              await fs__namespace.chmod(metaPath, 438).catch(() => {
              });
              await fs__namespace.unlink(outputPath).catch(() => {
              });
              await fs__namespace.unlink(metaPath).catch(() => {
              });
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
      pythonProcess.on("error", (err) => {
        console.error("[IPC] Failed to spawn Python process:", err);
        reject(new Error(`Failed to start Python inference. Ensure 'python' is in PATH.`));
      });
    });
  } catch (err) {
    console.error("[IPC] Depth Generation Error:", err);
    throw err;
  }
});
