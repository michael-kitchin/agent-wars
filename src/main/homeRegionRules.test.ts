import * as assert from 'assert';
import {
  getForcedVisibleHomeRegionHexesForPlayer,
  isHexOwnershipVisibleToPerspective,
  resolveHomeRegionOwnerIdentity,
  resolveOwnershipBorderStyle,
} from '../shared/homeRegionRules';

/**
 * Verifies own-home and intersecting home hexes remain ownership-visible without proximity.
 *
 * Purpose: Protects the ownership-visibility exception contract for home-region information.
 * When to use: Run after changing home visibility rules or perspective logic.
 * Expected outcome: Own-home and intersecting hexes are visible even with an empty visible-hex set.
 * Exceptions: None.
 */
function testOwnershipVisibilityUsesHomeExceptions(): void {
  const visibleHexes = new Set<string>([]);
  const humanHomeRegionHexes = ['home-h', 'shared'];
  const aiHomeRegionHexes = ['home-a', 'shared'];
  assert.strictEqual(
    isHexOwnershipVisibleToPerspective({
      h3Index: 'home-h',
      playerPerspective: 'human',
      visibleHexes,
      humanHomeRegionHexes,
      aiHomeRegionHexes,
      intersectingHomeRegionHexes: ['shared'],
    }),
    true
  );
  assert.strictEqual(
    isHexOwnershipVisibleToPerspective({
      h3Index: 'shared',
      playerPerspective: 'human',
      visibleHexes,
      humanHomeRegionHexes,
      aiHomeRegionHexes,
      intersectingHomeRegionHexes: ['shared'],
    }),
    true
  );
  assert.strictEqual(
    isHexOwnershipVisibleToPerspective({
      h3Index: 'home-a',
      playerPerspective: 'human',
      visibleHexes,
      humanHomeRegionHexes,
      aiHomeRegionHexes,
      intersectingHomeRegionHexes: ['shared'],
    }),
    false
  );
}

/**
 * Verifies non-home ownership visibility still follows normal visible-hex fog contract.
 *
 * Purpose: Guards against non-home ownership leakage when visibility exceptions are enabled.
 * When to use: Run after changing fog/ownership visibility behavior.
 * Expected outcome: Non-home ownership remains hidden unless the hex is in the visible set.
 * Exceptions: None.
 */
function testOwnershipVisibilityUsesNormalVisibilityForNonHomeHexes(): void {
  const visibleHexes = new Set<string>(['normal-visible']);
  assert.strictEqual(
    isHexOwnershipVisibleToPerspective({
      h3Index: 'normal-visible',
      playerPerspective: 'human',
      visibleHexes,
      humanHomeRegionHexes: ['home-h'],
      aiHomeRegionHexes: ['home-a'],
    }),
    true
  );
  assert.strictEqual(
    isHexOwnershipVisibleToPerspective({
      h3Index: 'normal-hidden',
      playerPerspective: 'human',
      visibleHexes,
      humanHomeRegionHexes: ['home-h'],
      aiHomeRegionHexes: ['home-a'],
    }),
    false
  );
}

/**
 * Verifies home-region owner identity resolves separately from current control for split border coloring.
 *
 * Purpose: Locks inner dashed border ownership (home region) vs outer solid border ownership (controller).
 * When to use: Run after changing `resolveHomeRegionOwnerIdentity`.
 * Expected outcome: Exclusive lists return one side; intersection returns `both`; non-home returns null.
 * Exceptions: None.
 */
function testResolveHomeRegionOwnerIdentityContract(): void {
  const sharedInputs = {
    humanHomeRegionHexes: ['home-h', 'shared'],
    aiHomeRegionHexes: ['home-a', 'shared'],
    intersectingHomeRegionHexes: ['shared'],
  };
  assert.strictEqual(
    resolveHomeRegionOwnerIdentity({ ...sharedInputs, h3Index: 'home-h' }),
    'human'
  );
  assert.strictEqual(
    resolveHomeRegionOwnerIdentity({ ...sharedInputs, h3Index: 'home-a' }),
    'opponent'
  );
  assert.strictEqual(
    resolveHomeRegionOwnerIdentity({ ...sharedInputs, h3Index: 'shared' }),
    'both'
  );
  assert.strictEqual(
    resolveHomeRegionOwnerIdentity({ ...sharedInputs, h3Index: 'normal-visible' }),
    null
  );
}

