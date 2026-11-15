import { logDebug, logInfo } from '../logger';
import type { ConsultFallbackKind, ConsultTelemetry } from './consultTelemetry';
import type { OpenRouterChatTransport, OpenRouterChatTransportResult } from './openRouterChatTransport';
import {
  isCacheBreakpointDroppedForModel,
  isRequiredToolChoiceRejectedForModel,
  isSituationMessagesJoinedForModel,
  isStructuredOutputsRejectedForModel,
  markCacheBreakpointDroppedForModel,
  markRequiredToolChoiceRejectedForModel,
  markSituationMessagesJoinedForModel,
  markStructuredOutputsRejectedForModel,
} from './openRouterModelCapabilities';
import {
  applySystemCacheBreakpoint,
  isCacheBreakpointRejection,
  isConsecutiveUserMessageRejection,
  joinOpeningUserMessages,
  modelUsesExplicitPromptCache,
} from './promptCacheBreakpoint';
import { applyProviderSortToChatBody } from './openRouterProviderRouting';
import type { OrdersRequestProfile } from './ordersRequestProfile';

/**
 * Request options shared by every chat request in one consultation.
 *
 * Purpose: Carries the resolved profile and the prepared `response_format` from the flow into the tool loop and the
 * repair call.
 * When to use: Built once per consultation in `requestOrdersFlow`.
 * Expected outcome: Immutable for the consultation.
 * Exceptions: None.
 */
export interface OrdersChatRequestSettings {
  /**
   * Reasoning, structured-output, and budget settings for the model.
   *
   * Contract: Resolved once per consultation.
   * When to use: Read by `postOrdersChatRequest` and by budget and truncation logs.
   * Expected outcome: Same profile for every round and the repair call.
   * Exceptions: None.
   */
  readonly profile: OrdersRequestProfile;
  /**
   * OpenRouter `response_format` to attach, or `null` to send none.
   *
   * Contract: Non-null only when the model supports structured outputs.
   * When to use: Read by `postOrdersChatRequest`.
   * Expected outcome: Attached, with the response-healing plugin, to requests whose caller passes
   * `attachResponseFormat: true`, unless the model rejected it this session.
   * Exceptions: None.
   */
  readonly responseFormat: Readonly<Record<string, unknown>> | null;
  /**
   * Consult recorder, or omitted in a test that only checks the request body.
   *
   * Contract: Optional. Production passes the consult's recorder.
   * When to use: Tool-choice and structured-output retries, and the transport payload.
   * Expected outcome: Those retries append a fallback. Each send records an attempt.
   * Exceptions: None.
   */
  readonly telemetry?: ConsultTelemetry;
}

/**
 * OpenRouter plugin that repairs malformed JSON in non-streaming responses on the server.
 *
 * Purpose: Fixes trailing commas, fences, and similar defects without a client repair round trip.
 * When to use: Attached together with `response_format`.
 * Expected outcome: Plugin id `response-healing`.
 * Exceptions: None.
 */
const RESPONSE_HEALING_PLUGIN = Object.freeze({ id: 'response-healing' });

/**
 * HTTP statuses that mean the provider rejected the structured-output parameters.
 *
 * Purpose: Only these trigger the retry without `response_format`; other failures are returned unchanged.
 * When to use: After a failed request that carried `response_format`.
 * Expected outcome: 400 (bad request), 404 (no provider accepts the parameters), 422 (unprocessable schema).
 * Exceptions: None.
 */
const STRUCTURED_OUTPUT_REJECTION_STATUSES: ReadonlySet<number> = new Set([400, 404, 422]);

/**
 * Reports whether a failed response is a provider refusing `tool_choice: required`.
 *
 * Purpose: That refusal is a different failure from a schema refusal, and stripping the schema does not fix it.
 * When to use: After a request that sent `tool_choice: required`.
 * Expected outcome: True when the status is a parameter rejection and the error text mentions `tool_choice`.
 * Exceptions: None.
 */
function isRequiredToolChoiceRejection(result: OpenRouterChatTransportResult): boolean {
  if (result.ok || result.status === undefined) return false;
  return STRUCTURED_OUTPUT_REJECTION_STATUSES.has(result.status) && /tool_choice/i.test(result.error);
}

/**
 * One retry inside the prepared send.
 *
 * Purpose: The cache-mark refusal and the consecutive-user refusal share one sequence of log, cancel, telemetry, mark, and resend.
 * When to use: The ordered rules for a prepared chat body.
 * Expected outcome: A rule that does not match leaves the result alone.
 * Exceptions: None.
 */
