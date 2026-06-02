/**
 * Deterministic PRNG helpers for tactical combat tests that consume `Math.floor(next * 6) + 1` d6 rolls.
 *
 * Purpose: Makes air-strike and ranged tests express intended dice faces instead of opaque uniform draws.
 * When to use: Any tactical test passing a `next: () => number` into phase resolution helpers.
 * Expected outcome: Stable d6 outcomes and loud failures when resolution draws more rolls than seeded.
 * Exceptions: `tacticalUniformForD6Face` throws when `face` is outside 1–6; sequenced helper throws on overrun.
 */

/**
 * Returns a uniform [0, 1) draw that tactical code maps to the requested d6 face via `Math.floor(next * 6) + 1`.
 *
 * Purpose: Documents test intent as “roll a 6” rather than guessing a raw float like `0.99`.
 * When to use: Seeding air-strike hit and AA counter rolls in tactical ordering alignment tests.
 * Expected outcome: The next tactical d6 roll in resolution equals `face`.
 * Exceptions: Throws `RangeError` when `face` is not in 1–6.
 */
export function tacticalUniformForD6Face(face: 1 | 2 | 3 | 4 | 5 | 6): number {
  if (face < 1 || face > 6) {
    throw new RangeError(`tacticalUniformForD6Face: face must be 1–6, got ${face}`);
  }
  return (face - 1) / 6;
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
