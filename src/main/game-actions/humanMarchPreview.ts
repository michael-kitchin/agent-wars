import { cellToLatLng, gridDisk } from 'h3-js';
import { buildLatLngCoordinateMap } from '../mapData';
import { dbGetAll, dbGetOne, getHexController, getRes1InfrastructureForHex, isDbReady } from '../gameDb';
import { executePlanRoute } from '../tools/tool1Pathfinding';
import { terrainIsPassableForDomain } from '../pathfinding';
import { buildNormalizedTerrainByH3 } from '../movementTerrain';
import { logError, logTrace } from '../logger';
import { AIR_FERRY_RANGE_HEXES, MOVEMENT_RANGE_BY_UNIT_TYPE, formatFerryOutOfRangeReason } from '../../shared/tacticalRanges';
import { isWithinGridRangeSafe } from './gridRange';
import { isEmbarkedLandUnitOnWater } from './sealift';
import {
  buildTerrainMapsFromHexRows,
  EMBARKED_LAND_UNIT_AT_SEA_MOVE_REASON,
  getLandMovementBlockReason,
  isLandUnitType,
} from './landMovementConstraints';
import type { PlanRouteError, PlanRouteOk } from '../tools/tool1Pathfinding';

type HumanOwnedUnit = { id: string; player: string; unitType: string; h3Index: string };
type StateSnapshot = {
  hexes: Array<{ h3Index: string; terrain: string; terrainKind: string }>;
  units: Array<{ id: string; player: string; unitType: string; h3Index: string }>;
};

type PlanRouteResult = PlanRouteOk | PlanRouteError;
type PreviewComputationContext = {
  state: StateSnapshot;
  latLngByH3: Map<string, [number, number]>;
  resolveToH3: (lat: number, lng: number) => string | undefined;
  passabilityByH3: Map<string, string>;
  terrainByH3: Map<string, string>;
  terrainKindByH3: Map<string, string>;
  stateCacheKey: string;
};

const MAX_PREVIEW_ROUTE_CACHE_ENTRIES = 2048;
const MAX_PREVIEW_RESULT_CACHE_ENTRIES = 2048;
const MAX_NEARBY_FALLBACK_ATTEMPTS = 6;
const MAX_NEARBY_FALLBACK_RADIUS = 2;

const previewRouteCache = new Map<string, PlanRouteResult>();
const previewResultCache = new Map<string, HumanOrderPreviewResult>();

export interface HumanOrderPreviewSegment {
  turn: number;
  hexes: [number, number][];
}

export interface HumanOrderPreviewResult {
  valid: boolean;
  showInvalidMarker: boolean;
  invalidReason?: string;
  arrowLatLng?: [number, number];
  segments: HumanOrderPreviewSegment[];
}

export interface HumanOrderGroupPreviewUnitResult {
  unitId: string;
  preview: HumanOrderPreviewResult;
}

export interface HumanOrderGroupPreviewResult {
  validForAll: boolean;
  showInvalidMarker: boolean;
  invalidReason?: string;
  slowestMovementRange: number;
  previews: HumanOrderGroupPreviewUnitResult[];
}

function snapshotState(): StateSnapshot {
  return {
    hexes: dbGetAll<{ h3Index: string; terrain: string; terrainKind: string }>(
      'SELECT h3_index AS h3Index, terrain, terrain_kind AS terrainKind FROM hexes'
    ),
    units: dbGetAll<{ id: string; player: string; unitType: string; h3Index: string }>(
      'SELECT id, player, unit_type AS unitType, h3_index AS h3Index FROM units'
    ),
  };
}

function getUniqueNonEmptyIds(ids: string[]): string[] {
  return [...new Set(ids.filter((id) => id.length > 0))];
}

function selectionHasMixedLandAndNaval(units: HumanOwnedUnit[]): boolean {
  const hasNaval = units.some((unit) => unit.unitType === 'naval');
  const hasLand = units.some((unit) => unit.unitType === 'infantry' || unit.unitType === 'armor');
  return hasNaval && hasLand;
}

function cacheSetBounded<T>(cache: Map<string, T>, key: string, value: T, maxEntries: number): void {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) break;
    cache.delete(oldestKey);
  }
}

function buildStateCacheKey(state: StateSnapshot): string {
  const unitSignature = state.units
    .map((u) => `${u.id}:${u.h3Index}`)
    .sort()
    .join('|');
  return `u:${unitSignature}`;
}

