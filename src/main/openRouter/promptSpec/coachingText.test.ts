/**
 * Contract tests for per-mode coaching bullets and the claims they must never make.
 * Run: `npm run build:main` then `node dist/main/openRouter/promptSpec/coachingText.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCoachingBullets, buildContextCoaching, type CoachingGates } from './coachingText';
import { buildOperationRuleBlock } from './operationRuleText';
import { POSTURE_SETTINGS } from '../../../shared/postureTypes';
import { buildPostureRuleBlock } from './postureRuleText';

/**
 * Fully enabled strategic gates used as the baseline for presence assertions.
 *
 * Purpose: Each absence case flips one flag off this object.
 * When to use: The cases in this file.
 * Expected outcome: A complete `CoachingGates` value.
 * Exceptions: None.
 */
function strategicGates(overrides: Partial<CoachingGates> = {}): CoachingGates {
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
    includeExitBattle: false,
    ...overrides,
  };
}

/**
 * Fully enabled tactical gates used as the baseline for presence assertions.
 *
 * Purpose: Same as `strategicGates` for battle consultations.
 * When to use: Tactical cases in this file.
 * Expected outcome: A complete `CoachingGates` value with tactical mode.
 * Exceptions: None.
 */
function tacticalGates(overrides: Partial<CoachingGates> = {}): CoachingGates {
  return {
    ...strategicGates(overrides),
    coordinateMode: 'tactical',
    memoryEnabled: false,
    productionEnabled: false,
    ordersEnabled: false,
    homeRegionsOverlap: false,
    includeScenarioWinPaths: false,
    ...overrides,
  };
}

/**
 * Joins coaching bullets for substring checks.
 *
 * Purpose: Assertions care about presence, not bullet index.
 * When to use: After `buildCoachingBullets`.
 * Expected outcome: Newline-joined bullet text.
 * Exceptions: None.
 */
function joined(gates: CoachingGates): string {
  return buildCoachingBullets(gates).join('\n');
}

