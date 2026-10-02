/**
 * Metrics aggregation, prompt/response logging helpers, and small list utilities for OpenRouter order requests.
 *
 * Purpose: Holds shared order-request helpers so `requestOrdersFlow.ts` stays within the file-size limit.
 * When to use: From the order flow, the tool loop, and tests that assert a helper directly.
 * Expected outcome: Log shapes and dedupe live in one place.
 * Exceptions: `writeFullLogArtifact` catches IO errors and logs at error level.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { CoordinateContextMode } from '../briefing/map/coordinateContext';
import { AI_CONSULTATION_WALL_CLOCK_MS } from '../../shared/aiConsultationLimits';
import { logDebug, logError, logTrace } from '../logger';

/**
 * Documents the module-scope binding `FULL_PROMPT_LOG_PREVIEW_CHARS` (FULL_PROMPT_LOG_PREVIEW_CHARS).

 * Purpose: Caps preview logging size for system and user prompts unless full logging env is enabled.
 * When to use: `logPromptPreview` when env full logging is off.
 * Expected outcome: At most this many characters appear in debug preview payloads.
 * Exceptions: None.
 */
const FULL_PROMPT_LOG_PREVIEW_CHARS = 1200;
/**
 * Documents the module-scope binding `FULL_PROMPT_LOG_ENV_FLAG` (FULL_PROMPT_LOG_ENV_FLAG).

 * Purpose: Names the env var that enables writing full prompt text to disk for support sessions.
 * When to use: `isEnvFlagEnabled` for prompt artifacts.
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
 * When to use: `isEnvFlagEnabled` for response artifacts.
 * Expected outcome: Documented as `AGENT_WARS_LOG_FULL_RESPONSES`.
 * Exceptions: None.
 */
const FULL_RESPONSE_LOG_ENV_FLAG = 'AGENT_WARS_LOG_FULL_RESPONSES';

/**
 * Documents the module-scope binding `REQUEST_ORDERS_MAX_WALL_CLOCK_MS` (REQUEST_ORDERS_MAX_WALL_CLOCK_MS).

 * Purpose: Local name for `AI_CONSULTATION_WALL_CLOCK_MS` so the tool loop and the outer waiters share one 5-minute cap.
 * When to use: Main polling loop in `requestOrdersFlow` compares elapsed time against this constant.
 * Expected outcome: Orders request aborts with a timeout-shaped error after 5 minutes already spent in the loop.
 * Exceptions: None.
 */
export const REQUEST_ORDERS_MAX_WALL_CLOCK_MS = AI_CONSULTATION_WALL_CLOCK_MS;

/**
 * Maximum model rounds in one consultation, including tool calls.
 *
 * Purpose: The loop bound and the next-consultation warning must quote the same number.
 * When to use: `requestOrdersFlow` tool loop and `buildToolBudgetExceededWarning`.
 * Expected outcome: Changing this value updates both the hard stop and the warning text.
 * Exceptions: None.
 */
export const REQUEST_ORDERS_MAX_TOOL_ROUNDS = 50;

/**
 * Warning appended to the next system prompt after a consultation exhausted its tool budget.
 *
 * Purpose: variants.md consultation-policy row: the model must hear the round limit, that nothing was submitted, and to submit promptly.
 * When to use: `buildSystemPromptForTools` when the previous consultation hit the round cap and planning or orders tools are on.
 * Expected outcome: Contains `String(REQUEST_ORDERS_MAX_TOOL_ROUNDS)`.
 * Exceptions: None.
 */
export function buildToolBudgetExceededWarning(): string {
  logDebug('requestOrdersFlowSupport buildToolBudgetExceededWarning', {
    maxToolRounds: REQUEST_ORDERS_MAX_TOOL_ROUNDS,
  });
  return (
    `\n\nWARNING: Last turn's planning exceeded the tool-call limit (${REQUEST_ORDERS_MAX_TOOL_ROUNDS} rounds). ` +
    'You submitted no explicit orders. Ensure you submit your final orders JSON promptly after gathering the information you need.\n'
  );
}

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
 * Reports whether full prompt text should be written to disk (`debug-last-*-prompt.txt`).
 *
 * Purpose: Lets `requestOrdersFlow` decide when to attach optional diagnostic-only map content without duplicating env parsing.
 * When to use: Before building a supplemental operational map section for full-disk prompt capture.
 * Expected outcome: True when `AGENT_WARS_LOG_FULL_PROMPTS` is set to 1/true/yes/on (case-insensitive).
 * Exceptions: None.
 */
export function isAgentWarsFullPromptLoggingEnabled(): boolean {
  return isEnvFlagEnabled(FULL_PROMPT_LOG_ENV_FLAG);
}

