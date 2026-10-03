/**
 * Hashes a string to an unsigned 32-bit integer with FNV-1a over UTF-16 code units.
 *
 * Purpose: Deterministic, machine-independent seeds and picks that never touch gameplay random streams.
 * When to use: Tactical placement seeds and unit birth-cell selection.
 * Expected outcome: The same string always yields the same integer in `[0, 2^32)`.
 * Exceptions: None.
 */
export function hashStringToUint32(text: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
