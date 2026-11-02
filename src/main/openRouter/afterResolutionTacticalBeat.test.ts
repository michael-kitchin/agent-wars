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
    }, AI_SEAT_IDS[0]);
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
    }, AI_SEAT_IDS[0]);
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
    }, AI_SEAT_IDS[0]);
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
    }, AI_SEAT_IDS[0]);
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
    }, AI_SEAT_IDS[0]);
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
    }, AI_SEAT_IDS[0]);
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
      providerSort: 'throughput',
      doctrineChoice: 'balanced',
    });
    const merge = await runEventDrivenAfterTacticalBeatConsultation({
      useEventDrivenConsultation: true,
      aiPlanningRunEnabled: true,
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

/**
 * A two-AI battle whose four sub-units stay on the snapshot after the beat.
 *
 * Purpose: Post-beat policy attributes marches by the roster owner, so the movers have to remain listed.
 * When to use: The AI-only consult cases in this file.
 * Expected outcome: `leadPartyId` is the first AI seat and `opposingPartyId` is the second, with two sub-units each.
 * Exceptions: None.
 */
function twoAiBeatBattle(): { state: GameStateSnapshot; battle: TacticalBattleSnapshot; cellA: string; cellB: string } {
  const strategic = tacticalParentCell(18, 40);
  const cellA = tacticalUnderCorner(18, 40, { latEpsilon: 0.02 });
  const cellB = firstRingCellDistinctFrom(cellA);
  const state: GameStateSnapshot = {
    turnNumber: 3,
    phase: 'planning',
    hexes: [{ h3Index: strategic, terrain: 'land', terrainKind: 'plains' }],
    units: [],
    pendingOrders: [],
  };
  const battle: TacticalBattleSnapshot = {
    battleId: 'bt-two-ai',
    enclosingStrategicH3Index: strategic,
    tacticalChildH3Indexes: [cellA, cellB],
    strategicTurnNumber: 3,
    tacticalTurnNumber: 2,
    leadPartyId: 'opponent',
    opposingPartyId: 'opponent2',
    subUnits: [
      { id: 'opp-sub-1', parentUnitId: 'opp-parent-1', player: 'opponent', unitType: 'infantry', h3Index: cellA, displayName: 'Lead A' },
      { id: 'opp-sub-2', parentUnitId: 'opp-parent-2', player: 'opponent', unitType: 'armor', h3Index: cellB, displayName: 'Lead B' },
      { id: 'a2-sub-1', parentUnitId: 'a2-parent-1', player: 'opponent2', unitType: 'infantry', h3Index: cellA, displayName: 'Other A' },
      { id: 'a2-sub-2', parentUnitId: 'a2-parent-2', player: 'opponent2', unitType: 'armor', h3Index: cellB, displayName: 'Other B' },
    ],
  };
  return { state, battle, cellA, cellB };
}

test('an AI-only post-beat consult asks the requested seat', async () => {
  await withFreshDb(async () => {
    clearSubscriptions('opponent2');
    const { state, battle } = twoAiBeatBattle();
    const seen: string[] = [];
    const res = await afterTacticalBeatResolution(state, battle, { humanMoves: [] }, {
      modelId: 'test-model',
      enabledToolNames: [],
      hasKey: () => true,
      requestOrders: async (_state, _modelId, options) => {
        seen.push(options.seatId);
        return { success: true, orders: [], tacticalOpponentPlan: emptyTacticalPlan };
      },
    }, 'opponent');
    assert.deepEqual(seen, ['opponent']);
    assert.equal(res.consulted, true);
  });
});

test('on an AI-only beat, the seat that marched alone is not consulted and the idle seat is', async () => {
  await withFreshDb(async () => {
    clearSubscriptions('opponent2');
    const { state, battle, cellA, cellB } = twoAiBeatBattle();
    const playback: TacticalCommitResolutionPlayback = {
      humanMoves: [],
      opponentMoves: [{ unitId: 'opp-sub-1', fromH3Index: cellA, toH3Index: cellB }],
    };
    const marched = await afterTacticalBeatResolution(state, battle, playback, {
      modelId: 'test-model',
      enabledToolNames: [],
      hasKey: () => true,
      requestOrders: async () => {
        throw new Error('the seat that marched should not be consulted');
      },
    }, 'opponent');
    assert.equal(marched.consulted, false);
    const seen: string[] = [];
    const idle = await afterTacticalBeatResolution(state, battle, playback, {
      modelId: 'test-model',
      enabledToolNames: [],
      hasKey: () => true,
      requestOrders: async (_state, _modelId, options) => {
        seen.push(options.seatId);
        return { success: true, orders: [], tacticalOpponentPlan: emptyTacticalPlan };
      },
    }, 'opponent2');
    assert.deepEqual(seen, ['opponent2']);
    assert.equal(idle.consulted, true);
  });
});

test('on an AI-only beat, both seats are consulted when both marched', async () => {
  await withFreshDb(async () => {
    clearSubscriptions('opponent2');
    const { state, battle, cellA, cellB } = twoAiBeatBattle();
    const playback: TacticalCommitResolutionPlayback = {
      humanMoves: [],
      opponentMoves: [
        { unitId: 'opp-sub-1', fromH3Index: cellA, toH3Index: cellB },
        { unitId: 'a2-sub-1', fromH3Index: cellA, toH3Index: cellB },
      ],
    };
    for (const seatId of ['opponent', 'opponent2'] as const) {
      const seen: string[] = [];
      const res = await afterTacticalBeatResolution(state, battle, playback, {
        modelId: 'test-model',
        enabledToolNames: [],
        hasKey: () => true,
        requestOrders: async (_state, _modelId, options) => {
          seen.push(options.seatId);
          return { success: true, orders: [], tacticalOpponentPlan: emptyTacticalPlan };
        },
      }, seatId);
      assert.deepEqual(seen, [seatId]);
      assert.equal(res.consulted, true);
    }
  });
});
