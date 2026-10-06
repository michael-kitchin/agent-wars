/**
 * GameActions multi-select contracts: happy paths and essential failures only.
 * Run with: node dist/main/gameActionsMultiSelect.test.js
 */

import * as assert from 'assert';
import { gridDisk } from 'h3-js';
import {
  dbGetOne,
  getGameState,
  dbRun,
} from './gameDb';
import {
  assignHumanMarchOrder,
  assignHumanMarchOrders,
  getSealiftStackState,
  previewHumanMarchOrders,
  ready,
  validateGroupRangedTarget,
  submitOrders,
  updateSealiftSlot,
} from './gameActions';
import { hexHasSeaport } from './movementTerrain';
import {
  EMBARKED_LAND_UNIT_AT_SEA_MOVE_REASON,
} from './gameActions/landMovementConstraints';
import {
  LAND_UNIT_DESTINATION_NOT_LANDMASS_REASON,
} from '../shared/landTraversalRes1';
import {
  hexSupportsMixedLandAndNaval,
} from './gameActions/humanMarchPreviewMixedSelection';
import {
  findAdjacentHex,
  findAdjacentMixedTransitHex,
  findAdjacentNavalPassableHex,
  findAdjacentNonArcticLandHex,
  findAirportPairByDistance,
  findCoastalHexWithAdjacentLand,
  findNearestLandSeaportHex,
  findPureLandDestinationHex,
  findWaterHexWithAdjacentLand,
  positionLandUnitOnAdjacentWaterPorts,
  setArcticTerrain,
  setHumanControlledPort,
  withTempDb,
} from './testSupport/gameActionsMultiSelectFixtures';

/**
 * Failure text for a mixed land and naval stack that targets an inland hex.
 *
 * Purpose: Grouped preview and assign cases share one expected reason string.
 * When to use: Assertions on mixed-stack coastal-only rejection.
 * Expected outcome: The string matches the production reason for that rejection.
 * Exceptions: None.
 */
const MIXED_LAND_NAVAL_COASTAL_ONLY_REASON = 'Mixed land/naval stacks can only move to coastal hexes.';


/**
 * Regression guard: grouped preview rejects mixed land + naval stacks targeting non-coastal hexes.
 *
 * Purpose: Ensures mixed-stack march preview fails with the coastal-only reason for inland destinations.
 * When to use: Run via `npm test` after changes to grouped human march preview validation.
 * Expected outcome: Preview is invalid, shows invalid marker, and omits route segments.
 * Exceptions: None.
 */
function testPreviewGroupedMixedLandNavalRejectsNonCoastalDestination(): void {
  withTempDb(() => {
    const state = getGameState();
    const landUnit = state.units.find(
      (u) => u.player === 'human' && (u.unitType === 'infantry' || u.unitType === 'armor')
    );
    const navalUnit = state.units.find((u) => u.player === 'human' && u.unitType === 'naval');
    const destination = findPureLandDestinationHex(state);
    assert.ok(landUnit, 'expected seeded human land unit');
    assert.ok(navalUnit, 'expected seeded human naval unit');
    assert.ok(destination, 'expected a pure land destination hex without mixed-domain passability');
    const seaportHex = findNearestLandSeaportHex(state, landUnit!.h3Index);
    assert.ok(seaportHex, 'expected at least one land seaport hex');
    dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [seaportHex!, landUnit!.id]);
    dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [seaportHex!, navalUnit!.id]);

    const result = previewHumanMarchOrders([landUnit!.id, navalUnit!.id], destination!);
    assert.strictEqual(result.validForAll, false);
    assert.strictEqual(result.showInvalidMarker, true);
    assert.strictEqual(result.invalidReason, MIXED_LAND_NAVAL_COASTAL_ONLY_REASON);
    assert.ok(result.previews.length >= 2, 'expected per-unit previews for mixed selection');
    for (const row of result.previews) {
      assert.strictEqual(row.preview.segments.length, 0, 'blocked mixed preview must not draw route lines');
    }
  });
}

/**
 * Regression guard: when any mixed-stack unit cannot reach a coastal destination, grouped preview omits route lines.
 *
 * Purpose: Ensures partial mixed-stack reachability clears segments for every unit in the grouped preview envelope.
 * When to use: Run via `npm test` after changes to grouped human march preview assembly.
 * Expected outcome: At least one coastal destination yields invalid preview rows with empty segments.
 * Exceptions: None.
 */
function testPreviewGroupedMixedLandNavalClearsSegmentsWhenAnyUnitBlocked(): void {
  withTempDb(() => {
    const state = getGameState();
    const landUnit = state.units.find(
      (u) => u.player === 'human' && (u.unitType === 'infantry' || u.unitType === 'armor')
    );
    const navalUnit = state.units.find((u) => u.player === 'human' && u.unitType === 'naval');
    assert.ok(landUnit, 'expected seeded human land unit');
    assert.ok(navalUnit, 'expected seeded human naval unit');
    const seaportHex = findNearestLandSeaportHex(state, landUnit!.h3Index);
    assert.ok(seaportHex, 'expected at least one land seaport hex');
    dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [seaportHex!, landUnit!.id]);
    dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [seaportHex!, navalUnit!.id]);

    let foundPartialFailure = false;
    for (const hex of state.hexes) {
      const hasSeaport = hexHasSeaport(hex.h3Index);
      if (!hexSupportsMixedLandAndNaval({ ...hex, hasSeaport })) continue;
      if (hex.h3Index === seaportHex) continue;
      const result = previewHumanMarchOrders([landUnit!.id, navalUnit!.id], hex.h3Index);
      if (result.validForAll) continue;
      if (result.invalidReason === MIXED_LAND_NAVAL_COASTAL_ONLY_REASON) continue;
      foundPartialFailure = true;
      assert.strictEqual(result.showInvalidMarker, true);
      assert.ok(result.previews.length >= 2, 'expected per-unit previews for mixed selection');
      for (const row of result.previews) {
        assert.strictEqual(
          row.preview.segments.length,
          0,
          `blocked mixed preview must not draw route lines for ${row.unitId}`
        );
      }
      break;
    }
    assert.ok(foundPartialFailure, 'expected at least one coastal destination with partial mixed-stack reachability');
  });
}

