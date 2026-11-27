/**
 * Attributed loss lines for one turn block of the Recent Turn Notes prompt section.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { LossKillerUnit } from '../../shared/lossAttributionTypes';
import { emptyPlayerLossSummary, type LostUnit, type LostUnitType, type PlayerLossSummary } from '../../shared/lossSummary';
import {
  BATTLE_LOSS_LEGEND_SENTENCE,
  buildRecentTurnLossLines,
  RECENT_TURN_LOSS_LEGEND,
  type RecentTurnLossLinesInput,
} from './recentTurnLossLines';

const HEXES = new Map<string, string>([['hA', 'QX'], ['hB', 'RB'], ['hC', 'TT']]);
for (let i = 1; i <= 12; i += 1) HEXES.set(`g${i}`, `A${i}`);

/**
 * Builds one lost unit with an attribution.
 *
 * Purpose: Keeps each case to the fields it is about.
 * When to use: Every test below.
 * Expected outcome: A unit whose id and type are given.
 * Exceptions: None.
 */
function unit(id: string, unitType: LostUnitType, owner: string, hex: string | null, responsible: readonly string[] | null, killers: LossKillerUnit[] = []): LostUnit {
  return { unitType, displayName: id, unitId: id, attribution: { ownerId: owner, lossH3Index: hex, responsibleOwnerIds: responsible, killerUnits: killers } };
}

/**
 * Builds the formatter input with the shared roster.
 *
 * Purpose: Own seat is `opponent` (a1), in a roster of human, opponent, opponent2.
 * When to use: Every test below.
 * Expected outcome: An input with no cap unless one is given.
 * Exceptions: None.
 */
function input(own: Partial<PlayerLossSummary>, other: Partial<PlayerLossSummary>, maxGroupLines: number | null = null): RecentTurnLossLinesInput {
  return {
    ownSeatId: 'opponent',
    ownLosses: { ...emptyPlayerLossSummary(), ...own },
    otherLosses: { ...emptyPlayerLossSummary(), ...other },
    seatOrder: ['human', 'opponent', 'opponent2'],
    hexCodeFor: (h3) => HEXES.get(h3),
    maxGroupLines,
  };
}

const armor = (id: string): LossKillerUnit => ({ unitId: id, unitType: 'armor' });
const infantry = (id: string): LossKillerUnit => ({ unitId: id, unitType: 'infantry' });

test('own and other losses group by responsible side, cause, and hex', () => {
  const lines = buildRecentTurnLossLines(input(
    {
      ranged: [
        unit('a1-i3', 'infantry', 'opponent', 'hA', ['human'], [armor('h1-a4'), armor('h1-a5')]),
        unit('a1-a2', 'armor', 'opponent', 'hA', ['human'], [armor('h1-a4'), armor('h1-a5')]),
      ],
      melee: ['a1-i4', 'a1-i5', 'a1-i6'].map((id) =>
        unit(id, 'infantry', 'opponent', 'hB', ['opponent2'], [armor('a2-a1'), infantry('a2-i2'), infantry('a2-i7')])),
    },
    { airStrike: [unit('h1-n1', 'naval', 'human', 'hC', ['opponent'], [{ unitId: 'a1-r1', unitType: 'air' }])] }
  ));
  assert.deepEqual(lines, [
    '- Your Losses:',
    '  - by h1, Ranged attack at QX: a1-i3, a1-a2 (by 2 Armored)',
    '  - by a2, Melee attack (units of both sides were in the same hex or cell) at RB: a1-i4, a1-i5, a1-i6 (by 1 Armored, 2 Infantry)',
    '- Losses of h1:',
    '  - by you, Air strike at TT: h1-n1 (by 1 Air)',
  ]);
});

test('rows without attribution print as an unknown side with no hex', () => {
  const lines = buildRecentTurnLossLines(input(
    { ranged: [{ unitType: 'infantry', displayName: 'A', unitId: 'a1-i3' }] },
    { melee: [{ unitType: 'infantry', displayName: 'B', unitId: 'h1-i1' }] }
  ));
  assert.deepEqual(lines, [
    '- Your Losses:',
    '  - by unknown side, Ranged attack: a1-i3',
    '- Losses of other sides:',
    '  - by unknown side, Melee attack (units of both sides were in the same hex or cell): h1-i1',
  ]);
});

