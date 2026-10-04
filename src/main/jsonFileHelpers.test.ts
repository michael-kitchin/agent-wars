/**
 * Contract tests for `readJsonFileOrThrow`. Run:
 * `node dist/main/jsonFileHelpers.test.js`
 */

import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { test } from 'node:test';
import { readJsonFileOrThrow } from './jsonFileHelpers';

test('readJsonFileOrThrow returns the parsed object for a valid JSON file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'json-file-helpers-'));
  const absPath = path.join(dir, 'pack.json');
  fs.writeFileSync(absPath, '{"ok":true,"n":2}', 'utf8');
  try {
    assert.deepEqual(readJsonFileOrThrow(absPath, 'jsonFileHelpers test valid'), { ok: true, n: 2 });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('readJsonFileOrThrow throws when the path is missing', () => {
  const missing = path.join(os.tmpdir(), 'json-file-helpers-missing', 'no-such-file.json');
  assert.throws(() => readJsonFileOrThrow(missing, 'jsonFileHelpers test missing'));
});
