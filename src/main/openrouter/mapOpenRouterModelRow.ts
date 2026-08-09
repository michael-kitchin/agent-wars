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
    if (
      reasoning.default_effort !== undefined ||
      reasoning.default_enabled !== undefined ||
      reasoning.mandatory !== undefined
    ) {
      model.reasoning = reasoning;
    }
  }

  return model;
}
