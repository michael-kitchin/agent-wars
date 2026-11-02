/**
 * One consultation's attempts, fallbacks, and summary.
 *
 * Purpose: A consult can record what each model call did, then write one info line when it returns.
 * When to use: Create it after the consult has a model and a roster. Pass it on the chat settings.
 * Expected outcome: `summary` matches the fields written to the log. An absent recorder is not this module's job.
 * Exceptions: None. `providerFromChatBody` returns null for malformed JSON.
 */

import { logDebug, logInfo, logTrace } from '../logger';
import { buildConsultTelemetrySummary, type ConsultTelemetrySummary } from './consultTelemetrySummary';
export { buildConsultTelemetrySummary, type ConsultTelemetrySummary };

/**
 * How the consultation ended.
 *
 * Purpose: The summary names the consult's result separately from each attempt.
 * When to use: `setOutcome` before the consult returns.
 * Expected outcome: One of finished, failed, cancelled, budgetExceeded, or wallClock.
 * Exceptions: None.
 */
export type ConsultTelemetryOutcome = 'finished' | 'failed' | 'cancelled' | 'budgetExceeded' | 'wallClock';

/**
 * How one model call ended.
 *
 * Purpose: Timeouts and stalls stay distinct from HTTP and socket failures.
 * When to use: `recordAttempt`.
 * Expected outcome: One of ok, http, timeout, network, streamStall, or cancelled.
 * Exceptions: None.
 */
export type ConsultAttemptOutcome = 'ok' | 'http' | 'timeout' | 'network' | 'streamStall' | 'cancelled';

/**
 * A second send that was not the first try of this call.
 *
 * Purpose: The summary lists why a later attempt happened, in the order they were recorded.
 * When to use: `recordFallback` at the existing retry site.
 * Expected outcome: One of the fallback names.
 * Exceptions: None.
 */
export type ConsultFallbackKind =
  | 'networkRetry'
  | 'httpStatusRetry'
  | 'creditClamp'
  | 'toolChoiceAuto'
  | 'structuredOutputDropped'
  | 'malformedCompletion'
  | 'parseRepair'
  | 'cacheBreakpointDropped'
  | 'situationMessagesJoined';

/**
 * One model call inside a consultation.
 *
 * Purpose: The summary keeps every attempt, including a timeout that was not retried.
 * When to use: The transport records one of these per send.
 * Expected outcome: `provider` is null when the attempt timed out, stalled, was cancelled, or threw before a body arrived.
 * Exceptions: None.
 */
export interface ConsultAttemptRecord {
  /**
   * Label of the chat request that sent this attempt.
   *
   * Contract: The transport's `requestLabel`, such as `requestOrders`.
   * When to use: The attempt row and the debug line.
   * Expected outcome: The same label on every send of that request.
   * Exceptions: None.
   */
  readonly requestLabel: string;
  /**
   * One-based send number inside this consultation.
   *
   * Contract: Increases for a credit-cap retry as well as a network retry.
   * When to use: Matching a log line to a summary row.
   * Expected outcome: A positive integer.
   * Exceptions: None.
   */
  readonly attempt: number;
  /**
   * How this send ended.
   *
   * Contract: A `ConsultAttemptOutcome`.
   * When to use: Counting timeouts and stalls, and choosing `servedBy`.
   * Expected outcome: `ok` only for an HTTP 2xx body.
   * Exceptions: None.
   */
  readonly outcome: ConsultAttemptOutcome;
  /**
   * HTTP status, or null when no status arrived.
   *
   * Contract: Null for a timeout, stall, socket error, or cancel.
   * When to use: Reading a failed attempt.
   * Expected outcome: The status the transport saw, or null.
   * Exceptions: None.
   */
  readonly httpStatus: number | null;
  /**
   * Milliseconds from the start of this send until its outcome was known.
   *
   * Contract: A non-negative number. The retry wait after the outcome is not included.
   * When to use: The attempt row.
   * Expected outcome: The elapsed time of this send.
   * Exceptions: None.
   */
  readonly durationMs: number;
  /**
   * Provider name from the response body, or null.
   *
   * Contract: Null when the body has no provider, or the attempt had no body.
   * When to use: `servedBy` and `failedOn`.
   * Expected outcome: A string only when the body named one.
   * Exceptions: None.
   */
  readonly provider: string | null;
  /**
   * Whether another send followed this one.
   *
   * Contract: True only when this attempt took a retry path.
   * When to use: The attempt row.
   * Expected outcome: A timeout is false.
   * Exceptions: None.
   */
  readonly retried: boolean;
}


