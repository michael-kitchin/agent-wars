/**
 * LRU-ish insertion helpers for bounded in-memory caches used by human march hover previews.
 *
 * Purpose: Shares eviction policy between route and result memo maps without duplicating logic in `humanMarchPreview.ts`.
 * When to use: Whenever a preview cache entry is written and must respect a max entry cap.
 * Expected outcome: New key becomes most-recent; overflow drops oldest insertion-ordered keys.
 * Exceptions: None.
 */

/**
 * Inserts or updates a cache entry and evicts oldest keys until size is at most `maxEntries`.
 *
 * Purpose: Keeps hover preview caches from growing without bound during long sessions.
 * When to use: After computing a route or preview result that should be memoized.
 * Expected outcome: `cache.size` never exceeds `maxEntries` after the call returns.
 * Exceptions: None.
 */
export function cacheSetBounded<T>(cache: Map<string, T>, key: string, value: T, maxEntries: number): void {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) break;
    cache.delete(oldestKey);
  }
}
