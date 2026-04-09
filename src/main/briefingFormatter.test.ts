/**
 * Tests for the briefing formatter (Milestone 0.6 Phase 3). Asserts the three-section structure,
 * two tables, attention flags, and memory/standing-order blocks.
 */

import * as assert from 'assert';
import { gridDisk, latLngToCell } from 'h3-js';
import type { GameStateSnapshot } from './gameDb';
import type { PrecomputationResult, UnitAssessmentResult } from './precomputation';
import { formatBriefing } from './briefingFormatter';

const fixtureOriginH3 = latLngToCell(0, 0, 3);
const fixtureNeighborH3 = gridDisk(fixtureOriginH3, 1).find((h3) => h3 !== fixtureOriginH3)!;

const fixtureState: GameStateSnapshot = {
  hexes: [
    { h3Index: fixtureOriginH3, terrain: 'land', terrainKind: 'plains' },
    { h3Index: fixtureNeighborH3, terrain: 'land', terrainKind: 'plains' },
  ],
  units: [
    { id: 'opponent-armor-1', player: 'opponent', unitType: 'armor', h3Index: fixtureOriginH3 },
    { id: 'opponent-infantry-1', player: 'opponent', unitType: 'infantry', h3Index: fixtureOriginH3 },
    { id: 'human-inf-1', player: 'human', unitType: 'infantry', h3Index: fixtureNeighborH3 },
  ],
  phase: 'planning',
  turnNumber: 2,
  pendingOrders: [],
};

const fixtureUnitAssessments: UnitAssessmentResult[] = [
  {
    unitId: 'opponent-armor-1',
    result: {
      status: 'ok',
      unit: {
        unitId: 'opponent-armor-1',
        type: 'armor',
        position: [2.1, 0.5],
        currentStandingOrder: null,
      },
      nearbyEnemies: [
        { unitId: 'human-inf-1', hexDistance: 1, inRangedRange: true, inMeleeRange: true } as UnitAssessmentResult['result']['nearbyEnemies'][0],
      ],
      threats: [{ description: 'in range', severity: 'critical', sourceUnit: 'human-inf-1' }],
      canAttackThisTurn: [],
    } as unknown as UnitAssessmentResult['result'],
  },
  {
    unitId: 'opponent-infantry-1',
    result: {
      status: 'ok',
      unit: {
        unitId: 'opponent-infantry-1',
        type: 'infantry',
        position: [8.2, 4.3],
        currentStandingOrder: { type: 'march', destination: [1, 1], status: 'en_route' },
      },
      nearbyEnemies: [],
      threats: [],
      canAttackThisTurn: [],
    } as unknown as UnitAssessmentResult['result'],
  },
];

const precomputed: PrecomputationResult = {
  unitAssessments: fixtureUnitAssessments,
  hexAssessments: [],
};

function testFormatBriefingContainsSections(): void {
  const standingOrderText = '=== STANDING ORDER STATUS ===\n- opponent-infantry-1: MARCH to [1.000, 1.000] — en_route';
  const memoryText = 'Remember: push south.';
  const out = formatBriefing(fixtureState, precomputed, standingOrderText, memoryText);
  assert.ok(out.includes("=== COMMANDER'S BRIEFING (Turn 2) ==="), 'title');
  assert.ok(out.includes('Turn 2:'), 'Section 1 narrative');
  assert.ok(out.match(/\.\s+[A-Z]/), 'Section 1 has multiple sentences');
  assert.ok(out.includes('| Unit ID |'), 'unit table header');
  assert.ok(out.includes('**Possible unit actions**'), 'possible unit actions section');
  assert.ok(out.includes('**Losses since last consultation**'), 'losses subsection header');
  assert.ok(out.includes('| Turn | Victim Unit | Side | Cause | Killer IDs |'), 'losses subsection table header');
  assert.ok(out.includes('opponent-armor-1'), 'unit table has unit');
  assert.ok(
    out.includes('| Unit ID |') || out.includes('### Other hexes') || out.includes('**Possible unit actions**'),
    'possible actions table or section present'
  );
  assert.ok(out.includes('**Attention flags**'), 'Section 3 header');
  assert.ok(out.includes('YOUR STRATEGIC MEMORY'), 'memory block');
  assert.ok(out.includes('Remember: push south.'), 'memory text');
  assert.ok(out.includes('STANDING ORDER STATUS'), 'standing order block');
  assert.ok(out.includes('**ACTIVE CALLBACKS**'), 'ACTIVE CALLBACKS section');
  assert.ok(out.includes('None. You may add callbacks'), 'callbacks hint when none');
  assert.ok(!out.includes('undefined'), 'no raw undefined');
}

