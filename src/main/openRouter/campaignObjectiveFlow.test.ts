/**
 * Campaign inputs from a snapshot, including a hex that sits in two enemy homes.
 * Run with: node dist/main/openRouter/campaignObjectiveFlow.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GameStateSnapshot } from '../gameDb';
import { dbGetOne, dbRun } from '../gameDb';
import { writeOperationsForSeat } from '../gameDb/operationMemory';
import type { Operation } from '../../shared/operationTypes';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { campaignInputsFromState } from './campaignObjectiveFlow';

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
