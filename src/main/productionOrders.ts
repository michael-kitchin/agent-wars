/**
 * Normalizes and validates LLM productionOrders JSON entries.
 * Keeps parsing logic pure so OpenRouter can share one contract across prompt/tool paths.
 */

import { BUILD_ENTRY_MAX_COUNT, BUILD_ENTRY_MIN_COUNT, type BuildUnitType } from './productionRules';
import { logTrace } from './logger';

export type ProductionOrderAction = 'add_build_entry' | 'update_build_entry' | 'remove_build_entry';

export interface ProductionOrder {
  action: ProductionOrderAction;
  hex: [number, number];
  entryId?: number;
  unitType?: BuildUnitType;
  count?: number;
}

export interface NormalizeProductionOrdersResult {
  validOrders: ProductionOrder[];
  droppedReasons: string[];
}

function isBuildUnitType(value: unknown): value is BuildUnitType {
  return value === 'infantry' || value === 'armor' || value === 'naval';
}

function parseHex(value: unknown): [number, number] | undefined {
  if (!Array.isArray(value) || value.length < 2) return undefined;
  const lat = Number(value[0]);
  const lng = Number(value[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  return [lat, lng];
}

function parsePositiveInteger(value: unknown): number | undefined {
  if (!Number.isInteger(value)) return undefined;
  const parsed = Number(value);
  return parsed > 0 ? parsed : undefined;
}

function parseBuildCount(value: unknown): number | undefined {
  if (!Number.isInteger(value)) return undefined;
  const parsed = Number(value);
  return parsed >= BUILD_ENTRY_MIN_COUNT && parsed <= BUILD_ENTRY_MAX_COUNT ? parsed : undefined;
}

/**
 * Why this exists:
 *     Enforces one strict JSON contract for productionOrders so malformed entries are dropped consistently.
 * When to use:
 *     OpenRouter final-response parsing before applying production changes.
 * What to expect:
 *     Returns valid orders plus explicit dropped reasons for malformed/contract-breaking entries.
 */
export function normalizeProductionOrders(raw: unknown): NormalizeProductionOrdersResult {
  logTrace('productionOrders normalizeProductionOrders', { hasRaw: raw !== undefined && raw !== null, isArray: Array.isArray(raw) });
  const validOrders: ProductionOrder[] = [];
  const droppedReasons: string[] = [];
  if (raw == null) return { validOrders, droppedReasons };
  if (!Array.isArray(raw)) {
    return {
      validOrders,
      droppedReasons: ['productionOrders must be an array when present.'],
    };
  }
  for (let i = 0; i < raw.length; i++) {
    const entry = raw[i];
    const prefix = `productionOrders[${i}]`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      droppedReasons.push(`${prefix}: entry must be an object.`);
      continue;
    }
    const row = entry as {
      action?: unknown;
      hex?: unknown;
      entryId?: unknown;
      unitType?: unknown;
      count?: unknown;
    };
    const action = row.action;
    if (action !== 'add_build_entry' && action !== 'update_build_entry' && action !== 'remove_build_entry') {
      droppedReasons.push(`${prefix}: unknown action.`);
      continue;
    }
    const hex = parseHex(row.hex);
    if (!hex) {
      droppedReasons.push(`${prefix}: hex must be [lat,lng].`);
      continue;
    }
    if (action === 'add_build_entry') {
      if (!isBuildUnitType(row.unitType)) {
        droppedReasons.push(`${prefix}: add_build_entry requires unitType.`);
        continue;
      }
      const count = parseBuildCount(row.count);
      if (count === undefined) {
        droppedReasons.push(
          `${prefix}: add_build_entry count must be an integer from ${BUILD_ENTRY_MIN_COUNT} to ${BUILD_ENTRY_MAX_COUNT}.`
        );
        continue;
      }
      validOrders.push({ action, hex, unitType: row.unitType, count });
      continue;
    }
    if (action === 'update_build_entry') {
      const entryId = parsePositiveInteger(row.entryId);
      if (entryId === undefined) {
        droppedReasons.push(`${prefix}: update_build_entry requires positive integer entryId.`);
        continue;
      }
      if (!isBuildUnitType(row.unitType)) {
        droppedReasons.push(`${prefix}: update_build_entry requires unitType.`);
        continue;
      }
      const count = parseBuildCount(row.count);
      if (count === undefined) {
        droppedReasons.push(
          `${prefix}: update_build_entry count must be an integer from ${BUILD_ENTRY_MIN_COUNT} to ${BUILD_ENTRY_MAX_COUNT}.`
        );
        continue;
      }
      validOrders.push({ action, hex, entryId, unitType: row.unitType, count });
      continue;
    }
    const entryId = parsePositiveInteger(row.entryId);
    if (entryId === undefined) {
      droppedReasons.push(`${prefix}: remove_build_entry requires positive integer entryId.`);
      continue;
    }
    validOrders.push({ action, hex, entryId });
  }
  return { validOrders, droppedReasons };
}
