/**
 * Contract tests for the knocked-out dialog copy.
 * Run: `node dist/shared/knockoutDialogCopy.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatHumanKnockoutDialog, type HumanKnockoutDialogInput } from './knockoutDialogCopy';

const base: HumanKnockoutDialogInput = {
  outByName: null,
  turnNumber: 12,
  place: 3,
  seatCount: 4,
  reasons: ['home_control'],
  everyHexRule: false,
  controlShareLabel: '90%',
};

test('the lead says other sides and Neutral hold the share of the home when no side is credited', () => {
  assert.equal(
    formatHumanKnockoutDialog(base).lead.includes("Other sides and Neutral hold 90% of your home's cities."),
    true
  );
});

test('the lead says other sides and Neutral hold all of the home under the every-hex fallback', () => {
  assert.equal(
    formatHumanKnockoutDialog({ ...base, everyHexRule: true }).lead.includes('Other sides and Neutral hold all of your home.'),
    true
  );
});

test('a credited side is named in the lead', () => {
  assert.equal(formatHumanKnockoutDialog({ ...base, outByName: 'W. Turkey' }).lead, 'W. Turkey knocked you out on turn 12.');
});
