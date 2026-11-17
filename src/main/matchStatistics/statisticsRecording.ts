/**
 * Writes one `side_statistics` event at a strategic step boundary.
 *
 * Purpose: The numbers describe the live match at one turn boundary, so they are read then and stored as one event. Upkeep and treasury come from `readMercenaryFunds`, the function the top bar's credits readout uses. Production capacity is a SQL sum in `sideStatisticsRead.ts` that follows the top bar's rule (`computeTopBarStats`).
 * When to use: From the recorder, directly after a strategic frame is written. The recorder passes its own event writer, so this module does not import it at runtime.
 * Expected outcome: One engine-only event per call at a strategic step. Nothing at a tactical step.
 * Exceptions: None. A failure is logged and swallowed.
 */

import { gameDbOps } from '../gameDb/dbConnection';
import { listAllSideStances } from '../gameDb/sideMessageStore';
import { logDebug, logError, logTrace } from '../logger';
import { getMatchGeneration } from '../matchGeneration';
import type { MatchEventRequest } from '../recorder/matchRecorder';
import type { StepKey } from '../../shared/matchRecording';
import type { RelationshipReport, SeatForStatistics, TurnStatistics } from '../../shared/matchStatistics';
import { readSideStatistics } from './sideStatisticsRead';
import { takeSpentMissileIds } from './spentMissiles';
import {
  hexesTakenBetween,
  readTurnOwnership,
  rememberedTurnOwnership,
  rememberTurnOwnership,
  unitsLostBySeat,
} from './turnDifferences';

/**
 * Reads every stored stance as a relationship report.
 *
 * Purpose: The statistics event keeps every commander's stance, trust, and threat as they stand at the boundary.
 * When to use: Once per recorded turn.
 * Expected outcome: One report per stored stance row.
 * Exceptions: Propagates a SQLite error.
 */
function readRelationships(): RelationshipReport[] {
  return listAllSideStances(gameDbOps).map((row) => ({
    seatId: row.seatId,
    towardSeatId: row.towardSeatId,
    stance: row.stance,
    trust: row.trust,
    threat: row.threat,
    reportedTurn: row.updatedTurn,
  }));
}

/**
 * Records the statistics of one strategic step.
 *
 * Purpose: A turn with a battle has two strategic frames and two events. Both compare against the turn before, and the next turn compares against the later one, so no loss is counted twice or missed.
 * When to use: Right after a strategic frame is written, with the roster and the recorder's event writer.
 * Expected outcome: One `side_statistics` event with engine visibility, then the turn's ownership is remembered. Nothing for a tactical step.
 * Exceptions: None. A caught failure logs the error and the seat count.
 */
export function recordTurnStatistics(
  step: StepKey,
  seats: readonly SeatForStatistics[],
  record: (event: MatchEventRequest) => void
): void {
  try {
    logDebug('statisticsRecording recordTurnStatistics', { scope: step.scope, turnNumber: step.turnNumber, seatCount: seats.length });
    if (step.scope !== 'strategic') return;
    const generation = getMatchGeneration();
    const seatIds = seats.map((seat) => seat.seatId);
    const current = readTurnOwnership(gameDbOps, step.turnNumber, generation);
    const previous = rememberedTurnOwnership(step.turnNumber - 1, generation);
    const lost = unitsLostBySeat(previous, current, seatIds, takeSpentMissileIds(step.turnNumber));
    const sides = readSideStatistics(gameDbOps, seats).map((side) => ({
      ...side,
      unitsLost: lost?.get(side.seatId) ?? null,
    }));
    const payload: TurnStatistics = {
      turnNumber: step.turnNumber,
      sides,
      relationships: readRelationships(),
      hexesTaken: hexesTakenBetween(previous, current, seatIds),
    };
    record({ type: 'side_statistics', step, visibility: 'engine', payload });
    rememberTurnOwnership(current);
  } catch (err) {
    logError('statisticsRecording recordTurnStatistics failed', { seatCount: seats.length, err });
  }
}

/**
 * Brings a recorded turn's statistics up to the database as it stands now.
 *
 * Purpose: A consult that finishes after the match's last boundary changes the seat costs and the stances, and the finished recording must show them. The losses and hexes taken compare against the turn before, which cannot be read again, so they are kept as recorded.
 * When to use: Immediately before a finished match's recording is written, on the statistics event of the current step.
 * Expected outcome: The same turn with `sides` read again (each keeping its recorded `unitsLost`, or null for a seat that was not recorded) and `relationships` read again. `turnNumber` and `hexesTaken` are unchanged. Nothing is remembered or consumed.
 * Exceptions: Propagates a SQLite error.
 */
export function refreshedTurnStatistics(recorded: TurnStatistics, seats: readonly SeatForStatistics[]): TurnStatistics {
  logTrace('statisticsRecording refreshedTurnStatistics', { turnNumber: recorded.turnNumber, seatCount: seats.length });
  const recordedLosses = new Map(recorded.sides.map((side) => [side.seatId, side.unitsLost]));
  return {
    ...recorded,
    sides: readSideStatistics(gameDbOps, seats).map((side) => ({ ...side, unitsLost: recordedLosses.get(side.seatId) ?? null })),
    relationships: readRelationships(),
  };
}
