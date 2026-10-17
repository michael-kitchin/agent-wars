import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { test } from 'node:test';
import type { App } from 'electron';
import { applyUserDataDirOverride, USER_DATA_DIR_ENV } from './userDataDirOverride';

/**
 * Records `setPath` calls in place of Electron's `app`.
 *
 * Purpose: The override must only touch `userData`, and only when asked.
 * When to use: Each test below.
 * Expected outcome: `calls` lists every `[name, value]` pair passed to `setPath`.
 * Exceptions: None.
 */
function fakeApp(): { app: App; calls: Array<[string, string]> } {
  const calls: Array<[string, string]> = [];
  const app = { setPath: (name: string, value: string) => calls.push([name, value]) } as unknown as App;
  return { app, calls };
}

test('applyUserDataDirOverride creates the folder and moves userData to it', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'user-data-override-test-'));
  try {
    const target = path.join(root, 'smoke-user-data');
    const { app, calls } = fakeApp();
    applyUserDataDirOverride(app, { [USER_DATA_DIR_ENV]: target });
    assert.deepEqual(calls, [['userData', target]]);
    assert.ok(fs.statSync(target).isDirectory());
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('applyUserDataDirOverride leaves userData alone when the variable is missing or blank', () => {
  const { app, calls } = fakeApp();
  applyUserDataDirOverride(app, {});
  applyUserDataDirOverride(app, { [USER_DATA_DIR_ENV]: '   ' });
  assert.deepEqual(calls, []);
});
