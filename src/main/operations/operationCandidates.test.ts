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
import type { Operation, OperationCandidate } from '../../shared/operationTypes';
import { operationCandidatesForSeat, operationMenuRows, operationSlotsForState } from './operationCandidates';

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

/**
 * One menu row named by its objective, so a composition test can see the order.
 *
 * Purpose: The menu cut does not read the route, only the two lists.
 * When to use: The composition cases.
 * Expected outcome: A sea or air candidate whose objective is the given hex.
 * Exceptions: None.
 */
function row(method: 'land' | 'sea' | 'air', objectiveH3: string): OperationCandidate {
  return {
    method,
    objectiveH3,
    musterH3: 'muster',
    landingH3: 'landing',
    unitIds: method === 'air' ? ['inf-a'] : ['inf-a', 'inf-b'],
    carrierIds: method === 'air' ? ['air-1'] : ['ship-1'],
    etaTurns: 3,
    urbanHexCount: 1,
    inEnemyHome: false,
    knownFortifiedCount: 0,
    defenders: 0,
    reinforcers: 0,
    clear: true,
  };
}

test('the menu keeps sea rows first and reserves the last rows for air', () => {
  const threeSea = ['s1', 's2', 's3'].map((id) => row('sea', id));
  const twoAir = ['a1', 'a2'].map((id) => row('air', id));
  assert.deepEqual(
    operationMenuRows({ sea: threeSea, air: twoAir }).map((candidate) => candidate.objectiveH3),
    ['s1', 's2', 's3', 'a1', 'a2']
  );
  const sixSea = ['s1', 's2', 's3', 's4', 's5', 's6'].map((id) => row('sea', id));
  assert.deepEqual(
    operationMenuRows({ sea: sixSea, air: [row('air', 'a1')] }).map((candidate) => candidate.objectiveH3),
    ['s1', 's2', 's3', 's4', 'a1']
  );
  const fiveSea = ['s1', 's2', 's3', 's4', 's5'].map((id) => row('sea', id));
  assert.deepEqual(
    operationMenuRows({ sea: fiveSea, air: twoAir }).map((candidate) => candidate.objectiveH3),
    ['s1', 's2', 's3', 'a1', 'a2']
  );
  assert.deepEqual(
    operationMenuRows({ sea: [], air: twoAir }).map((candidate) => candidate.objectiveH3),
    ['a1', 'a2']
  );
});

test('land rows come first and sea takes the seats that remain', () => {
  const land = ['l1', 'l2'].map((id) => row('land', id));
  const sea = ['s1', 's2', 's3', 's4'].map((id) => row('sea', id));
  const air = ['a1', 'a2'].map((id) => row('air', id));
  assert.deepEqual(
    operationMenuRows({ land, sea, air }).map((candidate) => candidate.objectiveH3),
    ['l1', 'l2', 's1', 'a1', 'a2'],
  );
});

test('air and sea slots are counted separately', () => {
  const state = { gameSize: 'small' } as GameStateSnapshot;
  assert.equal(operationSlotsForState(state, 'sea'), 1);
  assert.equal(operationSlotsForState(state, 'air'), 1);
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
