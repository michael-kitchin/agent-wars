/**
 * Callback subscription storage for event-driven AI consultation (Milestone 0.7).
 * Persists LLM-requested event subscriptions (e.g. turns(N), unit_arrived) in the database
 * so the engine can evaluate them after each resolution and consult the LLM when an event fires.
 * Replace-all semantics: each consultation's callbacks array replaces the full set for that player.
 */

import { dbGetAll, dbRun } from './gameDb';
import { logDebug, logError, logTrace } from './logger';

/**
 * Documents the `CallbackSubscription` interface as a named contract surface (export interface CallbackSubscription).

 * Purpose: Supports maintainability by documenting why `CallbackSubscription` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface CallbackSubscription {
    /**
   * Specifies the contract for the `event` member (event: string;).

   * Contract: Describes stable behavior for callers of `event` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
event: string;
    /**
   * Specifies the contract for the `params` member (params: Record<string, unknown>;).

   * Contract: Describes stable behavior for callers of `params` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
params: Record<string, unknown>;
    /**
   * Specifies the contract for the `subscribedTurn` member (subscribedTurn?: number;).

   * Contract: Describes stable behavior for callers of `subscribedTurn` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
subscribedTurn?: number;
}

/**
 * Defines the `getSubscriptions` function shape (export function getSubscriptions(playerId: string): CallbackSubscription[]).

 * Purpose: Supports maintainability by documenting why `getSubscriptions` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
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
 * Defines the `replaceSubscriptions` function shape (export function replaceSubscriptions(playerId: string, subscriptions: CallbackSubscription[], subscribedTurn: number): void).

 * Purpose: Supports maintainability by documenting why `replaceSubscriptions` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
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
 * Defines the `clearSubscriptions` function shape (export function clearSubscriptions(playerId: string): void).

 * Purpose: Supports maintainability by documenting why `clearSubscriptions` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function clearSubscriptions(playerId: string): void {
  logDebug('callbackSubscriptions clearSubscriptions', { playerId });
  dbRun('DELETE FROM ai_callback_subscriptions WHERE player_id = ?', [playerId]);
}
