/**
 * Contract tests for `hexLlmCodeAssignment` parity with `hex-coordinates` registries.
 *
 * Purpose: Ensures the shared module used by renderer tooltip badges stays aligned with briefing/tool code paths.
 * When to use: `npm test` after edits to either module.
 * Expected outcome: Strategic maps match; per-parent res4 codes match tactical registry rows.
 * Exceptions: None.
 */

import * as assert from 'assert';
import { cellToChildren } from 'h3-js';
import {
  buildStrategicRes1H3ToCodeMap,
  getRes4ChildCodeWithinParent,
  sortCellsForStableLlmCodes,
} from '../shared/hexLlmCodeAssignment';
import {
  ensureStrategicCoordinateRegistryInitialized,
  getHexCodeForContext,
  initTacticalCoordinateRegistry,
} from './briefing/map/hex-coordinates';

const STRATEGIC_CTX = { mode: 'strategic' as const };

/**
 * Asserts every strategic code from the shared builder matches the main-process registry encoder.
 *
 * Purpose: Guards against drift after refactors that touch one path but not the other.
 * When to use: Default suite entry below.
 * Expected outcome: Pairwise equality for all res1 cells.
 * Exceptions: None.
 */
function testSharedStrategicMapMatchesHexCoordinates(): void {
  ensureStrategicCoordinateRegistryInitialized();
  const fromShared = buildStrategicRes1H3ToCodeMap();
  for (const [h3, code] of fromShared.entries()) {
    assert.strictEqual(getHexCodeForContext(h3, STRATEGIC_CTX), code);
  }
}

/**
 * Asserts res4 child codes equal those assigned by `initTacticalCoordinateRegistry` for the same parent.
 *
 * Purpose: Confirms `(XX.YY)` tooltip suffixes use the same `YY` as tactical LLM maps.
 * When to use: Default suite entry below.
 * Expected outcome: Equality for every res4 child under an arbitrary sample parent.
 * Exceptions: None.
 */
function testRes4ChildCodesMatchTacticalRegistry(): void {
  ensureStrategicCoordinateRegistryInitialized();
  const sample = [...buildStrategicRes1H3ToCodeMap().keys()][0]!;
  const battleId = 'hexLlmCodeAssignment-alignment-test';
  initTacticalCoordinateRegistry(battleId, sample);
  const children = sortCellsForStableLlmCodes(cellToChildren(sample, 4));
  const tacticalCtx = { mode: 'tactical' as const, battleId };
  for (const child of children) {
    assert.strictEqual(
      getRes4ChildCodeWithinParent(sample, child),
      getHexCodeForContext(child, tacticalCtx),
      `child ${child}`
    );
  }
}

function run(): void {
  testSharedStrategicMapMatchesHexCoordinates();
  testRes4ChildCodesMatchTacticalRegistry();
  console.log('hexLlmCodeAssignment.test.ts passed');
}

run();
