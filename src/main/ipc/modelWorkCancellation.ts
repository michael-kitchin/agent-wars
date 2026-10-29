/**
 * Stops opponent model work for one player action and writes at most one activity-log line.
 *
 * Purpose: Run off, a model change, New, loading a save, leaving a battle, and teardown share one stop. A second stop that aborts
 * nothing does not log again. New and loading a save also retire the match generation so a Ready still in flight cannot resolve the old turn.
 * When to use: The cancel IPC, `game:newGame`, `game:loadGame`, and `game:endTacticalBattle`.
 * Expected outcome: Matching scopes abort. New and loading a save clear a deferred consult that has not finished. Leaving a battle
 * aborts tactical scopes only.
 * Exceptions: None.
 */

import { modelCallCancelLogLine, type ModelCallCancelReason } from '../../shared/ipc/modelCallCancelTypes';
import { logDebug } from '../logger';
import { advanceMatchGeneration } from '../matchGeneration';
import { cancelModelCalls } from '../openRouter/modelCallControl';
import {
  clearDeferredPlaybackConsultPending,
  hasDeferredPlaybackConsultPending,
  peekDeferredPlaybackConsultTag,
} from './deferredResolutionPlaybackConsult';

/**
 * Stops in-flight opponent model work for `reason` and optionally logs that stop.
 *
 * Purpose: One place decides the theater, the match generation, and whether the player sees a line.
 * When to use: After the renderer asks to cancel, when a new match starts, when a save is loaded, and when the player leaves a battle.
 * Expected outcome: `new_game` and `load_game` advance the match generation and clear a deferred consult even when nothing is in flight.
 * The activity line is sent only when this call aborted at least one scope, or when New or a load found a deferred consult waiting.
 * Leaving a battle does not log merely because a strategic consult is still pending.
 * Exceptions: None.
 */
export function stopModelWork(reason: ModelCallCancelReason, sendActivityLog: (line: string) => void): void {
  const pending = hasDeferredPlaybackConsultPending();
  const tag = peekDeferredPlaybackConsultTag();
  if (reason === 'new_game' || reason === 'load_game') {
    advanceMatchGeneration(reason);
    clearDeferredPlaybackConsultPending();
  }
  const aborted = cancelModelCalls(reason, reason === 'battle_exit' ? 'tactical' : 'all', 'all');
  if (aborted > 0 || ((reason === 'new_game' || reason === 'load_game') && pending)) {
    sendActivityLog(modelCallCancelLogLine(reason));
  }
  logDebug('modelWorkCancellation stopModelWork', { reason, aborted, pending, tag });
}
