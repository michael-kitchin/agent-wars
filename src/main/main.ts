/**
 * Electron main process entry point. Creates the application window and loads
 * the renderer. Use this as the process started by Electron (see package.json main).
 */

import { app, BrowserWindow, ipcMain, screen } from 'electron';
import * as path from 'path';
import { initDatabase, getGameState, getGameStateForPlayer, resetGameForNewMatch } from './gameDb';
import {
  submitOrders,
  ready,
  listHumanStandingOrders,
  previewHumanMarchOrder,
  assignHumanMarchOrder,
  cancelHumanOrder,
} from './gameActions';
import {
  saveKey,
  hasKey,
  listModels,
  requestOrders,
  setSelectedModel,
  getSelectedModel,
  getToolNamesForEnabledGroups,
  getToolGroupList,
  TOOL_GROUP_REGISTRY,
} from './openRouter';
import { logDebug } from './logger';
import {
  getRes4TerrainOverridesForRenderer,
  getHexNamingTooltipLineForRenderer,
  getHexContinentNamesForRenderer,
  getTerrainInfrastructureHintsForRenderer,
} from './terrainClassificationCache';
import {
  handleRequestAiOrders,
  cancelRequestAiOrders,
  handleGameReady,
} from './gameIpcHandlers';
import type {
  SubmitOrdersPayload,
  ReadyResult,
  GameReadyIpcPayload,
  RequestAiOrdersResult,
} from '../shared/ipcTypes';

/** Ref for the in-flight requestAiOrders AbortController; used by handlers and cancel. */
const requestAiOrdersControllerRef: { current: AbortController | null } = { current: null };

/** Single application window; created on ready, closed when all windows close. */
let mainWindow: BrowserWindow | null = null;

const MIN_WINDOW_WIDTH = 800;
const MIN_WINDOW_HEIGHT = 600;

/**
 * Creates the main browser window and loads the renderer HTML.
 * Sizes the window to 3/4 of the primary display work area, centered.
 * Called after Electron app is ready. Window loads `static/index.html` at the app root (sibling of `dist/`).
 */
