/**
 * Deterministic PRNG helpers for tactical combat tests that consume combat die rolls built with `createCombatDieRoller`.
 *
 * Purpose: Makes air-strike and ranged tests express intended dice faces instead of opaque uniform draws.
 * When to use: Any tactical test passing a `next: () => number` into phase resolution helpers.
 * Expected outcome: Stable die outcomes and loud failures when resolution draws more rolls than seeded.
 * Exceptions: `tacticalUniformForCombatDieFace` throws when `face` is not a die face; sequenced helper throws on overrun.
 */
import { COMBAT_DIE_SIDES } from '../../combatDice';

/**
 * Returns a uniform [0, 1) draw that the combat die roller maps to the requested face.
 *
 * Purpose: Documents test intent as “roll a 1” rather than guessing a raw float like `0.99`.
 * When to use: Seeding air-strike hit and AA counter rolls in tactical ordering alignment tests.
 * Expected outcome: The next tactical die roll in resolution equals `face`.
 * Exceptions: Throws `RangeError` when `face` is not an integer from 1 to `COMBAT_DIE_SIDES`.
 */
export function tacticalUniformForCombatDieFace(face: number): number {
  if (!Number.isInteger(face) || face < 1 || face > COMBAT_DIE_SIDES) {
    throw new RangeError(`tacticalUniformForCombatDieFace: face must be 1–${COMBAT_DIE_SIDES}, got ${face}`);
  }
  return (face - 1) / COMBAT_DIE_SIDES;
}

/**
 * Builds a `next` callback that returns seeded draws in order and fails when resolution asks for extra rolls.
 *
 * Purpose: Prevents silent fallback values (for example `?? 0.99`) from masking unexpected AA or infra counter rolls.
 * When to use: Tactical phase tests with a known, finite dice sequence.
 * Expected outcome: Each call returns the next seeded value; overrun throws with a clear message.
 * Exceptions: Throws when draw count exceeds `rolls.length`.
 */
export function tacticalSequencedRandom(rolls: readonly number[]): () => number {
  let index = 0;
  return () => {
    if (index >= rolls.length) {
      throw new Error(`unexpected tactical random draw ${index + 1}; only ${rolls.length} value(s) seeded`);
    }
    return rolls[index++]!;
  };
}
