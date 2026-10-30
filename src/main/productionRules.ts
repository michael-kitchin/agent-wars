/**
 * Centralized constants and pure queue-production helpers.
 */

import { GLOBAL_GAME_MAP } from '../shared/activeGameMap';
import { buildMinimumUrbanCells } from '../shared/gameRules';
import { CREDITS_QUEUE_ITEM } from '../shared/creditsRules';
import { FORTIFICATION_QUEUE_ITEM } from '../shared/fortificationRules';
import { logTrace } from './logger';
import {
  applyProduction as applyProductionShared,
  computeKeepBuildingRefillCount as computeKeepBuildingRefillCountShared,
  UNIT_COST_BY_TYPE as SHARED_UNIT_COST_BY_TYPE,
} from '../shared/productionConfig';
import {
  ALL_BUILD_QUEUE_ITEM_TYPES,
  ALL_BUILD_UNIT_TYPES,
  isBuildQueueItemType,
  isBuildUnitType,
  type BuildQueueItemType,
  type BuildUnitType,
} from '../shared/ipc/productionTypes';

export {
  ALL_BUILD_QUEUE_ITEM_TYPES,
  ALL_BUILD_UNIT_TYPES,
  isBuildQueueItemType,
  isBuildUnitType,
  type BuildQueueItemType,
  type BuildUnitType,
};

/**
 * Documents the `BuildQueueEntryLike` interface as a named contract surface (export interface BuildQueueEntryLike).

 * Purpose: Supports maintainability by documenting why `BuildQueueEntryLike` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface BuildQueueEntryLike {
    /**
   * Specifies the contract for the `id` member (id: number;).

   * Contract: Describes stable behavior for callers of `id` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
id: number;
    /**
   * Specifies the contract for the `queueIndex` member (queueIndex: number;).

   * Contract: Describes stable behavior for callers of `queueIndex` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
queueIndex: number;
    /**
   * Specifies the contract for the `unitType` member (unitType: BuildQueueItemType;).

   * Contract: A unit type or a fortification.
   * When to use: One ordered queue row passed to production math.
   * Expected outcome: Spend charges `buildQueueItemCostFor` and spawns a unit only for a unit type.
   * Exceptions: None.
   */
unitType: BuildQueueItemType;
    /**
   * Specifies the contract for the `remainingCount` member (remainingCount: number;).

   * Contract: Describes stable behavior for callers of `remainingCount` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
remainingCount: number;
}

/**
 * Documents the `BuildPrerequisite` interface as a named contract surface (export interface BuildPrerequisite).

 * Purpose: Supports maintainability by documenting why `BuildPrerequisite` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface BuildPrerequisite {
    /**
   * Specifies the contract for the `minUrbanHexes` member (minUrbanHexes: number;).

   * Contract: Describes stable behavior for callers of `minUrbanHexes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
minUrbanHexes: number;
    /**
   * Specifies the contract for the `minSeaports` member (minSeaports: number;).

   * Contract: Describes stable behavior for callers of `minSeaports` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
minSeaports: number;
}

/**
 * Documents the module-scope binding `BUILD_ENTRY_MIN_COUNT` (BUILD_ENTRY_MIN_COUNT).

 * Purpose: Supports maintainability by documenting why `BUILD_ENTRY_MIN_COUNT` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const BUILD_ENTRY_MIN_COUNT = 1;
/**
 * Documents the module-scope binding `BUILD_ENTRY_MAX_COUNT` (BUILD_ENTRY_MAX_COUNT).

 * Purpose: Supports maintainability by documenting why `BUILD_ENTRY_MAX_COUNT` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const BUILD_ENTRY_MAX_COUNT = 99;
/**
 * Documents the module-scope binding `NO_PRODUCTION_INFRASTRUCTURE_REASON` (NO_PRODUCTION_INFRASTRUCTURE_REASON).

 * Purpose: Supports maintainability by documenting why `NO_PRODUCTION_INFRASTRUCTURE_REASON` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const NO_PRODUCTION_INFRASTRUCTURE_REASON =
  'Cannot build here: insufficient production capacity or infrastructure.';

/**
 * Documents the module-scope binding `UNIT_COST_BY_TYPE` (UNIT_COST_BY_TYPE: Readonly<Record<BuildUnitType, number>>).

 * Purpose: Supports maintainability by documenting why `UNIT_COST_BY_TYPE` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const UNIT_COST_BY_TYPE: Readonly<Record<BuildUnitType, number>> = SHARED_UNIT_COST_BY_TYPE;

/**
 * Documents the module-scope binding `BUILD_PREREQUISITES_BY_TYPE` (BUILD_PREREQUISITES_BY_TYPE: Readonly<Record<BuildUnitType, BuildPrerequisite>>).

 * Purpose: Supports maintainability by documenting why `BUILD_PREREQUISITES_BY_TYPE` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const BUILD_PREREQUISITES_BY_TYPE: Readonly<Record<BuildUnitType, BuildPrerequisite>> = {
    /**
   * Documents the object literal property `infantry` (infantry: { minUrbanHexes: 1, minSeaports: 0 }).

   * Purpose: Supports maintainability by documenting why `infantry` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
infantry: { minUrbanHexes: 1, minSeaports: 0 },
    /**
   * Documents the object literal property `armor` (armor minimum urban cells come from the global profile).

   * Purpose: Supports maintainability by documenting why `armor` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
armor: { minUrbanHexes: GLOBAL_GAME_MAP.rules.armorMinUrbanCells, minSeaports: 0 },
    /**
   * Documents the object literal property `naval` (naval: { minUrbanHexes: 10, minSeaports: 1 }).

   * Purpose: Supports maintainability by documenting why `naval` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
naval: { minUrbanHexes: GLOBAL_GAME_MAP.rules.navalMinUrbanCells, minSeaports: 1 },
    /**
   * Documents the object literal property `air` (air: { minUrbanHexes: 5, minSeaports: 0 }).

   * Purpose: Supports maintainability by documenting why `air` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
air: { minUrbanHexes: GLOBAL_GAME_MAP.rules.airMinUrbanCells, minSeaports: 0 },
  // Not the live urban gate. `buildMinimumUrbanCells` reads the loaded map. This field only completes the record.
  missile: { minUrbanHexes: GLOBAL_GAME_MAP.rules.advancedMinUrbanCells, minSeaports: 0 },
};

/**
 * Documents the `ProductionApplyResult` interface as a named contract surface (export interface ProductionApplyResult).

 * Purpose: Supports maintainability by documenting why `ProductionApplyResult` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface ProductionApplyResult {
    /**
   * Specifies the contract for the `updatedEntries` member (updatedEntries: BuildQueueEntryLike[];).

   * Contract: Describes stable behavior for callers of `updatedEntries` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
updatedEntries: BuildQueueEntryLike[];
    /**
   * Specifies the contract for the `storedPoints` member (storedPoints: number;).

   * Contract: Describes stable behavior for callers of `storedPoints` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
storedPoints: number;
    /**
   * Specifies the contract for the `spawnedUnitTypes` member (spawnedUnitTypes: BuildUnitType[];).

   * Contract: Describes stable behavior for callers of `spawnedUnitTypes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
spawnedUnitTypes: BuildUnitType[];
}

/**
 * Defines the `isValidBuildCount` function shape (export function isValidBuildCount(value: number): boolean).

 * Purpose: Supports maintainability by documenting why `isValidBuildCount` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function isValidBuildCount(value: number): boolean {
  return Number.isInteger(value) && value >= BUILD_ENTRY_MIN_COUNT && value <= BUILD_ENTRY_MAX_COUNT;
}

/**
 * Lists queue items a hex may build, with a fortification last when a city cell remains.
 *
 * Purpose: Menus and pruning share one list. A fortification needs an intact city cell, not merely urban rubble.
 * When to use: Eligibility, Keep building, and queue pruning. Pass 0 intact cells wherever urban count is 0.
 * Expected outcome: The unit list from `getAvailableBuildUnitTypes`, then `fortification` when `intactCityCells` is above 0, then `credits` when `urbanHexCount` is above 0.
 * Exceptions: None.
 */
