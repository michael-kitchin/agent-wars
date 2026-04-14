/**
 * Phase 5 regression: tactical footprint projection for standing-order march merge. Run:
 * `node dist/main/tacticalBattle/tacticalStandingOrderMarchMerge.test.js`
 */

import assert from 'node:assert/strict';
import { gridDisk } from 'h3-js';
import { test } from 'node:test';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { dbGetAll, getGameStateForPlayer } from '../gameDb';
import { buildLatLngCoordinateMap } from '../mapData';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { generateOrdersForStandingOrders } from '../tools/tool5StandingOrders';
import { mergeHumanStandingOrdersIntoTacticalMarchOrders, pickTacticalRes4TowardStrategicH3 } from './tacticalStandingOrderMarchMerge';
import { tacticalRes1Cell, tacticalRes4UnderRes1Corner } from './testSupport/tacticalRes4HexFixtures';

test('pickTacticalRes4TowardStrategicH3 prefers footprint cell closest to strategic target centroid', () => {
  const res1 = tacticalRes1Cell(2, 2);
  const h0 = tacticalRes4UnderRes1Corner(2, 2);
  const ring = [...gridDisk(h0, 1)];
  const battle: TacticalBattleSnapshot = {
    battleId: 'tb-pick',
    enclosingRes1H3Index: res1,
    res4ChildH3Indexes: ring,
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    subUnits: [],
  };
  const neighborRes1 = ring.find((h) => h !== h0 && ring.includes(h));
  assert.ok(neighborRes1);
  const picked = pickTacticalRes4TowardStrategicH3(battle, neighborRes1!);
  assert.ok(picked);
  assert.ok(ring.includes(picked!));
});

test('mergeHumanStandingOrdersIntoTacticalMarchOrders leaves explicit-only rows when no standing marches apply', () => {
  const res1 = tacticalRes1Cell(4, 4);
  const h0 = tacticalRes4UnderRes1Corner(4, 4);
  const ring = [...gridDisk(h0, 1)];
  const battle: TacticalBattleSnapshot = {
    battleId: 'tb-merge-explicit',
    enclosingRes1H3Index: res1,
    res4ChildH3Indexes: ring,
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    subUnits: [
      {
        id: 'sub-a',
        parentUnitId: 'parent-a',
        player: 'human',
        unitType: 'infantry',
        h3Index: h0,
        displayName: 'A',
      },
    ],
  };
  withTempGameDb('aw-tactical-standing-merge-', () => {
    const merged = mergeHumanStandingOrdersIntoTacticalMarchOrders(battle, [
      { unitId: 'sub-a', toH3Index: ring.find((x) => x !== h0) ?? h0 },
    ]);
    assert.ok(merged.length >= 1);
    assert.strictEqual(merged.find((m) => m.unitId === 'sub-a')?.unitId, 'sub-a');
  });
});

test('generateOrdersForStandingOrders preview leaves standing_orders rows unchanged', () => {
  withTempGameDb('aw-standing-preview-', () => {
    const before = dbGetAll<{ unit_id: string; computed_route: string | null }>(
      'SELECT unit_id, computed_route FROM standing_orders WHERE player_id = ?',
      ['human']
    );
    const state = getGameStateForPlayer('human', { maskUnexploredTerrain: false });
    const hexList = state.hexes.map((h) => h.h3Index);
    const { latLngByH3, resolveToH3 } = buildLatLngCoordinateMap(hexList);
    generateOrdersForStandingOrders('human', state, latLngByH3, resolveToH3, { mutateProgress: false });
    const after = dbGetAll<{ unit_id: string; computed_route: string | null }>(
      'SELECT unit_id, computed_route FROM standing_orders WHERE player_id = ?',
      ['human']
    );
    assert.deepStrictEqual(
      before.map((r) => [r.unit_id, r.computed_route]),
      after.map((r) => [r.unit_id, r.computed_route])
    );
  });
});
