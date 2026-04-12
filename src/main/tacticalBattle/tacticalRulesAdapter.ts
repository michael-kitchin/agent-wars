/**
 * Tactical rules adapter seed: res4 spatial checks that future tactical combat/movement will share with strategic parity layers.
 */

import { tacticalLogQuery } from './tacticalLogging';
import { tacticalRes4GridDistance } from './tacticalSpatialAdapter';

/**
 * Returns whether two res4 cells are within a maximum inclusive grid-step distance for tactical march-style checks.
 *
 * Contract: Uses `tacticalRes4GridDistance`; both cells must be valid resolution-4 indexes or the distance helper throws.
 * When to use: Tactical order validation before delegating into shared strategic march rules with res4 geometry.
 * Expected outcome: True when distance is less than or equal to `maxSteps` (including same-cell distance zero).
 * Exceptions: Propagates errors from `tacticalRes4GridDistance` for invalid indexes.
 */
export function tacticalMarchWithinRes4GridSteps(
  fromRes4H3Index: string,
  toRes4H3Index: string,
  maxSteps: number
): boolean {
  tacticalLogQuery('tacticalMarchWithinRes4GridSteps', { fromRes4H3Index, toRes4H3Index, maxSteps });
  const d = tacticalRes4GridDistance(fromRes4H3Index, toRes4H3Index);
  const ok = d <= maxSteps;
  tacticalLogQuery('tacticalMarchWithinRes4GridSteps result', { d, ok });
  return ok;
}