/**
 * Regression guard: grouped preview accepts mixed land + naval stacks when the destination is coastal/littoral.
 *
 * Purpose: Ensures valid mixed-stack march previews succeed for shared coastal destinations.
 * When to use: Run via `npm test` after changes to grouped human march preview validation.
 * Expected outcome: Preview is valid for all selected units with at least one representative row.
 * Exceptions: None.
 */
function testPreviewGroupedMixedLandNavalAcceptsCoastalDestination(): void {
  withTempDb(() => {
    const state = getGameState();
    const landUnit = state.units.find(
      (u) => u.player === 'human' && (u.unitType === 'infantry' || u.unitType === 'armor')
    );
    const navalUnit = state.units.find((u) => u.player === 'human' && u.unitType === 'naval');
    assert.ok(landUnit, 'expected seeded human land unit');
    assert.ok(navalUnit, 'expected seeded human naval unit');
    const seaportHex = findNearestLandSeaportHex(state, landUnit!.h3Index);
    assert.ok(seaportHex, 'expected at least one land seaport hex');
    const coastalDestination =
      findAdjacentMixedTransitHex(state, seaportHex!) ?? seaportHex!;
    const destHex = state.hexes.find((h) => h.h3Index === coastalDestination)!;
    const destHasSeaport = hexHasSeaport(coastalDestination!);
    assert.ok(hexSupportsMixedLandAndNaval({ ...destHex, hasSeaport: destHasSeaport }));
    dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [seaportHex!, landUnit!.id]);
    dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [seaportHex!, navalUnit!.id]);

    const result = previewHumanMarchOrders([landUnit!.id, navalUnit!.id], coastalDestination!);
    assert.strictEqual(result.validForAll, true, result.invalidReason ?? 'expected mixed-stack coastal preview to succeed');
    assert.ok(result.previews.length >= 1, 'expected at least one representative preview row');
  });
}

/**
 * Regression guard: grouped assign rejects mixed land + naval stacks targeting non-coastal hexes.
 *
 * Purpose: Ensures mixed-stack march assignment fails with the coastal-only reason for inland destinations.
 * When to use: Run via `npm test` after changes to grouped human march assign validation.
 * Expected outcome: Assign returns failure with `MIXED_LAND_NAVAL_COASTAL_ONLY_REASON`.
 * Exceptions: None.
 */
function testAssignGroupedMixedLandNavalRejectsNonCoastalDestination(): void {
  withTempDb(() => {
    const state = getGameState();
    const landUnit = state.units.find(
      (u) => u.player === 'human' && (u.unitType === 'infantry' || u.unitType === 'armor')
    );
    const navalUnit = state.units.find((u) => u.player === 'human' && u.unitType === 'naval');
    const destination = findPureLandDestinationHex(state);
    assert.ok(landUnit, 'expected seeded human land unit');
    assert.ok(navalUnit, 'expected seeded human naval unit');
    assert.ok(destination, 'expected a pure land destination hex without mixed-domain passability');
    const seaportHex = findNearestLandSeaportHex(state, landUnit!.h3Index);
    assert.ok(seaportHex, 'expected at least one land seaport hex');
    dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [seaportHex!, landUnit!.id]);
    dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [seaportHex!, navalUnit!.id]);

    const result = assignHumanMarchOrders([landUnit!.id, navalUnit!.id], destination!);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.reason, MIXED_LAND_NAVAL_COASTAL_ONLY_REASON);
  });
}

/**
 * Regression guard: grouped assign accepts mixed land + naval stacks to a shared coastal destination.
 *
 * Purpose: Ensures valid mixed-stack march assignment succeeds for shared coastal destinations.
 * When to use: Run via `npm test` after changes to grouped human march assign validation.
 * Expected outcome: Assign returns success for co-located land and naval units at a coastal hex.
 * Exceptions: None.
 */
function testAssignGroupedMixedLandNavalAcceptsCoastalDestination(): void {
  withTempDb(() => {
    const state = getGameState();
    const landUnit = state.units.find(
      (u) => u.player === 'human' && (u.unitType === 'infantry' || u.unitType === 'armor')
    );
    const navalUnit = state.units.find((u) => u.player === 'human' && u.unitType === 'naval');
    assert.ok(landUnit, 'expected seeded human land unit');
    assert.ok(navalUnit, 'expected seeded human naval unit');
    const seaportHex = findNearestLandSeaportHex(state, landUnit!.h3Index);
    assert.ok(seaportHex, 'expected at least one land seaport hex');
    const coastalDestination =
      findAdjacentMixedTransitHex(state, seaportHex!) ?? seaportHex!;
    dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [seaportHex!, landUnit!.id]);
    dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [seaportHex!, navalUnit!.id]);

    const result = assignHumanMarchOrders([landUnit!.id, navalUnit!.id], coastalDestination!);
    assert.strictEqual(result.success, true, result.reason ?? 'expected mixed-stack coastal assign to succeed');
  });
}


