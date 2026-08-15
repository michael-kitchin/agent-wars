/**
 * Tactical movement terrain categories and per-hex costs (combat rules §12.4).
 * Shared by renderer hover preview and main-process march validation.
 */

import type { TacticalBattleSnapshot } from './tacticalBattleTypes';
import {
  tacticalRes4TransportMarchAdjacentPairAllowsStep,
  type TacticalRes4TransportMasks,
} from './tacticalRes4TransportLink';

/**
 * Normalized tactical terrain bucket used for movement cost lookup.
 *
 * Contract: Matches combat rules §12.4 row keys after DB string normalization.
 * When to use: After mapping `terrain_kind` / parent fallbacks through `normalizeDbTerrainKindToTacticalCategory`.
 * Expected outcome: One of the known tactical movement categories.
 * Exceptions: None; unknown kinds map to `plains` for land parents.
 */
export type TacticalMovementCategory =
  | 'plains'
  | 'forests'
  | 'mountains'
  | 'wetlands'
  | 'desert'
  | 'arctic'
  | 'coastal'
  | 'water';

/**
 * Context for resolving effective tactical terrain on a res4 cell.
 *
 * Contract: `effectiveKindForRes4Hex` returns the tactical kind string before category normalization.
 * When to use: Building `TacticalTerrainContext` from a `TacticalBattleSnapshot` or test fixtures.
 * Expected outcome: Deterministic kind per `h3` for a fixed snapshot.
 * Exceptions: None.
 */
export type TacticalTerrainKindResolver = {
  /**
   * Returns true when this res4 cell counts as **urban infrastructure** (not rubble) for forced march enter cost.
   *
   * Contract: Optional; when absent, land enter-hex costs use terrain category only.
   * When to use: Tactical march planner to apply urban=1 MP enter override for infantry/armor.
   * Expected outcome: Matches snapshot `res4IsUrbanByH3` for the active battle.
   * Exceptions: None.
   */
  isUrbanRes4?: (h3: string) => boolean;
  /**
   * Returns true when this res4 cell is **rubble** for forced march enter cost and naval blocking.
   *
   * Contract: Optional; when absent, rubble forcing and naval land blocking are skipped.
   * When to use: Tactical march planner for rubble=2 land enters and `tacticalNavalEnterNeighborCost` land-like blocks.
   * Expected outcome: Matches snapshot `res4IsRubbleByH3`.
   * Exceptions: None.
   */
  isRubbleRes4?: (h3: string) => boolean;
  /**
   * Returns true when this res4 cell is a seaport facility (naval may berth; blocks seaport→seaport march steps).
   *
   * Contract: Optional for tests and legacy snapshots; when absent, callers treat every cell as non-seaport.
   * When to use: Naval tactical enter-hex rules alongside native water/coastal categories.
   * Expected outcome: Stable boolean for a fixed snapshot row.
   * Exceptions: None.
   */
  isSeaportRes4?: (h3: string) => boolean;
  /**
   * Returns true when a land unit may treat the step `fromH3` → `toH3` as following a road/rail link (not rubble-suppressed).
   *
   * Contract: Optional; when absent, no transport shortcuts apply in march planning.
   * When to use: `planTacticalRes4March` land enter-cost override for infantry/armor.
   * Expected outcome: Adjacent pair with both cells carrying any road/rail overlay side (`tacticalRes4TransportMarchAdjacentPairAllowsStep`).
   * Exceptions: None.
   */
  transportFromTo?: (fromH3: string, toH3: string) => boolean;
  /**
   * Bundled road/rail masks and rubble flags for land transport **continuity** (interior corridor) checks in march planning.
   *
   * Contract: Present when the snapshot contributes any normalized `res4RoadSidesByH3` / `res4RailSidesByH3` rows; absent when
   * there is no transport overlay (planner falls back to `transportFromTo` only).
   * When to use: `planTacticalRes4March` land branch to require march pair steps plus loose interior continuity on traversed
   * corridor cells (both endpoints any road/rail per step).
   * Expected outcome: Same `Map` instance backing `transportFromTo` pair tests for that snapshot build.
   * Exceptions: None.
   */
  landTransportMarchContext?: {
    roadRailByH3: ReadonlyMap<string, TacticalRes4TransportMasks>;
    rubbleByH3: Readonly<Record<string, boolean>>;
  };
  /**
   * Returns raw terrain kind for a res4 index (may be empty when only parent kind applies).
   *
   * Contract: Caller combines with parent fallback; values are typically lowercase DB `terrain_kind`.
   * When to use: Tactical march planner before `normalizeDbTerrainKindToTacticalCategory`.
   * Expected outcome: String per res4 child in the tactical footprint.
   * Exceptions: None.
   */
  effectiveKindForRes4Hex(h3: string): string;
  /**
   * Strategic `terrain` column for the enclosing res1 hex (`land` / `water` / …).
   *
   * Contract: Same meaning as strategic hex rows; influences water detection when kinds are ambiguous.
   * When to use: Water vs land disambiguation in `normalizeDbTerrainKindToTacticalCategory`.
   * Expected outcome: Non-empty for real snapshots.
   * Exceptions: None.
   */
  parentTerrain: string;
  /**
   * Strategic res1 `terrain_kind` for the enclosing hex (`plains`, `coastal`, …).
   *
   * Contract: Matches `TacticalBattleSnapshot.strategicHexTerrainKind`; used for shoreline naval rules when `terrain` is `land`.
   * When to use: `isNavalRes4TacticalCellNavigable` and resolver consumers that must mirror snapshot build.
   * Expected outcome: Lowercase-ish DB strings; defaults to `plains` when absent in legacy saves.
   * Exceptions: None.
   */
  parentTerrainKind: string;
};

