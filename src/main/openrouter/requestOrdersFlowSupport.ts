/**
 * Metrics aggregation, prompt/response logging helpers, and small list utilities for OpenRouter order requests.
 *
 * Purpose: Shrinks `requestOrdersFlow.ts` without changing runtime behavior of the AI order pipeline.
 * When to use: Only from `requestOrdersFlow` and related tests if a helper needs direct assertion.
 * Expected outcome: Same log shapes and dedupe semantics as when this logic lived inline.
 * Exceptions: `writeFullLogArtifact` catches IO errors and logs at error level.
 */

import * as fs from 'fs';
import * as path from 'path';
import { logDebug, logError } from '../logger';

/**
 * Documents the module-scope binding `FULL_PROMPT_LOG_PREVIEW_CHARS` (FULL_PROMPT_LOG_PREVIEW_CHARS).

 * Purpose: Caps preview logging size for system/user prompts unless full logging env is enabled.
 * When to use: `logPromptPreview` when env full logging is off.
 * Expected outcome: At most this many characters appear in debug preview payloads.
 * Exceptions: None.
 */
const FULL_PROMPT_LOG_PREVIEW_CHARS = 1200;
/**
 * Documents the module-scope binding `FULL_PROMPT_LOG_ENV_FLAG` (FULL_PROMPT_LOG_ENV_FLAG).

 * Purpose: Names the env var that enables writing full prompt text to disk for support sessions.
 * When to use: `isFullLogEnvEnabled` for prompt artifacts.
 * Expected outcome: Documented in ops notes as `AGENT_WARS_LOG_FULL_PROMPTS`.
 * Exceptions: None.
 */
const FULL_PROMPT_LOG_ENV_FLAG = 'AGENT_WARS_LOG_FULL_PROMPTS';
/**
 * Documents the module-scope binding `FULL_RESPONSE_LOG_PREVIEW_CHARS` (FULL_RESPONSE_LOG_PREVIEW_CHARS).

 * Purpose: Caps preview logging for raw OpenRouter bodies unless full logging env is enabled.
 * When to use: `logResponsePreview` when env full logging is off.
 * Expected outcome: Bounded debug log size for large JSON bodies.
 * Exceptions: None.
 */
const FULL_RESPONSE_LOG_PREVIEW_CHARS = 1200;
/**
 * Documents the module-scope binding `FULL_RESPONSE_LOG_ENV_FLAG` (FULL_RESPONSE_LOG_ENV_FLAG).

 * Purpose: Names the env var that enables writing full response bodies to disk.
 * When to use: `isFullLogEnvEnabled` for response artifacts.
 * Expected outcome: Documented as `AGENT_WARS_LOG_FULL_RESPONSES`.
 * Exceptions: None.
 */
const FULL_RESPONSE_LOG_ENV_FLAG = 'AGENT_WARS_LOG_FULL_RESPONSES';

/**
 * Documents the module-scope binding `REQUEST_ORDERS_MAX_WALL_CLOCK_MS` (REQUEST_ORDERS_MAX_WALL_CLOCK_MS).

 * Purpose: Hard stop for wall-clock time spent in the tool-call loop to avoid hung AI turns.
 * When to use: Main polling loop in `requestOrdersFlow` compares elapsed time against this constant.
 * Expected outcome: Orders request aborts with a timeout-shaped error after ~90s.
 * Exceptions: None.
 */
export const REQUEST_ORDERS_MAX_WALL_CLOCK_MS = 90_000;

/**
 * Per-request counters for AI pathfinding session reuse and tool usage inside one `requestOrdersFlow` call.
 *
 * Purpose: Feeds end-of-request debug summaries without exposing mutable globals to callers.
 * When to use: Constructed fresh each request then merged into turn aggregates.
 * Expected outcome: All fields are non-negative integers after the tool loop completes.
 * Exceptions: None.
 */
