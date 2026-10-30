/**
 * Pure predicates for post-resolution LLM consultation gating (opponent idle and human-observable paths).
 * Run with: node dist/main/openRouter/afterResolutionConsultationGates.test.js
 */

import * as assert from 'assert';
import {
  enemyHadStrategicResolutionObservableActions,
  enemyHadTacticalBeatResolutionActions,
  seatHadStrategicResolutionUnitActions,
  seatHadTacticalBeatResolutionActions,
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
    seatHadStrategicResolutionUnitActions(
      {
        hadStrategicMarchResolutionBySeat: { opponent: false },
      },
      'opponent'
    ),
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
    seatHadStrategicResolutionUnitActions(
      {
        hadStrategicMarchResolutionBySeat: { opponent: true },
      },
      'opponent'
    ),
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
    seatHadStrategicResolutionUnitActions(
      {
        combatParticipantUnitIdsBySeat: { opponent: ['opponent-armor-1'] },
      },
      'opponent'
    ),
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
  assert.strictEqual(seatHadTacticalBeatResolutionActions(playback, battle, 'opponent'), false);
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
  assert.strictEqual(seatHadTacticalBeatResolutionActions(playback, battle, 'opponent'), true);
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
    enemyHadStrategicResolutionObservableActions(
      {
        humanMoves: [{ unitId: 'human-infantry-1', fromH3Index: '81193ffffffffff', toH3Index: '81195ffffffffff' }],
      },
      emptyOpponentState(),
      'opponent'
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
    enemyHadStrategicResolutionObservableActions(
      {
        killsByDirectFire: [{ victimId: 'opponent-infantry-1', killerIds: ['human-armor-1'] }],
      },
      emptyOpponentState(),
      'opponent'
    ),
    true
  );
  assert.strictEqual(
    enemyHadStrategicResolutionObservableActions(
      {
        killsByDirectFire: [{ victimId: 'a1-i1', killerIds: ['h1-t1'] }],
      },
      emptyOpponentState(),
      'opponent'
    ),
    true,
    'compact human killer ids must still count when the roster is masked'
  );
}

/**
 * A move whose stored owner is this seat is not enemy activity, even when the id prefix is another side's.
 *
 * Purpose: A rehired unit keeps its first owner's prefix.
 * When to use: Same module.
 * Expected outcome: False.
 * Exceptions: None.
 */
function testOwnSeatPlayerOnAnAiMoveIsNotEnemyActivity(): void {
  assert.strictEqual(
    enemyHadStrategicResolutionObservableActions(
      {
        aiMoves: [{ unitId: 'h1-i1', fromH3Index: '81193ffffffffff', toH3Index: '81195ffffffffff', player: 'opponent' }],
      },
      emptyOpponentState(),
      'opponent'
    ),
    false
  );
}

/**
 * A removed killer's stored owner beats the side encoded in its id.
 *
 * Purpose: A rehired unit that dies this turn is no longer on the live roster.
 * When to use: Same module.
 * Expected outcome: False when that owner is the seat being asked about.
 * Exceptions: None.
 */
function testRemovedUnitOwnerBeatsIdPrefix(): void {
  assert.strictEqual(
    enemyHadStrategicResolutionObservableActions(
      {
        killsByDirectFire: [{ victimId: 'a1-i1', killerIds: ['h1-t1'] }],
        removedUnits: [{ id: 'h1-t1', player: 'opponent', unitType: 'armor', h3Index: '81193ffffffffff' }],
      },
      emptyOpponentState(),
      'opponent'
    ),
    false
  );
}

/**
 * No moves, ferry, strikes, or kill edges means no observable activity.
 *
 * Purpose: The quiet turn does not call the model from this predicate.
 * When to use: Same module.
 * Expected outcome: False.
 * Exceptions: None.
 */
function testHumanHadStrategicResolutionObservableActionsQuiet(): void {
  assert.strictEqual(enemyHadStrategicResolutionObservableActions({}, emptyOpponentState(), 'opponent'), false);
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
  assert.strictEqual(enemyHadTacticalBeatResolutionActions(playback, battle, 'opponent'), true);
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
  testOwnSeatPlayerOnAnAiMoveIsNotEnemyActivity();
  testRemovedUnitOwnerBeatsIdPrefix();
  testHumanHadStrategicResolutionObservableActionsQuiet();
  testHumanHadTacticalBeatResolutionActionsHumanMarch();
  console.log('afterResolutionConsultationGates.test.ts passed');
}

run();
