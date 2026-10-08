/**
 * Contract tests for engine-fact sentences both consultation modes share.
 * Run: `npm run build:main` then `node dist/main/openRouter/promptSpec/gameRuleText.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'fs';
import * as path from 'path';
import { CASUALTY_PRIORITY_ORDER, getMovementBudget } from '../../combatConstants';
import { STALE_INTEL_TURNS } from '../../gameDb/fogState';
import { AIR_STRIKE_RANGE_HEXES, MOVEMENT_RANGE_BY_UNIT_TYPE, RANGED_RANGE_BY_UNIT_TYPE } from '../../../shared/tacticalRanges';
import {
  TACTICAL_TRANSPORT_RAIL_BUDGET_MULTIPLIER,
  TACTICAL_TRANSPORT_ROAD_BUDGET_MULTIPLIER,
} from '../../../shared/tacticalTransportLink';
import { UNIT_COST_BY_TYPE } from '../../productionRules';
import { ORIGIN_BONUS_OFF } from '../../../shared/originBonusRules';
import {
  buildAirEmploymentRule,
  buildCasualtySortRule,
  buildCombatRulesParagraph,
  buildCombatStatsLine,
  buildDestinationOccupancyRule,
  buildHoldFireRule,
  buildIntelStalenessRule,
  buildMovementBudgetRule,
  buildOriginBonusRule,
  buildProductionCostRulesLine,
  buildRangedReachRule,
  buildResolutionOrderRule,
  buildTerrainCoverRule,
  buildWeatherRule,
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
    originBonusSettings: ORIGIN_BONUS_OFF,
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

test('buildOriginBonusRule appears only when a flag applies in the mode', () => {
  const countryOnly = { originBonusEnabled: true, terrainBonusEnabled: false };
  const terrainOnly = { originBonusEnabled: false, terrainBonusEnabled: true };
  assert.equal(buildOriginBonusRule(gates()), null);
  assert.equal(buildOriginBonusRule(gates({ coordinateMode: 'tactical' })), null);
  assert.equal(buildOriginBonusRule(gates({ originBonusSettings: terrainOnly })), null);

  const strategic = buildOriginBonusRule(gates({ originBonusSettings: countryOnly }));
  assert.match(strategic ?? '', /^Origin bonus is on: a unit in a hex in the area where it was built adds 2/);
  assert.match(strategic ?? '', /Casualty order still uses the printed defense values\.$/);
  assert.doesNotMatch(strategic ?? '', /air unit qualifies/);
  const strategicAir = buildOriginBonusRule(gates({ originBonusSettings: countryOnly, hasAirUnits: true }));
  assert.match(strategicAir ?? '', /An air unit qualifies by the hex of its base/);

  assert.ok(buildCombatRulesParagraph(gates({ originBonusSettings: countryOnly })).includes(strategic ?? '\u0000'));
});

test('tactical buildOriginBonusRule notes no stacking only when both flags are on', () => {
  const tactical = (originBonusEnabled: boolean, terrainBonusEnabled: boolean) =>
    buildOriginBonusRule(
      gates({ coordinateMode: 'tactical', originBonusSettings: { originBonusEnabled, terrainBonusEnabled } })
    ) ?? '';
  assert.match(tactical(false, true), /^Terrain bonus is on: a unit on a cell/);
  assert.doesNotMatch(tactical(false, true), /do not stack/);
  assert.doesNotMatch(tactical(true, false), /do not stack/);
  assert.match(tactical(true, true), /Origin bonus is on: a unit on a cell.*Terrain bonus is on.*do not stack; the most is \+2\./);
});

test('the origin bonus sentences keep their exact wording', () => {
  assert.equal(
    buildOriginBonusRule(
      gates({ originBonusSettings: { originBonusEnabled: true, terrainBonusEnabled: false }, hasAirUnits: true })
    ),
    'Origin bonus is on: a unit in a hex in the area where it was built adds 2 to every attack or defense value it rolls there, including ranged fire, return fire, melee, and air-strike counter-fire. ' +
      'That area is its birth country in a global game and its origin area in a regional game. ' +
      'An air unit qualifies by the hex of its base, whatever it strikes. ' +
      'Casualty order still uses the printed defense values.'
  );
  assert.equal(
    buildOriginBonusRule(
      gates({
        coordinateMode: 'tactical',
        originBonusSettings: { originBonusEnabled: true, terrainBonusEnabled: true },
        hasAirUnits: true,
      })
    ),
    'Origin bonus is on: a unit on a cell in the area where it was built adds 2 to every attack or defense value it rolls there. ' +
      'That area is its birth country in a global game and its origin area in a regional game. ' +
      "Terrain bonus is on: a unit on a cell whose terrain kind matches its birth terrain kind adds 2 to every attack or defense value it rolls there; urban and rubble do not change a cell's terrain kind. " +
      'The two bonuses do not stack; the most is +2. ' +
      'An air unit qualifies by the cell of its base, whatever it strikes. ' +
      'Casualty order still uses the printed defense values.'
  );
});

test('a High origin bonus states 4, and the stacking note states the larger amount', () => {
  const strategic = buildOriginBonusRule(
    gates({ originBonusSettings: { originBonusEnabled: true, terrainBonusEnabled: false, originBonusLevel: 'high' } })
  );
  assert.match(strategic ?? '', /^Origin bonus is on: a unit in a hex in the area where it was built adds 4 to every attack/);
  const tactical = buildOriginBonusRule(
    gates({
      coordinateMode: 'tactical',
      originBonusSettings: {
        originBonusEnabled: true,
        terrainBonusEnabled: true,
        originBonusLevel: 'high',
        terrainBonusLevel: 'low',
      },
    })
  );
  assert.match(tactical ?? '', /birth terrain kind adds 2 to every attack/);
  assert.match(tactical ?? '', /The two bonuses do not stack; the most is \+4\./);
});

test('the weather sentence keeps its exact wording', () => {
  assert.equal(
    buildWeatherRule(
      gates({ originBonusSettings: { originBonusEnabled: false, terrainBonusEnabled: false, weatherBonusEnabled: true } })
    ),
    "Weather bonus is on: the month is on the turn line and every beat of a battle shares the enclosing hex's weather. " +
      'Armor strategic movement is 1 in snow or rain, and naval strategic movement is 1 in snow. ' +
      "In battle, armor's point budget is 2 in snow or rain and naval's is 2 in snow; infantry pays 2 to enter open ground in snow or rain. " +
      'Armor ranged attack is 3 lower in snow or heat, including return fire and air-strike counter-fire. ' +
      'An air strike is 3 lower once when its base or its target is snow, rain, or heat the unit lacks. ' +
      'A strategic ferry into snow is 2 hexes. ' +
      'None of these penalties applies to a unit tagged for that weather; a tag is earned by the birth hex. ' +
      'Weather does not change defense, melee, or casualty order. ' +
      'The Unit Status Weather column names the weather where that unit stands. Birth tags, when the unit has any, follow in parentheses.'
  );
});

test('the High weather sentence widens the slowing weather and deepens the penalties', () => {
  assert.equal(
    buildWeatherRule(
      gates({
        originBonusSettings: {
          originBonusEnabled: false,
          terrainBonusEnabled: false,
          weatherBonusEnabled: true,
          weatherBonusLevel: 'high',
        },
      })
    ),
    "Weather bonus is on: the month is on the turn line and every beat of a battle shares the enclosing hex's weather. " +
      'Armor strategic movement is 1 in snow, rain, or heat, and naval strategic movement is 1 in snow or rain. ' +
      "In battle, armor's point budget is 1 in snow, rain, or heat and naval's is 1 in snow or rain; infantry pays 2 to enter open ground in snow or rain. " +
      'Armor ranged attack is 5 lower in snow or heat, including return fire and air-strike counter-fire. ' +
      'An air strike is 5 lower once when its base or its target is snow, rain, or heat the unit lacks. ' +
      'A strategic ferry into snow is 2 hexes. ' +
      'None of these penalties applies to a unit tagged for that weather; a tag is earned by the birth hex. ' +
      'Weather does not change defense, melee, or casualty order. ' +
      'The Unit Status Weather column names the weather where that unit stands. Birth tags, when the unit has any, follow in parentheses.'
  );
});

test('buildMovementBudgetRule quotes engine budgets and states that air never marches', () => {
  const strategic = buildMovementBudgetRule('strategic');
  assert.ok(strategic.includes(String(getMovementBudget('armor'))));
  assert.match(strategic, /air (never marches|does not march)/i);
  assert.match(strategic, /Armor that enters a rugged, arctic, or city hex ends its move there/);
  assert.match(strategic, /A longer route continues on the next turn, and the turn count includes that halt/);
  assert.doesNotMatch(strategic, /urban or rubble/i);
  const tactical = buildMovementBudgetRule('tactical');
  assert.ok(tactical.includes(String(MOVEMENT_RANGE_BY_UNIT_TYPE.armor)));
  assert.match(tactical, /Clear of weather, the point budget is/);
  assert.doesNotMatch(tactical, /Movement this beat is a terrain-weighted/);
  assert.doesNotMatch(tactical, /\b(snow|rain|heat)\b/i);
  assert.match(tactical, /urban or rubble/i);
  assert.match(tactical, /1[- ]point|one[- ]point/i);
  assert.match(tactical, /road/i);
  assert.match(tactical, /rail/i);
  assert.match(
    tactical,
    /intact road cell costs 1\/2 point and an intact rail cell costs 1\/3 point, for every terrain, for infantry and armor\. That cell may be entered from a neighbor/
  );
  assert.match(tactical, /Entering an urban cell with no road or rail costs 1/);
  assert.match(tactical, /Rubble on a road or rail costs 1 where the unit could already enter, and does not open blocked terrain/);
  assert.doesNotMatch(tactical, /blocked terrain\. A unit may enter that cell/);
  assert.ok(tactical.includes(String(TACTICAL_TRANSPORT_ROAD_BUDGET_MULTIPLIER)));
  assert.ok(tactical.includes(String(TACTICAL_TRANSPORT_RAIL_BUDGET_MULTIPLIER)));
  assert.doesNotMatch(tactical, /unless that cell holds a friendly/i);
  assert.doesNotMatch(tactical, /Urban and rubble cells cost more/);
});

test('buildRangedReachRule distinguishes infantry melee from tactical infantry reach', () => {
  const tactical = buildRangedReachRule('tactical');
  assert.ok(tactical.includes(String(RANGED_RANGE_BY_UNIT_TYPE.infantry)));
  assert.ok(tactical.includes(String(RANGED_RANGE_BY_UNIT_TYPE.armor)));
  assert.match(tactical, /range 1|capped to 1/i);
  assert.match(tactical, /forest/i);
  assert.match(tactical, /urban/i);
  assert.match(tactical, /rubble/i);
  assert.doesNotMatch(tactical, /road|rail/i);
  assert.match(tactical, /mountain/i);
  const strategic = buildRangedReachRule('strategic');
  assert.match(strategic, /infantry is melee-only|Infantry has no strategic ranged/i);
  assert.doesNotMatch(strategic, /mountain/i);
});

test('buildDestinationOccupancyRule allows stacking in both modes', () => {
  const strategic = buildDestinationOccupancyRule('strategic');
  const tactical = buildDestinationOccupancyRule('tactical');
  assert.equal(strategic, tactical);
  assert.match(strategic, /stack/i);
  assert.doesNotMatch(strategic, /not a legal destination/i);
  assert.match(strategic, /stay-put/i);
  assert.match(strategic, /leaving this period/i);
  assert.match(strategic, /move\/melee/i);
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

test('combat stats omit the air type when the roster has no air', () => {
  const noAir = buildCombatRulesParagraph(gates({ coordinateMode: 'tactical', hasAirUnits: false }));
  assert.doesNotMatch(noAir, /air: \d+ attack/);
  assert.doesNotMatch(noAir, /strike anywhere/);
  const withAir = buildCombatRulesParagraph(gates({ coordinateMode: 'tactical', hasAirUnits: true }));
  assert.match(withAir, /air: \d+ attack/);
  assert.match(withAir, /strike anywhere/);
});

test('buildCombatRulesParagraph keeps strike radius out of tactical and MP wording out of strategic', () => {
  const tactical = buildCombatRulesParagraph(
    gates({ coordinateMode: 'tactical', hasAirUnits: true, ordersEnabled: true })
  );
  assert.ok(!tactical.includes(`strike radius of ${AIR_STRIKE_RANGE_HEXES}`));
  assert.match(tactical, /anywhere in the battle/i);
  assert.match(tactical, /Clear of weather, the point budget is/);
  assert.doesNotMatch(tactical, /\b(snow|rain|heat)\b/i);
  const weatherOn = buildCombatRulesParagraph(
    gates({
      coordinateMode: 'tactical',
      originBonusSettings: { originBonusEnabled: false, terrainBonusEnabled: false, weatherBonusEnabled: true },
    })
  );
  assert.match(weatherOn, /Clear of weather, the point budget is/);
  assert.match(weatherOn, /armor's point budget is 2 in snow or rain/);
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

test('the terrain cover sentences keep their exact wording', () => {
  assert.equal(
    buildTerrainCoverRule('strategic'),
    'Terrain cover: ranged fire at a hex whose main terrain is forest or mountain needs a roll 2 lower, or 1 lower for wetlands. ' +
      'An air strike on units in a hex whose main terrain is forest needs a roll 1 lower. ' +
      'Melee, return fire, anti-air fire, and strikes on infrastructure ignore cover. ' +
      'A city hex uses the higher of its terrain cover and city cover in each column. ' +
      'A rugged hex uses the higher of its terrain cover and rugged ground cover.'
  );
  assert.equal(
    buildTerrainCoverRule('tactical'),
    'Terrain cover: ranged fire at a forest, mountain, urban, or rubble cell needs a roll 2 lower, or 1 lower for wetlands. ' +
      'An air strike on units in a forest, urban, or rubble cell needs a roll 1 lower. ' +
      'Melee, return fire, anti-air fire, and shots at infrastructure ignore cover.'
  );
});

test('the combat paragraph does not mention a tech bonus when that option is off', () => {
  const paragraph = buildCombatRulesParagraph(gates());
  const weatherOn = buildCombatRulesParagraph(gates({
    originBonusSettings: { originBonusEnabled: false, terrainBonusEnabled: false, weatherBonusEnabled: true },
  }));
  assert.ok(!/tech bonus/i.test(paragraph));
  assert.ok(!/tech bonus/i.test(weatherOn));
  assert.equal(paragraph.includes('Origin bonus is on'), false);
  assert.ok(weatherOn.includes('Weather bonus is on'));
});

test('the combat paragraph names the tech bonus at Low and at High', () => {
  const low = buildCombatRulesParagraph(gates({
    originBonusSettings: { originBonusEnabled: false, terrainBonusEnabled: false, techBonusEnabled: true, techBonusLevel: 'low' },
  }));
  const high = buildCombatRulesParagraph(gates({
    originBonusSettings: { originBonusEnabled: false, terrainBonusEnabled: false, techBonusEnabled: true, techBonusLevel: 'high' },
  }));
  assert.ok(low.includes('at least 21 urban cells'));
  assert.ok(low.includes('adds 2 to its attack'));
  assert.ok(low.includes('The tech bonus does not change defense'));
  assert.ok(!low.includes('adds 2 to its attack and 2 to its defense'));
  assert.ok(high.includes('adds 2 to its attack and 2 to its defense'));
  assert.ok(high.includes('Casualty order still uses printed defense'));
});

test('the combat paragraph always states cover, after the weather sentence when weather is on', () => {
  const cover = buildTerrainCoverRule('strategic');
  assert.ok(buildCombatRulesParagraph(gates()).includes(cover));
  const weatherOn = gates({
    originBonusSettings: { originBonusEnabled: false, terrainBonusEnabled: false, weatherBonusEnabled: true },
  });
  const paragraph = buildCombatRulesParagraph(weatherOn);
  const weather = buildWeatherRule(weatherOn) ?? '\u0000';
  assert.ok(paragraph.indexOf(weather) >= 0 && paragraph.indexOf(cover) > paragraph.indexOf(weather));
});

test('the combat stats line states the d20, the floor, and the cap', () => {
  assert.match(
    buildCombatStatsLine('strategic', false),
    /^Combat: d20 per shot — an attack hits on a roll at or below its attack value and a defensive melee roll hits at or below its defense value, after the changes below\. Penalties and cover never lower an attack value below 2 before bonuses, and no value exceeds 17\. infantry: 3 attack \/ 7 defense/
  );
});

test('the system-prompt assembler delegates combat-rule prose to this module', () => {
  const assembler = fs.readFileSync(
    path.resolve(process.cwd(), 'src/main/openRouter/openRouterBuildSystemPrompt.ts'),
    'utf8'
  );
  assert.ok(assembler.includes('buildCombatRulesParagraph'));
  assert.ok(!assembler.includes('d20 per shot'));
  assert.ok(!assembler.includes('Hits land on the lowest-defense'));
});
