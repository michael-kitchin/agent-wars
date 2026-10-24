/**
 * Main-process resume path after renderer submits Fight or Ignore for a paused pre-melee intercept.
 */

import { dbGetOne } from '../gameDb';
import { buildLatLngCoordinateMap } from '../mapData';
import { readTurnStateRow } from '../gameDb/turnStateReads';
import { createCombatRng, runMeleePhase } from '../combatResolution';
import { logDebug, logError } from '../logger';
import type { ReadyResult, ResolveMeleeInterceptIpcPayload } from '../../shared/ipcTypes';
import { finalizeReadyTurnAfterMelee } from './meleeInterceptReadyFinalize';
import {
  clearMeleeInterceptPendingSnapshot,
  peekMeleeInterceptPendingSnapshot,
  traversalRecordToSets,
} from './meleeInterceptPendingState';
import { failIfDatabaseNotReady, failIfTacticalBattleActive } from './readyStrategicGuards';

/**
 * Applies Fight/Ignore semantics, restores RNG consumption parity, then reuses melee finalize helpers.
 *
 * Purpose: Clears pending snapshot only after token and phase validation; mirrors legacy `gameActions.resolveMeleeIntercept`.
 * When to use: Exported through `gameActions.resolveMeleeIntercept` only.
 * Expected outcome: Completed `ReadyResult` or structured failure; Fight may attach `tacticalAutoStartStrategicH3Index`.
 * Exceptions: Caught and converted to `{ success: false, reason }` at the `gameActions` boundary.
 */
export function executeResolveMeleeIntercept(payload: ResolveMeleeInterceptIpcPayload): ReadyResult {
  logDebug('resolveMeleeIntercept', { decision: payload.decision, hasSelected: !!payload.selectedH3Index });
  const gDb = failIfDatabaseNotReady('resolveMeleeIntercept');
  if (gDb) return gDb;
  const gTac = failIfTacticalBattleActive('resolveMeleeIntercept');
  if (gTac) return gTac;

  const pending = peekMeleeInterceptPendingSnapshot();
  if (!pending) {
    logError('resolveMeleeIntercept: no pending snapshot', {});
    return { success: false, reason: 'No melee intercept decision is pending.' };
  }
  if (payload.meleeDecisionToken !== pending.decisionToken) {
    logError('resolveMeleeIntercept: token mismatch', {});
    return { success: false, reason: 'Melee decision token is stale or invalid. Refresh game state and try again.' };
  }
  const turnRow = readTurnStateRow(dbGetOne);
  if (turnRow?.phase !== 'resolution' || turnRow.turn_number !== pending.turnNumber) {
    logError('resolveMeleeIntercept: unexpected turn_state', { turnRow, expectedTurn: pending.turnNumber });
    clearMeleeInterceptPendingSnapshot();
    return { success: false, reason: 'Turn state changed while resolving melee intercept.' };
  }
  if (payload.decision === 'fight') {
    if (!payload.selectedH3Index) {
      logError('resolveMeleeIntercept: fight missing selection', {});
      return { success: false, reason: 'Fight requires a selected melee hex.' };
    }
    if (!pending.candidateHexes.includes(payload.selectedH3Index)) {
      logError('resolveMeleeIntercept: selection not in candidate list', { selectedH3Index: payload.selectedH3Index });
      return { success: false, reason: 'Selected hex is not a current melee candidate.' };
    }
  }
  clearMeleeInterceptPendingSnapshot();
  const skipMeleeHexes =
    payload.decision === 'fight' && payload.selectedH3Index ? new Set<string>([payload.selectedH3Index]) : undefined;
  const resumeNext = createCombatRng(pending.combatSeed);
  for (let i = 0; i < pending.rngInvocationsBeforeMelee; i += 1) {
    resumeNext();
  }
  const meleeResult = runMeleePhase(pending.combatUnitsAfter, pending.hexList, resumeNext, { skipMeleeHexes });
  const baseResult = finalizeReadyTurnAfterMelee({
    meleeResult,
    rangedResult: pending.rangedResult,
    airStrikeResult: pending.airStrikeResult,
    airStrikeTransportLosses: pending.airStrikeTransportLosses,
    rangedTransportLosses: pending.rangedTransportLosses,
    combatUnitsAfter: pending.combatUnitsAfter,
    combatUnitsBefore: pending.combatUnitsBefore,
    humanMoves: pending.humanMoves,
    aiMoves: pending.aiMoves,
    embarkedFollowMoves: pending.embarkedFollowMoves,
    resolvedFerryMoves: pending.resolvedFerryMoves,
    traversedHexesByPlayer: traversalRecordToSets(pending.traversedHexesByPlayer),
    hadStrategicMarchResolutionBySeat: pending.hadStrategicMarchResolutionBySeat,
    turnNumber: pending.turnNumber,
    allRanged: pending.allRanged,
    aiRangedOrders: pending.aiRangedOrders,
    knockoutCoordinates: buildLatLngCoordinateMap(pending.hexList),
  });
  if (!baseResult.success) {
    return baseResult;
  }
  if (payload.decision === 'fight' && payload.selectedH3Index) {
    return { ...baseResult, tacticalAutoStartH3Index: payload.selectedH3Index };
  }
  return baseResult;
}
