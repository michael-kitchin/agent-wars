/**
 * Parses the assistant's final JSON contract (v3 orders[], air/ferry, callbacks, memory, production)
 * and normalizes coordinates to H3. Used by OpenRouter after tool rounds complete.
 */

import type { GameStateSnapshot } from '../gameDb';
import { logDebug, logError } from '../logger';
import type { CoordinateContext } from '../briefing/map/coordinateContext';
import { HEX_CODE_PATTERN } from '../briefing/map/coordinateContext';
import { codeToH3, codeToLatLngRounded } from '../briefing/map/hex-code-translator';
import type { CallbackSubscription } from '../callbackSubscriptions';
import type { LatLng } from '../tools/tool1Pathfinding';
import { executeTool5 } from '../tools/tool5StandingOrders';
import { executeTool6 } from '../tools/tool6Production';
import { normalizeProductionOrders } from '../productionOrders';
import type { AirStrikeOrder, AirStrikeTargetType, EmbarkOrder, FerryOrder } from '../../shared/ipcTypes';
import { clearEmbarkAssignmentForLandUnit, isEmbarkedLandUnit } from '../game-actions/sealift';
/**
 * Documents the `MemoryUpdateItem` interface as a named contract surface (export interface MemoryUpdateItem).

 * Purpose: Supports maintainability by documenting why `MemoryUpdateItem` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface MemoryUpdateItem {
    /**
   * Specifies the contract for the `action` member (action: 'write' | 'delete';).

   * Contract: Describes stable behavior for callers of `action` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
action: 'write' | 'delete';
    /**
   * Specifies the contract for the `key` member (key: string;).

   * Contract: Describes stable behavior for callers of `key` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
key: string;
    /**
   * Specifies the contract for the `content` member (content?: string;).

   * Contract: Describes stable behavior for callers of `content` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
content?: string;
    /**
   * Specifies the contract for the `tier` member (tier?: 'persistent' | 'stored';).

   * Contract: Describes stable behavior for callers of `tier` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
tier?: 'persistent' | 'stored';
}

/**
 * Defines the `stripJsonLikeComments` function shape (function stripJsonLikeComments(s: string): string).

 * Purpose: Supports maintainability by documenting why `stripJsonLikeComments` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
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
 * Extracts the first top-level `{ ... }` span from `s` starting at `startIndex`, respecting JSON string escapes so `}` inside strings does not end the object early.
 *
 * Purpose: LLM replies often include prose or trailing text; a greedy `\{[\s\S]*\}` slice can pull extra characters and break `JSON.parse`, or stop trying other candidates too early.
 * When to use: As the preferred substring for `JSON.parse` in `parseOrdersResponse` before falling back to the legacy greedy match.
 * Expected outcome: Returns a balanced brace object substring, or `null` if no complete object is found.
 * Exceptions: None; treats `"` strings per JSON (single-quoted strings are not skipped).
 */
function extractBalancedJsonObjectFrom(s: string, startIndex: number): string | null {
  const start = s.indexOf('{', startIndex);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i]!;
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (c === '\\') {
        escape = true;
        continue;
      }
      if (c === '"') {
        inString = false;
        continue;
      }
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Documents the module-scope binding `CALLBACK_EVENT_VOCAB` (CALLBACK_EVENT_VOCAB).

 * Purpose: Supports maintainability by documenting why `CALLBACK_EVENT_VOCAB` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const CALLBACK_EVENT_VOCAB = new Set([
  'turns',
  'unit_engaged',
  'unit_destroyed',
  'unit_arrived',
  'threat_escalation',
  'infrastructure_destroyed',
  'territory_changed',
]);

