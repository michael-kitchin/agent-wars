/**
 * Active Operations wording for a campaign by sea and its campaign lifts.
 *
 * Purpose: The campaign bullet names the lift that serves its target, and a campaign lift reads differently from a raid.
 * When to use: After changes to `buildOperationsSection` for campaign lifts.
 * Expected outcome: Process exit 0. Hexes are passed through unchanged.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GameStateSnapshot } from '../gameDb';
import type { Operation } from '../../shared/operationTypes';
import type { CampaignPlan } from './campaignRules';
import { buildOperationsSection } from './briefingSectionsOperations';

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

/**
 * A campaign plan with only the fields the operations bullet reads filled in.
 *
 * Purpose: The bullet names the phase, the staging hex, and the mass count.
 * When to use: The campaign-bullet cases.
 * Expected outcome: A plan whose objective matches the arguments.
 * Exceptions: None.
 */
function campaignPlan(args: {
  readonly phase: 'assemble' | 'assault';
  readonly stagingH3: string | null;
  readonly massedCount: number;
  readonly threshold: number;
}): CampaignPlan {
  return {
    objective: {
      targetH3: 'city',
      stagingH3: args.stagingH3,
      phase: args.phase,
      source: 'engine',
      chosenTurn: 1,
    },
    waypointH3: args.stagingH3 ?? 'city',
    campaignUnitIds: new Set<string>(),
    holdUnitIds: new Set<string>(),
    defenderUnitIds: [],
    homeThreatCount: 0,
    homeDefenseCapped: false,
    massedCount: args.massedCount,
    threshold: args.threshold,
  };
}

test('a sea campaign bullet names its lift, or says it waits for one', () => {
  const plan = { ...campaignPlan({ phase: 'assault', stagingH3: null, massedCount: 0, threshold: 3 }) };
  const seaPlan: CampaignPlan = { ...plan, objective: { ...plan.objective, approach: 'sea' } };
  const waiting = buildOperationsSection({
    state: state({ units: [], urban: 2 }),
    operations: [],
    format: (hex) => hex,
    campaignPlan: seaPlan,
  });
  assert.equal(
    waiting,
    '# Active Operations\n\n- campaign: by sea to city, an enemy city with 2 city cells. Waiting for a campaign lift: enough ground units at a port and ships to carry them.',
  );
  const carrying = buildOperationsSection({
    state: state({ units: [], urban: 2 }),
    operations: [
      operation({ id: 'seat-op3', purpose: 'campaign', phase: 'assault', unitIds: ['inf-a'], carrierIds: [] }),
      operation({ id: 'seat-op2', purpose: 'campaign', phase: 'assault', unitIds: ['inf-b'], carrierIds: [] }),
    ],
    format: (hex) => hex,
    campaignPlan: seaPlan,
  });
  assert.ok(
    carrying.includes('- campaign: by sea to city, an enemy city with 2 city cells. Campaign lift seat-op2 is carrying the force.'),
  );
  const stale = buildOperationsSection({
    state: state({ units: [], urban: 2 }),
    operations: [operation({ id: 'seat-op2', purpose: 'campaign', objectiveH3: 'old-city', phase: 'assault', unitIds: ['inf-b'], carrierIds: [] })],
    format: (hex) => hex,
    campaignPlan: seaPlan,
  });
  assert.ok(
    stale.includes('- campaign: by sea to city, an enemy city with 2 city cells. Waiting for a campaign lift: enough ground units at a port and ships to carry them.'),
  );
});

test('a campaign lift says campaign lift by sea and a raid keeps its wording', () => {
  const units = [
    { id: 'inf-a', player: 'opponent', unitType: 'infantry', h3Index: 'port' },
    { id: 'ship-1', player: 'opponent', unitType: 'naval', h3Index: 'port' },
  ];
  const lift = buildOperationsSection({
    state: state({ units, urban: 1 }),
    operations: [operation({ purpose: 'campaign', phase: 'muster', unitIds: ['inf-a'], carrierIds: ['ship-1'], landingH3: null })],
    format: (hex) => hex,
  });
  assert.ok(lift.includes('- seat-op1: campaign lift by sea to city, an enemy city with 1 city cell. Mustering at port:'));
  const turnedBack = buildOperationsSection({
    state: state({ units, urban: 1 }),
    operations: [operation({ purpose: 'campaign', phase: 'return', unitIds: ['inf-a'], carrierIds: ['ship-1'] })],
    format: (hex) => hex,
  });
  assert.ok(turnedBack.includes('- seat-op1: campaign lift turned back from city.'));
  const raid = buildOperationsSection({
    state: state({ units, urban: 1 }),
    operations: [operation({ phase: 'muster', unitIds: ['inf-a'], carrierIds: ['ship-1'], landingH3: null })],
    format: (hex) => hex,
  });
  assert.ok(raid.includes('- seat-op1: by sea to city, an enemy city with 1 city cell. Mustering at port:'));
});
