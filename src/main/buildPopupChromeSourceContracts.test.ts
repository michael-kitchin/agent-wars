/**
 * Source contracts for shared build and hire popup chrome.
 * Run: `node dist/main/buildPopupChromeSourceContracts.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readRendererSource } from './testSupport/rendererSourceAssertions';

/**
 * Counts a substring in renderer source.
 *
 * Purpose: The popup chrome extraction is correct only when the duplicated markup collapsed to these counts.
 * When to use: The contracts below.
 * Expected outcome: The number of non-overlapping occurrences.
 * Exceptions: None.
 */
function occurrenceCount(source: string, needle: string): number {
  return source.split(needle).length - 1;
}

test('build and hire popups share the close row and count input', () => {
  const popup = readRendererSource('gameplay', 'buildQueuePopup.ts');
  const multi = readRendererSource('gameplay', 'buildQueueMultiPopup.ts');
  const hire = readRendererSource('gameplay', 'hirePanel.ts');
  const wrapper = readRendererSource('gameplay', 'buildHirePopup.ts');
  const formatting = readRendererSource('gameplay', 'buildQueuePopupFormatting.ts');
  for (const source of [popup, multi, hire, wrapper]) {
    assert.equal(occurrenceCount(source, 'build-popup-close-row'), 0);
    assert.equal(occurrenceCount(source, 'ArrowLeft'), 0);
    assert.equal(occurrenceCount(source, 'build-count-input'), 0);
  }
  assert.equal(occurrenceCount(popup, 'createBuildPopupCloseRow('), 1);
  assert.equal(occurrenceCount(multi, 'createBuildPopupCloseRow('), 2);
  assert.equal(occurrenceCount(hire, 'createBuildPopupCloseRow('), 1);
  assert.equal(occurrenceCount(wrapper, 'createBuildPopupCloseRow('), 1);
  assert.equal(occurrenceCount(popup, 'createBuildCountInput('), 1);
  assert.equal(occurrenceCount(multi, 'createBuildCountInput('), 1);
  assert.equal(occurrenceCount(hire, 'createBuildCountInput('), 1);
  assert.equal(occurrenceCount(formatting, 'function createBuildPopupCloseRow('), 1);
  assert.equal(occurrenceCount(formatting, 'function createBuildCountInput('), 1);
  assert.equal(occurrenceCount(formatting, 'function readSanitizedBuildCount('), 1);
});
