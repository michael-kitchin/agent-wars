import { logDebug, logError, logTrace } from '../logger';
import type { KillEdge } from '../../shared/ipc/combatResultTypes';
import type { MissileLaunchOrder } from '../../shared/ipc/missileTypes';
import type { AirStrikeOrder, EmbarkOrder, FerryOrder, MovementOrder, RangedAttackOrder } from '../../shared/ipcTypes';
import type { AiSeatId } from '../../shared/seatIds';
import type { GuardedDbOps } from './dbOps';

/**
 * Config key for one seat's tool-limit flag.
 *
 * Purpose: Each commander has its own flag so one seat's overflow does not mark the others.
 * When to use: Reading or writing `ai_tool_limit_exceeded_last_turn_<seatId>`.
 * Expected outcome: A `game_config` key that includes the seat id.
 * Exceptions: None.
 */
function toolLimitKey(seatId: AiSeatId): string {
  return `ai_tool_limit_exceeded_last_turn_${seatId}`;
}

/**
 * Config key for one seat's last consultation turn.
 *
 * Purpose: Each commander records the turn it last planned, separately from the others.
 * When to use: Reading or writing `ai_last_consultation_turn_<seatId>`.
 * Expected outcome: A `game_config` key that includes the seat id.
 * Exceptions: None.
 */
function lastConsultationKey(seatId: AiSeatId): string {
  return `ai_last_consultation_turn_${seatId}`;
}

/**
 * Documents the `AiLossEventSinceConsultation` interface as a named contract surface (export interface AiLossEventSinceConsultation).

 * Purpose: Supports maintainability by documenting why `AiLossEventSinceConsultation` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface AiLossEventSinceConsultation {
    /**
   * Specifies the contract for the `turnNumber` member (turnNumber: number;).

   * Contract: Describes stable behavior for callers of `turnNumber` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
turnNumber: number;
    /**
   * Specifies the contract for the `victimUnitId` member (victimUnitId: string;).

   * Contract: Describes stable behavior for callers of `victimUnitId` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
victimUnitId: string;
    /**
   * Specifies the contract for the `victimPlayer` member (victimPlayer: string;).

   * Contract: Describes stable behavior for callers of `victimPlayer` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
victimPlayer: string;
    /**
   * Specifies the contract for the `cause` member (cause: 'direct_fire' | 'return_fire' | 'melee_or_other';).

   * Contract: Describes stable behavior for callers of `cause` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
cause: 'direct_fire' | 'return_fire' | 'melee_or_other';
    /**
   * Specifies the contract for the `killerIds` member (killerIds: string[];).

   * Contract: Describes stable behavior for callers of `killerIds` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
killerIds: string[];
}

/**
 * Documents the `AiPendingOrdersExtraPayload` interface as a named contract surface (interface AiPendingOrdersExtraPayload).

 * Purpose: Supports maintainability by documenting why `AiPendingOrdersExtraPayload` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface AiPendingOrdersExtraPayload {
    /**
   * Specifies the contract for the `airStrikeOrders` member (airStrikeOrders: AirStrikeOrder[];).

   * Contract: Describes stable behavior for callers of `airStrikeOrders` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
airStrikeOrders: AirStrikeOrder[];
    /**
   * Specifies the contract for the `ferryOrders` member (ferryOrders: FerryOrder[];).

   * Contract: Describes stable behavior for callers of `ferryOrders` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
ferryOrders: FerryOrder[];
    /**
   * Specifies the contract for the `embarkOrders` member (embarkOrders: EmbarkOrder[];).

   * Contract: Describes stable behavior for callers of `embarkOrders` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
embarkOrders: EmbarkOrder[];
  /**
   * Missile launches stored with the other extra orders.
   *
   * Contract: Missing JSON becomes an empty list. Each row is one missile and one H3 target.
   * When to use: Decode and encode of `strategy_text`.
   * Expected outcome: Round-trips with the movement and ranged columns.
   * Exceptions: None.
   */
  missileLaunchOrders: MissileLaunchOrder[];
}

/**
 * Every order list stored for one commander's next turn.
 *
 * Purpose: `setAiPendingOrders` takes one object so a new list does not add another positional argument.
 * When to use: Writing and reading `ai_pending_orders`.
 * Expected outcome: Movement and ranged fire are their own columns. The other lists share `strategy_text`.
 * Exceptions: None.
 */
