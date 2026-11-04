/**
 * Anti-air rolls shared by an air strike against units and an air drop.
 *
 * Purpose: One defender loop, so a drop and a strike record the same `antiAir` dice and stop on the first hit.
 * When to use: After the caller has chosen the defenders that may shoot.
 * Expected outcome: The attacker is deleted on the first hit. Each roll is written to the supplied dice log.
 * Exceptions: None.
 */

import { getRange } from '../combatConstants';
import { rollCombatDieAgainst, type CombatDiceLog } from '../combatDiceRecording';
import { attackHitThreshold } from '../combatHitThresholds';
import { dbRun } from '../gameDb';
import { logDebug } from '../logger';
import type { OriginHitBonusLookup } from '../originBonus/originHitBonusLookup';
import type { TechHitBonusLookup } from '../techBonus/techHitBonusLookup';
import type { WeatherAttackPenalty } from '../../shared/weatherBonusTypes';

/**
 * A unit that may shoot at the air unit.
 *
 * Purpose: The counter-fire loop needs the defender's type, owner, and hex.
 * When to use: `rollAntiAirCounterFire`.
 * Expected outcome: A row already filtered for embarked cargo that sits out the fight.
 * Exceptions: None.
 */
export type AntiAirDefender = {
  readonly id: string;
  readonly player: string;
  readonly unit_type: string;
  readonly h3_index: string;
};

/**
 * The air unit that might be shot down.
 *
 * Purpose: A hit deletes this row.
 * When to use: `rollAntiAirCounterFire`.
 * Expected outcome: The strategic unit row.
 * Exceptions: None.
 */
export type AntiAirAttacker = {
  readonly id: string;
  readonly player: string;
  readonly unit_type: string;
  readonly h3_index: string;
  readonly display_order: number | null;
};

/**
 * Rolls anti-air from each eligible defender until one hits.
 *
 * Purpose: Strike resolution and drop resolution share the thresholds, the weather penalty, and the dice kind.
 * When to use: After a strike's attack roll, or when a drop hex has an enemy that can shoot. A drop does not roll an attack of its own.
 * Expected outcome: True when a defender's roll hits. The attacker row is then gone, and `onAttackerRemoved` has run. False when every roll misses or no defender has a range.
 * Exceptions: None.
 */
export function rollAntiAirCounterFire(args: {
  readonly attacker: AntiAirAttacker;
  readonly targetH3Index: string;
  readonly defenders: readonly AntiAirDefender[];
  readonly rollDie: () => number;
  readonly diceLog: CombatDiceLog;
  readonly originHitBonusAt: OriginHitBonusLookup;
  readonly techHitBonusAt: TechHitBonusLookup;
  readonly weatherAttackPenalty: (defender: AntiAirDefender) => WeatherAttackPenalty;
  readonly onAttackerRemoved: () => void;
}): boolean {
  logDebug('airCounterFire rollAntiAirCounterFire', {
    attackerId: args.attacker.id,
    targetH3Index: args.targetH3Index,
    defenderCount: args.defenders.length,
  });
  for (const defender of args.defenders) {
    if (getRange(defender.unit_type) < 1) continue;
    const counterFireThreshold = attackHitThreshold({
      unitType: defender.unit_type,
      originHitBonus: args.originHitBonusAt(defender.id, defender.h3_index),
      techAttackBonus: args.techHitBonusAt(defender.id).attack,
      weatherAttackPenalty: args.weatherAttackPenalty(defender),
    });
    const counterFireContext = {
      kind: 'antiAir',
      player: defender.player,
      unitType: defender.unit_type,
      anchorH3Index: args.targetH3Index,
    } as const;
    if (!rollCombatDieAgainst(args.rollDie, counterFireThreshold, counterFireContext, args.diceLog.sink)) continue;
    dbRun('DELETE FROM units WHERE id = ?', [args.attacker.id]);
    args.onAttackerRemoved();
    return true;
  }
  return false;
}
