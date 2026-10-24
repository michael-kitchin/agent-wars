import type { OpenRouterModel } from '../../shared/ipc/openRouterTypes';
import { logDebug } from '../logger';
import { mapOpenRouterModelRow } from './mapOpenRouterModelRow';
import { isOpenRouterBatchModelId } from './openRouterBatchModelId';

/**
 * Turns raw OpenRouter `/models` `data` rows into the sorted list shown in the model selects.

 * Purpose: One place for map, drop unusable rows, drop batch slugs, and name sort so `listModels` stays a fetch wrapper.
 * When to use: After `json.data` is known to be an array (empty array if missing/non-array).
 * Expected outcome: `OpenRouterModel[]` with no nulls, no `:batch` ids, sorted by `(name ?? id)` case-insensitively. Emits `logDebug` with `{ rowCount, listedCount }`.
 * Exceptions: None. Malformed rows are omitted. Does not fetch.
 */
export function buildOpenRouterModelList(rows: unknown[]): OpenRouterModel[] {
  const models: OpenRouterModel[] = rows
    .map((row) => mapOpenRouterModelRow(row))
    .filter((model): model is OpenRouterModel => model !== null)
    .filter((model) => !isOpenRouterBatchModelId(model.id));
  models.sort((a, b) => {
    const nameA = (a.name ?? a.id).toLowerCase();
    const nameB = (b.name ?? b.id).toLowerCase();
    return nameA.localeCompare(nameB);
  });
  logDebug('openRouter buildOpenRouterModelList', {
    rowCount: rows.length,
    listedCount: models.length,
  });
  return models;
}
