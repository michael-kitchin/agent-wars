/**
 * Contract tests for the Missile Forces briefing block.
 * Run: node dist/main/openRouter/briefingSectionsMissiles.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gridDisk } from 'h3-js';
import { missileRangeHexes } from '../../shared/gameRules';
import { AI_SEAT_IDS, HUMAN_SEAT_ID, NEUTRAL_OWNER_ID } from '../../shared/seatIds';
import type { GameStateSnapshot } from '../gameDb';
import { buildMissileForcesBriefingBlock, NO_MISSILE_TARGETS_LINE } from './briefingSectionsMissiles';

/** Origin reused so `gridDisk` can supply neighbors. */
const ORIGIN = '810ebffffffffff';

/**
 * Builds a snapshot with the given units and infrastructure.
 *
 * Purpose: The block reads roster, control, infrastructure, seats, and explored hexes.
 * When to use: Each case in this file.
 * Expected outcome: A snapshot the block can read. Other fields stay at planning defaults.
 * Exceptions: None.
 */
function stateFor(partial: Pick<GameStateSnapshot, 'units' | 'strategicControl' | 'strategicInfrastructure' | 'exploredHexes' | 'seats'>): GameStateSnapshot {
  return {
    hexes: [{ h3Index: ORIGIN, terrain: 'land', terrainKind: 'plains' }],
    phase: 'planning',
    turnNumber: 1,
    pendingOrders: [],
    playerPerspective: AI_SEAT_IDS[0],
    ...partial,
  } as GameStateSnapshot;
}

test('the block is omitted when the commander has no missile', () => {
  const md = buildMissileForcesBriefingBlock(
    stateFor({
      units: [{ id: 'a2-i1', player: AI_SEAT_IDS[0], unitType: 'infantry', h3Index: ORIGIN }],
    }),
    (h3) => h3,
    'strategic'
  );
  assert.equal(md, '');
});

test('the block lists the missile and only reachable explored enemy infrastructure', () => {
  const neighbors = [...gridDisk(ORIGIN, 1)].filter((h3) => h3 !== ORIGIN);
  const best = neighbors[0];
  const lesser = neighbors[1];
  const ownInfra = neighbors[2];
  const neutral = neighbors[3];
  const unexplored = neighbors[4];
  assert.ok(best && lesser && ownInfra && neutral && unexplored);
  const farther = [...gridDisk(ORIGIN, missileRangeHexes() + 1)].find(
    (h3) => !new Set(gridDisk(ORIGIN, missileRangeHexes())).has(h3)
  );
  assert.ok(farther);
  const md = buildMissileForcesBriefingBlock(
    stateFor({
      units: [
        { id: 'a2-m1', player: AI_SEAT_IDS[0], unitType: 'missile', h3Index: ORIGIN },
        { id: 'h-air', player: HUMAN_SEAT_ID, unitType: 'air', h3Index: best },
      ],
      seats: [{ seatId: HUMAN_SEAT_ID, seatOrder: 1, homeRegion: 'Western Anatolia' }] as unknown as GameStateSnapshot['seats'],
      exploredHexes: [ORIGIN, best, lesser, ownInfra, neutral, farther],
      strategicControl: [
        { h3Index: best, controllerPlayerId: HUMAN_SEAT_ID },
        { h3Index: lesser, controllerPlayerId: HUMAN_SEAT_ID },
        { h3Index: ownInfra, controllerPlayerId: AI_SEAT_IDS[0] },
        { h3Index: neutral, controllerPlayerId: NEUTRAL_OWNER_ID },
        { h3Index: unexplored, controllerPlayerId: HUMAN_SEAT_ID },
        { h3Index: farther, controllerPlayerId: HUMAN_SEAT_ID },
      ],
      strategicInfrastructure: [
        { h3Index: best, urbanHexCount: 10, airportCount: 2, seaportCount: 1 },
        { h3Index: lesser, urbanHexCount: 4, airportCount: 0, seaportCount: 0 },
        { h3Index: ownInfra, urbanHexCount: 50, airportCount: 0, seaportCount: 0 },
        { h3Index: neutral, urbanHexCount: 40, airportCount: 0, seaportCount: 0 },
        { h3Index: unexplored, urbanHexCount: 30, airportCount: 0, seaportCount: 0 },
        { h3Index: farther, urbanHexCount: 99, airportCount: 0, seaportCount: 0 },
      ],
    }),
    (h3) => h3,
    'strategic'
  );
  assert.match(md, /# Missile Forces/);
  assert.match(md, /\| a2-m1 \|/);
  assert.match(md, new RegExp(`launch range ${missileRangeHexes()} hexes`));
  const bestAt = md.indexOf(best);
  const lesserAt = md.indexOf(lesser);
  assert.ok(bestAt >= 0 && lesserAt > bestAt);
  assert.doesNotMatch(md, new RegExp(ownInfra));
  assert.doesNotMatch(md, new RegExp(neutral));
  assert.doesNotMatch(md, new RegExp(unexplored));
  assert.doesNotMatch(md, new RegExp(farther));
  assert.match(md, /Western Anatolia/);
  assert.match(md, /\| 1 \| a2-m1 \|/);
  assert.doesNotMatch(md, new RegExp(NO_MISSILE_TARGETS_LINE));
});
