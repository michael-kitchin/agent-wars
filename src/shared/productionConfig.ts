import type { BuildUnitType } from './ipcTypes';

/**
 * Documents the module-scope binding `UNIT_COST_BY_TYPE` (UNIT_COST_BY_TYPE: Readonly<Record<BuildUnitType, number>>).

 * Purpose: Supports maintainability by documenting why `UNIT_COST_BY_TYPE` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const UNIT_COST_BY_TYPE: Readonly<Record<BuildUnitType, number>> = {
    /**
   * Documents the object literal property `infantry` (infantry: 10).

   * Purpose: Supports maintainability by documenting why `infantry` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
infantry: 10,
    /**
   * Documents the object literal property `armor` (armor: 20).

   * Purpose: Supports maintainability by documenting why `armor` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
armor: 20,
    /**
   * Documents the object literal property `naval` (naval: 50).

   * Purpose: Supports maintainability by documenting why `naval` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
naval: 50,
    /**
   * Documents the object literal property `air` (air: 30).

   * Purpose: Supports maintainability by documenting why `air` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
air: 30,
};

/**
 * Documents the module-scope binding `MAX_UNITS_PER_TYPE` (MAX_UNITS_PER_TYPE: Readonly<Record<BuildUnitType, number>>).

 * Purpose: Supports maintainability by documenting why `MAX_UNITS_PER_TYPE` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const MAX_UNITS_PER_TYPE: Readonly<Record<BuildUnitType, number>> = {
    /**
   * Documents the object literal property `infantry` (infantry: 12).

   * Purpose: Supports maintainability by documenting why `infantry` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
infantry: 12,
    /**
   * Documents the object literal property `armor` (armor: 8).

   * Purpose: Supports maintainability by documenting why `armor` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
armor: 8,
    /**
   * Documents the object literal property `naval` (naval: 8).

   * Purpose: Supports maintainability by documenting why `naval` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
naval: 8,
    /**
   * Documents the object literal property `air` (air: 6).

   * Purpose: Supports maintainability by documenting why `air` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
air: 6,
};

/**
 * Defines the `estimateTurnsToNextSpawn` function shape (export function estimateTurnsToNextSpawn( nextUnitType: BuildUnitType | null | undefined, storedPoints: number, capacityPerTurn: number ): number | nu).

 * Purpose: Supports maintainability by documenting why `estimateTurnsToNextSpawn` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function estimateTurnsToNextSpawn(
  nextUnitType: BuildUnitType | null | undefined,
  storedPoints: number,
  capacityPerTurn: number
): number | null {
  if (!nextUnitType) return null;
  const unitCost = UNIT_COST_BY_TYPE[nextUnitType];
  const safeCapacity = Math.max(0, Math.trunc(capacityPerTurn));
  if (safeCapacity <= 0) return null;
  const safeStoredPoints = Math.max(0, Math.trunc(storedPoints));
  const deficit = Math.max(0, unitCost - safeStoredPoints);
  return Math.max(1, Math.ceil(deficit / safeCapacity));
}

/**
 * Documents the `BuildQueueProductionEntry` interface as a named contract surface (export interface BuildQueueProductionEntry).

 * Purpose: Describes one ordered build-queue row for shared production math (same shape as main-process queue rows).
 * When to use: Pass into `applyProduction` / `estimateTurnsToCompleteQueuedProduction` when simulating spend order.
 * Expected outcome: Callers treat `remainingCount` as units not yet built for that row.
 * Exceptions: None.
 */
export interface BuildQueueProductionEntry {
  /**
   * Specifies the contract for the `id` member (id: number;).

   * Contract: Stable row identity for deterministic tie-breaking when `queueIndex` matches.
   * When to use: Supply the database id for each queue row when available.
   * Expected outcome: Sorting uses `queueIndex` first, then `id`.
   * Exceptions: None.
   */
  id: number;
  /**
   * Specifies the contract for the `queueIndex` member (queueIndex: number;).

   * Contract: Zero-based order of production priority within a hex queue.
   * When to use: Match persisted queue ordering from the build queue table.
   * Expected outcome: Lower indices spend production points before higher indices.
   * Exceptions: None.
   */
  queueIndex: number;
  /**
   * Specifies the contract for the `unitType` member (unitType: BuildUnitType;).

   * Contract: The unit type being built for this queue row.
   * When to use: Must be a key present in `UNIT_COST_BY_TYPE`.
   * Expected outcome: Costs are read from `UNIT_COST_BY_TYPE`.
   * Exceptions: None.
   */
  unitType: BuildUnitType;
  /**
   * Specifies the contract for the `remainingCount` member (remainingCount: number;).

   * Contract: How many units remain to build in this row.
   * When to use: Use non-negative integers; values are truncated to integers at simulation boundaries.
   * Expected outcome: Count decreases as simulated turns spend points.
   * Exceptions: None.
   */
  remainingCount: number;
}

