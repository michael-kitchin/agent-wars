/**
 * OpenRouter integration: API key storage, list models, and request AI movement orders.
 * All key handling is in the main process; the key is never logged or sent to the renderer in plain form.
 */

import * as fs from 'fs';
import * as path from 'path';
import { app, safeStorage } from 'electron';
import { gridDistance } from 'h3-js';
import { getAttack, getDefense, getRange } from './combatConstants';
import { logDebug, logError, logTrace } from './logger';
import type { GameStateSnapshot } from './gameDb';
import { setAiToolLimitExceededLastTurn, getAndClearAiToolLimitExceededLastTurn } from './gameDb';
import { buildLatLngCoordinateMap, LATLNG_DECIMAL_PLACES } from './mapData';
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
import { runPrecomputation } from './precomputation';
import { formatBriefing } from './briefingFormatter';

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

const MOVEMENT_RANGE: Record<string, number> = {
  infantry: 1,
  armor: 2,
  naval: 2,
};

/** Returns the path to the OpenRouter config file (userData). Call after app is ready. */
function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'openrouter-config.json');
}

/**
 * Loads the stored API key from disk. Uses safeStorage to decrypt if available.
 * Returns empty string if no key or read fails. Never logs the key.
 */
export function loadKey(): string {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) return '';
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const data = JSON.parse(raw) as { key?: string; encrypted?: string };
    if (typeof data.encrypted === 'string' && safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(data.encrypted, 'base64'));
    }
    if (typeof data.key === 'string') return data.key;
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
}

/**
 * Returns the currently selected model id for AI orders. Used by the ready flow when requesting opponent orders.
 */