/**
 * Maps database / snapshot terrain strings to a tactical movement category for cost rules.
 *
 * Contract: Lowercases inputs; treats parent `water` as water when kind is empty.
 * When to use: Before `tacticalEnterHexMovementCost` for each candidate res4 cell.
 * Expected outcome: A `TacticalMovementCategory` suitable for the §12.4 cost table.
 * Exceptions: None.
 */
export function normalizeDbTerrainKindToTacticalCategory(
  effectiveKind: string,
  parentTerrain: string
): TacticalMovementCategory {
  const k = (effectiveKind || '').toLowerCase();
  const pt = (parentTerrain || '').toLowerCase();
  if (k === 'water') return 'water';
  if (k === 'coastal') return 'coastal';
  if (k === 'forest' || k === 'forests') return 'forests';
  if (k === 'mountain' || k === 'mountains') return 'mountains';
  if (k === 'wetland' || k === 'wetlands') return 'wetlands';
  if (k === 'desert') return 'desert';
  if (k === 'arctic') return 'arctic';
  if (k === 'plains' || k === 'land') return 'plains';
  if (k.length > 0) return 'plains';
  if (pt === 'water' || pt === 'sea' || pt === 'ocean') return 'water';
  return 'plains';
}

/**
 * Returns true when a per-res4 `terrain_kind` string should be treated as open water or surf for naval §12.4 routing.
 *
 * Purpose: GIS / legacy rows sometimes label sea tiles `ocean` or `sea` while the combat pipeline standardizes on `water`.
 * When to use: Naval navigability fast path and seaport adjacency checks that must agree with `isNavalRes4TacticalCellNavigable`.
 * Expected outcome: True for lowercase `water`, `coastal`, `ocean`, and `sea`.
 * Exceptions: None.
 */
export function nativeRes4TerrainKindIsWaterOrCoastalForNavalRouting(kind: string): boolean {
  const k = (kind || '').toLowerCase();
  return k === 'water' || k === 'coastal' || k === 'ocean' || k === 'sea';
}

/**
 * Returns whether infantry or armor may occupy a hex for terrain-tooltip `(All)` collapse.
 *
 * Contract: Blocks normalized categories `water` and `arctic`; all other tactical land categories are allowed.
 * When to use: `terrainEffectsForTooltip` occupiable sets. Do **not** use for tactical battle spawn (armor wetlands/mountains differ).
 * Expected outcome: False on pure water or arctic tiles (including inherited parent kinds when the child has no override).
 * Exceptions: None.
 */
export function isInfantryOrArmorTacticalSpawnCell(args: {
  resolvedKindForCell: string;
  parentTerrain: string;
  parentTerrainKind: string;
}): boolean {
  const k = args.resolvedKindForCell || args.parentTerrainKind;
  const cat = normalizeDbTerrainKindToTacticalCategory(k, args.parentTerrain);
  return cat !== 'water' && cat !== 'arctic';
}

/**
 * Returns whether infantry or armor may occupy `cellH3` without a road/rail plains override.
 *
 * Purpose: One occupancy gate for tactical spawn and `landTerrainBlocksWithoutTransport`.
 * When to use: Snapshot placement before the transport-link spawn fallback; march helpers via the block predicate.
 * Expected outcome: True on urban/rubble; otherwise true iff §12.4 enter cost for `unitType` is finite.
 * Exceptions: False for non-land unit types.
 */
