/**
 * Guards tactical activation clearing strategic selection/hover so Fight→tactical stays selectable.
 *
 * The renderer is not compiled into `dist`, so these assert against its source text the same way
 * `tacticalPrefetchRestartContract.test.ts` does.
 * Run: `node dist/main/tacticalEntrySelectionChromeContract.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Reads a renderer source file relative to the repository root.
 *
 * Purpose: Keeps path plumbing out of the assertions.
 * When to use: Each case in this file.
 * Expected outcome: UTF-8 file contents.
 * Exceptions: Throws when the file has moved.
 */
function readRendererSource(...segments: string[]): string {
  return fs.readFileSync(path.resolve(process.cwd(), 'src', 'renderer', ...segments), 'utf8');
}

/**
 * Returns the balanced `{...}` block that follows the first occurrence of `marker`.
 *
 * Purpose: Scope assertions to one function body.
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

test('tactical activation clears strategic selection and hover after assigning the battle snapshot', () => {
  const source = readRendererSource('tactical', 'tacticalIpcHandlers.ts');
  const clearBody = extractBalancedBlockAfter(
    source,
    'function clearStrategicPlanningChromeAfterTacticalSnapshotAssigned'
  );
  assert.match(clearBody, /reconcileSelectionToCurrentState/);
  assert.match(clearBody, /hoverRoutePreview\s*=\s*null/);
  assert.match(clearBody, /cancelAnimationFrame/);
  assert.match(clearBody, /interruptedStrategicPlayback/);
  const flushIdx = clearBody.indexOf('flushResolutionPlaybackCompleteNotifyCallbacks');
  const gateIdx = clearBody.indexOf('if (interruptedStrategicPlayback)');
  assert.ok(flushIdx >= 0, 'interrupted strategic playback must still flush deferred consult notifies');
  assert.ok(gateIdx >= 0 && gateIdx < flushIdx, 'playback-complete flush must run only when strategic playback was interrupted');

  const applyBody = extractBalancedBlockAfter(source, 'export function tacticalRendererApplyStartBattleIpcResult');
  const assignIdx = applyBody.indexOf('assignBattleSnapshot');
  const clearIdx = applyBody.indexOf('clearStrategicPlanningChromeAfterTacticalSnapshotAssigned');
  assert.ok(assignIdx >= 0, 'start path must assign the battle snapshot');
  assert.ok(clearIdx >= 0, 'start path must clear strategic planning chrome');
  assert.ok(assignIdx < clearIdx, 'chrome clear must run after the tactical snapshot is assigned');

  const restoreBody = extractBalancedBlockAfter(source, 'export function tacticalRendererActivateRestoredBattleSnapshot');
  const restoreAssignIdx = restoreBody.indexOf('assignBattleSnapshot');
  const restoreClearIdx = restoreBody.indexOf('clearStrategicPlanningChromeAfterTacticalSnapshotAssigned');
  assert.ok(restoreAssignIdx >= 0, 'restore path must assign the battle snapshot');
  assert.ok(restoreClearIdx >= 0, 'restore path must clear strategic planning chrome');
  assert.ok(restoreAssignIdx < restoreClearIdx, 'chrome clear must run after the restored snapshot is assigned');
});
