/**
 * Contract tests for shared pending movement sidebar label helpers.
 * Run with: node dist/main/pendingMovementSidebarLabels.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gridDisk, latLngToCell } from 'h3-js';
import {
  formatPendingMovementSidebarTargetLabel,
  formatTacticalDraftMarchPendingOrderTargetLabel,
  TACTICAL_DRAFT_MARCH_DISPLAY_STATUS,
} from '../shared/pendingMovementSidebarLabels';
import type { TacticalBattleSnapshot } from '../shared/tacticalBattleTypes';

test('formatPendingMovementSidebarTargetLabel formats Nh (status)', () => {
  assert.equal(formatPendingMovementSidebarTargetLabel(3, 'en_route'), '3h (en_route)');
});

test('formatTacticalDraftMarchPendingOrderTargetLabel returns zero distance when sub-unit is missing', () => {
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
  assert.equal(label, `0h (${TACTICAL_DRAFT_MARCH_DISPLAY_STATUS})`);
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
  assert.equal(label, `0h (${TACTICAL_DRAFT_MARCH_DISPLAY_STATUS})`);
});
