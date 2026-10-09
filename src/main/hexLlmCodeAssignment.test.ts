/**
 * Contract tests for `hexLlmCodeAssignment` parity with `hex-coordinates` registries.
 *
 * Purpose: Ensures the shared module used by renderer tooltip badges stays aligned with briefing/tool code paths.
 * When to use: `npm test` after edits to either module.
 * Expected outcome: Strategic maps match. Battle registry codes follow the footprint. Geometric child codes stay on the parent's own children.
 * Exceptions: None.
 */

import * as assert from 'assert';
import { GLOBAL_GAME_MAP, withGameMap } from '../shared/activeGameMap';
import { tacticalBattleFootprint, tacticalBattleHexCode } from '../shared/tacticalBattleFootprint';
import {
  buildStrategicH3ToCodeMap,
  getTacticalChildCodeWithinParent,
} from '../shared/hexLlmCodeAssignment';
import {
  ensureStrategicCoordinateRegistryInitialized,
  getH3IndexForCode,
  getHexCodeForContext,
  initTacticalCoordinateRegistry,
} from './briefing/map/hexCoordinates';

const STRATEGIC_CTX = { mode: 'strategic' as const };

/**
 * Asserts every strategic code from the shared builder matches the main-process registry encoder.
 *
 * Purpose: Guards against drift after refactors that touch one path but not the other.
 * When to use: Default suite entry below.
 * Expected outcome: Pairwise equality for all strategic cells.
 * Exceptions: None.
 */
function testSharedStrategicMapMatchesHexCoordinates(): void {
  ensureStrategicCoordinateRegistryInitialized();
  const fromShared = buildStrategicH3ToCodeMap();
  for (const [h3, code] of fromShared.entries()) {
    assert.strictEqual(getHexCodeForContext(h3, STRATEGIC_CTX), code);
  }
}

/**
 * Asserts battle codes follow the footprint, and geometric child codes do not cover the margin.
 *
 * Purpose: A margin cell shares the briefing code. The strategic map still codes only a parent's own children, in a different order.
 * When to use: Default suite entry below.
 * Expected outcome: Every footprint cell round-trips through the battle registry. A margin cell has no geometric child code.
 * Exceptions: None.
 */
function testBattleRegistryUsesFootprintCodes(): void {
  const sample = '81263ffffffffff';
  const battleId = 'hexLlmCodeAssignment-alignment-test';
  const tacticalCtx = { mode: 'tactical' as const, battleId };
  withGameMap(GLOBAL_GAME_MAP, () => {
    initTacticalCoordinateRegistry(battleId, sample);
    const footprint = tacticalBattleFootprint(sample);
    const core = new Set(footprint.coreChildH3Indexes);
    assert.ok(footprint.h3Indexes.length > core.size);
    for (const cell of footprint.h3Indexes) {
      const code = getHexCodeForContext(cell, tacticalCtx);
      assert.strictEqual(code, tacticalBattleHexCode(sample, cell), cell);
      assert.ok(code);
      assert.strictEqual(getH3IndexForCode(code, tacticalCtx), cell);
    }
    for (const child of footprint.coreChildH3Indexes) {
      assert.ok(getTacticalChildCodeWithinParent(sample, child));
    }
    const margin = footprint.h3Indexes.find((cell) => !core.has(cell));
    assert.ok(margin);
    assert.strictEqual(getTacticalChildCodeWithinParent(sample, margin), undefined);
  });
}

function run(): void {
  testSharedStrategicMapMatchesHexCoordinates();
  testBattleRegistryUsesFootprintCodes();
  console.log('hexLlmCodeAssignment.test.ts passed');
}

run();
