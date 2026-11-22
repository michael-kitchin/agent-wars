/**
 * Electron main process entry point. Creates the application window and loads
 * the renderer. Use this as the process started by Electron (see package.json main).
 */

import 'dotenv/config';
import { app, BrowserWindow, ipcMain, protocol, screen, shell } from 'electron';
import * as path from 'path';
import { AI_SEAT_IDS, isAiSeatId, type SeatId } from '../shared/seatIds';
import { readMatchSnapshot } from './ipc/matchViewSnapshot';
import {
  initDatabase,
  getGameState,
  getGameStateForPlayer,
  getTacticalTerrainOverridesForRendererFromGame,
  listScenarioHomeRegions,
} from './gameDb';
import { handleBasemapProtocol } from './basemap/basemapProtocolHandler';
import { registerBasemapIpc } from './basemap/basemapIpc';
import { listGameMaps } from './gameMap/listGameMaps';
import { buildNewGameMapPreview } from './gameMap/newGameMapPreview';
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
  validateGroupAirDropTarget,
  validateGroupFerryTarget,
  cancelHumanOrder,
  resolveMeleeIntercept,
} from './gameActions';
import {
  endTacticalBattleSessionForHumanVoluntaryExitBailout,
  endTacticalBattleSessionForTwoPartyVoluntaryExit,
  getActiveTacticalBattleSnapshot,
  startTacticalBattleForEnclosingHex,
} from './tacticalBattle/tacticalBattleSession';
import { restorePersistedTacticalBattleSession } from './tacticalBattle/tacticalBattleSession';
import { normalizeSubmitOrdersPayload } from './submitOrdersPayload';
import {
  parseGroupedTargetPayload,
  parseGroupedStrikePayload,
  parseGroupedDestinationPayload,
  parseUnitIdList,
} from './ipcPayloadGuards';
import { IPC_GAME, IPC_OPENROUTER } from '../shared/ipc/channels';
import { registerLoggedIpcHandler } from './ipc/loggedIpcHandler';
import { registerBuildQueueSealiftIpcHandler } from './ipc/buildQueueSealiftIpcHandler';
import { registerOpenRouterIpcHandler } from './ipc/openRouterIpcHandler';
import { registerCommanderPoolIpcHandler } from './ipc/commanderPoolIpcHandler';
import { registerEndMatchIpcHandler } from './ipc/endMatchIpcHandler';
import { registerMatchChartsIpcHandler } from './ipc/matchChartsIpcHandler';
import { registerReplayIpcHandler } from './ipc/replayIpcHandler';
import { registerHowToPlayIpcHandler } from './ipc/howToPlayIpcHandler';
import { registerNewGameIpcHandler } from './ipc/newGameIpcHandler';
import { registerTacticalCommitIpcHandler } from './ipc/tacticalCommitIpcHandler';
import { registerSideMessageIpcHandler } from './ipc/sideMessageIpcHandler';
import { registerHumanNicknameIpcHandler } from './ipc/humanNicknameIpcHandler';
import { registerMatchOptionsIpcHandler } from './ipc/matchOptionsIpcHandler';
import { registerSeatCommanderIpcHandler } from './ipc/seatCommanderIpcHandler';
import { registerMissileLaunchIpcHandler } from './ipc/missileLaunchIpcHandler';
import { registerRangedTargetOddsIpcHandler } from './ipc/rangedTargetOddsIpc';
import { registerMercenaryIpcHandler } from './ipc/mercenaryIpcHandler';
import { rememberCurrentAutoSaveTurnKey, registerSaveLoadIpcHandler, runWithReadyInFlight, withAutoSaveAfter } from './ipc/saveLoadIpcHandler';
import {
  hasKey,
  requestOrders,
  getSelectedModel,
  getToolNamesForEnabledGroups,
  TOOL_GROUP_REGISTRY,
} from './openRouter/openRouter';
import { logDebug, logError } from './logger';
import { claimSingleInstanceLock } from './singleInstanceLock';
import { applyUserDataDirOverride } from './userDataDirOverride';
import {
  getHexNamingTooltipLineForRenderer,
  getHexContinentNamesForRenderer,
  getStrategicBaselineUrbanHexCountsForRenderer,
  getTacticalCityOverlaysForRenderer,
  getTacticalRoadRailOverlaysForRenderer,
  getTacticalTransportVectorOverlaysForRenderer,
} from './terrainClassificationCache';
import { handleGameReady, handleResolveMeleeIntercept, type ReadyDeps } from './gameIpcHandlers';
import { clearDeferredPlaybackConsultPending, handleNotifyResolutionPlaybackComplete, hasDeferredPlaybackConsultPending } from './ipc/deferredResolutionPlaybackConsult';
import { stopModelWork } from './ipc/modelWorkCancellation';
import { parseModelCallCancelReason } from '../shared/ipc/modelCallCancelTypes';
import type { AirStrikeTargetType } from '../shared/ipc/ordersTypes';
import type {
  SubmitOrdersPayload,
  ReadyResult,
  GameReadyIpcPayload,
  NewGameMapPreviewRequest,
  ResolveMeleeInterceptIpcPayload,
} from '../shared/ipcTypes';

