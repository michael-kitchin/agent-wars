/**
 * Owned-unit lookup contracts. Run: node dist/main/gameActions/ownedUnitGuards.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getGameState } from '../gameDb';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { loadOwnedStrategicUnit } from './ownedUnitGuards';

test('loadOwnedStrategicUnit returns the row for a unit owned by the requested player', () => {
  withTempGameDb('aw-owned-unit-ok-', () => {
    const human = getGameState().units.find((unit) => unit.player === 'human');
    assert.ok(human);
    const result = loadOwnedStrategicUnit(human.id, {
      allowedPlayer: 'human',
      displayLabelForUnit: (id) => id,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.unit.player, 'human');
    assert.equal(result.unit.h3_index, human.h3Index);
    assert.equal(result.unit.unit_type, human.unitType);
  });
});

test('loadOwnedStrategicUnit rejects a unit owned by someone else with the default reason', () => {
  withTempGameDb('aw-owned-unit-owner-', () => {
    const opponent = getGameState().units.find((unit) => unit.player === 'opponent');
    assert.ok(opponent);
    const result = loadOwnedStrategicUnit(opponent.id, {
      allowedPlayer: 'human',
      displayLabelForUnit: (id) => id,
    });
    assert.deepEqual(result, {
      ok: false,
      failure: { valid: false, reason: 'Unit must belong to human' },
    });
  });
});

test('loadOwnedStrategicUnit rejects an unknown id with the not-found reason', () => {
  withTempGameDb('aw-owned-unit-missing-', () => {
    const result = loadOwnedStrategicUnit('missing-unit-id', {
      allowedPlayer: 'human',
      displayLabelForUnit: (id) => id,
    });
    assert.deepEqual(result, {
      ok: false,
      failure: { valid: false, reason: 'Unit not found: missing-unit-id' },
    });
  });
});
