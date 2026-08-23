/**
 * Tests for suggested march destinations offered to units left without a standing order.
 *
 * Purpose: Turn 17 strategic prompts showed the model marching orderless naval units to their own hex, which is dropped
 * as already-arrived, so those units stayed orderless and idle every turn. The suggestion column exists to break that
 * loop, and it only works if the hex it offers is legal, closes on the enemy, and is never the unit's current hex.
 * When to use: After edits to `orderlessUnitSuggestions.ts` or the shared approach helpers in `assessUnitProximity.ts`.
 * Expected outcome: A closing suggestion when an enemy is reachable, and no suggestion at all when none is observed.
 * Exceptions: Throws when the world map has no geodesic land-mass chain of the required length.
 */

import * as assert from 'assert';
import { gridDistance } from 'h3-js';
import {
  buildLandChainState,
  findGeodesicLandMassChain,
} from '../testSupport/strategicLandChainFixtures';
import { suggestApproachDestinationsForOrderlessUnits } from './orderlessUnitSuggestions';

/**
 * Ensures an orderless unit is offered a legal hex that closes on the distant enemy.
 *
 * Purpose: This is the contract the briefing column depends on; a suggestion equal to the unit's own hex would reproduce
 * the exact dropped-order loop the column was added to fix.
 * When to use: After changing suggestion selection or the approach filter it delegates to.
 * Expected outcome: A suggestion exists, differs from the unit's hex, and is strictly closer to the enemy.
 * Exceptions: Throws if no geodesic 4-hop land chain exists.
 */
function testOrderlessUnitGetsClosingSuggestionThatIsNotItsOwnHex(): void {
  const chain = findGeodesicLandMassChain(4);
  const origin = chain[0]!;
  const enemy = chain[4]!;
  const state = buildLandChainState({
    chain,
    units: [
      { id: 'opponent-inf-idle', player: 'opponent', unitType: 'infantry', h3Index: origin },
      { id: 'human-inf-far', player: 'human', unitType: 'infantry', h3Index: enemy },
    ],
  });

  const suggestions = suggestApproachDestinationsForOrderlessUnits('opponent', state, [
    'opponent-inf-idle',
  ]);

  const destination = suggestions.get('opponent-inf-idle');
  assert.ok(destination, 'expected a suggested destination for the orderless unit');
  assert.notStrictEqual(
    destination,
    origin,
    'suggestion must never be the unit\'s own hex; that order is dropped as already arrived'
  );
  assert.ok(
    gridDistance(destination!, enemy) < gridDistance(origin, enemy),
    'suggestion must strictly close the distance to the nearest enemy'
  );
}

/**
 * Ensures no destination is invented when the unit has no enemy to close on.
 *
 * Purpose: A fabricated destination would be worse than an em dash, because the model would march units toward nothing
 * and trust the column less everywhere else.
 * When to use: After changing the nearest-enemy scan or the empty-result paths.
 * Expected outcome: The unit is absent from the returned map.
 * Exceptions: Throws if no geodesic 4-hop land chain exists.
 */
function testNoSuggestionWhenNoEnemyIsPresent(): void {
  const chain = findGeodesicLandMassChain(4);
  const origin = chain[0]!;
  const state = buildLandChainState({
    chain,
    units: [{ id: 'opponent-inf-idle', player: 'opponent', unitType: 'infantry', h3Index: origin }],
  });

  const suggestions = suggestApproachDestinationsForOrderlessUnits('opponent', state, [
    'opponent-inf-idle',
  ]);

  assert.strictEqual(
    suggestions.has('opponent-inf-idle'),
    false,
    'no enemy on the map means no closing destination to suggest'
  );
}

/**
 * Ensures air units are never offered a march destination.
 *
 * Purpose: Air units reposition by ferry and `assignOrder` rejects march/pursue/patrol for them, so a suggestion here
 * would walk the model straight into a rejected order every turn.
 * When to use: After changing the eligibility check or `AIR_INELIGIBLE_ORDER_TYPES`.
 * Expected outcome: The air unit is absent from the returned map even though an enemy is reachable.
 * Exceptions: Throws if no geodesic 4-hop land chain exists.
 */
function testAirUnitsAreNeverOfferedAMarchDestination(): void {
  const chain = findGeodesicLandMassChain(4);
  const state = buildLandChainState({
    chain,
    units: [
      { id: 'opponent-air-idle', player: 'opponent', unitType: 'air', h3Index: chain[0]! },
      { id: 'human-inf-far', player: 'human', unitType: 'infantry', h3Index: chain[4]! },
    ],
  });

  const suggestions = suggestApproachDestinationsForOrderlessUnits('opponent', state, [
    'opponent-air-idle',
  ]);

  assert.strictEqual(
    suggestions.has('opponent-air-idle'),
    false,
    'air units cannot take a march order, so they must not be offered a march destination'
  );
}

const tests: ReadonlyArray<{ name: string; fn: () => void }> = [
  {
    name: 'suggestApproachDestinationsForOrderlessUnits offers a closing hex that is not the unit\'s own',
    fn: testOrderlessUnitGetsClosingSuggestionThatIsNotItsOwnHex,
  },
  {
    name: 'suggestApproachDestinationsForOrderlessUnits omits units with no observed enemy',
    fn: testNoSuggestionWhenNoEnemyIsPresent,
  },
  {
    name: 'suggestApproachDestinationsForOrderlessUnits omits air units, which cannot march',
    fn: testAirUnitsAreNeverOfferedAMarchDestination,
  },
];

/**
 * Runs the suggested-destination contracts and exits non-zero on the first failure.
 *
 * Purpose: Same harness style as the other main-process node tests.
 * When to use: Direct node invocation of this file.
 * Expected outcome: `OK` lines for passing tests; process exit 1 on failure.
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
