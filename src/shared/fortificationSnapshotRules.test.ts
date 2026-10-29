/**
 * Explored-hex fortification facts.
 *
 * Purpose: A ranged order may name an explored enemy fortification, and a hidden one stays hidden.
 * When to use: After changing `isExploredEnemyFortifiedHex`.
 * Expected outcome: True only for an explored hex another side has fortified.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GameStateSnapshot } from './ipc/gameStateTypes';
import { isExploredEnemyFortifiedHex } from './fortificationSnapshotRules';

/**
 * Builds the snapshot fields the fortification check reads.
 *
 * Purpose: The check does not need a full match.
 * When to use: The cases in this file.
 * Expected outcome: A snapshot whose explored list, control, and infrastructure are the given rows.
 * Exceptions: None.
 */
function snapshot(args: {
  readonly exploredHexes?: string[];
  readonly controller: string | null;
  readonly fortifiedCount: number;
}): GameStateSnapshot {
  return {
    exploredHexes: args.exploredHexes,
    strategicControl: [{ h3Index: 'hex', controllerPlayerId: args.controller }],
    strategicInfrastructure: [{
      h3Index: 'hex',
      urbanHexCount: 1,
      airportCount: 0,
      seaportCount: 0,
      fortifiedCount: args.fortifiedCount,
      fortifiableCount: 0,
    }],
  } as GameStateSnapshot;
}

test('an explored enemy fortification is a target and the other cases are not', () => {
  const explored = snapshot({ exploredHexes: ['hex'], controller: 'opponent', fortifiedCount: 2 });
  assert.equal(isExploredEnemyFortifiedHex(explored, 'hex', 'human'), true);
  assert.equal(isExploredEnemyFortifiedHex(snapshot({ exploredHexes: ['hex'], controller: 'opponent', fortifiedCount: 0 }), 'hex', 'human'), false);
  assert.equal(isExploredEnemyFortifiedHex(snapshot({ exploredHexes: ['hex'], controller: 'human', fortifiedCount: 2 }), 'hex', 'human'), false);
  assert.equal(isExploredEnemyFortifiedHex(snapshot({ exploredHexes: [], controller: 'opponent', fortifiedCount: 2 }), 'hex', 'human'), false);
});
