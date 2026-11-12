/**
 * Best Options rows for a campaign unit close on the campaign hex.
 * Run with: node dist/main/openRouter/possibleUnitActionsCampaign.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gridDisk } from 'h3-js';
import { computeGridDistanceWithPathFallbackPure } from '../../shared/h3GridRangePure';
import { landUnitCanOccupyHex } from '../../shared/landTraversalStrategic';
import { AI_SEAT_IDS } from '../../shared/seatIds';
import { getGameStateForPlayer, type GameStateSnapshot } from '../gameDb';
import { buildLatLngCoordinateMap, LATLNG_DECIMAL_PLACES } from '../mapData';
import { ensureStrategicCoordinateRegistryInitialized } from '../briefing/map/hexCoordinates';
import { ensureTerrainClassificationCacheLoaded, getStrategicLandMassByH3 } from '../terrainClassificationCache';
import { getValidDestinations } from '../oneStepMoveDestinations';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { formatLatLng } from './promptText';
import { collectAggregatedPossibleActionRows } from './possibleUnitActions';
import type { CampaignPlan } from './campaignRules';

/**
 * A ground unit and a land hex its next step can close on.
 *
 * Purpose: The advance contract needs a real legal step, not a made-up grid.
 * When to use: Each test in this file, inside a temporary match.
 * Expected outcome: The unit, the waypoint, and the loaded snapshot. Throws when no ground unit has such a step.
 * Exceptions: Throws when the match has no usable step.
 */
function findClosingStep(state: GameStateSnapshot): { unitId: string; unitH3: string; waypoint: string } {
  ensureTerrainClassificationCacheLoaded();
  const land = getStrategicLandMassByH3();
  const seat = AI_SEAT_IDS[0];
  for (const unit of state.units) {
    if (unit.player !== seat || (unit.unitType !== 'infantry' && unit.unitType !== 'armor')) continue;
    if (unit.embarkedOnCarrierUnitId) continue;
    const legal = getValidDestinations(unit, state).filter((h3) => h3 !== unit.h3Index);
    for (const step of legal) {
      for (const candidate of gridDisk(step, 1)) {
        if (candidate === unit.h3Index || !landUnitCanOccupyHex(candidate, land)) continue;
        const fromUnit = computeGridDistanceWithPathFallbackPure(unit.h3Index, candidate);
        const fromStep = computeGridDistanceWithPathFallbackPure(step, candidate);
        if (fromUnit === null || fromStep === null || fromUnit < 2 || fromStep >= fromUnit) continue;
        return { unitId: unit.id, unitH3: unit.h3Index, waypoint: candidate };
      }
    }
  }
  throw new Error('no ground unit has a legal step that closes on a land hex');
}

/**
 * A campaign plan that names one unit.
 *
 * Purpose: The tests vary only whether that unit holds.
 * When to use: The four cases below.
 * Expected outcome: The unit is the only campaign unit, and the waypoint is the objective target.
 * Exceptions: None.
 */
function planFor(unitId: string, waypoint: string, hold: boolean, turnNumber: number): CampaignPlan {
  return {
    objective: { targetH3: waypoint, stagingH3: null, phase: 'assault', source: 'engine', chosenTurn: turnNumber },
    waypointH3: waypoint,
    campaignUnitIds: new Set([unitId]),
    holdUnitIds: new Set(hold ? [unitId] : []),
    defenderUnitIds: [],
    homeThreatCount: 0,
    homeDefenseCapped: false,
    massedCount: 0,
    threshold: 1,
  };
}

/**
 * Rows for one snapshot.
 *
 * Purpose: Every case calls the same collector the briefing uses.
 * When to use: The four cases below.
 * Expected outcome: Aggregated this-turn rows.
 * Exceptions: Throws when row collection throws.
 */
function rowsFor(state: GameStateSnapshot, campaignPlan?: CampaignPlan | null) {
  const { latLngByH3 } = buildLatLngCoordinateMap(state.hexes.map((hex) => hex.h3Index));
  return collectAggregatedPossibleActionRows({
    state,
    latLngByH3,
    formatLatLng: (ll) => formatLatLng(ll, LATLNG_DECIMAL_PLACES),
    forThisTurnOptionsTable: true,
    campaignPlan,
  });
}

test('a campaign unit gets advance rows that close on the campaign hex', () => {
  ensureStrategicCoordinateRegistryInitialized();
  withTempGameDb('aw-campaign-advance-', () => {
    const seat = AI_SEAT_IDS[0];
    const state = getGameStateForPlayer(seat, { maskUnexploredTerrain: false });
    const found = findClosingStep(state);
    const rows = rowsFor(state, planFor(found.unitId, found.waypoint, false, state.turnNumber)).filter(
      (row) => row.unitId === found.unitId && row.actionTypes.includes('advance')
    );
    assert.ok(rows.length > 0);
    const fromUnit = computeGridDistanceWithPathFallbackPure(found.unitH3, found.waypoint);
    for (const row of rows) {
      const fromTarget = computeGridDistanceWithPathFallbackPure(row.targetH3, found.waypoint);
      assert.ok(fromUnit !== null && fromTarget !== null && fromTarget < fromUnit);
    }
  });
});

test('a visible enemy six hops away does not redirect a campaign unit', () => {
  ensureStrategicCoordinateRegistryInitialized();
  withTempGameDb('aw-campaign-distant-', () => {
    const seat = AI_SEAT_IDS[0];
    const state = getGameStateForPlayer(seat, { maskUnexploredTerrain: false });
    const found = findClosingStep(state);
    const unit = state.units.find((row) => row.id === found.unitId);
    assert.ok(unit);
    const legal = new Set(getValidDestinations(unit, state));
    const distant = gridDisk(found.unitH3, 6).find(
      (h3) => computeGridDistanceWithPathFallbackPure(found.unitH3, h3) === 6 && !legal.has(h3)
    );
    assert.ok(distant);
    const withEnemy = {
      ...state,
      units: [...state.units, { id: 'human-inf-far', player: 'human', unitType: 'infantry', h3Index: distant }],
    } as GameStateSnapshot;
    const rows = rowsFor(withEnemy, planFor(found.unitId, found.waypoint, false, state.turnNumber)).filter(
      (row) => row.unitId === found.unitId
    );
    assert.ok(rows.some((row) => row.actionTypes.includes('advance')));
    assert.equal(rows.some((row) => row.targetH3 === distant), false);
  });
});

test('a holding campaign unit gets no move row', () => {
  ensureStrategicCoordinateRegistryInitialized();
  withTempGameDb('aw-campaign-hold-', () => {
    const seat = AI_SEAT_IDS[0];
    const state = getGameStateForPlayer(seat, { maskUnexploredTerrain: false });
    const found = findClosingStep(state);
    const rows = rowsFor(state, planFor(found.unitId, found.waypoint, true, state.turnNumber)).filter(
      (row) => row.unitId === found.unitId
    );
    assert.equal(rows.some((row) => row.actionTypes.includes('advance') || row.actionTypes.includes('approach')), false);
  });
});

test('without a plan no row is labeled advance', () => {
  ensureStrategicCoordinateRegistryInitialized();
  withTempGameDb('aw-campaign-none-', () => {
    const seat = AI_SEAT_IDS[0];
    const state = getGameStateForPlayer(seat, { maskUnexploredTerrain: false });
    const rows = rowsFor(state);
    assert.equal(rows.some((row) => row.actionTypes.includes('advance')), false);
  });
});
