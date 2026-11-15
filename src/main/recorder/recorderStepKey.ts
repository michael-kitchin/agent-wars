/**
 * The step the open match is on.
 *
 * Purpose: Boundaries and tactical events name the step without each caller reading the turn and the battle.
 * When to use: From a handler that is about to record, while the database is the match being played.
 * Expected outcome: The tactical step when a battle is in memory, otherwise the strategic step. Null when the database is closed or has no turn row.
 * Exceptions: None. A failed read is logged and returns null, so the boundary writes nothing.
 */

import { gameDbOps, hasDbHandle } from '../gameDb/dbConnection';
import { readTurnStateRow } from '../gameDb/turnStateReads';
import { logError, logTrace } from '../logger';
import { getActiveTacticalBattleSnapshotRef } from '../tacticalBattle/activeTacticalBattleRef';
import { strategicStep, tacticalStep, type StepKey } from '../../shared/matchRecording';

/**
 * Reads the current step from the open match.
 *
 * Purpose: The in-memory battle ref is the snapshot `getActiveTacticalBattleSnapshot` returns, without importing the session module.
 * When to use: Before and after a handler that can change the turn or the beat.
 * Expected outcome: A tactical step when a battle is active, a strategic step otherwise, or null when the match is not ready.
 * Exceptions: None. A failed read is logged and returns null, so the boundary writes nothing.
 */
export function currentStepKey(): StepKey | null {
  logTrace('recorderStepKey currentStepKey', { ready: hasDbHandle() });
  if (!hasDbHandle()) return null;
  try {
    const turn = readTurnStateRow(gameDbOps.getOne);
    if (!turn) return null;
    const battle = getActiveTacticalBattleSnapshotRef();
    if (battle) return tacticalStep(turn.turn_number, battle.battleId, battle.tacticalTurnNumber);
    return strategicStep(turn.turn_number);
  } catch (err) {
    logError('recorderStepKey currentStepKey failed', { err });
    return null;
  }
}