export function getAvailableBuildQueueItemTypes(
  urbanHexCount: number,
  seaportCount: number,
  airportCount: number,
  intactCityCells: number
): BuildQueueItemType[] {
  const available = getAvailableBuildUnitTypes(urbanHexCount, seaportCount, airportCount);
  const items: BuildQueueItemType[] = [...available];
  if (intactCityCells > 0) items.push(FORTIFICATION_QUEUE_ITEM);
  if (urbanHexCount > 0) items.push(CREDITS_QUEUE_ITEM);
  logTrace('getAvailableBuildQueueItemTypes', {
    urbanHexCount,
    seaportCount,
    airportCount,
    intactCityCells,
    items,
  });
  return items;
}

/**
 * Lists unit types a hex may queue from its urban cells, seaports, and airports.
 *
 * Purpose: The urban gate follows the active map. Seaport minimums stay on the static prerequisite table.
 * When to use: `getAvailableBuildQueueItemTypes` and prompt sentences that need the unit types a hex can start.
 * Expected outcome: Infantry needs one urban cell. Armor, air, and naval need `buildMinimumUrbanCells`. A missile needs the Advanced urban-cell count. Naval also needs its seaport minimum. Air needs an airport.
 * Exceptions: None.
 */
export function getAvailableBuildUnitTypes(
  urbanHexCount: number,
  seaportCount: number,
  airportCount = 0
): BuildUnitType[] {
  const available = ALL_BUILD_UNIT_TYPES.filter((unitType) => {
    const req = BUILD_PREREQUISITES_BY_TYPE[unitType];
    if (urbanHexCount < buildMinimumUrbanCells(unitType) || seaportCount < req.minSeaports) return false;
    if (unitType === 'air') return airportCount > 0;
    return true;
  });
  logTrace('getAvailableBuildUnitTypes', { urbanHexCount, seaportCount, airportCount, available });
  return available;
}

/**
 * Defines the `applyProduction` function shape (export function applyProduction().

 * Purpose: Supports maintainability by documenting why `applyProduction` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function applyProduction(
  entries: BuildQueueEntryLike[],
  storedPoints: number,
  urbanHexCount: number
): ProductionApplyResult {
  return applyProductionShared(entries, storedPoints, urbanHexCount);
}

/**
 * Re-exports Keep-building refill sizing for main-process callers.
 *
 * Purpose: Keeps productionRules as the familiar import surface for production helpers used by game actions.
 * When to use: Engine same-turn refill and tests that already import from productionRules.
 * Expected outcome: Same result as `computeKeepBuildingRefillCount` in shared productionConfig (points-based).
 * Exceptions: None.
 */
export function computeKeepBuildingRefillCount(unitType: BuildQueueItemType, availablePoints: number): number {
  return computeKeepBuildingRefillCountShared(unitType, availablePoints);
}
