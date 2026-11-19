/**
 * One commander's talk call.
 *
 * Purpose: Reads the match, asks the model once, and returns the parsed reply. It does not store messages.
 * When to use: A talk round, for a commander that is about to be consulted for orders.
 * Expected outcome: `spoke` when the reply parses, including a reply with empty lists. `silent` when there is nobody to write to, the call fails, or the reply does not parse. The usage cost is returned either way.
 * Exceptions: None. A transport failure and a thrown error resolve as `silent`.
 */

import { logDebug, logError } from '../../logger';
import { gameDbOps } from '../../gameDb/dbConnection';
import { readMatchId } from '../../gameDb/gameConfigKv';
import { getMatchGeneration } from '../../matchGeneration';
import { modelCallHitDeadline } from '../modelCallControl';
import { consultStillOnOpenMatch } from '../requestOrdersConsultationMarks';
import { recordConsultation, stepForConsult } from '../../recorder/matchRecordingEvents';
import { readSeatApiKey } from '../commanderKeyMemory';
import { createConsultTelemetry, logConsultTelemetrySummary, type ConsultTelemetry } from '../consultTelemetry';
import { addOrdersChatUsageToTotals, parseOrdersChatCompletion } from '../ordersChatCompletion';
import { postOrdersChatRequest, type OrdersChatRequestSettings } from '../ordersChatRequestHelpers';
import { BASELINE_ORDERS_REQUEST_PROFILE, type OrdersRequestProfile } from '../ordersRequestProfile';
import { resolveEffectiveOpenRouterCompletionMaxTokens } from '../openRouterCreditLimits';
import { isStructuredOutputsRejectedForModel } from '../openRouterModelCapabilities';
import type { OpenRouterChatTransport } from '../openRouterChatTransport';
import { logPromptPreview } from '../requestOrdersFlowSupport';
import type { RequestOrdersUsageTotals } from '../requestOrdersToolLoop';
import { aiIndexForSeatId, type AiSeatId } from '../../../shared/seatIds';
import type { TacticalBattleSnapshot } from '../../../shared/tacticalBattleTypes';
import { buildTalkSituationText, buildTalkSystemText } from './talkPrompt';
import { readTalkPromptInput } from './talkPromptInput';
import { parseTalkReply, type ParsedTalkReply } from './talkReply';
import { buildTalkReplyResponseFormat } from './talkReplySchema';

/**
 * Why a commander sent nothing.
 *
 * Contract: One of the six reasons. `no_recipients` means the reply may name no seat: no other seat is still in the match, or a battle's opponent is Neutral or has left.
 * When to use: A `silent` result.
 * Expected outcome: The reason the round records.
 * Exceptions: None.
 */
export type TalkSilenceReason = 'abstained' | 'failed' | 'timed_out' | 'unparsed' | 'cancelled' | 'no_recipients';

/**
 * The log line for how many messages one reply sent.
 *
 * Purpose: One message is singular. Every other count, including zero, stays plural.
 * When to use: The success log in `requestTalk`.
 * Expected outcome: `Sent 1 message.`, `Sent no messages.`, or `Sent N messages.`
 * Exceptions: None.
 */
export function sentMessagesLogLine(count: number): string {
  if (count === 1) return 'Sent 1 message.';
  if (count === 0) return 'Sent no messages.';
  return `Sent ${count} messages.`;
}

/**
 * What one talk call decided.
 *
 * Contract: `spoke` carries a parsed reply. `silent` carries a reason. Both carry the usage cost, which is 0 when the model was not called.
 * When to use: The talk round, which stores a `spoke` reply when the round closes.
 * Expected outcome: One of the two results.
 * Exceptions: None.
 */
export type TalkSeatResult =
  | { readonly kind: 'spoke'; readonly reply: ParsedTalkReply; readonly costUsd: number }
  | { readonly kind: 'silent'; readonly reason: TalkSilenceReason; readonly costUsd: number };

/**
 * The key, profile, and chat post a talk call uses.
 *
 * Contract: The same three dependencies `requestOrders` passes into the orders flow, limited to what a talk call needs.
 * When to use: The production wrapper and a test fake.
 * Expected outcome: One model call with that seat's key and profile.
 * Exceptions: None.
 */
