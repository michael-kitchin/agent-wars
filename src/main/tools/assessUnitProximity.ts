/**
 * Grid-hop proximity helpers for assess_unit when fog of war is off on the strategic map.
 *
 * Purpose: Cheap omniscient nearest-enemy / nearest-friendly scoring without path BFS.
 * When to use: assess_unit and strategic briefing copy that must know whether the unbounded grid scan applies.
 * Expected outcome: Gate is true only for fogOfWarEnabled === false and H3 resolution 1; distances are neighbor hop counts; turns never divide by a sub-1 budget.
 * Exceptions: Invalid H3 indexes make the gate false; hop search skips invalid or unreachable cells.
 */

import { getResolution, gridDisk, gridDistance, isValidCell } from 'h3-js';
import { computeGridDistanceWithPathFallbackPure } from '../../shared/h3GridRangePure';
import { getRange } from '../combatConstants';
import { logDebug, logError, logTrace } from '../logger';
import { getMovementBudgetForUnit } from '../pathfinding';
import { h3ToLatLng, type LatLng, type LatLngMap } from './h3LatLng';

/**
 * Named arguments for the omniscient-grid gate.
 *
 * Purpose: Named fog-plus-resolution arguments for both honesty-line gates.
 * When to use: `usesOmniscientGridProximity` and `usesFogPathDistanceBriefing` from assess_unit and briefing formatters.
 * Expected outcome: Callers pass the assessed unit (or any representative strategic hex) plus the snapshot fog flag.
 * Exceptions: None.
 */
export interface OmniscientGridProximityArgs {
  /**
   * Match fog-of-war flag from the snapshot.
   *
   * Contract: Omniscient scan requires this to be exactly `false`. Fog-on path briefing requires exactly `true`.
   * When to use: `state.fogOfWarEnabled`.
   * Expected outcome: `undefined` is treated as neither omniscient nor fog-path.
   * Exceptions: None.
   */
  fogOfWarEnabled?: boolean;
  /**
   * H3 index whose resolution selects strategic vs tactical geometry.
   *
   * Contract: Must be resolution 1 for the unbounded grid scan. Resolution 4 (tactical) is never omniscient.
   * When to use: Assessed unit `h3Index`, or `state.hexes[0].h3Index` in strategic briefings.
   * Expected outcome: Invalid indexes fail the gate.
   * Exceptions: None.
   */
  h3Index: string;
}

/**
 * True when assess_unit should include every other unit and score them with grid hops.
 *
 * Purpose: Combines the match fog setting with strategic (res1) geometry so tactical snapshots that force fog off do not take this path.
 * When to use: Before the assess_unit scan and before inserting the briefing honesty line.
 * Expected outcome: True only for `fogOfWarEnabled === false` and `getResolution(h3Index) === 1`.
 * Exceptions: Returns false if resolution lookup throws.
 */
export function usesOmniscientGridProximity(args: OmniscientGridProximityArgs): boolean {
  logTrace('assessUnitProximity usesOmniscientGridProximity', {
    fogOfWarEnabled: args.fogOfWarEnabled ?? null,
    h3Index: args.h3Index,
  });
  if (args.fogOfWarEnabled !== false) return false;
  try {
    return getResolution(args.h3Index) === 1;
  } catch (err) {
    logError('assessUnitProximity usesOmniscientGridProximity: resolution lookup failed', {
      h3Index: args.h3Index,
      err,
    });
    return false;
  }
}

/**
 * True when Unit Status distances are march/sail paths and the fog-on honesty line belongs in the briefing.
 *
 * Purpose: The path-versus-Best-Options sentence is only meaningful at strategic resolution under fog.
 * When to use: `formatBriefing` after the omniscient hop line is skipped.
 * Expected outcome: True only for `fogOfWarEnabled === true` and `getResolution(h3Index) === 1`.
 * Exceptions: Returns false if resolution lookup throws.
 */
