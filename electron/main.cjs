const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

const PROJECT_ROOT = path.join(__dirname, '..');

// Prevent multiple instances of the app
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.log('Another instance is already running. Quitting.');
  app.quit();
  process.exit(0);
}

// Focus existing window when second instance is attempted
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

let mainWindow = null;
let botProcess = null;
let store = null;
let tray = null;

async function initStore() {
  const StoreModule = await import('electron-store');
  store = new StoreModule.default();
}

function registerHandlers() {
  ipcMain.handle('get-env', () => {
    return store.store;
  });

  ipcMain.handle('start-bot', (_event, envVars) => {
    if (botProcess) {
      return { error: 'Bot is already running' };
    }

    store.set(envVars);

    console.log('Spawning bot process from:', PROJECT_ROOT);
    
    botProcess = spawn(process.execPath, ['src/index.js'], {
      cwd: PROJECT_ROOT,
      env: { ...process.env, ...envVars },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    console.log('Bot process spawned with PID:', botProcess.pid);

    botProcess.stdout.on('data', (data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('bot-output', data.toString());
      }
    });

    botProcess.stderr.on('data', (data) => {
      const message = data.toString();
      // Filter out harmless deprecation warnings
      if (!message.includes('DeprecationWarning') && !message.includes('punycode')) {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('bot-output', `[stderr] ${message}`);
        }
      }
    });

    botProcess.on('error', (err) => {
      console.error('Bot process error:', err);
      botProcess = null;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('bot-output', `[error] ${err.message}\n`);
        mainWindow.webContents.send('bot-exited', 1);
      }
    });

    botProcess.on('close', (code) => {
      console.log('Bot process closed with code:', code);
      botProcess = null;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('bot-exited', code);
      }
    });

    return { success: true };
  });

  ipcMain.handle('stop-bot', () => {
    if (!botProcess) return { error: 'Bot is not running' };
    botProcess.kill('SIGTERM');
    return { success: true };
  });

  ipcMain.on('minimize-window', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.hide();
    }
  });

  ipcMain.handle('get-autostart', () => {
    return store.get('autoStart', false);
  });

  ipcMain.handle('set-autostart', (_event, enabled) => {
    try {
      store.set('autoStart', enabled);
      app.setLoginItemSettings({
        openAtLogin: enabled,
        path: process.execPath,
        args: ['--hidden']
      });
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 640,
    height: 560,
    resizable: true,
    title: 'Timbot Launcher',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  Menu.setApplicationMenu(null);

  mainWindow.on('minimize', (event) => {
    event.preventDefault();
    mainWindow.hide();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  try {
    const iconPath = path.join(__dirname, 'icon.png');
    const icon = nativeImage.createFromPath(iconPath);
    
    if (icon.isEmpty()) {
      return;
    }

    tray = new Tray(icon);

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show',
        click: () => {
          if (mainWindow && !mainWindow.isVisible()) {
            mainWindow.show();
            mainWindow.focus();
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          if (botProcess) botProcess.kill('SIGTERM');
          app.quit();
        }
      }
    ]);

    tray.setContextMenu(contextMenu);
    tray.setToolTip('Timbot');

    tray.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    });
  } catch (err) {
    console.error('TRAY CREATION ERROR:', err);
  }
}

app.whenReady().then(() => {
  initStore().then(() => {
    // Apply saved autostart setting
    const autoStart = store.get('autoStart', false);
    app.setLoginItemSettings({
      openAtLogin: autoStart,
      path: process.execPath,
      args: ['--hidden']
    });

    registerHandlers();
    createWindow();
    createTray();
  });
});

app.on('window-all-closed', () => {
  if (botProcess) botProcess.kill('SIGTERM');
  app.quit();
});
