/**
 * Battle fixture for tests of the tactical AI tools (march estimates, combat estimates, unit assessments).
 *
 * Purpose: One three-cell line (near, mid, far) deep inside a single strategic parent, so tool tests can place sub-units at
 * known hop distances and override terrain per cell without repeating H3 discovery code.
 * When to use: Tests under `src/main/tools` that call tactical tool executors.
 * Expected outcome: Deterministic geometry: `near`–`mid` and `mid`–`far` are adjacent, `near`–`far` is two hops apart.
 * Exceptions: `buildTacticalToolFixture` throws when the line cannot be found, which would mean the H3 library changed.
 */

import { cellToCenterChild, cellToLatLng, cellToParent, gridDisk, gridDistance } from 'h3-js';
import type { GameStateSnapshot } from '../../gameDb';
import type { OriginBonusSettings } from '../../../shared/originBonusTypes';
import type { TacticalBattleSnapshot, TacticalSubUnitSnapshot } from '../../../shared/tacticalBattleTypes';
import type { UnitOrigin } from '../../../shared/unitOriginTypes';
import { buildTacticalAiPlanState } from '../buildTacticalAiPlanState';
import { tacticalParentCell } from './tacticalHexFixtures';

/**
 * Named cells in the fixture line.
 *
 * Purpose: Lets tests say where a sub-unit stands without handling raw H3 strings.
 * When to use: `TacticalToolFixtureUnit.cell` and `terrainByCell` keys.
 * Expected outcome: One of the three line positions.
 * Exceptions: None.
 */
export type TacticalToolFixtureCell = 'near' | 'mid' | 'far';

/**
 * One sub-unit to place in the fixture battle.
 *
 * Purpose: Compact sub-unit description; the builder fills parent id and display name.
 * When to use: `buildTacticalToolFixture` `units` argument.
 * Expected outcome: Becomes one `TacticalSubUnitSnapshot` on the named cell.
 * Exceptions: None.
 */
export interface TacticalToolFixtureUnit {
  /**
   * Sub-unit id used by the tool under test.
   *
   * Contract: Unique within the fixture.
   * When to use: Tool arguments such as `unitId` or `attackers.units`.
   * Expected outcome: Copied to the snapshot row unchanged.
   * Exceptions: None.
   */
  readonly id: string;
  /**
   * Side that controls the sub-unit.
   *
   * Contract: `opponent` is the AI side.
   * When to use: Every fixture unit.
   * Expected outcome: Copied to the snapshot row unchanged.
   * Exceptions: None.
   */
  readonly player: 'human' | 'opponent';
  /**
   * Unit type such as `infantry`, `armor`, `naval`, or `air`.
   *
   * Contract: Same vocabulary as strategic unit types.
   * When to use: Every fixture unit.
   * Expected outcome: Copied to the snapshot row unchanged.
   * Exceptions: None.
   */
  readonly unitType: string;
  /**
   * Line position the sub-unit stands on.
   *
   * Contract: Resolved to the matching tactical cell.
   * When to use: Every fixture unit.
   * Expected outcome: Snapshot `h3Index` is that cell.
   * Exceptions: None.
   */
  readonly cell: TacticalToolFixtureCell;
  /**
   * Naval sub-unit id this land sub-unit is embarked on.
   *
   * Contract: Optional; the carrier should stand on the same cell.
   * When to use: Sealift scenarios.
   * Expected outcome: Copied to `embarkedOnSubUnitId`.
   * Exceptions: None.
   */
  readonly embarkedOnSubUnitId?: string;
  /**
   * Birth record of the sub-unit's parent.
   *
   * Contract: Optional; omitted means the sub-unit never qualifies for an origin bonus.
   * When to use: Origin bonus scenarios.
   * Expected outcome: Copied to the sub-unit's `origin`.
   * Exceptions: None.
   */
  readonly origin?: UnitOrigin;
}

/**
 * Inputs for `buildTacticalToolFixture`.
 *
 * Purpose: Parameter object so tests can add options without long argument lists.
 * When to use: Every fixture build.
 * Expected outcome: Describes battle id, units, and optional per-cell terrain kinds.
 * Exceptions: None.
 */
export interface TacticalToolFixtureOptions {
  /**
   * Battle id for logs and planner memo isolation.
   *
   * Contract: Use a distinct id per test so planner memo entries never leak between tests.
   * When to use: Every fixture build.
   * Expected outcome: Copied to `battleId`.
   * Exceptions: None.
   */
  readonly battleId: string;
  /**
   * Sub-units to place on the line.
   *
   * Contract: Ids are unique.
   * When to use: Every fixture build.
   * Expected outcome: One snapshot row per entry, in order.
   * Exceptions: None.
   */
  readonly units: readonly TacticalToolFixtureUnit[];
  /**
   * Tactical terrain kind overrides, such as `forest` or `water`, keyed by line position.
   *
   * Contract: Cells without an override use the battle's plains default.
   * When to use: Terrain-dependent range, movement, or sealift tests.
   * Expected outcome: Written into `tacticalTerrainKindByH3`.
   * Exceptions: None.
   */
  readonly terrainByCell?: Readonly<Partial<Record<TacticalToolFixtureCell, string>>>;
  /**
   * Match origin bonus flags.
   *
   * Contract: Optional; omitted leaves both snapshot flags unset, which reads as off.
   * When to use: Origin bonus scenarios.
   * Expected outcome: Both flags are copied onto the plan state.
   * Exceptions: None.
   */
  readonly originBonusSettings?: OriginBonusSettings;
}

