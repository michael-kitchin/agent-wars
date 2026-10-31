/**
 * Contract tests for holding a shooter whose tactical step was shortened.
 *
 * Purpose: A shortened step must stay put when the sub-unit can already shoot, and must still be allowed onto an enemy cell or when the ordered cell is reachable.
 * When to use: After edits to `holdsShooterOnClampedMove`.
 * Expected outcome: The cases below. The positive fixture first proves the ranged resolver sees the enemy.
 * Exceptions: AssertionError on contract drift.
 */

import assert from 'node:assert/strict';
import { cellToParent, gridDisk, gridDistance } from 'h3-js';
import { test } from 'node:test';
import { AI_SEAT_IDS, HUMAN_SEAT_ID } from '../../shared/seatIds';
import type { TacticalBattlePlayerId, TacticalBattleSnapshot, TacticalSubUnitSnapshot } from '../../shared/tacticalBattleTypes';
import { holdsShooterOnClampedMove } from './tacticalClampedMoveGuards';
import { pickClosestEnemyTacticalRangedTargetForSubUnit } from './tacticalRangedTargetResolve';
import { tacticalParentCell, tacticalUnderCorner } from './testSupport/tacticalHexFixtures';

/**
 * One infantry sub-unit on a plains cell.
 *
 * Purpose: The hold cases need two sides and a known cell without repeating the snapshot fields.
 * When to use: Building the battle in this file.
 * Expected outcome: A sub-unit of the given player on that cell.
 * Exceptions: None.
 */
function infantry(id: string, player: TacticalBattlePlayerId, h3Index: string): TacticalSubUnitSnapshot {
  return {
    id,
    parentUnitId: id,
    player,
    unitType: 'infantry',
    h3Index,
    displayName: id,
  };
}

/**
 * A plains battle whose footprint is the cells under one strategic parent.
 *
 * Purpose: The ranged resolver needs the cells in the footprint and plains terrain, or a distance-1 enemy is not a legal shot.
 * When to use: Every case in this file.
 * Expected outcome: A snapshot the resolver can score.
 * Exceptions: None.
 */
function plainsBattle(units: TacticalSubUnitSnapshot[], cells: readonly string[]): TacticalBattleSnapshot {
  return {
    battleId: 'tb-shooter-hold',
    enclosingStrategicH3Index: tacticalParentCell(12, 34),
    tacticalChildH3Indexes: [...cells],
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3: Object.fromEntries(cells.map((cell) => [cell, 'plains'])),
    subUnits: units,
  };
}

/**
 * Cells under the shooter's strategic parent, nearest first.
 *
 * Purpose: The applied, ordered, and enemy cells have to be inside the footprint.
 * When to use: Once, before the cases choose cells by distance.
 * Expected outcome: The disk cells that share the shooter's parent, including the shooter cell.
 * Exceptions: AssertionError when a required distance is missing.
 */
function footprint(): { shooterH3: string; cells: string[] } {
  const strategic = tacticalParentCell(12, 34);
  const shooterH3 = tacticalUnderCorner(12, 34, { latEpsilon: 0.01, lngEpsilon: 0.01 });
  const cells = [...gridDisk(shooterH3, 8)].filter((cell) => cellToParent(cell, 1) === strategic);
  return { shooterH3, cells };
}

/**
 * The first footprint cell at a hop distance from the shooter, skipping named cells.
 *
 * Purpose: The cases need an empty neighbor, a farther ordered cell, and an enemy beyond infantry range.
 * When to use: After `footprint`.
 * Expected outcome: A cell at that distance.
 * Exceptions: AssertionError when the disk has no such cell.
 */
function cellAt(cells: readonly string[], shooterH3: string, distance: number, skip: ReadonlySet<string>): string {
  const found = cells.find((cell) => !skip.has(cell) && gridDistance(shooterH3, cell) === distance);
  assert.ok(found, `expected a cell at distance ${distance}`);
  return found;
}

test('a shortened step is held when the sub-unit can already shoot and the step enters no enemy', () => {
  const { shooterH3, cells } = footprint();
  const enemyH3 = cellAt(cells, shooterH3, 1, new Set([shooterH3]));
  const appliedH3 = cellAt(cells, shooterH3, 1, new Set([shooterH3, enemyH3]));
  const orderedH3 = cellAt(cells, shooterH3, 2, new Set([shooterH3]));
  const battle = plainsBattle(
    [infantry('opp-infantry:01', AI_SEAT_IDS[0], shooterH3), infantry('hum-infantry:01', HUMAN_SEAT_ID, enemyH3)],
    cells
  );
  assert.equal(pickClosestEnemyTacticalRangedTargetForSubUnit(battle, 'opp-infantry:01'), enemyH3);
  assert.equal(
    holdsShooterOnClampedMove({ battle, subUnitId: 'opp-infantry:01', orderedH3, appliedH3 }),
    true
  );
});

