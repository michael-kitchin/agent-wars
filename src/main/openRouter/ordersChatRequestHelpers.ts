import { logDebug, logInfo } from '../logger';
import type { OpenRouterChatTransport, OpenRouterChatTransportResult } from './openRouterChatTransport';
import {
  isRequiredToolChoiceRejectedForModel,
  isStructuredOutputsRejectedForModel,
  markRequiredToolChoiceRejectedForModel,
  markStructuredOutputsRejectedForModel,
} from './openRouterModelCapabilities';
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
   * Expected outcome: Attached with the response-healing plugin unless the model rejected it this session.
   * Exceptions: None.
   */
  readonly responseFormat: Readonly<Record<string, unknown>> | null;
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
 * Posts one order-flow chat request with the consultation's reasoning and structured-output settings.
 *
 * Purpose: One place that adds `reasoning`, `response_format`, and response healing, and recovers when a provider
 * rejects the schema.
 * When to use: Every tool-loop round and the repair call.
 * Expected outcome: Adds `reasoning: { effort }` when the profile has an override. When `responseFormat` is set and
 * the model has not rejected it this session, adds `response_format` and the healing plugin. If that request fails
 * with 400, 404, or 422, retries once without those two fields. If a request that sent `tool_choice: required` fails
 * because the provider rejected that choice, retries once with `auto`. A model is marked only when the retry that
 * dropped the rejected option succeeds. Both refusals are common, so they reach `onLog` as ordinary lines and the
 * debug log at info level. Returns the transport result of the last request made.
 * Exceptions: None; transport failures resolve as `{ ok: false }`.
 */
export async function postOrdersChatRequest(args: {
  readonly post: OpenRouterChatTransport;
  readonly key: string;
  readonly modelId: string;
  readonly baseBody: Readonly<Record<string, unknown>>;
  readonly settings: OrdersChatRequestSettings;
  readonly signal?: AbortSignal;
  readonly onLog?: (line: string, isError?: boolean) => void;
  readonly requestLabel: string;
}): Promise<OpenRouterChatTransportResult> {
  const { post, key, modelId, baseBody, settings, signal, onLog, requestLabel } = args;
  const reasoningEffort = settings.profile.reasoningEffort;
  const bodyWithReasoning: Record<string, unknown> =
    reasoningEffort === null ? { ...baseBody } : { ...baseBody, reasoning: { effort: reasoningEffort } };
  const requiredToolChoiceRejected = isRequiredToolChoiceRejectedForModel(modelId);
  const requestBody: Record<string, unknown> =
    requiredToolChoiceRejected && bodyWithReasoning.tool_choice === 'required'
      ? { ...bodyWithReasoning, tool_choice: 'auto' }
      : bodyWithReasoning;
  const useStructuredOutputs = settings.responseFormat !== null && !isStructuredOutputsRejectedForModel(modelId);
  logDebug('ordersChatRequestHelpers postOrdersChatRequest', {
    requestLabel,
    modelId,
    reasoningEffort,
    structuredOutputs: useStructuredOutputs,
    toolChoice: requestBody.tool_choice ?? null,
  });
  const send = (body: Record<string, unknown>): Promise<OpenRouterChatTransportResult> =>
    post({ key, body, signal, onLog, requestLabel });

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
    onLog?.('Model rejected a required tool call; retrying once with automatic tool choice.', false);
    const retry = await send({ ...body, tool_choice: 'auto' });
    if (retry.ok) markRequiredToolChoiceRejectedForModel(modelId);
    return retry;
  };

  if (!useStructuredOutputs) return sendRecoveringToolChoice(requestBody);

  const withSchema = {
    ...requestBody,
    response_format: settings.responseFormat,
    plugins: [RESPONSE_HEALING_PLUGIN],
  };
  const first = await sendRecoveringToolChoice(withSchema);
  if (first.ok || first.status === undefined || !STRUCTURED_OUTPUT_REJECTION_STATUSES.has(first.status)) {
    return first;
  }
  logInfo('ordersChatRequestHelpers postOrdersChatRequest: structured output request rejected', {
    requestLabel,
    modelId,
    status: first.status,
    error: first.error,
  });
  onLog?.('Model rejected the structured JSON request; retrying once without it.', false);
  const retry = await sendRecoveringToolChoice(requestBody);
  if (retry.ok) markStructuredOutputsRejectedForModel(modelId);
  return retry;
}
