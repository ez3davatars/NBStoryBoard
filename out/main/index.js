"use strict";
const electron = require("electron");
const path = require("path");
const require$$0 = require("fs");
const require$$2 = require("os");
const crypto = require("crypto");
const child_process = require("child_process");
const fs = require("fs/promises");
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
const crypto__namespace = /* @__PURE__ */ _interopNamespaceDefault(crypto);
const fs__namespace = /* @__PURE__ */ _interopNamespaceDefault(fs);
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
var main = { exports: {} };
var hasRequiredMain;
function requireMain() {
  if (hasRequiredMain) return main.exports;
  hasRequiredMain = 1;
  const fs2 = require$$0;
  const path$1 = path;
  const os = require$$2;
  const crypto$1 = crypto;
  const TIPS = [
    "◈ encrypted .env [www.dotenvx.com]",
    "◈ secrets for agents [www.dotenvx.com]",
    "⌁ auth for agents [www.vestauth.com]",
    "⌘ custom filepath { path: '/custom/path/.env' }",
    "⌘ enable debugging { debug: true }",
    "⌘ override existing { override: true }",
    "⌘ suppress logs { quiet: true }",
    "⌘ multiple files { path: ['.env.local', '.env'] }"
  ];
  function _getRandomTip() {
    return TIPS[Math.floor(Math.random() * TIPS.length)];
  }
  function parseBoolean(value) {
    if (typeof value === "string") {
      return !["false", "0", "no", "off", ""].includes(value.toLowerCase());
    }
    return Boolean(value);
  }
  function supportsAnsi() {
    return process.stdout.isTTY;
  }
  function dim(text) {
    return supportsAnsi() ? `\x1B[2m${text}\x1B[0m` : text;
  }
  const LINE = /(?:^|^)\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]+)?\s*(?:#.*)?(?:$|$)/mg;
  function parse(src) {
    const obj = {};
    let lines = src.toString();
    lines = lines.replace(/\r\n?/mg, "\n");
    let match;
    while ((match = LINE.exec(lines)) != null) {
      const key = match[1];
      let value = match[2] || "";
      value = value.trim();
      const maybeQuote = value[0];
      value = value.replace(/^(['"`])([\s\S]*)\1$/mg, "$2");
      if (maybeQuote === '"') {
        value = value.replace(/\\n/g, "\n");
        value = value.replace(/\\r/g, "\r");
      }
      obj[key] = value;
    }
    return obj;
  }
  function _parseVault(options) {
    options = options || {};
    const vaultPath = _vaultPath(options);
    options.path = vaultPath;
    const result = DotenvModule.configDotenv(options);
    if (!result.parsed) {
      const err = new Error(`MISSING_DATA: Cannot parse ${vaultPath} for an unknown reason`);
      err.code = "MISSING_DATA";
      throw err;
    }
    const keys = _dotenvKey(options).split(",");
    const length = keys.length;
    let decrypted;
    for (let i = 0; i < length; i++) {
      try {
        const key = keys[i].trim();
        const attrs = _instructions(result, key);
        decrypted = DotenvModule.decrypt(attrs.ciphertext, attrs.key);
        break;
      } catch (error) {
        if (i + 1 >= length) {
          throw error;
        }
      }
    }
    return DotenvModule.parse(decrypted);
  }
  function _warn(message) {
    console.error(`⚠ ${message}`);
  }
  function _debug(message) {
    console.log(`┆ ${message}`);
  }
  function _log(message) {
    console.log(`◇ ${message}`);
  }
  function _dotenvKey(options) {
    if (options && options.DOTENV_KEY && options.DOTENV_KEY.length > 0) {
      return options.DOTENV_KEY;
    }
    if (process.env.DOTENV_KEY && process.env.DOTENV_KEY.length > 0) {
      return process.env.DOTENV_KEY;
    }
    return "";
  }
  function _instructions(result, dotenvKey) {
    let uri;
    try {
      uri = new URL(dotenvKey);
    } catch (error) {
      if (error.code === "ERR_INVALID_URL") {
        const err = new Error("INVALID_DOTENV_KEY: Wrong format. Must be in valid uri format like dotenv://:key_1234@dotenvx.com/vault/.env.vault?environment=development");
        err.code = "INVALID_DOTENV_KEY";
        throw err;
      }
      throw error;
    }
    const key = uri.password;
    if (!key) {
      const err = new Error("INVALID_DOTENV_KEY: Missing key part");
      err.code = "INVALID_DOTENV_KEY";
      throw err;
    }
    const environment = uri.searchParams.get("environment");
    if (!environment) {
      const err = new Error("INVALID_DOTENV_KEY: Missing environment part");
      err.code = "INVALID_DOTENV_KEY";
      throw err;
    }
    const environmentKey = `DOTENV_VAULT_${environment.toUpperCase()}`;
    const ciphertext = result.parsed[environmentKey];
    if (!ciphertext) {
      const err = new Error(`NOT_FOUND_DOTENV_ENVIRONMENT: Cannot locate environment ${environmentKey} in your .env.vault file.`);
      err.code = "NOT_FOUND_DOTENV_ENVIRONMENT";
      throw err;
    }
    return { ciphertext, key };
  }
  function _vaultPath(options) {
    let possibleVaultPath = null;
    if (options && options.path && options.path.length > 0) {
      if (Array.isArray(options.path)) {
        for (const filepath of options.path) {
          if (fs2.existsSync(filepath)) {
            possibleVaultPath = filepath.endsWith(".vault") ? filepath : `${filepath}.vault`;
          }
        }
      } else {
        possibleVaultPath = options.path.endsWith(".vault") ? options.path : `${options.path}.vault`;
      }
    } else {
      possibleVaultPath = path$1.resolve(process.cwd(), ".env.vault");
    }
    if (fs2.existsSync(possibleVaultPath)) {
      return possibleVaultPath;
    }
    return null;
  }
  function _resolveHome(envPath) {
    return envPath[0] === "~" ? path$1.join(os.homedir(), envPath.slice(1)) : envPath;
  }
  function _configVault(options) {
    const debug = parseBoolean(process.env.DOTENV_CONFIG_DEBUG || options && options.debug);
    const quiet = parseBoolean(process.env.DOTENV_CONFIG_QUIET || options && options.quiet);
    if (debug || !quiet) {
      _log("loading env from encrypted .env.vault");
    }
    const parsed = DotenvModule._parseVault(options);
    let processEnv = process.env;
    if (options && options.processEnv != null) {
      processEnv = options.processEnv;
    }
    DotenvModule.populate(processEnv, parsed, options);
    return { parsed };
  }
  function configDotenv(options) {
    const dotenvPath = path$1.resolve(process.cwd(), ".env");
    let encoding = "utf8";
    let processEnv = process.env;
    if (options && options.processEnv != null) {
      processEnv = options.processEnv;
    }
    let debug = parseBoolean(processEnv.DOTENV_CONFIG_DEBUG || options && options.debug);
    let quiet = parseBoolean(processEnv.DOTENV_CONFIG_QUIET || options && options.quiet);
    if (options && options.encoding) {
      encoding = options.encoding;
    } else {
      if (debug) {
        _debug("no encoding is specified (UTF-8 is used by default)");
      }
    }
    let optionPaths = [dotenvPath];
    if (options && options.path) {
      if (!Array.isArray(options.path)) {
        optionPaths = [_resolveHome(options.path)];
      } else {
        optionPaths = [];
        for (const filepath of options.path) {
          optionPaths.push(_resolveHome(filepath));
        }
      }
    }
    let lastError;
    const parsedAll = {};
    for (const path2 of optionPaths) {
      try {
        const parsed = DotenvModule.parse(fs2.readFileSync(path2, { encoding }));
        DotenvModule.populate(parsedAll, parsed, options);
      } catch (e) {
        if (debug) {
          _debug(`failed to load ${path2} ${e.message}`);
        }
        lastError = e;
      }
    }
    const populated = DotenvModule.populate(processEnv, parsedAll, options);
    debug = parseBoolean(processEnv.DOTENV_CONFIG_DEBUG || debug);
    quiet = parseBoolean(processEnv.DOTENV_CONFIG_QUIET || quiet);
    if (debug || !quiet) {
      const keysCount = Object.keys(populated).length;
      const shortPaths = [];
      for (const filePath of optionPaths) {
        try {
          const relative = path$1.relative(process.cwd(), filePath);
          shortPaths.push(relative);
        } catch (e) {
          if (debug) {
            _debug(`failed to load ${filePath} ${e.message}`);
          }
          lastError = e;
        }
      }
      _log(`injecting env (${keysCount}) from ${shortPaths.join(",")} ${dim(`// tip: ${_getRandomTip()}`)}`);
    }
    if (lastError) {
      return { parsed: parsedAll, error: lastError };
    } else {
      return { parsed: parsedAll };
    }
  }
  function config(options) {
    if (_dotenvKey(options).length === 0) {
      return DotenvModule.configDotenv(options);
    }
    const vaultPath = _vaultPath(options);
    if (!vaultPath) {
      _warn(`you set DOTENV_KEY but you are missing a .env.vault file at ${vaultPath}`);
      return DotenvModule.configDotenv(options);
    }
    return DotenvModule._configVault(options);
  }
  function decrypt(encrypted, keyStr) {
    const key = Buffer.from(keyStr.slice(-64), "hex");
    let ciphertext = Buffer.from(encrypted, "base64");
    const nonce = ciphertext.subarray(0, 12);
    const authTag = ciphertext.subarray(-16);
    ciphertext = ciphertext.subarray(12, -16);
    try {
      const aesgcm = crypto$1.createDecipheriv("aes-256-gcm", key, nonce);
      aesgcm.setAuthTag(authTag);
      return `${aesgcm.update(ciphertext)}${aesgcm.final()}`;
    } catch (error) {
      const isRange = error instanceof RangeError;
      const invalidKeyLength = error.message === "Invalid key length";
      const decryptionFailed = error.message === "Unsupported state or unable to authenticate data";
      if (isRange || invalidKeyLength) {
        const err = new Error("INVALID_DOTENV_KEY: It must be 64 characters long (or more)");
        err.code = "INVALID_DOTENV_KEY";
        throw err;
      } else if (decryptionFailed) {
        const err = new Error("DECRYPTION_FAILED: Please check your DOTENV_KEY");
        err.code = "DECRYPTION_FAILED";
        throw err;
      } else {
        throw error;
      }
    }
  }
  function populate(processEnv, parsed, options = {}) {
    const debug = Boolean(options && options.debug);
    const override = Boolean(options && options.override);
    const populated = {};
    if (typeof parsed !== "object") {
      const err = new Error("OBJECT_REQUIRED: Please check the processEnv argument being passed to populate");
      err.code = "OBJECT_REQUIRED";
      throw err;
    }
    for (const key of Object.keys(parsed)) {
      if (Object.prototype.hasOwnProperty.call(processEnv, key)) {
        if (override === true) {
          processEnv[key] = parsed[key];
          populated[key] = parsed[key];
        }
        if (debug) {
          if (override === true) {
            _debug(`"${key}" is already defined and WAS overwritten`);
          } else {
            _debug(`"${key}" is already defined and was NOT overwritten`);
          }
        }
      } else {
        processEnv[key] = parsed[key];
        populated[key] = parsed[key];
      }
    }
    return populated;
  }
  const DotenvModule = {
    configDotenv,
    _configVault,
    _parseVault,
    config,
    decrypt,
    parse,
    populate
  };
  main.exports.configDotenv = DotenvModule.configDotenv;
  main.exports._configVault = DotenvModule._configVault;
  main.exports._parseVault = DotenvModule._parseVault;
  main.exports.config = DotenvModule.config;
  main.exports.decrypt = DotenvModule.decrypt;
  main.exports.parse = DotenvModule.parse;
  main.exports.populate = DotenvModule.populate;
  main.exports = DotenvModule;
  return main.exports;
}
var mainExports = requireMain();
let isWorkerQuitting = false;
let imageWorkerProcess = null;
let cleanupWorkerProcess = null;
let imageWorkerStatus = "stopped";
let imageWorkerLastError = null;
let imageWorkerStartedAt = null;
let imageWorkerRestartAttempts = 0;
let cleanupWorkerStatus = "stopped";
let cleanupWorkerLastError = null;
let cleanupWorkerStartedAt = null;
let cleanupWorkerRestartAttempts = 0;
const MAX_IMAGE_WORKER_RESTARTS = 3;
const MAX_CLEANUP_WORKER_RESTARTS = 3;
function setImageWorkerQuitting(quitting) {
  isWorkerQuitting = quitting;
}
function getImageWorkerStatus() {
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
function hasHostedWorkerEnv() {
  const env = process.env;
  if (!env.SUPABASE_SECRET_KEY || !env.GEMINI_API_KEY || !env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.R2_BUCKET_NAME) {
    return false;
  }
  return true;
}
function startImageWorker() {
  if (imageWorkerProcess && !imageWorkerProcess.killed) return;
  if (!hasHostedWorkerEnv()) {
    imageWorkerStatus = "disabled";
    imageWorkerLastError = "Hosted worker disabled: Missing one or more required environment variables (SUPABASE_SECRET_KEY, GEMINI_API_KEY, R2_ACCOUNT_ID, etc).";
    console.warn(`[ImageWorker] ${imageWorkerLastError}`);
    return;
  }
  imageWorkerStatus = "starting";
  imageWorkerLastError = null;
  cleanupWorkerStatus = "starting";
  cleanupWorkerLastError = null;
  if (is.dev) {
    const tsNodePath = path.join(electron.app.getAppPath(), "node_modules", "ts-node", "dist", "bin.js");
    const workerScriptPath = path.join(electron.app.getAppPath(), "supabase", "workers", "image-processor", "index.ts");
    const cleanupScriptPath = path.join(electron.app.getAppPath(), "supabase", "workers", "cleanup-cron", "index.ts");
    if (!require$$0.existsSync(tsNodePath)) {
      imageWorkerStatus = "error";
      cleanupWorkerStatus = "error";
      imageWorkerLastError = `Local dev dependency 'ts-node' not found at ${tsNodePath}. Run 'npm install -D ts-node' to enable the hosted background worker.`;
      cleanupWorkerLastError = imageWorkerLastError;
      console.error(`[HostedWorkers] ${imageWorkerLastError}`);
      return;
    }
    imageWorkerProcess = child_process.spawn(process.execPath, [tsNodePath, workerScriptPath], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }
    });
    cleanupWorkerProcess = child_process.spawn(process.execPath, [tsNodePath, cleanupScriptPath], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }
    });
    if (cleanupWorkerProcess.stdout) {
      cleanupWorkerProcess.stdout.on("data", (data) => {
        const output = data.toString();
        if (output.includes("Booted")) {
          cleanupWorkerStatus = "online";
          cleanupWorkerStartedAt = Date.now();
          cleanupWorkerRestartAttempts = 0;
        }
        console.log(`[CleanupWorker] ${output.trim()}`);
      });
    }
    if (cleanupWorkerProcess.stderr) {
      cleanupWorkerProcess.stderr.on("data", (data) => {
        const output = data.toString();
        console.error(`[CleanupWorker:Err] ${output.trim()}`);
        cleanupWorkerLastError = (cleanupWorkerLastError || "") + output;
      });
    }
  } else {
    imageWorkerStatus = "error";
    imageWorkerLastError = "Hosted image worker production packaging is not wired yet.";
    cleanupWorkerStatus = "disabled";
    cleanupWorkerLastError = "Production expiry uses Supabase scheduled Edge Function (r2-expiry-cleanup). Electron cleanup is Dev-only.";
    return;
  }
  if (imageWorkerProcess.stdout) {
    imageWorkerProcess.stdout.on("data", (data) => {
      const output = data.toString();
      if (output.includes("Booted & listening for generation jobs")) {
        imageWorkerStatus = "online";
        imageWorkerStartedAt = Date.now();
        imageWorkerRestartAttempts = 0;
        console.log("[ImageWorker] Worker is online.");
      }
    });
  }
  if (imageWorkerProcess.stderr) {
    imageWorkerProcess.stderr.on("data", (data) => {
      const output = data.toString();
      console.error(`[ImageWorker:Err] ${output}`);
      imageWorkerLastError = (imageWorkerLastError || "") + output;
    });
  }
  imageWorkerProcess.on("exit", (code, signal) => {
    imageWorkerProcess = null;
    if (isWorkerQuitting) {
      imageWorkerStatus = "stopped";
      return;
    }
    imageWorkerStatus = "error";
    imageWorkerLastError = imageWorkerLastError || `Process exited with code ${code} and signal ${signal}`;
    if (imageWorkerRestartAttempts < MAX_IMAGE_WORKER_RESTARTS) {
      imageWorkerRestartAttempts++;
      console.log(`[ImageWorker] Restarting worker... Attempt ${imageWorkerRestartAttempts}/${MAX_IMAGE_WORKER_RESTARTS}`);
      setTimeout(() => {
        startImageWorker();
      }, 1500);
    } else {
      console.error("[ImageWorker] Max restart attempts reached. Giving up.");
    }
  });
  cleanupWorkerProcess.on("exit", (code, signal) => {
    cleanupWorkerProcess = null;
    if (isWorkerQuitting) {
      cleanupWorkerStatus = "stopped";
      return;
    }
    cleanupWorkerStatus = "error";
    cleanupWorkerLastError = cleanupWorkerLastError || `Process exited with code ${code} and signal ${signal}`;
    if (cleanupWorkerRestartAttempts < MAX_CLEANUP_WORKER_RESTARTS) {
      cleanupWorkerRestartAttempts++;
      console.log(`[CleanupWorker] Restarting worker... Attempt ${cleanupWorkerRestartAttempts}/${MAX_CLEANUP_WORKER_RESTARTS}`);
      setTimeout(() => {
        startImageWorker();
      }, 1500);
    } else {
      console.error("[CleanupWorker] Max restart attempts reached. Giving up.");
    }
  });
}
function stopImageWorker() {
  if (imageWorkerProcess && !imageWorkerProcess.killed) {
    imageWorkerProcess.kill();
  }
  if (cleanupWorkerProcess && !cleanupWorkerProcess.killed) {
    cleanupWorkerProcess.kill();
  }
  imageWorkerProcess = null;
  cleanupWorkerProcess = null;
  imageWorkerStatus = "stopped";
  cleanupWorkerStatus = "stopped";
}
function restartImageWorker() {
  stopImageWorker();
  imageWorkerRestartAttempts = 0;
  startImageWorker();
  return getImageWorkerStatus();
}
let workerIpcRegistered = false;
function registerWorkerIpcHandlers() {
  if (workerIpcRegistered) return;
  workerIpcRegistered = true;
  electron.ipcMain.handle("worker:getStatus", async () => getImageWorkerStatus());
  electron.ipcMain.handle("worker:restart", async () => restartImageWorker());
}
let fileIpcRegistered = false;
function registerFileIpcHandlers() {
  if (fileIpcRegistered) return;
  fileIpcRegistered = true;
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
  electron.ipcMain.handle("dialog:showSaveDialog", async (_event, options) => {
    const result = await electron.dialog.showSaveDialog(options);
    if (result.canceled) {
      return null;
    }
    return result.filePath;
  });
  electron.ipcMain.handle("dialog:showOpenDialog", async (_event, options) => {
    const result = await electron.dialog.showOpenDialog(options);
    if (result.canceled) {
      return null;
    }
    return result.filePaths;
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
  electron.ipcMain.handle("file:readText", async (_event, filePath) => {
    try {
      return await fs__namespace.readFile(filePath, "utf-8");
    } catch (error) {
      console.error("Read Text Error:", error);
      return null;
    }
  });
  electron.ipcMain.handle("file:write", async (_event, filePath, buffer) => {
    try {
      console.log(`[IPC file:write] Start writing to: ${filePath}`);
      console.log(`[IPC file:write] Buffer type: ${typeof buffer}, isBuffer: ${Buffer.isBuffer(buffer)}, byteLength: ${buffer?.byteLength}`);
      const dirname = path__namespace.dirname(filePath);
      await fs__namespace.mkdir(dirname, { recursive: true });
      await fs__namespace.writeFile(filePath, Buffer.from(buffer));
      console.log(`[IPC file:write] Write successful`);
      return true;
    } catch (error) {
      console.error("[IPC file:write] Write Error:", error);
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
  electron.ipcMain.handle("file:delete", async (_event, filePath) => {
    try {
      await fs__namespace.unlink(filePath);
      return true;
    } catch (error) {
      if (error.code !== "ENOENT") {
        console.error("Delete Error:", error);
      }
      return false;
    }
  });
  electron.ipcMain.handle("file:rename", async (_event, oldPath, newPath) => {
    try {
      const dirname = path__namespace.dirname(newPath);
      await fs__namespace.mkdir(dirname, { recursive: true });
      await fs__namespace.rename(oldPath, newPath);
      return true;
    } catch (error) {
      console.error("Rename Error:", error);
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
}
let depthIpcRegistered = false;
function registerDepthIpcHandlers() {
  if (depthIpcRegistered) return;
  depthIpcRegistered = true;
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
        const tempDir = path__namespace.join(electron.app.getPath("userData"), "depth_temp");
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
        const scriptPath = is.dev ? path__namespace.join(electron.app.getAppPath(), "scripts", "depth_inference.py") : path__namespace.join(process.resourcesPath, "scripts", "depth_inference.py");
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
      throw err instanceof Error ? err : new Error(String(err));
    }
  });
}
const { app, shell, BrowserWindow, ipcMain, protocol, net } = electron;
mainExports.config({ path: path.join(__dirname, "../../.env") });
let isQuitting = false;
let appCloseIpcRegistered = false;
function registerAppCloseIpcHandlers() {
  if (appCloseIpcRegistered) return;
  appCloseIpcRegistered = true;
  ipcMain.on("confirm-discard-session", () => {
    isQuitting = true;
    setImageWorkerQuitting(true);
    app.quit();
  });
  ipcMain.on("confirm-close", () => {
    isQuitting = true;
    setImageWorkerQuitting(true);
    app.quit();
  });
}
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
    mainWindow.maximize();
    mainWindow.show();
  });
  mainWindow.on("close", (e) => {
    if (isQuitting) return;
    e.preventDefault();
    mainWindow.webContents.send("request-app-close");
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
protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true, corsEnabled: false } }
]);
app.whenReady().then(() => {
  electronApp.setAppUserModelId("com.nanobanana.studio");
  protocol.handle("app", (request) => {
    let fileUrl = request.url;
    console.log("[PROTOCOL] Intercepted protocol request for:", fileUrl);
    if (fileUrl.startsWith("app://local/")) {
      fileUrl = fileUrl.replace(/^app:\/\/local\//i, "file:///");
    } else {
      fileUrl = fileUrl.replace(/^app:\/\//i, "file:///");
    }
    fileUrl = fileUrl.replace(/^file:\/\/\/([a-zA-Z])\//, "file:///$1:/");
    console.log("[PROTOCOL] Translated to fetch url:", fileUrl);
    return net.fetch(fileUrl).then((response) => {
      const newHeaders = new Headers(response.headers);
      newHeaders.set("Cross-Origin-Resource-Policy", "cross-origin");
      newHeaders.set("Access-Control-Allow-Origin", "*");
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders
      });
    }).catch((err) => {
      console.error("[PROTOCOL] Fetch failed:", err);
      return new Response("Not Found", { status: 404 });
    });
  });
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
  registerWorkerIpcHandlers();
  registerAppCloseIpcHandlers();
  registerFileIpcHandlers();
  registerDepthIpcHandlers();
  createWindow();
  startImageWorker();
  app.on("activate", function() {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
app.on("before-quit", () => {
  isQuitting = true;
  setImageWorkerQuitting(true);
  stopImageWorker();
});
