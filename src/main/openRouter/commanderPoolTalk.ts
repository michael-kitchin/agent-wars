/**
 * The production talk call for one commander.
 *
 * Purpose: The pool's round asks this runner. It uses the same model and key as the orders consult.
 * When to use: Installed beside the orders runner.
 * Expected outcome: A talk result. A missing model or key, and an already aborted signal, do not call the model.
 * Exceptions: Does not throw. A failed attempt returns a silent result.
 */

import { commanderModelId } from '../gameDb';
import { executeAbortableConsult } from '../ipc/modelConsultAttempt';
import { logDebug } from '../logger';
import { AI_TALK_REQUEST_TIMEOUT_MS } from '../../shared/aiConsultationLimits';
import { emitCommanderConsultLog } from './commanderConsultLog';
import type { TalkSeatResult } from './talk/requestTalk';
import type { TalkRunner } from './talk/talkRound';

/**
 * Asks one commander to talk, and loads OpenRouter only when that call still needs a model.
 *
 * Purpose: One wave's round calls this once per seat that is about to be consulted for orders.
 * When to use: The production talk runner.
 * Expected outcome: `cancelled` when the signal is already aborted. `failed` when there is no model or no key. `timed_out` when the talk wait fires. Otherwise the talk call's result. OpenRouter loads only after those early checks.
 * Exceptions: Does not throw.
 */
export const runCommanderTalk: TalkRunner = async (request) => {
  logDebug('commanderPoolTalk runCommanderTalk', { seatId: request.seatId, turnNumber: request.turnNumber, theater: request.theater });
  if (request.signal.aborted) return { kind: 'silent', reason: 'cancelled', costUsd: 0 };
  const stored = commanderModelId(request.seatId);
  if (stored !== null && stored.trim().length === 0) return { kind: 'silent', reason: 'failed', costUsd: 0 };
  const { getSelectedModel, hasKey, requestTalk } = await import('./openRouter');
  const modelId = (stored === null ? getSelectedModel() : stored).trim();
  if (!modelId || !hasKey()) return { kind: 'silent', reason: 'failed', costUsd: 0 };
  const attempt = await executeAbortableConsult<TalkSeatResult>({
    label: `talk ${request.seatId}`,
    theater: request.theater,
    timeoutMs: AI_TALK_REQUEST_TIMEOUT_MS,
    fallbackModelId: modelId,
    errorLogMessage: `talk failed for ${request.seatId}`,
    seatId: request.seatId,
    run: ({ signal, modelId: live }) => requestTalk({
      seatId: request.seatId,
      modelId: live || modelId,
      turnNumber: request.turnNumber,
      battle: request.battle,
      signal,
      onLog: (line, isError) => emitCommanderConsultLog(request.seatId, line, isError === true),
    }),
  });
  if (!attempt.ok) return { kind: 'silent', reason: attempt.timedOut ? 'timed_out' : 'failed', costUsd: 0 };
  return attempt.value;
};
