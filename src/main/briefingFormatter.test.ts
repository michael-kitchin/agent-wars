/**
 * Tests for the briefing formatter (Milestone 0.6 Phase 3). Asserts the three-section structure,
 * two tables, attention flags, and memory/standing-order blocks.
 */

import * as assert from 'assert';
import { gridDisk, latLngToCell } from 'h3-js';
import type { GameStateSnapshot } from './gameDb';
import type { PrecomputationResult, UnitAssessmentResult } from './precomputation';
import { buildAttentionFlags, buildUnitStatusTable, formatBriefing } from './briefingFormatter';

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
    '# Standing Order Status\n\n- opponent-infantry-1: MARCH to AB — en_route';
  const memoryText = 'Remember: push south.';
  const out = formatBriefing(fixtureState, precomputed, standingOrderText, memoryText);
  assert.ok(out.includes("# Commander's Briefing"), 'title');
  assert.ok(out.includes('Turn 2:'), 'Section 1 narrative');
  assert.ok(out.match(/\.\s+[A-Z]/), 'Section 1 has multiple sentences');
  assert.ok(out.includes('| Unit ID | Type | Hex |'), 'unit table has Type column');
  assert.ok(out.includes('# Operational Map'), 'operational map section');
  assert.ok(!out.includes('### Unit Roster'), 'no Unit Roster; Unit Status covers threats');
  assert.ok(!out.includes('Standing order + status'), 'no SO column on Unit Status');
  assert.ok(out.includes('| armor |') || out.includes('| armor '), 'unit type on Unit Status');
  assert.ok(!out.includes('## Recent Turn Notes'), 'no recent turn notes on empty history');
  assert.ok(out.includes('opponent-armor-1'), 'unit table has unit');
  assert.ok(
    out.includes('| Unit ID |') || out.includes('## Other Hexes') || out.includes('# Operational Map'),
    'possible actions table or operational map present'
  );
  assert.ok(out.includes('## Attention Flags'), 'attention flags header');
  assert.ok(
    out.indexOf('## Attention Flags') < out.indexOf('# Operational Map'),
    'attention flags appear before operational map'
  );
  assert.ok(out.includes('Your Strategic Memory'), 'memory block');
  assert.ok(out.includes('Remember: push south.'), 'memory text');
  assert.ok(out.includes('# Standing Order Status'), 'standing order block');
  assert.ok(out.includes('MARCH to AB — en_route'), 'SO detail stays in Standing Order Status');
  assert.ok(out.includes('## Active Callbacks'), 'Active Callbacks section');
  assert.ok(out.includes('None. You may add callbacks'), 'callbacks hint when none');
  assert.ok(!out.includes('undefined'), 'no raw undefined');
}

/**
 * Ensures empty standing-order injection omits Standing Order Status and SO narrative coaching.
 *
 * Purpose: Orders-tools-off path must not coach assign_order via briefing sections.
 * When to use: After gating `standingOrderText` on `ordersEnabled` in `requestOrdersFlow`.
 * Expected outcome: No `# Standing Order Status`; no “no standing order” narrative sentence.
 * Exceptions: None.
 */
