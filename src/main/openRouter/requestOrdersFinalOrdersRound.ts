/**
 * One tools-withheld model call after the consultation has used every tool round.
 *
 * Purpose: A model that keeps calling tools still gets one chance to submit orders.
 * When to use: `runRequestOrdersToolLoop`, only after the round cap is reached.
 * Expected outcome: Assistant text to parse, a cancelled failure, or tool-budget exhaustion with no orders.
 * Exceptions: Transport failures return `{ kind: 'budgetExceeded' }` rather than throwing.
 */

import { logDebug, logError, logTrace } from '../logger';
import { coordinateContextSeatId } from '../briefing/map/coordinateContext';
import { aiIndexForSeatId } from '../../shared/seatIds';
import { buildFinalOrdersRequestMessage } from './promptSpec/consultationText';
import { addOrdersChatUsageToTotals, parseOrdersChatCompletion } from './ordersChatCompletion';
import { postOrdersChatRequest } from './ordersChatRequestHelpers';
import {
  REQUEST_ORDERS_MAX_TOOL_ROUNDS,
  REQUEST_ORDERS_MAX_WALL_CLOCK_MS,
  logResponsePreview,
} from './requestOrdersFlowSupport';
import type { RequestOrdersToolLoopArgs, RequestOrdersToolLoopResult } from './requestOrdersToolLoop';

/**
 * Inputs for the tools-withheld call.
 *
 * Purpose: The call needs the live transcript and the chat transport, not the tool-execution dependencies.
 * When to use: Built by the tool loop when the round cap is reached.
 * Expected outcome: `runFinalOrdersRound` appends the final orders note, or replaces a trailing user message with it.
 * Exceptions: None.
 */
export interface FinalOrdersRoundArgs
  extends Pick<
    RequestOrdersToolLoopArgs,
    | 'messages'
    | 'tools'
    | 'key'
    | 'modelId'
    | 'signal'
    | 'onLog'
    | 'wallClockStart'
    | 'usage'
    | 'postOpenRouterChatWithTimeoutAndRetry'
    | 'resolveOrderFlowMaxTokens'
    | 'requestSettings'
  > {
  /**
   * Tool rounds already spent.
   *
   * Contract: Equals `REQUEST_ORDERS_MAX_TOOL_ROUNDS` when the loop calls this.
   * When to use: The `budgetExceeded` result and the iteration reported with final text.
   * Expected outcome: Final text reports this value plus one.
   * Exceptions: None.
   */
  readonly iteration: number;
  /**
   * Opponent number for the response debug file.
   *
   * Contract: `aiIndexForSeatId`, or 1 when the seat has no opponent index.
   * When to use: `logResponsePreview` for this call's body.
   * Expected outcome: The body overwrites that opponent's response file.
   * Exceptions: None.
   */
  readonly responseAiIndex: number;
}

/**
 * Tool fields for the call that must not invoke a tool.
 *
 * Purpose: A transcript that already contains tool calls is rejected by some providers when the next request
 * drops the tool definitions, so the definitions stay and `tool_choice` refuses them.
 * When to use: Building the final orders request body.
 * Expected outcome: `{ tools, tool_choice: 'none' }` when tools were offered and the model accepts `tool_choice`.
 * Otherwise an empty object, so a model that does not accept `tool_choice` is not sent one.
 * Exceptions: None.
 */
export function finalOrdersRoundToolFields(
  toolsOffered: boolean,
  toolChoiceSupported: boolean,
  tools: RequestOrdersToolLoopArgs['tools']
): { readonly tools?: RequestOrdersToolLoopArgs['tools']; readonly tool_choice?: 'none' } {
  logTrace('openRouter finalOrdersRoundToolFields', { toolsOffered, toolChoiceSupported, toolCount: tools.length });
  if (toolsOffered && toolChoiceSupported) return { tools, tool_choice: 'none' };
  return {};
}

/**
 * Starts the tools-withheld call from the tool loop's own arguments.
 *
 * Purpose: Names the fields the final call needs so the tool loop does not repeat them.
 * When to use: The tool loop, only after `REQUEST_ORDERS_MAX_TOOL_ROUNDS` rounds.
 * Expected outcome: The same result as `runFinalOrdersRound`, with the response file index taken from the seat.
 * Exceptions: None. Failures are the results of `runFinalOrdersRound`.
 */
export function startFinalOrdersRound(
  loopArgs: RequestOrdersToolLoopArgs,
  iteration: number
): Promise<RequestOrdersToolLoopResult> {
  logDebug('openRouter startFinalOrdersRound', { iteration, turnNumber: loopArgs.turnNumber });
  const responseSeatId = coordinateContextSeatId(loopArgs.coordinateContext);
  const resolvedIndex = aiIndexForSeatId(responseSeatId);
  if (resolvedIndex === null) {
    logError('openRouter requestOrders: seat has no opponent index; final orders log uses opponent 1', {
      seatId: responseSeatId,
    });
  }
  return runFinalOrdersRound({
    messages: loopArgs.messages,
    tools: loopArgs.tools,
    key: loopArgs.key,
    modelId: loopArgs.modelId,
    signal: loopArgs.signal,
    onLog: loopArgs.onLog,
    wallClockStart: loopArgs.wallClockStart,
    usage: loopArgs.usage,
    postOpenRouterChatWithTimeoutAndRetry: loopArgs.postOpenRouterChatWithTimeoutAndRetry,
    resolveOrderFlowMaxTokens: loopArgs.resolveOrderFlowMaxTokens,
    requestSettings: loopArgs.requestSettings,
    iteration,
    responseAiIndex: resolvedIndex ?? 1,
  });
}

