/**
 * The shared sea-candidate search stops when a slot or the terrain is unavailable.
 *
 * Purpose: A full seat and a failed search must not invent a landing.
 * When to use: After changes to `operationCandidatesForSeat`.
 * Expected outcome: Process exit 0.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GameStateSnapshot } from '../gameDb';
import type { Operation } from '../../shared/operationTypes';
import { operationCandidatesForSeat } from './operationCandidates';

/**
 * One stored sea operation.
 *
 * Purpose: A small match has one sea slot, so this row fills it.
 * When to use: The full-slot case.
 * Expected outcome: A muster operation.
 * Exceptions: None.
 */
function fillingOperation(): Operation {
  return {
    id: 'opponent-op1',
    method: 'sea',
    objectiveH3: 'city',
    musterH3: 'port',
    landingH3: null,
    unitIds: ['inf-a', 'inf-b'],
    carrierIds: ['ship-1'],
    phase: 'muster',
    source: 'engine',
    launchedTurn: 1,
    phaseTurn: 1,
  };
}

test('full sea slots give no candidates', () => {
  const state = { gameSize: 'small' } as GameStateSnapshot;
  const candidates = operationCandidatesForSeat({
    state,
    seatId: 'opponent',
    active: [fillingOperation()],
  });
  assert.deepEqual(candidates, []);
});

test('a search that throws gives no candidates', () => {
  const state = new Proxy({ gameSize: 'small' }, {
    get(target, property) {
      if (property === 'gameSize') return target.gameSize;
      throw new Error('snapshot unavailable');
    },
  }) as GameStateSnapshot;
  const candidates = operationCandidatesForSeat({ state, seatId: 'opponent', active: [] });
  assert.deepEqual(candidates, []);
});