/**
 * Records attempts and fallbacks for one consultation.
 *
 * Purpose: The transport, the tool loop, and the repair call share one recorder.
 * When to use: Pass it on `OrdersChatRequestSettings`.
 * Expected outcome: `summary` reflects every record call. Outcome stays `failed` until `setOutcome`.
 * Exceptions: None.
 */
export interface ConsultTelemetry {
  /**
   * Appends one attempt.
   *
   * Contract: Call once per send, after that send's outcome is known.
   * When to use: The transport's attempt finalizer.
   * Expected outcome: `summary().attempts` gains this record.
   * Exceptions: None.
   */
  recordAttempt(record: ConsultAttemptRecord): void;
  /**
   * Appends one fallback.
   *
   * Contract: Call at the retry site, before the next send.
   * When to use: Network, HTTP, credit, tool-choice, schema, malformed, and repair retries.
   * Expected outcome: `summary().fallbacks` gains this kind.
   * Exceptions: None.
   */
  recordFallback(kind: ConsultFallbackKind): void;
  /**
   * Stores the latest tool-round number.
   *
   * Contract: The loop's one-based round.
   * When to use: At the start of each tool round.
   * Expected outcome: `summary().toolRounds` is the last value.
   * Exceptions: None.
   */
  setToolRounds(rounds: number): void;
  /**
   * Marks the wall-clock stop.
   *
   * Contract: Call when the loop returns the wall-clock error.
   * When to use: That return only.
   * Expected outcome: `summary().wallClockExceeded` is true.
   * Exceptions: None.
   */
  noteWallClockExceeded(): void;
  /**
   * Stores how the consult ended.
   *
   * Contract: The last call wins. `error` null clears a previous error.
   * When to use: Before each return that ends the consult.
   * Expected outcome: `summary()` reports this outcome and error.
   * Exceptions: None.
   */
  setOutcome(outcome: ConsultTelemetryOutcome, error?: string | null): void;
  /**
   * Builds the log object from the records so far.
   *
   * Contract: Reads the usage object that was passed to `createConsultTelemetry`.
   * When to use: The consult's `finally`.
   * Expected outcome: A summary. Does not log.
   * Exceptions: None.
   */
  summary(): ConsultTelemetrySummary;
}

/**
 * Usage totals the consult already accumulates.
 *
 * Purpose: The summary reads tokens and cost without a second accumulator.
 * When to use: `createConsultTelemetry`.
 * Expected outcome: Later mutations of this object show up in `summary`.
 * Exceptions: None.
 */
export interface ConsultTelemetryUsage {
  /**
   * Dollars reported by successful bodies.
   *
   * Contract: Mutated by the consult as bodies arrive.
   * When to use: `summary` reads it.
   * Expected outcome: The cost so far.
   * Exceptions: None.
   */
  readonly requestCost: number;
  /**
   * Prompt tokens reported by successful bodies.
   *
   * Contract: Mutated by the consult as bodies arrive.
   * When to use: `summary` reads it.
   * Expected outcome: The input-token total so far.
   * Exceptions: None.
   */
  readonly totalInputTokens: number;
  /**
   * Completion tokens reported by successful bodies.
   *
   * Contract: Mutated by the consult as bodies arrive.
   * When to use: `summary` reads it.
   * Expected outcome: The output-token total so far.
   * Exceptions: None.
   */
  readonly totalOutputTokens: number;
  /**
   * Prompt tokens served from cache.
   *
   * Contract: Optional. Missing means none were reported.
   * When to use: The tool loop and the repair exchange add `prompt_tokens_details.cached_tokens`.
   * Expected outcome: The summary reads zero when the field was never set.
   * Exceptions: None.
   */
  readonly totalCachedTokens?: number;
  /**
   * Prompt tokens written into the cache.
   *
   * Contract: Optional. Missing means none were reported.
   * When to use: The tool loop and the repair exchange add `prompt_tokens_details.cache_write_tokens`.
   * Expected outcome: The summary reads zero when the field was never set.
   * Exceptions: None.
   */
  readonly totalCacheWriteTokens?: number;
}

/**
 * Starts a recorder for one consultation.
 *
 * Purpose: The flow creates this next to the wall-clock start, after it has a model.
 * When to use: Once per consult that enters the tool loop.
 * Expected outcome: A recorder whose summary starts failed, with no attempts.
 * Exceptions: None.
 */
