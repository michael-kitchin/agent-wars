/**
 * OpenRouter integration: API key storage, list models, and request AI movement orders.
 * All key handling is in the main process; the key is never logged or sent to the renderer in plain form.
 */

import * as fs from 'fs';
import * as path from 'path';
import { request as httpsRequest } from 'node:https';
import { URL } from 'node:url';
import { brotliDecompressSync, gunzipSync, inflateSync } from 'node:zlib';
import { app, safeStorage } from 'electron';
import { gridDistance } from 'h3-js';
import { getAttack, getDefense, getRange } from '../combatConstants';
import { logDebug, logError, logTrace } from '../logger';
import type { GameStateSnapshot } from '../gameDb';
import {
  getAndClearAiToolLimitExceededLastTurn,
  dbGetOne,
  dbRun,
} from '../gameDb';
import { H3_RESOLUTION, LATLNG_DECIMAL_PLACES } from '../mapData';
import { TOOL1_NAMES } from '../tools/tool1Pathfinding';
import { TOOL2_NAMES } from '../tools/tool2Assessment';
import { TOOL3_NAMES } from '../tools/tool3CombatEstimation';
import { getInjectionText, TOOL4_NAMES } from '../tools/tool4Memory';
import {
  getInjectionText as getStandingOrderInjectionText,
  TOOL5_NAMES,
} from '../tools/tool5StandingOrders';
import { TOOL6_NAMES } from '../tools/tool6Production';
import { passabilityAllowsLandUnit, passabilityAllowsNavalUnit } from '../../shared/pipelineTerrain';
import {
  getValidDestinations,
  getValidDestinationsUnoccupied,
  resolveMovementTerrainForHex,
} from '../oneStepMoveDestinations';
import { countControlledHexesInRegion } from '../../shared/homeRegionRules';
import { MOVEMENT_RANGE_BY_UNIT_TYPE } from '../../shared/tacticalRanges';
import { buildFinalJsonContractInstruction, getFinalJsonOrdersExampleBlock } from './promptContracts';
import { buildAirOperationsBriefingBlock, buildProductionBriefingBlock, buildSealiftBriefingBlock } from './briefingSections';
import {
  buildAdjacentCellsFallbackBlock,
  formatControlProgressLine,
  buildHumanUnitsPromptLine,
  buildLatLngPreamble,
  buildProductionSubmitClause,
  buildToolUsageGuidance,
  formatLatLng as formatLatLngWithPrecision,
  getMovementOrderInstruction,
} from './promptText';
import { buildPrimaryScenarioGoalOpeningClause, buildRegionVsRegionScenarioObjectiveBlock } from './scenarioGoals';
import {
  requestOrdersFlow,
} from './requestOrdersFlow';
import {
  NAVAL_DESTINATION_MUST_BE_WATER_COASTAL,
  NAVAL_MOVEMENT_PROMPT_RULE,
  NAVAL_PLAN_ROUTE_LAND_TARGET_HINT,
  NAVAL_PLAN_ROUTE_PROMPT_SUFFIX,
} from '../navalMovementMessages';
import type { AirStrikeOrder, EmbarkOrder, FerryOrder } from '../../shared/ipcTypes';

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
 * Documents the module-scope binding `OPENROUTER_CHAT_URL` (OPENROUTER_CHAT_URL).

 * Purpose: Supports maintainability by documenting why `OPENROUTER_CHAT_URL` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
