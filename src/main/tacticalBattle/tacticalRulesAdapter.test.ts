/**
 * Tests for tactical rules adapter helpers. Run with: node dist/main/tacticalBattle/tacticalRulesAdapter.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gridDisk } from 'h3-js';
import { tacticalGridDiskNeighborsOrdered } from '../../shared/tacticalTransportLink';
import { tacticalMarchFirstStopAlongPath, tacticalMarchWithinGridSteps } from './tacticalRulesAdapter';
import { resetTacticalMovementPlanningCacheForTests } from './tacticalMovementPlanningCache';
import { firstRingCellDistinctFrom, tacticalCell } from './testSupport/tacticalHexFixtures';

test('tacticalMarchWithinRes4GridSteps allows same cell within limit zero', () => {
  const cell = tacticalCell(10, 20);
  assert.equal(tacticalMarchWithinGridSteps(cell, cell, 0), true);
});

test('tacticalMarchWithinRes4GridSteps matches grid distance for a res4 neighbor', () => {
  const center = tacticalCell(10, 20);
  const neighbor = firstRingCellDistinctFrom(center);
  assert.equal(tacticalMarchWithinGridSteps(center, neighbor, 0), false);
  assert.equal(tacticalMarchWithinGridSteps(center, neighbor, 1), true);
});

test('tacticalMarchFirstStopAlongPath stops at maxEdges when the path is longer', () => {
  const center = tacticalCell(5, 6);
  const ring1 = [...gridDisk(center, 1)];
  const ring2 = [...gridDisk(center, 2)];
  const footprint = new Set([...ring2]);
  const far = ring2.find((h) => !ring1.includes(h) && h !== center);
  assert.ok(far, 'need a res4 cell two steps from center');
  const { stopH3, consumedFullPath } = tacticalMarchFirstStopAlongPath(center, far, 1, footprint);
  assert.notEqual(stopH3, far);
  assert.equal(consumedFullPath, false);
  assert.ok(footprint.has(stopH3));
});

test('tacticalMarchFirstStopAlongPath reaches destination when within maxEdges', () => {
  const center = tacticalCell(7, 8);
  const neighbor = firstRingCellDistinctFrom(center);
  const footprint = new Set(gridDisk(center, 1));
  const { stopH3, consumedFullPath } = tacticalMarchFirstStopAlongPath(center, neighbor, 2, footprint);
  assert.equal(stopH3, neighbor);
  assert.equal(consumedFullPath, true);
});

test('tacticalMarchFirstStopAlongPath honors res4 road masks when battle snapshot includes them (armor through mountain)', () => {
  resetTacticalMovementPlanningCacheForTests();
  const p = tacticalCell(58, 68);
  const m = firstRingCellDistinctFrom(p);
  const ringM = tacticalGridDiskNeighborsOrdered(m);
  const w = ringM.find((h) => h !== p);
  assert.ok(w);
  const ringP = tacticalGridDiskNeighborsOrdered(p);
  const iPm = ringP.indexOf(m);
  assert.ok(iPm >= 0);
  const nP = ringP.length;
  const roadP = Array.from({ length: nP }, (_, j) => j === iPm);
  const railP = Array.from({ length: nP }, () => false);
  const ip = ringM.indexOf(p);
  const iw = ringM.indexOf(w);
  assert.ok(ip >= 0 && iw >= 0);
  const nM = ringM.length;
  const roadM = Array.from({ length: nM }, (_, j) => j === ip || j === iw);
  const railM = Array.from({ length: nM }, () => false);
  const footprint = new Set([p, m, w]);
  const battleBase = {
    battleId: 'tb-rules-road-mountain',
    tacticalTurnNumber: 1,
    subUnits: [
      {
        id: 'su-armor',
        parentUnitId: 'parent-1',
        player: 'human' as const,
        unitType: 'armor' as const,
        h3Index: p,
        displayName: 'Armor',
      },
    ],
    tacticalTerrainKindByH3: { [p]: 'plains', [m]: 'mountain', [w]: 'plains' },
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
  };
  const { stopH3: stuck } = tacticalMarchFirstStopAlongPath(p, m, 4, footprint, battleBase, 'armor');
  assert.equal(stuck, p);

  resetTacticalMovementPlanningCacheForTests();
  const { stopH3, consumedFullPath } = tacticalMarchFirstStopAlongPath(p, m, 4, footprint, {
    ...battleBase,
    tacticalRoadSidesByH3: { [p]: roadP, [m]: roadM },
    tacticalRailSidesByH3: { [p]: railP, [m]: railM },
  }, 'armor');
  assert.equal(stopH3, m);
  assert.equal(consumedFullPath, true);
});
