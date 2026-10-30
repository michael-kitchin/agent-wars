/**
 * Tests for suggested march destinations offered to units left without a standing order.
 *
 * Purpose: Turn 17 strategic prompts showed the model marching orderless naval units to their own hex, which is dropped
 * as already-arrived, so those units stayed orderless and idle every turn. The suggestion column exists to break that
 * loop, and it only works if the hex it offers is legal, closes on the enemy, and is never the unit's current hex.
 * When to use: After edits to `orderlessUnitSuggestions.ts` or the shared approach helpers in `assessUnitProximity.ts`.
 * Expected outcome: A closing march when an enemy is reachable, including an enemy-occupied hex inside this turn's budget. With no enemy, a march toward a passable enemy-home hex, or defend for an orderless air unit. No march when the unit is already on the enemy or no home hex is usable. A missile is omitted.
 * Exceptions: Throws when the world map has no geodesic land-mass chain of the required length.
 */

import * as assert from 'assert';
import { gridDisk, gridDistance } from 'h3-js';
import {
  landUnitCanOccupyHex,
  STRATEGIC_LAND_MAX_WATER_PCT,
  type StrategicLandMassRecord,
} from '../../shared/landTraversalStrategic';
import { getStrategicLandMassByH3 } from '../terrainClassificationCache';
import {
  buildLandChainState,
  findGeodesicLandMassChain,
} from '../testSupport/strategicLandChainFixtures';
import { getValidDestinations } from '../oneStepMoveDestinations';
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

  const suggestion = suggestions.get('opponent-inf-idle');
  assert.ok(suggestion, 'expected a suggested destination for the orderless unit');
  assert.strictEqual(suggestion?.orderType, 'march');
  assert.notStrictEqual(
    suggestion?.destinationH3,
    origin,
    'suggestion must never be the unit\'s own hex; that order is dropped as already arrived'
  );
  assert.ok(
    gridDistance(suggestion!.destinationH3, enemy) < gridDistance(origin, enemy),
    'suggestion must strictly close the distance to the nearest enemy'
  );
}

/**
 * Ensures a blind unit outside the enemy home region is marched to the nearest passable home hex.
 *
 * Purpose: With no observed enemy, an em dash leaves the unit orderless. The home region is the standing goal, and the
 * nearest hex is the one the unit can start toward this turn.
 * When to use: After changing the empty-enemy march selection.
 * Expected outcome: A march to the nearer home hex, never the unit's own hex.
 * Exceptions: Throws if no geodesic 4-hop land chain exists.
 */
function testBlindUnitOutsideHomeMarchesToNearestHomeHex(): void {
  const chain = findGeodesicLandMassChain(4);
  const state = {
    ...buildLandChainState({
      chain,
      units: [{ id: 'opponent-inf-idle', player: 'opponent', unitType: 'infantry', h3Index: chain[0]! }],
    }),
    seats: [{ seatId: 'human' as const, seatOrder: 1, kind: 'human' as const, homeRegion: 'Home', outTurn: null, outBy: null, outReasons: [], place: null, consultationCount: 0, costUsd: 0, commander: null }, { seatId: 'opponent' as const, seatOrder: 2, kind: 'ai' as const, homeRegion: 'Away', outTurn: null, outBy: null, outReasons: [], place: null, consultationCount: 0, costUsd: 0, commander: null }], homeRegionHexesBySeat: { human: [chain[4]!, chain[2]!] },
  };

  const suggestions = suggestApproachDestinationsForOrderlessUnits('opponent', state, [
    'opponent-inf-idle',
  ]);

  const suggestion = suggestions.get('opponent-inf-idle');
  assert.strictEqual(suggestion?.orderType, 'march');
  assert.strictEqual(suggestion?.destinationH3, chain[2]);
  assert.notStrictEqual(suggestion?.destinationH3, chain[0]);
}

/**
 * Ensures a unit already inside the enemy home region is sent to the nearest unexplored home hex.
 *
 * Purpose: Once the unit has arrived in the region, repeating the hex it stands on is dropped as already arrived, and
 * an explored hex is not new ground. The remaining mission is the nearest home hex this player has not seen.
 * When to use: After changing the in-region unexplored filter.
 * Expected outcome: A march to the unexplored home hex, skipping the nearer explored one and the current hex.
 * Exceptions: Throws if no geodesic 4-hop land chain exists.
 */