export interface RequestTalkDeps {
  /**
   * Reads the legacy API key.
   *
   * Contract: The seat key is chosen from this value by `readSeatApiKey`.
   * When to use: At the start of the call.
   * Expected outcome: The stored key, or empty when none is set.
   * Exceptions: None.
   */
  readonly loadKey: () => string;
  /**
   * Posts one chat completion.
   *
   * Contract: The production transport, or a fake in tests. It does not throw for HTTP failures.
   * When to use: The single talk request.
   * Expected outcome: The transport result.
   * Exceptions: A thrown error is treated as a failed call.
   */
  readonly postOpenRouterChatWithTimeoutAndRetry: OpenRouterChatTransport;
  /**
   * Resolves the seat's request profile.
   *
   * Contract: Optional. Missing means the baseline profile.
   * When to use: Before the post, the same way the orders flow does.
   * Expected outcome: Reasoning, provider routing, and whether structured output is attached.
   * Exceptions: None.
   */
  readonly resolveOrdersRequestProfile?: (modelId: string, seatId: AiSeatId) => OrdersRequestProfile;
}

/**
 * Maps a failed transport to a silence reason.
 *
 * Purpose: A cancelled call and a timed-out call are not the same as a provider error.
 * When to use: When the post returns `ok: false`, and when the signal is already aborted.
 * Expected outcome: `cancelled`, `timed_out`, or `failed`.
 * Exceptions: None.
 */
function silenceReasonForTransport(error: string, signal?: AbortSignal): TalkSilenceReason {
  if (modelCallHitDeadline(signal)) return 'timed_out';
  if (signal?.aborted || error === 'Cancelled' || error.includes('AbortError')) return 'cancelled';
  if (error.toLowerCase().includes('timed out')) return 'timed_out';
  return 'failed';
}

/**
 * Asks one commander what to say and how it regards the other sides.
 *
 * Purpose: The talk stage is one chat completion with no tools and no repair.
 * When to use: Inside a talk round, before that commander's orders call.
 * Expected outcome: `no_recipients` without a model call when the reply may name no seat. Otherwise one post. A parsed object returns `spoke`. A consultation row with stage `talk` is written only when the model was called and the match is still the one this call started on.
 * Exceptions: None.
 */
