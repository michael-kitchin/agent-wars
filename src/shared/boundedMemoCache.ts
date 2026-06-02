/**
 * Bounded FIFO memoization for immutable pure-function results.
 *
 * Purpose: Shared eviction policy for process-lifetime caches (H3 distances, grid disks) without importing main-process logging.
 * When to use: Any shared helper that memoizes pure results with a stable string key and a fixed capacity.
 * Expected outcome: Repeated keys return the prior value; when the new entry would exceed capacity, it is added first and then the
 * oldest entry is immediately evicted, keeping the map at most `capacity` entries after every call.
 * Exceptions: None.
 */

/** Default capacity aligned with other main-process dedup caches (~50k H3 distance pairs per session). */
export const DEFAULT_BOUNDED_MEMO_CAPACITY = 50_000;

/**
 * Returns a memoized value for `key`, computing and storing it on first access.
 *
 * Purpose: Centralizes FIFO eviction so multiple caches share one policy.
 * When to use: Inside pure helpers where `undefined` is not a valid cached value (use `null` or a wrapper if it is).
 * Expected outcome: Same return value as `compute()` for equivalent keys within the cache window.
 * Exceptions: Propagates exceptions from `compute()`.
 */
export function getBoundedMemo<T>(cache: Map<string, T>, key: string, capacity: number, compute: () => T): T {
  if (cache.has(key)) return cache.get(key)!;
  const value = compute();
  cache.set(key, value);
  if (cache.size > capacity) {
    const first = cache.keys().next().value as string | undefined;
    if (first !== undefined) cache.delete(first);
  }
  return value;
}
