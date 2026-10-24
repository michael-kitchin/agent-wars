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
import { AI_SEAT_IDS } from '../../shared/seatIds';
import { clearSubscriptions } from '../callbackSubscriptions';
import { closeGameDatabaseForTests, dbGetAll, dbRun, openGameDatabaseAtPathForTests, resetGameForNewMatch } from '../gameDb';
import { updateSeatCommander } from '../gameDb/seatRosterStore';
import { resetCommanderPool } from './commanderPool';
import type { GameStateSnapshot } from '../gameDb';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import type { TacticalCommitResolutionPlayback } from '../../shared/ipcTypes';
import type { TacticalOpponentPlanPayload } from '../../shared/ipc/consultationPushTypes';
import { gridDisk } from 'h3-js';
import {
  firstRingCellDistinctFrom,
  tacticalParentCell,
  tacticalUnderCorner,
} from '../tacticalBattle/testSupport/tacticalHexFixtures';
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
    const strategic = tacticalParentCell(12, 34);
    const tacticalIndex = tacticalUnderCorner(12, 34, { latEpsilon: 0.01 });
    const state: GameStateSnapshot = {
      turnNumber: 2,
      phase: 'planning',
      hexes: [{ h3Index: strategic, terrain: 'land', terrainKind: 'plains' }],
      units: [
        { id: 'human-1', player: 'human', unitType: 'infantry', h3Index: tacticalIndex },
        { id: 'opp-sub-1', player: 'opponent', unitType: 'armor', h3Index: tacticalIndex },
      ],
      pendingOrders: [],
    };
    const tacticalBattle: TacticalBattleSnapshot = {
      battleId: 'bt-no-events',
      enclosingStrategicH3Index: strategic,
      tacticalChildH3Indexes: [tacticalIndex],
      strategicTurnNumber: 2,
      tacticalTurnNumber: 1,
      subUnits: [
        {
          id: 'hum-sub-1',
          parentUnitId: 'hum-p',
          player: 'human',
          unitType: 'infantry',
          h3Index: tacticalIndex,
          displayName: 'Hum A',
        },
        {
          id: 'opp-sub-1',
          parentUnitId: 'opp-parent-1',
          player: 'opponent',
          unitType: 'armor',
          h3Index: tacticalIndex,
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
    const strategic = tacticalParentCell(12, 34);
    const tacticala = tacticalUnderCorner(12, 34, { latEpsilon: 0.01 });
    const tacticalb = firstRingCellDistinctFrom(tacticala);
    const state: GameStateSnapshot = {
      turnNumber: 2,
      phase: 'planning',
      hexes: [{ h3Index: strategic, terrain: 'land', terrainKind: 'plains' }],
      units: [],
      pendingOrders: [],
    };
    const tacticalBattle: TacticalBattleSnapshot = {
      battleId: 'bt-opp-march',
      enclosingStrategicH3Index: strategic,
      tacticalChildH3Indexes: [...new Set([tacticala, tacticalb])].sort(),
      strategicTurnNumber: 2,
      tacticalTurnNumber: 1,
      subUnits: [
        {
          id: 'hum-sub-1',
          parentUnitId: 'hum-p',
          player: 'human',
          unitType: 'infantry',
          h3Index: tacticalb,
          displayName: 'Hum A',
        },
        {
          id: 'opp-sub-1',
          parentUnitId: 'opp-parent-1',
          player: 'opponent',
          unitType: 'armor',
          h3Index: tacticala,
          displayName: 'Opp A',
        },
      ],
    };
    const playback: TacticalCommitResolutionPlayback = {
      humanMoves: [],
      opponentMoves: [{ unitId: 'opp-sub-1', fromH3Index: tacticala, toH3Index: tacticalb }],
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
    const strategic = tacticalParentCell(12, 34);
    const tacticala = tacticalUnderCorner(12, 34, { latEpsilon: 0.01 });
    const tacticalb = firstRingCellDistinctFrom(tacticala);
    const tacticalc = [...gridDisk(tacticala, 2)].find((h) => h !== tacticala && h !== tacticalb) ?? firstRingCellDistinctFrom(tacticalb);
    const tacticald = firstRingCellDistinctFrom(tacticalc);
    const footprint = [...new Set([tacticala, tacticalb, tacticalc, tacticald])].sort();
    const state: GameStateSnapshot = {
      turnNumber: 2,
      phase: 'planning',
      hexes: [{ h3Index: strategic, terrain: 'land', terrainKind: 'plains' }],
      units: [],
      pendingOrders: [],
    };
    const tacticalBattle: TacticalBattleSnapshot = {
      battleId: 'bt-human-obs',
      enclosingStrategicH3Index: strategic,
      tacticalChildH3Indexes: footprint,
      strategicTurnNumber: 2,
      tacticalTurnNumber: 1,
      subUnits: [
        {
          id: 'hum-sub-1',
          parentUnitId: 'hum-p',
          player: 'human',
          unitType: 'infantry',
          h3Index: tacticala,
          displayName: 'Hum A',
        },
        {
          id: 'opp-sub-1',
          parentUnitId: 'opp-parent-1',
          player: 'opponent',
          unitType: 'armor',
          h3Index: tacticalc,
          displayName: 'Opp A',
        },
      ],
    };
    const playback: TacticalCommitResolutionPlayback = {
      humanMoves: [{ unitId: 'hum-sub-1', fromH3Index: tacticala, toH3Index: tacticalb }],
      opponentMoves: [{ unitId: 'opp-sub-1', fromH3Index: tacticalc, toH3Index: tacticald }],
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
    const strategic = tacticalParentCell(12, 34);
    const tacticalIndex = tacticalUnderCorner(12, 34, { latEpsilon: 0.01 });
    const state: GameStateSnapshot = {
      turnNumber: 2,
      phase: 'planning',
      hexes: [{ h3Index: strategic, terrain: 'land', terrainKind: 'plains' }],
      units: [],
      pendingOrders: [],
    };
    const tacticalBattle: TacticalBattleSnapshot = {
      battleId: 'bt-mandatory',
      enclosingStrategicH3Index: strategic,
      tacticalChildH3Indexes: [tacticalIndex],
      strategicTurnNumber: 2,
      tacticalTurnNumber: 1,
      subUnits: [
        {
          id: 'hum-sub-1',
          parentUnitId: 'hum-p',
          player: 'human',
          unitType: 'infantry',
          h3Index: tacticalIndex,
          displayName: 'Hum A',
        },
        {
          id: 'opp-sub-1',
          parentUnitId: 'opp-parent-1',
          player: 'opponent',
          unitType: 'armor',
          h3Index: tacticalIndex,
          displayName: 'Opp A',
        },
      ],
    };
    const playback: TacticalCommitResolutionPlayback = {
      humanMoves: [],
      rangedRemovedUnits: [{ id: 'opp-sub-1', player: 'opponent', unitType: 'armor', h3Index: tacticalIndex }],
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
    const strategic = tacticalParentCell(12, 34);
    const tacticala = tacticalUnderCorner(12, 34, { latEpsilon: 0.01 });
    const tacticalb = firstRingCellDistinctFrom(tacticala);
    const state: GameStateSnapshot = {
      turnNumber: 2,
      phase: 'planning',
      hexes: [{ h3Index: strategic, terrain: 'land', terrainKind: 'plains' }],
      units: [],
      pendingOrders: [],
    };
    const tacticalBattle: TacticalBattleSnapshot = {
      battleId: 'bt-annihilation',
      enclosingStrategicH3Index: strategic,
      tacticalChildH3Indexes: [...new Set([tacticala, tacticalb])].sort(),
      strategicTurnNumber: 2,
      tacticalTurnNumber: 1,
      subUnits: [
        {
          id: 'hum-sub-1',
          parentUnitId: 'hum-p',
          player: 'human',
          unitType: 'infantry',
          h3Index: tacticalb,
          displayName: 'Hum A',
        },
      ],
    };
    const playback: TacticalCommitResolutionPlayback = {
      humanMoves: [{ unitId: 'hum-sub-1', fromH3Index: tacticala, toH3Index: tacticalb }],
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
    const strategic = tacticalParentCell(12, 34);
    const tacticalIndex = tacticalUnderCorner(12, 34, { latEpsilon: 0.01 });
    const state: GameStateSnapshot = {
      turnNumber: 2,
      phase: 'planning',
      hexes: [{ h3Index: strategic, terrain: 'land', terrainKind: 'plains' }],
      units: [
        { id: 'human-1', player: 'human', unitType: 'infantry', h3Index: tacticalIndex },
        { id: 'opp-sub-1', player: 'opponent', unitType: 'armor', h3Index: tacticalIndex },
      ],
      pendingOrders: [],
    };
    const tacticalBattle: TacticalBattleSnapshot = {
      battleId: 'bt-raw-orders-shape',
      enclosingStrategicH3Index: strategic,
      tacticalChildH3Indexes: [tacticalIndex],
      strategicTurnNumber: 2,
      tacticalTurnNumber: 1,
      subUnits: [
        {
          id: 'hum-sub-1',
          parentUnitId: 'hum-p',
          player: 'human',
          unitType: 'infantry',
          h3Index: tacticalIndex,
          displayName: 'Hum A',
        },
        {
          id: 'opp-sub-1',
          parentUnitId: 'opp-parent-1',
          player: 'opponent',
          unitType: 'armor',
          h3Index: tacticalIndex,
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
        orders: [{ unitId: 'opp-sub-1', toH3Index: tacticalIndex }],
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
    const strategic = tacticalParentCell(12, 34);
    const tacticalIndex = tacticalUnderCorner(12, 34, { latEpsilon: 0.01 });
    const state: GameStateSnapshot = {
      turnNumber: 2,
      phase: 'planning',
      hexes: [{ h3Index: strategic, terrain: 'land', terrainKind: 'plains' }],
      units: [
        { id: 'human-1', player: 'human', unitType: 'infantry', h3Index: tacticalIndex },
        { id: 'opp-sub-1', player: 'opponent', unitType: 'armor', h3Index: tacticalIndex },
      ],
      pendingOrders: [],
    };
    const tacticalBattle: TacticalBattleSnapshot = {
      battleId: 'bt-message-ipc',
      enclosingStrategicH3Index: strategic,
      tacticalChildH3Indexes: [tacticalIndex],
      strategicTurnNumber: 2,
      tacticalTurnNumber: 1,
      subUnits: [
        {
          id: 'hum-sub-1',
          parentUnitId: 'hum-p',
          player: 'human',
          unitType: 'infantry',
          h3Index: tacticalIndex,
          displayName: 'Hum A',
        },
        {
          id: 'opp-sub-1',
          parentUnitId: 'opp-parent-1',
          player: 'opponent',
          unitType: 'armor',
          h3Index: tacticalIndex,
          displayName: 'Opp A',
        },
      ],
    };
    updateSeatCommander({ run: dbRun, getAll: dbGetAll }, AI_SEAT_IDS[0], {
      modelId: 'test-model',
      reasoningEffort: null,
      doctrineChoice: 'balanced',
    });
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
    resetCommanderPool([]);
  });
});
