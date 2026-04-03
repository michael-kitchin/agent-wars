/**
 * WEGO turn actions: validate movement orders, submit orders, and resolve the turn.
 * All logic runs in the main process and uses the game database.
 */

import { cellToLatLng, gridDistance, gridDisk, gridPathCells } from 'h3-js';
import {
  dbGetOne,
  dbRun,
  dbGetAll,
  isDbReady,
  saveDatabase,
  getGameSeed,
  setGameOver,
  getMapHexSet,
  refreshFogOfWarIntelFromCurrentState,
  addAiLossEventsSinceConsultation,
  getHexController,
  setHexController,
  listAllHexControls,
  listBuildQueueRowsForHex,
  getBuildProgressPointsForHex,
  setBuildProgressPointsForHex,
  clearBuildQueueAndProgressForHex,
  replaceBuildQueueForHex,
  allocateNextUnitDisplayOrder,
  listUnitsForSnapshot,
  getRes1InfrastructureForHex,
  listRes4FeatureOverridesForGame,
  updateRes4FeatureOverrideRow,
} from './gameDb';
import { buildLatLngCoordinateMap, getOrderedHexList } from './mapData';
import { getRange, getAttack, getDefense, casualtyPriorityIndex } from './combatConstants';
import { runRangedPhase, runMeleePhase, createCombatRng, type CombatUnit } from './combatResolution';
import { logDebug, logError, logTrace } from './logger';
import type {
  MovementOrder,
  RangedAttackOrder,
  SubmitOrdersPayload,
  AirStrikeOrder,
  FerryOrder,
  AirStrikeTargetType,
  ReadyResult,
  InfrastructureDestroyedEvent,
  AirStrikeAnimationMove,
  FerryAnimationMove,
} from '../shared/ipcTypes';
import { passabilityAllowsLandUnit, passabilityAllowsNavalUnit } from '../shared/pipelineTerrain';
import { executePlanRoute } from './tools/tool1Pathfinding';
import { terrainIsPassableForDomain } from './pathfinding';
import { buildNormalizedTerrainByH3, normalizeMovementTerrain, isLandSeaportSpawnHex } from './movementTerrain';
import {
  NAVAL_DESTINATION_MUST_BE_WATER_COASTAL,
  NAVAL_SEAPORT_EGRESS_REQUIRED,
  NAVAL_START_MUST_BE_WATER_COASTAL,
} from './navalMovementMessages';
import {
  assignHumanMarchStandingOrder,
  cancelHumanStandingOrder,
  generateOrdersForStandingOrders,
  queryHumanStandingOrders,
} from './tools/tool5StandingOrders';
import {
  BUILD_ENTRY_MAX_COUNT,
  BUILD_ENTRY_MIN_COUNT,
  UNIT_COST_BY_TYPE,
  getAvailableBuildUnitTypes,
  isValidBuildCount,
  NO_PRODUCTION_INFRASTRUCTURE_REASON,
  type BuildUnitType,
} from './productionRules';
import { DEPLOYMENT_CAP_TYPE_ORDER, MAX_UNITS_PER_TYPE } from './productionCaps';
import type { Res1ProductionContextSnapshot } from '../shared/ipcTypes';
import {
  AIR_FERRY_RANGE_HEXES,
  AIR_STRIKE_RANGE_HEXES,
  MOVEMENT_RANGE_BY_UNIT_TYPE,
  formatFerryOutOfRangeReason,
  formatTargetOutOfRangeReason,
} from '../shared/tacticalRanges';

export type { MovementOrder, RangedAttackOrder, SubmitOrdersPayload };

export interface SubmitOrdersResult {
  success: boolean;
  reason?: string;
}

export interface HumanStandingOrderView {
  unitId: string;
  status: string;
  destinationH3Index: string | null;
  turnsRemaining: number;
  nextMoveH3Index: string | null;
  routeSegments?: { turn: number; hexes: [number, number][] }[];
}

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

function effectiveHexPassabilityTerrain(hex: { h3Index: string; terrain: string; terrainKind?: string }): string {
  return normalizeMovementTerrain({ h3Index: hex.h3Index, terrain: hex.terrain, terrainKind: hex.terrainKind });
}

function getMovementTerrainForH3(h3Index: string): string {
  const terrainRow = dbGetOne<{ terrain: string; terrainKind: string }>(
    'SELECT terrain, terrain_kind AS terrainKind FROM hexes WHERE h3_index = ?',
    [h3Index]
  );
  return effectiveHexPassabilityTerrain({
    h3Index,
    terrain: terrainRow?.terrain ?? 'land',
    terrainKind: terrainRow?.terrainKind,
  });
}

export interface HexBuildQueueEntryView {
  id: number;
  queueIndex: number;
  unitType: BuildUnitType;
  count: number;
}

export interface HexBuildQueueView {
  h3Index: string;
  controllerPlayerId: string | null;
  controlledByRequester: boolean;
  urbanHexCount: number;
  seaportCount: number;
  airportCount: number;
  availableUnitTypes: BuildUnitType[];
  buildSectionVisible: boolean;
  noBuildReason: string | null;
  entries: HexBuildQueueEntryView[];
}

type DeployedUnitsByType = { armor?: number; infantry?: number; naval?: number; air?: number };
type ControlTransition = { h3Index: string; fromControllerPlayerId: string | null; toControllerPlayerId: string | null };
type DeploymentCapReachedByPlayer = { human: BuildUnitType[]; opponent: BuildUnitType[] };

const VALID_PHASE = 'planning';
const HUMAN_PLAYER_ID = 'human';
const MIXED_STACK_COASTAL_ONLY_REASON = 'Mixed land/naval stacks can only move to coastal hexes.';
const AIR_UNITS_CANNOT_MARCH_REASON = 'Air units cannot use march orders; use Strike or Ferry.';

interface ProductionEligibilityView extends Res1ProductionContextSnapshot {
  availableUnitTypes: BuildUnitType[];
  buildSectionVisible: boolean;
  noBuildReason: string | null;
}

function buildProductionEligibilityView(
  productionContext: Res1ProductionContextSnapshot
): ProductionEligibilityView {
  const availableUnitTypes = getAvailableBuildUnitTypes(
    productionContext.urbanHexCount,
    productionContext.seaportCount,
    productionContext.airportCount
  );
  const buildSectionVisible = availableUnitTypes.length > 0;
  return {
    ...productionContext,
    availableUnitTypes,
    buildSectionVisible,
    noBuildReason: buildSectionVisible ? null : NO_PRODUCTION_INFRASTRUCTURE_REASON,
  };
}

type HumanOwnedUnit = { id: string; player: string; unitType: string; h3Index: string };

function getUniqueNonEmptyIds(ids: string[]): string[] {
  return [...new Set(ids.filter((id) => id.length > 0))];
}

function selectionHasMixedLandAndNaval(units: HumanOwnedUnit[]): boolean {
  const hasNaval = units.some((unit) => unit.unitType === 'naval');
  const hasLand = units.some((unit) => unit.unitType === 'infantry' || unit.unitType === 'armor');
  return hasNaval && hasLand;
}

function hexSupportsMixedLandAndNaval(hex: { h3Index: string; terrain: string; terrainKind?: string }): boolean {
  const passabilityTerrain = effectiveHexPassabilityTerrain(hex);
  return (
    terrainIsPassableForDomain(passabilityTerrain, 'land') &&
    terrainIsPassableForDomain(passabilityTerrain, 'water')
  );
}

function currentPlanningTurnNumber(): number {
  return dbGetOne<{ turnNumber: number }>('SELECT turn_number AS turnNumber FROM turn_state WHERE id = 1')?.turnNumber ?? 1;
}

function buildQueueViewForRequester(h3Index: string, requestingPlayerId: string): HexBuildQueueView {
  const controllerPlayerId = getHexController(h3Index);
  const controlledByRequester = controllerPlayerId === requestingPlayerId;
  const productionView = buildProductionEligibilityView(getRes1InfrastructureForHex(h3Index));
  return {
    h3Index,
    controllerPlayerId,
    controlledByRequester,
    urbanHexCount: productionView.urbanHexCount,
    airportCount: productionView.airportCount,
    seaportCount: productionView.seaportCount,
    availableUnitTypes: productionView.availableUnitTypes,
    buildSectionVisible: productionView.buildSectionVisible,
    noBuildReason: productionView.noBuildReason,
    entries: listBuildQueueRowsForHex(h3Index).map((row) => ({
      id: row.id,
      queueIndex: row.queueIndex,
      unitType: row.unitType,
      count: row.remainingCount,
    })),
  };
}

function resolveRes1ControlAfterCombatAndMovement(
  traversedHexesByPlayer?: Record<'human' | 'opponent', Set<string>>
): ControlTransition[] {
  logDebug('gameActions resolveRes1ControlAfterCombatAndMovement', {
    humanTraversedHexes: traversedHexesByPlayer?.human?.size ?? 0,
    opponentTraversedHexes: traversedHexesByPlayer?.opponent?.size ?? 0,
  });
  const transitions: ControlTransition[] = [];
  const occupantRows = dbGetAll<{ h3Index: string; distinctPlayers: number; solePlayer: string | null }>(
    `SELECT h3_index AS h3Index,
            COUNT(DISTINCT player) AS distinctPlayers,
            CASE WHEN COUNT(DISTINCT player) = 1 THEN MIN(player) ELSE NULL END AS solePlayer
     FROM units
     GROUP BY h3_index`
  );
  const occupancyByHex = new Map(occupantRows.map((row) => [row.h3Index, row]));
  const currentControlByHex = new Map(listAllHexControls().map((row) => [row.h3Index, row.controllerPlayerId]));
  const allHexes = new Set<string>([
    ...Array.from(occupancyByHex.keys()),
    ...Array.from(currentControlByHex.keys()),
    ...(traversedHexesByPlayer ? [...traversedHexesByPlayer.human, ...traversedHexesByPlayer.opponent] : []),
  ]);
  for (const h3Index of allHexes) {
    const occupied = occupancyByHex.get(h3Index);
    const currentController = currentControlByHex.get(h3Index) ?? null;
    let nextController: string | null = null;
    if (occupied && occupied.distinctPlayers === 1 && occupied.solePlayer) {
      nextController = occupied.solePlayer;
    } else if (!occupied && traversedHexesByPlayer) {
      const humanTraversed = traversedHexesByPlayer.human.has(h3Index);
      const opponentTraversed = traversedHexesByPlayer.opponent.has(h3Index);
      // Intermediate-path control only resolves on unoccupied hexes traversed by exactly one side.
      if (humanTraversed !== opponentTraversed) {
        nextController = humanTraversed ? 'human' : 'opponent';
      }
    } else {
      continue;
    }
    if (!nextController) {
      continue;
    }
    if (currentController === nextController) {
      continue;
    }
    setHexController(h3Index, nextController);
    transitions.push({
      h3Index,
      fromControllerPlayerId: currentController,
      toControllerPlayerId: nextController,
    });
    if (currentController !== null && currentController !== nextController) {
      clearBuildQueueAndProgressForHex(h3Index);
    }
  }
  return transitions;
}

