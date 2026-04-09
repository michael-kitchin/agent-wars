import { gridDisk } from 'h3-js';
import { logDebug } from '../logger';
import { isWithinGridRangeSafe } from '../game-actions/gridRange';

export type RangeEnvelopeCache = Map<string, Set<string>>;

/**
 * Why this exists:
 *     Builds and caches a fixed-radius H3 envelope so multiple consumers can do fast set-membership range checks.
 * When to use:
 *     Prompt assembly paths that perform many repeated "within N hexes" checks from the same base.
 * What to expect:
 *     Returns all in-universe hexes within `rangeHexes` of `baseH3` and reuses cached envelopes per turn call-site.
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
