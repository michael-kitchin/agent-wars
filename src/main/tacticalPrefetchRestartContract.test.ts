/**
 * Guards the match screen's planning contract: it starts and stops the commander pool and does not run its own consultation.
 *
 * The renderer is not compiled into `dist`, so these assert against its source text.
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
 * Purpose: Lets assertions scope to one function body instead of matching the whole file.
 * When to use: With a marker unique enough to identify the function under test.
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

test('the match screen starts and stops the commander pool', () => {
  const client = readRendererSource('openRouter', 'commanderPoolClient.ts');
  assert.match(client, /window\.gameApi\.startCommanderPlanning/);
  assert.match(client, /window\.gameApi\?\.stopCommanderPlanning/);
  assert.match(client, /window\.gameApi\.readCommanderPool/);
  const runtime = readRendererSource('openRouter', 'openRouterRuntime.ts');
  assert.doesNotMatch(runtime, /requestAiOrders/);
  assert.match(
    extractBalancedBlockAfter(runtime, 'export function startBackgroundRequestIfAllowed'),
    /startCommanderPlanningIfAllowed/
  );
  assert.match(
    extractBalancedBlockAfter(runtime, 'export async function stopOpponentPlanning'),
    /stopCommanderPlanningFromScreen/
  );
});

test('a finished strategic consult starts the battle opponent plan it had been holding', () => {
  const source = readRendererSource('openRouter', 'openRouterControls.ts');
  const listener = extractBalancedBlockAfter(source, 'registerPostResolutionConsultationListener');
  const applied = listener.indexOf("appendOpenRouterLog('Post-resolution consultation applied.'");
  const stale = listener.indexOf("appendOpenRouterLog('Ignored stale post-resolution consultation push.'");
  assert.ok(applied >= 0 && stale >= 0, 'both consult outcomes must stay in the strategic listener');
  for (const at of [applied, stale]) {
    const tail = listener.slice(at);
    const start = tail.indexOf('startTacticalOpponentPlanAfterStrategicConsult(deps)');
    const ready = tail.indexOf('deps.updateReadyButtonState()');
    assert.ok(start >= 0 && ready >= 0 && start < ready, tail.slice(0, 400));
  }
  assert.match(
    extractBalancedBlockAfter(source, 'function startTacticalOpponentPlanAfterStrategicConsult'),
    /if \(!S\.tacticalBattleSnapshot \|\| !S\.tacticalPhasePlanning\) return;/,
    'without a battle in planning, this must not start a request'
  );
});

test('Ready waits while a commander is planning', () => {
  const waiting = readRendererSource('openRouter', 'aiPlanningState.ts');
  assert.match(
    extractBalancedBlockAfter(waiting, 'export function isWaitingForPrecomputedAiOrders'),
    /anyCommanderIsPlanning\(\)/
  );
});