function executePlanRouteCached(context: PreviewComputationContext, unitId: string, destinationH3Index: string): PlanRouteResult {
  const cacheKey = `${context.stateCacheKey}|${unitId}|${destinationH3Index}`;
  const cached = previewRouteCache.get(cacheKey);
  if (cached) return cached;
  const destinationLatLng = context.latLngByH3.get(destinationH3Index) ?? cellToLatLng(destinationH3Index);
  const planned = executePlanRoute(
    unitId,
    [destinationLatLng[0], destinationLatLng[1]],
    { avoidEnemies: true },
    context.state as never,
    context.latLngByH3,
    context.resolveToH3
  );
  cacheSetBounded(previewRouteCache, cacheKey, planned, MAX_PREVIEW_ROUTE_CACHE_ENTRIES);
  return planned;
}

function findNearbyReachablePreview(
  context: PreviewComputationContext,
  unit: HumanOwnedUnit,
  hoveredH3Index: string,
  passableFor: 'land' | 'water'
): HumanOrderPreviewResult | null {
  let attempts = 0;
  const seen = new Set<string>([hoveredH3Index]);
  for (let radius = 1; radius <= MAX_NEARBY_FALLBACK_RADIUS; radius++) {
    let ring: string[] = [];
    try {
      ring = gridDisk(hoveredH3Index, radius);
    } catch {
      break;
    }
    for (const candidateH3 of ring) {
      if (attempts >= MAX_NEARBY_FALLBACK_ATTEMPTS) return null;
      if (seen.has(candidateH3)) continue;
      seen.add(candidateH3);
      const passabilityTerrain = context.passabilityByH3.get(candidateH3) ?? 'land';
      if (!terrainIsPassableForDomain(passabilityTerrain, passableFor)) continue;
      if (isLandUnitType(unit.unitType) && candidateH3 !== unit.h3Index) {
        const blockReason = getLandMovementBlockReason({
          unitType: unit.unitType,
          originH3Index: unit.h3Index,
          destinationH3Index: candidateH3,
          terrainByH3: context.terrainByH3,
          terrainKindByH3: context.terrainKindByH3,
          isEmbarkedAtSea: false,
        });
        if (blockReason) continue;
      }
      attempts += 1;
      const planned = executePlanRouteCached(context, unit.id, candidateH3);
      if (planned.status !== 'ok') continue;
      return {
        valid: true,
        showInvalidMarker: false,
        arrowLatLng: planned.destination,
        segments: planned.path.map((seg) => ({ turn: seg.turn, hexes: seg.hexes })),
      };
    }
  }
  return null;
}

function hexSupportsMixedLandAndNaval(hex: { h3Index: string; terrain: string; terrainKind?: string }): boolean {
  const passabilityByH3 = buildNormalizedTerrainByH3([hex]);
  const passabilityTerrain = passabilityByH3.get(hex.h3Index) ?? 'land';
  return (
    terrainIsPassableForDomain(passabilityTerrain, 'land') &&
    terrainIsPassableForDomain(passabilityTerrain, 'water')
  );
}