function spawnProducedUnitsForHex(
  h3Index: string,
  controllerPlayerId: string,
  unitTypes: BuildUnitType[],
  unitCountsByPlayerType: Map<string, number>,
  capReachedByPlayer: DeploymentCapReachedByPlayer
): BuildUnitType[] {
  if (unitTypes.length === 0) return [];
  const turnNumber = currentPlanningTurnNumber();
  const seqRow = dbGetOne<{ value: string }>("SELECT value FROM game_config WHERE key = 'production_unit_spawn_sequence'");
  let sequence = seqRow ? parseInt(seqRow.value, 10) : 0;
  if (!Number.isFinite(sequence)) sequence = 0;
  const deployed: BuildUnitType[] = [];
  const capArray = controllerPlayerId === 'opponent' ? capReachedByPlayer.opponent : capReachedByPlayer.human;
  const capSet = new Set(capArray);
  for (const unitType of unitTypes) {
    const key = `${controllerPlayerId}:${unitType}`;
    const currentCount = unitCountsByPlayerType.get(key) ?? 0;
    const maxCount = MAX_UNITS_PER_TYPE[unitType];
    if (currentCount >= maxCount) {
      capSet.add(unitType);
      continue;
    }
    sequence += 1;
    const unitId = `${controllerPlayerId}-${unitType}-prod-${turnNumber}-${sequence}`;
    const displayOrder = allocateNextUnitDisplayOrder(unitType);
    dbRun('INSERT INTO units (id, player, unit_type, display_order, h3_index) VALUES (?, ?, ?, ?, ?)', [
      unitId,
      controllerPlayerId,
      unitType,
      displayOrder,
      h3Index,
    ]);
    unitCountsByPlayerType.set(key, currentCount + 1);
    deployed.push(unitType);
  }
  capArray.splice(0, capArray.length, ...DEPLOYMENT_CAP_TYPE_ORDER.filter((unitType) => capSet.has(unitType)));
  dbRun(`INSERT OR REPLACE INTO game_config (key, value) VALUES ('production_unit_spawn_sequence', ?)`, [String(sequence)]);
  return deployed;
}

function processProductionAfterControlResolution(): {
  deployedByPlayer: { human: DeployedUnitsByType; opponent: DeployedUnitsByType };
  capReachedByPlayer: DeploymentCapReachedByPlayer;
} {
  logDebug('gameActions processProductionAfterControlResolution');
  const deployedByPlayer: { human: DeployedUnitsByType; opponent: DeployedUnitsByType } = {
    human: {},
    opponent: {},
  };
  const capReachedByPlayer: DeploymentCapReachedByPlayer = { human: [], opponent: [] };
  const unitCountsByPlayerType = new Map<string, number>();
  const unitCountRows = dbGetAll<{ player: string; unitType: BuildUnitType; count: number }>(
    `SELECT player, unit_type AS unitType, COUNT(*) AS count
     FROM units
     GROUP BY player, unit_type`
  );
  for (const row of unitCountRows) {
    unitCountsByPlayerType.set(`${row.player}:${row.unitType}`, row.count);
  }
  const controls = listAllHexControls().filter((row) => row.controllerPlayerId !== null);
  for (const control of controls) {
    const controllerPlayerId = control.controllerPlayerId;
    if (!controllerPlayerId) continue;
    const queueRows = listBuildQueueRowsForHex(control.h3Index);
    if (queueRows.length === 0) continue;
    const { urbanHexCount } = getRes1InfrastructureForHex(control.h3Index);
    if (urbanHexCount <= 0) continue;
    const storedPoints = getBuildProgressPointsForHex(control.h3Index);
    const capArray = controllerPlayerId === 'opponent' ? capReachedByPlayer.opponent : capReachedByPlayer.human;
    const capSet = new Set(capArray);
    const queueWorking = queueRows
      .map((row) => ({
        id: row.id,
        queueIndex: row.queueIndex,
        unitType: row.unitType,
        remainingCount: row.remainingCount,
      }))
      .sort((a, b) => a.queueIndex - b.queueIndex || a.id - b.id);
    let points = Math.max(0, Math.trunc(storedPoints)) + Math.max(0, Math.trunc(urbanHexCount));
    const simulatedCountsByType = new Map<BuildUnitType, number>();
    for (const unitType of DEPLOYMENT_CAP_TYPE_ORDER) {
      simulatedCountsByType.set(unitType, unitCountsByPlayerType.get(`${controllerPlayerId}:${unitType}`) ?? 0);
    }
    const spawnedUnitTypes: BuildUnitType[] = [];
    let blockedByCapType: BuildUnitType | null = null;
    let idx = 0;
    while (idx < queueWorking.length) {
      const entry = queueWorking[idx]!;
      const cost = UNIT_COST_BY_TYPE[entry.unitType];
      if (points < cost) break;
      const currentCount = simulatedCountsByType.get(entry.unitType) ?? 0;
      const maxCount = MAX_UNITS_PER_TYPE[entry.unitType];
      if (currentCount >= maxCount) {
        blockedByCapType = entry.unitType;
        capSet.add(entry.unitType);
        break;
      }
      const maxByPoints = Math.floor(points / cost);
      const maxByCap = maxCount - currentCount;
      const built = Math.min(entry.remainingCount, maxByPoints, maxByCap);
      if (built <= 0) break;
      entry.remainingCount -= built;
      points -= built * cost;
      simulatedCountsByType.set(entry.unitType, currentCount + built);
      for (let n = 0; n < built; n++) spawnedUnitTypes.push(entry.unitType);
      if (entry.remainingCount <= 0) {
        queueWorking.splice(idx, 1);
      }
    }
    for (let i = 0; i < queueWorking.length; i++) {
      queueWorking[i]!.queueIndex = i;
    }
    const applyResult = {
      updatedEntries: queueWorking,
      storedPoints: points,
      spawnedUnitTypes,
    };
    replaceBuildQueueForHex(
      control.h3Index,
      applyResult.updatedEntries.map((entry) => ({ unitType: entry.unitType, remainingCount: entry.remainingCount }))
    );
    setBuildProgressPointsForHex(control.h3Index, applyResult.storedPoints);
    const deployedForHex = spawnProducedUnitsForHex(
      control.h3Index,
      controllerPlayerId,
      applyResult.spawnedUnitTypes,
      unitCountsByPlayerType,
      capReachedByPlayer
    );
    const deployedForController = controllerPlayerId === 'opponent' ? deployedByPlayer.opponent : deployedByPlayer.human;
    for (const unitType of deployedForHex) {
      deployedForController[unitType] = (deployedForController[unitType] ?? 0) + 1;
    }
    logDebug('gameActions processProductionAfterControlResolution: processed hex', {
      h3Index: control.h3Index,
      controllerPlayerId,
      urbanHexCount,
      queueBeforeCount: queueRows.length,
      queueAfterCount: applyResult.updatedEntries.length,
      storedPointsAfter: applyResult.storedPoints,
      spawnedCount: deployedForHex.length,
      blockedByCapType,
      cappedTypesForController:
        DEPLOYMENT_CAP_TYPE_ORDER.filter((unitType) => capSet.has(unitType)).join(', ') || 'none',
    });
    capArray.splice(0, capArray.length, ...DEPLOYMENT_CAP_TYPE_ORDER.filter((unitType) => capSet.has(unitType)));
  }
  return { deployedByPlayer, capReachedByPlayer };
}

function collectTraversedHexesByPlayer(
  orders: Array<{ unitId: string; toH3Index: string }>,
  unitsBeforeMove: Array<{ id: string; player: string; h3Index: string }>
): Record<'human' | 'opponent', Set<string>> {
  const traversed: Record<'human' | 'opponent', Set<string>> = {
    human: new Set<string>(),
    opponent: new Set<string>(),
  };
  const byId = new Map(unitsBeforeMove.map((u) => [u.id, u]));
  for (const order of orders) {
    const unit = byId.get(order.unitId);
    if (!unit) continue;
    const player = unit.player === 'opponent' ? 'opponent' : 'human';
    try {
      const path = gridPathCells(unit.h3Index, order.toH3Index);
      for (const h3 of path) traversed[player].add(h3);
    } catch {
      traversed[player].add(unit.h3Index);
      traversed[player].add(order.toH3Index);
    }
  }
  return traversed;
}

function dbBackedStateSnapshot() {
  return {
    hexes: dbGetAll<{ h3Index: string; terrain: string; terrainKind: string }>(
      'SELECT h3_index AS h3Index, terrain, terrain_kind AS terrainKind FROM hexes'
    ),
    units: dbGetAll<{ id: string; player: string; unitType: string; h3Index: string }>(
      'SELECT id, player, unit_type AS unitType, h3_index AS h3Index FROM units'
    ),
    phase: dbGetOne<{ phase: string }>('SELECT phase FROM turn_state WHERE id = 1')?.phase ?? 'planning',
    turnNumber: dbGetOne<{ turnNumber: number }>('SELECT turn_number AS turnNumber FROM turn_state WHERE id = 1')?.turnNumber ?? 1,
    pendingOrders: dbGetAll<{ unitId: string; toH3Index: string }>(
      'SELECT unit_id AS unitId, to_h3_index AS toH3Index FROM pending_orders'
    ),
  };
}

/**
 * Validates a single movement order: unit exists and is human-owned, destination is on map,
 * within unit's movement range, and terrain allows the unit type (naval→water/coastal, infantry/armor→land/coastal/wetlands).
 * Returns a reason string when invalid.
 */
function validateOrder(
  unitId: string,
  toH3Index: string
): { valid: true } | { valid: false; reason: string } {
  if (!isDbReady()) return { valid: false, reason: 'Database not initialized' };

  const unit = dbGetOne<{ player: string; unit_type: string; h3_index: string }>(
    'SELECT player, unit_type, h3_index FROM units WHERE id = ?',
    [unitId]
  );
  if (!unit) return { valid: false, reason: `Unit not found: ${unitId}` };
  if (unit.player !== 'human') return { valid: false, reason: 'Only human units can receive orders' };

  const mapHexes = getMapHexSet();
  if (!mapHexes.has(toH3Index)) return { valid: false, reason: 'Destination not on map' };
  if (!mapHexes.has(unit.h3_index)) {
    return { valid: false, reason: 'Unit is on an invalid or outdated hex; start a new game.' };
  }

  let dist: number;
  try {
    dist = gridDistance(unit.h3_index, toH3Index);
  } catch {
    return { valid: false, reason: 'Invalid hex or distance; try starting a new game.' };
  }
  const range = MOVEMENT_RANGE_BY_UNIT_TYPE[unit.unit_type] ?? 1;
  if (dist > range) return { valid: false, reason: `${unit.unit_type} can move at most ${range} hex(es)` };
  /* dist === 0 (same hex) is allowed: "hold" / no move is valid. */

  const originTerrain = getMovementTerrainForH3(unit.h3_index);
  const destinationTerrain = getMovementTerrainForH3(toH3Index);
  if (unit.unit_type === 'naval' && !passabilityAllowsNavalUnit(destinationTerrain)) {
    return { valid: false, reason: NAVAL_DESTINATION_MUST_BE_WATER_COASTAL };
  }
  if (unit.unit_type === 'naval' && !passabilityAllowsNavalUnit(originTerrain)) {
    const seaportSpawnHex = isLandSeaportSpawnHex({
      h3Index: unit.h3_index,
      normalizedTerrain: originTerrain,
    });
    if (!seaportSpawnHex) {
      return { valid: false, reason: NAVAL_START_MUST_BE_WATER_COASTAL };
    }
    if (dist !== 1 || !passabilityAllowsNavalUnit(destinationTerrain)) {
      return { valid: false, reason: NAVAL_SEAPORT_EGRESS_REQUIRED };
    }
  }
  if ((unit.unit_type === 'infantry' || unit.unit_type === 'armor') && !passabilityAllowsLandUnit(destinationTerrain)) {
    return { valid: false, reason: 'Land units must move to land, coastal, or wetlands hexes' };
  }

  return { valid: true };
}

