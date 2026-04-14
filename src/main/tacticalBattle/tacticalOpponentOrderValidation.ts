/**
 * Snapshot-based validation for opponent tactical orders (air, ferry, embark) using res4 geometry and res1 infrastructure DB rows.
 */

import { cellToParent } from 'h3-js';
import type { AirStrikeOrder, EmbarkOrder, FerryOrder, GameStateSnapshot } from '../../shared/ipcTypes';
import type { TacticalSubUnitSnapshot } from '../../shared/tacticalBattleTypes';
import { AIR_FERRY_RANGE_HEXES, formatFerryOutOfRangeReason } from '../../shared/tacticalRanges';
import { tacticalSubUnitLabelForUserMessage } from '../../shared/unitDisplayNames';
import { dbGetOne, getHexController, getRes1InfrastructureForHex, isDbReady } from '../gameDb';
import { normalizeMovementTerrain } from '../movementTerrain';
import { isWithinGridRangeSafe } from '../game-actions/gridRange';
import { tacticalLogQuery } from './tacticalLogging';
import { tacticalInvalidResult, tacticalValidResult, type TacticalValidationResult } from './tacticalValidationResult';

/**
 * Resolves whether a player may embark sealift from a tactical res4 cell using the same port/coastal rules as strategic sealift.
 *
 * Purpose: Reuses res1 infrastructure rows while keeping tactical validation free of `sealift` module import cycles.
 * When to use: `validateTacticalOpponentEmbarkOrder` before recording tactical embark state.
 * Expected outcome: True only for coastal stacks or controlled seaport contexts mirroring strategic `canPlayerEmbarkFromHex` parity.
 * Exceptions: Returns false when the parent res1 hex is missing from `hexes` or context cannot be loaded.
 */
function canPlayerEmbarkFromTacticalRes4Hex(h3Index: string, playerId: string): boolean {
  const res1 = cellToParent(h3Index, 1);
  const terrainRow = dbGetOne<{ terrain: string; terrainKind: string | null }>(
    'SELECT terrain, terrain_kind AS terrainKind FROM hexes WHERE h3_index = ?',
    [res1]
  );
  if (!terrainRow) return false;
  const infra = dbGetOne<{ seaportCount: number }>(
    'SELECT seaport_count AS seaportCount FROM res1_infrastructure WHERE h3_index = ?',
    [res1]
  );
  const control = dbGetOne<{ controllerPlayerId: string | null }>(
    'SELECT controller_player_id AS controllerPlayerId FROM res1_control WHERE h3_index = ?',
    [res1]
  );
  const normalizedMovementTerrain = normalizeMovementTerrain({
    h3Index: res1,
    terrain: terrainRow.terrain,
    terrainKind: terrainRow.terrainKind ?? undefined,
  });
  const seaportCount = infra?.seaportCount ?? 0;
  const controllerPlayerId = control?.controllerPlayerId ?? null;
  if (normalizedMovementTerrain === 'coastal') return true;
  return seaportCount > 0 && controllerPlayerId === playerId;
}

/**
 * Validates an opponent air strike order against a post-move tactical plan state and res1 infrastructure.
 *
 * Contract: Mirrors `validateAirStrikeOrder` airport and enemy rules without reading `units` from SQLite; tactical strikes may target any hex on the projected tactical map (no strategic 3-step strike cap).
 * When to use: Tactical branch of `requestOrdersFlow` after movement orders are applied to the plan snapshot.
 * Expected outcome: Valid only for opponent air units with intact home airport and legal targets inside the tactical hex list.
 * Exceptions: Returns invalid when DB is unavailable for infrastructure reads.
 * Parameters: `displayLabelForUnit` must resolve tactical sub-unit ids to `displayName` strings (never raw ids in `reason` text).
 */
