import electron from 'electron';
const { app, shell, BrowserWindow, ipcMain, protocol, net } = electron;
import type { IpcMainEvent } from 'electron';
import { createHash } from 'crypto';
import { readFileSync, statSync } from 'fs';
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import { config as dotenvConfig } from 'dotenv';
import { startImageWorker, stopImageWorker, registerWorkerIpcHandlers, setImageWorkerQuitting } from './worker/imageWorker';
import { registerFileIpcHandlers } from './ipc/fileIpc';
import { registerDepthIpcHandlers } from './ipc/depthIpc';

dotenvConfig({ path: join(__dirname, '../../.env') });

let isQuitting = false;

let appCloseIpcRegistered = false;
const APP_BACKGROUND_COLOR = '#0b0b0f';
const RENDERER_READY_FALLBACK_MS = 6500;
const MIN_SPLASH_DISPLAY_MS = 4900;
const SPLASH_READY_HOLD_MS = 250;
const SPLASH_EXIT_FADE_MS = 220;

function getSplashLogoDataUrl(): string {
  const logoPaths = [
    join(__dirname, '../renderer/logo-z.png'),
    join(__dirname, '../../public/logo-z.png'),
    join(__dirname, '../../src/renderer/assets/logo-z.png')
  ];

  for (const logoPath of logoPaths) {
    try {
      return `data:image/png;base64,${readFileSync(logoPath).toString('base64')}`;
    } catch {
      // Try the next known dev/packaged asset location.
    }
  }

  return '';
}