function testBlindUnitInsideHomeMarchesToNearestUnexploredHomeHex(): void {
  const chain = findGeodesicLandMassChain(4);
  const state = {
    ...buildLandChainState({
      chain,
      units: [{ id: 'opponent-inf-idle', player: 'opponent', unitType: 'infantry', h3Index: chain[0]! }],
    }),
    seats: [{ seatId: 'human' as const, seatOrder: 1, kind: 'human' as const, homeRegion: 'Home', outTurn: null, outBy: null, outReasons: [], place: null, consultationCount: 0, costUsd: 0, commander: null }, { seatId: 'opponent' as const, seatOrder: 2, kind: 'ai' as const, homeRegion: 'Away', outTurn: null, outBy: null, outReasons: [], place: null, consultationCount: 0, costUsd: 0, commander: null }], homeRegionHexesBySeat: { human: [chain[0]!, chain[1]!, chain[4]!] },
    exploredHexes: [chain[0]!, chain[1]!],
  };

  const suggestions = suggestApproachDestinationsForOrderlessUnits('opponent', state, [
    'opponent-inf-idle',
  ]);

  assert.deepStrictEqual(suggestions.get('opponent-inf-idle'), {
    orderType: 'march',
    destinationH3: chain[4],
  });
}

/**
 * Ensures a unit that has already seen every other home hex is left without a march.
 *
 * Purpose: There is no remaining home hex to assign, and inventing one would send the unit back over ground it has seen.
 * When to use: After changing the in-region unexplored filter.
 * Expected outcome: The unit is absent from the returned map.
 * Exceptions: Throws if no geodesic 4-hop land chain exists.
 */
function testBlindUnitInsideHomeIsOmittedWhenEveryOtherHomeHexIsExplored(): void {
  const chain = findGeodesicLandMassChain(4);
  const state = {
    ...buildLandChainState({
      chain,
      units: [{ id: 'opponent-inf-idle', player: 'opponent', unitType: 'infantry', h3Index: chain[0]! }],
    }),
    seats: [{ seatId: 'human' as const, seatOrder: 1, kind: 'human' as const, homeRegion: 'Home', outTurn: null, outBy: null, outReasons: [], place: null, consultationCount: 0, costUsd: 0, commander: null }, { seatId: 'opponent' as const, seatOrder: 2, kind: 'ai' as const, homeRegion: 'Away', outTurn: null, outBy: null, outReasons: [], place: null, consultationCount: 0, costUsd: 0, commander: null }], homeRegionHexesBySeat: { human: [chain[0]!, chain[1]!] },
    exploredHexes: [chain[0]!, chain[1]!],
  };

  const suggestions = suggestApproachDestinationsForOrderlessUnits('opponent', state, [
    'opponent-inf-idle',
  ]);

  assert.strictEqual(suggestions.has('opponent-inf-idle'), false);
}

/**
 * Ensures a missing or empty enemy-home list does not invent a march.
 *
 * Purpose: Without a home region there is no standing goal, and a fabricated hex would be worse than an em dash.
 * When to use: After changing the empty-home path.
 * Expected outcome: The unit is absent when the list is omitted, empty, or names only a hex that is not on the snapshot.
 * Exceptions: Throws if no geodesic 4-hop land chain exists.
 */
function testBlindUnitIsOmittedWhenHomeListIsMissingOrEmpty(): void {
  const chain = findGeodesicLandMassChain(4);
  const base = buildLandChainState({
    chain,
    units: [{ id: 'opponent-inf-idle', player: 'opponent', unitType: 'infantry', h3Index: chain[0]! }],
  });

  const missing = suggestApproachDestinationsForOrderlessUnits('opponent', base, ['opponent-inf-idle']);
  const empty = suggestApproachDestinationsForOrderlessUnits(
    'opponent',
    { ...base, seats: [{ seatId: 'human' as const, seatOrder: 1, kind: 'human' as const, homeRegion: 'Home', outTurn: null, outBy: null, outReasons: [], place: null, consultationCount: 0, costUsd: 0, commander: null }, { seatId: 'opponent' as const, seatOrder: 2, kind: 'ai' as const, homeRegion: 'Away', outTurn: null, outBy: null, outReasons: [], place: null, consultationCount: 0, costUsd: 0, commander: null }], homeRegionHexesBySeat: { human: [] } },
    ['opponent-inf-idle']
  );
  const offSnapshot = suggestApproachDestinationsForOrderlessUnits(
    'opponent',
    { ...base, seats: [{ seatId: 'human' as const, seatOrder: 1, kind: 'human' as const, homeRegion: 'Home', outTurn: null, outBy: null, outReasons: [], place: null, consultationCount: 0, costUsd: 0, commander: null }, { seatId: 'opponent' as const, seatOrder: 2, kind: 'ai' as const, homeRegion: 'Away', outTurn: null, outBy: null, outReasons: [], place: null, consultationCount: 0, costUsd: 0, commander: null }], homeRegionHexesBySeat: { human: ['not-a-snapshot-hex'] } },
    ['opponent-inf-idle']
  );

  assert.strictEqual(missing.has('opponent-inf-idle'), false);
  assert.strictEqual(empty.has('opponent-inf-idle'), false);
  assert.strictEqual(offSnapshot.has('opponent-inf-idle'), false);
}

