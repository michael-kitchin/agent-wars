/**
 * Puts one commander's provider choice on an OpenRouter chat body.
 *
 * Purpose: Throughput, price, and latency sort hosts. Nitro asks for a priority host by a model-id suffix.
 * When to use: Immediately before each order-flow chat post, including a retry and the repair call.
 * Expected outcome: A shallow copy. No request sends `provider.sort` of `nitro`.
 * Exceptions: None.
 */

import { logDebug, logInfo } from '../logger';
import type { ProviderSortChoice } from '../../shared/openRouterProviderSort';

/**
 * The info line written when nitro cannot be applied as a model suffix.
 *
 * Purpose: A later reader can find the fallback in `debug.log` without reading the request.
 * When to use: The nitro branch that sorts by throughput instead.
 * Expected outcome: The same sentence for a suffixed id, an empty id, and a missing id.
 * Exceptions: None.
 */
const NITRO_SUFFIX_SKIPPED = 'openRouter provider routing: model id already has a suffix; sorting by throughput instead of nitro';

/**
 * Copies a chat body and applies one provider choice.
 *
 * Purpose: The stored choice has to reach OpenRouter without changing the body the tool loop still holds.
 * When to use: Inside `postOrdersChatRequest`, on the body about to be posted.
 * Expected outcome: `throughput`, `price`, and `latency` set `provider: { sort }` and leave `model` unchanged.
 *   `nitro` on a non-empty model id with no `:` sets `model` to that id plus `:nitro` and omits `provider`.
 *   Every other `nitro` input keeps `model` and sets `provider: { sort: 'throughput' }`.
 * Exceptions: None.
 */
export function applyProviderSortToChatBody(
  body: Readonly<Record<string, unknown>>,
  providerSort: ProviderSortChoice,
): Record<string, unknown> {
  const modelId = typeof body.model === 'string' ? body.model : null;
  logDebug('openRouterProviderRouting applyProviderSortToChatBody', { modelId, providerSort });
  if (providerSort !== 'nitro') return { ...body, provider: { sort: providerSort } };
  if (modelId !== null && modelId.length > 0 && !modelId.includes(':')) {
    const routed: Record<string, unknown> = { ...body, model: `${modelId}:nitro` };
    delete routed.provider;
    return routed;
  }
  logInfo(NITRO_SUFFIX_SKIPPED, { modelId });
  return { ...body, provider: { sort: 'throughput' } };
}
