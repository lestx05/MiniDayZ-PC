'use strict';

const path = require('node:path');
const {
  app,
  BrowserWindow,
  dialog,
  Menu,
  protocol,
  shell,
} = require('electron');
const {
  GAME_HOST,
  GAME_SCHEME,
  createAssetResponse,
} = require('./game-protocol');

const GAME_URL = `${GAME_SCHEME}://${GAME_HOST}/index.html`;
const GAME_ROOT = path.join(__dirname, '..', 'docs');
const isWindowed = process.argv.includes('--windowed');
const isSmokeTest = process.argv.includes('--smoke-test');
const enableDevTools = process.argv.includes('--devtools') || process.env.MINIDAYZ_DEVTOOLS === '1';

protocol.registerSchemesAsPrivileged([
  {
    scheme: GAME_SCHEME,
    privileges: {
      allowServiceWorkers: true,
      bypassCSP: false,
      corsEnabled: true,
      secure: true,
      standard: true,
      stream: true,
      supportFetchAPI: true,
    },
  },
]);

app.setName('MiniDayZ PC');
app.setPath('userData', path.join(app.getPath('appData'), 'MiniDayZ PC'));

const hasSingleInstanceLock = app.requestSingleInstanceLock();
let mainWindow = null;
let smokeTestFinished = false;

function finishSmokeTest(error) {
  if (!isSmokeTest || smokeTestFinished) {
    return;
  }

  smokeTestFinished = true;
  if (error) {
    console.error(`[smoke-test] ${error.stack || error}`);
    app.exit(1);
  } else {
    console.log('[smoke-test] Construct 2 canvas and runtime loaded successfully.');
    app.exit(0);
  }
}

function isTrustedGameUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === `${GAME_SCHEME}:` && parsed.hostname === GAME_HOST;
  } catch {
    return false;
  }
}

function openExternalUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:' || parsed.protocol === 'mailto:') {
      void shell.openExternal(parsed.toString());
    }
  } catch {
    // Ignore malformed links from legacy game data.
  }
}

function createMainWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 960,
    minWidth: 800,
    minHeight: 600,
    show: false,
    fullscreen: !isWindowed && !isSmokeTest,
    autoHideMenuBar: true,
    backgroundColor: '#000000',
    title: 'MiniDayZ PC',
    icon: path.join(GAME_ROOT, 'icon-256.png'),
    webPreferences: {
      contextIsolation: true,
      devTools: enableDevTools,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      webSecurity: true,
    },
  });

  window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  window.webContents.session.setPermissionCheckHandler(() => false);

  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrl(url);
    return { action: 'deny' };
  });

  window.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedGameUrl(url)) {
      event.preventDefault();
      openExternalUrl(url);
    }
  });

  window.webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });

  window.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      event.preventDefault();
      window.setFullScreen(!window.isFullScreen());
    }
  });

  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
    if (isMainFrame && errorCode !== -3) {
      const message = `${errorDescription} (${errorCode})\n${validatedUrl}`;
      if (isSmokeTest) {
        finishSmokeTest(new Error(message));
      } else {
        dialog.showErrorBox('MiniDayZ PC could not start', message);
      }
    }
  });

  window.webContents.on('render-process-gone', (_event, details) => {
    const message = `Renderer process ended: ${details.reason}. Restart the game to continue.`;
    if (isSmokeTest) {
      finishSmokeTest(new Error(message));
    } else {
      dialog.showErrorBox('MiniDayZ PC stopped unexpectedly', message);
    }
  });

  if (isSmokeTest) {
    const timeout = setTimeout(() => {
      finishSmokeTest(new Error('Timed out while waiting for the game runtime.'));
    }, 45_000);

    window.webContents.once('did-finish-load', async () => {
      try {
        const result = await window.webContents.executeJavaScript(`(async () => {
          const deadline = Date.now() + 15_000;
          let canvas = document.getElementById('c2canvas');
          while (!canvas?.c2runtime && Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 100));
            canvas = document.getElementById('c2canvas');
          }

          const assetResponse = await fetch('config.xml', { cache: 'no-store' });
          const assetText = await assetResponse.text();
          return {
            assetLoaded: assetResponse.ok && assetText.includes('com.bistudio.minidayz.plus'),
            hasCanvas: Boolean(canvas),
            hasRuntime: typeof window.cr_createRuntime === 'function',
            hasRuntimeInstance: Boolean(canvas?.c2runtime),
            title: document.title
          };
        })()`);

        if (
          !result.assetLoaded
          || !result.hasCanvas
          || !result.hasRuntime
          || !result.hasRuntimeInstance
          || result.title !== 'Mini DAYZ'
        ) {
          throw new Error(`Unexpected game document: ${JSON.stringify(result)}`);
        }

        clearTimeout(timeout);
        finishSmokeTest();
      } catch (error) {
        clearTimeout(timeout);
        finishSmokeTest(error);
      }
    });
  }

  window.once('ready-to-show', () => {
    if (!isSmokeTest) {
      window.show();
      window.focus();
    }
  });

  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  void window.loadURL(GAME_URL);
  return window;
}

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    app.setAppUserModelId('com.lestx.minidayz.pc');
    Menu.setApplicationMenu(null);

    await protocol.handle(GAME_SCHEME, (request) => createAssetResponse(GAME_ROOT, request));
    mainWindow = createMainWindow();
  }).catch((error) => {
    dialog.showErrorBox('MiniDayZ PC could not start', error.stack || String(error));
    app.quit();
  });

  app.on('activate', () => {
    if (!mainWindow) {
      mainWindow = createMainWindow();
    }
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
