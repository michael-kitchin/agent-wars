import { logTrace } from '../logger';

/**
 * Reports whether an OpenRouter model id is a batch-only slug.

 * Purpose: Batch slugs are not usable for interactive commander chat, so the model list must omit them.
 * When to use: After a row has a usable string `id`, before the id is included in `listModels` output.
 * Expected outcome: `true` when the id ends with `:batch` using `String#toLowerCase`; `false` otherwise. Emits `logTrace` with `{ modelId }`.
 * Exceptions: None. Does not trim. Does not inspect display names.
 */
export function isOpenRouterBatchModelId(modelId: string): boolean {
  logTrace('openRouter isOpenRouterBatchModelId', { modelId });
  return modelId.toLowerCase().endsWith(':batch');
}