test('an empty responsible list reads as no side responsible, and a hex without a code is left out', () => {
  const lines = buildRecentTurnLossLines(input({ other: [unit('a1-t1', 'infantry', 'opponent', 'hZ', [])] }, {}));
  assert.deepEqual(lines, ['- Your Losses:', '  - no side responsible, Other losses: a1-t1']);
});

test('several sides are named in rank order, and Neutral is a victim owner too', () => {
  const two = buildRecentTurnLossLines(input({ ranged: [unit('a1-i1', 'infantry', 'opponent', null, ['opponent2', 'human'])] }, {}));
  assert.equal(two[1], '  - by h1 and a2, Ranged attack: a1-i1');
  const three = buildRecentTurnLossLines(input({ ranged: [unit('a1-i1', 'infantry', 'opponent', null, ['neutral', 'opponent2', 'human'])] }, {}));
  assert.equal(three[1], '  - by h1, a2, and Neutral, Ranged attack: a1-i1');
  const neutral = buildRecentTurnLossLines(input({}, { ranged: [unit('a2-i1', 'infantry', 'neutral', null, ['human'])] }));
  assert.deepEqual(neutral, ['- Losses of Neutral:', '  - by h1, Ranged attack: a2-i1']);
});

test('one cause by one side at two hexes is two lines, in hex order', () => {
  const lines = buildRecentTurnLossLines(input({
    ranged: [unit('a1-i1', 'infantry', 'opponent', 'hB', ['human']), unit('a1-i2', 'infantry', 'opponent', 'hA', ['human'])],
  }, {}));
  assert.deepEqual(lines.slice(1), [
    '  - by h1, Ranged attack at QX: a1-i2',
    '  - by h1, Ranged attack at RB: a1-i1',
  ]);
});

test('a long list is grouped into type counts', () => {
  const six = Array.from({ length: 6 }, (_, i) => unit(`a1-i${i}`, 'infantry', 'opponent', null, ['human']));
  assert.equal(buildRecentTurnLossLines(input({ ranged: six }, {}))[1], '  - by h1, Ranged attack: 6 Infantry');
});

/**
 * Builds twelve other-side groups at distinct hexes plus two own groups.
 *
 * Purpose: The cap tests need more groups than the cap.
 * When to use: The cap test.
 * Expected outcome: Fourteen groups in total.
 * Exceptions: None.
 */
function manyGroups(): Pick<RecentTurnLossLinesInput, 'ownLosses' | 'otherLosses'> {
  const other = Array.from({ length: 12 }, (_, i) => unit(`a2-i${i}`, 'infantry', 'opponent2', `g${i + 1}`, ['human']));
  return {
    ownLosses: { ...emptyPlayerLossSummary(), melee: [unit('a1-i1', 'infantry', 'opponent', 'hA', ['opponent2']), unit('a1-i2', 'infantry', 'opponent', 'hB', ['opponent2'])] },
    otherLosses: { ...emptyPlayerLossSummary(), ranged: other },
  };
}

test('a cap keeps the reading seat groups first and counts the rest', () => {
  const base = { ...input({}, {}), ...manyGroups() };
  const twelve = buildRecentTurnLossLines({ ...base, maxGroupLines: 12 });
  assert.ok(twelve.some((line) => line.includes('a1-i1')) && twelve.some((line) => line.includes('a1-i2')));
  assert.equal(twelve.filter((line) => line.startsWith('  - ')).length, 12);
  assert.equal(twelve[twelve.length - 1], '- 2 more loss groups on this turn are not listed.');
  const thirteen = buildRecentTurnLossLines({ ...base, maxGroupLines: 13 });
  assert.equal(thirteen[thirteen.length - 1], '- 1 more loss group on this turn is not listed.');
  const all = buildRecentTurnLossLines({ ...base, maxGroupLines: null });
  assert.equal(all.filter((line) => line.startsWith('  - ')).length, 14);
  assert.equal(all.some((line) => line.includes('not listed')), false);
});

test('no losses give no lines', () => {
  assert.deepEqual(buildRecentTurnLossLines(input({}, {})), []);
});

test('victims without ids print as type counts, never as display names', () => {
  const lines = buildRecentTurnLossLines(input(
    { ranged: [{ unitType: 'infantry', displayName: 'IX Fleet', attribution: { ownerId: 'opponent', lossH3Index: null, responsibleOwnerIds: ['human'], killerUnits: [] } }] },
    {}
  ));
  assert.equal(lines[1], '  - by h1, Ranged attack: 1 Infantry');
  assert.equal(lines.join('\n').includes('IX Fleet'), false);
});

