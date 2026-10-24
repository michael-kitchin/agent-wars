/**
 * Stashes opponent AI callback subscriptions around a tactical battle session (memory + game_config).
 *
 * Purpose: Preserves pre-battle strategic subscriptions across tactical replace-all and process restarts,
 * drops ephemeral sub-unit callbacks on battle end, and filters invalid unit-scoped ids mid-battle.
 * When to use: Stash after tactical start; hydrate on persisted session restore; filter before tactical replaceSubscriptions; restore on every end path.
 * Expected outcome: Pre-battle rows return after end when a stash was captured; missing stash (upgrade) clears only sub-unit unitId/side params.
 * Exceptions: Logs at error on restore failures without throwing across IPC.
 */

import { AI_SEAT_IDS, type AiSeatId } from '../../shared/seatIds';
import {
  clearSubscriptions,
  copyCallbackSubscriptions,
  getSubscriptions,
  replaceSubscriptions,
  type CallbackSubscription,
} from '../callbackSubscriptions';
import { logDebug, logError, logTrace } from '../logger';
import { parseTacticalSubUnitId } from '../../shared/unitIds';
import {
  clearTacticalCallbackStashFromGameConfig,
  readTacticalCallbackStashFromGameConfig,
  writeTacticalCallbackStashToGameConfig,
  type TacticalCallbackStash,
} from '../tacticalBattle/tacticalCallbackStashPersistence';

/**
 * Events that require `params.unitId` to name a rostered tactical sub-unit during battle.
 *
 * Purpose: Shared vocabulary for mid-battle drop rules without duplicating event lists at call sites.
 * When to use: `filterCallbackSubscriptionsForTacticalBattleRoster` only.
 * Expected outcome: Fixed set aligned with callback evaluation unit-id matching.
 * Exceptions: None.
 */
const UNIT_ID_SCOPED_CALLBACK_EVENTS = new Set(['unit_engaged', 'unit_arrived', 'threat_escalation']);

/**
 * In-memory copy of pre-battle opponent subscriptions for the active tactical session.
 *
 * Purpose: Fast restore without re-reading SQLite when the process never restarted.
 * When to use: Set by stash/hydrate; cleared after restore completes. `null` means no stash was captured in this process.
 * Expected outcome: The battle's AI seat and a deep copy of its rows, or a null seat when the other party is not an AI seat.
 * Exceptions: None.
 */
let stashedOpponentSubscriptions: TacticalCallbackStash | null = null;

/**
 * Legacy tactical sub-unit ids persisted as `${parentUnitId}:${twoDigitSlot}`.
 *
 * Purpose: Compatibility shim for callback subscriptions stashed before compact `-s<slot>` ids.
 * When to use: `looksLikeTacticalSubUnitId` only, OR-ed with the compact parser.
 * Expected outcome: Matches `u1:01` and similar; does not match compact `h1-t3-s2`.
 * Exceptions: None.
 */
const LEGACY_TACTICAL_SUB_UNIT_ID_PATTERN = /^.+:\d{2}$/;

/**
 * Returns whether `id` looks like a tactical sub-unit identifier.
 *
 * Purpose: Upgrade-path cleanup and heuristic detection of ephemeral battle callbacks without a roster.
 * When to use: Missing-stash end path and tests asserting selective clear.
 * Expected outcome: True for compact `-s<slot>` ids and legacy `parent:NN` ids.
 * Exceptions: None.
 */
export function looksLikeTacticalSubUnitId(id: string): boolean {
  logTrace('tacticalCallbackSubscriptionLifecycle looksLikeTacticalSubUnitId', { id });
  return parseTacticalSubUnitId(id) !== null || LEGACY_TACTICAL_SUB_UNIT_ID_PATTERN.test(id);
}

/**
 * Snapshots opponent callback subscriptions at tactical battle start into memory and `game_config`.
 *
 * Purpose: Preserves that seat's strategic subscriptions so sub-unit tactical callbacks can be discarded on battle end.
 * When to use: Immediately after a successful `startTacticalBattleForEnclosingStrategicHex` installs the session. Pass null when the other party is not an AI seat.
 * Expected outcome: In-memory stash overwritten; durable key written. A null seat records that restore must not touch any seat.
 * Exceptions: None.
 */