/**
 * Defines the `testPreviewGroupedHappyPathSingleUnit` function shape (function testPreviewGroupedHappyPathSingleUnit(): void).

 * Purpose: Supports maintainability by documenting why `testPreviewGroupedHappyPathSingleUnit` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testPreviewGroupedHappyPathSingleUnit(): void {
  withTempDb(() => {
    const state = getGameState();
    const human = state.units.find((u) => u.player === 'human');
    assert.ok(human, 'expected seeded human unit');
    const result = previewHumanMarchOrders([human!.id], human!.h3Index);
    assert.strictEqual(result.validForAll, true);
    assert.strictEqual(result.previews.length, 1);
    assert.strictEqual(result.previews[0]?.unitId, human!.id);
  });
}

/**
 * Defines the `testPreviewGroupedFailsForUnknownUnit` function shape (function testPreviewGroupedFailsForUnknownUnit(): void).

 * Purpose: Supports maintainability by documenting why `testPreviewGroupedFailsForUnknownUnit` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testPreviewGroupedFailsForUnknownUnit(): void {
  withTempDb(() => {
    const state = getGameState();
    const hovered = state.hexes[0]?.h3Index ?? '';
    const result = previewHumanMarchOrders(['human-missing-unit'], hovered);
    assert.strictEqual(result.validForAll, false);
    assert.ok(result.invalidReason, 'expected invalid reason');
  });
}

/**
 * Defines the `testAssignGroupedRejectsEmptySelection` function shape (function testAssignGroupedRejectsEmptySelection(): void).

 * Purpose: Supports maintainability by documenting why `testAssignGroupedRejectsEmptySelection` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testAssignGroupedRejectsEmptySelection(): void {
  withTempDb(() => {
    const state = getGameState();
    const destination = state.hexes[0]?.h3Index ?? '';
    const result = assignHumanMarchOrders([], destination);
    assert.strictEqual(result.success, false);
    assert.ok(result.reason?.includes('No selected units'));
  });
}

/**
 * Defines the `testAssignGroupedHappyPathSingleUnit` function shape (function testAssignGroupedHappyPathSingleUnit(): void).

 * Purpose: Supports maintainability by documenting why `testAssignGroupedHappyPathSingleUnit` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testAssignGroupedHappyPathSingleUnit(): void {
  withTempDb(() => {
    const state = getGameState();
    const human = state.units.find((u) => u.player === 'human');
    assert.ok(human, 'expected seeded human unit');
    const result = assignHumanMarchOrders([human!.id], human!.h3Index);
    assert.strictEqual(result.success, true);
  });
}

/**
 * Defines the `testValidateGroupedRangedInfantryRejectedAsMeleeOnly` function shape (function testValidateGroupedRangedInfantryRejectedAsMeleeOnly(): void).

 * Purpose: Ensures strategic infantry cannot issue ranged attacks (range 0 / melee only).
 * When to use: Regression guard so infantry range is not reintroduced on the strategic map.
 * Expected outcome: `validateGroupRangedTarget` fails with a melee-only / no-ranged-attack reason.
 * Exceptions: None.
 */
function testValidateGroupedRangedInfantryRejectedAsMeleeOnly(): void {
  withTempDb(() => {
    const state = getGameState();
    const infantry = state.units.find((u) => u.player === 'human' && u.unitType === 'infantry');
    assert.ok(infantry, 'expected seeded human infantry unit');
    const mapHex = new Set(state.hexes.map((h) => h.h3Index));
    const neighbors = [...gridDisk(infantry!.h3Index, 1)].filter((h) => h !== infantry!.h3Index && mapHex.has(h));
    assert.ok(neighbors.length > 0, 'expected at least one on-map neighbor for seeded infantry');
    const target = neighbors[0]!;
    const result = validateGroupRangedTarget([infantry!.id], target);
    assert.strictEqual(result.success, false);
    assert.ok(
      /no ranged attack|melee only/i.test(result.reason ?? ''),
      `expected melee-only failure, got: ${result.reason ?? '(none)'}`
    );
  });
}

