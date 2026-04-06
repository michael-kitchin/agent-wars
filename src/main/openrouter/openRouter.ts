/**
 * OpenRouter integration: API key storage, list models, and request AI movement orders.
 * All key handling is in the main process; the key is never logged or sent to the renderer in plain form.
 */

import * as fs from 'fs';
import * as path from 'path';
import { app, safeStorage } from 'electron';
import { cellToLatLng, gridDistance } from 'h3-js';
import { getAttack, getDefense, getRange } from './combatConstants';
import { logDebug, logError, logTrace } from './logger';
import type { GameStateSnapshot } from './gameDb';
import {
  setAiToolLimitExceededLastTurn,
  getAndClearAiToolLimitExceededLastTurn,
  getAiLossEventsSinceConsultation,
  clearAiLossEventsSinceConsultation,
  setAiLastConsultationTurn,
  dbGetOne,
  dbRun,
} from './gameDb';
import { buildLatLngCoordinateMap, H3_RESOLUTION, LATLNG_DECIMAL_PLACES } from './mapData';
import { executeTool1, TOOL1_NAMES } from './tools/tool1Pathfinding';
import { executeTool2, TOOL2_NAMES } from './tools/tool2Assessment';
import { executeTool3, TOOL3_NAMES } from './tools/tool3CombatEstimation';
import { executeTool4, getInjectionText, TOOL4_NAMES } from './tools/tool4Memory';
import {
  executeTool5,
  getInjectionText as getStandingOrderInjectionText,
  generateOrdersForStandingOrders,
  TOOL5_NAMES,
} from './tools/tool5StandingOrders';
import { executeTool6, TOOL6_NAMES } from './tools/tool6Production';
import { runPrecomputation } from './precomputation';
import { formatBriefing } from './briefingFormatter';
import { replaceSubscriptions, getSubscriptions } from './callbackSubscriptions';
import { passabilityAllowsLandUnit, passabilityAllowsNavalUnit } from '../shared/pipelineTerrain';
import { MOVEMENT_RANGE_BY_UNIT_TYPE } from '../shared/tacticalRanges';
import { buildFinalJsonContractInstruction } from './openRouterPromptContracts';
import { buildAirOperationsBriefingBlock, buildProductionBriefingBlock } from './openrouter/briefingSections';
import {
  buildAdjacentCellsFallbackBlock,
  buildHumanUnitsPromptLine,
  buildLatLngPreamble,
  buildProductionSubmitClause,
  buildToolUsageGuidance,
  formatLatLng as formatLatLngWithPrecision,
  getInitialUserMessage,
  getMovementOrderInstruction,
} from './openrouter/promptText';
import { buildJsonAssistantRepairSchema, parseOrdersResponse } from './openrouter/orderResponseParsing';
import {
  requestOrdersFlow,
} from './openrouter/requestOrdersFlow';
import {
  NAVAL_DESTINATION_MUST_BE_WATER_COASTAL,
  NAVAL_MOVEMENT_PROMPT_RULE,
  NAVAL_PLAN_ROUTE_LAND_TARGET_HINT,
  NAVAL_PLAN_ROUTE_PROMPT_SUFFIX,
} from './navalMovementMessages';
import type { AirStrikeOrder, FerryOrder } from '../shared/ipcTypes';

export type { MemoryUpdateItem } from './openrouter/orderResponseParsing';

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_KEY_DB_CONFIG_KEY = 'openrouter_api_key';
const OPENROUTER_SELECTED_MODEL_DB_CONFIG_KEY = 'openrouter_selected_model';

/** Returns the path to the OpenRouter config file (userData). Call after app is ready. */
function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'openrouter-config.json');
}

function loadGameConfigValue(key: string): string | null {
  const row = dbGetOne<{ value: string }>('SELECT value FROM game_config WHERE key = ?', [key]);
  return row?.value ?? null;
}

function saveGameConfigValue(key: string, value: string): void {
  dbRun('INSERT OR REPLACE INTO game_config (key, value) VALUES (?, ?)', [key, value]);
}

