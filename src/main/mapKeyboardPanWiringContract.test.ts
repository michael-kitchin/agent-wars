/**
 * Guards renderer wiring for hold-to-continue keyboard map pan.
 *
 * The renderer is not executed by Node tests, so these assert against source text
 * the same way `tacticalPrefetchRestartContract.test.ts` does.
 * Run: `node dist/main/mapKeyboardPanWiringContract.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'fs';
import * as path from 'path';
import { getFunctionSource } from './testSupport/rendererSourceAssertions';

/**
 * Reads a source file under `src/` relative to the repository root.
 *
 * Purpose: Keeps path plumbing out of the assertions.
 * When to use: Each wiring contract in this file.
 * Expected outcome: UTF-8 file contents.
 * Exceptions: Throws when the file has moved.
 */
function readSrc(...segments: string[]): string {
  return fs.readFileSync(path.resolve(process.cwd(), 'src', ...segments), 'utf8');
}

test('initCore uses hold pan controller instead of one-shot panMapOneRes1Hex for WASD', () => {
  const initCore = readSrc('renderer', 'map', 'initCore.ts');
  assert.equal(
    initCore.includes('panMapOneRes1Hex'),
    false,
    'initCore must not call panMapOneRes1Hex directly'
  );
  assert.match(initCore, /panBindingToDirection/);
  assert.match(initCore, /panPhysicalKeyId/);
  assert.match(initCore, /mapPanKeyDown/);
  assert.match(initCore, /mapPanKeyUp/);
  assert.match(initCore, /clearMapKeyboardPan/);
});

test('initCore clears map pan on blur, focusin editable, and visibility hidden', () => {
  const initCore = readSrc('renderer', 'map', 'initCore.ts');
  assert.match(initCore, /addEventListener\('blur'/);
  assert.match(initCore, /addEventListener\('focusin'/);
  assert.match(initCore, /visibilitychange/);
  assert.match(initCore, /isEditableKeyboardTarget/);
  const blurIdx = initCore.indexOf("addEventListener('blur'");
  const blurSlice = initCore.slice(blurIdx, blurIdx + 400);
  assert.match(blurSlice, /clearMapKeyboardPan/);
});

test('main Leaflet map disables built-in keyboard pan', () => {
  const worldMap = readSrc('renderer', 'map', 'worldLeafletMap.ts');
  const mainMapIdx = worldMap.indexOf('mainMap = leafletRef.map');
  assert.ok(mainMapIdx >= 0, 'expected mainMap = leafletRef.map');
  const optionsBlock = worldMap.slice(mainMapIdx, mainMapIdx + 600);
  assert.match(optionsBlock, /keyboard:\s*false/);
});

test('panMapByNetAxes pans in screen pixels via panBy, not hex-north setView', () => {
  const helpers = readSrc('renderer', 'map', 'mapHelpers.ts');
  const fn = getFunctionSource(helpers, 'panMapByNetAxes');
  assert.match(fn, /netAxesToScreenPanDelta/);
  assert.match(fn, /keyboardPanModeSpeed/);
  assert.match(fn, /DETAIL_H3_RESOLUTION/);
  assert.match(fn, /WORLD_H3_RESOLUTION/);
  assert.match(fn, /panBy/);
  assert.match(fn, /animate:\s*false/);
  assert.equal(
    /setView/.test(fn),
    false,
    'keyboard pan must not snap the camera to a hex-north neighbor'
  );
  assert.equal(
    /keyboardPanReferenceZoom/.test(fn),
    false,
    'tactical pan must use a res-4 hex at the current zoom, not a scaled res-1 step'
  );
});
