import { cellToLatLng, gridDisk } from 'h3-js';
import { buildLatLngCoordinateMap } from '../mapData';
import { getGameStateForPlayer, getHexController, getRes1InfrastructureForHex, isDbReady } from '../gameDb';
import { createPathfindingSession, executePlanRouteWithSession } from '../tools/tool1Pathfinding';
import { terrainIsPassableForDomain } from '../pathfinding';
import { buildNormalizedTerrainByH3 } from '../movementTerrain';
import { logDebug, logError, logTrace } from '../logger';
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
import type { PathfindingSession } from '../tools/tool1Pathfinding';
import type { GameStateSnapshot } from '../../shared/ipcTypes';
import {
  buildEnvironmentSignature,
  buildHoverSessionCacheKey,
  buildSelectedUnitPositionsSignature,
  buildSelectionSignature,
  createEmptyHumanMarchPreviewDiagnostics,
  type HumanMarchPreviewDiagnostics,
} from './humanMarchPreviewDiagnostics';
type HumanOwnedUnit = { id: string; player: string; unitType: string; h3Index: string; displayOrder?: number };

type PlanRouteResult = PlanRouteOk | PlanRouteError;
type PreviewComputationContext = {
  state: GameStateSnapshot;
  latLngByH3: Map<string, [number, number]>;
  resolveToH3: (lat: number, lng: number) => string | undefined;
  passabilityByH3: Map<string, string>;
  terrainByH3: Map<string, string>;
  terrainKindByH3: Map<string, string>;
  stateCacheKey: string;
  pathfindingSession: PathfindingSession;
};

interface ActiveHoverPathfindingSession {
  playerId: 'human' | 'opponent';
  selectionSignature: string;
  selectedPositionsSignature: string;
  environmentSignature: string;
  sessionCacheKey: string;
  context: PreviewComputationContext;
}

const DEFAULT_MAX_PREVIEW_ROUTE_CACHE_ENTRIES = 2048;
const DEFAULT_MAX_PREVIEW_RESULT_CACHE_ENTRIES = 2048;
const DEFAULT_MAX_PREVIEW_THROTTLE_ENTRIES = 1024;
let maxPreviewRouteCacheEntries = DEFAULT_MAX_PREVIEW_ROUTE_CACHE_ENTRIES;
let maxPreviewResultCacheEntries = DEFAULT_MAX_PREVIEW_RESULT_CACHE_ENTRIES;
let maxPreviewThrottleEntries = DEFAULT_MAX_PREVIEW_THROTTLE_ENTRIES;
const MAX_NEARBY_FALLBACK_ATTEMPTS = 16;
const MAX_NEARBY_FALLBACK_RADIUS = 6;
const MAX_NEARBY_FALLBACK_BUDGET_MS = 20;
const PREVIEW_THROTTLE_WINDOW_MS = 12;

const previewDiagnostics: HumanMarchPreviewDiagnostics = createEmptyHumanMarchPreviewDiagnostics();

const previewRouteCache = new Map<string, PlanRouteResult>();
const previewResultCache = new Map<string, HumanOrderPreviewResult>();
const previewThrottleCache = new Map<
  string,
  { computedAtMs: number; hoveredH3Index: string; preview: HumanOrderPreviewResult }
>();
const activeHoverPathfindingSessionByPlayer = new Map<'human' | 'opponent', ActiveHoverPathfindingSession>();

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

