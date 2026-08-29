/**
 * Variant-matrix contract tests for fog, tool groups, roster, scenarios, game size, and consultation policy.
 * Run: `npm run build:main` then `node dist/main/openRouter/promptSpec/variantConformance.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { latLngToCell } from 'h3-js';
import type { GameStateSnapshot } from '../../gameDb';
import type { UnitAssessmentResult } from '../../precomputation';
import { buildAttentionFlags, formatBriefing } from '../../briefingFormatter';
import { STALE_INTEL_TURNS } from '../../gameDb/fogState';
import { getOrderedHexList } from '../../mapData';
import { PRODUCTION_EMPTY_QUEUES_SENTENCE, buildEmptyProductionQueuesSection } from '../briefingSections';
import { buildAirOperationsBriefingBlock } from '../briefingSectionsAirOps';
import { buildSealiftBriefingBlock } from '../briefingSectionsSealift';
import { buildOpeningUserMessage, type OpeningMessageGates } from './consultationText';
import { buildCoachingBullets, type CoachingGates } from './coachingText';
import {
  envelopeFieldsForGates,
  legalOrderActionsForMode,
  type EnvelopeGates,
} from './envelopeContract';
import { buildIntelStalenessRule } from './gameRuleText';
import {
  SECTION_TITLE_AIR_OPERATIONS_STATUS,
  SECTION_TITLE_BEST_OPTIONS_THIS_TURN,
  SECTION_TITLE_NAVAL_TRANSPORT_STATUS,
  SECTION_TITLE_PRODUCTION_STATUS,
  SECTION_TITLE_SCENARIO_OBJECTIVE,
  SECTION_TITLE_STANDING_ORDER_STATUS,
  SECTION_TITLE_STRATEGIC_MEMORY,
} from './sectionHeadings';
import { buildHumanUnitsPromptLine } from '../promptText';
import {
  GENERIC_OBJECTIVE_SENTENCE,
  buildRegionVsRegionScenarioObjectiveBlock,
  buildWinConditionReminderClause,
} from '../scenarioGoals';
import { REQUEST_ORDERS_MAX_TOOL_ROUNDS, buildToolBudgetExceededWarning } from '../requestOrdersFlowSupport';
import {
  FOG_PATH_DISTANCE_BRIEFING_LINE,
  OMNISCIENT_GRID_PROXIMITY_BRIEFING_LINE,
} from '../../tools/assessUnitProximity';
import { GAME_SIZES, getMaxUnitsPerType, parseGameSize } from '../../../shared/gameSize';

/**
 * Fully enabled strategic coaching gates used as the baseline for presence and absence assertions.
 *
 * Purpose: Each case flips one flag off this object.
 * When to use: Tool-group and roster cases in this file.
 * Expected outcome: A complete `CoachingGates` value.
 * Exceptions: None.
 */
function strategicCoaching(overrides: Partial<CoachingGates> = {}): CoachingGates {
  return {
    coordinateMode: 'strategic',
    planningEnabled: true,
    ordersEnabled: true,
    memoryEnabled: true,
    productionEnabled: true,
    hasAirUnits: true,
    hasNavalUnits: true,
    hasBestOptionsTable: true,
    homeRegionsOverlap: true,
    hasObservedEnemy: true,
    includeScenarioWinPaths: true,
    ...overrides,
  };
}

/**
 * Fully enabled strategic envelope gates used as the baseline for tail presence.
 *
 * Purpose: Roster and tool-group cases must drop tails together with coaching.
 * When to use: Envelope assertions in this file.
 * Expected outcome: A complete `EnvelopeGates` value.
 * Exceptions: None.
 */
function strategicEnvelope(overrides: Partial<EnvelopeGates> = {}): EnvelopeGates {
  return {
    coordinateMode: 'strategic',
    includeAirActions: true,
    includeMemoryUpdates: true,
    includeProductionOrders: true,
    includeStandingOrderActions: true,
    ...overrides,
  };
}

