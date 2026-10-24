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
 * A planning snapshot small enough for Ready tests that do not read the database.
 *
 * Purpose: The handler tests share one state so a fake `getGameState` does not invent a new shape each time.
 * When to use: The `getGameState` and `getGameStateForPlayer` fakes in this file.
 * Expected outcome: Turn 1, planning, one hex, one human infantry, and one AI armor. No pending orders.
 * Exceptions: None. This value is for testing.
 */
const minimalPlanningState = {
    /**
   * The one hex both units occupy.
   *
   * Purpose: Ready's display-name helper reads `hexes` before it looks at orders.
   * When to use: The shared snapshot.
   * Expected outcome: One plains land hex.
   * Exceptions: None.
   */
hexes: [{ h3Index: '891f1d48b9fffff', terrain: 'land' as const, terrainKind: 'plains' }],
    /**
   * One unit for each side, on that hex.
   *
   * Purpose: Order assertions name these unit ids.
   * When to use: The shared snapshot.
   * Expected outcome: Human infantry `human-1` and AI armor `opponent-1`.
   * Exceptions: None.
   */
units: [
    { id: 'human-1', player: 'human', unitType: 'infantry', h3Index: '891f1d48b9fffff' },
    { id: 'opponent-1', player: 'opponent', unitType: 'armor', h3Index: '891f1d48b9fffff' },
  ],
    /**
   * The phase Ready expects before it resolves a turn.
   *
   * Purpose: The handler logs the phase from this snapshot.
   * When to use: The shared snapshot.
   * Expected outcome: `planning`.
   * Exceptions: None.
   */
phase: 'planning' as const,
    /**
   * The turn the handler logs before resolution.
   *
   * Purpose: The tests do not depend on a stored turn.
   * When to use: The shared snapshot.
   * Expected outcome: 1.
   * Exceptions: None.
   */
turnNumber: 1,
    /**
   * Orders already on the snapshot. Ready's gathered orders are separate.
   *
   * Purpose: The fake state has nothing queued, so a test that sees orders got them from the gather.
   * When to use: The shared snapshot.
   * Expected outcome: An empty list.
   * Exceptions: None.
   */
pendingOrders: [] as { unitId: string; toH3Index: string }[],
};

/**
 * Ready with Events and Run on, and no stored plan, does not call the model before resolution.
 *
 * Purpose: A turn with nothing queued must still resolve. The consult, if any, is after `ready`.
 * When to use: This file's runner.
 * Expected outcome: `requestOrders` is not called. The result succeeds with no AI orders and `aiConsulted` false.
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
 * Ready with Run off does not call the model.
 *
 * Purpose: Turning Run off leaves the turn on standing orders and stored plans.
 * When to use: This file's runner.
 * Expected outcome: `requestOrders` is not called, and the result succeeds.
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
 * A stored plan is the orders Ready resolves, without a second model call.
 *
 * Purpose: The gather uses pending orders and clears them. Ready must see those orders.
 * When to use: This file's runner.
 * Expected outcome: `ready` receives the stored move. `requestOrders` is not called. `aiConsulted` is true.
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
 * Stored air strikes, ferry orders, and embark orders reach `ready`.
 *
 * Purpose: The gather is not only movement and ranged fire.
 * When to use: This file's runner.
 * Expected outcome: The first AI seat's order set has one of each, and no movement or ranged orders.
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
 * A melee pause returns the token and the candidate hexes and does not consult.
 *
 * Purpose: The player still has to choose Fight or Ignore. The turn is not finished.
 * When to use: This file's runner.
 * Expected outcome: `awaitingMeleeDecision` is true, the token matches, and one candidate is returned.
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
 * A melee resolve without a token or a Fight or Ignore decision does not resolve the intercept.
 *
 * Purpose: The modal must send a token and one of those two decisions.
 * When to use: This file's runner.
 * Expected outcome: `{ success: false }` and `resolveMeleeIntercept` is not called.
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
 * Fight copies the battle hex from the resolve result onto the IPC result.
 *
 * Purpose: The renderer starts the battle at the hex resolution chose.
 * When to use: This file's runner.
 * Expected outcome: `tacticalAutoStartH3Index` is the hex the fake resolve returned.
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
 * Ready does not resolve a turn while a playback consult is still pending.
 *
 * Purpose: The next turn waits until notify finishes or abandons the stored consult.
 * When to use: This file's runner.
 * Expected outcome: `{ success: false }` and `ready` is not called. The pending consult is cleared afterward.
 * Exceptions: None.
 */
async function testHandleGameReadyFailsWhileDeferredPlaybackConsultPending(): Promise<void> {
  clearDeferredPlaybackConsultPending();
  setPendingStrategicReadyConsult(1, {
    useEventDrivenConsultation: false,
    resolutionSuccess: true,
    aiPlanningRunEnabled: true,
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

/**
 * Ignore does not add a battle hex when resolution did not return one.
 *
 * Purpose: Skipping the fight must not open a battle.
 * When to use: This file's runner.
 * Expected outcome: The result succeeds and `tacticalAutoStartH3Index` is absent.
 * Exceptions: None.
 */
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
