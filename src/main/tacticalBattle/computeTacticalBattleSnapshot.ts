import { cellToChildren, cellToLatLng, getResolution } from 'h3-js';
import type { TacticalBattleSnapshot, TacticalSubUnitSnapshot } from '../../shared/tacticalBattleTypes';
import { buildUnitDisplayNameLookup, formatTacticalSubUnitDisplayName } from '../../shared/unitDisplayNames';
import { getPreviousStrategicH3IndexForUnit } from '../strategicUnitPreviousHex';
import {
  dbGetOne,
  getRes4TerrainOverridesForRendererFromGame,
  listRes4FeatureOverridesForGame,
  listUnitsForSnapshot,
} from '../gameDb';
import { tacticalNavalHasMovableNeighborInFootprint } from '../../shared/tacticalRes4MovementPlanner';
import { tacticalRes4UrbanRubbleFlagRecordsForFootprint } from '../../shared/tacticalTerrainCombatModifiers';
import type { TacticalTerrainKindResolver } from '../../shared/tacticalTerrainMovement';
import {
  isInfantryOrArmorTacticalSpawnCell,
  isNavalRes4TacticalCellNavigable,
} from '../../shared/tacticalTerrainMovement';
import { tacticalLogError, tacticalLogMutate, tacticalLogQuery } from './tacticalLogging';

const WORLD_H3_RESOLUTION = 1;
const TACTICAL_H3_RESOLUTION = 4;

/**
 * Maps each strategic parent unit type to how many tactical sub-units are synthesized for milestone 2.1.
 *
 * Purpose: Single source for placement counts so snapshot sizing and annihilation rules stay aligned.
 * When to use: From `computeTacticalBattleSnapshot` when expanding each parent into tactical rows.
 * Expected outcome: Positive counts for infantry/armor/air/naval; zero for unknown types.
 * Exceptions: None.
 */
export function tacticalSubUnitCountForStrategicUnitType(unitType: string): number {
  switch (unitType) {
    case 'infantry':
      return 12;
    case 'armor':
      return 6;
    case 'air':
      return 3;
    case 'naval':
      return 2;
    default:
      return 0;
  }
}

/**
 * Rebuilds per-res4 terrain kinds and seaport facility flags on a tactical snapshot from the live game database.
 *
 * Purpose: Snapshot `res4TerrainKindByH3` / `res4IsSeaportByH3` are frozen at battle start; tactical air infrastructure strikes
 * mutate `res4_feature_overrides` and `res1_infrastructure`, so march planners and the renderer must see rubble and removed ports without exiting tactical mode.
 * When to use: After `applyInfrastructureDestructionEffects` succeeds during human tactical support projection.
 * Expected outcome: Footprint cells match `getRes4TerrainOverridesForRendererFromGame` and `listRes4FeatureOverridesForGame`; stale seaport keys are dropped when no facility rows remain.
 * Exceptions: None; assumes `battle.res4ChildH3Indexes` still matches the active enclosing res1 cell.
 */
export function refreshTacticalBattleRes4TerrainFromGameDb(battle: TacticalBattleSnapshot): TacticalBattleSnapshot {
  tacticalLogMutate('refreshTacticalBattleRes4TerrainFromGameDb', {
    battleId: battle.battleId,
    res4CellCount: battle.res4ChildH3Indexes.length,
  });
  const childSet = new Set(battle.res4ChildH3Indexes);
  const res4Rows = getRes4TerrainOverridesForRendererFromGame();
  const res4KindByH3 = new Map<string, string>();
  for (const row of res4Rows) {
    if (!childSet.has(row.h3Index)) continue;
    res4KindByH3.set(row.h3Index, row.terrainKind);
  }
  const parentKind = battle.strategicHexTerrainKind ?? 'plains';
  const res4TerrainKindByH3: Record<string, string> = {};
  for (const cell of battle.res4ChildH3Indexes) {
    res4TerrainKindByH3[cell] = res4KindByH3.get(cell) ?? parentKind;
  }
  const res4IsSeaportByH3: Record<string, boolean> = {};
  for (const row of listRes4FeatureOverridesForGame()) {
    if (!childSet.has(row.h3Index)) continue;
    if (row.isSeaport) res4IsSeaportByH3[row.h3Index] = true;
  }
  const urbanRubble = tacticalRes4UrbanRubbleFlagRecordsForFootprint(battle.res4ChildH3Indexes, res4Rows);
  const next: TacticalBattleSnapshot = { ...battle, res4TerrainKindByH3, ...urbanRubble };
  delete next.res4IsSeaportByH3;
  delete next.res4IsUrbanByH3;
  delete next.res4IsRubbleByH3;
  if (Object.keys(res4IsSeaportByH3).length > 0) {
    next.res4IsSeaportByH3 = res4IsSeaportByH3;
  }
  if (urbanRubble.res4IsUrbanByH3) next.res4IsUrbanByH3 = urbanRubble.res4IsUrbanByH3;
  if (urbanRubble.res4IsRubbleByH3) next.res4IsRubbleByH3 = urbanRubble.res4IsRubbleByH3;
  return next;
}