/**
 * Validates a single ranged attack: unit exists and belongs to allowedPlayer, has range ≥ 1,
 * target hex is on map, H3 grid distance ≤ unit range, and target hex contains at least one enemy unit.
 * Per combat spec: naval can target land within range; armor can target water within 1. No friendly-fire check.
 */
export function validateRangedAttack(
  unitId: string,
  targetH3Index: string,
  options?: { allowedPlayer?: string }
): { valid: true } | { valid: false; reason: string } {
  const allowedPlayer = options?.allowedPlayer ?? 'human';
  if (!isDbReady()) return { valid: false, reason: 'Database not initialized' };

  const unit = dbGetOne<{ player: string; unit_type: string; h3_index: string }>(
    'SELECT player, unit_type, h3_index FROM units WHERE id = ?',
    [unitId]
  );
  if (!unit) return { valid: false, reason: `Unit not found: ${unitId}` };
  if (unit.player !== allowedPlayer) {
    return { valid: false, reason: `Unit must belong to ${allowedPlayer}` };
  }

  const range = getRange(unit.unit_type);
  if (unit.unit_type === 'air') return { valid: false, reason: 'Air units use Strike mode, not ranged attack mode' };
  if (range < 1) return { valid: false, reason: `${unit.unit_type} has no ranged attack (melee only)` };

  if (!getMapHexSet().has(targetH3Index)) return { valid: false, reason: 'Target hex not on map' };

  const withinRange = isWithinGridRangeSafe(unit.h3_index, targetH3Index, range, 'validateRangedAttack');
  if (!withinRange) return { valid: false, reason: formatTargetOutOfRangeReason(unit.unit_type, range) };

  const enemiesAtTarget = dbGetAll<{ player: string }>(
    'SELECT player FROM units WHERE h3_index = ? AND player != ?',
    [targetH3Index, unit.player]
  );
  if (enemiesAtTarget.length === 0) {
    return { valid: false, reason: 'Target hex has no enemy units' };
  }

  return { valid: true };
}

/**
 * Why this exists:
 *     Supplies renderer with human standing-order rows for movement list and committed-order overlays.
 * When to use:
 *     Planning-phase UI refresh and after assign/cancel operations.
 * What to expect:
 *     Returns normalized march-only rows sorted by unitId.
 */
export function listHumanStandingOrders(): HumanStandingOrderView[] {
  logTrace('gameActions listHumanStandingOrders');
  try {
    if (!isDbReady()) return [];
    const state = dbBackedStateSnapshot();
    const hexList = state.hexes.map((h) => h.h3Index);
    const { latLngByH3, resolveToH3 } = buildLatLngCoordinateMap(hexList);
    const result = queryHumanStandingOrders(state, latLngByH3, resolveToH3) as {
      status: string;
      orders?: Array<{
        unitId?: string;
        type?: string;
        status?: string;
        turnsRemaining?: number;
        nextMoveHex?: [number, number];
        destination?: [number, number];
      }>;
    };
    if (result.status !== 'ok' || !Array.isArray(result.orders)) return [];
    const validHumanUnitIds = new Set(state.units.filter((u) => u.player === HUMAN_PLAYER_ID).map((u) => u.id));
    const marchOrders = result.orders.filter(
      (o) => o.type === 'march' && typeof o.unitId === 'string' && validHumanUnitIds.has(o.unitId)
    );
    if (marchOrders.length !== result.orders.length) {
      const staleUnitIds = result.orders
        .map((o) => o.unitId)
        .filter((unitId): unitId is string => typeof unitId === 'string' && !validHumanUnitIds.has(unitId));
      for (const unitId of staleUnitIds) {
        dbRun('DELETE FROM standing_orders WHERE player_id = ? AND unit_id = ?', [HUMAN_PLAYER_ID, unitId]);
      }
      logDebug('gameActions listHumanStandingOrders: skipped stale standing orders for missing units', {
        total: result.orders.length,
        kept: marchOrders.length,
        deleted: staleUnitIds.length,
      });
    }
    return marchOrders
      .map((o) => {
        const unitId = o.unitId as string;
        const destinationH3Index =
          Array.isArray(o.destination) && o.destination.length >= 2
            ? resolveToH3(Number(o.destination[0]), Number(o.destination[1])) ?? null
            : null;
        let routeSegments: { turn: number; hexes: [number, number][] }[] | undefined;
        if (Array.isArray(o.destination) && o.destination.length >= 2) {
          const planned = executePlanRoute(
            unitId,
            [Number(o.destination[0]), Number(o.destination[1])],
            { avoidEnemies: true },
            state,
            latLngByH3,
            resolveToH3
          );
          if (planned.status === 'ok') {
            routeSegments = planned.path.map((seg) => ({ turn: seg.turn, hexes: seg.hexes }));
          }
        }
        return {
          unitId,
          status: String(o.status ?? 'en_route'),
          destinationH3Index,
          turnsRemaining: Number(o.turnsRemaining ?? 0),
          nextMoveH3Index:
            Array.isArray(o.nextMoveHex) && o.nextMoveHex.length >= 2
              ? resolveToH3(Number(o.nextMoveHex[0]), Number(o.nextMoveHex[1])) ?? null
              : null,
          routeSegments,
        };
      })
      .sort((a, b) => a.unitId.localeCompare(b.unitId));
  } catch (err) {
    logError('listHumanStandingOrders: exception', err);
    return [];
  }
}

/**
 * Why this exists:
 *     Assigns/updates a human march standing order from renderer double-click input.
 * When to use:
 *     Renderer commit action for long-distance movement orders.
 * What to expect:
 *     Returns success false with reason on validation/persistence failures.
 */
export function assignHumanMarchOrder(unitId: string, destinationH3Index: string): SubmitOrdersResult {
  logDebug('gameActions assignHumanMarchOrder', { unitId, destinationH3Index });
  try {
    if (!isDbReady()) return { success: false, reason: 'Database not initialized' };
    const state = dbBackedStateSnapshot();
    const turnRow = dbGetOne<{ phase: string }>('SELECT phase FROM turn_state WHERE id = 1');
    if (turnRow?.phase !== VALID_PHASE) return { success: false, reason: 'Not in planning phase' };
    const unitRow = state.units.find((unit) => unit.id === unitId && unit.player === HUMAN_PLAYER_ID);
    if (!unitRow) return { success: false, reason: 'Unit not found or not human-controlled' };
    if (unitRow.unitType === 'air') return { success: false, reason: AIR_UNITS_CANNOT_MARCH_REASON };
    const mapHexes = new Set(state.hexes.map((h) => h.h3Index));
    if (!mapHexes.has(destinationH3Index)) return { success: false, reason: 'Destination not on map' };
    const hexList = state.hexes.map((h) => h.h3Index);
    const { latLngByH3, resolveToH3 } = buildLatLngCoordinateMap(hexList);
    const destinationLatLng = latLngByH3.get(destinationH3Index);
    if (!destinationLatLng) return { success: false, reason: 'Destination not on map' };
    const result = assignHumanMarchStandingOrder(unitId, destinationLatLng, state, latLngByH3, resolveToH3) as {
      status: string;
      error?: string;
    };
    if (result.status !== 'ok') {
      logDebug('gameActions assignHumanMarchOrder: standing-order assignment rejected', {
        unitId,
        destinationH3Index,
        error: result.error ?? 'Failed to assign order',
      });
      return { success: false, reason: result.error ?? 'Failed to assign order' };
    }
    return { success: true };
  } catch (err) {
    logError('assignHumanMarchOrder: exception', err);
    return { success: false, reason: String(err) };
  }
}

/**
 * Why this exists:
 *     Assigns/updates the same human march standing order destination for multiple selected units atomically.
 * When to use:
 *     Renderer multi-select double-click commit for grouped movement.
 * What to expect:
 *     Rejects the entire batch when any selected unit cannot receive the destination.
 */
export function assignHumanMarchOrders(unitIds: string[], destinationH3Index: string): SubmitOrdersResult {
  logDebug('gameActions assignHumanMarchOrders', { unitCount: unitIds.length, destinationH3Index });
  try {
    if (!isDbReady()) return { success: false, reason: 'Database not initialized' };
    const uniqueUnitIds = getUniqueNonEmptyIds(unitIds);
    if (uniqueUnitIds.length === 0) return { success: false, reason: 'No selected units to assign' };
    const state = dbBackedStateSnapshot();
    const destinationHex = state.hexes.find((h) => h.h3Index === destinationH3Index);
    if (!destinationHex) return { success: false, reason: 'Destination not on map' };
    const selectedUnits = uniqueUnitIds
      .map((unitId) => state.units.find((unit) => unit.id === unitId && unit.player === HUMAN_PLAYER_ID))
      .filter((unit): unit is HumanOwnedUnit => !!unit);
    if (selectedUnits.length !== uniqueUnitIds.length) {
      logDebug('gameActions assignHumanMarchOrders: invalid unit selection set', {
        requestedUnitCount: uniqueUnitIds.length,
        validHumanUnitCount: selectedUnits.length,
      });
      return { success: false, reason: 'At least one selected unit is invalid or not human-controlled.' };
    }
    const destinationTerrain = effectiveHexPassabilityTerrain(destinationHex);
    const sharedMixedTerrain = hexSupportsMixedLandAndNaval(destinationHex);
    const hasMixedSelection = selectionHasMixedLandAndNaval(selectedUnits);
    logDebug('gameActions assignHumanMarchOrders: destination terrain classification', {
      destinationH3Index,
      destinationTerrain,
      destinationTerrainRaw: destinationHex.terrain,
      destinationTerrainKind: destinationHex.terrainKind,
      hasLand: selectedUnits.some((unit) => unit.unitType === 'infantry' || unit.unitType === 'armor'),
      hasNaval: selectedUnits.some((unit) => unit.unitType === 'naval'),
      sharedMixedTerrain,
      selectedUnitTypes: selectedUnits.map((u) => u.unitType),
    });
    if (hasMixedSelection && !sharedMixedTerrain) {
      return { success: false, reason: MIXED_STACK_COASTAL_ONLY_REASON };
    }

    for (const unitId of uniqueUnitIds) {
      const result = assignHumanMarchOrder(unitId, destinationH3Index);
      if (!result.success) {
        logDebug('gameActions assignHumanMarchOrders: unit assignment failed', {
          unitId,
          destinationH3Index,
          reason: result.reason ?? `Failed to assign movement order for ${unitId}`,
        });
        return { success: false, reason: result.reason ?? `Failed to assign movement order for ${unitId}` };
      }
    }
    return { success: true };
  } catch (err) {
    logError('assignHumanMarchOrders: exception', err);
    return { success: false, reason: String(err) };
  }
}

