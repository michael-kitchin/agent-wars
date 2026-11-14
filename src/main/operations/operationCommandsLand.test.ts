/**
 * Land launches and the campaign cancel.
 *
 * Purpose: A land choice sets the campaign target and does not store an operation.
 * When to use: After changes to the land branch of `applyOperationCommands`.
 * Expected outcome: Process exit 0. The match is temporary.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cellToLatLng, latLngToCell } from 'h3-js';
import { h3ToCode } from '../briefing/map/hexCodeTranslator';
import { ensureStrategicCoordinateRegistryInitialized } from '../briefing/map/hexCoordinates';
import { landUnitCanOccupyHex, type LandMassByH3 } from '../../shared/landTraversalStrategic';
import type { KnockoutCoordinates } from '../gameActions/knockoutConsequences';
import { dbGetOne, dbRun, getGameState, getGameStateForPlayer, listUnitsForSnapshot, type GameStateSnapshot } from '../gameDb';
import { readCampaignObjectives } from '../gameDb/campaignObjectiveMemory';
import { readOperationEventTurn, readOperations } from '../gameDb/operationMemory';
import { campaignInputsFromState, campaignLandSteps, loadCampaignLandMass } from '../openRouter/campaignObjectiveFlow';
import { CAMPAIGN_REACH_LIMIT_STEPS } from '../openRouter/campaignRules';
import type { CampaignCity } from '../openRouter/campaignTargetSelection';
import type { LatLng } from '../tools/h3LatLng';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { applyOperationCommands } from './operationCommands';

const SEAT = 'opponent' as const;

/**
 * Coordinate helpers for the seeded hexes.
 *
 * Purpose: Applying a command requires the same centers the turn uses.
 * When to use: Before `applyOperationCommands`.
 * Expected outcome: A center for every hex.
 * Exceptions: None. An unresolvable center returns undefined.
 */
function coordinates(): KnockoutCoordinates {
  const state = getGameState();
  return {
    latLngByH3: new Map<string, LatLng>(state.hexes.map((hex) => [hex.h3Index, cellToLatLng(hex.h3Index)])),
    resolveToH3: (lat, lng) => {
      try {
        return latLngToCell(lat, lng, 1);
      } catch {
        return undefined;
      }
    },
  };
}

/**
 * The seat's snapshot with the full unit list.
 *
 * Purpose: The land launch reads the same force the campaign does.
 * When to use: Immediately before applying a command.
 * Expected outcome: The seat's view, unmasked, with every unit.
 * Exceptions: None.
 */
function seatState(): GameStateSnapshot {
  const viewed = getGameStateForPlayer(SEAT, { maskUnexploredTerrain: false });
  return { ...viewed, units: listUnitsForSnapshot() };
}

/**
 * One enemy city a ground unit can reach, moving a unit onto an approach when the start is too far.
 *
 * Purpose: The letter launch needs a city `applyCampaignTargetH3` will store.
 * When to use: Inside a temporary match, after the land mass is loaded.
 * Expected outcome: The snapshot and that city.
 * Exceptions: Throws when the seat has no enemy city or no land approach.
 */
function reachableCity(landMass: LandMassByH3): { readonly state: GameStateSnapshot; readonly city: CampaignCity } {
  let state = seatState();
  let inputs = campaignInputsFromState(state, landMass);
  const steps = campaignLandSteps(inputs, landMass, inputs.groundUnits.map((unit) => unit.h3Index));
  const already = inputs.cities.find((row) => {
    const distance = steps.get(row.h3Index);
    return distance !== undefined && distance <= CAMPAIGN_REACH_LIMIT_STEPS;
  });
  if (already) return { state, city: already };
  const target = inputs.cities[0];
  assert.ok(target, 'expected an enemy city');
  const fromCity = campaignLandSteps(inputs, landMass, [target.h3Index]);
  const approach = [...fromCity.keys()].find(
    (hex) => (fromCity.get(hex) ?? 0) > 0 && (fromCity.get(hex) ?? 0) <= CAMPAIGN_REACH_LIMIT_STEPS && landUnitCanOccupyHex(hex, landMass),
  );
  assert.ok(approach, 'expected a land approach');
  const unit = state.units.find((row) => row.player === SEAT && (row.unitType === 'infantry' || row.unitType === 'armor'));
  assert.ok(unit, 'the seat has no ground unit');
  dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [approach, unit.id]);
  state = seatState();
  inputs = campaignInputsFromState(state, landMass);
  const city = inputs.cities.find((row) => row.h3Index === target.h3Index);
  assert.ok(city, 'the city is no longer a campaign city');
  return { state, city };
}

test('launching a land row stores the campaign target and writes no operation', () => {
  withTempGameDb('aw-operation-command-land-', () => {
    ensureStrategicCoordinateRegistryInitialized();
    const landMass = loadCampaignLandMass(SEAT);
    assert.ok(landMass);
    const reached = reachableCity(landMass);
    const result = applyOperationCommands({
      state: reached.state,
      seatId: SEAT,
      commands: [{ action: 'launch', option: 'A' }],
      coordinates: coordinates(),
      candidates: [{
        method: 'land',
        objectiveH3: reached.city.h3Index,
        musterH3: reached.city.h3Index,
        landingH3: reached.city.h3Index,
        unitIds: ['inf-a'],
        carrierIds: [],
        etaTurns: 1,
        urbanHexCount: reached.city.urbanHexCount,
        inEnemyHome: reached.city.inEnemyHome,
        knownFortifiedCount: reached.city.knownFortifiedCount,
        defenders: 0,
        reinforcers: 0,
        clear: true,
      }],
    });
    assert.deepEqual(result.dropReasons, []);
    assert.equal(result.appliedCount, 0);
    assert.equal(readOperations({ getOne: dbGetOne }).get(SEAT), undefined);
    assert.equal(readOperationEventTurn({ getOne: dbGetOne }, SEAT), null);
    assert.equal(readCampaignObjectives({ getOne: dbGetOne }).get(SEAT)?.targetH3, reached.city.h3Index);
  });
});

test('a named land launch against an unreachable city keeps the campaign reason', () => {
  withTempGameDb('aw-operation-command-land-', () => {
    ensureStrategicCoordinateRegistryInitialized();
    const landMass = loadCampaignLandMass(SEAT);
    assert.ok(landMass);
    const state = seatState();
    const city = campaignInputsFromState(state, landMass).cities[0];
    assert.ok(city, 'expected an enemy city');
    dbRun('DELETE FROM units WHERE unit_type IN (?, ?)', ['infantry', 'armor']);
    const code = h3ToCode(city.h3Index, { mode: 'strategic' });
    const result = applyOperationCommands({
      state: seatState(),
      seatId: SEAT,
      commands: [{ action: 'launch', objective: code, method: 'land' }],
      coordinates: coordinates(),
      candidates: [],
    });
    assert.deepEqual(result.dropReasons, [`operations launch dropped: no ground unit of yours can reach ${code} by land.`]);
    assert.equal(result.appliedCount, 0);
  });
});

test('cancelling the land campaign is refused', () => {
  withTempGameDb('aw-operation-command-land-', () => {
    const result = applyOperationCommands({
      state: seatState(),
      seatId: SEAT,
      commands: [{ action: 'cancel', id: 'campaign' }],
      coordinates: coordinates(),
      candidates: [],
    });
    assert.deepEqual(result.dropReasons, [
      'operations cancel dropped: the land campaign cannot be cancelled; launch a land option to give it a new target.',
    ]);
    assert.equal(result.appliedCount, 0);
  });
});
