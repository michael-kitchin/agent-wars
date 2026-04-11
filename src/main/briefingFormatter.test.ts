/**
 * Tests for the briefing formatter (Milestone 0.6 Phase 3). Asserts the three-section structure,
 * two tables, attention flags, and memory/standing-order blocks.
 */

import * as assert from 'assert';
import { gridDisk, latLngToCell } from 'h3-js';
import type { GameStateSnapshot } from './gameDb';
import type { PrecomputationResult, UnitAssessmentResult } from './precomputation';
import { formatBriefing } from './briefingFormatter';

/**
 * Documents the module-scope binding `fixtureOriginH3` (fixtureOriginH3).

 * Purpose: Supports maintainability by documenting why `fixtureOriginH3` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const fixtureOriginH3 = latLngToCell(0, 0, 3);
/**
 * Documents the module-scope binding `fixtureNeighborH3` (fixtureNeighborH3).

 * Purpose: Supports maintainability by documenting why `fixtureNeighborH3` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const fixtureNeighborH3 = gridDisk(fixtureOriginH3, 1).find((h3) => h3 !== fixtureOriginH3)!;

/**
 * Documents the module-scope binding `fixtureState` (fixtureState: GameStateSnapshot).

 * Purpose: Supports maintainability by documenting why `fixtureState` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const fixtureState: GameStateSnapshot = {
    /**
   * Documents the object literal property `hexes` (hexes: [ { h3Index: fixtureOriginH3, terrain: 'land', terrainKind: 'plains' }, { h3Index: fixtureNeighborH3, terrain: 'land', terrainKind: 'plains' },).

   * Purpose: Supports maintainability by documenting why `hexes` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
hexes: [
    { h3Index: fixtureOriginH3, terrain: 'land', terrainKind: 'plains' },
    { h3Index: fixtureNeighborH3, terrain: 'land', terrainKind: 'plains' },
  ],
    /**
   * Documents the object literal property `units` (units: [ { id: 'opponent-armor-1', player: 'opponent', unitType: 'armor', h3Index: fixtureOriginH3 }, { id: 'opponent-infantry-1', player: 'opponent',).

   * Purpose: Supports maintainability by documenting why `units` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
units: [
    { id: 'opponent-armor-1', player: 'opponent', unitType: 'armor', h3Index: fixtureOriginH3 },
    { id: 'opponent-infantry-1', player: 'opponent', unitType: 'infantry', h3Index: fixtureOriginH3 },
    { id: 'human-inf-1', player: 'human', unitType: 'infantry', h3Index: fixtureNeighborH3 },
  ],
    /**
   * Documents the object literal property `phase` (phase: 'planning').

   * Purpose: Supports maintainability by documenting why `phase` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
phase: 'planning',
    /**
   * Documents the object literal property `turnNumber` (turnNumber: 2).

   * Purpose: Supports maintainability by documenting why `turnNumber` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
turnNumber: 2,
    /**
   * Documents the object literal property `pendingOrders` (pendingOrders: []).

   * Purpose: Supports maintainability by documenting why `pendingOrders` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
pendingOrders: [],
};

/**
 * Documents the module-scope binding `fixtureUnitAssessments` (fixtureUnitAssessments: UnitAssessmentResult[]).

 * Purpose: Supports maintainability by documenting why `fixtureUnitAssessments` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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

/**
 * Documents the module-scope binding `precomputed` (precomputed: PrecomputationResult).

 * Purpose: Supports maintainability by documenting why `precomputed` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const precomputed: PrecomputationResult = {
    /**
   * Documents the object literal property `unitAssessments` (unitAssessments: fixtureUnitAssessments).

   * Purpose: Supports maintainability by documenting why `unitAssessments` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unitAssessments: fixtureUnitAssessments,
    /**
   * Documents the object literal property `hexAssessments` (hexAssessments: []).

   * Purpose: Supports maintainability by documenting why `hexAssessments` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
hexAssessments: [],
};

/**
 * Defines the `testFormatBriefingContainsSections` function shape (function testFormatBriefingContainsSections(): void).

 * Purpose: Supports maintainability by documenting why `testFormatBriefingContainsSections` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testFormatBriefingContainsSections(): void {
  const standingOrderText =
    '# Standing Order Status\n\n- opponent-infantry-1: MARCH to [1.000, 1.000] — en_route';
  const memoryText = 'Remember: push south.';
  const out = formatBriefing(fixtureState, precomputed, standingOrderText, memoryText);
  assert.ok(out.includes("# Commander's Briefing"), 'title');
  assert.ok(out.includes('Turn 2:'), 'Section 1 narrative');
  assert.ok(out.match(/\.\s+[A-Z]/), 'Section 1 has multiple sentences');
  assert.ok(out.includes('| Unit ID |'), 'unit table header');
  assert.ok(out.includes('# Possible Unit Actions'), 'possible unit actions section');
  assert.ok(out.includes('## Losses Since Last Consultation'), 'losses subsection header');
  assert.ok(out.includes('| Turn | Victim Unit | Side | Cause | Killer IDs |'), 'losses subsection table header');
  assert.ok(out.includes('opponent-armor-1'), 'unit table has unit');
  assert.ok(
    out.includes('| Unit ID |') || out.includes('## Other Hexes') || out.includes('# Possible Unit Actions'),
    'possible actions table or section present'
  );
  assert.ok(out.includes('## Attention Flags'), 'attention flags header');
  assert.ok(
    out.indexOf('## Attention Flags') < out.indexOf('# Possible Unit Actions'),
    'attention flags appear before possible unit actions'
  );
  assert.ok(out.includes('Your Strategic Memory'), 'memory block');
  assert.ok(out.includes('Remember: push south.'), 'memory text');
  assert.ok(out.includes('# Standing Order Status'), 'standing order block');
  assert.ok(out.includes('## Active Callbacks'), 'Active Callbacks section');
  assert.ok(out.includes('None. You may add callbacks'), 'callbacks hint when none');
  assert.ok(!out.includes('undefined'), 'no raw undefined');
}

/**
 * Defines the `testFormatBriefingActiveCallbacksWithSubscriptions` function shape (function testFormatBriefingActiveCallbacksWithSubscriptions(): void).

 * Purpose: Supports maintainability by documenting why `testFormatBriefingActiveCallbacksWithSubscriptions` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testFormatBriefingActiveCallbacksWithSubscriptions(): void {
  const subs = [
    { event: 'turns', params: { n: 3 }, subscribedTurn: 10 },
    { event: 'unit_engaged', params: { unitId: 'opponent-armor-1' } },
  ];
  const out = formatBriefing(fixtureState, precomputed, '', '', subs);
  assert.ok(out.includes('## Active Callbacks'), 'Active Callbacks section');
  assert.ok(out.includes('turns(3) → fires turn 13'), 'turns subscription line');
  assert.ok(out.includes('unit_engaged(opponent-armor-1)'), 'unit_engaged subscription line');
}

/**
 * Defines the `testFormatBriefingIncludesLossRowsWhenProvided` function shape (function testFormatBriefingIncludesLossRowsWhenProvided(): void).

 * Purpose: Supports maintainability by documenting why `testFormatBriefingIncludesLossRowsWhenProvided` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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

/**
 * Defines the `testFormatBriefingUnitTableRows` function shape (function testFormatBriefingUnitTableRows(): void).

 * Purpose: Supports maintainability by documenting why `testFormatBriefingUnitTableRows` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testFormatBriefingUnitTableRows(): void {
  const out = formatBriefing(fixtureState, precomputed, '', '');
  const unitTableStart = out.indexOf('| Unit ID |');
  const unitTableEnd = out.indexOf('# Possible Unit Actions');
  const unitTable = out.slice(unitTableStart, unitTableEnd);
  assert.ok(unitTable.includes('opponent-armor-1') && unitTable.includes('opponent-infantry-1'));
  assert.ok(unitTable.includes('yes') || unitTable.includes('no'), 'action needed column');
}

/**
 * Defines the `testFormatBriefingPossibleActionsArmorRanged` function shape (function testFormatBriefingPossibleActionsArmorRanged(): void).

 * Purpose: Supports maintainability by documenting why `testFormatBriefingPossibleActionsArmorRanged` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testFormatBriefingPossibleActionsArmorRanged(): void {
  const out = formatBriefing(fixtureState, precomputed, '', '');
  assert.ok(out.includes('opponent-armor-1'));
  assert.ok(out.includes('ranged attack'));
  assert.ok(out.includes('| Unit ID | Unit Type | Action Types | Hex | Distance | Enemy Units | Hex Features |'));
}

/**
 * Documents the module-scope binding `tests` (tests).

 * Purpose: Supports maintainability by documenting why `tests` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const tests = [
  { name: 'formatBriefing contains all sections', fn: testFormatBriefingContainsSections },
  { name: 'formatBriefing unit table rows', fn: testFormatBriefingUnitTableRows },
  { name: 'formatBriefing possible actions armor ranged', fn: testFormatBriefingPossibleActionsArmorRanged },
  { name: 'formatBriefing Active callbacks with subscriptions', fn: testFormatBriefingActiveCallbacksWithSubscriptions },
  { name: 'formatBriefing losses table rows', fn: testFormatBriefingIncludesLossRowsWhenProvided },
];

/**
 * Defines the `run` function shape (function run(): void).

 * Purpose: Supports maintainability by documenting why `run` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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
