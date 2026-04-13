/**
 * Tests tactical march hover preview construction. Run with: node dist/main/tacticalMarchHoverPreview.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gridDisk, latLngToCell } from 'h3-js';
import { formatTacticalDraftMarchPendingOrderTargetLabel } from '../shared/pendingMovementSidebarLabels';
import { buildTacticalMarchHoverPreview } from '../shared/tacticalMarchHoverPreview';
import type { TacticalBattleSnapshot } from '../shared/tacticalBattleTypes';

test('buildTacticalMarchHoverPreview marks in-range neighbor as valid', () => {
  const center = latLngToCell(10, 20, 4);
  const ringCells = [...gridDisk(center, 2)];
  const neighbor = ringCells.find((h) => h !== center);
  assert.ok(neighbor);
  const battle: TacticalBattleSnapshot = {
    battleId: 'b1',
    enclosingRes1H3Index: center,
    res4ChildH3Indexes: ringCells,
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    subUnits: [
      {
        id: 'su-human',
        parentUnitId: 'parent-1',
        player: 'human',
        unitType: 'infantry',
        h3Index: center,
        displayName: 'Inf A',
      },
    ],
  };
  const result = buildTacticalMarchHoverPreview(battle, ['su-human'], neighbor);
  assert.equal(result.validForAll, true);
  assert.ok(result.previews.length >= 1);
  assert.equal(result.previews[0]?.preview.valid, true);
  assert.ok((result.previews[0]?.preview.segments[0]?.hexes.length ?? 0) >= 2);
});

test('buildTacticalMarchHoverPreview rejects destinations outside the footprint', () => {
  const center = latLngToCell(11, 21, 4);
  const ringCells = [...gridDisk(center, 1)];
  const outside = latLngToCell(80, 170, 4);
  assert.ok(!ringCells.includes(outside));
  const battle: TacticalBattleSnapshot = {
    battleId: 'b2',
    enclosingRes1H3Index: center,
    res4ChildH3Indexes: ringCells,
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    subUnits: [
      {
        id: 'su-human',
        parentUnitId: 'parent-1',
        player: 'human',
        unitType: 'armor',
        h3Index: center,
        displayName: 'Arm A',
      },
    ],
  };
  const result = buildTacticalMarchHoverPreview(battle, ['su-human'], outside);
  assert.equal(result.validForAll, false);
});

test('buildTacticalMarchHoverPreview keeps distant in-footprint destination valid and previewed', () => {
  const center = latLngToCell(12, 22, 4);
  const ringCells = [...gridDisk(center, 4)];
  const far = ringCells.find((h) => h !== center && [...gridDisk(center, 1)].includes(h) === false);
  assert.ok(far);
  const battle: TacticalBattleSnapshot = {
    battleId: 'b4',
    enclosingRes1H3Index: center,
    res4ChildH3Indexes: ringCells,
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    subUnits: [
      {
        id: 'su-human',
        parentUnitId: 'parent-1',
        player: 'human',
        unitType: 'infantry',
        h3Index: center,
        displayName: 'Inf A',
      },
    ],
  };
  const result = buildTacticalMarchHoverPreview(battle, ['su-human'], far!);
  assert.equal(result.validForAll, true);
  assert.equal(result.previews[0]?.preview.valid, true);
  assert.ok((result.previews[0]?.preview.segments[0]?.hexes.length ?? 0) > 2);
});

test('formatTacticalDraftMarchPendingOrderTargetLabel reports res4 grid steps with strategic-style status', () => {
  const a = latLngToCell(5, 5, 4);
  const b = [...gridDisk(a, 1)].find((h) => h !== a);
  assert.ok(b);
  const battle: TacticalBattleSnapshot = {
    battleId: 'b3',
    enclosingRes1H3Index: a,
    res4ChildH3Indexes: [...gridDisk(a, 2)],
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    subUnits: [
      {
        id: 'su1',
        parentUnitId: 'p',
        player: 'human',
        unitType: 'infantry',
        h3Index: a,
        displayName: 'X',
      },
    ],
  };
  const label = formatTacticalDraftMarchPendingOrderTargetLabel(battle, 'su1', b!);
  assert.match(label, /^1h \(en_route\)$/);
});
