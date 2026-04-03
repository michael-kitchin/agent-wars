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
import { executeTool1, TOOL1_NAMES, type LatLng } from './tools/tool1Pathfinding';
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
import type { CallbackSubscription } from './callbackSubscriptions';
import { passabilityAllowsLandUnit, passabilityAllowsNavalUnit } from '../shared/pipelineTerrain';
import { normalizeProductionOrders } from './productionOrders';
import { MAX_UNITS_PER_TYPE, getMaxedUnitTypesForPlayer, getPlayerUnitCountsByType } from './productionCaps';
import {
  NAVAL_DESTINATION_MUST_BE_WATER_COASTAL,
  NAVAL_MOVEMENT_PROMPT_RULE,
  NAVAL_PLAN_ROUTE_LAND_TARGET_HINT,
  NAVAL_PLAN_ROUTE_PROMPT_SUFFIX,
} from './navalMovementMessages';

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_KEY_DB_CONFIG_KEY = 'openrouter_api_key';
const OPENROUTER_SELECTED_MODEL_DB_CONFIG_KEY = 'openrouter_selected_model';

const MOVEMENT_RANGE: Record<string, number> = {
  infantry: 1,
  armor: 2,
  naval: 2,
};

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
    const range = MOVEMENT_RANGE[unit.unitType] ?? 1;
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
  const range = MOVEMENT_RANGE[unit.unitType] ?? 1;
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

/** Preamble for [lat, lng] coordinates: use only positions from the lists; distances in hexes are given where needed. */
const LATLNG_PREAMBLE = `Map context: global Earth map (H3 resolution ${H3_RESOLUTION}), not a local/contrived arena.
Positions use [lat, lng] coordinates (latitude, longitude). Values in this prompt are rounded to ${LATLNG_DECIMAL_PLACES} decimal places for this map resolution; preserve that precision when you copy coordinates. Use only coordinates from the unit and target lists below; do not invent coordinates. Hex distances are given in the prompt where relevant.

Final JSON uses an "orders" array (see submit instruction below). Geographic targets use [lat, lng] only. Follow/pursue standing orders use enemy unit id strings only (targetUnitId). Never use raw H3 cell IDs or hex index strings.`;

/** Formats [lat, lng] for the prompt using LATLNG_DECIMAL_PLACES to save tokens and match resolveToH3. */
function formatLatLng(ll: [number, number]): string {
  return `[${ll[0].toFixed(LATLNG_DECIMAL_PLACES)}, ${ll[1].toFixed(LATLNG_DECIMAL_PLACES)}]`;
}

/** Optional suffix when Memory is enabled: persistent strategy belongs in memoryUpdates in final JSON. */
const MOVEMENT_INSTRUCTION_MEMORY_SUFFIX =
  ' Include a memoryUpdates entry (e.g. write key "strategy" tier "persistent") in your final JSON to record your plan.';

const PRODUCTION_REQUIREMENT_BASE = 'when at least one controlled hex has availableUnitTypes and an empty queue';
const PRODUCTION_REQUIREMENT_PRIORITY =
  'Choose the unit types you expect to need, and prioritize what you will need first by putting those entries first in queue order.';
const PRODUCTION_REQUIREMENT_PRIORITY_INITIAL =
  'Build the unit types you think you need, and prioritize what you think you will need first.';

/**
 * Builds the "HOW TO USE TOOLS" guidance block, conditional on which tool groups are enabled.
 * When hasPrecomputedBriefing is true, tells the model to use the Commander's Briefing and avoid redundant
 * assess_unit / assess_hex / estimate_combat calls so tool usage stays low.
 */
function buildToolUsageGuidance(flags: ToolFlags, hasPrecomputedBriefing = false): string {
  const lines: string[] = [];
  if (hasPrecomputedBriefing) {
    lines.push(
      '- The COMMANDER\'S BRIEFING above already contains unit assessments, hex intelligence, and combat estimates for this turn. Do NOT call assess_unit, assess_hex, or estimate_combat — that information is already in the briefing tables. Use the briefing to decide targets and priorities.'
    );
    if (flags.planningEnabled) {
      lines.push(
        '- Use plan_route only when you need the exact orderToXY for a unit\'s move. Call it sparingly (e.g. one per unit that needs to move); the briefing already tells you nearest enemies and distances. After you have orderToXY for each unit that needs orders, submit — do not re-assess or re-route.'
      );
    }
    if (flags.ordersEnabled) {
      lines.push(
        '- Standing orders: for every unit listed as "Units without standing orders" in the briefing, add an orders[] entry with action assign_order (march/pursue for closing; defend to hold). Then use plan_route and explicit_move in orders[] only where you need a one-step move this turn.'
      );
    }
    if (flags.memoryEnabled) {
      lines.push(
        '- Put concise plan intent in the final JSON memoryUpdates (write) instead of ad-hoc memory_write tool calls.'
      );
    }
  } else {
    if (flags.ordersEnabled || flags.memoryEnabled) {
      lines.push('- Start by reviewing your standing order statuses and persistent strategic memory (both are shown above).');
    }
    if (flags.assessmentEnabled) {
      lines.push('- Use assess_unit on units near the enemy to understand the tactical picture. Skip assessment for rear-echelon units far from all enemies — their situation rarely changes turn to turn. If multiple units share the same hex, assess only one — the results will be identical.');
    }
    if (flags.estimationEnabled) {
      lines.push('- Use estimate_combat before any attack. Do not guess at combat odds.');
    }
    if (flags.planningEnabled) {
      lines.push('- Use plan_route to understand multi-turn moves before issuing orders.');
    }
  }
  if (flags.memoryEnabled) {
    lines.push(
      '- memoryUpdates / tiers: "persistent" entries appear in every briefing (limit 5); "stored" are retrieved via memory_read (limit 15).'
    );
  }
  if (flags.ordersEnabled) {
    lines.push('- Units with standing orders do not need explicit orders from you unless you want to override their current mission this turn.');
    if (flags.planningEnabled && !hasPrecomputedBriefing) {
      lines.push('- For units several turns from combat, use assign_order (march/pursue) in final JSON instead of re-planning every turn.');
    }
  }
  if (flags.memoryEnabled) {
    lines.push(
      '- BEFORE finishing: include memoryUpdates write key "strategy" tier "persistent" with specific unit-to-target ETAs and priorities.' +
      ' Do NOT store enemy positions or rosters (already in the briefing). Do not claim "no observed human units" when the briefing lists observed human units. Keep it concise.'
    );
  }
  if (flags.productionEnabled) {
    lines.push(
      '- Production: use query_production to inspect controlled-hex queues and constraints; use add_build_entry/update_build_entry/remove_build_entry for iterative queue edits. If skipping tools, you may include productionOrders in final JSON.'
    );
    lines.push(
      `- Production requirement: ${PRODUCTION_REQUIREMENT_BASE}, queue at least one build this turn (via tools or productionOrders). ${PRODUCTION_REQUIREMENT_PRIORITY}`
    );
  }
  if (lines.length === 0) return '';
  return '\n\nHOW TO USE THESE TOOLS EFFECTIVELY:\n' + lines.join('\n');
}

/**
 * Builds the "Adjacent cells (fallback)" block when Planning and Orders are both disabled.
 * Lists per-unit valid one-step destinations so the model can issue cell-to-cell moves without tools.
 */
