/**
 * Callback evaluation slice for one completed tactical beat.
 *
 * Purpose: Feeds mandatory and subscription checks from playback without a full strategic ready result.
 * When to use: `afterTacticalBeatResolution` after a tactical commit succeeds.
 * Expected outcome: The consulted seat's moved and removed sub-units are the combat participants for that seat.
 */

import type { AiSeatId } from '../../shared/seatIds';
import { logDebug } from '../logger';
import type { TacticalCommitResolutionPlayback } from '../../shared/ipcTypes';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import type { ReadyResultWithParticipants } from './consultationPolicy';

/**
 * Builds the callback evaluation slice for a completed tactical beat from deterministic playback metadata.
 *
 * Purpose: Feeds `evaluateTacticalMandatoryOverrides` and `evaluateSubscriptionEvents` for the seat that was asked.
 * When to use: Only from `afterTacticalBeatResolution` after a tactical commit succeeds.
 * Expected outcome: `combatParticipantUnitIdsBySeat` lists that seat's sub-units that moved this beat or were removed.
 * Exceptions: None.
 */
export function buildTacticalBeatResolutionReadyParticipants(
  playback: TacticalCommitResolutionPlayback,
  tacticalBattle: TacticalBattleSnapshot,
  seatId: AiSeatId
): ReadyResultWithParticipants {
  logDebug('buildTacticalBeatResolutionReadyParticipants', {
    battleId: tacticalBattle.battleId,
    seatId,
    moveCount: playback.opponentMoves?.length ?? 0,
  });
  const removedCombined = [...(playback.rangedRemovedUnits ?? []), ...(playback.meleeRemovedUnits ?? [])];
  const removedUnitIds = removedCombined.map((unit) => unit.id);
  const removedForSeat = removedCombined.filter((unit) => unit.player === seatId).map((unit) => unit.id);
  const combatants = new Set<string>(removedForSeat);
  for (const move of playback.opponentMoves ?? []) {
    if (tacticalBattle.subUnits.some((unit) => unit.id === move.unitId && unit.player === seatId)) {
      combatants.add(move.unitId);
    }
  }
  return {
    success: true,
    removedUnitIds: removedUnitIds.length > 0 ? removedUnitIds : undefined,
    removedUnitIdsBySeat: { [seatId]: removedForSeat },
    combatParticipantUnitIdsBySeat: { [seatId]: [...combatants] },
    infrastructureDestroyedEvents: playback.infrastructureDestroyedEvents,
  };
}