export function usesFogPathDistanceBriefing(args: OmniscientGridProximityArgs): boolean {
  logTrace('assessUnitProximity usesFogPathDistanceBriefing', {
    fogOfWarEnabled: args.fogOfWarEnabled ?? null,
    h3Index: args.h3Index,
  });
  if (args.fogOfWarEnabled !== true) return false;
  try {
    return getResolution(args.h3Index) === 1;
  } catch (err) {
    logError('assessUnitProximity usesFogPathDistanceBriefing: resolution lookup failed', {
      h3Index: args.h3Index,
      err,
    });
    return false;
  }
}

/**
 * H3 grid hop count between two cells, or null when distance is unavailable.
 *
 * Purpose: Diagnostic wrapper around `gridDistance` for tests and tooling that must distinguish throw vs hop BFS.
 * When to use: Assertions that a pair is a pentagon-crossing `gridDistance` failure. Omniscient assess_unit uses `gridHopDistancesFrom` instead.
 * Expected outcome: Non-negative finite hop count, including 0 for the same cell; null on throw or non-finite result.
 * Exceptions: Never throws.
 */
export function safeGridHexDistance(h3A: string, h3B: string): number | null {
  logTrace('assessUnitProximity safeGridHexDistance', { h3A, h3B });
  if (!isValidCell(h3A) || !isValidCell(h3B)) {
    logTrace('assessUnitProximity safeGridHexDistance: invalid cell', { h3A, h3B });
    return null;
  }
  try {
    const distance = gridDistance(h3A, h3B);
    if (!Number.isFinite(distance) || distance < 0) return null;
    return distance;
  } catch (err) {
    logTrace('assessUnitProximity safeGridHexDistance: gridDistance unavailable', { h3A, h3B, err });
    return null;
  }
}

/**
 * Turn estimate from grid hops and a movement budget.
 *
 * Purpose: Same ceil-division as path ETAs without emitting Infinity for air (budget 0).
 * When to use: Omniscient nearby-enemy / nearby-friendly `estimatedTurnsToReach` and reverse threat ETAs.
 * Expected outcome: 0 when hops ≤ 0; null when budget < 1; otherwise ceil(hops / budget).
 * Exceptions: None.
 */
export function estimatedTurnsFromGridDistance(hexDistance: number, movementBudget: number): number | null {
  logTrace('assessUnitProximity estimatedTurnsFromGridDistance', { hexDistance, movementBudget });
  if (hexDistance <= 0) return 0;
  if (!Number.isFinite(movementBudget) || movementBudget < 1) return null;
  return Math.ceil(hexDistance / movementBudget);
}

/**
 * Unweighted H3 hop counts from one cell to target cells.
 *
 * Purpose: `gridDistance` throws on pentagon-crossing global pairs; neighbor BFS still yields straight hex hops (not march paths).
 * When to use: Omniscient assess_unit pairing of the assessed unit with every other unit hex.
 * Expected outcome: Map includes the origin at 0 and each reachable target; missing keys mean unreachable or invalid.
 * Exceptions: Never throws; invalid origin yields an empty map.
 */
export function gridHopDistancesFrom(origin: string, targets: readonly string[]): Map<string, number> {
  logTrace('assessUnitProximity gridHopDistancesFrom', {
    origin,
    targetCount: targets.length,
  });
  const dist = new Map<string, number>();
  if (!isValidCell(origin)) return dist;
  dist.set(origin, 0);
  const remaining = new Set<string>();
  for (const target of targets) {
    if (target === origin || !isValidCell(target)) continue;
    remaining.add(target);
  }
  if (remaining.size === 0) return dist;
  const queue = [origin];
  for (let i = 0; i < queue.length && remaining.size > 0; i++) {
    const cur = queue[i]!;
    const depth = dist.get(cur)!;
    let ring: string[];
    try {
      ring = gridDisk(cur, 1);
    } catch (err) {
      logError('assessUnitProximity gridHopDistancesFrom: gridDisk failed', { cur, err });
      continue;
    }
    for (const neighbor of ring) {
      if (neighbor === cur || dist.has(neighbor) || !isValidCell(neighbor)) continue;
      dist.set(neighbor, depth + 1);
      queue.push(neighbor);
      remaining.delete(neighbor);
    }
  }
  return dist;
}

