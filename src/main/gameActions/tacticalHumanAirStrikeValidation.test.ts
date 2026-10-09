/**
 * Air-strike targets in the battle margin.
 * Run: `node dist/main/gameActions/tacticalHumanAirStrikeValidation.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cellToParent } from 'h3-js';
import { GLOBAL_GAME_MAP, withGameMap } from '../../shared/activeGameMap';
import type { TacticalBattleSnapshot, TacticalSubUnitSnapshot } from '../../shared/tacticalBattleTypes';
import { tacticalBattleFootprint } from '../../shared/tacticalBattleFootprint';
import { dbRun } from '../gameDb';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { tacticalCell } from '../tacticalBattle/testSupport/tacticalHexFixtures';
import { validateTacticalHumanAirStrikeGroup } from './tacticalHumanAirStrikeValidation';

/**
 * Builds the smallest battle the air-strike validator reads.
 *
 * Purpose: The contract under test is footprint membership, not a full match snapshot.
 * When to use: These tests only.
 * Expected outcome: One air sub-unit and one enemy on the requested target.
 * Exceptions: None.
 */
function battleForTarget(args: {
  enclosing: string;
  playable: readonly string[];
  core: readonly string[] | undefined;
  airCell: string;
  target: string;
}): TacticalBattleSnapshot {
  const air: TacticalSubUnitSnapshot = {
    id: 'air-1',
    parentUnitId: 'parent-air',
    player: 'human',
    unitType: 'air',
    h3Index: args.airCell,
    displayName: 'Air 1',
  };
  const enemy: TacticalSubUnitSnapshot = {
    id: 'enemy-1',
    parentUnitId: 'parent-enemy',
    player: 'opponent',
    unitType: 'infantry',
    h3Index: args.target,
    displayName: 'Enemy 1',
  };
  return {
    battleId: 'margin-air',
    enclosingStrategicH3Index: args.enclosing,
    tacticalChildH3Indexes: [...args.playable],
    ...(args.core ? { coreChildH3Indexes: args.core } : {}),
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    subUnits: [air, enemy],
  };
}

test('a margin cell is a legal unit air-strike target and not an infrastructure target', () => {
  withTempGameDb('tactical-air-margin', () => {
    withGameMap(GLOBAL_GAME_MAP, () => {
      const airCell = tacticalCell(56, 66);
      const enclosing = cellToParent(airCell, 1);
      dbRun(
        `INSERT INTO res_s_infrastructure (h3_index, urban_hex_count, airport_count, seaport_count)
         VALUES (?, 1, 1, 1)
         ON CONFLICT(h3_index) DO UPDATE SET urban_hex_count = 1, airport_count = 1, seaport_count = 1`,
        [enclosing]
      );
      const footprint = tacticalBattleFootprint(enclosing);
      const margin = footprint.h3Indexes.find((cell) => !footprint.coreChildH3Indexes.includes(cell));
      assert.ok(margin);
      const snap = battleForTarget({
        enclosing,
        playable: footprint.h3Indexes,
        core: footprint.coreChildH3Indexes,
        airCell,
        target: margin,
      });
      const units = validateTacticalHumanAirStrikeGroup(snap, ['air-1'], margin, 'units');
      assert.equal(units.success, true);
      for (const targetType of ['urban', 'airport', 'seaport'] as const) {
        const infra = validateTacticalHumanAirStrikeGroup(snap, ['air-1'], margin, targetType);
        assert.equal(infra.success, false);
      }
      const withoutCore = battleForTarget({
        enclosing,
        playable: footprint.h3Indexes,
        core: undefined,
        airCell,
        target: margin,
      });
      const legacy = validateTacticalHumanAirStrikeGroup(withoutCore, ['air-1'], margin, 'urban');
      assert.equal(legacy.success, false);
    });
  });
});
