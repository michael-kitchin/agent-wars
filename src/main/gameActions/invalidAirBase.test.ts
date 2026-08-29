/**
 * Regression: human air on opponent-controlled contested hex must not be deleted before Fight→tactical.
 * Run: `node dist/main/gameActions/invalidAirBase.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dbGetOne, dbRun, getGameState, setRes1InfrastructureForHex } from '../gameDb';
import { ZERO_RES1_INFRA_COUNTS } from '../testSupport/res1TestFixtures';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { destroyAirUnitsWithInvalidBase } from './invalidAirBase';

test('destroyAirUnitsWithInvalidBase retains human air on opponent hex while enemy combat units co-occupy', () => {
  withTempGameDb('aw-invalid-air-contested-', () => {
    const state = getGameState();
    const landHex = state.hexes.find((hx) => hx.terrainKind !== 'water' && hx.terrain !== 'water');
    assert.ok(landHex);
    const h = landHex!.h3Index;
    setRes1InfrastructureForHex(h, ZERO_RES1_INFRA_COUNTS);
    dbRun('DELETE FROM units WHERE h3_index = ?', [h]);
    dbRun('INSERT OR REPLACE INTO res1_control (h3_index, controller_player_id) VALUES (?, ?)', [h, 'opponent']);
    dbRun('INSERT INTO units (id, player, unit_type, h3_index) VALUES (?, ?, ?, ?)', [
      'human-air-contested-base',
      'human',
      'air',
      h,
    ]);
    dbRun('INSERT INTO units (id, player, unit_type, h3_index) VALUES (?, ?, ?, ?)', [
      'opponent-infantry-contested-base',
      'opponent',
      'infantry',
      h,
    ]);
    const removed = destroyAirUnitsWithInvalidBase();
    assert.deepStrictEqual(
      removed.map((u) => u.id),
      [],
      'air must survive contested co-occupancy until control resolves without enemy presence'
    );
    const still = dbGetOne<{ c: number }>('SELECT COUNT(*) AS c FROM units WHERE id = ?', ['human-air-contested-base']);
    assert.strictEqual(still?.c, 1);
  });
});

test('destroyAirUnitsWithInvalidBase still removes sole stranded human air on enemy-controlled hex without airport', () => {
  withTempGameDb('aw-invalid-air-stranded-', () => {
    const state = getGameState();
    const landHex = state.hexes.find((hx) => hx.terrainKind !== 'water' && hx.terrain !== 'water');
    assert.ok(landHex);
    const h = landHex!.h3Index;
    setRes1InfrastructureForHex(h, ZERO_RES1_INFRA_COUNTS);
    dbRun('DELETE FROM units WHERE h3_index = ?', [h]);
    dbRun('INSERT OR REPLACE INTO res1_control (h3_index, controller_player_id) VALUES (?, ?)', [h, 'opponent']);
    dbRun('INSERT INTO units (id, player, unit_type, h3_index) VALUES (?, ?, ?, ?)', [
      'human-air-stranded-solo',
      'human',
      'air',
      h,
    ]);
    const removed = destroyAirUnitsWithInvalidBase();
    assert.ok(removed.some((u) => u.id === 'human-air-stranded-solo'));
    const gone = dbGetOne<{ c: number }>('SELECT COUNT(*) AS c FROM units WHERE id = ?', ['human-air-stranded-solo']);
    assert.strictEqual(gone?.c, 0);
  });
});
