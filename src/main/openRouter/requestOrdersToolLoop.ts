/**
 * Bounded tool-call loop for one consultation.
 *
 * Purpose: `requestOrdersFlow` must stay under the file-size limit; the round bound, wall-clock stop,
 * malformed-completion retry, and tool execution live here so the orchestrator only handles parse and apply.
 * When to use: After the system and opening user messages are on the transcript.
 * Expected outcome: Final assistant text, a caller-facing failure, or tool-budget exhaustion. Mutates the
 * transcript, usage totals, and tool counts in place. Log lines and message order match the previous inline loop.
 * Exceptions: Transport failures and unusable replies return `{ kind: 'fail' }` rather than throwing.
 */

import type { GameStateSnapshot } from '../gameDb';
import { logDebug, logError } from '../logger';
import { coordinateContextSeatId, type CoordinateContext } from '../briefing/map/coordinateContext';
import { createPathfindingSession, executePathfinding } from '../tools/pathfinding';
import { executeAssessment } from '../tools/assessment';
import { executeCombatEstimation } from '../tools/combatEstimation';
import { executeMemory } from '../tools/memory';
import { executeStandingOrders } from '../tools/standingOrders';
import { executeProductionTools } from '../tools/productionTools';
import { decodeOpenRouterToolArgsForExecution } from './openRouterToolArgsHex';
import { encodeOpenRouterToolResultForLlm } from './openRouterToolResultHex';
import { resolveMalformedCompletionRetry } from './malformedCompletionRetry';
import type { RequestOrdersFlowDeps } from './requestOrdersFlowDepsTypes';
import { isRequiredToolChoiceRejectedForModel } from './openRouterModelCapabilities';
import { postOrdersChatRequest, type OrdersChatRequestSettings } from './ordersChatRequestHelpers';
import type { RequestOrdersChatMessage } from './requestOrdersFlowTypes';
import {
  REQUEST_ORDERS_MAX_TOOL_ROUNDS,
  REQUEST_ORDERS_MAX_WALL_CLOCK_MS,
  logResponsePreview,
  summarizeToolCallNamesForAiLog,
  type AiPathfindingSessionMetrics,
} from './requestOrdersFlowSupport';
import { resolveOrderFlowRoundShape } from './orderFlowRoundShape';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';

/**
 * Running cost and token totals mutated by each model round.
 *
 * Purpose: The loop, the repair exchange, and the final result share one accumulator.
 * When to use: Created in `requestOrdersFlow` and passed into the loop and repair helpers.
 * Expected outcome: Fields only increase.
 * Exceptions: None.
 */
export interface RequestOrdersUsageTotals {
  /**
   * Accumulated provider cost for this consultation.
   *
   * Contract: Non-negative; increased by each successful chat response that reports `usage.cost`.
   * When to use: Added to the success result when greater than zero.
   * Expected outcome: Matches the sum of reported costs.
   * Exceptions: None.
   */
  requestCost: number;
  /**
   * Accumulated prompt tokens.
   *
   * Contract: Non-negative.
   * When to use: Session token reporting on the success result.
   * Expected outcome: Sum of `usage.prompt_tokens`.
   * Exceptions: None.
   */
  totalInputTokens: number;
  /**
   * Accumulated completion tokens.
   *
   * Contract: Non-negative.
   * When to use: Session token reporting on the success result.
   * Expected outcome: Sum of `usage.completion_tokens`.
   * Exceptions: None.
   */
  totalOutputTokens: number;
}

/**
 * Inputs the tool loop needs from the orchestrator.
 *
 * Purpose: One object so the loop cannot be called with a mismatched transcript and tool set.
 * When to use: Built once per consultation after the opening messages are pushed.
 * Expected outcome: The loop mutates `messages`, `usage`, `toolInvocationCounts`, and pathfinding metrics.
 * Exceptions: None.
 */
