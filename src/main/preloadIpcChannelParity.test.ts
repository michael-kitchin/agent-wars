/**
 * Guards the preload bridge and main-process handlers against drift from `src/shared/ipc/channels.ts`.
 * The preload imports the shared channel tables (the build bundles it), so this test checks that it keeps
 * doing so, that it never spells a channel as a string, and that main handles every channel.
 * Run with: node dist/main/preloadIpcChannelParity.test.js
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { IPC_GAME, IPC_OPENROUTER } from '../shared/ipc/channels';

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
 * Asserts the preload takes its channel tables from the shared module.
 *
 * Purpose: A local copy of `IPC_GAME` or `IPC_OPENROUTER` in the preload could drift from the shared tables.
 * When to use: `run`.
 * Expected outcome: Passes when the preload imports both tables from `../shared/ipc/channels` and declares neither.
 * Exceptions: AssertionError when the import is missing or a local table is declared.
 */
function assertPreloadImportsSharedTables(source: string): void {
  const code = stripComments(source);
  assert.ok(/import\s*\{[^}]*\}\s*from\s*'\.\.\/shared\/ipc\/channels'/.test(code), 'preload.ts must import the shared channel tables');
  assert.ok(!/const\s+IPC_GAME\b/.test(code), 'preload.ts must not declare its own IPC_GAME');
  assert.ok(!/const\s+IPC_OPENROUTER\b/.test(code), 'preload.ts must not declare its own IPC_OPENROUTER');
}

/**
 * Runs the preload and main-process channel checks.
 *
 * Purpose: Node test entrypoint for main-process discovery.
 * When to use: `node dist/main/preloadIpcChannelParity.test.js`.
 * Expected outcome: Passes when the preload uses the shared tables with no literal channels and main handles every channel; fails on drift.
 * Exceptions: Propagates assertion errors.
 */
function run(): void {
  const preloadPath = path.resolve(process.cwd(), 'src', 'main', 'preload.ts');
  const source = fs.readFileSync(preloadPath, 'utf8');
  assertPreloadImportsSharedTables(source);
  assertNoLiteralChannels(source);
  assertNoLiteralChannels(fs.readFileSync(path.resolve(process.cwd(), 'src', 'main', 'preloadSealiftApi.ts'), 'utf8'));
  assertEveryChannelHasMainHandler();
  console.log('preloadIpcChannelParity.test.ts passed');
}

run();
