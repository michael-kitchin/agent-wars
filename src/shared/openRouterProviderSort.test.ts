/**
 * Provider-choice ids and the default for a missing value.
 *
 * Run: `node dist/shared/openRouterProviderSort.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_PROVIDER_SORT, PROVIDER_SORT_LABELS, providerSortOrDefault } from './openRouterProviderSort';

test('a known provider choice is kept and an unknown one becomes throughput', () => {
  assert.equal(providerSortOrDefault('latency'), 'latency');
  assert.equal(providerSortOrDefault(null), DEFAULT_PROVIDER_SORT);
  assert.equal(providerSortOrDefault('fast'), 'throughput');
  assert.equal(providerSortOrDefault(undefined), 'throughput');
  assert.equal(PROVIDER_SORT_LABELS.nitro, 'Priority Service (Nitro)');
});