/**
 * The game window, or null before it opens and after it closes.
 *
 * Purpose: Log lines and the closed handler need the window that is actually open.
 * When to use: `createWindow`, and when sending a commander log line to the renderer.
 * Expected outcome: Null until `createWindow` assigns it. Null again after the window closes.
 * Exceptions: None.
 */
let mainWindow: BrowserWindow | null = null;

/**
 * The narrowest window the game will open, in pixels.
 *
 * Purpose: A small work area must not clip the map and the console.
 * When to use: `createWindow`, for both the opening width and `minWidth`.
 * Expected outcome: 800.
 * Exceptions: None.
 */
const MIN_WINDOW_WIDTH = 800;
/**
 * The shortest window the game will open, in pixels.
 *
 * Purpose: A short work area must not clip the top bar and the map.
 * When to use: `createWindow`, for both the opening height and `minHeight`.
 * Expected outcome: 600.
 * Exceptions: None.
 */
const MIN_WINDOW_HEIGHT = 600;
/**
 * The text before the version in the app name.
 *
 * Purpose: The window and the OS show which build is running.
 * When to use: `applyVersionedAppName`.
 * Expected outcome: The prefix `Agent Wars v`, with the version appended.
 * Exceptions: None.
 */
const VERSIONED_APP_NAME_PREFIX = 'Agent Wars v';

/**
 * Sets the process name to the prefix plus the app version.
 *
 * Purpose: The title and the task switcher name the build.
 * When to use: Once, when the app is ready.
 * Expected outcome: `app.setName` receives `Agent Wars v` plus `app.getVersion()`.
 * Exceptions: None.
 */
function applyVersionedAppName(): void {
  const versionedName = `${VERSIONED_APP_NAME_PREFIX}${app.getVersion()}`;
  app.setName(versionedName);
  logDebug('main applyVersionedAppName', { versionedName });
}

/**
 * Opens the game window on the primary display and loads the renderer.
 *
 * Purpose: The player gets one window, sized to the work area and not smaller than the minimums.
 * When to use: When the app is ready, and again if every window has closed on macOS activate.
 * Expected outcome: A window about three quarters of the work area, centered, at least 800 by 600, loading `static/index.html`. Background throttling is off, so a minimized or hidden window keeps advancing a match at full speed. Closing it clears `mainWindow`. A load failure and a renderer crash are logged.
 * Exceptions: Logs and does not throw when the renderer file fails to load.
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
    // The game menu in the top bar replaces Electron's default menu bar. Alt still shows it, and its shortcuts still work.
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath,
      // Auto-advance presses Ready from renderer timers. Chromium's background throttling would slow a minimized match to a crawl.
      backgroundThrottling: false,
    },
  });

  const rendererPath = path.join(__dirname, '..', '..', 'static', 'index.html');
  mainWindow.loadFile(rendererPath).catch((err) => {
    logError('main: failed to load renderer index', err);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logError('main renderer process exited unexpectedly', {
      reason: details.reason,
      exitCode: details.exitCode,
    });
  });
}

/**
 * Requests orders and sends each log line to the open window.
 *
 * Purpose: The Commanders tab shows the consult log while the model runs.
 * When to use: Ready and tactical commit, as their `requestOrders`.
 * Expected outcome: The same result as `requestOrders`. A missing seat id is logged as the first AI seat. Lines go to `IPC_OPENROUTER.log` when a window is open.
 * Exceptions: Rejects when `requestOrders` rejects.
 */
