import { gridDisk } from 'h3-js';
import { logDebug } from '../logger';
import { isWithinGridRangeSafe } from '../gameActions/gridRange';

/**
 * Documents the `RangeEnvelopeCache` type alias (export type RangeEnvelopeCache).

 * Purpose: Supports maintainability by documenting why `RangeEnvelopeCache` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export type RangeEnvelopeCache = Map<string, Set<string>>;

/**
 * Defines the `getRangeEnvelopeByBase` function shape (export function getRangeEnvelopeByBase().

 * Purpose: Supports maintainability by documenting why `getRangeEnvelopeByBase` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getRangeEnvelopeByBase(
  baseH3: string,
  rangeHexes: number,
  hexUniverse: Set<string>,
  cache: RangeEnvelopeCache
): Set<string> {
  const key = `${baseH3}|${rangeHexes}`;
  const cached = cache.get(key);
  if (cached) return cached;
  let envelope: Set<string>;
  try {
    envelope = new Set(gridDisk(baseH3, rangeHexes).filter((h3) => hexUniverse.has(h3)));
  } catch {
    // Fallback keeps behavior robust on rare H3 edge cases while still honoring finite radius.
    const fallback = new Set<string>();
    for (const h3 of hexUniverse) {
      if (isWithinGridRangeSafe(baseH3, h3, rangeHexes, 'rangeSupport envelope fallback')) {
        fallback.add(h3);
      }
    }
    envelope = fallback;
    logDebug('openRouter getRangeEnvelopeByBase: used fallback envelope scan', {
      baseH3,
      rangeHexes,
      universeSize: hexUniverse.size,
      resultSize: envelope.size,
    });
  }
  cache.set(key, envelope);
  return envelope;
}
