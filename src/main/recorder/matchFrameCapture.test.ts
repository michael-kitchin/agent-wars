/**
 * Frame snapshots.
 *
 * Purpose: A frame copies the match tables a later reader compares, and it never copies a machine-local config row.
 * When to use: `npm run build:main`, then `node dist/main/recorder/matchFrameCapture.test.js`.
 * Expected outcome: The seated tables are present, hexes are not, and capture of a fresh global match stays under two seconds.
 * Exceptions: None. The temporary directory is removed afterward.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gameDbOps } from '../gameDb/dbConnection';
import { MACHINE_LOCAL_CONFIG_KEYS } from '../gameDb/machineLocalConfigKeys';
import { upsertGameConfigValue } from '../gameDb/gameConfigRows';
import { buildFramePayload } from './matchFrameCapture';
import { withRegionVsRegionTempGameDb } from '../testSupport/withRegionVsRegionTempGameDb';
import { withTempGameDb } from '../testSupport/withTempGameDb';

test('a frame omits hexes and machine-local config rows', () => {
  withTempGameDb('aw-match-frame-', () => {
    // Test value. Not a credential.
    const sentinel = 'SENTINEL-KEY-12345';
    for (const key of MACHINE_LOCAL_CONFIG_KEYS) upsertGameConfigValue(gameDbOps, key, sentinel);
    const started = performance.now();
    const payload = buildFramePayload(gameDbOps);
    const elapsedMs = performance.now() - started;
    const names = Object.keys(payload.tables);
    assert.ok(names.includes('units'));
    assert.ok(names.includes('seats'));
    assert.ok(names.includes('turn_state'));
    assert.ok(names.includes('game_config'));
    assert.equal(names.includes('hexes'), false);
    const unitCount = Number(gameDbOps.getOne<{ n: number }>('SELECT COUNT(*) AS n FROM units')?.n);
    assert.equal(payload.tables.units?.rows.length, unitCount);
    assert.equal(payload.tables.units?.columns[0], 'id');
    const text = JSON.stringify(payload);
    assert.equal(text.includes(sentinel), false);
    assert.equal(text.includes('match_id'), true);
    assert.ok(elapsedMs < 2000, `frame capture took ${elapsedMs} ms`);
  });
});

test('a regional frame is measured the same way', () => {
  withRegionVsRegionTempGameDb(() => {
    const started = performance.now();
    const payload = buildFramePayload(gameDbOps);
    const elapsedMs = performance.now() - started;
    assert.ok(elapsedMs < 2000, `regional frame capture took ${elapsedMs} ms`);
    assert.ok(payload.tables.units);
  });
});
