import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dbGetOne, dbRun } from '../gameDb';
import { deleteGameConfigRow, selectGameConfigValue, upsertGameConfigValue } from './gameConfigRows';
import { withTempGameDb } from '../testSupport/withTempGameDb';

const readOps = { getOne: dbGetOne };
const writeOps = { run: dbRun };

test('a config value can be written, replaced, and read back', () => {
  withTempGameDb('aw-config-rows-', () => {
    upsertGameConfigValue(writeOps, 'sample_key', 'first');
    assert.equal(selectGameConfigValue(readOps, 'sample_key'), 'first');
    upsertGameConfigValue(writeOps, 'sample_key', 'second');
    assert.equal(selectGameConfigValue(readOps, 'sample_key'), 'second');
  });
});

test('a missing config key reads as undefined, including after a delete', () => {
  withTempGameDb('aw-config-rows-missing-', () => {
    assert.equal(selectGameConfigValue(readOps, 'missing_key'), undefined);
    upsertGameConfigValue(writeOps, 'missing_key', 'present');
    deleteGameConfigRow(writeOps, 'missing_key');
    assert.equal(selectGameConfigValue(readOps, 'missing_key'), undefined);
  });
});
