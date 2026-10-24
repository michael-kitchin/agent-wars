/**
 * Applies parsed opponent callback subscriptions after an OpenRouter orders response.
 *
 * Purpose: Keeps tactical roster filtering out of the large `requestOrdersFlow` body while preserving strategic replace-all semantics.
 * When to use: Immediately after a successful `parseOrdersResponse` that may include `callbacks`.
 * Expected outcome: Empty or omitted `callbacks` clears every opponent subscription. Non-empty strategic path replaces. Tactical path drops invalid unit-scoped ids, then replaces with kept rows (or clears when all dropped).
 * Exceptions: None.
 */

import type { AiSeatId } from '../../shared/seatIds';
import {
  clearSubscriptions,
  replaceSubscriptions,
  type CallbackSubscription,
} from '../callbackSubscriptions';
import { logDebug } from '../logger';
import { filterCallbackSubscriptionsForTacticalBattleRoster } from './tacticalCallbackSubscriptionLifecycle';

/**
 * Writes opponent callbacks from a parsed orders response, applying tactical roster filtering when in battle.
 *
 * Purpose: Ensures mid-battle subscriptions only reference rostered sub-unit ids while keeping valid sibling entries.
 * When to use: `requestOrdersFlow` after parse/repair succeeds.
 * Expected outcome: Returns the number of subscriptions stored (0 when the list is omitted, empty, or fully cleared).
 * Exceptions: None.
 */
export function applyParsedCallbackSubscriptions(args: {
  seatId: AiSeatId;
  callbacks: CallbackSubscription[] | undefined;
  turnNumber: number;
  battleSubUnitIds: ReadonlySet<string> | null;
  battleId?: string;
}): number {
  const { seatId, callbacks, turnNumber, battleSubUnitIds, battleId } = args;
  logDebug('applyParsedCallbackSubscriptions', {
    seatId,
    inputCount: callbacks?.length ?? 0,
    tactical: battleSubUnitIds != null,
    battleId: battleId ?? null,
  });
  if (!callbacks?.length) {
    clearSubscriptions(seatId);
    return 0;
  }

  if (battleSubUnitIds == null) {
    replaceSubscriptions(seatId, callbacks, turnNumber);
    return callbacks.length;
  }

  const { kept, droppedCount } = filterCallbackSubscriptionsForTacticalBattleRoster(
    callbacks,
    battleSubUnitIds
  );
  if (droppedCount > 0) {
    logDebug('applyParsedCallbackSubscriptions: dropped invalid tactical callback entries', {
      battleId: battleId ?? null,
      droppedCount,
      keptCount: kept.length,
    });
  }
  if (kept.length > 0) replaceSubscriptions(seatId, kept, turnNumber);
  else clearSubscriptions(seatId);
  return kept.length;
}