export interface AiPendingOrderSet {
  /**
   * Movement orders for the seat.
   *
   * Contract: May be empty. Each row names a unit and a destination hex.
   * When to use: The movement column.
   * Expected outcome: Stored as JSON in `movement_orders`.
   * Exceptions: None.
   */
  readonly movementOrders: readonly MovementOrder[];
  /**
   * Ranged attacks for the seat.
   *
   * Contract: May be empty.
   * When to use: The ranged column.
   * Expected outcome: Stored as JSON in `ranged_orders`.
   * Exceptions: None.
   */
  readonly rangedOrders: readonly RangedAttackOrder[];
  /**
   * Air strikes for the seat.
   *
   * Contract: May be empty.
   * When to use: The extra payload.
   * Expected outcome: Stored inside `strategy_text`.
   * Exceptions: None.
   */
  readonly airStrikeOrders: readonly AirStrikeOrder[];
  /**
   * Ferry orders for the seat.
   *
   * Contract: May be empty.
   * When to use: The extra payload.
   * Expected outcome: Stored inside `strategy_text`.
   * Exceptions: None.
   */
  readonly ferryOrders: readonly FerryOrder[];
  /**
   * Embark orders for the seat.
   *
   * Contract: May be empty.
   * When to use: The extra payload.
   * Expected outcome: Stored inside `strategy_text`.
   * Exceptions: None.
   */
  readonly embarkOrders: readonly EmbarkOrder[];
  /**
   * Missile launches for the seat.
   *
   * Contract: May be empty. A missing stored array decodes as empty.
   * When to use: The extra payload.
   * Expected outcome: Stored inside `strategy_text` and returned with the other lists.
   * Exceptions: None.
   */
  readonly missileLaunchOrders: readonly MissileLaunchOrder[];
}

