/**
 * Electron main process entry point. Creates the application window and loads
 * the renderer. Use this as the process started by Electron (see package.json main).
 */

import 'dotenv/config';
import { app, BrowserWindow, ipcMain, screen } from 'electron';
import * as path from 'path';
import { AI_SEAT_IDS, aiIndexForSeatId, isAiSeatId, isSeatId, type SeatId } from '../shared/seatIds';
import { DOCTRINE_CHOICES, toSeatSnapshot, type DoctrineChoice } from '../shared/seatRoster';
import { fallbackConsultModelId, type TacticalBeatConsultArgs } from './ipc/readyIpcResolutionMapping';
import { updateSeatCommander } from './gameDb/seatRosterStore';
import { readSeatHasApiKey } from './gameDb/seatApiKeyFlags';
import { cancelModelCalls } from './openRouter/modelCallControl';
import { readMatchSnapshot } from './ipc/matchViewSnapshot';
import {
  initDatabase,
  getGameState,
  getGameStateForPlayer,
  resetGameForNewMatch,
  getTacticalTerrainOverridesForRendererFromGame,
  listScenarioHomeRegions,
  dbGetAll,
  dbRun,
  getSeatRoster,
} from './gameDb';
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
  commitHumanTacticalDraftOrders,
  validateGroupRangedTarget,
  validateGroupAirStrikeTarget,
  validateGroupFerryTarget,
  cancelHumanOrder,
  resolveMeleeIntercept,
} from './gameActions';
import { clearStrategicPreviousHexMemory } from './strategicUnitPreviousHex';
import {
  endTacticalBattleSession,
  endTacticalBattleSessionForHumanVoluntaryExitBailout,
  startTacticalBattleForEnclosingHex,
} from './tacticalBattle/tacticalBattleSession';
import { restorePersistedTacticalBattleSession } from './tacticalBattle/tacticalBattleSession';
import { normalizeSubmitOrdersPayload } from './submitOrdersPayload';
import {
  parseGroupedTargetPayload,
  parseGroupedStrikePayload,
  parseGroupedDestinationPayload,
  parseUnitIdList,
  parseHumanTacticalCommitPayload,
} from './ipcPayloadGuards';
import { IPC_GAME, IPC_OPENROUTER } from '../shared/ipc/channels';
import { registerLoggedIpcHandler } from './ipc/loggedIpcHandler';
import { registerBuildQueueSealiftIpcHandler } from './ipc/buildQueueSealiftIpcHandler';
import { registerOpenRouterIpcHandler } from './ipc/openRouterIpcHandler';
import { registerCommanderPoolIpcHandler } from './ipc/commanderPoolIpcHandler';
import { registerEndMatchIpcHandler } from './ipc/endMatchIpcHandler';
import { registerMissileLaunchIpcHandler } from './ipc/missileLaunchIpcHandler';
import { forgetAutoSaveTurnKey, rememberCurrentAutoSaveTurnKey, registerSaveLoadIpcHandler, runWithReadyInFlight, withAutoSaveAfter } from './ipc/saveLoadIpcHandler';
import { resetCommanderPool } from './openRouter/commanderPool';
import { readSeatApiKey, storeNewMatchCommanderKeys, updateRememberedCommander, writeSeatApiKey } from './openRouter/commanderKeyMemory';
import {
  hasKey,
  loadKey,
  requestOrders,
  applyAppWideCommanderToLegacySeat,
  getSelectedModel,
  getToolNamesForEnabledGroups,
  TOOL_GROUP_REGISTRY,
} from './openRouter/openRouter';
import { logDebug, logError } from './logger';
import { applyUserDataDirOverride } from './userDataDirOverride';
import { parseBonusLevel } from '../shared/bonusLevel';
import { parseGameSize } from '../shared/gameSize';
import {
  getHexNamingTooltipLineForRenderer,
  getHexContinentNamesForRenderer,
  getStrategicBaselineUrbanHexCountsForRenderer,
  getTacticalCityOverlaysForRenderer,
  getTacticalRoadRailOverlaysForRenderer,
  getTacticalTransportVectorOverlaysForRenderer,
} from './terrainClassificationCache';
import {
  handleGameReady,
  handleResolveMeleeIntercept,
  POST_RESOLUTION_CONSULT_TIMEOUT_MS,
  type ReadyDeps,
} from './gameIpcHandlers';
import {
  clearDeferredPlaybackConsultPending,
  handleNotifyResolutionPlaybackComplete,
  hasDeferredPlaybackConsultPending,
  setPendingTacticalBeatConsult,
} from './ipc/deferredResolutionPlaybackConsult';
import { stopModelWork } from './ipc/modelWorkCancellation';
import { parseModelCallCancelReason } from '../shared/ipc/modelCallCancelTypes';
import type {
  SubmitOrdersPayload,
  ReadyResult,
  GameReadyIpcPayload,
  NewGameIpcPayload,
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
 * Expected outcome: A window about three quarters of the work area, centered, at least 800 by 600, loading `static/index.html`. Closing it clears `mainWindow`. A load failure and a renderer crash are logged.
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
  ipcMain.handle(IPC_GAME.newGame, (_event, payload: NewGameIpcPayload | undefined) => withAutoSaveAfter(() => {
    stopModelWork('new_game', sendActivityLog);
    const fogOfWarEnabled = payload?.fogOfWarEnabled !== false;
    const gameSize = parseGameSize(payload?.gameSize);
    const originBonusLevel = parseBonusLevel(payload?.originBonusLevel, 'off');
    const terrainBonusLevel = parseBonusLevel(payload?.terrainBonusLevel, 'off');
    const weatherBonusLevel = parseBonusLevel(payload?.weatherBonusLevel, 'off');
    const techBonusLevel = parseBonusLevel(payload?.techBonusLevel, 'off');
    const startMonth = payload?.startMonth;
    logDebug('main game:newGame', {
      fogOfWarEnabled,
      gameSize,
      originBonusLevel,
      terrainBonusLevel,
      weatherBonusLevel,
      techBonusLevel,
      startMonth,
      gameMapId: payload?.gameMapId ?? null,
      seatCount: payload?.seats?.length ?? null,
      turnLimit: payload?.turnLimit ?? null,
      victoryRule: payload?.victoryRule ?? null,
    });
    resetGameForNewMatch({
      fogOfWarEnabled,
      gameSize,
      originBonusLevel,
      terrainBonusLevel,
      weatherBonusLevel,
      techBonusLevel,
      startMonth,
      gameMapId: payload?.gameMapId,
      seats: payload?.seats,
      turnLimit: payload?.turnLimit,
      victoryRule: payload?.victoryRule,
    });
    forgetAutoSaveTurnKey();
    storeNewMatchCommanderKeys(payload?.seats, loadKey());
    if (!payload?.seats) applyAppWideCommanderToLegacySeat();
    resetCommanderPool(getSeatRoster());
    clearDeferredPlaybackConsultPending();
    clearStrategicPreviousHexMemory();
    endTacticalBattleSession();
    return readMatchSnapshot(undefined);
  }));
  ipcMain.handle(IPC_GAME.setSeatCommander, (_event, seatId: unknown, commander: unknown) => {
    if (typeof seatId !== 'string' || !isSeatId(seatId) || !isAiSeatId(seatId)) {
      throw new Error(`Cannot update a commander for ${String(seatId)}`);
    }
    if (!commander || typeof commander !== 'object') throw new Error('Invalid commander update');
    const patch = commander as { modelId?: unknown; reasoningEffort?: unknown; doctrineChoice?: unknown; apiKey?: unknown };
    if (patch.modelId !== null && typeof patch.modelId !== 'string') throw new Error('Invalid commander model');
    if (patch.reasoningEffort !== null && typeof patch.reasoningEffort !== 'string') throw new Error('Invalid commander effort');
    if (patch.apiKey !== undefined && typeof patch.apiKey !== 'string') throw new Error('Invalid commander key');
    if (!(DOCTRINE_CHOICES as readonly string[]).includes(String(patch.doctrineChoice))) {
      throw new Error('Invalid commander doctrine');
    }
    const before = getSeatRoster().find((row) => row.seatId === seatId);
    const updated = updateSeatCommander({ run: dbRun, getAll: dbGetAll }, seatId, {
      modelId: patch.modelId,
      reasoningEffort: patch.reasoningEffort,
      doctrineChoice: patch.doctrineChoice as DoctrineChoice,
    });
    const suppliedKey = typeof patch.apiKey === 'string' ? patch.apiKey : null;
    if (suppliedKey !== null) writeSeatApiKey(seatId, suppliedKey, loadKey());
    const aiNumber = aiIndexForSeatId(seatId);
    if (aiNumber !== null) {
      updateRememberedCommander(aiNumber, {
        modelId: typeof patch.modelId === 'string' ? patch.modelId : null,
        reasoningEffort: typeof patch.reasoningEffort === 'string' ? patch.reasoningEffort : null,
        doctrineChoice: patch.doctrineChoice as DoctrineChoice,
        apiKey: suppliedKey ?? readSeatApiKey(seatId, loadKey()),
      });
    }
    const modelChanged = (before?.commander?.modelId ?? null) !== patch.modelId;
    const effortChanged = (before?.commander?.reasoningEffort ?? null) !== patch.reasoningEffort;
    if (modelChanged || effortChanged) cancelModelCalls('model_changed', 'all', seatId);
    const hasApiKey = readSeatHasApiKey(seatId);
    logDebug('main game:setSeatCommander', { seatId, modelChanged, effortChanged, hasApiKey });
    return toSeatSnapshot(updated, getGameState().gameOver === true, hasApiKey);
  });
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
  ipcMain.handle(IPC_GAME.commitHumanTacticalDraftOrders, async (_event, payload: unknown) => withAutoSaveAfter(async () => {
    if (hasDeferredPlaybackConsultPending()) {
      return { success: false, reason: 'Resolution playback consultation is still in progress.' };
    }
    const parsed = parseHumanTacticalCommitPayload(payload);
    if (!parsed.ok) return { success: false, reason: parsed.reason };
    const v = parsed.value;
    const result = commitHumanTacticalDraftOrders({
      movementOrders: v.movementOrders,
      rangedAttacks: v.rangedAttacks,
      airStrikes: v.airStrikes,
      ferryOrders: v.ferryOrders,
      embarkOrders: v.embarkOrders,
      opponentTacticalDraft: v.opponentTacticalDraft,
    });
    if (
      !result.success ||
      !result.tacticalBattle ||
      !result.tacticalResolutionPlayback ||
      !v.useEventDrivenConsultation ||
      !v.aiPlanningRunEnabled
    ) {
      return result;
    }
    const modelId = fallbackConsultModelId(getSelectedModel);
    const enabledToolNames = getToolNamesForEnabledGroups(TOOL_GROUP_REGISTRY.map((g) => g.id));
    const battleId = result.tacticalBattle.battleId;
    const consultArgs: TacticalBeatConsultArgs = {
      useEventDrivenConsultation: v.useEventDrivenConsultation,
      aiPlanningRunEnabled: v.aiPlanningRunEnabled,
      tacticalBattle: result.tacticalBattle,
      tacticalResolutionPlayback: result.tacticalResolutionPlayback,
      modelId,
      enabledToolNames,
      hasKey,
      requestOrders: requestOrdersWithLog,
      timeoutMs: POST_RESOLUTION_CONSULT_TIMEOUT_MS,
      errorLogMessage: 'commitHumanTacticalDraftOrders: tactical after-beat consultation failed or timed out',
    };
    setPendingTacticalBeatConsult(battleId, consultArgs);
    logDebug('main commitHumanTacticalDraftOrders: deferred tactical post-beat consult until playback notify', {
      battleId,
    });
    return { ...result, tacticalPostBeatConsultDeferred: true };
  }));
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
    (_event, payload: { unitIds?: string[]; targetH3Index?: string; targetType?: 'units' | 'urban' | 'airport' | 'seaport' }) => {
      const parsed = parseGroupedStrikePayload(payload);
      if (!parsed) {
        return { success: false, reason: 'Invalid grouped strike payload' };
      }
      return validateGroupAirStrikeTarget(parsed.unitIds, parsed.targetH3Index, parsed.targetType);
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
    endTacticalBattleSessionForHumanVoluntaryExitBailout();
    return { success: true as const };
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

  registerOpenRouterIpcHandler(ipcMain);
  registerCommanderPoolIpcHandler(ipcMain);
  registerEndMatchIpcHandler(ipcMain);
  registerMissileLaunchIpcHandler(ipcMain);
  registerSaveLoadIpcHandler(ipcMain, () => mainWindow, sendActivityLog);
}

applyVersionedAppName();
applyUserDataDirOverride(app);

process.on('uncaughtException', (err) => {
  logError('main uncaughtException', { message: err?.message ?? String(err), stack: err?.stack ?? null });
});
process.on('unhandledRejection', (reason) => {
  logError('main unhandledRejection', reason);
});

app.whenReady().then(async () => {
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
