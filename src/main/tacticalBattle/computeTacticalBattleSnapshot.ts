import { cellToChildren, cellToLatLng, getResolution } from 'h3-js';
import type { TacticalBattleSnapshot, TacticalSubUnitSnapshot } from '../../shared/tacticalBattleTypes';
import { buildUnitDisplayNameLookup, formatTacticalSubUnitDisplayName } from '../../shared/unitDisplayNames';
import { formatTacticalSubUnitId } from '../../shared/unitIds';
import { getPreviousStrategicH3IndexForUnit } from '../strategicUnitPreviousHex';
import {
  dbGetOne,
  getRes4TerrainOverridesForRendererFromGame,
  listRes4FeatureOverridesForGame,
  listUnitsForSnapshot,
} from '../gameDb';
import { readTurnStateRow } from '../gameDb/turnStateReads';
import { readPersistedOriginBonusSettings } from '../gameDb/originBonusConfig';
import { parseStartMonth } from '../../shared/weatherBonusRules';
import { displayWeatherForHex, weatherTagsForBirthHex } from '../weather/weatherPackLoad';
import { res4CountryNamesForCells } from '../unitOrigin/res4BirthCountryCache';
import { getRes4RoadRailOverlaysForRenderer } from '../terrainClassificationCache';
import { tacticalNavalHasMovableNeighborInFootprint } from '../../shared/tacticalRes4MovementPlanner';
import {
  tacticalRes4FootprintTransportOverlayRecords,
  tacticalRes4InfantryArmorSpawnAllowedViaTransport,
} from '../../shared/tacticalRes4TransportLink';
import { tacticalRes4UrbanRubbleFlagRecordsForFootprint } from '../../shared/tacticalTerrainCombatModifiers';
import type { TacticalTerrainKindResolver } from '../../shared/tacticalTerrainMovement';
import {
  isNavalRes4TacticalCellNavigable,
  tacticalLandUnitMayOccupyCellWithoutTransport,
  tacticalTerrainTransportResolverFnsFromRoadRailMap,
} from '../../shared/tacticalTerrainMovement';
import { logDebug } from '../logger';
import { claimInitialPlacementHex, type InitialPlacementSide } from '../../shared/initialPlacementSides';
import { hashStringToUint32 } from '../../shared/stableHash';
import { tacticalLogError, tacticalLogMutate, tacticalLogQuery } from './tacticalLogging';
import { STRATEGIC_H3_RESOLUTION, TACTICAL_H3_RESOLUTION } from '../../shared/h3Resolutions';

/**
 * Maps one strategic parent type to the number of tactical sub-units placed for it.
 *
 * Purpose: Only multiplication table. Placement and the voluntary-exit fallback (when a snapshot stored no baseline) both use it.
 * When to use: Once per parent while building a battle snapshot, and from the exit fallback.
 * Expected outcome: Infantry 8, armor 4, air 3, naval 4. Any other type returns 0.
 * Exceptions: None.
 */
export function tacticalSubUnitCountForStrategicUnitType(unitType: string): number {
  let count = 0;
  switch (unitType) {
    case 'infantry':
      count = 8;
      break;
    case 'armor':
      count = 4;
      break;
    case 'air':
      count = 3;
      break;
    case 'naval':
      count = 4;
      break;
    default:
      count = 0;
      break;
  }
  tacticalLogQuery('computeTacticalBattleSnapshot tacticalSubUnitCountForStrategicUnitType', { unitType, count });
  return count;
}

