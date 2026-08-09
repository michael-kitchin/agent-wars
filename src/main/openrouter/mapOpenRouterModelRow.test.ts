/**
 * Fixture tests for OpenRouter model row mapping.
 * Run with: node dist/main/openrouter/mapOpenRouterModelRow.test.js
 */

import assert from 'node:assert/strict';
import { mapOpenRouterModelRow } from './mapOpenRouterModelRow';

/**
 * Verifies a full metadata row maps into the IPC shape.

 * Purpose: Happy path for description, pricing strings, and reasoning fields.
 * When to use: After changing `mapOpenRouterModelRow`.
 * Expected outcome: All supported fields present and normalized.
 * Exceptions: None.
 */
function testFullMetadata(): void {
  const mapped = mapOpenRouterModelRow({
    id: 'openai/gpt-4',
    name: 'GPT-4',
    description: '  A capable model.  ',
    pricing: { prompt: '0.00003', completion: '0.00006' },
    reasoning: { default_effort: ' medium ', default_enabled: true, mandatory: false },
    architecture: { tokenizer: 'ignored' },
  });
  assert.deepEqual(mapped, {
    id: 'openai/gpt-4',
    name: 'GPT-4',
    description: 'A capable model.',
    pricing: { prompt: '0.00003', completion: '0.00006' },
    reasoning: { default_effort: 'medium', default_enabled: true, mandatory: false },
  });
}

/**
 * Verifies missing reasoning omits that subtree.

 * Purpose: Partial rows remain valid without inventing defaults.
 * When to use: After changing optional-field handling.
 * Expected outcome: No `reasoning` key when absent.
 * Exceptions: None.
 */
function testMissingReasoning(): void {
  const mapped = mapOpenRouterModelRow({
    id: 'x',
    pricing: { prompt: '0.1' },
  });
  assert.equal(mapped?.id, 'x');
  assert.deepEqual(mapped?.pricing, { prompt: '0.1' });
  assert.equal(mapped?.reasoning, undefined);
}

/**
 * Verifies numeric prices become string fields.

 * Purpose: OpenRouter may emit numbers; IPC stores decimal strings.
 * When to use: After changing price coercion.
 * Expected outcome: Stringified finite numbers on `pricing`.
 * Exceptions: None.
 */
function testNumericPrices(): void {
  const mapped = mapOpenRouterModelRow({
    id: 'n',
    pricing: { prompt: 0.000003, completion: 0.000015 },
  });
  assert.deepEqual(mapped?.pricing, { prompt: '0.000003', completion: '0.000015' });
}

/**
 * Verifies garbage pricing does not throw and omits unusable fields.

 * Purpose: Essential failure path for malformed nested pricing.
 * When to use: After changing defensive parsing.
 * Expected outcome: No pricing object when both fields are unusable; no throw.
 * Exceptions: None.
 */
function testGarbagePricing(): void {
  const mapped = mapOpenRouterModelRow({
    id: 'g',
    pricing: { prompt: 'nope', completion: {} },
  });
  assert.equal(mapped?.pricing, undefined);
  assert.equal(mapOpenRouterModelRow({ id: 'g2', pricing: 'bad' })?.pricing, undefined);
  assert.equal(mapOpenRouterModelRow({ id: 'g3', pricing: [1, 2] })?.pricing, undefined);
}

/**
 * Verifies rows without a usable id are rejected.

 * Purpose: Essential failure path so listModels skips junk entries.
 * When to use: After changing id validation.
 * Expected outcome: `null` for missing/empty/non-string ids.
 * Exceptions: None.
 */
function testMissingId(): void {
  assert.equal(mapOpenRouterModelRow(null), null);
  assert.equal(mapOpenRouterModelRow({}), null);
  assert.equal(mapOpenRouterModelRow({ id: '' }), null);
  assert.equal(mapOpenRouterModelRow({ id: 1 }), null);
}

/**
 * Runs mapper fixture tests.

 * Purpose: Node entrypoint for main-process test discovery.
 * When to use: `node dist/main/openrouter/mapOpenRouterModelRow.test.js`.
 * Expected outcome: Throws on failure; logs pass when all succeed.
 * Exceptions: Propagates assertion errors.
 */
function run(): void {
  testFullMetadata();
  testMissingReasoning();
  testNumericPrices();
  testGarbagePricing();
  testMissingId();
  console.log('mapOpenRouterModelRow.test.ts passed');
}

run();