/**
 * Verifies border style resolution for home/intersecting/non-home visibility combinations.
 *
 * Purpose: Locks the shared style-token mapping used by renderer border passes.
 * When to use: Run after changing ownership style classification logic.
 * Expected outcome: Home styles resolve to outlined controller-colored variants; uncontrolled home hexes use neutral outlines.
 * Exceptions: None.
 */
function testResolveOwnershipBorderStyleContract(): void {
  const sharedInputs = {
    humanHomeRegionHexes: ['home-h', 'shared'],
    aiHomeRegionHexes: ['home-a', 'shared'],
    intersectingHomeRegionHexes: ['shared'],
  };
  assert.strictEqual(
    resolveOwnershipBorderStyle({
      ...sharedInputs,
      h3Index: 'home-h',
      controllerPlayerId: 'human',
      isOwnershipVisible: true,
    }),
    'outlinedControlledByHuman'
  );
  assert.strictEqual(
    resolveOwnershipBorderStyle({
      ...sharedInputs,
      h3Index: 'shared',
      controllerPlayerId: 'human',
      isOwnershipVisible: true,
    }),
    'outlinedControlledByHuman'
  );
  assert.strictEqual(
    resolveOwnershipBorderStyle({
      ...sharedInputs,
      h3Index: 'shared',
      controllerPlayerId: null,
      isOwnershipVisible: true,
    }),
    'outlinedNeutral'
  );
  assert.strictEqual(
    resolveOwnershipBorderStyle({
      ...sharedInputs,
      h3Index: 'normal-visible',
      controllerPlayerId: 'opponent',
      isOwnershipVisible: true,
    }),
    'normalControlledByOpponent'
  );
  assert.strictEqual(
    resolveOwnershipBorderStyle({
      ...sharedInputs,
      h3Index: 'normal-hidden',
      controllerPlayerId: 'human',
      isOwnershipVisible: false,
    }),
    'none'
  );
}

/**
 * Verifies forced visibility helper works for any snapshot with home-region metadata, independent of scenario id.
 *
 * Purpose: Prevents regressions that reintroduce scenario-id gating for forced home visibility.
 * When to use: Run after refactoring forced-home visibility helper conditions.
 * Expected outcome: Forced visibility includes own-home plus intersecting hexes when metadata is present.
 * Exceptions: None.
 */
function testForcedVisibleHomeHexesNoScenarioGate(): void {
  const forced = getForcedVisibleHomeRegionHexesForPlayer(
    {
      humanHomeRegionHexes: ['home-h', 'shared'],
      aiHomeRegionHexes: ['home-a', 'shared'],
      intersectingHomeRegionHexes: ['shared'],
    },
    'human',
    new Set(['home-h', 'home-a', 'shared'])
  );
  assert.deepStrictEqual([...forced].sort(), ['home-h', 'shared']);
}

/**
 * Executes all home-region ownership visibility contract tests for this module.
 *
 * Purpose: Provides a single entrypoint compatible with the repository's node-based test runner.
 * When to use: Invoked automatically by `scripts/run-main-node-tests.cjs` after build.
 * Expected outcome: All assertions pass and emits a success marker line.
 * Exceptions: Throws on any failing assertion.
 */
function run(): void {
  testOwnershipVisibilityUsesHomeExceptions();
  testOwnershipVisibilityUsesNormalVisibilityForNonHomeHexes();
  testResolveHomeRegionOwnerIdentityContract();
  testResolveOwnershipBorderStyleContract();
  testForcedVisibleHomeHexesNoScenarioGate();
  console.log('homeRegionRules.test.ts passed');
}

run();