/**
 * Ensures air units are never offered a march destination.
 *
 * Purpose: Air units reposition by ferry and `assignOrder` rejects march/pursue/patrol for them, so a suggestion here
 * would walk the model straight into a rejected order every turn.
 * When to use: After changing the eligibility check or `AIR_INELIGIBLE_ORDER_TYPES`.
 * Expected outcome: Defend on the air unit's current hex even though an enemy is reachable. The order type is not march.
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

  assert.deepStrictEqual(suggestions.get('opponent-air-idle'), {
    orderType: 'defend',
    destinationH3: chain[0],
  });
  assert.notStrictEqual(suggestions.get('opponent-air-idle')?.orderType, 'march');
}

/**
 * Ensures an adjacent enemy hex is the suggested march when it is a legal step.
 *
 * Purpose: Best Options labels that hex move/melee. A suggestion on a different hex would send the standing order
 * somewhere other than the contact the table already lists.
 * When to use: After changing which occupied hexes are eligible suggestions.
 * Expected outcome: The suggestion is exactly the enemy hex.
 * Exceptions: Throws if no geodesic 4-hop land chain exists.
 */
function testAdjacentEnemyHexIsTheSuggestion(): void {
  const chain = findGeodesicLandMassChain(4);
  const state = buildLandChainState({
    chain,
    units: [
      { id: 'opponent-inf-idle', player: 'opponent', unitType: 'infantry', h3Index: chain[0]! },
      { id: 'human-inf-adj', player: 'human', unitType: 'infantry', h3Index: chain[1]! },
    ],
  });

  const suggestions = suggestApproachDestinationsForOrderlessUnits('opponent', state, [
    'opponent-inf-idle',
  ]);

  assert.deepStrictEqual(
    suggestions.get('opponent-inf-idle'),
    { orderType: 'march', destinationH3: chain[1] },
    'an adjacent legal enemy hex is the suggested destination'
  );
}

/**
 * Ensures an enemy inside this turn's budget beats the empty step in front of it.
 *
 * Purpose: Choosing the hex closest to the unit would name the empty step and miss the move/melee contact.
 * When to use: After changing contact-versus-approach preference.
 * Expected outcome: The suggestion is the enemy hex, and both that hex and the empty step are legal dests.
 * Exceptions: Throws if no geodesic 4-hop land chain exists, or if armor cannot legally reach both hexes.
 */
function testEnemyInsideBudgetBeatsTheEmptyStepInFront(): void {
  const chain = findGeodesicLandMassChain(4);
  const state = buildLandChainState({
    chain,
    units: [
      { id: 'opponent-arm-idle', player: 'opponent', unitType: 'armor', h3Index: chain[0]! },
      { id: 'human-inf-two', player: 'human', unitType: 'infantry', h3Index: chain[2]! },
    ],
  });
  const legal = getValidDestinations(
    { id: 'opponent-arm-idle', h3Index: chain[0]!, unitType: 'armor' },
    state
  );
  assert.ok(legal.includes(chain[1]!), 'fixture requires the empty step to be a legal dest');
  assert.ok(legal.includes(chain[2]!), 'fixture requires the enemy hex to be a legal dest');

  const suggestions = suggestApproachDestinationsForOrderlessUnits('opponent', state, [
    'opponent-arm-idle',
  ]);

  assert.deepStrictEqual(
    suggestions.get('opponent-arm-idle'),
    { orderType: 'march', destinationH3: chain[2] },
    'an enemy hex inside this turn\'s budget is suggested ahead of the empty step in front of it'
  );
}

/**
 * Ensures a contested hex is still suggested when a friendly is standing on the enemy.
 *
 * Purpose: Stay-put friendlies are skipped only when the hex holds no enemy. Contact remains a legal march dest.
 * When to use: After changing the stay-put exclusion.
 * Expected outcome: The suggestion is the contested hex.
 * Exceptions: Throws if no geodesic 4-hop land chain exists.
 */
