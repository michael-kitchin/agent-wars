/**
 * Fixture tests for OpenRouter model-list assembly (map, drop batch, sort).
 * Run with: node dist/main/openRouter/buildOpenRouterModelList.test.js
 */

import assert from 'node:assert/strict';
import { buildOpenRouterModelList } from './buildOpenRouterModelList';

/**
 * Verifies batch and junk rows are omitted and remaining rows keep name sort.

 * Purpose: Happy path for the list shown in the model selects.
 * When to use: After changing `buildOpenRouterModelList` filtering or sort.
 * Expected outcome: Interactive and `:free` ids only, in `(name ?? id)` case-insensitive order.
 * Exceptions: None.
 */
function testDropsBatchAndJunkAndSorts(): void {
  const listed = buildOpenRouterModelList([
    { id: 'zeta/model:batch', name: 'AAA Batch' },
    { id: 'zeta/other:BATCH', name: 'AAA Other' },
    { id: 'keep/free:free', name: 'Free Keep' },
    { id: 'keep/beta', name: 'Beta Keep' },
    { id: 'alpha/plain' },
    { id: '' },
    null,
    { name: 'no id' },
  ]);
  assert.deepEqual(
    listed.map((m) => m.id),
    ['alpha/plain', 'keep/beta', 'keep/free:free']
  );
}

/**
 * Verifies an empty `data` array yields an empty list.

 * Purpose: `listModels` already substitutes `[]` when `json.data` is missing or non-array.
 * When to use: After changing empty-input handling.
 * Expected outcome: `[]`.
 * Exceptions: None.
 */
function testEmptyRows(): void {
  assert.deepEqual(buildOpenRouterModelList([]), []);
}

/**
 * Verifies a catalog of only batch slugs is a successful empty list.

 * Purpose: Filtering must not be treated as a fetch failure.
 * When to use: After changing batch exclusion.
 * Expected outcome: `[]` with no throw.
 * Exceptions: None.
 */
function testAllBatchRows(): void {
  assert.deepEqual(
    buildOpenRouterModelList([
      { id: 'a/one:batch' },
      { id: 'b/two:BATCH' },
    ]),
    []
  );
}

/**
 * Runs list-builder fixture tests.

 * Purpose: Node entrypoint for main-process test discovery.
 * When to use: `node dist/main/openRouter/buildOpenRouterModelList.test.js`.
 * Expected outcome: Throws on failure; logs pass when all succeed.
 * Exceptions: Propagates assertion errors.
 */
function run(): void {
  testDropsBatchAndJunkAndSorts();
  testEmptyRows();
  testAllBatchRows();
  console.log('buildOpenRouterModelList.test.ts passed');
}

run();
