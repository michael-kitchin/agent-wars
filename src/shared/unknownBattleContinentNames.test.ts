import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectUnknownBattleContinentNames } from './unknownBattleContinentNames';

test('collectUnknownBattleContinentNames queries unique hexes in first-occurrence order', async () => {
  const calls: string[] = [];
  const fetchContinentNames = async (h3Index: string): Promise<readonly string[]> => {
    calls.push(h3Index);
    if (h3Index === 'a') return ['Europe', 'Asia'];
    if (h3Index === 'b') return ['Asia', 'Africa'];
    return [];
  };
  const names = await collectUnknownBattleContinentNames(['a', 'b'], ['b', 'a'], fetchContinentNames);
  assert.deepEqual(calls, ['a', 'b']);
  assert.deepEqual(names, ['Europe', 'Asia', 'Africa']);
});

test('collectUnknownBattleContinentNames returns [] when fetcher is omitted', async () => {
  const names = await collectUnknownBattleContinentNames(['a'], ['b'], undefined);
  assert.deepEqual(names, []);
});