/**
 * Fully enabled strategic opening-message gates.
 *
 * Purpose: User-message assertions need the same flags as the envelope.
 * When to use: Opening-message cases in this file.
 * Expected outcome: A complete `OpeningMessageGates` value.
 * Exceptions: None.
 */
function strategicOpening(overrides: Partial<OpeningMessageGates> = {}): OpeningMessageGates {
  return {
    coordinateMode: 'strategic',
    planningEnabled: true,
    ordersEnabled: true,
    memoryEnabled: true,
    productionEnabled: true,
    fallbackMovementEnabled: false,
    hasBriefing: true,
    hasAirUnits: true,
    hasBestOptionsTable: true,
    ...overrides,
  };
}

/**
 * Minimal snapshot for air/naval section builders.
 *
 * Purpose: Those builders inspect only roster, hex list, and turn metadata.
 * When to use: Roster empty-form cases.
 * Expected outcome: A structurally valid `GameStateSnapshot`.
 * Exceptions: None.
 */
function rosterState(units: GameStateSnapshot['units']): GameStateSnapshot {
  const hex = units[0]?.h3Index ?? '810ebffffffffff';
  return {
    hexes: [{ h3Index: hex, terrain: 'land', terrainKind: 'plains' }],
    units,
    phase: 'planning',
    turnNumber: 1,
    pendingOrders: [],
  };
}

test('fog: hop-distance caveat only with fog off at strategic resolution; staleness only with fog on', () => {
  const res1 = getOrderedHexList()[0]!;
  const origin = latLngToCell(0, 0, 3);
  const assessments: UnitAssessmentResult[] = [
    {
      unitId: 'opponent-armor-1',
      result: {
        status: 'ok',
        unit: { unitId: 'opponent-armor-1', type: 'armor', position: [0, 0], currentStandingOrder: null },
        nearbyEnemies: [{ unitId: 'human-inf-1', hexDistance: 1, inRangedRange: true, inMeleeRange: true }],
        threats: [],
        canAttackThisTurn: [],
      } as unknown as UnitAssessmentResult['result'],
    },
  ];
  const precomputed = { unitAssessments: assessments, hexAssessments: [] };
  const base: GameStateSnapshot = {
    hexes: [{ h3Index: res1, terrain: 'land', terrainKind: 'plains' }],
    units: [
      { id: 'opponent-armor-1', player: 'opponent', unitType: 'armor', h3Index: res1 },
      { id: 'human-inf-1', player: 'human', unitType: 'infantry', h3Index: res1 },
    ],
    phase: 'planning',
    turnNumber: 2,
    pendingOrders: [],
  };
  const fogOff = formatBriefing({ ...base, fogOfWarEnabled: false }, precomputed, '', '');
  const fogOn = formatBriefing({ ...base, fogOfWarEnabled: true }, precomputed, '', '');
  assert.ok(fogOff.includes(OMNISCIENT_GRID_PROXIMITY_BRIEFING_LINE));
  assert.ok(!fogOff.includes(buildIntelStalenessRule()));
  assert.ok(fogOn.includes(buildIntelStalenessRule()));
  assert.ok(fogOn.includes(String(STALE_INTEL_TURNS)));
  assert.ok(fogOn.includes(FOG_PATH_DISTANCE_BRIEFING_LINE));
  assert.ok(!fogOn.includes(OMNISCIENT_GRID_PROXIMITY_BRIEFING_LINE));

  const res3State: GameStateSnapshot = {
    ...base,
    fogOfWarEnabled: false,
    hexes: [{ h3Index: origin, terrain: 'land', terrainKind: 'plains' }],
    units: base.units.map((unit) => ({ ...unit, h3Index: origin })),
  };
  const fogOffRes3 = formatBriefing(res3State, precomputed, '', '');
  assert.ok(!fogOffRes3.includes(OMNISCIENT_GRID_PROXIMITY_BRIEFING_LINE));
  const fogOnRes3 = formatBriefing({ ...res3State, fogOfWarEnabled: true }, precomputed, '', '');
  assert.ok(!fogOnRes3.includes(FOG_PATH_DISTANCE_BRIEFING_LINE));
});

