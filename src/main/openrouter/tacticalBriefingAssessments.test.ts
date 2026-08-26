/**
 * Lightweight tactical briefing assessments across an icosahedron face crossing.
 * Run: node dist/main/openrouter/tacticalBriefingAssessments.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { cellToParent, gridDisk } from 'h3-js';
import { gridHopDistanceBetween } from '../tools/assessUnitProximity';
import {
  tacticalRes4PentagonCrossingPair,
  tacticalRes4UnderRes1Corner,
} from '../tacticalBattle/testSupport/tacticalRes4HexFixtures';
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
  const pair = tacticalRes4PentagonCrossingPair();
  const battle: TacticalBattleSnapshot = {
    battleId: 'tb-briefing-crossing',
    enclosingRes1H3Index: pair.res1H3Index,
    res4ChildH3Indexes: pair.res4ChildH3Indexes,
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: Object.fromEntries(pair.res4ChildH3Indexes.map((h) => [h, 'plains'])),
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
  const origin = tacticalRes4UnderRes1Corner(12, 34, { latEpsilon: 0.01 });
  const far = [...gridDisk(origin, 3)].find((h) => gridHopDistanceBetween(origin, h) === 3);
  assert.ok(far, 'need a res4 cell three hops from origin');
  const res1 = cellToParent(origin, 1);
  const battle: TacticalBattleSnapshot = {
    battleId: 'tb-urban-range',
    enclosingRes1H3Index: res1,
    res4ChildH3Indexes: [...gridDisk(origin, 3)],
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: Object.fromEntries([...gridDisk(origin, 3)].map((h) => [h, 'plains'])),
    res4IsUrbanByH3: { [origin]: true },
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
  const origin = tacticalRes4UnderRes1Corner(12, 34, { latEpsilon: 0.01 });
  const neighbor = [...gridDisk(origin, 1)].find((h) => h !== origin);
  assert.ok(neighbor, 'need a ring-1 neighbor');
  const res1 = cellToParent(origin, 1);
  const battle: TacticalBattleSnapshot = {
    battleId: 'tb-mountain-los',
    enclosingRes1H3Index: res1,
    res4ChildH3Indexes: [...gridDisk(origin, 1)],
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    res4TerrainKindByH3: { [origin]: 'plains', [neighbor]: 'mountain' },
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
        h3Index: neighbor,
        displayName: 'Human Armor',
      },
    ],
  };

  const assessments = buildLightweightTacticalUnitAssessments(battle);
  const nearest = assessments[0]?.result.nearbyEnemies[0];
  assert.ok(nearest);
  assert.strictEqual(nearest.hexDistance, 1);
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
