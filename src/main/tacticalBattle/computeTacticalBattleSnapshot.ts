import { cellToLatLng } from 'h3-js';
import { isMissileUnitType } from '../../shared/missileRules';
import { missilePlacementCellOrder, missilePlacementPassable } from './tacticalMissilePlacement';
import type { TacticalBattleSnapshot, TacticalSubUnitSnapshot } from '../../shared/tacticalBattleTypes';
import { buildUnitDisplayNameLookup, formatTacticalSubUnitDisplayName } from '../../shared/unitDisplayNames';
import { formatTacticalSubUnitId } from '../../shared/unitIds';
import { getPreviousStrategicH3IndexForUnit } from '../strategicUnitPreviousHex';
import {
  dbGetAll,
  dbGetOne,
  getTacticalTerrainOverridesForRendererFromGame,
  listTacticalFeatureOverridesForGame,
  listUnitsForSnapshot,
} from '../gameDb';
import { readTurnStateRow } from '../gameDb/turnStateReads';
import { readPersistedOriginBonusSettings } from '../gameDb/originBonusConfig';
import { parseStartMonth } from '../../shared/weatherBonusRules';
import { techLevelForBirthHex } from '../techBonus/techLevelForBirthHex';
import { displayWeatherForHex, weatherTagsForBirthHex } from '../weather/weatherPackLoad';
import { tacticalCountryNamesForCells } from '../unitOrigin/tacticalBirthCountryCache';
import { getTacticalRoadRailOverlaysForRenderer } from '../terrainClassificationCache';
import { tacticalNavalHasMovableNeighborInFootprint } from '../../shared/tacticalMovementPlanner';
import {
  tacticalFootprintTransportOverlayRecords,
  tacticalInfantryArmorSpawnAllowedViaTransport,
} from '../../shared/tacticalTransportLink';
import { tacticalUrbanRubbleFlagRecordsForFootprint } from '../../shared/tacticalTerrainCombatModifiers';
import type { TacticalTerrainKindResolver } from '../../shared/tacticalTerrainMovement';
import {
  isNavalTacticalCellNavigable,
  tacticalLandUnitMayOccupyCellWithoutTransport,
  tacticalTerrainTransportResolverFnsFromRoadRailMap,
} from '../../shared/tacticalTerrainMovement';
import { logDebug } from '../logger';
import { claimInitialPlacementHex, type InitialPlacementSide } from '../../shared/initialPlacementSides';
import { hashStringToUint32 } from '../../shared/stableHash';
import { tacticalLogError, tacticalLogMutate, tacticalLogQuery } from './tacticalLogging';
import { loadedStrategicTerrainKindByH3 } from '../gameDb/mapHexRead';
import { isStrategicCell } from '../../shared/h3Resolutions';
import { HUMAN_SEAT_ID, isOwnerId } from '../../shared/seatIds';
import { tacticalBattleFootprint, tacticalBattleTerrainKindByCell } from '../../shared/tacticalBattleFootprint';

/**
 * Maps one strategic parent type to the number of tactical sub-units placed for it.
 *
 * Purpose: Only multiplication table. Placement and the voluntary-exit fallback (when a snapshot stored no baseline) both use it.
 * When to use: Once per parent while building a battle snapshot, and from the exit fallback.
 * Expected outcome: Infantry 8, armor 4, air 3, naval 4, missile 1. Any other type returns 0.
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
    case 'missile':
      count = 1;
      break;
    default:
      count = 0;
      break;
  }
  tacticalLogQuery('computeTacticalBattleSnapshot tacticalSubUnitCountForStrategicUnitType', { unitType, count });
  return count;
}

/**
 * Rebuilds per-tactical terrain kinds and seaport facility flags on a tactical snapshot from the live game database.
 *
 * Purpose: Snapshot `tacticalTerrainKindByH3` / `tacticalIsSeaportByH3` / `tacticalIsAirportByH3` are frozen at battle start; tactical air infrastructure strikes
 * mutate `res_t_feature_overrides` and `res_s_infrastructure`, so march planners and the renderer must see rubble and removed ports without exiting tactical mode.
 * When to use: After `applyInfrastructureDestructionEffects` succeeds during human tactical support projection.
 * Expected outcome: Footprint cells match `getTacticalTerrainOverridesForRendererFromGame` and `listTacticalFeatureOverridesForGame`; stale seaport and airport keys are dropped when no facility rows remain. Airport and seaport flags stay on the core cells.
 * Exceptions: None. A missing tactical row uses a loaded geometric parent, then the enclosing hex's kind.
 */
