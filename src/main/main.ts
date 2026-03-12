/**
 * Electron main process entry point. Creates the application window and loads
 * the renderer. Use this as the process started by Electron (see package.json main).
 */

import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { initDatabase, getGameState } from './gameDb';
import { submitOrders, ready } from './gameActions';

/** Single application window; created on ready, closed when all windows close. */
let mainWindow: BrowserWindow | null = null;

/**
 * Creates the main browser window and loads the renderer HTML.
 * Called after Electron app is ready. Window loads the built renderer from dist.
 */
function createWindow(): void {
  const preloadPath = path.join(__dirname, 'preload.js');

  mainWindow = new BrowserWindow({
    width: 900,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath,
    },
  });

  const rendererPath = path.join(__dirname, '..', 'static', 'index.html');
  mainWindow.loadFile(rendererPath).catch((err) => {
    console.error('Failed to load renderer:', err);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function registerIpcHandlers(): void {
  ipcMain.handle('game:getState', () => getGameState());
  ipcMain.handle('game:submitOrders', (_event, orders: { unitId: string; toH3Index: string }[]) =>
    submitOrders(orders)
  );
  ipcMain.handle('game:ready', () => ready());
}

app.whenReady().then(async () => {
  await initDatabase();
  registerIpcHandlers();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
