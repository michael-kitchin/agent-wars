/**
 * Contracts for the operation purpose helpers.
 *
 * Purpose: An operation with no purpose must read as a raid.
 * When to use: After changes to `operationPurpose`.
 * Expected outcome: Process exit 0.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isCampaignLift, operationPurposeOf } from './operationPurpose';

test('an operation with no purpose is a raid', () => {
  assert.equal(operationPurposeOf({}), 'raid');
  assert.equal(isCampaignLift({}), false);
});

test('a campaign purpose is a campaign lift', () => {
  assert.equal(operationPurposeOf({ purpose: 'campaign' }), 'campaign');
  assert.equal(isCampaignLift({ purpose: 'campaign' }), true);
  assert.equal(isCampaignLift({ purpose: 'raid' }), false);
});
