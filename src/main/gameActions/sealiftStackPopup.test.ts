/**
 * Stack popup sealift contract tests.
 * Run with: node dist/main/gameActions/sealiftStackPopup.test.js
 */

import * as assert from 'assert';
import { getSealiftStackContextModeForHex } from './sealiftHexEligibility';
import { dbRun } from '../gameDb';
import { withTempDb, pickHex, insertUnit, prepareWaterHex, loadAssignments } from '../testSupport/sealiftTestFixtures';
import {
  readSealiftStackState,
  executeSealiftSlotUpdate,
} from './sealiftStackPopup';
import { listLandSeaportsBySeaAccess } from '../testSupport/seaAccessFixtures';

/**
 * Verifies open-ocean stacks keep embark and debark disabled.
 *
 * Purpose: Open water is not a valid embark hex even when cargo is already aboard.
 * When to use: After edits to stack context mode or water fixture setup.
 * Expected outcome: Mode water, controls disabled, debark buttons off.
 * Exceptions: None.
 */
function testSealiftStateDisablesDebarkButtonsOnOpenWater(): void {
  withTempDb(() => {
    const waterHex = pickHex(9);
    prepareWaterHex(waterHex, { seaportCount: 0 });
    insertUnit('human-naval-water-debark-ui', 'human', 'naval', waterHex);
    insertUnit('human-inf-water-debark-ui', 'human', 'infantry', waterHex);
    dbRun('INSERT OR REPLACE INTO unit_transport_assignments (land_unit_id, naval_unit_id) VALUES (?, ?)', [
      'human-inf-water-debark-ui',
      'human-naval-water-debark-ui',
    ]);

    const state = readSealiftStackState(waterHex);
    assert.strictEqual(state.contextMode, 'water');
    assert.strictEqual(state.controlsDisabled, true);
    assert.strictEqual(state.debarkAllowedAtHex, false);
    assert.strictEqual(state.navalRows.length, 1);
    assert.deepStrictEqual(state.navalRows[0]?.slots.map((slot) => slot.debarkEnabled), [false, false, false, false]);
  });
}

/**
 * Verifies collocated armor can use sealift controls at a human-controlled water seaport.
 *
 * Purpose: Stack UI must match `canEmbarkAtHex` for controlled water seaports (not treat them as open ocean).
 * When to use: After edits to `getSealiftStackContextModeForHex`.
 * Expected outcome: Mode coastal_port, embark controls enabled, sealift section shown.
 * Exceptions: None.
 */
function testSealiftStateEnablesEmbarkAtControlledWaterPort(): void {
  withTempDb(() => {
    const waterHex = pickHex(13);
    prepareWaterHex(waterHex, { seaportCount: 1, controllerPlayerId: 'human' });
    insertUnit('human-naval-water-embark', 'human', 'naval', waterHex);
    insertUnit('human-armor-water-embark', 'human', 'armor', waterHex);

    assert.strictEqual(getSealiftStackContextModeForHex(waterHex), 'coastal_port');
    const state = readSealiftStackState(waterHex);
    assert.strictEqual(state.contextMode, 'coastal_port');
    assert.strictEqual(state.controlsDisabled, false);
    assert.strictEqual(state.showSealiftSection, true);
  });
}

/**
 * Verifies human embark stays disabled at an opponent-held water seaport.
 *
 * Purpose: Water seaports still require acting-player control for human stack embark.
 * When to use: After edits to `getSealiftStackContextModeForHex`.
 * Expected outcome: Mode water and controls disabled.
 * Exceptions: None.
 */
function testSealiftStateDisablesEmbarkAtEnemyWaterPort(): void {
  withTempDb(() => {
    const waterHex = pickHex(8);
    prepareWaterHex(waterHex, { seaportCount: 1, controllerPlayerId: 'opponent' });
    insertUnit('human-naval-enemy-port', 'human', 'naval', waterHex);
    insertUnit('human-armor-enemy-port', 'human', 'armor', waterHex);

    assert.strictEqual(getSealiftStackContextModeForHex(waterHex), 'water');
    const state = readSealiftStackState(waterHex);
    assert.strictEqual(state.contextMode, 'water');
    assert.strictEqual(state.controlsDisabled, true);
  });
}

/**
 * Verifies occupied cargo can still debark at a controlled water seaport after embark is enabled there.
 *
 * Purpose: Enabling embark at water ports must not remove the existing manual-debark path.
 * When to use: After edits to stack context mode or `buildNavalRows`.
 * Expected outcome: Mode coastal_port, embark controls enabled, debark slot enabled for occupied cargo.
 * Exceptions: None.
 */
