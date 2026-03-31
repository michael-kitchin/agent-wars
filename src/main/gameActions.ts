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
} from './gameDb';
import { buildLatLngCoordinateMap, getOrderedHexList } from './mapData';
import { getRange } from './combatConstants';
import { runRangedPhase, runMeleePhase, createCombatRng, type CombatUnit } from './combatResolution';
import { logDebug, logError, logTrace } from './logger';
import type { MovementOrder, RangedAttackOrder, SubmitOrdersPayload } from '../shared/ipcTypes';
import { passabilityAllowsLandUnit, passabilityAllowsNavalUnit } from '../shared/pipelineTerrain';
import { executePlanRoute } from './tools/tool1Pathfinding';
import { terrainIsPassableForDomain } from './pathfinding';
import {
  assignHumanMarchStandingOrder,
  cancelHumanStandingOrder,
  generateOrdersForStandingOrders,
  queryHumanStandingOrders,
} from './tools/tool5StandingOrders';
import {
  applyProduction,
  BUILD_ENTRY_MAX_COUNT,
  BUILD_ENTRY_MIN_COUNT,
  getAvailableBuildUnitTypes,
  isValidBuildCount,
  NO_URBAN_BUILD_REASON,
  type BuildUnitType,
} from './productionRules';
import { getRes1ProductionContext } from './terrainClassificationCache';

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
  portCount: number;
  availableUnitTypes: BuildUnitType[];
  buildSectionVisible: boolean;
  noBuildReason: string | null;
  entries: HexBuildQueueEntryView[];
}

const VALID_PHASE = 'planning';
const HUMAN_PLAYER_ID = 'human';

/** Movement range in hexes per turn by unit type. Infantry 1, armor 2, naval 2. */
const MOVEMENT_RANGE: Record<string, number> = {
  infantry: 1,
  armor: 2,
  naval: 2,
};

function currentPlanningTurnNumber(): number {
  return dbGetOne<{ turnNumber: number }>('SELECT turn_number AS turnNumber FROM turn_state WHERE id = 1')?.turnNumber ?? 1;
}

function buildQueueViewForRequester(h3Index: string, requestingPlayerId: string): HexBuildQueueView {
  const controllerPlayerId = getHexController(h3Index);
  const controlledByRequester = controllerPlayerId === requestingPlayerId;
  const { urbanHexCount, portCount } = getRes1ProductionContext({ h3Index });
  const availableUnitTypes = getAvailableBuildUnitTypes(urbanHexCount, portCount);
  const buildSectionVisible = urbanHexCount > 0;
  return {
    h3Index,
    controllerPlayerId,
    controlledByRequester,
    urbanHexCount,
    portCount,
    availableUnitTypes,
    buildSectionVisible,
    noBuildReason: buildSectionVisible ? null : NO_URBAN_BUILD_REASON,
    entries: listBuildQueueRowsForHex(h3Index).map((row) => ({
      id: row.id,
      queueIndex: row.queueIndex,
      unitType: row.unitType,
      count: row.remainingCount,
    })),
  };
}

function resolveRes1ControlAfterCombatAndMovement(): void {
  logDebug('gameActions resolveRes1ControlAfterCombatAndMovement');
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
  ]);
  for (const h3Index of allHexes) {
    const occupied = occupancyByHex.get(h3Index);
    if (!occupied) {
      continue;
    }
    if (occupied.distinctPlayers >= 2) {
      continue;
    }
    if (!occupied.solePlayer) {
      continue;
    }
    const currentController = currentControlByHex.get(h3Index) ?? null;
    if (currentController === occupied.solePlayer) {
      continue;
    }
    setHexController(h3Index, occupied.solePlayer);
    if (currentController !== null && currentController !== occupied.solePlayer) {
      clearBuildQueueAndProgressForHex(h3Index);
    }
  }
}

function spawnProducedUnitsForHex(h3Index: string, controllerPlayerId: string, unitTypes: BuildUnitType[]): void {
  if (unitTypes.length === 0) return;
  const turnNumber = currentPlanningTurnNumber();
  const seqRow = dbGetOne<{ value: string }>("SELECT value FROM game_config WHERE key = 'production_unit_spawn_sequence'");
  let sequence = seqRow ? parseInt(seqRow.value, 10) : 0;
  if (!Number.isFinite(sequence)) sequence = 0;
  for (const unitType of unitTypes) {
    sequence += 1;
    const unitId = `${controllerPlayerId}-${unitType}-prod-${turnNumber}-${sequence}`;
    dbRun('INSERT INTO units (id, player, unit_type, h3_index) VALUES (?, ?, ?, ?)', [
      unitId,
      controllerPlayerId,
      unitType,
      h3Index,
    ]);
  }
  dbRun(`INSERT OR REPLACE INTO game_config (key, value) VALUES ('production_unit_spawn_sequence', ?)`, [String(sequence)]);
}

