/**
 * Active Operations bullets for each stage.
 *
 * Purpose: The briefing and the no-briefing path share this wording, including the singular when a count is one.
 * When to use: After changes to `buildOperationsSection`.
 * Expected outcome: Process exit 0. Hexes are passed through unchanged.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GameStateSnapshot } from '../gameDb';
import type { Operation, OperationCandidate } from '../../shared/operationTypes';
import { buildOperationOptionsSection, buildOperationsSection } from './briefingSectionsOperations';

/**
 * A snapshot that carries only the units and the city the bullet reads.
 *
 * Purpose: Present, aboard, and urban counts come from the snapshot, not from the operation alone.
 * When to use: Each bullet case.
 * Expected outcome: A snapshot `buildOperationsSection` can read.
 * Exceptions: None.
 */
function state(args: {
  readonly units: GameStateSnapshot['units'];
  readonly urban: number;
}): GameStateSnapshot {
  return {
    hexes: [],
    units: args.units,
    phase: 'planning',
    turnNumber: 1,
    pendingOrders: [],
    strategicInfrastructure: [{ h3Index: 'city', urbanHexCount: args.urban, airportCount: 0, seaportCount: 0 }],
  } as unknown as GameStateSnapshot;
}

/**
 * One stored operation with the fields a bullet does not change filled in.
 *
 * Purpose: Each case names the stage and the force.
 * When to use: The bullet cases.
 * Expected outcome: A sea operation.
 * Exceptions: None.
 */
function operation(patch: Partial<Operation> & Pick<Operation, 'phase' | 'unitIds' | 'carrierIds'>): Operation {
  return {
    id: 'seat-op1',
    method: 'sea',
    objectiveH3: 'city',
    musterH3: 'port',
    landingH3: 'beach',
    source: 'engine',
    launchedTurn: 1,
    phaseTurn: 1,
    ...patch,
  };
}

test('no operation writes nothing', () => {
  const text = buildOperationsSection({
    state: state({ units: [], urban: 1 }),
    operations: [],
    format: (hex) => hex,
  });
  assert.equal(text, '');
});

test('muster uses the singular when one unit and one ship are at the port', () => {
  const text = buildOperationsSection({
    state: state({
      units: [
        { id: 'inf-a', player: 'opponent', unitType: 'infantry', h3Index: 'port' },
        { id: 'ship-1', player: 'opponent', unitType: 'naval', h3Index: 'port' },
      ],
      urban: 1,
    }),
    operations: [operation({ phase: 'muster', unitIds: ['inf-a'], carrierIds: ['ship-1'], landingH3: null })],
    format: (hex) => hex,
  });
  assert.equal(
    text,
    [
      '# Active Operations',
      '',
      '- seat-op1: by sea to city, an enemy city with 1 city cell. Mustering at port: 1 of 1 ground unit and 1 of 1 ship are there. Units: inf-a. Ships: ship-1.',
    ].join('\n'),
  );
});

test('transit names the landing and the units aboard', () => {
  const text = buildOperationsSection({
    state: state({
      units: [{ id: 'inf-a', player: 'opponent', unitType: 'infantry', h3Index: 'sea', embarkedOnCarrierUnitId: 'ship-1' }],
      urban: 2,
    }),
    operations: [operation({ phase: 'transit', unitIds: ['inf-a', 'inf-b'], carrierIds: ['ship-1'] })],
    format: (hex) => hex,
  });
  assert.equal(
    text,
    '# Active Operations\n\n- seat-op1: by sea to city, an enemy city with 2 city cells. At sea, heading for beach, with 1 ground unit aboard. Ships: ship-1.',
  );
});

test('assault names the units marching on the city', () => {
  const text = buildOperationsSection({
    state: state({ units: [], urban: 2 }),
    operations: [operation({ phase: 'assault', unitIds: ['inf-a', 'inf-b'], carrierIds: [] })],
    format: (hex) => hex,
  });
  assert.equal(
    text,
    '# Active Operations\n\n- seat-op1: by sea to city, an enemy city with 2 city cells. Landed. 2 ground units are marching on it: inf-a, inf-b.',
  );
});

test('return names the port the ships are sailing to', () => {
  const text = buildOperationsSection({
    state: state({ units: [], urban: 2 }),
    operations: [operation({ phase: 'return', unitIds: ['inf-a'], carrierIds: ['ship-1'] })],
    format: (hex) => hex,
  });
  assert.equal(
    text,
    '# Active Operations\n\n- seat-op1: turned back from city. Returning to port. Ships: ship-1.',
  );
});

