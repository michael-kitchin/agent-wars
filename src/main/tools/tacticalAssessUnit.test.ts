import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cellToLatLng } from 'h3-js';
import {
  buildTacticalToolFixture,
  type TacticalToolFixture,
  type TacticalToolFixtureOptions,
} from '../tacticalBattle/testSupport/tacticalToolFixtures';
import { executeAssessment } from './assessment';

type AssessResult = {
  status: string;
  error: string | null;
  unit?: { movementPointsThisBeat: number; rangedRangeThisBeat: number | null };
  nearbyEnemies?: Array<{
    unitId: string;
    hexDistance: number;
    inRangedRange: boolean;
    inEnemyRangedRange: boolean;
    canEnterCellThisBeat: boolean;
    estimatedBeatsToReach: number | null;
    estimatedBeatsToReachYou: number | null;
  }>;
  nearbyFriendlies?: Array<{ unitId: string; hexDistance: number }>;
  threats?: Array<{ severity: string; sourceUnit: string }>;
  canAttackThisBeat?: Array<{ unitId: string; attackType: string }>;
};

/**
 * Builds the standard line: AI infantry at near, AI armor at mid, human armor at far.
 *
 * Purpose: Shared setup for the assessment tests.
 * When to use: Every test in this file; pass terrain overrides as needed.
 * Expected outcome: A fixture battle.
 * Exceptions: None.
 */
function lineFixture(battleId: string, terrainByCell?: TacticalToolFixtureOptions['terrainByCell']): TacticalToolFixture {
  return buildTacticalToolFixture({
    battleId,
    terrainByCell,
    units: [
      { id: 'opp-inf', player: 'opponent', unitType: 'infantry', cell: 'near' },
      { id: 'opp-arm', player: 'opponent', unitType: 'armor', cell: 'mid' },
      { id: 'hum-arm', player: 'human', unitType: 'armor', cell: 'far' },
    ],
  });
}

/**
 * Runs `assess_unit` through the assessment dispatcher in battle mode.
 *
 * Purpose: Exercises the same entry point the tool loop calls.
 * When to use: Every test in this file.
 * Expected outcome: The raw tool result.
 * Exceptions: None.
 */
function assess(fx: TacticalToolFixture, toolName: string, args: Record<string, unknown>): AssessResult {
  return executeAssessment(toolName, args, fx.planState, fx.latLngByH3, fx.resolveToH3, fx.battle) as AssessResult;
}

test('battle assess_unit: reports fire, contact, and beats for the nearest enemy', () => {
  const result = assess(lineFixture('assess-happy'), 'assess_unit', { unitId: 'opp-inf' });
  assert.equal(result.status, 'ok');
  assert.equal(result.unit!.movementPointsThisBeat, 2);
  assert.equal(result.unit!.rangedRangeThisBeat, 2);
  assert.deepEqual(result.nearbyEnemies, [
    {
      ...result.nearbyEnemies![0],
      unitId: 'hum-arm',
      hexDistance: 2,
      inRangedRange: true,
      inEnemyRangedRange: true,
      canEnterCellThisBeat: true,
      estimatedBeatsToReach: 1,
      estimatedBeatsToReachYou: 1,
    },
  ]);
  assert.equal(result.threats![0]!.severity, 'critical');
  assert.equal(result.canAttackThisBeat![0]!.attackType, 'ranged');
  assert.deepEqual(
    result.nearbyFriendlies!.map((f) => [f.unitId, f.hexDistance]),
    [['opp-arm', 1]]
  );
});

test('battle assess_unit: forest caps infantry range to one', () => {
  const result = assess(lineFixture('assess-forest', { near: 'forest' }), 'assess_unit', { unitId: 'opp-inf' });
  assert.equal(result.unit!.rangedRangeThisBeat, 1);
  assert.equal(result.canAttackThisBeat![0]!.attackType, 'none');
});

test('battle assess_unit: radius limits the units reported', () => {
  const result = assess(lineFixture('assess-radius'), 'assess_unit', { unitId: 'opp-inf', radius: 1 });
  assert.equal(result.nearbyEnemies!.length, 0);
});

test('battle assess_unit: reports the terrain bonus on a matching cell', () => {
  const fx = buildTacticalToolFixture({
    battleId: 'assess-terrain-bonus',
    terrainByCell: { near: 'forest' },
    originBonusSettings: { countryBonusEnabled: false, terrainBonusEnabled: true },
    units: [
      {
        id: 'opp-inf',
        player: 'opponent',
        unitType: 'infantry',
        cell: 'near',
        origin: {
          birthH3Index: 'unused',
          birthTacticalH3Index: null,
          birthTerrainKind: 'forest',
          birthIsUrban: false,
          birthCountryName: null,
          birthCountryCode: null,
        },
      },
      { id: 'hum-arm', player: 'human', unitType: 'armor', cell: 'far' },
    ],
  });
  const unit = assess(fx, 'assess_unit', { unitId: 'opp-inf' }).unit as Record<string, unknown> | undefined;
  assert.deepEqual(unit?.originBonusHere, ['terrain']);
  assert.equal(unit?.birthTerrain, 'forest');
  assert.equal('birthCountry' in (unit ?? {}), false);
});

test('battle assess_unit and assess_hex: essential errors', () => {
  const fx = lineFixture('assess-errors');
  assert.equal(assess(fx, 'assess_unit', { unitId: 'missing' }).status, 'error');
  const hex = assess(fx, 'assess_hex', { position: cellToLatLng(fx.cells.far) });
  assert.equal(hex.status, 'error');
  assert.match(hex.error!, /tactical battles/);
});
