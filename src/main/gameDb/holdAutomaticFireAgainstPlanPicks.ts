/**
 * Which attacks of each AI seat's stored world-map plan the engine chose, kept in `game_config`.
 *
 * Purpose: A stored plan holds ordered and automatic attack rows alike. A later change to the `holdAutomaticFireAgainst`
 * list may only re-aim the rows the engine chose.
 * When to use: Staged when a world-map reply's attacks are merged, saved when that plan is stored, and read when the list
 * changes. A reply that is merged and then discarded must not change what is saved for the plan already stored.
 * Expected outcome: One row maps each seat id to the picks of its stored plan. A missing or unreadable row means no picks.
 * Exceptions: The writer propagates SQLite errors. The reader, the stage, and the commit never throw.
 */

import { gameDbOps } from './dbConnection';
import type { GameConfigKvDbOps } from './gameConfigKv';
import { selectGameConfigValue, upsertGameConfigValue } from './gameConfigRows';
import { logDebug, logError, logTrace } from '../logger';

/**
 * The `game_config` key of the picks.
 *
 * Contract: One JSON object from seat id to that seat's picks.
 * When to use: Reading, writing, and clearing the picks.
 * Expected outcome: Kept in save files. A new match deletes it.
 * Exceptions: None.
 */
export const HOLD_AUTOMATIC_FIRE_AGAINST_PLAN_PICKS_CONFIG_KEY = 'hold_automatic_fire_against_plan_picks';

/**
 * One attack the engine chose.
 *
 * Contract: The firing unit and the target hex, as the stored plan row holds them.
 * When to use: Matching a stored row.
 * Expected outcome: A row with the same pair was not ordered by the commander.
 * Exceptions: None.
 */
export interface PlanAttackPick {
  /**
   * The firing unit.
   *
   * Contract: A world-map unit id.
   * When to use: Matching a stored row.
   * Expected outcome: Compared exactly.
   * Exceptions: None.
   */
  readonly unitId: string;
  /**
   * The target.
   *
   * Contract: A world-map hex.
   * When to use: Matching a stored row.
   * Expected outcome: Compared exactly.
   * Exceptions: None.
   */
  readonly targetH3Index: string;
}

/**
 * The picks of the latest merged reply of each seat that is not saved yet, by seat id.
 *
 * Purpose: A merged reply can still be discarded, by a cancel or a newer consult, before its plan is stored.
 * When to use: Written by `stagePlanAttackPicks` and emptied by `commitPlanAttackPicks`.
 * Expected outcome: Held in memory only. A reply is merged and stored in the same run of the app.
 * Exceptions: None.
 */
const stagedPicks = new Map<string, readonly PlanAttackPick[]>();

/**
 * Reads every seat's picks.
 *
 * Purpose: One parse for the reader and the writer.
 * When to use: Inside this module.
 * Expected outcome: Only well-formed picks. An unreadable value is an empty map.
 * Exceptions: Propagates a SQLite error.
 */
function readAllPicks(ops: Pick<GameConfigKvDbOps, 'getOne'>): Map<string, PlanAttackPick[]> {
  const all = new Map<string, PlanAttackPick[]>();
  const raw = selectGameConfigValue(ops, HOLD_AUTOMATIC_FIRE_AGAINST_PLAN_PICKS_CONFIG_KEY);
  if (raw == null) return all;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return all;
    for (const [seatId, value] of Object.entries(parsed)) {
      if (!Array.isArray(value)) continue;
      all.set(seatId, value.filter((pick): pick is PlanAttackPick =>
        typeof (pick as PlanAttackPick | null)?.unitId === 'string' &&
        typeof (pick as PlanAttackPick).targetH3Index === 'string'));
    }
  } catch (err) {
    logError('holdAutomaticFireAgainstPlanPicks readAllPicks: could not parse stored value', { rawLength: raw.length }, err);
  }
  return all;
}

