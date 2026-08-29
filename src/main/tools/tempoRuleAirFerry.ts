/**
 * Tempo rule for air: ferries idle squadrons toward the enemy so air power stops parking at home bases.
 *
 * `tempoRuleAttacks` guarantees that a unit with a legal shot takes it, but air is the one arm that must *move* before
 * it can shoot: strike range is 3 hexes and ferry range is 4, so a squadron based well behind the line has no legal
 * target and the attack sweep passes over it every turn. A captured strategic turn showed all 24 opponent air units
 * sitting on DEFEND at their home airports with only 4 in range of anything, ferry destinations listed in the briefing,
 * and not one ferry order issued. Nothing in the engine pushed back, so the air arm was permanently idle.
 *
 * This module is the ferry counterpart of the attack sweep and follows the same precedence: it is a floor, never a
 * ceiling. Anything the model ordered wins outright, and the sweep only reaches squadrons no other source claimed.
 * `defend` is deliberately *not* treated as a hold for air, because it is the only standing order air can carry and
 * means "keep striking targets in range" — a defend post with nothing in range is not a post worth keeping. A
 * `hold_fire` order is respected, since that is an explicit instruction to stay out of the fight.
 */

import type { FerryOrder, GameStateSnapshot } from '../../shared/ipcTypes';
import { AIR_STRIKE_RANGE_HEXES } from '../../shared/tacticalRanges';
import { computeGridDistanceWithPathFallbackPure } from '../../shared/h3GridRangePure';
import { validateFerryOrder } from '../gameActions/airValidation';
import { isWithinAirFerryGridRange } from '../gameActions/gridRange';
import { logDebug, logTrace } from '../logger';
import { holdFireUnitIdsForPlayer } from './standingOrdersGeneration';

/**
 * Inputs for `collectTempoRuleFerries`, grouped so the argument list stays short as callers add context.
 *
 * Contract: `unavailableAirUnitIds` must contain every air unit that already has an air strike or a ferry order this
 * turn from any source, because resolution deletes a ferry order whose unit also strikes and only one ferry per unit
 * is applied.
 * When to use: Strategic opponent order assembly, after model orders and the attack sweep have been merged.
 * Expected outcome: Callers pass the same `state` snapshot used for the rest of order generation, so enemy positions
 * already reflect fog of war for this player.
 * Exceptions: None.
 */
export type TempoRuleFerryArgs = {
  /** Player whose idle air is swept; only ever the opponent, since the human repositions their own squadrons. */
  readonly playerId: string;
  /** Order-generation snapshot supplying units, airport infrastructure, and hex control. */
  readonly state: GameStateSnapshot;
  /** Air units already committed to a strike or a ferry this turn, from the model or from standing orders. */
  readonly unavailableAirUnitIds: ReadonlySet<string>;
};

/**
 * Distance from one hex to the closest enemy unit, or `null` when no distance to any enemy can be measured.
 *
 * Purpose: The sweep ranks both the squadron's current base and every candidate base by the same yardstick, and it
 * re-asks about the same handful of bases for every squadron, so the result is memoized per hex.
 * When to use: Internal to this module; call through the closure returned by `createNearestEnemyDistance`.
 * Expected outcome: A non-negative hop count, or `null` when H3 cannot measure the hex against any enemy — which
 * happens across icosahedron faces and must not be read as "adjacent".
 * Exceptions: None.
 */
function createNearestEnemyDistance(
  enemies: readonly GameStateSnapshot['units'][number][]
): (h3Index: string) => number | null {
  const cache = new Map<string, number | null>();
  return (h3Index: string): number | null => {
    const cached = cache.get(h3Index);
    if (cached !== undefined) return cached;
    let nearest: number | null = null;
    for (const enemy of enemies) {
      const distance = computeGridDistanceWithPathFallbackPure(h3Index, enemy.h3Index);
      if (distance === null) continue;
      if (nearest === null || distance < nearest) nearest = distance;
    }
    cache.set(h3Index, nearest);
    return nearest;
  };
}