/**
 * Why this exists:
 *     Cancels a single human standing order from sidebar cancel action.
 * When to use:
 *     Renderer movement-order list Cancel button.
 * What to expect:
 *     Removes only the provided unit order when present.
 */
export function cancelHumanOrder(unitId: string): SubmitOrdersResult {
  logDebug('gameActions cancelHumanOrder', { unitId });
  try {
    if (!isDbReady()) return { success: false, reason: 'Database not initialized' };
    const state = dbBackedStateSnapshot();
    const hexList = state.hexes.map((h) => h.h3Index);
    const { latLngByH3, resolveToH3 } = buildLatLngCoordinateMap(hexList);
    const result = cancelHumanStandingOrder(unitId, state, latLngByH3, resolveToH3) as { status: string; error?: string };
    if (result.status !== 'ok') return { success: false, reason: result.error ?? 'Failed to cancel order' };
    return { success: true };
  } catch (err) {
    logError('cancelHumanOrder: exception', err);
    return { success: false, reason: String(err) };
  }
}

/**
 * Why this exists:
 *     Validates whether a grouped ranged target is legal for all selected human units.
 * When to use:
 *     Renderer grouped ranged-mode target click before enqueuing one row per selected unit.
 * What to expect:
 *     Returns success false with a specific reason when any selected unit fails capability/range/target checks.
 */
export function validateGroupRangedTarget(unitIds: string[], targetH3Index: string): SubmitOrdersResult {
  logDebug('gameActions validateGroupRangedTarget', { unitCount: unitIds.length, targetH3Index });
  try {
    if (!isDbReady()) return { success: false, reason: 'Database not initialized' };
    const uniqueUnitIds = getUniqueNonEmptyIds(unitIds);
    if (uniqueUnitIds.length === 0) return { success: false, reason: 'No selected units for ranged targeting' };
    for (const unitId of uniqueUnitIds) {
      const result = validateRangedAttack(unitId, targetH3Index, { allowedPlayer: HUMAN_PLAYER_ID });
      if (!result.valid) {
        return { success: false, reason: `${unitId}: ${result.reason}` };
      }
    }
    return { success: true };
  } catch (err) {
    logError('validateGroupRangedTarget: exception', err);
    return { success: false, reason: String(err) };
  }
}

function computeGridDistanceSafe(
  originH3Index: string,
  destinationH3Index: string,
  context: string
): number | null {
  try {
    return gridDistance(originH3Index, destinationH3Index);
  } catch (distanceErr) {
    logError(`${context}: gridDistance failed`, { originH3Index, destinationH3Index, distanceErr });
  }
  try {
    const path = gridPathCells(originH3Index, destinationH3Index);
    if (path.length > 0) return Math.max(0, path.length - 1);
  } catch (pathErr) {
    logError(`${context}: gridPathCells failed`, { originH3Index, destinationH3Index, pathErr });
  }
  return null;
}

function isWithinGridRangeSafe(
  originH3Index: string,
  destinationH3Index: string,
  maxRange: number,
  context: string
): boolean {
  const distance = computeGridDistanceSafe(originH3Index, destinationH3Index, context);
  if (distance !== null) return distance <= maxRange;
  try {
    const disk = gridDisk(originH3Index, maxRange);
    return disk.includes(destinationH3Index);
  } catch (diskErr) {
    logError(`${context}: gridDisk failed`, { originH3Index, destinationH3Index, maxRange, diskErr });
  }
  return false;
}

function validateAirStrikeOrder(
  unitId: string,
  targetH3Index: string,
  targetType: AirStrikeTargetType,
  options?: { allowedPlayer?: string }
): { valid: true } | { valid: false; reason: string } {
  const allowedPlayer = options?.allowedPlayer ?? HUMAN_PLAYER_ID;
  if (!isDbReady()) return { valid: false, reason: 'Database not initialized' };
  const unit = dbGetOne<{ player: string; unit_type: string; h3_index: string }>(
    'SELECT player, unit_type, h3_index FROM units WHERE id = ?',
    [unitId]
  );
  if (!unit) return { valid: false, reason: `Unit not found: ${unitId}` };
  if (unit.player !== allowedPlayer) return { valid: false, reason: `Unit must belong to ${allowedPlayer}` };
  if (unit.unit_type !== 'air') return { valid: false, reason: 'Only air units can execute strikes' };
  if (!getMapHexSet().has(targetH3Index)) return { valid: false, reason: 'Target hex not on map' };

  const withinStrikeRange = isWithinGridRangeSafe(unit.h3_index, targetH3Index, AIR_STRIKE_RANGE_HEXES, 'validateAirStrikeOrder');
  if (!withinStrikeRange) return { valid: false, reason: formatTargetOutOfRangeReason(unit.unit_type, AIR_STRIKE_RANGE_HEXES) };

  const baseInfrastructure = getRes1InfrastructureForHex(unit.h3_index);
  if (baseInfrastructure.airportCount <= 0) {
    return { valid: false, reason: 'Air unit must be based at an intact airport to strike' };
  }

  if (targetType === 'units') {
    const enemiesAtTarget = dbGetAll<{ player: string }>(
      'SELECT player FROM units WHERE h3_index = ? AND player != ?',
      [targetH3Index, unit.player]
    );
    if (enemiesAtTarget.length === 0) return { valid: false, reason: 'Target hex has no enemy units' };
    return { valid: true };
  }

  const targetInfrastructure = getRes1InfrastructureForHex(targetH3Index);
  if (targetType === 'urban' && targetInfrastructure.urbanHexCount <= 0) {
    return { valid: false, reason: 'Target hex has no urban infrastructure' };
  }
  if (targetType === 'airport' && targetInfrastructure.airportCount <= 0) {
    return { valid: false, reason: 'Target hex has no airport' };
  }
  if (targetType === 'seaport' && targetInfrastructure.seaportCount <= 0) {
    return { valid: false, reason: 'Target hex has no seaport' };
  }
  return { valid: true };
}

/**
 * Why this exists:
 *     Validates grouped strike targeting for selected air units before renderer queues one order per unit.
 * When to use:
 *     Renderer strike-mode target click handling.
 * What to expect:
 *     Returns specific first-failure reason for toast display parity with grouped ranged validation.
 */
export function validateGroupAirStrikeTarget(
  unitIds: string[],
  targetH3Index: string,
  targetType: AirStrikeTargetType
): SubmitOrdersResult {
  logDebug('gameActions validateGroupAirStrikeTarget', { unitCount: unitIds.length, targetH3Index, targetType });
  try {
    if (!isDbReady()) return { success: false, reason: 'Database not initialized' };
    const uniqueUnitIds = getUniqueNonEmptyIds(unitIds);
    if (uniqueUnitIds.length === 0) return { success: false, reason: 'No selected units for strike targeting' };
    for (const unitId of uniqueUnitIds) {
      const result = validateAirStrikeOrder(unitId, targetH3Index, targetType, { allowedPlayer: HUMAN_PLAYER_ID });
      if (!result.valid) return { success: false, reason: `${unitId}: ${result.reason}` };
    }
    return { success: true };
  } catch (err) {
    logError('validateGroupAirStrikeTarget: exception', err);
    return { success: false, reason: String(err) };
  }
}

/**
 * Why this exists:
 *     Validates grouped ferry destinations for selected human air units before renderer queues ferry orders.
 * When to use:
 *     Renderer grouped double-click movement path for homogeneous air selections.
 * What to expect:
 *     Returns success false with a specific first-failure reason when any selected unit cannot legally ferry.
 */
export function validateGroupFerryTarget(unitIds: string[], destinationH3Index: string): SubmitOrdersResult {
  logDebug('gameActions validateGroupFerryTarget', { unitCount: unitIds.length, destinationH3Index });
  try {
    if (!isDbReady()) return { success: false, reason: 'Database not initialized' };
    const uniqueUnitIds = getUniqueNonEmptyIds(unitIds);
    if (uniqueUnitIds.length === 0) return { success: false, reason: 'No selected units for ferry targeting' };
    for (const unitId of uniqueUnitIds) {
      const result = validateFerryOrder(unitId, destinationH3Index, { allowedPlayer: HUMAN_PLAYER_ID });
      if (!result.valid) return { success: false, reason: `${unitId}: ${result.reason}` };
    }
    return { success: true };
  } catch (err) {
    logError('validateGroupFerryTarget: exception', err);
    return { success: false, reason: String(err) };
  }
}

function validateFerryOrder(
  unitId: string,
  destinationH3Index: string,
  options?: { allowedPlayer?: string }
): { valid: true } | { valid: false; reason: string } {
  const allowedPlayer = options?.allowedPlayer ?? HUMAN_PLAYER_ID;
  if (!isDbReady()) return { valid: false, reason: 'Database not initialized' };
  const unit = dbGetOne<{ player: string; unit_type: string; h3_index: string }>(
    'SELECT player, unit_type, h3_index FROM units WHERE id = ?',
    [unitId]
  );
  if (!unit) return { valid: false, reason: `Unit not found: ${unitId}` };
  if (unit.player !== allowedPlayer) return { valid: false, reason: `Unit must belong to ${allowedPlayer}` };
  if (unit.unit_type !== 'air') return { valid: false, reason: 'Only air units can ferry' };
  if (!getMapHexSet().has(destinationH3Index)) return { valid: false, reason: 'Destination hex not on map' };
  const withinFerryRange = isWithinGridRangeSafe(unit.h3_index, destinationH3Index, AIR_FERRY_RANGE_HEXES, 'validateFerryOrder');
  if (!withinFerryRange) return { valid: false, reason: formatFerryOutOfRangeReason(AIR_FERRY_RANGE_HEXES) };
  const origin = getRes1InfrastructureForHex(unit.h3_index);
  if (origin.airportCount <= 0) return { valid: false, reason: 'Origin airport is not intact' };
  const destination = getRes1InfrastructureForHex(destinationH3Index);
  if (destination.airportCount <= 0) return { valid: false, reason: 'Destination airport is not intact' };
  const controller = getHexController(destinationH3Index);
  if (controller !== unit.player) return { valid: false, reason: 'Destination airport must be controlled by unit owner' };
  return { valid: true };
}

function pruneBuildQueueForInfrastructureState(h3Index: string): void {
  const infra = getRes1InfrastructureForHex(h3Index);
  const rows = listBuildQueueRowsForHex(h3Index);
  if (rows.length === 0) return;
  const allowed = new Set(getAvailableBuildUnitTypes(infra.urbanHexCount, infra.seaportCount, infra.airportCount));
  if (infra.urbanHexCount <= 0) {
    clearBuildQueueAndProgressForHex(h3Index);
    return;
  }
  const filtered = rows.filter((row) => allowed.has(row.unitType));
  if (filtered.length === rows.length) return;
  replaceBuildQueueForHex(
    h3Index,
    filtered.map((row) => ({ unitType: row.unitType, remainingCount: row.remainingCount }))
  );
}

