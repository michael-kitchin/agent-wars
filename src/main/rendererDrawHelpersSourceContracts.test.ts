/**
 * Source contracts for shared renderer drawing helpers.
 * Run: `node dist/main/rendererDrawHelpersSourceContracts.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readRendererSource } from './testSupport/rendererSourceAssertions';

/**
 * Counts a substring in renderer source.
 *
 * Purpose: The drawing extraction is correct only when the duplicated statements collapsed to these counts.
 * When to use: The contracts below.
 * Expected outcome: The number of non-overlapping occurrences.
 * Exceptions: None.
 */
function occurrenceCount(source: string, needle: string): number {
  return source.split(needle).length - 1;
}

test('closed polygon paths go through drawClosedPolygonPath', () => {
  const terrain = readRendererSource('rendering', 'terrainRendering.ts');
  const tactical = readRendererSource('rendering', 'tacticalBattleTerrainPaint.ts');
  const preview = readRendererSource('map', 'newGameMapPreviewRendering.ts');
  const home = readRendererSource('rendering', 'homeRegionBorderDrawing.ts');
  for (const source of [terrain, tactical, preview, home]) {
    assert.equal(occurrenceCount(source, 'if (i === 0) ctx.moveTo('), 0);
  }
  assert.equal(occurrenceCount(terrain, 'drawClosedPolygonPath(ctx, '), 2);
  assert.equal(occurrenceCount(tactical, 'drawClosedPolygonPath(ctx, '), 1);
  assert.equal(occurrenceCount(preview, 'drawClosedPolygonPath(ctx, '), 1);
  assert.equal(occurrenceCount(home, 'drawClosedPolygonPath(ctx, '), 2);
});

test('stack count badges share one font and one helper', () => {
  const units = readRendererSource('rendering', 'unitDrawing.ts');
  const paths = readRendererSource('rendering', 'pathDrawing.ts');
  assert.equal(occurrenceCount(units, 'function drawStackCountBadge('), 1);
  assert.equal(occurrenceCount(units, 'bold 13px system-ui, sans-serif'), 1);
  assert.equal(occurrenceCount(paths, 'bold 13px system-ui, sans-serif'), 0);
});

test('pending support lines share one segment builder', () => {
  const orders = readRendererSource('rendering', 'orderDrawing.ts');
  assert.equal(occurrenceCount(orders, 'segments.push('), 1);
  assert.equal(occurrenceCount(orders, 'drawPendingSupportOrderLines(ctx, '), 3);
});