/**
 * Defines the `testNavalOrdersCanEgressFromLandSeaportToAdjacentWaterOrCoastal` function shape (function testNavalOrdersCanEgressFromLandSeaportToAdjacentWaterOrCoastal(): void).

 * Purpose: Supports maintainability by documenting why `testNavalOrdersCanEgressFromLandSeaportToAdjacentWaterOrCoastal` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testNavalOrdersCanEgressFromLandSeaportToAdjacentWaterOrCoastal(): void {
  withTempDb(() => {
    const state = getGameState();
    const humanNaval = state.units.find((u) => u.player === 'human' && u.unitType === 'naval');
    assert.ok(humanNaval, 'expected seeded human naval unit');
    const landSeaportH3 = findNearestLandSeaportHex(state, humanNaval!.h3Index);
    assert.ok(landSeaportH3, 'expected at least one land seaport hex');
    const adjacentNavalH3 = findAdjacentNavalPassableHex(state, landSeaportH3!);
    assert.ok(adjacentNavalH3, 'expected a water/coastal hex adjacent to a land seaport hex');
    dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [landSeaportH3!, humanNaval!.id]);

    const preview = previewHumanMarchOrders([humanNaval!.id], adjacentNavalH3!);
    assert.strictEqual(
      preview.validForAll,
      true,
      preview.invalidReason ?? 'expected naval preview egress from land seaport to adjacent water/coastal'
    );

    const submit = submitOrders({
      movementOrders: [{ unitId: humanNaval!.id, toH3Index: adjacentNavalH3! }],
    });
    assert.strictEqual(
      submit.success,
      true,
      submit.reason ?? 'expected naval movement order from land seaport to adjacent water/coastal hex to be valid'
    );
  });
}

/**
 * Defines the `testPreviewGroupedRejectsAirUnitsForMarchPlanning` function shape (function testPreviewGroupedRejectsAirUnitsForMarchPlanning(): void).

 * Purpose: Supports maintainability by documenting why `testPreviewGroupedRejectsAirUnitsForMarchPlanning` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testPreviewGroupedRejectsAirUnitsForMarchPlanning(): void {
  withTempDb(() => {
    const state = getGameState();
    const airportPair = findAirportPairByDistance(state, (distance) => distance > 4);
    assert.ok(airportPair, 'expected at least one airport destination beyond ferry range');
    const airUnitId = 'human-air-preview-test-1';
    dbRun('INSERT INTO units (id, player, unit_type, h3_index) VALUES (?, ?, ?, ?)', [
      airUnitId,
      'human',
      'air',
      airportPair!.originH3,
    ]);

    dbRun('INSERT OR REPLACE INTO res1_control (h3_index, controller_player_id) VALUES (?, ?)', [airportPair!.destinationH3, 'human']);
    dbRun('INSERT OR REPLACE INTO res1_control (h3_index, controller_player_id) VALUES (?, ?)', [airportPair!.originH3, 'human']);
    const result = previewHumanMarchOrders([airUnitId], airportPair!.destinationH3);
    const outOfRangeReason = result.invalidReason ?? null;
    const hasExpectedOutOfRangeReason =
      outOfRangeReason?.includes('out of range') || outOfRangeReason?.includes('out of ferry range');
    assert.ok(hasExpectedOutOfRangeReason, `expected out-of-range ferry reason, got: ${outOfRangeReason}`);
  });
}

/**
 * Defines the `testPreviewGroupedAcceptsAirFerryDestinationWithinRange` function shape (function testPreviewGroupedAcceptsAirFerryDestinationWithinRange(): void).

 * Purpose: Supports maintainability by documenting why `testPreviewGroupedAcceptsAirFerryDestinationWithinRange` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testPreviewGroupedAcceptsAirFerryDestinationWithinRange(): void {
  withTempDb(() => {
    const state = getGameState();
    const airportPair = findAirportPairByDistance(state, (distance) => distance >= 1 && distance <= 4);
    assert.ok(airportPair, 'expected an airport destination within ferry range');
    const airUnitId = 'human-air-preview-test-2';
    dbRun('INSERT INTO units (id, player, unit_type, h3_index) VALUES (?, ?, ?, ?)', [
      airUnitId,
      'human',
      'air',
      airportPair!.originH3,
    ]);
    dbRun('INSERT OR REPLACE INTO res1_control (h3_index, controller_player_id) VALUES (?, ?)', [airportPair!.destinationH3, 'human']);
    dbRun('INSERT OR REPLACE INTO res1_control (h3_index, controller_player_id) VALUES (?, ?)', [airportPair!.originH3, 'human']);
    const result = previewHumanMarchOrders([airUnitId], airportPair!.destinationH3);
    assert.strictEqual(result.validForAll, true);
    assert.strictEqual(result.previews.length, 1);
    assert.strictEqual(result.previews[0]?.preview.valid, true);
  });
}

/**
 * Defines the `testAssignMarchRejectsAirUnits` function shape (function testAssignMarchRejectsAirUnits(): void).

 * Purpose: Supports maintainability by documenting why `testAssignMarchRejectsAirUnits` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testAssignMarchRejectsAirUnits(): void {
  withTempDb(() => {
    const state = getGameState();
    const human = state.units.find((u) => u.player === 'human');
    assert.ok(human, 'expected seeded human unit');
    const destination = state.hexes[0]?.h3Index ?? '';
    const airUnitId = 'human-air-assign-test-1';
    dbRun('INSERT INTO units (id, player, unit_type, h3_index) VALUES (?, ?, ?, ?)', [
      airUnitId,
      'human',
      'air',
      human!.h3Index,
    ]);
    const result = assignHumanMarchOrder(airUnitId, destination);
    assert.strictEqual(result.success, false);
    assert.ok(result.reason?.includes('Air units cannot use march orders'));
  });
}

/**
 * Defines the `testPreviewEmbarkedLandUnitOnWaterShowsInvalidWithoutPathPlanning` function shape (function testPreviewEmbarkedLandUnitOnWaterShowsInvalidWithoutPathPlanning(): void).

 * Purpose: Supports maintainability by documenting why `testPreviewEmbarkedLandUnitOnWaterShowsInvalidWithoutPathPlanning` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testPreviewEmbarkedLandUnitOnWaterShowsInvalidWithoutPathPlanning(): void {
  withTempDb(() => {
    const state = getGameState();
    const landUnit = state.units.find(
      (u) => u.player === 'human' && (u.unitType === 'infantry' || u.unitType === 'armor')
    );
    const navalUnit = state.units.find((u) => u.player === 'human' && u.unitType === 'naval');
    const waterHex = state.hexes.find((hex) => hex.terrain === 'water');
    const hoveredHex = state.hexes.find((hex) => hex.h3Index !== (waterHex?.h3Index ?? ''));
    assert.ok(landUnit, 'expected seeded human land unit');
    assert.ok(navalUnit, 'expected seeded human naval unit');
    assert.ok(waterHex, 'expected at least one water hex');
    assert.ok(hoveredHex, 'expected at least one hovered destination hex');
    dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [waterHex!.h3Index, landUnit!.id]);
    dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [waterHex!.h3Index, navalUnit!.id]);
    dbRun('INSERT OR REPLACE INTO unit_transport_assignments (land_unit_id, naval_unit_id) VALUES (?, ?)', [
      landUnit!.id,
      navalUnit!.id,
    ]);
    const result = previewHumanMarchOrders([landUnit!.id], hoveredHex!.h3Index);
    assert.strictEqual(result.validForAll, false);
    assert.strictEqual(result.showInvalidMarker, true);
    assert.strictEqual(
      result.invalidReason,
      EMBARKED_LAND_UNIT_AT_SEA_MOVE_REASON
    );
    assert.strictEqual(result.previews.length, 1);
    assert.strictEqual(result.previews[0]?.preview.valid, false);
    assert.strictEqual(result.previews[0]?.preview.showInvalidMarker, true);
    assert.deepStrictEqual(result.previews[0]?.preview.segments, []);
  });
}


/**
 * Defines the `testEmbarkedLandUnitBlockedFromPreviewAndAssignAtSeaportWater` function shape (function testEmbarkedLandUnitBlockedFromPreviewAndAssignAtSeaportWater(): void).

 * Purpose: Embarked land cannot receive independent march orders until manual debark, even at controlled water seaports.
 * When to use: Regression guard after removing seaport debark hop from human march validation.
 * Expected outcome: Preview and assign both fail; transport assignment row remains.
 * Exceptions: None.
 */