/**
 * Lists the hexes a squadron of `playerId` may legally land on, from the snapshot alone.
 *
 * Purpose: Narrows the ferry search to friendly hexes with an intact airport before any per-candidate database work,
 * so the sweep costs one `validateFerryOrder` call per squadron rather than one per squadron per airport.
 * When to use: Once per sweep, ahead of the per-unit loop.
 * Expected outcome: Ascending-sorted h3 indexes, giving the sweep a stable order when two bases tie on distance.
 * Exceptions: None; an empty result is normal when the player holds no intact airport.
 */
function collectFriendlyAirBases(state: GameStateSnapshot, playerId: string): string[] {
  logTrace('tempoRuleAirFerry collectFriendlyAirBases', {
    playerId,
    infrastructureCount: state.res1Infrastructure?.length ?? 0,
  });
  const controlledByPlayer = new Set(
    (state.res1Control ?? []).filter((c) => c.controllerPlayerId === playerId).map((c) => c.h3Index)
  );
  return (state.res1Infrastructure ?? [])
    .filter((infra) => infra.airportCount > 0 && controlledByPlayer.has(infra.h3Index))
    .map((infra) => infra.h3Index)
    .sort();
}

/**
 * Returns ferry orders that move idle squadrons to the friendly airport closest to the enemy.
 *
 * Purpose: Keeps the opponent's air arm relevant without waiting for the model to notice it. A squadron already
 * within strike range is left alone — it has a fight where it stands — so this only moves air that could not have
 * contributed anything from its current base.
 * When to use: Strategic opponent turns, after the attack merge, so `unavailableAirUnitIds` already reflects every
 * strike that will be ordered. Not for the human, and not inside tactical battles, where ferrying is bounded by the
 * battle footprint rather than by airport control.
 * Expected outcome: At most one ferry per swept squadron, always to a base that strictly reduces the hop distance to
 * the nearest visible enemy and that passes full `validateFerryOrder` checks. An empty result is normal when no base
 * improves on the squadron's current position.
 * Exceptions: None.
 */
export function collectTempoRuleFerries(args: TempoRuleFerryArgs): FerryOrder[] {
  const { playerId, state, unavailableAirUnitIds } = args;
  logDebug('tempoRuleAirFerry collectTempoRuleFerries', {
    playerId,
    turnNumber: state.turnNumber,
    unavailableAirCount: unavailableAirUnitIds.size,
  });

  const ferryOrders: FerryOrder[] = [];
  const enemies = state.units.filter((u) => u.player !== playerId);
  if (enemies.length === 0) {
    logDebug('tempoRuleAirFerry collectTempoRuleFerries: no visible enemies', { playerId });
    return ferryOrders;
  }
  const bases = collectFriendlyAirBases(state, playerId);
  if (bases.length === 0) {
    logDebug('tempoRuleAirFerry collectTempoRuleFerries: no friendly air bases', { playerId });
    return ferryOrders;
  }

  const holdFireUnitIds = holdFireUnitIdsForPlayer(playerId);
  const distanceToEnemy = createNearestEnemyDistance(enemies);
  let inStrikeRangeSkipped = 0;
  let noImprovementSkipped = 0;
  let invalidSkipped = 0;

  for (const unit of state.units) {
    if (unit.player !== playerId || unit.unitType !== 'air') continue;
    if (unavailableAirUnitIds.has(unit.id) || holdFireUnitIds.has(unit.id)) continue;
    // An unmeasurable current position gives the sweep nothing to improve on, so the squadron stays put rather
    // than being flown somewhere on a distance comparison that never happened.
    const currentDistance = distanceToEnemy(unit.h3Index);
    if (currentDistance === null) continue;
    if (currentDistance <= AIR_STRIKE_RANGE_HEXES) {
      inStrikeRangeSkipped += 1;
      continue;
    }

    let best: { h3Index: string; distance: number } | null = null;
    for (const base of bases) {
      if (base === unit.h3Index) continue;
      if (!isWithinAirFerryGridRange(unit.h3Index, base, 'tempoRuleAirFerry')) continue;
      const baseDistance = distanceToEnemy(base);
      if (baseDistance === null || baseDistance >= currentDistance) continue;
      if (best === null || baseDistance < best.distance) best = { h3Index: base, distance: baseDistance };
    }
    if (best === null) {
      noImprovementSkipped += 1;
      continue;
    }
    const validation = validateFerryOrder(unit.id, best.h3Index, { allowedPlayer: playerId });
    if (!validation.valid) {
      invalidSkipped += 1;
      logDebug('tempoRuleAirFerry collectTempoRuleFerries: candidate rejected by validation', {
        unitId: unit.id,
        destinationH3Index: best.h3Index,
        reason: validation.reason,
      });
      continue;
    }
    ferryOrders.push({ unitId: unit.id, destinationH3Index: best.h3Index });
  }

  logDebug('tempoRuleAirFerry collectTempoRuleFerries: result', {
    playerId,
    ferriesAdded: ferryOrders.length,
    baseCount: bases.length,
    inStrikeRangeSkipped,
    noImprovementSkipped,
    invalidSkipped,
    holdFireSkipped: holdFireUnitIds.size,
  });
  return ferryOrders;
}