function processProductionAfterControlResolution(): void {
  logDebug('gameActions processProductionAfterControlResolution');
  const controls = listAllHexControls().filter((row) => row.controllerPlayerId !== null);
  for (const control of controls) {
    const controllerPlayerId = control.controllerPlayerId;
    if (!controllerPlayerId) continue;
    const queueRows = listBuildQueueRowsForHex(control.h3Index);
    if (queueRows.length === 0) continue;
    const { urbanHexCount } = getRes1ProductionContext({ h3Index: control.h3Index });
    if (urbanHexCount <= 0) continue;
    const storedPoints = getBuildProgressPointsForHex(control.h3Index);
    const applyResult = applyProduction(
      queueRows.map((row) => ({
        id: row.id,
        queueIndex: row.queueIndex,
        unitType: row.unitType,
        remainingCount: row.remainingCount,
      })),
      storedPoints,
      urbanHexCount
    );
    replaceBuildQueueForHex(
      control.h3Index,
      applyResult.updatedEntries.map((entry) => ({ unitType: entry.unitType, remainingCount: entry.remainingCount }))
    );
    setBuildProgressPointsForHex(control.h3Index, applyResult.storedPoints);
    spawnProducedUnitsForHex(control.h3Index, controllerPlayerId, applyResult.spawnedUnitTypes);
    logDebug('gameActions processProductionAfterControlResolution: processed hex', {
      h3Index: control.h3Index,
      controllerPlayerId,
      urbanHexCount,
      queueBeforeCount: queueRows.length,
      queueAfterCount: applyResult.updatedEntries.length,
      storedPointsAfter: applyResult.storedPoints,
      spawnedCount: applyResult.spawnedUnitTypes.length,
    });
  }
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
 * within unit's movement range, and terrain allows the unit type (naval→water/coastal/wetlands, infantry/armor→land/coastal/wetlands).
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
  const range = MOVEMENT_RANGE[unit.unit_type] ?? 1;
  if (dist > range) return { valid: false, reason: `${unit.unit_type} can move at most ${range} hex(es)` };
  /* dist === 0 (same hex) is allowed: "hold" / no move is valid. */

  const destTerrain = dbGetOne<{ terrain: string }>('SELECT terrain FROM hexes WHERE h3_index = ?', [toH3Index]);
  const terrain = destTerrain?.terrain ?? 'land';
  if (unit.unit_type === 'naval' && !passabilityAllowsNavalUnit(terrain)) {
    return { valid: false, reason: 'Naval units must move to water, coastal, or wetlands hexes' };
  }
  if ((unit.unit_type === 'infantry' || unit.unit_type === 'armor') && !passabilityAllowsLandUnit(terrain)) {
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
  if (range < 1) return { valid: false, reason: `${unit.unit_type} has no ranged attack (melee only)` };

  if (!getMapHexSet().has(targetH3Index)) return { valid: false, reason: 'Target hex not on map' };

  let dist: number;
  try {
    dist = gridDistance(unit.h3_index, targetH3Index);
  } catch {
    return { valid: false, reason: 'Invalid hex or distance' };
  }
  if (dist > range) return { valid: false, reason: `Target out of range (${unit.unit_type} range ${range})` };

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
    const mapHexes = new Set(state.hexes.map((h) => h.h3Index));
    if (!mapHexes.has(destinationH3Index)) return { success: false, reason: 'Destination not on map' };
    const [lat, lng] = cellToLatLng(destinationH3Index);
    const hexList = state.hexes.map((h) => h.h3Index);
    const { latLngByH3, resolveToH3 } = buildLatLngCoordinateMap(hexList);
    const result = assignHumanMarchStandingOrder(unitId, [lat, lng], state, latLngByH3, resolveToH3) as {
      status: string;
      error?: string;
    };
    if (result.status !== 'ok') return { success: false, reason: result.error ?? 'Failed to assign order' };
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
    const uniqueUnitIds = [...new Set(unitIds.filter((id) => id.length > 0))];
    if (uniqueUnitIds.length === 0) return { success: false, reason: 'No selected units to assign' };

    const groupPreview = previewHumanMarchOrders(uniqueUnitIds, destinationH3Index);
    if (!groupPreview.validForAll) {
      return { success: false, reason: groupPreview.invalidReason ?? 'At least one selected unit cannot reach destination.' };
    }

    for (const unitId of uniqueUnitIds) {
      const result = assignHumanMarchOrder(unitId, destinationH3Index);
      if (!result.success) {
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
    const uniqueUnitIds = [...new Set(unitIds.filter((id) => id.length > 0))];
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
    const phase = dbGetOne<{ phase: string }>('SELECT phase FROM turn_state WHERE id = 1')?.phase ?? 'planning';
    if (phase !== VALID_PHASE) return { success: false, reason: 'Build queue can only be edited during planning phase.' };
    const queueView = buildQueueViewForRequester(h3Index, requestingPlayerId);
    if (!queueView.controlledByRequester) {
      return { success: false, reason: 'Only the controlling player can edit this build queue.' };
    }
    if (!queueView.buildSectionVisible) return { success: false, reason: queueView.noBuildReason ?? NO_URBAN_BUILD_REASON };
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
    const phase = dbGetOne<{ phase: string }>('SELECT phase FROM turn_state WHERE id = 1')?.phase ?? 'planning';
    if (phase !== VALID_PHASE) return { success: false, reason: 'Build queue can only be edited during planning phase.' };
    const queueView = buildQueueViewForRequester(h3Index, requestingPlayerId);
    if (!queueView.controlledByRequester) {
      return { success: false, reason: 'Only the controlling player can edit this build queue.' };
    }
    if (!queueView.buildSectionVisible) return { success: false, reason: queueView.noBuildReason ?? NO_URBAN_BUILD_REASON };
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
    const phase = dbGetOne<{ phase: string }>('SELECT phase FROM turn_state WHERE id = 1')?.phase ?? 'planning';
    if (phase !== VALID_PHASE) return { success: false, reason: 'Build queue can only be edited during planning phase.' };
    const queueView = buildQueueViewForRequester(h3Index, requestingPlayerId);
    if (!queueView.controlledByRequester) {
      return { success: false, reason: 'Only the controlling player can edit this build queue.' };
    }
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

  const passableFor = unit.unitType === 'naval' ? 'water' : 'land';
  const hoveredPassable = terrainIsPassableForDomain(hoveredHex.terrain, passableFor);
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
      return !!hx && terrainIsPassableForDomain(hx.terrain, passableFor);
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
    const uniqueUnitIds = [...new Set(unitIds.filter((id) => id.length > 0))];
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
    const previews: HumanOrderGroupPreviewUnitResult[] = uniqueUnitIds.map((unitId) => ({
      unitId,
      preview: buildHumanMarchPreviewForUnit(state, latLngByH3, resolveToH3, unitId, hoveredH3Index),
    }));
    const invalid = previews.find((entry) => !entry.preview.valid);
    const selectedUnits = uniqueUnitIds
      .map((unitId) => state.units.find((u) => u.id === unitId && u.player === HUMAN_PLAYER_ID))
      .filter((unit): unit is { id: string; player: string; unitType: string; h3Index: string } => !!unit);
    const slowestMovementRange =
      selectedUnits.length > 0
        ? Math.min(...selectedUnits.map((unit) => MOVEMENT_RANGE[unit.unitType] ?? 1))
        : 0;
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
  logDebug('submitOrders', { orderCount: orders.length, rangedCount: ranged.length });
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

    dbRun('DELETE FROM pending_orders');
    for (const order of orders) {
      dbRun('INSERT INTO pending_orders (unit_id, to_h3_index) VALUES (?, ?)', [order.unitId, order.toH3Index]);
    }
    dbRun('DELETE FROM pending_ranged_orders');
    for (const r of ranged) {
      dbRun('INSERT INTO pending_ranged_orders (unit_id, target_h3_index) VALUES (?, ?)', [r.unitId, r.targetH3Index]);
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
  aiRangedOrders: RangedAttackOrder[] = []
): SubmitOrdersResult & {
  combatHexes?: string[];
  removedUnitIds?: string[];
  casualtyHexes?: string[];
  removedUnits?: { id: string; player: string; unitType: string; h3Index: string }[];
  kills?: { victimId: string; killerIds: string[] }[];
  /** Ranged: defenders killed by attackers (direct fire). For status toast bullets. */
  killsByDirectFire?: { victimId: string; killerIds: string[] }[];
  /** Ranged: attackers killed by defenders (return fire). For status toast bullets. */
  killsByReturnFire?: { victimId: string; killerIds: string[] }[];
  rangedCombatHexes?: string[];
  rangedCasualtyHexes?: string[];
  rangedRemovedUnits?: { id: string; player: string; unitType: string; h3Index: string }[];
  meleeCombatHexes?: string[];
  meleeCasualtyHexes?: string[];
  meleeRemovedUnits?: { id: string; player: string; unitType: string; h3Index: string }[];
  /** Opponent unit IDs that participated in combat this resolution (for callback evaluation). */
  opponentCombatParticipantUnitIds?: string[];
  /** Opponent unit IDs that were removed this resolution. */
  removedOpponentUnitIds?: string[];
  /** Human unit moves resolved this turn (for renderer animation). */
  humanMoves?: { unitId: string; fromH3Index: string; toH3Index: string }[];
} {
  logDebug('ready', { aiOrderCount: aiOrders.length, aiRangedCount: aiRangedOrders.length });
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
    const unitsBeforeMove = dbGetAll<{ id: string; player: string; unit_type: string; h3_index: string }>(
      'SELECT id, player, unit_type, h3_index FROM units'
    ).map((r) => ({ id: r.id, player: r.player, unitType: r.unit_type, h3Index: r.h3_index }));
    const combatUnitsBefore: CombatUnit[] = unitsBeforeMove.map((u) => ({
      id: u.id,
      player: u.player,
      unitType: u.unitType,
      h3Index: u.h3Index,
    }));

    const humanRanged = dbGetAll<{ unit_id: string; target_h3_index: string }>(
      'SELECT unit_id, target_h3_index FROM pending_ranged_orders ORDER BY unit_id, target_h3_index'
    ).map((r) => ({ unitId: r.unit_id, targetH3Index: r.target_h3_index }));
    const allRanged = [...humanRanged, ...aiRangedOrders];

    const turnNumber = turnRow?.turn_number ?? 1;
    const gameSeed = getGameSeed();
    // Per-turn seed so the same two units get different dice outcomes each turn; replay stays deterministic for same orders.
    const seed = (gameSeed + turnNumber * 7919) >>> 0;
    const next = createCombatRng(seed);
    logDebug('ready: combat resolution', { turnNumber, gameSeed, combatSeed: seed });

    const rangedResult = runRangedPhase(combatUnitsBefore, hexList, allRanged, next);
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

    const unitsAfterMove = dbGetAll<{ id: string; player: string; unit_type: string; h3_index: string }>(
      'SELECT id, player, unit_type, h3_index FROM units'
    ).map((r) => ({ id: r.id, player: r.player, unitType: r.unit_type, h3Index: r.h3_index }));
    const rangedRemovedSet = new Set(rangedResult.removedUnitIds);
    // Melee must not see units removed in ranged phase; exclude them explicitly so attackers cannot engage dead defenders.
    const combatUnitsAfter: CombatUnit[] = unitsAfterMove
      .filter((u) => !rangedRemovedSet.has(u.id))
      .map((u) => ({
        id: u.id,
        player: u.player,
        unitType: u.unitType,
        h3Index: u.h3Index,
      }));

    const meleeResult = runMeleePhase(combatUnitsAfter, hexList, next);
    for (const id of meleeResult.removedUnitIds) {
      dbRun('DELETE FROM units WHERE id = ?', [id]);
    }

    resolveRes1ControlAfterCombatAndMovement();
    processProductionAfterControlResolution();

    const humanCount = dbGetAll<{ c: number }>('SELECT COUNT(*) AS c FROM units WHERE player = ?', ['human'])[0]?.c ?? 0;
    const opponentCount = dbGetAll<{ c: number }>('SELECT COUNT(*) AS c FROM units WHERE player = ?', ['opponent'])[0]?.c ?? 0;
    if (humanCount === 0 && opponentCount > 0) setGameOver('opponent');
    else if (opponentCount === 0 && humanCount > 0) setGameOver('human');

    dbRun('DELETE FROM pending_orders');
    dbRun('DELETE FROM pending_ranged_orders');
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
    const allRemovedIds = [...rangedResult.removedUnitIds, ...meleeResult.removedUnitIds];
    const allRemovedUnits = [...rangedResult.removedUnits, ...meleeResult.removedUnits];
    const allKills = [...rangedResult.kills, ...meleeResult.kills];
    const allCombatHexes = [...rangedResult.combatHexes, ...meleeResult.combatHexes];
    const allCasualtyHexes = [...rangedResult.casualtyHexes, ...meleeResult.casualtyHexes];

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
      meleeCombatHexes: meleeResult.combatHexes.length > 0 ? meleeResult.combatHexes : undefined,
      meleeCasualtyHexes: meleeResult.casualtyHexes.length > 0 ? meleeResult.casualtyHexes : undefined,
      meleeRemovedUnits: meleeResult.removedUnits.length > 0 ? meleeResult.removedUnits : undefined,
      humanMoves: humanMoves.length > 0 ? humanMoves : undefined,
      opponentCombatParticipantUnitIds,
      removedOpponentUnitIds,
    };
  } catch (err) {
    logError('ready: exception', err);
    return { success: false, reason: String(err) };
  }
}
