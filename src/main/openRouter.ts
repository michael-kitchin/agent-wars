/**
 * OpenRouter integration: API key storage, list models, and request AI movement orders.
 * All key handling is in the main process; the key is never logged or sent to the renderer in plain form.
 */

import * as fs from 'fs';
import * as path from 'path';
import { app, safeStorage } from 'electron';
import { gridDistance, cellToLocalIj } from 'h3-js';
import { getAttack, getDefense, getRange } from './combatConstants';
import { logDebug, logError } from './logger';
import type { GameStateSnapshot } from './gameDb';

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

const MOVEMENT_RANGE: Record<string, number> = {
  infantry: 1,
  armor: 2,
  naval: 2,
};

/** Cube coordinates (i, j, k) with i + j + k = 0; used in prompts so the LLM can reason about distance and adjacency. */
type CubeCoord = [number, number, number];

function cubeKey(c: CubeCoord): string {
  return `${c[0]},${c[1]},${c[2]}`;
}

/**
 * Converts an H3 index to cube coordinates (i, j, k) relative to an origin cell.
 * Uses H3 local IJ; k = -i - j so that i + j + k = 0. Returns null if conversion throws.
 */
function h3ToCube(h3Index: string, originH3: string): CubeCoord | null {
  try {
    const ij = cellToLocalIj(originH3, h3Index) as { i: number; j: number };
    const i = ij.i;
    const j = ij.j;
    return [i, j, -i - j];
  } catch {
    return null;
  }
}

/**
 * Builds a map from cube key to H3 index for all hexes in the state.
 * Origin is the first hex in state.hexes. Used to show (i,j,k) in the prompt and to resolve toCube/targetCube in the response.
 * If no origin or cellToLocalIj fails for too many hexes (e.g. large map), cubeToH3 may be empty or partial; caller should fall back to H3-index prompt when cubeToH3.size === 0.
 */
function buildCubeMap(state: GameStateSnapshot): { cubeToH3: Map<string, string>; origin: string; formatCube: (h3: string) => string } {
  const cubeToH3 = new Map<string, string>();
  const origin = state.hexes[0]?.h3Index ?? '';
  if (!origin) {
    const formatCube = (h3: string): string => h3;
    return { cubeToH3, origin, formatCube };
  }
  try {
    for (const h of state.hexes) {
      const c = h3ToCube(h.h3Index, origin);
      if (c) cubeToH3.set(cubeKey(c), h.h3Index);
    }
  } catch (err) {
    logDebug('openRouter buildCubeMap: cellToLocalIj failed for some hexes', err);
  }
  const formatCube = (h3: string): string => {
    try {
      const c = h3ToCube(h3, origin);
      return c ? `(${c[0]}, ${c[1]}, ${c[2]})` : h3;
    } catch {
      return h3;
    }
  };
  return { cubeToH3, origin, formatCube };
}

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

  const dist = gridDistance(unit.h3Index, order.toH3Index);
  const range = MOVEMENT_RANGE[unit.unitType] ?? 1;
  if (dist > range) return { valid: false, reason: `${unit.unitType} can move at most ${range} hex(es)` };
  if (dist < 1) return { valid: false, reason: 'Destination must be different from current hex' };

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
 * Returns a suggested move for the unit that minimizes distance to the nearest human unit.
 * Used to give the LLM a concrete "pursuit" option so it can advance toward the player without interpreting H3 geometry.
 */
function getPursuitSuggestion(
  unit: { id: string; h3Index: string; unitType: string },
  state: GameStateSnapshot
): { toH3Index: string; nearestHumanId: string; distanceHexes: number } | null {
  const humanUnits = state.units.filter((u) => u.player === 'human');
  if (humanUnits.length === 0) return null;
  const dests = getValidDestinations(unit, state);
  if (dests.length === 0) return null;
  let bestDest: string | null = null;
  let bestDist = Infinity;
  let bestHumanId = humanUnits[0]!.id;
  for (const dest of dests) {
    for (const h of humanUnits) {
      try {
        const d = gridDistance(dest, h.h3Index);
        if (d < bestDist) {
          bestDist = d;
          bestDest = dest;
          bestHumanId = h.id;
        }
      } catch {
        /* skip */
      }
    }
  }
  if (bestDest == null) return null;
  return { toH3Index: bestDest, nearestHumanId: bestHumanId, distanceHexes: bestDist };
}