function deleteGameConfigValue(key: string): void {
  dbRun('DELETE FROM game_config WHERE key = ?', [key]);
}

/**
 * Loads the stored API key from disk. Uses safeStorage to decrypt if available.
 * Returns empty string if no key or read fails. Never logs the key.
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
 * Saves the API key to disk. Uses safeStorage to encrypt if available.
 * Pass empty string to clear. Never logs the key.
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
 * Returns whether the stored key is non-empty (masked for IPC; never returns the actual key).
 */
export function hasKey(): boolean {
  return loadKey().length > 0;
}

let selectedModelId: string = '';

/**
 * Stores the model id selected in the UI for use when requesting AI orders. Call from IPC when the user selects a model.
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
 * Returns the currently selected model id for AI orders. Used by the ready flow when requesting opponent orders.
 */
export function getSelectedModel(): string {
  if (!selectedModelId.trim()) {
    selectedModelId = loadGameConfigValue(OPENROUTER_SELECTED_MODEL_DB_CONFIG_KEY) ?? '';
  }
  return selectedModelId;
}

/** Single tool group in the registry: id, display label, and API tool names (from TOOL*_NAMES). */
export interface ToolGroupEntry {
  id: string;
  label: string;
  toolNames: readonly string[];
}

/** Ordered registry of tool groups. Single source of truth for group id, label, and which API names belong to each group. */
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
 * Returns the ordered list of tool groups for the UI (id and label only).
 * Use so the renderer can build the Tools tab from a single source of truth.
 */
export function getToolGroupList(): { id: string; label: string }[] {
  logTrace('openRouter getToolGroupList');
  return TOOL_GROUP_REGISTRY.map((g) => ({ id: g.id, label: g.label }));
}

/**
 * Returns all API tool names for the given enabled group IDs.
 * Use when building the OpenRouter request (tools array and prompt) from enabled groups.
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

/** Map from API tool name to its group id. Used for per-group invocation counting. */
const TOOL_NAME_TO_GROUP_ID = (() => {
  const m = new Map<string, string>();
  for (const g of TOOL_GROUP_REGISTRY) {
    for (const name of g.toolNames) m.set(name, g.id);
  }
  return m;
})();

/**
 * Returns the tool group id for an API tool name, or undefined if unknown.
 */
export function getGroupIdForToolName(toolName: string): string | undefined {
  logTrace('openRouter getGroupIdForToolName', { toolName });
  return TOOL_NAME_TO_GROUP_ID.get(toolName);
}

/**
 * Which tool groups are enabled for this request. Single source of truth for prompt conditionals.
 * When enabledToolNames is undefined, all tools are considered enabled.
 */
export interface ToolFlags {
  planningEnabled: boolean;
  assessmentEnabled: boolean;
  estimationEnabled: boolean;
  ordersEnabled: boolean;
  memoryEnabled: boolean;
  productionEnabled: boolean;
  /** True when neither Planning nor Orders is enabled; one-step move fallback is then used. */
  fallbackMovementEnabled: boolean;
}

/**
 * Derives which tool groups are enabled from the list of enabled API tool names.
 * Use when building system prompt and user message so both use the same logic.
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

export interface ModelItem {
  id: string;
  name?: string;
}

/**
 * Fetches the list of models from OpenRouter. Uses the stored API key.
 * Returns models (id + name) or an error message. Logs errors; never logs the key.
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
 * Validates a single AI order: unit must be opponent-owned, destination on map,
 * within movement range, and terrain must allow the unit type. Returns reason when invalid.
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

  const destHex = state.hexes.find((h) => h.h3Index === order.toH3Index);
  const terrain = destHex?.terrain ?? 'land';
  if (unit.unitType === 'naval' && !passabilityAllowsNavalUnit(terrain)) {
    return { valid: false, reason: NAVAL_DESTINATION_MUST_BE_WATER_COASTAL };
  }
  if ((unit.unitType === 'infantry' || unit.unitType === 'armor') && !passabilityAllowsLandUnit(terrain)) {
    return { valid: false, reason: 'Land units must move to land, coastal, or wetlands hexes' };
  }
  return { valid: true };
}

/**
 * Returns H3 indices that are valid move destinations for the given unit (within range, correct terrain).
 * Skips hexes where gridDistance throws (e.g. invalid or mismatched resolution).
 * Does not exclude occupied hexes; use getValidDestinationsUnoccupied when building the fallback list.
 */
