/**
 * Contracts for the cargo slot assignment rules.
 *
 * Purpose: Normalizing cargo, applying a slot edit, and building rows must follow the carrier slot model for ships and air units.
 * When to use: After changes to `sealiftSlotAssignment` or `carrierCargoRules`.
 * Expected outcome: Process exit 0.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applySealiftSlotEdit,
  buildSealiftNavalRows,
  buildSealiftStackState,
  normalizeCarrierCargo,
  type CarrierCargoQuery,
} from './sealiftSlotAssignment';

const LAND_TYPES = new Map<string, 'infantry' | 'armor'>([
  ['arm-a', 'armor'],
  ['arm-b', 'armor'],
  ['inf-a', 'infantry'],
  ['inf-b', 'infantry'],
  ['inf-c', 'infantry'],
  ['inf-d', 'infantry'],
  ['inf-e', 'infantry'],
]);

/**
 * Builds a cargo query for a ship, an air unit, or both.
 *
 * Purpose: Each case states only the carriers and cargo it uses.
 * When to use: At the start of a case.
 * Expected outcome: `ship` is a naval carrier and `air` an air carrier, each holding the listed ids.
 * Exceptions: None.
 */
function query(cargo: Record<string, readonly string[]>): CarrierCargoQuery {
  const carrierIds = Object.keys(cargo);
  return {
    carrierIds,
    carrierTypeById: new Map(carrierIds.map((id) => [id, id.startsWith('air') ? 'air' : 'naval'])),
    cargoByCarrierId: new Map(Object.entries(cargo)),
    landTypeById: LAND_TYPES,
  };
}

test('cargo drops unknown units, duplicates, and armor on an air unit', () => {
  const result = normalizeCarrierCargo(query({
    ship: ['gone', 'inf-a', 'inf-b'],
    ship2: ['inf-a', 'inf-c'],
    air: ['arm-a', 'inf-d'],
  }));
  assert.deepEqual(result.get('ship'), ['inf-a', 'inf-b']);
  assert.deepEqual(result.get('ship2'), ['inf-c']);
  assert.deepEqual(result.get('air'), ['inf-d']);
});

test("cargo beyond a carrier's slots is left out", () => {
  const result = normalizeCarrierCargo(query({
    ship: ['inf-e', 'inf-d', 'inf-c', 'inf-b', 'inf-a'],
    air: ['inf-c', 'inf-b', 'inf-a'].filter((id) => id !== 'inf-c'),
  }));
  assert.deepEqual(result.get('ship'), ['inf-a', 'inf-b', 'inf-c', 'inf-d']);
  const airFull = normalizeCarrierCargo(query({ air: ['inf-c', 'inf-b', 'inf-a'] }));
  assert.deepEqual(airFull.get('air'), ['inf-a', 'inf-b']);
});

test("a slot edit outside the carrier's slots is refused", () => {
  const air = applySealiftSlotEdit({ edit: { navalUnitId: 'air', slotIndex: 3, landUnitId: 'inf-a' }, cargo: query({ air: [] }) });
  assert.deepEqual(air, { ok: false, reason: 'That carrier has only 2 cargo slots.' });
  const ship = applySealiftSlotEdit({ edit: { navalUnitId: 'ship', slotIndex: 5, landUnitId: 'inf-a' }, cargo: query({ ship: [] }) });
  assert.deepEqual(ship, { ok: false, reason: 'That carrier has only 4 cargo slots.' });
  const zero = applySealiftSlotEdit({ edit: { navalUnitId: 'ship', slotIndex: 0, landUnitId: null }, cargo: query({ ship: [] }) });
  assert.equal(zero.ok, false);
});

test('a slot covered by armor cannot be edited', () => {
  const outcome = applySealiftSlotEdit({
    edit: { navalUnitId: 'ship', slotIndex: 2, landUnitId: 'inf-a' },
    cargo: query({ ship: ['arm-a'] }),
  });
  assert.deepEqual(outcome, { ok: false, reason: 'That slot is filled by the armor in the slot before it.' });
});

test('armor needs two free slots', () => {
  const outcome = applySealiftSlotEdit({
    edit: { navalUnitId: 'ship', slotIndex: 4, landUnitId: 'arm-a' },
    cargo: query({ ship: ['inf-a', 'inf-b', 'inf-c'] }),
  });
  assert.equal(outcome.ok, false);
  const room = applySealiftSlotEdit({
    edit: { navalUnitId: 'ship', slotIndex: 3, landUnitId: 'arm-a' },
    cargo: query({ ship: ['inf-a', 'inf-b'] }),
  });
  assert.equal(room.ok, true);
  const air = applySealiftSlotEdit({
    edit: { navalUnitId: 'air', slotIndex: 1, landUnitId: 'arm-a' },
    cargo: query({ air: [] }),
  });
  assert.deepEqual(air, { ok: false, reason: 'An air unit can carry only infantry.' });
});