test('a battle loss prints under its owner with the Battle cause and no killer counts', () => {
  const lines = buildRecentTurnLossLines({
    ...input({}, {}),
    battleLosses: [
      unit('a1-t1', 'armor', 'opponent', 'hA', ['opponent2']),
      unit('h1-t1', 'armor', 'human', 'hA', ['opponent']),
    ],
  });
  assert.deepEqual(lines, [
    '- Your Losses:',
    '  - by a2, Battle at QX: a1-t1',
    '- Losses of h1:',
    '  - by you, Battle at QX: h1-t1',
  ]);
});

test('a battle loss and a ranged loss by the same side at one hex are two lines, ranged first', () => {
  const lines = buildRecentTurnLossLines({
    ...input({ ranged: [unit('a1-i3', 'infantry', 'opponent', 'hA', ['human'])] }, {}),
    battleLosses: [unit('a1-t1', 'armor', 'opponent', 'hA', ['human'])],
  });
  assert.deepEqual(lines, [
    '- Your Losses:',
    '  - by h1, Ranged attack at QX: a1-i3',
    '  - by h1, Battle at QX: a1-t1',
  ]);
});

test('a cap counts a battle group like any other group', () => {
  const lines = buildRecentTurnLossLines({
    ...input({ ranged: [unit('a1-i3', 'infantry', 'opponent', 'hA', ['human'])] }, {}, 1),
    battleLosses: [unit('a1-t1', 'armor', 'opponent', 'hB', ['opponent2'])],
  });
  assert.equal(lines[lines.length - 1], '- 1 more loss group on this turn is not listed.');
  assert.equal(lines.some((line) => line.includes('Battle')), false);
});

test('a home region map names each other responsible side after its code', () => {
  const homes = new Map<string, string>([
    ['human', 'North America'],
    ['opponent', 'Own Home'],
    ['opponent2', 'Southern France'],
    ['opponent3', 'Southern Europe (SEGAS)'],
  ]);
  const base = input(
    { ranged: [unit('a1-i3', 'infantry', 'opponent', 'hA', ['human'], [armor('h1-a4')])] },
    {
      melee: [unit('a2-i1', 'infantry', 'opponent2', 'hB', ['opponent'])],
      airStrike: [unit('h1-n1', 'naval', 'human', 'hC', ['opponent2', 'opponent3'])],
    }
  );
  const lines = buildRecentTurnLossLines({ ...base, homeRegionBySeatId: homes });
  assert.ok(lines.includes('  - by h1 (North America), Ranged attack at QX: a1-i3 (by 1 Armored)'));
  assert.ok(lines.includes('  - by you, Melee attack (units of both sides were in the same hex or cell) at RB: a2-i1'));
  assert.ok(lines.includes('  - by a2 (Southern France) and a3 (Southern Europe), Air strike at TT: h1-n1'));
  assert.ok(lines.includes('- Losses of a2:'));
  assert.deepEqual(buildRecentTurnLossLines(base), buildRecentTurnLossLines({ ...base, homeRegionBySeatId: undefined }));
});

test('a return fire line says the destroyed units attacked first, and a ranged line carries no note', () => {
  const lines = buildRecentTurnLossLines(input({
    ranged: [unit('a1-i1', 'infantry', 'opponent', 'hA', ['human'])],
    returnFire: [unit('a1-i2', 'infantry', 'opponent', 'hB', ['human'])],
  }, {}));
  assert.ok(lines.includes('  - by h1, Ranged attack at QX: a1-i1'));
  assert.ok(lines.includes('  - by h1, Return fire (the destroyed units attacked first) at RB: a1-i2'));
});

test('the legend says return fire is not an attack, and the battle sentence does not name who fired first', () => {
  assert.ok(RECENT_TURN_LOSS_LEGEND.includes('not an attack by the side named'));
  assert.ok(RECENT_TURN_LOSS_LEGEND.includes('A "Return fire" line means the destroyed units attacked first'));
  assert.ok(RECENT_TURN_LOSS_LEGEND.includes('In a battle, that includes an air drop that anti-air shoots down.'));
  assert.equal(RECENT_TURN_LOSS_LEGEND.includes('fired'), false);
  assert.ok(BATTLE_LOSS_LEGEND_SENTENCE.includes('does not say which side fired first'));
});
