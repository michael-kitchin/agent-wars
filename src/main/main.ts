/**
 * Electron main process entry point. Creates the application window and loads
 * the renderer. Use this as the process started by Electron (see package.json main).
 */

import 'dotenv/config';
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
  commitHumanTacticalDraftOrders,
  validateGroupRangedTarget,
  validateGroupAirStrikeTarget,
  validateGroupFerryTarget,
  cancelHumanOrder,
  getHexBuildQueue,
  addHexBuildQueueEntry,
  updateHexBuildQueueEntry,
  removeHexBuildQueueEntry,
  getSealiftStackState,
  getTacticalSealiftStackState,
  updateTacticalSealiftSlot,
  updateSealiftSlot,
  resolveMeleeIntercept,
} from './gameActions';
import { clearStrategicPreviousHexMemory } from './strategicUnitPreviousHex';
import {
  endTacticalBattleSession,
  startTacticalBattleForEnclosingRes1Hex,
} from './tacticalBattle/tacticalBattleSession';
import { restorePersistedTacticalBattleSession } from './tacticalBattle/tacticalBattleSession';
import { normalizeSubmitOrdersPayload } from './submitOrdersPayload';
import {
  parseGroupedTargetPayload,
  parseGroupedStrikePayload,
  parseGroupedDestinationPayload,
  parseBuildQueueUpdatePayload,
  parseUnitIdList,
  parseHumanTacticalCommitPayload,
} from './ipcPayloadGuards';
import { IPC_GAME, IPC_OPENROUTER } from '../shared/ipc/channels';
import type { PostResolutionConsultPushPayload } from '../shared/ipc/readyTypes';
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
import { logDebug, logError } from './logger';
import {
  getHexNamingTooltipLineForRenderer,
  getHexContinentNamesForRenderer,
  getRes4CityOverlaysForRenderer,
  getRes4RoadRailOverlaysForRenderer,
  getRes4TransportVectorOverlaysForRenderer,
} from './terrainClassificationCache';
import {
  handleRequestAiOrders,
  cancelRequestAiOrders,
  handleGameReady,
  handleResolveMeleeIntercept,
  type ReadyDeps,
} from './gameIpcHandlers';
import { runEventDrivenAfterTacticalBeatConsultation } from './ipc/readyIpcResolutionMapping';
import type {
  SubmitOrdersPayload,
  ReadyResult,
  GameReadyIpcPayload,
  RequestAiOrdersResult,
  NewGameIpcPayload,
  ResolveMeleeInterceptIpcPayload,
} from '../shared/ipcTypes';

