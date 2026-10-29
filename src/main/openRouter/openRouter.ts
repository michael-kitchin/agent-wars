/**
 * OpenRouter integration: API key storage, list models, and request AI movement orders.
 * All key handling is in the main process. The local renderer receives a key only to fill a password field, and the key is never logged.
 */

import * as fs from 'fs';
import * as path from 'path';
import { app, safeStorage } from 'electron';
import { getRange } from '../combatConstants';
import { computeGridDistancePure, isWithinGridRangePure } from '../../shared/h3GridRangePure';
import { logDebug, logError, logTrace } from '../logger';
import type { GameStateSnapshot } from '../gameDb';
import { dbGetAll, dbGetOne, dbRun, getSeatRoster } from '../gameDb';
import { updateSeatCommander } from '../gameDb/seatRosterStore';
import { cancelModelCalls } from './modelCallControl';
import { LATLNG_DECIMAL_PLACES } from '../mapData';
import { landUnitCanOccupyHex, LAND_UNIT_ROUTE_STEP_BLOCKED_REASON } from '../../shared/landTraversalStrategic';
import { ARMOR_MOVE_ENDS_ON_ENTER_REASON } from '../../shared/strategicTerrainFlags';
import { getStrategicLandMassByH3 } from '../terrainClassificationCache';
import {
  getValidDestinations,
} from '../oneStepMoveDestinations';
import { strategicRangeOnState } from '../weather/weatherMatch';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { AI_SEAT_IDS, type AiSeatId } from '../../shared/seatIds';
import { readSeatHasApiKey } from '../gameDb/seatApiKeyFlags';
import {
  OPENROUTER_API_KEY_CONFIG_KEY,
  OPENROUTER_SELECTED_MODEL_CONFIG_KEY,
  OPENROUTER_SELECTED_REASONING_EFFORT_CONFIG_KEY,
} from '../gameDb/machineLocalConfigKeys';
import { buildStrategicUnitDisplayLabelResolver } from '../../shared/unitDisplayNames';
import { validateTacticalGroupRangedTarget } from '../gameActions/tacticalGroupRangedTargetValidation';
import { isEmbarkedLandUnit } from '../gameActions/sealift';
import { landUnitGridRouteBlockReason } from '../gameActions/strategicOrderValidation';
import { formatLatLng as formatLatLngWithPrecision } from './promptText';
import { requestOrdersFlow } from './requestOrdersFlow';
import { NAVAL_DESTINATION_MUST_BE_WATER_COASTAL } from '../navalMovementMessages';
import { buildSystemPromptForTools } from './openRouterBuildSystemPrompt';
import { buildToolDefinitions } from './openRouterToolCatalog';
import { resolveOpenRouterChatTransport } from './openRouterChatTransport';
import { registerLiveModelIdReader } from './liveModelId';
import type {
  RequestOrdersError,
  RequestOrdersOptions,
  RequestOrdersResult,
} from './requestOrdersFlow';
import {
  TOOL_GROUP_REGISTRY,
  getGroupIdForToolName,
  getToolFlags,
  getToolGroupList,
  getToolNamesForEnabledGroups,
  type ToolFlags,
  type ToolGroupEntry,
} from './openRouterToolGroups';
import type { OpenRouterModel } from '../../shared/ipc/openRouterTypes';
import { buildOpenRouterModelList } from './buildOpenRouterModelList';
import { getOpenRouterModelCapabilities, rememberOpenRouterModels } from './openRouterModelCapabilities';
import { resolveOrdersRequestProfile, resolveSeatOrdersRequestProfile, type OrdersRequestProfile } from './ordersRequestProfile';
import { OPENROUTER_ORDER_FLOW_COMPLETION_MAX_TOKENS } from './openRouterCreditLimits';
import { readSecretString, writeSecretString } from './secretConfig';

export type { MemoryUpdateItem } from './orderResponseParsing';

