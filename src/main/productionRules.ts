/**
 * Centralized constants and pure queue-production helpers for milestone 1.4.
 */

import { UNIT_COST_BY_TYPE as SHARED_UNIT_COST_BY_TYPE } from '../shared/productionConfig';

export type BuildUnitType = 'infantry' | 'armor' | 'naval' | 'air';

export interface BuildQueueEntryLike {
  id: number;
  queueIndex: number;
  unitType: BuildUnitType;
  remainingCount: number;
}

export interface BuildPrerequisite {
  minUrbanHexes: number;
  minSeaports: number;
}

export const BUILD_ENTRY_MIN_COUNT = 1;
export const BUILD_ENTRY_MAX_COUNT = 99;
export const NO_PRODUCTION_INFRASTRUCTURE_REASON =
  'Cannot build here: insufficient production capacity or infrastructure.';

export const UNIT_COST_BY_TYPE: Readonly<Record<BuildUnitType, number>> = SHARED_UNIT_COST_BY_TYPE;

export const BUILD_PREREQUISITES_BY_TYPE: Readonly<Record<BuildUnitType, BuildPrerequisite>> = {
  infantry: { minUrbanHexes: 1, minSeaports: 0 },
  armor: { minUrbanHexes: 2, minSeaports: 0 },
  naval: { minUrbanHexes: 10, minSeaports: 1 },
  air: { minUrbanHexes: 5, minSeaports: 0 },
};

export interface ProductionApplyResult {
  updatedEntries: BuildQueueEntryLike[];
  storedPoints: number;
  spawnedUnitTypes: BuildUnitType[];
}

/**
 * Why this exists:
 *     Enforces the locked 1..99 queue entry count contract in one place.
 * When to use:
 *     Backend queue add/update handlers before persisting.
 * What to expect:
 *     Returns true only for finite integer values inside the accepted bounds.
 */
export function isValidBuildCount(value: number): boolean {
  return Number.isInteger(value) && value >= BUILD_ENTRY_MIN_COUNT && value <= BUILD_ENTRY_MAX_COUNT;
}

/**
 * Why this exists:
 *     Computes currently allowed build unit types for a hex from urban/seaport context.
 * When to use:
 *     Renderer snapshot construction and backend mutation validation.
 * What to expect:
 *     Returns unit types in stable UI order (infantry, armor, naval, air).
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
 * Why this exists:
 *     Applies one turn of production points to a queue deterministically in queue order.
 * When to use:
 *     Turn-resolution production phase after control finalization.
 * What to expect:
 *     Consumes points from queue head forward, carries partial head progress, and returns spawned unit types.
 */
export function applyProduction(
  entries: BuildQueueEntryLike[],
  storedPoints: number,
  urbanHexCount: number
): ProductionApplyResult {
  const sorted = [...entries].sort((a, b) => a.queueIndex - b.queueIndex || a.id - b.id);
  const updated: BuildQueueEntryLike[] = sorted.map((entry) => ({ ...entry }));
  const spawnedUnitTypes: BuildUnitType[] = [];
  let points = Math.max(0, Math.trunc(storedPoints)) + Math.max(0, Math.trunc(urbanHexCount));
  let idx = 0;
  while (idx < updated.length) {
    const entry = updated[idx]!;
    const unitCost = UNIT_COST_BY_TYPE[entry.unitType];
    if (points < unitCost) break;
    const maxBuildable = Math.floor(points / unitCost);
    const built = Math.min(maxBuildable, entry.remainingCount);
    if (built <= 0) break;
    for (let i = 0; i < built; i++) spawnedUnitTypes.push(entry.unitType);
    points -= built * unitCost;
    entry.remainingCount -= built;
    if (entry.remainingCount <= 0) {
      updated.splice(idx, 1);
      continue;
    }
    idx++;
  }
  for (let i = 0; i < updated.length; i++) {
    updated[i]!.queueIndex = i;
  }
  return { updatedEntries: updated, storedPoints: points, spawnedUnitTypes };
}
