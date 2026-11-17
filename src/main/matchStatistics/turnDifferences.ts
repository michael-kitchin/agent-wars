/**
 * Units lost and hexes taken between two strategic turns.
 *
 * Purpose: Both numbers are differences from the previous turn. The previous turn's detail is kept in memory, not in the save, so the first turn after a load has no difference.
 * When to use: From `recordTurnStatistics`, once per strategic step.
 * Expected outcome: A per-seat loss count and a list of captures, or null when the previous turn is not known.
 * Exceptions: None from the difference functions. `readTurnOwnership` propagates a SQLite error.
 */

import type { BasicDbOps } from '../gameDb/dbOps';
import { logDebug, logTrace } from '../logger';
import type { HexesTaken } from '../../shared/matchStatistics';

/**
 * Who owned each unit and who controlled each hex at one strategic turn.
 *
 * Contract: `hexControllerById` holds controlled hexes only. `matchGeneration` is the generation the data was read in.
 * When to use: Comparing two consecutive turns.
 * Expected outcome: A frozen view of ownership at one turn boundary.
 * Exceptions: None.
 */
export interface TurnOwnership {
  /**
   * The match generation the data was read in.
   *
   * Contract: From `getMatchGeneration`.
   * When to use: Refusing to compare across a new or loaded match.
   * Expected outcome: A whole number.
   * Exceptions: None.
   */
  readonly matchGeneration: number;
  /**
   * The strategic turn the data describes.
   *
   * Contract: The turn of the step it was read at.
   * When to use: Refusing to compare turns that are not consecutive.
   * Expected outcome: A turn number.
   * Exceptions: None.
   */
  readonly turnNumber: number;
  /**
   * The owner of each unit, by unit id.
   *
   * Contract: Every unit in the match, Neutral included.
   * When to use: Finding units that vanished or changed owner.
   * Expected outcome: A map from unit id to owner id.
   * Exceptions: None.
   */
  readonly unitOwnerById: ReadonlyMap<string, string>;
  /**
   * The controller of each controlled hex, by hex index.
   *
   * Contract: Hexes with no controller are absent.
   * When to use: Finding hexes that changed hands.
   * Expected outcome: A map from hex index to controller id.
   * Exceptions: None.
   */
  readonly hexControllerById: ReadonlyMap<string, string>;
}

/**
 * The ownership kept for the last two turns of one match generation.
 *
 * Purpose: The next turn compares against the turn before it. Two entries cover that, and the second turn of a battle replaces the first.
 * When to use: Only through the remember functions.
 * Expected outcome: At most two entries.
 * Exceptions: None.
 */
let remembered: TurnOwnership[] = [];

/**
 * Reads who owns each unit and each controlled hex.
 *
 * Purpose: One snapshot is the unit of comparison between two turns.
 * When to use: At a strategic step, after the turn's frame is written.
 * Expected outcome: Maps built from `units` and `res_s_control`.
 * Exceptions: Propagates a SQLite error.
 */
export function readTurnOwnership(ops: BasicDbOps, turnNumber: number, matchGeneration: number): TurnOwnership {
  logTrace('turnDifferences readTurnOwnership', { turnNumber, matchGeneration });
  const units = ops.getAll<{ id: string; player: string }>('SELECT id, player FROM units');
  const hexes = ops.getAll<{ h3_index: string; controller_player_id: string | null }>(
    'SELECT h3_index, controller_player_id FROM res_s_control WHERE controller_player_id IS NOT NULL'
  );
  return {
    matchGeneration,
    turnNumber,
    unitOwnerById: new Map(units.map((row) => [row.id, row.player])),
    hexControllerById: new Map(hexes.map((row) => [row.h3_index, row.controller_player_id as string])),
  };
}

/**
 * Reports whether `previous` is the turn directly before `current` in the same match.
 *
 * Purpose: A difference across a gap, or across a new match, would be wrong.
 * When to use: Before either difference is computed.
 * Expected outcome: True when the generations match and the turn numbers differ by exactly one.
 * Exceptions: None.
 */
function isDirectPredecessor(previous: TurnOwnership | null, current: TurnOwnership): previous is TurnOwnership {
  return (
    previous !== null &&
    previous.matchGeneration === current.matchGeneration &&
    current.turnNumber === previous.turnNumber + 1
  );
}

