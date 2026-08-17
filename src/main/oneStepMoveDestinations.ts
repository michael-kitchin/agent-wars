/**
 * One-step legal move destinations for AI order validation and prompt precomputation.
 * Land units use res-1 land-mass edge reachability; naval units use berth/egress strategic edges.
 */

import { gridDisk, gridDistance } from 'h3-js';
import type { GameStateSnapshot } from './gameDb';
import { logDebug } from './logger';
import { passabilityAllowsNavalUnit } from '../shared/pipelineTerrain';
import {
  getLandMassReachableHexes,
} from '../shared/landTraversalRes1';
import { MOVEMENT_RANGE_BY_UNIT_TYPE } from '../shared/tacticalRanges';
import { getRes1LandMassByH3 } from './terrainClassificationCache';
import { isEmbarkedLandUnit } from './game-actions/sealift';
import {
  getNavalStrategicReachableHexes,
  navalLookupForHexState,
} from './navalStrategicPath';

/**
 * Returns native movement terrain for a hex without promoting seaports to coastal.
 *
 * Purpose: Remaining call sites that still need a terrain string must not treat inland ports as water.
 * When to use: Pass any hex row; seaport counts are ignored for classification.
 * Expected outcome: The hex's own `terrain`, or `'land'` when the hex is missing.
 * Exceptions: None.
 */
export function resolveMovementTerrainForHex(
  hex: { h3Index: string; terrain: string } | undefined
): string {
  if (!hex) return 'land';
  return hex.terrain;
}

/**
 * Returns all legal destinations for a unit within movement range (including its current hex when occupiable).
 *
 * Purpose: Single source of truth for AI order generation and order validation movement legality on the strategic map.
 * When to use: Pass the acting unit and the current game snapshot; set `assumeDebarkedForReachability` when validating opponent movement that will auto-debark before marching.
 * Expected outcome: Land units: hexes reachable via land-mass edges within range. Naval: berth/egress BFS within range.
 * Exceptions: Never throws; pentagon edges fall through to a legacy scan for non-naval water-like types only.
 *
 * Tactical Best Options uses `collectTacticalLegalMoveDestinationRes4Hexes` instead (res4 MP reachability with the same
 * “one origin search → list destinations” shape as `getLandMassReachableHexes` here).
 */
export function getValidDestinations(
  unit: { id?: string; h3Index: string; unitType: string },
  state: GameStateSnapshot,
  options?: { assumeDebarkedForReachability?: boolean }
): string[] {
  logDebug('oneStepMoveDestinations getValidDestinations', {
    unitId: unit.id,
    unitType: unit.unitType,
    originH3: unit.h3Index,
  });
  const range = MOVEMENT_RANGE_BY_UNIT_TYPE[unit.unitType] ?? 1;
  const wantLand = unit.unitType === 'infantry' || unit.unitType === 'armor';
  const hexSet = new Set(state.hexes.map((h) => h.h3Index));

  if (wantLand) {
    if (unit.id && isEmbarkedLandUnit(unit.id) && !options?.assumeDebarkedForReachability) {
      return [unit.h3Index];
    }
    return [...getLandMassReachableHexes({
      originH3: unit.h3Index,
      hexSet,
      data: getRes1LandMassByH3(),
      maxDepth: range,
    })];
  }

  if (unit.unitType === 'naval') {
    const lookup = navalLookupForHexState(state, state.hexes, state.res1Infrastructure);
    return [...getNavalStrategicReachableHexes({
      originH3: unit.h3Index,
      maxSteps: range,
      lookup,
    })];
  }

  const hexByH3 = new Map(state.hexes.map((h) => [h.h3Index, h]));
  const valid: string[] = [unit.h3Index];

  const applyNavalFilter = (h3Index: string): boolean => {
    const hex = hexByH3.get(h3Index);
    return passabilityAllowsNavalUnit(resolveMovementTerrainForHex(hex));
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
  state: GameStateSnapshot,
  options?: { assumeDebarkedForReachability?: boolean }
): string[] {
  const occupied = new Set(state.units.map((u) => u.h3Index));
  return getValidDestinations(unit, state, options).filter((h3) => !occupied.has(h3));
}
