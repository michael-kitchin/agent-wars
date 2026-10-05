/**
 * Tech tier of a unit's birth hex.
 *
 * Purpose: The tier follows the generated urban count of the origin res1 hex, including after urban cells are destroyed.
 * When to use: Snapshot stamping and the hit-bonus lookup. Dice must not trust a stamp alone.
 * Expected outcome: `advanced` at five or more urban cells. A missing birth hex or an unloaded terrain cache is `basic` and does not throw.
 * Exceptions: None.
 */

import { logDebug, logTrace } from '../logger';
import { getRes1ProductionContext, isTerrainClassificationCacheLoaded } from '../terrainClassificationCache';
import { techLevelFromUrbanHexCount } from '../../shared/techBonusRules';
import type { TechLevel } from '../../shared/techBonusTypes';

/**
 * Reads the generated urban-cell count used to classify tech.
 *
 * Purpose: Keeps the cache guard in one place so a cold process does not throw.
 * When to use: The default counter for `techLevelForBirthHex` and combat lookups.
 * Expected outcome: The baseline count, or null when the cache is not loaded.
 * Exceptions: None. A loaded cache does not throw for an unknown hex; that hex counts as zero.
 */
export function urbanHexCountForTech(h3Index: string): number | null {
  logTrace('techBonus urbanHexCountForTech', { h3Index });
  if (!isTerrainClassificationCacheLoaded()) return null;
  return getRes1ProductionContext({ h3Index }).urbanHexCount;
}

/**
 * Classifies the res1 hex a unit was born in.
 *
 * Purpose: Production, tooltips, and dice agree on one tier for that hex.
 * When to use: When stamping `techLevel`, and from tests that pass `urbanHexCountAt`.
 * Expected outcome: `basic` when `birthH3Index` is missing, the counter returns null, or the count is below five.
 * Exceptions: None.
 */
export function techLevelForBirthHex(
  birthH3Index: string | null | undefined,
  urbanHexCountAt: (h3Index: string) => number | null = urbanHexCountForTech
): TechLevel {
  logDebug('techBonus techLevelForBirthHex', { birthH3Index: birthH3Index ?? null });
  if (!birthH3Index) return 'basic';
  return techLevelFromUrbanHexCount(urbanHexCountAt(birthH3Index));
}