function testSealiftStateEnablesDebarkAtControlledWaterPort(): void {
  withTempDb(() => {
    const waterHex = pickHex(14);
    prepareWaterHex(waterHex, { seaportCount: 1, controllerPlayerId: 'human' });
    insertUnit('human-naval-port-debark', 'human', 'naval', waterHex);
    insertUnit('human-inf-port-debark', 'human', 'infantry', waterHex);
    dbRun('INSERT OR REPLACE INTO unit_transport_assignments (land_unit_id, naval_unit_id) VALUES (?, ?)', [
      'human-inf-port-debark',
      'human-naval-port-debark',
    ]);

    const state = readSealiftStackState(waterHex);
    assert.strictEqual(state.contextMode, 'coastal_port');
    assert.strictEqual(state.controlsDisabled, false);
    assert.strictEqual(state.debarkAllowedAtHex, true);
    assert.strictEqual(state.navalRows[0]?.slots[0]?.debarkEnabled, true);
  });
}

/**
 * Verifies human slot IPC can load armor onto a collocated ship at a controlled water seaport.
 *
 * Purpose: Stack embark must succeed at the same hexes `canEmbarkAtHex` allows.
 * When to use: After edits to `executeSealiftSlotUpdate` embark eligibility.
 * Expected outcome: Success and a transport assignment row for the armor/naval pair.
 * Exceptions: None.
 */
function testUpdateSealiftSlotEmbarksArmorAtControlledWaterPort(): void {
  withTempDb(() => {
    const waterHex = pickHex(2);
    prepareWaterHex(waterHex, { seaportCount: 1, controllerPlayerId: 'human' });
    insertUnit('human-naval-slot-water', 'human', 'naval', waterHex);
    insertUnit('human-armor-slot-water', 'human', 'armor', waterHex);
    const result = executeSealiftSlotUpdate({
      h3Index: waterHex,
      navalUnitId: 'human-naval-slot-water',
      slotIndex: 1,
      landUnitId: 'human-armor-slot-water',
    });
    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(loadAssignments(), [
      { landUnitId: 'human-armor-slot-water', navalUnitId: 'human-naval-slot-water' },
    ]);
  });
}

/**
 * Verifies human slot IPC cannot embark on open water.
 *
 * Purpose: Open ocean remains at-sea for sealift assignment changes.
 * When to use: After edits to `executeSealiftSlotUpdate` embark eligibility.
 * Expected outcome: Failure with the at-sea reason string.
 * Exceptions: None.
 */
function testUpdateSealiftSlotRejectsEmbarkOnOpenWater(): void {
  withTempDb(() => {
    const waterHex = pickHex(5);
    prepareWaterHex(waterHex, { seaportCount: 0 });
    insertUnit('human-naval-open-slot', 'human', 'naval', waterHex);
    insertUnit('human-armor-open-slot', 'human', 'armor', waterHex);
    const result = executeSealiftSlotUpdate({
      h3Index: waterHex,
      navalUnitId: 'human-naval-open-slot',
      slotIndex: 1,
      landUnitId: 'human-armor-open-slot',
    });
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.reason, 'Sealift assignments cannot be changed while at sea.');
  });
}

/**
 * Verifies human slot IPC cannot embark at an opponent-held water seaport.
 *
 * Purpose: Water seaports still require acting-player control for human embark.
 * When to use: After edits to `executeSealiftSlotUpdate` embark eligibility.
 * Expected outcome: Failure without writing a transport assignment.
 * Exceptions: None.
 */
function testUpdateSealiftSlotRejectsEmbarkAtEnemyWaterPort(): void {
  withTempDb(() => {
    const waterHex = pickHex(6);
    prepareWaterHex(waterHex, { seaportCount: 1, controllerPlayerId: 'opponent' });
    insertUnit('human-naval-enemy-slot', 'human', 'naval', waterHex);
    insertUnit('human-armor-enemy-slot', 'human', 'armor', waterHex);
    const result = executeSealiftSlotUpdate({
      h3Index: waterHex,
      navalUnitId: 'human-naval-enemy-slot',
      slotIndex: 1,
      landUnitId: 'human-armor-enemy-slot',
    });
    assert.strictEqual(result.success, false);
    assert.deepStrictEqual(loadAssignments(), []);
  });
}

/**
 * The stack popup at a land seaport with no sea access disables boarding and keeps unloading.
 *
 * Purpose: Every boarding pick fails at such a port, so the lists must not be offered as usable.
 * When to use: After changes to the stack context mode or land-seaport sea access.
 * Expected outcome: Context mode `port_no_sea_access`, the stack and row controls disabled, and debark allowed at the hex.
 * Exceptions: None.
 */
function testSealiftStateDisablesEmbarkAtLandSeaportWithoutSeaAccess(): void {
  withTempDb(() => {
    const port = listLandSeaportsBySeaAccess().dry[0]!;
    insertUnit('human-naval-dry-state', 'human', 'naval', port);
    insertUnit('human-inf-dry-state', 'human', 'infantry', port);
    assert.strictEqual(getSealiftStackContextModeForHex(port), 'port_no_sea_access');
    const state = readSealiftStackState(port);
    assert.strictEqual(state.controlsDisabled, true);
    assert.strictEqual(state.debarkAllowedAtHex, true);
    assert.strictEqual(state.navalRows[0]?.controlsDisabled, true);
  });
}

