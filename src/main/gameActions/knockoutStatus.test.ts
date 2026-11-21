/**
 * Contract tests for the knockout status each commander sees.
 * Run: `node dist/main/gameActions/knockoutStatus.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SeatId } from '../../shared/seatIds';
import type { SeatRecord } from '../../shared/seatRoster';
import { buildKnockoutStatus } from './knockoutStatus';

/**
 * Builds one AI roster row for a status test.
 *
 * Purpose: The builder reads id, order, home name, and activity. The other columns stay at match-start values.
 * When to use: Every case in this file.
 * Expected outcome: An active seat unless `outTurn` is set.
 * Exceptions: None.
 */
function seat(seatId: SeatId, seatOrder: number, outTurn: number | null = null): SeatRecord {
  return {
    seatId,
    seatOrder,
    kind: 'ai',
    homeRegion: ` Home ${seatId} `,
    nickname: null,
    commander: { modelId: null, reasoningEffort: null, providerSort: 'throughput', doctrineChoice: 'balanced', hasApiKey: false, doctrine: 'balanced' },
    outTurn,
    outBy: null,
    outReasons: [],
    place: outTurn === null ? null : seatOrder,
    consultationCount: 0,
    costUsd: 0,
    thinkTimeMs: 0,
  };
}

const SEATS = [seat('opponent', 1), seat('opponent2', 2), seat('opponent3', 3), seat('opponent4', 4, 2)];
const BASELINE = new Map([
  ['h1', 10],
  ['h2', 5],
  ['h3', 20],
  ['h4', 0],
]);

/**
 * Builds the status for viewer `opponent` over a fixed three-home map.
 *
 * Purpose: Every case shares the homes and baseline and varies control and infrastructure.
 * When to use: Each test below.
 * Expected outcome: The result of `buildKnockoutStatus`.
 * Exceptions: None.
 */
function statusFor(
  control: ReadonlyMap<string, string>,
  infrastructure: readonly { h3Index: string; urbanHexCount: number }[],
  viewer: SeatId = 'opponent',
  seats: readonly SeatRecord[] = SEATS
) {
  return buildKnockoutStatus({
    viewerSeatId: viewer,
    seats,
    homeHexesBySeat: new Map<SeatId, readonly string[]>([
      ['opponent', ['h3']],
      ['opponent2', ['h1', 'h2']],
      ['opponent3', ['h4']],
    ]),
    controlByHex: control,
    infrastructure,
    baselineUrbanCellsForHex: (hex) => BASELINE.get(hex) ?? 0,
    minUrbanShare: 0.9,
  });
}

test('own is the viewer and enemies are the other active seats in order', () => {
  const status = statusFor(new Map(), []);
  assert.equal(status?.own.seatId, 'opponent');
  assert.deepEqual(status?.enemies.map((row) => row.seatId), ['opponent2', 'opponent3']);
  assert.equal(status?.share, 0.9);
  assert.equal(status?.own.name, 'Home opponent');
});

test('an enemy whose home others and Neutral hold reports the loss and the cells the viewer holds', () => {
  const status = statusFor(
    new Map([
      ['h1', 'opponent'],
      ['h2', 'neutral'],
    ]),
    []
  );
  const enemy = status?.enemies.find((row) => row.seatId === 'opponent2');
  assert.equal(enemy?.homeLoss.lostUrbanCells, 15);
  assert.equal(enemy?.homeLoss.homeLost, true);
  assert.equal(enemy?.viewerHeldHomeUrbanCells, 10);
  assert.equal(status?.own.viewerHeldHomeUrbanCells, 0);
});

test('city hexes list only controlled hexes with urban cells, largest first then by hex id', () => {
  const status = statusFor(
    new Map([
      ['c', 'opponent2'],
      ['a', 'opponent2'],
      ['b', 'opponent2'],
      ['d', 'opponent2'],
      ['e', 'opponent3'],
    ]),
    [
      { h3Index: 'a', urbanHexCount: 4 },
      { h3Index: 'b', urbanHexCount: 9 },
      { h3Index: 'c', urbanHexCount: 4 },
      { h3Index: 'd', urbanHexCount: 0 },
      { h3Index: 'e', urbanHexCount: 6 },
    ]
  );
  const enemy = status?.enemies.find((row) => row.seatId === 'opponent2');
  assert.deepEqual(enemy?.cityHexes, [
    { h3Index: 'b', urbanCells: 9 },
    { h3Index: 'a', urbanCells: 4 },
    { h3Index: 'c', urbanCells: 4 },
  ]);
});

test('a viewer that is out or not on the roster has no status', () => {
  assert.equal(statusFor(new Map(), [], 'opponent4'), null);
  assert.equal(statusFor(new Map(), [], 'opponent2', [seat('opponent', 1)]), null);
});