export function tacticalLandUnitMayOccupyCellWithoutTransport(
  unitType: string,
  cellH3: string,
  terrain: TacticalTerrainKindResolver
): boolean {
  if (unitType !== 'infantry' && unitType !== 'armor') return false;
  if (terrain.isUrbanRes4?.(cellH3) || terrain.isRubbleRes4?.(cellH3)) return true;
  const raw = terrain.effectiveKindForRes4Hex(cellH3);
  const cat = normalizeDbTerrainKindToTacticalCategory(raw, terrain.parentTerrain);
  return Number.isFinite(tacticalEnterHexMovementCost(unitType, cat));
}

/**
 * Returns whether a tactical res4 cell may host or receive a naval march (water/coastal tile or seaport facility).
 *
 * Contract: Aligns snapshot placement with `planTacticalRes4March` naval edges; does **not** encode seaport→seaport step blocking (handled in the planner with `fromH3`) or “has a legal first step” (handled by `tacticalNavalHasMovableNeighborInFootprint` at spawn).
 * When to use: `computeTacticalBattleSnapshot` base navigability and naval `enterCostForHex` eligibility before the port-consecutive guard.
 * Expected outcome: True for seaport tiles, res4 kinds `water`/`coastal` (plus legacy `ocean`/`sea`), and cells that normalize to `water` when strategic `terrain` is open water and kind strings are blank; false for land-like categories (`plains`, `forests`, `desert`, etc.) unless the cell is explicitly marked as seaport.
 * Exceptions: None.
 */
export function isNavalRes4TacticalCellNavigable(args: {
  resolvedKindForCell: string;
  parentTerrain: string;
  /** Strategic res1 `terrain_kind` for the enclosing hex (e.g. `coastal` shoreline on `terrain === 'land'`). */
  parentTerrainKind: string;
  isSeaportCell: boolean;
}): boolean {
  const { resolvedKindForCell, parentTerrain, parentTerrainKind, isSeaportCell } = args;
  if (isSeaportCell) return true;
  if (nativeRes4TerrainKindIsWaterOrCoastalForNavalRouting(resolvedKindForCell)) return true;
  void parentTerrainKind;
  const cat = normalizeDbTerrainKindToTacticalCategory(resolvedKindForCell, parentTerrain);
  return cat === 'water' || cat === 'coastal';
}

/**
 * Returns movement points spent to enter a hex for the given unit type (§12.4).
 *
 * Contract: `Infinity` means the unit type may not enter that terrain; `0` is unused (cost is always positive or blocked).
 * When to use: Tactical pathfinding edge relaxation for each neighbor cell.
 * Expected outcome: Sum along a path equals tactical movement budget consumption for the turn.
 * Exceptions: None.
 */
/**
 * Merges parallel `res4RoadSidesByH3` / `res4RailSidesByH3` snapshot records into a normalized `roadRailByH3` map.
 *
 * Purpose: Single implementation for resolver construction and any caller that needs the same padding/length rules as gameplay.
 * When to use: `buildTacticalTerrainKindResolverFromSnapshot` before attaching transport resolver helpers.
 * Expected outcome: Empty map when no keys or only malformed rows; aligned `roadSides`/`railSides` arrays per cell.
 * Exceptions: Drops rows whose padded arrays still disagree in length.
 */
export function buildRoadRailMapFromRes4RoadRailRecords(
  roadBy: Readonly<Record<string, readonly boolean[] | undefined>>,
  railBy: Readonly<Record<string, readonly boolean[] | undefined>>
): Map<string, TacticalRes4TransportMasks> {
  const roadRailByH3 = new Map<string, TacticalRes4TransportMasks>();
  const transportKeys = new Set([...Object.keys(roadBy), ...Object.keys(railBy)]);
  for (const h3 of transportKeys) {
    const r = roadBy[h3];
    const l = railBy[h3];
    if (!r && !l) continue;
    const n = Math.max(r?.length ?? 0, l?.length ?? 0);
    if (n === 0) continue;
    const roadSides = r ?? Array.from({ length: n }, () => false);
    const railSides = l ?? Array.from({ length: n }, () => false);
    if (roadSides.length !== railSides.length) continue;
    roadRailByH3.set(h3, { roadSides, railSides });
  }
  return roadRailByH3;
}