/**
 * Counts the units each seat had last turn and no longer has.
 *
 * Purpose: Units lost per turn is an ownership difference. A mercenary that deserted counts as lost. A missile that was launched does not, because a launch deletes it (`spendMissile`) and a spent missile is not a loss. A missile destroyed in combat does.
 * When to use: With the remembered previous turn, the turn just read, and the missiles launched in between (`takeSpentMissileIds`).
 * Expected outcome: A count for every seat in `seatIds`, or null when `previous` is null, from another match, or not directly before `current`. A unit that changed owner counts for its old owner whatever its type. A vanished unit in `spentMissileIds` is not counted.
 * Exceptions: None.
 */
export function unitsLostBySeat(
  previous: TurnOwnership | null,
  current: TurnOwnership,
  seatIds: readonly string[],
  spentMissileIds: ReadonlySet<string>
): Map<string, number> | null {
  logTrace('turnDifferences unitsLostBySeat', { turnNumber: current.turnNumber, seatCount: seatIds.length });
  if (!isDirectPredecessor(previous, current)) return null;
  const lost = new Map(seatIds.map((seatId) => [seatId, 0]));
  for (const [unitId, owner] of previous.unitOwnerById) {
    const currentOwner = current.unitOwnerById.get(unitId);
    if (currentOwner === owner) continue;
    if (currentOwner === undefined && spentMissileIds.has(unitId)) continue;
    const count = lost.get(owner);
    if (count !== undefined) lost.set(owner, count + 1);
  }
  return lost;
}

/**
 * Lists the hexes one seat took from another since last turn.
 *
 * Purpose: Hexes taken is a relationship metric. A hex that fell to no one, or came from Neutral, is not a capture.
 * When to use: With the remembered previous turn and the turn just read.
 * Expected outcome: One entry per ordered pair of different seats with a count above 0, or null when `previous` is null, from another match, or not directly before `current`.
 * Exceptions: None.
 */
export function hexesTakenBetween(
  previous: TurnOwnership | null,
  current: TurnOwnership,
  seatIds: readonly string[]
): HexesTaken[] | null {
  logTrace('turnDifferences hexesTakenBetween', { turnNumber: current.turnNumber, seatCount: seatIds.length });
  if (!isDirectPredecessor(previous, current)) return null;
  const seats = new Set(seatIds);
  const counts = new Map<string, HexesTaken>();
  for (const [hexId, loser] of previous.hexControllerById) {
    const taker = current.hexControllerById.get(hexId);
    if (taker === undefined || taker === loser || !seats.has(taker) || !seats.has(loser)) continue;
    const key = `${taker}>${loser}`;
    const entry = counts.get(key) ?? { bySeatId: taker, fromSeatId: loser, hexes: 0 };
    counts.set(key, { ...entry, hexes: entry.hexes + 1 });
  }
  return [...counts.values()];
}

/**
 * Keeps one turn's ownership for the next turn to compare against.
 *
 * Purpose: A turn with a battle writes two strategic steps, and the later one replaces the earlier for that turn.
 * When to use: After `recordTurnStatistics` has compared the turn.
 * Expected outcome: The entry for `next.turnNumber` is replaced, entries of another match generation are dropped, and entries older than the turn before `next` are dropped.
 * Exceptions: None.
 */
export function rememberTurnOwnership(next: TurnOwnership): void {
  logDebug('turnDifferences rememberTurnOwnership', { turnNumber: next.turnNumber, matchGeneration: next.matchGeneration });
  remembered = [
    ...remembered.filter(
      (entry) =>
        entry.matchGeneration === next.matchGeneration &&
        entry.turnNumber !== next.turnNumber &&
        entry.turnNumber >= next.turnNumber - 1
    ),
    next,
  ];
}

/**
 * Looks up the remembered ownership for one turn.
 *
 * Purpose: The next turn asks for the turn before it.
 * When to use: At the start of `recordTurnStatistics`.
 * Expected outcome: The entry for that turn and generation, or null.
 * Exceptions: None.
 */
export function rememberedTurnOwnership(turnNumber: number, matchGeneration: number): TurnOwnership | null {
  logTrace('turnDifferences rememberedTurnOwnership', { turnNumber, matchGeneration });
  return remembered.find((entry) => entry.turnNumber === turnNumber && entry.matchGeneration === matchGeneration) ?? null;
}

/**
 * Clears everything remembered.
 *
 * Purpose: Tests start each case with no previous turn.
 * When to use: A test only.
 * Expected outcome: No remembered turns.
 * Exceptions: None.
 */
export function forgetTurnOwnershipForTests(): void {
  logDebug('turnDifferences forgetTurnOwnershipForTests');
  remembered = [];
}
