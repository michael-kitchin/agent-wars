/**
 * Pure return-fire reach eligibility aligned with human planning rules (ranged for ground, strike for air).
 *
 * Purpose: One predicate for combat dice, shot-line connectors, and Tool 3 so reverse-shot legality never drifts.
 * When to use: Ranged-phase return fire only — not air-strike AA or infrastructure counter-fire.
 * Expected outcome: True when the defender could plan a legal reverse attack at the attacker hex under theater rules.
 * Exceptions: Fail closed when required context is missing (air airport callback; tactical ground battle/footprint).
 */

import { isWithinGridRangePure } from './h3GridRangePure';
import { strategicRangedRangeHexesForUnitType } from './rangePerimeterModel';
import { AIR_STRIKE_RANGE_HEXES } from './tacticalRanges';
import {
  tacticalRangedDirectFirePassesTerrainAndRange,
  type TacticalBattleTerrainPick,
} from './tacticalTerrainCombatModifiers';

/**
 * Theater for return-fire geometry (strategic res1 vs tactical res4).
 *
 * Purpose: Selects strategic ranged/strike tables vs tactical direct-fire terrain filters.
 * When to use: Every call to `canDefenderReturnFireAtAttackerHex`.
 * Expected outcome: `'strategic'` or `'tactical'`.
 * Exceptions: None.
 */
export type ReturnFireTheater = 'strategic' | 'tactical';

/**
 * Context bag for return-fire eligibility (single options object for callers).
 *
 * Purpose: Carries theater, optional airport lookup, and tactical terrain/footprint without DB imports.
 * When to use: Passed through `runRangedPhase` / Tool 3 into `canDefenderReturnFireAtAttackerHex`.
 * Expected outcome: Production callers supply a complete bag for their theater; missing pieces fail closed.
 * Exceptions: None.
 */
export type ReturnFireEligibilityContext = {
  /**
   * Which map resolution and rule table apply.
   *
   * Purpose: Branches ground and air reach checks.
   * When to use: Always set by the caller.
   * Expected outcome: `'strategic'` or `'tactical'`.
   * Exceptions: None.
   */
  theater: ReturnFireTheater;
  /**
   * Whether the air unit’s base hex has an intact airport (strike-planning gate).
   *
   * Purpose: Mirrors `validateAirStrikeOrder` / tactical air strike airport checks without importing the DB.
   * When to use: Required for air eligibility; omit ⇒ air ineligible (fail closed).
   * Expected outcome: True only when airport count at the air base (strategic hex or tactical parent res1) is positive.
   * Exceptions: None.
   */
  hasIntactAirportAtAirBase?: (unitH3: string) => boolean;
  /**
   * Tactical battle terrain pick for ground return fire.
   *
   * Purpose: Feeds `tacticalRangedDirectFirePassesTerrainAndRange`.
   * When to use: Required for tactical non-air; omit ⇒ tactical ground ineligible.
   * Expected outcome: Same shape as other tactical terrain helpers.
   * Exceptions: None.
   */
  tacticalBattle?: TacticalBattleTerrainPick;
  /**
   * Res4 footprint set for tactical ground return fire.
   *
   * Purpose: Same footprint membership gate as direct-fire apply filters.
   * When to use: Required with `tacticalBattle` for tactical non-air; omit ⇒ tactical ground ineligible.
   * Expected outcome: Contains engagement attacker hexes when callers plumb battle footprint.
   * Exceptions: None.
   */
  tacticalFootprint?: ReadonlySet<string>;
};

/**
 * Returns whether one defender unit may attempt return fire at one attacker hex.
 *
 * Purpose: Planning-parity reverse-shot check for ranged-phase return fire.
 * When to use: Per defender × attacker hex before rolling or emitting a return-fire shot line.
 * Expected outcome:
 * - Air: airport callback true; strategic also within `AIR_STRIKE_RANGE_HEXES`; tactical assumes in-footprint engagement.
 * - Strategic ground: strategic ranged range + `isWithinGridRangePure`.
 * - Tactical ground: `tacticalRangedDirectFirePassesTerrainAndRange` (never used for air).
 * Exceptions: None; invalid geometry or a throwing airport callback yields false (fail closed).
 */
export function canDefenderReturnFireAtAttackerHex(
  defender: { unitType: string; h3Index: string },
  attackerHex: string,
  context: ReturnFireEligibilityContext
): boolean {
  if (defender.unitType === 'air') {
    const hasAirport = context.hasIntactAirportAtAirBase;
    if (!hasAirport) return false;
    let airportOk = false;
    try {
      airportOk = hasAirport(defender.h3Index);
    } catch {
      return false;
    }
    if (!airportOk) return false;
    if (context.theater === 'tactical') return true;
    return isWithinGridRangePure(defender.h3Index, attackerHex, AIR_STRIKE_RANGE_HEXES);
  }

  if (context.theater === 'strategic') {
    const range = strategicRangedRangeHexesForUnitType(defender.unitType);
    if (range < 1) return false;
    return isWithinGridRangePure(defender.h3Index, attackerHex, range);
  }

  const battle = context.tacticalBattle;
  const footprint = context.tacticalFootprint;
  if (!battle || !footprint) return false;
  return tacticalRangedDirectFirePassesTerrainAndRange(
    battle,
    footprint,
    defender.unitType,
    defender.h3Index,
    attackerHex
  );
}

/**
 * Returns true when any attacker hex is a legal return-fire target for the defender.
 *
 * Purpose: Matches engagement loops that roll once per defender if any attacker hex is hittable.
 * When to use: `resolveOneRangedEngagement` and Tool 3 `canReturnFire` aggregation.
 * Expected outcome: True iff `canDefenderReturnFireAtAttackerHex` is true for at least one attacker hex.
 * Exceptions: None.
 */
export function canDefenderReturnFireAtAnyAttackerHex(
  defender: { unitType: string; h3Index: string },
  attackerHexes: readonly string[],
  context: ReturnFireEligibilityContext
): boolean {
  return attackerHexes.some((h) => canDefenderReturnFireAtAttackerHex(defender, h, context));
}