/**
 * H3 hop distance for one pair, covering pairs that `gridDistance` and `gridPathCells` both refuse to measure.
 *
 * Purpose: Best Options approach and the fog-on assess_unit radius scan must still measure pentagon-crossing pairs; dropping them hid legal moves and in-range enemies while the units were only a few hops apart.
 * When to use: Single-pair distances where skipping the pair would hide an action; prefer `gridHopDistancesFrom` when scoring many targets from one origin.
 * Expected outcome: Non-negative hop count matching `gridDistance` when that succeeds; otherwise the shared depth-capped BFS result, or null when no path can be derived.
 * Exceptions: Never throws; this is a logging wrapper over `computeGridDistanceWithPathFallbackPure` so the shared and main layers cannot drift.
 */
export function gridHopDistanceBetween(origin: string, target: string): number | null {
  logTrace('assessUnitProximity gridHopDistanceBetween', { origin, target });
  return computeGridDistanceWithPathFallbackPure(origin, target);
}

/**
 * Keeps the candidate hexes that strictly reduce hop distance to the nearest observed enemy cell.
 *
 * Purpose: Single definition of "closing the distance" so the Best Options approach rows and the Standing Order Status
 * suggested destinations cannot drift; a suggestion the model copies must be one Best Options would also have offered.
 * When to use: Pass already-legal this-turn destinations; this filter judges direction only and never re-checks legality.
 * Expected outcome: Subset of `hexes` in caller order that closes on at least one nearest enemy; empty when no enemy is
 * observed, no candidate is supplied, or nothing improves on the unit's current distance.
 * Exceptions: Never throws; pairs that stay unmeasurable even by BFS are skipped rather than guessed at.
 */
export function pickApproachHexesTowardNearestEnemy(
  unitH3: string,
  hexes: readonly string[],
  enemyOccupiedH3: ReadonlySet<string>
): string[] {
  if (hexes.length === 0) return [];
  const nearest = nearestEnemyHexesFrom(unitH3, enemyOccupiedH3);
  if (nearest === null) return [];
  const closing = hexes.filter((h3) => {
    const next = shortestHopDistanceToAny(h3, nearest.hexes);
    return next !== null && next < nearest.distance;
  });
  logTrace('assessUnitProximity pickApproachHexesTowardNearestEnemy', {
    unitH3,
    candidateCount: hexes.length,
    enemyOccupiedCount: enemyOccupiedH3.size,
    nearestDist: nearest.distance,
    closingCount: closing.length,
  });
  return closing;
}

/**
 * Finds the closest observed enemy-occupied cells and how far away they are.
 *
 * Purpose: Approach filtering and approach *ranking* both need the same "who is nearest" answer, and computing it twice
 * from separate scans is how the Best Options rows and the suggested destinations would silently disagree.
 * When to use: Any caller scoring movement toward the enemy; pass the enemy hexes the caller is allowed to see.
 * Expected outcome: The tied-nearest hexes plus their shared hop distance, or null when no enemy is measurable at all.
 * Exceptions: Never throws; unmeasurable pairs are skipped, so a non-null result always has at least one hex.
 */
export function nearestEnemyHexesFrom(
  originH3: string,
  enemyOccupiedH3: ReadonlySet<string>
): { hexes: string[]; distance: number } | null {
  if (enemyOccupiedH3.size === 0) return null;
  let distance = Infinity;
  const hexes: string[] = [];
  for (const enemyH3 of enemyOccupiedH3) {
    const d = gridHopDistanceBetween(originH3, enemyH3);
    if (d === null) continue;
    if (d < distance) {
      distance = d;
      hexes.length = 0;
      hexes.push(enemyH3);
    } else if (d === distance) {
      hexes.push(enemyH3);
    }
  }
  if (!Number.isFinite(distance) || hexes.length === 0) return null;
  return { hexes, distance };
}

/**
 * Measures the shortest hop distance from one hex to any hex in a target list.
 *
 * Purpose: Approach candidates are scored against a tied set of nearest enemies, not a single one.
 * When to use: Ranking or filtering candidate destinations against `nearestEnemyHexesFrom(...).hexes`.
 * Expected outcome: The minimum measurable hop count, or null when every pair is unmeasurable.
 * Exceptions: Never throws.
 */