test('fog: tactical coaching contains neither hop caveat nor staleness wording', () => {
  const tactical = buildCoachingBullets({
    ...strategicCoaching(),
    coordinateMode: 'tactical',
    ordersEnabled: false,
    memoryEnabled: false,
    productionEnabled: false,
    includeScenarioWinPaths: false,
    homeRegionsOverlap: false,
  }).join('\n');
  assert.doesNotMatch(tactical, /grid hops/i);
  assert.doesNotMatch(tactical, /dropped rather than shown as old/i);
  assert.doesNotMatch(tactical, /last-known enemy position/i);
});

test('tool groups: memory, production, and standing orders disappear together', () => {
  const memoryOff = buildCoachingBullets(strategicCoaching({ memoryEnabled: false })).join('\n');
  assert.doesNotMatch(memoryOff, /Do not persist enemy positions/);
  assert.ok(!envelopeFieldsForGates(strategicEnvelope({ includeMemoryUpdates: false })).includes('memoryUpdates'));
  const memoryOnOpening = buildOpeningUserMessage(strategicOpening({ memoryEnabled: true }));
  const memoryOffOpening = buildOpeningUserMessage(strategicOpening({ memoryEnabled: false }));
  assert.ok(memoryOnOpening.includes('"memoryUpdates"'));
  assert.ok(!memoryOffOpening.includes('"memoryUpdates"'));

  const productionOff = buildCoachingBullets(strategicCoaching({ productionEnabled: false })).join('\n');
  assert.doesNotMatch(productionOff, /queue is empty, queue something/);
  assert.ok(!envelopeFieldsForGates(strategicEnvelope({ includeProductionOrders: false })).includes('productionOrders'));
  const productionOffOpening = buildOpeningUserMessage(strategicOpening({ productionEnabled: false }));
  assert.ok(!productionOffOpening.includes('"productionOrders"'));

  const ordersOff = buildCoachingBullets(strategicCoaching({ ordersEnabled: false })).join('\n');
  assert.doesNotMatch(ordersOff, /Units Without Standing Orders/);
  assert.ok(!legalOrderActionsForMode('strategic', true, false).includes('assign_order'));
  assert.ok(!legalOrderActionsForMode('strategic', true, false).includes('cancel_order'));
});

test('roster: no air omits the section, envelope tails, and air coaching', () => {
  const state = rosterState([{ id: 'opponent-armor-1', player: 'opponent', unitType: 'armor', h3Index: '810ebffffffffff' }]);
  assert.equal(buildAirOperationsBriefingBlock(state, (h3) => h3, 'strategic'), '');
  assert.equal(buildAirOperationsBriefingBlock(state, (h3) => h3, 'tactical'), '');
  const fields = envelopeFieldsForGates(strategicEnvelope({ includeAirActions: false }));
  assert.ok(!fields.includes('airStrikes'));
  assert.ok(!fields.includes('ferryOrders'));
  const coaching = buildCoachingBullets(strategicCoaching({ hasAirUnits: false })).join('\n');
  assert.doesNotMatch(coaching, /toward the fighting/i);
  assert.doesNotMatch(coaching, /ferryOrders/);
  assert.doesNotMatch(coaching, /or air strike/);
  const opening = buildOpeningUserMessage(strategicOpening({ hasAirUnits: false }));
  assert.ok(!opening.includes('"airStrikes"'));
  assert.ok(!opening.includes('"ferryOrders"'));
});