export function stashOpponentCallbackSubscriptionsForTacticalBattle(seatId: AiSeatId | null = AI_SEAT_IDS[0]): void {
  stashedOpponentSubscriptions = seatId === null
    ? { seatId: null, subscriptions: [] }
    : { seatId, subscriptions: copyCallbackSubscriptions(getSubscriptions(seatId)) };
  writeTacticalCallbackStashToGameConfig(stashedOpponentSubscriptions);
  logDebug('tacticalCallbackSubscriptionLifecycle stashOpponentCallbackSubscriptionsForTacticalBattle', {
    seatId,
    count: stashedOpponentSubscriptions.subscriptions.length,
  });
}

/**
 * Reloads a persisted callback stash into process memory after tactical session restore.
 *
 * Purpose: Rebuilds the in-memory stash after main-process restart so end can full-restore strategic callbacks.
 * When to use: `restorePersistedTacticalBattleSession` after a consistent snapshot is installed.
 * Expected outcome: Memory matches `game_config` when present; memory left null when the key is absent (upgrade path).
 * Exceptions: None.
 */
export function hydrateOpponentCallbackStashFromGameConfig(): void {
  const fromDisk = readTacticalCallbackStashFromGameConfig();
  stashedOpponentSubscriptions = fromDisk === null
    ? null
    : { seatId: fromDisk.seatId, subscriptions: copyCallbackSubscriptions(fromDisk.subscriptions) };
  logDebug('tacticalCallbackSubscriptionLifecycle hydrateOpponentCallbackStashFromGameConfig', {
    hydrated: fromDisk !== null,
    seatId: fromDisk?.seatId ?? null,
    count: fromDisk?.subscriptions.length ?? 0,
  });
}

/**
 * Drops unit-scoped callback entries whose unit id is not in the active battle roster; keeps valid siblings.
 *
 * Purpose: Prevents strategic parent ids (and invented ids) from being stored during tactical consultations.
 * When to use: Immediately before `replaceSubscriptions` when `tacticalAiBattle` is set.
 * Expected outcome: Kept list omits bad unit-scoped rows; non-unit events and `unit_destroyed` with side own/enemy pass through.
 * Exceptions: None.
 */
export function filterCallbackSubscriptionsForTacticalBattleRoster(
  subscriptions: readonly CallbackSubscription[],
  battleSubUnitIds: ReadonlySet<string>
): { kept: CallbackSubscription[]; droppedCount: number } {
  logDebug('tacticalCallbackSubscriptionLifecycle filterCallbackSubscriptionsForTacticalBattleRoster', {
    inputCount: subscriptions.length,
    rosterSize: battleSubUnitIds.size,
  });
  const kept: CallbackSubscription[] = [];
  let droppedCount = 0;
  for (const sub of subscriptions) {
    const unitId = typeof sub.params?.unitId === 'string' ? sub.params.unitId.trim() : '';
    const side = typeof sub.params?.side === 'string' ? sub.params.side.trim() : '';

    if (UNIT_ID_SCOPED_CALLBACK_EVENTS.has(sub.event)) {
      if (!unitId || !battleSubUnitIds.has(unitId)) {
        droppedCount += 1;
        continue;
      }
      kept.push(sub);
      continue;
    }

    if (sub.event === 'unit_destroyed') {
      if (unitId) {
        if (!battleSubUnitIds.has(unitId)) {
          droppedCount += 1;
          continue;
        }
        kept.push(sub);
        continue;
      }
      if (side && side !== 'own' && side !== 'enemy') {
        if (!battleSubUnitIds.has(side)) {
          droppedCount += 1;
          continue;
        }
      }
      kept.push(sub);
      continue;
    }

    kept.push(sub);
  }
  logDebug('tacticalCallbackSubscriptionLifecycle filterCallbackSubscriptionsForTacticalBattleRoster done', {
    keptCount: kept.length,
    droppedCount,
  });
  return { kept, droppedCount };
}

/**
 * Removes live opponent subscriptions whose `unitId` or `side` looks like a tactical sub-unit id.
 *
 * Purpose: Upgrade / missing-stash end path that must not wipe strategic callbacks.
 * When to use: Battle end when no in-memory or persisted stash is available. Defaults to the first AI seat.
 * Expected outcome: That seat's strategic and non-sub-unit rows remain; `parent:slot` unit-scoped rows are removed.
 * Exceptions: None.
 */