export function getSelectedModel(): string {
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
  { id: 'planning', label: 'Planning', toolNames: TOOL1_NAMES },
  { id: 'assessment', label: 'Assessment', toolNames: TOOL2_NAMES },
  { id: 'estimation', label: 'Estimation', toolNames: TOOL3_NAMES },
  { id: 'memory', label: 'Memory', toolNames: TOOL4_NAMES },
  { id: 'orders', label: 'Orders', toolNames: TOOL5_NAMES },
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
  return {
    planningEnabled,
    assessmentEnabled,
    estimationEnabled,
    ordersEnabled,
    memoryEnabled,
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
    if (!validDests.includes(order.toH3Index)) return { valid: false, reason: 'Invalid distance' };
  }

  const destHex = state.hexes.find((h) => h.h3Index === order.toH3Index);
  const terrain = destHex?.terrain ?? 'land';
  if (unit.unitType === 'naval' && terrain !== 'water') return { valid: false, reason: 'Naval units must move to water' };
  if ((unit.unitType === 'infantry' || unit.unitType === 'armor') && terrain !== 'land') {
    return { valid: false, reason: 'Land units must move to land' };
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
    if (unit.unitType === 'naval' && h.terrain !== 'water') continue;
    if (wantLand && h.terrain !== 'land') continue;
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
const LATLNG_PREAMBLE = `Positions use [lat, lng] coordinates (latitude, longitude; floating point is fine). Use only coordinates from the unit and target lists below; do not invent coordinates. Hex distances are given in the prompt where relevant.

Response format: Reply with movementOrders and rangedAttacks using toXY and targetXY. Each is an array of two numbers [lat, lng]. Do not use toH3Index, targetH3Index, or any hex/string IDs.`;

/** Formats [lat, lng] for the prompt using LATLNG_DECIMAL_PLACES to save tokens and match resolveToH3. */
function formatLatLng(ll: [number, number]): string {
  return `[${ll[0].toFixed(LATLNG_DECIMAL_PLACES)}, ${ll[1].toFixed(LATLNG_DECIMAL_PLACES)}]`;
}

/** Optional suffix for movement instruction when Memory tools are enabled. */
const MOVEMENT_INSTRUCTION_MEMORY_SUFFIX =
  ' Use memory_write to record your strategy each turn so you can build on it next turn.';

/**
 * Builds the "HOW TO USE TOOLS" guidance block, conditional on which tool groups are enabled.
 * Appended at the end of the tools section so the LLM knows the recommended workflow.
 */
function buildToolUsageGuidance(flags: ToolFlags): string {
  const lines: string[] = [];
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
  if (flags.memoryEnabled) {
    lines.push('- memory_write tiers: "persistent" entries appear in every briefing (limit 5, for active plans); "stored" entries are retrieved on demand via memory_read (limit 15, for details and observations).');
  }
  if (flags.ordersEnabled) {
    lines.push('- Units with standing orders do not need explicit orders from you unless you want to override their current mission this turn.');
    if (flags.planningEnabled) {
      lines.push('- For units several turns from combat, assign a march or pursue standing order instead of re-planning their route every turn. This saves tool calls and prevents changing targets between turns.');
    }
  }
  if (flags.memoryEnabled) {
    lines.push(
      '- BEFORE submitting your final orders: use memory_write(key: "strategy", tier: "persistent") to record your current strategic plan.' +
      ' Good content: specific unit-to-target assignments with ETAs (e.g. "armor-1/2 → human-armor-1, ETA 1 turn; infantry marching, ETA 4 turns"), priority decisions, and key observations (e.g. "naval-1 stuck in disconnected water body — stop retrying route").' +
      ' Do NOT store enemy positions or unit rosters — these are already in every briefing and go stale immediately.' +
      ' Keep it concise and actionable; vague summaries like "all units moving toward enemies" waste the slot.'
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
    return ' For each movement order: use the exact orderToXY from that unit\'s plan_route result as toXY (copy the two numbers exactly); do not round, interpolate, or invent coordinates or the order will be rejected.';
  }
  if (flags.ordersEnabled) {
    return (
      ' You do not have movement planning tools. Without them you cannot compute valid one-step moves (each unit has a strict movement budget per turn). You must submit empty movementOrders: [] and empty rangedAttacks: []. Do not put distant coordinates (e.g. enemy positions) in movementOrders - they will all be rejected. Use the tools above to assign standing orders (e.g. march, defend, pursue) so your units receive movement on future turns.' +
      memorySuffix
    );
  }
  if (flags.fallbackMovementEnabled) {
    const memoryHint = flags.memoryEnabled
      ? ' After your analysis, use memory_write to record your strategy before submitting orders. '
      : '';
    return (
      memoryHint +
      'You do not have planning or standing-orders tools. You may still issue one-step moves using the "Adjacent cells (fallback)" list below: for each unit, set toXY to that unit\'s current position (hold) or to one of its listed adjacent cells. This is a fallback; when plan_route or standing orders are available, prefer those. Use only coordinates from that list - do not invent coordinates or orders will be rejected.' +
      memorySuffix
    );
  }
  return (
    ' You do not have movement planning tools. Without them you cannot compute valid one-step moves (each unit has a strict movement budget per turn). You must submit empty movementOrders: [] and empty rangedAttacks: []. Do not put distant coordinates (e.g. enemy positions) in movementOrders - they will all be rejected.' +
    memorySuffix
  );
}

/**
 * Returns the initial user message for the tool-calling flow.
 * Branch order: Planning → Orders+Memory → Orders only → Fallback (one-step moves) → Memory only → None.
 */
function getInitialUserMessage(flags: ToolFlags): string {
  if (flags.planningEnabled) {
    const memoryNote = flags.memoryEnabled
      ? ' After your analysis, use memory_write to record your strategy and key observations before submitting orders. '
      : '';
    return `Use the tools as needed to plan movement.${memoryNote} Then submit your final orders as a single JSON object: { "strategy": "...", "movementOrders": [...], "rangedAttacks": [...] }. For each movement order, set toXY to the exact orderToXY from that unit's plan_route result (copy the numbers exactly).`;
  }

  const submitEmpty = ` Then submit your final JSON with "strategy": "<one-line>", "movementOrders": [], "rangedAttacks": [].`;
  if (flags.ordersEnabled && flags.memoryEnabled) {
    return `You have no movement planning tools, so you cannot issue movement or ranged orders this turn. Use the available tools to assign standing orders (e.g. march toward an enemy, defend a hex). Before submitting, use memory_write to record your strategy and any key observations.${submitEmpty}`;
  }
  if (flags.ordersEnabled) {
    return `You have no movement planning tools, so you cannot issue movement or ranged orders this turn. Use the available tools to assign standing orders (e.g. march toward an enemy, defend a hex) so your units will move on future turns.${submitEmpty}`;
  }
  if (flags.fallbackMovementEnabled) {
    const memoryNudge = flags.memoryEnabled
      ? ' After your analysis, use memory_write to record your strategy and observations before submitting orders. '
      : '';
    return `${memoryNudge}You may issue one-step moves using the "Adjacent cells (fallback)" list in the system prompt. Submit your final JSON with "strategy": "<one-line>", "movementOrders": [...] (use only coordinates from that list), "rangedAttacks": [...] as appropriate.`;
  }
  if (flags.memoryEnabled) {
    return `You have no movement planning tools, so you cannot issue movement or ranged orders this turn. Use memory_write to record your strategic plan and any key observations.${submitEmpty}`;
  }

  return `You have no movement planning tools. Submit a JSON object with "strategy": "<one-line>", "movementOrders": [], "rangedAttacks": [].`;
}

/**
 * Builds the system prompt for the tool-calling flow: unit roster, combat summary, and tool descriptions.
 * When enabledToolNames is provided, the "AVAILABLE TOOLS" section includes only those tools (numbered 1..N).
 * When omitted, all tools are included. Injects a one-time warning if the previous turn exceeded the tool-call limit.
 *
 * Prompt conditionals (single source: getToolFlags):
 * - Planning enabled → use plan_route orderToXY for movement.
 * - Orders enabled, Planning disabled → submit empty movementOrders; use standing orders for future moves.
 * - Fallback (neither Planning nor Orders) → show adjacent-cells list; model may issue one-step moves from that list.
 * - Combat hints (naval plan, assess, estimate) and memory/standing-order blocks depend on their respective flags.
 */
/**
 * Builds the system prompt for the tool-calling LLM. When briefingOverride is provided (0.6 pre-computation path),
 * it replaces the usual memory + standing-order + roster block with the Commander's Briefing; combat rules,
 * tools section, and submit instruction are unchanged. When absent, behavior matches 0.5.
 */
function buildSystemPromptForTools(
  state: GameStateSnapshot,
  coordMap: { latLngByH3: Map<string, [number, number]>; format: (h3: string) => string },
  enabledToolNames?: string[],
  briefingOverride?: string
): string {
  const { latLngByH3, format } = coordMap;
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
  const toolsIntro = toolsIntroPurpose
    ? `Use these tools to ${toolsIntroPurpose} before submitting orders. You may use multiple rounds of tool calls and mix tool types if that helps.` +
      (flags.memoryEnabled
        ? ' Memory is available: use memory_write to record your strategy and observations before submitting orders each turn.'
        : '')
    : 'Use only the tools listed below. Do not call tools that are not in the list.';
  const toolGuidance = buildToolUsageGuidance(flags);
  const toolsSection =
    filtered.length === 0
      ? '=== AVAILABLE TOOLS ===\nNo tools available.'
      : `=== AVAILABLE TOOLS ===
${toolsIntro}
${filtered.map((m, i) => `${i + 1}. ${m.promptLine}`).join('\n')}${toolGuidance}`;

  const memoryBlock = flags.memoryEnabled ? getInjectionText('opponent', state.turnNumber) + '\n\n' : '';
  const standingOrderBlock = flags.ordersEnabled ? getStandingOrderInjectionText('opponent', state) + '\n\n' : '';

  const hasNaval = opponentUnits.some((u) => u.unitType === 'naval');
  const hasRanged = opponentUnits.some((u) => getRange(u.unitType as 'infantry' | 'armor' | 'naval') >= 1);

  const combatTargetHint = flags.estimationEnabled ? ' (e.g. use estimate_combat to pick the best).' : '.';
  const navalCoaching = hasNaval
    ? ` Naval units can attack land units at 1 or 2 hexes (range 2). Always add a rangedAttack when a naval unit is within 2 hexes of an enemy land or naval unit at the start of the turn. To use naval fire effectively, get your naval units close to enemy land units, then issue rangedAttacks each turn. Naval units move only on water.${flags.planningEnabled ? ' To move a naval unit toward a land target, call plan_route with that land unit\'s position as the destination; the tool will route to the nearest water hex to that position.' : ''}`
    : '';
  const combatAssessHint = flags.assessmentEnabled && hasRanged
    ? ' When assess_unit reports canAttackThisTurn with attackType "ranged" for an enemy, issue a rangedAttack using that enemy\'s position as targetXY so your unit fires this turn.' +
      (hasNaval ? ' If assess_unit shows a naval unit with inRangedRange: true for an enemy (including land units at 2 hexes), add a rangedAttack for that naval unit targeting that enemy.' : '') +
      ' Note: inEnemyRangedRange means that enemy can fire at YOUR unit from its current position (you are in danger); inRangedRange means YOUR unit can fire at that enemy.'
    : '';

  const adjacentCellsBlock = flags.fallbackMovementEnabled
    ? buildAdjacentCellsFallbackBlock(state, opponentUnits, coordMap)
    : '';
  const movementOrderInstruction = getMovementOrderInstruction(flags);

  const mainBlock = briefingOverride != null && briefingOverride.length > 0
    ? `${briefingOverride}\n\n${toolsSection}\n\nYour units (ID, type, position [lat, lng]): ${opponentRoster || 'none'}\nHuman units: ${humanRoster || 'none'}`
    : `${memoryBlock}${standingOrderBlock}${toolsSection}\n\nYour units (ID, type, position [lat, lng]): ${opponentRoster || 'none'}\nHuman units: ${humanRoster || 'none'}${adjacentCellsBlock}`;

  return `You are the opponent in a WEGO (simultaneous movement) hex wargame. Current turn: ${state.turnNumber}, phase: ${state.phase}. Your objective is to destroy all human units. Move toward human units to get in ranged or melee range; do not stay passive.${warning}

${LATLNG_PREAMBLE}

Combat: each unit rolls d6 when attacking (hit if roll <= attack) or when defending (hit if roll <= defender's defense). Unit stats: ${combatSummary}. Ranged attacks can target any enemy hex within range regardless of terrain (e.g. armor on land can fire at naval on adjacent water, and vice versa). Ranged attacks are resolved using each unit's current position (before movement). Only issue a ranged attack if that unit is already within range of the target hex at the start of this turn; do not assume movement happens first. If a unit is moving this turn and would only be in range after the move, do not add a ranged attack for it this turn (it can fire next turn from its new position). Each unit may declare at most one ranged attack per turn: include each attacking unit at most once in rangedAttacks; if a unit can attack multiple enemies, choose one target${combatTargetHint} For rangedAttacks targetXY, always use the enemy's position from the "Human units" list above — never use orderToXY or plan_route coordinates, which are your own movement destinations.${navalCoaching}${combatAssessHint}

${mainBlock}

Submit your final orders as a JSON object only (valid JSON, no comments): { "strategy": "<one-line explanation>", "movementOrders": [ { "unitId": "<id>", "toXY": [lat, lng] }, ... ], "rangedAttacks": [ { "unitId": "<id>", "targetXY": [lat, lng] }, ... ] }. Use only toXY and targetXY as [lat, lng] arrays. Include "strategy".${movementOrderInstruction} In rangedAttacks, list each unit at most once (one ranged attack per unit per turn); duplicate unitIds are dropped.`;
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
    promptLine: 'plan_route(unitId, destination, options?) - Compute the optimal path for a unit to a destination hex. Returns multi-turn route and orderToXY: the exact [lat, lng] for this turn\'s movement order (copy this into toXY for that unit). For naval units, you may pass a land unit\'s [lat, lng] as destination; the route will be to the nearest water hex to that position so the naval can get in range.',
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
    name: 'memory_write',
    description: 'Store a note, plan, or reminder. Two tiers: persistent (always in your briefing, limit 5) and stored (retrieved on demand, limit 15). 500 chars each.',
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Unique identifier (e.g. southern_front_plan)' },
        content: { type: 'string', description: 'Text to remember (max 500 characters)' },
        tier: { type: 'string', enum: ['persistent', 'stored'], description: 'Default: stored' },
        options: {
          type: 'object',
          properties: {
            expiresOnTurn: { type: 'number', description: 'Auto-delete after this turn' },
            recurring: {
              type: 'object',
              properties: {
                intervalTurns: { type: 'number', description: 'Remind every N turns' },
                nextTurn: { type: 'number', description: 'First turn to trigger (default: current + interval)' },
              },
              required: ['intervalTurns'],
            },
            tags: { type: 'array', items: { type: 'string' }, description: 'Tags for retrieval (e.g. threat, south)' },
          },
        },
      },
      required: ['key', 'content'],
    },
    promptLine: 'memory_write(key, content, tier?, options?) - Store or update a memory. Use tier "persistent" for active plan (limit 5), "stored" for details (limit 15).',
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
    name: 'memory_delete',
    description: 'Delete a memory to free a slot in its tier.',
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Key of the memory to delete' },
      },
      required: ['key'],
    },
    promptLine: 'memory_delete(key) - Delete a memory to free a slot.',
  },
  {
    name: 'assign_order',
    description:
      'Give a unit a persistent mission: defend, march, pursue, patrol, or hold_fire. The engine executes it each turn automatically. NOTE: New standing orders take effect NEXT turn. If you want the unit to act THIS turn, also issue an explicit movement or attack order.',
    parameters: {
      type: 'object',
      properties: {
        unitId: { type: 'string', description: 'ID of the unit (e.g. opponent-armor-1)' },
        order: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['defend', 'march', 'pursue', 'patrol', 'hold_fire'], description: 'Order type' },
            defendHex: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2, description: 'Hex to hold (defend)' },
            engageRange: { type: 'number', description: 'Max hex distance to engage (defend)' },
            destination: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2, description: 'Destination [lat, lng] (march)' },
            avoidEnemies: { type: 'boolean', description: 'Route around enemies (march, default true)' },
            engageEnRoute: { type: 'boolean', description: 'Attack enemies adjacent to route (march)' },
            targetUnitId: { type: 'string', description: 'Enemy unit to chase (pursue)' },
            maxDistance: { type: 'number', description: 'Max hex distance from order origin (pursue)' },
            waypoints: { type: 'array', items: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 }, description: 'Cycle through these hexes (patrol, min 2)' },
          },
          required: ['type'],
        },
      },
      required: ['unitId', 'order'],
    },
    promptLine: 'assign_order(unitId, order) - Give a unit a persistent mission: defend, march, pursue, patrol, or hold_fire. New standing orders take effect NEXT turn; issue an explicit order too if you want action this turn.',
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
    name: 'cancel_order',
    description: 'Cancel a unit\'s standing order.',
    parameters: {
      type: 'object',
      properties: {
        unitId: { type: 'string', description: 'Unit whose standing order to cancel' },
      },
      required: ['unitId'],
    },
    promptLine: 'cancel_order(unitId) - Cancel a standing order.',
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