function buildAdjacentCellsFallbackBlock(
  state: GameStateSnapshot,
  opponentUnits: { id: string; h3Index: string; unitType: string }[],
  coordMap: { latLngByH3: Map<string, [number, number]>; format: (h3: string) => string }
): string {
  const { latLngByH3, format } = coordMap;
  const lines: string[] = [];
  for (const u of opponentUnits.filter((unit) => latLngByH3.has(unit.h3Index))) {
    const current = format(u.h3Index);
    const dests = getValidDestinationsUnoccupied(u, state)
      .filter((h3) => latLngByH3.has(h3))
      .map((h3) => format(h3));
    const cells = dests.length ? `${current} (hold), or move to: ${dests.join(', ')}` : `${current} (hold only; no empty adjacent cells)`;
    lines.push(`${u.id}: ${cells}`);
  }
  if (lines.length === 0) return '';
  return `\nAdjacent cells (fallback for one-step moves when no planning/orders tools are available; prefer plan_route or standing orders when enabled):\n${lines.join('\n')}\n`;
}

/**
 * Returns the movement-order instruction fragment for the system prompt.
 * Branch order: Planning → Orders (no planning) → Fallback (no planning, no orders) → None.
 */
function getMovementOrderInstruction(flags: ToolFlags): string {
  const memorySuffix = flags.memoryEnabled ? MOVEMENT_INSTRUCTION_MEMORY_SUFFIX : '';
  if (flags.planningEnabled) {
    return ' For each explicit_move entry: set "destination" to the exact orderToXY from that unit\'s plan_route result [lat,lng] (copy the two numbers exactly).';
  }
  if (flags.ordersEnabled) {
    return (
      ' You have no movement planning tools: you cannot compute valid one-step explicit_move destinations yourself. Use assign_order in orders[] for standing missions; leave explicit_move / explicit_attack out unless you can copy valid [lat,lng] from the briefing only.' +
      memorySuffix
    );
  }
  if (flags.fallbackMovementEnabled) {
    const memoryHint = flags.memoryEnabled ? ' After your analysis, add memoryUpdates in final JSON if needed. ' : '';
    return (
      memoryHint +
      'Without planning/standing-order tools, use explicit_move with "destination" [lat,lng] only from the "Adjacent cells (fallback)" list (current cell = hold, or an adjacent listed cell).' +
      memorySuffix
    );
  }
  return (
    ' You have no movement planning tools: submit orders[] without explicit_move unless coordinates are trivially valid from the briefing.' +
    memorySuffix
  );
}

function buildProductionSubmitClause(flags: ToolFlags): string {
  if (!flags.productionEnabled) return '';
  return (
    ' "productionOrders" entries MUST include "action" on every item. Required forms:' +
    ' {"action":"add_build_entry","hex":[lat,lng],"unitType":"infantry|armor|naval","count":1..99};' +
    ' {"action":"update_build_entry","hex":[lat,lng],"entryId":number,"unitType":"infantry|armor|naval","count":1..99};' +
    ' {"action":"remove_build_entry","hex":[lat,lng],"entryId":number}.' +
    ' Any productionOrders item missing "action" or required fields is dropped.' +
    ` ${PRODUCTION_REQUIREMENT_BASE}, include at least one add_build_entry this turn.` +
    ' Select the unit types you think you will need, and prioritize what you will need first in queue order.'
  );
}

function buildHumanUnitsPromptLine(humanRoster: string): string {
  if (humanRoster.length > 0) return `Human units (currently observed): ${humanRoster}`;
  return 'Human units (currently observed): none. Enemy units may be out of view; scout to reacquire contact.';
}

function buildProductionBriefingBlock(
  flags: ToolFlags,
  state: GameStateSnapshot,
  latLngByH3: Map<string, [number, number]>,
  resolveToH3: (lat: number, lng: number) => string | undefined
): string {
  if (!flags.productionEnabled) return '';
  const snapshot = executeTool6('query_production', { all: true }, state, latLngByH3, resolveToH3) as {
    status?: string;
    production?: { controlledHexQueues?: Array<Record<string, unknown>> };
    error?: string;
  };
  if (snapshot.status !== 'ok') {
    return `=== PRODUCTION STATUS ===\nProduction status unavailable: ${snapshot.error ?? 'unknown error'}\n`;
  }
  const queues = snapshot.production?.controlledHexQueues ?? [];
  const opponentCounts = getPlayerUnitCountsByType(state.units, 'opponent');
  const maxedTypes = getMaxedUnitTypesForPlayer(state.units, 'opponent');
  const lines: string[] = [];
  lines.push('=== PRODUCTION STATUS ===');
  lines.push('Rules: infantry cost 10 (min urban 1), armor cost 20 (min urban 2), naval cost 50 (min seaports 1).');
  lines.push(
    `Deployment caps (per side): infantry ${MAX_UNITS_PER_TYPE.infantry}, armor ${MAX_UNITS_PER_TYPE.armor}, naval ${MAX_UNITS_PER_TYPE.naval}.`
  );
  lines.push(
    `Your current unit counts: infantry ${opponentCounts.infantry}/${MAX_UNITS_PER_TYPE.infantry}, armor ${opponentCounts.armor}/${MAX_UNITS_PER_TYPE.armor}, naval ${opponentCounts.naval}/${MAX_UNITS_PER_TYPE.naval}.`
  );
  if (maxedTypes.length > 0) {
    lines.push(`You are currently at maximum for: ${maxedTypes.join(', ')}.`);
  }
  lines.push('Production progress/spawn resolves after Ready, after combat and control resolution.');
  if (queues.length === 0) {
    lines.push('No currently controlled hexes with editable production queues.');
    return lines.join('\n');
  }
  lines.push('Controlled hex queues:');
  for (const row of queues) {
    const hex = Array.isArray(row.hex) ? row.hex as [number, number] : null;
    const urban = Number(row.urbanHexCount ?? 0);
    const seaports = Number(row.seaportCount ?? 0);
    const available = Array.isArray(row.availableUnitTypes)
      ? (row.availableUnitTypes as unknown[]).map((x) => String(x)).join(', ')
      : '';
    const entries = Array.isArray(row.entries)
      ? (row.entries as Array<Record<string, unknown>>)
          .map((entry) => `${entry.entryId}:${entry.unitType}x${entry.count}`)
          .join(', ')
      : '';
    lines.push(
      `- ${hex ? formatLatLng(hex) : '[unknown]'} urban=${urban} seaports=${seaports} available=[${available || 'none'}] queue=${entries || '(empty)'}`
    );
  }
  return lines.join('\n');
}

/**
 * Returns the initial user message for the tool-calling flow.
 * When hasPrecomputedBriefing is true, encourages using the briefing and minimal tool calls.
 */