test('a shortened step onto an enemy cell is not held', () => {
  const { shooterH3, cells } = footprint();
  const enemyH3 = cellAt(cells, shooterH3, 1, new Set([shooterH3]));
  const orderedH3 = cellAt(cells, shooterH3, 2, new Set([shooterH3, enemyH3]));
  const battle = plainsBattle(
    [infantry('opp-infantry:01', AI_SEAT_IDS[0], shooterH3), infantry('hum-infantry:01', HUMAN_SEAT_ID, enemyH3)],
    cells
  );
  assert.equal(
    holdsShooterOnClampedMove({
      battle,
      subUnitId: 'opp-infantry:01',
      orderedH3,
      appliedH3: enemyH3,
    }),
    false
  );
});

test('a move that reaches the ordered cell is not held', () => {
  const { shooterH3, cells } = footprint();
  const enemyH3 = cellAt(cells, shooterH3, 1, new Set([shooterH3]));
  const orderedH3 = cellAt(cells, shooterH3, 2, new Set([shooterH3, enemyH3]));
  const battle = plainsBattle(
    [infantry('opp-infantry:01', AI_SEAT_IDS[0], shooterH3), infantry('hum-infantry:01', HUMAN_SEAT_ID, enemyH3)],
    cells
  );
  assert.equal(pickClosestEnemyTacticalRangedTargetForSubUnit(battle, 'opp-infantry:01'), enemyH3);
  assert.equal(
    holdsShooterOnClampedMove({
      battle,
      subUnitId: 'opp-infantry:01',
      orderedH3,
      appliedH3: orderedH3,
    }),
    false
  );
});

test('a shortened step is not held when the only enemy is out of infantry range', () => {
  const { shooterH3, cells } = footprint();
  const enemyH3 = cellAt(cells, shooterH3, 4, new Set([shooterH3]));
  const appliedH3 = cellAt(cells, shooterH3, 1, new Set([shooterH3]));
  const orderedH3 = cellAt(cells, shooterH3, 2, new Set([shooterH3, appliedH3]));
  const battle = plainsBattle(
    [infantry('opp-infantry:01', AI_SEAT_IDS[0], shooterH3), infantry('hum-infantry:01', HUMAN_SEAT_ID, enemyH3)],
    cells
  );
  assert.equal(pickClosestEnemyTacticalRangedTargetForSubUnit(battle, 'opp-infantry:01'), undefined);
  assert.equal(
    holdsShooterOnClampedMove({ battle, subUnitId: 'opp-infantry:01', orderedH3, appliedH3 }),
    false
  );
});

test('a friendly unit on the shortened step does not count as melee contact', () => {
  const { shooterH3, cells } = footprint();
  const enemyH3 = cellAt(cells, shooterH3, 1, new Set([shooterH3]));
  const appliedH3 = cellAt(cells, shooterH3, 1, new Set([shooterH3, enemyH3]));
  const orderedH3 = cellAt(cells, shooterH3, 2, new Set([shooterH3]));
  const battle = plainsBattle(
    [
      infantry('opp-infantry:01', AI_SEAT_IDS[0], shooterH3),
      infantry('opp-infantry:02', AI_SEAT_IDS[0], appliedH3),
      infantry('hum-infantry:01', HUMAN_SEAT_ID, enemyH3),
    ],
    cells
  );
  assert.equal(
    holdsShooterOnClampedMove({ battle, subUnitId: 'opp-infantry:01', orderedH3, appliedH3 }),
    true
  );
});

test('an unknown sub-unit id is not held', () => {
  const { shooterH3, cells } = footprint();
  const enemyH3 = cellAt(cells, shooterH3, 1, new Set([shooterH3]));
  const appliedH3 = cellAt(cells, shooterH3, 1, new Set([shooterH3, enemyH3]));
  const orderedH3 = cellAt(cells, shooterH3, 2, new Set([shooterH3]));
  const battle = plainsBattle(
    [infantry('opp-infantry:01', AI_SEAT_IDS[0], shooterH3), infantry('hum-infantry:01', HUMAN_SEAT_ID, enemyH3)],
    cells
  );
  assert.doesNotThrow(() => {
    assert.equal(
      holdsShooterOnClampedMove({ battle, subUnitId: 'missing', orderedH3, appliedH3 }),
      false
    );
  });
});
