/**
 * Centralized constants and pure queue-production helpers for milestone 1.4.
 */

import {
  applyProduction as applyProductionShared,
  UNIT_COST_BY_TYPE as SHARED_UNIT_COST_BY_TYPE,
} from '../shared/productionConfig';

/**
 * Documents the `BuildUnitType` type alias (export type BuildUnitType).

 * Purpose: Supports maintainability by documenting why `BuildUnitType` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export type BuildUnitType = 'infantry' | 'armor' | 'naval' | 'air';

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
   * Specifies the contract for the `unitType` member (unitType: BuildUnitType;).

   * Contract: Describes stable behavior for callers of `unitType` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unitType: BuildUnitType;
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
   * Documents the object literal property `armor` (armor: { minUrbanHexes: 2, minSeaports: 0 }).

   * Purpose: Supports maintainability by documenting why `armor` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
armor: { minUrbanHexes: 2, minSeaports: 0 },
    /**
   * Documents the object literal property `naval` (naval: { minUrbanHexes: 10, minSeaports: 1 }).

   * Purpose: Supports maintainability by documenting why `naval` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
naval: { minUrbanHexes: 10, minSeaports: 1 },
    /**
   * Documents the object literal property `air` (air: { minUrbanHexes: 5, minSeaports: 0 }).

   * Purpose: Supports maintainability by documenting why `air` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
air: { minUrbanHexes: 5, minSeaports: 0 },
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
 * Defines the `getAvailableBuildUnitTypes` function shape (export function getAvailableBuildUnitTypes().

 * Purpose: Supports maintainability by documenting why `getAvailableBuildUnitTypes` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getAvailableBuildUnitTypes(
  urbanHexCount: number,
  seaportCount: number,
  airportCount = 0
): BuildUnitType[] {
  const ordered: BuildUnitType[] = ['infantry', 'armor', 'naval', 'air'];
  return ordered.filter((unitType) => {
    const req = BUILD_PREREQUISITES_BY_TYPE[unitType];
    if (urbanHexCount < req.minUrbanHexes || seaportCount < req.minSeaports) return false;
    if (unitType === 'air') return airportCount > 0;
    return true;
  });
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