/**
 * Documents the module-scope binding `OPENROUTER_MODELS_URL` (OPENROUTER_MODELS_URL).

 * Purpose: Supports maintainability by documenting why `OPENROUTER_MODELS_URL` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
/**
 * Documents the module-scope binding `OPENROUTER_KEY_DB_CONFIG_KEY` (OPENROUTER_KEY_DB_CONFIG_KEY).

 * Purpose: Supports maintainability by documenting why `OPENROUTER_KEY_DB_CONFIG_KEY` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const OPENROUTER_KEY_DB_CONFIG_KEY = OPENROUTER_API_KEY_CONFIG_KEY;
/**
 * Documents the module-scope binding `OPENROUTER_SELECTED_MODEL_DB_CONFIG_KEY` (OPENROUTER_SELECTED_MODEL_DB_CONFIG_KEY).

 * Purpose: Supports maintainability by documenting why `OPENROUTER_SELECTED_MODEL_DB_CONFIG_KEY` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const OPENROUTER_SELECTED_MODEL_DB_CONFIG_KEY = OPENROUTER_SELECTED_MODEL_CONFIG_KEY;
/**
 * `game_config` key holding the player's reasoning-effort override for the selected model.
 *
 * Purpose: Persists the Opponent-tab reasoning choice with the model choice.
 * When to use: `getSelectedReasoningEffort` / `setSelectedReasoningEffort` only.
 * Expected outcome: Missing row means "use the model default".
 * Exceptions: None.
 */
const OPENROUTER_SELECTED_REASONING_EFFORT_DB_CONFIG_KEY = OPENROUTER_SELECTED_REASONING_EFFORT_CONFIG_KEY;

/**
 * Defines the `getConfigPath` function shape (function getConfigPath(): string).

 * Purpose: Supports maintainability by documenting why `getConfigPath` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'openrouter-config.json');
}

/**
 * Defines the `loadGameConfigValue` function shape (function loadGameConfigValue(key: string): string | null).

 * Purpose: Supports maintainability by documenting why `loadGameConfigValue` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function loadGameConfigValue(key: string): string | null {
  const row = dbGetOne<{ value: string }>('SELECT value FROM game_config WHERE key = ?', [key]);
  return row?.value ?? null;
}

/**
 * Defines the `saveGameConfigValue` function shape (function saveGameConfigValue(key: string, value: string): void).

 * Purpose: Supports maintainability by documenting why `saveGameConfigValue` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function saveGameConfigValue(key: string, value: string): void {
  dbRun('INSERT OR REPLACE INTO game_config (key, value) VALUES (?, ?)', [key, value]);
}

/**
 * Defines the `deleteGameConfigValue` function shape (function deleteGameConfigValue(key: string): void).

 * Purpose: Supports maintainability by documenting why `deleteGameConfigValue` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function deleteGameConfigValue(key: string): void {
  dbRun('DELETE FROM game_config WHERE key = ?', [key]);
}

/**
 * Defines the `loadKey` function shape (export function loadKey(): string).

 * Purpose: Supports maintainability by documenting why `loadKey` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function loadKey(): string {
  const fromDb = readSecretString(OPENROUTER_KEY_DB_CONFIG_KEY);
  if (fromDb.length > 0) return fromDb;
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) return '';
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const data = JSON.parse(raw) as { key?: string; encrypted?: string };
    let key = '';
    if (typeof data.encrypted === 'string' && safeStorage.isEncryptionAvailable()) {
      key = safeStorage.decryptString(Buffer.from(data.encrypted, 'base64'));
    } else if (typeof data.key === 'string') {
      key = data.key;
    }
    if (key.length > 0) {
      saveKey(key);
      return key;
    }
    return '';
  } catch (err) {
    logError('openRouter loadKey: failed to read legacy config file', err);
    return '';
  }
}

/**
 * Defines the `saveKey` function shape (export function saveKey(key: string): void).

 * Purpose: Supports maintainability by documenting why `saveKey` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function saveKey(key: string): void {
  const configPath = getConfigPath();
  try {
    writeSecretString(OPENROUTER_KEY_DB_CONFIG_KEY, key);
    if (!key.trim()) {
      if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
      return;
    }
    const data: { key?: string; encrypted?: string } = {};
    if (safeStorage.isEncryptionAvailable()) {
      data.encrypted = Buffer.from(safeStorage.encryptString(key)).toString('base64');
    } else {
      data.key = key;
    }
    fs.writeFileSync(configPath, JSON.stringify(data), { mode: 0o600 });
  } catch (err) {
    logError('openRouter saveKey: failed to write config', err);
  }
}

/**
 * Defines the `hasKey` function shape (export function hasKey(): boolean).

 * Purpose: Supports maintainability by documenting why `hasKey` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function hasKey(): boolean {
  const legacy = loadKey().length > 0;
  const seat = AI_SEAT_IDS.some((seatId) => readSeatHasApiKey(seatId));
  logTrace('openRouter hasKey', { legacy, seat });
  return legacy || seat;
}

/**
 * Documents the module-scope binding `selectedModelId` (selectedModelId: string).

 * Purpose: Supports maintainability by documenting why `selectedModelId` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
let selectedModelId: string = '';

/**
 * Persists the player's model choice.
 *
 * Purpose: Keeps the app-wide model selection across restarts; a different model starts on its own default effort.
 * When to use: When the app-wide model changes, from a commander popover (via IPC).
 * Expected outcome: Saves or deletes the model row. When the id differs from the current selection, the
 * reasoning-effort override is cleared too.
 * Exceptions: Propagates database errors.
 */
