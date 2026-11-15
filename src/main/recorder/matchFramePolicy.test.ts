/**
 * The frame policy matches the open match schema.
 *
 * Purpose: A new table has to be classified in the same change that adds it.
 * When to use: `npm run build:main`, then `node dist/main/recorder/matchFramePolicy.test.js`.
 * Expected outcome: Every match table is in the policy, and every policy key is a real table.
 * Exceptions: None. The temporary directory is removed afterward.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gameDbOps } from '../gameDb/dbConnection';
import { MATCH_TABLE_RECORDING_POLICY } from './matchFramePolicy';
import { withTempGameDb } from '../testSupport/withTempGameDb';

test('every match table is classified', () => {
  withTempGameDb('aw-match-policy-', () => {
    const names = gameDbOps
      .getAll<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .map((row) => row.name);
    for (const name of names) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(MATCH_TABLE_RECORDING_POLICY, name),
        `${name} is missing. Add this table to MATCH_TABLE_RECORDING_POLICY as a frame table, or exclude it with a reason.`
      );
    }
    for (const name of Object.keys(MATCH_TABLE_RECORDING_POLICY)) {
      assert.ok(names.includes(name), `${name} is in the policy but not in the database`);
    }
    for (const [name, policy] of Object.entries(MATCH_TABLE_RECORDING_POLICY)) {
      if (policy.mode === 'excluded') assert.ok(policy.reason.trim().length > 0, name);
    }
  });
});
