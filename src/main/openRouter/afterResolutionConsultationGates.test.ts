/**
 * Pure predicates for post-resolution LLM consultation gating (opponent idle and human-observable paths).
 * Run with: node dist/main/openRouter/afterResolutionConsultationGates.test.js
 */

import * as assert from 'assert';
import {
  humanHadStrategicResolutionObservableActions,
  humanHadTacticalBeatResolutionActions,
  opponentHadStrategicResolutionUnitActions,
  opponentHadTacticalBeatResolutionActions,
} from './afterResolution';
import type { TacticalCommitResolutionPlayback } from '../../shared/ipcTypes';
import { emptyOpponentState, minimalTacticalBattle } from './testSupport/postResolutionConsultationFixtures';

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
 * Defines the `testHumanHadStrategicResolutionObservableActionsHumanMove` function shape.

 * Purpose: Human march rows in `ReadyResult` trigger observable detection.
 * When to use: `afterResolution` human policy branch.
 * Expected outcome: True when `fromH3Index !== toH3Index`.
 * Exceptions: None.
 */
function testHumanHadStrategicResolutionObservableActionsHumanMove(): void {
  assert.strictEqual(
    humanHadStrategicResolutionObservableActions(
      {
        humanMoves: [{ unitId: 'human-infantry-1', fromH3Index: '81193ffffffffff', toH3Index: '81195ffffffffff' }],
      },
      emptyOpponentState()
    ),
    true
  );
}

/**
 * Defines the `testHumanHadStrategicResolutionObservableActionsKillFallback` function shape.

 * Purpose: When the opponent snapshot lists no human `units`, killer ids still match human ownership.
 * When to use: Fog-masked opponent perspective.
 * Expected outcome: True for `killsByDirectFire` with a `human-*` or compact `h1-*` killer.
 * Exceptions: None.
 */
function testHumanHadStrategicResolutionObservableActionsKillFallback(): void {
  assert.strictEqual(
    humanHadStrategicResolutionObservableActions(
      {
        killsByDirectFire: [{ victimId: 'opponent-infantry-1', killerIds: ['human-armor-1'] }],
      },
      emptyOpponentState()
    ),
    true
  );
  assert.strictEqual(
    humanHadStrategicResolutionObservableActions(
      {
        killsByDirectFire: [{ victimId: 'a1-i1', killerIds: ['h1-t1'] }],
      },
      emptyOpponentState()
    ),
    true,
    'compact human killer ids must still count when the roster is masked'
  );
}

/**
 * Defines the `testHumanHadStrategicResolutionObservableActionsQuiet` function shape.

 * Purpose: No moves, ferry, strikes, or kill edges means no human observable activity.
 * When to use: Same module.
 * Expected outcome: False.
 * Exceptions: None.
 */
function testHumanHadStrategicResolutionObservableActionsQuiet(): void {
  assert.strictEqual(humanHadStrategicResolutionObservableActions({}, emptyOpponentState()), false);
}

/**
 * Defines the `testHumanHadTacticalBeatResolutionActionsHumanMarch` function shape.

 * Purpose: Tactical human march segment triggers observable detection.
 * When to use: `afterTacticalBeatResolution` human policy branch.
 * Expected outcome: True.
 * Exceptions: None.
 */
function testHumanHadTacticalBeatResolutionActionsHumanMarch(): void {
  const battle = minimalTacticalBattle([
    {
      id: 'hum-1',
      parentUnitId: 'hp',
      player: 'human',
      unitType: 'infantry',
      h3Index: '81283fffffffffff',
      displayName: 'H',
    },
  ]);
  const playback: TacticalCommitResolutionPlayback = {
    humanMoves: [{ unitId: 'hum-1', fromH3Index: '81283fffffffffff', toH3Index: '81284fffffffffff' }],
  };
  assert.strictEqual(humanHadTacticalBeatResolutionActions(playback, battle), true);
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
  testHumanHadStrategicResolutionObservableActionsHumanMove();
  testHumanHadStrategicResolutionObservableActionsKillFallback();
  testHumanHadStrategicResolutionObservableActionsQuiet();
  testHumanHadTacticalBeatResolutionActionsHumanMarch();
  console.log('afterResolutionConsultationGates.test.ts passed');
}

run();