/**
 * Documents the module-scope binding `requestAiOrdersControllerRef` (requestAiOrdersControllerRef: { current: AbortController | null }).

 * Purpose: Supports maintainability by documenting why `requestAiOrdersControllerRef` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const requestAiOrdersControllerRef: { current: AbortController | null } = { /**
 * Documents the object literal property `current` (current: null).

 * Purpose: Supports maintainability by documenting why `current` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
current: null };

/**
 * Documents the module-scope binding `mainWindow` (mainWindow: BrowserWindow | null).

 * Purpose: Supports maintainability by documenting why `mainWindow` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
let mainWindow: BrowserWindow | null = null;

/**
 * Documents the module-scope binding `MIN_WINDOW_WIDTH` (MIN_WINDOW_WIDTH).

 * Purpose: Supports maintainability by documenting why `MIN_WINDOW_WIDTH` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const MIN_WINDOW_WIDTH = 800;
/**
 * Documents the module-scope binding `MIN_WINDOW_HEIGHT` (MIN_WINDOW_HEIGHT).

 * Purpose: Supports maintainability by documenting why `MIN_WINDOW_HEIGHT` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const MIN_WINDOW_HEIGHT = 600;
/**
 * Documents the module-scope binding `VERSIONED_APP_NAME_PREFIX` (VERSIONED_APP_NAME_PREFIX).

 * Purpose: Supports maintainability by documenting why `VERSIONED_APP_NAME_PREFIX` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const VERSIONED_APP_NAME_PREFIX = 'Agent Wars v';

/**
 * Defines the `applyVersionedAppName` function shape (function applyVersionedAppName(): void).

 * Purpose: Supports maintainability by documenting why `applyVersionedAppName` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function applyVersionedAppName(): void {
  const versionedName = `${VERSIONED_APP_NAME_PREFIX}${app.getVersion()}`;
  app.setName(versionedName);
  logDebug('main applyVersionedAppName', { versionedName });
}

/**
 * Defines the `createWindow` function shape (function createWindow(): void).

 * Purpose: Supports maintainability by documenting why `createWindow` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
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
 * Defines the `requestOrdersWithLog` function shape (function requestOrdersWithLog( state: Parameters<typeof requestOrders>[0], modelId: string, options?: Parameters<typeof requestOrders>[2] ): ReturnTyp).

 * Purpose: Supports maintainability by documenting why `requestOrdersWithLog` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function requestOrdersWithLog(
  state: Parameters<typeof requestOrders>[0],
  modelId: string,
  options?: Parameters<typeof requestOrders>[2]
): ReturnType<typeof requestOrders> {
  const onLog = (line: string, isError?: boolean) => {
    mainWindow?.webContents?.send(IPC_OPENROUTER.log, { line, isError: !!isError });
  };
  return requestOrders(state, modelId, { ...options, onLog });
}

/**
 * Builds the shared dependency object wired into both `game:ready` and `game:resolveMeleeIntercept` IPC handlers.
 *
 * Purpose: Prevents drift when consultation hooks gain new fields — both paths stay aligned.
 * When to use: Only from `registerIpcHandlers` when binding ready and melee-intercept handlers.
 * Expected outcome: An `Omit<ReadyDeps, 'ready'>` suitable for spreading with the action-specific entrypoint.
 * Exceptions: None.
 */
function buildSharedHumanReadyConsultationDeps(
  requestOrdersFn: ReadyDeps['requestOrders']
): Omit<ReadyDeps, 'ready'> {
  return {
    getGameState,
    getGameStateForPlayer: (playerId: 'human' | 'opponent') =>
      getGameStateForPlayer(playerId, { maskUnexploredTerrain: playerId !== 'opponent' }),
    getSelectedModel,
    hasKey,
    getToolNamesForEnabledGroups,
    defaultGroupIds: TOOL_GROUP_REGISTRY.map((g) => g.id),
    requestOrders: requestOrdersFn,
  };
}