function testFormatBriefingActiveCallbacksWithSubscriptions(): void {
  const subs = [
    { event: 'turns', params: { n: 3 }, subscribedTurn: 10 },
    { event: 'unit_engaged', params: { unitId: 'opponent-armor-1' } },
  ];
  const out = formatBriefing(fixtureState, precomputed, '', '', subs);
  assert.ok(out.includes('**ACTIVE CALLBACKS**'), 'ACTIVE CALLBACKS section');
  assert.ok(out.includes('turns(3) → fires turn 13'), 'turns subscription line');
  assert.ok(out.includes('unit_engaged(opponent-armor-1)'), 'unit_engaged subscription line');
}

function testFormatBriefingIncludesLossRowsWhenProvided(): void {
  const out = formatBriefing(
    fixtureState,
    precomputed,
    '',
    '',
    [],
    [
      {
        turnNumber: 5,
        victimUnitId: 'opponent-naval-1',
        victimPlayer: 'opponent',
        cause: 'direct_fire',
        killerIds: ['human-armor-1'],
      },
      {
        turnNumber: 6,
        victimUnitId: 'human-infantry-1',
        victimPlayer: 'human',
        cause: 'melee_or_other',
        killerIds: ['opponent-armor-1'],
      },
    ]
  );
  assert.ok(out.includes('| 5 | opponent-naval-1 | own | direct_fire | human-armor-1 |'));
  assert.ok(out.includes('| 6 | human-infantry-1 | enemy | melee_or_other | opponent-armor-1 |'));
}

function testFormatBriefingUnitTableRows(): void {
  const out = formatBriefing(fixtureState, precomputed, '', '');
  const unitTableStart = out.indexOf('| Unit ID |');
  const unitTableEnd = out.indexOf('**Possible unit actions**');
  const unitTable = out.slice(unitTableStart, unitTableEnd);
  assert.ok(unitTable.includes('opponent-armor-1') && unitTable.includes('opponent-infantry-1'));
  assert.ok(unitTable.includes('yes') || unitTable.includes('no'), 'action needed column');
}

function testFormatBriefingPossibleActionsArmorRanged(): void {
  const out = formatBriefing(fixtureState, precomputed, '', '');
  assert.ok(out.includes('opponent-armor-1'));
  assert.ok(out.includes('ranged attack'));
  assert.ok(out.includes('| Unit ID | Unit Type | Action Types | Hex | Distance | Enemy Units | Hex Features |'));
}

const tests = [
  { name: 'formatBriefing contains all sections', fn: testFormatBriefingContainsSections },
  { name: 'formatBriefing unit table rows', fn: testFormatBriefingUnitTableRows },
  { name: 'formatBriefing possible actions armor ranged', fn: testFormatBriefingPossibleActionsArmorRanged },
  { name: 'formatBriefing ACTIVE CALLBACKS with subscriptions', fn: testFormatBriefingActiveCallbacksWithSubscriptions },
  { name: 'formatBriefing losses table rows', fn: testFormatBriefingIncludesLossRowsWhenProvided },
];

function run(): void {
  for (const t of tests) {
    try {
      t.fn();
      console.log(`OK ${t.name}`);
    } catch (err) {
      console.error(`FAIL ${t.name}`, err);
      process.exit(1);
    }
  }
}

run();
