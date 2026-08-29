/**
 * Tests for the briefing formatter (Milestone 0.6 Phase 3). Asserts the three-section structure,
 * two tables, attention flags, and memory/standing-order blocks.
 */

import * as assert from 'assert';
import { cellToLatLng, gridDisk, latLngToCell } from 'h3-js';
import type { GameStateSnapshot } from './gameDb';
import type { PrecomputationResult, UnitAssessmentResult } from './precomputation';
import { buildAttentionFlags, buildStrategicNarrative, buildUnitStatusTable, formatBriefing } from './briefingFormatter';
import { getOrderedHexList } from './mapData';
import { FOG_PATH_DISTANCE_BRIEFING_LINE, OMNISCIENT_GRID_PROXIMITY_BRIEFING_LINE } from './tools/assessUnitProximity';
import { buildIntelStalenessRule } from './openRouter/promptSpec/gameRuleText';

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
  assert.ok(out.includes('engine-forced'), 'empty callbacks state the event-driven consequence');
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
 * Production appears when the tool flag is on, including the empty-queue form, and is omitted when off.
 *
 * Purpose: An empty production string used to hide the section even when tools were enabled.
 * When to use: After `includeProductionSection` on `formatBriefing`.
 * Expected outcome: Tools-off omits Production Status; tools-on with empty text emits the defined empty form.
 * Exceptions: None.
 */