export function setSelectedModel(modelId: string): void {
  const modelChanged = (modelId ?? '') !== getSelectedModel();
  logDebug('openRouter setSelectedModel', { hasModelId: Boolean((modelId ?? '').trim()), modelChanged });
  selectedModelId = modelId ?? '';
  if (!selectedModelId.trim()) {
    deleteGameConfigValue(OPENROUTER_SELECTED_MODEL_DB_CONFIG_KEY);
  } else {
    saveGameConfigValue(OPENROUTER_SELECTED_MODEL_DB_CONFIG_KEY, selectedModelId);
  }
  if (modelChanged) {
    setSelectedReasoningEffort('');
  }
}

/**
 * Returns the persisted reasoning-effort override for the selected model.
 *
 * Purpose: Restores the Opponent-tab reasoning dropdown and sizes consultation requests.
 * When to use: Renderer startup (via IPC) and request-profile resolution for the selected model.
 * Expected outcome: The saved effort, or `''` ("use the model default") when none is saved. Reads the database
 * on every call so it never disagrees with the stored row.
 * Exceptions: Propagates database errors.
 */
export function getSelectedReasoningEffort(): string {
  logTrace('openRouter getSelectedReasoningEffort');
  return loadGameConfigValue(OPENROUTER_SELECTED_REASONING_EFFORT_DB_CONFIG_KEY) ?? '';
}

/**
 * Persists the reasoning-effort override for the selected model.
 *
 * Purpose: Keeps the player's reasoning choice across restarts.
 * When to use: When the player changes the reasoning dropdown, and (with `''`) when the model changes.
 * Expected outcome: A trimmed non-empty effort is saved; `''` deletes the row so the model default applies.
 * Exceptions: Propagates database errors.
 */
export function setSelectedReasoningEffort(effort: string): void {
  const trimmed = (effort ?? '').trim();
  logDebug('openRouter setSelectedReasoningEffort', { effort: trimmed || '(model default)' });
  if (!trimmed) {
    deleteGameConfigValue(OPENROUTER_SELECTED_REASONING_EFFORT_DB_CONFIG_KEY);
  } else {
    saveGameConfigValue(OPENROUTER_SELECTED_REASONING_EFFORT_DB_CONFIG_KEY, trimmed);
  }
}

/**
 * Copies the Opponent-tab model and effort onto the first AI seat.
 *
 * Purpose: A new game that did not name seats still needs a commander on the first AI seat.
 * When to use: After a new game that did not send seats.
 * Expected outcome: The first AI seat's model and effort match the tab. Its doctrine choice is left as stored.
 * A missing roster or a knocked-out seat is left alone.
 * Exceptions: Logs and swallows a roster error so saving the tab never fails.
 */
export function applyAppWideCommanderToLegacySeat(): void {
  try {
    const seat = getSeatRoster().find((row) => row.seatId === AI_SEAT_IDS[0]);
    if (!seat?.commander || seat.outTurn !== null) return;
    const modelId = getSelectedModel().trim();
    const effort = getSelectedReasoningEffort().trim();
    const modelChanged = (seat.commander.modelId ?? '') !== modelId;
    const effortChanged = (seat.commander.reasoningEffort ?? '') !== effort;
    if (!modelChanged && !effortChanged) return;
    updateSeatCommander({ run: dbRun, getAll: dbGetAll }, AI_SEAT_IDS[0], {
      modelId: modelId || null,
      reasoningEffort: effort || null,
      doctrineChoice: seat.commander.doctrineChoice,
    });
    cancelModelCalls('model_changed', 'all', AI_SEAT_IDS[0]);
    logDebug('openRouter applyAppWideCommanderToLegacySeat', { hasModel: modelId.length > 0, effort: effort || '(model default)' });
  } catch (err) {
    logError('openRouter applyAppWideCommanderToLegacySeat', err);
  }
}

