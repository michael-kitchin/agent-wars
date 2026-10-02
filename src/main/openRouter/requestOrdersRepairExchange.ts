/**
 * Off-to-the-side parse-repair exchange for an unparseable final JSON reply.
 *
 * Purpose: consultation-flow invariant: the repair runs on a copy of the conversation with tools
 * disabled, and neither the unparseable text nor the repair exchange rejoins the main message list.
 * When to use: After `parseOrdersResponse` fails on the first final-text attempt, once per consultation.
 * Expected outcome: Trimmed assistant text from the repair call, or null when the call fails or returns empty.
 * Exceptions: JSON.parse of a successful HTTP body may throw; the caller treats that as a failed parse.
 */

import { logDebug, logError } from '../logger';
import { type EnvelopeGates } from './promptSpec/envelopeContract';
import { buildRepairRequestMessage } from './promptSpec/consultationText';
import type { RequestOrdersFlowDeps } from './requestOrdersFlowDepsTypes';
import { postOrdersChatRequest, type OrdersChatRequestSettings } from './ordersChatRequestHelpers';
import type { RequestOrdersChatMessage } from './requestOrdersFlowTypes';
import { logResponsePreview } from './requestOrdersFlowSupport';
import type { RequestOrdersUsageTotals } from './requestOrdersToolLoop';

/**
 * Inputs for one parse-repair attempt.
 *
 * Purpose: Keeps the copy-and-disable-tools rule in one place so the orchestrator cannot merge the exchange back.
 * When to use: Built from the live transcript plus the unparseable assistant text.
 * Expected outcome: `messages` is not mutated.
 * Exceptions: None.
 */
export interface ParseRepairExchangeArgs {
  /**
   * Live consultation transcript at the moment parse failed.
   *
   * Contract: Copied; never appended to.
   * When to use: Snapshot of system + opening + tool rounds, without the unparseable assistant text.
   * Expected outcome: The main list is unchanged after this function returns.
   * Exceptions: None.
   */
  readonly messages: readonly RequestOrdersChatMessage[];
  /**
   * Unparseable assistant text from the main loop.
   *
   * Contract: Non-empty string that `parseOrdersResponse` already rejected.
   * When to use: Appended only on the repair copy.
   * Expected outcome: Not pushed onto `messages`.
   * Exceptions: None.
   */
  readonly unparseableContent: string;
  /**
   * Envelope gates for the repair schema.
   *
   * Contract: Same gates as the system prompt's JSON contract for this consultation.
   * When to use: `buildRepairSchemaText`.
   * Expected outcome: Schema field order matches `envelopeFieldsForGates`.
   * Exceptions: None.
   */
  readonly repairGates: EnvelopeGates;
  /**
   * OpenRouter API key.
   *
   * Contract: Non-empty.
   * When to use: The repair chat post.
   * Expected outcome: Not logged.
   * Exceptions: None.
   */
  readonly key: string;
  /**
   * Selected model id.
   *
   * Contract: Same model as the main loop.
   * When to use: Repair chat `model` field.
   * Expected outcome: One extra completion, with `tool_choice: 'none'` when tools were offered and the model accepts
   * `tool_choice`.
   * Exceptions: None.
   */
  readonly modelId: string;
  /**
   * Optional abort signal.
   *
   * Contract: Passed through to the transport.
   * When to use: User cancel during repair.
   * Expected outcome: Transport returns a cancelled error.
   * Exceptions: None.
   */
  readonly signal: AbortSignal | undefined;
  /**
   * Sidebar log callback.
   *
   * Contract: Same callback as the main loop.
   * When to use: Repair start, completion, and failure lines.
   * Expected outcome: Identical strings to the previous inline repair block.
   * Exceptions: None.
   */
  readonly onLog: ((line: string, isError?: boolean) => void) | undefined;
  /**
   * Battle id for truncation logs, or null on a strategic turn.
   *
   * Contract: `tacticalBattle?.battleId ?? null`.
   * When to use: max_tokens truncation log on the repair reply.
   * Expected outcome: Null when not in battle.
   * Exceptions: None.
   */
  readonly tacticalBattleId: string | null;
  /**
   * Cost and token accumulator shared with the main loop.
   *
   * Contract: Mutated in place when the repair HTTP call succeeds.
   * When to use: Add repair `usage` into the consultation totals.
   * Expected outcome: Totals include the repair call even if parse still fails.
   * Exceptions: None.
   */
  readonly usage: RequestOrdersUsageTotals;
  /**
   * Chat transport with timeout and retry.
   *
   * Contract: Same dependency as the main loop.
   * When to use: The single repair post with `requestLabel: 'requestOrders repair'`.
   * Expected outcome: Tools are omitted; `tool_choice` is `'none'` only when tools were offered and the model
   * accepts it.
   * Exceptions: None.
   */
  readonly postOpenRouterChatWithTimeoutAndRetry: RequestOrdersFlowDeps['postOpenRouterChatWithTimeoutAndRetry'];
  /**
   * Resolves the completion token budget for the repair call.
   *
   * Contract: Same helper as the main loop.
   * When to use: Repair body `max_tokens`.
   * Expected outcome: May clamp after a 402.
   * Exceptions: None.
   */
  readonly resolveOrderFlowMaxTokens: () => number;
  /**
   * Reasoning and structured-output settings for the repair call.
   *
   * Contract: Same settings object the main loop used.
   * When to use: Passed to `postOrdersChatRequest` for the repair post, and read for `tool_choice` support.
   * Expected outcome: The repair call sends the same reasoning option as the main rounds, and the schema is always
   * allowed on it.
   * Exceptions: None.
   */
  readonly requestSettings: OrdersChatRequestSettings;
  /**
   * Whether the main loop offered tools.
   *
   * Contract: `true` when the main loop sent a non-empty tool list.
   * When to use: Deciding whether the repair call refuses tools with `tool_choice: 'none'`.
   * Expected outcome: When `false`, no `tool_choice` is sent, because a model without tool support may not be routable
   * with one.
   * Exceptions: None.
   */
  readonly toolsOffered: boolean;
}