function testContestedHexIsStillSuggested(): void {
  const chain = findGeodesicLandMassChain(4);
  const state = buildLandChainState({
    chain,
    units: [
      { id: 'opponent-inf-idle', player: 'opponent', unitType: 'infantry', h3Index: chain[0]! },
      { id: 'opponent-inf-stay', player: 'opponent', unitType: 'infantry', h3Index: chain[1]! },
      { id: 'human-inf-adj', player: 'human', unitType: 'infantry', h3Index: chain[1]! },
    ],
  });

  const suggestions = suggestApproachDestinationsForOrderlessUnits('opponent', state, [
    'opponent-inf-idle',
  ]);

  assert.deepStrictEqual(
    suggestions.get('opponent-inf-idle'),
    { orderType: 'march', destinationH3: chain[1] },
    'a contested hex is the suggested destination'
  );
}

/**
 * Ensures a unit already standing on the enemy is not given a march.
 *
 * Purpose: Nothing is strictly closer than distance 0, and a march to the current hex is dropped as already arrived.
 * When to use: After changing the closing filter or the own-hex exclusion.
 * Expected outcome: The unit is absent from the returned map.
 * Exceptions: Throws if no geodesic 4-hop land chain exists.
 */
function testUnitAlreadyOnTheEnemyIsOmitted(): void {
  const chain = findGeodesicLandMassChain(4);
  const state = {
    ...buildLandChainState({
      chain,
      units: [
        { id: 'opponent-inf-idle', player: 'opponent', unitType: 'infantry', h3Index: chain[0]! },
        { id: 'human-inf-here', player: 'human', unitType: 'infantry', h3Index: chain[0]! },
      ],
    }),
    seats: [{ seatId: 'human' as const, seatOrder: 1, kind: 'human' as const, homeRegion: 'Home', outTurn: null, outBy: null, outReasons: [], place: null, consultationCount: 0, costUsd: 0, commander: null }, { seatId: 'opponent' as const, seatOrder: 2, kind: 'ai' as const, homeRegion: 'Away', outTurn: null, outBy: null, outReasons: [], place: null, consultationCount: 0, costUsd: 0, commander: null }], homeRegionHexesBySeat: { human: [chain[4]!] },
  };

  const suggestions = suggestApproachDestinationsForOrderlessUnits('opponent', state, [
    'opponent-inf-idle',
  ]);

  assert.strictEqual(
    suggestions.has('opponent-inf-idle'),
    false,
    'a unit already on the enemy has no strictly closer dest'
  );
}

/**
 * Ensures an observed enemy still wins over a nearer-looking home-region hex.
 *
 * Purpose: Contact is a this-turn order. Substituting the enemy home region while an enemy is visible would march the
 * unit away from the fight the Best Options table is already listing.
 * When to use: After changing the enemy-visible versus blind branch.
 * Expected outcome: The suggestion is the adjacent enemy hex, not the farther home hex.
 * Exceptions: Throws if no geodesic 4-hop land chain exists.
 */
function testObservedEnemyBeatsTheHomeRegionGoal(): void {
  const chain = findGeodesicLandMassChain(4);
  const state = {
    ...buildLandChainState({
      chain,
      units: [
        { id: 'opponent-inf-idle', player: 'opponent', unitType: 'infantry', h3Index: chain[0]! },
        { id: 'human-inf-adj', player: 'human', unitType: 'infantry', h3Index: chain[1]! },
      ],
    }),
    seats: [{ seatId: 'human' as const, seatOrder: 1, kind: 'human' as const, homeRegion: 'Home', outTurn: null, outBy: null, outReasons: [], place: null, consultationCount: 0, costUsd: 0, commander: null }, { seatId: 'opponent' as const, seatOrder: 2, kind: 'ai' as const, homeRegion: 'Away', outTurn: null, outBy: null, outReasons: [], place: null, consultationCount: 0, costUsd: 0, commander: null }], homeRegionHexesBySeat: { human: [chain[4]!] },
  };

  const suggestions = suggestApproachDestinationsForOrderlessUnits('opponent', state, [
    'opponent-inf-idle',
  ]);

  assert.deepStrictEqual(suggestions.get('opponent-inf-idle'), {
    orderType: 'march',
    destinationH3: chain[1],
  });
}

