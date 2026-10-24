/**
 * Merges the in-memory tactical battle snapshot reference into strategic `GameStateSnapshot` payloads.
 */

import type { GameStateSnapshot } from '../../shared/ipcTypes';
import type { SeatId } from '../../shared/seatIds';
import { getActiveTacticalBattleSnapshotRef } from '../tacticalBattle/activeTacticalBattleRef';
import { logTrace } from '../logger';

/**
 * Attaches `tacticalBattleSession` when the main process holds an active tactical snapshot ref.
 *
 * Purpose: Deduplicates identical merge logic from `getGameState` and `getGameStateForPlayer`.
 * When to use: After fog/melee snapshot transforms produce the strategic `base` snapshot.
 * Expected outcome: Returns `base` unchanged when no tactical session exists; shallow-copies with session otherwise.
 * Exceptions: None.
 */
export function mergeActiveTacticalSessionIntoGameStateSnapshot(
  base: GameStateSnapshot,
  trace: { scope: 'getGameState' } | { scope: 'getGameStateForPlayer'; playerId: SeatId }
): GameStateSnapshot {
  const tactical = getActiveTacticalBattleSnapshotRef();
  if (!tactical) return base;
  if (trace.scope === 'getGameState') {
    logTrace('getGameState attach tacticalBattleSession', { battleId: tactical.battleId });
  } else {
    logTrace('getGameStateForPlayer attach tacticalBattleSession', {
      battleId: tactical.battleId,
      playerId: trace.playerId,
    });
  }
  return { ...base, tacticalBattleSession: tactical };
}