function replaceRandomRes4FeaturesWithRubble(
  h3Index: string,
  feature: 'urban' | 'airport' | 'seaport',
  count: number,
  next: () => number
): number {
  if (count <= 0) return 0;
  const candidates = listRes4FeatureOverridesForGame().filter((row) => {
    if (row.parentH3Index !== h3Index) return false;
    if (row.isRubble) return false;
    if (feature === 'urban') return row.isUrban;
    if (feature === 'airport') return row.isAirport;
    return row.isSeaport;
  });
  let changed = 0;
  const pool = [...candidates];
  while (pool.length > 0 && changed < count) {
    const idx = Math.floor(next() * pool.length);
    const row = pool.splice(idx, 1)[0]!;
    updateRes4FeatureOverrideRow(row.h3Index, {
      isRubble: true,
      isUrban: feature === 'urban' ? false : row.isUrban,
      isAirport: feature === 'airport' ? false : row.isAirport,
      isSeaport: feature === 'seaport' ? false : row.isSeaport,
    });
    changed++;
  }
  return changed;
}

function destroyBasedAirUnitsAtHex(
  h3Index: string
): Array<{ id: string; player: string; unit_type: string; h3_index: string; display_order: number | null }> {
  const rows = dbGetAll<{ id: string; player: string; unit_type: string; h3_index: string; display_order: number | null }>(
    'SELECT id, player, unit_type, h3_index, display_order FROM units WHERE h3_index = ? AND unit_type = ?',
    [h3Index, 'air']
  );
  for (const row of rows) {
    dbRun('DELETE FROM units WHERE id = ?', [row.id]);
  }
  return rows;
}

function applyInfrastructureDestructionEffects(
  h3Index: string,
  targetType: AirStrikeTargetType,
  next: () => number
): {
  destroyedAirUnits: Array<{ id: string; player: string; unit_type: string; h3_index: string; display_order: number | null }>;
  changedRubbleCount: number;
} {
  const current = getRes1InfrastructureForHex(h3Index);
  const result = {
    destroyedAirUnits: [] as Array<{ id: string; player: string; unit_type: string; h3_index: string; display_order: number | null }>,
    changedRubbleCount: 0,
  };
  if (targetType === 'urban') {
    const destroyCount = Math.min(3, current.urbanHexCount);
    if (destroyCount <= 0) return result;
    result.changedRubbleCount = replaceRandomRes4FeaturesWithRubble(h3Index, 'urban', destroyCount, next);
    if (result.changedRubbleCount > 0) pruneBuildQueueForInfrastructureState(h3Index);
    return result;
  }
  if (targetType === 'airport') {
    if (current.airportCount <= 0) return result;
    result.changedRubbleCount = replaceRandomRes4FeaturesWithRubble(h3Index, 'airport', 1, next);
    if (result.changedRubbleCount > 0) {
      result.destroyedAirUnits = destroyBasedAirUnitsAtHex(h3Index);
      pruneBuildQueueForInfrastructureState(h3Index);
    }
    return result;
  }
  if (targetType === 'seaport') {
    if (current.seaportCount <= 0) return result;
    result.changedRubbleCount = replaceRandomRes4FeaturesWithRubble(h3Index, 'seaport', 1, next);
    if (result.changedRubbleCount > 0) pruneBuildQueueForInfrastructureState(h3Index);
  }
  return result;
}

interface AirStrikePhaseAccumulator {
  removedSet: Set<string>;
  removedUnitIds: string[];
  removedUnits: CombatUnit[];
  casualtyHexes: Set<string>;
}

function recordRemovedUnit(
  acc: AirStrikePhaseAccumulator,
  row: { id: string; player: string; unit_type: string; h3_index: string; display_order: number | null },
  options?: { removedAtH3Index?: string }
): void {
  if (acc.removedSet.has(row.id)) return;
  const removedAtH3Index = options?.removedAtH3Index ?? row.h3_index;
  acc.removedSet.add(row.id);
  acc.removedUnitIds.push(row.id);
  acc.removedUnits.push({
    id: row.id,
    player: row.player,
    unitType: row.unit_type,
    h3Index: removedAtH3Index,
    displayOrder: row.display_order ?? undefined,
  });
  acc.casualtyHexes.add(removedAtH3Index);
}

function resolveAirStrikeAgainstUnits(
  attacker: { id: string; player: string; unit_type: string; h3_index: string; display_order: number | null },
  targetH3Index: string,
  attackHit: boolean,
  rollD6: () => number,
  acc: AirStrikePhaseAccumulator
): { success: boolean; attackerLost: boolean } {
  const defenders = dbGetAll<{ id: string; player: string; unit_type: string; h3_index: string; display_order: number | null }>(
    'SELECT id, player, unit_type, h3_index, display_order FROM units WHERE h3_index = ? AND player != ?',
    [targetH3Index, attacker.player]
  );
  let success = false;
  let attackerLost = false;
  if (attackHit && defenders.length > 0) {
    const victim = defenders
      .map((u) => ({ ...u, defense: getDefense(u.unit_type), order: casualtyPriorityIndex(u.unit_type) }))
      .sort((a, b) => a.defense - b.defense || a.order - b.order)[0]!;
    dbRun('DELETE FROM units WHERE id = ?', [victim.id]);
    recordRemovedUnit(acc, victim);
    success = true;
  }

  for (const defender of defenders) {
    if (getRange(defender.unit_type) < 1) continue;
    if (rollD6() > getAttack(defender.unit_type)) continue;
    dbRun('DELETE FROM units WHERE id = ?', [attacker.id]);
    recordRemovedUnit(acc, attacker, { removedAtH3Index: targetH3Index });
    attackerLost = true;
    break;
  }
  return { success, attackerLost };
}

function resolveAirStrikeAgainstInfrastructure(
  attacker: { id: string; player: string; unit_type: string; h3_index: string; display_order: number | null },
  order: { targetH3Index: string; targetType: Exclude<AirStrikeTargetType, 'units'> },
  attackHit: boolean,
  next: () => number,
  rollD6: () => number,
  acc: AirStrikePhaseAccumulator,
  infrastructureDestroyedEvents: InfrastructureDestroyedEvent[]
): { success: boolean; attackerLost: boolean } {
  let success = false;
  let attackerLost = false;
  if (attackHit) {
    const destruction = applyInfrastructureDestructionEffects(order.targetH3Index, order.targetType, next);
    if (destruction.changedRubbleCount > 0 || destruction.destroyedAirUnits.length > 0) {
      infrastructureDestroyedEvents.push({
        h3Index: order.targetH3Index,
        targetType: order.targetType,
        changedRubbleCount: destruction.changedRubbleCount,
        destroyedAirUnitsCount: destruction.destroyedAirUnits.length,
      });
      success = true;
    }
    for (const removed of destruction.destroyedAirUnits) {
      recordRemovedUnit(acc, removed);
    }
  }

  const counterThreshold = order.targetType === 'airport' ? 2 : 1;
  if (rollD6() <= counterThreshold) {
    dbRun('DELETE FROM units WHERE id = ?', [attacker.id]);
    recordRemovedUnit(acc, attacker, { removedAtH3Index: order.targetH3Index });
    attackerLost = true;
  }
  return { success, attackerLost };
}

function resolveAirStrikePhase(
  airOrders: AirStrikeOrder[],
  next: () => number
): {
  removedUnitIds: string[];
  removedUnits: CombatUnit[];
  casualtyHexes: string[];
  strikeHexes: string[];
  strikeMoves: AirStrikeAnimationMove[];
  infrastructureDestroyedEvents: InfrastructureDestroyedEvent[];
  attemptCount: number;
  successfulCount: number;
  failedCount: number;
  attackerLossCount: number;
} {
  const acc: AirStrikePhaseAccumulator = {
    removedSet: new Set<string>(),
    removedUnitIds: [],
    removedUnits: [],
    casualtyHexes: new Set<string>(),
  };
  const strikeHexes = new Set<string>();
  const strikeMoves: AirStrikeAnimationMove[] = [];
  const infrastructureDestroyedEvents: InfrastructureDestroyedEvent[] = [];
  let attemptCount = 0;
  let successfulCount = 0;
  let failedCount = 0;
  let attackerLossCount = 0;
  const sorted = [...airOrders].sort((a, b) => {
    const aUnit = dbGetOne<{ h3_index: string }>('SELECT h3_index FROM units WHERE id = ?', [a.unitId])?.h3_index ?? '';
    const bUnit = dbGetOne<{ h3_index: string }>('SELECT h3_index FROM units WHERE id = ?', [b.unitId])?.h3_index ?? '';
    return aUnit.localeCompare(bUnit) || a.unitId.localeCompare(b.unitId);
  });
  const rollD6 = () => Math.floor(next() * 6) + 1;

  for (const order of sorted) {
    if (acc.removedSet.has(order.unitId)) continue;
    const valid = validateAirStrikeOrder(order.unitId, order.targetH3Index, order.targetType, {
      allowedPlayer: dbGetOne<{ player: string }>('SELECT player FROM units WHERE id = ?', [order.unitId])?.player ?? HUMAN_PLAYER_ID,
    });
    if (!valid.valid) continue;
    strikeHexes.add(order.targetH3Index);
    const attacker = dbGetOne<{ id: string; player: string; unit_type: string; h3_index: string; display_order: number | null }>(
      'SELECT id, player, unit_type, h3_index, display_order FROM units WHERE id = ?',
      [order.unitId]
    );
    if (!attacker) continue;
    attemptCount += 1;
    const attackHit = rollD6() <= getAttack('air');
    if (order.targetType === 'units') {
      const result = resolveAirStrikeAgainstUnits(attacker, order.targetH3Index, attackHit, rollD6, acc);
      strikeMoves.push({
        unitId: attacker.id,
        player: attacker.player,
        unitType: attacker.unit_type,
        fromH3Index: attacker.h3_index,
        targetH3Index: order.targetH3Index,
        returnsToBase: !result.attackerLost,
      });
      if (result.success) successfulCount += 1;
      else failedCount += 1;
      if (result.attackerLost) attackerLossCount += 1;
      continue;
    }

    const result = resolveAirStrikeAgainstInfrastructure(
      attacker,
      { targetH3Index: order.targetH3Index, targetType: order.targetType },
      attackHit,
      next,
      rollD6,
      acc,
      infrastructureDestroyedEvents
    );
    strikeMoves.push({
      unitId: attacker.id,
      player: attacker.player,
      unitType: attacker.unit_type,
      fromH3Index: attacker.h3_index,
      targetH3Index: order.targetH3Index,
      returnsToBase: !result.attackerLost,
    });
    if (result.success) successfulCount += 1;
    else failedCount += 1;
    if (result.attackerLost) attackerLossCount += 1;
  }

  return {
    removedUnitIds: acc.removedUnitIds,
    removedUnits: acc.removedUnits,
    casualtyHexes: [...acc.casualtyHexes],
    strikeHexes: [...strikeHexes],
    strikeMoves,
    infrastructureDestroyedEvents,
    attemptCount,
    successfulCount,
    failedCount,
    attackerLossCount,
  };
}