/**
 * Ensures a naval unit is sent only to water or coastal home hexes.
 *
 * Purpose: An inland home hex is a march `assignOrder` cannot complete for a ship, so the nearer water hex has to win,
 * and a home list that is entirely inland has to produce no suggestion.
 * When to use: After changing the naval passability check.
 * Expected outcome: The water home hex is the march. The inland-only list and a fog-masked `unknown` home hex omit the unit.
 * Exceptions: Throws if no geodesic 4-hop land chain exists.
 */
function testNavalBlindMarchUsesWaterOrCoastalHomeHexesOnly(): void {
  const chain = findGeodesicLandMassChain(4);
  const base = buildLandChainState({
    chain,
    units: [{ id: 'opponent-nav-idle', player: 'opponent', unitType: 'naval', h3Index: chain[0]! }],
  });
  const withWater = {
    ...base,
    hexes: base.hexes.map((hex) =>
      hex.h3Index === chain[2] ? { ...hex, terrain: 'water' } : hex
    ),
    seats: [{ seatId: 'human' as const, seatOrder: 1, kind: 'human' as const, homeRegion: 'Home', outTurn: null, outBy: null, outReasons: [], place: null, consultationCount: 0, costUsd: 0, commander: null }, { seatId: 'opponent' as const, seatOrder: 2, kind: 'ai' as const, homeRegion: 'Away', outTurn: null, outBy: null, outReasons: [], place: null, consultationCount: 0, costUsd: 0, commander: null }], homeRegionHexesBySeat: { human: [chain[4]!, chain[2]!] },
  };
  const inlandOnly = {
    ...base,
    seats: [{ seatId: 'human' as const, seatOrder: 1, kind: 'human' as const, homeRegion: 'Home', outTurn: null, outBy: null, outReasons: [], place: null, consultationCount: 0, costUsd: 0, commander: null }, { seatId: 'opponent' as const, seatOrder: 2, kind: 'ai' as const, homeRegion: 'Away', outTurn: null, outBy: null, outReasons: [], place: null, consultationCount: 0, costUsd: 0, commander: null }], homeRegionHexesBySeat: { human: [chain[4]!] },
  };
  const foggedWater = {
    ...base,
    hexes: base.hexes.map((hex) =>
      hex.h3Index === chain[2] ? { ...hex, terrain: 'unknown', terrainKind: 'unknown' } : hex
    ),
    seats: [{ seatId: 'human' as const, seatOrder: 1, kind: 'human' as const, homeRegion: 'Home', outTurn: null, outBy: null, outReasons: [], place: null, consultationCount: 0, costUsd: 0, commander: null }, { seatId: 'opponent' as const, seatOrder: 2, kind: 'ai' as const, homeRegion: 'Away', outTurn: null, outBy: null, outReasons: [], place: null, consultationCount: 0, costUsd: 0, commander: null }], homeRegionHexesBySeat: { human: [chain[2]!] },
  };

  const waterSuggestion = suggestApproachDestinationsForOrderlessUnits('opponent', withWater, [
    'opponent-nav-idle',
  ]);
  const inlandSuggestion = suggestApproachDestinationsForOrderlessUnits('opponent', inlandOnly, [
    'opponent-nav-idle',
  ]);
  const foggedSuggestion = suggestApproachDestinationsForOrderlessUnits('opponent', foggedWater, [
    'opponent-nav-idle',
  ]);

  assert.deepStrictEqual(waterSuggestion.get('opponent-nav-idle'), {
    orderType: 'march',
    destinationH3: chain[2],
  });
  assert.strictEqual(inlandSuggestion.has('opponent-nav-idle'), false);
  assert.strictEqual(foggedSuggestion.has('opponent-nav-idle'), false);
}

/**
 * Reports whether two land-mass records share a continent or an island.
 *
 * Purpose: The fixture search has to know which home hex the suggestion function is allowed to keep.
 * When to use: Only while building the landmass split fixture.
 * Expected outcome: True when either id list overlaps.
 * Exceptions: None.
 */
function recordsShareLandMass(origin: StrategicLandMassRecord, candidate: StrategicLandMassRecord): boolean {
  const continents = new Set(origin.continentIds);
  const islands = new Set(origin.islandIds);
  return (
    candidate.continentIds.some((id) => continents.has(id)) ||
    candidate.islandIds.some((id) => islands.has(id))
  );
}

/**
 * Finds a unit hex whose nearer occupiable neighbor is a different landmass from a farther home hex.
 *
 * Purpose: Nearest-hex selection would pick the foreign hex. The suggestion must not, because `plan_route` cannot
 * reach across that boundary.
 * When to use: The landmass-split contract.
 * Expected outcome: Origin, a farther same-landmass hex, and a strictly closer foreign hex.
 * Exceptions: Throws when the loaded land-mass cache has no such triple.
 */