export async function requestTalk(
  args: {
    readonly seatId: AiSeatId;
    readonly modelId: string;
    readonly turnNumber: number;
    readonly battle: TacticalBattleSnapshot | null;
    readonly signal?: AbortSignal;
    readonly onLog?: (line: string, isError?: boolean) => void;
  },
  deps: RequestTalkDeps
): Promise<TalkSeatResult> {
  logDebug('requestTalk requestTalk', { seatId: args.seatId, turnNumber: args.turnNumber, inBattle: args.battle !== null });
  const matchIdAtStart = readMatchId(gameDbOps);
  const generationAtStart = getMatchGeneration();
  const usage: RequestOrdersUsageTotals = { requestCost: 0, totalInputTokens: 0, totalOutputTokens: 0 };
  let telemetry: ConsultTelemetry | null = null;
  let outcome: TalkSeatResult = { kind: 'silent', reason: 'failed', costUsd: 0 };
  try {
    args.onLog?.('Talking to the other sides…');
    const prepared = readTalkPromptInput({ seatId: args.seatId, turnNumber: args.turnNumber, battle: args.battle });
    if (prepared.sideCodes.length === 0) {
      outcome = { kind: 'silent', reason: 'no_recipients', costUsd: 0 };
      args.onLog?.('Sent no messages.');
      return outcome;
    }
    const key = readSeatApiKey(args.seatId, deps.loadKey());
    if (!key) {
      logError('requestTalk requestTalk: no API key', { seatId: args.seatId });
      outcome = { kind: 'silent', reason: 'failed', costUsd: 0 };
      args.onLog?.('Sent no messages.', true);
      return outcome;
    }
    if (args.signal?.aborted) {
      outcome = { kind: 'silent', reason: 'cancelled', costUsd: 0 };
      args.onLog?.('Sent no messages.');
      return outcome;
    }
    const profile = deps.resolveOrdersRequestProfile?.(args.modelId, args.seatId) ?? BASELINE_ORDERS_REQUEST_PROFILE;
    telemetry = createConsultTelemetry({
      seatId: args.seatId,
      turnNumber: args.turnNumber,
      theater: args.battle ? 'tactical' : 'strategic',
      battleId: args.battle?.battleId ?? null,
      modelId: args.modelId,
      providerSort: profile.providerSort,
      usage,
    });
    const useSchema = profile.structuredOutputs && !isStructuredOutputsRejectedForModel(args.modelId);
    const settings: OrdersChatRequestSettings = {
      profile,
      responseFormat: useSchema ? buildTalkReplyResponseFormat(prepared.sideCodes, { includeAgreements: args.battle === null }) : null,
      telemetry,
    };
    const systemText = buildTalkSystemText(prepared.input.ownSideLabel, args.battle ? 'tactical' : 'strategic');
    const situationText = buildTalkSituationText(prepared.input);
    const aiIndex = aiIndexForSeatId(args.seatId) ?? 1;
    logPromptPreview('requestTalk: system prompt', systemText, { artifactKind: 'talk-system', aiIndex, previewWhenDisabled: false });
    logPromptPreview('requestTalk: user message', situationText, { artifactKind: 'talk-user', aiIndex, previewWhenDisabled: false });
    const chatResponse = await postOrdersChatRequest({
      post: deps.postOpenRouterChatWithTimeoutAndRetry,
      key,
      modelId: args.modelId,
      baseBody: {
        model: args.modelId,
        messages: [
          { role: 'system', content: systemText },
          { role: 'user', content: situationText },
        ],
        max_tokens: resolveEffectiveOpenRouterCompletionMaxTokens(profile.preferredCompletionMaxTokens),
      },
      settings,
      attachResponseFormat: useSchema,
      signal: args.signal,
      onLog: args.onLog,
      requestLabel: 'requestTalk',
    });
    if (!chatResponse.ok) {
      const reason = silenceReasonForTransport(chatResponse.error, args.signal);
      outcome = { kind: 'silent', reason, costUsd: usage.requestCost };
      args.onLog?.('Sent no messages.', reason === 'failed');
      return outcome;
    }
    const json = parseOrdersChatCompletion(chatResponse.bodyText);
    if (json) addOrdersChatUsageToTotals(usage, json.usage);
    const content = json?.choices?.[0]?.message?.content;
    const replyText = typeof content === 'string' ? content : '';
    const reply = replyText.length > 0
      ? parseTalkReply({
          replyText,
          ownSeatId: args.seatId,
          addressableSeatIds: prepared.addressableSeatIds,
          allowAgreements: args.battle === null,
        })
      : null;
    if (!reply) {
      outcome = { kind: 'silent', reason: 'unparsed', costUsd: usage.requestCost };
      args.onLog?.('Sent no messages.', true);
      return outcome;
    }
    outcome = { kind: 'spoke', reply, costUsd: usage.requestCost };
    args.onLog?.(sentMessagesLogLine(reply.messages.length));
    return outcome;
  } catch (err) {
    logError('requestTalk requestTalk: exception', { seatId: args.seatId, err });
    const reason = modelCallHitDeadline(args.signal) ? 'timed_out' : args.signal?.aborted ? 'cancelled' : 'failed';
    outcome = { kind: 'silent', reason, costUsd: usage.requestCost };
    args.onLog?.('Sent no messages.', reason === 'failed');
    return outcome;
  } finally {
    if (telemetry) {
      const telemetryOutcome = outcome.kind === 'spoke' ? 'finished' : outcome.reason === 'cancelled' ? 'cancelled' : outcome.reason === 'timed_out' ? 'wallClock' : 'failed';
      telemetry.setOutcome(telemetryOutcome);
      const summary = telemetry.summary();
      logConsultTelemetrySummary(summary);
      if (consultStillOnOpenMatch(matchIdAtStart, generationAtStart)) {
        recordConsultation({ step: stepForConsult(args.turnNumber, args.battle), stage: 'talk', summary });
      }
    }
  }
}
