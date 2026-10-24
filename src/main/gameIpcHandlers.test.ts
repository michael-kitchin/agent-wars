/**
 * Tests for game:ready and melee intercept resolution.
 * Happy path and essential failure cases.
 */

import * as assert from 'assert';
import {
  clearDeferredPlaybackConsultPending,
  setPendingStrategicReadyConsult,
} from './ipc/deferredResolutionPlaybackConsult';
import {
  handleGameReady,
  handleResolveMeleeIntercept,
  type RequestAiOrdersResult,
  type ReadyResultMinimal,
} from './gameIpcHandlers';
import { advanceMatchGeneration } from './matchGeneration';
import { AI_SEAT_IDS } from '../shared/seatIds';
import { dbGetAll, dbRun, setAiPendingOrders } from './gameDb';
import { updateSeatCommander } from './gameDb/seatRosterStore';
import { withSeatedTempGameDbAsync } from './testSupport/withSeatedTempGameDb';
import { setCommanderConsultRunnerForTests } from './openRouter/commanderPool';
import { emptyConsultOutcome } from './openRouter/commanderPoolSupport';
import type { ReadyResult } from '../shared/ipcTypes';
import type { TurnOrdersByOwner } from './gameActions/ownerTurnOrders';

/**
 * Documents the module-scope binding `minimalPlanningState` (minimalPlanningState).

 * Purpose: Supports maintainability by documenting why `minimalPlanningState` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const minimalPlanningState = {
    /**
   * Documents the object literal property `hexes` (hexes: [{ h3Index: '891f1d48b9fffff', terrain: 'land' as const, terrainKind: 'plains' }]).

   * Purpose: Supports maintainability by documenting why `hexes` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
hexes: [{ h3Index: '891f1d48b9fffff', terrain: 'land' as const, terrainKind: 'plains' }],
    /**
   * Documents the object literal property `units` (units: [ { id: 'human-1', player: 'human', unitType: 'infantry', h3Index: '891f1d48b9fffff' }, { id: 'opponent-1', player: 'opponent', unitType: 'armo).

   * Purpose: Supports maintainability by documenting why `units` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
units: [
    { id: 'human-1', player: 'human', unitType: 'infantry', h3Index: '891f1d48b9fffff' },
    { id: 'opponent-1', player: 'opponent', unitType: 'armor', h3Index: '891f1d48b9fffff' },
  ],
    /**
   * Documents the object literal property `phase` (phase: 'planning' as const).

   * Purpose: Supports maintainability by documenting why `phase` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
phase: 'planning' as const,
    /**
   * Documents the object literal property `turnNumber` (turnNumber: 1).

   * Purpose: Supports maintainability by documenting why `turnNumber` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
turnNumber: 1,
    /**
   * Documents the object literal property `pendingOrders` (pendingOrders: [] as { unitId: string; toH3Index: string }[]).

   * Purpose: Supports maintainability by documenting why `pendingOrders` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
pendingOrders: [] as { unitId: string; toH3Index: string }[],
};

/**
 * Defines the `testGameReadyPrecomputedSkipsRequestOrders` function shape (async function testGameReadyPrecomputedSkipsRequestOrders(): Promise<void>).

 * Purpose: Supports maintainability by documenting why `testGameReadyPrecomputedSkipsRequestOrders` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
async function testGameReadyPrecomputedSkipsRequestOrders(): Promise<void> {
  let requestOrdersCalled = false;
  const deps = {
    getGameState: () => minimalPlanningState,
    getGameStateForPlayer: () => minimalPlanningState,
    getSelectedModel: () => 'test-model',
    hasKey: () => true,
    getToolNamesForEnabledGroups: () => ['planning'],
    defaultGroupIds: ['planning'],
    requestOrders: async (): Promise<RequestAiOrdersResult> => {
      requestOrdersCalled = true;
      throw new Error('requestOrders should not be called when no consult is running');
    },
    ready: (ordersByOwner: TurnOrdersByOwner): ReadyResultMinimal & { success: boolean } => {
      const opponent = ordersByOwner.get('opponent');
      assert.strictEqual(opponent?.movementOrders.length ?? 0, 0);
      assert.strictEqual(opponent?.rangedOrders.length ?? 0, 0);
      return {
        success: true,
        aiOrderCount: 0,
      };
    },
  };
  try {
    const result = await handleGameReady(
      { enabledToolGroups: ['planning'], aiPlanningRunEnabled: true, useEventDrivenConsultation: true },
      deps
    );
    assert.strictEqual(requestOrdersCalled, false);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.aiOrderCount, 0);
    assert.strictEqual(result.aiConsulted, false);
  } finally {
    clearDeferredPlaybackConsultPending();
  }
}

/**
 * Defines the `testGameReadyRunOffSkipsRequestOrdersNonEventDriven` function shape (async function testGameReadyRunOffSkipsRequestOrdersNonEventDriven(): Promise<void>).

 * Purpose: Supports maintainability by documenting why `testGameReadyRunOffSkipsRequestOrdersNonEventDriven` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
async function testGameReadyRunOffSkipsRequestOrdersNonEventDriven(): Promise<void> {
  let requestOrdersCalled = false;
  const deps = {
    getGameState: () => minimalPlanningState,
    getGameStateForPlayer: () => minimalPlanningState,
    getSelectedModel: () => 'test-model',
    hasKey: () => true,
    getToolNamesForEnabledGroups: () => ['planning'],
    defaultGroupIds: ['planning'],
    requestOrders: async (): Promise<RequestAiOrdersResult> => {
      requestOrdersCalled = true;
      return { success: false, error: 'should not be called' };
    },
    ready: (ordersByOwner: TurnOrdersByOwner): ReadyResultMinimal & { success: boolean } => {
      void ordersByOwner;
      return {
        success: true,
        aiOrderCount: 0,
      };
    },
  };
  const result = await handleGameReady(
    { enabledToolGroups: ['planning'], aiPlanningRunEnabled: false },
    deps
  );
  assert.strictEqual(requestOrdersCalled, false);
  assert.strictEqual(result.success, true);
}

/**
 * Defines the `testGameReadyPrecomputedWithOrders` function shape (async function testGameReadyPrecomputedWithOrders(): Promise<void>).

 * Purpose: Supports maintainability by documenting why `testGameReadyPrecomputedWithOrders` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
async function testGameReadyPrecomputedWithOrders(): Promise<void> {
  const precomputedOrders = [{ unitId: 'opponent-1', toH3Index: '891f1d48b9fffff' }];
  const precomputedRanged: { unitId: string; targetH3Index: string }[] = [];
  let requestOrdersCalled = false;
  await withSeatedTempGameDbAsync('aw-ready-pending-', { fogOfWarEnabled: false }, async () => {
  setAiPendingOrders(AI_SEAT_IDS[0], precomputedOrders, precomputedRanged, [], [], []);
  const deps = {
    getGameState: () => minimalPlanningState,
    getGameStateForPlayer: () => minimalPlanningState,
    getSelectedModel: () => 'test-model',
    hasKey: () => true,
    getToolNamesForEnabledGroups: () => ['planning'],
    defaultGroupIds: ['planning'],
    requestOrders: async (): Promise<RequestAiOrdersResult> => {
      requestOrdersCalled = true;
      return { success: false, error: 'should not be called' };
    },
    ready: (ordersByOwner: TurnOrdersByOwner): ReadyResultMinimal & { success: boolean } => {
      assert.deepStrictEqual(ordersByOwner.get('opponent')?.movementOrders, precomputedOrders);
      assert.strictEqual(ordersByOwner.get('opponent')?.rangedOrders.length ?? 0, 0);
      return {
        success: true,
        aiOrderCount: 1,
        aiMoves: [{ unitId: 'opponent-1', fromH3Index: '891f1d48b9fffff', toH3Index: '891f1d48b9fffff' }],
      };
    },
  };
  try {
    const result = await handleGameReady(
      { enabledToolGroups: ['planning'], aiPlanningRunEnabled: true, useEventDrivenConsultation: true },
      deps
    );
    assert.strictEqual(requestOrdersCalled, false);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.aiOrderCount, 1);
    assert.strictEqual(result.aiConsulted, true);
  } finally {
    clearDeferredPlaybackConsultPending();
  }
  });
}

/**
 * Defines the `testGameReadyForwardsAiAirStrikeFerryAndEmbarkOrders` function shape (async function testGameReadyForwardsAiAirStrikeFerryAndEmbarkOrders(): Promise<void>).

 * Purpose: Supports maintainability by documenting why `testGameReadyForwardsAiAirStrikeFerryAndEmbarkOrders` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
async function testGameReadyForwardsAiAirStrikeFerryAndEmbarkOrders(): Promise<void> {
  const airStrikes = [{ unitId: 'opponent-air-1', targetH3Index: '891f1d48b9fffff', targetType: 'units' as const }];
  const ferryOrders = [{ unitId: 'opponent-air-2', destinationH3Index: '891f1d48b9fffff' }];
  const embarkOrders = [{ unitId: 'opponent-inf-1', navalUnitId: 'opponent-naval-1' }];
  await withSeatedTempGameDbAsync('aw-ready-extra-', { fogOfWarEnabled: false }, async () => {
  setAiPendingOrders(AI_SEAT_IDS[0], [], [], airStrikes, ferryOrders, embarkOrders);
  const deps = {
    getGameState: () => minimalPlanningState,
    getGameStateForPlayer: () => minimalPlanningState,
    getSelectedModel: () => 'test-model',
    hasKey: () => true,
    getToolNamesForEnabledGroups: () => ['planning'],
    defaultGroupIds: ['planning'],
    requestOrders: async (): Promise<RequestAiOrdersResult> => ({
      success: false,
      error: 'should not be called',
    }),
    ready: (ordersByOwner: TurnOrdersByOwner): ReadyResultMinimal & { success: boolean } => {
      const opponent = ordersByOwner.get('opponent');
      assert.strictEqual(opponent?.movementOrders.length ?? 0, 0);
      assert.strictEqual(opponent?.rangedOrders.length ?? 0, 0);
      assert.strictEqual(opponent?.airStrikeOrders.length ?? 0, 1);
      assert.strictEqual(opponent?.ferryOrders.length ?? 0, 1);
      assert.strictEqual(opponent?.embarkOrders.length ?? 0, 1);
      return { success: true, aiOrderCount: 0 };
    },
  };
  const result = await handleGameReady(
    { enabledToolGroups: ['planning'], aiPlanningRunEnabled: true },
    deps
  );
  assert.strictEqual(result.success, true);
  });
}

/**
 * Defines the `runAll` function shape (async function runAll(): Promise<void>).

 * Purpose: Supports maintainability by documenting why `runAll` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
async function testGameReadyAwaitingMeleeDecisionSurfacesFields(): Promise<void> {
  const deps = {
    getGameState: () => minimalPlanningState,
    getGameStateForPlayer: () => minimalPlanningState,
    getSelectedModel: () => 'test-model',
    hasKey: () => true,
    getToolNamesForEnabledGroups: () => ['planning'],
    defaultGroupIds: ['planning'],
    requestOrders: async (): Promise<RequestAiOrdersResult> => ({ success: false, error: 'unused' }),
    ready: (): ReadyResultMinimal & { success: boolean } => ({
      success: true,
      awaitingMeleeDecision: true,
      meleeDecisionToken: 'decision-token-1',
      meleeInterceptCandidates: [
        { h3Index: '891f1d48b9fffff', parties: [{ ownerId: 'human', unitSummary: '1 infantry' }, { ownerId: 'opponent', unitSummary: '1 armor' }], tacticalEligible: true },
      ],
    }),
  };
  const result = await handleGameReady({ enabledToolGroups: ['planning'], aiPlanningRunEnabled: false }, deps);
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.awaitingMeleeDecision, true);
  assert.strictEqual(result.meleeDecisionToken, 'decision-token-1');
  assert.strictEqual(result.meleeInterceptCandidates?.length, 1);
}

/**
 * Defines the `testHandleResolveMeleeInterceptRejectsInvalidPayload` function shape (async function testHandleResolveMeleeInterceptRejectsInvalidPayload(): Promise<void>).

 * Purpose: Contract that `handleResolveMeleeIntercept` rejects missing token or invalid decision before calling game actions.
 * When to use: Regression guard for melee modal IPC wiring.
 * Expected outcome: `{ success: false }` without invoking `resolveMeleeIntercept` for malformed payloads.
 * Exceptions: None.
 */