/**
 * Returns H3 indices of enemy-occupied hexes within the unit's ranged attack range.
 * Used to list valid ranged targets in the AI prompt.
 */
function getValidRangedTargets(unit: { h3Index: string; unitType: string; player: string }, state: GameStateSnapshot): string[] {
  const range = getRange(unit.unitType);
  if (range < 1) return [];
  const valid: string[] = [];
  for (const h of state.hexes) {
    if (h.h3Index === unit.h3Index) continue;
    const hasEnemy = state.units.some((u) => u.h3Index === h.h3Index && u.player !== unit.player);
    if (!hasEnemy) continue;
    let dist: number;
    try {
      dist = gridDistance(unit.h3Index, h.h3Index);
    } catch {
      continue;
    }
    if (dist >= 1 && dist <= range) valid.push(h.h3Index);
  }
  return valid;
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

const CUBE_PREAMBLE = `Hex positions use cube coordinates (i, j, k): three integers with i + j + k = 0. Adjacent hexes differ by 1 in two of the three. You can reason about distance: e.g. (0, 0, 0) and (2, -1, -1) are two steps apart.`;

/**
 * Builds the system prompt for the LLM: game rules, map summary, opponent units with valid move and ranged targets, and required JSON format.
 * Uses cube coordinates (i, j, k) in the prompt when cubeMap is provided so the LLM can reason about positions.
 */
function buildSystemPrompt(state: GameStateSnapshot, cubeMap: { formatCube: (h3: string) => string }): string {
  const opponentUnits = state.units.filter((u) => u.player === 'opponent');
  const humanUnits = state.units.filter((u) => u.player === 'human');
  const fmt = cubeMap.formatCube;
  const unitLines = opponentUnits.map((u) => {
    const dests = getValidDestinations(u, state);
    const destStr = dests.length ? dests.map((h) => fmt(h)).join(', ') : 'none (no valid hex)';
    const base = `${u.id} (${u.unitType}) at ${fmt(u.h3Index)} can move to: ${destStr}`;
    const pursuit = getPursuitSuggestion(u, state);
    if (pursuit) {
      return `${base}. Pursuit: move to ${fmt(pursuit.toH3Index)} to close on ${pursuit.nearestHumanId} (${pursuit.distanceHexes} hexes away).`;
    }
    return base;
  });
  const rangedLines = opponentUnits
    .filter((u) => getRange(u.unitType) >= 1)
    .map((u) => {
      const targets = getValidRangedTargets(u, state);
      const targetStr = targets.length ? targets.map((h) => fmt(h)).join(', ') : 'none';
      return `${u.id} (${u.unitType}, range ${getRange(u.unitType)}) can ranged-attack: ${targetStr}`;
    });
  const rangedBlock =
    rangedLines.length > 0
      ? `\nRanged attacks (optional): Armor has range 1, naval has range 2. You may declare a target hex (enemy, within range) per unit. Valid targets per unit:\n${rangedLines.join('\n')}\n`
      : '';

  const unitTypes: Array<'infantry' | 'armor' | 'naval'> = ['infantry', 'armor', 'naval'];
  const combatSummary = unitTypes
    .map(
      (t) =>
        `${t}: ${getAttack(t)} attack / ${getDefense(t)} defense${getRange(t) >= 1 ? `, range ${getRange(t)}` : ', melee only'}`
    )
    .join('; ');

  return `You are the opponent in a WEGO (simultaneous movement) hex wargame. Current turn: ${state.turnNumber}, phase: ${state.phase}. Your objective is to destroy all human units. Move toward human units to get in ranged or melee range; do not stay passive. When a "Pursuit" suggestion is given, prefer that move to close on the enemy unless you have a better strategic or tactical reason (e.g. already in range to fire).

${CUBE_PREAMBLE}

Combat: each unit rolls d6 when attacking (hit if roll ≤ attack) or when defending (hit if roll ≤ defender's defense). Higher values are better. Unit stats — ${combatSummary}.

Here are your units, their positions as (i, j, k), and the positions they can move to (Pursuit = suggested hex to close on a human unit):
${unitLines.join('\n')}
${rangedBlock}
Human units: ${humanUnits.map((u) => `${u.id} at ${fmt(u.h3Index)}`).join('; ')}.

Respond with a JSON object: { "strategy": "<one-line explanation of what you are focusing on or trying to accomplish this turn>", "movementOrders": [ { "unitId": "<id>", "toCube": [i, j, k] }, ... ], "rangedAttacks": [ { "unitId": "<id>", "targetCube": [i, j, k] }, ... ] }. Use cube coordinates: "toCube" and "targetCube" are arrays of three integers [i, j, k] with i + j + k = 0. Include "strategy": a single short sentence. Both arrays optional. movementOrders: one per unit from "can move to". rangedAttacks: only for units with range (armor, naval); use only "can ranged-attack" targets. Example: {"strategy":"Advancing toward human units to set up ranged fire.","movementOrders":[{"unitId":"opponent-armor-1","toCube":[1,0,-1]}],"rangedAttacks":[{"unitId":"opponent-armor-1","targetCube":[2,-1,-1]}]}.`;
}

/**
 * Builds the system prompt using raw H3 indices (fallback when cube coordinates are not available, e.g. map too large for localIj).
 */
function buildSystemPromptLegacy(state: GameStateSnapshot): string {
  const opponentUnits = state.units.filter((u) => u.player === 'opponent');
  const humanUnits = state.units.filter((u) => u.player === 'human');
  const unitLines = opponentUnits.map((u) => {
    const dests = getValidDestinations(u, state);
    const base = `${u.id} (${u.unitType}) at ${u.h3Index} can move to: ${dests.length ? dests.join(', ') : 'none (no valid hex)'}`;
    const pursuit = getPursuitSuggestion(u, state);
    if (pursuit) {
      return `${base}. Pursuit: move to ${pursuit.toH3Index} to close on ${pursuit.nearestHumanId} (${pursuit.distanceHexes} hexes away).`;
    }
    return base;
  });
  const rangedLines = opponentUnits
    .filter((u) => getRange(u.unitType) >= 1)
    .map((u) => {
      const targets = getValidRangedTargets(u, state);
      return `${u.id} (${u.unitType}, range ${getRange(u.unitType)}) can ranged-attack: ${targets.length ? targets.join(', ') : 'none'}`;
    });
  const rangedBlock =
    rangedLines.length > 0
      ? `\nRanged attacks (optional): Armor has range 1, naval has range 2. Valid targets per unit:\n${rangedLines.join('\n')}\n`
      : '';

  const unitTypes: Array<'infantry' | 'armor' | 'naval'> = ['infantry', 'armor', 'naval'];
  const combatSummary = unitTypes
    .map(
      (t) =>
        `${t}: ${getAttack(t)} attack / ${getDefense(t)} defense${getRange(t) >= 1 ? `, range ${getRange(t)}` : ', melee only'}`
    )
    .join('; ');

  return `You are the opponent in a WEGO (simultaneous movement) hex wargame. Current turn: ${state.turnNumber}, phase: ${state.phase}. Your objective is to destroy all human units. Move toward human units to get in ranged or melee range.

Combat: each unit rolls d6 when attacking (hit if roll ≤ attack) or when defending (hit if roll ≤ defender's defense). Higher values are better. Unit stats — ${combatSummary}.

Hex positions below use H3 hex IDs (opaque strings). Copy them exactly from the lists; do not modify or invent IDs.

Here are your units, their H3 hex positions, and the H3 positions they can move to (Pursuit = suggested hex to close on a human unit):
${unitLines.join('\n')}
${rangedBlock}
Human units: ${humanUnits.map((u) => `${u.id} at ${u.h3Index}`).join('; ')}.

Respond with a JSON object: { "strategy": "<one-line explanation>", "movementOrders": [ { "unitId": "<id>", "toH3Index": "<exact H3 from can move to>" }, ... ], "rangedAttacks": [ { "unitId": "<id>", "targetH3Index": "<exact H3 from can ranged-attack>" }, ... ] }. Include "strategy". Use only valid H3 indices from the lists above — copy the exact string. Example: {"strategy":"Advancing toward human units.","movementOrders":[{"unitId":"opponent-armor-1","toH3Index":"821c07fffffffff"}],"rangedAttacks":[]}.`;
}

export interface RequestOrdersResult {
  success: true;
  orders: { unitId: string; toH3Index: string }[];
  rangedAttacks?: { unitId: string; targetH3Index: string }[];
  strategy?: string;
  dropped?: number;
  dropReasons?: string[];
}
export interface RequestOrdersError {
  success: false;
  error: string;
}

/**
 * Requests movement orders from the LLM for the opponent. Validates each order;
 * drops invalid ones and applies the rest. Logs the decision and any dropped orders.
 * Returns validated orders or an error. Never logs the API key.
 */
export async function requestOrders(
  state: GameStateSnapshot,
  modelId: string
): Promise<RequestOrdersResult | RequestOrdersError> {
  logDebug('openRouter requestOrders', { modelId, turnNumber: state.turnNumber });
  const key = loadKey();
  if (!key) {
    logError('openRouter requestOrders: no API key');
    return { success: false, error: 'No API key set' };
  }
  if (!modelId.trim()) {
    logError('openRouter requestOrders: no model selected');
    return { success: false, error: 'No model selected' };
  }

  const cubeMap = buildCubeMap(state);
  const useCube =
    state.hexes.length > 0 && cubeMap.cubeToH3.size === state.hexes.length;
  const systemPrompt = useCube ? buildSystemPrompt(state, cubeMap) : buildSystemPromptLegacy(state);
  const userMessage = useCube
    ? `Return a JSON object with "strategy" (one-line explanation of your focus or goal this turn), "movementOrders" (array of { unitId, toCube: [i, j, k] }), and optional "rangedAttacks" (array of { unitId, targetCube: [i, j, k] }). Use cube coordinates from the lists above. Only valid moves and valid ranged targets.`
    : `Return a JSON object with "strategy" (one-line explanation), "movementOrders" (array of { unitId, toH3Index }), and optional "rangedAttacks" (array of { unitId, targetH3Index }). Only valid H3 indices from the lists above.`;

  console.log('[LLM prompt (system)]', systemPrompt);
  console.log('[LLM prompt (user)]', userMessage);

  try {
    const res = await fetch(OPENROUTER_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        max_tokens: 2048,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      logError('openRouter requestOrders: API error', res.status, text.slice(0, 200));
      return { success: false, error: res.status === 401 ? 'Invalid API key' : `API error: ${res.status}` };
    }

    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      logError('openRouter requestOrders: no content in response');
      return { success: false, error: 'Invalid response: no content' };
    }

    const parsed = parseOrdersResponse(content, cubeMap.cubeToH3);
    if (!parsed) {
      logError('openRouter requestOrders: failed to parse JSON', content.slice(0, 300));
      return { success: false, error: 'Invalid response: could not parse orders' };
    }

    const validated: { unitId: string; toH3Index: string }[] = [];
    const dropReasons: string[] = [];
    const seenUnits = new Set<string>();

    for (const order of parsed.movementOrders) {
      if (seenUnits.has(order.unitId)) {
        dropReasons.push(`Duplicate order for ${order.unitId}`);
        continue;
      }
      const result = validateAiOrder(order, state);
      if (result.valid) {
        validated.push(order);
        seenUnits.add(order.unitId);
      } else {
        dropReasons.push(`${order.unitId} → ${order.toH3Index}: ${result.reason}`);
      }
    }

    const validatedRanged: { unitId: string; targetH3Index: string }[] = [];
    const seenRanged = new Set<string>();
    for (const r of parsed.rangedAttacks) {
      if (seenRanged.has(r.unitId)) {
        dropReasons.push(`Duplicate ranged for ${r.unitId}`);
        continue;
      }
      const result = validateAiRangedOrder(r, state);
      if (result.valid) {
        validatedRanged.push(r);
        seenRanged.add(r.unitId);
      } else {
        dropReasons.push(`Ranged ${r.unitId} → ${r.targetH3Index}: ${result.reason}`);
      }
    }

    if (dropReasons.length > 0) {
      logDebug('openRouter requestOrders: dropped invalid orders', {
        dropped: dropReasons.length,
        reasons: dropReasons,
      });
    }

    return {
      success: true,
      orders: validated,
      rangedAttacks: validatedRanged.length > 0 ? validatedRanged : undefined,
      strategy: parsed.strategy,
      dropped: dropReasons.length,
      dropReasons: dropReasons.length > 0 ? dropReasons : undefined,
    };
  } catch (err) {
    logError('openRouter requestOrders: exception', err);
    return { success: false, error: String(err) };
  }
}

