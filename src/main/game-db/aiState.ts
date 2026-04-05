import { logDebug, logError, logTrace } from '../logger';
import type { AirStrikeOrder, FerryOrder, MovementOrder, RangedAttackOrder } from '../../shared/ipcTypes';
import type { GuardedDbOps } from './dbOps';

const AI_TOOL_LIMIT_EXCEEDED_KEY = 'ai_tool_limit_exceeded_last_turn';
const AI_LAST_CONSULTATION_TURN_KEY = 'ai_last_consultation_turn';
const OPPONENT_ID = 'opponent';

export interface AiLossEventSinceConsultation {
  turnNumber: number;
  victimUnitId: string;
  victimPlayer: string;
  cause: 'direct_fire' | 'return_fire' | 'melee_or_other';
  killerIds: string[];
}

interface AiPendingOrdersExtraPayload {
  airStrikeOrders: AirStrikeOrder[];
  ferryOrders: FerryOrder[];
}

type AiStateDbOps = GuardedDbOps;

function coerceAiPendingOrdersExtraPayload(value: unknown): AiPendingOrdersExtraPayload {
  const payload = value as { airStrikeOrders?: unknown; ferryOrders?: unknown } | null;
  const airStrikeOrders = Array.isArray(payload?.airStrikeOrders) ? (payload.airStrikeOrders as AirStrikeOrder[]) : [];
  const ferryOrders = Array.isArray(payload?.ferryOrders) ? (payload.ferryOrders as FerryOrder[]) : [];
  return { airStrikeOrders, ferryOrders };
}

function decodeAiPendingOrdersExtra(strategyText: string | null): AiPendingOrdersExtraPayload {
  if (typeof strategyText !== 'string' || strategyText.trim().length === 0) {
    return { airStrikeOrders: [], ferryOrders: [] };
  }
  try {
    return coerceAiPendingOrdersExtraPayload(JSON.parse(strategyText));
  } catch (err) {
    logError('gameDb decodeAiPendingOrdersExtra: failed to parse pending-order extra payload', err);
    return { airStrikeOrders: [], ferryOrders: [] };
  }
}

function encodeAiPendingOrdersExtra(payload: AiPendingOrdersExtraPayload): string {
  return JSON.stringify(payload);
}

export function setAiToolLimitExceededLastTurn(ops: AiStateDbOps): void {
  if (!ops.hasDb()) return;
  ops.run("INSERT OR REPLACE INTO game_config (key, value) VALUES (?, '1')", [AI_TOOL_LIMIT_EXCEEDED_KEY]);
}

export function getAndClearAiToolLimitExceededLastTurn(ops: AiStateDbOps): boolean {
  if (!ops.hasDb()) return false;
  const row = ops.getOne<{ value: string }>('SELECT value FROM game_config WHERE key = ?', [AI_TOOL_LIMIT_EXCEEDED_KEY]);
  ops.run('DELETE FROM game_config WHERE key = ?', [AI_TOOL_LIMIT_EXCEEDED_KEY]);
  return row?.value === '1';
}

export function getAiLastConsultationTurn(ops: AiStateDbOps): number {
  logTrace('gameDb getAiLastConsultationTurn');
  if (!ops.hasDb()) return 0;
  const row = ops.getOne<{ value: string }>('SELECT value FROM game_config WHERE key = ?', [AI_LAST_CONSULTATION_TURN_KEY]);
  if (!row) return 0;
  const n = parseInt(row.value, 10);
  return Number.isNaN(n) ? 0 : n;
}

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

export function getOpponentUnitsInCombatSinceConsultation(ops: AiStateDbOps): string[] {
  logTrace('gameDb getOpponentUnitsInCombatSinceConsultation');
  if (!ops.hasDb()) return [];
  const rows = ops.getAll<{ unit_id: string }>(
    'SELECT unit_id FROM ai_combat_since_consultation WHERE player_id = ?',
    [OPPONENT_ID]
  );
  return rows.map((r) => r.unit_id);
}

export function addOpponentCombatParticipants(ops: AiStateDbOps, unitIds: string[]): void {
  logDebug('gameDb addOpponentCombatParticipants', { count: unitIds.length });
  if (!ops.hasDb() || unitIds.length === 0) return;
  for (const id of unitIds) {
    ops.run('INSERT OR IGNORE INTO ai_combat_since_consultation (player_id, unit_id) VALUES (?, ?)', [OPPONENT_ID, id]);
  }
}

export function clearOpponentCombatSinceConsultation(ops: AiStateDbOps): void {
  logDebug('gameDb clearOpponentCombatSinceConsultation');
  if (!ops.hasDb()) return;
  ops.run('DELETE FROM ai_combat_since_consultation WHERE player_id = ?', [OPPONENT_ID]);
}

export function addAiLossEventsSinceConsultation(
  ops: AiStateDbOps,
  playerId: string,
  turnNumber: number,
  removedUnits: { id: string; player: string }[],
  kills: { victimId: string; killerIds: string[] }[],
  killsByDirectFire?: { victimId: string; killerIds: string[] }[],
  killsByReturnFire?: { victimId: string; killerIds: string[] }[]
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

export function clearAiLossEventsSinceConsultation(ops: AiStateDbOps, playerId: string): void {
  logDebug('gameDb clearAiLossEventsSinceConsultation', { playerId });
  if (!ops.hasDb()) return;
  ops.run('DELETE FROM ai_loss_events_since_consultation WHERE player_id = ?', [playerId]);
}

export function getAiPendingOrders(
  ops: AiStateDbOps,
  playerId: string
): {
  movementOrders: MovementOrder[];
  rangedOrders: RangedAttackOrder[];
  airStrikeOrders: AirStrikeOrder[];
  ferryOrders: FerryOrder[];
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
    const { airStrikeOrders, ferryOrders } = decodeAiPendingOrdersExtra(row.strategy_text);
    return { movementOrders, rangedOrders, airStrikeOrders, ferryOrders };
  } catch (err) {
    logError('gameDb getAiPendingOrders: failed to parse stored orders', err);
    return null;
  }
}

export function setAiPendingOrders(
  ops: AiStateDbOps,
  playerId: string,
  movementOrders: MovementOrder[],
  rangedOrders: RangedAttackOrder[],
  airStrikeOrders: AirStrikeOrder[] = [],
  ferryOrders: FerryOrder[] = []
): void {
  logDebug('gameDb setAiPendingOrders', {
    playerId,
    movementCount: movementOrders.length,
    rangedCount: rangedOrders.length,
    airStrikeCount: airStrikeOrders.length,
    ferryCount: ferryOrders.length,
  });
  if (!ops.hasDb()) return;
  const strategyText = encodeAiPendingOrdersExtra({ airStrikeOrders, ferryOrders });
  ops.run(
    'INSERT OR REPLACE INTO ai_pending_orders (player_id, movement_orders, ranged_orders, strategy_text) VALUES (?, ?, ?, ?)',
    [playerId, JSON.stringify(movementOrders), JSON.stringify(rangedOrders), strategyText]
  );
}

export function clearAiPendingOrders(ops: AiStateDbOps, playerId: string): void {
  logDebug('gameDb clearAiPendingOrders', { playerId });
  if (!ops.hasDb()) return;
  ops.run('DELETE FROM ai_pending_orders WHERE player_id = ?', [playerId]);
}
