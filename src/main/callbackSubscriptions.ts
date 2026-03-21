/**
 * Callback subscription storage for event-driven AI consultation (Milestone 0.7).
 * Persists LLM-requested event subscriptions (e.g. turns(N), unit_arrived) in the database
 * so the engine can evaluate them after each resolution and consult the LLM when an event fires.
 * Replace-all semantics: each consultation's callbacks array replaces the full set for that player.
 */

import { dbGetAll, dbRun } from './gameDb';
import { logDebug, logError, logTrace } from './logger';

export interface CallbackSubscription {
  event: string;
  params: Record<string, unknown>;
  subscribedTurn?: number;
}

/**
 * Returns all callback subscriptions for a player. Use when evaluating subscription events
 * and when building the ACTIVE CALLBACKS briefing section.
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
 * Replaces all callback subscriptions for a player with the given list (replace-all semantics).
 * Call after a successful LLM consultation when the response includes a callbacks array.
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
 * Removes all callback subscriptions for a player. Use when resetting 0.7 state (e.g. new game).
 */
export function clearSubscriptions(playerId: string): void {
  logDebug('callbackSubscriptions clearSubscriptions', { playerId });
  dbRun('DELETE FROM ai_callback_subscriptions WHERE player_id = ?', [playerId]);
}