function requestOrdersWithLog(
  state: Parameters<typeof requestOrders>[0],
  modelId: string,
  options?: Parameters<typeof requestOrders>[2]
): ReturnType<typeof requestOrders> {
  const onLog = (line: string, isError?: boolean) => {
    mainWindow?.webContents?.send(IPC_OPENROUTER.log, {
      line,
      isError: !!isError,
      seatId: options?.seatId ?? AI_SEAT_IDS[0],
    });
  };
  return requestOrders(state, modelId, { ...options, seatId: options?.seatId ?? AI_SEAT_IDS[0], onLog });
}

/**
 * Builds the shared dependency object wired into both `game:ready` and `game:resolveMeleeIntercept` IPC handlers.
 *
 * Purpose: Prevents drift when consultation hooks gain new fields — both paths stay aligned.
 * When to use: Only from `registerIpcHandlers` when binding ready and melee-intercept handlers.
 * Expected outcome: An `Omit<ReadyDeps, 'ready'>` suitable for spreading with the action-specific entrypoint. Every AI seat's snapshot keeps real terrain; the human snapshot masks unexplored hexes.
 * Exceptions: None.
 */
function buildSharedHumanReadyConsultationDeps(
  requestOrdersFn: ReadyDeps['requestOrders']
): Omit<ReadyDeps, 'ready'> {
  return {
    getGameState,
    getGameStateForPlayer: (playerId: SeatId) =>
      getGameStateForPlayer(playerId, { maskUnexploredTerrain: !isAiSeatId(playerId) }),
    getSelectedModel,
    hasKey,
    getToolNamesForEnabledGroups,
    defaultGroupIds: TOOL_GROUP_REGISTRY.map((g) => g.id),
    requestOrders: requestOrdersFn,
    appVersion: app.getVersion(),
  };
}

/**
 * Binds the game and commander IPC channels to the main-process handlers.
 *
 * Purpose: The renderer reaches the database, Ready, and the commander pool through one registration.
 * When to use: Once, before the window is created.
 * Expected outcome: Each `IPC_GAME` and commander channel used by the preload bridge has a handler. Ready and melee resolve share `buildSharedHumanReadyConsultationDeps`.
 * Exceptions: A handler may throw when its action throws. Registration itself does not throw.
 */
