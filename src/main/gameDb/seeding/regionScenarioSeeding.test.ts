import assert from 'node:assert/strict';
import { test } from 'node:test';
import { claimInitialPlacementHex, type InitialPlacementSide } from '../../../shared/initialPlacementSides';
import { assignRegionOpeningHexes } from './regionScenarioSeeding';
import type { SpawnCandidate } from './spawnSelection';

/**
 * Builds one land spawn candidate for opening-placement tests.
 *
 * Purpose: Keeps the hex id and latitude visible in each case without repeating the unused fields.
 * When to use: As an argument to `assignRegionOpeningHexes` in this file.
 * Expected outcome: A land candidate at longitude 0.
 * Exceptions: None.
 */
function candidate(h3: string, lat: number): SpawnCandidate {
  return { h3, lat, lng: 0, terrain: 'land' };
}

test('assignRegionOpeningHexes repeats one hex for the same side', () => {
  const occupiedByHex = new Map<string, InitialPlacementSide>();
  const assigned = assignRegionOpeningHexes({
    candidates: [candidate('only', 0)],
    count: 2,
    targetLat: 0,
    targetLng: 0,
    occupiedByHex,
    placingSide: 'human',
  });
  assert.deepEqual(assigned, ['only', 'only']);
  assert.equal(occupiedByHex.get('only'), 'human');
});

test('assignRegionOpeningHexes throws when every candidate is held by the other side', () => {
  const occupiedByHex = new Map<string, InitialPlacementSide>();
  assert.equal(claimInitialPlacementHex(occupiedByHex, 'H', 'human'), true);
  assert.throws(
    () =>
      assignRegionOpeningHexes({
        candidates: [candidate('H', 0)],
        count: 1,
        targetLat: 0,
        targetLng: 0,
        occupiedByHex,
        placingSide: 'opponent',
      }),
    (error: unknown) =>
      error instanceof Error && error.message === 'Could not allocate required opponent spawn hex without mixing sides'
  );
});

test('assignRegionOpeningHexes skips a hex held by the other side and repeats a free hex', () => {
  const occupiedByHex = new Map<string, InitialPlacementSide>();
  assert.equal(claimInitialPlacementHex(occupiedByHex, 'H', 'human'), true);
  const assigned = assignRegionOpeningHexes({
    candidates: [candidate('H', 0), candidate('F', 1)],
    count: 2,
    targetLat: 0,
    targetLng: 0,
    occupiedByHex,
    placingSide: 'opponent',
  });
  assert.deepEqual(assigned, ['F', 'F']);
  assert.equal(occupiedByHex.get('H'), 'human');
  assert.equal(occupiedByHex.get('F'), 'opponent');
});

test('assignRegionOpeningHexes returns an empty list without throwing when there is nothing to place', () => {
  const occupiedByHex = new Map<string, InitialPlacementSide>();
  assert.deepEqual(
    assignRegionOpeningHexes({
      candidates: [candidate('H', 0)],
      count: 0,
      targetLat: 0,
      targetLng: 0,
      occupiedByHex,
      placingSide: 'human',
    }),
    []
  );
  assert.deepEqual(
    assignRegionOpeningHexes({
      candidates: [],
      count: 2,
      targetLat: 0,
      targetLng: 0,
      occupiedByHex,
      placingSide: 'human',
    }),
    []
  );
  assert.equal(occupiedByHex.size, 0);
});
