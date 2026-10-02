import { logDebug } from '../logger';
import type { OpenRouterModel } from '../../shared/ipc/openRouterTypes';
import {
  resolveEffectiveReasoningEffort,
  resolveRequestedReasoningEffort,
} from '../../shared/openRouterReasoningEffort';
import { OPENROUTER_ORDER_FLOW_COMPLETION_MAX_TOKENS } from './openRouterCreditLimits';
import { isStructuredOutputsDisabledByEnvironment, supportsStructuredOutputs } from './openRouterModelCapabilities';

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
   * When to use: Budget sizing and diagnostic logs.
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
   * Preferred `max_tokens` before the session credit clamp.
   *
   * Contract: At least the base order-flow budget; raised for high efforts when the model's output limit is known.
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
 * Expected outcome: No `reasoning`, no `response_format`, and the base order-flow budget.
 * Exceptions: None.
 */
export const BASELINE_ORDERS_REQUEST_PROFILE: OrdersRequestProfile = Object.freeze({
  reasoningEffort: null,
  effectiveReasoningEffort: null,
  structuredOutputs: false,
  preferredCompletionMaxTokens: OPENROUTER_ORDER_FLOW_COMPLETION_MAX_TOKENS,
});

/**
 * Budget multipliers for efforts that spend most of `max_tokens` on reasoning.
 *
 * Purpose: OpenRouter sizes reasoning as a share of `max_tokens` (about 95% for max/xhigh, 80% for high), so these
 * efforts need a larger ceiling to leave room for the JSON answer.
 * When to use: `scaleCompletionMaxTokensForReasoningEffort` only.
 * Expected outcome: Efforts not listed keep a multiplier of 1.
 * Exceptions: None.
 */
const REASONING_EFFORT_BUDGET_MULTIPLIERS: ReadonlyMap<string, number> = new Map([
  ['max', 4],
  ['xhigh', 4],
  ['high', 2],
]);

/**
 * Raises a completion budget for high reasoning efforts, capped by the model's output limit.
 *
 * Purpose: Keeps high-effort reasoning from consuming the whole budget and truncating the JSON answer.
 * When to use: When resolving a consultation's preferred `max_tokens`.
 * Expected outcome: `baseMaxTokens` when the effort has no multiplier or the model limit is unknown; otherwise
 * `max(base, min(base * multiplier, modelMax))`.
 * Exceptions: None.
 */
function scaleCompletionMaxTokensForReasoningEffort(
  baseMaxTokens: number,
  effort: string | null,
  modelMaxCompletionTokens: number | undefined
): number {
  const multiplier = effort === null ? 1 : (REASONING_EFFORT_BUDGET_MULTIPLIERS.get(effort) ?? 1);
  if (multiplier === 1 || modelMaxCompletionTokens === undefined) return baseMaxTokens;
  return Math.max(baseMaxTokens, Math.min(baseMaxTokens * multiplier, modelMaxCompletionTokens));
}

/**
 * Resolves the request profile for one consultation.
 *
 * Purpose: Combines cached model capabilities with the player's persisted reasoning choice.
 * When to use: Once per consultation, before the first chat request.
 * Expected outcome: The baseline (with the given base budget) for unknown models; otherwise a profile whose
 * reasoning effort is valid for the model and whose budget is scaled by the effective effort.
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
        preferredCompletionMaxTokens: scaleCompletionMaxTokensForReasoningEffort(
          baseCompletionMaxTokens,
          effectiveReasoningEffort,
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
    preferredCompletionMaxTokens: profile.preferredCompletionMaxTokens,
  });
  return profile;
}
