/**
 * Tactical-only validation helpers for human march IPC before drafts are committed on Ready.
 *
 * Purpose: Keeps tactical march pre-checks out of `gameActions.ts` while sharing the same snapshot rules as commit.
 * When to use: From `assignHumanMarchOrder` / `assignHumanMarchOrders` when a tactical battle is active.
 * Expected outcome: `success: true` when `validateHumanTacticalMarchOrders` accepts the synthetic order list.
 * Exceptions: Caught exceptions become `success: false` with a string reason and error logs.
 */

import { isDbReady } from '../gameDb';
import { validateHumanTacticalMarchOrders } from '../tacticalBattle/tacticalBattleSession';
import { logDebug, logError } from '../logger';

/**
 * Validates grouped human march IPC for tactical drafts without mutating the committed tactical snapshot.
 *
 * Purpose: Lets the renderer store march targets locally until tactical Ready calls `commitHumanTacticalDraftOrders`.
 * When to use: `assignHumanMarchOrder(s)` after `isTacticalBattleActive()` succeeds and unit ids are de-duplicated.
 * Expected outcome: `success: true` when every move is legal on the current snapshot; never returns `tacticalBattle`.
 * Exceptions: Caught and logged at error; returned as `success: false` with stringified message.
 */
export function validateHumanMarchOrdersWhenTacticalActive(
  uniqueUnitIds: string[],
  destinationH3Index: string
): { success: boolean; reason?: string } {
  logDebug('tacticalMarchOrderGuards validateHumanMarchOrdersWhenTacticalActive', {
    unitCount: uniqueUnitIds.length,
    destinationH3Index,
  });
  try {
    if (!isDbReady()) return { success: false, reason: 'Database not initialized' };
    const orders = uniqueUnitIds.map((unitId) => ({ unitId, toH3Index: destinationH3Index }));
    const checked = validateHumanTacticalMarchOrders(orders);
    if (!checked.success) {
      logDebug('tacticalMarchOrderGuards validateHumanMarchOrdersWhenTacticalActive rejected', { reason: checked.reason });
      return { success: false, reason: checked.reason };
    }
    logDebug('tacticalMarchOrderGuards validateHumanMarchOrdersWhenTacticalActive accepted', {
      unitCount: uniqueUnitIds.length,
      destinationH3Index,
      unitIds: uniqueUnitIds,
    });
    return { success: true };
  } catch (err) {
    logError('validateHumanMarchOrdersWhenTacticalActive: exception', err);
    return { success: false, reason: String(err) };
  }
}
