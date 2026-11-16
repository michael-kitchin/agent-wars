/**
 * The attributed-loss record guard.
 *
 * Purpose: A reader accepts only an object with a known source and an owner map.
 * When to use: `npm run build:main`, then `node dist/shared/lossHistory.test.js`.
 * Expected outcome: A well-formed record passes. Other values do not.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isAttributedLossesRecord } from './lossHistory';

test('only an object with a known source and an owner map is a record', () => {
  assert.equal(isAttributedLossesRecord({ source: 'battleParents', byOwner: {} }), true);
  assert.equal(isAttributedLossesRecord({ source: 'strategicTurn', byOwner: { human: {} } }), true);
  assert.equal(isAttributedLossesRecord({ source: 'somewhere', byOwner: {} }), false);
  assert.equal(isAttributedLossesRecord({ source: 'tacticalBeat' }), false);
  assert.equal(isAttributedLossesRecord({ source: 'tacticalBeat', byOwner: [] }), false);
  assert.equal(isAttributedLossesRecord(null), false);
  assert.equal(isAttributedLossesRecord('text'), false);
});
