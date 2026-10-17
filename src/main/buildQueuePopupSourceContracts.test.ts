import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readRendererSource } from './testSupport/rendererSourceAssertions';

/**
 * Counts a substring in renderer source.
 *
 * Purpose: The build-queue edit extraction is correct only when the shared restore stays and the failure strings do not duplicate.
 * When to use: The contract below.
 * Expected outcome: The number of non-overlapping occurrences.
 * Exceptions: None.
 */
function occurrenceCount(source: string, needle: string): number {
  return source.split(needle).length - 1;
}

test('build queue type and count edits share one submit helper', () => {
  const source = readRendererSource('gameplay', 'buildQueuePopup.ts');
  assert.equal(occurrenceCount(source, 'function submitBuildQueueEntryEdit'), 1);
  assert.equal(occurrenceCount(source, 'restoreRejectedBuildQueueControls('), 2);
  assert.equal(occurrenceCount(source, 'Failed to update build queue entry.'), 1);
  assert.equal(occurrenceCount(source, 'Failed to update build count.'), 1);
  assert.equal(occurrenceCount(source, 'Failed to remove build queue entry.'), 1);
});
