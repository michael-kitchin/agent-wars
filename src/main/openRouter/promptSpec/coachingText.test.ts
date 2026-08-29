/**
 * Contract tests for per-mode coaching bullets and the claims they must never make.
 * Run: `npm run build:main` then `node dist/main/openrouter/promptSpec/coachingText.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCoachingBullets, buildContextCoaching, type CoachingGates } from './coachingText';

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
  assert.match(text, /all enemy home region hexes/i);
  assert.match(text, /embark, then air strikes/i);
  assert.match(text, /cargo sync/i);
  assert.match(text, /does not consume the move/i);
  assert.match(text, /suppresses automatic engagement/i);
  assert.match(text, /lowest-defense/i);
  assert.match(text, /Copy a Target Hex from a row listing that unit/i);
  assert.match(text, /unitIds/);
  assert.match(text, /friendly/i);
  assert.match(text, /move\/melee/i);
  assert.match(text, /Units Without Standing Orders/i);
  assert.match(text, /healthy standing order/i);
  assert.match(text, /recedes from the nearest enemy/i);
  assert.match(text, /move\/melee Target Hex is such an override/i);
  assert.match(text, /toward the fighting/i);
  assert.match(text, /even when the unit is holding on defend/i);
  assert.match(text, /cannot enter land cells/i);
  assert.match(text, /embark at a legal cell/i);
  assert.match(text, /queue is empty, queue something/i);
  assert.match(text, /replace blocked queues/i);
  assert.match(text, /shared cells count toward both/i);
  assert.match(text, /Do not persist enemy positions/i);
  assert.match(text, /persistent slots are unused/i);
  assert.match(text, /replaces the entire subscription list/i);
  assert.match(text, /Omit the array or send \[\]/i);
  assert.match(text, /consulted when a subscribed event fires/i);
  assert.match(text, /taunt or threat/i);
  assert.match(text, /exhausting them submits nothing/i);
});

test('strategic conditional items disappear when their gate is off', () => {
  assert.doesNotMatch(joined(strategicGates({ ordersEnabled: false })), /suppresses automatic engagement/i);
  assert.doesNotMatch(joined(strategicGates({ ordersEnabled: false })), /Units Without Standing Orders/i);
  assert.doesNotMatch(joined(strategicGates({ productionEnabled: false })), /queue is empty, queue something/i);
  assert.doesNotMatch(joined(strategicGates({ memoryEnabled: false })), /Do not persist enemy positions/i);
  assert.doesNotMatch(joined(strategicGates({ hasAirUnits: false })), /toward the fighting/i);
  assert.doesNotMatch(joined(strategicGates({ hasNavalUnits: false })), /cannot enter land cells/i);
  assert.doesNotMatch(joined(strategicGates({ hasNavalUnits: false })), /embark at a legal cell/i);
  assert.doesNotMatch(joined(strategicGates({ homeRegionsOverlap: false })), /shared cells count toward both/i);
  assert.doesNotMatch(joined(strategicGates({ hasBestOptionsTable: false })), /Copy a Target Hex from a row listing that unit/i);
  assert.match(joined(strategicGates({ hasBestOptionsTable: false })), /no options are listed this period/i);
  assert.match(joined(strategicGates({ hasBestOptionsTable: false })), /routing tool/i);
  assert.doesNotMatch(joined(strategicGates({ hasObservedEnemy: true })), /move to regain contact/i);
  assert.match(joined(strategicGates({ hasObservedEnemy: false })), /move to regain contact/i);
  assert.doesNotMatch(joined(strategicGates({ includeScenarioWinPaths: false })), /all enemy home region hexes/i);
  assert.doesNotMatch(joined(strategicGates({ includeScenarioWinPaths: false, homeRegionsOverlap: true })), /shared cells count toward both/i);
  assert.doesNotMatch(
    joined(strategicGates({ hasAirUnits: false, hasBestOptionsTable: true })),
    /ferryOrders/
  );
  assert.doesNotMatch(
    joined(strategicGates({ hasAirUnits: false, hasBestOptionsTable: true })),
    /airStrikes/
  );
});

test('absent scenario id drops home-region goals from the context block', () => {
  const withScenario = buildContextCoaching(strategicGates());
  assert.match(withScenario, /Protect your home region's production capacity/);
  assert.match(withScenario, /enemy home region's urban production/);
  const withoutScenario = buildContextCoaching(strategicGates({ includeScenarioWinPaths: false }));
  assert.doesNotMatch(withoutScenario, /home region/);
  assert.match(withoutScenario, /Engage enemy forces/);
});

test('tactical coaching includes every required item when its gate is on', () => {
  const text = joined(tacticalGates({ hasAirUnits: true, hasNavalUnits: true, hasBestOptionsTable: true }));
  assert.match(text, /does not consume the move/i);
  assert.match(text, /Standing orders do not move sub-units/i);
  assert.match(text, /Copy a Target Hex from a row listing that sub-unit/i);
  assert.match(text, /unitIds/);
  assert.match(text, /clamped to the first reachable leg/i);
  assert.doesNotMatch(text, /Urban and rubble cells cost more/);
  assert.match(text, /urban or rubble/i);
  assert.match(text, /Infantry and armor fire at res4 baselines/i);
  assert.match(text, /strike any cell in the footprint/i);
  assert.match(text, /lowest-defense/i);
  assert.match(text, /friendly/i);
  assert.match(text, /move\/melee/i);
  assert.match(text, /embark/i);
  assert.match(text, /sub-unit ids/i);
  assert.match(text, /omit the array or send \[\]/i);
  assert.match(text, /cleared when the battle ends/i);
  assert.match(text, /consulted only when a subscribed event fires/i);
  assert.match(text, /taunt or threat/i);
});

test('tactical conditional items disappear when their gate is off', () => {
  assert.doesNotMatch(joined(tacticalGates({ hasAirUnits: false })), /strike any cell in the footprint/i);
  assert.doesNotMatch(joined(tacticalGates({ hasAirUnits: false, hasBestOptionsTable: true })), /airStrikes/);
  assert.doesNotMatch(joined(tacticalGates({ hasNavalUnits: false })), /Naval Transport Status/i);
  assert.doesNotMatch(joined(tacticalGates({ hasBestOptionsTable: false })), /Copy a Target Hex from a row listing that sub-unit/i);
  assert.match(joined(tacticalGates({ hasBestOptionsTable: false, planningEnabled: true })), /routing tool/i);
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

test('tempo coaching names air strike only when air is present', () => {
  assert.match(joined(strategicGates({ hasAirUnits: true })), /or air strike/);
  assert.doesNotMatch(joined(strategicGates({ hasAirUnits: false })), /or air strike/);
  assert.match(joined(tacticalGates({ hasAirUnits: true })), /or air strike/);
  assert.doesNotMatch(joined(tacticalGates({ hasAirUnits: false })), /or air strike/);
});

test('callback coaching states the empty-list event-driven consequence', () => {
  assert.match(joined(strategicGates()), /engine-forced/);
  assert.match(joined(tacticalGates()), /engine-forced/);
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
