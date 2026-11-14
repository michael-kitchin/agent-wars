/**
 * Commander campaign-target override.
 * Run with: node dist/main/openRouter/campaignTargetOverride.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { landUnitCanOccupyHex, type LandMassByH3 } from '../../shared/landTraversalStrategic';
import { AI_SEAT_IDS } from '../../shared/seatIds';
import { codeToH3, h3ToCode } from '../briefing/map/hexCodeTranslator';
import { ensureStrategicCoordinateRegistryInitialized, listStrategicH3Indexes } from '../briefing/map/hexCoordinates';
import { dbGetOne, dbRun, getGameStateForPlayer, type GameStateSnapshot } from '../gameDb';
import { readCampaignObjectives, writeCampaignObjectiveForSeat } from '../gameDb/campaignObjectiveMemory';
import { ensureTerrainClassificationCacheLoaded } from '../terrainClassificationCache';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { applyCampaignTargetH3, applyCampaignTargetOverride } from './campaignTargetOverride';
import { campaignInputsFromState, campaignLandSteps, loadCampaignLandMass } from './campaignObjectiveFlow';
import { CAMPAIGN_REACH_LIMIT_STEPS } from './campaignRules';
import type { CampaignCity } from './campaignTargetSelection';

const STRATEGIC = { mode: 'strategic' } as const;

/**
 * Database ops the campaign row uses.
 *
 * Purpose: The override and the assertions share one connection.
 * When to use: Inside a temporary match.
 * Expected outcome: The same get and run the game database exports.
 * Exceptions: None.
 */
function ops() {
  return { getOne: dbGetOne, run: dbRun };
}

/**
 * A two-character code `codeToH3` rejects.
 *
 * Purpose: The drop path needs a code that is not on this map.
 * When to use: The unknown-code case.
 * Expected outcome: One code. Throws when every two-character code resolves.
 * Exceptions: Throws when the registry accepts every candidate.
 */
function unknownCode(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  for (const left of alphabet) {
    for (const right of alphabet) {
      const code = `${left}${right}`;
      try {
        codeToH3(code, STRATEGIC);
      } catch {
        return code;
      }
    }
  }
  throw new Error('every two-character code is on this map');
}

/**
 * A snapshot whose ground force can reach one enemy city by land.
 *
 * Purpose: A seeded home can sit farther than the reach limit from the starting force.
 * When to use: The override case, inside a temporary match.
 * Expected outcome: The city and a snapshot that places one ground unit on a land hex within the reach limit.
 * Exceptions: Throws when the seat has no ground unit or the city has no land approach.
 */
function stateThatReachesACity(
  state: GameStateSnapshot,
  landMass: LandMassByH3,
  seat: string
): { readonly state: GameStateSnapshot; readonly city: CampaignCity } {
  const registered = new Set(listStrategicH3Indexes());
  const inputs = campaignInputsFromState(state, landMass);
  const cities = inputs.cities.filter((city) => registered.has(city.h3Index));
  assert.ok(cities.length > 0, 'no known enemy city has a briefing code');
  const fromForce = campaignLandSteps(inputs, landMass, inputs.groundUnits.map((unit) => unit.h3Index));
  const already = cities.find((city) => fromForce.has(city.h3Index));
  if (already) return { state, city: already };
  const candidate = cities[0]!;
  const fromCity = campaignLandSteps(inputs, landMass, [candidate.h3Index]);
  let approach: string | undefined;
  for (const [h3Index, steps] of fromCity) {
    if (steps > 0 && steps <= CAMPAIGN_REACH_LIMIT_STEPS && landUnitCanOccupyHex(h3Index, landMass)) {
      approach = h3Index;
      break;
    }
  }
  assert.ok(approach, 'enemy city has no land approach within the reach limit');
  const unit = state.units.find(
    (row) => row.player === seat && (row.unitType === 'infantry' || row.unitType === 'armor') && !row.embarkedOnCarrierUnitId
  );
  assert.ok(unit, 'the seat has no ground unit');
  const moved = {
    ...state,
    units: state.units.map((row) => (row.id === unit.id ? { ...row, h3Index: approach } : row)),
  };
  const movedInputs = campaignInputsFromState(moved, landMass);
  const movedSteps = campaignLandSteps(movedInputs, landMass, movedInputs.groundUnits.map((row) => row.h3Index));
  const city = movedInputs.cities.find((row) => row.h3Index === candidate.h3Index);
  assert.ok(city && movedSteps.has(city.h3Index), 'moving one unit onto the approach did not make the city reachable');
  return { state: moved, city };
}

