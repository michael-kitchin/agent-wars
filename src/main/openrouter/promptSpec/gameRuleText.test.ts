/**
 * Contract tests for engine-fact sentences both consultation modes share.
 * Run: `npm run build:main` then `node dist/main/openrouter/promptSpec/gameRuleText.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'fs';
import * as path from 'path';
import { CASUALTY_PRIORITY_ORDER, getMovementBudget } from '../../combatConstants';
import { STALE_INTEL_TURNS } from '../../game-db/fogState';
import { AIR_STRIKE_RANGE_HEXES, MOVEMENT_RANGE_BY_UNIT_TYPE, RANGED_RANGE_BY_UNIT_TYPE } from '../../../shared/tacticalRanges';
import { UNIT_COST_BY_TYPE } from '../../productionRules';
import {
  buildAirEmploymentRule,
  buildCasualtySortRule,
  buildCombatRulesParagraph,
  buildDestinationOccupancyRule,
  buildHoldFireRule,
  buildIntelStalenessRule,
  buildMovementBudgetRule,
  buildProductionCostRulesLine,
  buildRangedReachRule,
  buildResolutionOrderRule,
  type GameRuleTextGates,
} from './gameRuleText';

/**
 * Default gates for composing the combat paragraph in tests.
 *
 * Purpose: Each case only overrides the field under test.
 * When to use: `buildCombatRulesParagraph` cases in this file.
 * Expected outcome: A complete gate object.
 * Exceptions: None.
 */
function gates(overrides: Partial<GameRuleTextGates> = {}): GameRuleTextGates {
  return {
    coordinateMode: 'strategic',
    hasAirUnits: false,
    hasNavalUnits: false,
    ordersEnabled: false,
    ...overrides,
  };
}

/**
 * Returns whether `stages` appear in `text` in that order, allowing other words between them.
 *
 * Purpose: The resolution-order sentence must name every stage in engine order without requiring a frozen wording.
 * When to use: After `buildResolutionOrderRule`.
 * Expected outcome: True only when each stage is found after the previous one.
 * Exceptions: None.
 */
function namesStagesInOrder(text: string, stages: readonly string[]): boolean {
  let from = 0;
  for (const stage of stages) {
    const at = text.toLowerCase().indexOf(stage.toLowerCase(), from);
    if (at < 0) return false;
    from = at + stage.length;
  }
  return true;
}

const STRATEGIC_RESOLUTION_STAGES = [
  'embark',
  'air strikes',
  'ranged',
  'movement',
  'cargo sync',
  'ferry',
  'melee',
] as const;
const TACTICAL_RESOLUTION_STAGES = [
  'embark',
  'air strikes',
  'ranged',
  'movement',
  'ferry',
  'cargo sync',
  'melee',
] as const;

test('buildResolutionOrderRule names every resolution stage in engine order', () => {
  const strategic = buildResolutionOrderRule('strategic');
  const tactical = buildResolutionOrderRule('tactical');
  assert.ok(
    namesStagesInOrder(strategic, STRATEGIC_RESOLUTION_STAGES),
    `strategic order missing a stage: ${strategic}`
  );
  assert.ok(
    namesStagesInOrder(tactical, TACTICAL_RESOLUTION_STAGES),
    `tactical order missing a stage: ${tactical}`
  );
  assert.ok(tactical.toLowerCase().includes('beat'), 'tactical form names the beat');
  assert.ok(
    /no production/i.test(tactical),
    'tactical form states there is no production step in a beat'
  );
  assert.ok(!/no production/i.test(strategic), 'strategic form does not deny production');
});

test('buildCasualtySortRule uses lowest defence and the engine type order', () => {
  const text = buildCasualtySortRule();
  assert.match(text, /lowest[- ]defen[cs]e/i);
  const typeOrder = CASUALTY_PRIORITY_ORDER.join(', ');
  assert.ok(text.includes(typeOrder), `casualty rule must list ${typeOrder}`);
});

test('buildMovementBudgetRule quotes engine budgets and states that air never marches', () => {
  const strategic = buildMovementBudgetRule('strategic');
  assert.ok(strategic.includes(String(getMovementBudget('armor'))));
  assert.match(strategic, /air (never marches|does not march)/i);
  const tactical = buildMovementBudgetRule('tactical');
  assert.ok(tactical.includes(String(MOVEMENT_RANGE_BY_UNIT_TYPE.armor)));
  assert.match(tactical, /point/i);
});

test('buildRangedReachRule distinguishes infantry melee from tactical infantry reach', () => {
  const tactical = buildRangedReachRule('tactical');
  assert.ok(tactical.includes(String(RANGED_RANGE_BY_UNIT_TYPE.infantry)));
  const strategic = buildRangedReachRule('strategic');
  assert.match(strategic, /infantry is melee-only|Infantry has no strategic ranged/i);
});

test('buildDestinationOccupancyRule forbids friendly stacks and allows enemy move/melee contact', () => {
  const text = buildDestinationOccupancyRule();
  assert.match(text, /friendly/i);
  assert.match(text, /move\/melee/i);
  assert.doesNotMatch(text, /not by moving onto the occupied one/);
});

test('buildHoldFireRule distinguishes the order from simply omitting an attack', () => {
  const text = buildHoldFireRule();
  assert.match(text, /suppresses automatic engagement/i);
  assert.match(text, /until replaced/i);
  assert.match(text, /leaving a unit without an attack is not the same/i);
});

test('buildIntelStalenessRule quotes the engine retention window', () => {
  const text = buildIntelStalenessRule();
  assert.ok(text.includes(String(STALE_INTEL_TURNS)));
});

test('buildCombatRulesParagraph keeps strike radius out of tactical and MP wording out of strategic', () => {
  const tactical = buildCombatRulesParagraph(
    gates({ coordinateMode: 'tactical', hasAirUnits: true, ordersEnabled: true })
  );
  assert.ok(!tactical.includes(`strike radius of ${AIR_STRIKE_RANGE_HEXES}`));
  assert.match(tactical, /anywhere in the battle/i);
  const strategic = buildCombatRulesParagraph(
    gates({ coordinateMode: 'strategic', hasAirUnits: true, ordersEnabled: true })
  );
  assert.ok(!/movement[- ]points?/i.test(strategic));
  assert.ok(strategic.includes(buildAirEmploymentRule(gates({ coordinateMode: 'strategic', hasAirUnits: true }))));
  assert.ok(strategic.includes(buildHoldFireRule()));
  const noOrders = buildCombatRulesParagraph(gates({ ordersEnabled: false }));
  assert.ok(!noOrders.includes(buildHoldFireRule()));
});

test('buildProductionCostRulesLine interpolates engine costs', () => {
  const text = buildProductionCostRulesLine();
  assert.ok(text.includes(`infantry cost ${UNIT_COST_BY_TYPE.infantry}`));
  assert.ok(text.includes(`armor cost ${UNIT_COST_BY_TYPE.armor}`));
  assert.ok(text.includes(`naval cost ${UNIT_COST_BY_TYPE.naval}`));
  assert.ok(text.includes(`air cost ${UNIT_COST_BY_TYPE.air}`));
  assert.match(text, /requires airport/);
});

test('the system-prompt assembler delegates combat-rule prose to this module', () => {
  const assembler = fs.readFileSync(
    path.resolve(process.cwd(), 'src/main/openrouter/openRouterBuildSystemPrompt.ts'),
    'utf8'
  );
  assert.ok(assembler.includes('buildCombatRulesParagraph'));
  assert.ok(!assembler.includes('d6 per shot'));
  assert.ok(!assembler.includes('Hits land on the lowest-defense'));
});
