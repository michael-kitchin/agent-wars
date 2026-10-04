/**
 * Regression tests for tactical post-beat consultation gating in `afterTacticalBeatResolution`.
 *
 * Purpose: Locks post-beat consultation — tactical LLM runs when mandatory/subscription events fire, when the opponent had no beat-time unit actions, or when the human had observable beat actions.
 * When to use: `npm test` after `build:main`.
 * Expected outcome: Opponent-idle and human-observable policy paths invoke `requestOrders`; opponent-only march with no human activity still skips when no callbacks fire; opponent removal still consults via mandatory.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { test } from 'node:test';
import { clearSubscriptions } from '../callbackSubscriptions';
import { closeGameDatabaseForTests, openGameDatabaseAtPathForTests, resetGameForNewMatch } from '../gameDb';
import type { GameStateSnapshot } from '../gameDb';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import type { TacticalCommitResolutionPlayback } from '../../shared/ipcTypes';
import type { TacticalOpponentPlanPayload } from '../../shared/ipc/consultationPushTypes';
import { gridDisk } from 'h3-js';
import {
  firstRingCellDistinctFrom,
  tacticalRes1Cell,
  tacticalRes4UnderRes1Corner,
} from '../tacticalBattle/testSupport/tacticalRes4HexFixtures';
import { afterTacticalBeatResolution } from './afterResolution';
import {
  runEventDrivenAfterTacticalBeatConsultation,
  toTacticalPostBeatConsultFields,
} from '../ipc/readyIpcResolutionMapping';

const emptyTacticalPlan: TacticalOpponentPlanPayload = {
  movementOrders: [],
  rangedAttacks: [],
  airStrikes: [],
  ferryOrders: [],
  embarkOrders: [],
};

function withFreshDb(run: () => Promise<void>): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-after-tactical-'));
  const dbPath = path.join(dir, 't.sqlite');
  return (async () => {
    try {
      openGameDatabaseAtPathForTests(dbPath);
      resetGameForNewMatch();
      clearSubscriptions('opponent');
      await run();
    } finally {
      closeGameDatabaseForTests();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  })();
}

test('afterTacticalBeatResolution invokes LLM when opponent had no beat-time unit actions', async () => {
  await withFreshDb(async () => {
    const res1 = tacticalRes1Cell(12, 34);
    const res4 = tacticalRes4UnderRes1Corner(12, 34, { latEpsilon: 0.01 });
    const state: GameStateSnapshot = {
      turnNumber: 2,
      phase: 'planning',
      hexes: [{ h3Index: res1, terrain: 'land', terrainKind: 'plains' }],
      units: [
        { id: 'human-1', player: 'human', unitType: 'infantry', h3Index: res4 },
        { id: 'opp-sub-1', player: 'opponent', unitType: 'armor', h3Index: res4 },
      ],
      pendingOrders: [],
    };
    const tacticalBattle: TacticalBattleSnapshot = {
      battleId: 'bt-no-events',
      enclosingRes1H3Index: res1,
      res4ChildH3Indexes: [res4],
      strategicTurnNumber: 2,
      tacticalTurnNumber: 1,
      subUnits: [
        {
          id: 'hum-sub-1',
          parentUnitId: 'hum-p',
          player: 'human',
          unitType: 'infantry',
          h3Index: res4,
          displayName: 'Hum A',
        },
        {
          id: 'opp-sub-1',
          parentUnitId: 'opp-parent-1',
          player: 'opponent',
          unitType: 'armor',
          h3Index: res4,
          displayName: 'Opp A',
        },
      ],
    };
    const playback: TacticalCommitResolutionPlayback = { humanMoves: [] };
    let calls = 0;
    const res = await afterTacticalBeatResolution(state, tacticalBattle, playback, {
      modelId: 'test-model',
      enabledToolNames: [],
      hasKey: () => true,
      requestOrders: async () => {
        calls += 1;
        return {
          success: true,
          orders: [],
          tacticalOpponentPlan: emptyTacticalPlan,
        };
      },
    });
    assert.equal(calls, 1);
    assert.equal(res.consulted, true);
    assert.equal(res.attachTacticalOpponentPlanToIpc, true);
  });
});

test('afterTacticalBeatResolution skips LLM when opponent marched and no mandatory or subscription events', async () => {
  await withFreshDb(async () => {
    const res1 = tacticalRes1Cell(12, 34);
    const res4a = tacticalRes4UnderRes1Corner(12, 34, { latEpsilon: 0.01 });
    const res4b = firstRingCellDistinctFrom(res4a);
    const state: GameStateSnapshot = {
      turnNumber: 2,
      phase: 'planning',
      hexes: [{ h3Index: res1, terrain: 'land', terrainKind: 'plains' }],
      units: [],
      pendingOrders: [],
    };
    const tacticalBattle: TacticalBattleSnapshot = {
      battleId: 'bt-opp-march',
      enclosingRes1H3Index: res1,
      res4ChildH3Indexes: [...new Set([res4a, res4b])].sort(),
      strategicTurnNumber: 2,
      tacticalTurnNumber: 1,
      subUnits: [
        {
          id: 'hum-sub-1',
          parentUnitId: 'hum-p',
          player: 'human',
          unitType: 'infantry',
          h3Index: res4b,
          displayName: 'Hum A',
        },
        {
          id: 'opp-sub-1',
          parentUnitId: 'opp-parent-1',
          player: 'opponent',
          unitType: 'armor',
          h3Index: res4a,
          displayName: 'Opp A',
        },
      ],
    };
    const playback: TacticalCommitResolutionPlayback = {
      humanMoves: [],
      opponentMoves: [{ unitId: 'opp-sub-1', fromH3Index: res4a, toH3Index: res4b }],
    };
    let calls = 0;
    const res = await afterTacticalBeatResolution(state, tacticalBattle, playback, {
      modelId: 'test-model',
      enabledToolNames: [],
      hasKey: () => true,
      requestOrders: async () => {
        calls += 1;
        return { success: true, orders: [], tacticalOpponentPlan: emptyTacticalPlan };
      },
    });
    assert.equal(calls, 0);
    assert.equal(res.consulted, false);
    assert.equal(res.attachTacticalOpponentPlanToIpc, false);
  });
});

test('afterTacticalBeatResolution invokes LLM when human marched even if opponent marched without mandatory', async () => {
  await withFreshDb(async () => {
    const res1 = tacticalRes1Cell(12, 34);
    const res4a = tacticalRes4UnderRes1Corner(12, 34, { latEpsilon: 0.01 });
    const res4b = firstRingCellDistinctFrom(res4a);
    const res4c = [...gridDisk(res4a, 2)].find((h) => h !== res4a && h !== res4b) ?? firstRingCellDistinctFrom(res4b);
    const res4d = firstRingCellDistinctFrom(res4c);
    const footprint = [...new Set([res4a, res4b, res4c, res4d])].sort();
    const state: GameStateSnapshot = {
      turnNumber: 2,
      phase: 'planning',
      hexes: [{ h3Index: res1, terrain: 'land', terrainKind: 'plains' }],
      units: [],
      pendingOrders: [],
    };
    const tacticalBattle: TacticalBattleSnapshot = {
      battleId: 'bt-human-obs',
      enclosingRes1H3Index: res1,
      res4ChildH3Indexes: footprint,
      strategicTurnNumber: 2,
      tacticalTurnNumber: 1,
      subUnits: [
        {
          id: 'hum-sub-1',
          parentUnitId: 'hum-p',
          player: 'human',
          unitType: 'infantry',
          h3Index: res4a,
          displayName: 'Hum A',
        },
        {
          id: 'opp-sub-1',
          parentUnitId: 'opp-parent-1',
          player: 'opponent',
          unitType: 'armor',
          h3Index: res4c,
          displayName: 'Opp A',
        },
      ],
    };
    const playback: TacticalCommitResolutionPlayback = {
      humanMoves: [{ unitId: 'hum-sub-1', fromH3Index: res4a, toH3Index: res4b }],
      opponentMoves: [{ unitId: 'opp-sub-1', fromH3Index: res4c, toH3Index: res4d }],
    };
    let calls = 0;
    const res = await afterTacticalBeatResolution(state, tacticalBattle, playback, {
      modelId: 'test-model',
      enabledToolNames: [],
      hasKey: () => true,
      requestOrders: async () => {
        calls += 1;
        return { success: true, orders: [], tacticalOpponentPlan: emptyTacticalPlan };
      },
    });
    assert.equal(calls, 1);
    assert.equal(res.consulted, true);
    assert.equal(res.attachTacticalOpponentPlanToIpc, true);
  });
});

test('afterTacticalBeatResolution invokes requestOrders when opponent loss fires tactical mandatory', async () => {
  await withFreshDb(async () => {
    const res1 = tacticalRes1Cell(12, 34);
    const res4 = tacticalRes4UnderRes1Corner(12, 34, { latEpsilon: 0.01 });
    const state: GameStateSnapshot = {
      turnNumber: 2,
      phase: 'planning',
      hexes: [{ h3Index: res1, terrain: 'land', terrainKind: 'plains' }],
      units: [],
      pendingOrders: [],
    };
    const tacticalBattle: TacticalBattleSnapshot = {
      battleId: 'bt-mandatory',
      enclosingRes1H3Index: res1,
      res4ChildH3Indexes: [res4],
      strategicTurnNumber: 2,
      tacticalTurnNumber: 1,
      subUnits: [
        {
          id: 'hum-sub-1',
          parentUnitId: 'hum-p',
          player: 'human',
          unitType: 'infantry',
          h3Index: res4,
          displayName: 'Hum A',
        },
        {
          id: 'opp-sub-1',
          parentUnitId: 'opp-parent-1',
          player: 'opponent',
          unitType: 'armor',
          h3Index: res4,
          displayName: 'Opp A',
        },
      ],
    };
    const playback: TacticalCommitResolutionPlayback = {
      humanMoves: [],
      rangedRemovedUnits: [{ id: 'opp-sub-1', player: 'opponent', unitType: 'armor', h3Index: res4 }],
    };
    let calls = 0;
    const res = await afterTacticalBeatResolution(state, tacticalBattle, playback, {
      modelId: 'test-model',
      enabledToolNames: [],
      hasKey: () => true,
      requestOrders: async () => {
        calls += 1;
        return { success: true, orders: [], tacticalOpponentPlan: emptyTacticalPlan };
      },
    });
    assert.equal(calls, 1);
    assert.equal(res.consulted, true);
    assert.equal(res.attachTacticalOpponentPlanToIpc, true);
  });
});

test('afterTacticalBeatResolution skips LLM when roster is terminal (annihilation)', async () => {
  await withFreshDb(async () => {
    const res1 = tacticalRes1Cell(12, 34);
    const res4a = tacticalRes4UnderRes1Corner(12, 34, { latEpsilon: 0.01 });
    const res4b = firstRingCellDistinctFrom(res4a);
    const state: GameStateSnapshot = {
      turnNumber: 2,
      phase: 'planning',
      hexes: [{ h3Index: res1, terrain: 'land', terrainKind: 'plains' }],
      units: [],
      pendingOrders: [],
    };
    const tacticalBattle: TacticalBattleSnapshot = {
      battleId: 'bt-annihilation',
      enclosingRes1H3Index: res1,
      res4ChildH3Indexes: [...new Set([res4a, res4b])].sort(),
      strategicTurnNumber: 2,
      tacticalTurnNumber: 1,
      subUnits: [
        {
          id: 'hum-sub-1',
          parentUnitId: 'hum-p',
          player: 'human',
          unitType: 'infantry',
          h3Index: res4b,
          displayName: 'Hum A',
        },
      ],
    };
    const playback: TacticalCommitResolutionPlayback = {
      humanMoves: [{ unitId: 'hum-sub-1', fromH3Index: res4a, toH3Index: res4b }],
    };
    let calls = 0;
    const res = await afterTacticalBeatResolution(state, tacticalBattle, playback, {
      modelId: 'test-model',
      enabledToolNames: [],
      hasKey: () => true,
      requestOrders: async () => {
        calls += 1;
        return { success: true, orders: [], tacticalOpponentPlan: emptyTacticalPlan };
      },
    });
    assert.equal(calls, 0);
    assert.equal(res.consulted, false);
    assert.equal(res.attachTacticalOpponentPlanToIpc, false);
  });
});

test('afterTacticalBeatResolution builds plan from orders and forwards tool counts when requestOrders omits tacticalOpponentPlan', async () => {
  await withFreshDb(async () => {
    const res1 = tacticalRes1Cell(12, 34);
    const res4 = tacticalRes4UnderRes1Corner(12, 34, { latEpsilon: 0.01 });
    const state: GameStateSnapshot = {
      turnNumber: 2,
      phase: 'planning',
      hexes: [{ h3Index: res1, terrain: 'land', terrainKind: 'plains' }],
      units: [
        { id: 'human-1', player: 'human', unitType: 'infantry', h3Index: res4 },
        { id: 'opp-sub-1', player: 'opponent', unitType: 'armor', h3Index: res4 },
      ],
      pendingOrders: [],
    };
    const tacticalBattle: TacticalBattleSnapshot = {
      battleId: 'bt-raw-orders-shape',
      enclosingRes1H3Index: res1,
      res4ChildH3Indexes: [res4],
      strategicTurnNumber: 2,
      tacticalTurnNumber: 1,
      subUnits: [
        {
          id: 'hum-sub-1',
          parentUnitId: 'hum-p',
          player: 'human',
          unitType: 'infantry',
          h3Index: res4,
          displayName: 'Hum A',
        },
        {
          id: 'opp-sub-1',
          parentUnitId: 'opp-parent-1',
          player: 'opponent',
          unitType: 'armor',
          h3Index: res4,
          displayName: 'Opp A',
        },
      ],
    };
    const playback: TacticalCommitResolutionPlayback = { humanMoves: [] };
    const res = await afterTacticalBeatResolution(state, tacticalBattle, playback, {
      modelId: 'test-model',
      enabledToolNames: [],
      hasKey: () => true,
      requestOrders: async () => ({
        success: true,
        orders: [{ unitId: 'opp-sub-1', toH3Index: res4 }],
        strategy: 'push armor',
        message: 'This close, hesitation is already a casualty.',
        toolInvocationCounts: { planning: 7, assessment: 0 },
      }),
    });
    assert.equal(res.consulted, true);
    assert.equal(res.attachTacticalOpponentPlanToIpc, true);
    assert.equal(res.tacticalOpponentPlan?.movementOrders.length, 1);
    assert.equal(res.tacticalOpponentPlan?.movementOrders[0]?.unitId, 'opp-sub-1');
    assert.equal(res.strategy, 'push armor');
    assert.equal(res.message, 'This close, hesitation is already a casualty.');
    assert.deepEqual(res.toolInvocationCounts, { planning: 7, assessment: 0 });
  });
});

test('runEventDrivenAfterTacticalBeatConsultation forwards message onto IPC consult fields', async () => {
  await withFreshDb(async () => {
    const res1 = tacticalRes1Cell(12, 34);
    const res4 = tacticalRes4UnderRes1Corner(12, 34, { latEpsilon: 0.01 });
    const state: GameStateSnapshot = {
      turnNumber: 2,
      phase: 'planning',
      hexes: [{ h3Index: res1, terrain: 'land', terrainKind: 'plains' }],
      units: [
        { id: 'human-1', player: 'human', unitType: 'infantry', h3Index: res4 },
        { id: 'opp-sub-1', player: 'opponent', unitType: 'armor', h3Index: res4 },
      ],
      pendingOrders: [],
    };
    const tacticalBattle: TacticalBattleSnapshot = {
      battleId: 'bt-message-ipc',
      enclosingRes1H3Index: res1,
      res4ChildH3Indexes: [res4],
      strategicTurnNumber: 2,
      tacticalTurnNumber: 1,
      subUnits: [
        {
          id: 'hum-sub-1',
          parentUnitId: 'hum-p',
          player: 'human',
          unitType: 'infantry',
          h3Index: res4,
          displayName: 'Hum A',
        },
        {
          id: 'opp-sub-1',
          parentUnitId: 'opp-parent-1',
          player: 'opponent',
          unitType: 'armor',
          h3Index: res4,
          displayName: 'Opp A',
        },
      ],
    };
    const merge = await runEventDrivenAfterTacticalBeatConsultation({
      useEventDrivenConsultation: true,
      aiPlanningRunEnabled: true,
      opponentState: state,
      tacticalBattle,
      tacticalResolutionPlayback: { humanMoves: [] },
      modelId: 'test-model',
      enabledToolNames: [],
      hasKey: () => true,
      requestOrders: async () => ({
        success: true,
        orders: [],
        strategy: 'push armor',
        message: 'This close, hesitation is already a casualty.',
      }),
      timeoutMs: 5000,
      errorLogMessage: 'test: afterTacticalBeatResolution failed',
    });
    const fields = toTacticalPostBeatConsultFields(tacticalBattle.battleId, merge);
    assert.equal(fields.aiStrategy, 'push armor');
    assert.equal(fields.aiMessage, 'This close, hesitation is already a casualty.');
  });
});
