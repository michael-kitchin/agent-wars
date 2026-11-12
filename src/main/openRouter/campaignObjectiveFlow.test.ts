/**
 * Campaign inputs from a snapshot, including a hex that sits in two enemy homes.
 * Run with: node dist/main/openRouter/campaignObjectiveFlow.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GameStateSnapshot } from '../gameDb';
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
