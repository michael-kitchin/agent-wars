/**
 * Fixture tests for OpenRouter batch model id detection.
 * Run with: node dist/main/openRouter/openRouterBatchModelId.test.js
 */

import assert from 'node:assert/strict';
import { isOpenRouterBatchModelId } from './openRouterBatchModelId';

/**
 * Verifies ordinary `:batch` suffixes are treated as batch slugs.

 * Purpose: Happy path for the catalog form OpenRouter actually ships.
 * When to use: After changing `isOpenRouterBatchModelId`.
 * Expected outcome: `true` for lowercase `:batch` ids.
 * Exceptions: None.
 */
function testBatchSuffixIsExcluded(): void {
  assert.equal(isOpenRouterBatchModelId('anthropic/claude-sonnet-4.5:batch'), true);
  assert.equal(isOpenRouterBatchModelId('openai/gpt-4o:batch'), true);
}

/**
 * Verifies the suffix match ignores case.

 * Purpose: Catalog rows are currently lowercase; mixed-case must not leak into the dropdown.
 * When to use: After changing case folding in `isOpenRouterBatchModelId`.
 * Expected outcome: `true` for `:BATCH` and `:Batch`.
 * Exceptions: None.
 */
function testSuffixIsCaseInsensitive(): void {
  assert.equal(isOpenRouterBatchModelId('openai/gpt-4o:BATCH'), true);
  assert.equal(isOpenRouterBatchModelId('openai/gpt-4o:Batch'), true);
}

/**
 * Verifies interactive ids and non-batch suffixes stay.

 * Purpose: Essential keep cases so the filter does not over-match.
 * When to use: After changing the suffix rule.
 * Expected outcome: `false` for interactive twins, `:free`, `batch` as a name segment, `:batch-extra`, and empty string.
 * Exceptions: None.
 */
function testInteractiveAndOtherSuffixesAreKept(): void {
  assert.equal(isOpenRouterBatchModelId('anthropic/claude-sonnet-4.5'), false);
  assert.equal(isOpenRouterBatchModelId('anthropic/claude-sonnet-4.5:free'), false);
  assert.equal(isOpenRouterBatchModelId('provider/batch-foo'), false);
  assert.equal(isOpenRouterBatchModelId('provider/foo:batch-extra'), false);
  assert.equal(isOpenRouterBatchModelId(''), false);
}

/**
 * Runs predicate fixture tests.

 * Purpose: Node entrypoint for main-process test discovery.
 * When to use: `node dist/main/openRouter/openRouterBatchModelId.test.js`.
 * Expected outcome: Throws on failure; logs pass when all succeed.
 * Exceptions: Propagates assertion errors.
 */
function run(): void {
  testBatchSuffixIsExcluded();
  testSuffixIsCaseInsensitive();
  testInteractiveAndOtherSuffixesAreKept();
  console.log('openRouterBatchModelId.test.ts passed');
}

run();
