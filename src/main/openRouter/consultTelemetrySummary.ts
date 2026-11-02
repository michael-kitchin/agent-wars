/**
 * The pure consult summary written to the info log.
 *
 * Purpose: The recorder and the tests share one summary shape.
 * When to use: `logConsultTelemetrySummary` and `ConsultTelemetry.summary`.
 * Expected outcome: The info-line keys, with providers in first-seen order.
 * Exceptions: None.
 */

import { logTrace } from '../logger';
import type {
  ConsultAttemptRecord,
  ConsultFallbackKind,
  ConsultTelemetryOutcome,
} from './consultTelemetry';

/**
 * The info-line object for one consultation.
 *
 * Purpose: One object is the whole consult story.
 * When to use: `logConsultTelemetrySummary`.
 * Expected outcome: Tokens and cost are whatever the usage accumulator holds at summary time.
 * Exceptions: None.
 */
export interface ConsultTelemetrySummary {
  /**
   * Seat that consulted.
   *
   * Contract: The seat id, or null when the flow has not bound one.
   * When to use: Matching the line to a commander.
   * Expected outcome: The id passed to `createConsultTelemetry`.
   * Exceptions: None.
   */
  readonly seatId: string | null;
  /**
   * Strategic turn number.
   *
   * Contract: The turn the consult started on.
   * When to use: Matching the line to a turn.
   * Expected outcome: The turn passed to `createConsultTelemetry`.
   * Exceptions: None.
   */
  readonly turnNumber: number;
  /**
   * Which map the consult was on.
   *
   * Contract: `strategic` or `tactical`.
   * When to use: Separating battle consults from the world map.
   * Expected outcome: `tactical` only when a battle id is set.
   * Exceptions: None.
   */
  readonly theater: 'strategic' | 'tactical';
  /**
   * Battle id.
   *
   * Contract: Null on the strategic map.
   * When to use: A tactical consult.
   * Expected outcome: The battle id, or null.
   * Exceptions: None.
   */
  readonly battleId: string | null;
  /**
   * Model id stored for the seat.
   *
   * Contract: No routing suffix.
   * When to use: The summary.
   * Expected outcome: The id the consult used.
   * Exceptions: None.
   */
  readonly modelId: string;
  /**
   * Provider choice stored for the seat.
   *
   * Contract: One of the stored sort values.
   * When to use: The summary.
   * Expected outcome: The choice passed in, including `nitro`.
   * Exceptions: None.
   */
  readonly providerSort: string;
  /**
   * How the consult ended.
   *
   * Contract: A `ConsultTelemetryOutcome`. Stays `failed` until `setOutcome`.
   * When to use: The summary.
   * Expected outcome: The last `setOutcome` value.
   * Exceptions: None.
   */
  readonly outcome: ConsultTelemetryOutcome;
  /**
   * Returned error text.
   *
   * Contract: Null when the consult did not fail.
   * When to use: The summary.
   * Expected outcome: The error passed to `setOutcome`, or null.
   * Exceptions: None.
   */
  readonly error: string | null;
  /**
   * Cancel reason on this line.
   *
   * Contract: Always null. A pool timeout has its own log line.
   * When to use: The summary.
   * Expected outcome: Null.
   * Exceptions: None.
   */
  readonly cancelReason: null;
  /**
   * Milliseconds from recorder creation to the summary.
   *
   * Contract: A non-negative number.
   * When to use: The summary.
   * Expected outcome: The elapsed time when `summary` was called.
   * Exceptions: None.
   */
  readonly wallClockMs: number;
  /**
   * Last tool round the loop reported.
   *
   * Contract: Zero when the loop never set one.
   * When to use: The summary.
   * Expected outcome: The last `setToolRounds` value.
   * Exceptions: None.
   */
  readonly toolRounds: number;
  /**
   * How many attempts were recorded.
   *
   * Contract: The length of `attempts`.
   * When to use: The summary.
   * Expected outcome: One per send that entered the transport try.
   * Exceptions: None.
   */
  readonly modelCalls: number;
  /**
   * Attempts whose outcome is timeout.
   *
   * Contract: A count.
   * When to use: The summary.
   * Expected outcome: How many sends timed out.
   * Exceptions: None.
   */
  readonly timeouts: number;
  /**
   * Attempts whose outcome is streamStall.
   *
   * Contract: A count.
   * When to use: The summary.
   * Expected outcome: How many sends stalled.
   * Exceptions: None.
   */
  readonly streamStalls: number;
  /**
   * Whether the tool loop hit the wall clock.
   *
   * Contract: True only after `noteWallClockExceeded`.
   * When to use: The summary.
   * Expected outcome: False unless the loop stopped for the wall clock.
   * Exceptions: None.
   */
  readonly wallClockExceeded: boolean;
  /**
   * Providers of successful attempts.
   *
   * Contract: Distinct, first seen first.
   * When to use: The summary.
   * Expected outcome: Provider names from `ok` attempts.
   * Exceptions: None.
   */
  readonly servedBy: readonly string[];
  /**
   * Providers of the other attempts.
   *
   * Contract: Distinct, first seen first. Null providers are omitted.
   * When to use: The summary.
   * Expected outcome: Provider names from attempts that were not `ok`.
   * Exceptions: None.
   */
  readonly failedOn: readonly string[];
  /**
   * Prompt tokens accumulated on the consult.
   *
   * Contract: The usage object's input total at summary time.
   * When to use: The summary.
   * Expected outcome: Zero when no body reported tokens.
   * Exceptions: None.
   */
  readonly inputTokens: number;
  /**
   * Completion tokens accumulated on the consult.
   *
   * Contract: The usage object's output total at summary time.
   * When to use: The summary.
   * Expected outcome: Zero when no body reported tokens.
   * Exceptions: None.
   */
  readonly outputTokens: number;
  /**
   * Dollars accumulated on the consult.
   *
   * Contract: The usage object's cost at summary time.
   * When to use: The summary.
   * Expected outcome: Zero when no body reported a cost.
   * Exceptions: None.
   */
  readonly costUsd: number;
  /**
   * Cached prompt tokens accumulated on the consult.
   *
   * Contract: Sum of `usage.prompt_tokens_details.cached_tokens`. Missing reports are zero.
   * When to use: The info line.
   * Expected outcome: Zero when no body reported a cache read.
   * Exceptions: None.
   */
  readonly cachedTokens: number;
  /**
   * Cache-write prompt tokens accumulated on the consult.
   *
   * Contract: Sum of `usage.prompt_tokens_details.cache_write_tokens`. Missing reports are zero.
   * When to use: The info line.
   * Expected outcome: Zero when no body reported a cache write.
   * Exceptions: None.
   */
  readonly cacheWriteTokens: number;
  /**
   * Fallbacks in record order.
   *
   * Contract: The kinds passed to `recordFallback`.
   * When to use: The summary.
   * Expected outcome: One entry per fallback, including repeats.
   * Exceptions: None.
   */
  readonly fallbacks: readonly ConsultFallbackKind[];
  /**
   * Attempts in record order.
   *
   * Contract: Copies of the records passed to `recordAttempt`.
   * When to use: The summary.
   * Expected outcome: One row per send.
   * Exceptions: None.
   */
  readonly attempts: readonly ConsultAttemptRecord[];
}

