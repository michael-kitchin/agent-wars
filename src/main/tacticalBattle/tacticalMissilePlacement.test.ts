/**
 * Missile placement order at the start of a battle.
 *
 * Purpose: The birth cell is tried first only when it belongs to the battle core.
 * When to use: After changing `missilePlacementCellOrder`.
 * Expected outcome: An in-core birth cell leads. An outside birth cell is ignored.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { missilePlacementCellOrder, missilePlacementPassable } from './tacticalMissilePlacement';

test('a missile birth cell in the core is placed first', () => {
  assert.deepEqual(
    missilePlacementCellOrder({
      birthTacticalH3Index: 'birth',
      coreSet: new Set(['birth', 'other']),
      orderedCells: ['other', 'birth', 'far'],
    }),
    ['birth', 'other', 'far']
  );
});

test('a missile birth cell outside the core is ignored', () => {
  assert.deepEqual(
    missilePlacementCellOrder({
      birthTacticalH3Index: 'outside',
      coreSet: new Set(['other']),
      orderedCells: ['other', 'far'],
    }),
    ['other', 'far']
  );
});

test('a missile stands on urban or rubble', () => {
  assert.equal(missilePlacementPassable({ cell: 'urban', isUrbanOrRubble: (cell) => cell === 'urban' }), true);
  assert.equal(missilePlacementPassable({ cell: 'forest', isUrbanOrRubble: () => false }), false);
});