export interface RequestOrdersToolLoopArgs {
  /**
   * Live consultation transcript, starting with system + opening user.
   *
   * Contract: Mutated in place with assistant, tool, and corrective user rows.
   * When to use: The same array the rest of the consultation uses.
   * Expected outcome: Repair exchange must copy this array rather than appending to it.
   * Exceptions: None.
   */
  readonly messages: RequestOrdersChatMessage[];
  /**
   * Tool definitions sent on every tool round.
   *
   * Contract: Matches `enabledToolNameSet`.
   * When to use: Chat request `tools` field.
   * Expected outcome: Unchanged for the consultation.
   * Exceptions: None.
   */
  readonly tools: ReturnType<RequestOrdersFlowDeps['buildToolDefinitions']>;
  /**
   * OpenRouter API key.
   *
   * Contract: Non-empty; the orchestrator already rejected missing keys.
   * When to use: Each chat post.
   * Expected outcome: Not logged.
   * Exceptions: None.
   */
  readonly key: string;
  /**
   * Selected model id.
   *
   * Contract: Non-empty trimmed id.
   * When to use: Chat request `model` field.
   * Expected outcome: Same model for every round including malformed retries.
   * Exceptions: None.
   */
  readonly modelId: string;
  /**
   * Optional abort signal.
   *
   * Contract: Passed through to the transport.
   * When to use: User cancel.
   * Expected outcome: Transport returns a cancelled error.
   * Exceptions: None.
   */
  readonly signal: AbortSignal | undefined;
  /**
   * Sidebar log callback.
   *
   * Contract: Same callback the orchestrator uses.
   * When to use: Round, tool, and error lines.
   * Expected outcome: Identical strings to the previous inline loop.
   * Exceptions: None.
   */
  readonly onLog: ((line: string, isError?: boolean) => void) | undefined;
  /**
   * Consultation start time in epoch ms.
   *
   * Contract: Captured before the first round.
   * When to use: Wall-clock budget comparison.
   * Expected outcome: Timeout uses `REQUEST_ORDERS_MAX_WALL_CLOCK_MS`.
   * Exceptions: None.
   */
  readonly wallClockStart: number;
  /**
   * Strategic turn number for logs.
   *
   * Contract: `state.turnNumber`.
   * When to use: Timeout and malformed-retry logging.
   * Expected outcome: Matches the snapshot the prompt used.
   * Exceptions: None.
   */
  readonly turnNumber: number;
  /**
   * Battle snapshot when this consultation is a tactical beat.
   *
   * Contract: Nullish on strategic turns.
   * When to use: Tool execution and log suffixes.
   * Expected outcome: Pathfinding sessions are not reused in battle.
   * Exceptions: None.
   */
  readonly tacticalBattle: TacticalBattleSnapshot | undefined;
  /**
   * Cost and token accumulator.
   *
   * Contract: Mutated in place.
   * When to use: Shared with the repair exchange.
   * Expected outcome: Totals include every successful HTTP 200 body.
   * Exceptions: None.
   */
  readonly usage: RequestOrdersUsageTotals;
  /**
   * Tool names the model is allowed to call this consultation.
   *
   * Contract: Disabled names receive an error tool result instead of execution.
   * When to use: Each requested tool call.
   * Expected outcome: Matches the prompt's tool list.
   * Exceptions: None.
   */
  readonly enabledToolNameSet: ReadonlySet<string>;
  /**
   * Maps a tool name to its group id for invocation counts.
   *
   * Contract: Undefined for unknown names.
   * When to use: After each executed or rejected tool call that still counts.
   * Expected outcome: Same mapping as the orchestrator.
   * Exceptions: None.
   */
  readonly getGroupIdForToolName: RequestOrdersFlowDeps['getGroupIdForToolName'];
  /**
   * Per-group invocation counters.
   *
   * Contract: Mutated in place; keys are group ids.
   * When to use: Telemetry on the success result.
   * Expected outcome: Counts include disabled-tool error rows that still increment.
   * Exceptions: None.
   */
  readonly toolInvocationCounts: Record<string, number>;
  /**
   * Coordinate mode for hex encode/decode.
   *
   * Contract: Same context as the system prompt.
   * When to use: Tool arg decode and result encode.
   * Expected outcome: Briefing codes round-trip.
   * Exceptions: None.
   */
  readonly coordinateContext: CoordinateContext;
  /**
   * Snapshot the tactical tools read.
   *
   * Contract: Battle plan state in tactical mode; world state otherwise.
   * When to use: Tool execution when `tacticalBattle` is set.
   * Expected outcome: Matches the prompt's plan state.
   * Exceptions: None.
   */
  readonly planState: GameStateSnapshot;
  /**
   * World snapshot for strategic tool execution.
   *
   * Contract: The same `state` the orchestrator holds.
   * When to use: Tool execution when not in battle.
   * Expected outcome: Standing-order and production tools see live world units.
   * Exceptions: None.
   */
  readonly state: GameStateSnapshot;
  /**
   * Hex centers for tool execution.
   *
   * Contract: Includes every hex tools might name.
   * When to use: Passed through to executeTool*.
   * Expected outcome: Same map as the briefing.
   * Exceptions: None.
   */
  readonly latLngByH3: Map<string, [number, number]>;
  /**
   * Lat/lng to H3 resolver.
   *
   * Contract: Same function as parse/apply.
   * When to use: Tool execution and result encode.
   * Expected outcome: Round-trips with `latLngByH3`.
   * Exceptions: None.
   */
  readonly resolveToH3: (lat: number, lng: number) => string | undefined;
  /**
   * Chat transport with timeout and retry.
   *
   * Contract: Same dependency the orchestrator injected.
   * When to use: Every tool round.
   * Expected outcome: `requestLabel` is `requestOrders`.
   * Exceptions: None.
   */
  readonly postOpenRouterChatWithTimeoutAndRetry: RequestOrdersFlowDeps['postOpenRouterChatWithTimeoutAndRetry'];
  /**
   * Resolves the completion token budget for this round.
   *
   * Contract: May clamp after a 402.
   * When to use: Each chat body `max_tokens`.
   * Expected outcome: Same helper the repair exchange uses.
   * Exceptions: None.
   */
  readonly resolveOrderFlowMaxTokens: () => number;
  /**
   * Reasoning, structured-output, and tool-support settings for every round.
   *
   * Contract: Same settings object the repair exchange receives.
   * When to use: Passed to `postOrdersChatRequest` on each round, and read for `tool_choice` support.
   * Expected outcome: The reasoning option is identical on every round; the schema is attached only on rounds that
   * `resolveOrderFlowRoundShape` allows.
   * Exceptions: None.
   */
  readonly requestSettings: OrdersChatRequestSettings;
  /**
   * Lazy pathfinding session for strategic planning tools.
   *
   * Contract: Not used in battle.
   * When to use: `plan_route` and `check_distance` on a strategic turn.
   * Expected outcome: Session reuse is counted on `aiPathfindingSessionMetrics`.
   * Exceptions: None.
   */
  readonly getOrCreateAiPlanningPathfindingSession: () => ReturnType<typeof createPathfindingSession>;
  /**
   * Pathfinding telemetry mutated per planning tool call.
   *
   * Contract: Mutated in place.
   * When to use: `plan_route` / `check_distance` and every tool call total.
   * Expected outcome: Finalized by the orchestrator in `finally`.
   * Exceptions: None.
   */
  readonly aiPathfindingSessionMetrics: AiPathfindingSessionMetrics;
}