/**
 * One seat's picks.
 *
 * Purpose: Tells automatic rows of a stored plan from ordered ones.
 * When to use: When the seat's list changes.
 * Expected outcome: The stored picks, or none.
 * Exceptions: None; a read failure is logged and reads as no picks, which leaves the stored plan as it is.
 */
export function readPlanAttackPicks(seatId: string): readonly PlanAttackPick[] {
  logTrace('holdAutomaticFireAgainstPlanPicks readPlanAttackPicks', { seatId });
  try {
    return readAllPicks(gameDbOps).get(seatId) ?? [];
  } catch (err) {
    logError('holdAutomaticFireAgainstPlanPicks readPlanAttackPicks', { seatId }, err);
    return [];
  }
}

/**
 * Replaces one seat's picks.
 *
 * Purpose: The saved picks always describe the stored plan.
 * When to use: Through `commitPlanAttackPicks`, and after a stored plan is re-aimed.
 * Expected outcome: Other seats keep theirs.
 * Exceptions: Propagates a SQLite error.
 */
export function writePlanAttackPicks(seatId: string, picks: readonly PlanAttackPick[]): void {
  logDebug('holdAutomaticFireAgainstPlanPicks writePlanAttackPicks', { seatId, pickCount: picks.length });
  const all = readAllPicks(gameDbOps);
  all.set(seatId, picks.map(({ unitId, targetH3Index }) => ({ unitId, targetH3Index })));
  upsertGameConfigValue(gameDbOps, HOLD_AUTOMATIC_FIRE_AGAINST_PLAN_PICKS_CONFIG_KEY, JSON.stringify(Object.fromEntries(all)));
}

/**
 * Notes the engine's picks of one merged world-map reply, to be saved if its plan is stored.
 *
 * Purpose: A `pursue` order names its target, so its shot is not a pick even though a standing order generated it. The
 * sweep chooses its own targets, so every row it adds is a pick, whatever order its unit holds.
 * When to use: With the standing-order rows kept by the merge, and the sweep's rows.
 * Expected outcome: The seat's staged picks are the standing-order rows whose unit holds no `pursue` order, and every
 * swept row. The saved picks do not change.
 * Exceptions: None; a failure is logged so it never fails a consult.
 */
export function stagePlanAttackPicks(
  seatId: string,
  standingOrderRows: readonly PlanAttackPick[],
  sweptRows: readonly PlanAttackPick[]
): void {
  logDebug('holdAutomaticFireAgainstPlanPicks stagePlanAttackPicks', {
    seatId,
    standingOrderCount: standingOrderRows.length,
    sweptCount: sweptRows.length,
  });
  try {
    const pursuing = new Set(
      gameDbOps.getAll<{ unit_id: string }>(
        "SELECT unit_id FROM standing_orders WHERE player_id = ? AND order_type = 'pursue'",
        [seatId]
      ).map((row) => row.unit_id)
    );
    stagedPicks.set(seatId, [...standingOrderRows.filter((row) => !pursuing.has(row.unitId)), ...sweptRows]);
  } catch (err) {
    stagedPicks.delete(seatId);
    logError('holdAutomaticFireAgainstPlanPicks stagePlanAttackPicks', { seatId }, err);
  }
}

/**
 * Saves the staged picks as the picks of the plan just stored.
 *
 * Purpose: The saved picks change only together with the stored plan.
 * When to use: Directly after a consulted plan is stored.
 * Expected outcome: The seat's saved picks are its staged picks, or none when nothing is staged. The stage is emptied.
 * Exceptions: None; a failure is logged so it never fails the storing of a plan.
 */
export function commitPlanAttackPicks(seatId: string): void {
  const picks = stagedPicks.get(seatId) ?? [];
  logDebug('holdAutomaticFireAgainstPlanPicks commitPlanAttackPicks', { seatId, pickCount: picks.length });
  stagedPicks.delete(seatId);
  try {
    writePlanAttackPicks(seatId, picks);
  } catch (err) {
    logError('holdAutomaticFireAgainstPlanPicks commitPlanAttackPicks', { seatId }, err);
  }
}