/**
 * Fixture output: battle snapshot plus the plan state and coordinate maps the tool loop would pass.
 *
 * Purpose: Mirrors what `requestOrdersFlow` hands to tool executors during a battle.
 * When to use: Arguments to tactical tool executors in tests.
 * Expected outcome: All maps cover every footprint cell.
 * Exceptions: None.
 */
export interface TacticalToolFixture {
  /**
   * Battle snapshot with the requested sub-units and terrain.
   *
   * Contract: Footprint is the radius-3 disk around `near`, limited to the parent strategic cell.
   * When to use: The `tacticalBattle` argument of tool executors.
   * Expected outcome: Plains by default.
   * Exceptions: None.
   */
  readonly battle: TacticalBattleSnapshot;
  /**
   * Battle plan state from `buildTacticalAiPlanState`.
   *
   * Contract: Same projection the live tool loop uses.
   * When to use: The `state` argument of tool executors.
   * Expected outcome: Hexes are footprint cells; units mirror sub-units.
   * Exceptions: None.
   */
  readonly planState: GameStateSnapshot;
  /**
   * Cell-center lat/lng for every footprint cell.
   *
   * Contract: Keys are footprint cells.
   * When to use: The `latLngByH3` argument of tool executors.
   * Expected outcome: Exact `cellToLatLng` values.
   * Exceptions: None.
   */
  readonly latLngByH3: Map<string, [number, number]>;
  /**
   * Resolves an exact cell-center lat/lng back to its cell.
   *
   * Contract: Exact match within 1e-9 degrees; otherwise undefined.
   * When to use: The `resolveToH3` argument of tool executors.
   * Expected outcome: Inverse of `latLngByH3`.
   * Exceptions: None.
   */
  readonly resolveToH3: (lat: number, lng: number) => string | undefined;
  /**
   * Tactical cell for each line position.
   *
   * Contract: `near`–`mid` and `mid`–`far` adjacent; `near`–`far` two hops.
   * When to use: Assertions and tool arguments that need a cell.
   * Expected outcome: Three distinct footprint cells.
   * Exceptions: None.
   */
  readonly cells: Readonly<Record<TacticalToolFixtureCell, string>>;
}

/**
 * Finds the near/mid/far line inside the parent of `near`.
 *
 * Purpose: Picks deterministic geometry without hard-coded H3 literals.
 * When to use: Only from `buildTacticalToolFixture`.
 * Expected outcome: Cells with the documented adjacency.
 * Exceptions: Throws when no such line exists.
 */
function findFixtureLine(near: string, strategic: string): Record<TacticalToolFixtureCell, string> {
  const sameParent = gridDisk(near, 2).filter((h) => h !== near && cellToParent(h, 1) === strategic);
  for (const far of sameParent) {
    if (gridDistance(near, far) !== 2) continue;
    const mid = sameParent.find((h) => gridDistance(near, h) === 1 && gridDistance(h, far) === 1);
    if (mid) return { near, mid, far };
  }
  throw new Error('buildTacticalToolFixture: no near/mid/far line inside the parent res1 cell');
}

/**
 * Builds a plains battle with the requested sub-units on a three-cell line.
 *
 * Purpose: Shared setup for tactical tool tests so each test states only its units and terrain.
 * When to use: Any test that needs a battle snapshot plus plan state and coordinate maps.
 * Expected outcome: A fixture whose plan state matches the live tool loop's projection.
 * Exceptions: Throws when the line cannot be found.
 */
export function buildTacticalToolFixture(options: TacticalToolFixtureOptions): TacticalToolFixture {
  const parentCell = tacticalParentCell(12, 34);
  const near = cellToCenterChild(parentCell, 4);
  const cells = findFixtureLine(near, parentCell);
  const footprint = gridDisk(near, 3).filter((h) => cellToParent(h, 1) === parentCell);
  const tacticalTerrainKindByH3: Record<string, string> = {};
  for (const [cell, kind] of Object.entries(options.terrainByCell ?? {})) {
    if (kind) tacticalTerrainKindByH3[cells[cell as TacticalToolFixtureCell]] = kind;
  }
  const subUnits: TacticalSubUnitSnapshot[] = options.units.map((u) => ({
    id: u.id,
    parentUnitId: `parent-${u.id}`,
    player: u.player,
    unitType: u.unitType,
    h3Index: cells[u.cell],
    displayName: u.id,
    embarkedOnSubUnitId: u.embarkedOnSubUnitId ?? null,
    ...(u.origin ? { origin: u.origin } : {}),
  }));
  const battle: TacticalBattleSnapshot = {
    battleId: options.battleId,
    enclosingStrategicH3Index: parentCell,
    tacticalChildH3Indexes: footprint,
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    strategicHexTerrain: 'land',
    strategicHexTerrainKind: 'plains',
    tacticalTerrainKindByH3,
    subUnits,
  };
  const strategic: GameStateSnapshot = {
    turnNumber: 1,
    phase: 'planning',
    hexes: [{ h3Index: parentCell, terrain: 'land', terrainKind: 'plains' }],
    units: [],
    pendingOrders: [],
    ...(options.originBonusSettings ?? {}),
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
  return { battle, planState, latLngByH3, resolveToH3, cells };
}