/**
 * Defines the `registerIpcHandlers` function shape (function registerIpcHandlers(): void).

 * Purpose: Supports maintainability by documenting why `registerIpcHandlers` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function registerIpcHandlers(): void {
  ipcMain.handle(IPC_GAME.getState, () => getGameStateForPlayer('human', { maskUnexploredTerrain: false }));
  ipcMain.handle(IPC_GAME.getRes4TerrainOverrides, () => getRes4TerrainOverridesForRendererFromGame());
  ipcMain.handle(IPC_GAME.getRes4CityOverlays, () => {
    logDebug('main IPC_GAME.getRes4CityOverlays');
    try {
      return getRes4CityOverlaysForRenderer();
    } catch (err) {
      logError('main IPC_GAME.getRes4CityOverlays: failed', err);
      return [];
    }
  });
  ipcMain.handle(IPC_GAME.getRes4RoadRailOverlays, () => {
    logDebug('main IPC_GAME.getRes4RoadRailOverlays');
    try {
      return getRes4RoadRailOverlaysForRenderer();
    } catch (err) {
      logError('main IPC_GAME.getRes4RoadRailOverlays: failed', err);
      return [];
    }
  });
  ipcMain.handle(IPC_GAME.getRes4TransportVectorOverlays, () => {
    logDebug('main IPC_GAME.getRes4TransportVectorOverlays');
    try {
      return getRes4TransportVectorOverlaysForRenderer();
    } catch (err) {
      logError('main IPC_GAME.getRes4TransportVectorOverlays: failed', err);
      return [];
    }
  });
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
  ipcMain.handle(IPC_GAME.newGame, (_event, payload: NewGameIpcPayload | undefined) => {
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
    clearStrategicPreviousHexMemory();
    endTacticalBattleSession();
    return getGameStateForPlayer('human', { maskUnexploredTerrain: false });
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
  ipcMain.handle(IPC_GAME.commitHumanTacticalDraftOrders, async (_event, payload: unknown) => {
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
    const modelId = getSelectedModel();
    const enabledToolNames = getToolNamesForEnabledGroups(TOOL_GROUP_REGISTRY.map((g) => g.id));
    const battleId = result.tacticalBattle.battleId;
    const consultArgs = {
      useEventDrivenConsultation: v.useEventDrivenConsultation,
      aiPlanningRunEnabled: v.aiPlanningRunEnabled,
      opponentState: getGameStateForPlayer('opponent', { maskUnexploredTerrain: false }),
      tacticalBattle: result.tacticalBattle,
      tacticalResolutionPlayback: result.tacticalResolutionPlayback,
      modelId: modelId ?? '',
      enabledToolNames,
      hasKey,
      requestOrders: requestOrdersWithLog,
      timeoutMs: 120_000,
      errorLogMessage: 'commitHumanTacticalDraftOrders: tactical after-beat consultation failed or timed out',
    };
    logDebug('main commitHumanTacticalDraftOrders: scheduling deferred tactical post-beat consult', { battleId });
    setImmediate(() => {
      void (async (): Promise<void> => {
        try {
          const post = await runEventDrivenAfterTacticalBeatConsultation(consultArgs);
          logDebug('main commitHumanTacticalDraftOrders: deferred tactical post-beat consult finished', {
            battleId,
            hasPlan: Boolean(post.tacticalOpponentPlan),
            hasStrategy: Boolean(post.aiStrategy),
            attach: post.attachTacticalOpponentPlanToIpc === true,
          });
          const attach = post.attachTacticalOpponentPlanToIpc === true;
          const push: PostResolutionConsultPushPayload = {
            kind: 'tactical',
            battleId,
            attachTacticalOpponentPlanToIpc: attach,
            ...(attach ? { tacticalOpponentPlan: post.tacticalOpponentPlan ?? null } : {}),
            ...(post.aiStrategy ? { aiStrategy: post.aiStrategy } : {}),
            ...(post.toolInvocationCounts ? { toolInvocationCounts: post.toolInvocationCounts } : {}),
          };
          mainWindow?.webContents.send(IPC_GAME.postResolutionConsultPush, push);
        } catch (err) {
          logError('commitHumanTacticalDraftOrders: deferred tactical post-beat consult', err);
          const fallbackPush: PostResolutionConsultPushPayload = {
            kind: 'tactical',
            battleId,
            attachTacticalOpponentPlanToIpc: false,
          };
          mainWindow?.webContents.send(IPC_GAME.postResolutionConsultPush, fallbackPush);
        }
      })();
    });
    return result;
  });
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
  ipcMain.handle(IPC_GAME.getHexBuildQueue, (_event, payload: { h3Index?: string }) => {
    if (typeof payload?.h3Index !== 'string') return null;
    return getHexBuildQueue(payload.h3Index, 'human');
  });
  ipcMain.handle(IPC_GAME.addHexBuildQueueEntry, (_event, payload: { h3Index?: string }) => {
    if (typeof payload?.h3Index !== 'string') return { success: false, reason: 'Invalid build-queue payload' };
    return addHexBuildQueueEntry(payload.h3Index, 'human');
  });
  ipcMain.handle(
    IPC_GAME.updateHexBuildQueueEntry,
    (_event, payload: { h3Index?: string; entryId?: number; unitType?: 'infantry' | 'armor' | 'naval' | 'air'; count?: number }) => {
      const parsed = parseBuildQueueUpdatePayload(payload);
      if (!parsed) {
        return { success: false, reason: 'Invalid build-queue payload' };
      }
      return updateHexBuildQueueEntry(parsed.h3Index, parsed.entryId, parsed.unitType, parsed.count, 'human');
    }
  );
  ipcMain.handle(IPC_GAME.removeHexBuildQueueEntry, (_event, payload: { h3Index?: string; entryId?: number }) => {
    if (typeof payload?.h3Index !== 'string' || typeof payload?.entryId !== 'number') {
      return { success: false, reason: 'Invalid build-queue payload' };
    }
    return removeHexBuildQueueEntry(payload.h3Index, payload.entryId, 'human');
  });
  ipcMain.handle(IPC_GAME.getSealiftStackState, (_event, payload: { h3Index?: string }) => {
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
  ipcMain.handle(IPC_GAME.getTacticalSealiftStackState, (_event, payload: { h3Index?: string }) => {
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
    return getTacticalSealiftStackState(payload.h3Index);
  });
  ipcMain.handle(
    IPC_GAME.updateTacticalSealiftSlot,
    (_event, payload: { h3Index?: string; navalUnitId?: string; slotIndex?: number; landUnitId?: string | null }) => {
      if (
        typeof payload?.h3Index !== 'string' ||
        typeof payload?.navalUnitId !== 'string' ||
        (payload?.slotIndex !== 1 && payload?.slotIndex !== 2)
      ) {
        return { success: false, reason: 'Invalid tactical sealift payload' };
      }
      const landUnitId =
        payload.landUnitId === null || typeof payload.landUnitId === 'string'
          ? payload.landUnitId
          : null;
      return updateTacticalSealiftSlot(payload.h3Index, payload.navalUnitId, payload.slotIndex, landUnitId);
    }
  );
  ipcMain.handle(
    IPC_GAME.updateSealiftSlot,
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
  ipcMain.handle(IPC_GAME.startTacticalBattle, (_event, payload: { enclosingRes1H3Index?: string }) => {
    if (typeof payload?.enclosingRes1H3Index !== 'string') {
      return { success: false, reason: 'Invalid tactical start payload.' };
    }
    return startTacticalBattleForEnclosingRes1Hex(payload.enclosingRes1H3Index);
  });
  ipcMain.handle(IPC_GAME.endTacticalBattle, () => {
    endTacticalBattleSession();
    return { success: true as const };
  });
  const sharedReadyConsultationDeps = buildSharedHumanReadyConsultationDeps(requestOrdersWithLog);
  ipcMain.handle(IPC_GAME.ready, async (_event, payload?: GameReadyIpcPayload): Promise<ReadyResult> => {
    return handleGameReady(payload, { ...sharedReadyConsultationDeps, ready });
  });
  ipcMain.handle(
    IPC_GAME.resolveMeleeIntercept,
    async (_event, payload?: ResolveMeleeInterceptIpcPayload): Promise<ReadyResult> => {
      return handleResolveMeleeIntercept(payload, { ...sharedReadyConsultationDeps, resolveMeleeIntercept });
    }
  );

  ipcMain.handle(
    IPC_GAME.requestAiOrders,
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

  ipcMain.handle(IPC_GAME.cancelRequestAiOrders, () => {
    logDebug('main game:cancelRequestAiOrders');
    cancelRequestAiOrders(requestAiOrdersControllerRef);
  });

  ipcMain.handle(IPC_OPENROUTER.getToolGroupList, () => getToolGroupList());
  ipcMain.handle(IPC_OPENROUTER.getKey, () => ({ hasKey: hasKey() }));
  ipcMain.handle(IPC_OPENROUTER.getSelectedModel, () => getSelectedModel());
  ipcMain.handle(IPC_OPENROUTER.setKey, (_event, key: string) => {
    saveKey(typeof key === 'string' ? key : '');
  });
  ipcMain.handle(IPC_OPENROUTER.listModels, () => listModels());
  ipcMain.handle(IPC_OPENROUTER.setSelectedModel, (_event, modelId: string) => {
    setSelectedModel(typeof modelId === 'string' ? modelId : '');
  });
}

applyVersionedAppName();

process.on('uncaughtException', (err) => {
  logError('main uncaughtException', { message: err?.message ?? String(err), stack: err?.stack ?? null });
});
process.on('unhandledRejection', (reason) => {
  logError('main unhandledRejection', reason);
});

app.whenReady().then(async () => {
  await initDatabase();
  restorePersistedTacticalBattleSession();
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
