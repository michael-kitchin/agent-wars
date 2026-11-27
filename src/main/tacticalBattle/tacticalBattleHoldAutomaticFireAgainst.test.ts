/**
 * A battle beat with no consult fires nothing at a listed side.
 *
 * Purpose: The engine adds attacks for sub-units that were not ordered when a beat is committed, in a battle against the
 * human and in a battle between two commanders. Both have to read the firing side's `holdAutomaticFireAgainst` list.
 * When to use: `npm run build:main`, then `node dist/main/tacticalBattle/tacticalBattleHoldAutomaticFireAgainst.test.js`.
 * Expected outcome: Without a list the unordered sub-unit fires; with one it does not.
 * Exceptions: None. The temporary match is closed afterward.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gridDisk } from 'h3-js';
import { HUMAN_SEAT_ID, type AiSeatId, type OwnerId } from '../../shared/seatIds';
import type { TacticalBattleSnapshot, TacticalSubUnitSnapshot } from '../../shared/tacticalBattleTypes';
import { commitHumanTacticalDraftOrders } from '../gameActions/humanTacticalDraftCommit';
import { gameDbOps } from '../gameDb/dbConnection';
import { writeHoldAutomaticFireAgainstSeatIds } from '../gameDb/holdAutomaticFireAgainstMemory';
import { setActiveTacticalBattleSnapshotRef } from './activeTacticalBattleRef';
import { getActiveTacticalBattleSnapshot, startTacticalBattleForEnclosingHex } from './tacticalBattleSession';
import { tacticalDbFixtureRegisterDefaultAfterEach, tacticalDbFixtureWithTempDbContestedPlanning } from './testSupport/tacticalDbFixture';
import { withTwoAiBattle } from './testSupport/twoAiBattleFixture';

tacticalDbFixtureRegisterDefaultAfterEach();

/**
 * Leaves one infantry or armor sub-unit of each side, on adjacent cells.
 *
 * Purpose: Every shot of the beat then comes from one known cell to one known cell.
 * When to use: After a battle has started and before committing an empty beat.
 * Expected outcome: The active battle holds the two sub-units, and their cells are returned.
 * Exceptions: Fails the test when a side has no such sub-unit or the first cell has no neighbor in the footprint.
 */
function faceOff(battle: TacticalBattleSnapshot, first: OwnerId, second: OwnerId): { firstCell: string; secondCell: string } {
  /**
   * The first land sub-unit of a side that can fire at an adjacent cell.
   *
   * Purpose: The fixtures seed either unit type.
   * When to use: Once for each side.
   * Expected outcome: The sub-unit.
   * Exceptions: Fails the test when the side has none.
   */
  const landUnitOf = (owner: OwnerId): TacticalSubUnitSnapshot => {
    const found = battle.subUnits.find((unit) => unit.player === owner && (unit.unitType === 'infantry' || unit.unitType === 'armor'));
    assert.ok(found, `expected a land sub-unit of ${owner}`);
    return found;
  };
  const near = landUnitOf(first);
  const far = landUnitOf(second);
  const inside = new Set(battle.tacticalChildH3Indexes);
  const beside = gridDisk(near.h3Index, 1).find((cell) => cell !== near.h3Index && inside.has(cell));
  assert.ok(beside);
  setActiveTacticalBattleSnapshotRef({
    ...battle,
    tacticalTerrainKindByH3: Object.fromEntries(battle.tacticalChildH3Indexes.map((cell) => [cell, 'plains'])),
    subUnits: [near, { ...far, h3Index: beside }],
  });
  return { firstCell: near.h3Index, secondCell: beside };
}

/**
 * Commits a beat with no orders from anyone and returns the cells that fired.
 *
 * Purpose: Only the engine's own picks can fire.
 * When to use: After `faceOff`.
 * Expected outcome: The source cell of each ranged shot of the beat.
 * Exceptions: Fails the test when the commit fails.
 */
function firingCells(): string[] {
  const committed = commitHumanTacticalDraftOrders({ movementOrders: [] });
  if (!committed.success) assert.fail(committed.reason);
  return (committed.tacticalResolutionPlayback?.rangedResolutionShotLines ?? []).map((line) => line.fromH3Index);
}

for (const listed of [false, true]) {
  test(`against the human, an AI side ${listed ? 'holds its fire at the listed human' : 'fires on its own with no list'}`, () => {
    tacticalDbFixtureWithTempDbContestedPlanning('aw-automatic-fire-human-beat-', ({ targetStrategicH3 }) => {
      const started = startTacticalBattleForEnclosingHex(targetStrategicH3);
      assert.equal(started.success, true, started.reason);
      const battle = getActiveTacticalBattleSnapshot();
      assert.ok(battle);
      const enemy = battle.opposingPartyId as AiSeatId;
      if (listed) writeHoldAutomaticFireAgainstSeatIds(gameDbOps, enemy, [HUMAN_SEAT_ID], 1);
      const cells = faceOff(battle, enemy, HUMAN_SEAT_ID);
      assert.equal(firingCells().includes(cells.firstCell), !listed);
    });
  });

  test(`between two commanders, ${listed ? 'neither fires on its own at a listed side' : 'both fire on their own with no list'}`, () => {
    withTwoAiBattle('aw-automatic-fire-ai-beat-', (battle) => {
      const lead = battle.leadPartyId as AiSeatId;
      const opposing = battle.opposingPartyId as AiSeatId;
      if (listed) {
        writeHoldAutomaticFireAgainstSeatIds(gameDbOps, lead, [opposing], 1);
        writeHoldAutomaticFireAgainstSeatIds(gameDbOps, opposing, [lead], 1);
      }
      const cells = faceOff(battle, lead, opposing);
      const fired = firingCells();
      assert.deepEqual(
        [fired.includes(cells.firstCell), fired.includes(cells.secondCell)],
        [!listed, !listed]
      );
    });
  });
}