function getSplashHtml(): string {
  const splashLogo = getSplashLogoDataUrl();
  const splashLogoMarkup = splashLogo
    ? `<img src="${splashLogo}" alt="" draggable="false" />`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Cast Director Studio</title>
  <style>
    :root {
      color-scheme: dark;
      background: ${APP_BACKGROUND_COLOR};
      color: #ffffff;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    html,
    body {
      width: 100%;
      height: 100%;
      margin: 0;
      overflow: hidden;
      background: ${APP_BACKGROUND_COLOR};
    }

    body {
      display: grid;
      place-items: center;
      opacity: 1;
      transform: scale(1);
      transition:
        opacity ${SPLASH_EXIT_FADE_MS}ms ease,
        transform ${SPLASH_EXIT_FADE_MS}ms ease;
      user-select: none;
    }

    body.is-closing {
      opacity: 0;
      transform: scale(1.012);
    }

    .surface {
      position: relative;
      box-sizing: border-box;
      width: 100%;
      height: 100%;
      display: grid;
      place-items: center;
      overflow: hidden;
      background:
        linear-gradient(90deg, rgba(255, 255, 255, 0.035) 1px, transparent 1px),
        linear-gradient(180deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
        #0b0b0f;
      background-size: 32px 32px;
    }

    .surface::before {
      content: "";
      position: absolute;
      inset: 0;
      background:
        radial-gradient(circle at 50% 18%, rgba(250, 204, 21, 0.16), transparent 30%),
        linear-gradient(145deg, rgba(18, 20, 28, 0.94), rgba(5, 5, 8, 0.98));
    }

    .content {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      text-align: center;
    }

    .logo {
      width: 104px;
      height: 112px;
      display: grid;
      place-items: center;
      filter:
        drop-shadow(0 22px 24px rgba(0, 0, 0, 0.42))
        drop-shadow(0 0 26px rgba(250, 204, 21, 0.22));
    }

    .logo img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: block;
    }

    body.is-ready .logo {
      filter:
        drop-shadow(0 22px 24px rgba(0, 0, 0, 0.42))
        drop-shadow(0 0 34px rgba(250, 204, 21, 0.34));
    }

    .brand {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .eyebrow {
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: rgba(250, 204, 21, 0.75);
    }

    .title {
      font-size: 24px;
      line-height: 1;
      font-weight: 900;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #f8fafc;
    }

    .status {
      min-width: 190px;
      height: 3px;
      overflow: hidden;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.1);
    }

    .status::before {
      content: "";
      display: block;
      width: 46%;
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, transparent, #facc15, transparent);
      animation: load 1.15s ease-in-out infinite;
    }

    body.is-ready .status::before {
      width: 100%;
      animation: none;
      background: linear-gradient(90deg, #facc15, #fde047, #facc15);
      transform: translateX(0);
      transition: width 180ms ease, background 180ms ease;
    }

    .phase {
      min-height: 13px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: rgba(212, 212, 216, 0.68);
      transition: color 180ms ease, opacity 180ms ease;
    }

    body.is-ready .phase {
      color: rgba(250, 204, 21, 0.78);
    }

    @keyframes load {
      0% { transform: translateX(-120%); }
      100% { transform: translateX(250%); }
    }
  </style>
</head>
<body>
  <main class="surface">
    <section class="content" aria-label="Cast Director Studio is launching">
      <div class="logo" aria-hidden="true">
        ${splashLogoMarkup}
      </div>
      <div class="brand">
        <div class="eyebrow">Launching</div>
        <div class="title">Cast Director Studio</div>
      </div>
      <div class="status" aria-hidden="true"></div>
      <div class="phase" id="phase">Preparing creative workspace</div>
    </section>
  </main>
</body>
</html>`;
}

function createSplashWindow(bounds: Electron.Rectangle): Electron.BrowserWindow {
  const splashWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    show: false,
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    backgroundColor: APP_BACKGROUND_COLOR,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  splashWindow.once('ready-to-show', () => {
    if (!splashWindow.isDestroyed()) {
      splashWindow.show();
    }
  });

  void splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(getSplashHtml())}`);
  return splashWindow;
}

function closeSplashWindow(splashWindow: Electron.BrowserWindow | null): void {
  if (!splashWindow || splashWindow.isDestroyed()) return;

  void splashWindow.webContents
    .executeJavaScript("document.body.classList.add('is-closing')")
    .catch(() => undefined);

  setTimeout(() => {
    if (!splashWindow.isDestroyed()) {
      splashWindow.destroy();
    }
  }, SPLASH_EXIT_FADE_MS + 40);
}

function markSplashReady(splashWindow: Electron.BrowserWindow | null): void {
  if (!splashWindow || splashWindow.isDestroyed()) return;

  void splashWindow.webContents
    .executeJavaScript(`
      document.body.classList.add('is-ready');
      const phase = document.getElementById('phase');
      if (phase) phase.textContent = 'Opening studio';
    `)
    .catch(() => undefined);
}

function getInstallId(): string | null {
  try {
    const exePath = app.getPath('exe');
    const stats = statSync(exePath);
    const seed = [
      app.getVersion(),
      exePath,
      Math.round(stats.birthtimeMs || 0),
      Math.round(stats.mtimeMs || 0),
      stats.size
    ].join('|');

    return createHash('sha256').update(seed).digest('hex').slice(0, 24);
  } catch (error) {
    console.warn('Failed to compute app install id', error);
    return null;
  }
}

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

  ipcMain.handle('shell:openExternal', async (_event, url: string) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      throw new Error('Blocked invalid external URL.');
    }

    await shell.openExternal(url);
    return true;
  });

  ipcMain.handle('app:getInstallInfo', () => ({
    version: app.getVersion(),
    installId: getInstallId()
  }));
}

