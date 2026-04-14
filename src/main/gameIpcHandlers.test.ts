/**
 * Tests for game:requestAiOrders, game:cancelRequestAiOrders, and game:ready precomputed path.
 * Happy path and essential failure cases per WEGO execution plan Phase 2. Run with: node dist/gameIpcHandlers.test.js
 */

import * as assert from 'assert';
import {
  handleRequestAiOrders,
  cancelRequestAiOrders,
  handleGameReady,
  handleResolveMeleeIntercept,
  type RequestAiOrdersResult,
  type ReadyResultMinimal,
} from './gameIpcHandlers';
import type { AirStrikeOrder, EmbarkOrder, FerryOrder, ReadyResult, TacticalOpponentPlanPayload } from '../shared/ipcTypes';
import { setActiveTacticalBattleSnapshotRef } from './tacticalBattle/activeTacticalBattleRef';
import type { TacticalBattleSnapshot } from '../shared/tacticalBattleTypes';

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
 * Documents the module-scope binding `resolutionState` (resolutionState).

 * Purpose: Supports maintainability by documenting why `resolutionState` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const resolutionState = { ...minimalPlanningState, /**
 * Documents the object literal property `phase` (phase: 'resolution' as const).

 * Purpose: Supports maintainability by documenting why `phase` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
phase: 'resolution' as const };

/**
 * Defines the `testRequestAiOrdersNotInPlanningPhase` function shape (async function testRequestAiOrdersNotInPlanningPhase(): Promise<void>).

 * Purpose: Supports maintainability by documenting why `testRequestAiOrdersNotInPlanningPhase` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
async function testRequestAiOrdersNotInPlanningPhase(): Promise<void> {
  const deps = {
    getGameState: () => resolutionState,
    getSelectedModel: () => 'test-model',
    hasKey: () => true,
    getToolNamesForEnabledGroups: () => ['planning', 'assessment', 'estimation'],
    defaultGroupIds: ['planning', 'assessment', 'estimation'],
    requestOrders: async (): Promise<RequestAiOrdersResult> => ({ success: true, orders: [] }),
    controllerRef: { current: null as AbortController | null },
  };
  const result = await handleRequestAiOrders({}, deps);
  assert.strictEqual(result.success, false);
  assert.strictEqual((result as { error: string }).error, 'Not in planning phase');
}

/**
 * Defines the `testRequestAiOrdersNoModel` function shape (async function testRequestAiOrdersNoModel(): Promise<void>).

 * Purpose: Supports maintainability by documenting why `testRequestAiOrdersNoModel` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
async function testRequestAiOrdersNoModel(): Promise<void> {
  const deps = {
    getGameState: () => minimalPlanningState,
    getSelectedModel: () => '',
    hasKey: () => true,
    getToolNamesForEnabledGroups: () => ['planning', 'assessment', 'estimation'],
    defaultGroupIds: ['planning', 'assessment', 'estimation'],
    requestOrders: async (): Promise<RequestAiOrdersResult> => ({ success: true, orders: [] }),
    controllerRef: { current: null as AbortController | null },
  };
  const result = await handleRequestAiOrders({}, deps);
  assert.strictEqual(result.success, false);
  assert.strictEqual((result as { error: string }).error, 'No model selected');
}

/**
 * Defines the `testRequestAiOrdersNoKey` function shape (async function testRequestAiOrdersNoKey(): Promise<void>).

 * Purpose: Supports maintainability by documenting why `testRequestAiOrdersNoKey` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
async function testRequestAiOrdersNoKey(): Promise<void> {
  const deps = {
    getGameState: () => minimalPlanningState,
    getGameStateForPlayer: () => minimalPlanningState,
    getSelectedModel: () => 'test-model',
    hasKey: () => false,
    getToolNamesForEnabledGroups: () => ['planning', 'assessment', 'estimation'],
    defaultGroupIds: ['planning', 'assessment', 'estimation'],
    requestOrders: async (): Promise<RequestAiOrdersResult> => ({ success: true, orders: [] }),
    controllerRef: { current: null as AbortController | null },
  };
  const result = await handleRequestAiOrders({}, deps);
  assert.strictEqual(result.success, false);
  assert.strictEqual((result as { error: string }).error, 'No API key set');
}

/**
 * Defines the `testRequestAiOrdersSuccess` function shape (async function testRequestAiOrdersSuccess(): Promise<void>).

 * Purpose: Supports maintainability by documenting why `testRequestAiOrdersSuccess` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
async function testRequestAiOrdersSuccess(): Promise<void> {
  const controllerRef = { current: null as AbortController | null };
  const deps = {
    getGameState: () => minimalPlanningState,
    getGameStateForPlayer: () => minimalPlanningState,
    getSelectedModel: () => 'test-model',
    hasKey: () => true,
    getToolNamesForEnabledGroups: () => ['planning', 'assessment', 'estimation'],
    defaultGroupIds: ['planning', 'assessment', 'estimation'],
    requestOrders: async (): Promise<RequestAiOrdersResult> => ({
      success: true,
      orders: [{ unitId: 'opponent-1', toH3Index: '891f1d48b9fffff' }],
      strategy: 'hold',
      toolInvocationCounts: { planning: 1 },
    }),
    controllerRef,
  };
  const result = await handleRequestAiOrders({}, deps);
  assert.strictEqual(result.success, true);
  assert.strictEqual((result as { orders: unknown[] }).orders.length, 1);
  assert.strictEqual((result as { strategy?: string }).strategy, 'hold');
}

/**
 * Defines the `testRequestAiOrdersTacticalBuffersOpponentPlan` function shape (async function testRequestAiOrdersTacticalBuffersOpponentPlan(): Promise<void>).

 * Purpose: Locks Phase 4 tactical scheduling — snapshot is not mutated on the AI callback; opponent rows are returned as `tacticalOpponentPlan`.
 * When to use: Regression when editing `handleRequestAiOrders` tactical branch.
 * Expected outcome: `tacticalBattle` is the same object reference as the active session; `orders` stripped to [] on the IPC result.
 * Exceptions: None.
 */
async function testRequestAiOrdersTacticalBuffersOpponentPlan(): Promise<void> {
  const tacticalSnap: TacticalBattleSnapshot = {
    battleId: 'tb-ipc-test',
    enclosingRes1H3Index: '891f1d48b9fffff',
    res4ChildH3Indexes: ['891f1d48b9fffff'],
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    subUnits: [],
  };
  setActiveTacticalBattleSnapshotRef(tacticalSnap);
  try {
    const controllerRef = { current: null as AbortController | null };
    const deps = {
      getGameState: () => minimalPlanningState,
      getGameStateForPlayer: () => minimalPlanningState,
      getSelectedModel: () => 'test-model',
      hasKey: () => true,
      getToolNamesForEnabledGroups: () => ['planning', 'assessment', 'estimation'],
      defaultGroupIds: ['planning', 'assessment', 'estimation'],
      requestOrders: async (): Promise<RequestAiOrdersResult> => ({
        success: true,
        orders: [{ unitId: 'opp-su-1', toH3Index: '891f1d48b9fffff' }],
        rangedAttacks: [{ unitId: 'opp-su-1', targetH3Index: '891f1d48b9fffff' }],
        strategy: 'probe',
      }),
      controllerRef,
    };
    const result = await handleRequestAiOrders({}, deps);
    assert.strictEqual(result.success, true);
    const ok = result as {
      orders: unknown[];
      tacticalBattle?: TacticalBattleSnapshot;
      tacticalOpponentPlan?: TacticalOpponentPlanPayload;
    };
    assert.strictEqual(ok.orders.length, 0);
    assert.strictEqual(ok.tacticalBattle, tacticalSnap);
    assert.ok(ok.tacticalOpponentPlan);
    assert.strictEqual(ok.tacticalOpponentPlan!.movementOrders.length, 1);
    assert.strictEqual(ok.tacticalOpponentPlan!.rangedAttacks.length, 1);
    assert.strictEqual(ok.tacticalOpponentPlan!.airStrikes.length, 0);
  } finally {
    setActiveTacticalBattleSnapshotRef(null);
  }
}

/**
 * Defines the `testRequestAiOrdersCancelled` function shape (async function testRequestAiOrdersCancelled(): Promise<void>).

 * Purpose: Supports maintainability by documenting why `testRequestAiOrdersCancelled` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
async function testRequestAiOrdersCancelled(): Promise<void> {
  const controllerRef = { current: null as AbortController | null };
  let capturedSignal: AbortSignal | undefined;
  const deps = {
    getGameState: () => minimalPlanningState,
    getGameStateForPlayer: () => minimalPlanningState,
    getSelectedModel: () => 'test-model',
    hasKey: () => true,
    getToolNamesForEnabledGroups: () => ['planning'],
    defaultGroupIds: ['planning'],
    requestOrders: async (
      _state: unknown,
      _modelId: string,
      options: { signal?: AbortSignal }
    ): Promise<RequestAiOrdersResult> => {
      capturedSignal = options.signal;
      return new Promise<RequestAiOrdersResult>((resolve) => {
        if (options.signal?.aborted) {
          resolve({ success: false, error: 'Cancelled' });
          return;
        }
        options.signal?.addEventListener('abort', () => {
          resolve({ success: false, error: 'Cancelled' });
        });
      });
    },
    controllerRef,
  };
  const promise = handleRequestAiOrders({}, deps);
  setTimeout(() => cancelRequestAiOrders(controllerRef), 10);
  const result = await promise;
  assert.strictEqual(result.success, false);
  assert.strictEqual((result as { error: string }).error, 'Cancelled');
  assert.ok(capturedSignal);
}

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
      throw new Error('requestOrders should not be called when precomputed is provided');
    },
    ready: (
      aiOrders: { unitId: string; toH3Index: string }[],
      aiRangedOrders: { unitId: string; targetH3Index: string }[]
    ): ReadyResultMinimal & { success: boolean } => {
      assert.strictEqual(aiOrders.length, 0);
      assert.strictEqual(aiRangedOrders.length, 0);
      return {
        success: true,
        aiOrderCount: 0,
      };
    },
  };
  const result = await handleGameReady(
    { precomputedAiOrders: [], precomputedAiRangedOrders: [] },
    deps
  );
  assert.strictEqual(requestOrdersCalled, false);
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.aiOrderCount, 0);
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
    ready: (
      aiOrders: { unitId: string; toH3Index: string }[],
      aiRangedOrders: { unitId: string; targetH3Index: string }[]
    ): ReadyResultMinimal & { success: boolean } => {
      void aiOrders;
      void aiRangedOrders;
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
    ready: (
      aiOrders: { unitId: string; toH3Index: string }[],
      aiRangedOrders: { unitId: string; targetH3Index: string }[]
    ): ReadyResultMinimal & { success: boolean } => {
      assert.deepStrictEqual(aiOrders, precomputedOrders);
      assert.strictEqual(aiRangedOrders.length, 0);
      return {
        success: true,
        aiOrderCount: 1,
        aiMoves: [{ unitId: 'opponent-1', fromH3Index: '891f1d48b9fffff', toH3Index: '891f1d48b9fffff' }],
      };
    },
  };
  const result = await handleGameReady(
    { precomputedAiOrders: precomputedOrders, precomputedAiRangedOrders: precomputedRanged },
    deps
  );
  assert.strictEqual(requestOrdersCalled, false);
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.aiOrderCount, 1);
}

/**
 * Defines the `testGameReadyForwardsAiAirStrikeFerryAndEmbarkOrders` function shape (async function testGameReadyForwardsAiAirStrikeFerryAndEmbarkOrders(): Promise<void>).

 * Purpose: Supports maintainability by documenting why `testGameReadyForwardsAiAirStrikeFerryAndEmbarkOrders` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
async function testGameReadyForwardsAiAirStrikeFerryAndEmbarkOrders(): Promise<void> {
  const deps = {
    getGameState: () => minimalPlanningState,
    getGameStateForPlayer: () => minimalPlanningState,
    getSelectedModel: () => 'test-model',
    hasKey: () => true,
    getToolNamesForEnabledGroups: () => ['planning'],
    defaultGroupIds: ['planning'],
    requestOrders: async (): Promise<RequestAiOrdersResult> => ({
      success: true,
      orders: [],
      airStrikes: [
        { unitId: 'opponent-air-1', targetH3Index: '891f1d48b9fffff', targetType: 'units' },
      ],
      ferryOrders: [{ unitId: 'opponent-air-2', destinationH3Index: '891f1d48b9fffff' }],
      embarkOrders: [{ unitId: 'opponent-inf-1', navalUnitId: 'opponent-naval-1' }],
    }),
    ready: (
      aiOrders: { unitId: string; toH3Index: string }[],
      aiRangedOrders: { unitId: string; targetH3Index: string }[],
      aiAirStrikeOrders?: AirStrikeOrder[],
      aiFerryOrders?: FerryOrder[],
      aiEmbarkOrders?: EmbarkOrder[]
    ): ReadyResultMinimal & { success: boolean } => {
      assert.strictEqual(aiOrders.length, 0);
      assert.strictEqual(aiRangedOrders.length, 0);
      assert.strictEqual(aiAirStrikeOrders?.length ?? 0, 1);
      assert.strictEqual(aiFerryOrders?.length ?? 0, 1);
      assert.strictEqual(aiEmbarkOrders?.length ?? 0, 1);
      return { success: true, aiOrderCount: 0 };
    },
  };
  const result = await handleGameReady(
    { enabledToolGroups: ['planning'], aiPlanningRunEnabled: true },
    deps
  );
  assert.strictEqual(result.success, true);
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
        { h3Index: '891f1d48b9fffff', humanUnitSummary: '1 infantry', aiUnitSummary: '1 armor' },
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

 * Purpose: Locks Phase E contract that IPC mirrors `tacticalAutoStartRes1H3Index` only when the resolve layer returns it (Fight path).
 * When to use: Regression guard for melee intercept completion wiring.
 * Expected outcome: Handler output includes the same res1 index the mocked `resolveMeleeIntercept` returned.
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
      tacticalAutoStartRes1H3Index: fightHex,
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
  assert.strictEqual((result as { tacticalAutoStartRes1H3Index?: string }).tacticalAutoStartRes1H3Index, fightHex);
}

/**
 * Defines the `testHandleResolveMeleeInterceptOmitsTacticalAutoStartOnIgnore` function shape (async function testHandleResolveMeleeInterceptOmitsTacticalAutoStartOnIgnore(): Promise<void>).

 * Purpose: Locks Phase E contract that Ignore does not surface tactical auto-start on the IPC completion payload.
 * When to use: Regression guard paired with the Fight forwarding test.
 * Expected outcome: `tacticalAutoStartRes1H3Index` is absent when the mocked resolve result omits it.
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
  assert.strictEqual((result as { tacticalAutoStartRes1H3Index?: string }).tacticalAutoStartRes1H3Index, undefined);
}

async function runAll(): Promise<void> {
  const tests: { name: string; fn: () => void | Promise<void> }[] = [
    { name: 'requestAiOrders not in planning phase', fn: testRequestAiOrdersNotInPlanningPhase },
    { name: 'requestAiOrders no model', fn: testRequestAiOrdersNoModel },
    { name: 'requestAiOrders no key', fn: testRequestAiOrdersNoKey },
    { name: 'requestAiOrders success', fn: testRequestAiOrdersSuccess },
    { name: 'requestAiOrders tactical buffers opponent plan', fn: testRequestAiOrdersTacticalBuffersOpponentPlan },
    { name: 'requestAiOrders cancelled', fn: testRequestAiOrdersCancelled },
    { name: 'game:ready precomputed skips requestOrders', fn: testGameReadyPrecomputedSkipsRequestOrders },
    {
      name: 'game:ready Run off skips LLM (non-event-driven)',
      fn: testGameReadyRunOffSkipsRequestOrdersNonEventDriven,
    },
    { name: 'game:ready precomputed with orders', fn: testGameReadyPrecomputedWithOrders },
    {
      name: 'game:ready forwards AI air strike, ferry, and embark orders',
      fn: testGameReadyForwardsAiAirStrikeFerryAndEmbarkOrders,
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