test("a slot edit replaces that slot's unit", () => {
  const outcome = applySealiftSlotEdit({
    edit: { navalUnitId: 'ship', slotIndex: 2, landUnitId: 'inf-c' },
    cargo: query({ ship: ['inf-a', 'inf-b', 'inf-d'] }),
  });
  assert.equal(outcome.ok, true);
  if (outcome.ok) assert.deepEqual(outcome.cargoByCarrierId.get('ship'), ['inf-a', 'inf-c', 'inf-d']);
});

test('a slot edit moves a unit from another carrier', () => {
  const outcome = applySealiftSlotEdit({
    edit: { navalUnitId: 'ship', slotIndex: 2, landUnitId: 'inf-c' },
    cargo: query({ ship: ['inf-a'], ship2: ['inf-c', 'inf-d'] }),
  });
  assert.equal(outcome.ok, true);
  if (outcome.ok) {
    assert.deepEqual(outcome.cargoByCarrierId.get('ship'), ['inf-a', 'inf-c']);
    assert.deepEqual(outcome.cargoByCarrierId.get('ship2'), ['inf-d']);
  }
});

test('emptying a slot debarks its unit', () => {
  const cargo = query({ ship: ['inf-a', 'inf-b'] });
  const outcome = applySealiftSlotEdit({ edit: { navalUnitId: 'ship', slotIndex: 1, landUnitId: null }, cargo });
  assert.equal(outcome.ok, true);
  if (outcome.ok) assert.deepEqual(outcome.cargoByCarrierId.get('ship'), ['inf-b']);
  const empty = applySealiftSlotEdit({ edit: { navalUnitId: 'ship', slotIndex: 4, landUnitId: null }, cargo });
  assert.equal(empty.ok, true);
  if (empty.ok) assert.deepEqual(empty.cargoByCarrierId.get('ship'), ['inf-a', 'inf-b']);
});

test('ship rows have four slots and air rows two', () => {
  const rows = buildSealiftNavalRows({
    cargo: query({ ship: ['inf-a', 'inf-b'], air: ['inf-c'] }),
    contextMode: 'coastal_port',
    debarkAllowed: true,
  });
  assert.equal(rows[0]?.carrierUnitType, 'naval');
  assert.equal(rows[0]?.slots.length, 4);
  assert.deepEqual(rows[0]?.slots.map((slot) => slot.unitId), ['inf-a', 'inf-b', null, null]);
  assert.equal(rows[1]?.carrierUnitType, 'air');
  assert.equal(rows[1]?.slots.length, 2);
  assert.deepEqual(rows[1]?.slots.map((slot) => slot.debarkEnabled), [true, false]);
});

test('a covered slot is disabled and has no debark', () => {
  const rows = buildSealiftNavalRows({
    cargo: query({ ship: ['arm-a', 'inf-a'] }),
    contextMode: 'coastal_port',
    debarkAllowed: true,
  });
  const slots = rows[0]?.slots ?? [];
  assert.equal(slots[0]?.unitId, 'arm-a');
  assert.equal(slots[1]?.coveredByUnitId, 'arm-a');
  assert.equal(slots[1]?.disabled, true);
  assert.equal(slots[1]?.debarkEnabled, false);
  assert.equal(slots[2]?.unitId, 'inf-a');
  assert.equal(slots[2]?.disabled, false);
});

test('controls are disabled at sea', () => {
  const rows = buildSealiftNavalRows({
    cargo: query({ ship: ['inf-a', 'inf-b'] }),
    contextMode: 'water',
    debarkAllowed: false,
  });
  assert.equal(rows[0]?.controlsDisabled, true);
  assert.ok(rows[0]?.slots.every((slot) => slot.disabled && !slot.debarkEnabled));
});

test('buildSealiftStackState shows the section when cargo is embarked and no naval rows remain', () => {
  const state = buildSealiftStackState({
    h3Index: 'hex',
    contextMode: 'coastal_port',
    navalRows: [],
    landOptions: [],
    hasEmbarkedUnitsInStack: true,
    debarkAllowedAtHex: true,
  });
  assert.equal(state.showSealiftSection, true);
});
