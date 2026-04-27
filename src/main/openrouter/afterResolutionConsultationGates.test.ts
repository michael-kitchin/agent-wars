/**
 * Pure predicates for post-resolution LLM consultation gating (`opponent idle` paths).
 * Run with: node dist/main/openrouter/afterResolutionConsultationGates.test.js
 */

import * as assert from 'assert';
import { opponentHadStrategicResolutionUnitActions, opponentHadTacticalBeatResolutionActions } from './afterResolution';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import type { TacticalCommitResolutionPlayback } from '../../shared/ipcTypes';

/**
 * Defines the `minimalTacticalBattle` function shape.

 * Purpose: Minimal `TacticalBattleSnapshot` for tactical idle-detection tests (only `subUnits` matter to the helper).
 * When to use: Tactical predicate cases below.
 * Expected outcome: Structurally valid enough for TypeScript when cast.
 * Exceptions: None.
 */
function minimalTacticalBattle(subUnits: TacticalBattleSnapshot['subUnits']): TacticalBattleSnapshot {
  return {
    battleId: 'gate-test',
    enclosingRes1H3Index: '81193ffffffffff',
    res4ChildH3Indexes: ['81283fffffffffff'],
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    subUnits,
  };
}

/**
 * Defines the `testOpponentHadStrategicResolutionUnitActionsQuietTurn` function shape.

 * Purpose: Happy path for “no opponent march, combat, ferry, or strike” slice.
 * When to use: Regression for `afterResolution` idle branch.
 * Expected outcome: Predicate is false.
 * Exceptions: None.
 */
function testOpponentHadStrategicResolutionUnitActionsQuietTurn(): void {
  assert.strictEqual(
    opponentHadStrategicResolutionUnitActions({
      opponentHadStrategicMarchResolution: false,
    }),
    false
  );
}

/**
 * Defines the `testOpponentHadStrategicResolutionUnitActionsDetectsMarch` function shape.

 * Purpose: Essential signal — march flag from finalize drives non-idle.
 * When to use: Same as strategic idle branch.
 * Expected outcome: Predicate is true when march flag is true.
 * Exceptions: None.
 */
function testOpponentHadStrategicResolutionUnitActionsDetectsMarch(): void {
  assert.strictEqual(
    opponentHadStrategicResolutionUnitActions({
      opponentHadStrategicMarchResolution: true,
    }),
    true
  );
}

/**
 * Defines the `testOpponentHadStrategicResolutionUnitActionsDetectsCombatIds` function shape.

 * Purpose: Opponent listed as combat participant implies non-idle without march.
 * When to use: Same module.
 * Expected outcome: True when `opponentCombatParticipantUnitIds` is non-empty.
 * Exceptions: None.
 */
function testOpponentHadStrategicResolutionUnitActionsDetectsCombatIds(): void {
  assert.strictEqual(
    opponentHadStrategicResolutionUnitActions({
      opponentCombatParticipantUnitIds: ['opponent-armor-1'],
    }),
    true
  );
}

/**
 * Defines the `testOpponentHadTacticalBeatResolutionActionsIdle` function shape.

 * Purpose: Tactical beat with no opponent moves or opponent-authored kills.
 * When to use: Parity with strategic idle branch.
 * Expected outcome: False.
 * Exceptions: None.
 */
function testOpponentHadTacticalBeatResolutionActionsIdle(): void {
  const battle = minimalTacticalBattle([
    {
      id: 'opp-1',
      parentUnitId: 'opp-p',
      player: 'opponent',
      unitType: 'armor',
      h3Index: '81283fffffffffff',
      displayName: 'O',
    },
  ]);
  const playback: TacticalCommitResolutionPlayback = { humanMoves: [] };
  assert.strictEqual(opponentHadTacticalBeatResolutionActions(playback, battle), false);
}

/**
 * Defines the `testOpponentHadTacticalBeatResolutionActionsDetectsMarch` function shape.

 * Purpose: Non-empty `opponentMoves` implies non-idle.
 * When to use: Same module.
 * Expected outcome: True.
 * Exceptions: None.
 */
function testOpponentHadTacticalBeatResolutionActionsDetectsMarch(): void {
  const battle = minimalTacticalBattle([
    {
      id: 'opp-1',
      parentUnitId: 'opp-p',
      player: 'opponent',
      unitType: 'armor',
      h3Index: '81283fffffffffff',
      displayName: 'O',
    },
  ]);
  const playback: TacticalCommitResolutionPlayback = {
    humanMoves: [],
    opponentMoves: [{ unitId: 'opp-1', fromH3Index: '81283fffffffffff', toH3Index: '81284fffffffffff' }],
  };
  assert.strictEqual(opponentHadTacticalBeatResolutionActions(playback, battle), true);
}

/**
 * Defines the `run` function shape (function run(): void).

 * Purpose: Node test driver after `tsc`.
 * When to use: `npm test`.
 * Expected outcome: Prints pass line.
 * Exceptions: None.
 */
function run(): void {
  testOpponentHadStrategicResolutionUnitActionsQuietTurn();
  testOpponentHadStrategicResolutionUnitActionsDetectsMarch();
  testOpponentHadStrategicResolutionUnitActionsDetectsCombatIds();
  testOpponentHadTacticalBeatResolutionActionsIdle();
  testOpponentHadTacticalBeatResolutionActionsDetectsMarch();
  console.log('afterResolutionConsultationGates.test.ts passed');
}

run();
