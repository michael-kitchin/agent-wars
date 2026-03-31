/**
 * Centralized constants and pure queue-production helpers for milestone 1.4.
 */

export type BuildUnitType = 'infantry' | 'armor' | 'naval';

export interface BuildQueueEntryLike {
  id: number;
  queueIndex: number;
  unitType: BuildUnitType;
  remainingCount: number;
}

export interface BuildPrerequisite {
  minUrbanHexes: number;
  minPorts: number;
}

export const BUILD_ENTRY_MIN_COUNT = 1;
export const BUILD_ENTRY_MAX_COUNT = 99;
export const NO_URBAN_BUILD_REASON = 'This hex cannot build units because it has no urban hexes.';

export const UNIT_COST_BY_TYPE: Readonly<Record<BuildUnitType, number>> = {
  infantry: 10,
  armor: 20,
  naval: 50,
};

export const BUILD_PREREQUISITES_BY_TYPE: Readonly<Record<BuildUnitType, BuildPrerequisite>> = {
  infantry: { minUrbanHexes: 1, minPorts: 0 },
  armor: { minUrbanHexes: 2, minPorts: 0 },
  naval: { minUrbanHexes: 5, minPorts: 1 },
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
 *     Computes currently allowed build unit types for a hex from urban/port context.
 * When to use:
 *     Renderer snapshot construction and backend mutation validation.
 * What to expect:
 *     Returns unit types in stable UI order (infantry, armor, naval).
 */
export function getAvailableBuildUnitTypes(urbanHexCount: number, portCount: number): BuildUnitType[] {
  const ordered: BuildUnitType[] = ['infantry', 'armor', 'naval'];
  return ordered.filter((unitType) => {
    const req = BUILD_PREREQUISITES_BY_TYPE[unitType];
    return urbanHexCount >= req.minUrbanHexes && portCount >= req.minPorts;
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
