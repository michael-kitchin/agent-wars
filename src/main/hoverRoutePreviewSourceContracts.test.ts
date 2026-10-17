import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readRendererSource } from './testSupport/rendererSourceAssertions';

/**
 * Counts a substring in renderer source.
 *
 * Purpose: The hover-preview extraction is correct only when the shared call sites collapsed to these counts.
 * When to use: The contract below.
 * Expected outcome: The number of non-overlapping occurrences.
 * Exceptions: None.
 */
function occurrenceCount(source: string, needle: string): number {
  return source.split(needle).length - 1;
}

test('hover support targeting uses one publisher and one stale-check field', () => {
  const source = readRendererSource('gameplay', 'hoverRoutePreviewRefresh.ts');
  assert.equal(occurrenceCount(source, 'buildGroupedSupportTargetingLinePreview('), 1);
  assert.equal(occurrenceCount(source, 'publishGroupedSupportTargetingPreview('), 5);
  assert.equal(occurrenceCount(source, 'seqAtStart:'), 1);
});
