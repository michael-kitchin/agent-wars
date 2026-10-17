import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { IPC_GAME, IPC_OPENROUTER } from '../shared/ipc/channels';

/**
 * Reads the preload bridge as text.
 *
 * Purpose: Channel parity must not import preload, because that module loads Electron.
 * When to use: The parity tests in this file.
 * Expected outcome: UTF-8 contents of `src/main/preload.ts` from the repo working directory.
 * Exceptions: Throws if the file cannot be read.
 */
function readPreloadSource(): string {
  return fs.readFileSync(path.resolve(process.cwd(), 'src', 'main', 'preload.ts'), 'utf8');
}

/**
 * Extracts one `const NAME = { ... }` object from preload source.
 *
 * Purpose: The sandbox copies of the channel maps are plain objects that can be compared as text.
 * When to use: For `IPC_GAME` and `IPC_OPENROUTER`.
 * Expected outcome: The object text from the opening brace through the matching closing brace.
 * Exceptions: Throws when the const is missing or the braces do not balance.
 */
function preloadConstObject(source: string, constName: string): string {
  const marker = `const ${constName} = {`;
  const markerAt = source.indexOf(marker);
  assert.ok(markerAt >= 0, `Expected ${marker}`);
  const openIdx = markerAt + marker.length - 1;
  let depth = 0;
  for (let i = openIdx; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(openIdx, i + 1);
    }
  }
  throw new Error(`Unterminated object for ${constName}`);
}

/**
 * Collects `key: 'value'` lines from a preload channel object.
 *
 * Purpose: Only literal channel entries count toward parity with the shared maps.
 * When to use: After `preloadConstObject`.
 * Expected outcome: A record of the keys and quoted values in source order.
 * Exceptions: None.
 */
function collectChannelEntries(objectText: string): Record<string, string> {
  const entries: Record<string, string> = {};
  const linePattern = /^\s*([A-Za-z0-9_]+): '([^']+)',?\s*$/;
  for (const line of objectText.split('\n')) {
    const match = linePattern.exec(line);
    if (!match) continue;
    entries[match[1]!] = match[2]!;
  }
  return entries;
}

/**
 * Asserts a preload channel object matches the shared map in both directions.
 *
 * Purpose: A missing, extra, or rewritten channel string should fail before the copies drift further.
 * When to use: Once per channel map.
 * Expected outcome: Passes when every pair matches, including the exact `key: 'value'` text.
 * Exceptions: AssertionError on drift.
 */
function assertPreloadMatchesShared(
  objectText: string,
  shared: Record<string, string>
): void {
  const collected = collectChannelEntries(objectText);
  assert.deepEqual(collected, shared);
  assert.deepEqual(shared, collected);
  for (const [key, value] of Object.entries(shared)) {
    assert.ok(objectText.includes(`${key}: '${value}'`));
  }
}

test('preload IPC_GAME matches the shared channel map', () => {
  const objectText = preloadConstObject(readPreloadSource(), 'IPC_GAME');
  assertPreloadMatchesShared(objectText, { ...IPC_GAME });
});

test('preload IPC_OPENROUTER matches the shared channel map', () => {
  const objectText = preloadConstObject(readPreloadSource(), 'IPC_OPENROUTER');
  assertPreloadMatchesShared(objectText, { ...IPC_OPENROUTER });
});