/**
 * Parses the LLM response into movement orders and optional ranged attacks.
 * Accepts toCube: [i,j,k] or legacy toH3Index; resolves cube to h3Index via cubeToH3.
 */
function parseOrdersResponse(
  content: string,
  cubeToH3: Map<string, string>
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
  try {
    const parsed = JSON.parse(jsonStr) as unknown;
    if (Array.isArray(parsed)) {
      const movementOrders = parseOrdersArray(parsed, cubeToH3);
      return { movementOrders, rangedAttacks: [] };
    }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const obj = parsed as { movementOrders?: unknown; rangedAttacks?: unknown; strategy?: unknown };
      const movementOrders = Array.isArray(obj.movementOrders) ? parseOrdersArray(obj.movementOrders, cubeToH3) : [];
      const rangedAttacks = Array.isArray(obj.rangedAttacks) ? parseRangedArray(obj.rangedAttacks, cubeToH3) : [];
      const strategy = typeof obj.strategy === 'string' && obj.strategy.trim() ? obj.strategy.trim() : undefined;
      return { movementOrders, rangedAttacks, strategy };
    }
    return null;
  } catch {
    const repaired = repairTruncatedOrdersJson(trimmed);
    if (repaired.length > 0) return { movementOrders: repaired, rangedAttacks: [] };
    return null;
  }
}