export function shortestHopDistanceToAny(
  originH3: string,
  targetsH3: readonly string[]
): number | null {
  let best: number | null = null;
  for (const targetH3 of targetsH3) {
    const d = gridHopDistanceBetween(originH3, targetH3);
    if (d === null) continue;
    if (best === null || d < best) best = d;
  }
  return best;
}

/**
 * Honesty sentence when Unit Status distances use grid hops instead of march paths.
 *
 * Purpose: Single copy so briefing formatters and tests cannot drift.
 * When to use: Strategic formatBriefing when the omniscient grid scan is active.
 * Expected outcome: Tells the model that Unit Status distances are grid hops, not march paths, and that this-turn dests come from Best Options Target Hexes.
 * Exceptions: None.
 */
export const OMNISCIENT_GRID_PROXIMITY_BRIEFING_LINE =
  'Nearest-enemy distances and threat ETAs are H3 grid hops (straight hex count), not march or sail paths. Best Options This Turn Target Hexes are this-turn legal dests; use plan_route only for dests not listed for that unit.';

/**
 * Honesty sentence when Unit Status distances use march/sail paths under fog.
 *
 * Purpose: Fog-on assessments print path length while Best Options dests use this-turn legal hops, so a unit can
 * close this turn even when the printed path is longer than one movement budget.
 * When to use: Strategic formatBriefing immediately after the intel staleness sentence when fog is on at res1.
 * Expected outcome: Tells the model to copy Best Options Target Hexes rather than treating printed path length as the move budget.
 * Exceptions: None.
 */
export const FOG_PATH_DISTANCE_BRIEFING_LINE =
  'Nearest-enemy distances are march or sail path lengths when a path exists (otherwise a hop count). Best Options This Turn Target Hexes are already this-turn legal destinations — copy them even when the printed path is longer than one movement budget.';

/**
 * Minimal unit fields required to pair grid distances without a full snapshot type.
 *
 * Purpose: Keeps the omniscient collector free of gameDb while matching assess_unit unit rows.
 * When to use: `collectOmniscientNearbyUnits` assessed unit and `units` list.
 * Expected outcome: Id, owner, type, and current hex.
 * Exceptions: None.
 */
export interface OmniscientProximityUnit {
  /**
   * Unit id used in nearby/threat/attack rows.
   *
   * Contract: Must be unique within the `units` list.
   * When to use: Snapshot `units[].id`.
   * Expected outcome: Copied onto result rows.
   * Exceptions: None.
   */
  id: string;
  /**
   * Owning player id.
   *
   * Contract: Any string; inequality vs the assessed unit marks an enemy.
   * When to use: Snapshot `units[].player`.
   * Expected outcome: `'human'` vs `'opponent'` in production.
   * Exceptions: None.
   */
  player: string;
  /**
   * Unit type for range, budget, and row labels.
   *
   * Contract: Same strings as combat constants (`infantry` / `armor` / `naval` / `air`).
   * When to use: Snapshot `units[].unitType`.
   * Expected outcome: Unknown types use range 0 and budget 1 from those tables.
   * Exceptions: None.
   */
  unitType: string;
  /**
   * Occupied H3 index.
   *
   * Contract: Should be on the map; invalid or unreachable indexes are omitted from hop results.
   * When to use: Snapshot `units[].h3Index`.
   * Expected outcome: Neighbor hop counts are computed from this index.
   * Exceptions: None.
   */
  h3Index: string;
}

/**
 * Named arguments for the unbounded grid nearby scan.
 *
 * Purpose: One object for the collector so assess_unit stays under the argument-count limit.
 * When to use: Fog-off res1 `executeAssessUnit` branch.
 * Expected outcome: Nearby lists, threats, and in-range attack rows only.
 * Exceptions: None.
 */
