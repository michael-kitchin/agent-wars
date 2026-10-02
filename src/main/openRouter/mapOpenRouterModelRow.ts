import type { OpenRouterModel } from '../../shared/ipc/openRouterTypes';

/**
 * Coerces an OpenRouter pricing field into a decimal string when finite.

 * Purpose: Normalizes string/number API prices into the IPC `OpenRouterModel` shape.
 * When to use: Inside `mapOpenRouterModelRow` when reading `pricing.prompt` / `completion`.
 * Expected outcome: Decimal string for finite values; `undefined` when missing/invalid.
 * Exceptions: None.
 */
function coercePriceString(value: unknown): string | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : undefined;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    return Number.isFinite(Number(trimmed)) ? trimmed : undefined;
  }
  return undefined;
}

/**
 * Keeps the trimmed non-empty strings of an API string list.
 *
 * Purpose: OpenRouter lists (`supported_parameters`, `reasoning.supported_efforts`) may contain junk entries.
 * When to use: Inside `mapOpenRouterModelRow` for vendor string arrays.
 * Expected outcome: Strings in their original order; `undefined` when the value is not an array.
 * Exceptions: None.
 */
function coerceStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/**
 * Coerces a positive finite token limit into an integer.
 *
 * Purpose: Provider limits arrive as numbers that may be missing, zero, or fractional.
 * When to use: Inside `mapOpenRouterModelRow` for `top_provider.max_completion_tokens`.
 * Expected outcome: Floored positive integer; `undefined` when unusable.
 * Exceptions: None.
 */
function coercePositiveTokenLimit(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const floored = Math.floor(value);
  return floored > 0 ? floored : undefined;
}

/**
 * Maps one raw OpenRouter `/models` row into the IPC model shape.

 * Purpose: Defensive parsing so listModels never throws on messy provider JSON.
 * When to use: When transforming each element of the models list `data` array.
 * Expected outcome: `OpenRouterModel` when `id` is a string; `null` when the row is unusable.
 * Exceptions: None (malformed nested objects are omitted rather than thrown).
 */
export function mapOpenRouterModelRow(raw: unknown): OpenRouterModel | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.id !== 'string' || !row.id) return null;

  const model: OpenRouterModel = { id: row.id };

  if (typeof row.name === 'string' && row.name.trim()) {
    model.name = row.name;
  }

  if (typeof row.description === 'string') {
    const description = row.description.trim();
    if (description) model.description = description;
  }

  if (row.pricing && typeof row.pricing === 'object' && !Array.isArray(row.pricing)) {
    const pricingRaw = row.pricing as Record<string, unknown>;
    const prompt = coercePriceString(pricingRaw.prompt);
    const completion = coercePriceString(pricingRaw.completion);
    if (prompt !== undefined || completion !== undefined) {
      model.pricing = {};
      if (prompt !== undefined) model.pricing.prompt = prompt;
      if (completion !== undefined) model.pricing.completion = completion;
    }
  }

  if (row.reasoning && typeof row.reasoning === 'object' && !Array.isArray(row.reasoning)) {
    const reasoningRaw = row.reasoning as Record<string, unknown>;
    const reasoning: NonNullable<OpenRouterModel['reasoning']> = {};
    if (reasoningRaw.default_effort !== undefined && reasoningRaw.default_effort !== null) {
      const effort = String(reasoningRaw.default_effort).trim();
      if (effort) reasoning.default_effort = effort;
    }
    if (typeof reasoningRaw.default_enabled === 'boolean') {
      reasoning.default_enabled = reasoningRaw.default_enabled;
    }
    if (typeof reasoningRaw.mandatory === 'boolean') {
      reasoning.mandatory = reasoningRaw.mandatory;
    }
    const supportedEfforts =
      reasoningRaw.supported_efforts === null ? null : coerceStringList(reasoningRaw.supported_efforts);
    if (
      reasoning.default_effort !== undefined ||
      reasoning.default_enabled !== undefined ||
      reasoning.mandatory !== undefined ||
      supportedEfforts !== undefined
    ) {
      model.reasoning =
        supportedEfforts === undefined ? reasoning : { ...reasoning, supported_efforts: supportedEfforts };
    }
  }

  const supportedParameters = coerceStringList(row.supported_parameters);
  const topProviderRaw =
    row.top_provider && typeof row.top_provider === 'object' && !Array.isArray(row.top_provider)
      ? (row.top_provider as Record<string, unknown>)
      : undefined;
  const maxCompletionTokens = coercePositiveTokenLimit(topProviderRaw?.max_completion_tokens);

  return {
    ...model,
    ...(supportedParameters && supportedParameters.length > 0 ? { supported_parameters: supportedParameters } : {}),
    ...(maxCompletionTokens !== undefined ? { top_provider: { max_completion_tokens: maxCompletionTokens } } : {}),
  };
}
