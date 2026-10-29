/**
 * Strategic hexes one missile can reach.
 *
 * Purpose: Launch validation and resolution share one disk. `gridDistance` fails for nearly every pair farther
 * apart than about 4,000 km on the global map, so range is membership in `gridDisk`, which includes the origin.
 * When to use: Before accepting a launch target.
 * Expected outcome: A set of strategic hexes, or an empty set when the disk cannot be built.
 * Exceptions: A thrown `gridDisk` is logged and becomes an empty set.
 */

import { gridDisk } from 'h3-js';
import { DEFAULT_BOUNDED_MEMO_CAPACITY, getBoundedMemo } from '../../shared/boundedMemoCache';
import { missileRangeHexes } from '../../shared/gameRules';
import { logError, logTrace } from '../logger';

/**
 * Disks already built for one origin and the current range.
 *
 * Purpose: Many missiles on one hex share one disk.
 * When to use: Only from `missileReachSet`.
 * Expected outcome: Keys are `origin|range`.
 * Exceptions: None.
 */
const missileReachMemo = new Map<string, ReadonlySet<string>>();

/**
 * Strategic hexes within missile range of an origin, including the origin.
 *
 * Purpose: A target is in range exactly when it is in this set.
 * When to use: `isWithinMissileRange` and any caller that needs the whole disk.
 * Expected outcome: The memoized `gridDisk` for `missileRangeHexes()`. Empty when `gridDisk` throws.
 * Exceptions: None. A disk failure is logged and returned as an empty set.
 */
export function missileReachSet(originH3Index: string): ReadonlySet<string> {
  const range = missileRangeHexes();
  logTrace('missileReach missileReachSet', { originH3Index, range });
  const key = `${originH3Index}|${range}`;
  return getBoundedMemo(missileReachMemo, key, DEFAULT_BOUNDED_MEMO_CAPACITY, () => {
    try {
      return new Set(gridDisk(originH3Index, range));
    } catch (err) {
      logError('missileReach missileReachSet: gridDisk failed', { originH3Index, range, err });
      return new Set<string>();
    }
  });
}

/**
 * Whether a target hex is inside the missile disk of an origin.
 *
 * Purpose: Validation rejects a target this returns false for.
 * When to use: `validateMissileLaunchOrder`.
 * Expected outcome: True when the target is in `missileReachSet`, including the origin hex.
 * Exceptions: None.
 */
export function isWithinMissileRange(originH3Index: string, targetH3Index: string): boolean {
  const within = missileReachSet(originH3Index).has(targetH3Index);
  logTrace('missileReach isWithinMissileRange', { originH3Index, targetH3Index, within });
  return within;
}