function registerIpcHandlers(): void {
  const sendActivityLog = (line: string): void => {
    mainWindow?.webContents?.send(IPC_OPENROUTER.log, { line, isError: false });
  };
  ipcMain.handle(IPC_GAME.getState, (_event, viewAs: unknown) => readMatchSnapshot(viewAs));
  ipcMain.handle(IPC_GAME.getTacticalTerrainOverrides, () => getTacticalTerrainOverridesForRendererFromGame());
  registerLoggedIpcHandler(
    ipcMain,
    IPC_GAME.getTacticalCityOverlays,
    'main IPC_GAME.getRes4CityOverlays',
    () => getTacticalCityOverlaysForRenderer(),
    []
  );
  registerLoggedIpcHandler(
    ipcMain,
    IPC_GAME.getTacticalRoadRailOverlays,
    'main IPC_GAME.getRes4RoadRailOverlays',
    () => getTacticalRoadRailOverlaysForRenderer(),
    []
  );
  registerLoggedIpcHandler(
    ipcMain,
    IPC_GAME.getTacticalTransportVectorOverlays,
    'main IPC_GAME.getRes4TransportVectorOverlays',
    () => getTacticalTransportVectorOverlaysForRenderer(),
    []
  );
  registerLoggedIpcHandler(
    ipcMain,
    IPC_GAME.getStrategicBaselineUrbanHexCounts,
    'main IPC_GAME.getRes1BaselineUrbanHexCounts',
    () => getStrategicBaselineUrbanHexCountsForRenderer(),
    []
  );
  ipcMain.handle(
    IPC_GAME.getHexNamingTooltipLine,
    (_event, payload: { h3Index?: string; resolution?: number }) => {
      if (typeof payload?.h3Index !== 'string') return null;
      if (payload?.resolution !== 1 && payload?.resolution !== 4) return null;
      return getHexNamingTooltipLineForRenderer({
        h3Index: payload.h3Index,
        resolution: payload.resolution,
      });
    }
  );
  ipcMain.handle(IPC_GAME.getHexContinentNames, (_event, payload: { h3Index?: string }) => {
    if (typeof payload?.h3Index !== 'string') return [];
    return getHexContinentNamesForRenderer({ h3Index: payload.h3Index });
  });
  ipcMain.handle(IPC_GAME.listScenarioHomeRegions, () => listScenarioHomeRegions());
  ipcMain.handle(IPC_GAME.listGameMaps, () => listGameMaps());
  ipcMain.handle(IPC_GAME.newGameMapPreview, (_event, request: NewGameMapPreviewRequest) =>
    buildNewGameMapPreview(request)
  );
  registerNewGameIpcHandler(ipcMain, { sendActivityLog });
  ipcMain.handle(IPC_GAME.submitOrders, (_event, payload: SubmitOrdersPayload | { unitId: string; toH3Index: string }[]) => {
    const normalized: SubmitOrdersPayload = normalizeSubmitOrdersPayload(payload);
    return submitOrders(normalized);
  });
  ipcMain.handle(IPC_GAME.listHumanStandingOrders, () => listHumanStandingOrders());
  ipcMain.handle(
    IPC_GAME.previewHumanMarchOrder,
    (_event, payload: { unitId?: string; hoveredH3Index?: string }) => {
      if (typeof payload?.unitId !== 'string' || typeof payload?.hoveredH3Index !== 'string') {
        return { valid: false, showInvalidMarker: false, invalidReason: 'Invalid preview payload', segments: [] };
      }
      return previewHumanMarchOrder(payload.unitId, payload.hoveredH3Index);
    }
  );
  ipcMain.handle(
    IPC_GAME.previewHumanMarchOrders,
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
    IPC_GAME.assignHumanMarchOrder,
    (_event, payload: { unitId?: string; destinationH3Index?: string }) => {
      if (typeof payload?.unitId !== 'string' || typeof payload?.destinationH3Index !== 'string') {
        return { success: false, reason: 'Invalid assign payload' };
      }
      return assignHumanMarchOrder(payload.unitId, payload.destinationH3Index);
    }
  );
  ipcMain.handle(
    IPC_GAME.assignHumanMarchOrders,
    (_event, payload: { unitIds?: string[]; destinationH3Index?: string }) => {
      const parsed = parseGroupedDestinationPayload(payload);
      if (!parsed) {
        return { success: false, reason: 'Invalid grouped assign payload' };
      }
      return assignHumanMarchOrders(parsed.unitIds, parsed.destinationH3Index);
    }
  );
  registerTacticalCommitIpcHandler(ipcMain, { requestOrders: requestOrdersWithLog });
  ipcMain.handle(
    IPC_GAME.validateGroupRangedTarget,
    (_event, payload: { unitIds?: string[]; targetH3Index?: string }) => {
      const parsed = parseGroupedTargetPayload(payload);
      if (!parsed) {
        return { success: false, reason: 'Invalid grouped ranged payload' };
      }
      return validateGroupRangedTarget(parsed.unitIds, parsed.targetH3Index);
    }
  );
  ipcMain.handle(
    IPC_GAME.validateGroupAirStrikeTarget,
    (_event, payload: { unitIds?: string[]; targetH3Index?: string; targetType?: AirStrikeTargetType }) => {
      const parsed = parseGroupedStrikePayload(payload);
      if (!parsed) {
        return { success: false, reason: 'Invalid grouped strike payload' };
      }
      return validateGroupAirStrikeTarget(parsed.unitIds, parsed.targetH3Index, parsed.targetType);
    }
  );
  ipcMain.handle(
    IPC_GAME.validateGroupAirDropTarget,
    (_event, payload: { unitIds?: string[]; targetH3Index?: string }) => {
      const parsed = parseGroupedTargetPayload(payload);
      if (!parsed) {
        return { success: false, reason: 'Invalid grouped air drop payload' };
      }
      return validateGroupAirDropTarget(parsed.unitIds, parsed.targetH3Index);
    }
  );
  ipcMain.handle(
    IPC_GAME.validateGroupFerryTarget,
    (_event, payload: { unitIds?: string[]; destinationH3Index?: string }) => {
      const parsed = parseGroupedDestinationPayload(payload);
      if (!parsed) {
        return { success: false, reason: 'Invalid grouped ferry payload' };
      }
      return validateGroupFerryTarget(parsed.unitIds, parsed.destinationH3Index);
    }
  );
  ipcMain.handle(IPC_GAME.cancelHumanStandingOrder, (_event, payload: { unitId?: string }) => {
    if (typeof payload?.unitId !== 'string') return { success: false, reason: 'Invalid cancel payload' };
    return cancelHumanOrder(payload.unitId);
  });
  registerBuildQueueSealiftIpcHandler(ipcMain);
  ipcMain.handle(IPC_GAME.startTacticalBattle, (_event, payload: { enclosingStrategicH3Index?: string }) => withAutoSaveAfter(() => {
    if (typeof payload?.enclosingStrategicH3Index !== 'string') {
      return { success: false, reason: 'Invalid tactical start payload.' };
    }
    return startTacticalBattleForEnclosingHex(payload.enclosingStrategicH3Index);
  }));
  ipcMain.handle(IPC_GAME.endTacticalBattle, () => withAutoSaveAfter(() => {
    stopModelWork('battle_exit', sendActivityLog);
    clearDeferredPlaybackConsultPending();
    const destroyedParents = getActiveTacticalBattleSnapshot()?.leadPartyId != null
      ? endTacticalBattleSessionForTwoPartyVoluntaryExit()
      : endTacticalBattleSessionForHumanVoluntaryExitBailout();
    return { success: true as const, destroyedParents };
  }));
  const sharedReadyConsultationDeps = buildSharedHumanReadyConsultationDeps(requestOrdersWithLog);
  ipcMain.handle(IPC_GAME.ready, async (_event, payload?: GameReadyIpcPayload): Promise<ReadyResult> => {
    return withAutoSaveAfter(() => runWithReadyInFlight(() => handleGameReady(payload, { ...sharedReadyConsultationDeps, ready })));
  });
  ipcMain.handle(
    IPC_GAME.resolveMeleeIntercept,
    async (_event, payload?: ResolveMeleeInterceptIpcPayload): Promise<ReadyResult> => {
      return withAutoSaveAfter(() => runWithReadyInFlight(() => handleResolveMeleeIntercept(payload, { ...sharedReadyConsultationDeps, resolveMeleeIntercept })));
    }
  );
  ipcMain.handle(IPC_GAME.notifyResolutionPlaybackComplete, async (event, payload: unknown) => {
    logDebug('main game:notifyResolutionPlaybackComplete invoke', { payload });
    return handleNotifyResolutionPlaybackComplete(event.sender, payload);
  });

  ipcMain.handle(IPC_GAME.cancelRequestAiOrders, (_event, payload?: { reason?: string }) => {
    const reason = parseModelCallCancelReason(payload?.reason);
    logDebug('main game:cancelRequestAiOrders', { reason });
    stopModelWork(reason, sendActivityLog);
  });

  registerBasemapIpc(ipcMain);
  registerOpenRouterIpcHandler(ipcMain);
  registerCommanderPoolIpcHandler(ipcMain);
  registerEndMatchIpcHandler(ipcMain, { isDeferredConsultPending: hasDeferredPlaybackConsultPending });
  registerSideMessageIpcHandler(ipcMain);
  registerMatchChartsIpcHandler(ipcMain);
  registerReplayIpcHandler(ipcMain);
  registerHowToPlayIpcHandler(ipcMain, (url) => shell.openExternal(url));
  registerHumanNicknameIpcHandler(ipcMain);
  registerMatchOptionsIpcHandler(ipcMain);
  registerSeatCommanderIpcHandler(ipcMain);
  registerMissileLaunchIpcHandler(ipcMain);
  registerRangedTargetOddsIpcHandler(ipcMain);
  registerMercenaryIpcHandler(ipcMain);
  registerSaveLoadIpcHandler(ipcMain, () => mainWindow, sendActivityLog);
}

applyVersionedAppName();
applyUserDataDirOverride(app);

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'agentwars-basemap',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

const isPrimaryInstance = claimSingleInstanceLock(app, () => mainWindow);

process.on('uncaughtException', (err) => {
  logError('main uncaughtException', { message: err?.message ?? String(err), stack: err?.stack ?? null });
});
process.on('unhandledRejection', (reason) => {
  logError('main unhandledRejection', reason);
});

if (!isPrimaryInstance) {
  app.quit();
} else {
  app.whenReady().then(async () => {
    protocol.handle('agentwars-basemap', (request) => handleBasemapProtocol(request));
    await initDatabase();
    restorePersistedTacticalBattleSession();
    rememberCurrentAutoSaveTurnKey();
    registerIpcHandlers();
    createWindow();
    app.on('child-process-gone', (_event, details) => {
      logError('main child process gone', {
        type: details.type,
        reason: details.reason,
        exitCode: details.exitCode,
        serviceName: details.serviceName ?? null,
        name: details.name ?? null,
      });
    });
  });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
