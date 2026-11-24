/**
 * Contracts for the stack callout's tab labels and remembered tab.
 *
 * Purpose: The labels are user-visible and documented, and the choice must reset on another hex.
 * When to use: After changes to `stackCalloutTabs`.
 * Expected outcome: Process exit 0.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextStackCalloutTab, SELECT_TAB_LABEL, TRANSPORT_TAB_LABEL } from './stackCalloutTabs';

test('the tabs are labeled Select and Transport', () => {
  assert.equal(SELECT_TAB_LABEL, 'Select');
  assert.equal(TRANSPORT_TAB_LABEL, 'Transport');
});

test('the tab choice is kept on the same hex and resets to Select on another', () => {
  assert.equal(nextStackCalloutTab({ remembered: { h3Index: null, tab: 'select' }, h3Index: 'hex-a' }), 'select');
  assert.equal(nextStackCalloutTab({ remembered: { h3Index: 'hex-a', tab: 'transport' }, h3Index: 'hex-a' }), 'transport');
  assert.equal(nextStackCalloutTab({ remembered: { h3Index: 'hex-a', tab: 'transport' }, h3Index: 'hex-b' }), 'select');
  assert.equal(nextStackCalloutTab({ remembered: { h3Index: 'hex-a', tab: 'select' }, h3Index: 'hex-a' }), 'select');
});
