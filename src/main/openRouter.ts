/**
 * OpenRouter integration: API key storage, list models, and request AI movement orders.
 * All key handling is in the main process; the key is never logged or sent to the renderer in plain form.
 */

import * as fs from 'fs';
import * as path from 'path';
import { app, safeStorage } from 'electron';
import { gridDistance } from 'h3-js';
import { getAttack, getDefense, getRange } from './combatConstants';
import { logDebug, logError } from './logger';
import type { GameStateSnapshot } from './gameDb';
import { buildAxialCoordinateMap } from './mapData';

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
    if (dist < 1) return { valid: false, reason: 'Destination must be different from current hex' };
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

/** Preamble for [x, y] axial coordinates: origin, neighbors, distance, and axis direction for LLM-friendly reasoning. */
const XY_PREAMBLE = `Positions use [x, y] coordinates. [0, 0] is the map center. x increases to the right, y increases toward the top-right.
Neighbors: from [x, y] you can move to [x±1, y], [x, y±1], [x±1, y∓1] — six hexes.
Distance: hex distance between [x1, y1] and [x2, y2] is max(|x2−x1|, |y2−y1|). Use only [x, y] from the unit and target lists below; do not invent coordinates.

Response format: You must reply with movementOrders and rangedAttacks using only toXY and targetXY. Each is an array of two integers [x, y]. Do not use toH3Index, targetH3Index, or any hex/string IDs — only [x, y] arrays.`;

/**
 * Builds the system prompt using [x, y] axial coordinates. Origin [0,0] at map center; neighbors and distance rules in preamble.
 * Only includes hexes that have [x, y] in the axial map so the prompt never contains H3 indices.
 */
function buildSystemPromptXY(
  state: GameStateSnapshot,
  xyMap: { xyByH3: Map<string, [number, number]>; formatXY: (h3: string) => string }
): string {
  const { xyByH3 } = xyMap;
  const fmt = xyMap.formatXY;
  const opponentUnits = state.units
    .filter((u) => u.player === 'opponent' && xyByH3.has(u.h3Index));
  const humanUnits = state.units
    .filter((u) => u.player === 'human' && xyByH3.has(u.h3Index));

  const unitLines = opponentUnits.map((u) => {
    const dests = getValidDestinations(u, state).filter((h) => xyByH3.has(h));
    const destStr = dests.length ? dests.map((h) => fmt(h)).join(', ') : 'none (no valid hex)';
    const base = `${u.id} (${u.unitType}) at ${fmt(u.h3Index)} can move to: ${destStr}`;
    const pursuit = getPursuitSuggestion(u, state);
    if (pursuit && xyByH3.has(pursuit.toH3Index)) {
      return `${base}. Pursuit: move to ${fmt(pursuit.toH3Index)} to close on ${pursuit.nearestHumanId} (${pursuit.distanceHexes} hexes away).`;
    }
    return base;
  });
  const rangedLines = opponentUnits
    .filter((u) => getRange(u.unitType) >= 1)
    .map((u) => {
      const targets = getValidRangedTargets(u, state).filter((h) => xyByH3.has(h));
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

  const humanList = humanUnits.map((u) => `${u.id} at ${fmt(u.h3Index)}`).join('; ');

  return `You are the opponent in a WEGO (simultaneous movement) hex wargame. Current turn: ${state.turnNumber}, phase: ${state.phase}. Your objective is to destroy all human units. Move toward human units to get in ranged or melee range; do not stay passive. When a "Pursuit" suggestion is given, prefer that move to close on the enemy unless you have a better strategic or tactical reason (e.g. already in range to fire).

${XY_PREAMBLE}

Combat: each unit rolls d6 when attacking (hit if roll ≤ attack) or when defending (hit if roll ≤ defender's defense). Higher values are better. Unit stats — ${combatSummary}.

Here are your units, their positions as [x, y], and the positions they can move to (Pursuit = suggested hex to close on a human unit):
${unitLines.join('\n')}
${rangedBlock}
Human units: ${humanList || 'none'}.

Respond with a JSON object: { "strategy": "<one-line explanation>", "movementOrders": [ { "unitId": "<id>", "toXY": [x, y] }, ... ], "rangedAttacks": [ { "unitId": "<id>", "targetXY": [x, y] }, ... ] }. Use only toXY and targetXY — each must be an array of exactly two integers [x, y]. Do not use toH3Index or targetH3Index or any string hex IDs. Include "strategy". movementOrders: issue one order for each of your units that has valid moves (so multiple units move each turn). rangedAttacks: one per unit with range if it has a valid target. Example: {"strategy":"Advancing toward human units.","movementOrders":[{"unitId":"opponent-armor-1","toXY":[1,0]},{"unitId":"opponent-infantry-1","toXY":[0,1]}],"rangedAttacks":[]}.`;
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

  const { xyByH3, h3ByXY } = buildAxialCoordinateMap();
  const formatXY = (h3: string): string => {
    const xy = xyByH3.get(h3);
    return xy ? `[${xy[0]}, ${xy[1]}]` : h3;
  };
  const xyMap = { xyByH3, formatXY };
  if (state.hexes.length > 0 && !state.hexes.every((h) => xyByH3.has(h.h3Index))) {
    logDebug('openRouter requestOrders: some hexes missing from axial map; listing only hexes with [x,y]');
  }

  const systemPrompt = buildSystemPromptXY(state, xyMap);
  const userMessage = `Return JSON with "strategy", "movementOrders" (array of { unitId, toXY: [x, y] }), and optional "rangedAttacks". Use only [x, y] arrays for toXY and targetXY. Issue one movement order per unit that has valid moves (move all your units that can move). Only [x, y] from the lists above.`;

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
    console.log('[LLM response]', content);

    const parsed = parseOrdersResponse(content, h3ByXY);
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
 * Expects toXY: [x, y] and targetXY: [x, y]; resolves to H3 via h3ByXY.
 */
function parseOrdersResponse(
  content: string,
  h3ByXY: Map<string, string>
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
      const movementOrders = parseOrdersArray(parsed, h3ByXY);
      return { movementOrders, rangedAttacks: [] };
    }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const obj = parsed as { movementOrders?: unknown; rangedAttacks?: unknown; strategy?: unknown };
      const movementOrders = Array.isArray(obj.movementOrders) ? parseOrdersArray(obj.movementOrders, h3ByXY) : [];
      const rangedAttacks = Array.isArray(obj.rangedAttacks) ? parseRangedArray(obj.rangedAttacks, h3ByXY) : [];
      const strategy = typeof obj.strategy === 'string' && obj.strategy.trim() ? obj.strategy.trim() : undefined;
      return { movementOrders, rangedAttacks, strategy };
    }
    return null;
  } catch {
    return null;
  }
}

