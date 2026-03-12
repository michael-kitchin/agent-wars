/**
 * Seeded pseudo-random number generator for deterministic combat and participant IDs.
 * Mulberry32: one 32-bit state, returns next() in [0, 1). Same seed yields same sequence.
 */

/**
 * Creates a seeded RNG function. Use for all combat dice and participant ID assignment
 * so replay with the same seed and same orders yields the same outcome.
 * @param seed - Integer seed (e.g. from game config).
 * @returns Function that returns the next value in [0, 1).
 */
export function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0; // mulberry32
    const t = (state ^ (state >>> 15)) >>> 0;
    return t / 0x100000000;
  };
}

/**
 * Returns a random integer in [min, max] (inclusive) using the given next function.
 */
export function nextInt(next: () => number, min: number, max: number): number {
  const range = max - min + 1;
  return min + Math.floor(next() * 0x100000000 * range) % range;
}