function parseOrdersArray(arr: unknown[], cubeToH3: Map<string, string>): { unitId: string; toH3Index: string }[] {
  const orders: { unitId: string; toH3Index: string }[] = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object' || typeof (item as { unitId?: unknown }).unitId !== 'string') continue;
    const o = item as { unitId: string; toCube?: unknown; toH3Index?: unknown };
    let toH3Index: string | undefined;
    if (Array.isArray(o.toCube) && o.toCube.length === 3 && o.toCube.every((n) => typeof n === 'number')) {
      const key = cubeKey([o.toCube[0], o.toCube[1], o.toCube[2]]);
      toH3Index = cubeToH3.get(key);
    }
    if (!toH3Index && typeof o.toH3Index === 'string') toH3Index = o.toH3Index;
    if (toH3Index) orders.push({ unitId: o.unitId, toH3Index });
  }
  return orders;
}

function parseRangedArray(arr: unknown[], cubeToH3: Map<string, string>): { unitId: string; targetH3Index: string }[] {
  const orders: { unitId: string; targetH3Index: string }[] = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object' || typeof (item as { unitId?: unknown }).unitId !== 'string') continue;
    const o = item as { unitId: string; targetCube?: unknown; targetH3Index?: unknown };
    let targetH3Index: string | undefined;
    if (Array.isArray(o.targetCube) && o.targetCube.length === 3 && o.targetCube.every((n) => typeof n === 'number')) {
      const key = cubeKey([o.targetCube[0], o.targetCube[1], o.targetCube[2]]);
      targetH3Index = cubeToH3.get(key);
    }
    if (!targetH3Index && typeof o.targetH3Index === 'string') targetH3Index = o.targetH3Index;
    if (targetH3Index) orders.push({ unitId: o.unitId, targetH3Index });
  }
  return orders;
}

/**
 * When the LLM response is truncated (no closing ]), extract complete {"unitId","toH3Index"} objects.
 * Used as fallback so we can still apply partial orders instead of failing the whole turn.
 */
function repairTruncatedOrdersJson(trimmed: string): { unitId: string; toH3Index: string }[] {
  const orders: { unitId: string; toH3Index: string }[] = [];
  const block = trimmed.replace(/^```(?:json)?\s*/i, '').trim();
  const re = /\{\s*"unitId"\s*:\s*"([^"]+)"\s*,\s*"toH3Index"\s*:\s*"([^"]+)"\s*\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    orders.push({ unitId: m[1], toH3Index: m[2] });
  }
  return orders;
}
