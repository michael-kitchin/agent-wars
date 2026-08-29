/**
 * Contract tests for opponent callback replace-all after an orders parse.
 * Run: `npm run build:main` then `node dist/main/openRouter/applyParsedOpponentCallbacks.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  closeGameDatabaseForTests,
  openGameDatabaseAtPathForTests,
  resetGameForNewMatch,
} from '../gameDb';
import { getSubscriptions, replaceSubscriptions } from '../callbackSubscriptions';
import { applyParsedOpponentCallbackSubscriptions } from './applyParsedOpponentCallbacks';

/**
 * Opens a temp SQLite DB so subscription writes hit a real schema.
 *
 * Purpose: Isolates replace-all / clear checks from the developer's game database.
 * When to use: Wrap every case that calls `replaceSubscriptions` or `applyParsedOpponentCallbackSubscriptions`.
 * Expected outcome: Fresh match schema; closed and deleted in `finally`.
 * Exceptions: None.
 */
function withTempDb(fn: () => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-apply-callbacks-'));
  const dbPath = path.join(dir, 't.sqlite');
  try {
    openGameDatabaseAtPathForTests(dbPath);
    resetGameForNewMatch();
    fn();
  } finally {
    closeGameDatabaseForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Seeds one opponent subscription so a later clear is observable.
 *
 * Purpose: Empty-array and omitted-field cases must actually delete stored rows, not no-op.
 * When to use: Inside `withTempDb` before `applyParsedOpponentCallbackSubscriptions`.
 * Expected outcome: `getSubscriptions('opponent')` has one `turns` row.
 * Exceptions: None.
 */
function seedOpponentTurnsSubscription(): void {
  replaceSubscriptions('opponent', [{ event: 'turns', params: { n: 3 } }], 10);
  assert.equal(getSubscriptions('opponent').length, 1, 'seed must persist a subscription');
}

test('empty callbacks array clears all opponent subscriptions', () => {
  withTempDb(() => {
    seedOpponentTurnsSubscription();
    const stored = applyParsedOpponentCallbackSubscriptions({
      callbacks: [],
      turnNumber: 11,
      battleSubUnitIds: null,
    });
    assert.equal(stored, 0);
    assert.equal(getSubscriptions('opponent').length, 0);
  });
});

test('omitted callbacks field clears all opponent subscriptions', () => {
  withTempDb(() => {
    seedOpponentTurnsSubscription();
    const stored = applyParsedOpponentCallbackSubscriptions({
      callbacks: undefined,
      turnNumber: 11,
      battleSubUnitIds: null,
    });
    assert.equal(stored, 0);
    assert.equal(getSubscriptions('opponent').length, 0);
  });
});

test('empty callbacks array clears subscriptions during a tactical consult', () => {
  withTempDb(() => {
    seedOpponentTurnsSubscription();
    const stored = applyParsedOpponentCallbackSubscriptions({
      callbacks: [],
      turnNumber: 11,
      battleSubUnitIds: new Set(['opp-parent:01']),
    });
    assert.equal(stored, 0);
    assert.equal(getSubscriptions('opponent').length, 0);
  });
});