/**
 * Builds `transportFromTo` and `landTransportMarchContext` from an existing normalized road/rail map and rubble flags.
 *
 * Purpose: Keeps march-pair closure identical between snapshot `buildTacticalTerrainKindResolverFromSnapshot` and placement-time resolvers.
 * When to use: After `buildRoadRailMapFromRes4RoadRailRecords` or `tacticalRes4FootprintTransportOverlayRecords` yields `roadRailByH3`.
 * Expected outcome: Both fields undefined when the map is empty; otherwise shared map reference on context and closure over rubble.
 * Exceptions: None.
 */
export function tacticalTerrainTransportResolverFnsFromRoadRailMap(
  roadRailByH3: ReadonlyMap<string, TacticalRes4TransportMasks>,
  rubbleByH3: Readonly<Record<string, boolean>>
): {
  transportFromTo: TacticalTerrainKindResolver['transportFromTo'];
  landTransportMarchContext: TacticalTerrainKindResolver['landTransportMarchContext'];
} {
  if (roadRailByH3.size === 0) {
    return { transportFromTo: undefined, landTransportMarchContext: undefined };
  }
  const transportFromTo = (fromH3: string, toH3: string): boolean =>
    tacticalRes4TransportMarchAdjacentPairAllowsStep({
      fromH3,
      toH3,
      roadRailByH3,
      rubbleByH3,
    });
  return {
    transportFromTo,
    landTransportMarchContext: { roadRailByH3, rubbleByH3 },
  };
}

export function tacticalEnterHexMovementCost(unitType: string, category: TacticalMovementCategory): number {
  if (unitType === 'infantry') {
    switch (category) {
      case 'plains':
      case 'desert':
      case 'wetlands':
      case 'arctic':
      case 'coastal':
        return 1;
      case 'forests':
      case 'mountains':
        return 2;
      case 'water':
        return Infinity;
      default:
        return 1;
    }
  }
  if (unitType === 'armor') {
    switch (category) {
      case 'plains':
      case 'desert':
        return 1;
      case 'forests':
      case 'coastal':
        return 2;
      case 'mountains':
      case 'wetlands':
      case 'arctic':
      case 'water':
        return Infinity;
      default:
        return 1;
    }
  }
  if (unitType === 'naval') {
    switch (category) {
      case 'water':
      case 'coastal':
        return 1;
      default:
        return Infinity;
    }
  }
  return Infinity;
}

/**
 * Builds a terrain resolver from optional snapshot fields (backward compatible with older persisted JSON).
 *
 * Contract: Defaults parent to `land` / `plains` when fields are absent so tests and legacy saves stay playable.
 * When to use: Any tactical march plan that has a `TacticalBattleSnapshot` (or pick) available.
 * Expected outcome: Stable `TacticalTerrainKindResolver` for the planner.
 * Exceptions: None.
 */
export function buildTacticalTerrainKindResolverFromSnapshot(
  battle: Pick<
    TacticalBattleSnapshot,
    | 'res4TerrainKindByH3'
    | 'strategicHexTerrain'
    | 'strategicHexTerrainKind'
    | 'res4IsSeaportByH3'
    | 'res4IsUrbanByH3'
    | 'res4IsRubbleByH3'
    | 'res4RoadSidesByH3'
    | 'res4RailSidesByH3'
  >
): TacticalTerrainKindResolver {
  const parentTerrain = battle.strategicHexTerrain ?? 'land';
  const parentKind = battle.strategicHexTerrainKind ?? 'plains';
  const map = battle.res4TerrainKindByH3 ?? {};
  const seaportMap = battle.res4IsSeaportByH3 ?? {};
  const urbanMap = battle.res4IsUrbanByH3 ?? {};
  const rubbleMap = battle.res4IsRubbleByH3 ?? {};
  const roadBy = battle.res4RoadSidesByH3 ?? {};
  const railBy = battle.res4RailSidesByH3 ?? {};
  const roadRailByH3 = buildRoadRailMapFromRes4RoadRailRecords(roadBy, railBy);
  const { transportFromTo: transportFromToFn, landTransportMarchContext } =
    tacticalTerrainTransportResolverFnsFromRoadRailMap(roadRailByH3, rubbleMap);
  return {
    parentTerrain,
    parentTerrainKind: parentKind,
    transportFromTo: transportFromToFn,
    landTransportMarchContext,
    effectiveKindForRes4Hex(h3: string): string {
      const raw = map[h3];
      if (raw == null) return parentKind;
      const trimmed = String(raw).trim();
      return trimmed.length > 0 ? trimmed : parentKind;
    },
    isSeaportRes4(h3: string): boolean {
      return !!seaportMap[h3];
    },
    isUrbanRes4(h3: string): boolean {
      return !!urbanMap[h3];
    },
    isRubbleRes4(h3: string): boolean {
      return !!rubbleMap[h3];
    },
  };
}