test('roster: no naval omits the section and sealift actions', () => {
  const state = rosterState([{ id: 'opponent-armor-1', player: 'opponent', unitType: 'armor', h3Index: '810ebffffffffff' }]);
  assert.equal(buildSealiftBriefingBlock(state, (h3) => h3, 'strategic'), '');
  assert.equal(buildSealiftBriefingBlock(state, (h3) => h3, 'tactical'), '');
  const actions = legalOrderActionsForMode('strategic', false, true);
  assert.ok(!actions.includes('transport_move'));
  assert.ok(!actions.includes('embark'));
  assert.ok(!actions.includes('disembark'));
  const coaching = buildCoachingBullets(strategicCoaching({ hasNavalUnits: false })).join('\n');
  assert.doesNotMatch(coaching, /cannot enter land cells/i);
});

test('roster: no observed enemy uses the empty-roster phrasing and scouting coaching', () => {
  const line = buildHumanUnitsPromptLine('');
  assert.match(line, /currently observed\): none/i);
  assert.match(line, /out of view/i);
  const coaching = buildCoachingBullets(strategicCoaching({ hasObservedEnemy: false })).join('\n');
  assert.match(coaching, /move to regain contact/i);
  const withEnemy = buildCoachingBullets(strategicCoaching({ hasObservedEnemy: true })).join('\n');
  assert.doesNotMatch(withEnemy, /move to regain contact/i);
});

test('roster: no option rows omit copy-from-table wording in coaching and the opening message', () => {
  const coaching = buildCoachingBullets(strategicCoaching({ hasBestOptionsTable: false })).join('\n');
  assert.match(coaching, /no options are listed this period/i);
  assert.doesNotMatch(coaching, /Copy a Target Hex from a row listing that unit/i);
  const opening = buildOpeningUserMessage(strategicOpening({ hasBestOptionsTable: false }));
  assert.match(opening, /No options are listed this period/);
  assert.ok(!opening.includes(SECTION_TITLE_BEST_OPTIONS_THIS_TURN));
});

test('scenarios: region-versus-region keeps the objective section; absent and unrecognised ids use the generic goal', () => {
  const recognised: GameStateSnapshot = {
    ...rosterState([{ id: 'opponent-armor-1', player: 'opponent', unitType: 'armor', h3Index: '810ebffffffffff' }]),
    scenarioId: 'region_vs_region',
    aiHomeRegion: 'Eastern Europe',
    humanHomeRegion: 'Northern America',
  };
  const objective = buildRegionVsRegionScenarioObjectiveBlock(recognised);
  assert.ok(objective.includes(SECTION_TITLE_SCENARIO_OBJECTIVE));
  assert.ok(objective.includes('Scenario: region_vs_region'));
  assert.equal(buildWinConditionReminderClause({ scenarioId: 'region_vs_region' }).includes('home region'), true);

  assert.equal(buildRegionVsRegionScenarioObjectiveBlock(rosterState([])), '');
  assert.equal(buildWinConditionReminderClause({}), GENERIC_OBJECTIVE_SENTENCE);
  assert.equal(buildWinConditionReminderClause({ scenarioId: 'unknown_pack' }), GENERIC_OBJECTIVE_SENTENCE);
  const coaching = buildCoachingBullets(strategicCoaching({ includeScenarioWinPaths: false })).join('\n');
  assert.doesNotMatch(coaching, /all enemy home region hexes/i);
});

test('game size: printed caps come from getMaxUnitsPerType and unrecognised size is smallest', () => {
  const small = getMaxUnitsPerType('small');
  const medium = getMaxUnitsPerType('medium');
  const large = getMaxUnitsPerType('large');
  assert.deepEqual(getMaxUnitsPerType(parseGameSize('not-a-size')), small);
  assert.equal(medium.infantry, small.infantry * 2);
  assert.equal(large.air, small.air * 4);
  for (const size of GAME_SIZES) {
    const caps = getMaxUnitsPerType(size);
    const line = `Deployment caps (per side): infantry ${caps.infantry}, armor ${caps.armor}, naval ${caps.naval}, air ${caps.air}.`;
    assert.match(line, new RegExp(`air ${caps.air}`));
  }
  const emptyProduction = buildEmptyProductionQueuesSection();
  assert.ok(emptyProduction.includes(`# ${SECTION_TITLE_PRODUCTION_STATUS}`));
  assert.ok(emptyProduction.includes(PRODUCTION_EMPTY_QUEUES_SENTENCE));
});

