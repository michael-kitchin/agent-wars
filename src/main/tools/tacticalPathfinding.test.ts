/**
 * Tests for tactical Tool1 plan_route / check_distance (tactical march planner, not strategic land-mass).
 */

import * as assert from 'assert';
import { cellToLatLng, cellToParent, gridDisk, gridDistance } from 'h3-js';
import type { GameStateSnapshot } from '../gameDb';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { buildTacticalAiPlanState } from '../tacticalBattle/buildTacticalAiPlanState';
import { tacticalParentCell, tacticalUnderCorner } from '../tacticalBattle/testSupport/tacticalHexFixtures';
import { buildTacticalToolFixture } from '../tacticalBattle/testSupport/tacticalToolFixtures';
import { executePathfinding } from './pathfinding';
import { executeTacticalCheckDistance } from './tacticalPathfinding';

/**
 * Builds a two-cell plains tactical footprint with opponent armor adjacent to human infantry.
 *
 * Purpose: Shared fixture for tactical Tool1 success paths without land-mass coupling.
 * When to use: plan_route / check_distance happy-path tests in this file.
 * Expected outcome: Adjacent tactical cells under one strategic parent with planState + latLng map.
 * Exceptions: Throws when no adjacent neighbor exists under the parent.
 */
function buildAdjacentArmorFixture(): {
  battle: TacticalBattleSnapshot;
  planState: GameStateSnapshot;
  latLngByH3: Map<string, [number, number]>;
  resolveToH3: (lat: number, lng: number) => string | undefined;
  oppId: string;
  tacticalOpp: string;
  tacticalHuman: string;
} {
  const parentCell = tacticalParentCell(12, 34);
  const tacticalOpp = tacticalUnderCorner(12, 34);
  const sameParent = [...gridDisk(tacticalOpp, 4)].filter((h) => cellToParent(h, 1) === parentCell);
  const tacticalHuman = sameParent.find((h) => h !== tacticalOpp && gridDistance(tacticalOpp, h) === 1);
  if (!tacticalHuman) throw new Error('expected adjacent res4 neighbor');
  const battle: TacticalBattleSnapshot = {
    battleId: 't-tool1-adj',
    enclosingStrategicH3Index: parentCell,
    tacticalChildH3Indexes: [tacticalOpp, tacticalHuman],
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3: { [tacticalOpp]: 'plains', [tacticalHuman]: 'plains' },
    subUnits: [
      {
        id: 'opp-arm-1',
        parentUnitId: 'parent-arm',
        player: 'opponent',
        unitType: 'armor',
        h3Index: tacticalOpp,
        displayName: 'Armor',
      },
      {
        id: 'hum-inf-1',
        parentUnitId: 'parent-inf',
        player: 'human',
        unitType: 'infantry',
        h3Index: tacticalHuman,
        displayName: 'Infantry',
      },
    ],
  };
  const strategic: GameStateSnapshot = {
    turnNumber: 1,
    phase: 'planning',
    hexes: [{ h3Index: parentCell, terrain: 'land', terrainKind: 'plains' }],
    units: [],
    pendingOrders: [],
  };
  const planState = buildTacticalAiPlanState(strategic, battle);
  const latLngByH3 = new Map<string, [number, number]>();
  for (const h of planState.hexes) {
    latLngByH3.set(h.h3Index, cellToLatLng(h.h3Index) as [number, number]);
  }
  const resolveToH3 = (lat: number, lng: number): string | undefined => {
    for (const [h3, ll] of latLngByH3) {
      if (Math.abs(ll[0] - lat) < 1e-9 && Math.abs(ll[1] - lng) < 1e-9) return h3;
    }
    return undefined;
  };
  return { battle, planState, latLngByH3, resolveToH3, oppId: 'opp-arm-1', tacticalOpp, tacticalHuman };
}

/**
 * Ensures tactical plan_route returns first-leg orderToH3 toward an adjacent enemy without land-mass failure.
 *
 * Purpose: Regression for the UI/no-movement bug where strategic land-mass rejected every tactical destination.
 * When to use: After edits to `executeTacticalPlanRoute` / `executePathfinding` tactical branch.
 * Expected outcome: status ok, orderToH3 is the adjacent human hex (reachable this turn).
 * Exceptions: Assertion failure on contract drift.
 */
function testTacticalPlanRouteAdjacentEnemyOk(): void {
  const { battle, planState, latLngByH3, resolveToH3, oppId, tacticalHuman } = buildAdjacentArmorFixture();
  const destLl = latLngByH3.get(tacticalHuman)!;
  const result = executePathfinding(
    'plan_route',
    { unitId: oppId, destination: destLl },
    planState,
    latLngByH3,
    resolveToH3,
    undefined,
    battle
  ) as { status: string; orderToH3?: string; reachable?: boolean; error?: string };
  assert.strictEqual(result.status, 'ok', result.error ?? 'expected ok');
  assert.strictEqual(result.orderToH3, tacticalHuman);
  assert.strictEqual(result.reachable, true);
}