export function clearTacticalLookingOpponentCallbackSubscriptions(seatId: AiSeatId = AI_SEAT_IDS[0]): void {
  const current = getSubscriptions(seatId);
  const kept = current.filter((s) => {
    const unitId = typeof s.params?.unitId === 'string' ? s.params.unitId : '';
    const side = typeof s.params?.side === 'string' ? s.params.side : '';
    if (looksLikeTacticalSubUnitId(unitId)) return false;
    if (looksLikeTacticalSubUnitId(side)) return false;
    return true;
  });
  if (kept.length === current.length) {
    logDebug('tacticalCallbackSubscriptionLifecycle clearTacticalLookingOpponentCallbackSubscriptions: none removed', {
      count: current.length,
    });
    return;
  }
  const turn =
    kept.find((s) => typeof s.subscribedTurn === 'number')?.subscribedTurn ??
    current.find((s) => typeof s.subscribedTurn === 'number')?.subscribedTurn ??
    0;
  if (kept.length === 0) {
    clearSubscriptions(seatId);
  } else {
    replaceSubscriptions(seatId, kept, turn);
  }
  logDebug('tacticalCallbackSubscriptionLifecycle clearTacticalLookingOpponentCallbackSubscriptions', {
    seatId,
    before: current.length,
    after: kept.length,
  });
}

/**
 * Restores pre-battle opponent subscriptions after tactical exit, or, with no stash, removes only the first AI seat's sub-unit subscriptions.
 *
 * Purpose: Removes ephemeral sub-unit callbacks after tactical exit without losing pre-battle strategic subscriptions when a stash exists.
 * When to use: `endTacticalBattleSessionCore` on every teardown path.
 * Expected outcome: Restores the stashed AI seat. A null seat leaves every seat alone. A missing stash removes only sub-unit rows from the first AI seat. Safe on double-end.
 * Exceptions: Logs and continues if restore fails after clear.
 */
export function restoreOpponentCallbackSubscriptionsAfterTacticalBattle(): void {
  let snapshot = stashedOpponentSubscriptions;
  if (snapshot === null) {
    snapshot = readTacticalCallbackStashFromGameConfig();
  }
  stashedOpponentSubscriptions = null;
  try {
    if (snapshot !== null) {
      if (snapshot.seatId === null) {
        clearTacticalCallbackStashFromGameConfig();
        logDebug('tacticalCallbackSubscriptionLifecycle restoreOpponentCallbackSubscriptionsAfterTacticalBattle', {
          mode: 'no_ai_party',
        });
        return;
      }
      const seatId = snapshot.seatId;
      clearSubscriptions(seatId);
      if (snapshot.subscriptions.length > 0) {
        const turn =
          snapshot.subscriptions.find((s) => typeof s.subscribedTurn === 'number')?.subscribedTurn ?? 0;
        replaceSubscriptions(seatId, [...snapshot.subscriptions], turn);
      }
      clearTacticalCallbackStashFromGameConfig();
      logDebug('tacticalCallbackSubscriptionLifecycle restoreOpponentCallbackSubscriptionsAfterTacticalBattle', {
        mode: 'full_restore',
        seatId,
        restoredCount: snapshot.subscriptions.length,
      });
      return;
    }
    clearTacticalLookingOpponentCallbackSubscriptions();
    clearTacticalCallbackStashFromGameConfig();
    logDebug('tacticalCallbackSubscriptionLifecycle restoreOpponentCallbackSubscriptionsAfterTacticalBattle', {
      mode: 'missing_stash_selective_clear',
    });
  } catch (err) {
    logError(
      'tacticalCallbackSubscriptionLifecycle restoreOpponentCallbackSubscriptionsAfterTacticalBattle failed',
      err
    );
  }
}

/**
 * Test helper: clears the in-memory stash without touching the database.
 *
 * Purpose: Isolates lifecycle unit tests.
 * When to use: After tests that call stash without a matching restore, or before asserting missing-stash behavior.
 * Expected outcome: Next stash starts clean in memory; `game_config` unchanged.
 * Exceptions: None.
 */
export function resetTacticalCallbackSubscriptionStashForTests(): void {
  stashedOpponentSubscriptions = null;
}
