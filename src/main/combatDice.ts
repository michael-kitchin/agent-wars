/**
 * The combat die and the fixed numbers every hit roll shares.
 *
 * Purpose: One place for the die size, the hit-number limits, and infrastructure counter-fire, so roll sites and estimates agree.
 * When to use: Every combat hit roll and every hit-chance estimate.
 * Expected outcome: Constants plus a roller factory and a hit-chance helper.
 * Exceptions: None.
 */
import type { AirStrikeTargetType } from '../shared/ipc/ordersTypes';
import { logTrace } from './logger';

/**
 * Number of faces on the combat die.
 *
 * Purpose: Every hit roll draws one face from 1 to this value.
 * When to use: Rollers, estimates, and tests that turn a face into a uniform draw.
 * Expected outcome: A roll hits when the face is at or below the hit number, so each point of hit number is 5%.
 * Exceptions: None.
 */
export const COMBAT_DIE_SIDES = 20;

/**
 * Lowest attack hit number that weather penalties and terrain cover can leave.
 *
 * Purpose: A penalized shot keeps a small chance to hit.
 * When to use: `attackHitThreshold`, before the origin bonus is added.
 * Expected outcome: Penalties never lower a printed attack below this value (10%).
 * Exceptions: None.
 */
export const MIN_ATTACK_HIT_THRESHOLD = 2;

/**
 * Highest hit number any roll can reach.
 *
 * Purpose: The top faces always miss, however many bonuses stack.
 * When to use: `attackHitThreshold` and `defenseHitThreshold`, after the origin bonus.
 * Expected outcome: No hit number exceeds this value (85%), so 18, 19, and 20 always miss.
 * Exceptions: None.
 */
export const MAX_HIT_THRESHOLD = 17;

/**
 * Hit number for infrastructure counter-fire against an air unit that strikes it.
 *
 * Purpose: Urban areas, airports, and seaports shoot back at strikers with fixed odds.
 * When to use: After a strategic or battle air strike on infrastructure resolves.
 * Expected outcome: The striker is lost on a roll at or below the target's value: urban and seaport 15%, airport 35%. Origin, weather, and cover never change it.
 * Exceptions: None.
 */
export const INFRASTRUCTURE_COUNTER_FIRE_THRESHOLD: Readonly<Record<Exclude<AirStrikeTargetType, 'units'>, number>> =
  Object.freeze({ urban: 3, airport: 7, seaport: 3 });

/**
 * Wraps a uniform random source as a combat die roller.
 *
 * Purpose: Keeps the face conversion in one place so every roll consumes exactly one draw.
 * When to use: Once per resolution phase, with that phase's seeded `next`.
 * Expected outcome: A function returning integers from 1 to `COMBAT_DIE_SIDES`. The returned roller does not log, because it runs once per die.
 * Exceptions: None.
 */
export function createCombatDieRoller(next: () => number): () => number {
  logTrace('combatDice createCombatDieRoller');
  return () => Math.floor(next() * COMBAT_DIE_SIDES) + 1;
}

/**
 * Returns the chance that one roll hits a given hit number.
 *
 * Purpose: Combat estimates turn hit numbers into probabilities the same way the die does.
 * When to use: Per rolling unit in `estimate_combat`. It does not log, because it runs once per die.
 * Expected outcome: A value from 0 to 1; hit numbers outside the die are clamped.
 * Exceptions: None.
 */
export function hitChanceForThreshold(threshold: number): number {
  return Math.min(Math.max(threshold, 0), COMBAT_DIE_SIDES) / COMBAT_DIE_SIDES;
}
