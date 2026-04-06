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

type HumanOwnedUnit = { id: string; player: string; unitType: string; h3Index: string };
type StateSnapshot = {
  hexes: Array<{ h3Index: string; terrain: string; terrainKind: string }>;
  units: Array<{ id: string; player: string; unitType: string; h3Index: string }>;
};

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

function hexSupportsMixedLandAndNaval(hex: { h3Index: string; terrain: string; terrainKind?: string }): boolean {
  const passabilityByH3 = buildNormalizedTerrainByH3([hex]);
  const passabilityTerrain = passabilityByH3.get(hex.h3Index) ?? 'land';
  return (
    terrainIsPassableForDomain(passabilityTerrain, 'land') &&
    terrainIsPassableForDomain(passabilityTerrain, 'water')
  );
}

function buildHumanMarchPreviewForUnit(
  state: StateSnapshot,
  latLngByH3: Map<string, [number, number]>,
  resolveToH3: (lat: number, lng: number) => string | undefined,
  unitId: string,
  hoveredH3Index: string
): HumanOrderPreviewResult {
  const unit = state.units.find((u) => u.id === unitId && u.player === 'human');
  if (!unit) return { valid: false, showInvalidMarker: false, invalidReason: 'Unit not found', segments: [] };
  const hoveredHex = state.hexes.find((h) => h.h3Index === hoveredH3Index);
  if (!hoveredHex) return { valid: false, showInvalidMarker: false, segments: [] };
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
    const originLatLng = latLngByH3.get(unit.h3Index) ?? cellToLatLng(unit.h3Index);
    const destinationLatLng = latLngByH3.get(hoveredH3Index) ?? cellToLatLng(hoveredH3Index);
    return {
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
  }

  const unitIsLand = unit.unitType === 'infantry' || unit.unitType === 'armor';
  if (unitIsLand && isEmbarkedLandUnitOnWater(unit.id)) {
    return {
      valid: false,
      showInvalidMarker: true,
      invalidReason: 'Embarked land units cannot receive independent movement orders while at sea.',
      segments: [],
    };
  }

  const passableFor = unit.unitType === 'naval' ? 'water' : 'land';
  const passabilityByH3 = buildNormalizedTerrainByH3(state.hexes);
  const hoveredPassabilityTerrain = passabilityByH3.get(hoveredHex.h3Index) ?? 'land';
  const hoveredPassable = terrainIsPassableForDomain(hoveredPassabilityTerrain, passableFor);
  const [hoverLat, hoverLng] = cellToLatLng(hoveredH3Index);
  const direct = executePlanRoute(unitId, [hoverLat, hoverLng], { avoidEnemies: true }, state as never, latLngByH3, resolveToH3);
  if (hoveredPassable && direct.status === 'ok') {
    return {
      valid: true,
      showInvalidMarker: false,
      arrowLatLng: direct.destination,
      segments: direct.path.map((seg) => ({ turn: seg.turn, hexes: seg.hexes })),
    };
  }

  let partialArrow: [number, number] | undefined;
  let partialSegments: HumanOrderPreviewSegment[] = [];
  const hexByH3 = new Map(state.hexes.map((h) => [h.h3Index, h]));
  const seen = new Set<string>();
  for (let radius = 1; radius <= 12; radius++) {
    let ring: string[] = [];
    try {
      ring = gridDisk(hoveredH3Index, radius);
    } catch {
      break;
    }
    const candidates = ring.filter((h3) => {
      if (seen.has(h3)) return false;
      seen.add(h3);
      if (h3 === hoveredH3Index) return false;
      const hx = hexByH3.get(h3);
      if (!hx) return false;
      return terrainIsPassableForDomain(passabilityByH3.get(h3) ?? 'land', passableFor);
    });
    if (candidates.length === 0) continue;
    for (const candidateH3 of candidates) {
      const [nearLat, nearLng] = cellToLatLng(candidateH3);
      const partial = executePlanRoute(unitId, [nearLat, nearLng], { avoidEnemies: true }, state as never, latLngByH3, resolveToH3);
      if (partial.status === 'ok') {
        partialArrow = partial.destination;
        partialSegments = partial.path.map((seg) => ({ turn: seg.turn, hexes: seg.hexes }));
        break;
      }
    }
    if (partialSegments.length > 0) break;
  }

  return {
    valid: false,
    showInvalidMarker: true,
    invalidReason: 'Destination is invalid for this unit type or unreachable.',
    arrowLatLng: partialArrow,
    segments: partialSegments,
  };
}

export function previewHumanMarchOrderImpl(unitId: string, hoveredH3Index: string): HumanOrderPreviewResult {
  logTrace('gameActions previewHumanMarchOrder', { unitId, hoveredH3Index });
  try {
    if (!isDbReady()) return { valid: false, showInvalidMarker: false, invalidReason: 'Database not initialized', segments: [] };
    const state = snapshotState();
    const hexList = state.hexes.map((h) => h.h3Index);
    const { latLngByH3, resolveToH3 } = buildLatLngCoordinateMap(hexList);
    return buildHumanMarchPreviewForUnit(state, latLngByH3, resolveToH3, unitId, hoveredH3Index);
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
      preview: buildHumanMarchPreviewForUnit(state, latLngByH3, resolveToH3, unitId, hoveredH3Index),
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
