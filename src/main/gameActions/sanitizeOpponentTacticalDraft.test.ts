/**
 * Contract tests for opponent tactical draft sanitization at Ready commit.
 * Run with: node dist/main/gameActions/sanitizeOpponentTacticalDraft.test.js
 */

import * as assert from 'assert';
import { beforeEach, test } from 'node:test';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { resetTacticalMovementPlanningCacheForTests } from '../tacticalBattle/tacticalMovementPlanningCache';
import {
  firstRingCellDistinctFrom,
  tacticalParentCell,
  tacticalCell,
} from '../tacticalBattle/testSupport/tacticalHexFixtures';
import { sanitizeOpponentTacticalDraftForReadyCommit } from './gameActionsCore';

beforeEach(() => {
  resetTacticalMovementPlanningCacheForTests();
});

/**
 * Defines the `minimalOpponentMarchBattle` function shape (function minimalOpponentMarchBattle(unitH3: string, footprint: string[]): TacticalBattleSnapshot).
 *
 * Purpose: Builds a minimal tactical snapshot with one opponent sub-unit for sanitize tests.
 * When to use: Same-hex and distinct-destination march sanitize cases.
 * Expected outcome: Snapshot satisfies `sanitizeOpponentTacticalDraftForReadyCommit` inputs.
 * Exceptions: None.
 */
function minimalOpponentMarchBattle(
  unitH3: string,
  footprint: string[],
  unitType: TacticalBattleSnapshot['subUnits'][number]['unitType'] = 'infantry'
): TacticalBattleSnapshot {
  const lat = 39;
  const lng = 49;
  return {
    battleId: 'sanitize-no-op',
    enclosingStrategicH3Index: tacticalParentCell(lat, lng),
    tacticalChildH3Indexes: footprint,
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    subUnits: [
      {
        id: 'opp:01',
        parentUnitId: 'opp-parent',
        player: 'opponent',
        unitType,
        h3Index: unitH3,
        displayName: 'Opp',
      },
    ],
  };
}

test('sanitize drops same-hex opponent march (stale no-op recycle guard)', () => {
  const center = tacticalCell(39, 49);
  const battle = minimalOpponentMarchBattle(center, [center], 'naval');
  const draft = {
    movementOrders: [{ unitId: 'opp:01', toH3Index: center }],
    rangedAttacks: [],
    airStrikes: [],
    ferryOrders: [],
    embarkOrders: [],
  };
  const result = sanitizeOpponentTacticalDraftForReadyCommit(battle, draft);
  assert.strictEqual(result, undefined);
});

test('sanitize keeps opponent march to a different reachable hex', () => {
  const center = tacticalCell(40, 50);
  const neighbor = firstRingCellDistinctFrom(center);
  const battle = minimalOpponentMarchBattle(center, [center, neighbor]);
  const draft = {
    movementOrders: [{ unitId: 'opp:01', toH3Index: neighbor }],
    rangedAttacks: [],
    airStrikes: [],
    ferryOrders: [],
    embarkOrders: [],
  };
  const result = sanitizeOpponentTacticalDraftForReadyCommit(battle, draft);
  assert.ok(result);
  assert.strictEqual(result.movementOrders.length, 1);
  assert.strictEqual(result.movementOrders[0]!.toH3Index, neighbor);
});