function getInitialUserMessage(flags: ToolFlags, hasPrecomputedBriefing = false): string {
  const productionSuffix = flags.productionEnabled
    ? ', optional "productionOrders" (EVERY item must include action + required fields)'
    : '';
  const jsonOptionalTail = flags.memoryEnabled
    ? `, optional "callbacks", optional "memoryUpdates"${productionSuffix}`
    : `, optional "callbacks"${productionSuffix}`;
  if (flags.planningEnabled) {
    const memoryNote = flags.memoryEnabled
      ? ' After your analysis, include memoryUpdates in your final JSON for strategy notes. '
      : '';
    const productionNote = flags.productionEnabled
      ? ` Also ensure production is actively queued when viable: ${PRODUCTION_REQUIREMENT_BASE}, include at least one production action. ${PRODUCTION_REQUIREMENT_PRIORITY_INITIAL} `
      : '';
    if (hasPrecomputedBriefing) {
      const ordersNudge = flags.ordersEnabled
        ? ' For units without standing orders in the briefing, include assign_order entries in orders[]. Then use plan_route and explicit_move only where needed this turn. '
        : '';
      return `Use the COMMANDER'S BRIEFING above for unit status and combat info.${ordersNudge}Call plan_route for each unit that needs a move (orderToXY).${memoryNote}${productionNote} Then submit final JSON with "strategy", "orders" (assign_order / explicit_move / explicit_attack / cancel_order as needed)${jsonOptionalTail}.`;
    }
    return `Use the tools as needed to plan movement.${memoryNote}${productionNote} Then submit final JSON with "strategy", "orders"${jsonOptionalTail}.`;
  }

  const submitEmpty = ` Then submit final JSON with "strategy": "<one-line>", "orders": [].`;
  if (flags.ordersEnabled && flags.memoryEnabled) {
    return `You have no movement planning tools: use assign_order in orders[] and memoryUpdates for notes.${submitEmpty}`;
  }
  if (flags.ordersEnabled) {
    return `You have no movement planning tools: use assign_order in orders[] for future turns.${submitEmpty}`;
  }
  if (flags.fallbackMovementEnabled) {
    const memoryNudge = flags.memoryEnabled ? ' Include memoryUpdates if needed. ' : '';
    return `${memoryNudge}Use explicit_move from the Adjacent cells list only. Submit JSON with "strategy", "orders"${jsonOptionalTail}.`;
  }
  if (flags.memoryEnabled) {
    return `You have no movement planning tools. Use memoryUpdates in final JSON.${submitEmpty}`;
  }

  return `You have no movement planning tools. Submit JSON with "strategy", "orders": [].`;
}

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

  const unitTypes: Array<'infantry' | 'armor' | 'naval'> = ['infantry', 'armor', 'naval'];
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
  const productionBlock = flags.productionEnabled ? buildProductionBriefingBlock(flags, state, latLngByH3, resolveToH3) + '\n\n' : '';

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
    ? buildAdjacentCellsFallbackBlock(state, opponentUnits, coordMap)
    : '';
  const movementOrderInstruction = getMovementOrderInstruction(flags);
  const submitMemoryClause = flags.memoryEnabled
    ? ' Use optional "memoryUpdates" for memory writes/deletes (applied from JSON only; there are no memory_write or memory_delete tools).'
    : ' When Memory tools are not listed above, omit "memoryUpdates" or use []; any entries are ignored.';

  const humanUnitsLine = buildHumanUnitsPromptLine(humanRoster);
  const mainBlock = briefingOverride != null && briefingOverride.length > 0
    ? `${briefingOverride}\n\n${toolsSection}\n\nYour units (ID, type, position [lat, lng]): ${opponentRoster || 'none'}\n${humanUnitsLine}`
    : `${memoryBlock}${standingOrderBlock}${productionBlock}${toolsSection}\n\nYour units (ID, type, position [lat, lng]): ${opponentRoster || 'none'}\n${humanUnitsLine}${adjacentCellsBlock}`;

  const prompt = `You are the opponent in a WEGO (simultaneous movement) hex wargame. Current turn: ${state.turnNumber}, phase: ${state.phase}. Your objective is to destroy all human units. Move toward human units to get in ranged or melee range; do not stay passive.${warning}

${LATLNG_PREAMBLE}

Combat: each unit rolls d6 when attacking (hit if roll <= attack) or when defending (hit if roll <= defender's defense). Unit stats: ${combatSummary}. Ranged attacks use each unit's current position (before movement). Only add explicit_attack if already in range at turn start from that START position (before any explicit_move). At most one explicit_attack per unit per turn (duplicate unitIds dropped). targetHex must be enemy [lat,lng] from "Human units" or the enemy unit id string — never your own movement destination${combatTargetHint}. Self-filter illegal explicit_attack entries before submitting.${navalCoaching}${combatAssessHint}

${mainBlock}

Submit your final JSON only (valid JSON, no comments): { "strategy": "<one-line>", "orders": [ ... ], "callbacks": [...]${flags.memoryEnabled ? ', "memoryUpdates": [...]' : ''}${flags.productionEnabled ? ', "productionOrders": [...]' : ''} }. Strict schema: top-level must be a JSON object with "strategy" (string) and "orders" (array); do not return a top-level array. The "orders" array is processed in list order. Each entry includes "action" and usually "unitId". Actions: assign_order (include "order": { "type": "defend"|"march"|"pursue"|"patrol"|"hold_fire", ... } — pursue uses targetUnitId string for the enemy only; march/patrol/defend use [lat,lng] where a place is required), cancel_order, explicit_move (include "destination": [lat,lng] for this turn's move), explicit_attack (include "targetHex": [lat,lng] OR enemy unit id string). Do not use top-level movementOrders or rangedAttacks (legacy).${movementOrderInstruction} Include optional "callbacks" for re-consultation planning.${submitMemoryClause} ${buildProductionSubmitClause(flags)}`;
  return prompt;
}

