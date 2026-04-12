/**
 * One-step legal move destinations for AI order validation and prompt precomputation.
 * Mirrors the movement rules used by OpenRouter AI order validation (grid distance + terrain).
 */

import { gridDistance } from 'h3-js';
import type { GameStateSnapshot } from './gameDb';
import { passabilityAllowsLandUnit, passabilityAllowsNavalUnit } from '../shared/pipelineTerrain';
import { MOVEMENT_RANGE_BY_UNIT_TYPE } from '../shared/tacticalRanges';
/**
 * Defines the `resolveMovementTerrainForHex` function shape (export function resolveMovementTerrainForHex().

 * Purpose: Supports maintainability by documenting why `resolveMovementTerrainForHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function resolveMovementTerrainForHex(
  hex: { h3Index: string; terrain: string } | undefined,
  seaportCountByHex: Map<string, number>
): string {
  if (!hex) return 'land';
  return (seaportCountByHex.get(hex.h3Index) ?? 0) > 0 ? 'coastal' : hex.terrain;
}

/**
 * Defines the `getValidDestinations` function shape (export function getValidDestinations().

 * Purpose: Supports maintainability by documenting why `getValidDestinations` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getValidDestinations(
  unit: { h3Index: string; unitType: string },
  state: GameStateSnapshot
): string[] {
  const range = MOVEMENT_RANGE_BY_UNIT_TYPE[unit.unitType] ?? 1;
  const wantLand = unit.unitType === 'infantry' || unit.unitType === 'armor';
  const seaportCountByHex = new Map((state.res1Infrastructure ?? []).map((row) => [row.h3Index, row.seaportCount] as const));
  const valid: string[] = [unit.h3Index];
  for (const h of state.hexes) {
    if (h.h3Index === unit.h3Index) continue;
    let dist: number;
    try {
      dist = gridDistance(unit.h3Index, h.h3Index);
    } catch {
      continue;
    }
    if (dist < 1 || dist > range) continue;
    const movementTerrain = resolveMovementTerrainForHex(h, seaportCountByHex);
    if (unit.unitType === 'naval' && !passabilityAllowsNavalUnit(movementTerrain)) continue;
    if (wantLand && !passabilityAllowsLandUnit(movementTerrain)) continue;
    valid.push(h.h3Index);
  }
  return valid;
}

/**
 * Defines the `getValidDestinationsUnoccupied` function shape (export function getValidDestinationsUnoccupied().

 * Purpose: Supports maintainability by documenting why `getValidDestinationsUnoccupied` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getValidDestinationsUnoccupied(
  unit: { h3Index: string; unitType: string },
  state: GameStateSnapshot
): string[] {
  const occupied = new Set(state.units.map((u) => u.h3Index));
  return getValidDestinations(unit, state).filter((h3) => !occupied.has(h3));
}