/**
 * Verifies a ship takes four infantry through the slot editor and refuses a fifth.
 *
 * Purpose: A ship has four cargo slots, and each edit fills the slot named.
 * When to use: After edits to `executeSealiftSlotUpdate` or the ship slot count.
 * Expected outcome: Four slots filled in order; the fifth edit names a slot the ship does not have.
 * Exceptions: None.
 */
function testAShipTakesFourInfantryThroughTheSlotEditor(): void {
  withTempDb(() => {
    const waterHex = pickHex(3);
    prepareWaterHex(waterHex, { seaportCount: 1, controllerPlayerId: 'human' });
    insertUnit('human-naval-four', 'human', 'naval', waterHex);
    const ids = ['a', 'b', 'c', 'd', 'e'].map((suffix) => `human-inf-four-${suffix}`);
    for (const id of ids) insertUnit(id, 'human', 'infantry', waterHex);
    ids.slice(0, 4).forEach((landUnitId, index) => {
      const result = executeSealiftSlotUpdate({ h3Index: waterHex, navalUnitId: 'human-naval-four', slotIndex: index + 1, landUnitId });
      assert.strictEqual(result.success, true, result.reason);
    });
    const state = readSealiftStackState(waterHex);
    assert.deepStrictEqual(state.navalRows[0]?.slots.map((slot) => slot.unitId), ids.slice(0, 4));
    const fifth = executeSealiftSlotUpdate({ h3Index: waterHex, navalUnitId: 'human-naval-four', slotIndex: 4, landUnitId: ids[4] ?? null });
    assert.strictEqual(fifth.success, true);
    assert.strictEqual(loadAssignments().length, 4);
    const beyond = executeSealiftSlotUpdate({ h3Index: waterHex, navalUnitId: 'human-naval-four', slotIndex: 5, landUnitId: ids[0] ?? null });
    assert.deepStrictEqual([beyond.success, beyond.reason], [false, 'That carrier has only 4 cargo slots.']);
  });
}

/**
 * Verifies armor in the first slot covers the second.
 *
 * Purpose: Armor takes two slots, so the second slot is covered and refuses an edit.
 * When to use: After edits to slot layout or `executeSealiftSlotUpdate`.
 * Expected outcome: Slot 2 is disabled and names the armor; an edit to it is refused.
 * Exceptions: None.
 */
function testArmorInFirstSlotCoversSecond(): void {
  withTempDb(() => {
    const waterHex = pickHex(4);
    prepareWaterHex(waterHex, { seaportCount: 1, controllerPlayerId: 'human' });
    insertUnit('human-naval-cover', 'human', 'naval', waterHex);
    insertUnit('human-armor-cover', 'human', 'armor', waterHex);
    insertUnit('human-inf-cover', 'human', 'infantry', waterHex);
    const armor = executeSealiftSlotUpdate({ h3Index: waterHex, navalUnitId: 'human-naval-cover', slotIndex: 1, landUnitId: 'human-armor-cover' });
    assert.strictEqual(armor.success, true, armor.reason);
    const slot = armor.state?.navalRows[0]?.slots[1];
    assert.strictEqual(slot?.coveredByUnitId, 'human-armor-cover');
    assert.strictEqual(slot?.disabled, true);
    const refused = executeSealiftSlotUpdate({ h3Index: waterHex, navalUnitId: 'human-naval-cover', slotIndex: 2, landUnitId: 'human-inf-cover' });
    assert.deepStrictEqual([refused.success, refused.reason], [false, 'That slot is filled by the armor in the slot before it.']);
  });
}

/**
 * Runs every stack popup test in order.
 *
 * Purpose: Node test entrypoint for main-process discovery.
 * When to use: `node dist/main/gameActions/sealiftStackPopup.test.js`.
 * Expected outcome: Logs `sealiftStackPopup.test.ts passed` when every case passes.
 * Exceptions: Propagates assertion errors.
 */
function run(): void {
  testSealiftStateDisablesEmbarkAtLandSeaportWithoutSeaAccess();
  testSealiftStateDisablesDebarkButtonsOnOpenWater();
  testSealiftStateEnablesEmbarkAtControlledWaterPort();
  testSealiftStateDisablesEmbarkAtEnemyWaterPort();
  testSealiftStateEnablesDebarkAtControlledWaterPort();
  testUpdateSealiftSlotEmbarksArmorAtControlledWaterPort();
  testUpdateSealiftSlotRejectsEmbarkOnOpenWater();
  testUpdateSealiftSlotRejectsEmbarkAtEnemyWaterPort();
  testAShipTakesFourInfantryThroughTheSlotEditor();
  testArmorInFirstSlotCoversSecond();
  console.log('sealiftStackPopup.test.ts passed');
}

run();
