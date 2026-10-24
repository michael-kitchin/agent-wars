import { logDebug } from '../logger';
import type { OpenRouterModel } from '../../shared/ipc/openRouterTypes';
import {
  resolveEffectiveReasoningEffort,
  resolveRequestedReasoningEffort,
} from '../../shared/openRouterReasoningEffort';
import type { SeatRecord } from '../../shared/seatRoster';
import { OPENROUTER_ORDER_FLOW_COMPLETION_MAX_TOKENS } from './openRouterCreditLimits';
import {
  getOpenRouterModelCapabilities,
  isStructuredOutputsDisabledByEnvironment,
  supportsStructuredOutputs,
  supportsToolCalling,
  supportsToolChoice,
} from './openRouterModelCapabilities';

/**
 * Per-consultation request settings derived from the model's capabilities and the player's reasoning choice.
 *
 * Purpose: Resolves once per consultation so every tool-loop round and the repair call send the same options.
 * When to use: Built by `resolveOrdersRequestProfile`; read by the order flow and `postOrdersChatRequest`.
 * Expected outcome: Immutable settings for one consultation.
 * Exceptions: None.
 */
export interface OrdersRequestProfile {
  /**
   * Effort to send as `reasoning.effort`, or `null` to send no `reasoning` field.
   *
   * Contract: Non-null only for a valid player override.
   * When to use: Building request bodies.
   * Expected outcome: The model default applies when `null`.
   * Exceptions: None.
   */
  readonly reasoningEffort: string | null;
  /**
   * Effort in force for this consultation: the override, otherwise the model default.
   *
   * Contract: `null` when neither an override nor a selectable default exists.
   * When to use: Diagnostic logs. It does not change `max_tokens`.
   * Expected outcome: Never sent to the API by itself.
   * Exceptions: None.
   */
  readonly effectiveReasoningEffort: string | null;
  /**
   * Whether the consultation sends the JSON-schema envelope.
   *
   * Contract: `false` for models missing from the capability cache, and for every model when
   * `AGENT_WARS_DISABLE_STRUCTURED_OUTPUTS` is set.
   * When to use: Deciding whether to attach `response_format` and the response-healing plugin.
   * Expected outcome: `true` only when `supported_parameters` lists `response_format` and `structured_outputs`
   * and `supportsStructuredOutputs` does not exclude the model.
   * Exceptions: None.
   */
  readonly structuredOutputs: boolean;
  /**
   * Whether the consultation may offer tools.
   *
   * Contract: `false` only when the cached model's `supported_parameters` omits `tools`; `true` for unknown models.
   * When to use: Before building the prompt and tool list.
   * Expected outcome: When `false`, the flow consults with no tool groups enabled and sends no `tools`.
   * Exceptions: None.
   */
  readonly toolCalling: boolean;
  /**
   * Whether requests may carry `tool_choice`.
   *
   * Contract: `false` only when the cached model's `supported_parameters` omits `tool_choice`; `true` for unknown
   * models.
   * When to use: Choosing each round's `tool_choice` and the repair call's `tool_choice: none`.
   * Expected outcome: When `false`, no `tool_choice` field is sent and the provider default applies.
   * Exceptions: None.
   */
  readonly toolChoice: boolean;
  /**
   * Preferred `max_tokens` before the session credit clamp.
   *
   * Contract: The model's advertised output limit when that limit is known; otherwise the base order-flow budget.
   * Reasoning effort does not change it.
   * When to use: Input to `resolveEffectiveOpenRouterCompletionMaxTokens` for every round and the repair call.
   * Expected outcome: Positive integer.
   * Exceptions: None.
   */
  readonly preferredCompletionMaxTokens: number;
}

/**
 * Profile used when the model's capabilities are unknown.
 *
 * Purpose: Unknown models get the same request bodies as before capability tuning existed.
 * When to use: When no profile resolver is wired, or the model is not in the capability cache.
 * Expected outcome: No `reasoning`, no `response_format`, tools and `tool_choice` assumed supported, and the base
 * order-flow budget.
 * Exceptions: None.
 */
export const BASELINE_ORDERS_REQUEST_PROFILE: OrdersRequestProfile = Object.freeze({
  reasoningEffort: null,
  effectiveReasoningEffort: null,
  structuredOutputs: false,
  toolCalling: true,
  toolChoice: true,
  preferredCompletionMaxTokens: OPENROUTER_ORDER_FLOW_COMPLETION_MAX_TOKENS,
});

