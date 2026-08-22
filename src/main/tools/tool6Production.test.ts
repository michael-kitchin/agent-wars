/**
 * Tool 6 production queue contracts for opponent AI cap handling.
 */

import * as assert from 'assert';
import { cellToLatLng } from 'h3-js';
import { getGameState, setHexController, setRes1InfrastructureForHex } from '../gameDb';
import { getHexBuildQueue } from '../gameActions';
import { getMaxUnitsPerType, parseGameSize } from '../../shared/gameSize';
import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { executeTool6 } from './tool6Production';

/**
 * Locates or provisions an opponent-controlled hex with the requested urban count.
 *
 * Purpose: Cap tests need a mixed-type hex (urban 2) and an infantry-only hex (urban 1) without depending on a particular seed city.
 * When to use: Inside `withTempGameDb` after `resetGameForNewMatch`.
 * Expected outcome: Hex id whose `getHexBuildQueue(..., 'opponent')` is controlled and buildable.
 * Exceptions: Throws when the seeded map has no hexes.
 */
function findOrProvisionOpponentBuildableHex(urbanHexCount: number): string {
  const state = getGameState();
  const existing = state.hexes.find((hex) => getHexBuildQueue(hex.h3Index, 'opponent').controlledByRequester);
  const h3Index = existing?.h3Index ?? state.hexes[0]?.h3Index;
  if (!h3Index) throw new Error('expected at least one map hex');
  if (!existing) setHexController(h3Index, 'opponent');
  setRes1InfrastructureForHex(h3Index, { urbanHexCount, airportCount: 0, seaportCount: 0 });
  const queue = getHexBuildQueue(h3Index, 'opponent');
  if (!queue.controlledByRequester || !queue.buildSectionVisible) {
    throw new Error('expected opponent-controlled buildable hex');
  }
  return h3Index;
}

/**
 * Builds coordinate helpers for Tool 6 using exact `cellToLatLng` pairs from the snapshot.
 *
 * Purpose: `set_build_queue` resolves hex from lat/lng; tests must round-trip the same pair used in the argument.
 * When to use: After reading `getGameState()`.
 * Expected outcome: Map plus a resolver that matches those pairs exactly.
 * Exceptions: None.
 */
function buildCoordHelpers(state: GameStateSnapshot): {
  latLngByH3: Map<string, [number, number]>;
  resolveToH3: (lat: number, lng: number) => string | undefined;
} {
  const latLngByH3 = new Map(
    state.hexes.map((hex) => [hex.h3Index, cellToLatLng(hex.h3Index) as [number, number]])
  );
  const resolveToH3 = (lat: number, lng: number): string | undefined => {
    for (const [h3Index, pair] of latLngByH3) {
      if (pair[0] === lat && pair[1] === lng) return h3Index;
    }
    return undefined;
  };
  return { latLngByH3, resolveToH3 };
}

/**
 * Returns a snapshot whose opponent count for `unitType` is at least the match cap.
 *
 * Purpose: Cap rejection reads `state.units`, not the DB unit table, so tests can pad without inserting rows.
 * When to use: Before `executeTool6` when the live seed is below cap.
 * Expected outcome: Same snapshot fields with extra opponent units of that type.
 * Exceptions: None.
 */
function withOpponentTypeAtCap(
  state: GameStateSnapshot,
  unitType: 'infantry' | 'armor'
): GameStateSnapshot {
  const cap = getMaxUnitsPerType(parseGameSize(state.gameSize))[unitType];
  const existing = state.units.filter((unit) => unit.player === 'opponent' && unit.unitType === unitType);
  const extras = Array.from({ length: Math.max(0, cap - existing.length) }, (_, index) => ({
    id: `cap-pad-${unitType}-${index}`,
    player: 'opponent',
    unitType,
    h3Index: existing[0]?.h3Index ?? state.hexes[0]!.h3Index,
  }));
  return { ...state, units: [...state.units, ...extras] };
}

/**
 * Ensures `set_build_queue` rejects a capped type when the hex can still build another type.
 *
 * Purpose: Turn 9 queued armor at 32/32 on hexes that could still build infantry; briefing hiding is not enough if JSON/tools still apply.
 * When to use: After edits to Tool 6 cap rejection.
 * Expected outcome: Armor at cap fails; infantry on the same hex succeeds; raw `getHexBuildQueue` still lists armor for the human UI.
 * Exceptions: None.
 */
function testSetBuildQueueRejectsCappedTypeWhenAlternativeExists(): void {
  withTempGameDb('aw-tool6-cap-alt-', () => {
    const h3Index = findOrProvisionOpponentBuildableHex(2);
    const queue = getHexBuildQueue(h3Index, 'opponent');
    assert.ok(queue.availableUnitTypes.includes('armor'));
    assert.ok(queue.availableUnitTypes.includes('infantry'));
    const state = withOpponentTypeAtCap(getGameState(), 'armor');
    const { latLngByH3, resolveToH3 } = buildCoordHelpers(state);
    const hex = latLngByH3.get(h3Index);
    assert.ok(hex);
    const armorResult = executeTool6(
      'set_build_queue',
      { hex, unitType: 'armor', count: 1 },
      state,
      latLngByH3,
      resolveToH3
    );
    assert.equal(armorResult.status, 'error');
    assert.match(String(armorResult.error ?? ''), /deployment cap/);
    assert.equal(getHexBuildQueue(h3Index, 'opponent').entries.length, 0);
    const infantryResult = executeTool6(
      'set_build_queue',
      { hex, unitType: 'infantry', count: 1 },
      state,
      latLngByH3,
      resolveToH3
    );
    assert.equal(infantryResult.status, 'ok');
    assert.ok(
      getHexBuildQueue(h3Index, 'opponent').availableUnitTypes.includes('armor'),
      'human/raw availability must stay unfiltered'
    );
  });
}

/**
 * Ensures pre-queue remains allowed when the hex can only build the capped type.
 *
 * Purpose: Urban-1 hexes have no alternative to infantry; blocking that queue would leave the hex idle until a unit dies.
 * When to use: After edits to Tool 6 cap rejection.
 * Expected outcome: `set_build_queue` infantry succeeds at the infantry cap on an infantry-only hex.
 * Exceptions: None.
 */
function testSetBuildQueueAllowsCappedTypeWhenNoAlternative(): void {
  withTempGameDb('aw-tool6-cap-only-', () => {
    const h3Index = findOrProvisionOpponentBuildableHex(1);
    const queue = getHexBuildQueue(h3Index, 'opponent');
    assert.deepEqual(queue.availableUnitTypes, ['infantry']);
    const state = withOpponentTypeAtCap(getGameState(), 'infantry');
    const { latLngByH3, resolveToH3 } = buildCoordHelpers(state);
    const hex = latLngByH3.get(h3Index);
    assert.ok(hex);
    const result = executeTool6(
      'set_build_queue',
      { hex, unitType: 'infantry', count: 1 },
      state,
      latLngByH3,
      resolveToH3
    );
    assert.equal(result.status, 'ok');
  });
}

function run(): void {
  testSetBuildQueueRejectsCappedTypeWhenAlternativeExists();
  testSetBuildQueueAllowsCappedTypeWhenNoAlternative();
  console.log('tool6Production.test.ts passed');
}

run();
