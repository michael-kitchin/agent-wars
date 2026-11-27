/**
 * Storing the automatic-fire choice of one orders reply.
 * Run with: node dist/main/openRouter/holdAutomaticFireAgainstApply.test.js
 */

import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import type { NewGameSeatInput } from '../../shared/ipc/ordersTypes';
import { AI_SEAT_IDS, HUMAN_SEAT_ID } from '../../shared/seatIds';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { playerIdCodeFor } from '../../shared/unitIds';
import { gameDbOps } from '../gameDb/dbConnection';
import { readHoldAutomaticFireAgainstListedTurns, readHoldAutomaticFireAgainstSeatIds } from '../gameDb/holdAutomaticFireAgainstMemory';
import { writeSeatKnockout } from '../gameDb/seatRosterStore';
import { listGameMaps } from '../gameMap/listGameMaps';
import { withSeatedTempGameDb } from '../testSupport/withSeatedTempGameDb';
import { applyHoldAutomaticFireAgainstChoice } from './holdAutomaticFireAgainstApply';
import type { HoldAutomaticFireAgainstChoice } from './holdAutomaticFireAgainstParsing';

const OWN = AI_SEAT_IDS[0];
const OTHER = AI_SEAT_IDS[1];
const NO_LISTED_CODE = 'holdAutomaticFireAgainst dropped: no listed code names an active side other than your own.';

/**
 * Runs a case on a match with the human and two AI seats.
 *
 * Purpose: A list needs other seats to name.
 * When to use: Every case.
 * Expected outcome: `runCase` sees one human seat and two AI seats, or the test is skipped without a fitting map.
 * Exceptions: Propagates a reset or case error.
 */
function withMatch(t: TestContext, runCase: () => void): void {
  const map = listGameMaps().find((entry) => entry.sideGroups.length >= 3);
  if (!map) {
    t.skip('no regional map with three side groups is listed');
    return;
  }
  const seats: NewGameSeatInput[] = [
    { kind: 'human', sideGroupId: map.sideGroups[0].id },
    { kind: 'ai', sideGroupId: map.sideGroups[1].id },
    { kind: 'ai', sideGroupId: map.sideGroups[2].id },
  ];
  withSeatedTempGameDb('aw-automatic-fire-apply-', { gameMapId: map.id, seats }, runCase);
}

/**
 * Applies one choice for the commander on turn 4.
 *
 * Purpose: Every case applies as the same seat.
 * When to use: Every case.
 * Expected outcome: The drop reasons.
 * Exceptions: None.
 */
function apply(choice: HoldAutomaticFireAgainstChoice | undefined, battle: TacticalBattleSnapshot | null = null): string[] {
  return applyHoldAutomaticFireAgainstChoice({ seatId: OWN, choice, turnNumber: 4, battle }).dropReasons;
}

/**
 * A replace choice for the given codes.
 *
 * Purpose: Keeps each case to the codes it sends.
 * When to use: In the cases of this file.
 * Expected outcome: The parsed-reply shape of a replace.
 * Exceptions: None.
 */
function replace(...sideCodes: string[]): HoldAutomaticFireAgainstChoice {
  return { kind: 'replace', sideCodes };
}

/**
 * The commander's stored list.
 *
 * Purpose: Assertions compare plain arrays.
 * When to use: In the cases of this file.
 * Expected outcome: The stored seat ids, sorted.
 * Exceptions: None.
 */
function stored(): string[] {
  return [...readHoldAutomaticFireAgainstSeatIds(OWN)].sort();
}

/**
 * How many change events are stored.
 *
 * Purpose: A change records one event and an unchanged list records none.
 * When to use: In the cases of this file.
 * Expected outcome: The row count for the event type.
 * Exceptions: None.
 */
function eventCount(): number {
  return gameDbOps.getOne<{ n: number }>(`SELECT COUNT(*) AS n FROM match_records WHERE record_type = 'hold_automatic_fire_against_changed'`)?.n ?? 0;
}

test('a reply without the field writes nothing and records nothing', (t) => {
  withMatch(t, () => {
    assert.deepEqual(apply(undefined), []);
    assert.deepEqual(stored(), []);
    assert.equal(eventCount(), 0);
  });
});

