/**
 * One-step legal move destinations for AI order validation and prompt precomputation.
 * Mirrors the movement rules used by OpenRouter AI order validation (grid distance + terrain).
 */

import { gridDistance, gridDisk } from 'h3-js';
import type { GameStateSnapshot } from './gameDb';
import { passabilityAllowsLandUnit, passabilityAllowsNavalUnit } from '../shared/pipelineTerrain';
import { MOVEMENT_RANGE_BY_UNIT_TYPE } from '../shared/tacticalRanges';
/**
 * Returns the effective movement terrain class for a hex, upgrading `land` to `coastal` when a seaport is present.
 *
 * Purpose: Centralizes the seaport-promotion rule so `getValidDestinations` and callers stay consistent.
 * When to use: Pass any hex row and the seaport-count map built from `res1Infrastructure`; pass `undefined` for out-of-map hexes.
 * Expected outcome: `'coastal'` when at least one seaport exists on the hex; otherwise the hex's own terrain value or `'land'` for unknown hexes.
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
 * Returns all legal one-step destinations for a unit (including its current hex) given movement range and terrain.
 *
 * Purpose: Single source of truth for AI order generation and order validation movement legality.
 * When to use: Pass the acting unit and the current game snapshot; result includes the unit's own hex as a no-op move.
 * Expected outcome: All hexes within MOVEMENT_RANGE_BY_UNIT_TYPE steps that pass terrain passability for the unit type.
 * Fast path uses `gridDisk`; pentagon-edge failures fall back to a full hex scan with `gridDistance`.
 * Exceptions: Never throws; pentagon edges silently fall through to the legacy scan.
 */
export function getValidDestinations(
  unit: { h3Index: string; unitType: string },
  state: GameStateSnapshot
): string[] {
  const range = MOVEMENT_RANGE_BY_UNIT_TYPE[unit.unitType] ?? 1;
  const wantLand = unit.unitType === 'infantry' || unit.unitType === 'armor';
  const seaportCountByHex = new Map((state.res1Infrastructure ?? []).map((row) => [row.h3Index, row.seaportCount] as const));
  const hexSet = new Set(state.hexes.map((h) => h.h3Index));
  const hexByH3 = new Map(state.hexes.map((h) => [h.h3Index, h]));
  const valid: string[] = [unit.h3Index];

  const applyTerrainFilter = (h3Index: string): boolean => {
    const hex = hexByH3.get(h3Index);
    const movementTerrain = resolveMovementTerrainForHex(hex, seaportCountByHex);
    if (unit.unitType === 'naval' && !passabilityAllowsNavalUnit(movementTerrain)) return false;
    if (wantLand && !passabilityAllowsLandUnit(movementTerrain)) return false;
    return true;
  };

  try {
    const candidates = gridDisk(unit.h3Index, range);
    for (const h3 of candidates) {
      if (h3 === unit.h3Index || !hexSet.has(h3)) continue;
      if (!applyTerrainFilter(h3)) continue;
      valid.push(h3);
    }
    return valid;
  } catch {
    /* pentagon edge — fall back to legacy full scan */
  }

  for (const h of state.hexes) {
    if (h.h3Index === unit.h3Index) continue;
    let dist: number;
    try {
      dist = gridDistance(unit.h3Index, h.h3Index);
    } catch {
      continue;
    }
    if (dist < 1 || dist > range) continue;
    if (!applyTerrainFilter(h.h3Index)) continue;
    valid.push(h.h3Index);
  }
  return valid;
}

/**
 * Returns legal one-step destinations filtered to hexes not currently occupied by any unit.
 *
 * Purpose: Convenience wrapper for AI order generation where units cannot stack on occupied hexes.
 * When to use: Use instead of `getValidDestinations` when the caller needs to exclude occupied hexes from consideration.
 * Expected outcome: Subset of `getValidDestinations` with hexes currently holding any unit removed.
 * Exceptions: Never throws.
 */
export function getValidDestinationsUnoccupied(
  unit: { h3Index: string; unitType: string },
  state: GameStateSnapshot
): string[] {
  const occupied = new Set(state.units.map((u) => u.h3Index));
  return getValidDestinations(unit, state).filter((h3) => !occupied.has(h3));
}
