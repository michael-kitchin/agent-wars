/**
 * Contract tests for missile launch parsing.
 * Run: node dist/main/openRouter/missileLaunchOrderParsing.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cellToLatLng } from 'h3-js';
import { AI_SEAT_IDS } from '../../shared/seatIds';
import { ensureStrategicCoordinateRegistryInitialized } from '../briefing/map/hexCoordinates';
import { h3ToCode } from '../briefing/map/hexCodeTranslator';
import { buildLatLngCoordinateMap } from '../mapData';
import type { GameStateSnapshot } from '../gameDb';
import { applyParsedMissileLaunches, MISSILE_LAUNCH_ENTRY_INVALID_REASON, MISSILE_LAUNCH_IN_BATTLE_DROP_REASON } from './missileLaunchOrderParsing';
import { parseOrdersResponse } from './orderResponseParsing';

/** Hex the strategic registry can name. */
const FIXTURE_HEX = '891f1d48b9fffff';

/**
 * Minimal snapshot the parser accepts.
 *
 * Purpose: Parsing only needs a hex list and a turn.
 * When to use: Each parse case.
 * Expected outcome: A snapshot `parseOrdersResponse` can read.
 * Exceptions: None.
 */
const minimalState = {
  hexes: [{ h3Index: FIXTURE_HEX, terrain: 'land', terrainKind: 'plains' }],
  units: [],
  phase: 'planning',
  turnNumber: 1,
  pendingOrders: [],
} as GameStateSnapshot;

/**
 * Parses one envelope against the strategic registry.
 *
 * Purpose: The cases share registry setup and the fixture hex.
 * When to use: Strategic parse cases.
 * Expected outcome: The same result `parseOrdersResponse` returns for that text.
 * Exceptions: Throws if the registry cannot start.
 */
function parseStrategic(content: string) {
  ensureStrategicCoordinateRegistryInitialized();
  const { latLngByH3, resolveToH3 } = buildLatLngCoordinateMap([FIXTURE_HEX]);
  return parseOrdersResponse(content, resolveToH3, minimalState, latLngByH3, false, { mode: 'strategic' });
}

test('a missile launch with a real hex code is kept', () => {
  ensureStrategicCoordinateRegistryInitialized();
  const code = h3ToCode(FIXTURE_HEX, { mode: 'strategic' });
  const parsed = parseStrategic(
    JSON.stringify({
      message: 'hold',
      strategy: 'hold',
      orders: [],
      missileLaunches: [{ unitId: 'a1-m1', targetHexCode: code }],
    })
  );
  assert.ok(parsed);
  assert.equal(parsed.missileLaunches.length, 1);
  assert.equal(parsed.missileLaunches[0]?.unitId, 'a1-m1');
  assert.equal(parsed.missileLaunches[0]?.targetH3Index.length > 0, true);
});

test('a missile launch with a bad hex code is dropped', () => {
  const parsed = parseStrategic(
    JSON.stringify({
      message: 'hold',
      strategy: 'hold',
      orders: [],
      missileLaunches: [{ unitId: 'a1-m1', targetHexCode: '??' }],
    })
  );
  assert.ok(parsed);
  assert.deepEqual(parsed.missileLaunches, []);
  assert.ok(parsed.dropReasons?.includes(MISSILE_LAUNCH_ENTRY_INVALID_REASON));
});

test('grouped missile unitIds become one launch each', () => {
  ensureStrategicCoordinateRegistryInitialized();
  const code = h3ToCode(FIXTURE_HEX, { mode: 'strategic' });
  const parsed = parseStrategic(
    JSON.stringify({
      message: 'hold',
      strategy: 'hold',
      orders: [],
      missileLaunches: [{ unitIds: ['a1-m1', 'a1-m2'], targetHexCode: code }],
    })
  );
  assert.ok(parsed);
  assert.deepEqual(
    parsed.missileLaunches.map((launch) => launch.unitId),
    ['a1-m1', 'a1-m2']
  );
});

test('a launch during a battle is dropped', () => {
  ensureStrategicCoordinateRegistryInitialized();
  const latLngByH3 = new Map([[FIXTURE_HEX, cellToLatLng(FIXTURE_HEX) as [number, number]]]);
  const resolveToH3 = (lat: number, lng: number): string | undefined => {
    const ll = latLngByH3.get(FIXTURE_HEX);
    if (ll && Math.abs(ll[0] - lat) < 1e-9 && Math.abs(ll[1] - lng) < 1e-9) return FIXTURE_HEX;
    return undefined;
  };
  const parsed = parseOrdersResponse(
    JSON.stringify({
      message: 'hold',
      strategy: 'hold',
      orders: [],
      missileLaunches: [{ unitId: 'a1-m1', targetHexCode: 'AA' }],
    }),
    resolveToH3,
    minimalState,
    latLngByH3,
    false,
    { mode: 'tactical', battleId: 'missile-parse' }
  );
  assert.ok(parsed);
  assert.deepEqual(parsed.missileLaunches, []);
  assert.ok(parsed.dropReasons?.includes(MISSILE_LAUNCH_IN_BATTLE_DROP_REASON));
  const applied = applyParsedMissileLaunches({
    parsed: [{ unitId: 'a1-m1', targetH3Index: FIXTURE_HEX }],
    seatId: AI_SEAT_IDS[0],
    tactical: true,
    aiOrderUnitLabel: (id) => id,
  });
  assert.deepEqual(applied.missileLaunches, []);
  assert.deepEqual(applied.dropReasons, [MISSILE_LAUNCH_IN_BATTLE_DROP_REASON]);
});