function xyKeyFromArr(arr: number[]): string {
  return arr.length >= 2 && arr.every((n) => typeof n === 'number') ? `${arr[0]},${arr[1]}` : '';
}

function parseOrdersArray(arr: unknown[], h3ByXY: Map<string, string>): { unitId: string; toH3Index: string }[] {
  const orders: { unitId: string; toH3Index: string }[] = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object' || typeof (item as { unitId?: unknown }).unitId !== 'string') continue;
    const o = item as { unitId: string; toXY?: unknown; toH3Index?: unknown };
    if (o.toH3Index != null) continue;
    let toH3Index: string | undefined;
    if (Array.isArray(o.toXY) && o.toXY.length >= 2 && o.toXY.every((n) => typeof n === 'number')) {
      const key = xyKeyFromArr(o.toXY);
      if (key) toH3Index = h3ByXY.get(key);
    }
    if (toH3Index) orders.push({ unitId: o.unitId, toH3Index });
  }
  return orders;
}

function parseRangedArray(arr: unknown[], h3ByXY: Map<string, string>): { unitId: string; targetH3Index: string }[] {
  const orders: { unitId: string; targetH3Index: string }[] = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object' || typeof (item as { unitId?: unknown }).unitId !== 'string') continue;
    const o = item as { unitId: string; targetXY?: unknown; targetH3Index?: unknown };
    if (o.targetH3Index != null) continue;
    let targetH3Index: string | undefined;
    if (Array.isArray(o.targetXY) && o.targetXY.length >= 2 && o.targetXY.every((n) => typeof n === 'number')) {
      const key = xyKeyFromArr(o.targetXY);
      if (key) targetH3Index = h3ByXY.get(key);
    }
    if (targetH3Index) orders.push({ unitId: o.unitId, targetH3Index });
  }
  return orders;
}