function findLandmassSplit(): { origin: string; shared: string; foreign: string } {
  const masses = getStrategicLandMassByH3();
  for (const [origin, originRecord] of masses) {
    if (!landUnitCanOccupyHex(origin, masses)) continue;
    let foreign: string | null = null;
    let foreignDistance = Infinity;
    for (const h3 of gridDisk(origin, 2)) {
      if (h3 === origin) continue;
      const record = masses.get(h3);
      if (!record || !landUnitCanOccupyHex(h3, masses) || recordsShareLandMass(originRecord, record)) continue;
      let distance: number;
      try {
        distance = gridDistance(origin, h3);
      } catch {
        continue;
      }
      if (distance < foreignDistance) {
        foreign = h3;
        foreignDistance = distance;
      }
    }
    if (foreign === null) continue;
    for (const [h3, record] of masses) {
      if (h3 === origin || record.waterPct >= STRATEGIC_LAND_MAX_WATER_PCT) continue;
      if (!recordsShareLandMass(originRecord, record) || !landUnitCanOccupyHex(h3, masses)) continue;
      let distance: number;
      try {
        distance = gridDistance(origin, h3);
      } catch {
        continue;
      }
      if (distance > foreignDistance) return { origin, shared: h3, foreign };
    }
  }
  throw new Error('loaded land-mass cache has no nearer foreign hex beside a farther shared hex');
}

/**
 * Ensures a blind land march stays on the unit's landmass.
 *
 * Purpose: A nearer home hex on another landmass is rejected by `assignOrder`, which puts the unit back in the
 * orderless table next turn.
 * When to use: After changing the continent and island overlap check.
 * Expected outcome: The shared hex is chosen when both are listed. The foreign hex alone omits the unit.
 * Exceptions: Throws when the land-mass cache has no split fixture.
 */
function testBlindLandMarchRequiresASharedLandmass(): void {
  const split = findLandmassSplit();
  const units = [{ id: 'opponent-inf-idle', player: 'opponent' as const, unitType: 'infantry', h3Index: split.origin }];
  const both = {
    ...buildLandChainState({ chain: [split.origin, split.shared, split.foreign], units }),
    seats: [{ seatId: 'human' as const, seatOrder: 1, kind: 'human' as const, homeRegion: 'Home', outTurn: null, outBy: null, outReasons: [], place: null, consultationCount: 0, costUsd: 0, commander: null }, { seatId: 'opponent' as const, seatOrder: 2, kind: 'ai' as const, homeRegion: 'Away', outTurn: null, outBy: null, outReasons: [], place: null, consultationCount: 0, costUsd: 0, commander: null }], homeRegionHexesBySeat: { human: [split.foreign, split.shared] },
  };
  const foreignOnly = {
    ...buildLandChainState({ chain: [split.origin, split.foreign], units }),
    seats: [{ seatId: 'human' as const, seatOrder: 1, kind: 'human' as const, homeRegion: 'Home', outTurn: null, outBy: null, outReasons: [], place: null, consultationCount: 0, costUsd: 0, commander: null }, { seatId: 'opponent' as const, seatOrder: 2, kind: 'ai' as const, homeRegion: 'Away', outTurn: null, outBy: null, outReasons: [], place: null, consultationCount: 0, costUsd: 0, commander: null }], homeRegionHexesBySeat: { human: [split.foreign] },
  };

  const chosen = suggestApproachDestinationsForOrderlessUnits('opponent', both, ['opponent-inf-idle']);
  const omitted = suggestApproachDestinationsForOrderlessUnits('opponent', foreignOnly, ['opponent-inf-idle']);

  assert.deepStrictEqual(chosen.get('opponent-inf-idle'), {
    orderType: 'march',
    destinationH3: split.shared,
  });
  assert.strictEqual(omitted.has('opponent-inf-idle'), false);
}

/**
 * Finds a dry origin, a nearer home hex the land route cannot enter, and a farther hex it can.
 *
 * Purpose: Nearest-hex selection would pick the wet cell. `plan_route` rejects the edge into a cell at or above the
 * water cap, so the suggestion has to take the farther dry cell.
 * When to use: The wet-home-hex contract.
 * Expected outcome: Origin, a strictly closer wet hex, and a farther dry hex on the same landmass.
 * Exceptions: Throws when the loaded land-mass cache has no such triple.
 */
