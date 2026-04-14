/**
 * Tactical movement terrain categories and per-hex costs (combat rules §12.4).
 * Shared by renderer hover preview and main-process march validation.
 */

import type { TacticalBattleSnapshot } from './tacticalBattleTypes';

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
   * Returns true when this res4 cell is a seaport facility (naval may berth; blocks seaport→seaport march steps).
   *
   * Contract: Optional for tests and legacy snapshots; when absent, callers treat every cell as non-seaport.
   * When to use: Naval tactical enter-hex rules alongside native water/coastal categories.
   * Expected outcome: Stable boolean for a fixed snapshot row.
   * Exceptions: None.
   */
  isSeaportRes4?: (h3: string) => boolean;
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
 * Returns whether infantry or armor may be placed on a res4 cell at tactical battle start.
 *
 * Contract: Blocks normalized categories `water` and `arctic`; all other tactical land categories are allowed.
 * When to use: `computeTacticalBattleSnapshot` placement alongside naval/air rules.
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
    'res4TerrainKindByH3' | 'strategicHexTerrain' | 'strategicHexTerrainKind' | 'res4IsSeaportByH3'
  >
): TacticalTerrainKindResolver {
  const parentTerrain = battle.strategicHexTerrain ?? 'land';
  const parentKind = battle.strategicHexTerrainKind ?? 'plains';
  const map = battle.res4TerrainKindByH3 ?? {};
  const seaportMap = battle.res4IsSeaportByH3 ?? {};
  return {
    parentTerrain,
    parentTerrainKind: parentKind,
    effectiveKindForRes4Hex(h3: string): string {
      const raw = map[h3];
      if (raw == null) return parentKind;
      const trimmed = String(raw).trim();
      return trimmed.length > 0 ? trimmed : parentKind;
    },
    isSeaportRes4(h3: string): boolean {
      return !!seaportMap[h3];
    },
  };
}

/**
 * Resolves which unit type row to use for tactical movement costs, including embarked sealift edge cases.
 *
 * Contract: While cargo stays aboard (`toH3Index` absent, same as origin, or identical to current `h3Index`), use `naval`
 * costs so carrier-only constraints apply. When cargo is ordered to a different hex, treat the march as a land
 * disembark path using the cargo's own `unitType` for §12.4 costs.
 * When to use: Before movement planning for a `TacticalSubUnitSnapshot` row when the march destination is known.
 * Expected outcome: A key understood by `tacticalEnterHexMovementCost` (`infantry` | `armor` | `naval` | `air`).
 * Exceptions: None.
 */
export function tacticalMovementUnitTypeForPathfinding(
  unit: { unitType: string; h3Index: string; embarkedOnSubUnitId?: string | null },
  toH3Index?: string
): string {
  if (unit.unitType === 'air') return 'air';
  const embarked =
    (unit.unitType === 'infantry' || unit.unitType === 'armor') &&
    !!unit.embarkedOnSubUnitId &&
    unit.embarkedOnSubUnitId.length > 0;
  if (embarked && toH3Index !== undefined && toH3Index !== unit.h3Index) {
    return unit.unitType;
  }
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
 * Expected outcome: Deterministic for a fixed snapshot; changes when any override entry or parent terrain fields change.
 * Exceptions: None.
 */
export function tacticalTerrainLayerSignature(
  battle: Pick<
    TacticalBattleSnapshot,
    'res4TerrainKindByH3' | 'strategicHexTerrain' | 'strategicHexTerrainKind' | 'res4IsSeaportByH3'
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
  if (!map || Object.keys(map).length === 0) {
    return `${parentTerrain}|${parentKind}||sp:${spBody}`;
  }
  const body = Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([h3, kind]) => `${h3}:${kind}`)
    .join(';');
  return `${parentTerrain}|${parentKind}|${body}|sp:${spBody}`;
}
