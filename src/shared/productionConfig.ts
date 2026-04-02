import type { BuildUnitType } from './ipcTypes';

/** Canonical unit production costs used by backend logic and UI labels. */
export const UNIT_COST_BY_TYPE: Readonly<Record<BuildUnitType, number>> = {
  infantry: 10,
  armor: 20,
  naval: 50,
};

/** Canonical milestone-1.4 deployment caps for the three producible unit types. */
export const MAX_UNITS_PER_TYPE: Readonly<Record<BuildUnitType, number>> = {
  infantry: 6,
  armor: 4,
  naval: 4,
};

/**
 * Why this exists:
 *     Computes the label-facing "turns to next spawn" estimate from current stored points, unit cost,
 *     and per-turn urban production so UI text matches the milestone production contract.
 * When to use:
 *     Any surface that renders `N1c / N2t` production timing for the next spawn event.
 * What to expect:
 *     Returns `null` when the estimate is not computable (invalid unit or zero capacity);
 *     otherwise returns a positive integer turn count, where 1 means "spawns this turn".
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
