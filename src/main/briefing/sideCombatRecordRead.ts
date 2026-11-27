/**
 * Reads one commander's combat record against each other active side from the stored notes.
 */

import { parsePlayerLossSummaryJson } from '../../shared/lossSummaryJson';
import { isSeatId, type AiSeatId } from '../../shared/seatIds';
import { activeSeats } from '../../shared/seatRoster';
import { playerIdCodeFor } from '../../shared/unitIds';
import { gameDbOps } from '../gameDb/dbConnection';
import { readSeatRoster } from '../gameDb/seatRosterStore';
import { getRecentTurnNotes } from '../gameDb/turnNotesHistory';
import { logDebug, logError, logTrace } from '../logger';
import { buildSideCombatRecords, type CombatRecordTurn } from './sideCombatRecord';
import { formatSideCombatRecord } from './sideCombatRecordText';
import { readStrategicBattleLossesByTurn } from './strategicLossWindow';

/**
 * One side's record as the prompts use it.
 *
 * Purpose: The prompts print the text, the optional conflict check needs the latest attack, and the automatic-fire flag
 * needs the latest ranged, air, or missile attack.
 * When to use: The values of the map `readSideCombatRecords` returns.
 * Expected outcome: Text from `formatSideCombatRecord`.
 * Exceptions: None.
 */
export interface SideCombatRecordView {
  /**
   * The wording of the record.
   *
   * Contract: Begins `Record, turn` and names the window.
   * When to use: Printed next to the stance.
   * Expected outcome: Never empty.
   * Exceptions: None.
   */
  readonly text: string;
  /**
   * The latest turn this side destroyed one of the commander's units by its own attack, in close combat, or in a battle.
   *
   * Contract: Null when it did not in the window.
   * When to use: Checking a friendly stance against recent attacks.
   * Expected outcome: A turn inside the window.
   * Exceptions: None.
   */
  readonly latestTurnAttackedYou: number | null;
  /**
   * The latest turn this side's ranged, air, or missile attacks destroyed one of the commander's units.
   *
   * Contract: `SideCombatRecord.latestTurnStruckYou`. Null when none in the window.
   * When to use: Flagging a side the commander holds automatic fire against.
   * Expected outcome: A turn inside the window.
   * Exceptions: None.
   */
  readonly latestTurnStruckYou: number | null;
}

/**
 * Reads the stored strategic loss notes of one commander as combat record turns.
 *
 * Purpose: The side records and the agreement evidence count losses from the same stored notes, so both read them through this one function.
 * When to use: `readSideCombatRecords` and `readSideAgreementViews`, with the turn now being played.
 * Expected outcome: One entry per stored note row before `currentTurnNumber`, with the commander's own losses, every other owner's losses, and the losses of battles in that window. Empty when no note row exists.
 * Exceptions: Propagates a database error. Callers catch it.
 */
export function readCombatRecordTurns(seatId: AiSeatId, currentTurnNumber: number): CombatRecordTurn[] {
  const rows = getRecentTurnNotes(gameDbOps, seatId, 'strategic', '', currentTurnNumber);
  const battleByTurn = readStrategicBattleLossesByTurn(seatId, rows);
  logTrace('sideCombatRecordRead readCombatRecordTurns', { seatId, currentTurnNumber, rowCount: rows.length });
  // The stored columns are named from the human's point of view: the "human" column holds every other owner's losses.
  return rows.map((row) => ({
    turnNumber: row.turnNumber,
    ownLosses: parsePlayerLossSummaryJson(row.aiLossJson),
    otherLosses: parsePlayerLossSummaryJson(row.humanLossJson),
    battleLosses: battleByTurn.get(row.turnNumber) ?? [],
  }));
}

/**
 * Reads the record of one commander against each other active side.
 *
 * Purpose: The talk prompt and the orders prompt show the evidence next to each stance. The window is the one Recent Turn Notes prints, so both agree.
 * When to use: `readTalkSides`, before either prompt is built.
 * Expected outcome: A map from side id to its record view, for every other active seat. Empty when no strategic note row exists before the turn, or on any error, so the prompts print as they did before.
 * Exceptions: None. A failure is logged.
 */
export function readSideCombatRecords(seatId: AiSeatId, currentTurnNumber: number): ReadonlyMap<string, SideCombatRecordView> {
  try {
    const turns = readCombatRecordTurns(seatId, currentTurnNumber);
    const sideIds = activeSeats(readSeatRoster(gameDbOps))
      .filter((seat) => isSeatId(seat.seatId) && seat.seatId !== seatId)
      .map((seat) => seat.seatId);
    const set = buildSideCombatRecords({ ownSeatId: seatId, sideIds, turns });
    logDebug('sideCombatRecordRead readSideCombatRecords', {
      seatId,
      currentTurnNumber,
      rowCount: turns.length,
      sideCount: set?.records.length ?? 0,
    });
    const views = new Map<string, SideCombatRecordView>();
    if (!set) return views;
    for (const record of set.records) {
      if (!isSeatId(record.sideId)) continue;
      views.set(record.sideId, {
        text: formatSideCombatRecord({ record, sideCode: playerIdCodeFor(record.sideId), firstTurn: set.firstTurn, lastTurn: set.lastTurn }),
        latestTurnAttackedYou: record.latestTurnAttackedYou,
        latestTurnStruckYou: record.latestTurnStruckYou,
      });
    }
    return views;
  } catch (err) {
    logError('sideCombatRecordRead readSideCombatRecords failed', { seatId, currentTurnNumber, err });
    return new Map();
  }
}