/**
 * Runs one tools-disabled repair completion on a copy of the transcript.
 *
 * Purpose: Gives the model one chance to resubmit parseable JSON without polluting the main conversation.
 * When to use: After the first `parseOrdersResponse` failure, and never a second time in the same consultation.
 * Expected outcome: Assistant text to parse, or null. Does not throw on `{ ok: false }`.
 * Exceptions: `JSON.parse` of a successful body may throw; callers should let that surface to the outer catch.
 */
export async function runParseRepairExchange(args: ParseRepairExchangeArgs): Promise<string | null> {
  const {
    onLog,
    postOpenRouterChatWithTimeoutAndRetry,
    usage,
    resolveOrderFlowMaxTokens,
    requestSettings,
    toolsOffered,
  } = args;
  const sendNoneToolChoice = toolsOffered && requestSettings.profile.toolChoice;
  logDebug('openRouter runParseRepairExchange', {
    messageCount: args.messages.length,
    unparseableChars: args.unparseableContent.length,
    tacticalBattleId: args.tacticalBattleId,
    coordinateMode: args.repairGates.coordinateMode,
    toolsOffered,
    sendNoneToolChoice,
  });
  if (onLog) onLog('Orders JSON was not parseable; sending one repair user message (no tools, separate API call).');
  const repairMessages: RequestOrdersChatMessage[] = [
    ...args.messages,
    { role: 'assistant', content: args.unparseableContent },
    {
      role: 'user',
      content: buildRepairRequestMessage(args.repairGates),
    },
  ];
  const repairMaxTokens = resolveOrderFlowMaxTokens();
  const repairResponse = await postOrdersChatRequest({
    post: postOpenRouterChatWithTimeoutAndRetry,
    key: args.key,
    modelId: args.modelId,
    baseBody: {
      model: args.modelId,
      messages: repairMessages,
      max_tokens: repairMaxTokens,
      ...(sendNoneToolChoice ? { tool_choice: 'none' } : {}),
    },
    settings: requestSettings,
    attachResponseFormat: true,
    signal: args.signal,
    onLog,
    requestLabel: 'requestOrders repair',
  });
  if (!repairResponse.ok) {
    if (onLog && repairResponse.error) onLog(`Repair request failed: ${repairResponse.error}`, true);
    return null;
  }
  const repairText = repairResponse.bodyText;
  if (onLog) onLog('Repair API call completed; parsing repair JSON…');
  logResponsePreview('openRouter requestOrders repair: raw response body', repairText);
  const repairJson = JSON.parse(repairText) as {
    choices?: Array<{ message?: { content?: string | null } }>;
    usage?: { cost?: number; prompt_tokens?: number; completion_tokens?: number };
  };
  const repairHead = repairJson.choices?.[0] as { finish_reason?: string; native_finish_reason?: string } | undefined;
  if (repairHead?.finish_reason === 'length' || repairHead?.native_finish_reason === 'MAX_TOKENS') {
    logError('openRouter requestOrders repair: model output truncated at max_tokens (repair JSON may be incomplete)', {
      tacticalAiBattle: args.tacticalBattleId,
      repairMaxTokens,
      reasoningEffort: requestSettings.profile.effectiveReasoningEffort,
      finishReason: repairHead.finish_reason,
      nativeFinish: repairHead.native_finish_reason,
    });
  }
  usage.requestCost += repairJson.usage?.cost ?? 0;
  usage.totalInputTokens += repairJson.usage?.prompt_tokens ?? 0;
  usage.totalOutputTokens += repairJson.usage?.completion_tokens ?? 0;
  const repairContent = repairJson.choices?.[0]?.message?.content;
  if (typeof repairContent === 'string' && repairContent.trim()) {
    if (onLog) onLog(`Repair assistant text received (${repairContent.length} chars); parsing orders…`);
    return repairContent;
  }
  return null;
}
