/**
 * Regression tests for tactical post-beat consultation gating in `afterTacticalBeatResolution`.
 *
 * Purpose: Locks strategic-style cadence — the tactical LLM runs only when tactical mandatory rules or subscription events fire, not every Ready beat.
 * When to use: `npm test` after `build:main`.
 * Expected outcome: Empty mandatory/subscription still invokes `requestOrders` when the opponent had no beat-time unit actions; opponent removal still consults; opponent march-only beats skip the idle path.
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
import type { TacticalOpponentPlanPayload } from '../../shared/ipc/readyTypes';
import {
  firstRingCellDistinctFrom,
  tacticalRes1Cell,
  tacticalRes4UnderRes1Corner,
} from '../tacticalBattle/testSupport/tacticalRes4HexFixtures';
import { afterTacticalBeatResolution } from './afterResolution';

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
