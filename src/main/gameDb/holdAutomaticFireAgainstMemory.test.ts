/**
 * Automatic-fire list row: per-seat round trip, listed turns, bad entries, removal, reset, and knockout.
 * Run with: node dist/main/gameDb/holdAutomaticFireAgainstMemory.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { NewGameSeatInput } from '../../shared/ipc/ordersTypes';
import { AI_SEAT_IDS, HUMAN_SEAT_ID, NEUTRAL_OWNER_ID } from '../../shared/seatIds';
import { applyKnockout } from '../gameActions/knockoutConsequences';
import { dbGetAll, dbGetOne, dbRun, resetGameForNewMatch } from '../gameDb';
import { listGameMaps } from '../gameMap/listGameMaps';
import { buildLatLngCoordinateMap } from '../mapData';
import { withSeatedTempGameDb } from '../testSupport/withSeatedTempGameDb';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { selectGameConfigValue, upsertGameConfigValue } from './gameConfigRows';
import {
  HOLD_AUTOMATIC_FIRE_AGAINST_CONFIG_KEY,
  readHoldAutomaticFireAgainstListedTurns,
  readHoldAutomaticFireAgainstSeatIds,
  removeSeatFromHoldAutomaticFireAgainst,
  writeHoldAutomaticFireAgainstSeatIds,
} from './holdAutomaticFireAgainstMemory';

const [FIRST_AI, SECOND_AI, THIRD_AI] = AI_SEAT_IDS;

/**
 * A regional map with at least three side groups.
 *
 * Purpose: Knockout needs a second AI seat whose list stays.
 * When to use: Before opening the temporary match.
 * Expected outcome: The map id and three group ids, or null when none is listed.
 * Exceptions: None.
 */
function threeGroupMap(): { id: string; sideGroupIds: string[] } | null {
  const map = listGameMaps().find((entry) => entry.id === 'western_asia_north' && entry.sideGroups.length >= 3)
    ?? listGameMaps().find((entry) => entry.sideGroups.length >= 3);
  if (!map) return null;
  return { id: map.id, sideGroupIds: map.sideGroups.slice(0, 3).map((group) => group.id) };
}

/**
 * The stored list of one seat, as a sorted array.
 *
 * Purpose: Assertions compare plain arrays.
 * When to use: After a write or a removal in these tests.
 * Expected outcome: The ids the reader returns, sorted.
 * Exceptions: None.
 */
function listed(seatId: string): string[] {
  return [...readHoldAutomaticFireAgainstSeatIds(seatId)].sort();
}

test('a list round-trips, and the stored document has sorted seat keys at both levels', () => {
  withTempGameDb('aw-automatic-fire-memory-', () => {
    const ops = { getOne: dbGetOne, run: dbRun };
    writeHoldAutomaticFireAgainstSeatIds(ops, SECOND_AI, [THIRD_AI, HUMAN_SEAT_ID], 1);
    writeHoldAutomaticFireAgainstSeatIds(ops, FIRST_AI, [SECOND_AI], 1);
    assert.deepEqual(listed(FIRST_AI), [SECOND_AI]);
    assert.deepEqual(listed(SECOND_AI), [HUMAN_SEAT_ID, THIRD_AI]);
    assert.equal(
      selectGameConfigValue(ops, HOLD_AUTOMATIC_FIRE_AGAINST_CONFIG_KEY),
      JSON.stringify({ [FIRST_AI]: { [SECOND_AI]: 1 }, [SECOND_AI]: { [HUMAN_SEAT_ID]: 1, [THIRD_AI]: 1 } }),
    );
  });
});

test('a write stores neither the owning seat nor a duplicate', () => {
  withTempGameDb('aw-automatic-fire-memory-', () => {
    const ops = { getOne: dbGetOne, run: dbRun };
    writeHoldAutomaticFireAgainstSeatIds(ops, FIRST_AI, [SECOND_AI, FIRST_AI, SECOND_AI], 1);
    assert.equal(
      selectGameConfigValue(ops, HOLD_AUTOMATIC_FIRE_AGAINST_CONFIG_KEY),
      JSON.stringify({ [FIRST_AI]: { [SECOND_AI]: 1 } }),
    );
  });
});

test('a side keeps the turn it was first listed for, until it is taken off the list', () => {
  withTempGameDb('aw-automatic-fire-memory-', () => {
    const ops = { getOne: dbGetOne, run: dbRun };
    /**
     * The first seat's listed sides with their turns.
     *
     * Purpose: Assertions compare plain arrays.
     * When to use: After each write.
     * Expected outcome: Pairs of seat id and turn.
     * Exceptions: None.
     */
    const turns = (): [string, number][] => [...readHoldAutomaticFireAgainstListedTurns(FIRST_AI)];
    writeHoldAutomaticFireAgainstSeatIds(ops, FIRST_AI, [SECOND_AI], 3);
    writeHoldAutomaticFireAgainstSeatIds(ops, FIRST_AI, [SECOND_AI, THIRD_AI], 7);
    assert.deepEqual(turns(), [[SECOND_AI, 3], [THIRD_AI, 7]]);
    writeHoldAutomaticFireAgainstSeatIds(ops, FIRST_AI, [THIRD_AI], 8);
    writeHoldAutomaticFireAgainstSeatIds(ops, FIRST_AI, [SECOND_AI, THIRD_AI], 9);
    assert.deepEqual(turns(), [[SECOND_AI, 9], [THIRD_AI, 7]]);
  });
});