/**
 * Returns true when both human and opponent have at least one placed tactical sub-unit.
 *
 * Purpose: Enforces milestone-2.1 start rules so a tactical session never begins with one side already annihilated by placement alone.
 * When to use: After greedy placement in `computeTacticalBattleSnapshot` before returning a snapshot.
 * Expected outcome: False when either player has zero tactical sub-units in the synthesized array.
 * Exceptions: None.
 */
export function tacticalSnapshotHasPlacedUnitsForBothSides(
  subUnits: readonly Pick<TacticalSubUnitSnapshot, 'player'>[]
): boolean {
  tacticalLogQuery('tacticalSnapshotHasPlacedUnitsForBothSides', { count: subUnits.length });
  let human = false;
  let opponent = false;
  for (const u of subUnits) {
    if (u.player === 'human') human = true;
    else if (u.player === 'opponent') opponent = true;
    if (human && opponent) return true;
  }
  return false;
}

/**
 * Hashes a battle id string into a 32-bit seed for deterministic tactical placement tie-breaks.
 *
 * Purpose: Stabilizes sibling ordering across machines for the same battle id string.
 * When to use: Seeding `mulberry32` for res4 placement scoring jitter.
 * Expected outcome: Deterministic unsigned 32-bit integer for a given `battleId`.
 * Exceptions: None.
 */