/**
 * Chooses the completion ceiling from the model's advertised output limit.
 *
 * Purpose: Every reasoning level gets the same `max_tokens`, so a long final JSON is not cut off at the order-flow base.
 * When to use: When resolving a consultation's preferred `max_tokens`.
 * Expected outcome: The advertised limit, floored, when it is a finite positive number; otherwise `baseMaxTokens`.
 * Exceptions: None.
 */
function completionMaxTokensFromAdvertisedLimit(
  baseMaxTokens: number,
  modelMaxCompletionTokens: number | undefined
): number {
  if (
    modelMaxCompletionTokens === undefined ||
    !Number.isFinite(modelMaxCompletionTokens) ||
    modelMaxCompletionTokens <= 0
  ) {
    return baseMaxTokens;
  }
  return Math.floor(modelMaxCompletionTokens);
}

/**
 * Resolves the request profile for one consultation.
 *
 * Purpose: Combines cached model capabilities with the player's persisted reasoning choice.
 * When to use: Once per consultation, before the first chat request.
 * Expected outcome: The baseline (with the given base budget) for unknown models; otherwise a profile whose
 * reasoning effort is valid for the model and whose budget is the model's advertised output limit when known.
 * Exceptions: None.
 */
export function resolveOrdersRequestProfile(input: {
  readonly modelId: string;
  readonly model: OpenRouterModel | undefined;
  readonly persistedReasoningEffort: string;
  readonly baseCompletionMaxTokens: number;
}): OrdersRequestProfile {
  const { modelId, model, persistedReasoningEffort, baseCompletionMaxTokens } = input;
  const effectiveReasoningEffort = model ? resolveEffectiveReasoningEffort(model, persistedReasoningEffort) : null;
  const profile: OrdersRequestProfile = model
    ? {
        reasoningEffort: resolveRequestedReasoningEffort(model, persistedReasoningEffort),
        effectiveReasoningEffort,
        structuredOutputs: supportsStructuredOutputs(model),
        toolCalling: supportsToolCalling(model),
        toolChoice: supportsToolChoice(model),
        preferredCompletionMaxTokens: completionMaxTokensFromAdvertisedLimit(
          baseCompletionMaxTokens,
          model.top_provider?.max_completion_tokens
        ),
      }
    : { ...BASELINE_ORDERS_REQUEST_PROFILE, preferredCompletionMaxTokens: baseCompletionMaxTokens };
  logDebug('ordersRequestProfile resolveOrdersRequestProfile', {
    modelId,
    knownModel: model !== undefined,
    persistedReasoningEffort: persistedReasoningEffort || '(model default)',
    reasoningEffort: profile.reasoningEffort,
    effectiveReasoningEffort: profile.effectiveReasoningEffort,
    structuredOutputs: profile.structuredOutputs,
    structuredOutputsDisabledByEnvironment: isStructuredOutputsDisabledByEnvironment(),
    toolCalling: profile.toolCalling,
    toolChoice: profile.toolChoice,
    preferredCompletionMaxTokens: profile.preferredCompletionMaxTokens,
  });
  return profile;
}

/**
 * Resolves the request profile from one seat's commander.
 *
 * Purpose: Each commander uses its own model and effort. An effort the model does not support is dropped by the same rule as the app-wide setting.
 * When to use: Once per consultation, before the first chat request.
 * Expected outcome: A seat with no model gets the baseline profile. A known model uses that seat's effort.
 * Exceptions: None.
 */
export function resolveSeatOrdersRequestProfile(seat: SeatRecord): OrdersRequestProfile {
  const modelId = seat.commander?.modelId?.trim() ?? '';
  const effort = seat.commander?.reasoningEffort?.trim() ?? '';
  logDebug('ordersRequestProfile resolveSeatOrdersRequestProfile', { seatId: seat.seatId, hasModel: modelId.length > 0 });
  if (!modelId) return { ...BASELINE_ORDERS_REQUEST_PROFILE };
  return resolveOrdersRequestProfile({
    modelId,
    model: getOpenRouterModelCapabilities(modelId),
    persistedReasoningEffort: effort,
    baseCompletionMaxTokens: OPENROUTER_ORDER_FLOW_COMPLETION_MAX_TOKENS,
  });
}