test('game size: attention flags stay at five bullets and name at most twelve armed ids', () => {
  const criticals: UnitAssessmentResult[] = [];
  for (let i = 0; i < 6; i += 1) {
    criticals.push({
      unitId: `opp-crit-${i}`,
      result: {
        status: 'ok',
        unit: { unitId: `opp-crit-${i}`, type: 'armor', position: [i, i], currentStandingOrder: null },
        nearbyEnemies: [{ unitId: 'hum-1', hexDistance: 1, inRangedRange: true, inMeleeRange: true }],
        threats: [{ description: 'close', severity: 'critical', sourceUnit: 'hum-1' }],
        canAttackThisTurn: [],
      } as unknown as UnitAssessmentResult['result'],
    });
  }
  const capped = buildAttentionFlags(criticals, 'strategic', false);
  const bullets = capped.split('\n').filter((line) => line.startsWith('- '));
  assert.equal(bullets.length, 5);

  const shooters: UnitAssessmentResult[] = [];
  for (let i = 0; i < 13; i += 1) {
    shooters.push({
      unitId: `opp-shoot-${i}`,
      result: {
        status: 'ok',
        unit: { unitId: `opp-shoot-${i}`, type: 'armor', position: [i, 0], currentStandingOrder: null },
        nearbyEnemies: [{ unitId: 'hum-1', hexDistance: 1, inRangedRange: true, inMeleeRange: false }],
        threats: [],
        canAttackThisTurn: [{ unitId: 'hum-1', attackType: 'ranged', reason: '' }],
      } as unknown as UnitAssessmentResult['result'],
    });
  }
  const armed = buildAttentionFlags(shooters, 'strategic', true);
  assert.match(armed, /and 1 more marked Action needed = yes/);
  const named = [...armed.matchAll(/opp-shoot-\d+/g)].map((match) => match[0]);
  assert.ok(named.length <= 12, `armed-id list exceeded twelve: ${named.join(',')}`);
});

test('consultation policy: both modes state skipped periods issue nothing, and the warning quotes the shared round limit', () => {
  const strategic = buildCoachingBullets(strategicCoaching()).join('\n');
  const tactical = buildCoachingBullets({
    ...strategicCoaching(),
    coordinateMode: 'tactical',
    ordersEnabled: false,
    memoryEnabled: false,
    productionEnabled: false,
    includeScenarioWinPaths: false,
  }).join('\n');
  assert.match(strategic, /consulted when a subscribed event fires/i);
  assert.match(strategic, /issued nothing/i);
  assert.match(tactical, /consulted only when a subscribed event fires/i);
  assert.match(tactical, /issued nothing/i);
  const warning = buildToolBudgetExceededWarning();
  assert.ok(warning.includes(String(REQUEST_ORDERS_MAX_TOOL_ROUNDS)));
  assert.match(warning, /submitted no explicit orders/i);
});

test('headings used by omit-gates keep their contracted spelling', () => {
  assert.equal(SECTION_TITLE_STRATEGIC_MEMORY, 'Your Strategic Memory');
  assert.equal(SECTION_TITLE_PRODUCTION_STATUS, 'Production Status');
  assert.equal(SECTION_TITLE_STANDING_ORDER_STATUS, 'Standing Order Status');
  assert.equal(SECTION_TITLE_AIR_OPERATIONS_STATUS, 'Air Operations Status');
  assert.equal(SECTION_TITLE_NAVAL_TRANSPORT_STATUS, 'Naval Transport Status');
  assert.equal(SECTION_TITLE_SCENARIO_OBJECTIVE, 'Scenario Objective (Required)');
});