function createWindow(): void {
  const preloadPath = path.join(__dirname, 'preload.js');

  const primaryDisplay = screen.getPrimaryDisplay();
  const workArea = primaryDisplay.workArea;
  let width = Math.floor(workArea.width * 0.75);
  let height = Math.floor(workArea.height * 0.75);
  width = Math.max(MIN_WINDOW_WIDTH, width);
  height = Math.max(MIN_WINDOW_HEIGHT, height);
  const x = Math.floor(workArea.x + (workArea.width - width) / 2);
  const y = Math.floor(workArea.y + (workArea.height - height) / 2);

  mainWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath,
    },
  });

  const rendererPath = path.join(__dirname, '..', '..', 'static', 'index.html');
  mainWindow.loadFile(rendererPath).catch((err) => {
    console.error('Failed to load renderer:', err);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/** Wraps requestOrders with an onLog sink that forwards to the renderer status list. */
function requestOrdersWithLog(
  state: Parameters<typeof requestOrders>[0],
  modelId: string,
  options?: Parameters<typeof requestOrders>[2]
): ReturnType<typeof requestOrders> {
  const onLog = (line: string, isError?: boolean) => {
    mainWindow?.webContents?.send('openRouter:log', { line, isError: !!isError });
  };
  return requestOrders(state, modelId, { ...options, onLog });
}

function registerIpcHandlers(): void {
  ipcMain.handle('game:getState', () => getGameStateForPlayer('human'));
  ipcMain.handle('game:getRes4TerrainOverrides', () => getRes4TerrainOverridesForRenderer());
  ipcMain.handle('game:getTerrainInfrastructureHints', () => getTerrainInfrastructureHintsForRenderer());
  ipcMain.handle(
    'game:getHexNamingTooltipLine',
    (_event, payload: { h3Index?: string; resolution?: number }) => {
      if (typeof payload?.h3Index !== 'string') return null;
      if (payload?.resolution !== 1 && payload?.resolution !== 4) return null;
      return getHexNamingTooltipLineForRenderer({
        h3Index: payload.h3Index,
        resolution: payload.resolution,
      });
    }
  );
  ipcMain.handle('game:getHexContinentNames', (_event, payload: { h3Index?: string }) => {
    if (typeof payload?.h3Index !== 'string') return [];
    return getHexContinentNamesForRenderer({ h3Index: payload.h3Index });
  });
  ipcMain.handle('game:newGame', () => {
    resetGameForNewMatch();
    return getGameStateForPlayer('human');
  });
  ipcMain.handle('game:submitOrders', (_event, payload: SubmitOrdersPayload | { unitId: string; toH3Index: string }[]) => {
    const normalized: SubmitOrdersPayload = Array.isArray(payload)
      ? { movementOrders: payload }
      : {
          movementOrders: payload.movementOrders ?? [],
          rangedAttacks: payload.rangedAttacks,
        };
    return submitOrders(normalized);
  });
  ipcMain.handle('game:listHumanStandingOrders', () => listHumanStandingOrders());
  ipcMain.handle(
    'game:previewHumanMarchOrder',
    (_event, payload: { unitId?: string; hoveredH3Index?: string }) => {
      if (typeof payload?.unitId !== 'string' || typeof payload?.hoveredH3Index !== 'string') {
        return { valid: false, showInvalidMarker: false, invalidReason: 'Invalid preview payload', segments: [] };
      }
      return previewHumanMarchOrder(payload.unitId, payload.hoveredH3Index);
    }
  );
  ipcMain.handle(
    'game:assignHumanMarchOrder',
    (_event, payload: { unitId?: string; destinationH3Index?: string }) => {
      if (typeof payload?.unitId !== 'string' || typeof payload?.destinationH3Index !== 'string') {
        return { success: false, reason: 'Invalid assign payload' };
      }
      return assignHumanMarchOrder(payload.unitId, payload.destinationH3Index);
    }
  );
  ipcMain.handle('game:cancelHumanStandingOrder', (_event, payload: { unitId?: string }) => {
    if (typeof payload?.unitId !== 'string') return { success: false, reason: 'Invalid cancel payload' };
    return cancelHumanOrder(payload.unitId);
  });
  ipcMain.handle(
    'game:ready',
    async (_event, payload?: GameReadyIpcPayload): Promise<ReadyResult> => {
      return handleGameReady(payload, {
        getGameState,
        getGameStateForPlayer: (playerId: 'human' | 'opponent') =>
          getGameStateForPlayer(playerId, { maskUnexploredTerrain: playerId !== 'opponent' }),
        getSelectedModel,
        hasKey,
        getToolNamesForEnabledGroups,
        defaultGroupIds: TOOL_GROUP_REGISTRY.map((g) => g.id),
        requestOrders: requestOrdersWithLog,
        ready,
      });
    }
  );

  ipcMain.handle(
    'game:requestAiOrders',
    async (
      _event,
      payload?: { enabledToolGroups?: string[] }
    ): Promise<RequestAiOrdersResult> => {
      const state = getGameState();
      logDebug('main game:requestAiOrders', { turnNumber: state.turnNumber, phase: state.phase });
      const result = await handleRequestAiOrders(payload, {
        getGameState: () => getGameStateForPlayer('opponent', { maskUnexploredTerrain: false }),
        getSelectedModel,
        hasKey,
        getToolNamesForEnabledGroups,
        defaultGroupIds: TOOL_GROUP_REGISTRY.map((g) => g.id),
        requestOrders: requestOrdersWithLog,
        controllerRef: requestAiOrdersControllerRef,
      });
      logDebug('main game:requestAiOrders result', { success: result.success });
      return result;
    }
  );

  ipcMain.handle('game:cancelRequestAiOrders', () => {
    logDebug('main game:cancelRequestAiOrders');
    cancelRequestAiOrders(requestAiOrdersControllerRef);
  });

  ipcMain.handle('openRouter:getToolGroupList', () => getToolGroupList());
  ipcMain.handle('openRouter:getKey', () => ({ hasKey: hasKey() }));
  ipcMain.handle('openRouter:getSelectedModel', () => getSelectedModel());
  ipcMain.handle('openRouter:setKey', (_event, key: string) => {
    saveKey(typeof key === 'string' ? key : '');
  });
  ipcMain.handle('openRouter:listModels', () => listModels());
  ipcMain.handle('openRouter:setSelectedModel', (_event, modelId: string) => {
    setSelectedModel(typeof modelId === 'string' ? modelId : '');
  });
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
