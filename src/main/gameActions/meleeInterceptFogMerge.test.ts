/**
 * Contract tests for melee-intercept candidate hex visibility merge (execution plan §6.6).
 * Run with: node dist/main/gameActions/meleeInterceptFogMerge.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  clearMeleeInterceptPendingSnapshot,
  mergeMeleeCandidateHexesIntoHumanFogSnapshot,
} from './meleeInterceptPendingState';
import type { MeleeInterceptReadyPauseSnapshot } from './meleeInterceptPendingState';
import {
  contractMinimalGameStateForFogMerge,
  withMeleeInterceptPendingSnapshotForTest,
} from './testSupport/meleeInterceptFogMergeFixtures';

test('mergeMeleeCandidateHexesIntoHumanFogSnapshot contract: unions pending candidates into visible and explored', () => {
  const candidateHex = '8b1fbffffffffff';
  const otherHex = '891f1d48b9fffff';
  withMeleeInterceptPendingSnapshotForTest(
    {
      candidateHexes: [candidateHex],
      turnNumber: 1,
    } as unknown as MeleeInterceptReadyPauseSnapshot,
    () => {
      const base = contractMinimalGameStateForFogMerge({
        phase: 'resolution',
        visibleHexes: [otherHex],
        exploredHexes: [otherHex],
        staleHexes: [],
      });
      const merged = mergeMeleeCandidateHexesIntoHumanFogSnapshot(base);
      assert.ok(merged.visibleHexes?.includes(candidateHex));
      assert.ok(merged.visibleHexes?.includes(otherHex));
      assert.ok(merged.exploredHexes?.includes(candidateHex));
      assert.strictEqual(merged.staleHexes?.length, 0);
    }
  );
});

test('mergeMeleeCandidateHexesIntoHumanFogSnapshot contract: no-op when no pause snapshot exists', () => {
  clearMeleeInterceptPendingSnapshot();
  const base = contractMinimalGameStateForFogMerge({
    turnNumber: 2,
    visibleHexes: ['811fbffffffffff'],
  });
  const merged = mergeMeleeCandidateHexesIntoHumanFogSnapshot(base);
  assert.deepStrictEqual(merged.visibleHexes, base.visibleHexes);
});
