/**
 * The playthrough id stored beside the match id.
 *
 * Purpose: A fresh database has no playthrough, and a later store replaces the one that was created.
 * When to use: `npm run build:main`, then `node dist/main/gameDb/gameConfigKvPlaythrough.test.js`.
 * Expected outcome: The first ensure creates an id, the second returns it, and a store replaces it.
 * Exceptions: None. The temporary directory is removed afterward.
 */

import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { test } from 'node:test';
import { closeGameDatabaseForTests, openGameDatabaseAtPathForTests } from '../gameDb';
import { gameDbOps } from './dbConnection';
import { ensurePlaythroughId, readPlaythroughId, storeNewPlaythroughId } from './gameConfigKv';

test('a playthrough id is created once and then replaced', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-playthrough-'));
  try {
    openGameDatabaseAtPathForTests(path.join(dir, 't.sqlite'));
    assert.equal(readPlaythroughId(gameDbOps), null);
    const created = ensurePlaythroughId(gameDbOps);
    assert.equal(ensurePlaythroughId(gameDbOps), created);
    const replaced = storeNewPlaythroughId(gameDbOps);
    assert.notEqual(replaced, created);
    assert.equal(readPlaythroughId(gameDbOps), replaced);
  } finally {
    closeGameDatabaseForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