function hashBattleIdToSeed(battleId: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < battleId.length; i++) {
    h ^= battleId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Builds a deterministic PRNG (mulberry32) from a numeric seed for tactical placement ordering.
 *
 * Purpose: Provides repeatable pseudo-random tie breaks during tactical cell scoring.
 * When to use: After hashing `battleId` for placement ordering noise.
 * Expected outcome: Function returns floats in `[0,1)` with deterministic sequence per seed.
 * Exceptions: None.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Returns the geographic center of an H3 cell as lat/lng.
 *
 * Purpose: Shared geometry helper for vector scoring between res1 and res4 cells.
 * When to use: Placement ordering that prefers cells toward previous res1 direction.
 * Expected outcome: Finite latitude and longitude in degrees.
 * Exceptions: None.
 */
function latLngCenterForH3(h3: string): { lat: number; lng: number } {
  const ll = cellToLatLng(h3);
  return { lat: ll[0], lng: ll[1] };
}

/**
 * Normalizes a latitude/longitude delta vector to unit length.
 *
 * Purpose: Makes dot-product comparisons stable for directional scoring.
 * When to use: Converting displacement vectors between hex centers.
 * Expected outcome: Unit vector; falls back to a default axis when length is near zero.
 * Exceptions: None.
 */
function normalizeVec(lat: number, lng: number): { lat: number; lng: number } {
  const len = Math.hypot(lat, lng);
  if (len < 1e-9) return { lat: 0, lng: 1 };
  return { lat: lat / len, lng: lng / len };
}

/**
 * Dot product for two lat/lng planar vectors used in placement scoring.
 *
 * Purpose: Measures alignment between child direction vectors and entry direction.
 * When to use: Sorting res4 candidates toward previous strategic res1 neighbors.
 * Expected outcome: Scalar in roughly `[-1,1]` for normalized inputs.
 * Exceptions: None.
 */
function dot(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  return a.lat * b.lat + a.lng * b.lng;
}

/**
 * Returns true if a res4 cell's effective terrain is passable for the given strategic unit type for placement.
 *
 * Purpose: Filters impossible tactical spawn cells without invoking full movement rules.
 * When to use: Before assigning sub-units to res4 children during snapshot build.
 * Expected outcome: Naval favors water/coastal; air forbids pure water; land forbids water.
 * Exceptions: None.
 *
 * @param isSeaportCell When true, the res4 child hosts a seaport facility so naval may spawn there even if the terrain kind is land-like.
 * @param isAirportCell When true, the res4 child hosts an airport facility (required for air tactical spawns).
 * @param cellH3 Active res4 index (naval spawn checks use footprint neighbors from this cell).
 * @param childFootprint Full res1→res4 child set for naval first-step connectivity.
 * @param placementTerrain Resolver mirroring post-snapshot march rules for the enclosing hex.
 */
function isRes4CellPassableForUnitType(
  unitType: string,
  effectiveKind: string,
  parentTerrain: string,
  parentTerrainKind: string,
  isSeaportCell: boolean,
  isAirportCell: boolean,
  cellH3: string,
  childFootprint: ReadonlySet<string>,
  placementTerrain: TacticalTerrainKindResolver
): boolean {
  const kind = effectiveKind || parentTerrainKind;
  if (unitType === 'naval') {
    if (
      !isNavalRes4TacticalCellNavigable({
        resolvedKindForCell: kind,
        parentTerrain,
        parentTerrainKind,
        isSeaportCell,
      })
    ) {
      return false;
    }
    return tacticalNavalHasMovableNeighborInFootprint({
      fromH3: cellH3,
      res4Set: childFootprint,
      terrain: placementTerrain,
    });
  }
  if (unitType === 'air') {
    return isAirportCell;
  }
  if (unitType === 'infantry' || unitType === 'armor') {
    return isInfantryOrArmorTacticalSpawnCell({
      resolvedKindForCell: effectiveKind,
      parentTerrain,
      parentTerrainKind,
    });
  }
  return kind !== 'water';
}

/**
 * Orders res4 child cells for placement using entry-direction preference, seeded edge jitter, and optional urban weighting.
 *
 * Purpose: Produces a single prioritized visit order for greedy sub-unit placement.
 * When to use: Once per battle when expanding parents into tactical sub-units.
 * Expected outcome: Permutation of input `children` tailored to battle geometry and rng.
 * Exceptions: None.
 */
function orderRes4CellsForPlacement(args: {
  enclosingRes1: string;
  children: string[];
  previousRes1: string | undefined;
  res4UrbanByH3: Map<string, boolean>;
  parentTerrain: string;
  parentTerrainKind: string;
  battleId: string;
}): string[] {
  const center = latLngCenterForH3(args.enclosingRes1);
  let entry = { lat: 0, lng: 1 };
  if (args.previousRes1 && args.previousRes1 !== args.enclosingRes1) {
    const prev = latLngCenterForH3(args.previousRes1);
    entry = normalizeVec(prev.lat - center.lat, prev.lng - center.lng);
  }
  const rng = mulberry32(hashBattleIdToSeed(args.battleId));
  const scored = args.children.map((h3) => {
    const c = latLngCenterForH3(h3);
    const v = normalizeVec(c.lat - center.lat, c.lng - center.lng);
    const towardPrev = dot(v, entry);
    const urban = args.res4UrbanByH3.get(h3) ? 0.15 + rng() * 0.05 : 0;
    const jitter = rng() * 0.001;
    if (!args.previousRes1 || args.previousRes1 === args.enclosingRes1) {
      const urbanBoost = args.res4UrbanByH3.get(h3) ? 2.0 : 0;
      return { h3, score: urbanBoost + jitter };
    }
    return { h3, score: towardPrev + urban + jitter };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.h3);
}

/**
 * Builds a complete tactical battle snapshot for the given enclosing res1 hex, or returns null with reasons on failure.
 *
 * Contract: Read-only against SQLite and in-memory previous-hex memory; synthesizes temporary sub-units without writing strategic unit rows.
 * When to use: `startTacticalBattleForEnclosingRes1Hex` after IPC confirms contested res1 during strategic planning, or melee-intercept probes with `allowDuringStrategicResolution` during `ready` resolution pause.
 * Expected outcome: On success, snapshot includes all res4 children, `tacticalTurnNumber: 1`, and both sides have at least one placed sub-unit; skipped parents are listed when some sub-units could not be placed.
 * Exceptions: Catches unexpected errors, logs at error, and returns `failureReason` suitable for user-facing failure (no throw across IPC boundary).
 */
export function computeTacticalBattleSnapshot(
  enclosingRes1H3Index: string,
  battleId: string,
  options?: { allowDuringStrategicResolution?: boolean }
): {
  snapshot: TacticalBattleSnapshot | null;
  skippedParentDisplayNames: string[];
  failureReason?: string;
} {
  tacticalLogQuery('computeTacticalBattleSnapshot', {
    enclosingRes1H3Index,
    battleId,
    allowDuringStrategicResolution: !!options?.allowDuringStrategicResolution,
  });
  try {
    if (getResolution(enclosingRes1H3Index) !== WORLD_H3_RESOLUTION) {
      return { snapshot: null, skippedParentDisplayNames: [], failureReason: 'Not a res1 hex index.' };
    }
    const turnRow = dbGetOne<{ phase: string; turn_number: number }>(
      'SELECT phase, turn_number FROM turn_state WHERE id = 1'
    );
    if (!turnRow) {
      return { snapshot: null, skippedParentDisplayNames: [], failureReason: 'Missing turn state.' };
    }
    const phaseOk =
      turnRow.phase === 'planning' ||
      (options?.allowDuringStrategicResolution === true && turnRow.phase === 'resolution');
    if (!phaseOk) {
      return { snapshot: null, skippedParentDisplayNames: [], failureReason: 'Tactical battles can only start during strategic planning.' };
    }
    const hexRow = dbGetOne<{ terrain: string; terrain_kind: string }>(
      'SELECT terrain, terrain_kind FROM hexes WHERE h3_index = ?',
      [enclosingRes1H3Index]
    );
    if (!hexRow) {
      return { snapshot: null, skippedParentDisplayNames: [], failureReason: 'Unknown strategic hex.' };
    }
    const allUnits = listUnitsForSnapshot();
    const inHex = allUnits.filter((u) => u.h3Index === enclosingRes1H3Index);
    const hasHuman = inHex.some((u) => u.player === 'human');
    const hasOpponent = inHex.some((u) => u.player === 'opponent');
    if (!hasHuman || !hasOpponent) {
      return { snapshot: null, skippedParentDisplayNames: [], failureReason: 'Hex is not contested by both sides.' };
    }
    const parentLookup = buildUnitDisplayNameLookup(allUnits);
    const res4Rows = getRes4TerrainOverridesForRendererFromGame();
    const res4UrbanByH3 = new Map<string, boolean>();
    const res4KindByH3 = new Map<string, string>();
    const res4IsSeaportByH3: Record<string, boolean> = {};
    const res4IsAirportByH3: Record<string, boolean> = {};
    for (const row of res4Rows) {
      res4UrbanByH3.set(row.h3Index, !!row.isUrban);
      res4KindByH3.set(row.h3Index, row.terrainKind);
    }
    const children = cellToChildren(enclosingRes1H3Index, TACTICAL_H3_RESOLUTION);
    const childSet = new Set(children);
    // Seaport/airport for tactical march and spawn come only from `res4_feature_overrides`, not merged
    // renderer hints, so a res1-level port count cannot imply facility tiles on unrelated res4 children.
    for (const row of listRes4FeatureOverridesForGame()) {
      if (!childSet.has(row.h3Index)) continue;
      if (row.isSeaport) res4IsSeaportByH3[row.h3Index] = true;
      if (row.isAirport) res4IsAirportByH3[row.h3Index] = true;
    }
    const placementTerrain: TacticalTerrainKindResolver = {
      parentTerrain: hexRow.terrain,
      parentTerrainKind: hexRow.terrain_kind,
      effectiveKindForRes4Hex(h3: string): string {
        return res4KindByH3.get(h3) ?? hexRow.terrain_kind;
      },
      isSeaportRes4(h3: string): boolean {
        return !!res4IsSeaportByH3[h3];
      },
    };
    const orderedCells = orderRes4CellsForPlacement({
      enclosingRes1: enclosingRes1H3Index,
      children,
      previousRes1: undefined,
      res4UrbanByH3,
      parentTerrain: hexRow.terrain,
      parentTerrainKind: hexRow.terrain_kind,
      battleId,
    });
    const subUnits: TacticalSubUnitSnapshot[] = [];
    const skippedParentDisplayNames: string[] = [];
    for (const parent of inHex) {
      const n = tacticalSubUnitCountForStrategicUnitType(parent.unitType);
      if (n <= 0) continue;
      const prev = getPreviousStrategicH3IndexForUnit(parent.id);
      const orderedForParent =
        prev && prev !== enclosingRes1H3Index
          ? orderRes4CellsForPlacement({
              enclosingRes1: enclosingRes1H3Index,
              children,
              previousRes1: prev,
              res4UrbanByH3,
              parentTerrain: hexRow.terrain,
              parentTerrainKind: hexRow.terrain_kind,
              battleId: `${battleId}|${parent.id}`,
            })
          : orderedCells;
      const parentName = parentLookup.get(parent.id) ?? parent.id;
      let placed = 0;
      let cellCursor = 0;
      while (placed < n) {
        if (cellCursor >= orderedForParent.length * 3) break;
        const cell = orderedForParent[cellCursor % orderedForParent.length]!;
        cellCursor += 1;
        const effKind = res4KindByH3.get(cell) ?? hexRow.terrain_kind;
        const seaportHere = !!res4IsSeaportByH3[cell];
        const airportHere = !!res4IsAirportByH3[cell];
        if (
          !isRes4CellPassableForUnitType(
            parent.unitType,
            effKind,
            hexRow.terrain,
            hexRow.terrain_kind,
            seaportHere,
            airportHere,
            cell,
            childSet,
            placementTerrain
          )
        ) {
          continue;
        }
        placed += 1;
        const two = String(placed).padStart(2, '0');
        subUnits.push({
          id: `${battleId}:${parent.id}:${two}`,
          parentUnitId: parent.id,
          player: parent.player === 'human' ? 'human' : 'opponent',
          unitType: parent.unitType,
          h3Index: cell,
          displayName: formatTacticalSubUnitDisplayName(parentName, placed),
        });
      }
      if (placed < n) {
        skippedParentDisplayNames.push(parentName);
      }
    }
    if (!tacticalSnapshotHasPlacedUnitsForBothSides(subUnits)) {
      return {
        snapshot: null,
        skippedParentDisplayNames,
        failureReason:
          subUnits.length === 0
            ? 'No tactical sub-units could be placed for this battle.'
            : 'One side has no tactical sub-units on the map; the battle cannot start until both sides can fight.',
      };
    }
    const res4TerrainKindByH3: Record<string, string> = {};
    for (const cell of children) {
      res4TerrainKindByH3[cell] = res4KindByH3.get(cell) ?? hexRow.terrain_kind;
    }
    const urbanRubble = tacticalRes4UrbanRubbleFlagRecordsForFootprint(children, res4Rows);
    const snapshot: TacticalBattleSnapshot = {
      battleId,
      enclosingRes1H3Index,
      res4ChildH3Indexes: children,
      strategicTurnNumber: turnRow.turn_number,
      tacticalTurnNumber: 1,
      strategicHexTerrain: hexRow.terrain,
      strategicHexTerrainKind: hexRow.terrain_kind,
      res4TerrainKindByH3,
      ...(Object.keys(res4IsSeaportByH3).length > 0 ? { res4IsSeaportByH3 } : {}),
      ...(urbanRubble.res4IsUrbanByH3 ? { res4IsUrbanByH3: urbanRubble.res4IsUrbanByH3 } : {}),
      ...(urbanRubble.res4IsRubbleByH3 ? { res4IsRubbleByH3: urbanRubble.res4IsRubbleByH3 } : {}),
      subUnits,
    };
    tacticalLogQuery('computeTacticalBattleSnapshot result', {
      battleId,
      subUnitCount: subUnits.length,
      skippedParents: skippedParentDisplayNames.length,
    });
    return { snapshot, skippedParentDisplayNames };
  } catch (err) {
    tacticalLogError('computeTacticalBattleSnapshot failed', { enclosingRes1H3Index, battleId, err });
    return { snapshot: null, skippedParentDisplayNames: [], failureReason: 'Internal error while building tactical battle.' };
  }
}
