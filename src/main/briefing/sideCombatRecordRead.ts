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
import { logDebug, logError } from '../logger';
import { buildSideCombatRecords, type CombatRecordTurn } from './sideCombatRecord';
import { formatSideCombatRecord } from './sideCombatRecordText';
import { readStrategicBattleLossesByTurn } from './strategicLossWindow';

/**
 * One side's record as the prompts use it.
 *
 * Purpose: The prompts print the text, and the optional conflict check needs the latest attack.
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
    const rows = getRecentTurnNotes(gameDbOps, seatId, 'strategic', '', currentTurnNumber);
    const battleByTurn = readStrategicBattleLossesByTurn(seatId, rows);
    // The stored columns are named from the human's point of view: the "human" column holds every other owner's losses.
    const turns: CombatRecordTurn[] = rows.map((row) => ({
      turnNumber: row.turnNumber,
      ownLosses: parsePlayerLossSummaryJson(row.aiLossJson),
      otherLosses: parsePlayerLossSummaryJson(row.humanLossJson),
      battleLosses: battleByTurn.get(row.turnNumber) ?? [],
    }));
    const sideIds = activeSeats(readSeatRoster(gameDbOps))
      .filter((seat) => isSeatId(seat.seatId) && seat.seatId !== seatId)
      .map((seat) => seat.seatId);
    const set = buildSideCombatRecords({ ownSeatId: seatId, sideIds, turns });
    logDebug('sideCombatRecordRead readSideCombatRecords', {
      seatId,
      currentTurnNumber,
      rowCount: rows.length,
      sideCount: set?.records.length ?? 0,
    });
    const views = new Map<string, SideCombatRecordView>();
    if (!set) return views;
    for (const record of set.records) {
      if (!isSeatId(record.sideId)) continue;
      views.set(record.sideId, {
        text: formatSideCombatRecord({ record, sideCode: playerIdCodeFor(record.sideId), firstTurn: set.firstTurn, lastTurn: set.lastTurn }),
        latestTurnAttackedYou: record.latestTurnAttackedYou,
      });
    }
    return views;
  } catch (err) {
    logError('sideCombatRecordRead readSideCombatRecords failed', { seatId, currentTurnNumber, err });
    return new Map();
  }
}