export interface RequestOrdersResult {
  success: true;
  orders: { unitId: string; toH3Index: string }[];
  rangedAttacks?: { unitId: string; targetH3Index: string }[];
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
        unitType: { type: 'string', enum: ['infantry', 'armor', 'naval'], description: 'Unit type for movement budget' },
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
        forUnitType: { type: 'string', enum: ['infantry', 'armor', 'naval'], description: 'Assess from this unit type perspective (for chokepoint)' },
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
        unitType: { type: 'string', enum: ['infantry', 'armor', 'naval'], description: 'Unit type for the new queue entry' },
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
        unitType: { type: 'string', enum: ['infantry', 'armor', 'naval'], description: 'Replacement unit type' },
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

function dedupeByUnitKeepLast<T extends { unitId: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const keptReversed: T[] = [];
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i]!;
    if (seen.has(row.unitId)) continue;
    seen.add(row.unitId);
    keptReversed.push(row);
  }
  keptReversed.reverse();
  return keptReversed;
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
  const requestedToolNames = options?.enabledToolNames;
  const signal = options?.signal;
  const onLog = options?.onLog;
  const usePrecomputation = options?.usePrecomputation === true;
  const precomputationExcluded = new Set<string>([...TOOL2_NAMES, ...TOOL3_NAMES]);
  const enabledToolNames =
    usePrecomputation && requestedToolNames !== undefined
      ? requestedToolNames.filter((n) => !precomputationExcluded.has(n))
      : usePrecomputation && requestedToolNames === undefined
        ? TOOL_GROUP_REGISTRY.flatMap((g) => [...g.toolNames]).filter((n) => !precomputationExcluded.has(n))
        : requestedToolNames;
  if (onLog) onLog('Requesting AI orders…');
  logDebug('openRouter requestOrders', {
    modelId,
    turnNumber: state.turnNumber,
    enabledToolsRequested: requestedToolNames === undefined ? 'all' : requestedToolNames.length,
    enabledToolsEffective: enabledToolNames === undefined ? 'all' : enabledToolNames.length,
    usePrecomputation,
    filteredForPrecomputation: usePrecomputation,
  });
  const key = loadKey();
  if (!key) {
    logError('openRouter requestOrders: no API key');
    if (onLog) onLog('No API key set.', true);
    return { success: false, error: 'No API key set' };
  }
  if (!modelId.trim()) {
    logError('openRouter requestOrders: no model selected');
    if (onLog) onLog('No model selected.', true);
    return { success: false, error: 'No model selected' };
  }

  const opponentUnits = state.units.filter((u) => u.player === 'opponent');
  if (opponentUnits.length === 0) {
    logDebug('openRouter requestOrders: no opponent units remain, skipping LLM call');
    if (onLog) onLog('No opponent units remain.');
    return { success: true, orders: [] };
  }

  const hexList = state.hexes.map((h) => h.h3Index);
  const { latLngByH3, resolveToH3 } = buildLatLngCoordinateMap(hexList);
  const coordMap = {
    latLngByH3,
    resolveToH3,
    format: (h3: string) => {
      const ll = latLngByH3.get(h3);
      if (ll) return formatLatLng(ll);
      const [lat, lng] = cellToLatLng(h3);
      return formatLatLng([lat, lng]);
    },
  };

  const flags = getToolFlags(enabledToolNames);
  const enabledToolNameSet =
    enabledToolNames === undefined
      ? new Set(TOOL_GROUP_REGISTRY.flatMap((g) => [...g.toolNames]))
      : new Set(enabledToolNames);
  if (flags.ordersEnabled && !flags.planningEnabled) {
    logDebug(
      'openRouter requestOrders: Orders enabled but Planning disabled; AI may be unable to produce movement orders. Enable Planning alongside Orders.'
    );
  }

  const toolInvocationCounts: Record<string, number> = {};
  for (const g of TOOL_GROUP_REGISTRY) toolInvocationCounts[g.id] = 0;
  const lossesSinceLastConsultation = getAiLossEventsSinceConsultation('opponent');

  let briefingOverride: string | undefined;
  if (usePrecomputation) {
    const precomputed = runPrecomputation(state, { latLngByH3, resolveToH3 });
    toolInvocationCounts['precomputation'] =
      precomputed.unitAssessments.length +
      precomputed.combatEstimates.length +
      precomputed.hexAssessments.length;
    const standingOrderText = getStandingOrderInjectionText('opponent', state);
    const memoryText = getInjectionText('opponent', state.turnNumber);
    const subscriptions = getSubscriptions('opponent');
    const productionBriefing = getToolFlags(enabledToolNames).productionEnabled
      ? buildProductionBriefingBlock(getToolFlags(enabledToolNames), state, latLngByH3, resolveToH3)
      : '';
    briefingOverride = formatBriefing(
      state,
      precomputed,
      standingOrderText,
      memoryText,
      subscriptions,
      lossesSinceLastConsultation,
      productionBriefing
    );
    logDebug('openRouter requestOrders: pre-computation ran', {
      briefingLength: briefingOverride.length,
      unitAssessments: precomputed.unitAssessments.length,
      combatEstimates: precomputed.combatEstimates.length,
      precomputationCount: toolInvocationCounts['precomputation'],
    });
  }
  const systemPrompt = buildSystemPromptForTools(state, coordMap, enabledToolNames, briefingOverride);
  const userMessage = getInitialUserMessage(flags, briefingOverride != null && briefingOverride.length > 0);

  const tools = buildToolDefinitions(enabledToolNames);

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];

  logDebug('openRouter requestOrders: system prompt prepared', { chars: systemPrompt.length });
  logDebug('openRouter requestOrders: user message prepared', { chars: userMessage.length });
  logDebug('openRouter requestOrders: system prompt (full)', systemPrompt);
  logDebug('openRouter requestOrders: user message (full)', userMessage);
  logDebug('openRouter requestOrders: starting tool loop', { turnNumber: state.turnNumber });

  const wallClockStart = Date.now();
  let requestCost = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const markSuccessfulConsultation = (): void => {
    setAiLastConsultationTurn(state.turnNumber);
    clearAiLossEventsSinceConsultation('opponent');
  };
  try {
    let iteration = 0;
    let parseRepairAttempted = false;
    while (iteration < MAX_TOOL_ITERATIONS) {
      iteration++;
      const body: Record<string, unknown> = {
        model: modelId,
        messages,
        max_tokens: 2048,
        tools,
        tool_choice: 'auto',
      };

      const chatResponse = await postOpenRouterChatWithTimeoutAndRetry({
        key,
        body,
        signal,
        onLog,
        requestLabel: 'requestOrders',
      });
      if (!chatResponse.ok) {
        if (onLog && chatResponse.error !== 'Cancelled') onLog(chatResponse.error, true);
        return { success: false, error: chatResponse.error };
      }
      const res = chatResponse.response;

      const json = (await res.json()) as {
        choices?: Array<{
          message?: {
            content?: string | null;
            tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
          };
        }>;
        usage?: { cost?: number; prompt_tokens?: number; completion_tokens?: number };
      };
      requestCost += json.usage?.cost ?? 0;
      totalInputTokens += json.usage?.prompt_tokens ?? 0;
      totalOutputTokens += json.usage?.completion_tokens ?? 0;
      const assistantMessage = json.choices?.[0]?.message;
      if (!assistantMessage) {
        logError('openRouter requestOrders: no message in response');
        if (onLog) onLog('Invalid response: no message', true);
        return { success: false, error: 'Invalid response: no message' };
      }

      const toolCalls = assistantMessage.tool_calls;
      if (toolCalls && toolCalls.length > 0) {
        const assistantContent = assistantMessage.content ?? null;
        logDebug('openRouter requestOrders: assistant response (tool round)', {
          chars: typeof assistantContent === 'string' ? assistantContent.length : 0,
        });
        logTrace(
          'openRouter requestOrders: assistant response (tool round, full)',
          typeof assistantContent === 'string' ? assistantContent : '(none)'
        );
        logDebug('openRouter requestOrders: tool_calls', {
          turnNumber: state.turnNumber,
          playerId: 'opponent',
          iteration,
          count: toolCalls.length,
          names: toolCalls.map((tc) => tc.function?.name),
        });
        messages.push({
          role: 'assistant',
          content: assistantMessage.content ?? null,
          tool_calls: toolCalls.map((tc) => ({ id: tc.id, type: 'function' as const, function: { name: tc.function.name, arguments: tc.function.arguments } })),
        });

        for (const tc of toolCalls) {
          const toolName = tc.function.name;
          if (!enabledToolNameSet.has(toolName)) {
            logDebug('openRouter requestOrders: tool call skipped (disabled)', { tool: toolName });
            messages.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: JSON.stringify({ status: 'error', error: `Tool ${toolName} is disabled.` }),
            });
            continue;
          }
          let args: unknown;
          try {
            args = JSON.parse(tc.function.arguments || '{}');
          } catch (err) {
            logError('openRouter requestOrders: tool arguments parse error', toolName, err);
            args = {};
          }
          const result = (TOOL5_NAMES as readonly string[]).includes(toolName)
            ? executeTool5(toolName, args, state, latLngByH3, resolveToH3)
            : (TOOL6_NAMES as readonly string[]).includes(toolName)
              ? executeTool6(toolName, args, state, latLngByH3, resolveToH3)
            : (TOOL4_NAMES as readonly string[]).includes(toolName)
              ? executeTool4(toolName, args, state, latLngByH3, resolveToH3)
              : (TOOL3_NAMES as readonly string[]).includes(toolName)
                ? executeTool3(toolName, args, state, latLngByH3, resolveToH3)
                : (TOOL2_NAMES as readonly string[]).includes(toolName)
                  ? executeTool2(toolName, args, state, latLngByH3, resolveToH3)
                  : executeTool1(toolName, args, state, latLngByH3, resolveToH3);
          const resultStr = JSON.stringify(sanitizeToolResultForModel(result));
          logDebug('openRouter requestOrders: tool result (full payload sent to LLM)', {
            turnNumber: state.turnNumber,
            playerId: 'opponent',
            tool: toolName,
            payload: resultStr,
          });
          messages.push({ role: 'tool', tool_call_id: tc.id, content: resultStr });
          const groupId = getGroupIdForToolName(toolName);
          if (groupId !== undefined) toolInvocationCounts[groupId] = (toolInvocationCounts[groupId] ?? 0) + 1;
        }
        continue;
      }

      const content = assistantMessage.content;
      if (typeof content !== 'string' || !content.trim()) {
        logError('openRouter requestOrders: no content in final response');
        if (onLog) onLog('Invalid response: no content', true);
        return { success: false, error: 'Invalid response: no content' };
      }

      logDebug('openRouter requestOrders: assistant response (final)', { chars: content.length });
      logTrace('openRouter requestOrders: assistant response (final, full)', content);
      let parsed = parseOrdersResponse(content, resolveToH3, state, latLngByH3, flags.productionEnabled);
      if (!parsed) {
        if (!parseRepairAttempted) {
          parseRepairAttempted = true;
          if (onLog) onLog('Model response was not valid JSON; requesting strict JSON repair…', true);
          const repairMessages: ChatMessage[] = [
            ...messages,
            { role: 'assistant', content },
            {
              role: 'user',
              content:
                `Your previous response was not parseable JSON. Reply now with JSON only (no prose, no markdown, no code fences) using exactly this top-level object schema (orders[] only; no movementOrders/rangedAttacks; never a top-level array): ${buildJsonAssistantRepairSchema(flags.productionEnabled)}. Omit optional arrays when empty.`,
            },
          ];
          const repairBody: Record<string, unknown> = {
            model: modelId,
            messages: repairMessages,
            max_tokens: 1024,
            tool_choice: 'none',
          };
          const repairResponse = await postOpenRouterChatWithTimeoutAndRetry({
            key,
            body: repairBody,
            signal,
            onLog,
            requestLabel: 'requestOrders repair',
          });
          if (repairResponse.ok) {
            const repairRes = repairResponse.response;
            const repairJson = (await repairRes.json()) as {
              choices?: Array<{ message?: { content?: string | null } }>;
              usage?: { cost?: number; prompt_tokens?: number; completion_tokens?: number };
            };
            requestCost += repairJson.usage?.cost ?? 0;
            totalInputTokens += repairJson.usage?.prompt_tokens ?? 0;
            totalOutputTokens += repairJson.usage?.completion_tokens ?? 0;
            const repairContent = repairJson.choices?.[0]?.message?.content;
            if (typeof repairContent === 'string' && repairContent.trim()) {
              logDebug('openRouter requestOrders: assistant response (repair)', repairContent);
              parsed = parseOrdersResponse(repairContent, resolveToH3, state, latLngByH3, flags.productionEnabled);
            }
          } else {
            logError('openRouter requestOrders: repair API error', repairResponse.error);
          }
        }
      }
      if (!parsed) {
        logError('openRouter requestOrders: failed to parse JSON', content.slice(0, 300));
        if (onLog) {
          onLog('Could not parse orders from model.', true);
          const maxLogLen = 4000;
          const rawPreview = content.length > maxLogLen ? content.slice(0, maxLogLen) + '… (truncated)' : content;
          onLog(rawPreview, true);
        }
        return { success: false, error: 'Invalid response: could not parse orders' };
      }

      if (parsed.callbacks?.length) {
        replaceSubscriptions('opponent', parsed.callbacks, state.turnNumber);
        logDebug('openRouter requestOrders: applied callbacks from response', { count: parsed.callbacks.length });
      }
      // UI "Events" counter: count callback entries returned by the LLM this turn.
      toolInvocationCounts['events'] = parsed.callbacks?.length ?? 0;
      if (flags.memoryEnabled && parsed.memoryUpdates?.length) {
        for (const upd of parsed.memoryUpdates) {
          if (upd.action === 'write') {
            const result = executeTool4(
              'memory_write',
              { key: upd.key, content: upd.content ?? '', tier: upd.tier },
              state,
              latLngByH3,
              resolveToH3
            );
            if (result.status === 'error') {
              logDebug('openRouter requestOrders: memoryUpdates write failed', upd.key, (result as { error?: string }).error);
            }
          } else {
            const result = executeTool4('memory_delete', { key: upd.key }, state, latLngByH3, resolveToH3);
            if (result.status === 'error') {
              logDebug('openRouter requestOrders: memoryUpdates delete failed', upd.key, (result as { error?: string }).error);
            }
          }
        }
        logDebug('openRouter requestOrders: applied memoryUpdates from response', { count: parsed.memoryUpdates.length });
      }

      const { movementOrders: standingOrderMovement, rangedAttacks: standingOrderRanged } = flags.ordersEnabled
        ? generateOrdersForStandingOrders('opponent', state, latLngByH3, resolveToH3)
        : { movementOrders: [] as { unitId: string; toH3Index: string }[], rangedAttacks: [] as { unitId: string; targetH3Index: string }[] };

      const llmMovementOrders = dedupeByUnitKeepLast(parsed.movementOrders ?? []);
      const llmRangedOrders = dedupeByUnitKeepLast(parsed.rangedAttacks ?? []);
      if (llmMovementOrders.length !== (parsed.movementOrders ?? []).length) {
        logDebug('openRouter requestOrders: deduped duplicate movement intents from model', {
          before: (parsed.movementOrders ?? []).length,
          after: llmMovementOrders.length,
        });
      }
      if (llmRangedOrders.length !== (parsed.rangedAttacks ?? []).length) {
        logDebug('openRouter requestOrders: deduped duplicate ranged intents from model', {
          before: (parsed.rangedAttacks ?? []).length,
          after: llmRangedOrders.length,
        });
      }
      const llmMovementByUnit = new Map(llmMovementOrders.map((o) => [o.unitId, o.toH3Index]));
      const llmMovementUnitIds = new Set(llmMovementOrders.map((o) => o.unitId));
      const mergedMovement = [
        ...standingOrderMovement.filter((o) => !llmMovementUnitIds.has(o.unitId)),
        ...llmMovementOrders,
      ];
      const llmRangedUnitIds = new Set(llmRangedOrders.map((r) => r.unitId));
      const mergedRanged = [
        ...standingOrderRanged.filter((o) => !llmRangedUnitIds.has(o.unitId)),
        ...llmRangedOrders,
      ];

      const validated: { unitId: string; toH3Index: string }[] = [];
      const dropReasons: string[] = [];
      const invalidStandingMovementUnits = new Set<string>();
      const seenUnits = new Set<string>();
      if (parsed.productionDropReasons?.length) {
        dropReasons.push(...parsed.productionDropReasons);
      }

      for (const order of mergedMovement) {
        if (seenUnits.has(order.unitId)) {
          dropReasons.push(`Duplicate order for ${order.unitId}`);
          continue;
        }
        const result = validateAiOrder(order, state);
        if (result.valid) {
          validated.push(order);
          seenUnits.add(order.unitId);
        } else {
          const dropUnit = state.units.find((u) => u.id === order.unitId);
          const sourceIsLlmOverride = llmMovementUnitIds.has(order.unitId);
          const hasStandingForUnit = standingOrderMovement.some((o) => o.unitId === order.unitId);
          if (!sourceIsLlmOverride && hasStandingForUnit && result.reason === 'Invalid distance') {
            invalidStandingMovementUnits.add(order.unitId);
            logDebug('openRouter requestOrders: auto-removing invalid standing movement order', {
              unitId: order.unitId,
              toH3Index: order.toH3Index,
            });
            continue;
          }
          dropReasons.push(`${order.unitId} -> ${order.toH3Index}: ${result.reason}`);
        }
      }
      if (flags.ordersEnabled && invalidStandingMovementUnits.size > 0) {
        for (const unitId of invalidStandingMovementUnits) {
          const cancelResult = executeTool5('cancel_order', { unitId }, state, latLngByH3, resolveToH3) as {
            status?: string;
            error?: string;
          };
          if (cancelResult.status !== 'ok') {
            logError('openRouter requestOrders: failed to auto-remove invalid standing movement order', {
              unitId,
              error: cancelResult.error ?? 'unknown',
            });
          }
        }
      }

      const validatedRanged: { unitId: string; targetH3Index: string }[] = [];
      const seenRanged = new Set<string>();
      for (const r of mergedRanged) {
        if (seenRanged.has(r.unitId)) {
          dropReasons.push(`Duplicate ranged for ${r.unitId}`);
          continue;
        }
        const result = validateAiRangedOrder(r, state);
        if (result.valid) {
          validatedRanged.push(r);
          seenRanged.add(r.unitId);
        } else {
          // Common model mistake: trying to explicit_move into range and also explicit_attack that destination.
          // Ranged uses start-of-turn position, so this is invalid by design; ignore without counting as dropped noise.
          if (result.reason === 'Target out of range') {
            const movedTo = llmMovementByUnit.get(r.unitId);
            if (movedTo && movedTo === r.targetH3Index) {
              logDebug('openRouter requestOrders: ignored post-move ranged intent', { unitId: r.unitId });
              continue;
            }
          }
          dropReasons.push(`Ranged ${r.unitId} -> ${r.targetH3Index}: ${result.reason}`);
        }
      }

      const validatedUnitIds = new Set(validated.map((o) => o.unitId));
      const fallbackUnits: string[] = [];
      for (const o of standingOrderMovement) {
        if (!llmMovementUnitIds.has(o.unitId)) continue;
        if (!validatedUnitIds.has(o.unitId)) {
          const vr = validateAiOrder(o, state);
          if (vr.valid) {
            validated.push(o);
            validatedUnitIds.add(o.unitId);
            if (llmMovementUnitIds.has(o.unitId)) {
              fallbackUnits.push(o.unitId);
            }
          } else {
            const hadPrimaryDropAlready = dropReasons.some((reason) => reason.startsWith(`${o.unitId} ->`));
            if (hadPrimaryDropAlready) {
              continue;
            }
            dropReasons.push(`Standing order ${o.unitId} -> ${o.toH3Index}: ${vr.reason}`);
          }
        }
      }
      const validatedRangedUnitIds = new Set(validatedRanged.map((r) => r.unitId));
      const fallbackRanged: string[] = [];
      for (const r of standingOrderRanged) {
        if (!llmRangedUnitIds.has(r.unitId)) continue;
        if (!validatedRangedUnitIds.has(r.unitId)) {
          const vr = validateAiRangedOrder(r, state);
          if (vr.valid) {
            validatedRanged.push(r);
            validatedRangedUnitIds.add(r.unitId);
            if (llmRangedUnitIds.has(r.unitId)) {
              fallbackRanged.push(r.unitId);
            }
          } else {
            dropReasons.push(`Standing ranged ${r.unitId} -> ${r.targetH3Index}: ${vr.reason}`);
          }
        }
      }
      if (fallbackUnits.length > 0 || fallbackRanged.length > 0) {
        logDebug('openRouter requestOrders: fell back to standing orders for units with dropped LLM orders', {
          movement: fallbackUnits,
          ranged: fallbackRanged,
        });
        if (onLog) onLog(`Standing orders used as fallback for: ${[...fallbackUnits, ...fallbackRanged].join(', ')}`);
      }

      // If a unit was recovered by standing-order fallback, do not count its LLM validation failures as dropped.
      const recoveredMovement = new Set(fallbackUnits);
      const recoveredRanged = new Set(fallbackRanged);
      const effectiveDropReasons = dropReasons.filter((reason) => {
        for (const unitId of recoveredMovement) {
          if (reason.startsWith(`${unitId} ->`) || reason.startsWith(`Duplicate order for ${unitId}`)) {
            return false;
          }
        }
        for (const unitId of recoveredRanged) {
          if (reason.startsWith(`Ranged ${unitId} ->`) || reason.startsWith(`Duplicate ranged for ${unitId}`)) {
            return false;
          }
        }
        return true;
      });

      if (effectiveDropReasons.length > 0) {
        logDebug('openRouter requestOrders: dropped invalid orders', {
          dropped: effectiveDropReasons.length,
          reasons: effectiveDropReasons,
        });
        if (onLog) onLog(`Dropped ${effectiveDropReasons.length} invalid order(s).`, true);
      }

      if (onLog) {
        const orderComponents: string[] = [];
        if (validated.length > 0) orderComponents.push(`${validated.length} movement`);
        if (validatedRanged.length > 0) orderComponents.push(`${validatedRanged.length} ranged`);
        if ((parsed.productionAppliedCount ?? 0) > 0) {
          orderComponents.push(`${parsed.productionAppliedCount} production`);
        }
        onLog(`Orders received: ${orderComponents.length > 0 ? orderComponents.join(', ') : 'none'}.`);
      }
      logDebug('openRouter requestOrders: tool usage summary', {
        turnNumber: state.turnNumber,
        usePrecomputation,
        enabledToolsRequested: requestedToolNames === undefined ? 'all' : requestedToolNames.length,
        enabledToolsEffective: enabledToolNames === undefined ? 'all' : enabledToolNames.length,
        toolInvocationCounts,
        iterations: iteration,
      });

      markSuccessfulConsultation();
      return {
        success: true,
        orders: validated,
        rangedAttacks: validatedRanged.length > 0 ? validatedRanged : undefined,
        strategy: parsed.strategy,
        dropped: effectiveDropReasons.length,
        dropReasons: effectiveDropReasons.length > 0 ? effectiveDropReasons : undefined,
        toolInvocationCounts,
        cost: requestCost > 0 ? requestCost : undefined,
        wallClockMs: Date.now() - wallClockStart,
        inputTokens: totalInputTokens > 0 ? totalInputTokens : undefined,
        outputTokens: totalOutputTokens > 0 ? totalOutputTokens : undefined,
      };
    }

    logError('openRouter requestOrders: exceeded tool-call limit', MAX_TOOL_ITERATIONS, state.turnNumber);
    setAiToolLimitExceededLastTurn();
    if (onLog) onLog('Tool limit exceeded.', true);
    markSuccessfulConsultation();
    return {
      success: true,
      orders: [],
      dropped: 0,
      toolInvocationCounts,
      cost: requestCost > 0 ? requestCost : undefined,
      wallClockMs: Date.now() - wallClockStart,
      inputTokens: totalInputTokens > 0 ? totalInputTokens : undefined,
      outputTokens: totalOutputTokens > 0 ? totalOutputTokens : undefined,
    };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      logDebug('openRouter requestOrders: cancelled');
      if (onLog) onLog('Cancelled.');
      return { success: false, error: 'Cancelled' };
    }
    logError('openRouter requestOrders: exception', err);
    if (onLog) onLog(String(err), true);
    return { success: false, error: String(err) };
  }
}

