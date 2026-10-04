import { logDebug, logError, logTrace } from '../logger';
import type { KillEdge } from '../../shared/ipc/combatResultTypes';
import type { AirStrikeOrder, EmbarkOrder, FerryOrder, MovementOrder, RangedAttackOrder } from '../../shared/ipcTypes';
import type { GuardedDbOps } from './dbOps';

/**
 * Documents the module-scope binding `AI_TOOL_LIMIT_EXCEEDED_KEY` (AI_TOOL_LIMIT_EXCEEDED_KEY).

 * Purpose: Supports maintainability by documenting why `AI_TOOL_LIMIT_EXCEEDED_KEY` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const AI_TOOL_LIMIT_EXCEEDED_KEY = 'ai_tool_limit_exceeded_last_turn';
/**
 * Documents the module-scope binding `AI_LAST_CONSULTATION_TURN_KEY` (AI_LAST_CONSULTATION_TURN_KEY).

 * Purpose: Supports maintainability by documenting why `AI_LAST_CONSULTATION_TURN_KEY` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const AI_LAST_CONSULTATION_TURN_KEY = 'ai_last_consultation_turn';
/**
 * Documents the module-scope binding `OPPONENT_ID` (OPPONENT_ID).

 * Purpose: Supports maintainability by documenting why `OPPONENT_ID` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const OPPONENT_ID = 'opponent';

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
  const payload = value as { airStrikeOrders?: unknown; ferryOrders?: unknown; embarkOrders?: unknown } | null;
  const airStrikeOrders = Array.isArray(payload?.airStrikeOrders) ? (payload.airStrikeOrders as AirStrikeOrder[]) : [];
  const ferryOrders = Array.isArray(payload?.ferryOrders) ? (payload.ferryOrders as FerryOrder[]) : [];
  const embarkOrders = Array.isArray(payload?.embarkOrders) ? (payload.embarkOrders as EmbarkOrder[]) : [];
  return { airStrikeOrders, ferryOrders, embarkOrders };
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
    return { airStrikeOrders: [], ferryOrders: [], embarkOrders: [] };
  }
  try {
    return coerceAiPendingOrdersExtraPayload(JSON.parse(strategyText));
  } catch (err) {
    logError('gameDb decodeAiPendingOrdersExtra: failed to parse pending-order extra payload', err);
    return { airStrikeOrders: [], ferryOrders: [], embarkOrders: [] };
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
export function setAiToolLimitExceededLastTurn(ops: AiStateDbOps): void {
  if (!ops.hasDb()) return;
  ops.run("INSERT OR REPLACE INTO game_config (key, value) VALUES (?, '1')", [AI_TOOL_LIMIT_EXCEEDED_KEY]);
}

/**
 * Defines the `getAndClearAiToolLimitExceededLastTurn` function shape (export function getAndClearAiToolLimitExceededLastTurn(ops: AiStateDbOps): boolean).

 * Purpose: Supports maintainability by documenting why `getAndClearAiToolLimitExceededLastTurn` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getAndClearAiToolLimitExceededLastTurn(ops: AiStateDbOps): boolean {
  if (!ops.hasDb()) return false;
  const row = ops.getOne<{ value: string }>('SELECT value FROM game_config WHERE key = ?', [AI_TOOL_LIMIT_EXCEEDED_KEY]);
  ops.run('DELETE FROM game_config WHERE key = ?', [AI_TOOL_LIMIT_EXCEEDED_KEY]);
  return row?.value === '1';
}

/**
 * Defines the `getAiLastConsultationTurn` function shape (export function getAiLastConsultationTurn(ops: AiStateDbOps): number).

 * Purpose: Supports maintainability by documenting why `getAiLastConsultationTurn` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getAiLastConsultationTurn(ops: AiStateDbOps): number {
  logTrace('gameDb getAiLastConsultationTurn');
  if (!ops.hasDb()) return 0;
  const row = ops.getOne<{ value: string }>('SELECT value FROM game_config WHERE key = ?', [AI_LAST_CONSULTATION_TURN_KEY]);
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
export function setAiLastConsultationTurn(ops: AiStateDbOps, turn: number): void {
  if (!ops.hasDb()) return;
  const existing = getAiLastConsultationTurn(ops);
  if (existing === turn) {
    logTrace('gameDb setAiLastConsultationTurn: unchanged', { turn });
    return;
  }
  logDebug('gameDb setAiLastConsultationTurn', { turn });
  ops.run('INSERT OR REPLACE INTO game_config (key, value) VALUES (?, ?)', [AI_LAST_CONSULTATION_TURN_KEY, String(turn)]);
}

/**
 * Defines the `getOpponentUnitsInCombatSinceConsultation` function shape (export function getOpponentUnitsInCombatSinceConsultation(ops: AiStateDbOps): string[]).

 * Purpose: Supports maintainability by documenting why `getOpponentUnitsInCombatSinceConsultation` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getOpponentUnitsInCombatSinceConsultation(ops: AiStateDbOps): string[] {
  logTrace('gameDb getOpponentUnitsInCombatSinceConsultation');
  if (!ops.hasDb()) return [];
  const rows = ops.getAll<{ unit_id: string }>(
    'SELECT unit_id FROM ai_combat_since_consultation WHERE player_id = ?',
    [OPPONENT_ID]
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
export function addOpponentCombatParticipants(ops: AiStateDbOps, unitIds: string[]): void {
  logDebug('gameDb addOpponentCombatParticipants', { count: unitIds.length });
  if (!ops.hasDb() || unitIds.length === 0) return;
  for (const id of unitIds) {
    ops.run('INSERT OR IGNORE INTO ai_combat_since_consultation (player_id, unit_id) VALUES (?, ?)', [OPPONENT_ID, id]);
  }
}

/**
 * Defines the `clearOpponentCombatSinceConsultation` function shape (export function clearOpponentCombatSinceConsultation(ops: AiStateDbOps): void).

 * Purpose: Supports maintainability by documenting why `clearOpponentCombatSinceConsultation` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function clearOpponentCombatSinceConsultation(ops: AiStateDbOps): void {
  logDebug('gameDb clearOpponentCombatSinceConsultation');
  if (!ops.hasDb()) return;
  ops.run('DELETE FROM ai_combat_since_consultation WHERE player_id = ?', [OPPONENT_ID]);
}

/**
 * Defines the `addAiLossEventsSinceConsultation` function shape (export function addAiLossEventsSinceConsultation( ops: AiStateDbOps, playerId: string, turnNumber: number, removedUnits: { id: string; player: strin).

 * Purpose: Supports maintainability by documenting why `addAiLossEventsSinceConsultation` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function addAiLossEventsSinceConsultation(
  ops: AiStateDbOps,
  playerId: string,
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
 * Defines the `getAiLossEventsSinceConsultation` function shape (export function getAiLossEventsSinceConsultation(ops: AiStateDbOps, playerId: string): AiLossEventSinceConsultation[]).

 * Purpose: Supports maintainability by documenting why `getAiLossEventsSinceConsultation` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getAiLossEventsSinceConsultation(ops: AiStateDbOps, playerId: string): AiLossEventSinceConsultation[] {
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
 * Defines the `clearAiLossEventsSinceConsultation` function shape (export function clearAiLossEventsSinceConsultation(ops: AiStateDbOps, playerId: string): void).

 * Purpose: Supports maintainability by documenting why `clearAiLossEventsSinceConsultation` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function clearAiLossEventsSinceConsultation(ops: AiStateDbOps, playerId: string): void {
  logDebug('gameDb clearAiLossEventsSinceConsultation', { playerId });
  if (!ops.hasDb()) return;
  ops.run('DELETE FROM ai_loss_events_since_consultation WHERE player_id = ?', [playerId]);
}

/**
 * Defines the `getAiPendingOrders` function shape (export function getAiPendingOrders( ops: AiStateDbOps, playerId: string ): { movementOrders: MovementOrder[]; rangedOrders: RangedAttackOrder[];).

 * Purpose: Supports maintainability by documenting why `getAiPendingOrders` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getAiPendingOrders(
  ops: AiStateDbOps,
  playerId: string
): {
  movementOrders: MovementOrder[];
  rangedOrders: RangedAttackOrder[];
  airStrikeOrders: AirStrikeOrder[];
  ferryOrders: FerryOrder[];
  embarkOrders: EmbarkOrder[];
} | null {
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
    const { airStrikeOrders, ferryOrders, embarkOrders } = decodeAiPendingOrdersExtra(row.strategy_text);
    return { movementOrders, rangedOrders, airStrikeOrders, ferryOrders, embarkOrders };
  } catch (err) {
    logError('gameDb getAiPendingOrders: failed to parse stored orders', err);
    return null;
  }
}

/**
 * Defines the `setAiPendingOrders` function shape (export function setAiPendingOrders( ops: AiStateDbOps, playerId: string, movementOrders: MovementOrder[], rangedOrders: RangedAttackOrder[], airS).

 * Purpose: Supports maintainability by documenting why `setAiPendingOrders` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function setAiPendingOrders(
  ops: AiStateDbOps,
  playerId: string,
  movementOrders: MovementOrder[],
  rangedOrders: RangedAttackOrder[],
  airStrikeOrders: AirStrikeOrder[] = [],
  ferryOrders: FerryOrder[] = [],
  embarkOrders: EmbarkOrder[] = []
): void {
  logDebug('gameDb setAiPendingOrders', {
    playerId,
    movementCount: movementOrders.length,
    rangedCount: rangedOrders.length,
    airStrikeCount: airStrikeOrders.length,
    ferryCount: ferryOrders.length,
    embarkCount: embarkOrders.length,
  });
  if (!ops.hasDb()) return;
  const strategyText = encodeAiPendingOrdersExtra({ airStrikeOrders, ferryOrders, embarkOrders });
  ops.run(
    'INSERT OR REPLACE INTO ai_pending_orders (player_id, movement_orders, ranged_orders, strategy_text) VALUES (?, ?, ?, ?)',
    [playerId, JSON.stringify(movementOrders), JSON.stringify(rangedOrders), strategyText]
  );
}

/**
 * Defines the `clearAiPendingOrders` function shape (export function clearAiPendingOrders(ops: AiStateDbOps, playerId: string): void).

 * Purpose: Supports maintainability by documenting why `clearAiPendingOrders` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function clearAiPendingOrders(ops: AiStateDbOps, playerId: string): void {
  logDebug('gameDb clearAiPendingOrders', { playerId });
  if (!ops.hasDb()) return;
  ops.run('DELETE FROM ai_pending_orders WHERE player_id = ?', [playerId]);
}