export interface CollectOmniscientNearbyUnitsArgs {
  /**
   * Unit being assessed.
   *
   * Contract: Skipped when iterating `units`.
   * When to use: The `unit` row already loaded by assess_unit.
   * Expected outcome: Your-close ETAs use this unit’s movement budget.
   * Exceptions: None.
   */
  assessedUnit: OmniscientProximityUnit;
  /**
   * All snapshot units including the assessed unit.
   *
   * Contract: Self is ignored; every other unit is a candidate.
   * When to use: `state.units`.
   * Expected outcome: Enemies and friendlies both appear.
   * Exceptions: None.
   */
  units: readonly OmniscientProximityUnit[];
  /**
   * Current turn for `lastSeen`.
   *
   * Contract: Copied onto current-confidence enemy rows.
   * When to use: `state.turnNumber`.
   * Expected outcome: Integer turn label.
   * Exceptions: None.
   */
  turnNumber: number;
  /**
   * Session lat/lng map for enemy/friendly position tuples.
   *
   * Contract: Same map assess_unit already built.
   * When to use: Tool 2 `latLngByH3`.
   * Expected outcome: Cell-center fallback when a hex is missing.
   * Exceptions: None.
   */
  latLngByH3: LatLngMap;
}

/**
 * Result of pairing the assessed unit with every other unit by grid hops.
 *
 * Purpose: Drop-in lists for assess_unit’s return payload.
 * When to use: After `collectOmniscientNearbyUnits`.
 * Expected outcome: Sorted nearby lists; threats for enemies; in-range `canAttackThisTurn` only.
 * Exceptions: None.
 */
export interface OmniscientNearbyScanResult {
  /**
   * Enemy rows sorted nearest-first.
   *
   * Contract: `hexDistance` is grid hops; `estimatedTurnsToReach` uses the assessed unit’s budget.
   * When to use: assess_unit `nearbyEnemies`.
   * Expected outcome: Empty when no other-player units pair successfully.
   * Exceptions: None.
   */
  nearbyEnemies: Array<{
    unitId: string;
    type: string;
    position: LatLng;
    hexDistance: number;
    /**
     * Straight hop count to this enemy, always grid-based when measurable.
     *
     * Contract: Used by Action needed for this-turn closes; may differ from `hexDistance` under fog.
     * When to use: `canCloseThisTurn` in the briefing formatter.
     * Expected outcome: Non-negative hops, or omitted when the pair could not be measured.
     * Exceptions: None.
     */
    gridDistance?: number;
    estimatedTurnsToReach: number | null;
    inRangedRange: boolean;
    inMeleeRange: boolean;
    inEnemyRangedRange: boolean;
    confidence: string;
    lastSeen: number;
  }>;
  /**
   * Friendly rows sorted nearest-first.
   *
   * Contract: `estimatedTurnsToReach` uses the friendly’s budget to reach the assessed hex.
   * When to use: assess_unit `nearbyFriendlies`.
   * Expected outcome: Empty when the assessed unit is alone on its side.
   * Exceptions: None.
   */
  nearbyFriendlies: Array<{
    unitId: string;
    type: string;
    position: LatLng;
    hexDistance: number;
    estimatedTurnsToReach: number | null;
  }>;
  /**
   * One threat per included enemy.
   *
   * Contract: Critical if they can shoot or share the hex; moderate if reverse ETA ≤ 2; else low.
   * When to use: assess_unit `threats`.
   * Expected outcome: Reverse ETA uses the enemy’s budget; null ETA is not moderate.
   * Exceptions: None.
   */
  threats: Array<{ description: string; severity: string; sourceUnit: string }>;
  /**
   * Legal shots this turn from the assessed unit.
   *
   * Contract: Only `gridDist <= getRange(assessed)`; no `attackType: "none"` rows.
   * When to use: assess_unit `canAttackThisTurn`.
   * Expected outcome: `melee` at distance 0, `ranged` otherwise.
   * Exceptions: None.
   */
  canAttackThisTurn: Array<{ unitId: string; attackType: string; reason: string }>;
}

/**
 * Scores every other unit with H3 grid hops (no pathfinding).
 *
 * Purpose: Completes nearest-enemy / friendly catalogs when fog is off on the strategic map without pathfinding BFS.
 * When to use: Only after `usesOmniscientGridProximity` is true.
 * Expected outcome: All reachable other units included; in-range attack rows only; lists sorted by hexDistance.
 * Exceptions: Unreachable or invalid indexes are skipped.
 */
