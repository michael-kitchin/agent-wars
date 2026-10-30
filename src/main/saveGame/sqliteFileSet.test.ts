/**
 * SQLite journal-file deletion.
 *
 * Purpose: Proves the shared delete removes a database and the two files beside it.
 * When to use: `npm test`.
 * Expected outcome: Present files disappear. A missing set does not throw.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { test } from 'node:test';
import { deleteSqliteFileSet } from './sqliteFileSet';

test('deleteSqliteFileSet removes the database and both journal files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-sqlite-set-'));
  const filePath = path.join(dir, 'match.db');
  try {
    fs.writeFileSync(filePath, 'db');
    fs.writeFileSync(`${filePath}-wal`, 'wal');
    fs.writeFileSync(`${filePath}-shm`, 'shm');
    deleteSqliteFileSet(filePath, { quiet: false, failureLogMessage: 'test delete failed' });
    assert.equal(fs.existsSync(filePath), false);
    assert.equal(fs.existsSync(`${filePath}-wal`), false);
    assert.equal(fs.existsSync(`${filePath}-shm`), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('deleteSqliteFileSet does not throw when none of the files exist', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-sqlite-set-'));
  const filePath = path.join(dir, 'missing.db');
  try {
    deleteSqliteFileSet(filePath, { quiet: false, failureLogMessage: 'test delete failed' });
    assert.equal(fs.existsSync(filePath), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