function getValidDestinations(unit: { h3Index: string; unitType: string }, state: GameStateSnapshot): string[] {
  const range = MOVEMENT_RANGE_BY_UNIT_TYPE[unit.unitType] ?? 1;
  const wantLand = unit.unitType === 'infantry' || unit.unitType === 'armor';
  const valid: string[] = [];
  for (const h of state.hexes) {
    if (h.h3Index === unit.h3Index) continue;
    let dist: number;
    try {
      dist = gridDistance(unit.h3Index, h.h3Index);
    } catch {
      continue;
    }
    if (dist < 1 || dist > range) continue;
    if (unit.unitType === 'naval' && !passabilityAllowsNavalUnit(h.terrain)) continue;
    if (wantLand && !passabilityAllowsLandUnit(h.terrain)) continue;
    valid.push(h.h3Index);
  }
  return valid;
}

/**
 * Returns valid one-step move destinations for a unit, excluding hexes occupied by any unit.
 * Used to build the adjacent-cells fallback list when Planning and Orders tools are disabled.
 */
function getValidDestinationsUnoccupied(unit: { h3Index: string; unitType: string }, state: GameStateSnapshot): string[] {
  logTrace('openRouter getValidDestinationsUnoccupied', { h3Index: unit.h3Index, unitType: unit.unitType });
  const occupied = new Set(state.units.map((u) => u.h3Index));
  return getValidDestinations(unit, state).filter((h3) => !occupied.has(h3));
}

/**
 * Validates a single AI ranged order against the state snapshot. Unit must be opponent-owned, have range ≥ 1, target in range, target has enemy.
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

/** Formats [lat, lng] for prompts using LATLNG_DECIMAL_PLACES to match resolveToH3. */
function formatLatLng(ll: [number, number]): string {
  return formatLatLngWithPrecision(ll, LATLNG_DECIMAL_PLACES);
}

// prompt helpers extracted to openrouter/promptText.ts