export function collectOmniscientNearbyUnits(args: CollectOmniscientNearbyUnitsArgs): OmniscientNearbyScanResult {
  logDebug('assessUnitProximity collectOmniscientNearbyUnits', {
    assessedUnitId: args.assessedUnit.id,
    unitCount: args.units.length,
    turnNumber: args.turnNumber,
  });
  const { assessedUnit, units, turnNumber, latLngByH3 } = args;
  const myRange = getRange(assessedUnit.unitType);
  const myBudget = getMovementBudgetForUnit(assessedUnit.unitType);
  const nearbyEnemies: OmniscientNearbyScanResult['nearbyEnemies'] = [];
  const nearbyFriendlies: OmniscientNearbyScanResult['nearbyFriendlies'] = [];
  const threats: OmniscientNearbyScanResult['threats'] = [];
  const canAttackThisTurn: OmniscientNearbyScanResult['canAttackThisTurn'] = [];
  const hopByH3 = gridHopDistancesFrom(
    assessedUnit.h3Index,
    units.filter((u) => u.id !== assessedUnit.id).map((u) => u.h3Index)
  );

  for (const other of units) {
    if (other.id === assessedUnit.id) continue;
    const gridDist = hopByH3.get(other.h3Index);
    if (gridDist === undefined) continue;
    const position = h3ToLatLng(other.h3Index, latLngByH3, 'cellCenter');
    const isEnemy = other.player !== assessedUnit.player;
    if (isEnemy) {
      const enemyRange = getRange(other.unitType);
      const inRangedRange = gridDist <= myRange;
      const inMeleeRange = gridDist === 0;
      const enemyCanShootMe = gridDist <= enemyRange;
      const estimatedTurnsToReach = estimatedTurnsFromGridDistance(gridDist, myBudget);
      const enemyTurnsToReachMe = estimatedTurnsFromGridDistance(
        gridDist,
        getMovementBudgetForUnit(other.unitType)
      );
      nearbyEnemies.push({
        unitId: other.id,
        type: other.unitType,
        position,
        hexDistance: gridDist,
        gridDistance: gridDist,
        estimatedTurnsToReach,
        inRangedRange,
        inMeleeRange,
        inEnemyRangedRange: enemyCanShootMe,
        confidence: 'current',
        lastSeen: turnNumber,
      });
      let severity: string;
      if (enemyCanShootMe || inMeleeRange) {
        severity = 'critical';
      } else if (enemyTurnsToReachMe !== null && enemyTurnsToReachMe <= 2) {
        severity = 'moderate';
      } else {
        severity = 'low';
      }
      threats.push({
        description:
          enemyTurnsToReachMe !== null
            ? `${other.id} (${other.unitType}) can reach your hex in ${enemyTurnsToReachMe} turns`
            : `${other.id} (${other.unitType}) at grid distance ${gridDist}`,
        severity,
        sourceUnit: other.id,
      });
      if (gridDist <= myRange) {
        canAttackThisTurn.push({
          unitId: other.id,
          attackType: gridDist === 0 ? 'melee' : 'ranged',
          reason: '',
        });
      }
    } else {
      const friendlyTurns = estimatedTurnsFromGridDistance(
        gridDist,
        getMovementBudgetForUnit(other.unitType)
      );
      nearbyFriendlies.push({
        unitId: other.id,
        type: other.unitType,
        position,
        hexDistance: gridDist,
        estimatedTurnsToReach: friendlyTurns,
      });
    }
  }

  nearbyEnemies.sort((a, b) => a.hexDistance - b.hexDistance);
  nearbyFriendlies.sort((a, b) => a.hexDistance - b.hexDistance);
  logDebug('assessUnitProximity collectOmniscientNearbyUnits: complete', {
    assessedUnitId: assessedUnit.id,
    enemies: nearbyEnemies.length,
    friendlies: nearbyFriendlies.length,
  });
  return { nearbyEnemies, nearbyFriendlies, threats, canAttackThisTurn };
}