function snapshotStateForPlayer(playerId: 'human' | 'opponent'): GameStateSnapshot {
  return getGameStateForPlayer(playerId, { maskUnexploredTerrain: false });
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

function buildStateCacheKey(state: GameStateSnapshot): string {
  const unitSignature = state.units
    .map((u) => `${u.id}:${u.h3Index}`)
    .sort()
    .join('|');
  return `u:${unitSignature}`;
}

function buildPreviewContextFromState(state: GameStateSnapshot): PreviewComputationContext {
  const hexList = state.hexes.map((h) => h.h3Index);
  const { latLngByH3, resolveToH3 } = buildLatLngCoordinateMap(hexList);
  const { terrainByH3, terrainKindByH3 } = buildTerrainMapsFromHexRows(state.hexes);
  return {
    state,
    latLngByH3,
    resolveToH3,
    passabilityByH3: buildNormalizedTerrainByH3(state.hexes),
    terrainByH3,
    terrainKindByH3,
    stateCacheKey: buildStateCacheKey(state),
    pathfindingSession: createPathfindingSession(state, latLngByH3, resolveToH3),
  };
}

function getOrCreateHoverSessionContext(
  playerId: 'human' | 'opponent',
  selectedUnitIds: readonly string[]
): PreviewComputationContext {
  const selectionSignature = buildSelectionSignature(selectedUnitIds);
  const selectedPositionsSignature = buildSelectedUnitPositionsSignature(selectedUnitIds);
  const environmentSignature = buildEnvironmentSignature(playerId);
  const sessionCacheKey = buildHoverSessionCacheKey({ playerId, selectionSignature, selectedPositionsSignature, environmentSignature });
  const active = activeHoverPathfindingSessionByPlayer.get(playerId);
  if (
    active &&
    active.selectionSignature === selectionSignature &&
    active.selectedPositionsSignature === selectedPositionsSignature &&
    active.environmentSignature === environmentSignature &&
    active.sessionCacheKey === sessionCacheKey
  ) {
    previewDiagnostics.sessionReuseCount += 1;
    logDebug('gameActions hoverPathfindingSession: reuse', {
      playerId,
      selectedCount: selectedUnitIds.length,
      selectionSignatureLength: selectionSignature.length,
      selectedPositionsSignatureLength: selectedPositionsSignature.length,
    });
    return active.context;
  }
  if (active) {
    previewDiagnostics.sessionInvalidateCount += 1;
    logDebug('gameActions hoverPathfindingSession: invalidate', {
      playerId,
      priorSelectionSignatureLength: active.selectionSignature.length,
      selectionSignatureLength: selectionSignature.length,
      priorSelectedPositionsSignatureLength: active.selectedPositionsSignature.length,
      selectedPositionsSignatureLength: selectedPositionsSignature.length,
      priorEnvironmentSignatureLength: active.environmentSignature.length,
      environmentSignatureLength: environmentSignature.length,
      priorSessionCacheKey: active.sessionCacheKey,
      nextSessionCacheKey: sessionCacheKey,
    });
  }
  const state = snapshotStateForPlayer(playerId);
  const context = buildPreviewContextFromState(state);
  activeHoverPathfindingSessionByPlayer.set(playerId, {
    playerId,
    selectionSignature,
    selectedPositionsSignature,
    environmentSignature,
    sessionCacheKey,
    context,
  });
  previewDiagnostics.sessionCreateCount += 1;
  logDebug('gameActions hoverPathfindingSession: create', {
    playerId,
    selectedCount: selectedUnitIds.length,
    selectionSignatureLength: selectionSignature.length,
    selectedPositionsSignatureLength: selectedPositionsSignature.length,
    environmentSignatureLength: environmentSignature.length,
    sessionCacheKey,
  });
  return context;
}

function executePlanRouteCached(context: PreviewComputationContext, unitId: string, destinationH3Index: string): PlanRouteResult {
  const cacheKey = `${context.stateCacheKey}|${unitId}|${destinationH3Index}`;
  previewDiagnostics.routePlanCalls += 1;
  const cached = previewRouteCache.get(cacheKey);
  if (cached) {
    previewDiagnostics.routeCacheHitCount += 1;
    return cached;
  }
  previewDiagnostics.routeCacheMissCount += 1;
  const destinationLatLng = context.latLngByH3.get(destinationH3Index) ?? cellToLatLng(destinationH3Index);
  const planned = executePlanRouteWithSession(
    unitId,
    [destinationLatLng[0], destinationLatLng[1]],
    { avoidEnemies: false },
    context.pathfindingSession
  );
  cacheSetBounded(previewRouteCache, cacheKey, planned, maxPreviewRouteCacheEntries);
  return planned;
}

function findNearbyReachablePreview(
  context: PreviewComputationContext,
  unit: HumanOwnedUnit,
  hoveredH3Index: string,
  passableFor: 'land' | 'water'
): HumanOrderPreviewResult | null {
  const startedAtMs = Date.now();
  let attempts = 0;
  const seen = new Set<string>([hoveredH3Index]);
  for (let radius = 1; radius <= MAX_NEARBY_FALLBACK_RADIUS; radius++) {
    if (Date.now() - startedAtMs >= MAX_NEARBY_FALLBACK_BUDGET_MS) {
      previewDiagnostics.fallbackBudgetAbortCount += 1;
      return null;
    }
    let ring: string[] = [];
    try {
      ring = gridDisk(hoveredH3Index, radius);
    } catch {
      break;
    }
    for (const candidateH3 of ring) {
      if (Date.now() - startedAtMs >= MAX_NEARBY_FALLBACK_BUDGET_MS) {
        previewDiagnostics.fallbackBudgetAbortCount += 1;
        return null;
      }
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
      previewDiagnostics.fallbackAttemptCount += 1;
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

function computeHumanMarchPreviewForUnit(
  context: PreviewComputationContext,
  unitId: string,
  hoveredH3Index: string
): HumanOrderPreviewResult {
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
    cacheSetBounded(previewResultCache, cacheKey, result, maxPreviewResultCacheEntries);
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
    cacheSetBounded(previewResultCache, cacheKey, result, maxPreviewResultCacheEntries);
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
      cacheSetBounded(previewResultCache, cacheKey, result, maxPreviewResultCacheEntries);
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
    cacheSetBounded(previewResultCache, cacheKey, result, maxPreviewResultCacheEntries);
    return result;
  }

  // Nearby fallback is only useful for passable hover hexes whose direct route failed.
  // Skips expensive probing for obviously invalid terrain (e.g., land unit over open water).
  const nearby = hoveredPassable ? findNearbyReachablePreview(context, unit, hoveredH3Index, passableFor) : null;
  if (nearby) {
    cacheSetBounded(previewResultCache, cacheKey, nearby, maxPreviewResultCacheEntries);
    return nearby;
  }

  result = {
    valid: false,
    showInvalidMarker: true,
    invalidReason: 'Destination is invalid for this unit type or unreachable.',
    segments: [],
  };
  cacheSetBounded(previewResultCache, cacheKey, result, maxPreviewResultCacheEntries);
  return result;
}

function buildHumanMarchPreviewForUnit(
  context: PreviewComputationContext,
  unitId: string,
  hoveredH3Index: string
): HumanOrderPreviewResult {
  const throttleKey = `${context.stateCacheKey}|${unitId}`;
  const throttleEntry = previewThrottleCache.get(throttleKey);
  const nowMs = Date.now();
  if (throttleEntry) {
    const ageMs = nowMs - throttleEntry.computedAtMs;
    // Coalesce rapid hover updates by reusing the latest preview inside a short time window.
    if (throttleEntry.hoveredH3Index === hoveredH3Index || ageMs < PREVIEW_THROTTLE_WINDOW_MS) {
      return throttleEntry.preview;
    }
  }
  const preview = computeHumanMarchPreviewForUnit(context, unitId, hoveredH3Index);
  cacheSetBounded(
    previewThrottleCache,
    throttleKey,
    { computedAtMs: nowMs, hoveredH3Index, preview },
    maxPreviewThrottleEntries
  );
  return preview;
}

export function previewHumanMarchOrderImpl(unitId: string, hoveredH3Index: string): HumanOrderPreviewResult {
  logTrace('gameActions previewHumanMarchOrder', { unitId, hoveredH3Index });
  try {
    previewDiagnostics.requestCount += 1;
    if (!isDbReady()) return { valid: false, showInvalidMarker: false, invalidReason: 'Database not initialized', segments: [] };
    const context = getOrCreateHoverSessionContext('human', [unitId]);
    return buildHumanMarchPreviewForUnit(context, unitId, hoveredH3Index);
  } catch (err) {
    logError('previewHumanMarchOrder: exception', err);
    return { valid: false, showInvalidMarker: false, invalidReason: String(err), segments: [] };
  }
}

export function previewHumanMarchOrdersImpl(unitIds: string[], hoveredH3Index: string): HumanOrderGroupPreviewResult {
  logTrace('gameActions previewHumanMarchOrders', { unitCount: unitIds.length, hoveredH3Index });
  try {
    previewDiagnostics.requestCount += 1;
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
      if (activeHoverPathfindingSessionByPlayer.has('human')) {
        previewDiagnostics.sessionInvalidateCount += 1;
        activeHoverPathfindingSessionByPlayer.delete('human');
      }
      return {
        validForAll: false,
        showInvalidMarker: false,
        invalidReason: 'No selected units',
        slowestMovementRange: 0,
        previews: [],
      };
    }
    const context = getOrCreateHoverSessionContext('human', uniqueUnitIds);
    const state = context.state;
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
    logDebug('gameActions previewHumanMarchOrders: unique source/destination checks', {
      selectedUnits: selectedUnits.length,
      uniqueOrigins: previewUnitIds.length,
      hoveredH3Index,
    });
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

/** Test/debug accessor for hover-preview diagnostics and cache/session sizes. */
export function getHumanMarchPreviewDiagnostics(): HumanMarchPreviewDiagnostics & {
  routeCacheSize: number;
  resultCacheSize: number;
  throttleCacheSize: number;
  activeSessionCount: number;
} {
  logTrace('gameActions getHumanMarchPreviewDiagnostics');
  return {
    ...previewDiagnostics,
    routeCacheSize: previewRouteCache.size,
    resultCacheSize: previewResultCache.size,
    throttleCacheSize: previewThrottleCache.size,
    activeSessionCount: activeHoverPathfindingSessionByPlayer.size,
  };
}

/** Test helper that clears hover-preview diagnostics, caches, and sessions. */
export function resetHumanMarchPreviewDiagnosticsForTests(): void {
  logDebug('gameActions resetHumanMarchPreviewDiagnosticsForTests');
  previewRouteCache.clear();
  previewResultCache.clear();
  previewThrottleCache.clear();
  activeHoverPathfindingSessionByPlayer.clear();
  Object.assign(previewDiagnostics, createEmptyHumanMarchPreviewDiagnostics());
}

/** Test helper to override in-memory preview cache limits; omit to restore defaults. */
export function configureHumanMarchPreviewCacheLimitsForTests(limits?: {
  route?: number;
  result?: number;
  throttle?: number;
}): void {
  logDebug('gameActions configureHumanMarchPreviewCacheLimitsForTests', { limits });
  maxPreviewRouteCacheEntries = limits?.route ?? DEFAULT_MAX_PREVIEW_ROUTE_CACHE_ENTRIES;
  maxPreviewResultCacheEntries = limits?.result ?? DEFAULT_MAX_PREVIEW_RESULT_CACHE_ENTRIES;
  maxPreviewThrottleEntries = limits?.throttle ?? DEFAULT_MAX_PREVIEW_THROTTLE_ENTRIES;
}