/**
 * Documents the `AiStateDbOps` type alias (type AiStateDbOps).

 * Purpose: Supports maintainability by documenting why `AiStateDbOps` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
type AiStateDbOps = GuardedDbOps;

/**
 * Defines the `coerceAiPendingOrdersExtraPayload` function shape (function coerceAiPendingOrdersExtraPayload(value: unknown): AiPendingOrdersExtraPayload).

 * Purpose: Supports maintainability by documenting why `coerceAiPendingOrdersExtraPayload` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function coerceAiPendingOrdersExtraPayload(value: unknown): AiPendingOrdersExtraPayload {
  const payload = value as {
    airStrikeOrders?: unknown;
    ferryOrders?: unknown;
    embarkOrders?: unknown;
    missileLaunchOrders?: unknown;
  } | null;
  const airStrikeOrders = Array.isArray(payload?.airStrikeOrders) ? (payload.airStrikeOrders as AirStrikeOrder[]) : [];
  const ferryOrders = Array.isArray(payload?.ferryOrders) ? (payload.ferryOrders as FerryOrder[]) : [];
  const embarkOrders = Array.isArray(payload?.embarkOrders) ? (payload.embarkOrders as EmbarkOrder[]) : [];
  const missileLaunchOrders = Array.isArray(payload?.missileLaunchOrders)
    ? (payload.missileLaunchOrders as MissileLaunchOrder[])
    : [];
  return { airStrikeOrders, ferryOrders, embarkOrders, missileLaunchOrders };
}

/**
 * Defines the `decodeAiPendingOrdersExtra` function shape (function decodeAiPendingOrdersExtra(strategyText: string | null): AiPendingOrdersExtraPayload).

 * Purpose: Supports maintainability by documenting why `decodeAiPendingOrdersExtra` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function decodeAiPendingOrdersExtra(strategyText: string | null): AiPendingOrdersExtraPayload {
  if (typeof strategyText !== 'string' || strategyText.trim().length === 0) {
    return { airStrikeOrders: [], ferryOrders: [], embarkOrders: [], missileLaunchOrders: [] };
  }
  try {
    return coerceAiPendingOrdersExtraPayload(JSON.parse(strategyText));
  } catch (err) {
    logError('gameDb decodeAiPendingOrdersExtra: failed to parse pending-order extra payload', err);
    return { airStrikeOrders: [], ferryOrders: [], embarkOrders: [], missileLaunchOrders: [] };
  }
}

/**
 * Defines the `encodeAiPendingOrdersExtra` function shape (function encodeAiPendingOrdersExtra(payload: AiPendingOrdersExtraPayload): string).

 * Purpose: Supports maintainability by documenting why `encodeAiPendingOrdersExtra` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function encodeAiPendingOrdersExtra(payload: AiPendingOrdersExtraPayload): string {
  return JSON.stringify(payload);
}

/**
 * Defines the `setAiToolLimitExceededLastTurn` function shape (export function setAiToolLimitExceededLastTurn(ops: AiStateDbOps): void).

 * Purpose: Supports maintainability by documenting why `setAiToolLimitExceededLastTurn` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function setAiToolLimitExceededLastTurn(ops: AiStateDbOps, seatId: AiSeatId): void {
  logDebug('gameDb setAiToolLimitExceededLastTurn', { seatId });
  if (!ops.hasDb()) return;
  ops.run("INSERT OR REPLACE INTO game_config (key, value) VALUES (?, '1')", [toolLimitKey(seatId)]);
}

/**
 * Defines the `getAndClearAiToolLimitExceededLastTurn` function shape (export function getAndClearAiToolLimitExceededLastTurn(ops: AiStateDbOps): boolean).

 * Purpose: Supports maintainability by documenting why `getAndClearAiToolLimitExceededLastTurn` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getAndClearAiToolLimitExceededLastTurn(ops: AiStateDbOps, seatId: AiSeatId): boolean {
  logDebug('gameDb getAndClearAiToolLimitExceededLastTurn', { seatId });
  if (!ops.hasDb()) return false;
  const key = toolLimitKey(seatId);
  const row = ops.getOne<{ value: string }>('SELECT value FROM game_config WHERE key = ?', [key]);
  ops.run('DELETE FROM game_config WHERE key = ?', [key]);
  return row?.value === '1';
}

/**
 * Defines the `getAiLastConsultationTurn` function shape (export function getAiLastConsultationTurn(ops: AiStateDbOps): number).

 * Purpose: Supports maintainability by documenting why `getAiLastConsultationTurn` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getAiLastConsultationTurn(ops: AiStateDbOps, seatId: AiSeatId): number {
  logTrace('gameDb getAiLastConsultationTurn', { seatId });
  if (!ops.hasDb()) return 0;
  const row = ops.getOne<{ value: string }>('SELECT value FROM game_config WHERE key = ?', [lastConsultationKey(seatId)]);
  if (!row) return 0;
  const n = parseInt(row.value, 10);
  return Number.isNaN(n) ? 0 : n;
}

/**
 * Defines the `setAiLastConsultationTurn` function shape (export function setAiLastConsultationTurn(ops: AiStateDbOps, turn: number): void).

 * Purpose: Supports maintainability by documenting why `setAiLastConsultationTurn` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function setAiLastConsultationTurn(ops: AiStateDbOps, seatId: AiSeatId, turn: number): void {
  if (!ops.hasDb()) return;
  const existing = getAiLastConsultationTurn(ops, seatId);
  if (existing === turn) {
    logTrace('gameDb setAiLastConsultationTurn: unchanged', { seatId, turn });
    return;
  }
  logDebug('gameDb setAiLastConsultationTurn', { seatId, turn });
  ops.run('INSERT OR REPLACE INTO game_config (key, value) VALUES (?, ?)', [lastConsultationKey(seatId), String(turn)]);
}

/**
 * Defines the `getOpponentUnitsInCombatSinceConsultation` function shape (export function getOpponentUnitsInCombatSinceConsultation(ops: AiStateDbOps): string[]).

 * Purpose: Supports maintainability by documenting why `getOpponentUnitsInCombatSinceConsultation` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getCombatSinceConsultation(ops: AiStateDbOps, seatId: AiSeatId): string[] {
  logTrace('gameDb getCombatSinceConsultation', { seatId });
  if (!ops.hasDb()) return [];
  const rows = ops.getAll<{ unit_id: string }>(
    'SELECT unit_id FROM ai_combat_since_consultation WHERE player_id = ?',
    [seatId]
  );
  return rows.map((r) => r.unit_id);
}

/**
 * Defines the `addOpponentCombatParticipants` function shape (export function addOpponentCombatParticipants(ops: AiStateDbOps, unitIds: string[]): void).

 * Purpose: Supports maintainability by documenting why `addOpponentCombatParticipants` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function addCombatSinceConsultation(ops: AiStateDbOps, seatId: AiSeatId, unitIds: string[]): void {
  logDebug('gameDb addCombatSinceConsultation', { seatId, count: unitIds.length });
  if (!ops.hasDb() || unitIds.length === 0) return;
  for (const id of unitIds) {
    ops.run('INSERT OR IGNORE INTO ai_combat_since_consultation (player_id, unit_id) VALUES (?, ?)', [seatId, id]);
  }
}

/**
 * Defines the `clearOpponentCombatSinceConsultation` function shape (export function clearOpponentCombatSinceConsultation(ops: AiStateDbOps): void).

 * Purpose: Supports maintainability by documenting why `clearOpponentCombatSinceConsultation` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function clearCombatSinceConsultation(ops: AiStateDbOps, seatId: AiSeatId): void {
  logDebug('gameDb clearCombatSinceConsultation', { seatId });
  if (!ops.hasDb()) return;
  ops.run('DELETE FROM ai_combat_since_consultation WHERE player_id = ?', [seatId]);
}

/**
 * Defines the `addAiLossEventsSinceConsultation` function shape (export function addAiLossEventsSinceConsultation( ops: AiStateDbOps, playerId: AiSeatId, turnNumber: number, removedUnits: { id: string; player: strin).

 * Purpose: Supports maintainability by documenting why `addAiLossEventsSinceConsultation` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function addAiLossEventsSinceConsultation(
  ops: AiStateDbOps,
  playerId: AiSeatId,
  turnNumber: number,
  removedUnits: { id: string; player: string }[],
  kills: KillEdge[],
  killsByDirectFire?: KillEdge[],
  killsByReturnFire?: KillEdge[]
): void {
  if (!ops.hasDb()) return;
  if (removedUnits.length === 0 || kills.length === 0) {
    logTrace('gameDb addAiLossEventsSinceConsultation: no losses to record', {
      playerId,
      turnNumber,
      removedCount: removedUnits.length,
      killCount: kills.length,
    });
    return;
  }

  const removedById = new Map(removedUnits.map((u) => [u.id, u]));
  const directVictims = new Set((killsByDirectFire ?? []).map((k) => k.victimId));
  const returnVictims = new Set((killsByReturnFire ?? []).map((k) => k.victimId));
  let recordedCount = 0;
  for (const kill of kills) {
    const victim = removedById.get(kill.victimId);
    if (!victim) continue;
    const cause: AiLossEventSinceConsultation['cause'] = directVictims.has(kill.victimId)
      ? 'direct_fire'
      : returnVictims.has(kill.victimId)
        ? 'return_fire'
        : 'melee_or_other';
    ops.run(
      `INSERT OR REPLACE INTO ai_loss_events_since_consultation
       (player_id, turn_number, victim_unit_id, victim_player, cause, killer_ids_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [playerId, turnNumber, kill.victimId, victim.player, cause, JSON.stringify(kill.killerIds ?? [])]
    );
    recordedCount++;
  }
  logDebug('gameDb addAiLossEventsSinceConsultation', {
    playerId,
    turnNumber,
    removedCount: removedUnits.length,
    killCount: kills.length,
    recordedCount,
  });
}

/**
 * Defines the `getAiLossEventsSinceConsultation` function shape (export function getAiLossEventsSinceConsultation(ops: AiStateDbOps, playerId: AiSeatId): AiLossEventSinceConsultation[]).

 * Purpose: Supports maintainability by documenting why `getAiLossEventsSinceConsultation` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getAiLossEventsSinceConsultation(ops: AiStateDbOps, playerId: AiSeatId): AiLossEventSinceConsultation[] {
  logTrace('gameDb getAiLossEventsSinceConsultation', { playerId });
  if (!ops.hasDb()) return [];
  const rows = ops.getAll<{
    turn_number: number;
    victim_unit_id: string;
    victim_player: string;
    cause: AiLossEventSinceConsultation['cause'];
    killer_ids_json: string;
  }>(
    `SELECT turn_number, victim_unit_id, victim_player, cause, killer_ids_json
     FROM ai_loss_events_since_consultation
     WHERE player_id = ?
     ORDER BY turn_number ASC, victim_unit_id ASC`,
    [playerId]
  );
  return rows.map((row) => {
    let killerIds: string[] = [];
    try {
      const parsed = JSON.parse(row.killer_ids_json) as unknown;
      if (Array.isArray(parsed)) killerIds = parsed.filter((x): x is string => typeof x === 'string');
    } catch {
      killerIds = [];
    }
    return {
      turnNumber: row.turn_number,
      victimUnitId: row.victim_unit_id,
      victimPlayer: row.victim_player,
      cause: row.cause,
      killerIds,
    };
  });
}

/**
 * Defines the `clearAiLossEventsSinceConsultation` function shape (export function clearAiLossEventsSinceConsultation(ops: AiStateDbOps, playerId: AiSeatId): void).

 * Purpose: Supports maintainability by documenting why `clearAiLossEventsSinceConsultation` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function clearAiLossEventsSinceConsultation(ops: AiStateDbOps, playerId: AiSeatId): void {
  logDebug('gameDb clearAiLossEventsSinceConsultation', { playerId });
  if (!ops.hasDb()) return;
  ops.run('DELETE FROM ai_loss_events_since_consultation WHERE player_id = ?', [playerId]);
}

/**
 * Defines the `getAiPendingOrders` function shape (export function getAiPendingOrders( ops: AiStateDbOps, playerId: AiSeatId ): { movementOrders: MovementOrder[]; rangedOrders: RangedAttackOrder[];).

 * Purpose: Supports maintainability by documenting why `getAiPendingOrders` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getAiPendingOrders(ops: AiStateDbOps, playerId: AiSeatId): AiPendingOrderSet | null {
  logTrace('gameDb getAiPendingOrders', { playerId });
  if (!ops.hasDb()) return null;
  const row = ops.getOne<{ movement_orders: string; ranged_orders: string; strategy_text: string | null }>(
    'SELECT movement_orders, ranged_orders, strategy_text FROM ai_pending_orders WHERE player_id = ?',
    [playerId]
  );
  if (!row) return null;
  try {
    const movementOrders = JSON.parse(row.movement_orders) as MovementOrder[];
    const rangedOrders = JSON.parse(row.ranged_orders) as RangedAttackOrder[];
    const { airStrikeOrders, ferryOrders, embarkOrders, missileLaunchOrders } = decodeAiPendingOrdersExtra(row.strategy_text);
    return { movementOrders, rangedOrders, airStrikeOrders, ferryOrders, embarkOrders, missileLaunchOrders };
  } catch (err) {
    logError('gameDb getAiPendingOrders: failed to parse stored orders', err);
    return null;
  }
}

/**
 * Defines the `setAiPendingOrders` function shape (export function setAiPendingOrders( ops: AiStateDbOps, playerId: AiSeatId, movementOrders: MovementOrder[], rangedOrders: RangedAttackOrder[], airS).

 * Purpose: Supports maintainability by documenting why `setAiPendingOrders` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function setAiPendingOrders(ops: AiStateDbOps, playerId: AiSeatId, orders: AiPendingOrderSet): void {
  logDebug('gameDb setAiPendingOrders', {
    playerId,
    movementCount: orders.movementOrders.length,
    rangedCount: orders.rangedOrders.length,
    airStrikeCount: orders.airStrikeOrders.length,
    ferryCount: orders.ferryOrders.length,
    embarkCount: orders.embarkOrders.length,
    missileLaunchCount: orders.missileLaunchOrders.length,
  });
  if (!ops.hasDb()) return;
  const strategyText = encodeAiPendingOrdersExtra({
    airStrikeOrders: [...orders.airStrikeOrders],
    ferryOrders: [...orders.ferryOrders],
    embarkOrders: [...orders.embarkOrders],
    missileLaunchOrders: [...orders.missileLaunchOrders],
  });
  ops.run(
    'INSERT OR REPLACE INTO ai_pending_orders (player_id, movement_orders, ranged_orders, strategy_text) VALUES (?, ?, ?, ?)',
    [playerId, JSON.stringify(orders.movementOrders), JSON.stringify(orders.rangedOrders), strategyText]
  );
}

/**
 * Defines the `clearAiPendingOrders` function shape (export function clearAiPendingOrders(ops: AiStateDbOps, playerId: AiSeatId): void).

 * Purpose: Supports maintainability by documenting why `clearAiPendingOrders` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function clearAiPendingOrders(ops: AiStateDbOps, playerId: AiSeatId): void {
  logDebug('gameDb clearAiPendingOrders', { playerId });
  if (!ops.hasDb()) return;
  ops.run('DELETE FROM ai_pending_orders WHERE player_id = ?', [playerId]);
}