/**
 * Asks once for the orders object after the tool-round cap.
 *
 * Purpose: Turns a loop that would otherwise submit nothing into one last completion.
 * When to use: Once per consultation, after the tool loop's round cap.
 * Expected outcome: `{ kind: 'finalContent', afterRoundCap: true }` when the reply is text. A tool-call reply,
 * an empty reply, a non-JSON body, or a transport failure returns `{ kind: 'budgetExceeded' }` and does not
 * execute tools. Cancellation returns `{ kind: 'fail', error: 'Cancelled' }`. A wall clock that has already
 * passed skips the call and returns `{ kind: 'budgetExceeded' }`.
 * Exceptions: Does not throw on `{ ok: false }`.
 */
export async function runFinalOrdersRound(args: FinalOrdersRoundArgs): Promise<RequestOrdersToolLoopResult> {
  const {
    messages,
    tools,
    key,
    modelId,
    signal,
    onLog,
    wallClockStart,
    usage,
    postOpenRouterChatWithTimeoutAndRetry,
    resolveOrderFlowMaxTokens,
    requestSettings,
    iteration,
    responseAiIndex,
  } = args;
  logDebug('openRouter runFinalOrdersRound', {
    modelId,
    iteration,
    messageCount: messages.length,
    toolCount: tools.length,
  });
  if (signal?.aborted) return { kind: 'fail', error: 'Cancelled' };
  if (Date.now() - wallClockStart > REQUEST_ORDERS_MAX_WALL_CLOCK_MS) {
    logDebug('openRouter runFinalOrdersRound: skipped because the wall clock has passed', { iteration, modelId });
    return { kind: 'budgetExceeded', iteration };
  }
  if (onLog) {
    onLog(
      `Tool-round limit (${REQUEST_ORDERS_MAX_TOOL_ROUNDS}) reached; asking once for final orders with tools withheld.`
    );
  }
  requestSettings.telemetry?.recordFallback('finalOrdersRound');
  const note = buildFinalOrdersRequestMessage(REQUEST_ORDERS_MAX_TOOL_ROUNDS);
  const last = messages[messages.length - 1];
  if (last?.role === 'user') {
    logDebug('openRouter runFinalOrdersRound: replacing the trailing user message', { iteration, modelId });
    messages[messages.length - 1] = { role: 'user', content: note };
  } else {
    messages.push({ role: 'user', content: note });
  }
  const completionMaxTokens = resolveOrderFlowMaxTokens();
  const response = await postOrdersChatRequest({
    post: postOpenRouterChatWithTimeoutAndRetry,
    key,
    modelId,
    baseBody: {
      model: modelId,
      messages,
      max_tokens: completionMaxTokens,
      ...finalOrdersRoundToolFields(tools.length > 0, requestSettings.profile.toolChoice, tools),
    },
    settings: requestSettings,
    attachResponseFormat: true,
    signal,
    onLog,
    requestLabel: 'requestOrders final',
  });
  if (!response.ok) {
    if (response.error === 'Cancelled') return { kind: 'fail', error: 'Cancelled' };
    if (onLog) onLog(`Final orders request failed: ${response.error}`, true);
    return { kind: 'budgetExceeded', iteration };
  }
  logResponsePreview('openRouter requestOrders final: raw response body', response.bodyText, responseAiIndex);
  const json = parseOrdersChatCompletion(response.bodyText);
  if (json === null) return { kind: 'budgetExceeded', iteration };
  addOrdersChatUsageToTotals(usage, json.usage);
  const head = json.choices?.[0];
  if (head?.finish_reason === 'length' || head?.native_finish_reason === 'MAX_TOKENS') {
    logError('openRouter requestOrders final: model output truncated at max_tokens (final JSON may be incomplete)', {
      iteration,
      completionMaxTokens,
      reasoningEffort: requestSettings.profile.effectiveReasoningEffort,
      finishReason: head.finish_reason ?? null,
      nativeFinish: head.native_finish_reason ?? null,
    });
  }
  const toolCalls = head?.message?.tool_calls;
  if (toolCalls && toolCalls.length > 0) {
    if (onLog) onLog('Model asked for a tool after the tool-round limit; no orders this period.', true);
    return { kind: 'budgetExceeded', iteration };
  }
  const content = head?.message?.content;
  if (typeof content === 'string' && content.trim()) {
    if (onLog) onLog(`Final orders reply received (${content.length} chars); parsing orders…`);
    return { kind: 'finalContent', content, iteration: iteration + 1, afterRoundCap: true };
  }
  if (onLog) onLog('Final orders request returned no text; no orders this period.', true);
  return { kind: 'budgetExceeded', iteration };
}