/**
 * Defines the `parseInfrastructureDestroyedCallbackArgs` function shape (function parseInfrastructureDestroyedCallbackArgs(arg: string): Record<string, unknown>).

 * Purpose: Supports maintainability by documenting why `parseInfrastructureDestroyedCallbackArgs` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function parseInfrastructureDestroyedCallbackArgs(arg: string): Record<string, unknown> {
  const pieces = arg.split(',').map((x) => x.trim()).filter((x) => x.length > 0);
  const first = pieces[0] ?? '';
  const second = pieces[1] ?? '';
  if (first === 'urban' || first === 'airport' || first === 'seaport') {
    return second ? { targetType: first, h3Index: second } : { targetType: first };
  }
  if (first) return { h3Index: first };
  return {};
}

/**
 * Defines the `parseCompactCallbackParams` function shape (function parseCompactCallbackParams(event: string, arg: string): Record<string, unknown> | null).

 * Purpose: Supports maintainability by documenting why `parseCompactCallbackParams` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function parseCompactCallbackParams(event: string, arg: string): Record<string, unknown> | null {
  if (event === 'turns') {
    const n = Number(arg);
    if (Number.isFinite(n) && n > 0) return { n: Math.floor(n) };
    return null;
  }
  if (event === 'unit_destroyed') return { side: arg };
  if (event === 'unit_engaged' || event === 'unit_arrived') return { unitId: arg };
  if (event === 'threat_escalation') return { unitId: arg };
  if (event === 'infrastructure_destroyed') return parseInfrastructureDestroyedCallbackArgs(arg);
  return {};
}

/**
 * Defines the `normalizeCallbacks` function shape (function normalizeCallbacks(raw: unknown): CallbackSubscription[]).

 * Purpose: Supports maintainability by documenting why `normalizeCallbacks` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function normalizeCallbacks(raw: unknown): CallbackSubscription[] {
  if (!Array.isArray(raw)) return [];
  const out: CallbackSubscription[] = [];
  for (const item of raw) {
    if (typeof item === 'string') {
      const text = item.trim();
      if (!text) continue;
      const parenMatch = text.match(/^([a-z_]+)\((.*)\)$/i);
      if (parenMatch) {
        const event = parenMatch[1]!.trim();
        const arg = parenMatch[2]!.trim();
        if (!CALLBACK_EVENT_VOCAB.has(event)) continue;
        const parsed = parseCompactCallbackParams(event, arg);
        if (parsed != null) out.push({ event, params: parsed });
        continue;
      }
      const colonMatch = text.match(/^([a-z_]+)\s*:\s*(.+)$/i);
      if (colonMatch) {
        const event = colonMatch[1]!.trim();
        const arg = colonMatch[2]!.trim();
        if (!CALLBACK_EVENT_VOCAB.has(event)) continue;
        const parsed = parseCompactCallbackParams(event, arg);
        if (parsed != null) out.push({ event, params: parsed });
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

/**
 * Defines the `normalizeMemoryUpdates` function shape (function normalizeMemoryUpdates(raw: unknown): MemoryUpdateItem[]).

 * Purpose: Supports maintainability by documenting why `normalizeMemoryUpdates` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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

/**
 * Defines the `buildJsonAssistantRepairSchema` function shape (export function buildJsonAssistantRepairSchema(includeProductionOrders: boolean): string).

 * Purpose: Supports maintainability by documenting why `buildJsonAssistantRepairSchema` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function buildJsonAssistantRepairSchema(includeProductionOrders: boolean): string {
  return includeProductionOrders
    ? `{"strategy":"...","orders":[{"unitId":"opponent-armor-1","action":"assign_order","order":{"type":"march","destination":"CF"}},{"unitId":"opponent-armor-1","action":"explicit_move","destination":"CG"},{"unitId":"opponent-armor-1","action":"ranged_attack","targetHexCode":"CH"},{"unitId":"opponent-armor-1","action":"cancel_order"}],"airStrikes":[{"unitId":"opponent-air-1","targetHexCode":"CI","targetType":"units"}],"ferryOrders":[{"unitId":"opponent-air-2","destination":"CJ"}],"callbacks":[],"memoryUpdates":[],"productionOrders":[{"action":"set_build_queue","hex":"CF","unitType":"infantry","count":1}]}`
    : `{"strategy":"...","orders":[{"unitId":"opponent-armor-1","action":"assign_order","order":{"type":"march","destination":"CF"}},{"unitId":"opponent-armor-1","action":"explicit_move","destination":"CG"},{"unitId":"opponent-armor-1","action":"ranged_attack","targetHexCode":"CH"},{"unitId":"opponent-armor-1","action":"cancel_order"}],"airStrikes":[{"unitId":"opponent-air-1","targetHexCode":"CI","targetType":"units"}],"ferryOrders":[{"unitId":"opponent-air-2","destination":"CJ"}],"callbacks":[],"memoryUpdates":[]}`;
}

/**
 * Defines the `hasNonEmptyLegacyTopLevel` function shape (function hasNonEmptyLegacyTopLevel(obj: Record<string, unknown>): boolean).

 * Purpose: Supports maintainability by documenting why `hasNonEmptyLegacyTopLevel` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function hasNonEmptyLegacyTopLevel(obj: Record<string, unknown>): boolean {
  const mo = obj.movementOrders;
  const ra = obj.rangedAttacks;
  return (Array.isArray(mo) && mo.length > 0) || (Array.isArray(ra) && ra.length > 0);
}

/**
 * Defines the `resolveExplicitRangedTarget` function shape (function resolveExplicitRangedTarget( target: unknown, state: GameStateSnapshot, resolveToH3: (lat: number, lng: number) => string | undefined ): stri).

 * Purpose: Supports maintainability by documenting why `resolveExplicitRangedTarget` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function resolveExplicitRangedTarget(target: unknown, state: GameStateSnapshot, context: CoordinateContext): string | undefined {
  if (typeof target === 'string') {
    if (HEX_CODE_PATTERN.test(target)) {
      try {
        return codeToH3(target, context);
      } catch {
        return undefined;
      }
    }
    const u = state.units.find((x) => x.id === target);
    return u?.h3Index;
  }
  return undefined;
}

/**
 * Defines the `normalizeOrderEntries` function shape (function normalizeOrderEntries<T>( entries: unknown, options: { expectedObjectDropReason: string; missingFieldsDropReason: string; normaliz).

 * Purpose: Supports maintainability by documenting why `normalizeOrderEntries` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function normalizeOrderEntries<T>(
  entries: unknown,
  options: {
    expectedObjectDropReason: string;
    missingFieldsDropReason: string;
    normalizeOne: (raw: Record<string, unknown>) => T | null;
  }
): { items: T[]; dropReasons: string[] } {
  const items: T[] = [];
  const dropReasons: string[] = [];
  if (!Array.isArray(entries)) return { items, dropReasons };
  for (const raw of entries) {
    if (!raw || typeof raw !== 'object') {
      dropReasons.push(options.expectedObjectDropReason);
      continue;
    }
    const normalized = options.normalizeOne(raw as Record<string, unknown>);
    if (!normalized) {
      dropReasons.push(options.missingFieldsDropReason);
      continue;
    }
    items.push(normalized);
  }
  return { items, dropReasons };
}

/**
 * Defines the `normalizeAirStrikeOrders` function shape (function normalizeAirStrikeOrders( entries: unknown, resolveToH3: (lat: number, lng: number) => string | undefined ): { airStrikes: AirStrikeOrder[]; dro).

 * Purpose: Supports maintainability by documenting why `normalizeAirStrikeOrders` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function normalizeAirStrikeOrders(
  entries: unknown,
  state: GameStateSnapshot,
  context: CoordinateContext
): { airStrikes: AirStrikeOrder[]; dropReasons: string[] } {
  const normalized = normalizeOrderEntries<AirStrikeOrder>(entries, {
    expectedObjectDropReason: 'airStrikes entry dropped: expected object.',
    missingFieldsDropReason:
      'airStrikes entry dropped: requires unitId, targetType, and exactly one of targetHexCode or targetUnitId.',
    normalizeOne: (raw) => {
      const unitId = typeof raw.unitId === 'string' ? raw.unitId.trim() : '';
      const targetTypeRaw = typeof raw.targetType === 'string' ? raw.targetType.trim().toLowerCase() : '';
      const targetType: AirStrikeTargetType | undefined =
        targetTypeRaw === 'units' || targetTypeRaw === 'urban' || targetTypeRaw === 'airport' || targetTypeRaw === 'seaport'
          ? targetTypeRaw
          : undefined;
      const hexCode = (raw as { targetHexCode?: unknown }).targetHexCode;
      const unitTarget = (raw as { targetUnitId?: unknown }).targetUnitId;
      const hasHex = typeof hexCode === 'string' && HEX_CODE_PATTERN.test(hexCode);
      const hasUnit = typeof unitTarget === 'string' && unitTarget.trim().length > 0;
      if (hasHex === hasUnit) return null;
      let targetH3Index: string | undefined;
      if (hasHex) {
        try {
          targetH3Index = codeToH3(hexCode, context);
        } catch {
          targetH3Index = undefined;
        }
      } else {
        const tid = (unitTarget as string).trim();
        const u = state.units.find((x) => x.id === tid);
        targetH3Index = u?.h3Index;
      }
      if (!unitId || !targetType || !targetH3Index) return null;
      return { unitId, targetH3Index, targetType };
    },
  });
  return { airStrikes: normalized.items, dropReasons: normalized.dropReasons };
}

/**
 * Defines the `normalizeFerryOrders` function shape (function normalizeFerryOrders( entries: unknown, resolveToH3: (lat: number, lng: number) => string | undefined ): { ferryOrders: FerryOrder[]; dropReason).

 * Purpose: Supports maintainability by documenting why `normalizeFerryOrders` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function normalizeFerryOrders(
  entries: unknown,
  context: CoordinateContext
): { ferryOrders: FerryOrder[]; dropReasons: string[] } {
  const normalized = normalizeOrderEntries<FerryOrder>(entries, {
    expectedObjectDropReason: 'ferryOrders entry dropped: expected object.',
    missingFieldsDropReason: 'ferryOrders entry dropped: requires unitId and valid destination hex code.',
    normalizeOne: (raw) => {
      const unitId = typeof raw.unitId === 'string' ? raw.unitId.trim() : '';
      const dest = raw.destination;
      if (typeof dest !== 'string' || !HEX_CODE_PATTERN.test(dest)) return null;
      let destinationH3Index: string | undefined;
      try {
        destinationH3Index = codeToH3(dest, context);
      } catch {
        destinationH3Index = undefined;
      }
      if (!unitId || !destinationH3Index) return null;
      return { unitId, destinationH3Index };
    },
  });
  return { ferryOrders: normalized.items, dropReasons: normalized.dropReasons };
}

/**
 * Defines the `processV3OrdersArray` function shape (function processV3OrdersArray( entries: unknown[], state: GameStateSnapshot, latLngByH3: Map<string, LatLng>, resolveToH3: (lat: number, lng: number).

 * Purpose: Supports maintainability by documenting why `processV3OrdersArray` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function processV3OrdersArray(
  entries: unknown[],
  state: GameStateSnapshot,
  latLngByH3: Map<string, LatLng>,
  resolveToH3: (lat: number, lng: number) => string | undefined,
  context: CoordinateContext
): {
  movementOrders: { unitId: string; toH3Index: string }[];
  rangedAttacks: { unitId: string; targetH3Index: string }[];
  embarkOrders: EmbarkOrder[];
  dropReasons: string[];
} {
  const movementOrders: { unitId: string; toH3Index: string }[] = [];
  const rangedAttacks: { unitId: string; targetH3Index: string }[] = [];
  const embarkOrders: EmbarkOrder[] = [];
  const dropReasons: string[] = [];
  for (const raw of entries) {
    if (!raw || typeof raw !== 'object') continue;
    const o = raw as {
      action?: unknown;
      unitId?: unknown;
      navalUnitId?: unknown;
      order?: unknown;
      destination?: unknown;
      targetHexCode?: unknown;
      targetUnitId?: unknown;
    };
    const action = o.action;
    const unitId = typeof o.unitId === 'string' ? o.unitId : '';
    if (!unitId) continue;

    if (action === 'assign_order') {
      logDebug('openRouter processV3OrdersArray: assign_order', { unitId });
      let orderPayload: unknown = o.order;
      if (orderPayload && typeof orderPayload === 'object' && !Array.isArray(orderPayload)) {
        const ord = { ...(orderPayload as Record<string, unknown>) };
        const dest = ord.destination;
        if (typeof dest === 'string' && HEX_CODE_PATTERN.test(dest)) {
          try {
            ord.destination = codeToLatLngRounded(dest, context);
          } catch {
            logDebug('openRouter processV3OrdersArray: assign_order destination code invalid', { unitId, dest });
          }
        }
        orderPayload = ord;
      }
      const assignResult = executeTool5('assign_order', { unitId, order: orderPayload }, state, latLngByH3, resolveToH3);
      if (assignResult.status === 'error' && typeof assignResult.error === 'string') {
        const orderType =
          orderPayload && typeof orderPayload === 'object' && !Array.isArray(orderPayload)
            ? (orderPayload as { type?: unknown }).type
            : undefined;
        logError('openRouter processV3OrdersArray: assign_order rejected', {
          unitId,
          orderType: typeof orderType === 'string' ? orderType : undefined,
          error: assignResult.error,
        });
        dropReasons.push(`assign_order ${unitId}: ${assignResult.error}`);
      }
      continue;
    }
    if (action === 'cancel_order') {
      logDebug('openRouter processV3OrdersArray: cancel_order', { unitId });
      executeTool5('cancel_order', { unitId }, state, latLngByH3, resolveToH3);
      continue;
    }
    if (action === 'explicit_move') {
      const dest = o.destination;
      if (typeof dest !== 'string' || !HEX_CODE_PATTERN.test(dest)) {
        logDebug('openRouter processV3OrdersArray: explicit_move missing destination code', { unitId });
        continue;
      }
      let h3: string | undefined;
      try {
        h3 = codeToH3(dest, context);
      } catch {
        h3 = undefined;
      }
      if (h3) {
        if (isEmbarkedLandUnit(unitId)) {
          logDebug('openRouter processV3OrdersArray: explicit_move auto-debarks embarked unit', { unitId, dest });
          clearEmbarkAssignmentForLandUnit(unitId);
        }
        movementOrders.push({ unitId, toH3Index: h3 });
      } else logDebug('openRouter processV3OrdersArray: explicit_move unresolved', { unitId, dest });
      continue;
    }
    if (action === 'ranged_attack') {
      const hexCode = o.targetHexCode;
      const unitTarget = o.targetUnitId;
      const hasHex = typeof hexCode === 'string' && HEX_CODE_PATTERN.test(hexCode);
      const hasUnit = typeof unitTarget === 'string' && unitTarget.trim().length > 0;
      if (hasHex === hasUnit) {
        logDebug('openRouter processV3OrdersArray: ranged_attack requires exactly one target selector', { unitId });
        continue;
      }
      const unitTargetId = typeof unitTarget === 'string' ? unitTarget.trim() : '';
      const targetH3 = hasHex
        ? resolveExplicitRangedTarget(hexCode, state, context)
        : resolveExplicitRangedTarget(unitTargetId, state, context);
      if (targetH3) rangedAttacks.push({ unitId, targetH3Index: targetH3 });
      else logDebug('openRouter processV3OrdersArray: ranged_attack unresolved', { unitId });
      continue;
    }
    if (action === 'transport_move') {
      const navalUnitId = typeof o.navalUnitId === 'string' ? o.navalUnitId : '';
      const dest = o.destination;
      if (!navalUnitId || typeof dest !== 'string' || !HEX_CODE_PATTERN.test(dest)) {
        logDebug('openRouter processV3OrdersArray: transport_move missing fields', { unitId, navalUnitId });
        continue;
      }
      let h3: string | undefined;
      try {
        h3 = codeToH3(dest, context);
      } catch {
        h3 = undefined;
      }
      if (h3) movementOrders.push({ unitId: navalUnitId, toH3Index: h3 });
      else logDebug('openRouter processV3OrdersArray: transport_move unresolved', { navalUnitId, dest });
      continue;
    }
    if (action === 'disembark') {
      const dest = o.destination;
      if (typeof dest !== 'string' || !HEX_CODE_PATTERN.test(dest)) {
        logDebug('openRouter processV3OrdersArray: disembark missing destination code', { unitId });
        continue;
      }
      if (!isEmbarkedLandUnit(unitId)) {
        dropReasons.push(`disembark ${unitId}: unit is not embarked`);
        logDebug('openRouter processV3OrdersArray: disembark rejected while not embarked', { unitId });
        continue;
      }
      let h3: string | undefined;
      try {
        h3 = codeToH3(dest, context);
      } catch {
        h3 = undefined;
      }
      if (h3) {
        clearEmbarkAssignmentForLandUnit(unitId);
        movementOrders.push({ unitId, toH3Index: h3 });
      } else logDebug('openRouter processV3OrdersArray: disembark unresolved', { unitId, dest });
      continue;
    }
    if (action === 'embark') {
      const navalUnitId = typeof o.navalUnitId === 'string' ? o.navalUnitId.trim() : '';
      if (!navalUnitId) {
        logDebug('openRouter processV3OrdersArray: embark missing navalUnitId', { unitId });
        continue;
      }
      embarkOrders.push({ unitId, navalUnitId });
      continue;
    }
    logDebug('openRouter processV3OrdersArray: skipped unknown action', { action, unitId });
  }
  return { movementOrders, rangedAttacks, embarkOrders, dropReasons };
}

/**
 * Defines the `processProductionOrdersArray` function shape (function processProductionOrdersArray( entries: unknown, state: GameStateSnapshot, latLngByH3: Map<string, LatLng>, resolveToH3: (lat: number, lng:).

 * Purpose: Supports maintainability by documenting why `processProductionOrdersArray` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function processProductionOrdersArray(
  entries: unknown,
  state: GameStateSnapshot,
  latLngByH3: Map<string, LatLng>,
  resolveToH3: (lat: number, lng: number) => string | undefined,
  context: CoordinateContext
): { appliedCount: number; droppedReasons: string[] } {
  const normalized = normalizeProductionOrders(entries, context);
  const droppedReasons = [...normalized.droppedReasons];
  let appliedCount = 0;
  for (const order of normalized.validOrders) {
    let hexLatLng: [number, number];
    try {
      hexLatLng = codeToLatLngRounded(order.hex, context);
    } catch {
      droppedReasons.push(`production ${order.action} @ ${order.hex}: hex code could not be translated`);
      continue;
    }
    const args = { hex: hexLatLng, unitType: order.unitType, count: order.count };
    const result = executeTool6(order.action, args, state, latLngByH3, resolveToH3) as { status?: string; error?: string };
    if (result.status === 'ok') {
      appliedCount += 1;
      continue;
    }
    droppedReasons.push(`production ${order.action} @ ${order.hex}: ${result.error ?? 'failed'}`);
  }
  return { appliedCount, droppedReasons };
}

/**
 * Defines the `parseOrdersResponse` function shape (export function parseOrdersResponse( content, resolveToH3, state, latLngByH3, productionEnabled, context )).

 * Purpose: Supports maintainability by documenting why `parseOrdersResponse` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function parseOrdersResponse(
  content: string,
  resolveToH3: (lat: number, lng: number) => string | undefined,
  state: GameStateSnapshot,
  latLngByH3: Map<string, LatLng>,
  productionEnabled: boolean,
  context: CoordinateContext
): {
  movementOrders: { unitId: string; toH3Index: string }[];
  rangedAttacks: { unitId: string; targetH3Index: string }[];
  embarkOrders: EmbarkOrder[];
  airStrikes: AirStrikeOrder[];
  ferryOrders: FerryOrder[];
  strategy?: string;
  callbacks?: CallbackSubscription[];
  memoryUpdates?: MemoryUpdateItem[];
  productionAppliedCount?: number;
  dropReasons?: string[];
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
  // When the assistant returns only a JSON array, slicing at the last `{` still yields a substring whose balanced `{…}` is a row object, not the required envelope—skip this candidate in that case.
  if (lastBrace >= 0 && !trimmed.trimStart().startsWith('[')) {
    candidates.push(trimmed.slice(lastBrace).trim());
  }

  for (const raw of candidates) {
    let jsonStr = raw;
    // Models sometimes return a bare `orders[]` as a JSON array; we must not peel the first `{...}` row and treat it as the full `{ strategy, orders }` envelope (see openRouter.matrix strict-schema test).
    if (raw.trimStart().startsWith('[')) {
      try {
        const topLevel = JSON.parse(stripJsonLikeComments(raw.trim())) as unknown;
        if (Array.isArray(topLevel)) {
          logDebug('openRouter parseOrdersResponse: skipping candidate: top-level JSON array is not a valid strategy+orders envelope');
          continue;
        }
      } catch {
        // Not valid JSON as a whole; fall through so `{…}` extraction may still recover a lone object.
      }
    }
    const firstBrace = jsonStr.search(/\{/);
    if (firstBrace >= 0) {
      const balanced = extractBalancedJsonObjectFrom(jsonStr, firstBrace);
      if (balanced) jsonStr = balanced;
      else {
        const objectMatch = jsonStr.slice(firstBrace).match(/\{[\s\S]*\}/);
        if (objectMatch) jsonStr = objectMatch[0];
      }
    }

    jsonStr = stripJsonLikeComments(jsonStr);
    try {
      const parsed = JSON.parse(jsonStr) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const obj = parsed as Record<string, unknown>;
        const ordersField = obj.orders;
        if (ordersField !== undefined && ordersField !== null && !Array.isArray(ordersField)) {
          logDebug('openRouter parseOrdersResponse: skipping candidate: orders is not an array');
          continue;
        }
        const ordersArray: unknown[] = Array.isArray(ordersField) ? ordersField : [];
        if (hasNonEmptyLegacyTopLevel(obj)) {
          logDebug('openRouter parseOrdersResponse: skipping candidate: non-empty legacy movementOrders/rangedAttacks');
          continue;
        }
        if (obj.strategy != null && typeof obj.strategy !== 'string') {
          logDebug('openRouter parseOrdersResponse: non-string strategy coerced to empty', {
            strategyType: typeof obj.strategy,
          });
        }
        const strategy = typeof obj.strategy === 'string' ? obj.strategy.trim() : '';
        const { movementOrders, rangedAttacks, embarkOrders, dropReasons: assignOrderDropReasons } = processV3OrdersArray(
          ordersArray,
          state,
          latLngByH3,
          resolveToH3,
          context
        );
        const normalizedAirStrikes = normalizeAirStrikeOrders(obj.airStrikes, state, context);
        const normalizedFerryOrders = normalizeFerryOrders(obj.ferryOrders, context);
        let productionDropReasons: string[] = [];
        let productionAppliedCount = 0;
        if (productionEnabled) {
          const productionResult = processProductionOrdersArray(obj.productionOrders, state, latLngByH3, resolveToH3, context);
          productionAppliedCount = productionResult.appliedCount;
          productionDropReasons = productionResult.droppedReasons;
        } else if (obj.productionOrders !== undefined) {
          productionDropReasons = ['productionOrders dropped: production tool group is disabled.'];
        }
        const callbacks = normalizeCallbacks(obj.callbacks);
        const memoryUpdates = normalizeMemoryUpdates(obj.memoryUpdates);
        const dropReasons = [
          ...assignOrderDropReasons,
          ...productionDropReasons,
          ...normalizedAirStrikes.dropReasons,
          ...normalizedFerryOrders.dropReasons,
        ];
        return {
          movementOrders,
          rangedAttacks,
          embarkOrders,
          airStrikes: normalizedAirStrikes.airStrikes,
          ferryOrders: normalizedFerryOrders.ferryOrders,
          strategy,
          callbacks: callbacks.length > 0 ? callbacks : undefined,
          memoryUpdates: memoryUpdates.length > 0 ? memoryUpdates : undefined,
          productionAppliedCount: productionAppliedCount > 0 ? productionAppliedCount : undefined,
          dropReasons: dropReasons.length > 0 ? dropReasons : undefined,
        };
      }
    } catch {
      // Try next candidate.
    }
  }
  return null;
}