/**
 * Interprets common truthy string values of a developer environment flag.
 *
 * Purpose: Shared parsing for `AGENT_WARS_*` on/off flags, tolerating quotes that some shells keep.
 * When to use: Whenever main-process code reads an on/off developer flag; the value is read on every call.
 * Expected outcome: True for 1/true/yes/on (case-insensitive) after trim and optional quote strip; false when unset.
 * Exceptions: None.
 */
export function isEnvFlagEnabled(flagName: string): boolean {
  let value = process.env[flagName]?.trim();
  const quoted =
    value !== undefined &&
    value.length > 1 &&
    ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")));
  if (quoted && value !== undefined) value = value.slice(1, -1).trim();
  const normalized = value?.toLowerCase();
  const enabled = normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
  logTrace('requestOrdersFlowSupport isEnvFlagEnabled', { flagName, enabled });
  return enabled;
}

/**
 * Writes a support artifact into the process cwd for full prompt/response capture sessions.
 *
 * Purpose: Gives operators a stable filename to attach to bug reports when previews are insufficient.
 * When to use: When `isEnvFlagEnabled` is true for prompts or responses.
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
 * Distinguishes which full-prompt disk file a consultation should overwrite.
 *
 * Contract: `'user'` is the initial user message. `'strategic'` and `'tactical'` match
 * `CoordinateContextMode` so a new coordinate mode fails to compile until it has a filename.
 * When to use: Pass from `logPromptPreview` (and tests) instead of inferring a name from log labels.
 * Expected outcome: Callers can resolve a stable `debug-last-*-prompt.txt` name via `resolveFullPromptLogFileName`.
 * Exceptions: None.
 */
export type PromptLogArtifactKind = 'user' | CoordinateContextMode;

/**
 * Maps a prompt-log artifact kind to the cwd filename used when full prompt logging is enabled.
 *
 * Purpose: Keeps strategic and tactical system prompts on separate last-write files, and keeps the
 * user message on its own file, without inferring names from debug labels.
 * When to use: Before `writeFullLogArtifact` in `logPromptPreview`.
 * Expected outcome: `'user'` → `debug-last-user-prompt.txt`; `'strategic'` →
 * `debug-last-strategic-prompt.txt`; `'tactical'` → `debug-last-tactical-prompt.txt`.
 * Exceptions: Throws if `kind` is not a supported artifact kind (exhaustive-check fallback).
 */
export function resolveFullPromptLogFileName(kind: PromptLogArtifactKind): string {
  let fileName: string;
  switch (kind) {
    case 'user':
      fileName = 'debug-last-user-prompt.txt';
      break;
    case 'strategic':
      fileName = 'debug-last-strategic-prompt.txt';
      break;
    case 'tactical':
      fileName = 'debug-last-tactical-prompt.txt';
      break;
    default: {
      const exhaustive: never = kind;
      throw new Error(`Unsupported prompt log artifact kind: ${String(exhaustive)}`);
    }
  }
  logTrace('openRouter resolveFullPromptLogFileName', { kind, fileName });
  return fileName;
}

/**
 * Optional disk-only extras and the artifact kind for `logPromptPreview`.
 *
 * Purpose: Keeps the filename independent of the debug log label so strategic and tactical
 * system prompts cannot overwrite each other.
 * When to use: Third argument to `logPromptPreview` after the system or user prompt is finalized.
 * Expected outcome: `artifactKind` selects the cwd file when full prompt logging is enabled.
 * Exceptions: None.
 */
export interface LogPromptPreviewOptions {
  /**
   * Which last-write prompt file this consultation should overwrite.
   *
   * Contract: `'user'` for the initial user message; `'strategic'` or `'tactical'` for the
   * matching system prompt (`coordinateContext.mode`).
   * When to use: Always pass explicitly from `requestOrdersFlow`.
   * Expected outcome: Resolved via `resolveFullPromptLogFileName`.
   * Exceptions: Unsupported kinds throw from the resolver.
   */
  artifactKind: PromptLogArtifactKind;
  /**
   * Diagnostic text appended to the disk file only (not sent to the model).
   *
   * Contract: Optional; ignored when empty or whitespace. Used for the strategic operational-map
   * supplement when the system prompt omitted the map.
   * When to use: Strategic system-prompt logging only.
   * Expected outcome: Appended after a separator when non-empty.
   * Exceptions: None.
   */
  supplementalDiskOnlyBody?: string;
}

/**
 * Logs a prompt string either in full (to disk) or as a truncated preview based on env flags.
 *
 * Purpose: Keeps default logs small while allowing full capture when explicitly enabled.
 * When to use: After system and user prompts are finalized for the OpenRouter request.
 * Expected outcome: `logDebug` with preview or full metadata; optional write to
 * `debug-last-user-prompt.txt`, `debug-last-strategic-prompt.txt`, or `debug-last-tactical-prompt.txt`.
 * Exceptions: None.
 */
