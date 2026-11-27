/**
 * The combat record counts what each side destroyed, split by who attacked.
 * Run with: node dist/main/briefing/sideCombatRecord.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyPlayerLossSummary, type LostUnit, type PlayerLossSummary } from '../../shared/lossSummary';
import { buildSideCombatRecords, type CombatRecordTurn, type SideCombatRecord } from './sideCombatRecord';

const OWN = 'opponent';
const S2 = 'opponent2';
const S3 = 'opponent3';

/**
 * Builds one lost unit with an attribution.
 *
 * Purpose: Each case names the victim's owner and the credited sides.
 * When to use: The cases below.
 * Expected outcome: An infantry unit whose id is given.
 * Exceptions: None.
 */
function unit(id: string, owner: string, responsible: readonly string[] | null): LostUnit {
  return { displayName: id, unitType: 'infantry', unitId: id, attribution: { ownerId: owner, lossH3Index: null, responsibleOwnerIds: responsible, killerUnits: [] } };
}

/**
 * Builds a turn from partial summaries.
 *
 * Purpose: A case fills only the buckets it is about.
 * When to use: The cases below.
 * Expected outcome: A turn with empty buckets elsewhere and no battle losses unless given.
 * Exceptions: None.
 */
function turn(turnNumber: number, own: Partial<PlayerLossSummary>, other: Partial<PlayerLossSummary> = {}, battle: LostUnit[] = []): CombatRecordTurn {
  return {
    turnNumber,
    ownLosses: { ...emptyPlayerLossSummary(), ...own },
    otherLosses: { ...emptyPlayerLossSummary(), ...other },
    battleLosses: battle,
  };
}

/**
 * Returns the record of one side.
 *
 * Purpose: Most cases look at one side of the result.
 * When to use: The cases below.
 * Expected outcome: The record for `sideId`; fails the test when the set or the side is missing.
 * Exceptions: Assertion failure.
 */
function recordOf(turns: CombatRecordTurn[], sideId: string): SideCombatRecord {
  const set = buildSideCombatRecords({ ownSeatId: OWN, sideIds: [S2, S3], turns });
  assert.ok(set);
  const found = set.records.find((record) => record.sideId === sideId);
  assert.ok(found);
  return found;
}

test('each cause counts under its category: attacks, return fire, close combat, and other', () => {
  const credited = [S2];
  const yours = recordOf([turn(5, {
    ranged: [unit('a', OWN, credited)],
    airStrike: [unit('b', OWN, credited)],
    missileStrike: [unit('c', OWN, credited)],
    returnFire: [unit('d', OWN, credited)],
    melee: [unit('e', OWN, credited)],
    other: [unit('f', OWN, credited)],
  })], S2).destroyedOfYours;
  assert.deepEqual(yours, { total: 6, responsibleAttacked: 3, victimAttacked: 1, closeCombat: 1, other: 1 });
});

test('a unit credited to two sides counts once for each', () => {
  const turns = [turn(2, { ranged: [unit('a', OWN, [S2, S3])] })];
  assert.equal(recordOf(turns, S2).destroyedOfYours.total, 1);
  assert.equal(recordOf(turns, S3).destroyedOfYours.total, 1);
});

test('an unknown, empty, or missing responsibility credits no side', () => {
  const noAttribution: LostUnit = { displayName: 'x', unitType: 'infantry', unitId: 'x' };
  const turns = [turn(2, { ranged: [unit('a', OWN, null), unit('b', OWN, []), noAttribution] })];
  assert.equal(recordOf(turns, S2).destroyedOfYours.total, 0);
});

test('what you destroyed of a side counts only units that side owned and you were credited for', () => {
  const turns = [turn(3, {}, {
    ranged: [unit('s2-a', S2, [OWN]), unit('s2-b', S2, [S3])],
    returnFire: [unit('s2-c', S2, [OWN])],
    melee: [unit('s3-a', S3, [OWN])],
  })];
  assert.deepEqual(recordOf(turns, S2).destroyedOfTheirs, { total: 2, responsibleAttacked: 1, victimAttacked: 1, closeCombat: 0, other: 0 });
  assert.equal(recordOf(turns, S3).destroyedOfTheirs.closeCombat, 1);
});

test('battle losses count as close combat on both sides of the record', () => {
  const turns = [turn(4, {}, {}, [unit('mine', OWN, [S2]), unit('theirs', S2, [OWN]), unit('third', S3, [S2])])];
  const record = recordOf(turns, S2);
  assert.equal(record.destroyedOfYours.closeCombat, 1);
  assert.equal(record.destroyedOfTheirs.closeCombat, 1);
  assert.equal(recordOf(turns, S3).destroyedOfTheirs.total, 0);
});

test('the latest turn a side destroyed a unit differs from the latest turn it attacked you', () => {
  const record = recordOf([
    turn(6, { ranged: [unit('a', OWN, [S2])] }),
    turn(9, { returnFire: [unit('b', OWN, [S2])] }),
  ], S2);
  assert.equal(record.latestTurnDestroyedYours, 9);
  assert.equal(record.latestTurnAttackedYou, 6);
});

test('only ranged, air, and missile losses move the latest turn a side struck you', () => {
  const record = recordOf([
    turn(2, { airStrike: [unit('a', OWN, [S2])] }),
    turn(3, { missileStrike: [unit('b', OWN, [S2])] }),
    turn(4, { melee: [unit('c', OWN, [S2])] }, {}, [unit('d', OWN, [S2])]),
    turn(5, { returnFire: [unit('e', OWN, [S2])], other: [unit('f', OWN, [S2])] }),
  ], S2);
  assert.equal(record.latestTurnStruckYou, 3);
  assert.equal(record.latestTurnAttackedYou, 4);
});

test('no turns give no record, and a quiet side has zero counts and no latest turns', () => {
  assert.equal(buildSideCombatRecords({ ownSeatId: OWN, sideIds: [S2], turns: [] }), null);
  const record = recordOf([turn(2, {})], S3);
  assert.equal(record.destroyedOfYours.total, 0);
  assert.equal(record.latestTurnDestroyedYours, null);
  assert.equal(record.latestTurnAttackedYou, null);
  assert.equal(record.latestTurnStruckYou, null);
});

test('the window bounds come from the turns, whatever their order', () => {
  const set = buildSideCombatRecords({ ownSeatId: OWN, sideIds: [S2, S3], turns: [turn(7, {}), turn(3, {}), turn(5, {})] });
  assert.ok(set);
  assert.equal(set.firstTurn, 3);
  assert.equal(set.lastTurn, 7);
  assert.deepEqual(set.records.map((record) => record.sideId), [S2, S3]);
});
