/**
 * Provider choice on an OpenRouter chat body.
 *
 * Run: `node dist/main/openRouter/openRouterProviderRouting.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyProviderSortToChatBody } from './openRouterProviderRouting';

/**
 * Reads `provider.sort` from a routed body.
 *
 * Purpose: The cases must show that nitro is never sent as a sort value.
 * When to use: After `applyProviderSortToChatBody`.
 * Expected outcome: The sort string, or undefined when the body has no `provider` object.
 * Exceptions: None.
 */
function providerSortOf(body: Record<string, unknown>): unknown {
  const provider = body.provider;
  if (provider === null || typeof provider !== 'object') return undefined;
  return (provider as { readonly sort?: unknown }).sort;
}

test('a provider choice sorts by that value, and nitro is a suffix or a throughput sort', () => {
  const throughput = applyProviderSortToChatBody({ model: 'm', max_tokens: 10 }, 'throughput');
  assert.equal(throughput.model, 'm');
  assert.deepEqual(throughput.provider, { sort: 'throughput' });

  const price = applyProviderSortToChatBody({ model: 'm', max_tokens: 10 }, 'price');
  assert.deepEqual(price.provider, { sort: 'price' });

  const nitro = applyProviderSortToChatBody({ model: 'm', max_tokens: 10 }, 'nitro');
  assert.equal(nitro.model, 'm:nitro');
  assert.equal('provider' in nitro, false);

  const suffixed = applyProviderSortToChatBody({ model: 'm:floor' }, 'nitro');
  assert.equal(suffixed.model, 'm:floor');
  assert.deepEqual(suffixed.provider, { sort: 'throughput' });

  const missingModel = applyProviderSortToChatBody({ max_tokens: 10 }, 'nitro');
  assert.equal('model' in missingModel, false);
  assert.deepEqual(missingModel.provider, { sort: 'throughput' });

  for (const routed of [throughput, price, nitro, suffixed, missingModel]) {
    assert.notEqual(providerSortOf(routed), 'nitro');
  }
});