/**
 * Inputs for `buildStrategicOpponentFerryOrders`, kept as one object so both ferry sources stay named at call sites.
 *
 * Contract: `airStrikeUnitIds` must be the final strike set for the turn, since resolution silently drops a ferry for
 * any unit that also strikes. `modelFerryOrders` must already be deduplicated per unit.
 * When to use: Strategic opponent order assembly only; tactical beats validate against the battle snapshot instead.
 * Expected outcome: Callers receive drop reasons phrased for the AI order log, using their own unit labels.
 * Exceptions: None.
 */
export type StrategicOpponentFerryArgs = {
  /** Player whose ferry orders are being assembled; only ever the opponent. */
  readonly playerId: string;
  /** Order-generation snapshot used for both validation context and the idle-air sweep. */
  readonly state: GameStateSnapshot;
  /** Ferry orders the model asked for, already deduplicated per unit. */
  readonly modelFerryOrders: readonly FerryOrder[];
  /** Units with an air strike this turn, after the attack merge. */
  readonly airStrikeUnitIds: ReadonlySet<string>;
  /** Renders a unit id as the player-facing label used in drop reasons. */
  readonly displayLabelForUnit: (unitId: string) => string;
};

/**
 * Combines the model's ferry orders with the idle-air sweep into the opponent's final ferry set.
 *
 * Purpose: Strategic ferry orders previously reached resolution unchecked, where an illegal destination is a no-op —
 * or deletes the squadron outright when its home airport has been bombed. Validating here turns that into a logged
 * drop and gives the sweep an accurate picture of which squadrons are still idle.
 * When to use: The strategic branch of opponent order assembly, after air strikes are final.
 * Expected outcome: At most one ferry per unit, none for units that strike, every entry legal at request time.
 * Exceptions: None.
 */
export function buildStrategicOpponentFerryOrders(args: StrategicOpponentFerryArgs): {
  ferryOrders: FerryOrder[];
  dropReasons: string[];
} {
  const { playerId, state, modelFerryOrders, airStrikeUnitIds, displayLabelForUnit } = args;
  logDebug('tempoRuleAirFerry buildStrategicOpponentFerryOrders', {
    playerId,
    modelFerryCount: modelFerryOrders.length,
    airStrikeUnitCount: airStrikeUnitIds.size,
  });

  const ferryOrders: FerryOrder[] = [];
  const dropReasons: string[] = [];
  for (const order of modelFerryOrders) {
    if (airStrikeUnitIds.has(order.unitId)) {
      dropReasons.push(
        `Air unit ${displayLabelForUnit(order.unitId)} cannot strike and ferry in the same turn`
      );
      continue;
    }
    const validation = validateFerryOrder(order.unitId, order.destinationH3Index, { allowedPlayer: playerId });
    if (!validation.valid) {
      dropReasons.push(`Ferry ${displayLabelForUnit(order.unitId)}: ${validation.reason}`);
      continue;
    }
    ferryOrders.push(order);
  }

  const sweep = collectTempoRuleFerries({
    playerId,
    state,
    unavailableAirUnitIds: new Set([...airStrikeUnitIds, ...ferryOrders.map((f) => f.unitId)]),
  });
  logDebug('tempoRuleAirFerry buildStrategicOpponentFerryOrders: result', {
    playerId,
    modelFerriesKept: ferryOrders.length,
    modelFerriesDropped: dropReasons.length,
    sweepAdded: sweep.length,
  });
  return { ferryOrders: [...ferryOrders, ...sweep], dropReasons };
}
