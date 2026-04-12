/**
 * Shared precondition checks for strategic `ready` and `resolveMeleeIntercept` without duplicating log strings.
 */

import { logDebug, logError } from '../logger';
import type { ReadyResult } from '../../shared/ipcTypes';
import { isDbReady } from '../gameDb';
import { isTacticalBattleActive } from '../tacticalBattle/tacticalBattleSession';
import { peekMeleeInterceptPendingSnapshot } from './meleeInterceptPendingState';

/**
 * Returns a failed `ReadyResult` when the game database is not ready for strategic actions.
 *
 * Purpose: Matches legacy `ready` / `resolveMeleeIntercept` error text and log prefixes.
 * When to use: First guard in strategic turn resolution entry points.
 * Expected outcome: `null` when `isDbReady()` is true.
 * Exceptions: None.
 */
export function failIfDatabaseNotReady(context: 'ready' | 'resolveMeleeIntercept'): ReadyResult | null {
  logDebug('failIfDatabaseNotReady', { context });
  if (!isDbReady()) {
    if (context === 'ready') {
      logError('ready: database not initialized');
    } else {
      logError('resolveMeleeIntercept: database not initialized', {});
    }
    return { success: false, reason: 'Database not initialized' };
  }
  return null;
}

/**
 * Returns a failed `ReadyResult` when a tactical battle session is still active.
 *
 * Purpose: Same user-facing reason string as the pre-extraction `gameActions` implementation.
 * When to use: After database readiness succeeds for any strategic resolution IPC.
 * Expected outcome: `null` when no tactical session is active.
 * Exceptions: None.
 */
export function failIfTacticalBattleActive(context: 'ready' | 'resolveMeleeIntercept'): ReadyResult | null {
  logDebug('failIfTacticalBattleActive', { context });
  if (isTacticalBattleActive()) {
    if (context === 'ready') {
      logError('ready: tactical battle active');
    } else {
      logError('resolveMeleeIntercept: tactical battle active', {});
    }
    return {
      success: false,
      reason: 'Finish or exit the tactical battle before resolving the strategic turn.',
    };
  }
  return null;
}

/**
 * Returns a failed `ReadyResult` when a melee-intercept decision is still awaiting human input.
 *
 * Purpose: Only for `ready`; `resolveMeleeIntercept` uses the inverse pending snapshot check separately.
 * When to use: After phase flip to `resolution` is inappropriate until the dialog is cleared.
 * Expected outcome: `null` when no pending melee snapshot exists.
 * Exceptions: None.
 */
export function failIfMeleeInterceptDecisionPending(): ReadyResult | null {
  const pending = peekMeleeInterceptPendingSnapshot();
  logDebug('failIfMeleeInterceptDecisionPending', { hasPending: !!pending });
  if (pending) {
    logError('ready: melee intercept decision still pending');
    return {
      success: false,
      reason:
        'A melee intercept decision is still pending. Choose Fight or Ignore in the dialog before readying again.',
    };
  }
  return null;
}
