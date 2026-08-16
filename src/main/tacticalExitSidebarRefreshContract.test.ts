/**
 * Guards tactical-exit wiring so strategic order sidebars refresh before Ready-equivalent continuation.
 *
 * The renderer is not compiled into `dist`, so these assert against its source text the same way
 * `tacticalPrefetchRestartContract.test.ts` does.
 * Run: `node dist/main/tacticalExitSidebarRefreshContract.test.js`
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
 * Purpose: Lets assertions scope to one function body instead of matching the whole file,
 * so unrelated occurrences elsewhere cannot mask a regression.
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

test('tacticalPerformBattleExit restores strategic drafts before sidebar refresh before Ready', () => {
  const source = readRendererSource('tactical', 'tacticalExitFlow.ts');
  const body = extractBalancedBlockAfter(source, 'export async function tacticalPerformBattleExit');
  const clearSnapIndex = body.indexOf('setBattleSnapshot(null)');
  const mapExitIndex = body.indexOf('exitTacticalMapView()');
  const snapshotIndex = body.indexOf('refreshStrategicSnapshotAfterExit');
  const restoreIndex = body.indexOf('restoreStrategicOrderDraftsAfterTacticalSession()');
  const refreshIndex = body.indexOf('refreshSidebarAfterTacticalDraftTeardown');
  const readyIndex = body.indexOf('runReadyAfterExit');
  assert.ok(clearSnapIndex >= 0, 'exit must drop the local tactical snapshot before applying post-exit strategic state');
  assert.ok(mapExitIndex >= 0, 'exit must leave tactical map view before applying the post-exit snapshot');
  assert.ok(snapshotIndex >= 0, 'exit must refresh strategic game state after main-process teardown');
  assert.ok(restoreIndex >= 0, 'exit must restore strategic order drafts from the stash');
  assert.ok(refreshIndex >= 0, 'exit must invoke the sidebar refresh callback after restore');
  assert.ok(readyIndex >= 0, 'exit must run Ready-equivalent continuation after refresh');
  assert.ok(
    clearSnapIndex < snapshotIndex,
    'applying getGameState while the local tactical snapshot is still set can restore the stash early via reconcile'
  );
  assert.ok(
    mapExitIndex < snapshotIndex,
    'applying getGameState before map exit can re-enter tacticalReleaseRendererSessionForNewStrategicMatch'
  );
  assert.ok(
    snapshotIndex < restoreIndex,
    'stash restore must see post-exit units so bailout-eliminated parents cannot keep ghost orders'
  );
  assert.ok(
    restoreIndex < refreshIndex,
    'refreshing before restore would paint empty shared ranged/air/ferry arrays cleared by teardown'
  );
  assert.ok(
    refreshIndex < readyIndex,
    'Ready must not run before the strategic sidebars reflect the restored stash'
  );
});

test('renderer performTacticalBattleExit wires sidebar refresh after draft teardown', () => {
  const source = readRendererSource('renderer.ts');
  const body = extractBalancedBlockAfter(source, 'async function performTacticalBattleExit');
  assert.match(body, /performTacticalBattleExitWithGameApi/);
  assert.match(body, /refreshSidebarAfterTacticalDraftTeardown/);
  assert.match(body, /hideStackCallout/);
  assert.match(body, /refreshStrategicOrderSidebars/);
  assert.match(body, /refreshStrategicSnapshotAfterExit/);
  assert.match(body, /getGameState/);
  assert.match(body, /applyGameStateSnapshot/);
  assert.match(body, /refreshStandingOrders:\s*false/);
});

test('restoreStrategicOrderDraftsAfterTacticalSession drops drafts for units missing from the strategic snapshot', () => {
  const source = readRendererSource('tactical', 'tacticalStrategicOrderUiStash.ts');
  const body = extractBalancedBlockAfter(source, 'export function restoreStrategicOrderDraftsAfterTacticalSession');
  assert.match(body, /restoreDraftRowsForLivingUnits/);
  assert.match(body, /S\.gameState/);
  assert.match(source, /livingUnitIds \? filterOrdersToLivingUnitIds/);
});

test('performTacticalBattleExitWithGameApi spreads caller IO before injecting endTacticalBattle', () => {
  const source = readRendererSource('tactical', 'tacticalEntryFlow.ts');
  const body = extractBalancedBlockAfter(source, 'export async function performTacticalBattleExitWithGameApi');
  const spreadIndex = body.indexOf('...io');
  const endIndex = body.indexOf('endTacticalBattle: window.gameApi?.endTacticalBattle');
  assert.ok(spreadIndex >= 0, 'wrapper must spread caller IO so refreshSidebarAfterTacticalDraftTeardown is not dropped');
  assert.ok(endIndex >= 0, 'wrapper must inject window.gameApi.endTacticalBattle');
  assert.ok(
    spreadIndex < endIndex,
    'endTacticalBattle must come after ...io so the live IPC binding always wins'
  );
});
