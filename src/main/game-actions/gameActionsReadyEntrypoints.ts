/**
 * IPC-facing strategic `ready` and melee-intercept resume entrypoints.
 *
 * Purpose: Isolates turn-resolution orchestration wiring from the larger `gameActions` façade.
 * When to use: Only via re-exports from `gameActions.ts`; keeps guard + pipeline calls in one place.
 * Expected outcome: Same `ReadyResult` contracts as the previous inlined implementations.
 * Exceptions: Database/phase failures return structured `{ success: false, reason }` results.
 */

import type {
  AirStrikeOrder,
  EmbarkOrder,
  FerryOrder,
  MovementOrder,
  RangedAttackOrder,
  ReadyResult,
  ResolveMeleeInterceptIpcPayload,
} from '../../shared/ipcTypes';
import { dbGetOne } from '../gameDb';
import { readTurnStateRow } from '../game-db/turnStateReads';
import { logDebug, logError } from '../logger';
import { executeResolveMeleeIntercept } from './meleeInterceptStrategicResolve';
import {
  failIfDatabaseNotReady,
  failIfMeleeInterceptDecisionPending,
  failIfTacticalBattleActive,
} from './readyStrategicGuards';
import { executeReadyStrategicTurn } from './readyStrategicResolutionPipeline';

const HUMAN_PLAYER_ID = 'human';
const VALID_PHASE = 'planning';

/**
 * Validates planning-phase preconditions and runs strategic turn resolution (including AI orders).
 *
 * Purpose: Single entry for the human Ready action from IPC.
 * When to use: Main-process `ready` IPC handler after validating the renderer token.
 * Expected outcome: Completed turn snapshot or a structured pause (`awaitingMeleeDecision`).
 * Exceptions: Logs at error level and returns `{ success: false }` on unexpected exceptions.
 */
export function ready(
  aiOrders: MovementOrder[] = [],
  aiRangedOrders: RangedAttackOrder[] = [],
  aiAirStrikeOrders: AirStrikeOrder[] = [],
  aiFerryOrders: FerryOrder[] = [],
  aiEmbarkOrders: EmbarkOrder[] = []
): ReadyResult {
  logDebug('ready', {
    aiOrderCount: aiOrders.length,
    aiRangedCount: aiRangedOrders.length,
    aiAirStrikeCount: aiAirStrikeOrders.length,
    aiFerryCount: aiFerryOrders.length,
    aiEmbarkCount: aiEmbarkOrders.length,
  });
  try {
    const failDb = failIfDatabaseNotReady('ready');
    if (failDb) return failDb;
    const failTac = failIfTacticalBattleActive('ready');
    if (failTac) return failTac;
    const failMelee = failIfMeleeInterceptDecisionPending();
    if (failMelee) return failMelee;

    const turnRow = readTurnStateRow(dbGetOne);
    if (turnRow?.phase !== VALID_PHASE) {
      logError('ready: not in planning phase', turnRow?.phase);
      return { success: false, reason: 'Not in planning phase' };
    }

    return executeReadyStrategicTurn(
      aiOrders,
      aiRangedOrders,
      aiAirStrikeOrders,
      aiFerryOrders,
      aiEmbarkOrders,
      {
        humanPlayerId: HUMAN_PLAYER_ID,
        validPhase: VALID_PHASE,
        turnNumber: turnRow?.turn_number ?? 1,
      }
    );
  } catch (err) {
    logError('ready: exception', err);
    return { success: false, reason: String(err) };
  }
}

/**
 * Resumes strategic turn resolution after the human submits Fight or Ignore for a paused pre-melee intercept.
 *
 * Purpose: Delegates to `executeResolveMeleeIntercept` with exception mapping for IPC.
 * When to use: Renderer IPC only after `ready` returned `awaitingMeleeDecision`.
 * Expected outcome: Full `ReadyResult` for a completed turn when payload is valid.
 * Exceptions: Logs at error level and returns `{ success: false }` on unexpected exceptions.
 */
export function resolveMeleeIntercept(payload: ResolveMeleeInterceptIpcPayload): ReadyResult {
  try {
    return executeResolveMeleeIntercept(payload);
  } catch (err) {
    logError('resolveMeleeIntercept: exception', err);
    return { success: false, reason: String(err) };
  }
}
