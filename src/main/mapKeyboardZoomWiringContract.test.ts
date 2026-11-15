/**
 * Guards the main-map zoom keys against the source that wires them.
 *
 * Purpose: The renderer is not executed by the Node tests, so the key order is checked as text.
 * When to use: `npm run build:main`, then `node dist/main/mapKeyboardZoomWiringContract.test.js`.
 * Expected outcome: The zoom decision sits after the repeat return and before the modifier gate, and the map uses the shared step.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { test } from 'node:test';

/**
 * Reads a source file under `src/`.
 *
 * Purpose: Keeps path plumbing out of the assertions.
 * When to use: Each assertion in this file.
 * Expected outcome: UTF-8 file contents.
 * Exceptions: Throws when the file has moved.
 */
function readSrc(...segments: string[]): string {
  return fs.readFileSync(path.resolve(process.cwd(), 'src', ...segments), 'utf8');
}

test('the zoom keys run after a repeated key is ignored and before the modifier gate', () => {
  const initCore = readSrc('renderer', 'map', 'initCore.ts');
  const repeatAt = initCore.indexOf('if (e.repeat) return;');
  const zoomAt = initCore.indexOf('mapZoomKeyStep(');
  const gateAt = initCore.indexOf('if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;');
  assert.ok(repeatAt >= 0 && zoomAt > repeatAt && gateAt > zoomAt);
  assert.equal(initCore.includes('zoomMainMapByKeyStep('), true);
  const map = readSrc('renderer', 'map', 'worldLeafletMap.ts');
  assert.equal(map.includes('MAP_KEYBOARD_ZOOM_STEP'), true);
});
