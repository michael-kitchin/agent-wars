/**
 * Contract tests for the sea access rule. Run with: node dist/shared/seaAccess.test.js
 */

import assert from 'node:assert/strict';
import { gridDisk } from 'h3-js';
import {
  hasSeaAccess,
  NAVAL_NO_SEA_ACCESS_REASON,
  NAVAL_SEA_ACCESS_RULE_PART,
  SEAPORT_NO_SEA_ACCESS_LABEL,
  seaAccessCheckForHexes,
  type SeaAccessTerrain,
} from './seaAccess';

const CENTER = '8153bffffffffff';
const NEIGHBORS = gridDisk(CENTER, 1).filter((cell) => cell !== CENTER);

/**
 * Builds a lookup that gives every cell land terrain except the overrides.
 *
 * Purpose: Keeps each case to the one cell that matters.
 * When to use: Inside the cases below.
 * Expected outcome: A lookup answering land for any cell not overridden.
 * Exceptions: None.
 */
function lookupWith(overrides: Record<string, SeaAccessTerrain | undefined>) {
  return (h3Index: string): SeaAccessTerrain | undefined =>
    h3Index in overrides ? overrides[h3Index] : { terrain: 'land' };
}

/**
 * Checks the cases where sea access is present.
 *
 * Purpose: Water, coast by terrain, coast by kind, and a water or coast neighbor all count.
 * When to use: Run from `main`.
 * Expected outcome: Every case is true.
 * Exceptions: Propagates assertion errors.
 */
function testSeaAccessPresent(): void {
  assert.equal(hasSeaAccess(CENTER, lookupWith({ [CENTER]: { terrain: 'water' } })), true);
  assert.equal(hasSeaAccess(CENTER, lookupWith({ [CENTER]: { terrain: 'coastal' } })), true);
  assert.equal(hasSeaAccess(CENTER, lookupWith({ [CENTER]: { terrain: 'land', terrainKind: 'coastal' } })), true);
  assert.equal(hasSeaAccess(CENTER, lookupWith({ [NEIGHBORS[0]!]: { terrain: 'water' } })), true);
  assert.equal(hasSeaAccess(CENTER, lookupWith({ [NEIGHBORS[1]!]: { terrain: 'coastal' } })), true);
}

/**
 * Checks the cases where sea access is absent.
 *
 * Purpose: All-land, an unknown water neighbor, and a bad id give false without throwing.
 * When to use: Run from `main`.
 * Expected outcome: Every case is false.
 * Exceptions: Propagates assertion errors.
 */
function testSeaAccessAbsent(): void {
  assert.equal(hasSeaAccess(CENTER, lookupWith({})), false);
  assert.equal(hasSeaAccess(CENTER, lookupWith({ [NEIGHBORS[0]!]: undefined })), false);
  assert.equal(hasSeaAccess('not-a-cell', () => ({ terrain: 'water' })), false);
}

/**
 * Checks the list-based check against a port with water and a port without.
 *
 * Purpose: The renderer and tests build one check over a hex list.
 * When to use: Run from `main`.
 * Expected outcome: True next to water, false when every neighbor is land.
 * Exceptions: Propagates assertion errors.
 */
function testSeaAccessCheckForHexes(): void {
  const wet = seaAccessCheckForHexes([
    { h3Index: CENTER, terrain: 'land' },
    { h3Index: NEIGHBORS[0]!, terrain: 'water' },
  ]);
  assert.equal(wet(CENTER), true);
  const dry = seaAccessCheckForHexes([
    { h3Index: CENTER, terrain: 'land' },
    ...NEIGHBORS.map((h3Index) => ({ h3Index, terrain: 'land' })),
  ]);
  assert.equal(dry(CENTER), false);
}

/**
 * Checks the exact text of the three constants.
 *
 * Purpose: Players and commanders read these strings.
 * When to use: Run from `main`.
 * Expected outcome: Each equals its documented text.
 * Exceptions: Propagates assertion errors.
 */
function testConstants(): void {
  assert.equal(NAVAL_NO_SEA_ACCESS_REASON, 'Ships cannot be built here: this seaport has no water or coast next to it.');
  assert.equal(SEAPORT_NO_SEA_ACCESS_LABEL, 'Seaports (no sea access)');
  assert.equal(NAVAL_SEA_ACCESS_RULE_PART, 'water or coast in or next to the hex');
}

/**
 * Runs the sea access tests.
 *
 * Purpose: Entry point for the compiled test file.
 * When to use: Run directly with node.
 * Expected outcome: Prints a pass line.
 * Exceptions: Propagates assertion errors.
 */
function main(): void {
  testSeaAccessPresent();
  testSeaAccessAbsent();
  testSeaAccessCheckForHexes();
  testConstants();
  console.log('seaAccess tests passed');
}

main();
