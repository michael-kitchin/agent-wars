/**
 * Source contracts for the shared terrain-legend row.
 * Run: `node dist/main/terrainLegendRowSourceContracts.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readRendererSource } from './testSupport/rendererSourceAssertions';

/**
 * Counts a substring in renderer source.
 *
 * Purpose: The legend extraction is correct only when the duplicated row styles collapsed to these counts.
 * When to use: The contract below.
 * Expected outcome: The number of non-overlapping occurrences.
 * Exceptions: None.
 */
function occurrenceCount(source: string, needle: string): number {
  return source.split(needle).length - 1;
}

test('terrain legend rows share swatch chrome and row layout', () => {
  const styles = readRendererSource('rendering', 'terrainVisualStyles.ts');
  const urban = readRendererSource('rendering', 'terrainLegendUrban.ts');
  const rubble = readRendererSource('rendering', 'terrainLegendRubble.ts');
  const fortified = readRendererSource('rendering', 'terrainLegendFortified.ts');
  const row = readRendererSource('rendering', 'terrainLegendRow.ts');
  for (const source of [styles, urban, rubble, fortified]) {
    assert.equal(occurrenceCount(source, "style.gap = '6px'"), 0);
    assert.equal(occurrenceCount(source, "'1px solid #d5deea'"), 0);
    assert.equal(occurrenceCount(source, 'appendLegendRow('), 1);
    assert.equal(occurrenceCount(source, 'applyLegendSwatchChrome('), 1);
  }
  assert.equal(occurrenceCount(row, "style.gap = '6px'"), 1);
  assert.equal(occurrenceCount(row, "'1px solid #d5deea'"), 1);
});