function testFormatBriefingOmitsStandingOrderWhenInjectionEmpty(): void {
  const out = formatBriefing(fixtureState, precomputed, '', 'Remember: hold.');
  assert.ok(!out.includes('# Standing Order Status'), 'no SO status when injection empty');
  assert.ok(!out.includes('have no standing order'), 'no SO gap narrative when Orders off');
  assert.ok(out.includes('Remember: hold.'), 'memory still present when provided');
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
 * Defines the `testFormatBriefingUnitTableRows` function shape (function testFormatBriefingUnitTableRows(): void).

 * Purpose: Supports maintainability by documenting why `testFormatBriefingUnitTableRows` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testFormatBriefingUnitTableRows(): void {
  const out = formatBriefing(fixtureState, precomputed, '', '');
  const unitTableStart = out.indexOf('| Unit ID | Type | Hex |');
  const unitTableEnd = out.indexOf('# Operational Map');
  const unitTable = out.slice(unitTableStart, unitTableEnd);
  assert.ok(unitTableStart >= 0, 'expected Unit Status header with Type');
  assert.ok(unitTable.includes('opponent-armor-1') && unitTable.includes('opponent-infantry-1'));
  assert.ok(unitTable.includes('armor') && unitTable.includes('infantry'), 'type column populated');
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
  assert.ok(out.includes('ranged'));
  assert.ok(out.includes('| Unit ID | Action | Target Hexes | Target Units | Target Infrastructure |'));
}

/**
 * Ensures SO-inactive triage ignores low-only threats for Action needed and Attention Flags.
 *
 * Purpose: Regression for distant low-threat units flooding Action needed = yes / false “moderate” attention.
 * When to use: After edits to `needsAction` / `buildAttentionFlags` standingOrdersActive=false path.
 * Expected outcome: low → Action needed no and no attention bullet; moderate → yes + “moderate” wording.
 * Exceptions: None.
 */
function testUnitStatusAndAttentionIgnoreLowThreatsWhenStandingOrdersInactive(): void {
  const assessments: UnitAssessmentResult[] = [
    {
      unitId: 'opp-low',
      result: {
        status: 'ok',
        unit: { unitId: 'opp-low', type: 'armor', position: [1, 1], currentStandingOrder: null },
        nearbyEnemies: [
          { unitId: 'hum-1', hexDistance: 6, inRangedRange: false, inMeleeRange: false } as UnitAssessmentResult['result']['nearbyEnemies'][0],
        ],
        threats: [{ description: 'distant', severity: 'low', sourceUnit: 'hum-1' }],
        canAttackThisTurn: [],
      } as unknown as UnitAssessmentResult['result'],
    },
    {
      unitId: 'opp-mod',
      result: {
        status: 'ok',
        unit: { unitId: 'opp-mod', type: 'armor', position: [2, 2], currentStandingOrder: null },
        nearbyEnemies: [
          { unitId: 'hum-1', hexDistance: 2, inRangedRange: true, inMeleeRange: false } as UnitAssessmentResult['result']['nearbyEnemies'][0],
        ],
        threats: [{ description: 'near', severity: 'moderate', sourceUnit: 'hum-1' }],
        canAttackThisTurn: [],
      } as unknown as UnitAssessmentResult['result'],
    },
  ];
  const ctx = { mode: 'strategic' as const };
  const table = buildUnitStatusTable(assessments, ctx, false);
  const lowRow = table.split('\n').find((l) => l.includes('opp-low'));
  const modRow = table.split('\n').find((l) => l.includes('opp-mod'));
  assert.ok(lowRow && lowRow.includes('| no |'), `low threat Action needed no: ${lowRow}`);
  assert.ok(modRow && modRow.includes('| yes |') && modRow.includes('moderate'), `moderate Action needed yes: ${modRow}`);
  const flags = buildAttentionFlags(assessments, 'strategic', false);
  assert.ok(!flags.includes('opp-low'), 'no attention for low-only');
  assert.ok(flags.includes('opp-mod') && flags.includes('moderate threat'), 'attention for moderate with correct severity');
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
  { name: 'formatBriefing omits standing order when injection empty', fn: testFormatBriefingOmitsStandingOrderWhenInjectionEmpty },
  { name: 'formatBriefing unit table rows', fn: testFormatBriefingUnitTableRows },
  { name: 'formatBriefing possible actions armor ranged', fn: testFormatBriefingPossibleActionsArmorRanged },
  { name: 'formatBriefing Active callbacks with subscriptions', fn: testFormatBriefingActiveCallbacksWithSubscriptions },
  {
    name: 'unit status and attention ignore low threats when standing orders inactive',
    fn: testUnitStatusAndAttentionIgnoreLowThreatsWhenStandingOrdersInactive,
  },
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
