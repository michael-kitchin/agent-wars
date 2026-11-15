/**
 * The step key read fails closed.
 *
 * Purpose: A turn must still commit when the recorder cannot read the step.
 * When to use: `npm run build:main`, then `node dist/main/recorder/recorderStepKey.test.js`.
 * Expected outcome: A missing turn table returns null.
 * Exceptions: None. The temporary database is removed afterward.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gameDbOps } from '../gameDb/dbConnection';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { currentStepKey } from './recorderStepKey';

test('a missing turn table reads as no step', () => {
  withTempGameDb('aw-step-key-', () => {
    gameDbOps.run('DROP TABLE turn_state');
    assert.equal(currentStepKey(), null);
  });
});