function destroyAirUnitsWithInvalidBase(): CombatUnit[] {
  const rows = dbGetAll<{ id: string; player: string; unit_type: string; h3_index: string; display_order: number | null }>(
    'SELECT id, player, unit_type, h3_index, display_order FROM units WHERE unit_type = ?',
    ['air']
  );
  const removed: CombatUnit[] = [];
  for (const row of rows) {
    const infra = getRes1InfrastructureForHex(row.h3_index);
    const controller = getHexController(row.h3_index);
    if (infra.airportCount > 0 && controller === row.player) continue;
    dbRun('DELETE FROM units WHERE id = ?', [row.id]);
    removed.push({
      id: row.id,
      player: row.player,
      unitType: row.unit_type,
      h3Index: row.h3_index,
      displayOrder: row.display_order ?? undefined,
    });
  }
  return removed;
}

/**
 * Why this exists:
 *     Returns one res-1 hex build queue snapshot (control, infra gating, and queue rows) for tooltip UI.
 * When to use:
 *     Renderer res-1 tooltip open/refresh during planning interactions.
 * What to expect:
 *     Always returns a stable snapshot; queue mutation is still authorization-gated in mutator APIs.
 */
export function getHexBuildQueue(h3Index: string, requestingPlayerId = HUMAN_PLAYER_ID): HexBuildQueueView {
  logTrace('gameActions getHexBuildQueue', { h3Index, requestingPlayerId });
  return buildQueueViewForRequester(h3Index, requestingPlayerId);
}

function validateBuildQueueMutationContext(args: {
  h3Index: string;
  requestingPlayerId: string;
  requireBuildSectionVisible: boolean;
}): { valid: true; queueView: HexBuildQueueView } | { valid: false; reason: string } {
  const phase = dbGetOne<{ phase: string }>('SELECT phase FROM turn_state WHERE id = 1')?.phase ?? 'planning';
  if (phase !== VALID_PHASE) {
    return { valid: false, reason: 'Build queue can only be edited during planning phase.' };
  }
  const queueView = buildQueueViewForRequester(args.h3Index, args.requestingPlayerId);
  if (!queueView.controlledByRequester) {
    return { valid: false, reason: 'Only the controlling player can edit this build queue.' };
  }
  if (args.requireBuildSectionVisible && !queueView.buildSectionVisible) {
    return { valid: false, reason: queueView.noBuildReason ?? NO_PRODUCTION_INFRASTRUCTURE_REASON };
  }
  return { valid: true, queueView };
}

/**
 * Why this exists:
 *     Appends a new editable build queue row for a controlled hex owned by the requester.
 * When to use:
 *     Tooltip Build button click.
 * What to expect:
 *     Persists immediately, defaults to count=1 and first available unit type, and returns updated queue snapshot.
 */
export function addHexBuildQueueEntry(h3Index: string, requestingPlayerId = HUMAN_PLAYER_ID): {
  success: boolean;
  reason?: string;
  queue?: HexBuildQueueView;
} {
  logDebug('gameActions addHexBuildQueueEntry', { h3Index, requestingPlayerId });
  try {
    const context = validateBuildQueueMutationContext({
      h3Index,
      requestingPlayerId,
      requireBuildSectionVisible: true,
    });
    if (!context.valid) return { success: false, reason: context.reason };
    const queueView = context.queueView;
    const defaultUnitType = queueView.availableUnitTypes[0];
    if (!defaultUnitType) return { success: false, reason: 'No unit types are currently available for this hex.' };
    const currentRows = listBuildQueueRowsForHex(h3Index);
    dbRun(
      `INSERT INTO res1_build_queue (h3_index, queue_index, unit_type, remaining_count)
       VALUES (?, ?, ?, ?)`,
      [h3Index, currentRows.length, defaultUnitType, BUILD_ENTRY_MIN_COUNT]
    );
    return { success: true, queue: buildQueueViewForRequester(h3Index, requestingPlayerId) };
  } catch (err) {
    logError('addHexBuildQueueEntry: exception', err);
    return { success: false, reason: String(err) };
  }
}

/**
 * Why this exists:
 *     Updates one queued row's type/count while preserving queue order and immediate persistence semantics.
 * When to use:
 *     Tooltip row edit interactions for type select and count input.
 * What to expect:
 *     Rejects unauthorized or invalid edits and returns updated queue snapshot on success.
 */
export function updateHexBuildQueueEntry(
  h3Index: string,
  entryId: number,
  unitType: BuildUnitType,
  count: number,
  requestingPlayerId = HUMAN_PLAYER_ID
): { success: boolean; reason?: string; queue?: HexBuildQueueView } {
  logDebug('gameActions updateHexBuildQueueEntry', { h3Index, entryId, unitType, count, requestingPlayerId });
  try {
    const context = validateBuildQueueMutationContext({
      h3Index,
      requestingPlayerId,
      requireBuildSectionVisible: true,
    });
    if (!context.valid) return { success: false, reason: context.reason };
    const queueView = context.queueView;
    if (!queueView.availableUnitTypes.includes(unitType)) {
      return { success: false, reason: `Unit type "${unitType}" is not available for this hex.` };
    }
    if (!isValidBuildCount(count)) {
      return {
        success: false,
        reason: `Build count must be an integer from ${BUILD_ENTRY_MIN_COUNT} to ${BUILD_ENTRY_MAX_COUNT}.`,
      };
    }
    const row = dbGetOne<{ id: number }>('SELECT id FROM res1_build_queue WHERE id = ? AND h3_index = ?', [entryId, h3Index]);
    if (!row) return { success: false, reason: 'Build queue entry not found.' };
    dbRun('UPDATE res1_build_queue SET unit_type = ?, remaining_count = ? WHERE id = ?', [unitType, count, entryId]);
    return { success: true, queue: buildQueueViewForRequester(h3Index, requestingPlayerId) };
  } catch (err) {
    logError('updateHexBuildQueueEntry: exception', err);
    return { success: false, reason: String(err) };
  }
}

/**
 * Why this exists:
 *     Removes one queue row and reindexes the remaining rows to preserve strict front-to-back order.
 * When to use:
 *     Tooltip row remove (`x`) interactions.
 * What to expect:
 *     Persists immediately and returns updated queue snapshot on success.
 */
export function removeHexBuildQueueEntry(
  h3Index: string,
  entryId: number,
  requestingPlayerId = HUMAN_PLAYER_ID
): { success: boolean; reason?: string; queue?: HexBuildQueueView } {
  logDebug('gameActions removeHexBuildQueueEntry', { h3Index, entryId, requestingPlayerId });
  try {
    const context = validateBuildQueueMutationContext({
      h3Index,
      requestingPlayerId,
      requireBuildSectionVisible: false,
    });
    if (!context.valid) return { success: false, reason: context.reason };
    const rows = listBuildQueueRowsForHex(h3Index);
    const filtered = rows.filter((row) => row.id !== entryId);
    if (filtered.length === rows.length) return { success: false, reason: 'Build queue entry not found.' };
    replaceBuildQueueForHex(
      h3Index,
      filtered.map((row) => ({ unitType: row.unitType, remainingCount: row.remainingCount }))
    );
    return { success: true, queue: buildQueueViewForRequester(h3Index, requestingPlayerId) };
  } catch (err) {
    logError('removeHexBuildQueueEntry: exception', err);
    return { success: false, reason: String(err) };
  }
}

