/**
 * Snapshot answers for where a ship can load, sail, and land.
 *
 * Purpose: Later callers share one reading of embark, debark, sail time, landing hexes, and nearby units.
 * When to use: Pass the snapshot the caller already has. This module does not read or write the database.
 * Expected outcome: Predicates and counts from that snapshot. A hex that is not on the map is not a legal port.
 * Exceptions: `landingHexes` logs and returns an empty list when the neighbour ring cannot be built.
 */

import { gridDisk } from 'h3-js';
import { getMovementBudget } from '../combatConstants';
import type { GameStateSnapshot } from '../gameDb';
import { logError, logTrace } from '../logger';
import {
  getNavalStrategicDistanceAndTurns,
  navalLookupForHexState,
  navalStrategicHexIsOccupiable,
} from '../navalStrategicPath';
import { isWithinGridRangePure } from '../../shared/h3GridRangePure';
import { canLandUnitTraverseEdge, type LandMassByH3 } from '../../shared/landTraversalStrategic';
import { canEmbarkAtHex, canManualDebarkAtHex } from '../../shared/sealiftEmbarkEligibility';

/**
 * Reads of one snapshot for lift.
 *
 * Purpose: Callers keep the snapshot and the land mass outside this object.
 * When to use: The return of `buildLiftTerrain`.
 * Expected outcome: Each method answers from the snapshot given at construction.
 * Exceptions: `landingHexes` returns an empty list when the neighbour ring throws.
 */
export interface LiftTerrain {
  /**
   * Whether the seat may embark at the hex.
   *
   * Contract: False when the hex is missing. Otherwise `canEmbarkAtHex` for the snapshot's terrain, seaport, and control.
   * When to use: Before treating a hex as a muster port.
   * Expected outcome: True for coastal land, a land seaport, and a water seaport this seat controls.
   * Exceptions: None.
   */
  readonly embarkLegal: (h3Index: string) => boolean;
  /**
   * Whether the seat may debark at the hex.
   *
   * Contract: False when the hex is missing. Otherwise `canManualDebarkAtHex` for the same facts as `embarkLegal`.
   * When to use: Before treating a hex as a place cargo can leave a ship.
   * Expected outcome: True for coastal land, wetlands, a land seaport, and a water seaport this seat controls.
   * Exceptions: None.
   */
  readonly debarkLegal: (h3Index: string) => boolean;
  /**
   * Whether a ship may occupy the hex.
   *
   * Contract: The naval occupancy lookup for this snapshot.
   * When to use: Before counting a hex as a berth or a sailing hex.
   * Expected outcome: True for water, coastal land, and a land seaport that is on the snapshot.
   * Exceptions: None.
   */
  readonly shipCanEnter: (h3Index: string) => boolean;
  /**
   * Sailing turns between two hexes.
   *
   * Contract: Zero when the hexes are equal, and that call is not a route check. Otherwise the naval estimate, or null when no path exists.
   * When to use: From a ship hex to a port or a landing hex.
   * Expected outcome: A non-negative turn count, or null. The equal case does not use the path search.
   * Exceptions: None. A missing path is null, not a throw.
   */
  readonly sailTurns: (fromH3: string, toH3: string) => number | null;
  /**
   * Hexes where a ship can put cargo ashore beside a city.
   *
   * Contract: The city and its on-map neighbours that a ship can enter and where cargo can debark. A neighbour must also have a land step onto the city.
   * When to use: After a city has been chosen.
   * Expected outcome: Hex ids sorted with `<`. Empty when the ring cannot be built.
   * Exceptions: A thrown neighbour ring is logged and returned as an empty list.
   */
  readonly landingHexes: (cityH3: string) => readonly string[];
  /**
   * Units of every other side, including neutral garrisons, within a radius.
   *
   * Contract: The seat's own units are not counted. Radius 0 is the hex itself.
   * When to use: A clear city uses `LIFT_OBJECTIVE_CLEAR_RADIUS`.
   * Expected outcome: A non-negative count. An unmeasurable hex is not counted and does not throw.
   * Exceptions: None.
   */
  readonly enemyUnitsWithin: (h3Index: string, radius: number) => number;
  /**
   * How many unequal sail queries this object has made.
   *
   * Contract: The equal-hex case is not included. A null result is included.
   * When to use: After a search, when the caller wants to know how much routing ran.
   * Expected outcome: The count since this object was built.
   * Exceptions: None.
   */
  readonly routeChecks: () => number;
}

