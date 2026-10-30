/**
 * Contract tests for the build, hire, and stack-callout control tips.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildPopupCloseTooltipText,
  buildTabTooltipText,
  hireTabTooltipText,
  multiHexQueueRemoveTooltipText,
  singleHexQueueRemoveTooltipText,
  stackAddAllTooltipText,
  stackCalloutCloseTooltipText,
  stackRemoveAllTooltipText,
  stackSelectAllTooltipText,
  stackUnitToggleSelectedTooltipText,
  stackUnitToggleTooltipText,
  stackUnitToggleUnselectedTooltipText,
} from './popupControlTooltipText';

test('each popup control tip is its sentence', () => {
  assert.equal(buildPopupCloseTooltipText, 'Close this popup.');
  assert.equal(singleHexQueueRemoveTooltipText, 'Remove this row from the queue.');
  assert.equal(multiHexQueueRemoveTooltipText, 'Remove this row on every selected hex.');
  assert.equal(buildTabTooltipText, 'Show the build queue for this hex.');
  assert.equal(hireTabTooltipText, 'Show hiring for this hex.');
  assert.equal(stackCalloutCloseTooltipText, 'Close this list.');
  assert.equal(
    stackUnitToggleUnselectedTooltipText,
    'Select only this unit and close the list. Shift toggles it and leaves the list open.',
  );
  assert.equal(
    stackUnitToggleSelectedTooltipText,
    'Remove this unit from the selection and close the list. Shift toggles it and leaves the list open.',
  );
  assert.equal(stackSelectAllTooltipText, 'Select every unit you can select in this hex and close the list.');
  assert.equal(stackAddAllTooltipText, 'Add every unit you can select in this hex. The list stays open.');
  assert.equal(stackRemoveAllTooltipText, 'Remove every unit you can select in this hex. The list stays open.');
});

test('the row toggle tip follows whether the unit is selected', () => {
  assert.equal(stackUnitToggleTooltipText(false), stackUnitToggleUnselectedTooltipText);
  assert.equal(stackUnitToggleTooltipText(true), stackUnitToggleSelectedTooltipText);
});