function testEmbarkedLandUnitBlockedFromPreviewAndAssignAtSeaportWater(): void {
  withTempDb(() => {
    const state = getGameState();
    const landUnit = state.units.find(
      (u) => u.player === 'human' && (u.unitType === 'infantry' || u.unitType === 'armor')
    );
    const navalUnit = state.units.find((u) => u.player === 'human' && u.unitType === 'naval');
    const waterWithAdjacentLand = findWaterHexWithAdjacentLand(state);
    assert.ok(landUnit, 'expected seeded human land unit');
    assert.ok(navalUnit, 'expected seeded human naval unit');
    assert.ok(waterWithAdjacentLand, 'expected a water hex with an adjacent land destination');

    dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [waterWithAdjacentLand!.waterHex, landUnit!.id]);
    dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [waterWithAdjacentLand!.waterHex, navalUnit!.id]);
    setHumanControlledPort(waterWithAdjacentLand!.waterHex);
    dbRun('INSERT OR REPLACE INTO unit_transport_assignments (land_unit_id, naval_unit_id) VALUES (?, ?)', [
      landUnit!.id,
      navalUnit!.id,
    ]);

    const preview = previewHumanMarchOrders([landUnit!.id], waterWithAdjacentLand!.adjacentLandHex);
    assert.strictEqual(preview.validForAll, false, 'expected preview to block embarked independent move');
    const assign = assignHumanMarchOrder(landUnit!.id, waterWithAdjacentLand!.adjacentLandHex);
    assert.strictEqual(assign.success, false, assign.reason ?? 'expected assignment to block embarked independent move');
    const assignmentCount =
      dbGetOne<{ count: number }>('SELECT COUNT(*) AS count FROM unit_transport_assignments WHERE land_unit_id = ?', [landUnit!.id])
        ?.count ?? 0;
    assert.strictEqual(assignmentCount, 1, 'expected embarked assignment to remain until manual debark');
  });
}

/**
 * Defines the `testAssignMarchForEmbarkedLandUnitDoesNotAutoDebark` function shape (function testAssignMarchForEmbarkedLandUnitDoesNotAutoDebark(): void).

 * Purpose: Human march assignment must not clear sealift slots implicitly while cargo remains embarked.
 * When to use: Regression guard after removing `clearEmbarkAssignmentForIndependentLandMove`.
 * Expected outcome: Assignment rejected; sealift slot still occupied.
 * Exceptions: None.
 */
function testAssignMarchForEmbarkedLandUnitDoesNotAutoDebark(): void {
  withTempDb(() => {
    const state = getGameState();
    const landUnit = state.units.find(
      (u) => u.player === 'human' && (u.unitType === 'infantry' || u.unitType === 'armor')
    );
    const navalUnit = state.units.find((u) => u.player === 'human' && u.unitType === 'naval');
    const waterWithAdjacentLand = findWaterHexWithAdjacentLand(state);
    assert.ok(landUnit, 'expected seeded human land unit');
    assert.ok(navalUnit, 'expected seeded human naval unit');
    assert.ok(waterWithAdjacentLand, 'expected a water hex with an adjacent land destination');

    dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [waterWithAdjacentLand!.waterHex, landUnit!.id]);
    dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [waterWithAdjacentLand!.waterHex, navalUnit!.id]);
    setHumanControlledPort(waterWithAdjacentLand!.waterHex);
    dbRun('INSERT OR REPLACE INTO unit_transport_assignments (land_unit_id, naval_unit_id) VALUES (?, ?)', [
      landUnit!.id,
      navalUnit!.id,
    ]);

    const assign = assignHumanMarchOrder(landUnit!.id, waterWithAdjacentLand!.adjacentLandHex);
    assert.strictEqual(assign.success, false, assign.reason ?? 'expected embarked march assignment to be rejected');
    const assignmentCount =
      dbGetOne<{ count: number }>('SELECT COUNT(*) AS count FROM unit_transport_assignments WHERE land_unit_id = ?', [landUnit!.id])
        ?.count ?? 0;
    assert.strictEqual(assignmentCount, 1, 'expected embarked assignment to remain');
    const sealiftState = getSealiftStackState(waterWithAdjacentLand!.waterHex);
    const navalRow = sealiftState.navalRows.find((row) => row.navalUnitId === navalUnit!.id);
    assert.ok(navalRow, 'expected naval row in sealift state');
    assert.strictEqual(navalRow?.slot1UnitId ?? navalRow?.slot2UnitId, landUnit!.id, 'expected sealift slot to remain occupied');
  });
}

