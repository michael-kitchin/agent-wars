/**
 * One-step legal move destinations for AI order validation and prompt precomputation.
 * Land units use res-1 land-mass edge reachability; naval units use terrain passability.
 */

import { gridDisk, gridDistance } from 'h3-js';
import type { GameStateSnapshot } from './gameDb';
import { passabilityAllowsNavalUnit } from '../shared/pipelineTerrain';
import {
  allowsLandUnitStepWithOptionalSeaportDebark,
  getLandMassReachableHexes,
  landUnitCanOccupyHex,
} from '../shared/landTraversalRes1';
import { MOVEMENT_RANGE_BY_UNIT_TYPE } from '../shared/tacticalRanges';
import { getRes1InfrastructureForHex } from './gameDb';
import { getRes1LandMassByH3 } from './terrainClassificationCache';
import { isEmbarkedLandUnitOnWater } from './game-actions/sealift';

/**
 * Returns the effective movement terrain class for a hex, upgrading `land` to `coastal` when a seaport is present.
 *
 * Purpose: Centralizes the seaport-promotion rule so naval destination checks stay consistent.
 * When to use: Pass any hex row and the seaport-count map built from `res1Infrastructure`.
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
 * Returns all legal destinations for a unit within movement range (including its current hex).
 *
 * Purpose: Single source of truth for AI order generation and order validation movement legality.
 * When to use: Pass the acting unit and the current game snapshot.
 * Expected outcome: Land units: hexes reachable via land-mass edges within range. Naval: terrain-passable hexes within range.
 * Exceptions: Never throws; pentagon edges fall through to a legacy scan for naval only.
 */
export function getValidDestinations(
  unit: { id?: string; h3Index: string; unitType: string },
  state: GameStateSnapshot
): string[] {
  const range = MOVEMENT_RANGE_BY_UNIT_TYPE[unit.unitType] ?? 1;
  const wantLand = unit.unitType === 'infantry' || unit.unitType === 'armor';
  const hexSet = new Set(state.hexes.map((h) => h.h3Index));

  if (wantLand) {
    let seaportDisembarkOriginH3: string | undefined;
    let maxDepth = range;
    if (
      unit.id &&
      isEmbarkedLandUnitOnWater(unit.id) &&
      getRes1InfrastructureForHex(unit.h3Index).seaportCount > 0
    ) {
      seaportDisembarkOriginH3 = unit.h3Index;
      maxDepth = 1;
    }
    return [...getLandMassReachableHexes({
      originH3: unit.h3Index,
      hexSet,
      data: getRes1LandMassByH3(),
      maxDepth,
      seaportDisembarkOriginH3,
    })];
  }

  const seaportCountByHex = new Map((state.res1Infrastructure ?? []).map((row) => [row.h3Index, row.seaportCount] as const));
  const hexByH3 = new Map(state.hexes.map((h) => [h.h3Index, h]));
  const valid: string[] = [unit.h3Index];

  const applyNavalFilter = (h3Index: string): boolean => {
    const hex = hexByH3.get(h3Index);
    const movementTerrain = resolveMovementTerrainForHex(hex, seaportCountByHex);
    return passabilityAllowsNavalUnit(movementTerrain);
  };

  try {
    const candidates = gridDisk(unit.h3Index, range);
    for (const h3 of candidates) {
      if (h3 === unit.h3Index || !hexSet.has(h3)) continue;
      if (!applyNavalFilter(h3)) continue;
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
    if (!applyNavalFilter(h.h3Index)) continue;
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
  unit: { id?: string; h3Index: string; unitType: string },
  state: GameStateSnapshot
): string[] {
  const occupied = new Set(state.units.map((u) => u.h3Index));
  return getValidDestinations(unit, state).filter((h3) => !occupied.has(h3));
}