/**
 * Defines the `getSelectedModel` function shape (export function getSelectedModel(): string).

 * Purpose: Supports maintainability by documenting why `getSelectedModel` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getSelectedModel(): string {
  logTrace('openRouter getSelectedModel');
  if (!selectedModelId.trim()) {
    selectedModelId = loadGameConfigValue(OPENROUTER_SELECTED_MODEL_DB_CONFIG_KEY) ?? '';
  }
  return selectedModelId;
}

export type { ToolGroupEntry, ToolFlags };
export {
  TOOL_GROUP_REGISTRY,
  getToolGroupList,
  getToolNamesForEnabledGroups,
  getGroupIdForToolName,
  getToolFlags,
};

export type {
  RequestOrdersResult,
  RequestOrdersError,
  RequestOrdersOptions,
} from './requestOrdersFlow';

export { setChatTransportOverrideForTests } from './openRouterChatTransport';

/**
 * Alias for the shared OpenRouter model IPC shape used by `listModels`.

 * Purpose: Preserves the historical `ModelItem` export name while avoiding field drift.
 * When to use: Callers that still import `ModelItem` from this module.
 * Expected outcome: Same contract as `OpenRouterModel` in shared IPC types.
 * Exceptions: None.
 */
export type ModelItem = OpenRouterModel;

/**
 * Loads the OpenRouter model catalog with the caller's key.
 *
 * Purpose: Each popover refresh uses the key in that popover.
 * When to use: The model-list IPC. Pass `''` when the argument is not a string.
 * Expected outcome: The model list, or `{ error: 'No API key set' }` without a fetch when the key is blank. The key is not logged.
 * Exceptions: None. A failed fetch returns `{ error }` and is logged.
 */
export async function listModels(key: string): Promise<{ models: ModelItem[] } | { error: string }> {
  const supplied = typeof key === 'string' ? key.trim() : '';
  logDebug('openRouter listModels', { hasKey: supplied.length > 0 });
  if (!supplied) {
    logError('openRouter listModels: no API key set');
    return { error: 'No API key set' };
  }
  try {
    const res = await fetch(OPENROUTER_MODELS_URL, {
      headers: { Authorization: `Bearer ${supplied}` },
    });
    if (!res.ok) {
      const text = await res.text();
      logError('openRouter listModels: API error', res.status, text.slice(0, 200));
      return { error: res.status === 401 ? 'Invalid API key' : `API error: ${res.status}` };
    }
    const json = (await res.json()) as { data?: unknown[] };
    const data = Array.isArray(json.data) ? json.data : [];
    const models: ModelItem[] = buildOpenRouterModelList(data);
    rememberOpenRouterModels(models);
    logDebug('openRouter listModels: mapped models', { count: models.length });
    return { models };
  } catch (err) {
    logError('openRouter listModels: exception', err);
    return { error: String(err) };
  }
}

