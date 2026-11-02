import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AI_SEAT_IDS, HUMAN_SEAT_ID } from '../../shared/seatIds';
import { DEFAULT_DOCTRINE, type SeatRecord } from '../../shared/seatRoster';
import { dbGetAll, dbRun } from '../gameDb';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { readSeatRoster, recordSeatThinkTime, replaceSeatRoster, updateSeatCommander, updateSeatNickname } from './seatRosterStore';
import { normalizeSideNickname } from '../../shared/sideNicknames';

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
    nickname: null,
    outTurn: null,
    outBy: null,
    outReasons: [],
    place: null,
    consultationCount: 0,
    costUsd: 0,
    thinkTimeMs: 0,
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
        commander: {
          modelId: 'model-b',
          reasoningEffort: 'low',
          providerSort: 'nitro',
          doctrineChoice: 'random',
          hasApiKey: false,
          doctrine: 'cautious',
        },
        outTurn: 4,
        outBy: HUMAN_SEAT_ID,
        outReasons: ['home_control', 'no_city_hexes'],
        place: 3,
        consultationCount: 2,
        costUsd: 1.25,
        thinkTimeMs: 1500,
      }),
      seat({
        seatId: HUMAN_SEAT_ID,
        seatOrder: 1,
        kind: 'human',
        homeRegion: 'West',
        nickname: 'Scout',
        commander: null,
      }),
      seat({
        seatId: AI_SEAT_IDS[2],
        seatOrder: 3,
        kind: 'ai',
        homeRegion: 'North',
        commander: {
          modelId: null,
          reasoningEffort: null,
          providerSort: 'throughput',
          doctrineChoice: 'balanced',
          hasApiKey: false,
          doctrine: DEFAULT_DOCTRINE,
        },
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
        nickname: 'Scout',
        commander: {
          modelId: null,
          reasoningEffort: null,
          providerSort: 'throughput',
          doctrineChoice: 'random',
          hasApiKey: false,
          doctrine: 'cautious',
        },
      }),
      seat({
        seatId: AI_SEAT_IDS[1],
        seatOrder: 3,
        kind: 'ai',
        homeRegion: 'North',
        commander: {
          modelId: 'old',
          reasoningEffort: null,
          providerSort: 'throughput',
          doctrineChoice: 'balanced',
          hasApiKey: false,
          doctrine: DEFAULT_DOCTRINE,
        },
        outTurn: 2,
        outBy: HUMAN_SEAT_ID,
        outReasons: ['home_control'],
        place: 3,
      }),
    ]);
    const updated = updateSeatCommander(ops, AI_SEAT_IDS[0], {
      modelId: 'model-a',
      reasoningEffort: 'low',
      providerSort: 'nitro',
      doctrineChoice: 'aggressive',
    });
    assert.equal(updated.commander?.modelId, 'model-a');
    assert.equal(updated.commander?.reasoningEffort, 'low');
    assert.equal(updated.commander?.providerSort, 'nitro');
    assert.equal(updated.commander?.doctrine, 'aggressive');
    assert.equal(updated.nickname, 'Scout');
    const kept = updateSeatCommander(ops, AI_SEAT_IDS[0], {
      modelId: 'model-a',
      reasoningEffort: 'low',
      providerSort: 'nitro',
      doctrineChoice: 'random',
    });
    assert.equal(kept.commander?.doctrine, 'aggressive');
    assert.equal(kept.nickname, 'Scout');
    assert.equal(readSeatRoster(ops).find((row) => row.seatId === AI_SEAT_IDS[0])?.commander?.doctrineChoice, 'random');
    assert.equal(readSeatRoster(ops).find((row) => row.seatId === AI_SEAT_IDS[0])?.commander?.providerSort, 'nitro');
    assert.throws(() => updateSeatCommander(ops, HUMAN_SEAT_ID, {
      modelId: 'nope',
      reasoningEffort: null,
      providerSort: 'throughput',
      doctrineChoice: 'balanced',
    }));
    assert.throws(() => updateSeatCommander(ops, AI_SEAT_IDS[1], {
      modelId: 'nope',
      reasoningEffort: null,
      providerSort: 'throughput',
      doctrineChoice: 'balanced',
    }));
  });
});