/**
 * Strips JavaScript-style line (//) and block (slash-star to star-slash) comments
 * from a string so that JSON-like output from an LLM can be parsed. Does not
 * remove comment sequences that appear inside string literals.
 */
function stripJsonLikeComments(s: string): string {
  let out = '';
  let i = 0;
  const n = s.length;
  let inDouble = false;
  let inSingle = false;
  let escape = false;
  let inLineComment = false;
  let inBlockComment = false;

  while (i < n) {
    const c = s[i];
    const next = i + 1 < n ? s[i + 1] : '';

    if (inLineComment) {
      if (c === '\n') {
        inLineComment = false;
        out += c;
      }
      i++;
      continue;
    }
    if (inBlockComment) {
      if (c === '*' && next === '/') {
        inBlockComment = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (escape) {
      out += c;
      escape = false;
      i++;
      continue;
    }
    if (inDouble) {
      if (c === '\\') {
        out += c;
        escape = true;
        i++;
        continue;
      }
      if (c === '"') {
        inDouble = false;
        out += c;
        i++;
        continue;
      }
      out += c;
      i++;
      continue;
    }
    if (inSingle) {
      if (c === '\\') {
        out += c;
        escape = true;
        i++;
        continue;
      }
      if (c === "'") {
        inSingle = false;
        out += c;
        i++;
        continue;
      }
      out += c;
      i++;
      continue;
    }

    if (c === '"') {
      inDouble = true;
      out += c;
      i++;
      continue;
    }
    if (c === "'") {
      inSingle = true;
      out += c;
      i++;
      continue;
    }
    if (c === '/' && next === '/') {
      inLineComment = true;
      i += 2;
      continue;
    }
    if (c === '/' && next === '*') {
      inBlockComment = true;
      i += 2;
      continue;
    }

    out += c;
    i++;
  }
  return out;
}

const CALLBACK_EVENT_VOCAB = new Set([
  'turns',
  'unit_engaged',
  'unit_destroyed',
  'unit_arrived',
  'threat_escalation',
  'territory_changed',
]);

function normalizeCallbacks(raw: unknown): CallbackSubscription[] {
  if (!Array.isArray(raw)) return [];
  const out: CallbackSubscription[] = [];
  for (const item of raw) {
    // Accept compact string callbacks (common model output), e.g.:
    // "turns(5)", "unit_engaged(opponent-naval-1)", "unit_destroyed:human-armor-1"
    if (typeof item === 'string') {
      const text = item.trim();
      if (!text) continue;
      const parenMatch = text.match(/^([a-z_]+)\((.*)\)$/i);
      if (parenMatch) {
        const event = parenMatch[1]!.trim();
        const arg = parenMatch[2]!.trim();
        if (!CALLBACK_EVENT_VOCAB.has(event)) continue;
        if (event === 'turns') {
          const n = Number(arg);
          if (Number.isFinite(n) && n > 0) out.push({ event, params: { n: Math.floor(n) } });
          continue;
        }
        if (event === 'unit_destroyed') {
          out.push({ event, params: { side: arg } });
          continue;
        }
        if (event === 'unit_engaged' || event === 'unit_arrived') {
          out.push({ event, params: { unitId: arg } });
          continue;
        }
        if (event === 'threat_escalation') {
          // Minimal compact form: threat_escalation(unitId)
          out.push({ event, params: { unitId: arg } });
          continue;
        }
        out.push({ event, params: {} });
        continue;
      }
      const colonMatch = text.match(/^([a-z_]+)\s*:\s*(.+)$/i);
      if (colonMatch) {
        const event = colonMatch[1]!.trim();
        const arg = colonMatch[2]!.trim();
        if (!CALLBACK_EVENT_VOCAB.has(event)) continue;
        if (event === 'turns') {
          const n = Number(arg);
          if (Number.isFinite(n) && n > 0) out.push({ event, params: { n: Math.floor(n) } });
        } else if (event === 'unit_destroyed') {
          out.push({ event, params: { side: arg } });
        } else if (event === 'unit_engaged' || event === 'unit_arrived') {
          out.push({ event, params: { unitId: arg } });
        } else if (event === 'threat_escalation') {
          out.push({ event, params: { unitId: arg } });
        } else {
          out.push({ event, params: {} });
        }
      }
      continue;
    }

    if (!item || typeof item !== 'object') continue;
    const o = item as { event?: unknown; params?: unknown };
    let event = typeof o.event === 'string' ? o.event.trim() : '';
    if (event.includes('(')) event = event.replace(/\(.*\)/, '').trim() || event;
    if (!event || !CALLBACK_EVENT_VOCAB.has(event)) continue;
    const params = o.params && typeof o.params === 'object' && !Array.isArray(o.params)
      ? (o.params as Record<string, unknown>)
      : {};
    out.push({ event, params });
  }
  return out;
}

export interface MemoryUpdateItem {
  action: 'write' | 'delete';
  key: string;
  content?: string;
  tier?: 'persistent' | 'stored';
}

function normalizeMemoryUpdates(raw: unknown): MemoryUpdateItem[] {
  if (!Array.isArray(raw)) return [];
  const out: MemoryUpdateItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as { action?: unknown; key?: unknown; content?: unknown; value?: unknown; tier?: unknown };
    const rawAction = o.action === 'write' || o.action === 'delete' ? o.action : undefined;
    const key = typeof o.key === 'string' ? o.key : '';
    if (!key) continue;
    const content = typeof o.content === 'string' ? o.content : typeof o.value === 'string' ? o.value : '';
    const action = rawAction ?? (content ? 'write' : undefined);
    if (!action) continue;
    if (action === 'write') {
      const tier = o.tier === 'persistent' || o.tier === 'stored' ? o.tier : undefined;
      out.push({ action: 'write', key, content, tier });
    } else {
      out.push({ action: 'delete', key });
    }
  }
  return out;
}

/** Repair-turn schema hint: hard-cut v3 contract (orders[] only; no legacy movementOrders/rangedAttacks). */
function buildJsonAssistantRepairSchema(includeProductionOrders: boolean): string {
  return includeProductionOrders
    ? `{"strategy":"...","orders":[{"unitId":"opponent-armor-1","action":"assign_order","order":{"type":"march","destination":[lat,lng]}},{"unitId":"opponent-armor-1","action":"explicit_move","destination":[lat,lng]},{"unitId":"opponent-armor-1","action":"explicit_attack","targetHex":[lat,lng]},{"unitId":"opponent-armor-1","action":"cancel_order"}],"callbacks":[],"memoryUpdates":[],"productionOrders":[{"action":"add_build_entry","hex":[lat,lng],"unitType":"infantry","count":1}]}`
    : `{"strategy":"...","orders":[{"unitId":"opponent-armor-1","action":"assign_order","order":{"type":"march","destination":[lat,lng]}},{"unitId":"opponent-armor-1","action":"explicit_move","destination":[lat,lng]},{"unitId":"opponent-armor-1","action":"explicit_attack","targetHex":[lat,lng]},{"unitId":"opponent-armor-1","action":"cancel_order"}],"callbacks":[],"memoryUpdates":[]}`;
}

function hasNonEmptyLegacyTopLevel(obj: Record<string, unknown>): boolean {
  const mo = obj.movementOrders;
  const ra = obj.rangedAttacks;
  return (Array.isArray(mo) && mo.length > 0) || (Array.isArray(ra) && ra.length > 0);
}

/**
 * Resolves explicit_attack target from [lat,lng] or enemy unit id → H3 index.
 * Supports both targetHex (canonical) and targetUnitId (compat alias). Never accepts raw H3 strings from the model.
 */
function resolveExplicitRangedTarget(
  target: unknown,
  state: GameStateSnapshot,
  resolveToH3: (lat: number, lng: number) => string | undefined
): string | undefined {
  if (typeof target === 'string') {
    const u = state.units.find((x) => x.id === target);
    return u?.h3Index;
  }
  if (Array.isArray(target) && target.length >= 2) {
    const lat = Number(target[0]);
    const lng = Number(target[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return resolveToH3(lat, lng);
  }
  return undefined;
}

/**
 * Walks v3 orders[] in order: applies assign_order/cancel_order via standing-order tool logic; collects explicit_move / explicit_attack.
 * Mutates DB for assign/cancel. Returns movement and ranged lists in internal H3 form for merge/validation.
 */
function processV3OrdersArray(
  entries: unknown[],
  state: GameStateSnapshot,
  latLngByH3: Map<string, LatLng>,
  resolveToH3: (lat: number, lng: number) => string | undefined
): { movementOrders: { unitId: string; toH3Index: string }[]; rangedAttacks: { unitId: string; targetH3Index: string }[] } {
  const movementOrders: { unitId: string; toH3Index: string }[] = [];
  const rangedAttacks: { unitId: string; targetH3Index: string }[] = [];
  for (const raw of entries) {
    if (!raw || typeof raw !== 'object') continue;
    const o = raw as {
      action?: unknown;
      unitId?: unknown;
      order?: unknown;
      destination?: unknown;
      targetHex?: unknown;
      targetUnitId?: unknown;
    };
    const action = o.action;
    const unitId = typeof o.unitId === 'string' ? o.unitId : '';
    if (!unitId) continue;

    if (action === 'assign_order') {
      logDebug('openRouter processV3OrdersArray: assign_order', { unitId });
      executeTool5('assign_order', { unitId, order: o.order }, state, latLngByH3, resolveToH3);
      continue;
    }
    if (action === 'cancel_order') {
      logDebug('openRouter processV3OrdersArray: cancel_order', { unitId });
      executeTool5('cancel_order', { unitId }, state, latLngByH3, resolveToH3);
      continue;
    }
    if (action === 'explicit_move') {
      const dest = o.destination;
      if (!Array.isArray(dest) || dest.length < 2) {
        logDebug('openRouter processV3OrdersArray: explicit_move missing destination', { unitId });
        continue;
      }
      const lat = Number(dest[0]);
      const lng = Number(dest[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const h3 = resolveToH3(lat, lng);
      if (h3) movementOrders.push({ unitId, toH3Index: h3 });
      else logDebug('openRouter processV3OrdersArray: explicit_move unresolved', { unitId, lat, lng });
      continue;
    }
    if (action === 'explicit_attack') {
      const attackTarget = o.targetHex ?? o.targetUnitId;
      const targetH3 = resolveExplicitRangedTarget(attackTarget, state, resolveToH3);
      if (targetH3) rangedAttacks.push({ unitId, targetH3Index: targetH3 });
      else logDebug('openRouter processV3OrdersArray: explicit_attack unresolved', { unitId });
      continue;
    }
    logDebug('openRouter processV3OrdersArray: skipped unknown action', { action, unitId });
  }
  return { movementOrders, rangedAttacks };
}

function processProductionOrdersArray(
  entries: unknown,
  state: GameStateSnapshot,
  latLngByH3: Map<string, LatLng>,
  resolveToH3: (lat: number, lng: number) => string | undefined
): { appliedCount: number; droppedReasons: string[] } {
  const normalized = normalizeProductionOrders(entries);
  const droppedReasons = [...normalized.droppedReasons];
  let appliedCount = 0;
  for (const order of normalized.validOrders) {
    const args =
      order.action === 'add_build_entry'
        ? { hex: order.hex, unitType: order.unitType, count: order.count }
        : order.action === 'update_build_entry'
          ? { hex: order.hex, entryId: order.entryId, unitType: order.unitType, count: order.count }
          : { hex: order.hex, entryId: order.entryId };
    const result = executeTool6(order.action, args, state, latLngByH3, resolveToH3) as { status?: string; error?: string };
    if (result.status === 'ok') {
      appliedCount += 1;
      continue;
    }
    droppedReasons.push(`production ${order.action} @ ${formatLatLng(order.hex)}: ${result.error ?? 'failed'}`);
  }
  return { appliedCount, droppedReasons };
}

/**
 * Parses the assistant final JSON: v3 orders[] (assign/cancel/explicit_move/explicit_attack), callbacks, memoryUpdates.
 * Rejects non-empty legacy top-level movementOrders/rangedAttacks (hard cut). Applies assign/cancel to DB while parsing.
 */
function parseOrdersResponse(
  content: string,
  resolveToH3: (lat: number, lng: number) => string | undefined,
  state: GameStateSnapshot,
  latLngByH3: Map<string, LatLng>,
  productionEnabled: boolean
): {
  movementOrders: { unitId: string; toH3Index: string }[];
  rangedAttacks: { unitId: string; targetH3Index: string }[];
  strategy?: string;
  callbacks?: CallbackSubscription[];
  memoryUpdates?: MemoryUpdateItem[];
  productionAppliedCount?: number;
  productionDropReasons?: string[];
} | null {
  const trimmed = content.trim();
  const candidates: string[] = [];
  candidates.push(trimmed);
  const fencedMatches = Array.from(trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/g));
  for (let i = fencedMatches.length - 1; i >= 0; i--) {
    const block = fencedMatches[i]?.[1]?.trim();
    if (block) candidates.push(block);
  }
  const lastBrace = trimmed.lastIndexOf('{');
  if (lastBrace >= 0) candidates.push(trimmed.slice(lastBrace).trim());

  for (const raw of candidates) {
    let jsonStr = raw;
    const firstBrace = jsonStr.search(/\{/);
    if (firstBrace >= 0) {
      const objectMatch = jsonStr.slice(firstBrace).match(/\{[\s\S]*\}/);
      if (objectMatch) jsonStr = objectMatch[0];
    }

    jsonStr = stripJsonLikeComments(jsonStr);
    try {
      const parsed = JSON.parse(jsonStr) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const obj = parsed as Record<string, unknown>;
        if (typeof obj.strategy !== 'string' || !Array.isArray(obj.orders)) {
          logDebug('openRouter parseOrdersResponse: rejected payload that does not match strict object schema');
          return null;
        }
        if (hasNonEmptyLegacyTopLevel(obj)) {
          logDebug('openRouter parseOrdersResponse: rejected non-empty legacy movementOrders/rangedAttacks');
          return null;
        }
        const { movementOrders, rangedAttacks } = processV3OrdersArray(obj.orders as unknown[], state, latLngByH3, resolveToH3);
        let productionDropReasons: string[] = [];
        let productionAppliedCount = 0;
        if (productionEnabled) {
          const productionResult = processProductionOrdersArray(obj.productionOrders, state, latLngByH3, resolveToH3);
          productionAppliedCount = productionResult.appliedCount;
          productionDropReasons = productionResult.droppedReasons;
        } else if (obj.productionOrders !== undefined) {
          productionDropReasons = ['productionOrders dropped: production tool group is disabled.'];
        }
        const strategy = obj.strategy.trim();
        const callbacks = normalizeCallbacks(obj.callbacks);
        const memoryUpdates = normalizeMemoryUpdates(obj.memoryUpdates);
        return {
          movementOrders,
          rangedAttacks,
          strategy,
          callbacks: callbacks.length > 0 ? callbacks : undefined,
          memoryUpdates: memoryUpdates.length > 0 ? memoryUpdates : undefined,
          productionAppliedCount: productionAppliedCount > 0 ? productionAppliedCount : undefined,
          productionDropReasons: productionDropReasons.length > 0 ? productionDropReasons : undefined,
        };
      }
    } catch {
      // Try next candidate.
    }
  }
  return null;
}
