/**
 * Contract tests for the production-priority lines.
 * Run: `npm run build:main` then `node dist/main/openRouter/productionPriorities.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cellToLatLng, gridDisk } from 'h3-js';
import { getMaxUnitsPerType, parseGameSize } from '../../shared/gameSize';
import { AI_SEAT_IDS, HUMAN_SEAT_ID } from '../../shared/seatIds';
import type { GameStateSnapshot } from '../gameDb';
import { buildProductionPriorityLines, NAVAL_PRIORITY_CAP_SHARE } from './productionPriorities';
import type { ControlledHexQueueSnapshot } from './productionQueueSnapshotTypes';

/** Origin reused so `gridDisk` can supply neighbors. */
const ORIGIN = '810ebffffffffff';

/** Seat the lines are written for. */
const OWN = AI_SEAT_IDS[0];

/** Seat that owns the enemy cities. */
const ENEMY = HUMAN_SEAT_ID;

/**
 * Neighbors of the origin, excluding the origin.
 *
 * Purpose: Builders and enemy cities must sit inside missile range of one another.
 * When to use: Each case that needs distinct hexes.
 * Expected outcome: Six neighbors of a resolution-1 hex.
 * Exceptions: Throws when the disk is shorter than the caller needs.
 */
function neighbors(): string[] {
  const ring = [...gridDisk(ORIGIN, 1)].filter((hex) => hex !== ORIGIN);
  if (ring.length < 4) throw new Error('expected at least four neighbors');
  return ring;
}

/**
 * Label helpers that round-trip `cellToLatLng` back to the hex id.
 *
 * Purpose: The priority lines print labels, and the tests need those labels to be the hex ids.
 * When to use: Before `buildProductionPriorityLines`.
 * Expected outcome: `resolveToH3` and `formatHexLabel` agree on every listed hex.
 * Exceptions: None.
 */
function labelsFor(hexes: readonly string[]): {
  readonly resolveToH3: (lat: number, lng: number) => string | undefined;
  readonly formatHexLabel: (ll: [number, number]) => string;
  readonly center: (h3: string) => [number, number];
} {
  const byKey = new Map<string, string>();
  for (const hex of hexes) {
    const ll = cellToLatLng(hex);
    byKey.set(`${ll[0]},${ll[1]}`, hex);
  }
  return {
    resolveToH3: (lat, lng) => byKey.get(`${lat},${lng}`),
    formatHexLabel: (ll) => byKey.get(`${ll[0]},${ll[1]}`) ?? 'unknown',
    center: (hex) => cellToLatLng(hex) as [number, number],
  };
}

/**
 * One controlled-hex queue row.
 *
 * Purpose: The priority function takes rows as an argument, so the tests do not need a database.
 * When to use: Each case.
 * Expected outcome: A row whose center resolves through `labelsFor`.
 * Exceptions: None.
 */
function queueRow(args: {
  readonly h3: string;
  readonly urban: number;
  readonly types: readonly string[];
  readonly center: (h3: string) => [number, number];
  readonly entries?: ReadonlyArray<{ readonly unitType: string; readonly queueIndex: number }>;
  readonly buildPaused?: boolean;
}): ControlledHexQueueSnapshot {
  return {
    hex: args.center(args.h3),
    urbanHexCount: args.urban,
    availableUnitTypes: [...args.types],
    entries: [...(args.entries ?? [])],
    buildPaused: args.buildPaused,
  };
}

/**
 * A planning snapshot with the fields the priority lines read.
 *
 * Purpose: Missile and naval lines read infrastructure, control, and the hex terrain. Credits reads the economy and the size.
 * When to use: Each case, after the rows are chosen.
 * Expected outcome: Missing lists stay empty. `gameSize` defaults to small.
 * Exceptions: None.
 */
function world(partial: Partial<GameStateSnapshot>): GameStateSnapshot {
  return {
    hexes: [],
    units: [],
    phase: 'planning',
    turnNumber: 1,
    pendingOrders: [],
    gameSize: 'small',
    ...partial,
  } as GameStateSnapshot;
}

/**
 * Enemy cities the seat has explored.
 *
 * Purpose: The missile and naval lines only consider another seat's infrastructure.
 * When to use: When a case needs one or more enemy cities.
 * Expected outcome: Control, infrastructure, explored hexes, and a home-region name.
 * Exceptions: None.
 */