/**
 * Rebuilds per-res4 terrain kinds and seaport facility flags on a tactical snapshot from the live game database.
 *
 * Purpose: Snapshot `res4TerrainKindByH3` / `res4IsSeaportByH3` / `res4IsAirportByH3` are frozen at battle start; tactical air infrastructure strikes
 * mutate `res4_feature_overrides` and `res1_infrastructure`, so march planners and the renderer must see rubble and removed ports without exiting tactical mode.
 * When to use: After `applyInfrastructureDestructionEffects` succeeds during human tactical support projection.
 * Expected outcome: Footprint cells match `getRes4TerrainOverridesForRendererFromGame` and `listRes4FeatureOverridesForGame`; stale seaport and airport keys are dropped when no facility rows remain.
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
  const res4IsAirportByH3: Record<string, boolean> = {};
  for (const row of listRes4FeatureOverridesForGame()) {
    if (!childSet.has(row.h3Index)) continue;
    if (row.isSeaport) res4IsSeaportByH3[row.h3Index] = true;
    if (row.isAirport) res4IsAirportByH3[row.h3Index] = true;
  }
  const urbanRubble = tacticalRes4UrbanRubbleFlagRecordsForFootprint(battle.res4ChildH3Indexes, res4Rows);
  const transport = tacticalRes4FootprintTransportOverlayRecords({
    childFootprint: childSet,
    overlays: getRes4RoadRailOverlaysForRenderer(),
  });
  const next: TacticalBattleSnapshot = { ...battle, res4TerrainKindByH3, ...urbanRubble };
  delete next.res4IsSeaportByH3;
  delete next.res4IsAirportByH3;
  delete next.res4IsUrbanByH3;
  delete next.res4IsRubbleByH3;
  delete next.res4RoadSidesByH3;
  delete next.res4RailSidesByH3;
  if (Object.keys(res4IsSeaportByH3).length > 0) {
    next.res4IsSeaportByH3 = res4IsSeaportByH3;
  }
  if (Object.keys(res4IsAirportByH3).length > 0) {
    next.res4IsAirportByH3 = res4IsAirportByH3;
  }
  if (urbanRubble.res4IsUrbanByH3) next.res4IsUrbanByH3 = urbanRubble.res4IsUrbanByH3;
  if (urbanRubble.res4IsRubbleByH3) next.res4IsRubbleByH3 = urbanRubble.res4IsRubbleByH3;
  if (transport.res4RoadSidesByH3) next.res4RoadSidesByH3 = transport.res4RoadSidesByH3;
  if (transport.res4RailSidesByH3) next.res4RailSidesByH3 = transport.res4RailSidesByH3;
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
 * Purpose: Filters impossible tactical spawn cells using the same occupancy rules as marching.
 * When to use: Before assigning sub-units to res4 children during snapshot build.
 * Expected outcome: Naval favors water/coastal; air requires airport; infantry/armor require occupiable terrain or a transport link.
 * Exceptions: None.
 */