function buildHumanMarchPreviewForUnit(context: PreviewComputationContext, unitId: string, hoveredH3Index: string): HumanOrderPreviewResult {
  const cacheKey = `${context.stateCacheKey}|${unitId}|${hoveredH3Index}`;
  const cached = previewResultCache.get(cacheKey);
  if (cached) return cached;
  const unit = context.state.units.find((u) => u.id === unitId && u.player === 'human');
  if (!unit) return { valid: false, showInvalidMarker: false, invalidReason: 'Unit not found', segments: [] };
  const hoveredHex = context.state.hexes.find((h) => h.h3Index === hoveredH3Index);
  if (!hoveredHex) return { valid: false, showInvalidMarker: false, segments: [] };
  let result: HumanOrderPreviewResult;
  if (unit.unitType === 'air') {
    const controller = getHexController(hoveredH3Index);
    if (controller !== 'human') {
      return {
        valid: false,
        showInvalidMarker: true,
        invalidReason: 'Ferry destination must be a human-controlled airport hex.',
        segments: [],
      };
    }
    const destinationInfra = getRes1InfrastructureForHex(hoveredH3Index);
    if (destinationInfra.airportCount <= 0) {
      return {
        valid: false,
        showInvalidMarker: true,
        invalidReason: 'Ferry destination must have an intact airport.',
        segments: [],
      };
    }
    const withinFerryRange = isWithinGridRangeSafe(unit.h3Index, hoveredH3Index, AIR_FERRY_RANGE_HEXES, 'preview ferry');
    if (!withinFerryRange) {
      return {
        valid: false,
        showInvalidMarker: true,
        invalidReason: `${formatFerryOutOfRangeReason(AIR_FERRY_RANGE_HEXES)}.`,
        segments: [],
      };
    }
    const originLatLng = context.latLngByH3.get(unit.h3Index) ?? cellToLatLng(unit.h3Index);
    const destinationLatLng = context.latLngByH3.get(hoveredH3Index) ?? cellToLatLng(hoveredH3Index);
    result = {
      valid: true,
      showInvalidMarker: false,
      arrowLatLng: [destinationLatLng[0], destinationLatLng[1]],
      segments: [
        {
          turn: 1,
          hexes: [
            [originLatLng[0], originLatLng[1]],
            [destinationLatLng[0], destinationLatLng[1]],
          ],
        },
      ],
    };
    cacheSetBounded(previewResultCache, cacheKey, result, MAX_PREVIEW_RESULT_CACHE_ENTRIES);
    return result;
  }

  const unitIsLand = isLandUnitType(unit.unitType);
  if (unitIsLand && isEmbarkedLandUnitOnWater(unit.id)) {
    result = {
      valid: false,
      showInvalidMarker: true,
      invalidReason: getLandMovementBlockReason({
        unitType: unit.unitType,
        originH3Index: unit.h3Index,
        destinationH3Index: unit.h3Index,
        terrainByH3: context.terrainByH3,
        terrainKindByH3: context.terrainKindByH3,
        isEmbarkedAtSea: true,
      }) ?? EMBARKED_LAND_UNIT_AT_SEA_MOVE_REASON,
      segments: [],
    };
    cacheSetBounded(previewResultCache, cacheKey, result, MAX_PREVIEW_RESULT_CACHE_ENTRIES);
    return result;
  }
  if (unitIsLand && hoveredH3Index !== unit.h3Index) {
    const blockReason = getLandMovementBlockReason({
      unitType: unit.unitType,
      originH3Index: unit.h3Index,
      destinationH3Index: hoveredH3Index,
      terrainByH3: context.terrainByH3,
      terrainKindByH3: context.terrainKindByH3,
      isEmbarkedAtSea: false,
    });
    if (blockReason) {
      result = {
        valid: false,
        showInvalidMarker: true,
        invalidReason: blockReason,
        segments: [],
      };
      cacheSetBounded(previewResultCache, cacheKey, result, MAX_PREVIEW_RESULT_CACHE_ENTRIES);
      return result;
    }
  }

  const passableFor = unit.unitType === 'naval' ? 'water' : 'land';
  const hoveredPassabilityTerrain = context.passabilityByH3.get(hoveredHex.h3Index) ?? 'land';
  const hoveredPassable = terrainIsPassableForDomain(hoveredPassabilityTerrain, passableFor);
  const direct = hoveredPassable ? executePlanRouteCached(context, unitId, hoveredH3Index) : undefined;
  if (hoveredPassable && direct?.status === 'ok') {
    result = {
      valid: true,
      showInvalidMarker: false,
      arrowLatLng: direct.destination,
      segments: direct.path.map((seg) => ({ turn: seg.turn, hexes: seg.hexes })),
    };
    cacheSetBounded(previewResultCache, cacheKey, result, MAX_PREVIEW_RESULT_CACHE_ENTRIES);
    return result;
  }

  const nearby = findNearbyReachablePreview(context, unit, hoveredH3Index, passableFor);
  if (nearby) {
    cacheSetBounded(previewResultCache, cacheKey, nearby, MAX_PREVIEW_RESULT_CACHE_ENTRIES);
    return nearby;
  }

  result = {
    valid: false,
    showInvalidMarker: true,
    invalidReason: 'Destination is invalid for this unit type or unreachable.',
    segments: [],
  };
  cacheSetBounded(previewResultCache, cacheKey, result, MAX_PREVIEW_RESULT_CACHE_ENTRIES);
  return result;
}

