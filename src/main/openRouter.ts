/**
 * OpenRouter integration: API key storage, list models, and request AI movement orders.
 * All key handling is in the main process; the key is never logged or sent to the renderer in plain form.
 */

import * as fs from 'fs';
import * as path from 'path';
import { app, safeStorage } from 'electron';
import { gridDistance } from 'h3-js';
import { logDebug, logError } from './logger';
import type { GameStateSnapshot } from './gameDb';

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

const MOVEMENT_RANGE: Record<string, number> = {
  infantry: 1,
  armor: 2,
  naval: 1,
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
 * Builds the system prompt for the LLM: game rules, map summary, opponent units with valid destinations, and required JSON format.
 * Including valid toH3Index per unit so the LLM only picks in-range hexes.
 */
function buildSystemPrompt(state: GameStateSnapshot): string {
  const opponentUnits = state.units.filter((u) => u.player === 'opponent');
  const humanUnits = state.units.filter((u) => u.player === 'human');
  const unitLines = opponentUnits.map((u) => {
    const dests = getValidDestinations(u, state);
    return `${u.id} (${u.unitType}) at ${u.h3Index} can move to: ${dests.length ? dests.join(', ') : 'none (no valid hex)'}`;
  });
  return `You are the opponent in a WEGO (simultaneous movement) hex wargame. Current turn: ${state.turnNumber}, phase: ${state.phase}.

Your units — use ONLY these toH3Index values (each unit can move only to the listed hexes):
${unitLines.join('\n')}

Human units: ${humanUnits.map((u) => `${u.id} at ${u.h3Index}`).join('; ')}.

Respond with a JSON array of movement orders only. Each order: { "unitId": "<unit id>", "toH3Index": "<h3 index from that unit's list above>" }. One order per unit. Pick only from the "can move to" list for each unit. Example: [{"unitId":"opponent-infantry-1","toH3Index":"821c07fffffffff"}].`;
}

export interface RequestOrdersResult {
  success: true;
  orders: { unitId: string; toH3Index: string }[];
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

  const systemPrompt = buildSystemPrompt(state);
  const userMessage = `Return a JSON array of movement orders for your units this turn. Only valid moves. Format: [{"unitId":"...","toH3Index":"..."}]`;

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

    const parsed = parseOrdersJson(content);
    if (!parsed) {
      logError('openRouter requestOrders: failed to parse JSON', content.slice(0, 300));
      return { success: false, error: 'Invalid response: could not parse orders' };
    }

    const validated: { unitId: string; toH3Index: string }[] = [];
    const dropReasons: string[] = [];
    const seenUnits = new Set<string>();

    for (const order of parsed) {
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

    if (dropReasons.length > 0) {
      logDebug('openRouter requestOrders: dropped invalid orders', {
        dropped: dropReasons.length,
        reasons: dropReasons,
      });
    }

    return {
      success: true,
      orders: validated,
      dropped: dropReasons.length,
      dropReasons: dropReasons.length > 0 ? dropReasons : undefined,
    };
  } catch (err) {
    logError('openRouter requestOrders: exception', err);
    return { success: false, error: String(err) };
  }
}

/**
 * Tries to extract a JSON array of { unitId, toH3Index } from LLM response (may be wrapped in markdown).
 */
function parseOrdersJson(content: string): { unitId: string; toH3Index: string }[] | null {
  const trimmed = content.trim();
  let jsonStr = trimmed;
  // #region agent log
  const hasClosingBracket = trimmed.includes(']');
  const hasClosingCodeBlock = /```\s*$/.test(trimmed) || trimmed.split('```').length >= 3;
  fetch('http://127.0.0.1:7290/ingest/870e72e6-57a6-475f-b192-9cde676f76b4', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'f6f7e5' }, body: JSON.stringify({ sessionId: 'f6f7e5', location: 'openRouter.ts:parseOrdersJson', message: 'parseOrdersJson entry', data: { contentLen: content.length, trimmedLen: trimmed.length, hasClosingBracket, hasClosingCodeBlock, head: trimmed.slice(0, 120) }, timestamp: Date.now(), hypothesisId: 'A' }) }).catch(() => {});
  // #endregion
  const codeBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) jsonStr = codeBlock[1].trim();
  const arrayMatch = trimmed.match(/\[\s*[\s\S]*\s*\]/);
  if (arrayMatch) jsonStr = arrayMatch[0];
  // #region agent log
  fetch('http://127.0.0.1:7290/ingest/870e72e6-57a6-475f-b192-9cde676f76b4', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'f6f7e5' }, body: JSON.stringify({ sessionId: 'f6f7e5', location: 'openRouter.ts:parseOrdersJson', message: 'after extraction', data: { usedCodeBlock: !!codeBlock, usedArrayMatch: !!arrayMatch, jsonStrLen: jsonStr.length, jsonStrTail: jsonStr.slice(-80) }, timestamp: Date.now(), hypothesisId: 'B' }) }).catch(() => {});
  // #endregion
  try {
    const arr = JSON.parse(jsonStr) as unknown;
    if (!Array.isArray(arr)) return null;
    const orders: { unitId: string; toH3Index: string }[] = [];
    for (const item of arr) {
      if (item && typeof item === 'object' && typeof (item as { unitId?: unknown }).unitId === 'string' && typeof (item as { toH3Index?: unknown }).toH3Index === 'string') {
        orders.push({
          unitId: (item as { unitId: string }).unitId,
          toH3Index: (item as { toH3Index: string }).toH3Index,
        });
      }
    }
    return orders;
  } catch (err) {
    // #region agent log
    const e = err as Error;
    fetch('http://127.0.0.1:7290/ingest/870e72e6-57a6-475f-b192-9cde676f76b4', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'f6f7e5' }, body: JSON.stringify({ sessionId: 'f6f7e5', location: 'openRouter.ts:parseOrdersJson', message: 'parse catch', data: { parseError: e.message, jsonStrLen: jsonStr.length, jsonStrHead: jsonStr.slice(0, 100), jsonStrTail: jsonStr.slice(-100) }, timestamp: Date.now(), hypothesisId: 'E' }) }).catch(() => {});
    // #endregion
    const repaired = repairTruncatedOrdersJson(trimmed);
    if (repaired.length > 0) return repaired;
    return null;
  }
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
