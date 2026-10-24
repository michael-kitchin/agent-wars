/**
 * Regression: ranged/air submission flags count as tactical beat activity without marches or kills.
 * Run: `node dist/main/openRouter/consultationPolicyTacticalRangedAirActivity.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import type { TacticalCommitResolutionPlayback } from '../../shared/ipcTypes';
import {
  enemyHadTacticalBeatResolutionActions,
  seatHadTacticalBeatResolutionActions,
} from './consultationPolicy';

const minimalBattle: TacticalBattleSnapshot = {
  battleId: 'bt-policy',
  enclosingStrategicH3Index: '811f3ffffffffff',
  tacticalChildH3Indexes: ['842830fffffffff'],
  strategicTurnNumber: 1,
  tacticalTurnNumber: 1,
  subUnits: [
    {
      id: 'h:01',
      parentUnitId: 'h',
      player: 'human',
      unitType: 'infantry',
      h3Index: '842830fffffffff',
      displayName: 'H',
    },
    {
      id: 'o:01',
      parentUnitId: 'o',
      player: 'opponent',
      unitType: 'infantry',
      h3Index: '842831fffffffff',
      displayName: 'O',
    },
  ],
};

test('human ranged/air submission flag counts as beat activity without human marches', () => {
  const playback: TacticalCommitResolutionPlayback = {
    humanMoves: [],
    humanBeatHadSubmittedRangedOrAirOrders: true,
  };
  assert.equal(enemyHadTacticalBeatResolutionActions(playback, minimalBattle, 'opponent'), true);
});

test('opponent ranged/air submission flag counts as beat activity without opponent marches', () => {
  const playback: TacticalCommitResolutionPlayback = {
    humanMoves: [],
    opponentBeatHadSubmittedRangedOrAirOrders: true,
  };
  assert.equal(seatHadTacticalBeatResolutionActions(playback, minimalBattle, 'opponent'), true);
});

test('no moves, no ranged/air flags, and no kills yields no opponent activity', () => {
  const playback: TacticalCommitResolutionPlayback = {
    humanMoves: [],
  };
  assert.equal(seatHadTacticalBeatResolutionActions(playback, minimalBattle, 'opponent'), false);
});
