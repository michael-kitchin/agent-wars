/**
 * Player-facing lines for one chat-completion attempt that failed.
 *
 * Purpose: The activity log says which attempt failed and whether another attempt will run.
 * When to use: The chat transport, on a timeout, HTTP failure, network error, or stalled body.
 * Expected outcome: One sentence. Timeouts and network errors end with `Retrying...` or `No retries left.`
 * A stalled body, and an HTTP status that will not be retried before the last attempt, end with `Not retried.`
 * Exceptions: None.
 */

export type ModelCallFailureCause = 'timeout' | 'httpStatus' | 'network' | 'streamStall';

/**
 * Builds the activity-log line for one failed model-call attempt.
 *
 * Purpose: Keeps timeout, HTTP, network, and stall wording in one place.
 * When to use: After an attempt fails and before the transport retries or returns.
 * Expected outcome: A sentence that names the attempt numbers. `timeoutMs` is required for a timeout so the seconds match the timer that fired.
 * Exceptions: None.
 */
export function formatModelCallFailureLine(args: {
  cause: ModelCallFailureCause;
  attempt: number;
  maxAttempts: number;
  willRetry: boolean;
  timeoutMs?: number;
  httpStatus?: number;
}): string {
  const ending =
    args.cause === 'streamStall' || (args.cause === 'httpStatus' && !args.willRetry && args.attempt < args.maxAttempts)
      ? 'Not retried.'
      : args.willRetry
        ? 'Retrying...'
        : 'No retries left.';
  const attemptLabel = `(attempt ${args.attempt} of ${args.maxAttempts})`;
  if (args.cause === 'timeout') {
    const seconds = Math.round((args.timeoutMs ?? 0) / 1000);
    return `Model call timed out after ${seconds}s ${attemptLabel}. ${ending}`;
  }
  if (args.cause === 'httpStatus') {
    return `Model call failed with HTTP ${args.httpStatus ?? 0} ${attemptLabel}. ${ending}`;
  }
  if (args.cause === 'streamStall') {
    return `Model response stream stalled ${attemptLabel}. Not retried.`;
  }
  return `Model call network error ${attemptLabel}. ${ending}`;
}
