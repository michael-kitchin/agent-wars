/**
 * Parses the assistant's final JSON contract (v3 orders[], air/ferry, callbacks, memory, production)
 * and normalizes coordinates to H3. Used by OpenRouter after tool rounds complete.
 */

import type { GameStateSnapshot } from '../gameDb';
import { logDebug } from '../logger';
import type { CallbackSubscription } from '../callbackSubscriptions';
import type { LatLng } from '../tools/tool1Pathfinding';
import { executeTool5 } from '../tools/tool5StandingOrders';
import { executeTool6 } from '../tools/tool6Production';
import { normalizeProductionOrders } from '../productionOrders';
import type { AirStrikeOrder, AirStrikeTargetType, EmbarkOrder, FerryOrder } from '../../shared/ipcTypes';
import { formatLatLng } from './promptText';
import { LATLNG_DECIMAL_PLACES } from '../mapData';

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
    ? `{"strategy":"...","orders":[{"unitId":"opponent-armor-1","action":"assign_order","order":{"type":"march","destination":[lat,lng]}},{"unitId":"opponent-armor-1","action":"explicit_move","destination":[lat,lng]},{"unitId":"opponent-armor-1","action":"ranged_attack","targetHex":[lat,lng]},{"unitId":"opponent-armor-1","action":"cancel_order"}],"airStrikes":[{"unitId":"opponent-air-1","targetHex":[lat,lng],"targetType":"units"}],"ferryOrders":[{"unitId":"opponent-air-2","destination":[lat,lng]}],"callbacks":[],"memoryUpdates":[],"productionOrders":[{"action":"set_build_queue","hex":[lat,lng],"unitType":"infantry","count":1}]}`
    : `{"strategy":"...","orders":[{"unitId":"opponent-armor-1","action":"assign_order","order":{"type":"march","destination":[lat,lng]}},{"unitId":"opponent-armor-1","action":"explicit_move","destination":[lat,lng]},{"unitId":"opponent-armor-1","action":"ranged_attack","targetHex":[lat,lng]},{"unitId":"opponent-armor-1","action":"cancel_order"}],"airStrikes":[{"unitId":"opponent-air-1","targetHex":[lat,lng],"targetType":"units"}],"ferryOrders":[{"unitId":"opponent-air-2","destination":[lat,lng]}],"callbacks":[],"memoryUpdates":[]}`;
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
 * Defines the `resolveLatLngToH3` function shape (function resolveLatLngToH3().

 * Purpose: Supports maintainability by documenting why `resolveLatLngToH3` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function resolveLatLngToH3(
  point: unknown,
  resolveToH3: (lat: number, lng: number) => string | undefined
): string | undefined {
  if (!Array.isArray(point) || point.length < 2) return undefined;
  const lat = Number(point[0]);
  const lng = Number(point[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  return resolveToH3(lat, lng);
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
  resolveToH3: (lat: number, lng: number) => string | undefined
): { airStrikes: AirStrikeOrder[]; dropReasons: string[] } {
  const normalized = normalizeOrderEntries<AirStrikeOrder>(entries, {
    expectedObjectDropReason: 'airStrikes entry dropped: expected object.',
    missingFieldsDropReason: 'airStrikes entry dropped: requires unitId, targetType, and valid targetHex [lat,lng].',
    normalizeOne: (raw) => {
      const unitId = typeof raw.unitId === 'string' ? raw.unitId.trim() : '';
      const targetTypeRaw = typeof raw.targetType === 'string' ? raw.targetType.trim().toLowerCase() : '';
      const targetType: AirStrikeTargetType | undefined =
        targetTypeRaw === 'units' || targetTypeRaw === 'urban' || targetTypeRaw === 'airport' || targetTypeRaw === 'seaport'
          ? targetTypeRaw
          : undefined;
      const targetH3Index = resolveLatLngToH3(raw.targetHex, resolveToH3);
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
  resolveToH3: (lat: number, lng: number) => string | undefined
): { ferryOrders: FerryOrder[]; dropReasons: string[] } {
  const normalized = normalizeOrderEntries<FerryOrder>(entries, {
    expectedObjectDropReason: 'ferryOrders entry dropped: expected object.',
    missingFieldsDropReason: 'ferryOrders entry dropped: requires unitId and valid destination [lat,lng].',
    normalizeOne: (raw) => {
      const unitId = typeof raw.unitId === 'string' ? raw.unitId.trim() : '';
      const destinationH3Index = resolveLatLngToH3(raw.destination, resolveToH3);
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
  resolveToH3: (lat: number, lng: number) => string | undefined
): {
  movementOrders: { unitId: string; toH3Index: string }[];
  rangedAttacks: { unitId: string; targetH3Index: string }[];
  embarkOrders: EmbarkOrder[];
} {
  const movementOrders: { unitId: string; toH3Index: string }[] = [];
  const rangedAttacks: { unitId: string; targetH3Index: string }[] = [];
  const embarkOrders: EmbarkOrder[] = [];
  for (const raw of entries) {
    if (!raw || typeof raw !== 'object') continue;
    const o = raw as {
      action?: unknown;
      unitId?: unknown;
      navalUnitId?: unknown;
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
    if (action === 'ranged_attack') {
      const attackTarget = o.targetHex ?? o.targetUnitId;
      const targetH3 = resolveExplicitRangedTarget(attackTarget, state, resolveToH3);
      if (targetH3) rangedAttacks.push({ unitId, targetH3Index: targetH3 });
      else logDebug('openRouter processV3OrdersArray: ranged_attack unresolved', { unitId });
      continue;
    }
    if (action === 'transport_move') {
      const navalUnitId = typeof o.navalUnitId === 'string' ? o.navalUnitId : '';
      const dest = o.destination;
      if (!navalUnitId || !Array.isArray(dest) || dest.length < 2) {
        logDebug('openRouter processV3OrdersArray: transport_move missing fields', { unitId, navalUnitId });
        continue;
      }
      const lat = Number(dest[0]);
      const lng = Number(dest[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const h3 = resolveToH3(lat, lng);
      if (h3) movementOrders.push({ unitId: navalUnitId, toH3Index: h3 });
      else logDebug('openRouter processV3OrdersArray: transport_move unresolved', { navalUnitId, lat, lng });
      continue;
    }
    if (action === 'disembark') {
      const dest = o.destination;
      if (!Array.isArray(dest) || dest.length < 2) {
        logDebug('openRouter processV3OrdersArray: disembark missing destination', { unitId });
        continue;
      }
      const lat = Number(dest[0]);
      const lng = Number(dest[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const h3 = resolveToH3(lat, lng);
      if (h3) movementOrders.push({ unitId, toH3Index: h3 });
      else logDebug('openRouter processV3OrdersArray: disembark unresolved', { unitId, lat, lng });
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
  return { movementOrders, rangedAttacks, embarkOrders };
}

/**
 * Defines the `formatLatLngForDropMessage` function shape (function formatLatLngForDropMessage(ll: [number, number]): string).

 * Purpose: Supports maintainability by documenting why `formatLatLngForDropMessage` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function formatLatLngForDropMessage(ll: [number, number]): string {
  return formatLatLng(ll, LATLNG_DECIMAL_PLACES);
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
  resolveToH3: (lat: number, lng: number) => string | undefined
): { appliedCount: number; droppedReasons: string[] } {
  const normalized = normalizeProductionOrders(entries);
  const droppedReasons = [...normalized.droppedReasons];
  let appliedCount = 0;
  for (const order of normalized.validOrders) {
    const args = { hex: order.hex, unitType: order.unitType, count: order.count };
    const result = executeTool6(order.action, args, state, latLngByH3, resolveToH3) as { status?: string; error?: string };
    if (result.status === 'ok') {
      appliedCount += 1;
      continue;
    }
    droppedReasons.push(`production ${order.action} @ ${formatLatLngForDropMessage(order.hex)}: ${result.error ?? 'failed'}`);
  }
  return { appliedCount, droppedReasons };
}

/**
 * Defines the `parseOrdersResponse` function shape (export function parseOrdersResponse( content: string, resolveToH3: (lat: number, lng: number) => string | undefined, state: GameStateSnapshot, latLn).

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
  productionEnabled: boolean
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
        const { movementOrders, rangedAttacks, embarkOrders } = processV3OrdersArray(
          obj.orders as unknown[],
          state,
          latLngByH3,
          resolveToH3
        );
        const normalizedAirStrikes = normalizeAirStrikeOrders(obj.airStrikes, resolveToH3);
        const normalizedFerryOrders = normalizeFerryOrders(obj.ferryOrders, resolveToH3);
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
        const dropReasons = [
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