/**
 * Ensures strategic executePathfinding without tacticalBattle still fails land-mass on tactical planState (no accidental tactical default).
 *
 * Purpose: Guards against routing all plan_route calls through the tactical branch.
 * When to use: After executePathfinding signature changes.
 * Expected outcome: Without tacticalBattle, plan_route to the adjacent tactical human hex errors (land-mass).
 * Exceptions: None.
 */
function testStrategicPlanRouteOnPlanStateStillUsesLandMass(): void {
  const { planState, latLngByH3, resolveToH3, oppId, tacticalHuman } = buildAdjacentArmorFixture();
  const destLl = latLngByH3.get(tacticalHuman)!;
  const result = executePathfinding(
    'plan_route',
    { unitId: oppId, destination: destLl },
    planState,
    latLngByH3,
    resolveToH3
  ) as { status: string; error?: string };
  assert.strictEqual(result.status, 'error');
  assert.ok(result.error && /path|land mass|impassable/i.test(result.error), result.error);
}

/**
 * Ensures tactical check_distance reports a reachable path between adjacent footprint cells.
 *
 * Purpose: Same land-mass bypass for distance estimates the model uses before plan_route.
 * When to use: After edits to `executeTacticalCheckDistance`.
 * Expected outcome: reachable true with positive hexDistance.
 * Exceptions: None.
 */
function testTacticalCheckDistanceAdjacentOk(): void {
  const { battle, planState, latLngByH3, resolveToH3, tacticalOpp, tacticalHuman } = buildAdjacentArmorFixture();
  const fromLl = latLngByH3.get(tacticalOpp)!;
  const toLl = latLngByH3.get(tacticalHuman)!;
  const result = executePathfinding(
    'check_distance',
    { from: fromLl, to: toLl, unitType: 'armor' },
    planState,
    latLngByH3,
    resolveToH3,
    undefined,
    battle
  ) as { status: string; reachable?: boolean; hexDistance?: number; error?: string };
  assert.strictEqual(result.status, 'ok', result.error ?? 'expected ok');
  assert.strictEqual(result.reachable, true);
  assert.ok((result.hexDistance ?? 0) >= 1);
}

/**
 * Ensures tactical check_distance applies the weather budget cap only to a mover that lacks the tag.
 *
 * Purpose: The start cell's armor supplies the tags, preferring the AI's own, so a snow-tagged tank is not estimated as
 * slowed and an enemy tank sharing the cell does not lend its tags.
 * When to use: After edits to how `executeTacticalCheckDistance` picks the mover.
 * Expected outcome: Two plains cells in High snow take two beats untagged and one beat when tagged for snow. A
 * snow-tagged human tank listed first on the cell does not change the AI's untagged estimate.
 * Exceptions: None.
 */
function testTacticalCheckDistanceUsesStartCellTags(): void {
  const estimateBeats = (weatherTags?: ('snow' | 'rain' | 'heat')[], taggedHumanFirst = false): number | undefined => {
    const fx = buildTacticalToolFixture({
      battleId: `t-tool1-snow-${weatherTags?.join('-') ?? 'none'}-${taggedHumanFirst}`,
      units: [
        ...(taggedHumanFirst ? [{ id: 'hum-arm', player: 'human' as const, unitType: 'armor' as const, cell: 'near' as const }] : []),
        { id: 'opp-arm', player: 'opponent', unitType: 'armor', cell: 'near' },
      ],
    });
    const battle: TacticalBattleSnapshot = {
      ...fx.battle,
      weather: 'snow',
      weatherBonusEnabled: true,
      weatherBonusLevel: 'high',
      subUnits: fx.battle.subUnits.map((s) => {
        const tags = s.player === 'human' ? ['snow' as const] : weatherTags;
        return tags ? { ...s, weatherTags: tags } : s;
      }),
    };
    const result = executeTacticalCheckDistance(
      cellToLatLng(fx.cells.near) as [number, number],
      cellToLatLng(fx.cells.far) as [number, number],
      'armor',
      battle,
      fx.latLngByH3,
      fx.resolveToH3
    ) as { status: string; estimatedTurns?: number };
    assert.strictEqual(result.status, 'ok');
    return result.estimatedTurns;
  };
  assert.strictEqual(estimateBeats(), 2);
  assert.strictEqual(estimateBeats(['snow']), 1);
  assert.strictEqual(estimateBeats(undefined, true), 2);
}