/**
 * Builds the system prompt for the tool-calling LLM: roster, combat summary, and tool descriptions.
 * When enabledToolNames is provided, "AVAILABLE TOOLS" lists only those tools (numbered 1..N); when omitted, all tools.
 * Injects a one-time warning if the previous turn exceeded the tool-call limit.
 * When briefingOverride is set (pre-computation path), it replaces the usual memory + standing-order + roster block
 * with the Commander's Briefing; combat rules, tools section, and submit instruction stay the same.
 *
 * Prompt conditionals (single source: getToolFlags):
 * - Planning enabled → use plan_route orderToXY for movement.
 * - Orders enabled, Planning disabled → prefer assign_order in orders[]; avoid invalid explicit_move without valid [lat,lng].
 * - Fallback (neither Planning nor Orders) → show adjacent-cells list; model may issue one-step moves from that list.
 * - Combat hints (naval plan, assess, estimate) and memory/standing-order blocks depend on their respective flags.
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
      ? 'Use the COMMANDER\'S BRIEFING above for assessments and combat estimates; use these tools only when you need plan_route (exact orderToXY), memory_read, or query_orders.'
      : `Use these tools to ${toolsIntroPurpose} before submitting orders. You may use multiple rounds of tool calls and mix tool types if that helps.` +
        (flags.memoryEnabled ? ' Memory: use memory_read as needed; persist notes via memoryUpdates in your final JSON.' : '')
    : 'Use only the tools listed below. Do not call tools that are not in the list.';
  const toolGuidance = buildToolUsageGuidance(flags, hasPrecomputedBriefing);
  const toolsSection =
    filtered.length === 0
      ? '=== AVAILABLE TOOLS ===\nNo tools available.'
      : `=== AVAILABLE TOOLS ===
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

  const hasNaval = opponentUnits.some((u) => u.unitType === 'naval');
  const hasRanged = opponentUnits.some((u) => getRange(u.unitType as 'infantry' | 'armor' | 'naval') >= 1);

  const combatTargetHint = flags.estimationEnabled ? ' (e.g. use estimate_combat to pick the best)' : '';
  const navalCoaching = hasNaval
    ? ` Naval units can attack land units at 1 or 2 hexes (range 2). Add explicit_attack when a naval unit is within 2 hexes of an enemy at turn start. ${NAVAL_MOVEMENT_PROMPT_RULE}${flags.planningEnabled ? NAVAL_PLAN_ROUTE_LAND_TARGET_HINT : ''}`
    : '';
  const combatAssessHint = flags.assessmentEnabled && hasRanged
    ? ' When assess_unit reports canAttackThisTurn with attackType "ranged" for an enemy, add explicit_attack with targetHex as that enemy\'s [lat,lng] (or unit id).' +
      (hasNaval ? ' Naval inRangedRange: add explicit_attack for that naval unit.' : '') +
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
  const mainBlock = briefingOverride != null && briefingOverride.length > 0
    ? `${briefingOverride}\n\n${airOpsBlock}${toolsSection}\n\nYour units (ID, type, position [lat, lng]): ${opponentRoster || 'none'}\n${humanUnitsLine}`
    : `${memoryBlock}${standingOrderBlock}${productionBlock}${airOpsBlock}${toolsSection}\n\nYour units (ID, type, position [lat, lng]): ${opponentRoster || 'none'}\n${humanUnitsLine}${adjacentCellsBlock}`;

  const finalJsonContract = buildFinalJsonContractInstruction({
    includeMemoryUpdates: flags.memoryEnabled,
    includeProductionOrders: flags.productionEnabled,
    movementOrderInstruction,
    submitMemoryClause,
    productionSubmitClause: buildProductionSubmitClause(flags),
  });
  const scoutingDirective = humanRoster.length === 0
    ? ' No human units are currently observed: prioritize scouting this turn by moving units along plausible approach routes to reveal enemy positions; do not remain static unless required for immediate defense.'
    : '';
  const prompt = `You are the opponent in a WEGO (simultaneous movement) hex wargame. Current turn: ${state.turnNumber}, phase: ${state.phase}. Your objective is to destroy all human units. Move toward human units to get in ranged or melee range; do not stay passive.${scoutingDirective}${warning}

${buildLatLngPreamble(H3_RESOLUTION, LATLNG_DECIMAL_PLACES)}

Combat: each unit rolls d6 when attacking (hit if roll <= attack) or when defending (hit if roll <= defender's defense). Unit stats: ${combatSummary}. Ranged attacks use each unit's current position (before movement). Only add explicit_attack if already in range at turn start from that START position (before any explicit_move). At most one explicit_attack per unit per turn (duplicate unitIds dropped). targetHex must be enemy [lat,lng] from "Human units" or the enemy unit id string — never your own movement destination${combatTargetHint}. Self-filter illegal explicit_attack entries before submitting.${navalCoaching}${combatAssessHint}

${mainBlock}

${finalJsonContract}`;
  return prompt;
}

export interface RequestOrdersResult {
  success: true;
  orders: { unitId: string; toH3Index: string }[];
  rangedAttacks?: { unitId: string; targetH3Index: string }[];
  airStrikes?: AirStrikeOrder[];
  ferryOrders?: FerryOrder[];
  strategy?: string;
  dropped?: number;
  dropReasons?: string[];
  /** Per-group invocation counts for this turn (ad-hoc LLM tool calls only; pre-computation not counted). */
  toolInvocationCounts?: Record<string, number>;
  /** Total cost in dollars for this request (sum of usage.cost across all round-trips in the tool loop). */
  cost?: number;
  /** Wall-clock time in ms for the request (from before tool loop to final response). */
  wallClockMs?: number;
  /** Input token count when the API supplies usage.prompt_tokens (sum across round-trips). */
  inputTokens?: number;
  /** Output token count when the API supplies usage.completion_tokens (sum across round-trips). */
  outputTokens?: number;
}
export interface RequestOrdersError {
  success: false;
  error: string;
}