/**
 * Defines the `testEmbarkedLandOnCoastalHexBlockedUntilManualDebark` function shape (function testEmbarkedLandOnCoastalHexBlockedUntilManualDebark(): void).

 * Purpose: Coastal embarked cargo also cannot march independently without manual debark first.
 * When to use: Regression guard for general embarked movement block (not water-only).
 * Expected outcome: March blocked while embarked; succeeds after manual debark via sealift slot.
 * Exceptions: None.
 */
function testEmbarkedLandOnCoastalHexBlockedUntilManualDebark(): void {
  withTempDb(() => {
    const state = getGameState();
    const landUnit = state.units.find(
      (u) => u.player === 'human' && (u.unitType === 'infantry' || u.unitType === 'armor')
    );
    const navalUnit = state.units.find((u) => u.player === 'human' && u.unitType === 'naval');
    assert.ok(landUnit, 'expected seeded human land unit');
    assert.ok(navalUnit, 'expected seeded human naval unit');
    const coastalSetup = findCoastalHexWithAdjacentLand(state);
    assert.ok(coastalSetup, 'expected coastal hex with adjacent land destination');
    const { coastalHex, adjacentLandHex } = coastalSetup;

    dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [coastalHex, landUnit!.id]);
    dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [coastalHex, navalUnit!.id]);
    dbRun('INSERT OR REPLACE INTO unit_transport_assignments (land_unit_id, naval_unit_id) VALUES (?, ?)', [
      landUnit!.id,
      navalUnit!.id,
    ]);

    const blocked = assignHumanMarchOrder(landUnit!.id, adjacentLandHex);
    assert.strictEqual(blocked.success, false, blocked.reason ?? 'expected embarked coastal march to be blocked');

    const sealiftBefore = getSealiftStackState(coastalHex);
    const row = sealiftBefore.navalRows.find((r) => r.navalUnitId === navalUnit!.id);
    assert.ok(row, 'expected naval row');
    const debarkSlot: 1 | 2 = row!.slot1UnitId === landUnit!.id ? 1 : 2;
    const debark = updateSealiftSlot(coastalHex, navalUnit!.id, debarkSlot, null);
    assert.strictEqual(debark.success, true, debark.reason ?? 'expected manual debark at coastal hex');

    const assign = assignHumanMarchOrder(landUnit!.id, adjacentLandHex);
    assert.strictEqual(assign.success, true, assign.reason ?? 'expected march after manual debark');
  });
}

