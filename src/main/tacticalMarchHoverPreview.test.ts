/**
 * Tests tactical march hover preview construction. Run with: node dist/main/tacticalMarchHoverPreview.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gridDisk, gridDistance, latLngToCell } from 'h3-js';
import { formatTacticalDraftMarchPendingOrderTargetLabel } from '../shared/pendingMovementSidebarLabels';
import {
  buildTacticalMarchDraftDestinationPreview,
  buildTacticalMarchHoverPreview,
  tacticalHoverSolidEdgeCapByOriginH3,
} from '../shared/tacticalMarchHoverPreview';
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

test('buildTacticalMarchHoverPreview treats a friendly-occupied neighbor as a valid dest', () => {
  const center = latLngToCell(11, 21, 4);
  const ringCells = [...gridDisk(center, 2)];
  const neighbor = ringCells.find((h) => h !== center);
  assert.ok(neighbor);
  const battle: TacticalBattleSnapshot = {
    battleId: 'b-stack-hover',
    enclosingRes1H3Index: center,
    res4ChildH3Indexes: ringCells,
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    subUnits: [
      {
        id: 'su-join',
        parentUnitId: 'parent-join',
        player: 'human',
        unitType: 'infantry',
        h3Index: center,
        displayName: 'Inf Join',
      },
      {
        id: 'su-stay',
        parentUnitId: 'parent-stay',
        player: 'human',
        unitType: 'infantry',
        h3Index: neighbor,
        displayName: 'Inf Stay',
      },
    ],
  };
  const result = buildTacticalMarchHoverPreview(battle, ['su-join'], neighbor);
  assert.equal(result.validForAll, true);
  assert.equal(result.previews[0]?.preview.valid, true);
});

test('buildTacticalMarchDraftDestinationPreview matches hover path for one pending march row', () => {
  const center = latLngToCell(12, 22, 4);
  const ringCells = [...gridDisk(center, 2)];
  const neighbor = ringCells.find((h) => h !== center);
  assert.ok(neighbor);
  const battle: TacticalBattleSnapshot = {
    battleId: 'b-draft',
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
        displayName: 'Inf B',
      },
    ],
  };
  const hover = buildTacticalMarchHoverPreview(battle, ['su-human'], neighbor);
  const draft = buildTacticalMarchDraftDestinationPreview(battle, 'su-human', neighbor);
  assert.equal(hover.previews[0]?.preview.valid, draft.preview.valid);
  assert.deepEqual(hover.previews[0]?.preview.segments, draft.preview.segments);
  assert.ok(draft.pathH3Indexes && draft.pathH3Indexes.length >= 2);
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

test('buildTacticalMarchHoverPreview blocks mixed land and naval stacks when only naval can reach the destination', () => {
  const center = latLngToCell(14, 24, 4);
  const ring = [...gridDisk(center, 1)];
  const neighbor = ring.find((h) => h !== center);
  assert.ok(neighbor);
  const battle: TacticalBattleSnapshot = {
    battleId: 'b-naval-stack',
    enclosingRes1H3Index: center,
    res4ChildH3Indexes: ring,
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'coastal',
    res4TerrainKindByH3: {
      [center]: 'plains',
      [neighbor]: 'water',
    },
    subUnits: [
      {
        id: 'inf-same-hex',
        parentUnitId: 'p-inf',
        player: 'human',
        unitType: 'infantry',
        h3Index: center,
        displayName: 'Inf',
      },
      {
        id: 'nav-same-hex',
        parentUnitId: 'p-nav',
        player: 'human',
        unitType: 'naval',
        h3Index: center,
        displayName: 'Nav',
      },
    ],
  };
  const result = buildTacticalMarchHoverPreview(battle, ['inf-same-hex', 'nav-same-hex'], neighbor);
  assert.equal(result.validForAll, false);
  assert.equal(result.showInvalidMarker, true);
  assert.equal(result.previews.length, 2);
  for (const row of result.previews) {
    assert.strictEqual(row.preview.segments.length, 0);
  }
});

test('buildTacticalMarchHoverPreview prefers naval path for homogeneous infantry and naval on the same res4', () => {
  const center = latLngToCell(14, 24, 4);
  const ring = [...gridDisk(center, 1)];
  const neighbor = ring.find((h) => h !== center);
  assert.ok(neighbor);
  const battle: TacticalBattleSnapshot = {
    battleId: 'b-naval-stack',
    enclosingRes1H3Index: center,
    res4ChildH3Indexes: ring,
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'coastal',
    res4TerrainKindByH3: {
      [center]: 'plains',
      [neighbor]: 'water',
    },
    subUnits: [
      {
        id: 'inf-same-hex',
        parentUnitId: 'p-inf',
        player: 'human',
        unitType: 'infantry',
        h3Index: center,
        displayName: 'Inf',
      },
      {
        id: 'nav-same-hex',
        parentUnitId: 'p-nav',
        player: 'human',
        unitType: 'naval',
        h3Index: center,
        displayName: 'Nav',
      },
    ],
  };
  const result = buildTacticalMarchHoverPreview(battle, ['nav-same-hex'], neighbor);
  assert.equal(result.validForAll, true);
  assert.equal(result.previews.length, 1);
  assert.equal(result.previews[0]?.unitId, 'nav-same-hex');
  assert.equal(result.previews[0]?.preview.valid, true);
});

test('buildTacticalMarchHoverPreview accepts mixed land and naval stacks for shared coastal destinations', () => {
  const center = latLngToCell(15, 25, 4);
  const ring = [...gridDisk(center, 1)];
  const coastalNeighbor = ring.find((h) => h !== center);
  assert.ok(coastalNeighbor);
  const battle: TacticalBattleSnapshot = {
    battleId: 'b-mixed-coastal',
    enclosingRes1H3Index: center,
    res4ChildH3Indexes: ring,
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'coastal',
    res4TerrainKindByH3: {
      [center]: 'plains',
      [coastalNeighbor]: 'coastal',
    },
    subUnits: [
      {
        id: 'inf-same-hex',
        parentUnitId: 'p-inf',
        player: 'human',
        unitType: 'infantry',
        h3Index: center,
        displayName: 'Inf',
      },
      {
        id: 'nav-same-hex',
        parentUnitId: 'p-nav',
        player: 'human',
        unitType: 'naval',
        h3Index: center,
        displayName: 'Nav',
      },
    ],
  };
  const result = buildTacticalMarchHoverPreview(battle, ['inf-same-hex', 'nav-same-hex'], coastalNeighbor);
  assert.equal(result.validForAll, true);
  assert.equal(result.previews.length, 2);
  assert.ok(result.previews.every((row) => row.preview.segments.length > 0));
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

test('tacticalHoverSolidEdgeCapByOriginH3 holds a land stack to its slowest sub-unit even without its own preview', () => {
  const center = latLngToCell(13, 23, 4);
  const cells = [...gridDisk(center, 5)];
  const far = cells.find((h) => gridDistance(center, h) === 5);
  assert.ok(far);
  const battle: TacticalBattleSnapshot = {
    battleId: 'b-solid-cap',
    enclosingRes1H3Index: center,
    res4ChildH3Indexes: cells,
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    subUnits: [
      { id: 'su-arm', parentUnitId: 'p-arm', player: 'human', unitType: 'armor', h3Index: center, displayName: 'Arm A' },
      { id: 'su-inf', parentUnitId: 'p-inf', player: 'human', unitType: 'infantry', h3Index: center, displayName: 'Inf A' },
    ],
  };
  const capFor = (ids: string[]): number | undefined => {
    const group = buildTacticalMarchHoverPreview(battle, ids, far!);
    return tacticalHoverSolidEdgeCapByOriginH3(battle, ids, group.previews, far!).get(center);
  };
  assert.equal(buildTacticalMarchHoverPreview(battle, ['su-arm', 'su-inf'], far!).previews.length, 1);
  assert.equal(capFor(['su-arm']), 4);
  assert.equal(capFor(['su-arm', 'su-inf']), 2);
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