/**
 * Defines the `applyProduction` function shape (export function applyProduction( entries: BuildQueueProductionEntry[], storedPoints: number, urbanHexCount: number ): { updatedEntries: BuildQueueProductionEntry[]; storedPoints: number; spawnedUnitTypes: BuildUnitType[] }).

 * Purpose: Applies one planning-phase production pulse: adds urban capacity to stored points, then spends in strict queue order until the next unit is unaffordable.
 * When to use: Shared by the main process rules module and UI simulations that must match game spend order.
 * Expected outcome: Returns updated queue rows, leftover stored points after spending, and a list of spawned unit types (one entry per spawned unit).
 * Exceptions: None.
 */
export function applyProduction(
  entries: BuildQueueProductionEntry[],
  storedPoints: number,
  urbanHexCount: number
): {
  updatedEntries: BuildQueueProductionEntry[];
  storedPoints: number;
  spawnedUnitTypes: BuildUnitType[];
} {
  const sorted = [...entries].sort((a, b) => a.queueIndex - b.queueIndex || a.id - b.id);
  const updated: BuildQueueProductionEntry[] = sorted.map((entry) => ({ ...entry }));
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

/**
 * Defines the `sumQueuedProductionCost` function shape (export function sumQueuedProductionCost( entries: ReadonlyArray<{ unitType: BuildUnitType; count: number }> ): number).

 * Purpose: Totals IPC-style build costs for all queued units (cost × count per row), ignoring stored production points.
 * When to use: Build popup “queue cost” summaries where the UI needs a single currency total.
 * Expected outcome: Returns a non-negative integer sum of `UNIT_COST_BY_TYPE` contributions.
 * Exceptions: None.
 */
export function sumQueuedProductionCost(
  entries: ReadonlyArray<{ unitType: BuildUnitType; count: number }>
): number {
  let sum = 0;
  for (const row of entries) {
    const cost = UNIT_COST_BY_TYPE[row.unitType];
    sum += cost * Math.max(0, Math.trunc(row.count));
  }
  return sum;
}

/**
 * Defines the `estimateTurnsToCompleteQueuedProduction` function shape (export function estimateTurnsToCompleteQueuedProduction( entries: ReadonlyArray<{ id: number; queueIndex: number; unitType: BuildUnitType; count: number }>, storedPoints: number, capacityPerTurn: number ): number | null).

 * Purpose: Estimates how many repeated `applyProduction` turns are needed to fully drain the queue at a fixed per-turn urban capacity, including carry-over stored points.
 * When to use: Build popup queue ETA line; returns `null` when capacity is zero with a non-empty queue or when no forward progress is detected.
 * Expected outcome: `0` for an empty queue; otherwise a positive integer turn count, or `null` if the queue cannot be completed under this model.
 * Exceptions: None.
 */
export function estimateTurnsToCompleteQueuedProduction(
  entries: ReadonlyArray<{ id: number; queueIndex: number; unitType: BuildUnitType; count: number }>,
  storedPoints: number,
  capacityPerTurn: number
): number | null {
  let working: BuildQueueProductionEntry[] = entries
    .map((e) => ({
      id: e.id,
      queueIndex: e.queueIndex,
      unitType: e.unitType,
      remainingCount: Math.max(0, Math.trunc(e.count)),
    }))
    .sort((a, b) => a.queueIndex - b.queueIndex || a.id - b.id);
  let stored = Math.max(0, Math.trunc(storedPoints));
  const cap = Math.max(0, Math.trunc(capacityPerTurn));

  const remainingUnits = (): number => working.reduce((acc, row) => acc + row.remainingCount, 0);
  if (remainingUnits() === 0) return 0;
  if (cap < 1) return null;

  let turns = 0;
  const maxTurns = 1_000_000;
  while (remainingUnits() > 0) {
    const before = JSON.stringify({ working, stored });
    const result = applyProduction(working, stored, cap);
    working = result.updatedEntries;
    stored = result.storedPoints;
    turns++;
    const after = JSON.stringify({ working, stored });
    if (after === before) return null;
    if (turns > maxTurns) return null;
  }
  return turns;
}