/**
 * Defines the `testEmbarkImmediatelyCancelsExistingHumanMovementOrder` function shape (function testEmbarkImmediatelyCancelsExistingHumanMovementOrder(): void).

 * Purpose: Supports maintainability by documenting why `testEmbarkImmediatelyCancelsExistingHumanMovementOrder` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testEmbarkImmediatelyCancelsExistingHumanMovementOrder(): void {
  withTempDb(() => {
    const state = getGameState();
    const landUnit = state.units.find(
      (u) => u.player === 'human' && (u.unitType === 'infantry' || u.unitType === 'armor')
    );
    const navalUnit = state.units.find((u) => u.player === 'human' && u.unitType === 'naval');
    assert.ok(landUnit, 'expected seeded human land unit');
    assert.ok(navalUnit, 'expected seeded human naval unit');
    const seaportHex = findNearestLandSeaportHex(state, landUnit!.h3Index);
    assert.ok(seaportHex, 'expected at least one land seaport');
    const adjacentLandHex = findAdjacentNonArcticLandHex(state, seaportHex!);
    assert.ok(adjacentLandHex, 'expected adjacent non-arctic land destination from seaport hex');
    dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [seaportHex!, landUnit!.id]);
    dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [seaportHex!, navalUnit!.id]);
    setHumanControlledPort(seaportHex!);

    const assignResult = assignHumanMarchOrder(landUnit!.id, adjacentLandHex!);
    assert.strictEqual(assignResult.success, true, assignResult.reason ?? 'expected initial land movement order assignment');
    const beforeStandingOrderCount =
      dbGetOne<{ count: number }>(
        'SELECT COUNT(*) AS count FROM standing_orders WHERE player_id = ? AND unit_id = ? AND order_type = ?',
        ['human', landUnit!.id, 'march']
      )?.count ?? 0;
    assert.strictEqual(beforeStandingOrderCount, 1, 'expected precondition: unit has one march standing order');

    const embarkResult = updateSealiftSlot(seaportHex!, navalUnit!.id, 1, landUnit!.id);
    assert.strictEqual(embarkResult.success, true, embarkResult.reason ?? 'expected embark slot update success');
    const afterStandingOrderCount =
      dbGetOne<{ count: number }>(
        'SELECT COUNT(*) AS count FROM standing_orders WHERE player_id = ? AND unit_id = ? AND order_type = ?',
        ['human', landUnit!.id, 'march']
      )?.count ?? 0;
    assert.strictEqual(afterStandingOrderCount, 0, 'expected movement standing order to be cancelled on embark');
    const pendingCount =
      dbGetOne<{ count: number }>('SELECT COUNT(*) AS count FROM pending_orders WHERE unit_id = ?', [landUnit!.id])?.count ?? 0;
    assert.strictEqual(pendingCount, 0, 'expected pending movement orders to be cleared on embark');
  });
}

/**
 * Defines the `testReadyIncludesEmbarkedCargoFollowMoveForNavalMovement` function shape (function testReadyIncludesEmbarkedCargoFollowMoveForNavalMovement(): void).

 * Purpose: Supports maintainability by documenting why `testReadyIncludesEmbarkedCargoFollowMoveForNavalMovement` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testReadyIncludesEmbarkedCargoFollowMoveForNavalMovement(): void {
  withTempDb(() => {
    const state = getGameState();
    const navalUnit = state.units.find((u) => u.player === 'human' && u.unitType === 'naval');
    const landUnit = state.units.find(
      (u) => u.player === 'human' && (u.unitType === 'infantry' || u.unitType === 'armor')
    );
    assert.ok(navalUnit, 'expected seeded human naval unit');
    assert.ok(landUnit, 'expected seeded human land unit');
    const destination = findAdjacentNavalPassableHex(state, navalUnit!.h3Index);
    assert.ok(destination, 'expected adjacent naval-passable destination');
    dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [navalUnit!.h3Index, landUnit!.id]);
    dbRun('INSERT OR REPLACE INTO unit_transport_assignments (land_unit_id, naval_unit_id) VALUES (?, ?)', [
      landUnit!.id,
      navalUnit!.id,
    ]);
    const assignResult = assignHumanMarchOrders([navalUnit!.id], destination!);
    assert.strictEqual(assignResult.success, true, assignResult.reason ?? 'expected naval order assignment to succeed');
    const readyResult = ready();
    assert.strictEqual(readyResult.success, true, readyResult.reason ?? 'expected ready to succeed');
    const moves = readyResult.humanMoves ?? [];
    const navalMove = moves.find((m) => m.unitId === navalUnit!.id);
    const cargoMove = moves.find((m) => m.unitId === landUnit!.id);
    assert.ok(navalMove, 'expected naval move in playback moves');
    assert.ok(cargoMove, 'expected embarked cargo follow move in playback moves');
    assert.strictEqual(navalMove!.toH3Index, destination);
    assert.strictEqual(cargoMove!.toH3Index, destination);
  });
}

/**
 * Defines the `testSubmitOrdersAllowsLandMovementToSingleArcticHex` function shape (function testSubmitOrdersAllowsLandMovementToSingleArcticHex(): void).

 * Purpose: Supports maintainability by documenting why `testSubmitOrdersAllowsLandMovementToSingleArcticHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testSubmitOrdersAllowsLandMovementToSingleArcticHex(): void {
  withTempDb(() => {
    const state = getGameState();
    const landUnit = state.units.find((u) => u.player === 'human' && (u.unitType === 'infantry' || u.unitType === 'armor'));
    assert.ok(landUnit, 'expected seeded human land unit');
    const adjacent = findAdjacentHex(state, landUnit!.h3Index);
    assert.ok(adjacent, 'expected adjacent destination hex');
    dbRun('UPDATE hexes SET terrain = ?, terrain_kind = ? WHERE h3_index = ?', ['land', 'arctic', adjacent!]);
    const result = submitOrders({
      movementOrders: [{ unitId: landUnit!.id, toH3Index: adjacent! }],
    });
    assert.strictEqual(result.success, true, result.reason ?? 'expected single-transition movement into arctic to be allowed');
  });
}

/**
 * Defines the `testSubmitOrdersAllowsLandMovementFromSingleArcticHex` function shape (function testSubmitOrdersAllowsLandMovementFromSingleArcticHex(): void).

 * Purpose: Supports maintainability by documenting why `testSubmitOrdersAllowsLandMovementFromSingleArcticHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testSubmitOrdersAllowsLandMovementFromSingleArcticHex(): void {
  withTempDb(() => {
    const state = getGameState();
    const landUnit = state.units.find((u) => u.player === 'human' && (u.unitType === 'infantry' || u.unitType === 'armor'));
    assert.ok(landUnit, 'expected seeded human land unit');
    const adjacent = findAdjacentHex(state, landUnit!.h3Index);
    assert.ok(adjacent, 'expected adjacent destination hex');
    dbRun('UPDATE hexes SET terrain = ?, terrain_kind = ? WHERE h3_index = ?', ['land', 'arctic', landUnit!.h3Index]);
    dbRun('UPDATE hexes SET terrain = ?, terrain_kind = ? WHERE h3_index = ?', ['land', 'plains', adjacent!]);
    const result = submitOrders({
      movementOrders: [{ unitId: landUnit!.id, toH3Index: adjacent! }],
    });
    assert.strictEqual(result.success, true, result.reason ?? 'expected single-transition movement from arctic to be allowed');
  });
}

/**
 * Defines the `testSubmitOrdersDropsInvalidLandWaterToWaterPortMovement` function shape (function testSubmitOrdersDropsInvalidLandWaterToWaterPortMovement(): void).

 * Purpose: Asserts strategic `submitOrders` matches tactical resilience: invalid movement rows are dropped and the commit still succeeds.
 * When to use: Regression guard when changing `executeSubmitOrders` sanitization.
 * Expected outcome: `success: true` and no pending march row for the unit after the invalid destination is filtered out.
 * Exceptions: None.
 */
function testSubmitOrdersDropsInvalidLandWaterToWaterPortMovement(): void {
  withTempDb(() => {
    const state = getGameState();
    const landUnit = state.units.find((u) => u.player === 'human' && (u.unitType === 'infantry' || u.unitType === 'armor'));
    assert.ok(landUnit, 'expected seeded human land unit');
    const { destinationWaterHex } = positionLandUnitOnAdjacentWaterPorts(state, landUnit!.id);
    const result = submitOrders({
      movementOrders: [{ unitId: landUnit!.id, toH3Index: destinationWaterHex! }],
    });
    assert.strictEqual(result.success, true, result.reason ?? 'expected submit to succeed after dropping invalid march');
    const pendingCount =
      dbGetOne<{ count: number }>('SELECT COUNT(*) AS count FROM pending_orders WHERE unit_id = ?', [landUnit!.id])?.count ?? 0;
    assert.strictEqual(pendingCount, 0, 'expected invalid march row not persisted');
  });
}

