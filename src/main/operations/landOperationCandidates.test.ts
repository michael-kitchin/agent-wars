/**
 * Land rows the campaign could turn to.
 *
 * Purpose: The menu lists other cities inside the campaign's scoring pool and leaves the current target out.
 * When to use: After changes to `listLandOperationCandidates`.
 * Expected outcome: Process exit 0. The match is temporary.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { landUnitCanOccupyHex, type LandMassByH3 } from '../../shared/landTraversalStrategic';
import { AI_SEAT_IDS, type SeatId } from '../../shared/seatIds';
import type { GameStateSnapshot } from '../gameDb';
import { dbGetOne, dbRun, getGameStateForPlayer } from '../gameDb';
import { writeCampaignObjectiveForSeat } from '../gameDb/campaignObjectiveMemory';
import { ensureTerrainClassificationCacheLoaded } from '../terrainClassificationCache';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { campaignInputsFromState, campaignLandSteps, loadCampaignLandMass } from '../openRouter/campaignObjectiveFlow';
import { CAMPAIGN_REACH_LIMIT_STEPS } from '../openRouter/campaignRules';
import { CAMPAIGN_MAX_LAND_STEPS, type CampaignCity } from '../openRouter/campaignTargetSelection';
import type { LiftTerrain } from './liftTerrain';
import { listLandOperationCandidates } from './landOperationCandidates';

/**
 * Terrain that reports no enemy unit near a city.
 *
 * Purpose: The candidate still needs a defender count, and this case is about reach.
 * When to use: Every land-row case.
 * Expected outcome: A terrain whose clear radius is empty.
 * Exceptions: None.
 */
const emptyTerrain = { enemyUnitsWithin: () => 0 } as unknown as LiftTerrain;

test('a match with no scenario gives no land row', () => {
  const candidates = listLandOperationCandidates({
    state: {} as GameStateSnapshot,
    seatId: AI_SEAT_IDS[0],
    landMass: new Map(),
    terrain: emptyTerrain,
  });
  assert.deepEqual(candidates, []);
});

/**
 * A force placed where several enemy cities are a short march away.
 *
 * Purpose: The menu case needs three cities inside the scoring pool and one farther city the named launch could still reach.
 * When to use: Inside a temporary match, after the terrain cache is loaded.
 * Expected outcome: The moved snapshot, the near cities, and one city between the menu cap and the reach limit.
 * Exceptions: Throws when no city has both a nearby group and a farther city.
 */
function forceNearThreeCities(state: GameStateSnapshot, landMass: LandMassByH3, seat: SeatId): {
  readonly state: GameStateSnapshot;
  readonly near: readonly CampaignCity[];
  readonly far: CampaignCity;
} {
  const inputs = campaignInputsFromState(state, landMass);
  assert.ok(inputs.cities.length >= 4, 'expected at least four enemy cities');
  const fromCities = inputs.cities.map((city) => ({
    city,
    steps: campaignLandSteps(inputs, landMass, [city.h3Index]),
  }));
  const hexes = new Set<string>();
  for (const row of fromCities) {
    for (const hex of row.steps.keys()) hexes.add(hex);
  }
  let anchor: string | undefined;
  let bestNear = 0;
  let widest = 0;
  for (const hex of hexes) {
    if (!landUnitCanOccupyHex(hex, landMass)) continue;
    let near = 0;
    let far = false;
    let maxDistance = 0;
    for (const row of fromCities) {
      const distance = row.steps.get(hex);
      if (distance === undefined || distance > CAMPAIGN_REACH_LIMIT_STEPS) continue;
      if (distance > maxDistance) maxDistance = distance;
      if (distance <= CAMPAIGN_MAX_LAND_STEPS) near += 1;
      else far = true;
    }
    if (near >= 3 && maxDistance > widest) widest = maxDistance;
    if (near > bestNear) bestNear = near;
    if (near >= 3 && far) {
      anchor = hex;
      break;
    }
  }
  assert.ok(anchor, `expected a hex within 12 of three cities and 13 to 30 of another; cities=${inputs.cities.length} bestNear=${bestNear} widest=${widest}`);
  const unit = state.units.find(
    (row) => row.player === seat && (row.unitType === 'infantry' || row.unitType === 'armor') && !row.embarkedOnCarrierUnitId,
  );
  assert.ok(unit, 'the seat has no ground unit');
  dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [anchor, unit.id]);
  const moved = getGameStateForPlayer(seat, { maskUnexploredTerrain: false });
  const movedInputs = campaignInputsFromState(moved, landMass);
  const steps = campaignLandSteps(movedInputs, landMass, movedInputs.groundUnits.map((row) => row.h3Index));
  const near = movedInputs.cities.filter((row) => {
    const distance = steps.get(row.h3Index);
    return distance !== undefined && distance <= CAMPAIGN_MAX_LAND_STEPS;
  });
  const far = movedInputs.cities.find((row) => {
    const distance = steps.get(row.h3Index);
    return distance !== undefined && distance > CAMPAIGN_MAX_LAND_STEPS && distance <= CAMPAIGN_REACH_LIMIT_STEPS;
  });
  assert.ok(near.length >= 3, 'moving onto the city did not leave three cities inside the menu');
  assert.ok(far, 'moving onto the city left no city between the menu cap and the reach limit');
  return { state: moved, near, far };
}

test('the menu lists two other cities inside the scoring pool and can still name the current target', () => {
  ensureTerrainClassificationCacheLoaded();
  withTempGameDb('aw-land-candidates-', () => {
    const seat = AI_SEAT_IDS[0];
    const state = getGameStateForPlayer(seat, { maskUnexploredTerrain: false });
    const landMass = loadCampaignLandMass(seat);
    assert.ok(landMass);
    const placed = forceNearThreeCities(state, landMass, seat);
    const current = placed.near[0]!;
    writeCampaignObjectiveForSeat({ getOne: dbGetOne, run: dbRun }, seat, {
      targetH3: current.h3Index,
      stagingH3: null,
      phase: 'assault',
      source: 'engine',
      chosenTurn: placed.state.turnNumber,
    });
    const listed = listLandOperationCandidates({
      state: placed.state,
      seatId: seat,
      landMass,
      terrain: emptyTerrain,
    });
    assert.equal(listed.length, 2);
    assert.ok(listed.every((row) => row.method === 'land'));
    assert.ok(listed.every((row) => row.objectiveH3 !== current.h3Index));
    assert.ok(listed.every((row) => row.etaTurns <= CAMPAIGN_MAX_LAND_STEPS));
    assert.ok(listed.every((row) => placed.near.some((city) => city.h3Index === row.objectiveH3)));
    assert.equal(listed.some((row) => row.objectiveH3 === placed.far.h3Index), false);
    const named = listLandOperationCandidates({
      state: placed.state,
      seatId: seat,
      landMass,
      terrain: emptyTerrain,
      onlyObjectiveH3: current.h3Index,
    });
    assert.deepEqual(named.map((row) => row.objectiveH3), [current.h3Index]);
    const beyond = listLandOperationCandidates({
      state: placed.state,
      seatId: seat,
      landMass,
      terrain: emptyTerrain,
      onlyObjectiveH3: placed.far.h3Index,
    });
    assert.deepEqual(beyond, []);
  });
});