test('a reachable enemy city is stored, an echo keeps the phase, and bad codes are dropped', () => {
  ensureTerrainClassificationCacheLoaded();
  withTempGameDb('aw-campaign-target-', () => {
    ensureStrategicCoordinateRegistryInitialized();
    const seat = AI_SEAT_IDS[0];
    const state = getGameStateForPlayer(seat, { maskUnexploredTerrain: false });
    const landMass = loadCampaignLandMass(seat);
    assert.ok(landMass);
    const reached = stateThatReachesACity(state, landMass, seat);
    const code = h3ToCode(reached.city.h3Index, STRATEGIC);
    const applied = applyCampaignTargetOverride({ state: reached.state, code, context: STRATEGIC });
    assert.deepEqual(applied.dropReasons, []);
    assert.equal(applied.applied, true);
    const stored = readCampaignObjectives(ops()).get(seat);
    assert.ok(stored);
    assert.equal(stored.targetH3, reached.city.h3Index);
    assert.equal(stored.source, 'commander');
    assert.equal(stored.phase, stored.stagingH3 === null ? 'assault' : 'assemble');
    assert.equal(stored.chosenTurn, state.turnNumber);

    writeCampaignObjectiveForSeat(ops(), seat, { ...stored, phase: 'assault' });
    const echo = applyCampaignTargetOverride({ state: reached.state, code, context: STRATEGIC });
    assert.deepEqual(echo.dropReasons, []);
    assert.equal(readCampaignObjectives(ops()).get(seat)?.phase, 'assault');

    const registered = new Set(listStrategicH3Indexes());
    const ownCity = (state.strategicInfrastructure ?? []).find(
      (row) =>
        row.urbanHexCount > 0 &&
        registered.has(row.h3Index) &&
        state.strategicControl?.find((control) => control.h3Index === row.h3Index)?.controllerPlayerId === seat
    );
    assert.ok(ownCity, 'the seat controls no city');
    const ownCode = h3ToCode(ownCity.h3Index, STRATEGIC);
    const ownDrop = applyCampaignTargetOverride({ state, code: ownCode, context: STRATEGIC });
    assert.deepEqual(ownDrop.dropReasons, [`campaignTarget dropped: ${ownCode} is not a known enemy city.`]);

    const missing = unknownCode();
    const missingDrop = applyCampaignTargetOverride({ state, code: missing, context: STRATEGIC });
    assert.deepEqual(missingDrop.dropReasons, [`campaignTarget dropped: ${missing} is not a hex code on this map.`]);
  });
});

test('a known reachable city hex is stored as a commander target', () => {
  ensureTerrainClassificationCacheLoaded();
  withTempGameDb('aw-campaign-target-h3-', () => {
    ensureStrategicCoordinateRegistryInitialized();
    const seat = AI_SEAT_IDS[0];
    const state = getGameStateForPlayer(seat, { maskUnexploredTerrain: false });
    const landMass = loadCampaignLandMass(seat);
    assert.ok(landMass);
    const reached = stateThatReachesACity(state, landMass, seat);
    const applied = applyCampaignTargetH3({
      state: reached.state,
      targetH3: reached.city.h3Index,
      label: h3ToCode(reached.city.h3Index, STRATEGIC),
    });
    assert.deepEqual(applied.dropReasons, []);
    assert.equal(applied.applied, true);
    const stored = readCampaignObjectives(ops()).get(seat);
    assert.equal(stored?.targetH3, reached.city.h3Index);
    assert.equal(stored?.source, 'commander');
  });
});
