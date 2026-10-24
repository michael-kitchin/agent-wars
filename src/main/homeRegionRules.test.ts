import * as assert from 'assert';
import { AI_SEAT_IDS, HUMAN_SEAT_ID, NEUTRAL_OWNER_ID } from '../shared/seatIds';
import {
  computeIntersectingHomeRegionHexes,
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
  const homeRegionHexesBySeat = {
    [HUMAN_SEAT_ID]: ['home-h', 'shared'],
    [AI_SEAT_IDS[0]]: ['home-a', 'shared'],
  };
  assert.strictEqual(
    isHexOwnershipVisibleToPerspective({
      h3Index: 'home-h',
      playerPerspective: 'human',
      visibleHexes,
      homeRegionHexesBySeat,
      intersectingHomeRegionHexes: ['shared'],
    }),
    true
  );
  assert.strictEqual(
    isHexOwnershipVisibleToPerspective({
      h3Index: 'shared',
      playerPerspective: 'human',
      visibleHexes,
      homeRegionHexesBySeat,
      intersectingHomeRegionHexes: ['shared'],
    }),
    true
  );
  assert.strictEqual(
    isHexOwnershipVisibleToPerspective({
      h3Index: 'home-a',
      playerPerspective: 'human',
      visibleHexes,
      homeRegionHexesBySeat,
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
      homeRegionHexesBySeat: {
        [HUMAN_SEAT_ID]: ['home-h'],
        [AI_SEAT_IDS[0]]: ['home-a'],
      },
    }),
    true
  );
  assert.strictEqual(
    isHexOwnershipVisibleToPerspective({
      h3Index: 'normal-hidden',
      playerPerspective: 'human',
      visibleHexes,
      homeRegionHexesBySeat: {
        [HUMAN_SEAT_ID]: ['home-h'],
        [AI_SEAT_IDS[0]]: ['home-a'],
      },
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
    homeRegionHexesBySeat: {
      [HUMAN_SEAT_ID]: ['home-h', 'shared'],
      [AI_SEAT_IDS[0]]: ['home-a', 'shared'],
    },
    intersectingHomeRegionHexes: ['shared'],
  };
  assert.deepStrictEqual(resolveHomeRegionOwnerIdentity({ ...sharedInputs, h3Index: 'home-h' }), {
    kind: 'single',
    seatId: HUMAN_SEAT_ID,
  });
  assert.deepStrictEqual(resolveHomeRegionOwnerIdentity({ ...sharedInputs, h3Index: 'home-a' }), {
    kind: 'single',
    seatId: AI_SEAT_IDS[0],
  });
  assert.deepStrictEqual(resolveHomeRegionOwnerIdentity({ ...sharedInputs, h3Index: 'shared' }), {
    kind: 'shared',
  });
  assert.strictEqual(resolveHomeRegionOwnerIdentity({ ...sharedInputs, h3Index: 'normal-visible' }), null);
  const threeHomes = {
    homeRegionHexesBySeat: {
      [HUMAN_SEAT_ID]: ['h-only'],
      [AI_SEAT_IDS[0]]: ['a-only', 'share'],
      [AI_SEAT_IDS[1]]: ['b-only', 'share'],
    },
  };
  assert.deepStrictEqual(resolveHomeRegionOwnerIdentity({ ...threeHomes, h3Index: 'b-only' }), {
    kind: 'single',
    seatId: AI_SEAT_IDS[1],
  });
  assert.deepStrictEqual(resolveHomeRegionOwnerIdentity({ ...threeHomes, h3Index: 'share' }), { kind: 'shared' });
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
    homeRegionHexesBySeat: {
      [HUMAN_SEAT_ID]: ['home-h', 'shared'],
      [AI_SEAT_IDS[0]]: ['home-a', 'shared'],
    },
    intersectingHomeRegionHexes: ['shared'],
  };
  assert.deepStrictEqual(
    resolveOwnershipBorderStyle({
      ...sharedInputs,
      h3Index: 'home-h',
      controllerPlayerId: 'human',
      isOwnershipVisible: true,
    }),
    { kind: 'outlined', ownerId: HUMAN_SEAT_ID }
  );
  assert.deepStrictEqual(
    resolveOwnershipBorderStyle({
      ...sharedInputs,
      h3Index: 'shared',
      controllerPlayerId: 'human',
      isOwnershipVisible: true,
    }),
    { kind: 'outlined', ownerId: HUMAN_SEAT_ID }
  );
  assert.deepStrictEqual(
    resolveOwnershipBorderStyle({
      ...sharedInputs,
      h3Index: 'shared',
      controllerPlayerId: null,
      isOwnershipVisible: true,
    }),
    { kind: 'outlinedNeutral' }
  );
  assert.deepStrictEqual(
    resolveOwnershipBorderStyle({
      ...sharedInputs,
      h3Index: 'normal-visible',
      controllerPlayerId: 'opponent',
      isOwnershipVisible: true,
    }),
    { kind: 'normal', ownerId: AI_SEAT_IDS[0] }
  );
  assert.deepStrictEqual(
    resolveOwnershipBorderStyle({
      ...sharedInputs,
      h3Index: 'normal-hidden',
      controllerPlayerId: 'human',
      isOwnershipVisible: false,
    }),
    { kind: 'none' }
  );
  assert.deepStrictEqual(
    resolveOwnershipBorderStyle({
      homeRegionHexesBySeat: { [AI_SEAT_IDS[1]]: ['b-only'] },
      h3Index: 'b-only',
      controllerPlayerId: AI_SEAT_IDS[1],
      isOwnershipVisible: true,
    }),
    { kind: 'outlined', ownerId: AI_SEAT_IDS[1] }
  );
  assert.deepStrictEqual(
    resolveOwnershipBorderStyle({
      h3Index: 'held',
      controllerPlayerId: NEUTRAL_OWNER_ID,
      isOwnershipVisible: true,
    }),
    { kind: 'outlinedNeutral' }
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
      homeRegionHexesBySeat: {
        [HUMAN_SEAT_ID]: ['home-h', 'shared'],
        [AI_SEAT_IDS[0]]: ['home-a', 'shared'],
      },
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
/**
 * A hex shared by two of three homes is listed once.
 *
 * Purpose: Intersection counts homes, not copies inside one home list.
 * When to use: After `computeIntersectingHomeRegionHexes` takes every home.
 * Expected outcome: The shared hex is the only result.
 * Exceptions: None.
 */
function testSharedHexAcrossThreeHomesIsListedOnce(): void {
  assert.deepStrictEqual(
    computeIntersectingHomeRegionHexes([['shared', 'only-a'], ['shared', 'only-b'], ['only-c', 'shared', 'shared']]),
    ['shared']
  );
}

function run(): void {
  testOwnershipVisibilityUsesHomeExceptions();
  testSharedHexAcrossThreeHomesIsListedOnce();
  testOwnershipVisibilityUsesNormalVisibilityForNonHomeHexes();
  testResolveHomeRegionOwnerIdentityContract();
  testResolveOwnershipBorderStyleContract();
  testForcedVisibleHomeHexesNoScenarioGate();
  console.log('homeRegionRules.test.ts passed');
}

run();