/**
 * Builds the info-line object from one consult's records.
 *
 * Purpose: The log line and the tests share one pure summary.
 * When to use: `ConsultTelemetry.summary` and `logConsultTelemetrySummary`.
 * Expected outcome: The keys named for the info line. `servedBy` and `failedOn` keep first-seen order.
 * Exceptions: None.
 */
export function buildConsultTelemetrySummary(input: {
  readonly seatId: string | null;
  readonly turnNumber: number;
  readonly theater: 'strategic' | 'tactical';
  readonly battleId: string | null;
  readonly modelId: string;
  readonly providerSort: string;
  readonly wallClockMs: number;
  readonly error: string | null;
  readonly cancelReason: null;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costUsd: number;
  readonly cachedTokens: number;
  readonly cacheWriteTokens: number;
  readonly attempts: readonly ConsultAttemptRecord[];
  readonly fallbacks: readonly ConsultFallbackKind[];
  readonly toolRounds: number;
  readonly outcome: ConsultTelemetryOutcome;
  readonly wallClockExceeded: boolean;
}): ConsultTelemetrySummary {
  logTrace('consultTelemetry buildConsultTelemetrySummary', { seatId: input.seatId, outcome: input.outcome });
  return {
    seatId: input.seatId,
    turnNumber: input.turnNumber,
    theater: input.theater,
    battleId: input.battleId,
    modelId: input.modelId,
    providerSort: input.providerSort,
    outcome: input.outcome,
    error: input.error,
    cancelReason: input.cancelReason,
    wallClockMs: input.wallClockMs,
    toolRounds: input.toolRounds,
    modelCalls: input.attempts.length,
    timeouts: input.attempts.filter((attempt) => attempt.outcome === 'timeout').length,
    streamStalls: input.attempts.filter((attempt) => attempt.outcome === 'streamStall').length,
    wallClockExceeded: input.wallClockExceeded,
    servedBy: distinctProviders(input.attempts.filter((attempt) => attempt.outcome === 'ok')),
    failedOn: distinctProviders(input.attempts.filter((attempt) => attempt.outcome !== 'ok')),
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    costUsd: input.costUsd,
    cachedTokens: input.cachedTokens,
    cacheWriteTokens: input.cacheWriteTokens,
    fallbacks: [...input.fallbacks],
    attempts: input.attempts.map((attempt) => ({ ...attempt })),
  };
}

/**
 * Provider names in first-seen order, skipping nulls.
 *
 * Purpose: `servedBy` and `failedOn` list each provider once.
 * When to use: `summary`.
 * Expected outcome: The order of the first attempt that named each provider.
 * Exceptions: None.
 */
function distinctProviders(attempts: readonly ConsultAttemptRecord[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const attempt of attempts) {
    if (attempt.provider === null || seen.has(attempt.provider)) continue;
    seen.add(attempt.provider);
    names.push(attempt.provider);
  }
  return names;
}
