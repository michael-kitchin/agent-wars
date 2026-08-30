/**
 * Snapshot-based validation for opponent tactical orders (air, ferry, embark) using res4 geometry and res1 infrastructure DB rows.
 */

import { cellToParent } from 'h3-js';
import type { AirStrikeOrder, EmbarkOrder, FerryOrder, GameStateSnapshot } from '../../shared/ipcTypes';
import type { TacticalBattleSnapshot, TacticalSubUnitSnapshot } from '../../shared/tacticalBattleTypes';
import { tacticalFerryAirportRejectionReason } from './tacticalFerryAirportGuards';
import { tacticalSubUnitLabelForUserMessage } from '../../shared/unitDisplayNames';
import { dbGetOne, getRes1InfrastructureForHex, isDbReady } from '../gameDb';
import { canEmbarkAtHex } from '../../shared/sealiftEmbarkEligibility';
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
export function canPlayerEmbarkFromTacticalRes4Hex(h3Index: string, playerId: string): boolean {
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
  const seaportCount = infra?.seaportCount ?? 0;
  const controllerPlayerId = control?.controllerPlayerId ?? null;
  return canEmbarkAtHex({
    nativeTerrain: terrainRow.terrain,
    terrainKind: terrainRow.terrainKind ?? undefined,
    hasSeaport: seaportCount > 0,
    hexControlledByPlayer: controllerPlayerId === playerId,
  });
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
 * Validates an opponent ferry order for tactical air sub-units using res4 airport cells.
 *
 * Contract: Origin and dest must be intact res4 airport cells on `battle` (not merely a child of a parent res1
 * that has some airport). Dest must be on the tactical map; no 4-hex range cap and no dest-ownership check.
 * When to use: Tactical AI flow after movement projection.
 * Expected outcome: Valid when origin/destination airport cells exist and dest is in the tactical hex list.
 * Exceptions: Returns invalid when the dest is outside the tactical hex list.
 * Parameters: `displayLabelForUnit` must resolve tactical sub-unit ids to `displayName` strings (never raw ids in `reason` text).
 */
export function validateTacticalOpponentFerryOrder(
  order: FerryOrder,
  state: GameStateSnapshot,
  displayLabelForUnit: (unitId: string) => string,
  battle: TacticalBattleSnapshot
): TacticalValidationResult {
  tacticalLogQuery('validateTacticalOpponentFerryOrder', { unitId: order.unitId });
  const unit = state.units.find((u) => u.id === order.unitId);
  if (!unit) return tacticalInvalidResult(`Unit not found: ${displayLabelForUnit(order.unitId)}`);
  if (unit.player !== 'opponent') return tacticalInvalidResult('Only opponent units can ferry in tactical AI flow');
  if (unit.unitType !== 'air') return tacticalInvalidResult('Only air units can ferry');
  const hexIds = new Set(state.hexes.map((h) => h.h3Index));
  if (!hexIds.has(order.destinationH3Index)) return tacticalInvalidResult('Destination not on tactical map');
  const airportReason = tacticalFerryAirportRejectionReason(battle, unit.h3Index, order.destinationH3Index);
  if (airportReason) return tacticalInvalidResult(airportReason);
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

/**
 * Validates human tactical embark orders against sub-units after movement, mirroring opponent sealift rules.
 *
 * Contract: Same co-location, capacity, and port rules as `validateTacticalOpponentEmbarkOrder`, but for human-owned units only.
 * When to use: `applyHumanTacticalDraftBeatInStrategicOrder` before mutating the snapshot with `applyTacticalEmbarkPhaseOnBattle`.
 * Expected outcome: Valid when the embark is legal on the post-move tactical snapshot; otherwise a user-facing `reason` string.
 * Exceptions: None; unknown ids yield invalid with a reason string.
 */
export function validateTacticalHumanEmbarkOrder(
  order: EmbarkOrder,
  subUnits: readonly TacticalSubUnitSnapshot[]
): TacticalValidationResult {
  tacticalLogQuery('validateTacticalHumanEmbarkOrder', { unitId: order.unitId, navalUnitId: order.navalUnitId });
  const land = subUnits.find((u) => u.id === order.unitId);
  const naval = subUnits.find((u) => u.id === order.navalUnitId);
  if (!land || !naval) {
    return tacticalInvalidResult(
      `Embark units not found on tactical snapshot (${tacticalSubUnitLabelForUserMessage(subUnits, order.unitId)} / ${tacticalSubUnitLabelForUserMessage(subUnits, order.navalUnitId)})`
    );
  }
  if (land.player !== 'human' || naval.player !== 'human') {
    return tacticalInvalidResult('Embark orders must target your own units');
  }
  if (!(land.unitType === 'infantry' || land.unitType === 'armor') || naval.unitType !== 'naval') {
    return tacticalInvalidResult('Embark requires infantry or armor and a naval carrier');
  }
  if (land.h3Index !== naval.h3Index) return tacticalInvalidResult('Embark requires co-located land and naval units');
  if (land.embarkedOnSubUnitId === order.navalUnitId) return tacticalValidResult();
  if (land.embarkedOnSubUnitId) {
    return tacticalInvalidResult('Land unit already embarked on a different carrier');
  }
  if (!canPlayerEmbarkFromTacticalRes4Hex(land.h3Index, 'human')) {
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
  tacticalLogQuery('validateTacticalHumanEmbarkOrder ok', { unitId: order.unitId });
  return tacticalValidResult();
}
