/**
 * Electron main process entry point. Creates the application window and loads
 * the renderer. Use this as the process started by Electron (see package.json main).
 */

import { app, BrowserWindow, ipcMain, screen } from 'electron';
import * as path from 'path';
import {
  initDatabase,
  getGameState,
  getGameStateForPlayer,
  resetGameForNewMatch,
  getRes4TerrainOverridesForRendererFromGame,
  listScenarioHomeRegions,
} from './gameDb';
import {
  submitOrders,
  ready,
  listHumanStandingOrders,
  previewHumanMarchOrder,
  previewHumanMarchOrders,
  assignHumanMarchOrder,
  assignHumanMarchOrders,
  validateGroupRangedTarget,
  validateGroupAirStrikeTarget,
  validateGroupFerryTarget,
  cancelHumanOrder,
  getHexBuildQueue,
  addHexBuildQueueEntry,
  updateHexBuildQueueEntry,
  removeHexBuildQueueEntry,
  getSealiftStackState,
  updateSealiftSlot,
} from './gameActions';
import { normalizeSubmitOrdersPayload } from './submitOrdersPayload';
import {
  parseGroupedTargetPayload,
  parseGroupedStrikePayload,
  parseGroupedDestinationPayload,
  parseBuildQueueUpdatePayload,
  parseUnitIdList,
} from './ipcPayloadGuards';
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
} from './openrouter/openRouter';
import { logDebug } from './logger';
import {
  getHexNamingTooltipLineForRenderer,
  getHexContinentNamesForRenderer,
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
  NewGameIpcPayload,
} from '../shared/ipcTypes';

/** Ref for the in-flight requestAiOrders AbortController; used by handlers and cancel. */
const requestAiOrdersControllerRef: { current: AbortController | null } = { current: null };

/** Single application window; created on ready, closed when all windows close. */
let mainWindow: BrowserWindow | null = null;

const MIN_WINDOW_WIDTH = 800;
const MIN_WINDOW_HEIGHT = 600;
const VERSIONED_APP_NAME_PREFIX = 'Agent Wars v';

