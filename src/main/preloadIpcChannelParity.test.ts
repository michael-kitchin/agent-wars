/**
 * Guards preload-local IPC channel maps against drift from `src/shared/ipc/channels.ts`.
 * Run with: node dist/main/preloadIpcChannelParity.test.js
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { IPC_GAME, IPC_OPENROUTER } from '../shared/ipc/channels';

/**
 * Parses a `const NAME = { ... } as const` string map from preload source text.
 *
 * Purpose: Extract preload channel literals without importing preload (sandbox / Electron-only).
 * When to use: Parity tests comparing preload copies to shared channel maps.
 * Expected outcome: Record of key → channel string for simple `key: 'value'` entries.
 * Exceptions: Throws when the named const object cannot be found or yields no entries.
 */
function parsePreloadStringMap(source: string, constName: string): Record<string, string> {
  const startRe = new RegExp(`const\\s+${constName}\\s*=\\s*\\{`);
  const startMatch = startRe.exec(source);
  assert.ok(startMatch, `Expected const ${constName} in preload.ts`);
  const openIdx = source.indexOf('{', startMatch.index);
  assert.ok(openIdx >= 0, `Expected object body for ${constName}`);
  let depth = 0;
  let endIdx = -1;
  for (let i = openIdx; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
  }
  assert.ok(endIdx > openIdx, `Unterminated object for ${constName}`);
  const body = source.slice(openIdx + 1, endIdx);
  const out: Record<string, string> = {};
  const entryRe = /^\s*([A-Za-z0-9_]+)\s*:\s*'([^']*)'\s*,?\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = entryRe.exec(body)) !== null) {
    out[m[1]!] = m[2]!;
  }
  assert.ok(Object.keys(out).length > 0, `Expected keys in ${constName}`);
  return out;
}

/**
 * Asserts shared and preload maps have identical keys and string values both directions.
 *
 * Purpose: Essential drift guard for sandboxed preload channel duplicates.
 * When to use: For `IPC_GAME` and `IPC_OPENROUTER`.
 * Expected outcome: Throws with a clear message on missing, extra, or mismatched values.
 * Exceptions: AssertionError on mismatch.
 */
function assertChannelMapParity(
  label: string,
  shared: Record<string, string>,
  preload: Record<string, string>
): void {
  const sharedKeys = Object.keys(shared).sort();
  const preloadKeys = Object.keys(preload).sort();
  assert.deepStrictEqual(preloadKeys, sharedKeys, `${label}: key sets must match`);
  for (const key of sharedKeys) {
    assert.equal(preload[key], shared[key], `${label}.${key} value mismatch`);
  }
}

/**
 * Runs preload vs shared IPC channel parity checks.
 *
 * Purpose: Node test entrypoint for main-process discovery.
 * When to use: `node dist/main/preloadIpcChannelParity.test.js`.
 * Expected outcome: Passes when preload maps match `channels.ts`; fails on drift.
 * Exceptions: Propagates assertion errors.
 */
function run(): void {
  const preloadPath = path.resolve(process.cwd(), 'src', 'main', 'preload.ts');
  const source = fs.readFileSync(preloadPath, 'utf8');
  const preloadGame = parsePreloadStringMap(source, 'IPC_GAME');
  const preloadOpenRouter = parsePreloadStringMap(source, 'IPC_OPENROUTER');
  assertChannelMapParity('IPC_GAME', { ...IPC_GAME }, preloadGame);
  assertChannelMapParity('IPC_OPENROUTER', { ...IPC_OPENROUTER }, preloadOpenRouter);
  console.log('preloadIpcChannelParity.test.ts passed');
}

run();