function findWetHomeHex(): { origin: string; wet: string; dry: string } {
  const masses = getStrategicLandMassByH3();
  for (const [origin, originRecord] of masses) {
    if (!landUnitCanOccupyHex(origin, masses) || originRecord.waterPct >= STRATEGIC_LAND_MAX_WATER_PCT) continue;
    let wet: string | null = null;
    let wetDistance = Infinity;
    for (const h3 of gridDisk(origin, 4)) {
      if (h3 === origin) continue;
      const record = masses.get(h3);
      if (!record || record.waterPct < STRATEGIC_LAND_MAX_WATER_PCT) continue;
      if (!landUnitCanOccupyHex(h3, masses) || !recordsShareLandMass(originRecord, record)) continue;
      let distance: number;
      try {
        distance = gridDistance(origin, h3);
      } catch {
        continue;
      }
      if (distance < wetDistance) {
        wet = h3;
        wetDistance = distance;
      }
    }
    if (wet === null) continue;
    for (const [h3, record] of masses) {
      if (h3 === origin || record.waterPct >= STRATEGIC_LAND_MAX_WATER_PCT) continue;
      if (!recordsShareLandMass(originRecord, record) || !landUnitCanOccupyHex(h3, masses)) continue;
      let distance: number;
      try {
        distance = gridDistance(origin, h3);
      } catch {
        continue;
      }
      if (distance > wetDistance) return { origin, wet, dry: h3 };
    }
  }
  throw new Error('loaded land-mass cache has no nearer wet home hex beside a farther dry hex');
}

/**
 * Ensures a blind land march does not name a home hex the land route cannot enter.
 *
 * Purpose: A cell at or above the water cap can still share a continent id. Offering it makes `assignOrder` reject
 * the march and leaves the unit orderless.
 * When to use: After changing the water-cap check on home-region marches.
 * Expected outcome: The farther dry hex is chosen. A home list that contains only the wet hex omits the unit.
 * Exceptions: Throws when the land-mass cache has no wet-home fixture.
 */
function testBlindLandMarchSkipsAHomeHexTheRouteCannotEnter(): void {
  const fixture = findWetHomeHex();
  const units = [{ id: 'opponent-inf-idle', player: 'opponent' as const, unitType: 'infantry', h3Index: fixture.origin }];
  const both = {
    ...buildLandChainState({ chain: [fixture.origin, fixture.wet, fixture.dry], units }),
    seats: [{ seatId: 'human' as const, seatOrder: 1, kind: 'human' as const, homeRegion: 'Home', outTurn: null, outBy: null, outReasons: [], place: null, consultationCount: 0, costUsd: 0, commander: null }, { seatId: 'opponent' as const, seatOrder: 2, kind: 'ai' as const, homeRegion: 'Away', outTurn: null, outBy: null, outReasons: [], place: null, consultationCount: 0, costUsd: 0, commander: null }], homeRegionHexesBySeat: { human: [fixture.wet, fixture.dry] },
  };
  const wetOnly = {
    ...buildLandChainState({ chain: [fixture.origin, fixture.wet], units }),
    seats: [{ seatId: 'human' as const, seatOrder: 1, kind: 'human' as const, homeRegion: 'Home', outTurn: null, outBy: null, outReasons: [], place: null, consultationCount: 0, costUsd: 0, commander: null }, { seatId: 'opponent' as const, seatOrder: 2, kind: 'ai' as const, homeRegion: 'Away', outTurn: null, outBy: null, outReasons: [], place: null, consultationCount: 0, costUsd: 0, commander: null }], homeRegionHexesBySeat: { human: [fixture.wet] },
  };

  const chosen = suggestApproachDestinationsForOrderlessUnits('opponent', both, ['opponent-inf-idle']);
  const omitted = suggestApproachDestinationsForOrderlessUnits('opponent', wetOnly, ['opponent-inf-idle']);

  assert.deepStrictEqual(chosen.get('opponent-inf-idle'), {
    orderType: 'march',
    destinationH3: fixture.dry,
  });
  assert.strictEqual(omitted.has('opponent-inf-idle'), false);
}

/**
 * Ensures an orderless air unit is told to defend on its current hex.
 *
 * Purpose: Air cannot march. Defend on the hex it already occupies is the mission whether or not a strike is listed.
 * When to use: After changing the air branch or the optional strike-id argument.
 * Expected outcome: Defend on the unit's current hex when the strike-id set is omitted and when it contains the unit.
 * A missile on the same chain is absent.
 * Exceptions: Throws if no geodesic 4-hop land chain exists.
 */
