/**
 * Records combat die rolls for resolution playback without changing how combat draws from the RNG.
 */
import type { CombatDicePlaybackFields, CombatDiceRoll } from '../shared/ipc/combatDiceTypes';
import { logDebug, logTrace } from './logger';

/**
 * Receives each recorded die roll.
 *
 * Purpose: Lets roll sites report rolls without knowing where they are stored.
 * When to use: Pass one into combat functions that accept an `onRoll` sink; omit it to record nothing.
 * Expected outcome: Called once per die, in roll order. It must only observe; it never affects combat.
 * Exceptions: None.
 */
export type CombatDiceRollSink = (roll: CombatDiceRoll) => void;

/**
 * Everything about a roll that is known before the die is drawn.
 *
 * Purpose: Roll sites describe who is rolling and where; the helper adds the face and hit number.
 * When to use: The `context` argument of `rollCombatDieAgainst`.
 * Expected outcome: A `CombatDiceRoll` without `face` and `threshold`.
 * Exceptions: None.
 */
export type CombatDiceRollContext = Omit<CombatDiceRoll, 'face' | 'threshold'>;

/**
 * An in-memory list of rolls plus the sink that appends to it.
 *
 * Purpose: One accumulator per resolution phase, so each phase's rolls stay separate for playback.
 * When to use: Create with `createCombatDiceLog` at the start of a phase; hand `sink` to roll sites and read `rolls` at the end.
 * Expected outcome: `rolls` holds every roll passed to `sink`, in order.
 * Exceptions: None.
 */
export interface CombatDiceLog {
  /**
   * Rolls recorded so far, in roll order.
   *
   * Contract: Only `sink` appends; callers may append rolls gathered from a nested phase.
   * When to use: Read at the end of a phase to build the playback payload.
   * Expected outcome: Every recorded roll, oldest first.
   * Exceptions: None.
   */
  readonly rolls: CombatDiceRoll[];
  /**
   * Appends one roll to `rolls`.
   *
   * Contract: Safe to call any number of times; never throws.
   * When to use: Pass to `rollCombatDieAgainst` or to a combat function's `onRoll` option.
   * Expected outcome: `rolls` grows by one entry per call.
   * Exceptions: None.
   */
  readonly sink: CombatDiceRollSink;
}

/**
 * Creates an empty dice log for one resolution phase.
 *
 * Purpose: Gives each phase its own roll list without threading arrays through every helper.
 * When to use: Once at the start of each air strike, ranged, or melee phase.
 * Expected outcome: A log whose `rolls` starts empty and whose `sink` appends to it.
 * Exceptions: None.
 */
export function createCombatDiceLog(): CombatDiceLog {
  logDebug('createCombatDiceLog');
  const rolls: CombatDiceRoll[] = [];
  return { rolls, sink: (roll) => rolls.push(roll) };
}

/**
 * Draws one combat die, reports it to an optional sink, and tells whether it hit.
 *
 * Purpose: Single roll-and-compare step for every combat roll site, so recording can never change the dice.
 * When to use: In place of `rollDie() <= threshold` wherever a combat die is rolled.
 * Expected outcome: Exactly one `rollDie()` draw whether or not a sink is given; returns `face <= threshold`.
 *   The sink only observes. `threshold` is computed by the caller before the draw, which is safe because hit
 *   numbers are table lookups that never draw from the RNG. Logs every roll at debug.
 * Exceptions: None.
 */
export function rollCombatDieAgainst(
  rollDie: () => number,
  threshold: number,
  context: CombatDiceRollContext,
  sink?: CombatDiceRollSink
): boolean {
  const face = rollDie();
  const roll: CombatDiceRoll = { ...context, face, threshold };
  const hit = face <= threshold;
  sink?.(roll);
  logDebug('rollCombatDieAgainst', { ...roll, hit, recorded: sink !== undefined });
  return hit;
}

/**
 * Builds the playback dice fields for one resolution, leaving out phases that rolled nothing.
 *
 * Purpose: One place for the omit-when-empty rule shared by strategic Ready results and tactical commit playback.
 * When to use: When assembling `ReadyResult` or `TacticalCommitResolutionPlayback` from phase results.
 * Expected outcome: An object to spread into the payload; each key is present only when its array is non-empty.
 * Exceptions: None.
 */
export function combatDicePlaybackFields(
  airStrikeDiceRolls: readonly CombatDiceRoll[],
  rangedDiceRolls: readonly CombatDiceRoll[],
  meleeDiceRolls: readonly CombatDiceRoll[]
): CombatDicePlaybackFields {
  logTrace('combatDicePlaybackFields', {
    airStrikeCount: airStrikeDiceRolls.length,
    rangedCount: rangedDiceRolls.length,
    meleeCount: meleeDiceRolls.length,
  });
  return {
    ...(airStrikeDiceRolls.length > 0 ? { airStrikeDiceRolls } : {}),
    ...(rangedDiceRolls.length > 0 ? { rangedDiceRolls } : {}),
    ...(meleeDiceRolls.length > 0 ? { meleeDiceRolls } : {}),
  };
}