/** OpenAI-compatible tool definition for OpenRouter. */
interface ToolDef {
  type: 'function';
  function: { name: string; description: string; parameters: { type: 'object'; properties: Record<string, unknown>; required?: string[] } };
}

/** Single source for tool schema and prompt line. Used to build both OpenRouter tools array and system prompt section. */
interface ToolMeta {
  name: string;
  description: string;
  parameters: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
  promptLine: string;
}

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
    name: 'add_build_entry',
    description: 'Append one production queue entry for a controlled hex.',
    parameters: {
      type: 'object',
      properties: {
        hex: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2, description: 'Controlled hex [lat, lng]' },
        unitType: { type: 'string', enum: ['infantry', 'armor', 'naval', 'air'], description: 'Unit type for the new queue entry' },
        count: { type: 'number', description: 'Requested build count (1..99)' },
      },
      required: ['hex', 'unitType', 'count'],
    },
    promptLine: 'add_build_entry(hex, unitType, count) - Append one production queue entry for a controlled hex.',
  },
  {
    name: 'update_build_entry',
    description: 'Update one existing production queue entry (unit type and count).',
    parameters: {
      type: 'object',
      properties: {
        hex: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2, description: 'Controlled hex [lat, lng]' },
        entryId: { type: 'number', description: 'Queue entry id to edit' },
        unitType: { type: 'string', enum: ['infantry', 'armor', 'naval', 'air'], description: 'Replacement unit type' },
        count: { type: 'number', description: 'Replacement build count (1..99)' },
      },
      required: ['hex', 'entryId', 'unitType', 'count'],
    },
    promptLine: 'update_build_entry(hex, entryId, unitType, count) - Edit one production queue row in place.',
  },
  {
    name: 'remove_build_entry',
    description: 'Remove one production queue entry from a controlled hex.',
    parameters: {
      type: 'object',
      properties: {
        hex: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2, description: 'Controlled hex [lat, lng]' },
        entryId: { type: 'number', description: 'Queue entry id to remove' },
      },
      required: ['hex', 'entryId'],
    },
    promptLine: 'remove_build_entry(hex, entryId) - Remove one production queue row by id.',
  },
];

/**
 * Returns tool metadata filtered by enabled tool names. If enabledToolNames is omitted, returns all tools.
 * Used so both buildToolDefinitions and the system prompt "AVAILABLE TOOLS" section use the same filtered list.
 */
function getFilteredToolMetadata(enabledToolNames?: string[]): ToolMeta[] {
  if (enabledToolNames === undefined) return [...ALL_TOOL_METADATA];
  const set = new Set(enabledToolNames);
  return ALL_TOOL_METADATA.filter((m) => set.has(m.name));
}

/**
 * Returns OpenRouter tool definitions for the given enabled tool names.
 * When enabledToolNames is omitted, returns all tools (current behavior).
 */
function buildToolDefinitions(enabledToolNames?: string[]): ToolDef[] {
  return getFilteredToolMetadata(enabledToolNames).map((m) => ({
    type: 'function' as const,
    function: { name: m.name, description: m.description, parameters: m.parameters },
  }));
}

/** Message type for the chat API (system, user, assistant, or tool). */
type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> }
  | { role: 'tool'; tool_call_id: string; content: string };

