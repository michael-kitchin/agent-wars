import type { OpenRouterModel } from './ipc/openRouterTypes';

/**
 * Every reasoning effort the OpenRouter gateway accepts, highest first.
 *
 * Purpose: A model whose `reasoning.supported_efforts` is `null` accepts all of these.
 * When to use: Fallback list inside `listSelectableReasoningEfforts`.
 * Expected outcome: Frozen vendor strings in descending effort order.
 * Exceptions: None.
 */
export const OPENROUTER_GATEWAY_REASONING_EFFORTS: readonly string[] = Object.freeze([
  'max',
  'xhigh',
  'high',
  'medium',
  'low',
  'minimal',
  'none',
]);

/**
 * Lists the reasoning efforts the player may choose for a model.
 *
 * Purpose: One rule for the Model-tab dropdown and for main-process request validation.
 * When to use: Building the reasoning dropdown, or checking a persisted effort before sending it.
 * Expected outcome: `[]` when effort is not selectable (unknown model or no `supported_efforts`); the gateway
 * list when `supported_efforts` is `null`; otherwise the API list in API order. `none` is dropped when
 * reasoning is mandatory.
 * Exceptions: None.
 */
export function listSelectableReasoningEfforts(model: OpenRouterModel | undefined): readonly string[] {
  const reasoning = model?.reasoning;
  if (!reasoning || reasoning.supported_efforts === undefined) return [];
  const source = reasoning.supported_efforts ?? OPENROUTER_GATEWAY_REASONING_EFFORTS;
  return reasoning.mandatory === true ? source.filter((effort) => effort !== 'none') : [...source];
}

/**
 * Returns the model's default effort when the player could also select it.
 *
 * Purpose: The dropdown marks this option "(default)", and budget scaling uses it when there is no override.
 * When to use: After switching models, or when resolving the effective effort.
 * Expected outcome: The `default_effort` string when it is in the selectable list; otherwise `null`.
 * Exceptions: None.
 */
export function resolveDefaultReasoningEffort(model: OpenRouterModel | undefined): string | null {
  const defaultEffort = model?.reasoning?.default_effort;
  return defaultEffort !== undefined && listSelectableReasoningEfforts(model).includes(defaultEffort)
    ? defaultEffort
    : null;
}

/**
 * Validates a persisted player override against the model's selectable efforts.
 *
 * Purpose: Only a valid override is sent as `reasoning.effort`; `''` means "use the model default".
 * When to use: Building a request body, or restoring the dropdown selection.
 * Expected outcome: The trimmed effort when selectable; `null` for `''` or an effort the model does not offer.
 * Exceptions: None.
 */
export function resolveRequestedReasoningEffort(
  model: OpenRouterModel | undefined,
  persistedEffort: string
): string | null {
  const trimmed = persistedEffort.trim();
  return trimmed && listSelectableReasoningEfforts(model).includes(trimmed) ? trimmed : null;
}

/**
 * Returns the effort the model will actually use: the valid override, otherwise the model default.
 *
 * Purpose: Budget scaling and diagnostics need the effort in force even when nothing is sent.
 * When to use: Sizing `max_tokens` and logging consultation settings.
 * Expected outcome: An effort string, or `null` when neither an override nor a selectable default exists.
 * Exceptions: None.
 */
export function resolveEffectiveReasoningEffort(
  model: OpenRouterModel | undefined,
  persistedEffort: string
): string | null {
  return resolveRequestedReasoningEffort(model, persistedEffort) ?? resolveDefaultReasoningEffort(model);
}

/**
 * Reports whether the player has a real effort choice for the model.
 *
 * Purpose: The reasoning dropdown is disabled when there are fewer than two levels.
 * When to use: After rebuilding the dropdown options for a model.
 * Expected outcome: `true` when at least two efforts are selectable.
 * Exceptions: None.
 */
export function isReasoningEffortSelectable(model: OpenRouterModel | undefined): boolean {
  return listSelectableReasoningEfforts(model).length >= 2;
}
