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
} from './openRouter';

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
  aiStrategy?: string;
}

function registerIpcHandlers(): void {
  ipcMain.handle('game:getState', () => getGameState());
  ipcMain.handle('game:newGame', () => {
    resetGameForNewMatch();
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
  ipcMain.handle('game:ready', async (): Promise<ReadyResult> => {
    const state = getGameState();
    const modelId = getSelectedModel();
    let aiOrders: { unitId: string; toH3Index: string }[] = [];
    let aiRangedOrders: RangedAttackOrder[] = [];
    let aiSkipped = false;
    let aiDropped: number | undefined;
    let aiDropReasons: string[] | undefined;

    let aiSkipReason: string | undefined;
    let aiStrategy: string | undefined;
    if (modelId && hasKey()) {
      const result = await requestOrders(state, modelId);
      if (result.success) {
        aiOrders = result.orders;
        aiRangedOrders = result.rangedAttacks ?? [];
        aiStrategy = result.strategy;
        aiDropped = result.dropped;
        aiDropReasons = result.dropReasons?.length ? result.dropReasons : undefined;
      } else {
        aiSkipped = true;
        aiSkipReason = result.error;
      }
    } else {
      aiSkipped = true;
      aiSkipReason = !hasKey() ? 'Set your OpenRouter API key in the panel on the right.' : 'Select an AI model from the dropdown.';
    }

    const aiMoves: AiMove[] =
      aiOrders.length > 0
        ? aiOrders
            .map((o) => {
              const from = state.units.find((u) => u.id === o.unitId)?.h3Index;
              if (!from || from === o.toH3Index) return null;
              return { unitId: o.unitId, fromH3Index: from, toH3Index: o.toH3Index };
            })
            .filter((m): m is AiMove => m !== null)
        : [];

    const readyResult = ready(aiOrders, aiRangedOrders);
    if (!readyResult.success) {
      return {
        success: false,
        reason: readyResult.reason,
      };
    }
    const aiRangedByType: AiRangedByType = {};
    for (const r of aiRangedOrders) {
      const u = state.units.find((unit) => unit.id === r.unitId);
      if (u && (u.unitType === 'armor' || u.unitType === 'naval')) {
        aiRangedByType[u.unitType] = (aiRangedByType[u.unitType] ?? 0) + 1;
      }
    }
    const aiMovesLog =
      aiOrders.length > 0
        ? aiOrders.map((o) => `${o.unitId} → ${o.toH3Index}`)
        : undefined;
    return {
      success: true,
      aiSkipped: aiSkipped && aiOrders.length === 0,
      aiSkipReason,
      aiOrderCount: aiOrders.length,
      aiRangedByType: Object.keys(aiRangedByType).length > 0 ? aiRangedByType : undefined,
      aiDropped,
      aiDropReasons,
      aiMovesLog,
      aiMoves: aiMoves.length > 0 ? aiMoves : undefined,
      combatHexes: readyResult.combatHexes,
      removedUnitIds: readyResult.removedUnitIds,
      casualtyHexes: readyResult.casualtyHexes,
      removedUnits: readyResult.removedUnits,
      rangedCombatHexes: readyResult.rangedCombatHexes,
      rangedCasualtyHexes: readyResult.rangedCasualtyHexes,
      rangedRemovedUnits: readyResult.rangedRemovedUnits,
      meleeCombatHexes: readyResult.meleeCombatHexes,
      meleeCasualtyHexes: readyResult.meleeCasualtyHexes,
      meleeRemovedUnits: readyResult.meleeRemovedUnits,
      kills: readyResult.kills,
      aiStrategy,
    };
  });

  ipcMain.handle('openRouter:getKey', () => ({ hasKey: hasKey() }));
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