/**
 * Defines the `testPreviewShowsInvalidForLandWaterToWaterPortMovement` function shape (function testPreviewShowsInvalidForLandWaterToWaterPortMovement(): void).

 * Purpose: Supports maintainability by documenting why `testPreviewShowsInvalidForLandWaterToWaterPortMovement` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testPreviewShowsInvalidForLandWaterToWaterPortMovement(): void {
  withTempDb(() => {
    const state = getGameState();
    const landUnit = state.units.find((u) => u.player === 'human' && (u.unitType === 'infantry' || u.unitType === 'armor'));
    assert.ok(landUnit, 'expected seeded human land unit');
    const { destinationWaterHex } = positionLandUnitOnAdjacentWaterPorts(state, landUnit!.id);
    const result = previewHumanMarchOrders([landUnit!.id], destinationWaterHex!);
    assert.strictEqual(result.validForAll, false);
    assert.strictEqual(result.showInvalidMarker, true);
    assert.strictEqual(result.invalidReason, LAND_UNIT_DESTINATION_NOT_LANDMASS_REASON);
  });
}

/**
 * Defines the `testSubmitOrdersDropsInvalidLandWaterToArcticPortMovement` function shape (function testSubmitOrdersDropsInvalidLandWaterToArcticPortMovement(): void).

 * Purpose: Same resilience contract as `testSubmitOrdersDropsInvalidLandWaterToWaterPortMovement` for land/water-to-arctic port transitions.
 * When to use: Regression guard for `executeSubmitOrders` movement sanitization.
 * Expected outcome: Submit succeeds; the disallowed march is not stored in `pending_orders`.
 * Exceptions: None.
 */
function testSubmitOrdersDropsInvalidLandWaterToArcticPortMovement(): void {
  withTempDb(() => {
    const state = getGameState();
    const landUnit = state.units.find((u) => u.player === 'human' && (u.unitType === 'infantry' || u.unitType === 'armor'));
    assert.ok(landUnit, 'expected seeded human land unit');
    const originWaterHex = state.hexes.find((hex) => hex.terrain === 'water');
    assert.ok(originWaterHex, 'expected a water origin hex');
    const destinationAdjacentHex = originWaterHex ? findAdjacentHex(state, originWaterHex.h3Index) : null;
    assert.ok(destinationAdjacentHex, 'expected an adjacent destination hex for arctic setup');
    dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [originWaterHex!.h3Index, landUnit!.id]);
    setArcticTerrain(destinationAdjacentHex!);
    setHumanControlledPort(originWaterHex!.h3Index);
    setHumanControlledPort(destinationAdjacentHex!);
    const result = submitOrders({
      movementOrders: [{ unitId: landUnit!.id, toH3Index: destinationAdjacentHex! }],
    });
    assert.strictEqual(result.success, true, result.reason ?? 'expected submit to succeed after dropping invalid march');
    const pendingCount =
      dbGetOne<{ count: number }>('SELECT COUNT(*) AS count FROM pending_orders WHERE unit_id = ?', [landUnit!.id])?.count ?? 0;
    assert.strictEqual(pendingCount, 0, 'expected invalid march row not persisted');
  });
}

/**
 * Defines the `run` function shape (function run(): void).

 * Purpose: Supports maintainability by documenting why `run` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function run(): void {
  testPreviewGroupedHappyPathSingleUnit();
  testPreviewGroupedFailsForUnknownUnit();
  testAssignGroupedRejectsEmptySelection();
  testAssignGroupedHappyPathSingleUnit();
  testValidateGroupedRangedInfantryRejectedAsMeleeOnly();
  testNavalOrdersCanEgressFromLandSeaportToAdjacentWaterOrCoastal();
  testPreviewGroupedMixedLandNavalRejectsNonCoastalDestination();
  testPreviewGroupedMixedLandNavalClearsSegmentsWhenAnyUnitBlocked();
  testPreviewGroupedMixedLandNavalAcceptsCoastalDestination();
  testAssignGroupedMixedLandNavalRejectsNonCoastalDestination();
  testAssignGroupedMixedLandNavalAcceptsCoastalDestination();
  testPreviewGroupedRejectsAirUnitsForMarchPlanning();
  testPreviewGroupedAcceptsAirFerryDestinationWithinRange();
  testAssignMarchRejectsAirUnits();
  testPreviewEmbarkedLandUnitOnWaterShowsInvalidWithoutPathPlanning();
  testEmbarkedLandUnitBlockedFromPreviewAndAssignAtSeaportWater();
  testAssignMarchForEmbarkedLandUnitDoesNotAutoDebark();
  testEmbarkedLandOnCoastalHexBlockedUntilManualDebark();
  testEmbarkImmediatelyCancelsExistingHumanMovementOrder();
  testReadyIncludesEmbarkedCargoFollowMoveForNavalMovement();
  testSubmitOrdersAllowsLandMovementToSingleArcticHex();
  testSubmitOrdersAllowsLandMovementFromSingleArcticHex();
  testSubmitOrdersDropsInvalidLandWaterToWaterPortMovement();
  testPreviewShowsInvalidForLandWaterToWaterPortMovement();
  testSubmitOrdersDropsInvalidLandWaterToArcticPortMovement();
  console.log('gameActionsMultiSelect.test.ts passed');
}

run();