test('a replace stores the named seat and records one event, and the same list again records none', (t) => {
  withMatch(t, () => {
    assert.deepEqual(apply(replace(playerIdCodeFor(OTHER))), []);
    assert.deepEqual(stored(), [OTHER]);
    assert.equal(eventCount(), 1);
    assert.deepEqual(apply(replace(playerIdCodeFor(OTHER))), []);
    assert.equal(eventCount(), 1);
  });
});

test('the human side can be listed', (t) => {
  withMatch(t, () => {
    assert.deepEqual(apply(replace(playerIdCodeFor(HUMAN_SEAT_ID))), []);
    assert.deepEqual(stored(), [HUMAN_SEAT_ID]);
  });
});

test('a seat id resolves as a side code does', (t) => {
  withMatch(t, () => {
    assert.deepEqual(apply(replace(OTHER)), []);
    assert.deepEqual(stored(), [OTHER]);
  });
});

test('the own code is left out with a drop reason and the valid code still applies', (t) => {
  withMatch(t, () => {
    const ownCode = playerIdCodeFor(OWN);
    assert.deepEqual(apply(replace(playerIdCodeFor(OTHER), ownCode)), [
      `holdAutomaticFireAgainst: "${ownCode}" is not an active side other than your own, and was left out.`,
    ]);
    assert.deepEqual(stored(), [OTHER]);
  });
});

test('a list with no usable code keeps the stored list', (t) => {
  withMatch(t, () => {
    apply(replace(playerIdCodeFor(OTHER)));
    const reasons = apply(replace('zz-a-code-far-too-long-to-keep'));
    assert.deepEqual(reasons, [
      'holdAutomaticFireAgainst: "zz-a-code-fa" is not an active side other than your own, and was left out.',
      NO_LISTED_CODE,
    ]);
    assert.deepEqual(stored(), [OTHER]);
    assert.equal(eventCount(), 1);
  });
});

test('a side that is out cannot be listed', (t) => {
  withMatch(t, () => {
    writeSeatKnockout(gameDbOps, { seatId: OTHER, outTurn: 3, outBy: null, outReasons: [], place: 3 });
    const reasons = apply(replace(playerIdCodeFor(OTHER), playerIdCodeFor(HUMAN_SEAT_ID)));
    assert.equal(reasons.length, 1);
    assert.ok(reasons[0]?.includes(`"${playerIdCodeFor(OTHER)}"`));
    assert.deepEqual(stored(), [HUMAN_SEAT_ID]);
  });
});

test('clear empties a stored list once, and clearing an empty list records nothing', (t) => {
  withMatch(t, () => {
    assert.deepEqual(apply({ kind: 'clear' }), []);
    assert.equal(eventCount(), 0);
    apply(replace(playerIdCodeFor(OTHER)));
    assert.deepEqual(apply({ kind: 'clear' }), []);
    assert.deepEqual(stored(), []);
    assert.equal(eventCount(), 2);
  });
});

test('a side listed on the world map counts from that turn, and one listed in a battle from the next', (t) => {
  withMatch(t, () => {
    apply(replace(playerIdCodeFor(OTHER)));
    apply(replace(playerIdCodeFor(OTHER), playerIdCodeFor(HUMAN_SEAT_ID)), { battleId: 'automatic-fire-battle', tacticalTurnNumber: 1 } as TacticalBattleSnapshot);
    const turns = readHoldAutomaticFireAgainstListedTurns(OWN);
    assert.deepEqual([turns.get(OTHER), turns.get(HUMAN_SEAT_ID)], [4, 5]);
  });
});

test('a change made in a battle is recorded on a tactical step', (t) => {
  withMatch(t, () => {
    const battle = { battleId: 'automatic-fire-battle', tacticalTurnNumber: 2 } as TacticalBattleSnapshot;
    apply(replace(playerIdCodeFor(OTHER)), battle);
    const row = gameDbOps.getOne<{ scope: string; battle_id: string; beat_number: number }>(
      `SELECT scope, battle_id, beat_number FROM match_records WHERE record_type = 'hold_automatic_fire_against_changed'`,
    );
    assert.deepEqual(
      [row?.scope, row?.battle_id, row?.beat_number],
      ['tactical', 'automatic-fire-battle', 2],
    );
  });
});
