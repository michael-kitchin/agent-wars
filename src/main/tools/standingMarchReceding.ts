/**
 * Detects standing marches whose next step increases hop distance to the nearest observed enemy.
 *
 * Purpose: The briefing must mark receding marches so the model overrides them instead of sailing
 * or marching away after a legal shot. Shared by Standing Order Status and Action needed.
 * When to use: After a march destination or next-move hex is known.
 * Expected outcome: True only when both hops are measurable and the step is strictly farther.
 * Exceptions: None; unmeasurable pairs are treated as not receding.
 */

import { logTrace } from '../logger';
import { gridHopDistanceBetween } from './assessUnitProximity';

/**
 * True when moving from `unitH3` to `stepH3` increases hop distance to `enemyH3`.
 *
 * Purpose: One comparison for the Attention column and for Action needed.
 * When to use: March/pursue next-move or destination hex versus the nearest observed enemy hex.
 * Expected outcome: False when any hop count is missing or the step does not recede.
 * Exceptions: None.
 */
export function marchStepRecedesFromEnemy(unitH3: string, stepH3: string, enemyH3: string): boolean {
  logTrace('standingMarchReceding marchStepRecedesFromEnemy', { unitH3, stepH3, enemyH3 });
  const here = gridHopDistanceBetween(unitH3, enemyH3);
  const there = gridHopDistanceBetween(stepH3, enemyH3);
  if (here === null || there === null) return false;
  return there > here;
}

/**
 * Picks the nearest enemy hex to `unitH3` by grid hops.
 *
 * Purpose: Receding detection needs one enemy hex without re-running assessment.
 * When to use: Standing-order briefing rows when the snapshot lists observed enemies.
 * Expected outcome: The closest measurable enemy hex, or null when none pair.
 * Exceptions: None.
 */
export function nearestObservedEnemyH3(unitH3: string, enemyH3s: readonly string[]): string | null {
  logTrace('standingMarchReceding nearestObservedEnemyH3', {
    unitH3,
    enemyCount: enemyH3s.length,
  });
  let best: { h3: string; d: number } | null = null;
  for (const enemyH3 of enemyH3s) {
    const d = gridHopDistanceBetween(unitH3, enemyH3);
    if (d === null) continue;
    if (best === null || d < best.d) best = { h3: enemyH3, d };
  }
  return best?.h3 ?? null;
}