interface PreparedRetryRule {
  /**
   * Whether this failed result is the refusal this rule handles.
   *
   * Contract: True only for that provider error.
   * When to use: After a failed send, before the model is marked.
   * Expected outcome: False for a success or a different error.
   * Exceptions: None.
   */
  readonly rejects: (result: { readonly error?: string }) => boolean;
  /**
   * Whether this model already took this retry.
   *
   * Contract: True after `mark` for this model.
   * When to use: Before applying the rule again.
   * Expected outcome: A marked model is not retried for this rule.
   * Exceptions: None.
   */
  readonly isMarked: (modelId: string) => boolean;
  /**
   * Records that this model took this retry.
   *
   * Contract: Later requests for the model skip this rule.
   * When to use: After the cancellation check and before the resend.
   * Expected outcome: `isMarked` becomes true for this model.
   * Exceptions: None.
   */
  readonly mark: (modelId: string) => void;
  /**
   * Telemetry name for this retry.
   *
   * Contract: One consult fallback kind.
   * When to use: When the rule resends.
   * Expected outcome: The kind recorded for this refusal.
   * Exceptions: None.
   */
  readonly fallback: ConsultFallbackKind;
  /**
   * Info-log label for this retry.
   *
   * Contract: The label the previous inline log used.
   * When to use: When the rule resends.
   * Expected outcome: The same label as the inline retry it replaced.
   * Exceptions: None.
   */
  readonly logLabel: string;
  /**
   * Line shown to the commander for this retry.
   *
   * Contract: The sentence the previous `onLog` call used.
   * When to use: When the rule resends.
   * Expected outcome: The same sentence as the inline retry it replaced.
   * Exceptions: None.
   */
  readonly logLine: string;
}

/**
 * Prepared-send retries, in the order a provider can raise them.
 *
 * Purpose: A provider can reject the joined messages' cache mark only after the join, so the cache rule runs again last.
 * When to use: The prepared send, once per failed result.
 * Expected outcome: The cache drop, then the message join, then the cache drop again.
 * Exceptions: None.
 */
const PREPARED_RETRY_RULES: readonly PreparedRetryRule[] = [
  {
    rejects: isCacheBreakpointRejection,
    isMarked: isCacheBreakpointDroppedForModel,
    mark: markCacheBreakpointDroppedForModel,
    fallback: 'cacheBreakpointDropped',
    logLabel: 'ordersChatRequestHelpers postOrdersChatRequest: cache breakpoint rejected',
    logLine: 'Model rejected the prompt cache mark; retrying once without it.',
  },
  {
    rejects: isConsecutiveUserMessageRejection,
    isMarked: isSituationMessagesJoinedForModel,
    mark: markSituationMessagesJoinedForModel,
    fallback: 'situationMessagesJoined',
    logLabel: 'ordersChatRequestHelpers postOrdersChatRequest: consecutive user messages rejected',
    logLine: 'Model rejected two user messages; retrying once with the situation joined.',
  },
  {
    rejects: isCacheBreakpointRejection,
    isMarked: isCacheBreakpointDroppedForModel,
    mark: markCacheBreakpointDroppedForModel,
    fallback: 'cacheBreakpointDropped',
    logLabel: 'ordersChatRequestHelpers postOrdersChatRequest: cache breakpoint rejected after join',
    logLine: 'Model rejected the prompt cache mark; retrying once without it.',
  },
];

/**
 * Posts one order-flow chat request with the consultation's reasoning and structured-output settings.
 *
 * Purpose: One place that adds `reasoning`, `response_format`, and response healing, and recovers when a provider
 * rejects the schema.
 * When to use: Every tool-loop round, the final orders call, and the repair call.
 * Expected outcome: Adds `reasoning: { effort }` when the profile has an override. When `attachResponseFormat` is true,
 * `responseFormat` is set, and the model has not rejected it this session, adds `response_format` and the healing
 * plugin. If that request fails with 400, 404, or 422, retries once without those two fields. If a body still
 * carries `tool_choice: required` and the provider rejects that choice, retries once with `auto`. The order loop
 * sends `auto`, so that second retry is a recovery for a body that still asks for `required`. A model is marked only
 * when the retry that dropped the rejected option succeeds. These refusals reach `onLog` as ordinary lines and the
 * debug log at info level. Returns the transport result of the last request made.
 * Exceptions: None; transport failures resolve as `{ ok: false }`.
 */