function isRes4CellPassableForUnitType(args: {
  unitType: string;
  effectiveKind: string;
  parentTerrain: string;
  parentTerrainKind: string;
  isSeaportCell: boolean;
  isAirportCell: boolean;
  cellH3: string;
  childFootprint: ReadonlySet<string>;
  placementTerrain: TacticalTerrainKindResolver;
  roadRailByH3: ReadonlyMap<string, { roadSides: readonly boolean[]; railSides: readonly boolean[] }>;
  rubbleByH3?: Readonly<Record<string, boolean>>;
}): boolean {
  const {
    unitType,
    effectiveKind,
    parentTerrain,
    parentTerrainKind,
    isSeaportCell,
    isAirportCell,
    cellH3,
    childFootprint,
    placementTerrain,
    roadRailByH3,
    rubbleByH3,
  } = args;
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
    if (tacticalLandUnitMayOccupyCellWithoutTransport(unitType, cellH3, placementTerrain)) {
      return true;
    }
    if (roadRailByH3.size === 0) return false;
    return tacticalRes4InfantryArmorSpawnAllowedViaTransport({
      cellH3,
      childFootprint,
      roadRailByH3,
      rubbleByH3,
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
  const rng = mulberry32(hashStringToUint32(args.battleId));
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
 * Walks ordered opening cells until one is passable and not already held by the other side.
 *
 * Purpose: Tactical opening placement uses it so a sub-unit never lands on a cell the other side already holds; same-side stacking still wraps onto this side's cells.
 * When to use: Inside the parent placement loop, with one occupancy map shared by every parent in the battle.
 * Expected outcome: The chosen cell and the cursor already advanced past it, or null when the list is empty or the cursor bound is reached.
 * Exceptions: None.
 */
export function takeNextOpeningCell(args: {
  orderedCells: readonly string[];
  cellCursor: number;
  maxCursor: number;
  passable: (cell: string) => boolean;
  occupiedByHex: Map<string, InitialPlacementSide>;
  placingSide: InitialPlacementSide;
}): { cell: string; nextCursor: number } | null {
  logDebug('takeNextOpeningCell', {
    placingSide: args.placingSide,
    cellCursor: args.cellCursor,
    cellCount: args.orderedCells.length,
  });
  if (args.orderedCells.length === 0) return null;
  let cursor = args.cellCursor;
  while (cursor < args.maxCursor) {
    const cell = args.orderedCells[cursor % args.orderedCells.length]!;
    cursor += 1;
    if (!args.passable(cell)) continue;
    if (!claimInitialPlacementHex(args.occupiedByHex, cell, args.placingSide)) continue;
    return { cell, nextCursor: cursor };
  }
  return null;
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
    if (getResolution(enclosingRes1H3Index) !== STRATEGIC_H3_RESOLUTION) {
      return { snapshot: null, skippedParentDisplayNames: [], failureReason: 'Not a res1 hex index.' };
    }
    const turnRow = readTurnStateRow(dbGetOne);
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
    const weatherSettings = readPersistedOriginBonusSettings({ getOne: dbGetOne, hasDb: () => true });
    const weatherOn = weatherSettings.weatherBonusEnabled === true;
    const battleWeather = weatherOn
      ? displayWeatherForHex(enclosingRes1H3Index, turnRow.turn_number, parseStartMonth(weatherSettings.startMonth))
      : undefined;
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
    const urbanRubbleForPlacement = tacticalRes4UrbanRubbleFlagRecordsForFootprint(children, res4Rows);
    const transportForPlacement = tacticalRes4FootprintTransportOverlayRecords({
      childFootprint: childSet,
      overlays: getRes4RoadRailOverlaysForRenderer(),
    });
    const roadRailByH3 = transportForPlacement.roadRailByH3;
    const transportFns = tacticalTerrainTransportResolverFnsFromRoadRailMap(
      roadRailByH3,
      urbanRubbleForPlacement.res4IsRubbleByH3 ?? {}
    );
    const placementTerrain: TacticalTerrainKindResolver = {
      parentTerrain: hexRow.terrain,
      parentTerrainKind: hexRow.terrain_kind,
      effectiveKindForRes4Hex(h3: string): string {
        return res4KindByH3.get(h3) ?? hexRow.terrain_kind;
      },
      isSeaportRes4(h3: string): boolean {
        return !!res4IsSeaportByH3[h3];
      },
      isUrbanRes4(h3: string): boolean {
        return !!urbanRubbleForPlacement.res4IsUrbanByH3?.[h3];
      },
      isRubbleRes4(h3: string): boolean {
        return !!urbanRubbleForPlacement.res4IsRubbleByH3?.[h3];
      },
      transportFromTo: transportFns.transportFromTo,
      landTransportMarchContext: transportFns.landTransportMarchContext,
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
    const occupiedByHex = new Map<string, InitialPlacementSide>();
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
      const placingSide: InitialPlacementSide = parent.player === 'human' ? 'human' : 'opponent';
      while (placed < n) {
        const next = takeNextOpeningCell({
          orderedCells: orderedForParent,
          cellCursor,
          maxCursor: orderedForParent.length * 3,
          passable: (cell) => {
            const effKind = res4KindByH3.get(cell) ?? hexRow.terrain_kind;
            return isRes4CellPassableForUnitType({
              unitType: parent.unitType,
              effectiveKind: effKind,
              parentTerrain: hexRow.terrain,
              parentTerrainKind: hexRow.terrain_kind,
              isSeaportCell: !!res4IsSeaportByH3[cell],
              isAirportCell: !!res4IsAirportByH3[cell],
              cellH3: cell,
              childFootprint: childSet,
              placementTerrain,
              roadRailByH3,
              rubbleByH3: urbanRubbleForPlacement.res4IsRubbleByH3,
            });
          },
          occupiedByHex,
          placingSide,
        });
        if (!next) break;
        cellCursor = next.nextCursor;
        placed += 1;
        subUnits.push({
          id: formatTacticalSubUnitId(parent.id, placed),
          parentUnitId: parent.id,
          player: placingSide,
          unitType: parent.unitType,
          h3Index: next.cell,
          displayName: formatTacticalSubUnitDisplayName(parentName, placed),
          ...(parent.origin ? { origin: parent.origin } : {}),
          ...(weatherOn ? { weatherTags: weatherTagsForBirthHex(parent.origin?.birthH3Index) } : {}),
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
    const urbanRubble = urbanRubbleForPlacement;
    const res4CountryNameByH3 = res4CountryNamesForCells(children);
    const snapshot: TacticalBattleSnapshot = {
      battleId,
      enclosingRes1H3Index,
      res4ChildH3Indexes: children,
      strategicTurnNumber: turnRow.turn_number,
      tacticalTurnNumber: 1,
      ...(weatherOn && battleWeather ? { weatherBonusEnabled: true as const, weatherBonusLevel: weatherSettings.weatherBonusLevel ?? 'low', weather: battleWeather } : {}),
      strategicHexTerrain: hexRow.terrain,
      strategicHexTerrainKind: hexRow.terrain_kind,
      res4TerrainKindByH3,
      ...(res4CountryNameByH3 ? { res4CountryNameByH3 } : {}),
      ...(Object.keys(res4IsSeaportByH3).length > 0 ? { res4IsSeaportByH3 } : {}),
      ...(Object.keys(res4IsAirportByH3).length > 0 ? { res4IsAirportByH3 } : {}),
      ...(urbanRubble.res4IsUrbanByH3 ? { res4IsUrbanByH3: urbanRubble.res4IsUrbanByH3 } : {}),
      ...(urbanRubble.res4IsRubbleByH3 ? { res4IsRubbleByH3: urbanRubble.res4IsRubbleByH3 } : {}),
      ...(transportForPlacement.res4RoadSidesByH3
        ? { res4RoadSidesByH3: transportForPlacement.res4RoadSidesByH3 }
        : {}),
      ...(transportForPlacement.res4RailSidesByH3
        ? { res4RailSidesByH3: transportForPlacement.res4RailSidesByH3 }
        : {}),
      initialPlacedSubUnitCountByParentId: subUnits.reduce<Record<string, number>>((acc, sub) => {
        const prior = acc[sub.parentUnitId] ?? 0;
        acc[sub.parentUnitId] = prior + 1;
        return acc;
      }, {}),
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
