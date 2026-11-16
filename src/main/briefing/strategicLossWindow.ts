/**
 * Reads the units tactical battles destroyed in the turns of a strategic notes window.
 */

import { LOSS_CAUSE_KEYS, lostUnitIdsOf, type LostUnit } from '../../shared/lossSummary';
import { parsePlayerLossSummaryJson } from '../../shared/lossSummaryJson';
import type { AiSeatId } from '../../shared/seatIds';
import type { TurnNoteRow } from '../gameDb';
import { gameDbOps } from '../gameDb/dbConnection';
import { listStrategicBattleLossRows } from '../gameDb/turnNotesHistory';
import { logError, logTrace } from '../logger';

/**
 * Reads the battle losses of a window, one list per turn.
 *
 * Purpose: A parent destroyed whole in a battle is stored in its own strategic row, so the turn's own row does not hold it. Recent Turn Notes and the combat record both need it.
 * When to use: `buildRecentTurnNotesSection` for a strategic scope, and `readSideCombatRecords`, with the rows of the window.
 * Expected outcome: A map from turn number to that turn's battle losses of both columns, in battle order. A unit already in the turn's own row, a repeat across battles, and a unit with no id are left out. A turn with none is not in the map. Any error is logged and gives an empty map.
 * Exceptions: None.
 */
export function readStrategicBattleLossesByTurn(
  seatId: AiSeatId,
  rows: readonly TurnNoteRow[]
): ReadonlyMap<number, readonly LostUnit[]> {
  logTrace('strategicLossWindow readStrategicBattleLossesByTurn', { seatId, turnCount: rows.length });
  const byTurn = new Map<number, LostUnit[]>();
  try {
    const turnRows = new Map(rows.map((row) => [row.turnNumber, row] as const));
    const seen = new Map<number, Set<string>>();
    for (const battleRow of listStrategicBattleLossRows(gameDbOps, seatId, [...turnRows.keys()])) {
      const turnRow = turnRows.get(battleRow.turnNumber);
      const known =
        seen.get(battleRow.turnNumber) ??
        lostUnitIdsOf([parsePlayerLossSummaryJson(turnRow?.aiLossJson), parsePlayerLossSummaryJson(turnRow?.humanLossJson)]);
      seen.set(battleRow.turnNumber, known);
      const kept = byTurn.get(battleRow.turnNumber) ?? [];
      for (const json of [battleRow.ownLossJson, battleRow.otherLossJson]) {
        const summary = parsePlayerLossSummaryJson(json);
        for (const key of LOSS_CAUSE_KEYS) {
          for (const unit of summary[key]) {
            if (!unit.unitId || known.has(unit.unitId)) continue;
            known.add(unit.unitId);
            kept.push(unit);
          }
        }
      }
      if (kept.length > 0) byTurn.set(battleRow.turnNumber, kept);
    }
  } catch (err) {
    logError('strategicLossWindow readStrategicBattleLossesByTurn failed', { seatId, err });
    return new Map();
  }
  return byTurn;
}
