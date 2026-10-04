import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readRendererSource } from './testSupport/rendererSourceAssertions';

test('ready resolution announcements use collectUnknownBattleContinentNames', () => {
  const readyHandlerSource = readRendererSource('gameplay', 'readyHandler.ts');
  const announcementsSource = readRendererSource('gameplay', 'readyResolutionAnnouncements.ts');
  assert.ok(announcementsSource.includes('collectUnknownBattleContinentNames'));
  assert.ok(!readyHandlerSource.includes('if (!unknownContinentNames.includes(n))'));
  assert.ok(!announcementsSource.includes('if (!unknownContinentNames.includes(n))'));
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