const MAX_TOOL_ITERATIONS = 50;

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
 * append results, and resend until the model returns final order JSON or the iteration limit (10) is reached.
 * When options.enabledToolNames is provided, only those tools are sent and executed; disabled tool calls are skipped and not counted.
 * Validates and drops invalid orders. Never logs the API key.
 */
export async function requestOrders(
  state: GameStateSnapshot,
  modelId: string,
  options?: RequestOrdersOptions
): Promise<RequestOrdersResult | RequestOrdersError> {
  const enabledToolNames = options?.enabledToolNames;
  const signal = options?.signal;
  const onLog = options?.onLog;
  const usePrecomputation = options?.usePrecomputation === true;
  if (onLog) onLog('Requesting AI orders…');
  logDebug('openRouter requestOrders', {
    modelId,
    turnNumber: state.turnNumber,
    enabledTools: enabledToolNames === undefined ? 'all' : enabledToolNames.length,
    usePrecomputation,
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
    format: (h3: string) => {
      const ll = latLngByH3.get(h3);
      return ll ? formatLatLng(ll) : h3;
    },
  };

  const flags = getToolFlags(enabledToolNames);
  const enabledToolNameSet =
    enabledToolNames === undefined
      ? new Set(TOOL_GROUP_REGISTRY.flatMap((g) => [...g.toolNames]))
      : new Set(enabledToolNames);
  const { movementOrders: standingOrderMovement, rangedAttacks: standingOrderRanged } = flags.ordersEnabled
    ? generateOrdersForStandingOrders('opponent', state, latLngByH3, resolveToH3)
    : { movementOrders: [] as { unitId: string; toH3Index: string }[], rangedAttacks: [] as { unitId: string; targetH3Index: string }[] };

  if (flags.ordersEnabled && !flags.planningEnabled) {
    logDebug(
      'openRouter requestOrders: Orders enabled but Planning disabled; AI may be unable to produce movement orders. Enable Planning alongside Orders.'
    );
  }

  let briefingOverride: string | undefined;
  if (usePrecomputation) {
    const precomputed = runPrecomputation(state, { latLngByH3, resolveToH3 });
    const standingOrderText = getStandingOrderInjectionText('opponent', state);
    const memoryText = getInjectionText('opponent', state.turnNumber);
    briefingOverride = formatBriefing(state, precomputed, standingOrderText, memoryText);
    logDebug('openRouter requestOrders: pre-computation ran', {
      briefingLength: briefingOverride.length,
      unitAssessments: precomputed.unitAssessments.length,
      combatEstimates: precomputed.combatEstimates.length,
    });
  }
  const systemPrompt = buildSystemPromptForTools(state, coordMap, enabledToolNames, briefingOverride);
  const userMessage = getInitialUserMessage(flags);

  const tools = buildToolDefinitions(enabledToolNames);
  const toolInvocationCounts: Record<string, number> = {};
  for (const g of TOOL_GROUP_REGISTRY) toolInvocationCounts[g.id] = 0;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];

  logDebug('openRouter requestOrders: system prompt', systemPrompt);
  logDebug('openRouter requestOrders: user message', userMessage);
  logDebug('openRouter requestOrders: starting tool loop', { turnNumber: state.turnNumber });

  const wallClockStart = Date.now();
  let requestCost = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  try {
    let iteration = 0;
    while (iteration < MAX_TOOL_ITERATIONS) {
      iteration++;
      const body: Record<string, unknown> = {
        model: modelId,
        messages,
        max_tokens: 2048,
        tools,
        tool_choice: 'auto',
      };

      const fetchInit: RequestInit = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(body),
      };
      if (signal) fetchInit.signal = signal;
      const res = await fetch(OPENROUTER_CHAT_URL, fetchInit);

      if (!res.ok) {
        const text = await res.text();
        logError('openRouter requestOrders: API error', res.status, text.slice(0, 200));
        const msg = res.status === 401 ? 'Invalid API key' : `API error: ${res.status}`;
        if (onLog) onLog(msg, true);
        return { success: false, error: msg };
      }

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
        logDebug('openRouter requestOrders: assistant response (tool round)', typeof assistantContent === 'string' ? assistantContent : '(none)');
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
            : (TOOL4_NAMES as readonly string[]).includes(toolName)
              ? executeTool4(toolName, args, state, latLngByH3, resolveToH3)
              : (TOOL3_NAMES as readonly string[]).includes(toolName)
                ? executeTool3(toolName, args, state, latLngByH3, resolveToH3)
                : (TOOL2_NAMES as readonly string[]).includes(toolName)
                  ? executeTool2(toolName, args, state, latLngByH3, resolveToH3)
                  : executeTool1(toolName, args, state, latLngByH3, resolveToH3);
          const resultStr = JSON.stringify(result);
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

      logDebug('openRouter requestOrders: assistant response (final)', content);
      const parsed = parseOrdersResponse(content, resolveToH3);
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

      const llmMovementUnitIds = new Set((parsed.movementOrders ?? []).map((o) => o.unitId));
      const mergedMovement = [
        ...standingOrderMovement.filter((o) => !llmMovementUnitIds.has(o.unitId)),
        ...(parsed.movementOrders ?? []),
      ];
      const llmRangedUnitIds = new Set((parsed.rangedAttacks ?? []).map((r) => r.unitId));
      const mergedRanged = [
        ...standingOrderRanged.filter((o) => !llmRangedUnitIds.has(o.unitId)),
        ...(parsed.rangedAttacks ?? []),
      ];

      const validated: { unitId: string; toH3Index: string }[] = [];
      const dropReasons: string[] = [];
      const seenUnits = new Set<string>();

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
          dropReasons.push(`${order.unitId} -> ${order.toH3Index}: ${result.reason}`);
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
          dropReasons.push(`Ranged ${r.unitId} -> ${r.targetH3Index}: ${result.reason}`);
        }
      }

      const validatedUnitIds = new Set(validated.map((o) => o.unitId));
      const fallbackUnits: string[] = [];
      for (const o of standingOrderMovement) {
        if (!validatedUnitIds.has(o.unitId)) {
          const vr = validateAiOrder(o, state);
          if (vr.valid) {
            validated.push(o);
            validatedUnitIds.add(o.unitId);
            if (llmMovementUnitIds.has(o.unitId)) {
              fallbackUnits.push(o.unitId);
            }
          } else {
            dropReasons.push(`Standing order ${o.unitId} -> ${o.toH3Index}: ${vr.reason}`);
          }
        }
      }
      const validatedRangedUnitIds = new Set(validatedRanged.map((r) => r.unitId));
      const fallbackRanged: string[] = [];
      for (const r of standingOrderRanged) {
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

      if (dropReasons.length > 0) {
        logDebug('openRouter requestOrders: dropped invalid orders', {
          dropped: dropReasons.length,
          reasons: dropReasons,
        });
        if (onLog) onLog(`Dropped ${dropReasons.length} invalid order(s).`, true);
      }

      if (onLog) onLog(`Orders received: ${validated.length} movement, ${validatedRanged.length} ranged.`);

      return {
        success: true,
        orders: validated,
        rangedAttacks: validatedRanged.length > 0 ? validatedRanged : undefined,
        strategy: parsed.strategy,
        dropped: dropReasons.length,
        dropReasons: dropReasons.length > 0 ? dropReasons : undefined,
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

/**
 * Parses the LLM response into movement orders and optional ranged attacks.
 * Expects toXY and targetXY as [lat, lng] (numbers, may be floating point); resolves to H3 via resolveToH3.
 */
function parseOrdersResponse(
  content: string,
  resolveToH3: (lat: number, lng: number) => string | undefined
): {
  movementOrders: { unitId: string; toH3Index: string }[];
  rangedAttacks: { unitId: string; targetH3Index: string }[];
  strategy?: string;
} | null {
  const trimmed = content.trim();
  let jsonStr = trimmed;
  const codeBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) jsonStr = codeBlock[1].trim();
  const firstBrace = jsonStr.search(/\{/);
  const firstBracket = jsonStr.search(/\[/);
  if (firstBrace >= 0 && (firstBracket < 0 || firstBrace < firstBracket)) {
    const objectMatch = jsonStr.slice(firstBrace).match(/\{[\s\S]*\}/);
    if (objectMatch) jsonStr = objectMatch[0];
  } else if (firstBracket >= 0) {
    const arrayMatch = jsonStr.slice(firstBracket).match(/\[[\s\S]*\]/);
    if (arrayMatch) jsonStr = arrayMatch[0];
  }
  jsonStr = stripJsonLikeComments(jsonStr);
  try {
    const parsed = JSON.parse(jsonStr) as unknown;
    if (Array.isArray(parsed)) {
      const movementOrders = parseOrdersArray(parsed, resolveToH3);
      return { movementOrders, rangedAttacks: [] };
    }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const obj = parsed as { movementOrders?: unknown; rangedAttacks?: unknown; strategy?: unknown };
      const movementOrders = Array.isArray(obj.movementOrders) ? parseOrdersArray(obj.movementOrders, resolveToH3) : [];
      const rangedAttacks = Array.isArray(obj.rangedAttacks) ? parseRangedArray(obj.rangedAttacks, resolveToH3) : [];
      const strategy = typeof obj.strategy === 'string' && obj.strategy.trim() ? obj.strategy.trim() : undefined;
      return { movementOrders, rangedAttacks, strategy };
    }
    return null;
  } catch {
    return null;
  }
}

function parseOrdersArray(
  arr: unknown[],
  resolveToH3: (lat: number, lng: number) => string | undefined
): { unitId: string; toH3Index: string }[] {
  const orders: { unitId: string; toH3Index: string }[] = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object' || typeof (item as { unitId?: unknown }).unitId !== 'string') continue;
    const o = item as { unitId: string; toXY?: unknown; toH3Index?: unknown };
    if (o.toH3Index != null) continue;
    let toH3Index: string | undefined;
    if (Array.isArray(o.toXY) && o.toXY.length >= 2) {
      const lat = Number(o.toXY[0]);
      const lng = Number(o.toXY[1]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        toH3Index = resolveToH3(lat, lng);
        if (!toH3Index) {
          logDebug('openRouter parseOrdersArray: coordinates did not resolve to hex, order skipped', {
            unitId: o.unitId,
            toXY: [lat, lng],
          });
        }
      }
    }
    if (toH3Index) orders.push({ unitId: o.unitId, toH3Index });
  }
  return orders;
}

function parseRangedArray(
  arr: unknown[],
  resolveToH3: (lat: number, lng: number) => string | undefined
): { unitId: string; targetH3Index: string }[] {
  const orders: { unitId: string; targetH3Index: string }[] = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object' || typeof (item as { unitId?: unknown }).unitId !== 'string') continue;
    const o = item as { unitId: string; targetXY?: unknown; targetH3Index?: unknown };
    if (o.targetH3Index != null) continue;
    let targetH3Index: string | undefined;
    if (Array.isArray(o.targetXY) && o.targetXY.length >= 2) {
      const lat = Number(o.targetXY[0]);
      const lng = Number(o.targetXY[1]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) targetH3Index = resolveToH3(lat, lng);
    }
    if (targetH3Index) orders.push({ unitId: o.unitId, targetH3Index });
  }
  return orders;
}

