/**
 * One deferred or post-resolution model consult, with a waiter that aborts the call and a single model-change retry.
 *
 * Purpose: The outer wait used to abandon the waiter and leave the HTTP call running. A model change restarts once
 * with the id saved now. A timeout does not.
 * When to use: The strategic post-resolution runner and the tactical post-beat runner.
 * Expected outcome: `{ ok: true, value }` when the consult returns. `{ ok: false }` after a timeout or other failure.
 * Exceptions: Does not throw. Failures are logged with the caller's message.
 */

import { logDebug, logError } from '../logger';
import {
  beginModelCall,
  getLastModelCallCancelReason,
  getModelCallCancelEpoch,
  hasModelCallCancelSince,
  type ModelCallTheater,
} from '../openRouter/modelCallControl';
import { readLiveModelId } from '../openRouter/liveModelId';

/**
 * Runs `run` at most twice. The second attempt happens only when this attempt was aborted because the model changed.
 *
 * Purpose: Shared by both deferred consult runners so the timeout, the abort, and the retry rule stay in one place.
 * When to use: After the runner has decided a consult should happen.
 * Expected outcome: The live model id is used when it is non-empty; otherwise `fallbackModelId`. The waiter aborts
 * the scope and rejects. `end` always runs. A timeout abort does not retry.
 * Exceptions: Logs `errorLogMessage` and returns `{ ok: false }` when the attempt fails for any reason other than a model-change retry.
 */
export async function executeAbortableConsult<T>(args: {
  label: string;
  theater: ModelCallTheater;
  timeoutMs: number;
  fallbackModelId: string;
  errorLogMessage: string;
  run: (attempt: { signal: AbortSignal; modelId: string }) => Promise<T>;
}): Promise<{ ok: true; value: T } | { ok: false }> {
  logDebug('executeAbortableConsult', { label: args.label, theater: args.theater, timeoutMs: args.timeoutMs });
  const epochAtStart = getModelCallCancelEpoch();
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const scope = beginModelCall(args.label, args.theater);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const liveModelId = readLiveModelId().trim();
      const runPromise = args.run({ signal: scope.signal, modelId: liveModelId || args.fallbackModelId });
      const timeoutPromise = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          scope.abort();
          reject(new Error(`${args.label} timed out after ${args.timeoutMs}ms`));
        }, args.timeoutMs);
      });
      // The race settles on one result. The other promise can still reject after that, and nothing else is listening.
      void runPromise.catch(() => undefined);
      void timeoutPromise.catch(() => undefined);
      const value = await Promise.race([runPromise, timeoutPromise]);
      const retryForModelChange =
        attempt === 1 &&
        scope.signal.aborted &&
        getLastModelCallCancelReason() === 'model_changed' &&
        hasModelCallCancelSince(epochAtStart);
      if (retryForModelChange) continue;
      return { ok: true, value };
    } catch (err) {
      const retryForModelChange =
        attempt === 1 &&
        scope.signal.aborted &&
        getLastModelCallCancelReason() === 'model_changed' &&
        hasModelCallCancelSince(epochAtStart);
      if (retryForModelChange) continue;
      logError(args.errorLogMessage, err);
      return { ok: false };
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      scope.end();
    }
  }
  logError(args.errorLogMessage, new Error(`${args.label} did not finish`));
  return { ok: false };
}
