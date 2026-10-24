import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AI_SEAT_IDS, HUMAN_SEAT_ID } from '../../shared/seatIds';
import { DEFAULT_DOCTRINE, type SeatRecord } from '../../shared/seatRoster';
import { dbGetAll, dbRun } from '../gameDb';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { readSeatRoster, replaceSeatRoster, updateSeatCommander } from './seatRosterStore';

/**
 * One stored seat with the outcome fields a round trip must keep.
 *
 * Purpose: The roster test checks every column, not only the names.
 * When to use: Building the three-row fixture.
 * Expected outcome: A human row has no commander. An AI row keeps the doctrine that was written.
 * Exceptions: None.
 */
function seat(fields: Pick<SeatRecord, 'seatId' | 'seatOrder' | 'kind' | 'homeRegion' | 'commander'> & Partial<SeatRecord>): SeatRecord {
  return {
    outTurn: null,
    outBy: null,
    outReasons: [],
    place: null,
    consultationCount: 0,
    costUsd: 0,
    ...fields,
  };
}

test('a roster round-trips in seat order and rejects a duplicate order', () => {
  withTempGameDb('aw-seat-roster-', () => {
    const written: SeatRecord[] = [
      seat({
        seatId: AI_SEAT_IDS[1],
        seatOrder: 2,
        kind: 'ai',
        homeRegion: 'East',
        commander: { modelId: 'model-b', reasoningEffort: 'low', doctrineChoice: 'random', doctrine: 'cautious' },
        outTurn: 4,
        outBy: HUMAN_SEAT_ID,
        outReasons: ['home_control', 'no_city_hexes'],
        place: 3,
        consultationCount: 2,
        costUsd: 1.25,
      }),
      seat({
        seatId: HUMAN_SEAT_ID,
        seatOrder: 1,
        kind: 'human',
        homeRegion: 'West',
        commander: null,
      }),
      seat({
        seatId: AI_SEAT_IDS[2],
        seatOrder: 3,
        kind: 'ai',
        homeRegion: 'North',
        commander: { modelId: null, reasoningEffort: null, doctrineChoice: 'balanced', doctrine: DEFAULT_DOCTRINE },
      }),
    ];
    replaceSeatRoster({ run: dbRun }, written);
    const read = readSeatRoster({ getAll: dbGetAll });
    assert.deepEqual(read, [written[1], written[0], written[2]]);
    assert.throws(() => replaceSeatRoster({ run: dbRun }, [
      written[1],
      seat({ ...written[0], seatOrder: 1 }),
    ]));
  });
});

test('updateSeatCommander round-trips and refuses a human or knocked-out seat', () => {
  withTempGameDb('aw-seat-commander-', () => {
    const ops = { run: dbRun, getAll: dbGetAll };
    replaceSeatRoster(ops, [
      seat({ seatId: HUMAN_SEAT_ID, seatOrder: 1, kind: 'human', homeRegion: 'West', commander: null }),
      seat({
        seatId: AI_SEAT_IDS[0],
        seatOrder: 2,
        kind: 'ai',
        homeRegion: 'East',
        commander: { modelId: null, reasoningEffort: null, doctrineChoice: 'random', doctrine: 'cautious' },
      }),
      seat({
        seatId: AI_SEAT_IDS[1],
        seatOrder: 3,
        kind: 'ai',
        homeRegion: 'North',
        commander: { modelId: 'old', reasoningEffort: null, doctrineChoice: 'balanced', doctrine: DEFAULT_DOCTRINE },
        outTurn: 2,
        outBy: HUMAN_SEAT_ID,
        outReasons: ['home_control'],
        place: 3,
      }),
    ]);
    const updated = updateSeatCommander(ops, AI_SEAT_IDS[0], {
      modelId: 'model-a',
      reasoningEffort: 'low',
      doctrineChoice: 'aggressive',
    });
    assert.equal(updated.commander?.modelId, 'model-a');
    assert.equal(updated.commander?.reasoningEffort, 'low');
    assert.equal(updated.commander?.doctrine, 'aggressive');
    const kept = updateSeatCommander(ops, AI_SEAT_IDS[0], {
      modelId: 'model-a',
      reasoningEffort: 'low',
      doctrineChoice: 'random',
    });
    assert.equal(kept.commander?.doctrine, 'aggressive');
    assert.equal(readSeatRoster(ops).find((row) => row.seatId === AI_SEAT_IDS[0])?.commander?.doctrineChoice, 'random');
    assert.throws(() => updateSeatCommander(ops, HUMAN_SEAT_ID, {
      modelId: 'nope',
      reasoningEffort: null,
      doctrineChoice: 'balanced',
    }));
    assert.throws(() => updateSeatCommander(ops, AI_SEAT_IDS[1], {
      modelId: 'nope',
      reasoningEffort: null,
      doctrineChoice: 'balanced',
    }));
  });
});