function enemies(cities: ReadonlyArray<{ readonly h3: string; readonly urban: number }>): Partial<GameStateSnapshot> {
  return {
    exploredHexes: cities.map((city) => city.h3),
    strategicControl: cities.map((city) => ({ h3Index: city.h3, controllerPlayerId: ENEMY })),
    strategicInfrastructure: cities.map((city) => ({
      h3Index: city.h3,
      urbanHexCount: city.urban,
      airportCount: 0,
      seaportCount: 0,
    })),
    seats: [{ seatId: ENEMY, seatOrder: 1, homeRegion: 'Western Anatolia' }] as unknown as GameStateSnapshot['seats'],
  };
}

/**
 * Runs the priority lines for one seat.
 *
 * Purpose: Each case shares the label map and the seat.
 * When to use: The assertions below.
 * Expected outcome: The lines `buildProductionPriorityLines` returns.
 * Exceptions: None.
 */
function linesFor(args: {
  readonly state: GameStateSnapshot;
  readonly queues: readonly ControlledHexQueueSnapshot[];
  readonly hexes: readonly string[];
}): string[] {
  const labels = labelsFor(args.hexes);
  return buildProductionPriorityLines({
    state: args.state,
    ownSeat: OWN,
    queues: args.queues,
    resolveToH3: labels.resolveToH3,
    formatHexLabel: labels.formatHexLabel,
  });
}

test('the missile line names the enemy city with the most urban cells', () => {
  const ring = neighbors();
  const slow = ring[0]!;
  const fast = ring[1]!;
  const large = ring[2]!;
  const small = ring[3]!;
  const labels = labelsFor([slow, fast, large, small]);
  const lines = linesFor({
    hexes: [slow, fast, large, small],
    queues: [
      queueRow({ h3: slow, urban: 10, types: ['missile'], center: labels.center }),
      queueRow({ h3: fast, urban: 30, types: ['missile'], center: labels.center }),
    ],
    state: world(enemies([
      { h3: large, urban: 50 },
      { h3: small, urban: 8 },
    ])),
  });
  assert.equal(lines.length, 1);
  assert.match(lines[0]!, new RegExp(`reaches ${large}, a Western Anatolia city with 50 city cells`));
  assert.doesNotMatch(lines[0]!, new RegExp(small));
});

test('the missile line is absent when one is queued, the cap is full, or the only builder is paused', () => {
  const ring = neighbors();
  const builder = ring[0]!;
  const target = ring[1]!;
  const labels = labelsFor([builder, target]);
  const enemy = enemies([{ h3: target, urban: 20 }]);
  const cap = getMaxUnitsPerType(parseGameSize('small')).missile;
  const queued = linesFor({
    hexes: [builder, target],
    queues: [
      queueRow({
        h3: builder,
        urban: 30,
        types: ['missile'],
        center: labels.center,
        entries: [{ unitType: 'missile', queueIndex: 0 }],
      }),
    ],
    state: world(enemy),
  });
  const capped = linesFor({
    hexes: [builder, target],
    queues: [queueRow({ h3: builder, urban: 30, types: ['missile'], center: labels.center })],
    state: world({
      ...enemy,
      units: Array.from({ length: cap }, (_, index) => ({
        id: `m${index}`,
        player: OWN,
        unitType: 'missile',
        h3Index: ORIGIN,
      })),
    }),
  });
  const paused = linesFor({
    hexes: [builder, target],
    queues: [queueRow({ h3: builder, urban: 30, types: ['missile'], center: labels.center, buildPaused: true })],
    state: world(enemy),
  });
  assert.deepEqual(queued, []);
  assert.deepEqual(capped, []);
  assert.deepEqual(paused, []);
});

test('the naval line is absent without a coastal enemy city and at half the naval cap', () => {
  const ring = neighbors();
  const builder = ring[0]!;
  const inland = ring[1]!;
  const coastal = ring[2]!;
  const water = [...gridDisk(coastal, 1)].find((hex) => hex !== coastal);
  assert.ok(water);
  const labels = labelsFor([builder, inland, coastal, water]);
  const navalBuilder = [queueRow({ h3: builder, urban: 20, types: ['naval'], center: labels.center })];
  const inlandLines = linesFor({
    hexes: [builder, inland],
    queues: navalBuilder,
    state: world({
      ...enemies([{ h3: inland, urban: 10 }]),
      hexes: [{ h3Index: inland, terrain: 'land', terrainKind: 'plains' }],
    }),
  });
  const ceiling = Math.ceil(getMaxUnitsPerType(parseGameSize('small')).naval * NAVAL_PRIORITY_CAP_SHARE);
  const cappedLines = linesFor({
    hexes: [builder, coastal, water],
    queues: navalBuilder,
    state: world({
      ...enemies([{ h3: coastal, urban: 10 }]),
      hexes: [
        { h3Index: coastal, terrain: 'land', terrainKind: 'plains' },
        { h3Index: water, terrain: 'water', terrainKind: 'sea' },
      ],
      units: Array.from({ length: ceiling }, (_, index) => ({
        id: `n${index}`,
        player: OWN,
        unitType: 'naval',
        h3Index: ORIGIN,
      })),
    }),
  });
  assert.equal(inlandLines.some((line) => line.startsWith('- Naval:')), false);
  assert.equal(cappedLines.some((line) => line.startsWith('- Naval:')), false);
});

