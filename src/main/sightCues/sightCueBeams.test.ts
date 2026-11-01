import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gridDisk, latLngToCell } from 'h3-js';
import { AI_SEAT_IDS, NEUTRAL_OWNER_ID } from '../../shared/seatIds';
import { computeSightCueBeams, type SightCueUnit } from './sightCueBeams';

const center = latLngToCell(0, 0, 1);
const mapHexSet = new Set(gridDisk(center, 4));
const seatA = AI_SEAT_IDS[0];
const seatB = AI_SEAT_IDS[1];

/**
 * The first cell, in sorted order, at distance `k` from the center.
 *
 * Purpose: Range tests need a hex that is exactly `k` steps away.
 * When to use: Building a target hex for a beam test.
 * Expected outcome: One hex in the disk of radius `k` and outside the disk of radius `k - 1`.
 * Exceptions: Throws when the ring is empty.
 */
function cellAtDistance(distance: number): string {
  const inside = new Set(distance === 0 ? [] : gridDisk(center, distance - 1));
  const cell = gridDisk(center, distance).filter((candidate) => !inside.has(candidate)).sort()[0];
  if (!cell) throw new Error(`no cell at distance ${distance}`);
  return cell;
}

/**
 * One unit row for a beam test.
 *
 * Purpose: The tests name an owner and a type without repeating the row shape.
 * When to use: Each `computeSightCueBeams` case.
 * Expected outcome: A unit with the given id, standing on `h3Index`.
 * Exceptions: None.
 */
function unit(id: string, player: string, unitType: string, h3Index: string): SightCueUnit {
  return { id, player, unitType, h3Index };
}

test('an enemy in range is a new contact, and memory makes the same beam ongoing', () => {
  const neighbor = cellAtDistance(1);
  const units = [unit('a1', seatA, 'infantry', center), unit('b1', seatB, 'infantry', neighbor)];
  const first = computeSightCueBeams({
    units,
    spotterSeatIds: [seatA],
    mapHexSet,
    previousSeenUnitIdsBySeat: {},
  });
  assert.deepEqual(first.beams, [{ seatId: seatA, fromH3Index: center, toH3Index: neighbor, isNewContact: true }]);
  assert.ok(first.seenUnitIdsBySeat[seatA]?.includes('b1'));
  const again = computeSightCueBeams({
    units,
    spotterSeatIds: [seatA],
    mapHexSet,
    previousSeenUnitIdsBySeat: { [seatA]: ['b1'] },
  });
  assert.equal(again.beams.length, 1);
  assert.equal(again.beams[0]?.isNewContact, false);
});

test('adjacent seats each draw a beam toward the other', () => {
  const neighbor = cellAtDistance(1);
  const result = computeSightCueBeams({
    units: [unit('a1', seatA, 'infantry', center), unit('b1', seatB, 'infantry', neighbor)],
    spotterSeatIds: [seatA, seatB],
    mapHexSet,
    previousSeenUnitIdsBySeat: {},
  });
  assert.equal(result.beams.length, 2);
  assert.ok(result.beams.some((beam) => beam.seatId === seatA && beam.fromH3Index === center && beam.toH3Index === neighbor));
  assert.ok(result.beams.some((beam) => beam.seatId === seatB && beam.fromH3Index === neighbor && beam.toH3Index === center));
});

test('Neutral can be seen and never starts a beam', () => {
  const neighbor = cellAtDistance(1);
  const result = computeSightCueBeams({
    units: [unit('a1', seatA, 'infantry', center), unit('n1', NEUTRAL_OWNER_ID, 'infantry', neighbor)],
    spotterSeatIds: [seatA],
    mapHexSet,
    previousSeenUnitIdsBySeat: {},
  });
  assert.equal(result.beams.length, 1);
  assert.equal(result.beams[0]?.fromH3Index, center);
  assert.equal(result.beams[0]?.toH3Index, neighbor);
  assert.ok(result.beams.every((beam) => beam.fromH3Index !== neighbor));
});

test('two owners in one hex are remembered and draw no beam', () => {
  const result = computeSightCueBeams({
    units: [unit('a1', seatA, 'infantry', center), unit('b1', seatB, 'infantry', center)],
    spotterSeatIds: [seatA],
    mapHexSet,
    previousSeenUnitIdsBySeat: {},
  });
  assert.deepEqual(result.beams, []);
  assert.ok(result.seenUnitIdsBySeat[seatA]?.includes('b1'));
});

test('a missile sees nothing', () => {
  const neighbor = cellAtDistance(1);
  const result = computeSightCueBeams({
    units: [
      unit('a1', seatA, 'missile', center),
      unit('b1', seatB, 'infantry', center),
      unit('b2', seatB, 'infantry', neighbor),
    ],
    spotterSeatIds: [seatA],
    mapHexSet,
    previousSeenUnitIdsBySeat: {},
  });
  assert.deepEqual(result.beams, []);
  assert.deepEqual(result.seenUnitIdsBySeat[seatA], []);
});

test('air sees three hexes and infantry does not', () => {
  const far = cellAtDistance(3);
  const enemy = [unit('b1', seatB, 'infantry', far)];
  const air = computeSightCueBeams({
    units: [unit('a1', seatA, 'air', center), ...enemy],
    spotterSeatIds: [seatA],
    mapHexSet,
    previousSeenUnitIdsBySeat: {},
  });
  assert.equal(air.beams.length, 1);
  assert.equal(air.beams[0]?.toH3Index, far);
  const infantry = computeSightCueBeams({
    units: [unit('a1', seatA, 'infantry', center), ...enemy],
    spotterSeatIds: [seatA],
    mapHexSet,
    previousSeenUnitIdsBySeat: {},
  });
  assert.deepEqual(infantry.beams, []);
});

test('two spotters in one hex draw one beam', () => {
  const neighbor = cellAtDistance(1);
  const result = computeSightCueBeams({
    units: [
      unit('a1', seatA, 'infantry', center),
      unit('a2', seatA, 'infantry', center),
      unit('b1', seatB, 'infantry', neighbor),
    ],
    spotterSeatIds: [seatA],
    mapHexSet,
    previousSeenUnitIdsBySeat: {},
  });
  assert.equal(result.beams.length, 1);
});