export interface AiPathfindingSessionMetrics {
  /**
   * Number of pathfinding sessions created during the request.
   *
   * Contract: Non-negative integer; increments when a new session is constructed.
   * When to use: Telemetry for session churn.
   * Expected outcome: Reflects create calls observed in the tool loop.
   * Exceptions: None.
   */
  created: number;
  /**
   * Number of times an existing session was reused without recreation.
   *
   * Contract: Non-negative integer.
   * When to use: Telemetry for cache hit behavior.
   * Expected outcome: Increments on reuse paths in the tool loop.
   * Exceptions: None.
   */
  reused: number;
  /**
   * Count of plan-route tool invocations observed for the request.
   *
   * Contract: Non-negative integer.
   * When to use: Cost/latency attribution to routing tools.
   * Expected outcome: Matches tool trace cardinality for plan-route calls.
   * Exceptions: None.
   */
  planRouteToolCalls: number;
  /**
   * Count of distance-check tool invocations observed for the request.
   *
   * Contract: Non-negative integer.
   * When to use: Cost/latency attribution to distance tools.
   * Expected outcome: Matches tool trace cardinality for distance checks.
   * Exceptions: None.
   */
  checkDistanceToolCalls: number;
  /**
   * Total tool calls counted toward pathfinding-related tooling for the request.
   *
   * Contract: Non-negative integer; should be consistent with summed components where applicable.
   * When to use: High-level tool volume metrics.
   * Expected outcome: Aggregated alongside other tool families in logs.
   * Exceptions: None.
   */
  totalToolCalls: number;
}

/**
 * Rolling per-turn totals of pathfinding session metrics across multiple AI order attempts.
 *
 * Purpose: Surfaces turn-level churn when the model retries or the pipeline re-enters.
 * When to use: Retrieved at the start of each `requestOrdersFlow` and updated after completion.
 * Expected outcome: Resets when the strategic `turnNumber` changes from the last stored turn.
 * Exceptions: None.
 */
export interface AiPathfindingTurnAggregateMetrics extends AiPathfindingSessionMetrics {
  /**
   * Strategic turn number this aggregate row is bound to.
   *
   * Contract: Matches `GameStateSnapshot.turnNumber` for the active request batch.
   * When to use: Logging keyed by turn.
   * Expected outcome: Triggers reset when different from the previous stored turn.
   * Exceptions: None.
   */
  turnNumber: number;
  /**
   * Number of completed `requestOrdersFlow` invocations contributing to this aggregate in-turn.
   *
   * Contract: Non-negative integer incremented once per successful metrics merge.
   * When to use: Averaging or rate calculations in diagnostics.
   * Expected outcome: Grows across retries within the same turn.
   * Exceptions: None.
   */
  requestCount: number;
}

/**
 * Documents the module-scope binding `aiPathfindingTurnAggregateMetrics` (aiPathfindingTurnAggregateMetrics).

 * Purpose: Module-singleton aggregate used for debug logging at end of AI order flows.
 * When to use: Accessed only via `getAiPathfindingTurnAggregateMetrics`.
 * Expected outcome: Counters increase within a turn and reset on turn change.
 * Exceptions: None.
 */
const aiPathfindingTurnAggregateMetrics: AiPathfindingTurnAggregateMetrics = {
  turnNumber: -1,
  requestCount: 0,
  created: 0,
  reused: 0,
  planRouteToolCalls: 0,
  checkDistanceToolCalls: 0,
  totalToolCalls: 0,
};

/**
 * Returns the mutable aggregate metrics row for the given strategic turn, resetting when the turn changes.
 *
 * Purpose: Ensures per-turn AI pathfinding telemetry stays grouped without leaking across turns.
 * When to use: Start of each `requestOrdersFlow` invocation.
 * Expected outcome: Same object reference for the active turn until the turn number changes.
 * Exceptions: None.
 */
export function getAiPathfindingTurnAggregateMetrics(turnNumber: number): AiPathfindingTurnAggregateMetrics {
  if (aiPathfindingTurnAggregateMetrics.turnNumber !== turnNumber) {
    aiPathfindingTurnAggregateMetrics.turnNumber = turnNumber;
    aiPathfindingTurnAggregateMetrics.requestCount = 0;
    aiPathfindingTurnAggregateMetrics.created = 0;
    aiPathfindingTurnAggregateMetrics.reused = 0;
    aiPathfindingTurnAggregateMetrics.planRouteToolCalls = 0;
    aiPathfindingTurnAggregateMetrics.checkDistanceToolCalls = 0;
    aiPathfindingTurnAggregateMetrics.totalToolCalls = 0;
  }
  return aiPathfindingTurnAggregateMetrics;
}

/**
 * Interprets common truthy string env values for full prompt/response logging toggles.
 *
 * Purpose: Shared parsing for `AGENT_WARS_LOG_FULL_*` flags with optional quoting from shells.
 * When to use: Before writing large artifacts to cwd.
 * Expected outcome: True for 1/true/yes/on (case-insensitive) after trim and optional quote strip.
 * Exceptions: None.
 */
