/**
 * Contract tests for range hex set builders used by the planning perimeter overlay.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { cellToChildren, gridDisk } from 'h3-js';
import { AIR_STRIKE_RANGE_HEXES } from '../shared/tacticalRanges';
import type { TacticalBattleSnapshot } from '../shared/tacticalBattleTypes';
import { getRange } from './combatConstants';
import {
  buildStrategicAirStrikeRangeSet,
  buildStrategicRangedRangeSet,
  buildTacticalAirStrikeRangeSet,
  buildTacticalRangedRangeSet,
  strategicRangedRangeHexesForUnitType,
  unitHasDirectRangedPlanning,
  unitHasStrategicRangedBaseline,
} from '../shared/rangePerimeterModel';

const ORIGIN = '81283ffffffffff';

/**
 * Defines the `testStrategicRangedInfantryHasEmptyDisk` function shape (function testStrategicRangedInfantryHasEmptyDisk(): void).
 *
 * Purpose: Ensures strategic infantry is melee-only and contributes no ranged perimeter cells.
 * When to use: Regression test for `buildStrategicRangedRangeSet` after infantry range is 0.
 * Expected outcome: Empty set; `strategicRangedRangeHexesForUnitType('infantry')` is 0.
 * Exceptions: None.
 */
function testStrategicRangedInfantryHasEmptyDisk(): void {
  assert.strictEqual(strategicRangedRangeHexesForUnitType('infantry'), 0);
  const set = buildStrategicRangedRangeSet([{ h3Index: ORIGIN, unitType: 'infantry' }]);
  assert.strictEqual(set.size, 0);
}

/**
 * Defines the `testStrategicRangedArmorDiskSize` function shape (function testStrategicRangedArmorDiskSize(): void).
 *
 * Purpose: Ensures strategic ranged range set matches `gridDisk` for armor (range 1).
 * When to use: Regression test for `buildStrategicRangedRangeSet`.
 * Expected outcome: Set equals the armor range disk around the origin.
 * Exceptions: None.
 */
function testStrategicRangedArmorDiskSize(): void {
  const units = [{ h3Index: ORIGIN, unitType: 'armor' }];
  const set = buildStrategicRangedRangeSet(units);
  const expected = new Set(gridDisk(ORIGIN, strategicRangedRangeHexesForUnitType('armor')));
  assert.strictEqual(set.size, expected.size);
  for (const h of expected) assert.ok(set.has(h));
}

/**
 * Defines the `testStrategicVsTacticalRangedPlanningGate` function shape (function testStrategicVsTacticalRangedPlanningGate(): void).
 *
 * Purpose: Locks the renderer theater split: infantry cannot enter strategic Ranged mode but can in tactical.
 * When to use: After changing `unitHasDirectRangedPlanning` or strategic infantry range.
 * Expected outcome: Infantry false/true; armor true in both theaters; unknown false.
 * Exceptions: None.
 */
function testStrategicVsTacticalRangedPlanningGate(): void {
  for (const t of ['infantry', 'armor', 'naval', 'air'] as const) {
    assert.equal(strategicRangedRangeHexesForUnitType(t), getRange(t), `perimeter table must match getRange(${t})`);
  }
  assert.equal(unitHasStrategicRangedBaseline('infantry'), false);
  assert.equal(unitHasStrategicRangedBaseline('armor'), true);
  assert.equal(unitHasDirectRangedPlanning('infantry', false), false);
  assert.equal(unitHasDirectRangedPlanning('infantry', true), true);
  assert.equal(unitHasDirectRangedPlanning('armor', false), true);
  assert.equal(unitHasDirectRangedPlanning('unknown', false), false);
}

/**
 * Locks the strategic vs tactical air-strike AA split in source so a later `getRange` swap cannot silently disable tactical infantry AA.
 *
 * Purpose: Strategic AA must skip melee-only types via `getRange`; tactical AA must use `unitHasTacticalRangedBaseline`.
 * When to use: After changing air-strike counter-fire eligibility in either theater.
 * Expected outcome: Both files contain the theater-specific skip predicates.
 * Exceptions: None.
 */
function testAirStrikeAaTheaterSplitInSource(): void {
  const strategic = fs.readFileSync(path.resolve(process.cwd(), 'src', 'main', 'gameActions', 'airStrikeResolution.ts'), 'utf8');
  const tactical = fs.readFileSync(
    path.resolve(process.cwd(), 'src', 'main', 'tacticalBattle', 'tacticalAirStrikeUnits.ts'),
    'utf8'
  );
  assert.ok(
    strategic.includes('if (getRange(defender.unit_type) < 1) continue;'),
    'strategic air-strike AA must skip types with getRange < 1 (infantry melee-only)'
  );
  assert.ok(
    tactical.includes('if (!unitHasTacticalRangedBaseline(defender.unitType)) continue;'),
    'tactical air-strike AA must use tactical ranged baseline so infantry can still AA'
  );
}