function sanitizeToolResultForModel(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sanitizeToolResultForModel(item));
  if (value && typeof value === 'object') {
    const inObj = value as Record<string, unknown>;
    const outObj: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(inObj)) {
      const normalizedKey = key.toLowerCase();
      if (
        normalizedKey.includes('h3') ||
        normalizedKey.includes('hex_index') ||
        normalizedKey.includes('toh3') ||
        normalizedKey.includes('fromh3')
      ) {
        continue;
      }
      outObj[key] = sanitizeToolResultForModel(entry);
    }
    return outObj;
  }
  return value;
}

const MAX_TOOL_ITERATIONS = 50;
const OPENROUTER_REQUEST_TIMEOUT_MS = 45_000;
const OPENROUTER_REQUEST_RETRY_COUNT = 1;

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function getRetryDelayMs(): number {
  return 300 + Math.floor(Math.random() * 700);
}

function delayMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postOpenRouterChatWithTimeoutAndRetry(payload: {
  key: string;
  body: Record<string, unknown>;
  signal?: AbortSignal;
  onLog?: (line: string, isError?: boolean) => void;
  requestLabel: string;
}): Promise<{ ok: true; response: Response } | { ok: false; error: string }> {
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
      const res = await fetch(OPENROUTER_CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${payload.key}`,
        },
        body: JSON.stringify(payload.body),
        signal: controller.signal,
      });
      if (res.ok) return { ok: true, response: res };
      const text = await res.text();
      lastError = res.status === 401 ? 'Invalid API key' : `API error: ${res.status}`;
      logError(`openRouter ${payload.requestLabel}: API error`, res.status, text.slice(0, 200));
      if (res.status === 401) return { ok: false, error: lastError };
      if (attempt < OPENROUTER_REQUEST_RETRY_COUNT && isRetryableStatus(res.status)) {
        const waitMs = getRetryDelayMs();
        logDebug(`openRouter ${payload.requestLabel}: retrying after API error`, {
          attempt: attempt + 1,
          status: res.status,
          retryInMs: waitMs,
        });
        await delayMs(waitMs);
        continue;
      }
      return { ok: false, error: lastError };
    } catch (err) {
      if (parentSignal?.aborted) return { ok: false, error: 'Cancelled' };
      const timeoutLike = controller.signal.aborted;
      if (timeoutLike) {
        lastError = 'AI request timed out. Please try again.';
        if (payload.onLog) payload.onLog(lastError, true);
        logError(`openRouter ${payload.requestLabel}: timeout`, {
          timeoutMs: OPENROUTER_REQUEST_TIMEOUT_MS,
          attempt: attempt + 1,
        });
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

export interface RequestOrdersOptions {
  /** When provided, only these tool names are included in the request and prompt. When omitted, all tools are used. */
  enabledToolNames?: string[];
  /** Optional AbortSignal to cancel the request (e.g. when the user toggles Run off). Passed to fetch(); when aborted, returns { success: false, error: 'Cancelled' }. */
  signal?: AbortSignal;
  /** Optional sink for status log lines (e.g. to show in the renderer AI panel). Called for key events only. */
  onLog?: (line: string, isError?: boolean) => void;
  /** When true, run pre-computation (assess_unit, assess_hex, estimate_combat) and inject Commander's Briefing into the prompt (0.6 path). Default false. */
  usePrecomputation?: boolean;
}

/**
 * Requests movement orders from the LLM for the opponent. Uses the tool-calling loop:
 * send prompt and tool definitions; if the model returns tool_calls, execute tools locally,
 * append results, and resend until the model returns final order JSON or the iteration limit (50) is reached.
 * When options.enabledToolNames is provided, only those tools are sent and executed; disabled tool calls are skipped and not counted.
 * Validates and drops invalid orders. Never logs the API key.
 */
export async function requestOrders(
  state: GameStateSnapshot,
  modelId: string,
  options?: RequestOrdersOptions
): Promise<RequestOrdersResult | RequestOrdersError> {
  return requestOrdersFlow(
    {
      loadKey,
      getToolFlags,
      toolGroupRegistry: TOOL_GROUP_REGISTRY,
      buildSystemPromptForTools,
      buildToolDefinitions,
      postOpenRouterChatWithTimeoutAndRetry,
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