function testFormatBriefingProductionSectionFollowsToolFlag(): void {
  const omitted = formatBriefing(fixtureState, precomputed, '', '');
  assert.ok(!omitted.includes('# Production Status'), 'tools off omits production');
  const emptyForm = formatBriefing(fixtureState, precomputed, '', '', [], '', {
    includeProductionSection: true,
  });
  assert.ok(emptyForm.includes('# Production Status'), 'tools on keeps production heading');
  assert.ok(
    emptyForm.includes('No currently controlled hexes with editable production queues.'),
    'empty queues use the defined empty form'
  );
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
  assert.ok(out.includes('| Unit IDs | Action | Target Hexes | Target Units | Target Infrastructure |'));
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
 * A unit with a legal shot is never reported as needing nothing, whatever standing order it carries.
 *
 * Purpose: A captured turn showed a naval unit with a critical threat and a legal shot rendering `no (quiet)`,
 * because a healthy march order was treated as covering it. That told the model to skip the unit, so the shot was
 * only taken by the auto-fire fallback and the model never got to choose a better target. Auto-fire must not be able
 * to hide a manual attack.
 * When to use: After edits to `needsAction`, `isQuiet`, or how `canAttackThisTurn` is populated.
 * Expected outcome: Action needed reads `yes` with no `(quiet)` suffix, and the unit appears in Attention Flags.
 * Exceptions: None.
 */
function testUnitWithLegalShotIsNeverQuiet(): void {
  const assessments: UnitAssessmentResult[] = [
    {
      unitId: 'opp-shooter',
      result: {
        status: 'ok',
        unit: {
          unitId: 'opp-shooter',
          type: 'naval',
          position: [3, 3],
          currentStandingOrder: { orderType: 'march', status: 'in_progress' },
        },
        nearbyEnemies: [
          { unitId: 'hum-1', hexDistance: 2, inRangedRange: true, inMeleeRange: false } as UnitAssessmentResult['result']['nearbyEnemies'][0],
        ],
        threats: [{ description: 'distant', severity: 'low', sourceUnit: 'hum-1' }],
        canAttackThisTurn: [{ unitId: 'hum-1', attackType: 'ranged', reason: '' }],
      } as unknown as UnitAssessmentResult['result'],
    },
  ];
  const table = buildUnitStatusTable(assessments, { mode: 'strategic' as const }, true);
  const row = table.split('\n').find((l) => l.includes('opp-shooter'));
  assert.ok(row && row.includes('| yes |'), `unit with a legal shot must read yes: ${row}`);
  assert.ok(row && !row.includes('quiet'), `unit with a legal shot must not be marked quiet: ${row}`);
  const flags = buildAttentionFlags(assessments, 'strategic', true);
  assert.ok(flags.includes('opp-shooter'), 'a unit with a legal shot belongs in Attention Flags');
  assert.strictEqual(
    flags.split('\n').filter((l) => l.includes('legal attack')).length,
    1,
    'available attacks share one bullet so they cannot consume the five-bullet cap'
  );
}

/**
 * Ensures Attention Flags severity-sort then cap at five bullets.
 *
 * Purpose: Regression for triage flooding when many units need attention.
 * When to use: After edits to `buildAttentionFlags` ranking/slice.
 * Expected outcome: Critical before moderate; at most five bullets; sixth critical omitted when five criticals already listed.
 * Exceptions: None.
 */
function testAttentionFlagsSeveritySortAndCapFive(): void {
  const assessments: UnitAssessmentResult[] = [];
  for (let i = 0; i < 6; i++) {
    assessments.push({
      unitId: `opp-crit-${i}`,
      result: {
        status: 'ok',
        unit: { unitId: `opp-crit-${i}`, type: 'armor', position: [i, i], currentStandingOrder: null },
        nearbyEnemies: [
          { unitId: 'hum-1', hexDistance: 1, inRangedRange: true, inMeleeRange: true } as UnitAssessmentResult['result']['nearbyEnemies'][0],
        ],
        threats: [{ description: 'close', severity: 'critical', sourceUnit: 'hum-1' }],
        canAttackThisTurn: [],
      } as unknown as UnitAssessmentResult['result'],
    });
  }
  assessments.push({
    unitId: 'opp-mod-0',
    result: {
      status: 'ok',
      unit: { unitId: 'opp-mod-0', type: 'infantry', position: [20, 0], currentStandingOrder: null },
      nearbyEnemies: [
        { unitId: 'hum-1', hexDistance: 2, inRangedRange: true, inMeleeRange: false } as UnitAssessmentResult['result']['nearbyEnemies'][0],
      ],
      threats: [{ description: 'near', severity: 'moderate', sourceUnit: 'hum-1' }],
      canAttackThisTurn: [],
    } as unknown as UnitAssessmentResult['result'],
  });
  const flags = buildAttentionFlags(assessments, 'tactical', false);
  const bullets = flags.split('\n').filter((l) => l.startsWith('- '));
  assert.equal(bullets.length, 5, `expected 5 attention bullets, got ${bullets.length}`);
  assert.ok(bullets.every((b) => b.includes('critical threat')), 'cap prefers critical over moderate');
  assert.ok(!flags.includes('opp-mod-0'), 'moderate omitted when five criticals fill the cap');
  const critIdsListed = [0, 1, 2, 3, 4, 5].filter((i) => flags.includes(`opp-crit-${i}`));
  assert.equal(critIdsListed.length, 5, 'exactly five of six critical units appear');
}

/**
 * Names the period in the armed-units aggregate using the consultation mode.
 *
 * Purpose: A beat briefing that says "this turn" trains the model to think in strategic periods.
 * When to use: After edits to `buildAttentionFlags` armed-units wording.
 * Expected outcome: Tactical uses "this beat"; strategic uses "this turn"; air strike is named only when an air shooter is present.
 * Exceptions: None.
 */
function testAttentionFlagsPeriodNounFollowsCoordinateMode(): void {
  const shooter = (id: string, type: 'armor' | 'air'): UnitAssessmentResult =>
    ({
      unitId: id,
      result: {
        status: 'ok',
        unit: { unitId: id, type, position: [0, 0], currentStandingOrder: null },
        nearbyEnemies: [
          {
            unitId: 'hum-1',
            hexDistance: 1,
            inRangedRange: true,
            inMeleeRange: false,
          } as UnitAssessmentResult['result']['nearbyEnemies'][0],
        ],
        threats: [{ description: 'in range', severity: 'moderate', sourceUnit: 'hum-1' }],
        canAttackThisTurn: [{ unitId: 'hum-1', attackType: 'ranged', reason: '' }],
      } as unknown as UnitAssessmentResult['result'],
    });
  const tactical = buildAttentionFlags([shooter('opp-armor-1', 'armor')], 'tactical', false);
  assert.ok(tactical.includes('this beat'), `tactical armed bullet must say this beat: ${tactical}`);
  assert.ok(!tactical.includes('this turn'), `tactical armed bullet must not say this turn: ${tactical}`);
  assert.ok(!tactical.includes('air strike'), `no-air armed bullet must not name air strike: ${tactical}`);
  const strategic = buildAttentionFlags([shooter('opp-armor-1', 'armor')], 'strategic', false);
  assert.ok(strategic.includes('this turn'), `strategic armed bullet must say this turn: ${strategic}`);
  const withAir = buildAttentionFlags([shooter('opp-air-1', 'air')], 'tactical', false);
  assert.ok(withAir.includes('air strike'), `air shooter names air strike: ${withAir}`);
}

/**
 * Ensures the intro critical-threat sentence matches Action needed / Attention Flags when standing orders are healthy.
 *
 * Purpose: Turn 12 said 27 units "require immediate attention" while Action needed was no and Attention Flags were None.
 * When to use: After edits to `buildStrategicNarrative` vs `needsAction`.
 * Expected outcome: Healthy en_route marches with critical threats do not trigger the attention sentence; unordered critical units still do; SO-inactive still counts all critical threats.
 * Exceptions: None.
 */
function testStrategicNarrativeCriticalSentenceMatchesNeedsAction(): void {
  const healthyCritical: UnitAssessmentResult = {
    unitId: 'opp-so-crit',
    result: {
      status: 'ok',
      unit: {
        unitId: 'opp-so-crit',
        type: 'armor',
        position: [1, 1],
        currentStandingOrder: { type: 'march', destination: [2, 2], status: 'en_route' },
      },
      nearbyEnemies: [
        { unitId: 'hum-1', hexDistance: 2, inRangedRange: false, inMeleeRange: false } as UnitAssessmentResult['result']['nearbyEnemies'][0],
      ],
      threats: [{ description: 'close', severity: 'critical', sourceUnit: 'hum-1' }],
      canAttackThisTurn: [],
    } as unknown as UnitAssessmentResult['result'],
  };
  const unorderedCritical: UnitAssessmentResult = {
    unitId: 'opp-gap-crit',
    result: {
      status: 'ok',
      unit: {
        unitId: 'opp-gap-crit',
        type: 'armor',
        position: [3, 3],
        currentStandingOrder: null,
      },
      nearbyEnemies: [
        { unitId: 'hum-1', hexDistance: 2, inRangedRange: false, inMeleeRange: false } as UnitAssessmentResult['result']['nearbyEnemies'][0],
      ],
      threats: [{ description: 'close', severity: 'critical', sourceUnit: 'hum-1' }],
      canAttackThisTurn: [],
    } as unknown as UnitAssessmentResult['result'],
  };
  const state: GameStateSnapshot = {
    ...fixtureState,
    turnNumber: 12,
    units: [
      { id: 'opp-so-crit', player: 'opponent', unitType: 'armor', h3Index: fixtureOriginH3 },
      { id: 'opp-gap-crit', player: 'opponent', unitType: 'armor', h3Index: fixtureOriginH3 },
      { id: 'hum-1', player: 'human', unitType: 'infantry', h3Index: fixtureNeighborH3 },
    ],
  };
  const healthyOnly = buildStrategicNarrative(state, [healthyCritical], true);
  assert.ok(
    !healthyOnly.includes('require immediate attention'),
    `healthy standing orders must not demand immediate attention: ${healthyOnly}`
  );
  assert.ok(
    !healthyOnly.includes('air strikes'),
    `no-air strategic narrative must not name air strikes: ${healthyOnly}`
  );
  const withGap = buildStrategicNarrative(state, [healthyCritical, unorderedCritical], true);
  assert.ok(
    withGap.includes('1 unit(s) face a critical threat and require immediate attention'),
    `unordered critical unit still needs the attention sentence: ${withGap}`
  );
  const soOff = buildStrategicNarrative(state, [healthyCritical], false);
  assert.ok(
    soOff.includes('1 unit(s) face a critical threat and require immediate attention'),
    `standing-orders-off still reports all critical threats: ${soOff}`
  );
}

/**
 * A unit that can close to melee this turn is a worklist row even when a healthy march is already assigned.
 *
 * Purpose: Turn 18 marked CF/EC armor Action needed = no while Best Options listed move/melee onto the naval at CQ,
 * because a healthy FK march hid the this-turn contact. The model left them marching away.
 * When to use: After edits to `needsAction` / `canCloseThisTurn`.
 * Expected outcome: Action needed yes, not quiet; unit appears in Attention Flags as a critical threat.
 * Exceptions: None.
 */
function testUnitThatCanCloseThisTurnIsNotHiddenByHealthyMarch(): void {
  const assessments: UnitAssessmentResult[] = [
    {
      unitId: 'opp-closer',
      result: {
        status: 'ok',
        unit: {
          unitId: 'opp-closer',
          type: 'armor',
          position: [1, 1],
          currentStandingOrder: { orderType: 'march', status: 'en_route' },
        },
        nearbyEnemies: [
          {
            unitId: 'hum-naval-1',
            hexDistance: 2,
            estimatedTurnsToReach: 1,
            inRangedRange: false,
            inMeleeRange: false,
          } as UnitAssessmentResult['result']['nearbyEnemies'][0],
        ],
        threats: [{ description: 'under naval fire', severity: 'critical', sourceUnit: 'hum-naval-1' }],
        canAttackThisTurn: [],
      } as unknown as UnitAssessmentResult['result'],
    },
  ];
  const table = buildUnitStatusTable(assessments, { mode: 'strategic' as const }, true);
  const row = table.split('\n').find((l) => l.includes('opp-closer'));
  assert.ok(row && row.includes('| yes |'), `this-turn closer must read Action needed yes: ${row}`);
  assert.ok(row && !row.includes('quiet'), `this-turn closer must not be marked quiet: ${row}`);
  const flags = buildAttentionFlags(assessments, 'strategic', true);
  assert.ok(flags.includes('opp-closer'), 'this-turn closer belongs in Attention Flags');
  assert.ok(flags.includes('critical threat'), 'closer is listed as a critical threat, not only as an armed unit');
}

/**
 * Attention Flags keep the armed-units aggregate when critical closers would otherwise fill the five-bullet cap.
 *
 * Purpose: Per-unit critical bullets used to consume the cap and hide the legal-attack worklist.
 * When to use: After edits to `buildAttentionFlags` ranking or the reserved armed slot.
 * Expected outcome: Five bullets; armed aggregate present; at least one this-turn closer named.
 * Exceptions: None.
 */
function testAttentionFlagsReserveArmedSlotWhenClosersFillCap(): void {
  const assessments: UnitAssessmentResult[] = [];
  for (let i = 0; i < 5; i++) {
    assessments.push({
      unitId: `opp-closer-${i}`,
      result: {
        status: 'ok',
        unit: {
          unitId: `opp-closer-${i}`,
          type: 'armor',
          position: [i, i],
          currentStandingOrder: { orderType: 'march', status: 'en_route' },
        },
        nearbyEnemies: [
          {
            unitId: 'hum-1',
            hexDistance: 2,
            estimatedTurnsToReach: 1,
            inRangedRange: false,
            inMeleeRange: false,
          } as UnitAssessmentResult['result']['nearbyEnemies'][0],
        ],
        threats: [{ description: 'close', severity: 'critical', sourceUnit: 'hum-1' }],
        canAttackThisTurn: [],
      } as unknown as UnitAssessmentResult['result'],
    });
  }
  assessments.push({
    unitId: 'opp-shooter',
    result: {
      status: 'ok',
      unit: {
        unitId: 'opp-shooter',
        type: 'naval',
        position: [9, 9],
        currentStandingOrder: { orderType: 'defend', status: 'holding' },
      },
      nearbyEnemies: [
        {
          unitId: 'hum-1',
          hexDistance: 2,
          estimatedTurnsToReach: 1,
          inRangedRange: true,
          inMeleeRange: false,
        } as UnitAssessmentResult['result']['nearbyEnemies'][0],
      ],
      threats: [{ description: 'in range', severity: 'critical', sourceUnit: 'hum-1' }],
      canAttackThisTurn: [{ unitId: 'hum-1', attackType: 'ranged', reason: '' }],
    } as unknown as UnitAssessmentResult['result'],
  });
  const flags = buildAttentionFlags(assessments, 'strategic', true);
  const bullets = flags.split('\n').filter((l) => l.startsWith('- '));
  assert.equal(bullets.length, 5, `expected 5 attention bullets, got ${bullets.length}: ${flags}`);
  assert.equal(
    bullets.filter((b) => b.includes('legal attack')).length,
    1,
    'armed-units aggregate must keep one slot when closers would fill the cap'
  );
  assert.ok(flags.includes('opp-shooter'), 'shooter is named in the armed aggregate');
  const threatBullets = bullets.filter((b) => !b.includes('legal attack'));
  assert.ok(
    threatBullets.every((b) => !b.includes('opp-shooter')),
    'shooter must not also occupy a per-unit closer slot'
  );
  assert.ok(
    [0, 1, 2, 3, 4].some((i) => flags.includes(`opp-closer-${i}`)),
    'at least one this-turn closer is named'
  );
}

/**
 * A healthy march two turns from contact is not a this-turn closer.
 *
 * Purpose: Action needed = yes is only for `estimatedTurnsToReach` at most one. Distant critical
 * threats with a working order must stay off the worklist.
 * When to use: After edits to `canCloseThisTurn` / `needsAction`.
 * Expected outcome: Action needed no; Attention Flags omit the unit.
 * Exceptions: None.
 */
function testHealthyMarchTwoTurnsOutStaysOffWorklist(): void {
  const assessments: UnitAssessmentResult[] = [
    {
      unitId: 'opp-far',
      result: {
        status: 'ok',
        unit: {
          unitId: 'opp-far',
          type: 'armor',
          position: [1, 1],
          currentStandingOrder: { orderType: 'march', status: 'en_route' },
        },
        nearbyEnemies: [
          {
            unitId: 'hum-naval-1',
            hexDistance: 4,
            estimatedTurnsToReach: 2,
            inRangedRange: false,
            inMeleeRange: false,
          } as UnitAssessmentResult['result']['nearbyEnemies'][0],
        ],
        threats: [{ description: 'under naval fire', severity: 'critical', sourceUnit: 'hum-naval-1' }],
        canAttackThisTurn: [],
      } as unknown as UnitAssessmentResult['result'],
    },
  ];
  const table = buildUnitStatusTable(assessments, { mode: 'strategic' as const }, true);
  const row = table.split('\n').find((l) => l.includes('opp-far'));
  assert.ok(row && row.includes('| no |'), `two-turn march must read Action needed no: ${row}`);
  const flags = buildAttentionFlags(assessments, 'strategic', true);
  assert.ok(!flags.includes('opp-far'), `two-turn closer must stay off Attention Flags: ${flags}`);
}

/**
 * Idle air holding on defend is coaching-only, not an Action needed row.
 *
 * Purpose: Turn 18 had twenty-two air units on defend; marking them all yes would flood the worklist.
 * Ferry toward the fight lives in coaching, not in the Action needed column.
 * When to use: After edits to `needsAction` for air / missing `estimatedTurnsToReach`.
 * Expected outcome: Action needed no even with a moderate distant threat and a healthy defend order.
 * Exceptions: None.
 */
function testIdleDefendAirIsNotActionNeeded(): void {
  const assessments: UnitAssessmentResult[] = [
    {
      unitId: 'opp-air-idle',
      result: {
        status: 'ok',
        unit: {
          unitId: 'opp-air-idle',
          type: 'air',
          position: [1, 1],
          currentStandingOrder: { orderType: 'defend', status: 'holding' },
        },
        nearbyEnemies: [
          {
            unitId: 'hum-1',
            hexDistance: 6,
            estimatedTurnsToReach: null,
            inRangedRange: false,
            inMeleeRange: false,
          } as UnitAssessmentResult['result']['nearbyEnemies'][0],
        ],
        threats: [{ description: 'distant', severity: 'moderate', sourceUnit: 'hum-1' }],
        canAttackThisTurn: [],
      } as unknown as UnitAssessmentResult['result'],
    },
  ];
  const table = buildUnitStatusTable(assessments, { mode: 'strategic' as const }, true);
  const row = table.split('\n').find((l) => l.includes('opp-air-idle'));
  assert.ok(row && row.includes('| no |'), `idle defend air must read Action needed no: ${row}`);
  const flags = buildAttentionFlags(assessments, 'strategic', true);
  assert.ok(!flags.includes('opp-air-idle'), `idle defend air must stay off Attention Flags: ${flags}`);
}

/**
 * Hop-adjacent units are this-turn closers even when fog path ETA is two turns.
 *
 * Purpose: Turn 18 listed infantry-555 as Action needed no (path ETA 2) while Best Options offered this-turn
 * move/melee onto CQ because hops fit the movement budget.
 * When to use: After edits to `canCloseThisTurn` gridDistance handling.
 * Expected outcome: Action needed yes; unit appears in Attention Flags.
 * Exceptions: None.
 */
function testHopCloseIsActionNeededWhenPathEtaIsLonger(): void {
  const assessments: UnitAssessmentResult[] = [
    {
      unitId: 'opp-inf-hop-close',
      result: {
        status: 'ok',
        unit: {
          unitId: 'opp-inf-hop-close',
          type: 'infantry',
          position: [1, 1],
          currentStandingOrder: { orderType: 'march', status: 'en_route' },
        },
        nearbyEnemies: [
          {
            unitId: 'hum-naval-1',
            hexDistance: 2,
            gridDistance: 1,
            estimatedTurnsToReach: 2,
            inRangedRange: false,
            inMeleeRange: false,
          } as UnitAssessmentResult['result']['nearbyEnemies'][0],
        ],
        threats: [{ description: 'under naval fire', severity: 'critical', sourceUnit: 'hum-naval-1' }],
        canAttackThisTurn: [],
      } as unknown as UnitAssessmentResult['result'],
    },
  ];
  const table = buildUnitStatusTable(assessments, { mode: 'strategic' as const }, true);
  const row = table.split('\n').find((l) => l.includes('opp-inf-hop-close'));
  assert.ok(row && row.includes('| yes |'), `hop-adjacent infantry must read Action needed yes: ${row}`);
  const flags = buildAttentionFlags(assessments, 'strategic', true);
  assert.ok(flags.includes('opp-inf-hop-close'), 'hop-adjacent closer belongs in Attention Flags');
}

/**
 * A healthy march that recedes from the nearest enemy is a worklist row.
 *
 * Purpose: Turn 18 left in-range naval units on MARCH FU after firing because Attention was no.
 * When to use: After edits to `standingMarchRecedesFromNearestEnemy` / Attention Flags.
 * Expected outcome: Action needed yes; Attention Flags mention receding.
 * Exceptions: None.
 */
function testRecedingMarchIsActionNeeded(): void {
  const origin = latLngToCell(40, 0, 1);
  const ring1 = gridDisk(origin, 1).filter((h) => h !== origin);
  const neighbor = ring1[0]!;
  const far = gridDisk(origin, 2).find((h) => h !== origin && !ring1.includes(h));
  assert.ok(far, 'expected a two-hop dest');
  const unitLl = cellToLatLng(neighbor);
  const enemyLl = cellToLatLng(origin);
  const farLl = cellToLatLng(far!);
  const assessments: UnitAssessmentResult[] = [
    {
      unitId: 'opp-naval-recede',
      result: {
        status: 'ok',
        unit: {
          unitId: 'opp-naval-recede',
          type: 'naval',
          position: [unitLl[0], unitLl[1]],
          currentStandingOrder: {
            type: 'march',
            status: 'en_route',
            destination: [farLl[0], farLl[1]],
          },
        },
        nearbyEnemies: [
          {
            unitId: 'hum-naval-1',
            hexDistance: 3,
            estimatedTurnsToReach: 3,
            position: [enemyLl[0], enemyLl[1]],
            inRangedRange: false,
            inMeleeRange: false,
          } as UnitAssessmentResult['result']['nearbyEnemies'][0],
        ],
        threats: [{ description: 'nearby', severity: 'moderate', sourceUnit: 'hum-naval-1' }],
        canAttackThisTurn: [],
      } as unknown as UnitAssessmentResult['result'],
    },
  ];
  const table = buildUnitStatusTable(assessments, { mode: 'strategic' as const }, true);
  const row = table.split('\n').find((l) => l.includes('opp-naval-recede'));
  assert.ok(row && row.includes('| yes |'), `receding march must read Action needed yes: ${row}`);
  const flags = buildAttentionFlags(assessments, 'strategic', true);
  assert.ok(flags.includes('opp-naval-recede'), 'receding march belongs in Attention Flags');
  assert.ok(flags.includes('recedes'), `Attention Flags must name the receding march: ${flags}`);
}

/**
 * Verifies the grid-hops honesty line appears only for fog-off strategic (res1) snapshots.
 *
 * Purpose: Fog-off Unit Status distances are grid hops; the model must be told they are not march paths.
 * When to use: After changing formatBriefing omniscient copy.
 * Expected outcome: Line present for fog false + res1; absent for fog true + res1, and for the shared res3 fixture even with fog false.
 * Exceptions: None.
 */
function testFormatBriefingGridProximityHonestyLine(): void {
  const res1 = getOrderedHexList()[0]!;
  const res1State: GameStateSnapshot = {
    ...fixtureState,
    fogOfWarEnabled: false,
    hexes: [{ h3Index: res1, terrain: 'land', terrainKind: 'plains' }],
    units: fixtureState.units.map((u) => ({ ...u, h3Index: res1 })),
  };
  const fogOffRes1 = formatBriefing(res1State, precomputed, '', '');
  assert.ok(
    fogOffRes1.includes(
      `## Unit Status and Threats\n\n${OMNISCIENT_GRID_PROXIMITY_BRIEFING_LINE}\n\n| Unit ID | Type | Hex |`
    ),
    'fog-off res1 briefing places grid-hops sentence immediately after Unit Status heading, then the table'
  );
  assert.ok(
    !fogOffRes1.includes(buildIntelStalenessRule()),
    'fog-off res1 briefing omits the intel staleness sentence'
  );

  const fogOnRes1: GameStateSnapshot = { ...res1State, fogOfWarEnabled: true };
  const fogOnOut = formatBriefing(fogOnRes1, precomputed, '', '');
  assert.ok(
    !fogOnOut.includes(OMNISCIENT_GRID_PROXIMITY_BRIEFING_LINE),
    'fog-on res1 briefing omits grid-hops sentence'
  );
  assert.ok(
    fogOnOut.includes(FOG_PATH_DISTANCE_BRIEFING_LINE),
    'fog-on res1 briefing includes the path-vs-Best-Options sentence'
  );
  assert.ok(
    fogOnOut.includes(buildIntelStalenessRule()),
    'fog-on res1 briefing includes the intel staleness sentence'
  );

  const fogOffRes3: GameStateSnapshot = { ...fixtureState, fogOfWarEnabled: false };
  const fogOffRes3Out = formatBriefing(fogOffRes3, precomputed, '', '');
  assert.ok(
    !fogOffRes3Out.includes(OMNISCIENT_GRID_PROXIMITY_BRIEFING_LINE),
    'fog-off non-res1 fixture omits grid-hops sentence'
  );
  assert.ok(
    !fogOffRes3Out.includes(FOG_PATH_DISTANCE_BRIEFING_LINE),
    'fog-off non-res1 fixture omits the path-vs-Best-Options sentence'
  );
  const fogOnRes3: GameStateSnapshot = { ...fixtureState, fogOfWarEnabled: true };
  const fogOnRes3Out = formatBriefing(fogOnRes3, precomputed, '', '');
  assert.ok(
    !fogOnRes3Out.includes(FOG_PATH_DISTANCE_BRIEFING_LINE),
    'fog-on non-res1 fixture omits the path-vs-Best-Options sentence'
  );
  assert.ok(
    fogOnRes3Out.includes(buildIntelStalenessRule()),
    'fog-on non-res1 fixture still includes the intel staleness sentence'
  );
  assert.ok(
    !formatBriefing(fixtureState, precomputed, '', '').includes(OMNISCIENT_GRID_PROXIMITY_BRIEFING_LINE),
    'shared fixture without fog flag omits grid-hops sentence'
  );
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
  { name: 'formatBriefing production section follows tool flag', fn: testFormatBriefingProductionSectionFollowsToolFlag },
  { name: 'formatBriefing unit table rows', fn: testFormatBriefingUnitTableRows },
  { name: 'formatBriefing possible actions armor ranged', fn: testFormatBriefingPossibleActionsArmorRanged },
  {
    name: 'unit status and attention ignore low threats when standing orders inactive',
    fn: testUnitStatusAndAttentionIgnoreLowThreatsWhenStandingOrdersInactive,
  },
  {
    name: 'unit with a legal shot is never quiet',
    fn: testUnitWithLegalShotIsNeverQuiet,
  },
  {
    name: 'attention flags severity sort and cap five',
    fn: testAttentionFlagsSeveritySortAndCapFive,
  },
  {
    name: 'attention flags period noun follows coordinate mode',
    fn: testAttentionFlagsPeriodNounFollowsCoordinateMode,
  },
  {
    name: 'strategic narrative critical sentence matches needsAction',
    fn: testStrategicNarrativeCriticalSentenceMatchesNeedsAction,
  },
  {
    name: 'unit that can close this turn is not hidden by a healthy march',
    fn: testUnitThatCanCloseThisTurnIsNotHiddenByHealthyMarch,
  },
  {
    name: 'attention flags reserve armed slot when closers fill cap',
    fn: testAttentionFlagsReserveArmedSlotWhenClosersFillCap,
  },
  {
    name: 'healthy march two turns out stays off the worklist',
    fn: testHealthyMarchTwoTurnsOutStaysOffWorklist,
  },
  {
    name: 'idle defend air is not Action needed',
    fn: testIdleDefendAirIsNotActionNeeded,
  },
  {
    name: 'hop close is Action needed when path ETA is longer',
    fn: testHopCloseIsActionNeededWhenPathEtaIsLonger,
  },
  {
    name: 'receding march is Action needed',
    fn: testRecedingMarchIsActionNeeded,
  },
  {
    name: 'formatBriefing grid proximity honesty line',
    fn: testFormatBriefingGridProximityHonestyLine,
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
