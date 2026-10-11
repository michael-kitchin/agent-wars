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

test('ready tool-count rollback stays one shared helper', () => {
  const readyHandlerSource = readRendererSource('gameplay', 'readyHandler.ts');
  const tacticalCommitSource = readRendererSource('gameplay', 'readyTacticalCommit.ts');
  assert.equal((readyHandlerSource.match(/function rollbackReadyToolCounts\(/g) ?? []).length, 0);
  assert.equal((tacticalCommitSource.match(/function rollbackReadyToolCounts\(/g) ?? []).length, 1);
  const inlineRestore = /S\.toolInvocationCounts = toolCountsBeforeReadyClick;/g;
  assert.equal((readyHandlerSource.match(inlineRestore) ?? []).length, 0);
  assert.equal((tacticalCommitSource.match(inlineRestore) ?? []).length, 0);
  assert.ok(readyHandlerSource.includes('rollbackReadyToolCounts('));
  assert.ok(tacticalCommitSource.includes('rollbackReadyToolCounts('));
});
