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
import { setAiToolLimitExceededLastTurn, getAndClearAiToolLimitExceededLastTurn } from './gameDb';
import { buildLatLngCoordinateMap } from './mapData';
import { executeTool1 } from './tools/tool1Pathfinding';
import { executeTool2, TOOL2_NAMES } from './tools/tool2Assessment';
import { executeTool3, TOOL3_NAMES } from './tools/tool3CombatEstimation';

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

/** Formats [lat, lng] for the prompt (a few decimal places). */
function formatLatLng(ll: [number, number]): string {
  return `[${ll[0].toFixed(6)}, ${ll[1].toFixed(6)}]`;
}

/**
 * Builds the system prompt for the tool-calling flow: unit roster (ID, type, position [lat, lng]) for both sides,
 * turn number, objective, combat summary, and tool descriptions. No per-unit move lists; movement planning is done via plan_route and check_distance.
 * Injects a one-time warning if the previous turn exceeded the tool-call limit.
 */
function buildSystemPromptForTools(
  state: GameStateSnapshot,
  coordMap: { latLngByH3: Map<string, [number, number]>; format: (h3: string) => string }
): string {
  const { latLngByH3, format } = coordMap;
  const opponentUnits = state.units.filter((u) => u.player === 'opponent');
  const humanUnits = state.units.filter((u) => u.player === 'human');

  const warning = getAndClearAiToolLimitExceededLastTurn()
    ? '\n\nWARNING: Last turn\'s planning exceeded the tool-call limit (10 rounds). You submitted no explicit orders. Ensure you submit your final orders JSON promptly after gathering the information you need.\n'
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

  return `You are the opponent in a WEGO (simultaneous movement) hex wargame. Current turn: ${state.turnNumber}, phase: ${state.phase}. Your objective is to destroy all human units. Move toward human units to get in ranged or melee range; do not stay passive.
${warning}
${LATLNG_PREAMBLE}

Combat: each unit rolls d6 when attacking (hit if roll <= attack) or when defending (hit if roll <= defender's defense). Unit stats: ${combatSummary}. Ranged attacks are resolved using each unit's current position (before movement). Only issue a ranged attack if that unit is already within range of the target hex at the start of this turn; do not assume movement happens first. If a unit is moving this turn and would only be in range after the move, do not add a ranged attack for it this turn (it can fire next turn from its new position). Each unit may declare at most one ranged attack per turn: include each attacking unit at most once in rangedAttacks; if a unit can attack multiple enemies, choose one target (e.g. use estimate_combat to pick the best). Naval units can attack land units (they have range 2 and can target coastal or nearby hexes). To use naval fire effectively, get your naval units as close as possible to enemy land units, as soon as possible. Naval units move only on water. To move a naval unit toward a land target, call plan_route with that land unit's position as the destination; the tool will route to the nearest water hex to that position. When assess_unit reports canAttackThisTurn with attackType "ranged" for an enemy, issue a rangedAttack using that enemy's position as targetXY so your unit fires this turn.

=== AVAILABLE TOOLS ===
Use these tools for movement planning before submitting orders. You may use multiple rounds of tool calls and mix tool types (e.g. assess one unit, then plan_route for it, then assess another) if that helps.
1. plan_route(unitId, destination, options?) - Compute the optimal path for a unit to a destination hex. Returns multi-turn route and orderToXY: the exact [lat, lng] for this turn's movement order (copy this into toXY for that unit). For naval units, you may pass a land unit's [lat, lng] as destination; the route will be to the nearest water hex to that position so the naval can get in range.
2. check_distance(from, to, unitType) - Quick distance and turn estimate between two hexes. Use to compare options before requesting full routes.
3. assess_unit(unitId, radius?) - Tactical briefing on one of your units: nearby enemies and friendlies, threats, and what you can attack this turn.
4. assess_hex(position, forUnitType?) - Intelligence on a hex: terrain, units present, units in range, chokepoint analysis.
5. estimate_combat(engagementType, attackers, targetHex, defenders?) - Predict the outcome of a ranged or melee engagement. Returns win probability, expected casualties, and a tactical assessment. Always check before committing to an attack.

Your units (ID, type, position [lat, lng]): ${opponentRoster || 'none'}
Human units: ${humanRoster || 'none'}

Submit your final orders as a JSON object only (valid JSON, no comments): { "strategy": "<one-line explanation>", "movementOrders": [ { "unitId": "<id>", "toXY": [lat, lng] }, ... ], "rangedAttacks": [ { "unitId": "<id>", "targetXY": [lat, lng] }, ... ] }. Use only toXY and targetXY as [lat, lng] arrays. Include "strategy". For each movement order: use the exact orderToXY from that unit's plan_route result as toXY (copy the two numbers exactly); do not round, interpolate, or invent coordinates or the order will be rejected. In rangedAttacks, list each unit at most once (one ranged attack per unit per turn); duplicate unitIds are dropped.`;
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

/** OpenAI-compatible tool definition for OpenRouter. */
interface ToolDef {
  type: 'function';
  function: { name: string; description: string; parameters: { type: 'object'; properties: Record<string, unknown>; required?: string[] } };
}

/**
 * Returns the Tool 1 (pathfinding) tool definitions for the OpenRouter request.
 * Used so the model can call plan_route and check_distance before submitting orders.
 */
function buildToolDefinitions(): ToolDef[] {
  return [
    {
      type: 'function',
      function: {
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
      },
    },
    {
      type: 'function',
      function: {
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
      },
    },
    {
      type: 'function',
      function: {
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
      },
    },
    {
      type: 'function',
      function: {
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
      },
    },
    {
      type: 'function',
      function: {
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
      },
    },
  ];
}

/** Message type for the chat API (system, user, assistant, or tool). */
type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> }
  | { role: 'tool'; tool_call_id: string; content: string };

