/**
 * Opening placement helpers for fortified battle cells.
 *
 * Purpose: Defenders take their forts after missiles, and no side is placed on another owner's fort.
 * When to use: After changing the four helpers in `tacticalFortificationPlacement`.
 * Expected outcome: Order, passability, and the first claim match the cases below.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { InitialPlacementSide } from '../../shared/initialPlacementSides';
import { AI_SEAT_IDS, HUMAN_SEAT_ID } from '../../shared/seatIds';
import {
  fortifiedCellsForOwner,
  orderParentsForFortifiedPlacement,
  placementPassableForSide,
  takeFortifiedCellForDefender,
} from './tacticalFortificationPlacement';

test('fortified cells keep order and an absent record yields none', () => {
  const ordered = ['a', 'b', 'c'];
  assert.deepEqual(
    fortifiedCellsForOwner({ orderedCells: ordered, ownerByH3: { c: HUMAN_SEAT_ID, a: HUMAN_SEAT_ID, b: AI_SEAT_IDS[0] }, ownerId: HUMAN_SEAT_ID }),
    ['a', 'c']
  );
  assert.deepEqual(fortifiedCellsForOwner({ orderedCells: ordered, ownerByH3: undefined, ownerId: HUMAN_SEAT_ID }), []);
});

test('another owner\'s fortified cell is not passable', () => {
  const ownerByH3 = { fort: HUMAN_SEAT_ID };
  assert.equal(placementPassableForSide({ cell: 'fort', placingOwnerId: AI_SEAT_IDS[0], ownerByH3, basePassable: () => true }), false);
  assert.equal(placementPassableForSide({ cell: 'fort', placingOwnerId: HUMAN_SEAT_ID, ownerByH3, basePassable: () => true }), true);
  assert.equal(placementPassableForSide({ cell: 'open', placingOwnerId: AI_SEAT_IDS[0], ownerByH3, basePassable: () => false }), false);
});

test('parents are ordered missiles, then the defender, then everyone else', () => {
  const parents = [
    { id: 'ai-inf', player: AI_SEAT_IDS[0], unitType: 'infantry' },
    { id: 'def-mis', player: HUMAN_SEAT_ID, unitType: 'missile' },
    { id: 'def-inf', player: HUMAN_SEAT_ID, unitType: 'infantry' },
    { id: 'ai-mis', player: AI_SEAT_IDS[0], unitType: 'missile' },
  ];
  assert.deepEqual(
    orderParentsForFortifiedPlacement(parents, HUMAN_SEAT_ID).map((parent) => parent.id),
    ['def-mis', 'ai-mis', 'def-inf', 'ai-inf']
  );
});

test('the defender claims the first free passable fortified cell', () => {
  const occupied = new Map<string, InitialPlacementSide>([['taken', AI_SEAT_IDS[0]]]);
  const held = new Set(['held']);
  const cell = takeFortifiedCellForDefender({
    cells: ['held', 'blocked', 'taken', 'open'],
    held,
    passable: (candidate) => candidate !== 'blocked',
    occupiedByHex: occupied,
    placingSide: HUMAN_SEAT_ID,
  });
  assert.equal(cell, 'open');
  assert.equal(occupied.get('open'), HUMAN_SEAT_ID);
  assert.equal(
    takeFortifiedCellForDefender({ cells: ['held'], held, passable: () => true, occupiedByHex: occupied, placingSide: HUMAN_SEAT_ID }),
    null
  );
});
