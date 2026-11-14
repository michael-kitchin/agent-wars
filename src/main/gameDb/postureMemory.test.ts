/**
 * Posture row: per-seat round trip, a bad entry, reset, and knockout.
 * Run with: node dist/main/gameDb/postureMemory.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { NewGameSeatInput } from '../../shared/ipc/ordersTypes';
import { AI_SEAT_IDS } from '../../shared/seatIds';
import { POSTURE_SETTINGS } from '../../shared/postureTypes';
import { applyKnockout } from '../gameActions/knockoutConsequences';
import { dbGetAll, dbGetOne, dbRun, resetGameForNewMatch } from '../gameDb';
import { listGameMaps } from '../gameMap/listGameMaps';
import { buildLatLngCoordinateMap } from '../mapData';
import { withSeatedTempGameDb } from '../testSupport/withSeatedTempGameDb';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { upsertGameConfigValue } from './gameConfigRows';
import { POSTURES_CONFIG_KEY, postureSettingsForSeat, readPosture, writePosture } from './postureMemory';

/**
 * A regional map with at least three side groups.
 *
 * Purpose: Knockout needs a second AI seat whose posture stays.
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

test('a posture round-trips, and a bad entry leaves the other seat', () => {
  withTempGameDb('aw-posture-memory-', () => {
    const ops = { getOne: dbGetOne, run: dbRun };
    writePosture(ops, 'a1', { posture: 'maritime', sinceTurn: 4 });
    writePosture(ops, 'a2', { posture: 'blitz', sinceTurn: 4 });
    assert.deepEqual(readPosture(ops, 'a1'), { posture: 'maritime', sinceTurn: 4 });
    assert.deepEqual(readPosture(ops, 'a2'), { posture: 'blitz', sinceTurn: 4 });
    upsertGameConfigValue(ops, POSTURES_CONFIG_KEY, JSON.stringify({
      a1: { posture: 'Maritime', sinceTurn: 4 },
      a2: { posture: 'blitz', sinceTurn: 4 },
    }));
    assert.equal(readPosture(ops, 'a1'), null);
    assert.deepEqual(readPosture(ops, 'a2'), { posture: 'blitz', sinceTurn: 4 });
    upsertGameConfigValue(ops, POSTURES_CONFIG_KEY, JSON.stringify({
      a1: { posture: 'maritime', sinceTurn: 4.5 },
      a2: { posture: 'blitz', sinceTurn: 4 },
    }));
    assert.equal(readPosture(ops, 'a1'), null);
    assert.deepEqual(readPosture(ops, 'a2'), { posture: 'blitz', sinceTurn: 4 });
    upsertGameConfigValue(ops, POSTURES_CONFIG_KEY, 'not-json');
    assert.equal(readPosture(ops, 'a2'), null);
  });
});

test('a missing posture and a throwing reader both mean overland', () => {
  withTempGameDb('aw-posture-memory-', () => {
    assert.deepEqual(postureSettingsForSeat('nobody'), POSTURE_SETTINGS.overland);
    const thrown = postureSettingsForSeat('a1', {
      getOne: () => {
        throw new Error('db down');
      },
    });
    assert.deepEqual(thrown, POSTURE_SETTINGS.overland);
  });
});

test('a new match deletes the stored posture', () => {
  withTempGameDb('aw-posture-memory-', () => {
    const ops = { getOne: dbGetOne, run: dbRun };
    writePosture(ops, 'a1', { posture: 'strangle', sinceTurn: 2 });
    resetGameForNewMatch();
    assert.equal(readPosture(ops, 'a1'), null);
  });
});

test('knocking a seat out deletes its posture and leaves the other seat', (t) => {
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
  withSeatedTempGameDb('aw-posture-knockout-', { gameMapId: map.id, seats }, () => {
    const ops = { getOne: dbGetOne, run: dbRun };
    const knocked = AI_SEAT_IDS[1];
    const kept = AI_SEAT_IDS[2];
    writePosture(ops, knocked, { posture: 'maritime', sinceTurn: 1 });
    writePosture(ops, kept, { posture: 'blitz', sinceTurn: 1 });
    const hexes = dbGetAll<{ h3_index: string }>('SELECT h3_index FROM hexes').map((row) => row.h3_index);
    applyKnockout(knocked, buildLatLngCoordinateMap(hexes));
    assert.equal(readPosture(ops, knocked), null);
    assert.deepEqual(readPosture(ops, kept), { posture: 'blitz', sinceTurn: 1 });
  });
});
