/**
 * Applies parsed opponent callback subscriptions after an OpenRouter orders response.
 *
 * Purpose: Keeps tactical roster filtering out of the large `requestOrdersFlow` body while preserving strategic replace-all semantics.
 * When to use: Immediately after a successful `parseOrdersResponse` that may include `callbacks`.
 * Expected outcome: Strategic path replaces when non-empty. Tactical path drops invalid unit-scoped ids, then replaces with kept rows (or clears when all dropped).
 * Exceptions: None.
 */

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
 * Expected outcome: Returns the number of subscriptions stored (0 when none applied / all cleared).
 * Exceptions: None.
 */
export function applyParsedOpponentCallbackSubscriptions(args: {
  callbacks: CallbackSubscription[] | undefined;
  turnNumber: number;
  battleSubUnitIds: ReadonlySet<string> | null;
  battleId?: string;
}): number {
  const { callbacks, turnNumber, battleSubUnitIds, battleId } = args;
  logDebug('applyParsedOpponentCallbackSubscriptions', {
    inputCount: callbacks?.length ?? 0,
    tactical: battleSubUnitIds != null,
    battleId: battleId ?? null,
  });
  if (!callbacks?.length) return 0;

  if (battleSubUnitIds == null) {
    replaceSubscriptions('opponent', callbacks, turnNumber);
    return callbacks.length;
  }

  const { kept, droppedCount } = filterCallbackSubscriptionsForTacticalBattleRoster(
    callbacks,
    battleSubUnitIds
  );
  if (droppedCount > 0) {
    logDebug('applyParsedOpponentCallbackSubscriptions: dropped invalid tactical callback entries', {
      battleId: battleId ?? null,
      droppedCount,
      keptCount: kept.length,
    });
  }
  if (kept.length > 0) replaceSubscriptions('opponent', kept, turnNumber);
  else clearSubscriptions('opponent');
  return kept.length;
}