/**
 * Defines the `validateAiOrder` function shape (function validateAiOrder( order: { unitId: string; toH3Index: string }, state: GameStateSnapshot ): { valid: true } | { valid: false; reason: string } {).

 * Purpose: Supports maintainability by documenting why `validateAiOrder` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function validateAiOrder(
  order: { unitId: string; toH3Index: string },
  state: GameStateSnapshot,
  opts?: { labelForUnitId?: (unitId: string) => string; seatId?: AiSeatId }
): { valid: true } | { valid: false; reason: string } {
  const resolveLabel = opts?.labelForUnitId ?? ((id: string) => buildStrategicUnitDisplayLabelResolver(state.units)(id));
  const seatId = opts?.seatId ?? AI_SEAT_IDS[0];
  const unit = state.units.find((u) => u.id === order.unitId);
  if (!unit) return { valid: false, reason: `Unit not found: ${resolveLabel(order.unitId)}` };
  if (unit.player !== seatId) return { valid: false, reason: "A commander can order only its own side's units" };

  const hexIds = new Set(state.hexes.map((h) => h.h3Index));
  if (!hexIds.has(order.toH3Index)) return { valid: false, reason: 'Destination not on map' };

  const dist: number | null = computeGridDistancePure(unit.h3Index, order.toH3Index);
  const assumeDebarkedForReachability =
    !!unit.id &&
    isEmbarkedLandUnit(unit.id) &&
    order.toH3Index !== unit.h3Index;
  const destinationOptions = assumeDebarkedForReachability ? { assumeDebarkedForReachability: true } : undefined;
  if (dist !== null) {
    const range = strategicRangeOnState(
      { unitType: unit.unitType, h3Index: unit.h3Index, weatherTags: unit.weatherTags },
      state
    );
    if (dist > range) return { valid: false, reason: `${unit.unitType} can move at most ${range} hex(es)` };
    /* dist === 0 (same hex) is allowed: "hold" / no move is valid. */
  } else {
    const validDests = getValidDestinations(unit, state, destinationOptions);
    if (!validDests.includes(order.toH3Index)) {
      return { valid: false, reason: 'Invalid distance' };
    }
  }

  if (unit.unitType === 'naval') {
    const navalDests = getValidDestinations(unit, state, destinationOptions);
    if (!navalDests.includes(order.toH3Index)) {
      return { valid: false, reason: NAVAL_DESTINATION_MUST_BE_WATER_COASTAL };
    }
  }
  if ((unit.unitType === 'infantry' || unit.unitType === 'armor') && !landUnitCanOccupyHex(order.toH3Index, getStrategicLandMassByH3())) {
    return { valid: false, reason: 'Land units must move to a hex that overlaps a continent or large island.' };
  }
  if (unit.unitType === 'armor') {
    if (!getValidDestinations(unit, state, destinationOptions).includes(order.toH3Index)) {
      if (dist !== null) {
        const landMassBlock = landUnitGridRouteBlockReason(unit.h3Index, order.toH3Index, dist, order.unitId);
        if (landMassBlock) return { valid: false, reason: landMassBlock };
      }
      return { valid: false, reason: ARMOR_MOVE_ENDS_ON_ENTER_REASON };
    }
  } else if (unit.unitType === 'infantry') {
    if (!getValidDestinations(unit, state, destinationOptions).includes(order.toH3Index)) {
      return { valid: false, reason: LAND_UNIT_ROUTE_STEP_BLOCKED_REASON };
    }
  }
  return { valid: true };
}

