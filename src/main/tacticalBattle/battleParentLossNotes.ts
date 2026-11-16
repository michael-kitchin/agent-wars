/**
 * Writes the units a tactical battle destroys into every commander's strategic loss notes.
 */

import type { DestroyedBattleParent } from '../../shared/destroyedBattleParent';
import { isBuildUnitType } from '../../shared/ipc/productionTypes';
import { lostUnitIdsOf, type LostUnit } from '../../shared/lossSummary';
import { parsePlayerLossSummaryJson, serializePlayerLossSummary } from '../../shared/lossSummaryJson';
import { HUMAN_SEAT_ID, type AiSeatId, type OwnerId } from '../../shared/seatIds';
import { activeAiSeatIds } from '../../shared/seatRoster';
import { getSeatRoster, upsertTurnLossNote } from '../gameDb';
import { gameDbOps } from '../gameDb/dbConnection';
import { getTurnLossNoteColumns } from '../gameDb/turnNotesHistory';
import { logDebug, logError, logTrace } from '../logger';

/**
 * What a battle-loss write needs to know about the battle.
 *
 * Purpose: Names the row the losses go in and the two parties that decide who was responsible.
 * When to use: The argument of `writeBattleParentLossNotes`, built from the active battle snapshot.
 * Expected outcome: Mirrors the same-named fields of `TacticalBattleSnapshot`.
 * Exceptions: None.
 */
export interface BattleLossContext {
  /**
   * The battle that destroyed the units.
   *
   * Contract: The snapshot's `battleId`.
   * When to use: The `battle_id` of the strategic row, which keeps it apart from the turn's own row.
   * Expected outcome: Non-empty.
   * Exceptions: None.
   */
  readonly battleId: string;
  /**
   * The strategic turn the battle was fought in.
   *
   * Contract: The snapshot's `strategicTurnNumber`.
   * When to use: The `turn_number` of the strategic row, so the losses print in that turn's block.
   * Expected outcome: A positive integer.
   * Exceptions: None.
   */
  readonly strategicTurnNumber: number;
  /**
   * The lead party of an AI-versus-AI battle.
   *
   * Contract: Absent in a human battle, where the human is the other party.
   * When to use: Working out which party destroyed a unit.
   * Expected outcome: Not the same owner as `opposingPartyId`.
   * Exceptions: None.
   */
  readonly leadPartyId?: OwnerId;
  /**
   * The party opposing the lead party, or the human.
   *
   * Contract: Absent only on a snapshot saved before this field existed.
   * When to use: Working out which party destroyed a unit.
   * Expected outcome: When missing, no side is credited.
   * Exceptions: None.
   */
  readonly opposingPartyId?: OwnerId;
}

/**
 * Names the side that destroyed a unit of the given owner in this battle.
 *
 * Purpose: A battle has exactly two parties, so the side responsible is the other party.
 * When to use: `battleParentLostUnit`, once per destroyed parent.
 * Expected outcome: The other party as a one-item list, or null when the owner is not a party or the battle has no opposing party.
 * Exceptions: None.
 */
export function battleLossResponsibleOwnerIds(context: BattleLossContext, victimOwnerId: string): readonly string[] | null {
  logTrace('battleParentLossNotes battleLossResponsibleOwnerIds', { battleId: context.battleId, victimOwnerId });
  const opposing = context.opposingPartyId;
  if (!opposing) return null;
  const other = context.leadPartyId ?? HUMAN_SEAT_ID;
  if (victimOwnerId === opposing) return [other];
  if (victimOwnerId === other) return [opposing];
  return null;
}

/**
 * Turns a destroyed parent into a loss row.
 *
 * Purpose: Loss notes hold units with an id and an attribution, and a battle loss has no killer units.
 * When to use: `writeBattleParentLossNotes`, once per destroyed parent.
 * Expected outcome: A unit with its id and attribution, or null when the type is not a buildable unit type.
 * Exceptions: None.
 */
export function battleParentLostUnit(parent: DestroyedBattleParent, context: BattleLossContext): LostUnit | null {
  logTrace('battleParentLossNotes battleParentLostUnit', { battleId: context.battleId, unitId: parent.id });
  if (!isBuildUnitType(parent.unitType)) return null;
  return {
    displayName: parent.displayName,
    unitType: parent.unitType,
    unitId: parent.id,
    attribution: {
      ownerId: parent.ownerId,
      lossH3Index: parent.h3Index.length > 0 ? parent.h3Index : null,
      responsibleOwnerIds: battleLossResponsibleOwnerIds(context, parent.ownerId),
      killerUnits: [],
    },
  };
}

/**
 * Writes the new units into one commander's battle row.
 *
 * Purpose: The commander's own parents go in its own column and every other owner's in the other column, as for a normal turn row.
 * When to use: `writeBattleParentLossNotes`, once per active AI seat.
 * Expected outcome: The row for this battle and turn holds its old units plus the new ones, each unit once.
 * Exceptions: Propagates a SQLite error to the caller, which logs it.
 */
function mergeBattleLossesForSeat(seatId: AiSeatId, units: readonly LostUnit[], context: BattleLossContext): void {
  const stored = getTurnLossNoteColumns(gameDbOps, {
    seatId,
    scope: 'strategic',
    battleId: context.battleId,
    turnNumber: context.strategicTurnNumber,
  });
  // A row that does not exist yet parses as no losses.
  let own = parsePlayerLossSummaryJson(stored?.ownLossJson);
  let others = parsePlayerLossSummaryJson(stored?.otherLossJson);
  const seen = lostUnitIdsOf([own, others]);
  for (const unit of units) {
    if (unit.unitId && seen.has(unit.unitId)) continue;
    if (unit.unitId) seen.add(unit.unitId);
    if (unit.attribution?.ownerId === seatId) own = { ...own, other: [...own.other, unit] };
    else others = { ...others, other: [...others.other, unit] };
  }
  upsertTurnLossNote(
    seatId,
    'strategic',
    context.battleId,
    context.strategicTurnNumber,
    serializePlayerLossSummary(own),
    serializePlayerLossSummary(others)
  );
}

/**
 * Writes the parents a battle destroyed into every active commander's strategic loss notes.
 *
 * Purpose: A parent destroyed whole in a battle never reaches the turn's resolution loss capture, so the commanders' Recent Turn Notes and combat record would miss it.
 * When to use: `recordDestroyedBattleParents`, each time a battle deletes strategic parents. The write happens then, not at battle end, so a mid-battle save keeps it.
 * Expected outcome: Each active AI seat has a strategic row for this battle id and turn that lists the units. The turn's own row is not touched. An empty list writes nothing.
 * Exceptions: None. A failure is logged and the battle continues.
 */
export function writeBattleParentLossNotes(parents: readonly DestroyedBattleParent[], context: BattleLossContext): void {
  logDebug('battleParentLossNotes writeBattleParentLossNotes', {
    battleId: context.battleId,
    turnNumber: context.strategicTurnNumber,
    parentCount: parents.length,
  });
  try {
    const units = parents.flatMap((parent) => battleParentLostUnit(parent, context) ?? []);
    if (units.length === 0) return;
    for (const seatId of activeAiSeatIds(getSeatRoster())) mergeBattleLossesForSeat(seatId, units, context);
  } catch (err) {
    logError('battleParentLossNotes writeBattleParentLossNotes failed', {
      battleId: context.battleId,
      turnNumber: context.strategicTurnNumber,
      err,
    });
  }
}