async function testHandleResolveMeleeInterceptRejectsInvalidPayload(): Promise<void> {
  const deps = {
    getGameState: () => minimalPlanningState,
    getGameStateForPlayer: () => minimalPlanningState,
    getSelectedModel: () => 'test-model',
    hasKey: () => true,
    getToolNamesForEnabledGroups: () => ['planning'],
    defaultGroupIds: ['planning'],
    requestOrders: async (): Promise<RequestAiOrdersResult> => ({ success: false, error: 'unused' }),
    resolveMeleeIntercept: (): ReadyResultMinimal & { success: boolean } => ({
      success: false,
      reason: 'resolveMeleeIntercept should not run for invalid payload',
    }),
  };
  const result = await handleResolveMeleeIntercept(undefined, deps);
  assert.strictEqual(result.success, false);
}

const minimalResolvedReady: ReadyResult = {
  success: true,
  humanMoves: [],
  combatHexes: [],
  removedUnitIds: [],
  casualtyHexes: [],
};

/**
 * Defines the `testHandleResolveMeleeInterceptForwardsTacticalAutoStartOnFight` function shape (async function testHandleResolveMeleeInterceptForwardsTacticalAutoStartOnFight(): Promise<void>).

 * Purpose: Locks Phase E contract that IPC mirrors `tacticalAutoStartStrategicH3Index` only when the resolve layer returns it (Fight path).
 * When to use: Regression guard for melee intercept completion wiring.
 * Expected outcome: Handler output includes the same strategic index the mocked `resolveMeleeIntercept` returned.
 * Exceptions: None.
 */