export async function postOrdersChatRequest(args: {
  readonly post: OpenRouterChatTransport;
  readonly key: string;
  readonly modelId: string;
  readonly baseBody: Readonly<Record<string, unknown>>;
  readonly settings: OrdersChatRequestSettings;
  readonly attachResponseFormat: boolean;
  readonly signal?: AbortSignal;
  readonly onLog?: (line: string, isError?: boolean) => void;
  readonly requestLabel: string;
}): Promise<OpenRouterChatTransportResult> {
  const { post, key, modelId, baseBody, settings, attachResponseFormat, signal, onLog, requestLabel } = args;
  const reasoningEffort = settings.profile.reasoningEffort;
  const bodyWithReasoning: Record<string, unknown> =
    reasoningEffort === null ? { ...baseBody } : { ...baseBody, reasoning: { effort: reasoningEffort } };
  const requiredToolChoiceRejected = isRequiredToolChoiceRejectedForModel(modelId);
  const requestBody: Record<string, unknown> =
    requiredToolChoiceRejected && bodyWithReasoning.tool_choice === 'required'
      ? { ...bodyWithReasoning, tool_choice: 'auto' }
      : bodyWithReasoning;
  const useStructuredOutputs =
    attachResponseFormat && settings.responseFormat !== null && !isStructuredOutputsRejectedForModel(modelId);
  logDebug('ordersChatRequestHelpers postOrdersChatRequest', {
    requestLabel,
    modelId,
    reasoningEffort,
    attachResponseFormat,
    structuredOutputs: useStructuredOutputs,
    toolChoice: requestBody.tool_choice ?? null,
  });
  const send = (body: Record<string, unknown>): Promise<OpenRouterChatTransportResult> =>
    post({
      key,
      body: applyProviderSortToChatBody(body, settings.profile.providerSort),
      signal,
      onLog,
      requestLabel,
      telemetry: settings.telemetry,
    });

  /**
   * Sends one body, and when the provider refuses `tool_choice: required`, sends it again with `auto`.
   *
   * Purpose: Amazon Bedrock's Claude endpoint rejects OpenRouter's `required` translation even after the schema is gone.
   * When to use: The schema request, the plain request, and the schema-free retry.
   * Expected outcome: Marks the model only when the `auto` retry succeeds.
   * Exceptions: None.
   */
  const sendRecoveringToolChoice = async (
    body: Record<string, unknown>
  ): Promise<OpenRouterChatTransportResult> => {
    const result = await send(body);
    if (result.ok || body.tool_choice !== 'required' || !isRequiredToolChoiceRejection(result)) return result;
    logInfo('ordersChatRequestHelpers postOrdersChatRequest: required tool choice rejected', {
      requestLabel,
      modelId,
      status: result.status,
      error: result.error,
    });
    if (signal?.aborted) return { ok: false, error: 'Cancelled' };
    onLog?.('Model rejected a required tool call; retrying once with automatic tool choice.', false);
    settings.telemetry?.recordFallback('toolChoiceAuto');
    const retry = await send({ ...body, tool_choice: 'auto' });
    if (retry.ok) markRequiredToolChoiceRejectedForModel(modelId);
    return retry;
  };

  /**
   * Copies the body with the session's cache mark and, when needed, one opening user message.
   *
   * Purpose: The transcript the tool loop keeps is unchanged. Only this HTTP body carries the mark or the join.
   * When to use: Every send, including a schema retry.
   * Expected outcome: A google or anthropic model that has not rejected the mark gets it on the system message.
   * Exceptions: None.
   */
  const prepareCachedBody = (body: Record<string, unknown>): Record<string, unknown> => {
    const joined = isSituationMessagesJoinedForModel(modelId) ? joinOpeningUserMessages(body) : body;
    if (!modelUsesExplicitPromptCache(modelId) || isCacheBreakpointDroppedForModel(modelId)) return joined;
    return applySystemCacheBreakpoint(joined);
  };

  /**
   * Sends one body, then retries once for a cache-mark rejection and once for consecutive user messages.
   *
   * Purpose: Those two refusals are not schema refusals, and each is tried at most once.
   * When to use: The plain request, the schema request, and the schema-free retry.
   * Expected outcome: A cache rejection resends without the mark. A role rejection resends with the lead-in
   * on the first line of the situation and keeps the mark when the error did not mention it.
   * Exceptions: None. An aborted signal returns Cancelled before the next send.
   */
  const sendPrepared = async (body: Record<string, unknown>): Promise<OpenRouterChatTransportResult> => {
    let result = await sendRecoveringToolChoice(prepareCachedBody(body));
    for (const rule of PREPARED_RETRY_RULES) {
      if (result.ok || !rule.rejects(result) || rule.isMarked(modelId)) continue;
      logInfo(rule.logLabel, { requestLabel, modelId, error: result.error });
      if (signal?.aborted) return { ok: false, error: 'Cancelled' };
      onLog?.(rule.logLine, false);
      settings.telemetry?.recordFallback(rule.fallback);
      rule.mark(modelId);
      result = await sendRecoveringToolChoice(prepareCachedBody(body));
    }
    return result;
  };

  if (!useStructuredOutputs) return sendPrepared(requestBody);

  const withSchema = {
    ...requestBody,
    response_format: settings.responseFormat,
    plugins: [RESPONSE_HEALING_PLUGIN],
  };
  const first = await sendPrepared(withSchema);
  if (
    first.ok
    || first.status === undefined
    || !STRUCTURED_OUTPUT_REJECTION_STATUSES.has(first.status)
    || isCacheBreakpointRejection(first)
    || isConsecutiveUserMessageRejection(first)
  ) {
    return first;
  }
  logInfo('ordersChatRequestHelpers postOrdersChatRequest: structured output request rejected', {
    requestLabel,
    modelId,
    status: first.status,
    error: first.error,
  });
  if (signal?.aborted) return { ok: false, error: 'Cancelled' };
  onLog?.('Model rejected the structured JSON request; retrying once without it.', false);
  settings.telemetry?.recordFallback('structuredOutputDropped');
  const retry = await sendPrepared(requestBody);
  if (retry.ok) markStructuredOutputsRejectedForModel(modelId);
  return retry;
}
