/**
 * Shared fortification loss counting for strategic resolution.
 *
 * Purpose: Strikes, missiles, and later combat record how many fortifications each hex lost.
 * When to use: Pass one tally through a turn, then build the turn-report lines from it.
 * Expected outcome: A hex is absent until it loses at least one fortification.
 * Exceptions: None.
 */

import { unitTypeRollsInCombat } from './combatConstants';
import { rollCombatDieAgainst, type CombatDiceRollSink } from './combatDiceRecording';
import { attackHitThreshold } from './combatHitThresholds';
import type { CombatUnit } from './combatUnitTypes';
import { logDebug, logTrace } from './logger';

/** Fortifications removed this turn, keyed by strategic hex. */
export type FortificationLossTally = Map<string, number>;

/**
 * A unit a fortification might save.
 *
 * Purpose: Soak only needs the owner and the hex. The combat unit types satisfy this.
 * When to use: `absorbHit` and `takeHitsInCasualtyOrder`.
 * Expected outcome: `player` is the unit's owner. `h3Index` is where it stands.
 * Exceptions: None.
 */
export interface FortificationVictim {
  /**
   * The unit's owner.
   *
   * Contract: Soak applies only when this id controls the hex.
   * When to use: `absorbHit`.
   * Expected outcome: A seat id or `neutral`.
   * Exceptions: None.
   */
  readonly player: string;
  /**
   * The hex or cell where the unit stands.
   *
   * Contract: Strategic callers pass the strategic hex. A battle passes the cell.
   * When to use: `absorbHit`.
   * Expected outcome: The place whose fortification may be spent.
   * Exceptions: None.
   */
  readonly h3Index: string;
}

/**
 * How strategic combat asks fortifications to take a hit.
 *
 * Purpose: Combat resolution stays free of the database. The caller supplies these functions.
 * When to use: Ranged fire, melee, and air strikes against units. Omit the hooks when no fortification can matter.
 * Expected outcome: `absorbHit` returns true when the hit was spent on a fortification. The other two are for empty fortified hexes.
 * Exceptions: None.
 */
export interface FortificationCombatHooks {
  /**
   * Spends one hit on a fortification instead of the unit.
   *
   * Contract: True means the unit stays. False means the hit removes the unit, exactly as it would with no fortification.
   * When to use: Once per hit that would otherwise remove a unit.
   * Expected outcome: True only when a fortification of that unit's controller was removed.
   * Exceptions: None.
   */
  readonly absorbHit: (victim: FortificationVictim) => boolean;
  /**
   * Whether an enemy holds a fortification on the hex.
   *
   * Contract: True when the controller is someone other than `attackerPlayer` and at least one cell is fortified.
   * When to use: Ranged fire at a hex with no enemy units.
   * Expected outcome: False for the attacker's own hex, a neutral-unowned hex, and a hex with no fortification.
   * Exceptions: None.
   */
  readonly isEnemyFortifiedHex?: (h3Index: string, attackerPlayer: string) => boolean;
  /**
   * Removes one fortification from a hex.
   *
   * Contract: False when none remain. Does not check who attacked.
   * When to use: A hit that has already been ruled a fortification loss.
   * Expected outcome: One fewer fortified cell, and true.
   * Exceptions: None.
   */
  readonly stripOne?: (h3Index: string) => boolean;
}

/**
 * Hooks plus the tally they write.
 *
 * Purpose: Air strikes need both the absorb function and the map the turn report reads.
 * When to use: The strategic air-strike phase.
 * Expected outcome: `hooks` and `tally` are the same turn's pair.
 * Exceptions: None.
 */
export interface StrategicFortificationContext {
  /**
   * The absorb and strip functions for this turn.
   *
   * Contract: The same hooks the ranged and melee phases use.
   * When to use: An air strike against units.
   * Expected outcome: `absorbHit` may remove a fortification and leave the unit.
   * Exceptions: None.
   */
  readonly hooks: FortificationCombatHooks;
  /**
   * The loss counts the turn report reads.
   *
   * Contract: The same map `hooks` writes.
   * When to use: After the air-strike phase.
   * Expected outcome: A hex appears only after it loses a fortification.
   * Exceptions: None.
   */
  readonly tally: FortificationLossTally;
}

/**
 * Applies hits to units in casualty order, letting a fortification spend a hit.
 *
 * Purpose: Ranged fire and melee share one way of walking a sorted victim list.
 * When to use: After the hits for one side are known. `sorted` is already in casualty order.
 * Expected outcome: The ids of units actually removed. A hit that `absorbHit` accepts does not remove the unit, and that same unit is next.
 * Exceptions: None.
 */