/**
 * Resolves which unit type row to use for tactical movement costs, including embarked sealift edge cases.
 *
 * Contract: While cargo stays aboard, use `naval` costs so carrier-only constraints apply. Human independent marches off the carrier
 * are blocked in validation and preview before path planning runs; opponent LLM orders auto-debark and plan as land.
 * When to use: Before movement planning for a `TacticalSubUnitSnapshot` row when the march destination is known.
 * Expected outcome: A key understood by `tacticalEnterHexMovementCost` (`infantry` | `armor` | `naval` | `air`).
 * Exceptions: None.
 */
export function tacticalMovementUnitTypeForPathfinding(
  unit: { unitType: string; h3Index: string; embarkedOnSubUnitId?: string | null },
  _toH3Index?: string
): string {
  void _toH3Index;
  if (unit.unitType === 'air') return 'air';
  const embarked =
    (unit.unitType === 'infantry' || unit.unitType === 'armor') &&
    !!unit.embarkedOnSubUnitId &&
    unit.embarkedOnSubUnitId.length > 0;
  if (embarked) {
    return 'naval';
  }
  return unit.unitType;
}

/**
 * Stable string for tactical planning cache keys so res4 terrain edits invalidate even when override map size is unchanged.
 *
 * Purpose: `battleId` + turn + sub-unit positions are not enough when only `res4TerrainKindByH3` values change under the same key set.
 * When to use: `planTacticalRes4MarchWithSessionCache` environment keys and renderer hover memo keys alongside those fields.
 * Expected outcome: Deterministic for a fixed snapshot; changes when any override entry, parent terrain fields, or res4 road/rail mask content changes.
 * Exceptions: None.
 */
export function tacticalTerrainLayerSignature(
  battle: Pick<
    TacticalBattleSnapshot,
    | 'res4TerrainKindByH3'
    | 'strategicHexTerrain'
    | 'strategicHexTerrainKind'
    | 'res4IsSeaportByH3'
    | 'res4IsUrbanByH3'
    | 'res4IsRubbleByH3'
    | 'res4RoadSidesByH3'
    | 'res4RailSidesByH3'
  >
): string {
  const parentTerrain = battle.strategicHexTerrain ?? '';
  const parentKind = battle.strategicHexTerrainKind ?? '';
  const map = battle.res4TerrainKindByH3;
  const sp = battle.res4IsSeaportByH3;
  const spBody = !sp
    ? ''
    : Object.entries(sp)
        .filter(([, v]) => v)
        .map(([h3]) => h3)
        .sort((a, b) => a.localeCompare(b))
        .join(';');
  const urban = battle.res4IsUrbanByH3;
  const urbanBody = !urban
    ? ''
    : Object.entries(urban)
        .filter(([, v]) => v)
        .map(([h3]) => h3)
        .sort((a, b) => a.localeCompare(b))
        .join(';');
  const rubble = battle.res4IsRubbleByH3;
  const rubbleBody = !rubble
    ? ''
    : Object.entries(rubble)
        .filter(([, v]) => v)
        .map(([h3]) => h3)
        .sort((a, b) => a.localeCompare(b))
        .join(';');
  const road = battle.res4RoadSidesByH3;
  const rail = battle.res4RailSidesByH3;
  const trKeys = new Set<string>([...(road ? Object.keys(road) : []), ...(rail ? Object.keys(rail) : [])]);
  const trBody =
    trKeys.size === 0
      ? ''
      : [...trKeys]
          .sort((a, b) => a.localeCompare(b))
          .map((h3) => {
            const r = road?.[h3] ?? [];
            const l = rail?.[h3] ?? [];
            const n = Math.max(r.length, l.length);
            let s = `${h3}:`;
            for (let i = 0; i < n; i++) {
              s += (r[i] ? '1' : '0') + (l[i] ? '1' : '0');
            }
            return s;
          })
          .join(';');
  if (!map || Object.keys(map).length === 0) {
    return `${parentTerrain}|${parentKind}||sp:${spBody}|u:${urbanBody}|rb:${rubbleBody}|tr:${trBody}`;
  }
  const body = Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([h3, kind]) => `${h3}:${kind}`)
    .join(';');
  return `${parentTerrain}|${parentKind}|${body}|sp:${spBody}|u:${urbanBody}|rb:${rubbleBody}|tr:${trBody}`;
}
