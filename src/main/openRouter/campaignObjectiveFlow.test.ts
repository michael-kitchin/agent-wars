/**
 * Campaign inputs from a snapshot, including a hex that sits in two enemy homes.
 * Run with: node dist/main/openRouter/campaignObjectiveFlow.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isWithinGridRangePure } from '../../shared/h3GridRangePure';
import { landUnitCanOccupyHex, type LandMassByH3 } from '../../shared/landTraversalStrategic';
import { AI_SEAT_IDS, type SeatId } from '../../shared/seatIds';
import type { GameStateSnapshot } from '../gameDb';
import { dbGetOne, dbRun, getGameStateForPlayer } from '../gameDb';
import { writeCampaignObjectiveForSeat, readCampaignObjectives } from '../gameDb/campaignObjectiveMemory';
import { writeOperationsForSeat } from '../gameDb/operationMemory';
import { writePosture } from '../gameDb/postureMemory';
import type { Operation } from '../../shared/operationTypes';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { CAMPAIGN_MASS_RADIUS, CAMPAIGN_REACH_LIMIT_STEPS } from './campaignRules';
import {
  campaignInputsFromState,
  campaignLandSteps,
  loadCampaignLandMass,
  resolveCampaignObjectiveForSeat,
} from './campaignObjectiveFlow';

test('a hex in two enemy homes has no assumed owner', () => {
  const state = {
    hexes: [{ h3Index: 'h1', terrain: 'land', terrainKind: 'plains' }],
    units: [],
    phase: 'planning',
    turnNumber: 1,
    pendingOrders: [],
    playerPerspective: 'opponent',
    exploredHexes: [],
    seats: [
      { seatId: 'opponent', seatOrder: 1, homeRegion: 'Home', nickname: null, kind: 'ai', outTurn: null },
      { seatId: 'opponent2', seatOrder: 2, homeRegion: 'East', nickname: null, kind: 'ai', outTurn: null },
      { seatId: 'opponent3', seatOrder: 3, homeRegion: 'West', nickname: null, kind: 'ai', outTurn: null },
    ],
    homeRegionHexesBySeat: { opponent2: ['h1'], opponent3: ['h1'] },
    strategicInfrastructure: [{ h3Index: 'h1', urbanHexCount: 10, airportCount: 0, seaportCount: 0 }],
    strategicControl: [],
  } as unknown as GameStateSnapshot;
  const inputs = campaignInputsFromState(state, new Map());
  assert.equal(inputs.cities.some((city) => city.h3Index === 'h1'), false);
});

test('a ground unit assigned to an operation is left out of campaign inputs', () => {
  withTempGameDb('aw-operation-campaign-', () => {
    const operation: Operation = {
      id: 'opponent-op1',
      method: 'sea',
      objectiveH3: 'city',
      musterH3: 'port',
      landingH3: null,
      unitIds: ['inf-1'],
      carrierIds: ['ship-1'],
      phase: 'muster',
      source: 'engine',
      launchedTurn: 1,
      phaseTurn: 1,
    };
    writeOperationsForSeat({ getOne: dbGetOne, run: dbRun }, 'opponent', [operation]);
    const state = {
      hexes: [{ h3Index: 'h1', terrain: 'land', terrainKind: 'plains' }],
      units: [
        { id: 'inf-1', player: 'opponent', unitType: 'infantry', h3Index: 'h1' },
        { id: 'inf-2', player: 'opponent', unitType: 'infantry', h3Index: 'h1' },
      ],
      phase: 'planning',
      turnNumber: 1,
      pendingOrders: [],
      playerPerspective: 'opponent',
      exploredHexes: [],
      seats: [{ seatId: 'opponent', seatOrder: 1, homeRegion: 'Home', nickname: null, kind: 'ai', outTurn: null }],
      strategicInfrastructure: [],
      strategicControl: [],
    } as unknown as GameStateSnapshot;
    const inputs = campaignInputsFromState(state, new Map());
    assert.deepEqual(inputs.groundUnits.map((unit) => unit.id), ['inf-2']);
  });
});

/**
 * A staging hex the seat holds and an enemy city the force can still reach.
 *
 * Purpose: The assault test needs three units on the staging hex and five outside the mass radius.
 * When to use: Inside a temporary match.
 * Expected outcome: The staging hex, the target city, and a hex outside the mass radius.
 * Exceptions: Throws when the map has no such pair.
 */
function massFixture(landMass: LandMassByH3, seat: SeatId): { readonly staging: string; readonly target: string; readonly far: string } {
  const state = getGameStateForPlayer(seat, { maskUnexploredTerrain: false });
  const viewed = { ...state, playerPerspective: seat };
  const inputs = campaignInputsFromState(viewed, landMass);
  const fromCities = inputs.cities.map((city) => ({
    city,
    steps: campaignLandSteps(inputs, landMass, [city.h3Index]),
  }));
  let staging: string | undefined;
  let target: string | undefined;
  for (const hex of inputs.hexSet) {
    if (!landUnitCanOccupyHex(hex, landMass)) continue;
    const city = fromCities.find((row) => {
      const distance = row.steps.get(hex);
      return distance !== undefined && distance <= CAMPAIGN_REACH_LIMIT_STEPS;
    });
    if (city) {
      staging = hex;
      target = city.city.h3Index;
      break;
    }
  }
  assert.ok(staging && target, 'expected a staging hex within reach of an enemy city');
  const far = [...inputs.hexSet].find((hex) => hex !== staging && !isWithinGridRangePure(staging, hex, CAMPAIGN_MASS_RADIUS));
  assert.ok(far, 'expected a hex outside the mass radius');
  return { staging, target, far };
}

test('blitz assaults when three of eight units are massed and the default stays assembling', () => {
  withTempGameDb('aw-posture-campaign-', () => {
    const seat = AI_SEAT_IDS[0];
    const landMass = loadCampaignLandMass(seat);
    assert.ok(landMass);
    const { staging, target, far } = massFixture(landMass, seat);
    const ops = { getOne: dbGetOne, run: dbRun };
    dbRun('DELETE FROM units WHERE player = ?', [seat]);
    dbRun('INSERT OR REPLACE INTO res_s_control (h3_index, controller_player_id) VALUES (?, ?)', [staging, seat]);
    for (let index = 0; index < 3; index += 1) {
      dbRun('INSERT INTO units (id, player, unit_type, h3_index) VALUES (?, ?, ?, ?)', [`near-${index}`, seat, 'infantry', staging]);
    }
    for (let index = 0; index < 5; index += 1) {
      dbRun('INSERT INTO units (id, player, unit_type, h3_index) VALUES (?, ?, ?, ?)', [`far-${index}`, seat, 'infantry', far]);
    }
    const objective = {
      targetH3: target,
      stagingH3: staging,
      phase: 'assemble' as const,
      source: 'engine' as const,
      chosenTurn: 1,
    };
    writeCampaignObjectiveForSeat(ops, seat, objective);
    writePosture(ops, seat, { posture: 'blitz', sinceTurn: 1 });
    const blitzState = {
      ...getGameStateForPlayer(seat, { maskUnexploredTerrain: false }),
      playerPerspective: seat,
    };
    const assaulted = resolveCampaignObjectiveForSeat(blitzState);
    assert.equal(assaulted?.phase, 'assault');
    writePosture(ops, seat, null);
    writeCampaignObjectiveForSeat(ops, seat, objective);
    const assembled = resolveCampaignObjectiveForSeat(blitzState);
    assert.equal(assembled?.phase, 'assemble');
    assert.equal(readCampaignObjectives(ops).get(seat)?.phase, 'assemble');
  });
});
