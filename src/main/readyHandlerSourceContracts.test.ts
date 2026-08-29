import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readRendererSource } from './testSupport/rendererSourceAssertions';

test('readyHandler uses collectUnknownBattleContinentNames', () => {
  const source = readRendererSource('gameplay', 'readyHandler.ts');
  assert.ok(source.includes('collectUnknownBattleContinentNames'));
  assert.ok(!source.includes('if (!unknownContinentNames.includes(n))'));
});

test('readyHandler has a single tool-count rollback helper', () => {
  const source = readRendererSource('gameplay', 'readyHandler.ts');
  const matches = source.match(/function rollbackReadyToolCounts\(/g) ?? [];
  assert.equal(matches.length, 1);
  assert.equal(
    (source.match(/S.toolInvocationCounts = toolCountsBeforeReadyClick;/g) ?? []).length,
    0,
    'all six assignment sites should use rollbackReadyToolCounts'
  );
});