/**
 * Builds the lift readings for one snapshot and one seat.
 *
 * Purpose: Embark, debark, sailing, landing, and nearby units stay on one pass over the snapshot.
 * When to use: Once per seat per decision, with that seat's id and the land mass for landing steps.
 * Expected outcome: Methods that read the snapshot and do not touch the database. The construction logs once.
 * Exceptions: None. Neighbour-ring failures are reported by `landingHexes`.
 */
export function buildLiftTerrain(args: {
  readonly state: GameStateSnapshot;
  readonly seatId: string;
  readonly landMass: LandMassByH3;
}): LiftTerrain {
  const infraByHex = new Map((args.state.strategicInfrastructure ?? []).map((row) => [row.h3Index, row]));
  const controlByHex = new Map((args.state.strategicControl ?? []).map((row) => [row.h3Index, row.controllerPlayerId]));
  const hexById = new Map(args.state.hexes.map((hex) => [hex.h3Index, hex]));
  const onMap = new Set(hexById.keys());
  const lookup = navalLookupForHexState(args.state, args.state.hexes, args.state.strategicInfrastructure);
  let routeCheckCount = 0;
  logTrace('liftTerrain buildLiftTerrain', { seatId: args.seatId, hexCount: args.state.hexes.length });

  /**
   * Terrain and control flags for one hex.
   *
   * Purpose: Embark and debark must use the same snapshot facts.
   * When to use: From `embarkLegal` and `debarkLegal`.
   * Expected outcome: Null when the hex is not on the snapshot.
   * Exceptions: None.
   */
  const eligibility = (h3Index: string) => {
    const hex = hexById.get(h3Index);
    if (!hex) return null;
    return {
      nativeTerrain: hex.terrain,
      terrainKind: hex.terrainKind,
      hasSeaport: Number(infraByHex.get(h3Index)?.seaportCount ?? 0) > 0,
      hexControlledByPlayer: controlByHex.get(h3Index) === args.seatId,
    };
  };

  const embarkLegal = (h3Index: string): boolean => {
    const attrs = eligibility(h3Index);
    return attrs !== null && canEmbarkAtHex(attrs);
  };
  const debarkLegal = (h3Index: string): boolean => {
    const attrs = eligibility(h3Index);
    return attrs !== null && canManualDebarkAtHex(attrs);
  };
  const shipCanEnter = (h3Index: string): boolean => navalStrategicHexIsOccupiable(h3Index, lookup);
  const sailTurns = (fromH3: string, toH3: string): number | null => {
    if (fromH3 === toH3) return 0;
    routeCheckCount += 1;
    const found = getNavalStrategicDistanceAndTurns({
      originH3: fromH3,
      destinationH3: toH3,
      lookup,
      movementBudget: getMovementBudget('naval'),
    });
    return found?.estimatedTurns ?? null;
  };
  const landingHexes = (cityH3: string): readonly string[] => {
    let ring: string[];
    try {
      ring = gridDisk(cityH3, 1);
    } catch (err) {
      logError('liftTerrain landingHexes: gridDisk threw', err);
      return [];
    }
    const found: string[] = [];
    for (const h3 of ring) {
      if (!onMap.has(h3) || !debarkLegal(h3) || !shipCanEnter(h3)) continue;
      if (h3 !== cityH3 && !canLandUnitTraverseEdge(h3, cityH3, args.landMass)) continue;
      found.push(h3);
    }
    found.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
    return found;
  };
  const enemyUnitsWithin = (h3Index: string, radius: number): number => {
    let count = 0;
    for (const unit of args.state.units) {
      if (unit.player === args.seatId) continue;
      if (isWithinGridRangePure(h3Index, unit.h3Index, radius)) count += 1;
    }
    return count;
  };
  return {
    embarkLegal,
    debarkLegal,
    shipCanEnter,
    sailTurns,
    landingHexes,
    enemyUnitsWithin,
    routeChecks: () => routeCheckCount,
  };
}
