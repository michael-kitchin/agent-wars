/**
 * WEGO turn actions: validate movement orders, submit orders, and resolve the turn.
 * All logic runs in the main process and uses the game database.
 */

import { gridDistance } from 'h3-js';
import { dbGetOne, dbRun, dbGetAll, isDbReady, saveDatabase, getGameSeed, setGameOver, getMapSize, getMapHexSet } from './gameDb';
import { getOrderedHexList } from './mapData';
import { getRange } from './combatConstants';
import { runRangedPhase, runMeleePhase, createCombatRng, type CombatUnit } from './combatResolution';
import { logDebug, logError } from './logger';

export interface MovementOrder {
  unitId: string;
  toH3Index: string;
}

/** Ranged attack declaration: one target hex per unit per turn. */
export interface RangedAttackOrder {
  unitId: string;
  targetH3Index: string;
}

export interface SubmitOrdersResult {
  success: boolean;
  reason?: string;
}

const VALID_PHASE = 'planning';

/** Movement range in hexes per turn by unit type. Infantry 1, armor 2, naval 2. */
const MOVEMENT_RANGE: Record<string, number> = {
  infantry: 1,
  armor: 2,
  naval: 2,
};

/**
 * Validates a single movement order: unit exists and is human-owned, destination is on map,
 * within unit's movement range, and terrain allows the unit type (naval→water, infantry/armor→land).
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
  if (unit.unit_type === 'naval' && terrain !== 'water') return { valid: false, reason: 'Naval units must move to water' };
  if ((unit.unit_type === 'infantry' || unit.unit_type === 'armor') && terrain !== 'land') {
    return { valid: false, reason: 'Land units must move to land' };
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

/** Payload for submitOrders: movement and optional ranged attacks. Human batch rejected if any order is invalid. */
export interface SubmitOrdersPayload {
  movementOrders: MovementOrder[];
  rangedAttacks?: RangedAttackOrder[];
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
  rangedCombatHexes?: string[];
  rangedCasualtyHexes?: string[];
  rangedRemovedUnits?: { id: string; player: string; unitType: string; h3Index: string }[];
  meleeCombatHexes?: string[];
  meleeCasualtyHexes?: string[];
  meleeRemovedUnits?: { id: string; player: string; unitType: string; h3Index: string }[];
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

    const hexList = getOrderedHexList(getMapSize());
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
    const allOrders = [
      ...humanOrders.map((o) => ({ unitId: o.unit_id, toH3Index: o.to_h3_index })),
      ...aiOrders,
    ];
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

    saveDatabase();
    const allRemovedIds = [...rangedResult.removedUnitIds, ...meleeResult.removedUnitIds];
    const allRemovedUnits = [...rangedResult.removedUnits, ...meleeResult.removedUnits];
    const allKills = [...rangedResult.kills, ...meleeResult.kills];
    const allCombatHexes = [...rangedResult.combatHexes, ...meleeResult.combatHexes];
    const allCasualtyHexes = [...rangedResult.casualtyHexes, ...meleeResult.casualtyHexes];
    return {
      success: true,
      combatHexes: allCombatHexes.length > 0 ? allCombatHexes : undefined,
      removedUnitIds: allRemovedIds.length > 0 ? allRemovedIds : undefined,
      casualtyHexes: allCasualtyHexes.length > 0 ? allCasualtyHexes : undefined,
      removedUnits: allRemovedUnits.length > 0 ? allRemovedUnits : undefined,
      kills: allKills.length > 0 ? allKills : undefined,
      rangedCombatHexes: rangedResult.combatHexes.length > 0 ? rangedResult.combatHexes : undefined,
      rangedCasualtyHexes: rangedResult.casualtyHexes.length > 0 ? rangedResult.casualtyHexes : undefined,
      rangedRemovedUnits: rangedResult.removedUnits.length > 0 ? rangedResult.removedUnits : undefined,
      meleeCombatHexes: meleeResult.combatHexes.length > 0 ? meleeResult.combatHexes : undefined,
      meleeCasualtyHexes: meleeResult.casualtyHexes.length > 0 ? meleeResult.casualtyHexes : undefined,
      meleeRemovedUnits: meleeResult.removedUnits.length > 0 ? meleeResult.removedUnits : undefined,
    };
  } catch (err) {
    logError('ready: exception', err);
    return { success: false, reason: String(err) };
  }
}