function applyVersionedAppName(): void {
  const versionedName = `${VERSIONED_APP_NAME_PREFIX}${app.getVersion()}`;
  app.setName(versionedName);
  logDebug('main applyVersionedAppName', { versionedName });
}

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
  ipcMain.handle('game:getState', () => getGameStateForPlayer('human', { maskUnexploredTerrain: false }));
  ipcMain.handle('game:getRes4TerrainOverrides', () => getRes4TerrainOverridesForRendererFromGame());
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
  ipcMain.handle('game:listScenarioHomeRegions', () => listScenarioHomeRegions());
  ipcMain.handle('game:newGame', (_event, payload: NewGameIpcPayload | undefined) => {
    const fogOfWarEnabled = payload?.fogOfWarEnabled !== false;
    logDebug('main game:newGame', {
      fogOfWarEnabled,
      requestedHumanHomeRegion: payload?.humanHomeRegion ?? '',
      requestedAiHomeRegion: payload?.aiHomeRegion ?? '',
    });
    resetGameForNewMatch({
      fogOfWarEnabled,
      humanHomeRegion: payload?.humanHomeRegion,
      aiHomeRegion: payload?.aiHomeRegion,
    });
    return getGameStateForPlayer('human', { maskUnexploredTerrain: false });
  });
  ipcMain.handle('game:submitOrders', (_event, payload: SubmitOrdersPayload | { unitId: string; toH3Index: string }[]) => {
    const normalized: SubmitOrdersPayload = normalizeSubmitOrdersPayload(payload);
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
    'game:previewHumanMarchOrders',
    (_event, payload: { unitIds?: string[]; hoveredH3Index?: string }) => {
      if (!Array.isArray(payload?.unitIds) || typeof payload?.hoveredH3Index !== 'string') {
        return {
          validForAll: false,
          showInvalidMarker: false,
          invalidReason: 'Invalid grouped preview payload',
          slowestMovementRange: 0,
          previews: [],
        };
      }
      const unitIds = parseUnitIdList(payload.unitIds) ?? [];
      return previewHumanMarchOrders(unitIds, payload.hoveredH3Index);
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
  ipcMain.handle(
    'game:assignHumanMarchOrders',
    (_event, payload: { unitIds?: string[]; destinationH3Index?: string }) => {
      const parsed = parseGroupedDestinationPayload(payload);
      if (!parsed) {
        return { success: false, reason: 'Invalid grouped assign payload' };
      }
      return assignHumanMarchOrders(parsed.unitIds, parsed.destinationH3Index);
    }
  );
  ipcMain.handle(
    'game:validateGroupRangedTarget',
    (_event, payload: { unitIds?: string[]; targetH3Index?: string }) => {
      const parsed = parseGroupedTargetPayload(payload);
      if (!parsed) {
        return { success: false, reason: 'Invalid grouped ranged payload' };
      }
      return validateGroupRangedTarget(parsed.unitIds, parsed.targetH3Index);
    }
  );
  ipcMain.handle(
    'game:validateGroupAirStrikeTarget',
    (_event, payload: { unitIds?: string[]; targetH3Index?: string; targetType?: 'units' | 'urban' | 'airport' | 'seaport' }) => {
      const parsed = parseGroupedStrikePayload(payload);
      if (!parsed) {
        return { success: false, reason: 'Invalid grouped strike payload' };
      }
      return validateGroupAirStrikeTarget(parsed.unitIds, parsed.targetH3Index, parsed.targetType);
    }
  );
  ipcMain.handle(
    'game:validateGroupFerryTarget',
    (_event, payload: { unitIds?: string[]; destinationH3Index?: string }) => {
      const parsed = parseGroupedDestinationPayload(payload);
      if (!parsed) {
        return { success: false, reason: 'Invalid grouped ferry payload' };
      }
      return validateGroupFerryTarget(parsed.unitIds, parsed.destinationH3Index);
    }
  );
  ipcMain.handle('game:cancelHumanStandingOrder', (_event, payload: { unitId?: string }) => {
    if (typeof payload?.unitId !== 'string') return { success: false, reason: 'Invalid cancel payload' };
    return cancelHumanOrder(payload.unitId);
  });
  ipcMain.handle('game:getHexBuildQueue', (_event, payload: { h3Index?: string }) => {
    if (typeof payload?.h3Index !== 'string') return null;
    return getHexBuildQueue(payload.h3Index, 'human');
  });
  ipcMain.handle('game:addHexBuildQueueEntry', (_event, payload: { h3Index?: string }) => {
    if (typeof payload?.h3Index !== 'string') return { success: false, reason: 'Invalid build-queue payload' };
    return addHexBuildQueueEntry(payload.h3Index, 'human');
  });
  ipcMain.handle(
    'game:updateHexBuildQueueEntry',
    (_event, payload: { h3Index?: string; entryId?: number; unitType?: 'infantry' | 'armor' | 'naval' | 'air'; count?: number }) => {
      const parsed = parseBuildQueueUpdatePayload(payload);
      if (!parsed) {
        return { success: false, reason: 'Invalid build-queue payload' };
      }
      return updateHexBuildQueueEntry(parsed.h3Index, parsed.entryId, parsed.unitType, parsed.count, 'human');
    }
  );
  ipcMain.handle('game:removeHexBuildQueueEntry', (_event, payload: { h3Index?: string; entryId?: number }) => {
    if (typeof payload?.h3Index !== 'string' || typeof payload?.entryId !== 'number') {
      return { success: false, reason: 'Invalid build-queue payload' };
    }
    return removeHexBuildQueueEntry(payload.h3Index, payload.entryId, 'human');
  });
  ipcMain.handle('game:getSealiftStackState', (_event, payload: { h3Index?: string }) => {
    if (typeof payload?.h3Index !== 'string') {
      return {
        h3Index: '',
        showSealiftSection: false,
        contextMode: 'unsupported',
        controlsDisabled: true,
        hasEmbarkedUnitsInStack: false,
        navalRows: [],
        landOptions: [],
      };
    }
    return getSealiftStackState(payload.h3Index);
  });
  ipcMain.handle(
    'game:updateSealiftSlot',
    (_event, payload: { h3Index?: string; navalUnitId?: string; slotIndex?: number; landUnitId?: string | null }) => {
      if (
        typeof payload?.h3Index !== 'string' ||
        typeof payload?.navalUnitId !== 'string' ||
        (payload?.slotIndex !== 1 && payload?.slotIndex !== 2)
      ) {
        return { success: false, reason: 'Invalid sealift payload' };
      }
      const landUnitId =
        payload.landUnitId === null || typeof payload.landUnitId === 'string'
          ? payload.landUnitId
          : null;
      return updateSealiftSlot(payload.h3Index, payload.navalUnitId, payload.slotIndex, landUnitId);
    }
  );
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

applyVersionedAppName();

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
