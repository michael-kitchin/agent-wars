/**
 * Contract tests for the credits priority line and the unit caps that gate it.
 * Run: `npm run build:main` then `node dist/main/openRouter/productionPrioritiesCredits.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cellToLatLng, gridDisk } from 'h3-js';
import { getMaxUnitsPerType } from '../../shared/gameSize';
import { AI_SEAT_IDS } from '../../shared/seatIds';
import type { GameStateSnapshot } from '../gameDb';
import { POSTURE_SETTINGS, type PostureSettings } from '../../shared/postureTypes';
import { CREDITS_CITY_MIN_URBAN_PER_SIZE, buildProductionPriorityLines } from './productionPriorities';
import type { ControlledHexQueueSnapshot } from './productionQueueSnapshotTypes';

/** Origin reused so `gridDisk` can supply neighbors. */
const ORIGIN = '810ebffffffffff';

/** Seat the lines are written for. */
const OWN = AI_SEAT_IDS[0];

/** Treasury with nothing in it, so the ceiling never hides the line. */
const EMPTY_ECONOMY = { credits: 0, upkeepPerTurn: 0, pendingHireFees: 0, mercenaryCount: 0 };

/**
 * The credits priority line for one city label.
 *
 * Purpose: Every expectation shares one spelling of the line, including the at-cap reason.
 * When to use: The assertions below.
 * Expected outcome: The `- Credits:` line naming the label.
 * Exceptions: None.
 */
function creditsLine(label: string): string {
  return `- Credits: no city is producing credits. Queue credits in ${label}, where every unit type it can build is at its cap.`;
}

/**
 * Credits lines for queue rows that sit on neighbors of the origin.
 *
 * Purpose: The cases differ only in each row's unit types, the seat's units, and the posture.
 * When to use: Each case.
 * Expected outcome: Only the lines that start with `- Credits:`, labeled by hex id. The rows' hexes are the first neighbors, in order.
 * Exceptions: None.
 */
function creditsLinesFor(args: {
  readonly rows: ReadonlyArray<{ readonly urban: number; readonly types: readonly string[] }>;
  readonly units?: ReadonlyArray<{ readonly unitType: string; readonly isMercenary?: boolean }>;
  readonly settings?: PostureSettings;
}): { readonly lines: string[]; readonly hexes: string[] } {
  const hexes = [...gridDisk(ORIGIN, 1)].filter((hex) => hex !== ORIGIN).slice(0, args.rows.length);
  const byKey = new Map(hexes.map((hex) => [`${cellToLatLng(hex)[0]},${cellToLatLng(hex)[1]}`, hex]));
  const queues: ControlledHexQueueSnapshot[] = args.rows.map((row, index) => ({
    hex: cellToLatLng(hexes[index]!) as [number, number],
    urbanHexCount: row.urban,
    availableUnitTypes: [...row.types],
    entries: [],
  }));
  const state = {
    hexes: [],
    units: (args.units ?? []).map((unit, index) => ({ id: `u${index}`, player: OWN, h3Index: ORIGIN, ...unit })),
    phase: 'planning',
    turnNumber: 1,
    pendingOrders: [],
    gameSize: 'small',
    mercenaryEconomy: EMPTY_ECONOMY,
  } as unknown as GameStateSnapshot;
  const lines = buildProductionPriorityLines({
    state,
    ownSeat: OWN,
    queues,
    resolveToH3: (lat, lng) => byKey.get(`${lat},${lng}`),
    formatHexLabel: (ll) => byKey.get(`${ll[0]},${ll[1]}`) ?? 'unknown',
    settings: args.settings,
  }).filter((line) => line.startsWith('- Credits:'));
  return { lines, hexes };
}

/**
 * `count` copies of one unit type.
 *
 * Purpose: Cap cases fill a type to a chosen count.
 * When to use: The `units` argument of `creditsLinesFor`.
 * Expected outcome: An array of unit descriptors.
 * Exceptions: None.
 */
function copies(count: number, unitType: string, isMercenary = false): Array<{ unitType: string; isMercenary: boolean }> {
  return Array.from({ length: count }, () => ({ unitType, isMercenary }));
}

test('a credits line needs every buildable unit type at its cap', () => {
  const caps = getMaxUnitsPerType('small');
  const rows = [
    { urban: 12, types: ['infantry', 'credits'] },
    { urban: 20, types: ['infantry', 'credits'] },
  ];
  const short = creditsLinesFor({ rows, units: copies(caps.infantry - 1, 'infantry') });
  assert.deepEqual(short.lines, []);
  const full = creditsLinesFor({ rows, units: copies(caps.infantry, 'infantry') });
  assert.deepEqual(full.lines, [creditsLine(full.hexes[0]!)]);
  const hired = creditsLinesFor({ rows, units: copies(caps.infantry, 'infantry', true) });
  assert.deepEqual(hired.lines, []);
});

test('a missile below its cap keeps a city off the credits line', () => {
  const caps = getMaxUnitsPerType('small');
  const rows = [{ urban: 12, types: ['infantry', 'missile', 'credits'] }];
  const infantry = copies(caps.infantry, 'infantry');
  assert.deepEqual(creditsLinesFor({ rows, units: infantry }).lines, []);
  const capped = creditsLinesFor({ rows, units: [...infantry, ...copies(caps.missile, 'missile')] });
  assert.deepEqual(capped.lines, [creditsLine(capped.hexes[0]!)]);
});

test("strangle's larger floor applies to capped cities", () => {
  const larger = CREDITS_CITY_MIN_URBAN_PER_SIZE * POSTURE_SETTINGS.strangle.creditsCityUrbanFactor;
  const rows = [
    { urban: CREDITS_CITY_MIN_URBAN_PER_SIZE, types: ['credits'] },
    { urban: larger, types: ['credits'] },
  ];
  const standard = creditsLinesFor({ rows });
  assert.deepEqual(standard.lines, [creditsLine(standard.hexes[0]!)]);
  const strangle = creditsLinesFor({ rows, settings: POSTURE_SETTINGS.strangle });
  assert.deepEqual(strangle.lines, [creditsLine(strangle.hexes[1]!)]);
});