export function logPromptPreview(label: string, content: string, options: LogPromptPreviewOptions): void {
  const fileName = resolveFullPromptLogFileName(options.artifactKind);
  const fullPromptLoggingEnabled = isEnvFlagEnabled(FULL_PROMPT_LOG_ENV_FLAG);
  if (fullPromptLoggingEnabled) {
    const supplementalDiskOnlyBody = options.supplementalDiskOnlyBody;
    const diskBody =
      supplementalDiskOnlyBody != null && supplementalDiskOnlyBody.trim().length > 0
        ? `${content}\n\n---\n\n## Full-prompt log supplement (not sent to the model)\n\n${supplementalDiskOnlyBody.trim()}`
        : content;
    const absPath = writeFullLogArtifact(fileName, diskBody);
    logDebug(`${label} (full)`, {
      chars: content.length,
      diskChars: diskBody.length,
      writtenTo: absPath ?? '(write failed)',
    });
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
  const fullResponseLoggingEnabled = isEnvFlagEnabled(FULL_RESPONSE_LOG_ENV_FLAG);
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
 * Builds a concise comma-separated tool-name list for the OpenRouter sidebar log.
 *
 * Purpose: Keeps per-round log lines readable when the model issues many parallel tool calls.
 * When to use: After each assistant message that includes `tool_calls`.
 * Expected outcome: Single-line fragment; truncates with a count suffix when the list exceeds `maxNames`.
 * Exceptions: None.
 */
export function summarizeToolCallNamesForAiLog(
  toolCalls: ReadonlyArray<{ function: { name: string } }>,
  maxNames: number
): string {
  logTrace('requestOrdersFlowSupport summarizeToolCallNamesForAiLog', { toolCallCount: toolCalls.length, maxNames });
  const names = toolCalls.map((tc) => tc.function.name);
  if (names.length <= maxNames) return names.join(', ');
  return `${names.slice(0, maxNames).join(', ')} (+${names.length - maxNames} more)`;
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

/**
 * Merges per-request pathfinding counters into the turn aggregate and emits end-of-request debug logs.
 *
 * Purpose: Keeps the `requestOrdersFlow` `finally` block thin while preserving telemetry shape.
 * When to use: In `requestOrdersFlow` `finally` after the tool loop exits (success, fail, or cancel).
 * Expected outcome: Aggregate counters increase; strategic and optional tactical latency debug lines are written.
 * Exceptions: None.
 */
export function finalizeRequestOrdersPathfindingMetrics(args: {
  turnNumber: number;
  modelId: string;
  wallClockStart: number;
  requestMetrics: AiPathfindingSessionMetrics;
  turnAggregateMetrics: AiPathfindingTurnAggregateMetrics;
  tacticalBattleId: string | null;
}): void {
  const {
    turnNumber,
    modelId,
    wallClockStart,
    requestMetrics,
    turnAggregateMetrics,
    tacticalBattleId,
  } = args;
  turnAggregateMetrics.requestCount += 1;
  turnAggregateMetrics.created += requestMetrics.created;
  turnAggregateMetrics.reused += requestMetrics.reused;
  turnAggregateMetrics.planRouteToolCalls += requestMetrics.planRouteToolCalls;
  turnAggregateMetrics.checkDistanceToolCalls += requestMetrics.checkDistanceToolCalls;
  turnAggregateMetrics.totalToolCalls += requestMetrics.totalToolCalls;
  logDebug('openRouter requestOrders: pathfinding session metrics', {
    turnNumber,
    modelId,
    requestMetrics,
    turnAggregateMetrics: {
      turnNumber: turnAggregateMetrics.turnNumber,
      requestCount: turnAggregateMetrics.requestCount,
      created: turnAggregateMetrics.created,
      reused: turnAggregateMetrics.reused,
      planRouteToolCalls: turnAggregateMetrics.planRouteToolCalls,
      checkDistanceToolCalls: turnAggregateMetrics.checkDistanceToolCalls,
      totalToolCalls: turnAggregateMetrics.totalToolCalls,
    },
  });
  if (tacticalBattleId) {
    logDebug('openRouter requestOrders tactical latency diagnostics', {
      battleId: tacticalBattleId,
      wallClockMs: Date.now() - wallClockStart,
      turnNumber,
      modelId,
      planRouteToolCalls: requestMetrics.planRouteToolCalls,
      checkDistanceToolCalls: requestMetrics.checkDistanceToolCalls,
      totalToolCalls: requestMetrics.totalToolCalls,
    });
  }
}

