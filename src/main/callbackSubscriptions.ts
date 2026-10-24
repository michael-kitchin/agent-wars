/**
 * Callback subscription storage for event-driven AI consultation.
 * Persists LLM-requested event subscriptions (e.g. turns(N), unit_arrived) in the database
 * so the engine can evaluate them after each resolution and consult the LLM when an event fires.
 * Replace-all semantics: each consultation's callbacks array replaces the full set for that player.
 */

import { dbGetAll, dbRun } from './gameDb';
import { logDebug, logError, logTrace } from './logger';

/**
 * One event the model asked to be told about after a later resolution.
 *
 * Purpose: The row the consult stores and the evaluator reads.
 * When to use: `getSubscriptions`, `replaceSubscriptions`, and the tactical stash.
 * Expected outcome: An event name, its parameters, and the turn it was stored when that turn is known.
 * Exceptions: None.
 */
export interface CallbackSubscription {
    /**
   * The subscription's event name, such as `turns` or `unit_arrived`.
   *
   * Contract: Stored as `event_type` and matched by callback evaluation.
   * When to use: Writing a row and deciding which event fired.
   * Expected outcome: The name the model requested.
   * Exceptions: None.
   */
event: string;
    /**
   * The event's parameters, the object stored as JSON.
   *
   * Contract: An object. A missing object is stored as `{}`.
   * When to use: Event matching, including `unitId` and `side`.
   * Expected outcome: The parameters from the model's callback, or an empty object when none were stored.
   * Exceptions: None.
   */
params: Record<string, unknown>;
    /**
   * The turn the subscription was stored.
   *
   * Contract: Set by `replaceSubscriptions` and read back by `getSubscriptions`. Absent when a copy kept an absent value.
   * When to use: Evaluation that needs the turn the model subscribed.
   * Expected outcome: The turn passed to `replaceSubscriptions`, or undefined on a row that never had one.
   * Exceptions: None.
   */
subscribedTurn?: number;
}

/**
 * Copies subscription rows so a stash cannot share objects with the live list.
 *
 * Purpose: A later edit of a live `params` object must not change the snapshot.
 * When to use: Stashing before a tactical battle and writing that stash to `game_config`.
 * Expected outcome: A new array and new `params` objects. `subscribedTurn` is kept as given, including undefined.
 * Exceptions: None.
 */
export function copyCallbackSubscriptions(rows: readonly CallbackSubscription[]): CallbackSubscription[] {
  logTrace('callbackSubscriptions copyCallbackSubscriptions', { count: rows.length });
  return rows.map((row) => ({
    event: row.event,
    params: { ...(row.params ?? {}) },
    subscribedTurn: row.subscribedTurn,
  }));
}

/**
 * Reads one player's stored callback subscriptions.
 *
 * Purpose: Consults and the tactical stash need the rows currently in the database.
 * When to use: Before evaluating events, and when snapshotting a seat at battle start.
 * Expected outcome: Rows for `playerId` in id order. A params value that is not JSON becomes `{}` and is logged.
 * Exceptions: None. A parse failure is logged and that row still returns.
 */
export function getSubscriptions(playerId: string): CallbackSubscription[] {
  logTrace('callbackSubscriptions getSubscriptions', { playerId });
  const rows = dbGetAll<{ event_type: string; params: string; subscribed_turn: number }>(
    'SELECT event_type, params, subscribed_turn FROM ai_callback_subscriptions WHERE player_id = ? ORDER BY id',
    [playerId]
  );
  return rows.map((r) => {
    let params: Record<string, unknown> = {};
    try {
      params = JSON.parse(r.params) as Record<string, unknown>;
    } catch (err) {
      logError('callbackSubscriptions getSubscriptions: failed to parse params', r.event_type, err);
    }
    return {
      event: r.event_type,
      params,
      subscribedTurn: r.subscribed_turn,
    };
  });
}

/**
 * Replaces one player's subscriptions with the consult's list.
 *
 * Purpose: Each consultation's callbacks array is the full set for that player.
 * When to use: After a consult returns callbacks, and when restoring a stashed list.
 * Expected outcome: Prior rows for `playerId` are gone. Each new row stores `subscribedTurn`, not the turn on the input row.
 * Exceptions: None. Database errors propagate from `dbRun`.
 */
export function replaceSubscriptions(playerId: string, subscriptions: CallbackSubscription[], subscribedTurn: number): void {
  logDebug('callbackSubscriptions replaceSubscriptions', { playerId, count: subscriptions.length, subscribedTurn });
  dbRun('DELETE FROM ai_callback_subscriptions WHERE player_id = ?', [playerId]);
  for (const s of subscriptions) {
    dbRun(
      'INSERT INTO ai_callback_subscriptions (player_id, event_type, params, subscribed_turn) VALUES (?, ?, ?, ?)',
      [playerId, s.event, JSON.stringify(s.params ?? {}), subscribedTurn]
    );
  }
}

/**
 * Deletes every callback subscription for one player.
 *
 * Purpose: A restore or a clear path needs an empty set before writing the kept rows.
 * When to use: Tactical restore, and when the kept list is empty.
 * Expected outcome: No rows remain for `playerId`.
 * Exceptions: None. Database errors propagate from `dbRun`.
 */
export function clearSubscriptions(playerId: string): void {
  logDebug('callbackSubscriptions clearSubscriptions', { playerId });
  dbRun('DELETE FROM ai_callback_subscriptions WHERE player_id = ?', [playerId]);
}
