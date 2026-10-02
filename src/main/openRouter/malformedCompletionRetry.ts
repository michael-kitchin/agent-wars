/**
 * Detection and bounded retry policy for model completions that arrive as HTTP 200 but carry no usable payload.
 *
 * Providers intermittently return a well-formed HTTP 200 whose first choice has neither `tool_calls` nor
 * `content` (Gemini reports these as `MALFORMED_FUNCTION_CALL` / `MALFORMED_RESPONSE`). The chat transport
 * only retries on HTTP status codes, so without this policy the opponent silently forfeits every order for
 * that consultation. Shared by the strategic and tactical order flows because both drive the same tool loop.
 */

import { logDebug, logError, logTrace } from '../logger';

/**
 * Maximum number of extra model calls spent recovering from malformed completions within one consultation.
 *
 * Purpose: Bounds recovery so a persistently broken model cannot stall a turn or burn credits indefinitely.
 * When to use: Read by `resolveMalformedCompletionRetry`; exported so tests assert the documented budget.
 * Expected outcome: At most this many retries, after which the consultation fails with a logged error.
 * Exceptions: None.
 */
export const MALFORMED_COMPLETION_RETRY_LIMIT = 2;

/**
 * Base and jitter components of the pause between malformed-completion retries.
 *
 * Purpose: Spaces out immediate re-sends so a transient provider hiccup has time to clear.
 * When to use: Internal to `getMalformedCompletionRetryDelayMs`.
 * Expected outcome: Delays land between the base and base + jitter, in milliseconds.
 * Exceptions: None.
 */
const MALFORMED_COMPLETION_RETRY_BASE_DELAY_MS = 250;
const MALFORMED_COMPLETION_RETRY_JITTER_MS = 500;

/**
 * Error string returned to callers when every malformed-completion retry has been spent.
 *
 * Purpose: Gives the order flow and its tests one stable reason string for this failure mode.
 * When to use: Compare against `RequestOrdersError.error` when distinguishing malformed replies from parse failures.
 * Expected outcome: Stable, user-readable text.
 * Exceptions: None.
 */
export const MALFORMED_COMPLETION_FAILURE_REASON =
  'AI returned an unusable reply (no tool call and no content) after retries. Please try again.';

/**
 * Test-only fixed delay that replaces the jittered production pause.
 *
 * Purpose: Keeps contract tests fast and deterministic without exposing timers to callers.
 * When to use: Set via `setMalformedCompletionRetryDelayOverrideForTests`; `null` restores production timing.
 * Expected outcome: When set, every retry waits exactly this many milliseconds.
 * Exceptions: None.
 */
let retryDelayOverrideMsForTests: number | null = null;

/**
 * Replaces the malformed-completion retry pause with a fixed duration for tests.
 *
 * Purpose: Mirrors the transport's test-override pattern so retry behavior is assertable without real waits.
 * When to use: From tests only, restoring `null` afterwards.
 * Expected outcome: Subsequent retries use `delayMs`; `null` restores the jittered production delay.
 * Exceptions: None.
 */
export function setMalformedCompletionRetryDelayOverrideForTests(delayMs: number | null): void {
  logDebug('openRouter setMalformedCompletionRetryDelayOverrideForTests', { delayMs });
  retryDelayOverrideMsForTests = delayMs;
}

/**
 * Computes the pause before the next malformed-completion retry.
 *
 * Purpose: Adds jitter so concurrent consultations do not re-send in lockstep.
 * When to use: Internal to `resolveMalformedCompletionRetry`.
 * Expected outcome: The test override when set, otherwise base plus random jitter.
 * Exceptions: None.
 */
function getMalformedCompletionRetryDelayMs(): number {
  if (retryDelayOverrideMsForTests !== null) return retryDelayOverrideMsForTests;
  return MALFORMED_COMPLETION_RETRY_BASE_DELAY_MS + Math.floor(Math.random() * MALFORMED_COMPLETION_RETRY_JITTER_MS);
}

/**
 * Resolves after the given number of milliseconds.
 *
 * Purpose: Local sleep helper so this module owns its own backoff without importing transport internals.
 * When to use: Internal to `resolveMalformedCompletionRetry`.
 * Expected outcome: A promise that settles once the timer fires.
 * Exceptions: None.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The parts of one model choice this policy inspects.
 *
 * Contract: `toolCalls` and `content` come straight from the assistant message; the finish reasons are
 * diagnostics only and never change the verdict, so unknown provider strings stay supported.
 * When to use: Build one per model round in the order-flow tool loop.
 * Expected outcome: Enough context to classify the completion and to log why it was rejected.
 * Exceptions: None.
 */
export interface ModelCompletionShape {
  toolCalls?: readonly unknown[] | null;
  content?: string | null;
  finishReason?: string | null;
  nativeFinishReason?: string | null;
}

/**
 * Reports whether a model choice carries neither a tool call nor usable text.
 *
 * Purpose: Classifies on the observable symptom rather than provider-specific finish reasons, so
 * `MALFORMED_FUNCTION_CALL`, `MALFORMED_RESPONSE`, and plain empty completions are all caught.
 * When to use: Before treating an assistant message as either a tool round or a final answer.
 * Expected outcome: `true` only when the round cannot advance the conversation in either direction.
 * Exceptions: None.
 */
