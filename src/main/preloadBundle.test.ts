/**
 * The bundled preload script.
 *
 * Purpose: A sandboxed preload can require only `electron`, so the bundle must contain every shared channel string and no other `require`.
 * When to use: After changing `preload.ts`, the shared channel tables, or `scripts/build-preload.cjs`.
 * Expected outcome: The cases below read `dist/main/preload.js` after `npm run build:main`.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { IPC_GAME, IPC_OPENROUTER } from '../shared/ipc/channels';

/**
 * Reads the bundled preload.
 *
 * Purpose: Every case inspects the same built file.
 * When to use: The cases below.
 * Expected outcome: UTF-8 text of `dist/main/preload.js`.
 * Exceptions: Throws when the file is missing, which means the build did not run.
 */
function readBundle(): string {
  return fs.readFileSync(path.resolve(process.cwd(), 'dist', 'main', 'preload.js'), 'utf8');
}

test('the only module the bundled preload requires is electron', () => {
  const names = new Set<string>();
  for (const match of readBundle().matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)) names.add(match[1]!);
  assert.deepStrictEqual([...names], ['electron']);
});

test('the bundle inlines the shared channel tables', () => {
  const text = readBundle();
  for (const value of [...Object.values(IPC_GAME), ...Object.values(IPC_OPENROUTER)]) {
    assert.ok(text.includes(`"${value}"`) || text.includes(`'${value}'`), `channel ${value} is in the bundle`);
  }
});

test('the bundle exposes the bridge through contextBridge', () => {
  assert.ok(readBundle().includes('contextBridge.exposeInMainWorld'));
});
