/**
 * Contract tests for translating `assign_order` place fields from briefing hex codes into stored coordinates.
 * Run: `node dist/main/openrouter/assignOrderHexParams.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ensureStrategicCoordinateRegistryInitialized } from '../briefing/map/hex-coordinates';
import { h3ToCode } from '../briefing/map/hex-code-translator';
import { buildLatLngCoordinateMap } from '../mapData';
import { dbGetOne, getGameState } from '../gameDb';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { translateAssignOrderHexCodeParams } from './assignOrderHexParams';
import { parseOrdersResponse } from './orderResponseParsing';

const STRATEGIC_CONTEXT = { mode: 'strategic' as const };

/**
 * Runs `body` against a seeded temporary game DB with the strategic code registry ready.
 *
 * Purpose: Standing orders are strategic-only, so every case here needs the strategic registry plus real
 * units and hexes to route a model payload all the way into Tool 5.
 * When to use: Each parser-level case in this file.
 * Expected outcome: `body` receives an opponent land unit and a coordinate map over the live hex list.
 * Exceptions: Assertion failure when the seeded scenario lacks the units these tests rely on.
 */
function withSeededStrategicGame(
  label: string,
  body: (fixture: {
    landUnitId: string;
    hexCodes: [string, string];
    run: (ordersJson: string) => ReturnType<typeof parseOrdersResponse>;
  }) => void
): void {
  withTempGameDb(label, () => {
    ensureStrategicCoordinateRegistryInitialized();
    const state = getGameState();
    const landUnit = state.units.find(
      (u) => u.player === 'opponent' && (u.unitType === 'infantry' || u.unitType === 'armor')
    );
    assert.ok(landUnit, 'expected a seeded opponent land unit');
    const landHexes = [
      ...new Set(
        state.units.filter((u) => u.unitType === 'infantry' || u.unitType === 'armor').map((u) => u.h3Index)
      ),
    ];
    assert.ok(landHexes.length >= 2, 'expected land units on at least two distinct hexes');
    const hexList = state.hexes.map((h) => h.h3Index);
    const { latLngByH3, resolveToH3 } = buildLatLngCoordinateMap(hexList);
    body({
      landUnitId: landUnit!.id,
      hexCodes: [h3ToCode(landHexes[0]!, STRATEGIC_CONTEXT), h3ToCode(landHexes[1]!, STRATEGIC_CONTEXT)],
      run: (ordersJson) =>
        parseOrdersResponse(ordersJson, resolveToH3, state, latLngByH3, false, STRATEGIC_CONTEXT),
    });
  });
}

test('a patrol order with hex-code waypoints is accepted and stored', () => {
  withSeededStrategicGame('aw-assign-order-patrol-', ({ landUnitId, hexCodes, run }) => {
    const parsed = run(
      `{"strategy":"screen the approach","orders":[{"action":"assign_order","unitId":"${landUnitId}",` +
        `"order":{"type":"patrol","waypoints":["${hexCodes[0]}","${hexCodes[1]}"]}}],` +
        `"airStrikes":[],"ferryOrders":[],"callbacks":[]}`
    );
    assert.ok(parsed);
    assert.deepEqual(
      parsed!.dropReasons?.filter((r) => r.includes('assign_order')) ?? [],
      [],
      'patrol waypoints given as hex codes must not be rejected as off-map'
    );
    const row = dbGetOne<{ order_type: string; params: string }>(
      'SELECT order_type, params FROM standing_orders WHERE unit_id = ?',
      [landUnitId]
    );
    assert.equal(row?.order_type, 'patrol');
    const waypoints = (JSON.parse(row!.params) as { waypoints?: unknown[] }).waypoints;
    assert.equal(waypoints?.length, 2);
    for (const waypoint of waypoints!) {
      assert.ok(Array.isArray(waypoint) && waypoint.every((n) => typeof n === 'number'));
    }
  });
});

test('a patrol waypoint that is not a place on the map is rejected', () => {
  withSeededStrategicGame('aw-assign-order-patrol-bad-', ({ landUnitId, hexCodes, run }) => {
    const parsed = run(
      `{"strategy":"screen","orders":[{"action":"assign_order","unitId":"${landUnitId}",` +
        `"order":{"type":"patrol","waypoints":["${hexCodes[0]}","nowhere"]}}],` +
        `"airStrikes":[],"ferryOrders":[],"callbacks":[]}`
    );
    assert.ok(parsed);
    assert.ok(
      parsed!.dropReasons?.some((r) => r.includes('assign_order') && r.includes('waypoint 2')),
      'an unusable waypoint must be reported rather than silently stored'
    );
    assert.equal(
      dbGetOne<{ unit_id: string }>('SELECT unit_id FROM standing_orders WHERE unit_id = ?', [landUnitId]),
      undefined
    );
  });
});

test('a defend order with a hex code stores coordinates rather than the raw code', () => {
  withSeededStrategicGame('aw-assign-order-defend-', ({ landUnitId, hexCodes, run }) => {
    const parsed = run(
      `{"strategy":"dig in","orders":[{"action":"assign_order","unitId":"${landUnitId}",` +
        `"order":{"type":"defend","defendHex":"${hexCodes[0]}"}}],` +
        `"airStrikes":[],"ferryOrders":[],"callbacks":[]}`
    );
    assert.ok(parsed);
    const row = dbGetOne<{ order_type: string; params: string }>(
      'SELECT order_type, params FROM standing_orders WHERE unit_id = ?',
      [landUnitId]
    );
    assert.equal(row?.order_type, 'defend');
    const defendHex = (JSON.parse(row!.params) as { defendHex?: unknown }).defendHex;
    assert.ok(Array.isArray(defendHex) && defendHex.every((n) => typeof n === 'number'));
  });
});

test('payloads without hex codes are passed through unchanged', () => {
  ensureStrategicCoordinateRegistryInitialized();
  assert.equal(translateAssignOrderHexCodeParams(null, STRATEGIC_CONTEXT, 'u1'), null);
  assert.equal(translateAssignOrderHexCodeParams('hold_fire', STRATEGIC_CONTEXT, 'u1'), 'hold_fire');
  const alreadyCoordinates = { type: 'patrol', waypoints: [[10.5, 20.25] as [number, number]] };
  assert.deepEqual(translateAssignOrderHexCodeParams(alreadyCoordinates, STRATEGIC_CONTEXT, 'u1'), alreadyCoordinates);
});