function isFullLogEnvEnabled(flagName: string): boolean {
  let v = process.env[flagName]?.trim();
  if (v === undefined || v.length === 0) return false;
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).trim();
  }
  const lower = v.toLowerCase();
  return lower === '1' || lower === 'true' || lower === 'yes' || lower === 'on';
}

/**
 * Writes a support artifact into the process cwd for full prompt/response capture sessions.
 *
 * Purpose: Gives operators a stable filename to attach to bug reports when previews are insufficient.
 * When to use: When `isFullLogEnvEnabled` is true for prompts or responses.
 * Expected outcome: Returns absolute path on success; logs and returns null on failure.
 * Exceptions: Catches filesystem errors and logs at error level.
 */
function writeFullLogArtifact(fileName: string, content: string): string | null {
  const absPath = path.join(process.cwd(), fileName);
  try {
    fs.writeFileSync(absPath, content, 'utf8');
    return absPath;
  } catch (err) {
    logError('openRouter requestOrders: failed to write full-log artifact', { fileName, err });
    return null;
  }
}

/**
 * Logs a prompt string either in full (to disk) or as a truncated preview based on env flags.
 *
 * Purpose: Keeps default logs small while allowing full capture when explicitly enabled.
 * When to use: After system and user prompts are finalized for the OpenRouter request.
 * Expected outcome: `logDebug` with preview or full metadata; optional file write.
 * Exceptions: None.
 */
export function logPromptPreview(label: string, content: string): void {
  const fullPromptLoggingEnabled = isFullLogEnvEnabled(FULL_PROMPT_LOG_ENV_FLAG);
  if (fullPromptLoggingEnabled) {
    const fileName = label.includes('user message')
      ? 'debug-last-user-prompt.txt'
      : 'debug-last-system-prompt.txt';
    const absPath = writeFullLogArtifact(fileName, content);
    logDebug(`${label} (full)`, { chars: content.length, writtenTo: absPath ?? '(write failed)' });
    return;
  }
  const preview = content.slice(0, FULL_PROMPT_LOG_PREVIEW_CHARS);
  logDebug(`${label} (preview)`, {
    preview,
    truncated: content.length > FULL_PROMPT_LOG_PREVIEW_CHARS,
    chars: content.length,
    fullLogEnvFlag: FULL_PROMPT_LOG_ENV_FLAG,
  });
}

/**
 * Logs an OpenRouter HTTP body either in full (to disk) or as a truncated preview based on env flags.
 *
 * Purpose: Same policy as prompts for raw JSON bodies including tool-call payloads.
 * When to use: After a successful chat completion response or repair pass body is available.
 * Expected outcome: `logDebug` with preview or full metadata; optional file write.
 * Exceptions: None.
 */
export function logResponsePreview(label: string, content: string): void {
  const fullResponseLoggingEnabled = isFullLogEnvEnabled(FULL_RESPONSE_LOG_ENV_FLAG);
  if (fullResponseLoggingEnabled) {
    const absPath = writeFullLogArtifact('debug-last-openrouter-response-body.txt', content);
    logDebug(`${label} (full)`, { chars: content.length, writtenTo: absPath ?? '(write failed)' });
    return;
  }
  const preview = content.slice(0, FULL_RESPONSE_LOG_PREVIEW_CHARS);
  logDebug(`${label} (preview)`, {
    preview,
    truncated: content.length > FULL_RESPONSE_LOG_PREVIEW_CHARS,
    chars: content.length,
    fullLogEnvFlag: FULL_RESPONSE_LOG_ENV_FLAG,
  });
}

/**
 * Collapses duplicate unit-target rows so the last occurrence wins (LLM sometimes repeats tool outputs).
 *
 * Purpose: Stabilizes order application when the model emits redundant movement/support rows.
 * When to use: After JSON parse of orders arrays before validation.
 * Expected outcome: Preserves input order aside from dropping earlier duplicates per `unitId`.
 * Exceptions: None.
 */
export function dedupeByUnitKeepLast<T extends { unitId: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const keptReversed: T[] = [];
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i]!;
    if (seen.has(row.unitId)) continue;
    seen.add(row.unitId);
    keptReversed.push(row);
  }
  keptReversed.reverse();
  return keptReversed;
}