export function takeHitsInCasualtyOrder<T extends FortificationVictim & { readonly id: string }>(
  sorted: readonly T[],
  hits: number,
  absorbHit?: (victim: FortificationVictim) => boolean
): string[] {
  logTrace('takeHitsInCasualtyOrder', { hits, sortedCount: sorted.length, absorb: absorbHit != null });
  const removed: string[] = [];
  let index = 0;
  for (let hit = 0; hit < hits && index < sorted.length; hit += 1) {
    const victim = sorted[index]!;
    if (absorbHit?.(victim)) continue;
    removed.push(victim.id);
    index += 1;
  }
  return removed;
}

/**
 * Adds a hex's fortification losses to the turn tally.
 *
 * Purpose: Every strategic source of fortification loss shares one map.
 * When to use: After a strike, missile, or combat soak removes one or more fortifications.
 * Expected outcome: The hex's count increases by `count`. No change when the tally is missing or `count` is not positive.
 * Exceptions: None.
 */
export function recordFortificationLoss(
  tally: FortificationLossTally | undefined,
  h3Index: string,
  count: number
): void {
  logDebug('recordFortificationLoss', { h3Index, count, hasTally: tally != null });
  if (!tally || count <= 0) return;
  tally.set(h3Index, (tally.get(h3Index) ?? 0) + count);
}

/**
 * Rolls one side's attack against an empty enemy fortified hex.
 *
 * Purpose: A siege spends hits on fortifications after melee, and only when one player is present.
 * When to use: From `runMeleePhase`, after melee, with the hexes that already fought excluded.
 * Expected outcome: The hexes where any unit rolled. A hit removes one fortification. No unit is removed.
 * Exceptions: None.
 */
export function runSiegeRolls(args: {
  readonly hexList: readonly string[];
  readonly units: readonly CombatUnit[];
  readonly excludedHexes: ReadonlySet<string>;
  readonly hooks: FortificationCombatHooks;
  readonly rollDie: () => number;
  readonly onRoll?: CombatDiceRollSink;
}): string[] {
  logDebug('runSiegeRolls', { hexCount: args.hexList.length, unitCount: args.units.length, excludedCount: args.excludedHexes.size });
  const rolled: string[] = [];
  for (const hex of args.hexList) {
    if (args.excludedHexes.has(hex)) continue;
    const here = args.units.filter((unit) => unit.h3Index === hex);
    if (here.length === 0) continue;
    const players = new Set(here.map((unit) => unit.player));
    if (players.size !== 1) continue;
    const player = here[0]!.player;
    if (!args.hooks.isEnemyFortifiedHex?.(hex, player) || !args.hooks.stripOne) continue;
    const rollers = here.filter((unit) => unitTypeRollsInCombat(unit.unitType)).sort((left, right) => left.id.localeCompare(right.id));
    let anyRoll = false;
    for (const unit of rollers) {
      if (!args.hooks.isEnemyFortifiedHex(hex, player)) break;
      anyRoll = true;
      const hit = rollCombatDieAgainst(
        args.rollDie,
        attackHitThreshold(unit),
        { kind: 'meleeAttack', player, unitType: unit.unitType, anchorH3Index: unit.h3Index },
        args.onRoll
      );
      if (hit) args.hooks.stripOne(hex);
    }
    if (anyRoll) rolled.push(hex);
  }
  logDebug('runSiegeRolls complete', { hexCount: rolled.length });
  return rolled;
}

/**
 * Rolls ranged attackers against an empty enemy fortified hex.
 *
 * Purpose: Direct fire can strip fortifications when the hex has no enemy units. There is no return fire.
 * When to use: From `runRangedPhase` when the target hex is empty and fortified against the attacker.
 * Expected outcome: The number of fortifications removed. Rolling stops when the hex is no longer an enemy fortification.
 * Exceptions: None.
 */
export function rollRangedAgainstFortifiedHex(args: {
  readonly attackers: readonly CombatUnit[];
  readonly hex: string;
  readonly hooks: FortificationCombatHooks;
  readonly rollDie: () => number;
  readonly onRoll?: CombatDiceRollSink;
}): number {
  logDebug('rollRangedAgainstFortifiedHex', { hex: args.hex, attackerCount: args.attackers.length });
  let stripped = 0;
  for (const attacker of args.attackers) {
    if (!unitTypeRollsInCombat(attacker.unitType)) continue;
    if (!args.hooks.isEnemyFortifiedHex?.(args.hex, attacker.player)) break;
    const hit = rollCombatDieAgainst(
      args.rollDie,
      attackHitThreshold(attacker),
      { kind: 'ranged', player: attacker.player, unitType: attacker.unitType, anchorH3Index: attacker.h3Index },
      args.onRoll
    );
    if (hit && args.hooks.stripOne?.(args.hex)) stripped += 1;
  }
  logDebug('rollRangedAgainstFortifiedHex complete', { hex: args.hex, stripped });
  return stripped;
}
