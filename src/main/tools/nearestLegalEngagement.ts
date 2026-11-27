/**
 * The one place the engine picks "the nearest enemy this unit may legally shoot" on the world map, leaving out the
 * sides in the firing owner's `holdAutomaticFireAgainst` list.
 *
 * Purpose: DEFEND fire and the tempo sweep must choose targets the same way, so the choice lives in one module.
 * When to use: Any automatic strategic engagement that needs the nearest legal target for one unit.
 * Expected outcome: At most one generated attack row per call.
 * Exceptions: None.
 */

import { computeGridDistanceWithPathFallbackPure } from '../../shared/h3GridRangePure';
import type { GameStateSnapshot } from '../../shared/ipcTypes';
import type { AirStrikeTargetType } from '../../shared/ipcTypes';
import { getRange } from '../combatConstants';
import { validateAirStrikeOrder } from '../gameActions/airValidation';
import { isWithinAirStrikeGridRange } from '../gameActions/gridRange';
import { logDebug } from '../logger';

/**
 * One air strike row the engine generated.
 *
 * Contract: The striking unit, the target hex, and the target type.
 * When to use: Returned by the generators that add attacks a commander did not name.
 * Expected outcome: The same shape as a model-ordered strike, so both merge into one list.
 * Exceptions: None.
 */
export type StandingOrderGeneratedAirStrike = {
  /**
   * The striking unit.
   *
   * Contract: A world-map unit id.
   * When to use: Matching the strike to its unit.
   * Expected outcome: One strike per unit.
   * Exceptions: None.
   */
  unitId: string;
  /**
   * The hex struck.
   *
   * Contract: A world-map hex.
   * When to use: Validating and resolving the strike.
   * Expected outcome: A hex in air range.
   * Exceptions: None.
   */
  targetH3Index: string;
  /**
   * What the strike aims at.
   *
   * Contract: The engine always generates a strike on units.
   * When to use: Resolving the strike.
   * Expected outcome: A target type the resolver accepts.
   * Exceptions: None.
   */
  targetType: AirStrikeTargetType;
};

/**
 * Inputs for `appendNearestLegalEngagement`.
 *
 * Contract: One firing unit, its owner, the snapshot to search, the owners never to aim at, and the two output arrays.
 * When to use: Each automatic strategic engagement.
 * Expected outcome: One object, so a caller cannot swap the two output arrays or leave out the spared owners.
 * Exceptions: None.
 */
export type NearestLegalEngagementArgs = {
  /**
   * The firing unit.
   *
   * Contract: A row of `state.units`.
   * When to use: Its type and hex decide which targets are legal.
   * Expected outcome: Air produces a strike and other armed types a ranged attack.
   * Exceptions: None.
   */
  readonly unit: GameStateSnapshot['units'][number];
  /**
   * Owner of the firing unit.
   *
   * Contract: Units of this owner are never targets.
   * When to use: Filtering candidates and checking air-strike legality.
   * Expected outcome: Only other owners' units are considered.
   * Exceptions: None.
   */
  readonly playerId: string;
  /**
   * Id written on the generated row.
   *
   * Contract: The unit id the order set uses for this shooter.
   * When to use: Naming the attacker in the output.
   * Expected outcome: The row's `unitId`.
   * Exceptions: None.
   */
  readonly unitId: string;
  /**
   * Snapshot searched for targets.
   *
   * Contract: The same snapshot the rest of the order set is built from.
   * When to use: Listing candidate units.
   * Expected outcome: Targets come only from these units.
   * Exceptions: None.
   */
  readonly state: GameStateSnapshot;
  /**
   * Owners whose units are never chosen as a target here.
   *
   * Contract: Pass the result of `readHoldAutomaticFireAgainstSeatIds` for the firing owner.
   * When to use: Filtering candidates.
   * Expected outcome: An empty set leaves every other owner eligible.
   * Exceptions: None.
   */
  readonly sparedOwnerIds: ReadonlySet<string>;
  /**
   * Ranged rows this call appends to.
   *
   * Contract: The caller's array; at most one row is added.
   * When to use: A ground or naval shooter with a legal target.
   * Expected outcome: Existing rows are untouched.
   * Exceptions: None.
   */
  readonly rangedAttacks: { unitId: string; targetH3Index: string }[];
  /**
   * Air strike rows this call appends to.
   *
   * Contract: The caller's array; at most one row is added.
   * When to use: An air shooter with a legal target.
   * Expected outcome: Existing rows are untouched.
   * Exceptions: None.
   */
  readonly airStrikes: StandingOrderGeneratedAirStrike[];
};

/**
 * Emits one ranged attack or air strike against the closest in-range enemy from the unit's current hex.
 *
 * Purpose: Shared "shoot the nearest thing you legally can" step. DEFEND units use it to auto-engage without waiting
 * to arrive at the defend post, and the tempo sweep uses it to cover units the model left idle. Air produces strikes,
 * ground and naval produce ranged attacks, and infantry produces nothing because its strategic range is zero.
 * When to use: The `defend` branch of `generateOrdersForStandingOrders`, and `collectTempoRuleAttacks`. Callers are
 * responsible for skipping units that already have an attack or are under `hold_fire`.
 * Expected outcome: At most one attack row appended to the matching array. Units of a spared owner are never chosen, so
 * a unit with only spared owners in range produces nothing, as does a unit with no legal target. A target hex that also
 * holds a spared owner's unit stays a candidate when another side's unit is there.
 * Exceptions: None; enemies whose distance cannot be derived are ranked last rather than dropped.
 */
export function appendNearestLegalEngagement(args: NearestLegalEngagementArgs): void {
  const { unit, playerId, unitId, state, sparedOwnerIds, rangedAttacks, airStrikes } = args;
  logDebug('nearestLegalEngagement appendNearestLegalEngagement', { playerId, unitId, sparedOwnerCount: sparedOwnerIds.size });
  const enemies = state.units.filter((u) => u.player !== playerId && !sparedOwnerIds.has(u.player));
  if (unit.unitType === 'air') {
    let nearest: { h3Index: string; dist: number } | null = null;
    for (const enemy of enemies) {
      if (!isWithinAirStrikeGridRange(unit.h3Index, enemy.h3Index, 'nearestLegalEngagement')) continue;
      const valid = validateAirStrikeOrder(unitId, enemy.h3Index, 'units', { allowedPlayer: playerId });
      if (!valid.valid) continue;
      // Range and legality are already settled above, so an unmeasurable pair ranks last rather than
      // forfeiting a strike the range gate just approved.
      const dist =
        computeGridDistanceWithPathFallbackPure(unit.h3Index, enemy.h3Index) ?? Number.POSITIVE_INFINITY;
      if (nearest === null || dist < nearest.dist) nearest = { h3Index: enemy.h3Index, dist };
    }
    if (nearest) {
      airStrikes.push({ unitId, targetH3Index: nearest.h3Index, targetType: 'units' });
    }
    return;
  }

  const weaponRange = getRange(unit.unitType);
  if (weaponRange < 1) return;
  let nearest: { h3Index: string; dist: number } | null = null;
  for (const enemy of enemies) {
    const dist = computeGridDistanceWithPathFallbackPure(unit.h3Index, enemy.h3Index);
    if (dist === null) continue;
    if (dist <= weaponRange && (nearest === null || dist < nearest.dist)) {
      nearest = { h3Index: enemy.h3Index, dist };
    }
  }
  if (nearest) {
    rangedAttacks.push({ unitId, targetH3Index: nearest.h3Index });
  }
}