export function refreshTacticalBattleTerrainFromGameDb(battle: TacticalBattleSnapshot): TacticalBattleSnapshot {
  tacticalLogMutate('refreshTacticalBattleTerrainFromGameDb', {
    battleId: battle.battleId,
    tacticalCellCount: battle.tacticalChildH3Indexes.length,
  });
  const readSet = new Set(battle.tacticalChildH3Indexes);
  const facilitySet = new Set(battle.coreChildH3Indexes ?? battle.tacticalChildH3Indexes);
  const tacticalRows = getTacticalTerrainOverridesForRendererFromGame();
  const tacticalKindByH3 = new Map<string, string>();
  for (const row of tacticalRows) {
    if (!readSet.has(row.h3Index)) continue;
    tacticalKindByH3.set(row.h3Index, row.terrainKind);
  }
  const enclosingKind = battle.strategicHexTerrainKind ?? 'plains';
  const tacticalTerrainKindByH3 = tacticalBattleTerrainKindByCell({
    cells: battle.tacticalChildH3Indexes,
    tacticalKindByH3,
    enclosingKind,
    loadedStrategicKindByH3: loadedStrategicTerrainKindByH3(dbGetAll),
  });
  const tacticalIsSeaportByH3: Record<string, boolean> = {};
  const tacticalIsAirportByH3: Record<string, boolean> = {};
  for (const row of listTacticalFeatureOverridesForGame()) {
    if (!facilitySet.has(row.h3Index)) continue;
    if (row.isSeaport) tacticalIsSeaportByH3[row.h3Index] = true;
    if (row.isAirport) tacticalIsAirportByH3[row.h3Index] = true;
  }
  const urbanRubble = tacticalUrbanRubbleFlagRecordsForFootprint(battle.tacticalChildH3Indexes, tacticalRows);
  const transport = tacticalFootprintTransportOverlayRecords({
    childFootprint: readSet,
    overlays: getTacticalRoadRailOverlaysForRenderer(),
  });
  const next: TacticalBattleSnapshot = { ...battle, tacticalTerrainKindByH3, ...urbanRubble };
  delete next.tacticalIsSeaportByH3;
  delete next.tacticalIsAirportByH3;
  delete next.tacticalIsUrbanByH3;
  delete next.tacticalIsRubbleByH3;
  delete next.tacticalRoadSidesByH3;
  delete next.tacticalRailSidesByH3;
  if (Object.keys(tacticalIsSeaportByH3).length > 0) {
    next.tacticalIsSeaportByH3 = tacticalIsSeaportByH3;
  }
  if (Object.keys(tacticalIsAirportByH3).length > 0) {
    next.tacticalIsAirportByH3 = tacticalIsAirportByH3;
  }
  if (urbanRubble.tacticalIsUrbanByH3) next.tacticalIsUrbanByH3 = urbanRubble.tacticalIsUrbanByH3;
  if (urbanRubble.tacticalIsRubbleByH3) next.tacticalIsRubbleByH3 = urbanRubble.tacticalIsRubbleByH3;
  if (transport.tacticalRoadSidesByH3) next.tacticalRoadSidesByH3 = transport.tacticalRoadSidesByH3;
  if (transport.tacticalRailSidesByH3) next.tacticalRailSidesByH3 = transport.tacticalRailSidesByH3;
  return next;
}

