/**
 * Buckets legal destination hexes into homeland / nearest-to-homeland / other for briefing markdown tables.
 *
 * Purpose: Keeps `possibleUnitActions.ts` focused on markdown assembly while preserving testable pure geometry helpers.
 * When to use: From `possibleUnitActions` when formatting possible moves; tests import via the main module re-export.
 * Expected outcome: Deterministic sorted arrays per bucket; every distinct legal hex is in exactly one bucket. Homeland wins when any legal hex hits the homeland set. A hex outside that set which H3 cannot measure still goes to `other`.
 * Exceptions: None; invalid pairs in `homelandSet` are skipped by `gridDistance` try/catch in distance scans.
 */

import { gridDistance } from 'h3-js';
import { logTrace } from '../logger';

/**
 * Lexicographic ordering for H3 index strings used when geographic tie-breakers do not apply.
 *
 * Purpose: Stable ordering for snapshot tests and markdown diffs.
 * When to use: Sorting bucket outputs in partition and other hex lists in the parent module.
 * Expected outcome: `localeCompare` ascending order.
 * Exceptions: None.
 */
export function compareHexIds(a: string, b: string): number {
  return a.localeCompare(b);
}

/**
 * Minimum grid distance from `h3` to any cell in `homeland`, or null when homeland is empty or all distances throw.
 *
 * Purpose: Feeds the “nearest” bucket when no legal hex lies inside homeland.
 * When to use: Only from `partitionHomelandNearestOther` for non-homeland legal sets.
 * Expected outcome: Smallest finite distance across homeland members.
 * Exceptions: None; individual `gridDistance` failures are ignored.
 */
function minDistanceToHomeland(h3: string, homeland: Set<string>): number | null {
  if (homeland.size === 0) return null;
  let min = Infinity;
  for (const t of homeland) {
    try {
      const d = gridDistance(h3, t);
      if (d < min) min = d;
    } catch {
      continue;
    }
  }
  return min === Infinity ? null : min;
}

/**
 * Partitions legal hex ids into homeland hits, minimum-distance band, or farther “other” hexes.
 *
 * Purpose: Drives section headers in the possible-actions markdown without duplicating homeland logic. Best Options lists every bucket, so a hex left out of all three never becomes a row.
 * When to use: After computing `legalHexes` for a unit and the enemy homeland set from scenario state.
 * Expected outcome: If any legal hex is in homeland, `nearest` is empty and non-homeland legal hexes become `other`. Otherwise the minimum finite distance is `nearest`, farther measurable hexes are `other`, and a hex whose distance to every homeland cell throws is `other` rather than dropped.
 * Exceptions: None.
 */
export function partitionHomelandNearestOther(legalHexes: string[], homelandSet: Set<string>): {
  homeland: string[];
  nearest: string[];
  other: string[];
} {
  logTrace('possibleUnitActions partitionHomelandNearestOther', {
    legalHexCount: legalHexes.length,
    homelandHexCount: homelandSet.size,
  });
  const unique = [...new Set(legalHexes)];
  if (homelandSet.size === 0) return { homeland: [], nearest: [], other: unique.sort(compareHexIds) };
  const inHomeland = unique.filter((h) => homelandSet.has(h));
  if (inHomeland.length > 0) {
    const other = unique.filter((h) => !homelandSet.has(h)).sort(compareHexIds);
    return { homeland: inHomeland.sort(compareHexIds), nearest: [], other };
  }
  const measured: Array<{ h: string; d: number }> = [];
  const unmeasurable: string[] = [];
  for (const h of unique) {
    const d = minDistanceToHomeland(h, homelandSet);
    if (d === null) unmeasurable.push(h);
    else measured.push({ h, d });
  }
  if (measured.length === 0) return { homeland: [], nearest: [], other: unique.sort(compareHexIds) };
  const minD = Math.min(...measured.map((x) => x.d));
  const nearest = measured.filter((x) => x.d === minD).map((x) => x.h).sort(compareHexIds);
  const farther = measured.filter((x) => x.d > minD).map((x) => x.h);
  const other = [...farther, ...unmeasurable].sort(compareHexIds);
  return { homeland: [], nearest, other };
}