/**
 * Documents the module-scope binding `OPENROUTER_KEY_DB_CONFIG_KEY` (OPENROUTER_KEY_DB_CONFIG_KEY).

 * Purpose: Supports maintainability by documenting why `OPENROUTER_KEY_DB_CONFIG_KEY` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const OPENROUTER_KEY_DB_CONFIG_KEY = 'openrouter_api_key';
/**
 * Documents the module-scope binding `OPENROUTER_SELECTED_MODEL_DB_CONFIG_KEY` (OPENROUTER_SELECTED_MODEL_DB_CONFIG_KEY).

 * Purpose: Supports maintainability by documenting why `OPENROUTER_SELECTED_MODEL_DB_CONFIG_KEY` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const OPENROUTER_SELECTED_MODEL_DB_CONFIG_KEY = 'openrouter_selected_model';

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
  const fromDb = loadGameConfigValue(OPENROUTER_KEY_DB_CONFIG_KEY);
  if (typeof fromDb === 'string' && fromDb.length > 0) {
    try {
      const parsed = JSON.parse(fromDb) as { key?: string; encrypted?: string };
      if (typeof parsed.encrypted === 'string' && safeStorage.isEncryptionAvailable()) {
        return safeStorage.decryptString(Buffer.from(parsed.encrypted, 'base64'));
      }
      if (typeof parsed.key === 'string') return parsed.key;
    } catch {
      return fromDb;
    }
  }
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
  } catch {
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
    if (!key.trim()) {
      deleteGameConfigValue(OPENROUTER_KEY_DB_CONFIG_KEY);
      if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
      return;
    }
    const data: { key?: string; encrypted?: string } = {};
    if (safeStorage.isEncryptionAvailable()) {
      data.encrypted = Buffer.from(safeStorage.encryptString(key)).toString('base64');
    } else {
      data.key = key;
    }
    saveGameConfigValue(OPENROUTER_KEY_DB_CONFIG_KEY, JSON.stringify(data));
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
  return loadKey().length > 0;
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
 * Defines the `setSelectedModel` function shape (export function setSelectedModel(modelId: string): void).

 * Purpose: Supports maintainability by documenting why `setSelectedModel` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function setSelectedModel(modelId: string): void {
  selectedModelId = modelId ?? '';
  if (!selectedModelId.trim()) {
    deleteGameConfigValue(OPENROUTER_SELECTED_MODEL_DB_CONFIG_KEY);
  } else {
    saveGameConfigValue(OPENROUTER_SELECTED_MODEL_DB_CONFIG_KEY, selectedModelId);
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
  if (!selectedModelId.trim()) {
    selectedModelId = loadGameConfigValue(OPENROUTER_SELECTED_MODEL_DB_CONFIG_KEY) ?? '';
  }
  return selectedModelId;
}

/**
 * Documents the `ToolGroupEntry` interface as a named contract surface (export interface ToolGroupEntry).

 * Purpose: Supports maintainability by documenting why `ToolGroupEntry` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface ToolGroupEntry {
    /**
   * Specifies the contract for the `id` member (id: string;).

   * Contract: Describes stable behavior for callers of `id` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
id: string;
    /**
   * Specifies the contract for the `label` member (label: string;).

   * Contract: Describes stable behavior for callers of `label` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
label: string;
    /**
   * Specifies the contract for the `toolNames` member (toolNames: readonly string[];).

   * Contract: Describes stable behavior for callers of `toolNames` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
toolNames: readonly string[];
}

/**
 * Documents the module-scope binding `TOOL_GROUP_REGISTRY` (TOOL_GROUP_REGISTRY: ToolGroupEntry[]).

 * Purpose: Supports maintainability by documenting why `TOOL_GROUP_REGISTRY` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const TOOL_GROUP_REGISTRY: ToolGroupEntry[] = [
  { id: 'precomputation', label: 'Precomputation', toolNames: [] },
  { id: 'planning', label: 'Planning', toolNames: TOOL1_NAMES },
  { id: 'assessment', label: 'Assessment', toolNames: TOOL2_NAMES },
  { id: 'estimation', label: 'Estimation', toolNames: TOOL3_NAMES },
  { id: 'memory', label: 'Memory', toolNames: TOOL4_NAMES },
  { id: 'orders', label: 'Orders', toolNames: TOOL5_NAMES },
  { id: 'production', label: 'Production', toolNames: TOOL6_NAMES },
];

/**
 * Defines the `getToolGroupList` function shape (export function getToolGroupList(): { id: string; label: string }[] { logTrace('openRouter getToolGroupList'); return TOOL_GROUP_REGISTRY.map((g) => ({ id).

 * Purpose: Supports maintainability by documenting why `getToolGroupList` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getToolGroupList(): { id: string; label: string }[] {
  logTrace('openRouter getToolGroupList');
  return TOOL_GROUP_REGISTRY.map((g) => ({ id: g.id, label: g.label }));
}

/**
 * Defines the `getToolNamesForEnabledGroups` function shape (export function getToolNamesForEnabledGroups(enabledGroupIds: string[]): string[]).

 * Purpose: Supports maintainability by documenting why `getToolNamesForEnabledGroups` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getToolNamesForEnabledGroups(enabledGroupIds: string[]): string[] {
  logTrace('openRouter getToolNamesForEnabledGroups', { enabledGroupIds });
  const set = new Set<string>(enabledGroupIds);
  const names: string[] = [];
  for (const g of TOOL_GROUP_REGISTRY) {
    if (set.has(g.id)) names.push(...g.toolNames);
  }
  return names;
}

/**
 * Documents the module-scope binding `TOOL_NAME_TO_GROUP_ID` (TOOL_NAME_TO_GROUP_ID).

 * Purpose: Supports maintainability by documenting why `TOOL_NAME_TO_GROUP_ID` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const TOOL_NAME_TO_GROUP_ID = (() => {
  const m = new Map<string, string>();
  for (const g of TOOL_GROUP_REGISTRY) {
    for (const name of g.toolNames) m.set(name, g.id);
  }
  return m;
})();

/**
 * Defines the `getGroupIdForToolName` function shape (export function getGroupIdForToolName(toolName: string): string | undefined { logTrace('openRouter getGroupIdForToolName', { toolName }); return TOOL_NAME).

 * Purpose: Supports maintainability by documenting why `getGroupIdForToolName` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getGroupIdForToolName(toolName: string): string | undefined {
  logTrace('openRouter getGroupIdForToolName', { toolName });
  return TOOL_NAME_TO_GROUP_ID.get(toolName);
}

/**
 * Documents the `ToolFlags` interface as a named contract surface (export interface ToolFlags).

 * Purpose: Supports maintainability by documenting why `ToolFlags` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface ToolFlags {
    /**
   * Specifies the contract for the `planningEnabled` member (planningEnabled: boolean;).

   * Contract: Describes stable behavior for callers of `planningEnabled` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
planningEnabled: boolean;
    /**
   * Specifies the contract for the `assessmentEnabled` member (assessmentEnabled: boolean;).

   * Contract: Describes stable behavior for callers of `assessmentEnabled` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
assessmentEnabled: boolean;
    /**
   * Specifies the contract for the `estimationEnabled` member (estimationEnabled: boolean;).

   * Contract: Describes stable behavior for callers of `estimationEnabled` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
estimationEnabled: boolean;
    /**
   * Specifies the contract for the `ordersEnabled` member (ordersEnabled: boolean;).

   * Contract: Describes stable behavior for callers of `ordersEnabled` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
ordersEnabled: boolean;
    /**
   * Specifies the contract for the `memoryEnabled` member (memoryEnabled: boolean;).

   * Contract: Describes stable behavior for callers of `memoryEnabled` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
memoryEnabled: boolean;
    /**
   * Specifies the contract for the `productionEnabled` member (productionEnabled: boolean;).

   * Contract: Describes stable behavior for callers of `productionEnabled` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
productionEnabled: boolean;
    /**
   * Specifies the contract for the `fallbackMovementEnabled` member (fallbackMovementEnabled: boolean;).

   * Contract: Describes stable behavior for callers of `fallbackMovementEnabled` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
fallbackMovementEnabled: boolean;
}

/**
 * Defines the `getToolFlags` function shape (export function getToolFlags(enabledToolNames: string[] | undefined): ToolFlags).

 * Purpose: Supports maintainability by documenting why `getToolFlags` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getToolFlags(enabledToolNames: string[] | undefined): ToolFlags {
  logTrace('openRouter getToolFlags', { hasList: enabledToolNames !== undefined, count: enabledToolNames?.length ?? 0 });
  const set =
    enabledToolNames === undefined
      ? new Set(TOOL_GROUP_REGISTRY.flatMap((g) => [...g.toolNames]))
      : new Set(enabledToolNames);
  const has = (names: readonly string[]) => names.some((n) => set.has(n));
  const planningEnabled = has(TOOL1_NAMES);
  const assessmentEnabled = has(TOOL2_NAMES);
  const estimationEnabled = has(TOOL3_NAMES);
  const ordersEnabled = has(TOOL5_NAMES);
  const memoryEnabled = has(TOOL4_NAMES);
  const productionEnabled = has(TOOL6_NAMES);
  return {
    planningEnabled,
    assessmentEnabled,
    estimationEnabled,
    ordersEnabled,
    memoryEnabled,
    productionEnabled,
    fallbackMovementEnabled: !planningEnabled && !ordersEnabled,
  };
}

/**
 * Documents the `ModelItem` interface as a named contract surface (export interface ModelItem).

 * Purpose: Supports maintainability by documenting why `ModelItem` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface ModelItem {
    /**
   * Specifies the contract for the `id` member (id: string;).

   * Contract: Describes stable behavior for callers of `id` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
id: string;
    /**
   * Specifies the contract for the `name` member (name?: string;).

   * Contract: Describes stable behavior for callers of `name` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
name?: string;
}

/**
 * Defines the `listModels` function shape (export async function listModels(): Promise<).

 * Purpose: Supports maintainability by documenting why `listModels` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export async function listModels(): Promise<{ models: ModelItem[] } | { error: string }> {
  logDebug('openRouter listModels');
  const key = loadKey();
  if (!key) {
    logError('openRouter listModels: no API key set');
    return { error: 'No API key set' };
  }
  try {
    const res = await fetch(OPENROUTER_MODELS_URL, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      const text = await res.text();
      logError('openRouter listModels: API error', res.status, text.slice(0, 200));
      return { error: res.status === 401 ? 'Invalid API key' : `API error: ${res.status}` };
    }
    const json = (await res.json()) as { data?: Array<{ id?: string; name?: string }> };
    const data = json.data ?? [];
    const models: ModelItem[] = data
      .filter((m) => m && typeof m.id === 'string')
      .map((m) => ({ id: m.id!, name: typeof m.name === 'string' ? m.name : undefined }));
    models.sort((a, b) => {
      const nameA = (a.name ?? a.id).toLowerCase();
      const nameB = (b.name ?? b.id).toLowerCase();
      return nameA.localeCompare(nameB);
    });
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
  state: GameStateSnapshot
): { valid: true } | { valid: false; reason: string } {
  const unit = state.units.find((u) => u.id === order.unitId);
  if (!unit) return { valid: false, reason: `Unit not found: ${order.unitId}` };
  if (unit.player !== 'opponent') return { valid: false, reason: 'Only opponent units can receive AI orders' };

  const hexIds = new Set(state.hexes.map((h) => h.h3Index));
  if (!hexIds.has(order.toH3Index)) return { valid: false, reason: 'Destination not on map' };

  let dist: number | null = null;
  try {
    dist = gridDistance(unit.h3Index, order.toH3Index);
  } catch {
    /* gridDistance can throw for cross-face/pentagon; fall back to valid-destinations check */
  }
  if (dist !== null) {
    const range = MOVEMENT_RANGE_BY_UNIT_TYPE[unit.unitType] ?? 1;
    if (dist > range) return { valid: false, reason: `${unit.unitType} can move at most ${range} hex(es)` };
    /* dist === 0 (same hex) is allowed: "hold" / no move is valid. */
  } else {
    const validDests = getValidDestinations(unit, state);
    if (!validDests.includes(order.toH3Index)) {
      return { valid: false, reason: 'Invalid distance' };
    }
  }

  const seaportCountByHex = new Map((state.res1Infrastructure ?? []).map((row) => [row.h3Index, row.seaportCount] as const));
  const destHex = state.hexes.find((h) => h.h3Index === order.toH3Index);
  const terrain = resolveMovementTerrainForHex(destHex, seaportCountByHex);
  if (unit.unitType === 'naval' && !passabilityAllowsNavalUnit(terrain)) {
    return { valid: false, reason: NAVAL_DESTINATION_MUST_BE_WATER_COASTAL };
  }
  if ((unit.unitType === 'infantry' || unit.unitType === 'armor') && !passabilityAllowsLandUnit(terrain)) {
    return { valid: false, reason: 'Land units must move to land, coastal, or wetlands hexes' };
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
  state: GameStateSnapshot
): { valid: true } | { valid: false; reason: string } {
  const unit = state.units.find((u) => u.id === order.unitId);
  if (!unit) return { valid: false, reason: `Unit not found: ${order.unitId}` };
  if (unit.player !== 'opponent') return { valid: false, reason: 'Only opponent units can have AI ranged orders' };
  if (getRange(unit.unitType) < 1) return { valid: false, reason: `${unit.unitType} has no ranged attack` };
  const hexIds = new Set(state.hexes.map((h) => h.h3Index));
  if (!hexIds.has(order.targetH3Index)) return { valid: false, reason: 'Target not on map' };
  let dist: number;
  try {
    dist = gridDistance(unit.h3Index, order.targetH3Index);
  } catch {
    return { valid: false, reason: 'Invalid distance' };
  }
  if (dist > getRange(unit.unitType)) return { valid: false, reason: 'Target out of range' };
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

// prompt helpers extracted to openrouter/promptText.ts

/**
 * Defines the `buildSystemPromptForTools` function shape (function buildSystemPromptForTools( state: GameStateSnapshot, coordMap: { latLngByH3: Map<string, [number, number]>; format: (h3: string) => str).

 * Purpose: Supports maintainability by documenting why `buildSystemPromptForTools` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function buildSystemPromptForTools(
  state: GameStateSnapshot,
  coordMap: {
    latLngByH3: Map<string, [number, number]>;
    format: (h3: string) => string;
    resolveToH3: (lat: number, lng: number) => string | undefined;
  },
  enabledToolNames?: string[],
  briefingOverride?: string
): string {
  const { latLngByH3, format, resolveToH3 } = coordMap;
  const opponentUnits = state.units.filter((u) => u.player === 'opponent');
  const humanUnits = state.units.filter((u) => u.player === 'human');
  const flags = getToolFlags(enabledToolNames);

  const limitExceededLastTurn = getAndClearAiToolLimitExceededLastTurn();
  const showLimitWarning = limitExceededLastTurn && (flags.planningEnabled || flags.ordersEnabled);
  const warning = showLimitWarning
    ? '\n\nWARNING: Last turn\'s planning exceeded the tool-call limit (50 rounds). You submitted no explicit orders. Ensure you submit your final orders JSON promptly after gathering the information you need.\n'
    : '';

  const opponentRoster = opponentUnits
    .filter((u) => latLngByH3.has(u.h3Index))
    .map((u) => `${u.id} (${u.unitType}) at ${format(u.h3Index)}`)
    .join('; ');
  const humanRoster = humanUnits
    .filter((u) => latLngByH3.has(u.h3Index))
    .map((u) => `${u.id} (${u.unitType}) at ${format(u.h3Index)}`)
    .join('; ');

  const unitTypes: Array<'infantry' | 'armor' | 'naval' | 'air'> = ['infantry', 'armor', 'naval', 'air'];
  const combatSummary = unitTypes
    .map(
      (t) =>
        `${t}: ${getAttack(t)} attack / ${getDefense(t)} defense${getRange(t) >= 1 ? `, range ${getRange(t)}` : ', melee only'}`
    )
    .join('; ');

  const filtered = getFilteredToolMetadata(enabledToolNames);
  const toolsIntroPurpose = flags.planningEnabled
    ? 'plan movement and assess the battlefield'
    : flags.assessmentEnabled
      ? 'assess the tactical situation'
      : undefined;
  const hasPrecomputedBriefing = briefingOverride != null && briefingOverride.length > 0;
  const toolsIntro = toolsIntroPurpose
    ? hasPrecomputedBriefing
      ? 'Use the Commander\'s Briefing above for assessments and possible unit actions; use tools selectively for exact routing (plan_route), standing-order checks (query_orders), memory lookup (memory_read), and production queue checks/sets when needed.'
      : `Use these tools to ${toolsIntroPurpose} before submitting orders. You may use multiple rounds of tool calls and mix tool types if that helps.` +
        (flags.memoryEnabled ? ' Memory: use memory_read as needed; persist notes via memoryUpdates in your final JSON.' : '')
    : 'Use only the tools listed below. Do not call tools that are not in the list.';
  const toolGuidance = buildToolUsageGuidance(flags, hasPrecomputedBriefing);
  const toolsSection =
    filtered.length === 0
      ? '# Available Tools\n\nNo tools available.'
      : `# Available Tools

${toolsIntro}
${filtered.map((m, i) => `${i + 1}. ${m.promptLine}`).join('\n')}${toolGuidance}`;

  const memoryBlock = flags.memoryEnabled ? getInjectionText('opponent', state.turnNumber) + '\n\n' : '';
  const standingOrderBlock = flags.ordersEnabled ? getStandingOrderInjectionText('opponent', state) + '\n\n' : '';
  const productionBlock = flags.productionEnabled
    ? buildProductionBriefingBlock({
        productionEnabled: flags.productionEnabled,
        state,
        latLngByH3,
        resolveToH3,
        formatLatLng,
      }) + '\n\n'
    : '';
  const airOpsBlock = buildAirOperationsBriefingBlock(state, format) + '\n\n';
  const sealiftBlock = buildSealiftBriefingBlock(state, format) + '\n\n';

  const hasNaval = opponentUnits.some((u) => u.unitType === 'naval');
  const hasRanged = opponentUnits.some((u) => getRange(u.unitType as 'infantry' | 'armor' | 'naval') >= 1);

  const combatTargetHint = flags.estimationEnabled ? ' (e.g. use estimate_combat to pick the best)' : '';
  const navalCoaching = hasNaval
    ? ` Naval units can attack land units at 1 or 2 hexes (range 2). Add ranged_attack when a naval unit is within 2 hexes of an enemy at turn start. ${NAVAL_MOVEMENT_PROMPT_RULE}${flags.planningEnabled ? NAVAL_PLAN_ROUTE_LAND_TARGET_HINT : ''}`
    : '';
  const combatAssessHint = flags.assessmentEnabled && hasRanged
    ? ' When assess_unit reports canAttackThisTurn with attackType "ranged" for an enemy, add ranged_attack with targetHex as that enemy\'s [lat,lng] (or unit id).' +
      (hasNaval ? ' Naval inRangedRange: add ranged_attack for that naval unit.' : '') +
      ' Note: inEnemyRangedRange = enemy can fire at you; inRangedRange = you can fire at them.'
    : '';

  const adjacentCellsBlock = flags.fallbackMovementEnabled
    ? buildAdjacentCellsFallbackBlock(state, opponentUnits, coordMap, getValidDestinationsUnoccupied)
    : '';
  const movementOrderInstruction = getMovementOrderInstruction(flags);
  const submitMemoryClause = flags.memoryEnabled
    ? ' Use optional "memoryUpdates" for memory writes/deletes (applied from JSON only; there are no memory_write or memory_delete tools).'
    : ' When Memory tools are not listed above, omit "memoryUpdates" or use []; any entries are ignored.';

  const humanUnitsLine = buildHumanUnitsPromptLine(humanRoster);
  const landHexes = state.hexes.filter((hex) => hex.terrain === 'land');
  const totalLandHexes = landHexes.length;
  const landHexSet = new Set(landHexes.map((hex) => hex.h3Index));
  const exploredHexesRaw = Array.isArray(state.exploredHexes)
    ? state.exploredHexes
    : state.hexes.map((hex) => hex.h3Index);
  const exploredLandHexes = exploredHexesRaw.filter((h3Index) => landHexSet.has(h3Index)).length;
  const controlledLandHexes = (state.res1Control ?? []).filter(
    (row) => row.controllerPlayerId === 'opponent' && landHexSet.has(row.h3Index)
  ).length;
  const ownHomeRegionControl = countControlledHexesInRegion(state.res1Control ?? [], state.aiHomeRegionHexes, 'opponent');
  const opponentHomeRegionControl = countControlledHexesInRegion(state.res1Control ?? [], state.humanHomeRegionHexes, 'opponent');
  const homeRegionOwnershipSummary =
    state.scenarioId === 'region_vs_region'
      ? `\n${formatControlProgressLine('Your home region control', ownHomeRegionControl.controlled, ownHomeRegionControl.total)}\n${formatControlProgressLine("Your control of opponent's home region", opponentHomeRegionControl.controlled, opponentHomeRegionControl.total)}`
      : '';
  const strategicContextBlock = `Strategic context:
- At least one enemy unit remains in play, and the human player is actively searching for your forces with intent to destroy them.
- Your priorities are:
  (1) Expand territorial control toward likely enemy positions
  (2) Disperse infantry as scouts to maximize visibility
  (3) Maximize unit production (idle production capacity is wasted)
  (4) Engage the enemy and destroy them
- ${formatControlProgressLine('Explored', exploredLandHexes, totalLandHexes, 'land hexes').slice(2)}
- ${formatControlProgressLine('Controlled', controlledLandHexes, totalLandHexes, 'land hexes').slice(2)}${homeRegionOwnershipSummary}`;
  const scenarioObjectiveBlock = buildRegionVsRegionScenarioObjectiveBlock(state);
  const mainBlock = briefingOverride != null && briefingOverride.length > 0
    ? `${briefingOverride}\n\n${scenarioObjectiveBlock ? `${scenarioObjectiveBlock}\n\n` : ''}${strategicContextBlock}\n\n${airOpsBlock}${sealiftBlock}${toolsSection}\n\nYour units (ID, type, position [lat, lng]): ${opponentRoster || 'none'}\n${humanUnitsLine}`
    : `${memoryBlock}${standingOrderBlock}${productionBlock}${scenarioObjectiveBlock ? `${scenarioObjectiveBlock}\n\n` : ''}${strategicContextBlock}\n\n${airOpsBlock}${sealiftBlock}${toolsSection}\n\nYour units (ID, type, position [lat, lng]): ${opponentRoster || 'none'}\n${humanUnitsLine}${adjacentCellsBlock}`;

  const finalJsonContract = buildFinalJsonContractInstruction({
    includeMemoryUpdates: flags.memoryEnabled,
    includeProductionOrders: flags.productionEnabled,
    movementOrderInstruction,
    submitMemoryClause,
    productionSubmitClause: buildProductionSubmitClause(flags),
  });
  const finalJsonExample = getFinalJsonOrdersExampleBlock({
    includeMemoryUpdates: flags.memoryEnabled,
    includeProductionOrders: flags.productionEnabled,
  });
  const scoutingDirective = humanRoster.length === 0
    ? ' No human units are currently observed: prioritize scouting this turn by moving units along plausible approach routes to reveal enemy positions; do not remain static unless required for immediate defense.'
    : '';
  const primaryGoal = buildPrimaryScenarioGoalOpeningClause();
  const prompt = `You are the opponent in a WEGO (simultaneous movement) hex wargame. Current turn: ${state.turnNumber}, phase: ${state.phase}. ${primaryGoal} Move toward observed enemy forces to bring them into ranged, melee, or air-strike range as rules allow; do not stay passive.${scoutingDirective}${warning}

${buildLatLngPreamble(H3_RESOLUTION, LATLNG_DECIMAL_PLACES)}

Combat: d6 per shot — attack hits on roll ≤ attack stat; defense hits on roll ≤ defense. ${combatSummary}. Ranged uses pre-move positions. At most one ranged_attack per unit from turn-start range; targetHex is enemy [lat,lng] or enemy unit id (not your move destination)${combatTargetHint}. Infantry are melee-only: do not emit ranged_attack for infantry; close distance and use movement/standing orders to enter melee. If a legal ranged_attack or air strike is available this turn, take it — these attacks resolve from turn-start positions and do not prevent movement in the same turn. Drop invalid attacks before submit.${navalCoaching}${combatAssessHint}

${mainBlock}

${finalJsonContract}

${finalJsonExample}`;
  return prompt;
}

/**
 * Documents the `RequestOrdersResult` interface as a named contract surface (export interface RequestOrdersResult).

 * Purpose: Supports maintainability by documenting why `RequestOrdersResult` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface RequestOrdersResult {
    /**
   * Specifies the contract for the `success` member (success: true;).

   * Contract: Describes stable behavior for callers of `success` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
success: true;
    /**
   * Specifies the contract for the `orders` member (orders: { unitId: string; toH3Index: string }[];).

   * Contract: Describes stable behavior for callers of `orders` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
orders: { unitId: string; toH3Index: string }[];
    /**
   * Specifies the contract for the `rangedAttacks` member (rangedAttacks?: { unitId: string; targetH3Index: string }[];).

   * Contract: Describes stable behavior for callers of `rangedAttacks` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
rangedAttacks?: { unitId: string; targetH3Index: string }[];
    /**
   * Specifies the contract for the `airStrikes` member (airStrikes?: AirStrikeOrder[];).

   * Contract: Describes stable behavior for callers of `airStrikes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
airStrikes?: AirStrikeOrder[];
    /**
   * Specifies the contract for the `ferryOrders` member (ferryOrders?: FerryOrder[];).

   * Contract: Describes stable behavior for callers of `ferryOrders` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
ferryOrders?: FerryOrder[];
    /**
   * Specifies the contract for the `embarkOrders` member (embarkOrders?: EmbarkOrder[];).

   * Contract: Describes stable behavior for callers of `embarkOrders` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
embarkOrders?: EmbarkOrder[];
    /**
   * Specifies the contract for the `strategy` member (strategy?: string;).

   * Contract: Describes stable behavior for callers of `strategy` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
strategy?: string;
    /**
   * Specifies the contract for the `dropped` member (dropped?: number;).

   * Contract: Describes stable behavior for callers of `dropped` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
dropped?: number;
    /**
   * Specifies the contract for the `dropReasons` member (dropReasons?: string[];).

   * Contract: Describes stable behavior for callers of `dropReasons` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
dropReasons?: string[];
    /**
   * Specifies the contract for the `toolInvocationCounts` member (toolInvocationCounts?: Record<string, number>;).

   * Contract: Describes stable behavior for callers of `toolInvocationCounts` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
toolInvocationCounts?: Record<string, number>;
    /**
   * Specifies the contract for the `cost` member (cost?: number;).

   * Contract: Describes stable behavior for callers of `cost` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
cost?: number;
    /**
   * Specifies the contract for the `wallClockMs` member (wallClockMs?: number;).

   * Contract: Describes stable behavior for callers of `wallClockMs` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
wallClockMs?: number;
    /**
   * Specifies the contract for the `inputTokens` member (inputTokens?: number;).

   * Contract: Describes stable behavior for callers of `inputTokens` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
inputTokens?: number;
    /**
   * Specifies the contract for the `outputTokens` member (outputTokens?: number;).

   * Contract: Describes stable behavior for callers of `outputTokens` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
outputTokens?: number;
}
/**
 * Documents the `RequestOrdersError` interface as a named contract surface (export interface RequestOrdersError).

 * Purpose: Supports maintainability by documenting why `RequestOrdersError` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface RequestOrdersError {
    /**
   * Specifies the contract for the `success` member (success: false;).

   * Contract: Describes stable behavior for callers of `success` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
success: false;
    /**
   * Specifies the contract for the `error` member (error: string;).

   * Contract: Describes stable behavior for callers of `error` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
error: string;
}

/**
 * Documents the `ToolDef` interface as a named contract surface (interface ToolDef).

 * Purpose: Supports maintainability by documenting why `ToolDef` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface ToolDef {
    /**
   * Specifies the contract for the `type` member (type: 'function';).

   * Contract: Describes stable behavior for callers of `type` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
type: 'function';
    /**
   * Specifies the contract for the `function` member (function: { name: string; description: string; parameters: { type: 'object'; properties: Record<string, unknown>; required?: string[] } };).

   * Contract: Describes stable behavior for callers of `function` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
function: { name: string; description: string; parameters: { type: 'object'; properties: Record<string, unknown>; required?: string[] } };
}

/**
 * Documents the `ToolMeta` interface as a named contract surface (interface ToolMeta).

 * Purpose: Supports maintainability by documenting why `ToolMeta` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface ToolMeta {
    /**
   * Specifies the contract for the `name` member (name: string;).

   * Contract: Describes stable behavior for callers of `name` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
name: string;
    /**
   * Specifies the contract for the `description` member (description: string;).

   * Contract: Describes stable behavior for callers of `description` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
description: string;
    /**
   * Specifies the contract for the `parameters` member (parameters: { type: 'object'; properties: Record<string, unknown>; required?: string[] };).

   * Contract: Describes stable behavior for callers of `parameters` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
parameters: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
    /**
   * Specifies the contract for the `promptLine` member (promptLine: string;).

   * Contract: Describes stable behavior for callers of `promptLine` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
promptLine: string;
}

/**
 * Documents the module-scope binding `ALL_TOOL_METADATA` (ALL_TOOL_METADATA: ToolMeta[]).

 * Purpose: Supports maintainability by documenting why `ALL_TOOL_METADATA` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const ALL_TOOL_METADATA: ToolMeta[] = [
  {
    name: 'plan_route',
    description: 'Compute the optimal path for a unit to a destination hex. Returns the full multi-turn route with per-turn waypoints. Use to understand how long moves take before committing.',
    parameters: {
      type: 'object',
      properties: {
        unitId: { type: 'string', description: 'ID of the unit to route (e.g. opponent-armor-1)' },
        destination: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2, description: 'Target hex as [lat, lng]' },
        options: {
          type: 'object',
          properties: {
            avoidEnemies: { type: 'boolean', description: 'Route around known enemy positions (default true)' },
            maxTurns: { type: 'number', description: 'Stop if route exceeds this many turns' },
          },
        },
      },
      required: ['unitId', 'destination'],
    },
    promptLine: `plan_route(unitId, destination, options?) - Compute the optimal path for a unit to a destination hex. Returns multi-turn route and orderToXY: the exact [lat, lng] for this turn's movement order (copy this into explicit_move.destination for that unit).${NAVAL_PLAN_ROUTE_PROMPT_SUFFIX}`,
  },
  {
    name: 'check_distance',
    description: 'Quick distance and turn estimate between two hexes for a unit type. Use to compare options before requesting full routes.',
    parameters: {
      type: 'object',
      properties: {
        from: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2, description: 'Origin hex [lat, lng]' },
        to: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2, description: 'Destination hex [lat, lng]' },
        unitType: { type: 'string', enum: ['infantry', 'armor', 'naval', 'air'], description: 'Unit type for movement budget' },
      },
      required: ['from', 'to', 'unitType'],
    },
    promptLine: 'check_distance(from, to, unitType) - Quick distance and turn estimate between two hexes. Use to compare options before requesting full routes.',
  },
  {
    name: 'assess_unit',
    description: 'Tactical briefing on one of your units: nearby enemies and friendlies, threats, and what you can attack this turn.',
    parameters: {
      type: 'object',
      properties: {
        unitId: { type: 'string', description: 'ID of the unit to assess (e.g. opponent-armor-1)' },
        radius: { type: 'number', description: 'How far out to scan in hexes (default 4)' },
      },
      required: ['unitId'],
    },
    promptLine: 'assess_unit(unitId, radius?) - Tactical briefing on one of your units: nearby enemies and friendlies, threats, and what you can attack this turn.',
  },
  {
    name: 'assess_hex',
    description: 'Intelligence on a hex: terrain, units present, units that can attack it, chokepoint analysis.',
    parameters: {
      type: 'object',
      properties: {
        position: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2, description: 'Hex to assess as [lat, lng]' },
        forUnitType: { type: 'string', enum: ['infantry', 'armor', 'naval', 'air'], description: 'Assess from this unit type perspective (for chokepoint)' },
      },
      required: ['position'],
    },
    promptLine: 'assess_hex(position, forUnitType?) - Intelligence on a hex: terrain, units present, units in range, chokepoint analysis.',
  },
  {
    name: 'estimate_combat',
    description: 'Predict the outcome of a single ranged or melee engagement. Returns win probability, expected casualties, and a tactical assessment. Always check before committing to an attack.',
    parameters: {
      type: 'object',
      properties: {
        engagementType: { type: 'string', enum: ['ranged', 'melee'], description: 'Type of engagement' },
        attackers: {
          type: 'object',
          properties: {
            units: { type: 'array', items: { type: 'string' }, description: 'Attacking unit IDs' },
            assumed: {
              type: 'array',
              items: { type: 'object', properties: { type: { type: 'string' }, count: { type: 'number' } }, required: ['type', 'count'] },
              description: 'Hypothetical attackers by type and count (for what-if)',
            },
          },
          description: 'Attackers: either units (IDs) or assumed (type, count)',
        },
        targetHex: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2, description: 'Target hex [lat, lng]' },
        defenders: {
          type: 'object',
          properties: {
            units: { type: 'array', items: { type: 'string' }, description: 'Defender unit IDs (overrides auto-detect)' },
            assumed: {
              type: 'array',
              items: { type: 'object', properties: { type: { type: 'string' }, count: { type: 'number' } }, required: ['type', 'count'] },
              description: 'Hypothetical defenders by type and count',
            },
          },
          description: 'Optional. If omitted, defenders at target hex are used.',
        },
      },
      required: ['engagementType', 'attackers', 'targetHex'],
    },
    promptLine: 'estimate_combat(engagementType, attackers, targetHex, defenders?) - Predict the outcome of a ranged or melee engagement. Returns win probability, expected casualties, and a tactical assessment. Always check before committing to an attack.',
  },
  {
    name: 'memory_read',
    description: 'Retrieve memories by key, tag, or tier. Use to access stored-tier memories.',
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Read a specific memory by key' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Memories matching any of these tags' },
        tier: { type: 'string', enum: ['persistent', 'stored'], description: 'Filter by tier' },
        all: { type: 'boolean', description: 'Read all active memories (default false)' },
      },
    },
    promptLine: 'memory_read(key?, tags?, tier?, all?) - Retrieve memories by key, tag, or tier.',
  },
  {
    name: 'query_orders',
    description: 'Check standing order statuses for a unit or all units.',
    parameters: {
      type: 'object',
      properties: {
        unitId: { type: 'string', description: 'Query a specific unit\'s standing order' },
        all: { type: 'boolean', description: 'Query all standing orders (default false)' },
      },
    },
    promptLine: 'query_orders(unitId?, all?) - Check standing order statuses.',
  },
  {
    name: 'query_production',
    description: 'Read production queue status for one controlled hex or all controlled hexes.',
    parameters: {
      type: 'object',
      properties: {
        hex: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2, description: 'Optional target hex [lat, lng]' },
        all: { type: 'boolean', description: 'When true, returns all controlled-hex production queues' },
      },
    },
    promptLine: 'query_production(hex?, all?) - Read production queue status and available unit types by controlled hex.',
  },
  {
    name: 'set_build_queue',
    description: 'Set one production unit type/count for a controlled hex, replacing existing queue entries.',
    parameters: {
      type: 'object',
      properties: {
        hex: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2, description: 'Controlled hex [lat, lng]' },
        unitType: { type: 'string', enum: ['infantry', 'armor', 'naval', 'air'], description: 'Unit type to keep in queue' },
        count: { type: 'number', description: 'Build count (1..99) for the selected unit type' },
      },
      required: ['hex', 'unitType', 'count'],
    },
    promptLine: 'set_build_queue(hex, unitType, count) - Set one queue unit type/count and replace any previous entries for that hex.',
  },
];

/**
 * Defines the `getFilteredToolMetadata` function shape (function getFilteredToolMetadata(enabledToolNames?: string[]): ToolMeta[]).

 * Purpose: Supports maintainability by documenting why `getFilteredToolMetadata` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function getFilteredToolMetadata(enabledToolNames?: string[]): ToolMeta[] {
  if (enabledToolNames === undefined) return [...ALL_TOOL_METADATA];
  const set = new Set(enabledToolNames);
  return ALL_TOOL_METADATA.filter((m) => set.has(m.name));
}

/**
 * Defines the `buildToolDefinitions` function shape (function buildToolDefinitions(enabledToolNames?: string[]): ToolDef[]).

 * Purpose: Supports maintainability by documenting why `buildToolDefinitions` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function buildToolDefinitions(enabledToolNames?: string[]): ToolDef[] {
  return getFilteredToolMetadata(enabledToolNames).map((m) => ({
    type: 'function' as const,
    function: { name: m.name, description: m.description, parameters: m.parameters },
  }));
}

/**
 * Documents the module-scope binding `OPENROUTER_REQUEST_TIMEOUT_MS` (OPENROUTER_REQUEST_TIMEOUT_MS).

 * Purpose: Supports maintainability by documenting why `OPENROUTER_REQUEST_TIMEOUT_MS` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const OPENROUTER_REQUEST_TIMEOUT_MS = 45_000;
/**
 * Documents the module-scope binding `OPENROUTER_RESPONSE_IDLE_TIMEOUT_MS` (OPENROUTER_RESPONSE_IDLE_TIMEOUT_MS).

 * Purpose: Supports maintainability by documenting why `OPENROUTER_RESPONSE_IDLE_TIMEOUT_MS` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const OPENROUTER_RESPONSE_IDLE_TIMEOUT_MS = 15_000;
/**
 * Documents the module-scope binding `OPENROUTER_RESPONSE_HARD_TIMEOUT_MS` (OPENROUTER_RESPONSE_HARD_TIMEOUT_MS).

 * Purpose: Supports maintainability by documenting why `OPENROUTER_RESPONSE_HARD_TIMEOUT_MS` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const OPENROUTER_RESPONSE_HARD_TIMEOUT_MS = 90_000;
/**
 * Documents the module-scope binding `OPENROUTER_REQUEST_RETRY_COUNT` (OPENROUTER_REQUEST_RETRY_COUNT).

 * Purpose: Supports maintainability by documenting why `OPENROUTER_REQUEST_RETRY_COUNT` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const OPENROUTER_REQUEST_RETRY_COUNT = 1;

/**
 * Defines the `isRetryableStatus` function shape (function isRetryableStatus(status: number): boolean).

 * Purpose: Supports maintainability by documenting why `isRetryableStatus` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/**
 * Defines the `getRetryDelayMs` function shape (function getRetryDelayMs(): number).

 * Purpose: Supports maintainability by documenting why `getRetryDelayMs` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function getRetryDelayMs(): number {
  return 300 + Math.floor(Math.random() * 700);
}

/**
 * Defines the `delayMs` function shape (function delayMs(ms: number): Promise<void>).

 * Purpose: Supports maintainability by documenting why `delayMs` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function delayMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Defines the `postOpenRouterChatWithTimeoutAndRetry` function shape (async function postOpenRouterChatWithTimeoutAndRetry(payload: { key: string; body: Record<string, unknown>; signal?: AbortSignal; onLog?: (line: str).

 * Purpose: Supports maintainability by documenting why `postOpenRouterChatWithTimeoutAndRetry` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
async function postOpenRouterChatWithTimeoutAndRetry(payload: {
  key: string;
  body: Record<string, unknown>;
  signal?: AbortSignal;
  onLog?: (line: string, isError?: boolean) => void;
  requestLabel: string;
}): Promise<{ ok: true; status: number; headers: Record<string, string>; bodyText: string } | { ok: false; error: string }> {
  let lastError = `${payload.requestLabel} failed.`;
  for (let attempt = 0; attempt <= OPENROUTER_REQUEST_RETRY_COUNT; attempt++) {
    const controller = new AbortController();
    const parentSignal = payload.signal;
    const onParentAbort = () => controller.abort();
    if (parentSignal) {
      if (parentSignal.aborted) controller.abort();
      else parentSignal.addEventListener('abort', onParentAbort, { once: true });
    }
    const timeoutId = setTimeout(() => controller.abort(), OPENROUTER_REQUEST_TIMEOUT_MS);
    try {
      logDebug(`openRouter ${payload.requestLabel}: request attempt start`, {
        attempt: attempt + 1,
        timeoutMs: OPENROUTER_REQUEST_TIMEOUT_MS,
      });
      const chatResponse = await postChatViaHttps({
        key: payload.key,
        requestBody: payload.body,
        signal: controller.signal,
        timeoutMs: OPENROUTER_REQUEST_TIMEOUT_MS,
        responseIdleTimeoutMs: OPENROUTER_RESPONSE_IDLE_TIMEOUT_MS,
        responseHardTimeoutMs: OPENROUTER_RESPONSE_HARD_TIMEOUT_MS,
        attempt: attempt + 1,
        requestLabel: payload.requestLabel,
      });
      logDebug(`openRouter ${payload.requestLabel}: request attempt completed`, {
        attempt: attempt + 1,
        ok: chatResponse.status >= 200 && chatResponse.status < 300,
        status: chatResponse.status,
      });
      if (chatResponse.status >= 200 && chatResponse.status < 300) {
        return { ok: true, status: chatResponse.status, headers: chatResponse.headers, bodyText: chatResponse.bodyText };
      }
      lastError = chatResponse.status === 401 ? 'Invalid API key' : `API error: ${chatResponse.status}`;
      logError(`openRouter ${payload.requestLabel}: API error`, chatResponse.status, chatResponse.bodyText.slice(0, 200));
      if (chatResponse.status === 401) return { ok: false, error: lastError };
      if (attempt < OPENROUTER_REQUEST_RETRY_COUNT && isRetryableStatus(chatResponse.status)) {
        const waitMs = getRetryDelayMs();
        logDebug(`openRouter ${payload.requestLabel}: retrying after API error`, {
          attempt: attempt + 1,
          status: chatResponse.status,
          retryInMs: waitMs,
        });
        await delayMs(waitMs);
        continue;
      }
      return { ok: false, error: lastError };
    } catch (err) {
      if (parentSignal?.aborted) return { ok: false, error: 'Cancelled' };
      const timeoutLike = controller.signal.aborted;
      const isResponseStreamStall =
        String(err).includes('HTTPS_RESPONSE_IDLE_TIMEOUT_') ||
        String(err).includes('HTTPS_RESPONSE_SOCKET_TIMEOUT_') ||
        String(err).includes('HTTPS_RESPONSE_HARD_TIMEOUT_');
      if (timeoutLike) {
        lastError = 'AI request timed out. Please try again.';
        if (payload.onLog) payload.onLog(lastError, true);
        logError(`openRouter ${payload.requestLabel}: timeout`, {
          timeoutMs: OPENROUTER_REQUEST_TIMEOUT_MS,
          attempt: attempt + 1,
        });
      } else if (isResponseStreamStall) {
        lastError = 'AI response stream stalled. Please try again.';
        if (payload.onLog) payload.onLog(lastError, true);
        logError(`openRouter ${payload.requestLabel}: response stream timeout`, {
          attempt: attempt + 1,
          error: String(err),
        });
        return { ok: false, error: lastError };
      } else {
        lastError = `Network error while requesting AI orders: ${String(err)}`;
        logError(`openRouter ${payload.requestLabel}: fetch exception`, err);
      }
      if (attempt < OPENROUTER_REQUEST_RETRY_COUNT) {
        const waitMs = getRetryDelayMs();
        logDebug(`openRouter ${payload.requestLabel}: retrying after exception`, {
          attempt: attempt + 1,
          retryInMs: waitMs,
        });
        await delayMs(waitMs);
        continue;
      }
      return { ok: false, error: lastError };
    } finally {
      clearTimeout(timeoutId);
      if (parentSignal) parentSignal.removeEventListener('abort', onParentAbort);
    }
  }
  return { ok: false, error: lastError };
}

/**
 * Documents the `OpenRouterChatTransport` type alias (type OpenRouterChatTransport).

 * Purpose: Supports maintainability by documenting why `OpenRouterChatTransport` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
type OpenRouterChatTransport = (payload: {
  key: string;
  body: Record<string, unknown>;
  signal?: AbortSignal;
  onLog?: (line: string, isError?: boolean) => void;
  requestLabel: string;
}) => Promise<{ ok: true; status: number; headers: Record<string, string>; bodyText: string } | { ok: false; error: string }>;

/**
 * Documents the module-scope binding `chatTransportOverride` (chatTransportOverride: OpenRouterChatTransport | null).

 * Purpose: Supports maintainability by documenting why `chatTransportOverride` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
let chatTransportOverride: OpenRouterChatTransport | null = null;

/**
 * Defines the `setChatTransportOverrideForTests` function shape (export function setChatTransportOverrideForTests(override: OpenRouterChatTransport | null): void).

 * Purpose: Supports maintainability by documenting why `setChatTransportOverrideForTests` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function setChatTransportOverrideForTests(override: OpenRouterChatTransport | null): void {
  logDebug('openRouter setChatTransportOverrideForTests', { enabled: override !== null });
  chatTransportOverride = override;
}

/**
 * Defines the `postChatViaHttps` function shape (async function postChatViaHttps(args: { key: string; requestBody: Record<string, unknown>; signal: AbortSignal; timeoutMs: number; responseIdleTi).

 * Purpose: Supports maintainability by documenting why `postChatViaHttps` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
async function postChatViaHttps(args: {
  key: string;
  requestBody: Record<string, unknown>;
  signal: AbortSignal;
  timeoutMs: number;
  responseIdleTimeoutMs: number;
  responseHardTimeoutMs: number;
  attempt: number;
  requestLabel: string;
}): Promise<{ status: number; headers: Record<string, string>; bodyText: string }> {
  const url = new URL(OPENROUTER_CHAT_URL);
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${args.key}`,
          'Accept-Encoding': 'gzip, deflate, br, identity',
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let responseIdleTimer: ReturnType<typeof setTimeout> | null = null;
        let responseHardTimer: ReturnType<typeof setTimeout> | null = null;
        const resetResponseIdleTimer = () => {
          if (responseIdleTimer) clearTimeout(responseIdleTimer);
          responseIdleTimer = setTimeout(() => {
            req.destroy(new Error(`HTTPS_RESPONSE_IDLE_TIMEOUT_${args.responseIdleTimeoutMs}`));
          }, args.responseIdleTimeoutMs);
        };
        responseHardTimer = setTimeout(() => {
          req.destroy(new Error(`HTTPS_RESPONSE_HARD_TIMEOUT_${args.responseHardTimeoutMs}`));
        }, args.responseHardTimeoutMs);
        resetResponseIdleTimer();
        res.setTimeout(args.responseIdleTimeoutMs, () => {
          res.destroy(new Error(`HTTPS_RESPONSE_SOCKET_TIMEOUT_${args.responseIdleTimeoutMs}`));
        });
        res.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
          resetResponseIdleTimer();
        });
        res.on('end', () => {
          try {
            if (responseIdleTimer) clearTimeout(responseIdleTimer);
            if (responseHardTimer) clearTimeout(responseHardTimer);
            const raw = Buffer.concat(chunks);
            const contentEncodingHeader = Array.isArray(res.headers['content-encoding'])
              ? res.headers['content-encoding'][0] ?? ''
              : (res.headers['content-encoding'] ?? '');
            const contentEncoding = String(contentEncodingHeader).toLowerCase();
            let decoded = raw;
            if (contentEncoding.includes('gzip')) decoded = gunzipSync(raw);
            else if (contentEncoding.includes('deflate')) decoded = inflateSync(raw);
            else if (contentEncoding.includes('br')) decoded = brotliDecompressSync(raw);
            const responseHeaders: Record<string, string> = {};
            for (const [name, value] of Object.entries(res.headers)) {
              if (typeof value === 'string') responseHeaders[name] = value;
              else if (Array.isArray(value) && value.length > 0) responseHeaders[name] = value.join(', ');
            }
            resolve({
              status: res.statusCode ?? 0,
              headers: responseHeaders,
              bodyText: decoded.toString('utf-8'),
            });
          } catch (decodeErr) {
            reject(decodeErr);
          }
        });
        res.on('error', (err) => {
          if (responseIdleTimer) clearTimeout(responseIdleTimer);
          if (responseHardTimer) clearTimeout(responseHardTimer);
          reject(err);
        });
      }
    );
    const onAbort = () => req.destroy(new Error('AbortError'));
    if (args.signal.aborted) {
      onAbort();
      return;
    }
    args.signal.addEventListener('abort', onAbort, { once: true });
    req.setTimeout(args.timeoutMs, () => {
      req.destroy(new Error(`HTTPS_TIMEOUT_${args.timeoutMs}`));
    });
    req.on('error', (err) => {
      args.signal.removeEventListener('abort', onAbort);
      reject(err);
    });
    req.on('close', () => {
      args.signal.removeEventListener('abort', onAbort);
    });
    req.write(JSON.stringify(args.requestBody));
    req.end();
  });
}

/**
 * Documents the `RequestOrdersOptions` interface as a named contract surface (export interface RequestOrdersOptions).

 * Purpose: Supports maintainability by documenting why `RequestOrdersOptions` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface RequestOrdersOptions {
    /**
   * Specifies the contract for the `enabledToolNames` member (enabledToolNames?: string[];).

   * Contract: Describes stable behavior for callers of `enabledToolNames` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
enabledToolNames?: string[];
    /**
   * Specifies the contract for the `signal` member (signal?: AbortSignal;).

   * Contract: Describes stable behavior for callers of `signal` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
signal?: AbortSignal;
    /**
   * Specifies the contract for the `onLog` member (onLog?: (line: string, isError?: boolean) => void;).

   * Contract: Describes stable behavior for callers of `onLog` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
onLog?: (line: string, isError?: boolean) => void;
    /**
   * Specifies the contract for the `usePrecomputation` member (usePrecomputation?: boolean;).

   * Contract: Describes stable behavior for callers of `usePrecomputation` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
usePrecomputation?: boolean;
}

/**
 * Defines the `requestOrders` function shape (export async function requestOrders( state: GameStateSnapshot, modelId: string, options?: RequestOrdersOptions ): Promise<RequestOrdersResult | Reques).

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
  const activeTransport = chatTransportOverride ?? postOpenRouterChatWithTimeoutAndRetry;
  return requestOrdersFlow(
    {
      loadKey,
      getToolFlags,
      toolGroupRegistry: TOOL_GROUP_REGISTRY,
      buildSystemPromptForTools,
      buildToolDefinitions,
      postOpenRouterChatWithTimeoutAndRetry: activeTransport,
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