async function testHandleResolveMeleeInterceptForwardsTacticalAutoStartOnFight(): Promise<void> {
  const fightHex = '891f1d48b9fffff';
  const deps = {
    getGameState: () => minimalPlanningState,
    getGameStateForPlayer: () => minimalPlanningState,
    getSelectedModel: () => 'test-model',
    hasKey: () => true,
    getToolNamesForEnabledGroups: () => ['planning'],
    defaultGroupIds: ['planning'],
    requestOrders: async (): Promise<RequestAiOrdersResult> => ({ success: false, error: 'unused' }),
    resolveMeleeIntercept: (): ReadyResult => ({
      ...minimalResolvedReady,
      tacticalAutoStartH3Index: fightHex,
    }),
  };
  const result = await handleResolveMeleeIntercept(
    {
      meleeDecisionToken: 'tok',
      decision: 'fight',
      selectedH3Index: fightHex,
      useEventDrivenConsultation: false,
      aiPlanningRunEnabled: false,
      enabledToolGroups: ['planning'],
    },
    deps
  );
  assert.strictEqual(result.success, true);
  assert.strictEqual((result as { tacticalAutoStartH3Index?: string }).tacticalAutoStartH3Index, fightHex);
}

/**
 * Defines the `testHandleResolveMeleeInterceptOmitsTacticalAutoStartOnIgnore` function shape (async function testHandleResolveMeleeInterceptOmitsTacticalAutoStartOnIgnore(): Promise<void>).

 * Purpose: Locks Phase E contract that Ignore does not surface tactical auto-start on the IPC completion payload.
 * When to use: Regression guard paired with the Fight forwarding test.
 * Expected outcome: `tacticalAutoStartStrategicH3Index` is absent when the mocked resolve result omits it.
 * Exceptions: None.
 */
