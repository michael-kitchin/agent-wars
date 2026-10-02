/**
 * Guards the ordering contract that lets a deliberately cancelled AI planning request (Events toggle and similar) restart before the Ready latch is released.
 *
 * The renderer is not compiled into `dist`, so these assert against its source text the same way
 * `rendererConsolidation.test.ts` does.
 * Run: `node dist/main/tacticalPrefetchRestartContract.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Reads a renderer source file relative to the repository root.
 *
 * Purpose: Keeps the path plumbing out of the assertions themselves.
 * When to use: Each case in this file.
 * Expected outcome: File contents as UTF-8 text.
 * Exceptions: Throws when the file has moved, which is the signal to update this guard.
 */
function readRendererSource(...segments: string[]): string {
  return fs.readFileSync(path.resolve(process.cwd(), 'src', 'renderer', ...segments), 'utf8');
}

/**
 * Returns the balanced `{...}` block that follows the first occurrence of `marker`.
 *
 * Purpose: Lets assertions scope to one branch or function body instead of matching the whole file,
 * so unrelated occurrences elsewhere cannot mask a regression.
 * When to use: With a marker unique enough to identify the branch under test.
 * Expected outcome: The block text including its outer braces.
 * Exceptions: Throws when the marker is absent or the block never closes.
 */
function extractBalancedBlockAfter(source: string, marker: string): string {
  const markerIndex = source.indexOf(marker);
  assert.ok(markerIndex >= 0, `expected to find ${marker}`);
  const openBrace = source.indexOf('{', markerIndex);
  assert.ok(openBrace >= 0, `expected a block after ${marker}`);
  let depth = 0;
  for (let i = openBrace; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') depth -= 1;
    if (depth === 0) return source.slice(openBrace, i + 1);
  }
  throw new Error(`unterminated block after ${marker}`);
}

test('a cancelled prefetch restarts before the Ready latch is released', () => {
  const source = readRendererSource('openRouter', 'openRouterRuntime.ts');
  const branch = extractBalancedBlockAfter(source, "if (result.error === 'Cancelled')");
  const restartIndex = branch.indexOf('startBackgroundRequestIfAllowed(deps)');
  const unblockIndex = branch.indexOf('unblockPrecomputedAiPlanningAfterBackgroundFailure()');
  assert.ok(restartIndex >= 0, 'a cancelled prefetch must attempt a replacement request');
  assert.ok(unblockIndex >= 0, 'Ready must still be released when no replacement request starts');
  assert.ok(
    restartIndex < unblockIndex,
    'releasing the latch first installs an empty tactical draft, which makes the restart decline and leaves the beat with no opponent orders'
  );
  assert.match(
    branch,
    /if \(!S\.backgroundRequestInFlight\)/,
    'the latch may only be released when no replacement request actually started'
  );
});

test('releasing the Ready latch is what would suppress a restart', () => {
  const waiting = readRendererSource('openRouter', 'aiPlanningState.ts');
  assert.match(
    extractBalancedBlockAfter(waiting, 'export function isWaitingForPrecomputedAiOrders'),
    /S\.tacticalOpponentDraft === null/,
    'the tactical prefetch gate keys off a null opponent draft'
  );
  const precomputed = readRendererSource('openRouter', 'precomputedAiState.ts');
  assert.match(
    extractBalancedBlockAfter(precomputed, 'export function unblockPrecomputedAiPlanningAfterBackgroundFailure'),
    /S\.tacticalOpponentDraft = EMPTY_TACTICAL_OPPONENT_DRAFT/,
    'releasing the latch replaces that null draft, so it must not run before a restart attempt'
  );
});
