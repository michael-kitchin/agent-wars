/**
 * Reasons a player action stops opponent model work, and the activity-log line for each.
 *
 * Purpose: Main and the renderer share one set of cancel reasons so a stop is logged once and parsed the same way.
 * When to use: Cancel IPC payloads and `stopModelWork`.
 * Expected outcome: Unknown or missing reasons become `teardown`.
 * Exceptions: None.
 */

export const MODEL_CALL_CANCEL_REASONS = [
  'run_off',
  'model_changed',
  'new_game',
  'load_game',
  'battle_exit',
  'teardown',
] as const;

/**
 * Why opponent model work was stopped.
 *
 * Purpose: Distinguishes a player stop from a transport timeout so a model change can retry and a timeout cannot.
 * When to use: `cancelModelCalls` and the cancel IPC payload.
 * Expected outcome: One of `MODEL_CALL_CANCEL_REASONS`.
 * Exceptions: None.
 */
export type ModelCallCancelReason = (typeof MODEL_CALL_CANCEL_REASONS)[number];

/**
 * Maps an IPC payload reason onto a known cancel reason.
 *
 * Purpose: A missing or unexpected payload must still stop work, under the generic teardown line.
 * When to use: The `game:cancelRequestAiOrders` handler before `stopModelWork`.
 * Expected outcome: The matching reason, or `teardown` when `raw` is absent or not in the list.
 * Exceptions: None.
 */
export function parseModelCallCancelReason(raw: unknown): ModelCallCancelReason {
  if (typeof raw === 'string' && (MODEL_CALL_CANCEL_REASONS as readonly string[]).includes(raw)) {
    return raw as ModelCallCancelReason;
  }
  return 'teardown';
}

/**
 * Returns the one activity-log sentence for a cancel reason.
 *
 * Purpose: Each stop names why planning stopped. A click on Stop, removing the last key or model, and the stop
 *   before a new match applies its planning choice all use the Stop line. A second cancel that aborts nothing does not
 *   add another line.
 * When to use: `stopModelWork` when this call aborted a scope, or when New found a deferred consult waiting.
 * Expected outcome: The sentence for `reason`. `teardown` is the generic line.
 * Exceptions: None.
 */
export function modelCallCancelLogLine(reason: ModelCallCancelReason): string {
  switch (reason) {
    case 'run_off':
      return 'Opponent planning stopped: Stop was turned off.';
    case 'model_changed':
      return 'Opponent planning stopped: the model changed.';
    case 'new_game':
      return 'Opponent planning stopped for a new game.';
    case 'load_game':
      return 'Opponent planning stopped to load a saved game.';
    case 'battle_exit':
      return 'Opponent planning stopped: you left the battle.';
    case 'teardown':
      return 'Opponent planning stopped.';
  }
}