/**
 * Defines the `testHandleGameReadyFailsWhileDeferredPlaybackConsultPending` function shape.

 * Purpose: Locks mutex behavior so a second `game:ready` cannot run while deferred consultation is outstanding.
 * When to use: Regression guard for playback deferral ordering.
 * Expected outcome: `{ success: false }` without invoking `ready`.
 * Exceptions: Clears pending after the assertion so other tests stay isolated.
 */
async function testHandleGameReadyFailsWhileDeferredPlaybackConsultPending(): Promise<void> {
  clearDeferredPlaybackConsultPending();
  setPendingStrategicReadyConsult(1, {
    useEventDrivenConsultation: false,
    resolutionSuccess: true,
    aiPlanningRunEnabled: true,
    opponentState: minimalPlanningState as never,
    resolution: { success: true } as ReadyResult,
    modelId: '',
    enabledToolNames: [],
    hasKey: () => false,
    requestOrders: async (): Promise<RequestAiOrdersResult> => ({ success: true, orders: [] }),
    timeoutMs: 1000,
    errorLogMessage: 'testHandleGameReadyFailsWhileDeferredPlaybackConsultPending',
  });
  let readyCalled = false;
  const deps = {
    getGameState: () => minimalPlanningState,
    getGameStateForPlayer: () => minimalPlanningState,
    getSelectedModel: () => 'test-model',
    hasKey: () => true,
    getToolNamesForEnabledGroups: () => ['planning'],
    defaultGroupIds: ['planning'],
    requestOrders: async (): Promise<RequestAiOrdersResult> => ({ success: true, orders: [] }),
    ready: (): ReadyResultMinimal & { success: boolean } => {
      readyCalled = true;
      return { success: false, reason: 'ready should not run while deferred consultation pending' };
    },
  };
  const result = await handleGameReady({ enabledToolGroups: ['planning'], aiPlanningRunEnabled: false }, deps);
  assert.strictEqual(result.success, false);
  assert.strictEqual(readyCalled, false);
  clearDeferredPlaybackConsultPending();
}