/**
 * Returns true when both human and opponent have at least one placed tactical sub-unit.
 *
 * Purpose: Enforces tactical start rules so a tactical session never begins with one side already annihilated by placement alone.
 * When to use: After greedy placement in `computeTacticalBattleSnapshot` before returning a snapshot.
 * Expected outcome: False when either player has zero tactical sub-units in the synthesized array.
 * Exceptions: None.
 */
export function tacticalSnapshotHasPlacedUnitsForBothSides(
  subUnits: readonly Pick<TacticalSubUnitSnapshot, 'player'>[]
): boolean {
  tacticalLogQuery('tacticalSnapshotHasPlacedUnitsForBothSides', { count: subUnits.length });
  let human = false;
  let other = false;
  for (const u of subUnits) {
    if (u.player === HUMAN_SEAT_ID) human = true;
    else other = true;
    if (human && other) return true;
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
 * Purpose: Shared geometry helper for vector scoring between strategic and tactical cells.
 * When to use: Placement ordering that prefers cells toward previous strategic direction.
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
 * When to use: Sorting tactical candidates toward previous strategic neighbors.
 * Expected outcome: Scalar in roughly `[-1,1]` for normalized inputs.
 * Exceptions: None.
 */
function dot(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  return a.lat * b.lat + a.lng * b.lng;
}

/**
 * Returns true if a tactical cell's effective terrain is passable for the given strategic unit type for placement.
 *
 * Purpose: Filters impossible tactical spawn cells using the same occupancy rules as marching.
 * When to use: Before assigning sub-units to tactical children during snapshot build.
 * Expected outcome: Naval favors water/coastal; air requires airport; infantry/armor require occupiable terrain or a transport link.
 * Exceptions: None.
 */
function isTacticalCellPassableForUnitType(args: {
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
      !isNavalTacticalCellNavigable({
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
      tacticalSet: childFootprint,
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
    return tacticalInfantryArmorSpawnAllowedViaTransport({
      cellH3,
      childFootprint,
      roadRailByH3,
      rubbleByH3,
    });
  }
  return kind !== 'water';
}

/**
 * Orders tactical child cells for placement using entry-direction preference, seeded edge jitter, and optional urban weighting.
 *
 * Purpose: Produces a single prioritized visit order for greedy sub-unit placement.
 * When to use: Once per battle when expanding parents into tactical sub-units.
 * Expected outcome: Permutation of input `children` tailored to battle geometry and rng.
 * Exceptions: None.
 */
function orderTacticalCellsForPlacement(args: {
  enclosingStrategic: string;
  children: string[];
  previousStrategic: string | undefined;
  tacticalUrbanByH3: Map<string, boolean>;
  parentTerrain: string;
  parentTerrainKind: string;
  battleId: string;
}): string[] {
  const center = latLngCenterForH3(args.enclosingStrategic);
  let entry = { lat: 0, lng: 1 };
  if (args.previousStrategic && args.previousStrategic !== args.enclosingStrategic) {
    const prev = latLngCenterForH3(args.previousStrategic);
    entry = normalizeVec(prev.lat - center.lat, prev.lng - center.lng);
  }
  const rng = mulberry32(hashStringToUint32(args.battleId));
  const scored = args.children.map((h3) => {
    const c = latLngCenterForH3(h3);
    const v = normalizeVec(c.lat - center.lat, c.lng - center.lng);
    const towardPrev = dot(v, entry);
    const urban = args.tacticalUrbanByH3.get(h3) ? 0.15 + rng() * 0.05 : 0;
    const jitter = rng() * 0.001;
    if (!args.previousStrategic || args.previousStrategic === args.enclosingStrategic) {
      const urbanBoost = args.tacticalUrbanByH3.get(h3) ? 2.0 : 0;
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
 * Builds a complete tactical battle snapshot for the given enclosing strategic hex, or returns null with reasons on failure.
 *
 * Contract: Read-only against SQLite and in-memory previous-hex memory; synthesizes temporary sub-units without writing strategic unit rows.
 * When to use: `startTacticalBattleForEnclosingStrategicHex` after IPC confirms contested strategic during strategic planning, or melee-intercept probes with `allowDuringStrategicResolution` during `ready` resolution pause.
 * Expected outcome: On success, snapshot includes all tactical children, `tacticalTurnNumber: 1`, and both sides have at least one placed sub-unit; skipped parents are listed when some sub-units could not be placed.
 * Exceptions: Catches unexpected errors, logs at error, and returns `failureReason` suitable for user-facing failure (no throw across IPC boundary).
 */
export function computeTacticalBattleSnapshot(
  enclosingStrategicH3Index: string,
  battleId: string,
  options?: { allowDuringStrategicResolution?: boolean }
): {
  snapshot: TacticalBattleSnapshot | null;
  skippedParentDisplayNames: string[];
  failureReason?: string;
} {
  tacticalLogQuery('computeTacticalBattleSnapshot', {
    enclosingStrategicH3Index,
    battleId,
    allowDuringStrategicResolution: !!options?.allowDuringStrategicResolution,
  });
  try {
    if (!isStrategicCell(enclosingStrategicH3Index)) {
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
      [enclosingStrategicH3Index]
    );
    if (!hexRow) {
      return { snapshot: null, skippedParentDisplayNames: [], failureReason: 'Unknown strategic hex.' };
    }
    const allUnits = listUnitsForSnapshot();
    const weatherSettings = readPersistedOriginBonusSettings({ getOne: dbGetOne, hasDb: () => true });
    const weatherOn = weatherSettings.weatherBonusEnabled === true;
    const techOn = weatherSettings.techBonusEnabled === true;
    const battleWeather = weatherOn
      ? displayWeatherForHex(enclosingStrategicH3Index, turnRow.turn_number, parseStartMonth(weatherSettings.startMonth))
      : undefined;
    const inHex = allUnits.filter((u) => u.h3Index === enclosingStrategicH3Index);
    const owners = [...new Set(inHex.map((unit) => unit.player))];
    const otherOwners = owners.filter((owner) => owner !== HUMAN_SEAT_ID);
    if (!owners.includes(HUMAN_SEAT_ID) || otherOwners.length !== 1) {
      return { snapshot: null, skippedParentDisplayNames: [], failureReason: 'Hex is not contested by exactly two sides.' };
    }
    const opposingOwner = otherOwners[0];
    if (!opposingOwner || !isOwnerId(opposingOwner)) {
      return { snapshot: null, skippedParentDisplayNames: [], failureReason: 'Hex is not contested by exactly two sides.' };
    }
    const opposingPartyId = opposingOwner;
    const parentLookup = buildUnitDisplayNameLookup(allUnits);
    const tacticalRows = getTacticalTerrainOverridesForRendererFromGame();
    const tacticalUrbanByH3 = new Map<string, boolean>();
    const tacticalKindByH3 = new Map<string, string>();
    const tacticalIsSeaportByH3: Record<string, boolean> = {};
    const tacticalIsAirportByH3: Record<string, boolean> = {};
    for (const row of tacticalRows) {
      tacticalUrbanByH3.set(row.h3Index, !!row.isUrban);
      tacticalKindByH3.set(row.h3Index, row.terrainKind);
    }
    const footprint = tacticalBattleFootprint(enclosingStrategicH3Index);
    const children = footprint.h3Indexes;
    const coreChildren = footprint.coreChildH3Indexes;
    const coreSet = new Set(coreChildren);
    const childSet = new Set(children);
    // Seaport/airport for tactical march and spawn come only from `res_t_feature_overrides`, not merged
    // renderer hints, so a strategic-level port count cannot imply facility tiles on unrelated tactical children.
    for (const row of listTacticalFeatureOverridesForGame()) {
      if (!coreSet.has(row.h3Index)) continue;
      if (row.isSeaport) tacticalIsSeaportByH3[row.h3Index] = true;
      if (row.isAirport) tacticalIsAirportByH3[row.h3Index] = true;
    }
    const urbanRubbleForPlacement = tacticalUrbanRubbleFlagRecordsForFootprint(coreChildren, tacticalRows);
    const urbanRubble = tacticalUrbanRubbleFlagRecordsForFootprint(children, tacticalRows);
    const transportForPlacement = tacticalFootprintTransportOverlayRecords({
      childFootprint: coreSet,
      overlays: getTacticalRoadRailOverlaysForRenderer(),
    });
    const transportForFootprint = tacticalFootprintTransportOverlayRecords({
      childFootprint: childSet,
      overlays: getTacticalRoadRailOverlaysForRenderer(),
    });
    const roadRailByH3 = transportForPlacement.roadRailByH3;
    const transportFns = tacticalTerrainTransportResolverFnsFromRoadRailMap(
      roadRailByH3,
      urbanRubbleForPlacement.tacticalIsRubbleByH3 ?? {}
    );
    const placementTerrain: TacticalTerrainKindResolver = {
      parentTerrain: hexRow.terrain,
      parentTerrainKind: hexRow.terrain_kind,
      effectiveKindForTacticalHex(h3: string): string {
        return tacticalKindByH3.get(h3) ?? hexRow.terrain_kind;
      },
      isSeaportTactical(h3: string): boolean {
        return !!tacticalIsSeaportByH3[h3];
      },
      isUrbanTactical(h3: string): boolean {
        return !!urbanRubbleForPlacement.tacticalIsUrbanByH3?.[h3];
      },
      isRubbleTactical(h3: string): boolean {
        return !!urbanRubbleForPlacement.tacticalIsRubbleByH3?.[h3];
      },
      transportFromTo: transportFns.transportFromTo,
      landTransportMarchContext: transportFns.landTransportMarchContext,
    };
    const orderedCells = orderTacticalCellsForPlacement({
      enclosingStrategic: enclosingStrategicH3Index,
      children: [...coreChildren],
      previousStrategic: undefined,
      tacticalUrbanByH3,
      parentTerrain: hexRow.terrain,
      parentTerrainKind: hexRow.terrain_kind,
      battleId,
    });
    const subUnits: TacticalSubUnitSnapshot[] = [];
    const skippedParentDisplayNames: string[] = [];
    const occupiedByHex = new Map<string, InitialPlacementSide>();
    const parentsInPlacementOrder = [
      ...inHex.filter((parent) => isMissileUnitType(parent.unitType)),
      ...inHex.filter((parent) => !isMissileUnitType(parent.unitType)),
    ];
    for (const parent of parentsInPlacementOrder) {
      const n = tacticalSubUnitCountForStrategicUnitType(parent.unitType);
      if (n <= 0) continue;
      const prev = getPreviousStrategicH3IndexForUnit(parent.id);
      const orderedForParent =
        prev && prev !== enclosingStrategicH3Index
          ? orderTacticalCellsForPlacement({
              enclosingStrategic: enclosingStrategicH3Index,
              children: [...coreChildren],
              previousStrategic: prev,
              tacticalUrbanByH3,
              parentTerrain: hexRow.terrain,
              parentTerrainKind: hexRow.terrain_kind,
              battleId: `${battleId}|${parent.id}`,
            })
          : orderedCells;
      const missileParent = isMissileUnitType(parent.unitType);
      const openingCells = missileParent
        ? missilePlacementCellOrder({
            birthTacticalH3Index: parent.origin?.birthTacticalH3Index,
            coreSet,
            orderedCells: orderedForParent,
          })
        : orderedForParent;
      const parentName = parentLookup.get(parent.id) ?? parent.id;
      let placed = 0;
      let cellCursor = 0;
      const placingSide: InitialPlacementSide = parent.player === HUMAN_SEAT_ID ? HUMAN_SEAT_ID : opposingPartyId;
      const genericPassable = (cell: string): boolean => {
        const effKind = tacticalKindByH3.get(cell) ?? hexRow.terrain_kind;
        return isTacticalCellPassableForUnitType({
          unitType: parent.unitType,
          effectiveKind: effKind,
          parentTerrain: hexRow.terrain,
          parentTerrainKind: hexRow.terrain_kind,
          isSeaportCell: !!tacticalIsSeaportByH3[cell],
          isAirportCell: !!tacticalIsAirportByH3[cell],
          cellH3: cell,
          childFootprint: coreSet,
          placementTerrain,
          roadRailByH3,
          rubbleByH3: urbanRubbleForPlacement.tacticalIsRubbleByH3,
        });
      };
      while (placed < n) {
        let next = takeNextOpeningCell({
          orderedCells: openingCells,
          cellCursor,
          maxCursor: openingCells.length * 3,
          passable: missileParent
            ? (cell) => missilePlacementPassable({
                cell,
                isUrbanOrRubble: (candidate) =>
                  (placementTerrain.isUrbanTactical?.(candidate) ?? false)
                  || (placementTerrain.isRubbleTactical?.(candidate) ?? false),
              })
            : genericPassable,
          occupiedByHex,
          placingSide,
        });
        if (!next && missileParent) {
          next = takeNextOpeningCell({
            orderedCells: orderedForParent,
            cellCursor,
            maxCursor: orderedForParent.length * 3,
            passable: genericPassable,
            occupiedByHex,
            placingSide,
          });
        }
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
          ...(techOn ? { techLevel: techLevelForBirthHex(parent.origin?.birthH3Index) } : {}),
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
    const tacticalTerrainKindByH3 = tacticalBattleTerrainKindByCell({
      cells: children,
      tacticalKindByH3,
      enclosingKind: hexRow.terrain_kind,
      loadedStrategicKindByH3: loadedStrategicTerrainKindByH3(dbGetAll),
    });
    const tacticalCountryNameByH3 = tacticalCountryNamesForCells(children);
    const snapshot: TacticalBattleSnapshot = {
      battleId,
      opposingPartyId,
      enclosingStrategicH3Index,
      tacticalChildH3Indexes: [...children],
      coreChildH3Indexes: coreChildren,
      strategicTurnNumber: turnRow.turn_number,
      tacticalTurnNumber: 1,
      ...(weatherOn && battleWeather ? { weatherBonusEnabled: true as const, weatherBonusLevel: weatherSettings.weatherBonusLevel ?? 'low', weather: battleWeather } : {}),
      ...(techOn ? { techBonusEnabled: true as const, techBonusLevel: weatherSettings.techBonusLevel ?? 'low' } : {}),
      ...(weatherSettings.terrainBonusEnabled === true ? { terrainBonusEnabled: true as const } : {}),
      strategicHexTerrain: hexRow.terrain,
      strategicHexTerrainKind: hexRow.terrain_kind,
      tacticalTerrainKindByH3,
      ...(tacticalCountryNameByH3 ? { tacticalCountryNameByH3 } : {}),
      ...(Object.keys(tacticalIsSeaportByH3).length > 0 ? { tacticalIsSeaportByH3 } : {}),
      ...(Object.keys(tacticalIsAirportByH3).length > 0 ? { tacticalIsAirportByH3 } : {}),
      ...(urbanRubble.tacticalIsUrbanByH3 ? { tacticalIsUrbanByH3: urbanRubble.tacticalIsUrbanByH3 } : {}),
      ...(urbanRubble.tacticalIsRubbleByH3 ? { tacticalIsRubbleByH3: urbanRubble.tacticalIsRubbleByH3 } : {}),
      ...(transportForFootprint.tacticalRoadSidesByH3
        ? { tacticalRoadSidesByH3: transportForFootprint.tacticalRoadSidesByH3 }
        : {}),
      ...(transportForFootprint.tacticalRailSidesByH3
        ? { tacticalRailSidesByH3: transportForFootprint.tacticalRailSidesByH3 }
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
    tacticalLogError('computeTacticalBattleSnapshot failed', { enclosingStrategicH3Index, battleId, err });
    return { snapshot: null, skippedParentDisplayNames: [], failureReason: 'Internal error while building tactical battle.' };
  }
}
