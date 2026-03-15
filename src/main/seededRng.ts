/**
 * Seeded pseudo-random number generator for deterministic combat and participant IDs.
 * Mulberry32: one 32-bit state, returns next() in [0, 1). Same seed yields same sequence.
 * The two Math.imul steps provide the avalanche effect that ensures small seed differences
 * (e.g. consecutive turn numbers) produce uncorrelated output sequences.
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
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
    t = (t ^ (t + Math.imul(t ^ (t >>> 7), t | 61))) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}