export function isMalformedModelCompletion(completion: ModelCompletionShape): boolean {
  if (Array.isArray(completion.toolCalls) && completion.toolCalls.length > 0) return false;
  return typeof completion.content !== 'string' || completion.content.trim().length === 0;
}

/**
 * Builds the corrective note appended to the conversation before the final retry.
 *
 * Purpose: A plain re-send usually clears a one-off malformed reply; when it does not, naming the defect
 * gives the model a chance to choose a valid shape instead of repeating itself.
 * When to use: Only for the last retry, so earlier attempts keep the conversation byte-identical.
 * Pass `requireToolCall` when this round's `tool_choice` is `required`, so the note does not offer an envelope
 * the provider will refuse.
 * Expected outcome: A short user-role instruction valid for both strategic and tactical consultations.
 * Exceptions: None.
 */
export function buildMalformedCompletionCorrectiveMessage(requireToolCall = false): string {
  logTrace('openRouter buildMalformedCompletionCorrectiveMessage', { requireToolCall });
  const responseShape = requireToolCall
    ? 'a single well-formed tool call'
    : 'exactly one of: a single well-formed tool call, or your final orders as one JSON object matching the schema in the system prompt';
  return (
    'Your previous reply contained neither a tool call nor any text content, so it could not be used. ' +
    'Do not repeat that reply. Respond now with ' +
    responseShape +
    '. Never return an empty message.'
  );
}

/**
 * The verdict for one model round under the malformed-completion policy.
 *
 * Contract: `usable` means the caller should continue normally; `retry` means re-send the request after
 * optionally appending `correctiveMessage`; `fail` means the retry budget is spent.
 * When to use: Returned by `resolveMalformedCompletionRetry`.
 * Expected outcome: Exhaustive switch coverage at the call site.
 * Exceptions: None.
 */
export type MalformedCompletionRetryOutcome =
  | { status: 'usable' }
  | { status: 'retry'; retryCount: number; correctiveMessage: string | null }
  | { status: 'fail'; error: string };

/**
 * Classifies a model round and, when malformed, spends one unit of the retry budget.
 *
 * Purpose: Keeps detection, backoff, operator logging, and in-game reporting in one place so the strategic
 * and tactical loops behave identically. Awaits the backoff itself, so callers can `continue` immediately.
 * When to use: Once per model round, right after the assistant message is extracted and before branching
 * into tool handling or final-JSON parsing.
 * Expected outcome: `usable` for healthy rounds. `retry` carries the incremented count and a corrective
 * message only on the final attempt. `fail` arrives once the budget is exhausted, after an error log and an
 * in-game notice, carrying `MALFORMED_COMPLETION_FAILURE_REASON`.
 * Exceptions: None; timer rejection is not possible here.
 */
export async function resolveMalformedCompletionRetry(args: {
  completion: ModelCompletionShape;
  retryCount: number;
  iteration: number;
  turnNumber: number;
  tacticalBattleId: string | null;
  onLog?: (line: string, isError?: boolean) => void;
  /**
   * Whether this round's `tool_choice` is `required`.
   *
   * Contract: Omit or pass `false` when the model may still submit the envelope.
   * When to use: The tool loop passes the round's choice.
   * Expected outcome: The final-retry note asks only for a tool call when `true`.
   * Exceptions: None.
   */
  requireToolCall?: boolean;
}): Promise<MalformedCompletionRetryOutcome> {
  const { completion, retryCount, iteration, turnNumber, tacticalBattleId, onLog, requireToolCall = false } = args;
  if (!isMalformedModelCompletion(completion)) return { status: 'usable' };

  const diagnostics = {
    iteration,
    turnNumber,
    tacticalAiBattle: tacticalBattleId,
    retryCount,
    finishReason: completion.finishReason ?? null,
    nativeFinish: completion.nativeFinishReason ?? null,
  };

  if (retryCount >= MALFORMED_COMPLETION_RETRY_LIMIT) {
    logError('openRouter requestOrders: malformed completion persisted after retries', diagnostics);
    if (onLog) {
      onLog(
        `AI returned an unusable reply ${retryCount + 1} time(s) (no tool call, no content); abandoning this consultation.`,
        true
      );
    }
    return { status: 'fail', error: MALFORMED_COMPLETION_FAILURE_REASON };
  }

  const nextRetryCount = retryCount + 1;
  const correctiveMessage =
    nextRetryCount === MALFORMED_COMPLETION_RETRY_LIMIT
      ? buildMalformedCompletionCorrectiveMessage(requireToolCall)
      : null;
  logDebug('openRouter requestOrders: retrying after malformed completion', {
    ...diagnostics,
    nextRetryCount,
    appendedCorrectiveMessage: correctiveMessage !== null,
  });
  if (onLog) {
    onLog(
      `AI reply was malformed (no tool call, no content); retrying ${nextRetryCount}/${MALFORMED_COMPLETION_RETRY_LIMIT}.`,
      true
    );
  }
  await delay(getMalformedCompletionRetryDelayMs());
  return { status: 'retry', retryCount: nextRetryCount, correctiveMessage };
}
