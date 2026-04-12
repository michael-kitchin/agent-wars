/**
 * Shared fixtures for melee-intercept fog merge contract tests.
 */

import type { GameStateSnapshot } from '../../../shared/ipcTypes';
import {
  clearMeleeInterceptPendingSnapshot,
  setMeleeInterceptPendingSnapshot,
  type MeleeInterceptReadyPauseSnapshot,
} from '../meleeInterceptPendingState';

/**
 * Installs a pending melee-intercept pause snapshot for the duration of `fn`, then clears global pending state.
 *
 * Purpose: Removes duplicated try/finally blocks around `setMeleeInterceptPendingSnapshot` in fog-merge tests.
 * When to use: Any test that mutates `meleeInterceptPendingState` and must not leak across cases.
 * Expected outcome: Pending snapshot matches `snapshot` during `fn`; always cleared afterward.
 * Exceptions: Re-throws errors from `fn` after cleanup in `finally`.
 */
export function withMeleeInterceptPendingSnapshotForTest<T>(snapshot: MeleeInterceptReadyPauseSnapshot, fn: () => T): T {
  try {
    setMeleeInterceptPendingSnapshot(snapshot);
    return fn();
  } finally {
    clearMeleeInterceptPendingSnapshot();
  }
}

/**
 * Builds a minimal `GameStateSnapshot` valid for `mergeMeleeCandidateHexesIntoHumanFogSnapshot` contract tests.
 *
 * Purpose: Centralizes the tiny strategic rows fog merge reads (`visibleHexes`, `exploredHexes`, `staleHexes`, phase, turn).
 * When to use: Fog-merge tests that only assert union behavior on hex lists.
 * Expected outcome: Satisfies `GameStateSnapshot` with defaults overridden by `overrides`.
 * Exceptions: None.
 */
export function contractMinimalGameStateForFogMerge(overrides: Partial<GameStateSnapshot> = {}): GameStateSnapshot {
  return {
    hexes: [],
    units: [],
    phase: 'planning',
    turnNumber: 1,
    pendingOrders: [],
    ...overrides,
  };
}