/**
 * One menu row with the counts a table cell reads.
 *
 * Purpose: Each case names the force and the risk without repeating the unused fields.
 * When to use: The options cases.
 * Expected outcome: A sea candidate.
 * Exceptions: None.
 */
function candidate(patch: Partial<OperationCandidate>): OperationCandidate {
  return {
    method: 'sea',
    objectiveH3: 'city',
    musterH3: 'port',
    landingH3: 'beach',
    unitIds: ['inf-a', 'inf-b'],
    carrierIds: ['ship-1'],
    etaTurns: 6,
    urbanHexCount: 4,
    inEnemyHome: true,
    knownFortifiedCount: 0,
    defenders: 0,
    reinforcers: 3,
    clear: true,
    ...patch,
  };
}

test('two candidates are rows A and B', () => {
  const text = buildOperationOptionsSection({
    state: state({
      units: [
        { id: 'inf-a', player: 'opponent', unitType: 'infantry', h3Index: 'port' },
        { id: 'inf-b', player: 'opponent', unitType: 'infantry', h3Index: 'port' },
        { id: 'inf-c', player: 'opponent', unitType: 'armor', h3Index: 'home' },
        { id: 'inf-d', player: 'opponent', unitType: 'infantry', h3Index: 'home' },
        { id: 'ship-1', player: 'opponent', unitType: 'naval', h3Index: 'sea' },
        { id: 'ship-2', player: 'opponent', unitType: 'naval', h3Index: 'sea' },
      ],
      urban: 4,
    }),
    seatId: 'opponent',
    candidates: [
      candidate({}),
      candidate({
        objectiveH3: 'city-b',
        musterH3: 'port-b',
        landingH3: 'beach-b',
        unitIds: ['inf-c'],
        carrierIds: ['ship-2'],
        etaTurns: 3,
        urbanHexCount: 2,
        inEnemyHome: false,
        defenders: 2,
        reinforcers: 0,
        clear: false,
      }),
    ],
    format: (hex) => hex,
  });
  assert.match(text, /^## Operation Options\n\n\| Option \| Objective \| Method \| Plan \| Impact \| Cost \| Risk \|/);
  assert.match(text, /\| A \| city \| sea \| 2 ground units muster at port; 1 ship sail to beach; assault city \| 4 city cells, in an enemy home region \| 2 of 4 ground units, 1 of 2 ships, about 6 turns \| 0 enemy units within 2 hexes; 3 more can reach it in 6 turns \|/);
  assert.match(text, /\| B \| city-b \| sea \| 1 ground unit muster at port-b; 1 ship sail to beach-b; assault city-b \| 2 city cells \| 1 of 4 ground units, 1 of 2 ships, about 3 turns \| 2 enemy units within 2 hexes; 0 more can reach it in 3 turns \|/);
});

test('one defender and one fortified cell use the singular', () => {
  const text = buildOperationOptionsSection({
    state: state({
      units: [
        { id: 'inf-a', player: 'opponent', unitType: 'infantry', h3Index: 'port' },
        { id: 'ship-1', player: 'opponent', unitType: 'naval', h3Index: 'sea' },
      ],
      urban: 1,
    }),
    seatId: 'opponent',
    candidates: [candidate({
      unitIds: ['inf-a'],
      carrierIds: ['ship-1'],
      etaTurns: 1,
      urbanHexCount: 1,
      inEnemyHome: false,
      knownFortifiedCount: 1,
      defenders: 1,
      reinforcers: 1,
      clear: false,
    })],
    format: (hex) => hex,
  });
  assert.match(text, /1 ground unit muster at port; 1 ship sail to beach/);
  assert.match(text, /1 city cell \| 1 ground unit, 1 ship, about 1 turn \| 1 enemy unit within 2 hexes; 1 more can reach it in 1 turn; 1 fortified cell/);
});

test('options with no operation still print the table', () => {
  const table = buildOperationOptionsSection({
    state: state({ units: [], urban: 1 }),
    seatId: 'opponent',
    candidates: [candidate({ unitIds: ['inf-a', 'inf-b'], carrierIds: ['ship-1'] })],
    format: (hex) => hex,
  });
  const text = buildOperationsSection({
    state: state({ units: [], urban: 1 }),
    operations: [],
    format: (hex) => hex,
    options: table,
  });
  assert.match(text, /^# Active Operations\n\n## Operation Options\n/);
  assert.equal(
    buildOperationsSection({
      state: state({ units: [], urban: 1 }),
      operations: [],
      format: (hex) => hex,
    }),
    '',
  );
});