function buildHumanMarchPreviewForUnit(
  state: ReturnType<typeof dbBackedStateSnapshot>,
  latLngByH3: Map<string, [number, number]>,
  resolveToH3: (lat: number, lng: number) => string | undefined,
  unitId: string,
  hoveredH3Index: string
): HumanOrderPreviewResult {
  const unit = state.units.find((u) => u.id === unitId && u.player === HUMAN_PLAYER_ID);
  if (!unit) return { valid: false, showInvalidMarker: false, invalidReason: 'Unit not found', segments: [] };
  const hoveredHex = state.hexes.find((h) => h.h3Index === hoveredH3Index);
  if (!hoveredHex) return { valid: false, showInvalidMarker: false, segments: [] };
  if (unit.unitType === 'air') {
    const controller = getHexController(hoveredH3Index);
    if (controller !== HUMAN_PLAYER_ID) {
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

  const passableFor = unit.unitType === 'naval' ? 'water' : 'land';
  const passabilityByH3 = buildNormalizedTerrainByH3(state.hexes);
  const hoveredPassabilityTerrain = passabilityByH3.get(hoveredHex.h3Index) ?? 'land';
  const hoveredPassable = terrainIsPassableForDomain(hoveredPassabilityTerrain, passableFor);
  const [hoverLat, hoverLng] = cellToLatLng(hoveredH3Index);
  const direct = executePlanRoute(unitId, [hoverLat, hoverLng], { avoidEnemies: true }, state, latLngByH3, resolveToH3);
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
      const partial = executePlanRoute(unitId, [nearLat, nearLng], { avoidEnemies: true }, state, latLngByH3, resolveToH3);
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

/**
 * Why this exists:
 *     Produces renderer hover preview model using shared route logic and invalid-marker semantics.
 * When to use:
 *     Renderer pointermove when selected unit/hovered hex changes.
 * What to expect:
 *     Valid route segments when reachable; invalid marker with optional partial route otherwise.
 */
export function previewHumanMarchOrder(unitId: string, hoveredH3Index: string): HumanOrderPreviewResult {
  logTrace('gameActions previewHumanMarchOrder', { unitId, hoveredH3Index });
  try {
    if (!isDbReady()) return { valid: false, showInvalidMarker: false, invalidReason: 'Database not initialized', segments: [] };
    const state = dbBackedStateSnapshot();
    const hexList = state.hexes.map((h) => h.h3Index);
    const { latLngByH3, resolveToH3 } = buildLatLngCoordinateMap(hexList);
    return buildHumanMarchPreviewForUnit(state, latLngByH3, resolveToH3, unitId, hoveredH3Index);
  } catch (err) {
    logError('previewHumanMarchOrder: exception', err);
    return { valid: false, showInvalidMarker: false, invalidReason: String(err), segments: [] };
  }
}

/**
 * Why this exists:
 *     Produces grouped hover previews for multi-selected human units using shared route logic.
 * When to use:
 *     Renderer pointermove while multiple units are selected for grouped movement planning.
 * What to expect:
 *     Per-unit previews plus aggregate validity and slowest movement range cap for solid-segment rendering.
 */
export function previewHumanMarchOrders(unitIds: string[], hoveredH3Index: string): HumanOrderGroupPreviewResult {
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
    const state = dbBackedStateSnapshot();
    const hexList = state.hexes.map((h) => h.h3Index);
    const { latLngByH3, resolveToH3 } = buildLatLngCoordinateMap(hexList);
    const selectedUnits = uniqueUnitIds
      .map((unitId) => state.units.find((u) => u.id === unitId && u.player === HUMAN_PLAYER_ID))
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
      const reason = MIXED_STACK_COASTAL_ONLY_REASON;
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

/**
 * Submits movement and optional ranged attack orders for the current planning phase.
 * Validates all orders; if any human order (movement or ranged) is invalid, rejects the entire batch with a clear reason.
 * Otherwise stores pending_orders and pending_ranged_orders and returns success: true.
 */
export function submitOrders(payload: SubmitOrdersPayload): SubmitOrdersResult {
  const orders = payload.movementOrders ?? [];
  const ranged = payload.rangedAttacks ?? [];
  const airStrikes = payload.airStrikes ?? [];
  const ferryOrders = payload.ferryOrders ?? [];
  logDebug('submitOrders', {
    orderCount: orders.length,
    rangedCount: ranged.length,
    airStrikeCount: airStrikes.length,
    ferryCount: ferryOrders.length,
  });
  try {
    if (!isDbReady()) {
      logError('submitOrders: database not initialized');
      return { success: false, reason: 'Database not initialized' };
    }

    const turnRow = dbGetOne<{ phase: string }>('SELECT phase FROM turn_state WHERE id = 1');
    if (turnRow?.phase !== VALID_PHASE) {
      logError('submitOrders: not in planning phase', turnRow?.phase);
      return { success: false, reason: 'Not in planning phase' };
    }

    const seen = new Set<string>();
    for (const order of orders) {
      if (seen.has(order.unitId)) {
        logError('submitOrders: duplicate unit', order.unitId);
        return { success: false, reason: `Duplicate order for unit ${order.unitId}` };
      }
      seen.add(order.unitId);
      const result = validateOrder(order.unitId, order.toH3Index);
      if (!result.valid) {
        logError('submitOrders: validation failed', order.unitId, order.toH3Index, result.reason);
        return { success: false, reason: result.reason };
      }
    }

    const seenRanged = new Set<string>();
    for (const r of ranged) {
      if (seenRanged.has(r.unitId)) {
        logError('submitOrders: duplicate ranged order for unit', r.unitId);
        return { success: false, reason: `Duplicate ranged order for unit ${r.unitId}` };
      }
      seenRanged.add(r.unitId);
      const result = validateRangedAttack(r.unitId, r.targetH3Index, { allowedPlayer: 'human' });
      if (!result.valid) {
        logError('submitOrders: ranged validation failed', r.unitId, r.targetH3Index, result.reason);
        return { success: false, reason: result.reason };
      }
    }

    const seenAirStrike = new Set<string>();
    for (const s of airStrikes) {
      if (seenAirStrike.has(s.unitId)) {
        return { success: false, reason: `Duplicate strike order for unit ${s.unitId}` };
      }
      seenAirStrike.add(s.unitId);
      const result = validateAirStrikeOrder(s.unitId, s.targetH3Index, s.targetType, { allowedPlayer: HUMAN_PLAYER_ID });
      if (!result.valid) return { success: false, reason: result.reason };
    }

    const seenFerry = new Set<string>();
    for (const f of ferryOrders) {
      if (seenFerry.has(f.unitId)) {
        return { success: false, reason: `Duplicate ferry order for unit ${f.unitId}` };
      }
      seenFerry.add(f.unitId);
      const result = validateFerryOrder(f.unitId, f.destinationH3Index, { allowedPlayer: HUMAN_PLAYER_ID });
      if (!result.valid) return { success: false, reason: result.reason };
    }

    for (const unitId of seenAirStrike) {
      if (seenFerry.has(unitId)) {
        return { success: false, reason: `Air unit ${unitId} cannot strike and ferry in the same turn` };
      }
    }

    dbRun('DELETE FROM pending_orders');
    for (const order of orders) {
      dbRun('INSERT INTO pending_orders (unit_id, to_h3_index) VALUES (?, ?)', [order.unitId, order.toH3Index]);
    }
    dbRun('DELETE FROM pending_ranged_orders');
    for (const r of ranged) {
      dbRun('INSERT INTO pending_ranged_orders (unit_id, target_h3_index) VALUES (?, ?)', [r.unitId, r.targetH3Index]);
    }
    dbRun('DELETE FROM pending_air_orders');
    for (const s of airStrikes) {
      dbRun('INSERT INTO pending_air_orders (unit_id, target_h3_index, target_type) VALUES (?, ?, ?)', [
        s.unitId,
        s.targetH3Index,
        s.targetType,
      ]);
    }
    dbRun('DELETE FROM pending_ferry_orders');
    for (const f of ferryOrders) {
      dbRun('INSERT INTO pending_ferry_orders (unit_id, destination_h3_index) VALUES (?, ?)', [f.unitId, f.destinationH3Index]);
    }
    return { success: true };
  } catch (err) {
    logError('submitOrders: exception', err);
    return { success: false, reason: String(err) };
  }
}

/**
 * Ends the planning phase and resolves all pending orders (human + optional AI) simultaneously:
 * applies movement, runs combat resolution (ranged then melee), removes casualties, clears orders,
 * increments turn number, and sets phase back to planning.
 * Call only when phase is planning. If aiOrders is provided, they are merged with human orders from the DB.
 * aiRangedOrders are merged with human pending_ranged_orders for combat; pass from AI response in Phase 6.
 */
export function ready(
  aiOrders: MovementOrder[] = [],
  aiRangedOrders: RangedAttackOrder[] = [],
  aiAirStrikeOrders: AirStrikeOrder[] = [],
  aiFerryOrders: FerryOrder[] = []
): ReadyResult {
  logDebug('ready', {
    aiOrderCount: aiOrders.length,
    aiRangedCount: aiRangedOrders.length,
    aiAirStrikeCount: aiAirStrikeOrders.length,
    aiFerryCount: aiFerryOrders.length,
  });
  try {
    if (!isDbReady()) {
      logError('ready: database not initialized');
      return { success: false, reason: 'Database not initialized' };
    }

    const turnRow = dbGetOne<{ phase: string; turn_number: number }>(
      'SELECT phase, turn_number FROM turn_state WHERE id = 1'
    );
    if (turnRow?.phase !== VALID_PHASE) {
      logError('ready: not in planning phase', turnRow?.phase);
      return { success: false, reason: 'Not in planning phase' };
    }

    dbRun('UPDATE turn_state SET phase = ? WHERE id = 1', ['resolution']);

    const hexList = getOrderedHexList();
    const unitsBeforeMove = listUnitsForSnapshot();
    const combatUnitsBefore: CombatUnit[] = unitsBeforeMove.map((u) => ({
      id: u.id,
      player: u.player,
      unitType: u.unitType,
      h3Index: u.h3Index,
      displayOrder: u.displayOrder,
    }));

    const humanRanged = dbGetAll<{ unit_id: string; target_h3_index: string }>(
      'SELECT unit_id, target_h3_index FROM pending_ranged_orders ORDER BY unit_id, target_h3_index'
    ).map((r) => ({ unitId: r.unit_id, targetH3Index: r.target_h3_index }));
    const humanAirStrikes = dbGetAll<{ unit_id: string; target_h3_index: string; target_type: AirStrikeTargetType }>(
      'SELECT unit_id, target_h3_index, target_type FROM pending_air_orders ORDER BY unit_id, target_h3_index'
    ).map((r) => ({ unitId: r.unit_id, targetH3Index: r.target_h3_index, targetType: r.target_type }));
    const humanFerryOrders = dbGetAll<{ unit_id: string; destination_h3_index: string }>(
      'SELECT unit_id, destination_h3_index FROM pending_ferry_orders ORDER BY unit_id, destination_h3_index'
    ).map((r) => ({ unitId: r.unit_id, destinationH3Index: r.destination_h3_index }));
    const allAirStrikes = [...humanAirStrikes, ...aiAirStrikeOrders];
    const allFerryOrders = [...humanFerryOrders, ...aiFerryOrders];
    const allRanged = [...humanRanged, ...aiRangedOrders];

    const turnNumber = turnRow?.turn_number ?? 1;
    const gameSeed = getGameSeed();
    // Per-turn seed so the same two units get different dice outcomes each turn; replay stays deterministic for same orders.
    const seed = (gameSeed + turnNumber * 7919) >>> 0;
    const next = createCombatRng(seed);
    logDebug('ready: combat resolution', { turnNumber, gameSeed, combatSeed: seed });

    const airStrikeResult = resolveAirStrikePhase(allAirStrikes, next);
    const rangedInputUnits = listUnitsForSnapshot().map((u) => ({
      id: u.id,
      player: u.player,
      unitType: u.unitType,
      h3Index: u.h3Index,
      displayOrder: u.displayOrder,
    }));
    const rangedResult = runRangedPhase(rangedInputUnits, hexList, allRanged, next);
    for (const id of rangedResult.removedUnitIds) {
      dbRun('DELETE FROM units WHERE id = ?', [id]);
    }

    const humanOrders = dbGetAll<{ unit_id: string; to_h3_index: string }>('SELECT unit_id, to_h3_index FROM pending_orders');
    const preMoveState = dbBackedStateSnapshot();
    const preMoveHexList = preMoveState.hexes.map((h) => h.h3Index);
    const { latLngByH3, resolveToH3 } = buildLatLngCoordinateMap(preMoveHexList);
    const generatedHuman = generateOrdersForStandingOrders(HUMAN_PLAYER_ID, preMoveState, latLngByH3, resolveToH3);
    const mergedHuman = new Map<string, string>();
    for (const o of generatedHuman.movementOrders) mergedHuman.set(o.unitId, o.toH3Index);
    for (const o of humanOrders) mergedHuman.set(o.unit_id, o.to_h3_index);
    const humanMoves = Array.from(mergedHuman.entries())
      .map(([unitId, toH3Index]) => {
        const fromH3Index = unitsBeforeMove.find((u) => u.id === unitId)?.h3Index;
        if (!fromH3Index || fromH3Index === toH3Index) return null;
        return { unitId, fromH3Index, toH3Index };
      })
      .filter((m): m is { unitId: string; fromH3Index: string; toH3Index: string } => m !== null);
    const allOrders = [
      ...Array.from(mergedHuman.entries()).map(([unitId, toH3Index]) => ({ unitId, toH3Index })),
      ...aiOrders,
    ];
    const traversedHexesByPlayer = collectTraversedHexesByPlayer(
      allOrders,
      preMoveState.units.map((u) => ({ id: u.id, player: u.player, h3Index: u.h3Index }))
    );
    for (const order of allOrders) {
      dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [order.toH3Index, order.unitId]);
    }

    const resolvedFerryMoves: FerryAnimationMove[] = [];
    for (const ferry of allFerryOrders) {
      const unit = dbGetOne<{ id: string; player: string; unit_type: string; h3_index: string; display_order: number | null }>(
        'SELECT id, player, unit_type, h3_index, display_order FROM units WHERE id = ?',
        [ferry.unitId]
      );
      if (!unit || unit.unit_type !== 'air') continue;
      const originH3Index = unit.h3_index;
      const withinFerryRange = isWithinGridRangeSafe(originH3Index, ferry.destinationH3Index, AIR_FERRY_RANGE_HEXES, 'ready ferry');
      if (!withinFerryRange) continue;
      const destinationInfra = getRes1InfrastructureForHex(ferry.destinationH3Index);
      const destinationController = getHexController(ferry.destinationH3Index);
      if (destinationInfra.airportCount > 0 && destinationController === unit.player) {
        dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [ferry.destinationH3Index, ferry.unitId]);
        resolvedFerryMoves.push({
          unitId: ferry.unitId,
          player: unit.player,
          fromH3Index: originH3Index,
          toH3Index: ferry.destinationH3Index,
        });
        continue;
      }
      const originInfra = getRes1InfrastructureForHex(originH3Index);
      const originController = getHexController(originH3Index);
      if (!(originInfra.airportCount > 0 && originController === unit.player)) {
        dbRun('DELETE FROM units WHERE id = ?', [ferry.unitId]);
      }
    }

    const unitsAfterMove = listUnitsForSnapshot();
    const rangedRemovedSet = new Set(rangedResult.removedUnitIds);
    // Melee must not see units removed in ranged phase; exclude them explicitly so attackers cannot engage dead defenders.
    const combatUnitsAfter: CombatUnit[] = unitsAfterMove
      .filter((u) => !rangedRemovedSet.has(u.id))
      .map((u) => ({
        id: u.id,
        player: u.player,
        unitType: u.unitType,
        h3Index: u.h3Index,
        displayOrder: u.displayOrder,
      }));

    const meleeResult = runMeleePhase(combatUnitsAfter, hexList, next);
    for (const id of meleeResult.removedUnitIds) {
      dbRun('DELETE FROM units WHERE id = ?', [id]);
    }

    const controlTransitions = resolveRes1ControlAfterCombatAndMovement(traversedHexesByPlayer);
    const baseLossRemovedAir = destroyAirUnitsWithInvalidBase();
    const airStrikeDestroyedFeatures = { urban: 0, airport: 0, seaport: 0 };
    let airStrikeDestroyedBasedAirUnits = 0;
    for (const event of airStrikeResult.infrastructureDestroyedEvents) {
      airStrikeDestroyedFeatures[event.targetType] += 1;
      airStrikeDestroyedBasedAirUnits += event.destroyedAirUnitsCount ?? 0;
    }
    const airStrikeDestroyedUnitsByType = { infantry: 0, armor: 0, naval: 0, air: 0 };
    const airStrikeLostAirUnitIds: string[] = [];
    for (const removed of airStrikeResult.removedUnits) {
      if (removed.unitType === 'infantry') airStrikeDestroyedUnitsByType.infantry += 1;
      else if (removed.unitType === 'armor') airStrikeDestroyedUnitsByType.armor += 1;
      else if (removed.unitType === 'naval') airStrikeDestroyedUnitsByType.naval += 1;
      else if (removed.unitType === 'air') {
        airStrikeDestroyedUnitsByType.air += 1;
        airStrikeLostAirUnitIds.push(removed.id);
      }
    }
    if (airStrikeResult.attemptCount > 0 || baseLossRemovedAir.length > 0) {
      logDebug('ready: airStrikeSummary', {
        attemptCount: airStrikeResult.attemptCount,
        successfulCount: airStrikeResult.successfulCount,
        failedCount: airStrikeResult.failedCount,
        attackerLossCount: airStrikeResult.attackerLossCount,
        destroyedFeatures: airStrikeDestroyedFeatures,
        destroyedBasedAirUnits: airStrikeDestroyedBasedAirUnits,
        destroyedUnitsByType: airStrikeDestroyedUnitsByType,
        airLossUnitIds: [...new Set(airStrikeLostAirUnitIds)],
        strandedAirLossCount: baseLossRemovedAir.length,
        strandedAirLossUnitIds: baseLossRemovedAir.map((unit) => unit.id),
      });
    }
    const productionSummary = processProductionAfterControlResolution();
    const deployedUnitsByType = productionSummary.deployedByPlayer.human;
    const finalUnits = listUnitsForSnapshot();
    const humanHexesLost = controlTransitions.filter(
      (t) => t.fromControllerPlayerId === 'human' && t.toControllerPlayerId === 'opponent'
    );
    const controlLossLightningHexes = humanHexesLost
      .filter((t) => !finalUnits.some((u) => u.player === 'human' && u.h3Index === t.h3Index))
      .map((t) => t.h3Index);

    const humanCount = dbGetAll<{ c: number }>('SELECT COUNT(*) AS c FROM units WHERE player = ?', ['human'])[0]?.c ?? 0;
    const opponentCount = dbGetAll<{ c: number }>('SELECT COUNT(*) AS c FROM units WHERE player = ?', ['opponent'])[0]?.c ?? 0;
    if (humanCount === 0 && opponentCount > 0) setGameOver('opponent');
    else if (opponentCount === 0 && humanCount > 0) setGameOver('human');

    dbRun('DELETE FROM pending_orders');
    dbRun('DELETE FROM pending_ranged_orders');
    dbRun('DELETE FROM pending_air_orders');
    dbRun('DELETE FROM pending_ferry_orders');
    dbRun('UPDATE turn_state SET phase = ?, turn_number = ? WHERE id = 1', [
      'planning',
      turnNumber + 1,
    ]);
    refreshFogOfWarIntelFromCurrentState({
      traversedHexesByPlayer: {
        human: [...traversedHexesByPlayer.human],
        opponent: [...traversedHexesByPlayer.opponent],
      },
    });

    saveDatabase();
    const allRemovedIds = [
      ...airStrikeResult.removedUnitIds,
      ...rangedResult.removedUnitIds,
      ...meleeResult.removedUnitIds,
      ...baseLossRemovedAir.map((u) => u.id),
    ];
    const allRemovedUnits = [...airStrikeResult.removedUnits, ...rangedResult.removedUnits, ...meleeResult.removedUnits, ...baseLossRemovedAir];
    const allKills = [...rangedResult.kills, ...meleeResult.kills];
    const allCombatHexes = [...rangedResult.combatHexes, ...meleeResult.combatHexes];
    const allCasualtyHexes = [
      ...airStrikeResult.casualtyHexes,
      ...rangedResult.casualtyHexes,
      ...meleeResult.casualtyHexes,
      ...baseLossRemovedAir.map((u) => u.h3Index),
    ];

    const opponentRangedAttackers = aiRangedOrders.map((o) => o.unitId);
    const defenderHexes = new Set(allRanged.map((o) => o.targetH3Index));
    const opponentRangedDefenders = combatUnitsBefore
      .filter((u) => u.player === 'opponent' && defenderHexes.has(u.h3Index))
      .map((u) => u.id);
    const meleeHexSet = new Set(meleeResult.combatHexes);
    const opponentMeleeParticipants = combatUnitsAfter
      .filter((u) => u.player === 'opponent' && meleeHexSet.has(u.h3Index))
      .map((u) => u.id);
    const opponentCombatParticipantUnitIds = [
      ...new Set([...opponentRangedAttackers, ...opponentRangedDefenders, ...opponentMeleeParticipants]),
    ];
    const removedOpponentUnitIds = allRemovedUnits.filter((u) => u.player === 'opponent').map((u) => u.id);
    addAiLossEventsSinceConsultation(
      'opponent',
      turnNumber,
      allRemovedUnits.map((u) => ({ id: u.id, player: u.player })),
      allKills,
      rangedResult.killsByDirectFire,
      rangedResult.killsByReturnFire
    );

    return {
      success: true,
      combatHexes: allCombatHexes.length > 0 ? allCombatHexes : undefined,
      removedUnitIds: allRemovedIds.length > 0 ? allRemovedIds : undefined,
      casualtyHexes: allCasualtyHexes.length > 0 ? allCasualtyHexes : undefined,
      removedUnits: allRemovedUnits.length > 0 ? allRemovedUnits : undefined,
      kills: allKills.length > 0 ? allKills : undefined,
      killsByDirectFire: rangedResult.killsByDirectFire?.length ? rangedResult.killsByDirectFire : undefined,
      killsByReturnFire: rangedResult.killsByReturnFire?.length ? rangedResult.killsByReturnFire : undefined,
      rangedCombatHexes: rangedResult.combatHexes.length > 0 ? rangedResult.combatHexes : undefined,
      rangedCasualtyHexes: rangedResult.casualtyHexes.length > 0 ? rangedResult.casualtyHexes : undefined,
      rangedRemovedUnits: rangedResult.removedUnits.length > 0 ? rangedResult.removedUnits : undefined,
      airStrikeHexes: airStrikeResult.strikeHexes.length > 0 ? airStrikeResult.strikeHexes : undefined,
      airStrikeCasualtyHexes: airStrikeResult.casualtyHexes.length > 0 ? airStrikeResult.casualtyHexes : undefined,
      airStrikeRemovedUnits: airStrikeResult.removedUnits.length > 0 ? airStrikeResult.removedUnits : undefined,
      airStrikeMoves: airStrikeResult.strikeMoves.length > 0 ? airStrikeResult.strikeMoves : undefined,
      airStrikeAttemptCount: airStrikeResult.attemptCount > 0 ? airStrikeResult.attemptCount : undefined,
      airStrikeSuccessfulCount: airStrikeResult.successfulCount > 0 ? airStrikeResult.successfulCount : undefined,
      airStrikeFailedCount: airStrikeResult.failedCount > 0 ? airStrikeResult.failedCount : undefined,
      airStrikeAttackerLossCount: airStrikeResult.attackerLossCount > 0 ? airStrikeResult.attackerLossCount : undefined,
      baseInvalidAirLossCount: baseLossRemovedAir.length > 0 ? baseLossRemovedAir.length : undefined,
      infrastructureDestroyedEvents:
        airStrikeResult.infrastructureDestroyedEvents.length > 0 ? airStrikeResult.infrastructureDestroyedEvents : undefined,
      resolvedFerryMoves: resolvedFerryMoves.length > 0 ? resolvedFerryMoves : undefined,
      meleeCombatHexes: meleeResult.combatHexes.length > 0 ? meleeResult.combatHexes : undefined,
      meleeCasualtyHexes: meleeResult.casualtyHexes.length > 0 ? meleeResult.casualtyHexes : undefined,
      meleeRemovedUnits: meleeResult.removedUnits.length > 0 ? meleeResult.removedUnits : undefined,
      humanMoves: humanMoves.length > 0 ? humanMoves : undefined,
      deployedUnitsByType: Object.keys(deployedUnitsByType).length > 0 ? deployedUnitsByType : undefined,
      humanHexesLostCount: humanHexesLost.length > 0 ? humanHexesLost.length : undefined,
      controlLossLightningHexes: controlLossLightningHexes.length > 0 ? controlLossLightningHexes : undefined,
      humanDeploymentCapReachedUnitTypes:
        productionSummary.capReachedByPlayer.human.length > 0 ? productionSummary.capReachedByPlayer.human : undefined,
      opponentDeploymentCapReachedUnitTypes:
        productionSummary.capReachedByPlayer.opponent.length > 0 ? productionSummary.capReachedByPlayer.opponent : undefined,
      opponentCombatParticipantUnitIds,
      removedOpponentUnitIds,
    };
  } catch (err) {
    logError('ready: exception', err);
    return { success: false, reason: String(err) };
  }
}