/**
 * Ensures tactical plan_route rejects air units with an air-strike guidance error.
 *
 * Purpose: Contract parity with strategic Tool1 air handling.
 * When to use: After edits to `executeTacticalPlanRoute` air branch.
 * Expected outcome: status error mentioning air strikes.
 * Exceptions: None.
 */
function testTacticalPlanRouteRejectsAir(): void {
  const { battle, planState, latLngByH3, resolveToH3, tacticalHuman } = buildAdjacentArmorFixture();
  const airBattle: TacticalBattleSnapshot = {
    ...battle,
    subUnits: [
      ...battle.subUnits,
      {
        id: 'opp-air-1',
        parentUnitId: 'parent-air',
        player: 'opponent',
        unitType: 'air',
        h3Index: battle.subUnits[0]!.h3Index,
        displayName: 'Air',
      },
    ],
  };
  const airPlan = {
    ...planState,
    units: [
      ...planState.units,
      { id: 'opp-air-1', player: 'opponent' as const, unitType: 'air' as const, h3Index: battle.subUnits[0]!.h3Index },
    ],
  };
  const destLl = latLngByH3.get(tacticalHuman)!;
  const result = executePathfinding(
    'plan_route',
    { unitId: 'opp-air-1', destination: destLl },
    airPlan,
    latLngByH3,
    resolveToH3,
    undefined,
    airBattle
  ) as { status: string; error?: string };
  assert.strictEqual(result.status, 'error');
  assert.ok(result.error && /air/i.test(result.error), result.error);
}

/**
 * Ensures embarked cargo cannot plan_route until disembarked.
 *
 * Purpose: Align Tool1 with Best Options (embarked movers offer no march rows).
 * When to use: After edits to embarked guards in `executeTacticalPlanRoute`.
 * Expected outcome: status error mentioning embarked / disembark.
 * Exceptions: None.
 */
function testTacticalPlanRouteRejectsEmbarked(): void {
  const { battle, planState, latLngByH3, resolveToH3, tacticalOpp, tacticalHuman } = buildAdjacentArmorFixture();
  const navalId = 'opp-nav-1';
  const cargoId = 'opp-cargo-1';
  const embarkedBattle: TacticalBattleSnapshot = {
    ...battle,
    subUnits: [
      {
        id: navalId,
        parentUnitId: 'parent-nav',
        player: 'opponent',
        unitType: 'naval',
        h3Index: tacticalOpp,
        displayName: 'Naval',
      },
      {
        id: cargoId,
        parentUnitId: 'parent-inf',
        player: 'opponent',
        unitType: 'infantry',
        h3Index: tacticalOpp,
        embarkedOnSubUnitId: navalId,
        displayName: 'Cargo',
      },
      battle.subUnits.find((s) => s.player === 'human')!,
    ],
  };
  const embarkedPlan = {
    ...planState,
    units: [
      { id: navalId, player: 'opponent' as const, unitType: 'naval' as const, h3Index: tacticalOpp },
      {
        id: cargoId,
        player: 'opponent' as const,
        unitType: 'infantry' as const,
        h3Index: tacticalOpp,
        embarkedOnSubUnitId: navalId,
      },
      ...planState.units.filter((u) => u.player === 'human'),
    ],
  };
  const destLl = latLngByH3.get(tacticalHuman)!;
  const result = executePathfinding(
    'plan_route',
    { unitId: cargoId, destination: destLl },
    embarkedPlan,
    latLngByH3,
    resolveToH3,
    undefined,
    embarkedBattle
  ) as { status: string; error?: string };
  assert.strictEqual(result.status, 'error');
  assert.ok(result.error && /embark/i.test(result.error), result.error);
}

const tests = [
  { name: 'tactical plan_route adjacent enemy ok', fn: testTacticalPlanRouteAdjacentEnemyOk },
  { name: 'strategic plan_route on res4 planState still land-mass', fn: testStrategicPlanRouteOnPlanStateStillUsesLandMass },
  { name: 'tactical check_distance adjacent ok', fn: testTacticalCheckDistanceAdjacentOk },
  { name: 'tactical check_distance uses start cell tags', fn: testTacticalCheckDistanceUsesStartCellTags },
  { name: 'tactical plan_route rejects air', fn: testTacticalPlanRouteRejectsAir },
  { name: 'tactical plan_route rejects embarked', fn: testTacticalPlanRouteRejectsEmbarked },
];

function run(): void {
  for (const t of tests) {
    try {
      t.fn();
      console.log(`OK ${t.name}`);
    } catch (err) {
      console.error(`FAIL ${t.name}`, err);
      process.exit(1);
    }
  }
}

run();
