/**
 * Guards the new-game map fit against later snapshots of the same match.
 *
 * The renderer is not executed by Node tests, so these assert against source text.
 * Run: `node dist/main/newGameMapExtent.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertMatches, getFunctionSource, readRendererSource } from './testSupport/rendererSourceAssertions';

test('extent sync uses the footprint decision and treats an omitted refit as false', () => {
  const sync = getFunctionSource(readRendererSource('map', 'mapExtent.ts'), 'syncMapExtentToSnapshot');
  assertMatches(sync, /shouldApplyLoadedMapExtent\(/, 'sync should use the shared footprint decision');
  assertMatches(sync, /options\?\.refit === true/, 'an omitted refit option should stay false');
});

test('later snapshots do not force another fit', () => {
  // The snapshot function's parameter type contains braces, so the source extractor stops before the body.
  const apply = readRendererSource('core', 'stateSnapshot.ts');
  assertMatches(apply, /syncMapExtentToSnapshot\(nextState\);/, 'snapshot apply should sync the loaded extent');
  assert.equal(
    /syncMapExtentToSnapshot\(\s*nextState\s*,/.test(apply),
    false,
    'snapshot apply should not force a refit'
  );
});

test('Start fits the loaded extent after tactical release and before the opening camera', () => {
  const start = getFunctionSource(readRendererSource('gameplay', 'newGame.ts'), 'registerNewGameButton');
  const releaseAt = start.indexOf('tacticalReleaseRendererSessionForNewStrategicMatch(state)');
  const cameraAt = start.indexOf('deps.applyInitialCameraForState(state)');
  const syncMatch = /syncMapExtentToSnapshot\s*\(\s*state\s*,\s*\{\s*refit:\s*true\s*\}\s*\)/.exec(start);
  assert.ok(releaseAt >= 0, 'Start should release the previous tactical view');
  assert.ok(cameraAt >= 0, 'Start should still apply the opening camera');
  assert.ok(syncMatch, 'Start should fit the loaded extent');
  assert.ok(syncMatch.index > releaseAt, 'the fit should run after tactical release');
  assert.ok(syncMatch.index < cameraAt, 'the fit should run before the opening camera');
});
