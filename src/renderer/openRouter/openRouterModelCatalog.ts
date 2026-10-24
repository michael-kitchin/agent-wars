import type { OpenRouterModel } from '../../shared/ipc/openRouterTypes';

/**
 * Models from the last successful list, keyed by id.
 *
 * Purpose: The Opponent tab and the commander popover share one list.
 * When to use: After `listModels` succeeds, and when a control needs one model.
 * Expected outcome: Empty until a list arrives. Cleared when a refresh fails.
 * Exceptions: None.
 */
const modelsById = new Map<string, OpenRouterModel>();

/**
 * Replaces the catalog with one model list.
 *
 * Purpose: A refresh must not keep models the gateway no longer returned.
 * When to use: After a successful `listModels`.
 * Expected outcome: Later lookups find only these models.
 * Exceptions: None.
 */
export function replaceOpenRouterModelCatalog(models: readonly OpenRouterModel[]): void {
  modelsById.clear();
  for (const model of models) modelsById.set(model.id, model);
}

/**
 * Drops every cached model.
 *
 * Purpose: A failed refresh must not describe a model from the previous list.
 * When to use: When `listModels` fails.
 * Expected outcome: Later lookups miss.
 * Exceptions: None.
 */
export function clearOpenRouterModelCatalog(): void {
  modelsById.clear();
}

/**
 * One cached model.
 *
 * Purpose: Reasoning options and the description tooltip need the gateway record.
 * When to use: With a model id from a select.
 * Expected outcome: The record, or undefined when the id is missing or the list has not loaded.
 * Exceptions: None.
 */
export function openRouterModelById(modelId: string): OpenRouterModel | undefined {
  return modelsById.get(modelId);
}