/**
 * Defines the `testStrategicAirStrikeDiskSize` function shape (function testStrategicAirStrikeDiskSize(): void).
 *
 * Purpose: Ensures strategic air-strike range set matches `AIR_STRIKE_RANGE_HEXES` disk.
 * When to use: Regression test for `buildStrategicAirStrikeRangeSet`.
 * Expected outcome: Set equals the air-strike disk around the origin.
 * Exceptions: None.
 */
function testStrategicAirStrikeDiskSize(): void {
  const units = [{ h3Index: ORIGIN, unitType: 'air' }];
  const set = buildStrategicAirStrikeRangeSet(units);
  const expected = new Set(gridDisk(ORIGIN, AIR_STRIKE_RANGE_HEXES));
  assert.strictEqual(set.size, expected.size);
}

/**
 * Defines the `testTacticalAirStrikeEqualsFootprint` function shape (function testTacticalAirStrikeEqualsFootprint(): void).
 *
 * Purpose: Verifies tactical air-strike perimeter uses the full tactical footprint.
 * When to use: Regression test for `buildTacticalAirStrikeRangeSet`.
 * Expected outcome: Returned set equals the input footprint.
 * Exceptions: None.
 */
function testTacticalAirStrikeEqualsFootprint(): void {
  const footprint = new Set(['842d85fffffffff', '842d87fffffffff']);
  const set = buildTacticalAirStrikeRangeSet(footprint);
  assert.deepStrictEqual([...set].sort(), [...footprint].sort());
}

/**
 * Defines the `minimalTacticalBattle` function shape (function minimalTacticalBattle(...): TacticalBattleSnapshot).
 *
 * Purpose: Builds a minimal tactical snapshot for range-set unit tests.
 * When to use: Tactical ranged clip test only.
 * Expected outcome: Snapshot satisfies `buildTacticalRangedRangeSet` inputs.
 * Exceptions: None.
 */
function minimalTacticalBattle(
  tacticalIndex: string[],
  subUnits: TacticalBattleSnapshot['subUnits']
): TacticalBattleSnapshot {
  return {
    battleId: 'test-battle',
    enclosingStrategicH3Index: ORIGIN,
    tacticalChildH3Indexes: tacticalIndex,
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    subUnits,
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
  };
}

/**
 * Defines the `testTacticalRangedClipsToFootprint` function shape (function testTacticalRangedClipsToFootprint(): void).
 *
 * Purpose: Verifies tactical ranged disks are clipped to the battle footprint.
 * When to use: Regression test for `buildTacticalRangedRangeSet`.
 * Expected outcome: Every hex in the set lies in the footprint and includes the anchor cell.
 * Exceptions: None.
 */
function testTacticalRangedClipsToFootprint(): void {
  const anchor = cellToChildren(ORIGIN, 4)[0]!;
  const battle = minimalTacticalBattle([anchor], [
    {
      id: 'u1:01',
      parentUnitId: 'u1',
      player: 'human',
      unitType: 'infantry',
      h3Index: anchor,
      displayName: 'Inf 1',
    },
  ]);
  const footprint = new Set(battle.tacticalChildH3Indexes);
  const set = buildTacticalRangedRangeSet(battle, battle.subUnits, footprint);
  for (const h of set) assert.ok(footprint.has(h));
  assert.ok(set.has(anchor));
}

/**
 * Documents the module-scope binding `tests` (tests).
 *
 * Purpose: Ordered test cases for range perimeter model builders.
 * When to use: This file's `run` entrypoint.
 * Expected outcome: Each entry has a `name` and zero-arg `fn`.
 * Exceptions: None.
 */
const tests = [
  { name: 'strategic ranged infantry has empty disk', fn: testStrategicRangedInfantryHasEmptyDisk },
  { name: 'strategic ranged armor disk size', fn: testStrategicRangedArmorDiskSize },
  { name: 'strategic vs tactical ranged planning gate', fn: testStrategicVsTacticalRangedPlanningGate },
  { name: 'air-strike AA theater split in source', fn: testAirStrikeAaTheaterSplitInSource },
  { name: 'strategic air strike disk size', fn: testStrategicAirStrikeDiskSize },
  { name: 'tactical air strike equals footprint', fn: testTacticalAirStrikeEqualsFootprint },
  { name: 'tactical ranged clips to footprint', fn: testTacticalRangedClipsToFootprint },
];

function run(): void {
  for (const t of tests) {
    try {
      t.fn();
      console.log(`OK ${t.name}`);
    } catch (err) {
      console.error(`FAIL ${t.name}`, err);
      process.exitCode = 1;
    }
  }
}

run();