test('updateSeatNickname stores a name and refuses a human or knocked-out seat', () => {
  withTempGameDb('aw-seat-nickname-', () => {
    const ops = { run: dbRun, getAll: dbGetAll };
    replaceSeatRoster(ops, [
      seat({ seatId: HUMAN_SEAT_ID, seatOrder: 1, kind: 'human', homeRegion: 'West', commander: null }),
      seat({
        seatId: AI_SEAT_IDS[0],
        seatOrder: 2,
        kind: 'ai',
        homeRegion: 'Western Turkey',
        commander: {
          modelId: 'model-a',
          reasoningEffort: null,
          providerSort: 'throughput',
          doctrineChoice: 'balanced',
          hasApiKey: false,
          doctrine: DEFAULT_DOCTRINE,
        },
      }),
      seat({
        seatId: AI_SEAT_IDS[1],
        seatOrder: 3,
        kind: 'ai',
        homeRegion: 'North',
        commander: {
          modelId: 'old',
          reasoningEffort: null,
          providerSort: 'throughput',
          doctrineChoice: 'balanced',
          hasApiKey: false,
          doctrine: DEFAULT_DOCTRINE,
        },
        outTurn: 2,
        outBy: HUMAN_SEAT_ID,
        outReasons: ['home_control'],
      }),
    ]);
    const named = updateSeatNickname(ops, AI_SEAT_IDS[0], 'Grok');
    assert.equal(named.nickname, 'Grok');
    assert.equal(readSeatRoster(ops).find((row) => row.seatId === AI_SEAT_IDS[0])?.nickname, 'Grok');
    assert.equal(updateSeatNickname(ops, AI_SEAT_IDS[0], normalizeSideNickname('') || null).nickname, null);
    assert.equal(updateSeatNickname(ops, AI_SEAT_IDS[0], normalizeSideNickname('you') || null).nickname, null);
    const afterCommander = updateSeatCommander(ops, AI_SEAT_IDS[0], {
      modelId: 'model-b',
      reasoningEffort: null,
      providerSort: 'throughput',
      doctrineChoice: 'balanced',
    });
    assert.equal(afterCommander.nickname, null);
    assert.throws(() => updateSeatNickname(ops, HUMAN_SEAT_ID, 'Grok'), /Cannot update a commander for/);
    assert.throws(() => updateSeatNickname(ops, AI_SEAT_IDS[1], 'Grok'), /Cannot update a commander for/);
  });
});

test('think time adds across consults and ignores a non-finite value', () => {
  withTempGameDb('aw-seat-think-', () => {
    const ops = { run: dbRun, getAll: dbGetAll };
    replaceSeatRoster(ops, [
      seat({
        seatId: AI_SEAT_IDS[0],
        seatOrder: 1,
        kind: 'ai',
        homeRegion: 'East',
        commander: {
          modelId: null,
          reasoningEffort: null,
          providerSort: 'throughput',
          doctrineChoice: 'balanced',
          hasApiKey: false,
          doctrine: DEFAULT_DOCTRINE,
        },
      }),
    ]);
    recordSeatThinkTime(ops, AI_SEAT_IDS[0], 1500);
    recordSeatThinkTime(ops, AI_SEAT_IDS[0], 500);
    assert.equal(readSeatRoster(ops)[0]?.thinkTimeMs, 2000);
    recordSeatThinkTime(ops, AI_SEAT_IDS[0], Number.NaN);
    assert.equal(readSeatRoster(ops)[0]?.thinkTimeMs, 2000);
  });
});

test('a null or unknown provider sort reads as throughput', () => {
  withTempGameDb('aw-seat-provider-', () => {
    const ops = { run: dbRun, getAll: dbGetAll };
    replaceSeatRoster(ops, [
      seat({
        seatId: AI_SEAT_IDS[0],
        seatOrder: 1,
        kind: 'ai',
        homeRegion: 'East',
        commander: {
          modelId: null,
          reasoningEffort: null,
          providerSort: 'latency',
          doctrineChoice: 'balanced',
          hasApiKey: false,
          doctrine: DEFAULT_DOCTRINE,
        },
      }),
    ]);
    dbRun('UPDATE seats SET provider_sort = NULL WHERE seat_id = ?', [AI_SEAT_IDS[0]]);
    assert.equal(readSeatRoster(ops)[0]?.commander?.providerSort, 'throughput');
    // An added column has no check, so a bad value can be stored. The pragma stands in for that column.
    dbRun('PRAGMA ignore_check_constraints = ON');
    dbRun("UPDATE seats SET provider_sort = 'nope' WHERE seat_id = ?", [AI_SEAT_IDS[0]]);
    dbRun('PRAGMA ignore_check_constraints = OFF');
    assert.equal(readSeatRoster(ops)[0]?.commander?.providerSort, 'throughput');
  });
});