function createWindow(): void {
  const { workArea } = electron.screen.getPrimaryDisplay();
  const splashWindow = createSplashWindow(workArea);
  const splashStartedAt = Date.now();

  const mainWindow = new BrowserWindow({
    x: workArea.x,
    y: workArea.y,
    width: workArea.width,
    height: workArea.height,
    show: false,
    paintWhenInitiallyHidden: true,
    backgroundColor: APP_BACKGROUND_COLOR,
    autoHideMenuBar: true,
    icon: join(__dirname, '../../resources/icon.ico'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });
  mainWindow.maximize();

  let revealFallback: ReturnType<typeof setTimeout> | null = null;
  let revealTimer: ReturnType<typeof setTimeout> | null = null;
  let hasRevealedMainWindow = false;

  const revealMainWindow = () => {
    if (hasRevealedMainWindow || mainWindow.isDestroyed()) return;
    hasRevealedMainWindow = true;

    if (revealFallback) {
      clearTimeout(revealFallback);
      revealFallback = null;
    }

    if (revealTimer) {
      clearTimeout(revealTimer);
      revealTimer = null;
    }

    if (!mainWindow.isMaximized()) {
      mainWindow.maximize();
    }

    mainWindow.show();

    try {
      splashWindow.moveTop();
    } catch {
      // The splash is already always-on-top; this only protects the reveal handoff.
    }

    closeSplashWindow(splashWindow);

    setTimeout(() => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.focus();
      }
    }, SPLASH_EXIT_FADE_MS + 60);
  };

  const scheduleRevealMainWindow = (force = false) => {
    if (hasRevealedMainWindow || mainWindow.isDestroyed() || revealTimer) return;

    const elapsedMs = Date.now() - splashStartedAt;
    const readyDelayMs = force
      ? Math.max(MIN_SPLASH_DISPLAY_MS - elapsedMs, 0)
      : Math.max(MIN_SPLASH_DISPLAY_MS - SPLASH_READY_HOLD_MS - elapsedMs, 0);

    revealTimer = setTimeout(() => {
      markSplashReady(splashWindow);

      revealTimer = setTimeout(() => {
        revealTimer = null;
        revealMainWindow();
      }, SPLASH_READY_HOLD_MS);
    }, readyDelayMs);
  };

  const handleRendererReady = (event: IpcMainEvent) => {
    if (event.sender !== mainWindow.webContents) return;
    ipcMain.off('app:renderer-ready', handleRendererReady);
    scheduleRevealMainWindow();
  };

  ipcMain.on('app:renderer-ready', handleRendererReady);

  revealFallback = setTimeout(() => scheduleRevealMainWindow(true), RENDERER_READY_FALLBACK_MS);

  mainWindow.once('ready-to-show', () => {
    scheduleRevealMainWindow();
  });

  mainWindow.once('closed', () => {
    ipcMain.off('app:renderer-ready', handleRendererReady);
    if (revealFallback) clearTimeout(revealFallback);
    if (revealTimer) clearTimeout(revealTimer);
    closeSplashWindow(splashWindow);
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

// Register the 'app' scheme as secure and standard so the renderer accepts it in <img> tags
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true, corsEnabled: false } }
]);

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.nanobanana.studio');

  // Register native file protocol for memory-efficient asset loading
  protocol.handle('app', (request) => {
    let fileUrl = request.url;
    console.log('[PROTOCOL] Intercepted protocol request for:', fileUrl);
    // Map app://local/C:/foo to file:///C:/foo
    // On Mac: app://local//var/foo to file:////var/foo (which handles as file:///var/foo)
    if (fileUrl.startsWith('app://local/')) {
      fileUrl = fileUrl.replace(/^app:\/\/local\//i, 'file:///');
    } else {
      // Fallback for older formats 
      fileUrl = fileUrl.replace(/^app:\/\//i, 'file:///');
    }
    
    // Attempt to salvage any mangled drive letters by Chrome standard url parser (e.g. file:///E/ -> file:///E:/)
    fileUrl = fileUrl.replace(/^file:\/\/\/([a-zA-Z])\//, 'file:///$1:/');
    
    console.log('[PROTOCOL] Translated to fetch url:', fileUrl);
    
    return net.fetch(fileUrl).then(response => {
      const newHeaders = new Headers(response.headers);
      // Inject required headers to survive the app's Cross-Origin-Embedder-Policy: require-corp
      newHeaders.set('Cross-Origin-Resource-Policy', 'cross-origin');
      newHeaders.set('Access-Control-Allow-Origin', '*');
      
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders
      });
    }).catch(err => {
      console.error('[PROTOCOL] Fetch failed:', err);
      return new Response('Not Found', { status: 404 });
    });
  });

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // Enable SharedArrayBuffer for local browser-side model runtimes.
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
  if (is.dev) {
    startImageWorker();
  }

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
