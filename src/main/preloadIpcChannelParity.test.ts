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
 * Removes block and line comments from TypeScript source text.
 *
 * Purpose: Regex scans must not match channel names that only appear in comments.
 * When to use: Before the literal-channel and handler scans.
 * Expected outcome: The source with `/* ... *\/` blocks and `// ...` lines removed.
 * Exceptions: None.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/**
 * Asserts the preload names every channel through the channel tables.
 *
 * Purpose: A raw string such as `'game:newGame'` bypasses the table parity check, so a channel could drift unnoticed.
 * When to use: `run`.
 * Expected outcome: Passes when no `ipcRenderer` call takes a string literal as its channel.
 * Exceptions: AssertionError listing each literal call found.
 */
function assertNoLiteralChannels(source: string): void {
  const literalCall = /ipcRenderer\.(invoke|on|send|removeListener|removeAllListeners)\(\s*['"`][^'"`]*/g;
  const found = stripComments(source).match(literalCall) ?? [];
  assert.deepStrictEqual(found, [], 'preload.ts must use IPC_GAME / IPC_OPENROUTER keys, not string literals');
}

/**
 * Lists main-process source files that may register or send a channel.
 *
 * Purpose: The handler scan reads every main-process file except tests, the preload, and test support.
 * When to use: `assertEveryChannelHasMainHandler`.
 * Expected outcome: Absolute paths of `.ts` files under `src/main`.
 * Exceptions: Propagates file-system errors.
 */
function mainSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'testSupport') out.push(...mainSourceFiles(full));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') && entry.name !== 'preload.ts') {
      out.push(full);
    }
  }
  return out;
}

/**
 * Channels that main reaches by a path the handler scan cannot see.
 *
 * Purpose: Keeps the handler scan strict without widening its pattern.
 * When to use: `assertEveryChannelHasMainHandler`. Add a key here only with a one-line reason.
 * Expected outcome: Empty while every channel is registered or sent with a recognised call.
 * Exceptions: None.
 */
const HANDLED_ELSEWHERE: readonly string[] = [];

/**
 * Asserts main registers or sends every channel in the shared tables.
 *
 * Purpose: A channel with a preload entry and no main handler would fail only at runtime.
 * When to use: `run`.
 * Expected outcome: Passes when each `IPC_GAME` and `IPC_OPENROUTER` key appears in a handler registration or a send call under `src/main`.
 * Exceptions: AssertionError listing the channels with no handler.
 */
function assertEveryChannelHasMainHandler(): void {
  const used = new Set<string>();
  const callPattern = /(?:\.handle|\.on|\.send|registerLoggedIpcHandler)\(\s*(?:ipcMain\s*,\s*)?(IPC_GAME|IPC_OPENROUTER)\.(\w+)/g;
  for (const file of mainSourceFiles(path.resolve(process.cwd(), 'src', 'main'))) {
    const text = stripComments(fs.readFileSync(file, 'utf8'));
    let m: RegExpExecArray | null;
    while ((m = callPattern.exec(text)) !== null) used.add(`${m[1]}.${m[2]}`);
  }
  const missing: string[] = [];
  for (const key of Object.keys(IPC_GAME)) if (!used.has(`IPC_GAME.${key}`) && !HANDLED_ELSEWHERE.includes(`IPC_GAME.${key}`)) missing.push(`IPC_GAME.${key}`);
  for (const key of Object.keys(IPC_OPENROUTER)) {
    if (!used.has(`IPC_OPENROUTER.${key}`) && !HANDLED_ELSEWHERE.includes(`IPC_OPENROUTER.${key}`)) missing.push(`IPC_OPENROUTER.${key}`);
  }
  assert.deepStrictEqual(missing, [], 'every channel needs a main handler or send');
}

/**
 * Runs preload vs shared IPC channel parity checks.
 *
 * Purpose: Node test entrypoint for main-process discovery.
 * When to use: `node dist/main/preloadIpcChannelParity.test.js`.
 * Expected outcome: Passes when preload maps match `channels.ts`, the preload uses no literal channels, and main handles every channel; fails on drift.
 * Exceptions: Propagates assertion errors.
 */
function run(): void {
  const preloadPath = path.resolve(process.cwd(), 'src', 'main', 'preload.ts');
  const source = fs.readFileSync(preloadPath, 'utf8');
  const preloadGame = parsePreloadStringMap(source, 'IPC_GAME');
  const preloadOpenRouter = parsePreloadStringMap(source, 'IPC_OPENROUTER');
  assertChannelMapParity('IPC_GAME', { ...IPC_GAME }, preloadGame);
  assertChannelMapParity('IPC_OPENROUTER', { ...IPC_OPENROUTER }, preloadOpenRouter);
  assertNoLiteralChannels(source);
  assertEveryChannelHasMainHandler();
  console.log('preloadIpcChannelParity.test.ts passed');
}

run();