function testStrikingAirUnitIsToldToDefendOnItsCurrentHex(): void {
  const chain = findGeodesicLandMassChain(4);
  const state = buildLandChainState({
    chain,
    units: [
      { id: 'opponent-air-idle', player: 'opponent', unitType: 'air', h3Index: chain[0]! },
      { id: 'opponent-m-idle', player: 'opponent', unitType: 'missile', h3Index: chain[1]! },
    ],
  });

  const omitted = suggestApproachDestinationsForOrderlessUnits('opponent', state, ['opponent-air-idle', 'opponent-m-idle']);
  const defending = suggestApproachDestinationsForOrderlessUnits(
    'opponent',
    state,
    ['opponent-air-idle', 'opponent-m-idle'],
    undefined,
    new Set(['opponent-air-idle'])
  );
  const defendOnBase = { orderType: 'defend' as const, destinationH3: chain[0] };

  assert.deepStrictEqual(omitted.get('opponent-air-idle'), defendOnBase);
  assert.strictEqual(omitted.has('opponent-m-idle'), false);
  assert.deepStrictEqual(defending.get('opponent-air-idle'), defendOnBase);
  assert.strictEqual(defending.has('opponent-m-idle'), false);
}

const tests: ReadonlyArray<{ name: string; fn: () => void }> = [
  {
    name: 'suggestApproachDestinationsForOrderlessUnits offers a closing hex that is not the unit\'s own',
    fn: testOrderlessUnitGetsClosingSuggestionThatIsNotItsOwnHex,
  },
  {
    name: 'suggestApproachDestinationsForOrderlessUnits marches a blind unit to the nearest enemy-home hex',
    fn: testBlindUnitOutsideHomeMarchesToNearestHomeHex,
  },
  {
    name: 'suggestApproachDestinationsForOrderlessUnits marches a unit inside the enemy home region to the nearest unexplored home hex',
    fn: testBlindUnitInsideHomeMarchesToNearestUnexploredHomeHex,
  },
  {
    name: 'suggestApproachDestinationsForOrderlessUnits omits a unit inside the home region when every other home hex is explored',
    fn: testBlindUnitInsideHomeIsOmittedWhenEveryOtherHomeHexIsExplored,
  },
  {
    name: 'suggestApproachDestinationsForOrderlessUnits omits a blind unit when the enemy-home list is missing, empty, or off the snapshot',
    fn: testBlindUnitIsOmittedWhenHomeListIsMissingOrEmpty,
  },
  {
    name: 'suggestApproachDestinationsForOrderlessUnits keeps an observed enemy ahead of the home-region goal',
    fn: testObservedEnemyBeatsTheHomeRegionGoal,
  },
  {
    name: 'suggestApproachDestinationsForOrderlessUnits sends a naval unit only to visible water or coastal home hexes',
    fn: testNavalBlindMarchUsesWaterOrCoastalHomeHexesOnly,
  },
  {
    name: 'suggestApproachDestinationsForOrderlessUnits keeps a blind land march on the unit\'s landmass',
    fn: testBlindLandMarchRequiresASharedLandmass,
  },
  {
    name: 'suggestApproachDestinationsForOrderlessUnits skips a home hex the land route cannot enter',
    fn: testBlindLandMarchSkipsAHomeHexTheRouteCannotEnter,
  },
  {
    name: 'suggestApproachDestinationsForOrderlessUnits defends an orderless air unit and omits a missile',
    fn: testStrikingAirUnitIsToldToDefendOnItsCurrentHex,
  },
  {
    name: 'suggestApproachDestinationsForOrderlessUnits defends an air unit instead of marching it',
    fn: testAirUnitsAreNeverOfferedAMarchDestination,
  },
  {
    name: 'suggestApproachDestinationsForOrderlessUnits names an adjacent enemy hex',
    fn: testAdjacentEnemyHexIsTheSuggestion,
  },
  {
    name: 'suggestApproachDestinationsForOrderlessUnits prefers an in-budget enemy hex over the empty step',
    fn: testEnemyInsideBudgetBeatsTheEmptyStepInFront,
  },
  {
    name: 'suggestApproachDestinationsForOrderlessUnits names a contested hex',
    fn: testContestedHexIsStillSuggested,
  },
  {
    name: 'suggestApproachDestinationsForOrderlessUnits omits a unit already on the enemy',
    fn: testUnitAlreadyOnTheEnemyIsOmitted,
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
