/**
 * Normalizes and validates LLM productionOrders JSON entries.
 * Keeps parsing logic pure so OpenRouter can share one contract across prompt/tool paths.
 */

import { BUILD_ENTRY_MAX_COUNT, BUILD_ENTRY_MIN_COUNT, type BuildUnitType } from './productionRules';
import { logTrace } from './logger';
import type { CoordinateContext } from './briefing/map/coordinateContext';
import { HEX_CODE_PATTERN } from './briefing/map/coordinateContext';
import { isHexCodeValidForContext } from './briefing/map/hex-coordinates';

/**
 * Documents the `ProductionOrderAction` type alias (export type ProductionOrderAction).

 * Purpose: Supports maintainability by documenting why `ProductionOrderAction` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export type ProductionOrderAction = 'set_build_queue';

/**
 * Documents the `ProductionOrder` interface as a named contract surface (export interface ProductionOrder).

 * Purpose: Supports maintainability by documenting why `ProductionOrder` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface ProductionOrder {
    /**
   * Specifies the contract for the `action` member (action: ProductionOrderAction;).

   * Contract: Describes stable behavior for callers of `action` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
action: ProductionOrderAction;
    /**
   * Specifies the contract for the `hex` member (hex: string).

   * Contract: Two-character briefing hex code in the active strategic registry.
   * When to use: LLM `productionOrders` entries for `set_build_queue`.
   * Expected outcome: Validated against the active coordinate context before execution.
   * Exceptions: None.
   */
hex: string;
    /**
   * Specifies the contract for the `unitType` member (unitType: BuildUnitType;).

   * Contract: Describes stable behavior for callers of `unitType` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unitType: BuildUnitType;
    /**
   * Specifies the contract for the `count` member (count: number;).

   * Contract: Describes stable behavior for callers of `count` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
count: number;
}

/**
 * Documents the `NormalizeProductionOrdersResult` interface as a named contract surface (export interface NormalizeProductionOrdersResult).

 * Purpose: Supports maintainability by documenting why `NormalizeProductionOrdersResult` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface NormalizeProductionOrdersResult {
    /**
   * Specifies the contract for the `validOrders` member (validOrders: ProductionOrder[];).

   * Contract: Describes stable behavior for callers of `validOrders` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
validOrders: ProductionOrder[];
    /**
   * Specifies the contract for the `droppedReasons` member (droppedReasons: string[];).

   * Contract: Describes stable behavior for callers of `droppedReasons` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
droppedReasons: string[];
}

/**
 * Defines the `isBuildUnitType` function shape (function isBuildUnitType(value: unknown): value is BuildUnitType).

 * Purpose: Supports maintainability by documenting why `isBuildUnitType` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function isBuildUnitType(value: unknown): value is BuildUnitType {
  return value === 'infantry' || value === 'armor' || value === 'naval' || value === 'air';
}

/**
 * Defines the `parseHex` function shape (function parseHex(value: unknown): [number, number] | undefined).

 * Purpose: Supports maintainability by documenting why `parseHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
/**
 * Defines the `parseBuildCount` function shape (function parseBuildCount(value: unknown): number | undefined).

 * Purpose: Supports maintainability by documenting why `parseBuildCount` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function parseBuildCount(value: unknown): number | undefined {
  if (!Number.isInteger(value)) return undefined;
  const parsed = Number(value);
  return parsed >= BUILD_ENTRY_MIN_COUNT && parsed <= BUILD_ENTRY_MAX_COUNT ? parsed : undefined;
}

/**
 * Defines the `normalizeProductionOrders` function shape (export function normalizeProductionOrders(raw: unknown, context: CoordinateContext): NormalizeProductionOrdersResult).

 * Purpose: Supports maintainability by documenting why `normalizeProductionOrders` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function normalizeProductionOrders(raw: unknown, context: CoordinateContext): NormalizeProductionOrdersResult {
  logTrace('productionOrders normalizeProductionOrders', {
    hasRaw: raw !== undefined && raw !== null,
    isArray: Array.isArray(raw),
    mode: context.mode,
  });
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
      unitType?: unknown;
      count?: unknown;
    };
    const action = row.action;
    if (action !== 'set_build_queue') {
      droppedReasons.push(`${prefix}: unknown action.`);
      continue;
    }
    const hexRaw = row.hex;
    if (typeof hexRaw !== 'string' || !HEX_CODE_PATTERN.test(hexRaw)) {
      droppedReasons.push(`${prefix}: hex must be a 2-character briefing code.`);
      continue;
    }
    if (!isHexCodeValidForContext(hexRaw, context)) {
      droppedReasons.push(`${prefix}: unknown hex code for active context.`);
      continue;
    }
    const hex = hexRaw;
    if (!isBuildUnitType(row.unitType)) {
      droppedReasons.push(`${prefix}: set_build_queue requires unitType.`);
      continue;
    }
    const count = parseBuildCount(row.count);
    if (count === undefined) {
      droppedReasons.push(
        `${prefix}: set_build_queue count must be an integer from ${BUILD_ENTRY_MIN_COUNT} to ${BUILD_ENTRY_MAX_COUNT}.`
      );
      continue;
    }
    validOrders.push({ action, hex, unitType: row.unitType, count });
  }
  return { validOrders, droppedReasons };
}