/**
 * Discriminated result of the tool-call loop.
 *
 * Purpose: The orchestrator must not guess why the loop ended.
 * When to use: Return type of `runRequestOrdersToolLoop`.
 * Expected outcome: Exactly one of final text, fail, or budget exceeded.
 * Exceptions: None.
 */
export type RequestOrdersToolLoopResult =
  | {
      readonly kind: 'finalContent';
      readonly content: string;
      readonly iteration: number;
    }
  | {
      readonly kind: 'fail';
      readonly error: string;
    }
  | {
      readonly kind: 'budgetExceeded';
      readonly iteration: number;
    };

/**
 * Runs model rounds until the assistant submits text, the request fails, or the round cap is hit.
 *
 * Purpose: Isolates the bounded tool conversation from parse/apply so both stay reviewable.
 * When to use: Once per consultation after the opening messages are on `args.messages`.
 * Expected outcome: `{ kind: 'finalContent' }` with the assistant text that should be parsed; the repair
 * exchange is a separate call and must not run inside this loop.
 * Exceptions: Does not throw on transport `{ ok: false }`; returns `{ kind: 'fail' }`.
 */
export async function runRequestOrdersToolLoop(
  args: RequestOrdersToolLoopArgs
): Promise<RequestOrdersToolLoopResult> {
  logDebug('openRouter runRequestOrdersToolLoop', {
    turnNumber: args.turnNumber,
    tacticalBattleId: args.tacticalBattle?.battleId ?? null,
    messageCount: args.messages.length,
  });
  const {
    messages,
    tools,
    key,
    modelId,
    signal,
    onLog,
    wallClockStart,
    turnNumber,
    tacticalBattle,
    usage,
    enabledToolNameSet,
    getGroupIdForToolName,
    toolInvocationCounts,
    coordinateContext,
    planState,
    state,
    latLngByH3,
    resolveToH3,
    postOpenRouterChatWithTimeoutAndRetry,
    resolveOrderFlowMaxTokens,
    requestSettings,
    getOrCreateAiPlanningPathfindingSession,
    aiPathfindingSessionMetrics,
  } = args;
  let iteration = 0;
  let malformedRetryCount = 0;
  let hasCalledTool = false;
  while (iteration < REQUEST_ORDERS_MAX_TOOL_ROUNDS) {
    if (signal?.aborted) {
      logDebug('openRouter requestOrders: round skipped because the call was cancelled', { iteration, turnNumber });
      return { kind: 'fail', error: 'Cancelled' };
    }
    if (Date.now() - wallClockStart > REQUEST_ORDERS_MAX_WALL_CLOCK_MS) {
      const timeoutMsg = 'AI planning took too long and was cancelled. Please try again.';
      if (onLog) onLog(timeoutMsg, true);
      logError('openRouter requestOrders: wall-clock budget exceeded', {
        maxWallClockMs: REQUEST_ORDERS_MAX_WALL_CLOCK_MS,
        iteration,
        turnNumber,
      });
      return { kind: 'fail', error: timeoutMsg };
    }
    iteration++;
    if (onLog) {
      onLog(
        `AI round ${iteration}: calling model with ${messages.length} message(s) in context` +
          (tacticalBattle ? ' (tactical).' : '.')
      );
    }
    const completionMaxTokens = resolveOrderFlowMaxTokens();
    const roundShape = resolveOrderFlowRoundShape({
      toolCount: tools.length,
      hasCalledTool,
      requiredToolChoiceRejected: isRequiredToolChoiceRejectedForModel(modelId),
      toolChoiceSupported: requestSettings.profile.toolChoice,
    });
    logDebug('openRouter requestOrders: round request shape', {
      iteration,
      toolChoice: roundShape.toolChoice,
      attachResponseFormat: roundShape.attachResponseFormat,
      answerShape: roundShape.answerShape,
      toolCount: tools.length,
      hasCalledTool,
    });
    const chatResponse = await postOrdersChatRequest({
      post: postOpenRouterChatWithTimeoutAndRetry,
      key,
      modelId,
      baseBody: {
        model: modelId,
        messages,
        max_tokens: completionMaxTokens,
        ...(tools.length > 0 ? { tools } : {}),
        ...(roundShape.toolChoice !== null ? { tool_choice: roundShape.toolChoice } : {}),
      },
      settings: requestSettings,
      attachResponseFormat: roundShape.attachResponseFormat,
      signal,
      onLog,
      requestLabel: 'requestOrders',
    });
    if (!chatResponse.ok) {
      if (onLog && chatResponse.error !== 'Cancelled') onLog(chatResponse.error, true);
      return { kind: 'fail', error: chatResponse.error };
    }
    logResponsePreview('openRouter requestOrders: raw response body', chatResponse.bodyText);
    let json: {
      choices?: Array<{
        message?: {
          content?: string | null;
          tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
        };
      }>;
      usage?: { cost?: number; prompt_tokens?: number; completion_tokens?: number };
    };
    try {
      const responseText = chatResponse.bodyText;
      json = JSON.parse(responseText) as {
        choices?: Array<{
          message?: {
            content?: string | null;
            tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
          };
        }>;
        usage?: { cost?: number; prompt_tokens?: number; completion_tokens?: number };
      };
    } catch {
      const errorMessage = 'AI response was not valid JSON. Please try again.';
      if (onLog) onLog(errorMessage, true);
      return { kind: 'fail', error: errorMessage };
    }
    usage.requestCost += json.usage?.cost ?? 0;
    usage.totalInputTokens += json.usage?.prompt_tokens ?? 0;
    usage.totalOutputTokens += json.usage?.completion_tokens ?? 0;
    const head = json.choices?.[0] as { finish_reason?: string; native_finish_reason?: string } | undefined;
    const finishReason = head?.finish_reason;
    const nativeFinish = head?.native_finish_reason;
    if (finishReason === 'length' || nativeFinish === 'MAX_TOKENS') {
      logError('openRouter requestOrders: model output truncated at max_tokens (final JSON may be incomplete)', {
        iteration,
        tacticalAiBattle: tacticalBattle?.battleId ?? null,
        completionMaxTokens,
        reasoningEffort: requestSettings.profile.effectiveReasoningEffort,
        finishReason,
        nativeFinish,
      });
    }
    const assistantMessage = json.choices?.[0]?.message;
    if (!assistantMessage) {
      if (onLog) onLog('Invalid response: no assistant message from model.', true);
      return { kind: 'fail', error: 'Invalid response: no message' };
    }

    const usageIn = json.usage?.prompt_tokens;
    const usageOut = json.usage?.completion_tokens;
    const usageFrag =
      usageIn != null && usageOut != null ? ` (+${usageIn} / ${usageOut} tokens this call)` : '';

    const toolCalls = assistantMessage.tool_calls;
    const malformedOutcome = await resolveMalformedCompletionRetry({
      completion: {
        toolCalls,
        content: assistantMessage.content,
        finishReason,
        nativeFinishReason: nativeFinish,
      },
      retryCount: malformedRetryCount,
      iteration,
      turnNumber,
      tacticalBattleId: tacticalBattle?.battleId ?? null,
      onLog,
      answerShape: roundShape.answerShape,
    });
    if (malformedOutcome.status === 'fail') return { kind: 'fail', error: malformedOutcome.error };
    if (malformedOutcome.status === 'retry') {
      malformedRetryCount = malformedOutcome.retryCount;
      if (malformedOutcome.correctiveMessage) {
        messages.push({ role: 'user', content: malformedOutcome.correctiveMessage });
      }
      continue;
    }

    if (toolCalls && toolCalls.length > 0) {
      hasCalledTool = true;
      if (onLog) {
        onLog(
          `AI round ${iteration}: model requested ${toolCalls.length} tool call(s)${usageFrag}: ${summarizeToolCallNamesForAiLog(toolCalls, 24)}.`
        );
      }
      messages.push({
        role: 'assistant',
        content: assistantMessage.content ?? null,
        tool_calls: toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.function.name, arguments: tc.function.arguments },
        })),
      });
      for (const tc of toolCalls) {
        const toolName = tc.function.name;
        if (!enabledToolNameSet.has(toolName)) {
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify({ status: 'error', error: `Tool ${toolName} is disabled.` }),
          });
          continue;
        }
        let toolArgs: unknown;
        try {
          toolArgs = JSON.parse(tc.function.arguments || '{}');
        } catch {
          toolArgs = {};
        }
        let execArgs: unknown = toolArgs;
        try {
          execArgs = decodeOpenRouterToolArgsForExecution(toolName, toolArgs, coordinateContext);
        } catch (err) {
          logError('openRouter requestOrders: tool args hex decode failed', err);
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify({ status: 'error', error: 'Invalid briefing hex code in tool arguments.' }),
          });
          const groupId = getGroupIdForToolName(toolName);
          if (groupId !== undefined) toolInvocationCounts[groupId] = (toolInvocationCounts[groupId] ?? 0) + 1;
          continue;
        }
        const isPathfindingTool = toolName === 'plan_route' || toolName === 'check_distance';
        if (toolName === 'plan_route') aiPathfindingSessionMetrics.planRouteToolCalls += 1;
        if (toolName === 'check_distance') aiPathfindingSessionMetrics.checkDistanceToolCalls += 1;
        aiPathfindingSessionMetrics.totalToolCalls += 1;
        const toolState = tacticalBattle ? planState : state;
        const actingSeatId = coordinateContextSeatId(coordinateContext);
        const result =
          toolName.includes('order') || toolName.includes('standing')
            ? executeStandingOrders(actingSeatId, toolName, execArgs, toolState, latLngByH3, resolveToH3)
            : toolName.includes('build') || toolName.includes('production') || toolName.includes('query_production')
              ? executeProductionTools(actingSeatId, toolName, execArgs, toolState, latLngByH3, resolveToH3)
              : toolName.includes('memory')
                ? executeMemory(actingSeatId, toolName, execArgs, toolState, latLngByH3, resolveToH3)
                : toolName.includes('estimate')
                  ? executeCombatEstimation(toolName, execArgs, toolState, latLngByH3, resolveToH3, tacticalBattle)
                  : toolName.includes('assess')
                    ? executeAssessment(toolName, execArgs, toolState, latLngByH3, resolveToH3, tacticalBattle)
                    : executePathfinding(
                        toolName,
                        execArgs,
                        toolState,
                        latLngByH3,
                        resolveToH3,
                        isPathfindingTool && !tacticalBattle
                          ? getOrCreateAiPlanningPathfindingSession()
                          : undefined,
                        tacticalBattle
                      );
        const encoded =
          typeof result === 'object' && result !== null && !Array.isArray(result)
            ? encodeOpenRouterToolResultForLlm(toolName, result as Record<string, unknown>, coordinateContext, resolveToH3)
            : (result as Record<string, unknown>);
        const resultStr = JSON.stringify(encoded);
        messages.push({ role: 'tool', tool_call_id: tc.id, content: resultStr });
        const groupId = getGroupIdForToolName(toolName);
        if (groupId !== undefined) toolInvocationCounts[groupId] = (toolInvocationCounts[groupId] ?? 0) + 1;
      }
      if (onLog) {
        onLog(
          `AI round ${iteration}: recorded ${toolCalls.length} tool result(s); conversation now has ${messages.length} message(s).`
        );
      }
      continue;
    }

    const content = assistantMessage.content;
    if (typeof content !== 'string' || !content.trim()) {
      if (onLog) onLog('Invalid response: assistant returned no text content (expected JSON orders).', true);
      return { kind: 'fail', error: 'Invalid response: no content' };
    }
    if (onLog) {
      onLog(`AI round ${iteration}: model returned final text (${content.length} chars)${usageFrag}; parsing orders…`);
    }
    return { kind: 'finalContent', content, iteration };
  }
  return { kind: 'budgetExceeded', iteration };
}