test('strategic coaching includes every required item when its gate is on', () => {
  const text = joined(strategicGates());
  assert.match(text, /last side standing/i);
  assert.match(text, /A unit that fires can still move/i);
  assert.match(text, /ferried air unit arrives after ground movement/i);
  assert.doesNotMatch(text, /missile launches, then air strikes/i);
  assert.doesNotMatch(text, /cargo sync/i);
  assert.match(text, /does not use the move/i);
  assert.doesNotMatch(text, /suppresses automatic engagement/i);
  assert.doesNotMatch(text, /lowest-defense/i);
  assert.doesNotMatch(text, /Friendly units may stack/i);
  assert.doesNotMatch(text, /1\/2 point/);
  assert.match(text, /Copy a Target Hex from a row listing that unit/i);
  assert.match(text, /unitIds/);
  assert.doesNotMatch(text, /not a legal destination/i);
  assert.doesNotMatch(text, /stay-put/i);
  assert.doesNotMatch(text, /leaving this period/i);
  assert.match(text, /move\/melee/i);
  assert.match(text, /Units Without Standing Orders/i);
  assert.doesNotMatch(text, /already holds a legal hex/i);
  assert.match(text, /When the cell is —/);
  assert.match(text, /including when no enemy is observed/);
  assert.match(text, /enemy-occupied hex/);
  assert.match(text, /Use pursue only when you supply an enemy unit id/);
  assert.match(text, /inside this turn's movement budget, including weather/);
  assert.match(text, /Do not copy a farther hex from the printed nearest-enemy path/);
  assert.match(text, /Never march to the unit's current Hex/);
  assert.match(text, /beyond this turn's movement budget/);
  assert.match(text, /Suggested Destination starts with defend/);
  assert.match(text, /healthy standing order/i);
  assert.match(text, /recedes from the nearest enemy/i);
  assert.match(text, /move\/melee Target Hex is such an override/i);
  assert.match(text, /toward the fighting/i);
  assert.match(text, /no strike and no drop/i);
  assert.match(text, /Prefer airlift when an airport chain reaches/i);
  assert.match(text, /cannot enter land cells/i);
  assert.match(text, /embark at a legal cell/i);
  assert.match(text, /queue is empty, queue something/i);
  assert.match(text, /Keep one city queued on credits at all times/);
  assert.match(text, /Production Priorities, under Production Status, names a city for a missile, a naval unit, or credits/);
  assert.match(text, /replace blocked queues/i);
  assert.match(text, /more than one home region/i);
  assert.match(text, /Do not persist enemy positions/i);
  assert.match(text, /replaces the oldest persistent note/i);
  assert.match(text, /replaces the entire subscription list/i);
  assert.match(text, /Omit the array or send \[\]/i);
  assert.match(text, /consulted when a subscribed event fires/i);
  assert.match(text, /taunt or threat/i);
  assert.match(text, /tools are withdrawn and you get one reply/i);
});

test('strategic conditional items disappear when their gate is off', () => {
  assert.doesNotMatch(joined(strategicGates({ ordersEnabled: false })), /suppresses automatic engagement/i);
  assert.doesNotMatch(joined(strategicGates({ ordersEnabled: false })), /Units Without Standing Orders/i);
  assert.doesNotMatch(joined(strategicGates({ productionEnabled: false })), /queue is empty, queue something/i);
  assert.doesNotMatch(joined(strategicGates({ productionEnabled: false })), /Keep one city queued on credits at all times/);
  assert.doesNotMatch(joined(strategicGates({ memoryEnabled: false })), /Do not persist enemy positions/i);
  assert.doesNotMatch(joined(strategicGates({ hasAirUnits: false })), /toward the fighting/i);
  assert.doesNotMatch(joined(strategicGates({ hasNavalUnits: false })), /cannot enter land cells/i);
  assert.doesNotMatch(joined(strategicGates({ hasNavalUnits: false })), /embark at a legal cell/i);
  assert.match(joined(strategicGates({ hasMissileUnits: true })), /Launch every missile that Missile Forces lists a target for/);
  assert.doesNotMatch(joined(strategicGates({ hasMissileUnits: false })), /Launch every missile/);
  assert.doesNotMatch(joined(tacticalGates({ hasMissileUnits: true })), /Launch every missile/);
  assert.doesNotMatch(joined(strategicGates({ homeRegionsOverlap: false })), /more than one home region/i);
  assert.match(joined(strategicGates({ hasBestOptionsTable: false })), /When it lists none, call plan_route or leave the unit idle/);
  assert.match(joined(strategicGates({ hasObservedEnemy: true })), /move to regain contact/i);
  assert.match(joined(strategicGates({ hasObservedEnemy: false })), /move to regain contact/i);
  assert.doesNotMatch(joined(strategicGates({ includeScenarioWinPaths: false })), /last side standing/i);
  assert.doesNotMatch(joined(strategicGates({ includeScenarioWinPaths: false, homeRegionsOverlap: true })), /more than one home region/i);
  assert.doesNotMatch(
    joined(strategicGates({ hasAirUnits: false, hasBestOptionsTable: true })),
    /ferryOrders/
  );
  assert.doesNotMatch(
    joined(strategicGates({ hasAirUnits: false, hasBestOptionsTable: true })),
    /airStrikes/
  );
  assert.doesNotMatch(
    joined(strategicGates({ hasAirUnits: false, hasBestOptionsTable: true })),
    /airDrops/
  );
});

test('absent scenario id drops the city-knockout goals from the context block', () => {
  const withScenario = buildContextCoaching(strategicGates());
  assert.match(withScenario, /Take and hold enemy cities/);
  assert.match(withScenario, /Keep enough units at home to stop a raid on your cities/);
  const withoutScenario = buildContextCoaching(strategicGates({ includeScenarioWinPaths: false }));
  assert.doesNotMatch(withoutScenario, /Take and hold enemy cities/);
  assert.match(withoutScenario, /Destroy enemy forces where you outnumber them/);
  assert.match(withScenario, /Destroy the city cells, airports, and seaports/);
  assert.match(withoutScenario, /Destroy the city cells, airports, and seaports/);
});

test('the tools block numbers only the lines whose gates hold', () => {
  const airOnly = buildContextCoaching(strategicGates({
    hasNavalUnits: false,
    hasMissileUnits: false,
    canBuildNaval: false,
    canBuildMissile: false,
    mercenariesAvailable: false,
  }));
  const toolsAt = airOnly.indexOf('- Your tools are:');
  const afterTools = airOnly.slice(toolsAt, airOnly.indexOf('- Your doctrine is'));
  assert.ok(toolsAt >= 0);
  assert.match(afterTools, /\(1\) Air units strike/);
  assert.doesNotMatch(afterTools, /\(2\)/);
  const none = buildContextCoaching(strategicGates({
    hasAirUnits: false,
    hasNavalUnits: false,
    hasMissileUnits: false,
    canBuildNaval: false,
    canBuildMissile: false,
    mercenariesAvailable: false,
  }));
  assert.doesNotMatch(none, /Your tools are:/);
});

test('tactical context does not gain strategic tools or production-denial doctrine', () => {
  const text = buildContextCoaching(tacticalGates({
    hasAirUnits: true,
    hasNavalUnits: true,
    hasMissileUnits: true,
    canBuildNaval: true,
    canBuildMissile: true,
    mercenariesAvailable: true,
  }));
  assert.doesNotMatch(text, /Your tools are:/);
  assert.doesNotMatch(text, /Production the enemy loses/);
  assert.doesNotMatch(text, /before you commit ground units/);
});

test('tactical coaching includes every required item when its gate is on', () => {
  const text = joined(tacticalGates({ hasAirUnits: true, hasNavalUnits: true, hasBestOptionsTable: true }));
  assert.match(text, /does not use the move/i);
  assert.match(text, /Standing orders do not move sub-units/i);
  assert.match(text, /Copy a Target Hex from a row listing that sub-unit/i);
  assert.match(text, /unitIds/);
  assert.match(text, /clamped to the first reachable leg/i);
  assert.match(text, /the move is dropped unless the step enters a cell that holds an enemy/i);
  assert.doesNotMatch(text, /for every terrain, for infantry and armor/);
  assert.doesNotMatch(text, /does not open blocked terrain/);
  assert.doesNotMatch(text, /blocked terrain\. A unit may enter that cell/);
  assert.doesNotMatch(text, /Urban and rubble cells cost more/);
  assert.doesNotMatch(text, /urban or rubble/i);
  assert.doesNotMatch(text, /Infantry and armor fire at tactical baselines/i);
  assert.doesNotMatch(text, /1\/2 point/);
  assert.doesNotMatch(text, /lowest-defense/i);
  assert.doesNotMatch(text, /Friendly units may stack/i);
  assert.match(text, /strike or drop anywhere in the footprint/i);
  assert.match(text, /ferryOrders/);
  assert.match(text, /intact airport/i);
  assert.doesNotMatch(text, /not a legal destination/i);
  assert.doesNotMatch(text, /stay-put/i);
  assert.doesNotMatch(text, /leaving this period/i);
  assert.match(text, /move\/melee/i);
  assert.match(text, /embark/i);
  assert.match(text, /sub-unit ids/i);
  assert.match(text, /omit the array or send \[\]/i);
  assert.match(text, /cleared when the battle ends/i);
  assert.match(text, /consulted when a subscribed event fires/i);
  assert.match(text, /engine forces a consultation/i);
  assert.match(text, /issued nothing/i);
  assert.doesNotMatch(text, /consulted only when/i);
  assert.match(text, /taunt or threat/i);
});

test('tactical conditional items disappear when their gate is off', () => {
  assert.doesNotMatch(joined(tacticalGates({ hasAirUnits: false })), /strike or drop anywhere in the footprint/i);
  assert.doesNotMatch(joined(tacticalGates({ hasAirUnits: false, hasBestOptionsTable: true })), /airStrikes/);
  assert.doesNotMatch(joined(tacticalGates({ hasAirUnits: false, hasBestOptionsTable: true })), /airDrops/);
  assert.doesNotMatch(joined(tacticalGates({ hasAirUnits: false, hasBestOptionsTable: true })), /ferryOrders/);
  assert.doesNotMatch(joined(tacticalGates({ hasNavalUnits: false })), /Naval Transport Status/i);
  assert.match(joined(tacticalGates({ hasBestOptionsTable: false })), /When it lists none, call plan_route or leave the sub-unit idle/);
  assert.doesNotMatch(joined(tacticalGates()), /toward the fighting/i);
  assert.doesNotMatch(joined(tacticalGates()), /home region/i);
  assert.doesNotMatch(joined(tacticalGates()), /productionOrders/i);
  assert.doesNotMatch(joined(tacticalGates()), /assign_order/i);
});

test('option copy maps ranged rows and picks one row per actor per action in both modes', () => {
  const strategic = joined(strategicGates());
  const tactical = joined(tacticalGates());
  for (const text of [strategic, tactical]) {
    assert.match(text, /ranged_attack/);
    assert.match(text, /at most one/i);
    assert.match(text, /overlapping/i);
    assert.match(text, /Never copy a Target Hex from a row that does not list/i);
  }
  assert.match(strategic, /Copy a Target Hex from a row listing that unit/i);
  assert.match(tactical, /Copy a Target Hex from a row listing that sub-unit/i);
});

test('option copy names an air drop when air is present and tells the model to pick one air action', () => {
  const strategic = joined(strategicGates({ hasAirUnits: true, hasBestOptionsTable: true }));
  const tactical = joined(tacticalGates({ hasAirUnits: true, hasBestOptionsTable: true }));
  for (const text of [strategic, tactical]) {
    assert.match(text, /airDrops/);
    assert.match(text, /picks only one of air strike, air drop, and ferry/);
    assert.match(text, /When its Aboard column is none/);
  }
  assert.doesNotMatch(joined(strategicGates({ hasAirUnits: false, hasBestOptionsTable: true })), /airDrops/);
  assert.doesNotMatch(joined(tacticalGates({ hasAirUnits: false, hasBestOptionsTable: true })), /airDrops/);
});

test('tempo coaching names air strike only when air is present', () => {
  assert.match(joined(strategicGates({ hasAirUnits: true })), /air-strike row/);
  assert.doesNotMatch(joined(strategicGates({ hasAirUnits: false })), /air-strike row/);
  assert.match(joined(tacticalGates({ hasAirUnits: true })), /air-strike row/);
  assert.doesNotMatch(joined(tacticalGates({ hasAirUnits: false })), /air-strike row/);
  for (const text of [joined(strategicGates()), joined(tacticalGates())]) {
    assert.match(text, /Kill below 50%/);
    assert.match(text, /Loss at least 50%/);
    assert.doesNotMatch(text, /wipe below 50%/);
  }
});

test('callback coaching states the empty-list event-driven consequence', () => {
  assert.match(joined(strategicGates()), /engine-forced/);
  assert.match(joined(tacticalGates()), /engine-forced/);
});

test('option-copy bullets keep the mode noun and the absent-table sentences', () => {
  const strategic = joined(strategicGates());
  assert.match(strategic, /already this-turn legal destinations/);
  assert.match(strategic, /When it lists none, call plan_route or leave the unit idle/);
  const tactical = joined(tacticalGates());
  assert.match(tactical, /already this-beat legal destinations/);
  assert.match(tactical, /When it lists none, call plan_route or leave the sub-unit idle/);
  assert.ok(
    joined(strategicGates({ hasBestOptionsTable: false, planningEnabled: false })).includes(
      "the unit's own cell means hold."
    )
  );
  assert.ok(
    joined(tacticalGates({ hasBestOptionsTable: false, planningEnabled: false })).includes(
      "the sub-unit's own cell means hold."
    )
  );
});

test('exit battle coaching is present only when the gate is on', () => {
  const sentence = 'Set exitBattle to true when your side has an overwhelming numerical advantage, or when you have no order you can legally give. Set it to false otherwise. Orders in this reply still resolve for this beat.';
  assert.equal(joined(tacticalGates()).includes(sentence), false);
  assert.equal(joined(strategicGates()).includes(sentence), false);
  assert.equal(joined(tacticalGates({ includeExitBattle: true })).includes(sentence), true);
});

test('prohibited claims appear in no gate combination', () => {
  const samples: CoachingGates[] = [
    strategicGates(),
    strategicGates({
      ordersEnabled: false,
      memoryEnabled: false,
      productionEnabled: false,
      hasAirUnits: false,
      hasNavalUnits: false,
      hasBestOptionsTable: false,
      homeRegionsOverlap: false,
      hasObservedEnemy: false,
      planningEnabled: false,
      includeScenarioWinPaths: false,
    }),
    tacticalGates(),
    tacticalGates({ hasAirUnits: false, hasNavalUnits: false, hasBestOptionsTable: false, planningEnabled: false }),
  ];
  for (const gates of samples) {
    const text = joined(gates);
    assert.doesNotMatch(text, /damage given up for free/);
    assert.doesNotMatch(text, /is actively searching for your forces/);
    assert.doesNotMatch(text, /the engine will fire/);
    assert.doesNotMatch(text, /the engine will move/);
    if (!gates.planningEnabled) {
      assert.doesNotMatch(text, /plan_route/);
    }
  }
});

test('operation rules follow the campaign rules only when the gate is on', () => {
  const withBoth = buildContextCoaching(strategicGates({ campaignEnabled: true, operationsEnabled: true }));
  const campaignAt = withBoth.indexOf('## Campaign');
  const operationsAt = withBoth.indexOf('## Operations');
  assert.ok(campaignAt >= 0);
  assert.ok(operationsAt > campaignAt);
  const campaignOnly = buildContextCoaching(strategicGates({ campaignEnabled: true }));
  assert.equal(campaignOnly.includes('## Operations'), false);
  assert.equal(buildContextCoaching(strategicGates()).includes('## Operations'), false);
  assert.equal(buildContextCoaching(tacticalGates({ operationsEnabled: true })).includes('The engine runs operations'), false);
  assert.ok(withBoth.includes('Operation Options lists up to 5 you could launch'));
  assert.ok(withBoth.includes('it never launches a defended row'));
  assert.ok(withBoth.includes('It never launches a land row'));
  assert.ok(withBoth.includes('by sea or by air'));
  assert.ok(withBoth.includes('An air unit in an operation does not strike'));
  assert.ok(withBoth.includes('with "objective" and "method" in place of "option"'));
  assert.equal(buildOperationRuleBlock(false).includes('Operation Options lists up to'), false);
  assert.ok(withBoth.includes('Your land campaign is listed there too, as "campaign".'));
  assert.ok(withBoth.includes('You may instead launch a land row of Operation Options; both do the same thing.'));
  assert.equal(campaignOnly.includes('You may instead launch a land row of Operation Options'), false);
  const operationsOnly = buildContextCoaching(strategicGates({ operationsEnabled: true }));
  assert.equal(operationsOnly.includes('Your land campaign is listed there too'), false);
  const tactical = buildContextCoaching(tacticalGates({ operationsEnabled: true, campaignEnabled: true }));
  assert.equal(tactical.includes('Your land campaign is listed there too'), false);
  assert.equal(tactical.includes('You may instead launch a land row of Operation Options'), false);
});

test('posture rules follow the operation rules only when the gate is on', () => {
  const withPosture = buildContextCoaching(strategicGates({ operationsEnabled: true, postureEnabled: true }));
  const operationsAt = withPosture.indexOf('## Operations');
  const postureAt = withPosture.indexOf('## Postures');
  assert.ok(operationsAt >= 0);
  assert.ok(postureAt > operationsAt);
  assert.ok(withPosture.includes('The historical names are illustrations of an idea.'));
  assert.equal(buildContextCoaching(strategicGates({ operationsEnabled: true })).includes('## Postures'), false);
  assert.equal(buildContextCoaching(tacticalGates({ postureEnabled: true })).includes('## Postures'), false);
  assert.equal(POSTURE_SETTINGS.maritime.navalPriorityCapShare, 1);
  assert.equal(POSTURE_SETTINGS.maritime.liftGroundShare, 0.5);
  assert.equal(POSTURE_SETTINGS.blitz.airOperationSlotFactor, 2);
  assert.equal(POSTURE_SETTINGS.blitz.campaignAssaultFactor, 0.5);
  assert.equal(POSTURE_SETTINGS.blitz.engineLaunchMaxDefenders, 1);
  assert.ok(buildPostureRuleBlock().includes('full cap'));
  assert.ok(buildPostureRuleBlock().includes('half your ground units'));
  assert.ok(buildPostureRuleBlock().includes('twice the air operations'));
  assert.ok(buildPostureRuleBlock().includes('half the usual mass'));
});