test('the credits line names the smallest city that meets the size floor', () => {
  const ring = neighbors();
  const tiny = ring[0]!;
  const floor = ring[1]!;
  const huge = ring[2]!;
  const labels = labelsFor([tiny, floor, huge]);
  const queues = [
    queueRow({ h3: tiny, urban: 5, types: ['credits'], center: labels.center }),
    queueRow({ h3: floor, urban: 12, types: ['credits'], center: labels.center }),
    queueRow({ h3: huge, urban: 40, types: ['credits'], center: labels.center }),
  ];
  const economy = { credits: 0, upkeepPerTurn: 0, pendingHireFees: 0, mercenaryCount: 0 };
  const smallLines = linesFor({
    hexes: [tiny, floor, huge],
    queues,
    state: world({ gameSize: 'small', mercenaryEconomy: economy }),
  });
  const largeLines = linesFor({
    hexes: [tiny, floor, huge],
    queues,
    state: world({ gameSize: 'large', mercenaryEconomy: economy }),
  });
  const tooSmall = linesFor({
    hexes: [tiny],
    queues: [queueRow({ h3: tiny, urban: 5, types: ['credits'], center: labels.center })],
    state: world({ mercenaryEconomy: economy }),
  });
  assert.deepEqual(smallLines, [`- Credits: no city is producing credits. Queue credits in ${floor}.`]);
  assert.deepEqual(largeLines, [`- Credits: no city is producing credits. Queue credits in ${huge}.`]);
  assert.deepEqual(tooSmall, []);
});

test('the credits line is absent when credits is next or the treasury is at the ceiling', () => {
  const ring = neighbors();
  const city = ring[0]!;
  const labels = labelsFor([city]);
  const economy = { credits: 0, upkeepPerTurn: 0, pendingHireFees: 0, mercenaryCount: 0 };
  const nextIsCredits = linesFor({
    hexes: [city],
    queues: [
      queueRow({
        h3: city,
        urban: 20,
        types: ['credits'],
        center: labels.center,
        entries: [{ unitType: 'credits', queueIndex: 0 }],
      }),
    ],
    state: world({ mercenaryEconomy: economy }),
  });
  const atCeiling = linesFor({
    hexes: [city],
    queues: [queueRow({ h3: city, urban: 12, types: ['credits'], center: labels.center })],
    state: world({ mercenaryEconomy: { ...economy, credits: 12 * 10 } }),
  });
  assert.deepEqual(nextIsCredits, []);
  assert.deepEqual(atCeiling, []);
});

test('priority lines stay in missile, naval, then credits order', () => {
  const ring = neighbors();
  const builder = ring[0]!;
  const target = ring[1]!;
  const water = [...gridDisk(target, 1)].find((hex) => hex !== target && hex !== builder);
  assert.ok(water);
  const labels = labelsFor([builder, target, water]);
  const lines = linesFor({
    hexes: [builder, target, water],
    queues: [queueRow({ h3: builder, urban: 20, types: ['missile', 'naval', 'credits'], center: labels.center })],
    state: world({
      ...enemies([{ h3: target, urban: 9 }]),
      hexes: [
        { h3Index: target, terrain: 'coastal', terrainKind: 'coast' },
        { h3Index: water, terrain: 'water', terrainKind: 'sea' },
      ],
      mercenaryEconomy: { credits: 0, upkeepPerTurn: 0, pendingHireFees: 0, mercenaryCount: 0 },
    }),
  });
  assert.equal(lines.length, 3);
  assert.match(lines[0]!, /^- Missile: /);
  assert.match(lines[1]!, /^- Naval: /);
  assert.match(lines[1]!, /1 enemy city is on the coast/);
  assert.match(lines[2]!, /^- Credits: /);
});