export function createConsultTelemetry(input: {
  readonly seatId: string | null;
  readonly turnNumber: number;
  readonly theater: 'strategic' | 'tactical';
  readonly battleId: string | null;
  readonly modelId: string;
  readonly providerSort: string;
  readonly usage: ConsultTelemetryUsage;
}): ConsultTelemetry {
  logDebug('consultTelemetry createConsultTelemetry', {
    seatId: input.seatId,
    turnNumber: input.turnNumber,
    theater: input.theater,
    modelId: input.modelId,
  });
  const startedAt = Date.now();
  const attempts: ConsultAttemptRecord[] = [];
  const fallbacks: ConsultFallbackKind[] = [];
  let toolRounds = 0;
  let wallClockExceeded = false;
  let outcome: ConsultTelemetryOutcome = 'failed';
  let error: string | null = null;
  return {
    recordAttempt(record: ConsultAttemptRecord): void {
      logTrace('consultTelemetry recordAttempt', { attempt: record.attempt, outcome: record.outcome });
      attempts.push(record);
    },
    recordFallback(kind: ConsultFallbackKind): void {
      logTrace('consultTelemetry recordFallback', { kind });
      fallbacks.push(kind);
    },
    setToolRounds(rounds: number): void {
      logTrace('consultTelemetry setToolRounds', { rounds });
      toolRounds = rounds;
    },
    noteWallClockExceeded(): void {
      logDebug('consultTelemetry noteWallClockExceeded', { seatId: input.seatId, turnNumber: input.turnNumber });
      wallClockExceeded = true;
    },
    setOutcome(next: ConsultTelemetryOutcome, nextError: string | null = null): void {
      logDebug('consultTelemetry setOutcome', { outcome: next, error: nextError });
      outcome = next;
      error = nextError;
    },
    summary(): ConsultTelemetrySummary {
      logTrace('consultTelemetry summary', { seatId: input.seatId, outcome });
      return buildConsultTelemetrySummary({
        seatId: input.seatId,
        turnNumber: input.turnNumber,
        theater: input.theater,
        battleId: input.battleId,
        modelId: input.modelId,
        providerSort: input.providerSort,
        wallClockMs: Date.now() - startedAt,
        error,
        cancelReason: null,
        inputTokens: input.usage.totalInputTokens,
        outputTokens: input.usage.totalOutputTokens,
        costUsd: input.usage.requestCost,
        cachedTokens: input.usage.totalCachedTokens ?? 0,
        cacheWriteTokens: input.usage.totalCacheWriteTokens ?? 0,
        attempts,
        fallbacks,
        toolRounds,
        outcome,
        wallClockExceeded,
      });
    },
  };
}


/**
 * Writes the consult summary at info level.
 *
 * Purpose: The line is visible in `debug.log` at the default log level.
 * When to use: The consult's `finally`, including failures.
 * Expected outcome: One `consult telemetry` line. Does not write a debug entry line.
 * Exceptions: None.
 */
export function logConsultTelemetrySummary(summary: ConsultTelemetrySummary): void {
  logInfo('consult telemetry', summary);
}

/**
 * Reads cache counters from one chat usage object.
 *
 * Purpose: OpenRouter reports cache hits and cache writes beside the prompt-token total.
 * When to use: The tool loop and the repair exchange, once per response body.
 * Expected outcome: The two counters, or zero when `prompt_tokens_details` is missing.
 * Exceptions: None.
 */
export function cacheTokensFromChatUsage(usage: {
  readonly prompt_tokens_details?: {
    readonly cached_tokens?: number;
    readonly cache_write_tokens?: number;
  };
} | undefined): { readonly cachedTokens: number; readonly cacheWriteTokens: number } {
  logTrace('consultTelemetry cacheTokensFromChatUsage', {
    hasDetails: usage?.prompt_tokens_details !== undefined,
  });
  return {
    cachedTokens: usage?.prompt_tokens_details?.cached_tokens ?? 0,
    cacheWriteTokens: usage?.prompt_tokens_details?.cache_write_tokens ?? 0,
  };
}

/**
 * Reads a provider name from a chat response body.
 *
 * Purpose: A success names the provider at the top level. A failure names it under the error metadata.
 * When to use: After a body arrived. Pass false for a non-2xx body.
 * Expected outcome: The string, or null when the field is missing or the text is not JSON.
 * Exceptions: None. Malformed JSON returns null.
 */
export function providerFromChatBody(bodyText: string, ok: boolean): string | null {
  logTrace('consultTelemetry providerFromChatBody', { ok, chars: bodyText.length });
  try {
    const parsed: unknown = JSON.parse(bodyText);
    if (parsed === null || typeof parsed !== 'object') return null;
    const record = parsed as Record<string, unknown>;
    if (ok) return typeof record.provider === 'string' ? record.provider : null;
    const error = record.error;
    if (error === null || typeof error !== 'object') return null;
    const metadata = (error as Record<string, unknown>).metadata;
    if (metadata === null || typeof metadata !== 'object') return null;
    const name = (metadata as Record<string, unknown>).provider_name;
    return typeof name === 'string' ? name : null;
  } catch {
    return null;
  }
}


