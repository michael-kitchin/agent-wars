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

test('ready leaves tool counts to the commander pool', () => {
  const readyHandlerSource = readRendererSource('gameplay', 'readyHandler.ts');
  const tacticalCommitSource = readRendererSource('gameplay', 'readyTacticalCommit.ts');
  assert.equal((readyHandlerSource.match(/toolInvocationCounts/g) ?? []).length, 0);
  assert.equal((tacticalCommitSource.match(/toolInvocationCounts/g) ?? []).length, 0);
  assert.equal((readyHandlerSource.match(/rollbackReadyToolCounts/g) ?? []).length, 0);
  assert.equal((tacticalCommitSource.match(/rollbackReadyToolCounts/g) ?? []).length, 0);
});
