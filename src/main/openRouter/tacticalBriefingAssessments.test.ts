/**
 * Lightweight tactical briefing assessments across an icosahedron face crossing.
 * Run: node dist/main/openRouter/tacticalBriefingAssessments.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { cellToParent, gridDisk } from 'h3-js';
import { computeGridPathCellsPure } from '../../shared/h3GridRangePure';
import { gridHopDistanceBetween } from '../tools/assessUnitProximity';
import {
  tacticalPentagonCrossingPair,
  tacticalUnderCorner,
} from '../tacticalBattle/testSupport/tacticalHexFixtures';
import { buildLightweightTacticalUnitAssessments } from './tacticalBriefingAssessments';

/**
 * Battle snapshot placing one opponent armor and one human armor on a pair `gridDistance` cannot measure.
 *
 * Purpose: Both assertions below need the same all-plains footprint, and the fixture pair is the only interesting part.
 * When to use: The tests in this file.
 * Expected outcome: A snapshot whose two sub-units sit `hopDistance` apart across a face crossing.
 * Exceptions: None.
 */
function crossingBattleFixture(): { battle: TacticalBattleSnapshot; hopDistance: number } {
  const pair = tacticalPentagonCrossingPair();
  const battle: TacticalBattleSnapshot = {
    battleId: 'tb-briefing-crossing',
    enclosingStrategicH3Index: pair.strategicH3Index,
    tacticalChildH3Indexes: pair.tacticalChildH3Indexes,
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3: Object.fromEntries(pair.tacticalChildH3Indexes.map((h) => [h, 'plains'])),
    subUnits: [
      {
        id: 'opp-armor:01',
        parentUnitId: 'opp-armor',
        player: 'opponent',
        unitType: 'armor',
        h3Index: pair.originH3Index,
        displayName: 'Armor',
      },
      {
        id: 'hum-armor:01',
        parentUnitId: 'hum-armor',
        player: 'human',
        unitType: 'armor',
        h3Index: pair.crossingH3Index,
        displayName: 'Human Armor',
      },
    ],
  };
  return { battle, hopDistance: pair.hopDistance };
}

test('tactical Unit Status reports the real distance to an enemy gridDistance cannot measure', () => {
  const { battle, hopDistance } = crossingBattleFixture();

  const assessments = buildLightweightTacticalUnitAssessments(battle);

  const nearest = assessments[0]?.result.nearbyEnemies[0];
  assert.ok(nearest, 'the enemy must stay in Unit Status rather than being dropped');
  assert.strictEqual(nearest.unitId, 'hum-armor:01');
  assert.strictEqual(nearest.hexDistance, hopDistance);
  assert.ok(
    nearest.inRangedRange,
    `armor ${hopDistance} res4 hops away is inside its tactical ranged range`
  );
});

test('tactical Unit Status does not treat urban armor as in range of an enemy three hops away', () => {
  const origin = tacticalUnderCorner(12, 34, { latEpsilon: 0.01 });
  const far = [...gridDisk(origin, 3)].find((h) => gridHopDistanceBetween(origin, h) === 3);
  assert.ok(far, 'need a res4 cell three hops from origin');
  const strategic = cellToParent(origin, 1);
  const battle: TacticalBattleSnapshot = {
    battleId: 'tb-urban-range',
    enclosingStrategicH3Index: strategic,
    tacticalChildH3Indexes: [...gridDisk(origin, 3)],
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3: Object.fromEntries([...gridDisk(origin, 3)].map((h) => [h, 'plains'])),
    tacticalIsUrbanByH3: { [origin]: true },
    subUnits: [
      {
        id: 'opp-armor:01',
        parentUnitId: 'opp-armor',
        player: 'opponent',
        unitType: 'armor',
        h3Index: origin,
        displayName: 'Armor',
      },
      {
        id: 'hum-armor:01',
        parentUnitId: 'hum-armor',
        player: 'human',
        unitType: 'armor',
        h3Index: far,
        displayName: 'Human Armor',
      },
    ],
  };

  const assessments = buildLightweightTacticalUnitAssessments(battle);
  const nearest = assessments[0]?.result.nearbyEnemies[0];
  assert.ok(nearest);
  assert.strictEqual(nearest.hexDistance, 3);
  assert.equal(nearest.inRangedRange, false);
});

test('tactical Unit Status does not treat mountain-blocked armor as in ranged range', () => {
  const origin = tacticalUnderCorner(12, 34, { latEpsilon: 0.01 });
  const far = [...gridDisk(origin, 2)].find((candidate) => {
    if (gridHopDistanceBetween(origin, candidate) !== 2) return false;
    const path = computeGridPathCellsPure(origin, candidate);
    return path !== null && path.length >= 3 && path[0] === origin && path[path.length - 1] === candidate;
  });
  assert.ok(far, 'need a res4 cell two hops away with a cell between');
  const path = computeGridPathCellsPure(origin, far);
  assert.ok(path, 'need a cell between the shooter and the target');
  const footprint = [...gridDisk(origin, 2)];
  const terrain = Object.fromEntries(footprint.map((h) => [h, 'plains']));
  for (const between of path.slice(1, -1)) terrain[between] = 'mountain';
  const strategic = cellToParent(origin, 1);
  const battle: TacticalBattleSnapshot = {
    battleId: 'tb-mountain-los',
    enclosingStrategicH3Index: strategic,
    tacticalChildH3Indexes: footprint,
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3: terrain,
    subUnits: [
      {
        id: 'opp-armor:01',
        parentUnitId: 'opp-armor',
        player: 'opponent',
        unitType: 'armor',
        h3Index: origin,
        displayName: 'Armor',
      },
      {
        id: 'hum-armor:01',
        parentUnitId: 'hum-armor',
        player: 'human',
        unitType: 'armor',
        h3Index: far,
        displayName: 'Human Armor',
      },
    ],
  };

  const assessments = buildLightweightTacticalUnitAssessments(battle);
  const nearest = assessments[0]?.result.nearbyEnemies[0];
  assert.ok(nearest);
  assert.strictEqual(nearest.hexDistance, 2);
  assert.equal(nearest.inRangedRange, false);
});

test('tactical threat severity reflects a close enemy across a face crossing', () => {
  const { battle } = crossingBattleFixture();

  const assessments = buildLightweightTacticalUnitAssessments(battle);

  const threat = assessments[0]?.result.threats[0];
  assert.ok(threat, 'a close enemy must raise a threat');
  assert.strictEqual(threat.sourceUnit, 'hum-armor:01');
  assert.strictEqual(threat.severity, 'moderate');
});
