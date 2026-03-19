/**
 * Electron main process entry point. Creates the application window and loads
 * the renderer. Use this as the process started by Electron (see package.json main).
 */

import { app, BrowserWindow, ipcMain, screen } from 'electron';
import * as path from 'path';
import { initDatabase, getGameState, resetGameForNewMatch } from './gameDb';
import { submitOrders, ready, type SubmitOrdersPayload, type RangedAttackOrder } from './gameActions';
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
  handleRequestAiOrders,
  cancelRequestAiOrders,
  handleGameReady,
} from './gameIpcHandlers';

/** Ref for the in-flight requestAiOrders AbortController; used by handlers and cancel. */
const requestAiOrdersControllerRef: { current: AbortController | null } = { current: null };

/** Single application window; created on ready, closed when all windows close. */
let mainWindow: BrowserWindow | null = null;

const MIN_WINDOW_WIDTH = 800;
const MIN_WINDOW_HEIGHT = 600;

/**
 * Creates the main browser window and loads the renderer HTML.
 * Sizes the window to 3/4 of the primary display work area, centered.
 * Called after Electron app is ready. Window loads the built renderer from dist.
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

  const rendererPath = path.join(__dirname, '..', 'static', 'index.html');
  mainWindow.loadFile(rendererPath).catch((err) => {
    console.error('Failed to load renderer:', err);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

export interface AiMove {
  unitId: string;
  fromH3Index: string;
  toH3Index: string;
}

/** Count of AI ranged attacks by unit type (e.g. { armor: 2, naval: 1 }). */
export interface AiRangedByType {
  armor?: number;
  naval?: number;
}

export interface ReadyResult {
  success: boolean;
  reason?: string;
  aiSkipped?: boolean;
  aiSkipReason?: string;
  aiOrderCount?: number;
  aiRangedByType?: AiRangedByType;
  aiDropped?: number;
  aiDropReasons?: string[];
  aiMovesLog?: string[];
  aiMoves?: AiMove[];
  combatHexes?: string[];
  removedUnitIds?: string[];
  casualtyHexes?: string[];
  removedUnits?: { id: string; player: string; unitType: string; h3Index: string }[];
  rangedCombatHexes?: string[];
  rangedCasualtyHexes?: string[];
  rangedRemovedUnits?: { id: string; player: string; unitType: string; h3Index: string }[];
  meleeCombatHexes?: string[];
  meleeCasualtyHexes?: string[];
  meleeRemovedUnits?: { id: string; player: string; unitType: string; h3Index: string }[];
  kills?: { victimId: string; killerIds: string[] }[];
  killsByDirectFire?: { victimId: string; killerIds: string[] }[];
  killsByReturnFire?: { victimId: string; killerIds: string[] }[];
  aiStrategy?: string;
  /** Per-group tool invocation counts for the last AI turn. Keys are tool group ids. */
  toolInvocationCounts?: Record<string, number>;
  /** Cost in dollars for this turn's LLM call (when requestOrders was used). */
  cost?: number;
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
  ipcMain.handle('game:getState', () => getGameState());
  ipcMain.handle('game:newGame', (_event, size?: 'small' | 'medium' | 'large') => {
    resetGameForNewMatch(size ?? 'small');
    return getGameState();
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
  ipcMain.handle(
    'game:ready',
    async (
      _event,
      payload?: {
        enabledToolGroups?: string[];
        useEventDrivenConsultation?: boolean;
        precomputedAiOrders?: { unitId: string; toH3Index: string }[];
        precomputedAiRangedOrders?: RangedAttackOrder[];
      }
    ): Promise<ReadyResult> => {
      return handleGameReady(payload, {
        getGameState,
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
    ): Promise<{ success: true; orders: { unitId: string; toH3Index: string }[]; rangedAttacks?: RangedAttackOrder[]; strategy?: string; dropped?: number; dropReasons?: string[]; toolInvocationCounts?: Record<string, number>; cost?: number } | { success: false; error: string }> => {
      const state = getGameState();
      logDebug('main game:requestAiOrders', { turnNumber: state.turnNumber, phase: state.phase });
      const result = await handleRequestAiOrders(payload, {
        getGameState,
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