export function validateTacticalOpponentAirStrikeOrder(
  order: AirStrikeOrder,
  state: GameStateSnapshot,
  displayLabelForUnit: (unitId: string) => string
): TacticalValidationResult {
  tacticalLogQuery('validateTacticalOpponentAirStrikeOrder', { unitId: order.unitId, targetType: order.targetType });
  if (!isDbReady()) return tacticalInvalidResult('Database not initialized');
  const unit = state.units.find((u) => u.id === order.unitId);
  if (!unit) return tacticalInvalidResult(`Unit not found: ${displayLabelForUnit(order.unitId)}`);
  if (unit.player !== 'opponent') return tacticalInvalidResult('Only opponent units can execute tactical AI strikes');
  if (unit.unitType !== 'air') return tacticalInvalidResult('Only air units can execute strikes');
  const hexIds = new Set(state.hexes.map((h) => h.h3Index));
  if (!hexIds.has(order.targetH3Index)) return tacticalInvalidResult('Target not on tactical map');
  if (!hexIds.has(unit.h3Index)) return tacticalInvalidResult('Air unit not on tactical map');
  const baseInfra = getRes1InfrastructureForHex(cellToParent(unit.h3Index, 1));
  if (baseInfra.airportCount <= 0) {
    return tacticalInvalidResult('Air unit must be based at an intact airport to strike');
  }
  if (order.targetType === 'units') {
    const enemiesAtTarget = state.units.some((u) => u.h3Index === order.targetH3Index && u.player !== unit.player);
    if (!enemiesAtTarget) return tacticalInvalidResult('Target hex has no enemy units');
    return tacticalValidResult();
  }
  const targetInfra = getRes1InfrastructureForHex(cellToParent(order.targetH3Index, 1));
  if (order.targetType === 'urban' && targetInfra.urbanHexCount <= 0) {
    return tacticalInvalidResult('Target hex has no urban infrastructure');
  }
  if (order.targetType === 'airport' && targetInfra.airportCount <= 0) {
    return tacticalInvalidResult('Target hex has no airport');
  }
  if (order.targetType === 'seaport' && targetInfra.seaportCount <= 0) {
    return tacticalInvalidResult('Target hex has no seaport');
  }
  tacticalLogQuery('validateTacticalOpponentAirStrikeOrder ok', { unitId: order.unitId });
  return tacticalValidResult();
}

/**
 * Validates an opponent ferry order for tactical air sub-units using airport control parity.
 *
 * Contract: Same range and airport-intact checks as `validateFerryOrder` but unit positions come from `state.units`.
 * When to use: Tactical AI flow after movement projection.
 * Expected outcome: Valid when origin/destination airports exist, range holds, and destination airport is opponent-controlled.
 * Exceptions: Returns invalid when DB reads fail or destination is outside the tactical hex list.
 * Parameters: `displayLabelForUnit` must resolve tactical sub-unit ids to `displayName` strings (never raw ids in `reason` text).
 */
export function validateTacticalOpponentFerryOrder(
  order: FerryOrder,
  state: GameStateSnapshot,
  displayLabelForUnit: (unitId: string) => string
): TacticalValidationResult {
  tacticalLogQuery('validateTacticalOpponentFerryOrder', { unitId: order.unitId });
  if (!isDbReady()) return tacticalInvalidResult('Database not initialized');
  const unit = state.units.find((u) => u.id === order.unitId);
  if (!unit) return tacticalInvalidResult(`Unit not found: ${displayLabelForUnit(order.unitId)}`);
  if (unit.player !== 'opponent') return tacticalInvalidResult('Only opponent units can ferry in tactical AI flow');
  if (unit.unitType !== 'air') return tacticalInvalidResult('Only air units can ferry');
  const hexIds = new Set(state.hexes.map((h) => h.h3Index));
  if (!hexIds.has(order.destinationH3Index)) return tacticalInvalidResult('Destination not on tactical map');
  const withinFerryRange = isWithinGridRangeSafe(unit.h3Index, order.destinationH3Index, AIR_FERRY_RANGE_HEXES, 'tacticalFerry');
  if (!withinFerryRange) return tacticalInvalidResult(formatFerryOutOfRangeReason(AIR_FERRY_RANGE_HEXES));
  const originInfra = getRes1InfrastructureForHex(cellToParent(unit.h3Index, 1));
  if (originInfra.airportCount <= 0) return tacticalInvalidResult('Origin airport is not intact');
  const destInfra = getRes1InfrastructureForHex(cellToParent(order.destinationH3Index, 1));
  if (destInfra.airportCount <= 0) return tacticalInvalidResult('Destination airport is not intact');
  const destRes1 = cellToParent(order.destinationH3Index, 1);
  const controller = getHexController(destRes1);
  if (controller !== unit.player) return tacticalInvalidResult('Destination airport must be controlled by unit owner');
  tacticalLogQuery('validateTacticalOpponentFerryOrder ok', { unitId: order.unitId });
  return tacticalValidResult();
}

