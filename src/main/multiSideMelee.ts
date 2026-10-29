/**
 * Melee in a hex that holds three or more sides.
 *
 * Purpose: One simultaneous round replaces the old pair-by-pair fight, without changing two-sided melee.
 * When to use: `runMeleePhase` when a hex has three or more owners.
 * Expected outcome: Every unit rolls once, except a missile, which is skipped and can still be removed. Hits are then assigned across the other sides.
 * Exceptions: None.
 */

import { compareCasualtyOrder, unitTypeRollsInCombat } from './combatConstants';
import { attackHitThreshold, defenseHitThreshold } from './combatHitThresholds';
import { rollCombatDieAgainst, type CombatDiceRollSink } from './combatDiceRecording';
import type { CombatUnit } from './combatUnitTypes';
import { logDebug } from './logger';

/**
 * Units removed in one multi-side melee round.
 *
 * Contract: Each removal names the victim and every unit of the side whose hit removed it.
 * When to use: `runMeleePhase` records one casualty per entry.
 * Expected outcome: The list is in assignment order. A side with no successful assignment contributes nothing.
 * Exceptions: None.
 */
export interface MultiSideMeleeResult {
  /**
   * Victims of this round and the side that hit them.
   *
   * Contract: `killerIds` lists every unit of the hitting side that was in the hex, whether or not that unit also died.
   * When to use: Recording kills after the round.
   * Expected outcome: One entry per unit actually removed. Lost hits do not appear.
   * Exceptions: None.
   */
  readonly removals: readonly { readonly victim: CombatUnit; readonly killerIds: readonly string[] }[];
}

/**
 * One multi-side melee round.
 *
 * Contract: `sidesOrdered[0]` rolls attack values. Every other side rolls defense values. `next` is used only to pick a side.
 * When to use: A hex whose units belong to at least three sides.
 * Expected outcome: Rolls finish before any unit is removed.
 * Exceptions: None.
 */
export interface MultiSideMeleeEngagement {
  /**
   * Sides in this turn's shuffled order.
   *
   * Contract: The first entry is the attacker. Later entries defend.
   * When to use: The same order `runMeleePhase` built for the hex.
   * Expected outcome: Assignment walks candidates in this order.
   * Exceptions: None.
   */
  readonly sidesOrdered: readonly string[];
  /**
   * Units standing in the hex at the start of the round.
   *
   * Contract: Includes every side that will roll. Order within a side is the order these units appear.
   * When to use: The hex's units before any casualty this round.
   * Expected outcome: Each of these units rolls once.
   * Exceptions: None.
   */
  readonly unitsHere: readonly CombatUnit[];
  /**
   * Draws one combat-die face.
   *
   * Contract: Returns an integer from 1 to the combat die size. Each call consumes one face.
   * When to use: Once per unit, before any casualty.
   * Expected outcome: A hit when the face is at or below that unit's threshold.
   * Exceptions: None.
   */
  readonly rollDie: () => number;
  /**
   * Draws a unit-interval number for choosing which side takes a hit.
   *
   * Contract: The same generator the die roller uses. This function does not draw it during the two-sided branch.
   * When to use: Once per hit that still has an enemy unit left.
   * Expected outcome: A number in `[0, 1)`.
   * Exceptions: None.
   */
  readonly next: () => number;
  /**
   * Optional recorder for each face.
   *
   * Contract: Called once per unit, in roll order. Omitting it changes nothing else.
   * When to use: When the phase is collecting playback dice.
   * Expected outcome: One recorded roll per unit in the hex.
   * Exceptions: None.
   */
  readonly onRoll?: CombatDiceRollSink;
}

/**
 * Sorts a side's units into casualty order.
 *
 * Purpose: Hits remove the softest unit first, then the usual type order.
 * When to use: Once per side, before any hit is assigned.
 * Expected outcome: Lowest printed defense first, then casualty priority, with every missile after every other unit. Equal units keep their incoming order.
 * Exceptions: None.
 */
function unitsInCasualtyOrder(units: readonly CombatUnit[]): CombatUnit[] {
  return [...units].sort(
    (left, right) => compareCasualtyOrder(left.unitType, right.unitType)
  );
}

/**
 * Resolves one melee round in a hex that holds three or more sides.
 *
 * Purpose: Every unit rolls, then each side spends its hits on the other sides that still have units.
 * When to use: From `runMeleePhase` only. Two-sided hexes keep `resolveOneMeleeEngagement`.
 * Expected outcome: Removals in assignment order. Hits left after every enemy unit is gone are lost.
 * Exceptions: None.
 */
export function resolveMultiSideMeleeEngagement(args: MultiSideMeleeEngagement): MultiSideMeleeResult {
  const attackerSide = args.sidesOrdered[0];
  logDebug('resolveMultiSideMeleeEngagement', {
    sideCount: args.sidesOrdered.length,
    unitCount: args.unitsHere.length,
    attackerSide: attackerSide ?? null,
  });
  const unitsBySide = new Map<string, CombatUnit[]>();
  for (const side of args.sidesOrdered) {
    unitsBySide.set(side, args.unitsHere.filter((unit) => unit.player === side));
  }
  const hitsBySide = new Map<string, number>();
  for (const side of args.sidesOrdered) {
    const attacking = side === attackerSide;
    let hits = 0;
    for (const unit of unitsBySide.get(side) ?? []) {
      if (!unitTypeRollsInCombat(unit.unitType)) continue;
      const threshold = attacking ? attackHitThreshold(unit) : defenseHitThreshold(unit);
      const hit = rollCombatDieAgainst(
        args.rollDie,
        threshold,
        { kind: attacking ? 'meleeAttack' : 'meleeDefense', player: unit.player, unitType: unit.unitType, anchorH3Index: unit.h3Index },
        args.onRoll
      );
      if (hit) hits += 1;
    }
    hitsBySide.set(side, hits);
  }
  const remaining = new Map<string, CombatUnit[]>();
  for (const side of args.sidesOrdered) remaining.set(side, unitsInCasualtyOrder(unitsBySide.get(side) ?? []));
  const removals: { victim: CombatUnit; killerIds: readonly string[] }[] = [];
  for (const side of args.sidesOrdered) {
    const killerIds = (unitsBySide.get(side) ?? []).map((unit) => unit.id);
    let hitsLeft = hitsBySide.get(side) ?? 0;
    while (hitsLeft > 0) {
      const candidates = args.sidesOrdered.filter((other) => other !== side && (remaining.get(other)?.length ?? 0) > 0);
      if (candidates.length === 0) break;
      const total = candidates.reduce((sum, other) => sum + (remaining.get(other)?.length ?? 0), 0);
      let draw = args.next() * total;
      let chosen = candidates[candidates.length - 1]!;
      for (const candidate of candidates) {
        const count = remaining.get(candidate)?.length ?? 0;
        if (draw < count) {
          chosen = candidate;
          break;
        }
        draw -= count;
      }
      const victim = remaining.get(chosen)?.shift();
      if (!victim) break;
      removals.push({ victim, killerIds });
      hitsLeft -= 1;
    }
  }
  logDebug('resolveMultiSideMeleeEngagement complete', { removalCount: removals.length });
  return { removals };
}
