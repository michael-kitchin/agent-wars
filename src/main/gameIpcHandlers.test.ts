/**
 * Tests for game:requestAiOrders, game:cancelRequestAiOrders, and game:ready precomputed path.
 * Happy path and essential failure cases per WEGO execution plan Phase 2. Run with: node dist/gameIpcHandlers.test.js
 */

import * as assert from 'assert';
import {
  handleRequestAiOrders,
  cancelRequestAiOrders,
  handleGameReady,
  type RequestAiOrdersResult,
  type ReadyResultMinimal,
} from './gameIpcHandlers';

const minimalPlanningState = {
  hexes: [{ h3Index: '891f1d48b9fffff', terrain: 'land' as const, terrainKind: 'land' }],
  units: [
    { id: 'human-1', player: 'human', unitType: 'infantry', h3Index: '891f1d48b9fffff' },
    { id: 'opponent-1', player: 'opponent', unitType: 'armor', h3Index: '891f1d48b9fffff' },
  ],
  phase: 'planning' as const,
  turnNumber: 1,
  pendingOrders: [] as { unitId: string; toH3Index: string }[],
};

const resolutionState = { ...minimalPlanningState, phase: 'resolution' as const };

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

async function testRequestAiOrdersNoKey(): Promise<void> {
  const deps = {
    getGameState: () => minimalPlanningState,
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

async function testRequestAiOrdersSuccess(): Promise<void> {
  const controllerRef = { current: null as AbortController | null };
  const deps = {
    getGameState: () => minimalPlanningState,
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

async function testRequestAiOrdersCancelled(): Promise<void> {
  const controllerRef = { current: null as AbortController | null };
  let capturedSignal: AbortSignal | undefined;
  const deps = {
    getGameState: () => minimalPlanningState,
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

async function testGameReadyPrecomputedSkipsRequestOrders(): Promise<void> {
  let requestOrdersCalled = false;
  const deps = {
    getGameState: () => minimalPlanningState,
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

async function testGameReadyPrecomputedWithOrders(): Promise<void> {
  const precomputedOrders = [{ unitId: 'opponent-1', toH3Index: '891f1d48b9fffff' }];
  const precomputedRanged: { unitId: string; targetH3Index: string }[] = [];
  let requestOrdersCalled = false;
  const deps = {
    getGameState: () => minimalPlanningState,
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

async function runAll(): Promise<void> {
  const tests: { name: string; fn: () => void | Promise<void> }[] = [
    { name: 'requestAiOrders not in planning phase', fn: testRequestAiOrdersNotInPlanningPhase },
    { name: 'requestAiOrders no model', fn: testRequestAiOrdersNoModel },
    { name: 'requestAiOrders no key', fn: testRequestAiOrdersNoKey },
    { name: 'requestAiOrders success', fn: testRequestAiOrdersSuccess },
    { name: 'requestAiOrders cancelled', fn: testRequestAiOrdersCancelled },
    { name: 'game:ready precomputed skips requestOrders', fn: testGameReadyPrecomputedSkipsRequestOrders },
    { name: 'game:ready precomputed with orders', fn: testGameReadyPrecomputedWithOrders },
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