async function testHandleResolveMeleeInterceptOmitsTacticalAutoStartOnIgnore(): Promise<void> {
  const deps = {
    getGameState: () => minimalPlanningState,
    getGameStateForPlayer: () => minimalPlanningState,
    getSelectedModel: () => 'test-model',
    hasKey: () => true,
    getToolNamesForEnabledGroups: () => ['planning'],
    defaultGroupIds: ['planning'],
    requestOrders: async (): Promise<RequestAiOrdersResult> => ({ success: false, error: 'unused' }),
    resolveMeleeIntercept: (): ReadyResult => ({ ...minimalResolvedReady }),
  };
  const result = await handleResolveMeleeIntercept(
    {
      meleeDecisionToken: 'tok',
      decision: 'ignore',
      useEventDrivenConsultation: false,
      aiPlanningRunEnabled: false,
      enabledToolGroups: ['planning'],
    },
    deps
  );
  assert.strictEqual(result.success, true);
  assert.strictEqual((result as { tacticalAutoStartH3Index?: string }).tacticalAutoStartH3Index, undefined);
}

/**
 * A new match started during the inline consult must not resolve the old turn.
 *
 * Purpose: Opening New retires the match generation. Ready that is still waiting on the model must not call `ready()`.
 * When to use: This file's runner.
 * Expected outcome: `ready` is not called, and the result says a new game started.
 * Exceptions: None.
 */
async function testGameReadyNewGameDuringConsultDoesNotResolve(): Promise<void> {
  let readyCalled = false;
  await withSeatedTempGameDbAsync('aw-ready-generation-', { fogOfWarEnabled: false }, async () => {
  updateSeatCommander({ run: dbRun, getAll: dbGetAll }, AI_SEAT_IDS[0], {
    modelId: 'model-a',
    reasoningEffort: null,
    doctrineChoice: 'balanced',
  });
  setCommanderConsultRunnerForTests(async () => {
    advanceMatchGeneration('new_game');
    return emptyConsultOutcome();
  });
  const deps = {
    getGameState: () => minimalPlanningState,
    getGameStateForPlayer: () => minimalPlanningState,
    getSelectedModel: () => 'test-model',
    hasKey: () => true,
    getToolNamesForEnabledGroups: () => ['planning'],
    defaultGroupIds: ['planning'],
    requestOrders: async (): Promise<RequestAiOrdersResult> => ({ success: false, error: 'unused' }),
    ready: (): ReadyResultMinimal & { success: boolean } => {
      readyCalled = true;
      return { success: true, aiOrderCount: 0 };
    },
  };
  const result = await handleGameReady({ enabledToolGroups: ['planning'], aiPlanningRunEnabled: true }, deps);
  assert.strictEqual(readyCalled, false);
  assert.strictEqual(result.success, false);
  assert.strictEqual(result.reason, 'A new game started before this turn finished.');
  setCommanderConsultRunnerForTests(null);
  });
}

async function runAll(): Promise<void> {
  const tests: { name: string; fn: () => void | Promise<void> }[] = [
    { name: 'game:ready precomputed skips requestOrders', fn: testGameReadyPrecomputedSkipsRequestOrders },
    {
      name: 'game:ready Run off skips LLM (non-event-driven)',
      fn: testGameReadyRunOffSkipsRequestOrdersNonEventDriven,
    },
    {
      name: 'game:ready does not resolve a turn after a new game starts',
      fn: testGameReadyNewGameDuringConsultDoesNotResolve,
    },
    { name: 'game:ready precomputed with orders', fn: testGameReadyPrecomputedWithOrders },
    {
      name: 'game:ready forwards AI air strike, ferry, and embark orders',
      fn: testGameReadyForwardsAiAirStrikeFerryAndEmbarkOrders,
    },
    {
      name: 'game:ready fails while deferred playback consultation pending',
      fn: testHandleGameReadyFailsWhileDeferredPlaybackConsultPending,
    },
    { name: 'game:ready awaiting melee decision surfaces token and rows', fn: testGameReadyAwaitingMeleeDecisionSurfacesFields },
    { name: 'game:resolveMeleeIntercept rejects invalid payload', fn: testHandleResolveMeleeInterceptRejectsInvalidPayload },
    {
      name: 'game:resolveMeleeIntercept forwards tacticalAutoStart on Fight',
      fn: testHandleResolveMeleeInterceptForwardsTacticalAutoStartOnFight,
    },
    {
      name: 'game:resolveMeleeIntercept omits tacticalAutoStart on Ignore',
      fn: testHandleResolveMeleeInterceptOmitsTacticalAutoStartOnIgnore,
    },
  ];
  for (const t of tests) {
    try {
      await t.fn();
      console.log('OK', t.name);
    } catch (err) {
      console.error('FAIL', t.name, err);
      process.exit(1);
    }
  }
  console.log('All', tests.length, 'tests passed.');
}

runAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