export function previewHumanMarchOrderImpl(unitId: string, hoveredH3Index: string): HumanOrderPreviewResult {
  logTrace('gameActions previewHumanMarchOrder', { unitId, hoveredH3Index });
  try {
    if (!isDbReady()) return { valid: false, showInvalidMarker: false, invalidReason: 'Database not initialized', segments: [] };
    const state = snapshotState();
    const hexList = state.hexes.map((h) => h.h3Index);
    const { latLngByH3, resolveToH3 } = buildLatLngCoordinateMap(hexList);
    const { terrainByH3, terrainKindByH3 } = buildTerrainMapsFromHexRows(state.hexes);
    const context: PreviewComputationContext = {
      state,
      latLngByH3,
      resolveToH3,
      passabilityByH3: buildNormalizedTerrainByH3(state.hexes),
      terrainByH3,
      terrainKindByH3,
      stateCacheKey: buildStateCacheKey(state),
    };
    return buildHumanMarchPreviewForUnit(context, unitId, hoveredH3Index);
  } catch (err) {
    logError('previewHumanMarchOrder: exception', err);
    return { valid: false, showInvalidMarker: false, invalidReason: String(err), segments: [] };
  }
}

export function previewHumanMarchOrdersImpl(unitIds: string[], hoveredH3Index: string): HumanOrderGroupPreviewResult {
  logTrace('gameActions previewHumanMarchOrders', { unitCount: unitIds.length, hoveredH3Index });
  try {
    if (!isDbReady()) {
      return {
        validForAll: false,
        showInvalidMarker: false,
        invalidReason: 'Database not initialized',
        slowestMovementRange: 0,
        previews: [],
      };
    }
    const uniqueUnitIds = getUniqueNonEmptyIds(unitIds);
    if (uniqueUnitIds.length === 0) {
      return {
        validForAll: false,
        showInvalidMarker: false,
        invalidReason: 'No selected units',
        slowestMovementRange: 0,
        previews: [],
      };
    }
    const state = snapshotState();
    const hexList = state.hexes.map((h) => h.h3Index);
    const { latLngByH3, resolveToH3 } = buildLatLngCoordinateMap(hexList);
    const { terrainByH3, terrainKindByH3 } = buildTerrainMapsFromHexRows(state.hexes);
    const context: PreviewComputationContext = {
      state,
      latLngByH3,
      resolveToH3,
      passabilityByH3: buildNormalizedTerrainByH3(state.hexes),
      terrainByH3,
      terrainKindByH3,
      stateCacheKey: buildStateCacheKey(state),
    };
    const selectedUnits = uniqueUnitIds
      .map((unitId) => state.units.find((u) => u.id === unitId && u.player === 'human'))
      .filter((unit): unit is HumanOwnedUnit => !!unit);
    if (selectedUnits.length === 0) {
      return {
        validForAll: false,
        showInvalidMarker: false,
        invalidReason: 'No valid selected units',
        slowestMovementRange: 0,
        previews: [],
      };
    }
    const representativeUnitIdsByOrigin = new Map<string, string>();
    for (const unit of selectedUnits) {
      if (!representativeUnitIdsByOrigin.has(unit.h3Index)) representativeUnitIdsByOrigin.set(unit.h3Index, unit.id);
    }
    const previewUnitIds = Array.from(representativeUnitIdsByOrigin.values());
    const previews: HumanOrderGroupPreviewUnitResult[] = previewUnitIds.map((unitId) => ({
      unitId,
      preview: buildHumanMarchPreviewForUnit(context, unitId, hoveredH3Index),
    }));
    const invalid = previews.find((entry) => !entry.preview.valid);
    const hoveredHex = state.hexes.find((h) => h.h3Index === hoveredH3Index);
    const hasMixedSelection = selectionHasMixedLandAndNaval(selectedUnits);
    const slowestMovementRange =
      selectedUnits.length > 0
        ? Math.min(...selectedUnits.map((unit) => MOVEMENT_RANGE_BY_UNIT_TYPE[unit.unitType] ?? 1))
        : 0;
    const sharedMixedTerrain = !!hoveredHex && hexSupportsMixedLandAndNaval(hoveredHex);
    if (hasMixedSelection && !sharedMixedTerrain) {
      const reason = 'Mixed land/naval stacks can only move to coastal hexes.';
      return {
        validForAll: false,
        showInvalidMarker: true,
        invalidReason: reason,
        slowestMovementRange,
        previews: previews.map((entry) => ({
          unitId: entry.unitId,
          preview: {
            valid: false,
            showInvalidMarker: true,
            invalidReason: reason,
            segments: [],
          },
        })),
      };
    }
    return {
      validForAll: invalid === undefined,
      showInvalidMarker: invalid !== undefined,
      invalidReason: invalid?.preview.invalidReason,
      slowestMovementRange,
      previews,
    };
  } catch (err) {
    logError('previewHumanMarchOrders: exception', err);
    return {
      validForAll: false,
      showInvalidMarker: false,
      invalidReason: String(err),
      slowestMovementRange: 0,
      previews: [],
    };
  }
}