/**
 * Validates opponent embark orders against tactical sub-units after movement, mirroring sealift slot rules.
 *
 * Contract: Infantry/armor may board opponent naval in the same res4 cell when embark hex rules pass; capacity matches `applyEmbarkOrdersForPlayer`.
 * When to use: Tactical AI flow before mutating `embarkedOnSubUnitId` on the tactical snapshot.
 * Expected outcome: Valid when co-located, types match, port rule passes, and carrier slots allow the cargo type.
 * Exceptions: None; unknown ids yield invalid with a reason string.
 */
export function validateTacticalOpponentEmbarkOrder(
  order: EmbarkOrder,
  subUnits: readonly TacticalSubUnitSnapshot[]
): TacticalValidationResult {
  tacticalLogQuery('validateTacticalOpponentEmbarkOrder', { unitId: order.unitId, navalUnitId: order.navalUnitId });
  const land = subUnits.find((u) => u.id === order.unitId);
  const naval = subUnits.find((u) => u.id === order.navalUnitId);
  if (!land || !naval) {
    return tacticalInvalidResult(
      `Embark units not found on tactical snapshot (${tacticalSubUnitLabelForUserMessage(subUnits, order.unitId)} / ${tacticalSubUnitLabelForUserMessage(subUnits, order.navalUnitId)})`
    );
  }
  if (land.player !== 'opponent' || naval.player !== 'opponent') {
    return tacticalInvalidResult('Embark orders must target opponent units');
  }
  if (!(land.unitType === 'infantry' || land.unitType === 'armor') || naval.unitType !== 'naval') {
    return tacticalInvalidResult('Embark requires infantry or armor and a naval carrier');
  }
  if (land.h3Index !== naval.h3Index) return tacticalInvalidResult('Embark requires co-located land and naval units');
  if (land.embarkedOnSubUnitId === order.navalUnitId) return tacticalValidResult();
  if (land.embarkedOnSubUnitId) {
    return tacticalInvalidResult('Land unit already embarked on a different carrier');
  }
  if (!canPlayerEmbarkFromTacticalRes4Hex(land.h3Index, 'opponent')) {
    return tacticalInvalidResult('Embarkation requires a valid port or coastal stack');
  }
  let existingArmor = false;
  let existingInfantry = 0;
  for (const u of subUnits) {
    if (u.embarkedOnSubUnitId !== order.navalUnitId) continue;
    if (u.unitType === 'armor') existingArmor = true;
    if (u.unitType === 'infantry') existingInfantry += 1;
  }
  if (land.unitType === 'armor' && (existingArmor || existingInfantry > 0)) {
    return tacticalInvalidResult('Naval unit cannot load armor when cargo is already embarked');
  }
  if (land.unitType === 'infantry' && (existingArmor || existingInfantry >= 2)) {
    return tacticalInvalidResult('Naval infantry capacity exhausted');
  }
  tacticalLogQuery('validateTacticalOpponentEmbarkOrder ok', { unitId: order.unitId });
  return tacticalValidResult();
}
