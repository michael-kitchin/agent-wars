/**
 * Contracts for pending embark drafts laid over sealift rows.
 *
 * Purpose: A draft must show the cargo a carrier will hold, laid out as the engine lays it out.
 * When to use: After changes to `sealiftPendingEmbarks` or `carrierCargoRules`.
 * Expected outcome: Process exit 0.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SealiftCargoSlot, SealiftNavalRow, SealiftStackState } from './ipc/sealiftTypes';
import { mergePendingEmbarksIntoSealiftState } from './sealiftPendingEmbarks';

/**
 * Builds an empty slot.
 *
 * Purpose: Fixtures list only the slots that hold something.
 * When to use: Building a row.
 * Expected outcome: An enabled slot with no unit.
 * Exceptions: None.
 */
function emptySlot(): SealiftCargoSlot {
  return { unitId: null, coveredByUnitId: null, disabled: false, debarkEnabled: false };
}

/**
 * Builds a stack state with one or two ships.
 *
 * Purpose: Each case supplies the ship rows and whether debark is allowed.
 * When to use: At the start of a case.
 * Expected outcome: A state whose land options are two armor and four infantry.
 * Exceptions: None.
 */
function stateWith(rows: SealiftNavalRow[], debarkAllowedAtHex: boolean): SealiftStackState {
  return {
    h3Index: 'hex',
    showSealiftSection: true,
    contextMode: 'coastal_port',
    controlsDisabled: false,
    hasEmbarkedUnitsInStack: false,
    debarkAllowedAtHex,
    navalRows: rows,
    landOptions: [
      { unitId: 'arm-a', unitType: 'armor' },
      { unitId: 'inf-a', unitType: 'infantry' },
      { unitId: 'inf-b', unitType: 'infantry' },
      { unitId: 'inf-c', unitType: 'infantry' },
      { unitId: 'inf-d', unitType: 'infantry' },
    ],
  };
}

/**
 * Builds an empty ship row.
 *
 * Purpose: Cases start from ships with nothing aboard.
 * When to use: Building a state.
 * Expected outcome: Four empty enabled slots.
 * Exceptions: None.
 */
function shipRow(navalUnitId: string): SealiftNavalRow {
  return { navalUnitId, carrierUnitType: 'naval', slots: [emptySlot(), emptySlot(), emptySlot(), emptySlot()], controlsDisabled: false };
}

test("pending embarks join a ship's cargo, armor first", () => {
  const merged = mergePendingEmbarksIntoSealiftState({
    base: stateWith([shipRow('ship-1')], true),
    pendingEmbark: [
      { unitId: 'inf-b', navalUnitId: 'ship-1' },
      { unitId: 'arm-a', navalUnitId: 'ship-1' },
      { unitId: 'inf-a', navalUnitId: 'ship-1' },
    ],
  });
  const slots = merged.navalRows[0]?.slots ?? [];
  assert.deepEqual(slots.map((slot) => slot.unitId), ['arm-a', null, 'inf-a', 'inf-b']);
  assert.equal(slots[1]?.coveredByUnitId, 'arm-a');
  assert.equal(slots[1]?.disabled, true);
});

test('a pending embark leaves the carrier it was on', () => {
  const loaded = shipRow('ship-1');
  loaded.slots[0] = { unitId: 'inf-a', coveredByUnitId: null, disabled: false, debarkEnabled: true };
  const merged = mergePendingEmbarksIntoSealiftState({
    base: stateWith([loaded, shipRow('ship-2')], true),
    pendingEmbark: [{ unitId: 'inf-a', navalUnitId: 'ship-2' }],
  });
  assert.deepEqual(merged.navalRows[0]?.slots.map((slot) => slot.unitId), [null, null, null, null]);
  assert.deepEqual(merged.navalRows[1]?.slots.map((slot) => slot.unitId), ['inf-a', null, null, null]);
});

test('debark stays off on a ship where debark is not allowed', () => {
  const merged = mergePendingEmbarksIntoSealiftState({
    base: stateWith([shipRow('ship-1')], false),
    pendingEmbark: [{ unitId: 'inf-a', navalUnitId: 'ship-1' }],
  });
  assert.equal(merged.navalRows[0]?.slots[0]?.unitId, 'inf-a');
  assert.equal(merged.navalRows[0]?.slots[0]?.debarkEnabled, false);
  const base = stateWith([shipRow('ship-1')], false);
  const copy = mergePendingEmbarksIntoSealiftState({ base, pendingEmbark: [] });
  assert.deepEqual(copy, base);
  assert.notEqual(copy.navalRows[0], base.navalRows[0]);
});
