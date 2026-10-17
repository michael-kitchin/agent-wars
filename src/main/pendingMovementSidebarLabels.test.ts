/**
 * Contract tests for shared pending movement sidebar label helpers.
 * Run with: node dist/main/pendingMovementSidebarLabels.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gridDisk, latLngToCell } from 'h3-js';
import { GLOBAL_GAME_MAP, withGameMap } from '../shared/activeGameMap';
import { getStrategicHexCode } from '../shared/hexLlmCodeAssignment';
import {
  formatPendingMovementSidebarTargetLabel,
  formatTacticalDraftMarchPendingOrderTargetLabel,
} from '../shared/pendingMovementSidebarLabels';
import type { TacticalBattleSnapshot } from '../shared/tacticalBattleTypes';

test('formatPendingMovementSidebarTargetLabel names the destination code and the steps left', () => {
  withGameMap(GLOBAL_GAME_MAP, () => {
    const destination = '81263ffffffffff';
    assert.equal(formatPendingMovementSidebarTargetLabel(destination, 3), `→ ${getStrategicHexCode(destination)} · 3h`);
  });
  assert.equal(formatPendingMovementSidebarTargetLabel(null, 3), '→ ? · 3h');
});

test('formatTacticalDraftMarchPendingOrderTargetLabel shows unknown steps when the sub-unit is missing', () => {
  const center = latLngToCell(1, 2, 4);
  const battle: TacticalBattleSnapshot = {
    battleId: 'b',
    enclosingStrategicH3Index: center,
    tacticalChildH3Indexes: [...gridDisk(center, 1)],
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    subUnits: [],
  };
  const label = formatTacticalDraftMarchPendingOrderTargetLabel(battle, 'missing', center);
  assert.equal(label, '→ ? · ?h');
});

test('formatTacticalDraftMarchPendingOrderTargetLabel falls back safely on invalid destination H3', () => {
  const center = latLngToCell(3, 4, 4);
  const battle: TacticalBattleSnapshot = {
    battleId: 'b2',
    enclosingStrategicH3Index: center,
    tacticalChildH3Indexes: [...gridDisk(center, 1)],
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    subUnits: [
      {
        id: 'su',
        parentUnitId: 'p',
        player: 'human',
        unitType: 'infantry',
        h3Index: center,
        displayName: 'A',
      },
    ],
  };
  const label = formatTacticalDraftMarchPendingOrderTargetLabel(battle, 'su', 'not-a-valid-h3-cell');
  assert.equal(label, '→ ? · ?h');
});