test('writing an empty list removes that seat and leaves the other', () => {
  withTempGameDb('aw-automatic-fire-memory-', () => {
    const ops = { getOne: dbGetOne, run: dbRun };
    writeHoldAutomaticFireAgainstSeatIds(ops, FIRST_AI, [SECOND_AI], 1);
    writeHoldAutomaticFireAgainstSeatIds(ops, SECOND_AI, [FIRST_AI], 1);
    writeHoldAutomaticFireAgainstSeatIds(ops, FIRST_AI, [], 1);
    assert.equal(
      selectGameConfigValue(ops, HOLD_AUTOMATIC_FIRE_AGAINST_CONFIG_KEY),
      JSON.stringify({ [SECOND_AI]: { [FIRST_AI]: 1 } }),
    );
  });
});

test('a bad entry leaves the other seat', () => {
  withTempGameDb('aw-automatic-fire-memory-', () => {
    const ops = { getOne: dbGetOne, run: dbRun };
    upsertGameConfigValue(ops, HOLD_AUTOMATIC_FIRE_AGAINST_CONFIG_KEY, JSON.stringify({
      [FIRST_AI]: 'x',
      [SECOND_AI]: { [FIRST_AI]: 2 },
      [THIRD_AI]: { '': 1, [FIRST_AI]: 'soon', [SECOND_AI]: 1.5, [HUMAN_SEAT_ID]: 4 },
    }));
    assert.deepEqual(listed(FIRST_AI), []);
    assert.deepEqual(listed(SECOND_AI), [FIRST_AI]);
    assert.deepEqual(listed(THIRD_AI), [HUMAN_SEAT_ID]);
  });
});

test('a stored value that is not a JSON object reads as an empty list for every seat', () => {
  withTempGameDb('aw-automatic-fire-memory-', () => {
    const ops = { getOne: dbGetOne, run: dbRun };
    upsertGameConfigValue(ops, HOLD_AUTOMATIC_FIRE_AGAINST_CONFIG_KEY, 'not-json');
    assert.deepEqual(listed(FIRST_AI), []);
    assert.deepEqual(listed(SECOND_AI), []);
    upsertGameConfigValue(ops, HOLD_AUTOMATIC_FIRE_AGAINST_CONFIG_KEY, '["x"]');
    assert.deepEqual(listed(FIRST_AI), []);
  });
});

test('a missing row, an owner with no list, and a throwing reader all read as empty', () => {
  withTempGameDb('aw-automatic-fire-memory-', () => {
    assert.deepEqual(listed(FIRST_AI), []);
    assert.deepEqual(listed(HUMAN_SEAT_ID), []);
    assert.deepEqual(listed(NEUTRAL_OWNER_ID), []);
    const thrown = readHoldAutomaticFireAgainstSeatIds(FIRST_AI, {
      getOne: () => {
        throw new Error('db down');
      },
    });
    assert.equal(thrown.size, 0);
  });
});

test('removing a seat drops its list, takes it off other lists, and leaves unrelated entries', () => {
  withTempGameDb('aw-automatic-fire-memory-', () => {
    const ops = { getOne: dbGetOne, run: dbRun };
    writeHoldAutomaticFireAgainstSeatIds(ops, FIRST_AI, [SECOND_AI], 1);
    writeHoldAutomaticFireAgainstSeatIds(ops, SECOND_AI, [HUMAN_SEAT_ID], 1);
    writeHoldAutomaticFireAgainstSeatIds(ops, THIRD_AI, [HUMAN_SEAT_ID, SECOND_AI], 1);
    removeSeatFromHoldAutomaticFireAgainst(ops, SECOND_AI);
    assert.equal(
      selectGameConfigValue(ops, HOLD_AUTOMATIC_FIRE_AGAINST_CONFIG_KEY),
      JSON.stringify({ [THIRD_AI]: { [HUMAN_SEAT_ID]: 1 } }),
    );
    // A seat that appears nowhere changes nothing, so nothing is written.
    removeSeatFromHoldAutomaticFireAgainst({
      getOne: dbGetOne,
      run: () => {
        throw new Error('no write expected');
      },
    }, SECOND_AI);
  });
});

test('a new match deletes the stored lists', () => {
  withTempGameDb('aw-automatic-fire-memory-', () => {
    const ops = { getOne: dbGetOne, run: dbRun };
    writeHoldAutomaticFireAgainstSeatIds(ops, FIRST_AI, [SECOND_AI], 1);
    resetGameForNewMatch();
    assert.equal(selectGameConfigValue(ops, HOLD_AUTOMATIC_FIRE_AGAINST_CONFIG_KEY) ?? null, null);
    assert.deepEqual(listed(FIRST_AI), []);
  });
});

test('knocking a seat out deletes its list and takes it off the other seat', (t) => {
  const map = threeGroupMap();
  if (!map) {
    t.skip('no regional map with three side groups is listed');
    return;
  }
  const seats: NewGameSeatInput[] = [
    { kind: 'human', sideGroupId: map.sideGroupIds[0] },
    { kind: 'ai', sideGroupId: map.sideGroupIds[1] },
    { kind: 'ai', sideGroupId: map.sideGroupIds[2] },
  ];
  withSeatedTempGameDb('aw-automatic-fire-knockout-', { gameMapId: map.id, seats }, () => {
    const ops = { getOne: dbGetOne, run: dbRun };
    const knocked = AI_SEAT_IDS[1];
    const kept = AI_SEAT_IDS[2];
    writeHoldAutomaticFireAgainstSeatIds(ops, knocked, [HUMAN_SEAT_ID], 1);
    writeHoldAutomaticFireAgainstSeatIds(ops, kept, [HUMAN_SEAT_ID, knocked], 1);
    const hexes = dbGetAll<{ h3_index: string }>('SELECT h3_index FROM hexes').map((row) => row.h3_index);
    applyKnockout(knocked, buildLatLngCoordinateMap(hexes));
    assert.deepEqual(listed(knocked), []);
    assert.deepEqual(listed(kept), [HUMAN_SEAT_ID]);
  });
});