const MAX_TOOL_ITERATIONS = 10;

/**
 * Requests movement orders from the LLM for the opponent. Uses the tool-calling loop:
 * send prompt and tool definitions; if the model returns tool_calls, execute tools locally,
 * append results, and resend until the model returns final order JSON or the iteration limit (10) is reached.
 * Validates and drops invalid orders. Never logs the API key.
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

  const hexList = state.hexes.map((h) => h.h3Index);
  const { latLngByH3, resolveToH3 } = buildLatLngCoordinateMap(hexList);
  const coordMap = {
    latLngByH3,
    format: (h3: string) => {
      const ll = latLngByH3.get(h3);
      return ll ? formatLatLng(ll) : h3;
    },
  };

  const systemPrompt = buildSystemPromptForTools(state, coordMap);
  const userMessage = `Use the tools as needed to plan movement, then submit your final orders as a single JSON object: { "strategy": "...", "movementOrders": [...], "rangedAttacks": [...] }. For each movement order, set toXY to the exact orderToXY from that unit's plan_route result (copy the numbers exactly).`;

  const tools = buildToolDefinitions();
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];

  logDebug('openRouter requestOrders: system prompt', systemPrompt);
  logDebug('openRouter requestOrders: user message', userMessage);
  logDebug('openRouter requestOrders: starting tool loop', { turnNumber: state.turnNumber });

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

      const res = await fetch(OPENROUTER_CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        logError('openRouter requestOrders: API error', res.status, text.slice(0, 200));
        return { success: false, error: res.status === 401 ? 'Invalid API key' : `API error: ${res.status}` };
      }

      const json = (await res.json()) as {
        choices?: Array<{
          message?: {
            content?: string | null;
            tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
          };
        }>;
      };
      const assistantMessage = json.choices?.[0]?.message;
      if (!assistantMessage) {
        logError('openRouter requestOrders: no message in response');
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
          let args: unknown;
          try {
            args = JSON.parse(tc.function.arguments || '{}');
          } catch (err) {
            logError('openRouter requestOrders: tool arguments parse error', tc.function.name, err);
            args = {};
          }
          const toolName = tc.function.name;
          const result = (TOOL3_NAMES as readonly string[]).includes(toolName)
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
        }
        continue;
      }

      const content = assistantMessage.content;
      if (typeof content !== 'string' || !content.trim()) {
        logError('openRouter requestOrders: no content in final response');
        return { success: false, error: 'Invalid response: no content' };
      }

      logDebug('openRouter requestOrders: assistant response (final)', content);
      const parsed = parseOrdersResponse(content, resolveToH3);
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
    }

    logError('openRouter requestOrders: exceeded tool-call limit', MAX_TOOL_ITERATIONS, state.turnNumber);
    setAiToolLimitExceededLastTurn();
    return {
      success: true,
      orders: [],
      dropped: 0,
    };
  } catch (err) {
    logError('openRouter requestOrders: exception', err);
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
    if (Array.isArray(o.toXY) && o.toXY.length >= 2 && o.toXY.every((n) => typeof n === 'number')) {
      toH3Index = resolveToH3(Number(o.toXY[0]), Number(o.toXY[1]));
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
    if (Array.isArray(o.targetXY) && o.targetXY.length >= 2 && o.targetXY.every((n) => typeof n === 'number')) {
      targetH3Index = resolveToH3(Number(o.targetXY[0]), Number(o.targetXY[1]));
    }
    if (targetH3Index) orders.push({ unitId: o.unitId, targetH3Index });
  }
  return orders;
}