/**
 * Defines the `validateAiRangedOrder` function shape (function validateAiRangedOrder( order: { unitId: string; targetH3Index: string }, state: GameStateSnapshot ): { valid: true } | { valid: false; reason: s).

 * Purpose: Supports maintainability by documenting why `validateAiRangedOrder` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function validateAiRangedOrder(
  order: { unitId: string; targetH3Index: string },
  state: GameStateSnapshot,
  opts?: { labelForUnitId?: (unitId: string) => string; tacticalBattle?: TacticalBattleSnapshot; seatId?: AiSeatId }
): { valid: true } | { valid: false; reason: string } {
  const resolveLabel = opts?.labelForUnitId ?? ((id: string) => buildStrategicUnitDisplayLabelResolver(state.units)(id));
  const seatId = opts?.seatId ?? AI_SEAT_IDS[0];
  const tactical = opts?.tacticalBattle;
  if (tactical) {
    const t = validateTacticalGroupRangedTarget({
      snap: tactical,
      uniqueUnitIds: [order.unitId],
      targetH3Index: order.targetH3Index,
      tacticalAttackerPlayer: seatId,
    });
    return t.success ? { valid: true } : { valid: false, reason: t.reason ?? 'Illegal tactical ranged target' };
  }
  const unit = state.units.find((u) => u.id === order.unitId);
  if (!unit) return { valid: false, reason: `Unit not found: ${resolveLabel(order.unitId)}` };
  if (unit.player !== seatId) return { valid: false, reason: "A commander can order only its own side's units" };
  if (getRange(unit.unitType) < 1) return { valid: false, reason: `${unit.unitType} has no ranged attack` };
  const hexIds = new Set(state.hexes.map((h) => h.h3Index));
  if (!hexIds.has(order.targetH3Index)) return { valid: false, reason: 'Target not on map' };
  const maxR = getRange(unit.unitType);
  const d = computeGridDistancePure(unit.h3Index, order.targetH3Index);
  if (d !== null) {
    if (d > maxR) return { valid: false, reason: 'Target out of range' };
  } else if (!isWithinGridRangePure(unit.h3Index, order.targetH3Index, maxR)) {
    return { valid: false, reason: 'Invalid distance' };
  }
  const hasEnemy = state.units.some((u) => u.h3Index === order.targetH3Index && u.player !== unit.player);
  if (!hasEnemy) return { valid: false, reason: 'Target hex has no enemy' };
  return { valid: true };
}

/**
 * Defines the `formatLatLng` function shape (function formatLatLng(ll: [number, number]): string).

 * Purpose: Supports maintainability by documenting why `formatLatLng` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function formatLatLng(ll: [number, number]): string {
  return formatLatLngWithPrecision(ll, LATLNG_DECIMAL_PLACES);
}

/**
 * Resolves the consultation request profile from cached capabilities and the saved reasoning choice.
 *
 * Purpose: Production `resolveOrdersRequestProfile` dependency for `requestOrdersFlow`.
 * When to use: Wired into the flow deps by `requestOrders`.
 * Expected outcome: Unknown models get the baseline profile without touching the database. Known models use the
 * saved effort only when they are the selected model, since the saved effort belongs to the selected model.
 * Exceptions: None. A database error while reading the saved choice is logged and the model default is used,
 * so an optional setting never fails a consultation.
 */
function resolveSelectedModelOrdersRequestProfile(modelId: string, seatId: AiSeatId): OrdersRequestProfile {
  try {
    const seat = getSeatRoster().find((row) => row.seatId === seatId);
    if (seat?.commander) return resolveSeatOrdersRequestProfile(seat);
  } catch (err) {
    logError('openRouter resolveSelectedModelOrdersRequestProfile: roster unreadable', { seatId, err });
  }
  const model = getOpenRouterModelCapabilities(modelId);
  let persistedReasoningEffort = '';
  if (model !== undefined) {
    try {
      persistedReasoningEffort = modelId === getSelectedModel() ? getSelectedReasoningEffort() : '';
    } catch (err) {
      logError('openRouter resolveSelectedModelOrdersRequestProfile: saved reasoning effort unreadable', { modelId, err });
    }
  }
  return resolveOrdersRequestProfile({
    modelId,
    model,
    persistedReasoningEffort,
    baseCompletionMaxTokens: OPENROUTER_ORDER_FLOW_COMPLETION_MAX_TOKENS,
  });
}
/**
 * Defines the `requestOrders` function shape (export async function requestOrders().

 * Purpose: Supports maintainability by documenting why `requestOrders` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export async function requestOrders(
  state: GameStateSnapshot,
  modelId: string,
  options?: RequestOrdersOptions
): Promise<RequestOrdersResult | RequestOrdersError> {
  logDebug('openRouter requestOrders', {
    turnNumber: state.turnNumber,
    phase: state.phase,
    hasSignal: Boolean(options?.signal),
    toolCount: options?.enabledToolNames?.length ?? 0,
  });
  const activeTransport = resolveOpenRouterChatTransport();
  return requestOrdersFlow(
    {
      loadKey,
      getToolFlags,
      toolGroupRegistry: TOOL_GROUP_REGISTRY,
      buildSystemPromptForTools,
      buildToolDefinitions,
      postOpenRouterChatWithTimeoutAndRetry: activeTransport,
      resolveOrdersRequestProfile: resolveSelectedModelOrdersRequestProfile,
      getGroupIdForToolName,
      validateAiOrder,
      validateAiRangedOrder,
      formatLatLng,
    },
    state,
    modelId,
    options
  );
}

registerLiveModelIdReader((seatId) => {
  try {
    const seat = getSeatRoster().find((row) => row.seatId === seatId);
    if (seat?.commander) return seat.commander.modelId ?? '';
  } catch (err) {
    logError('openRouter readLiveModelId: roster unreadable', { seatId, err });
  }
  return getSelectedModel();
});

