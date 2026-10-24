/**
 * Decides knockouts, places, and whether the match is over.
 *
 * Purpose: Every match, including a two-sided one, uses the same end-of-turn rules.
 * When to use: After combat, production, and control for the turn that just resolved. This module does not touch the database.
 * Expected outcome: Knockouts for this turn, or a finished match when nobody would be left or the turn limit has arrived.
 * Exceptions: None.
 */

import { activeSeats, type SeatOutReason, type SeatRecord } from '../../shared/seatRoster';
import type { SeatId } from '../../shared/seatIds';
import { rankSeatsByCityHexes, type GameEndReason, type VictorySettings } from '../../shared/victoryRules';
import { logDebug } from '../logger';

/**
 * Facts the end-of-turn rules need, gathered by the caller.
 *
 * Contract: `seats` is the roster before this turn's outcome. `turnNumber` is the turn that just resolved.
 * When to use: `decideEndOfTurnOutcome`.
 * Expected outcome: Lambdas answer from that same end-of-turn state.
 * Exceptions: None.
 */
export interface EndOfTurnOutcomeInput {
  /**
   * The turn that just resolved.
   *
   * Contract: Compared with `victory.turnLimit` when the match uses a turn limit.
   * When to use: The turn-limit and mutual-wipe checks.
   * Expected outcome: A positive integer.
   * Exceptions: None.
   */
  readonly turnNumber: number;
  /**
   * The roster before this turn's outcome is applied.
   *
   * Contract: Seats with `outTurn` set are already out and are not judged again.
   * When to use: Choosing who can be knocked out and who can be credited.
   * Expected outcome: The stored roster, including seats already out.
   * Exceptions: None.
   */
  readonly seats: readonly SeatRecord[];
  /**
   * The match's win rule and turn limit.
   *
   * Contract: A null turn limit never ends the match by turn count.
   * When to use: The turn-limit check.
   * Expected outcome: The settings stored at the start of the match.
   * Exceptions: None.
   */
  readonly victory: VictorySettings;
  /**
   * Whether one active seat meets the home-control rule against another.
   *
   * Contract: True only when `attacker` meets `computeHomeControlProgress(...).controlWinMet` against `victim`'s home.
   * When to use: Reason `home_control`, and `outBy` when that reason holds.
   * Expected outcome: True or false. The callee is not asked about a seat that is already out.
   * Exceptions: The callee's exceptions propagate.
   */
  readonly controlWinMet: (attacker: SeatId, victim: SeatId) => boolean;
  /**
   * City hexes each seat controls.
   *
   * Contract: A missing seat counts as zero. Neutral is not a key.
   * When to use: Reason `no_city_hexes` and city-hex ranking.
   * Expected outcome: A count per seat that holds at least one city hex.
   * Exceptions: None.
   */
  readonly cityHexCountBySeat: ReadonlyMap<string, number>;
  /**
   * Intact urban cells left in each seat's home.
   *
   * Contract: A missing seat counts as zero.
   * When to use: Reason `home_cities_destroyed`.
   * Expected outcome: The current urban sum of that home, not the generated baseline.
   * Exceptions: None.
   */
  readonly intactHomeUrbanCellsBySeat: ReadonlyMap<string, number>;
  /**
   * Home city cells of `victim` that `controller` holds.
   *
   * Contract: Generated urban cells in the victim's home on hexes `controller` controls.
   * When to use: `outBy` when `home_control` is not among the reasons.
   * Expected outcome: A non-negative integer.
   * Exceptions: The callee's exceptions propagate.
   */
  readonly homeCityCellsControlledBy: (victim: SeatId, controller: SeatId) => number;
}

/**
 * One seat knocked out on this turn.
 *
 * Contract: `reasons` lists every reason that held, in record order. `place` is shared by every seat out on this turn.
 * When to use: Recording the roster row and the ready result.
 * Expected outcome: `outBy` is one seat, or null when no seat is credited.
 * Exceptions: None.
 */
export interface SeatKnockout {
  /**
   * The seat that is out.
   *
   * Contract: An active seat at the start of the decision.
   * When to use: The roster update.
   * Expected outcome: A `SeatId`.
   * Exceptions: None.
   */
  readonly seatId: SeatId;
  /**
   * The seat credited with the knockout.
   *
   * Contract: The control-rule seat when `home_control` holds. Otherwise the active seat holding the most of this seat's home city cells, or null when that count is 0.
   * When to use: The roster's `out_by`.
   * Expected outcome: A `SeatId` or null.
   * Exceptions: None.
   */
  readonly outBy: SeatId | null;
  /**
   * Every knockout reason that held.
   *
   * Contract: `home_control`, then `no_city_hexes`, then `home_cities_destroyed`, keeping only those that held.
   * When to use: The roster's `out_reasons`.
   * Expected outcome: A non-empty list.
   * Exceptions: None.
   */
  readonly reasons: readonly SeatOutReason[];
  /**
   * Shared place for every seat knocked out on this turn.
   *
   * Contract: One more than the number of seats still active after this turn's knockouts.
   * When to use: The roster's `place`.
   * Expected outcome: An integer from 2 to 4.
   * Exceptions: None.
   */
  readonly place: number;
}

/**
 * The end-of-turn decision.
 *
 * Contract: A mutual wipe has an empty `knockouts` list and a finished match. Places of seats already out are not in `finalPlaces`.
 * When to use: Recording the roster and the game-over flags.
 * Expected outcome: `winnerSeatId` is the only seat in place 1, or null when nobody or several share it.
 * Exceptions: None.
 */
export interface EndOfTurnOutcome {
  /**
   * Seats knocked out on this turn.
   *
   * Contract: Empty when a wipe is cancelled or nobody qualified.
   * When to use: Roster updates. Seats already out are absent.
   * Expected outcome: The knockouts decided together from one end-of-turn state.
   * Exceptions: None.
   */
  readonly knockouts: readonly SeatKnockout[];
  /**
   * Whether the match ends on this turn.
   *
   * Contract: True for last side standing, the turn limit, a mutual wipe, or the human ending the match.
   * When to use: Writing `game_over`.
   * Expected outcome: True only when play should stop.
   * Exceptions: None.
   */
  readonly gameOver: boolean;
  /**
   * Why the match ended, or null when it continues.
   *
   * Contract: Null when `gameOver` is false. `ended_by_human` is not chosen by the knockout rules.
   * When to use: Writing `game_end_reason`.
   * Expected outcome: A `GameEndReason` or null.
   * Exceptions: None.
   */
  readonly endReason: GameEndReason | null;
  /**
   * Places of the seats that were still active when the match ended.
   *
   * Contract: Empty when the match is not over. A mutual wipe ranks the seats that would have been knocked out.
   * When to use: Writing `place` for seats that were not knocked out on this turn.
   * Expected outcome: Place 1 is the best city-hex count, or the last side standing.
   * Exceptions: None.
   */
  readonly finalPlaces: ReadonlyMap<SeatId, number>;
  /**
   * The one seat in first place.
   *
   * Contract: Null when the match is not over or several seats share place 1.
   * When to use: Writing `winner`.
   * Expected outcome: A `SeatId` or null.
   * Exceptions: None.
   */
  readonly winnerSeatId: SeatId | null;
}

/**
 * The single seat in place 1, or null when none or several share it.
 *
 * Purpose: A tie leaves no single winner.
 * When to use: After `rankSeatsByCityHexes` or after placing the last side standing.
 * Expected outcome: The only seat whose place is 1, or null.
 * Exceptions: None.
 */
function soleFirstPlace(places: ReadonlyMap<SeatId, number>): SeatId | null {
  const first = [...places.entries()].filter(([, place]) => place === 1);
  return first.length === 1 ? first[0]![0] : null;
}

/**
 * Whether this turn is the global turn limit.
 *
 * Purpose: A mutual wipe on that turn keeps the turn-limit reason.
 * When to use: After the knockout list is known.
 * Expected outcome: True only for the city-hex rule once the turn number has reached the limit.
 * Exceptions: None.
 */
function turnLimitReached(victory: VictorySettings, turnNumber: number): boolean {
  return victory.rule === 'most_city_hexes_at_turn_limit'
    && victory.turnLimit !== null
    && turnNumber >= victory.turnLimit;
}

/**
 * Decides knockouts, places, and whether the match ends.
 *
 * Purpose: One pass over the active seats, from the same end-of-turn state.
 * When to use: `evaluateEndOfTurnOutcome` after it has gathered the database facts.
 * Expected outcome: The outcome described by the knockout and victory rules. A wipe cancels every knockout and ends the match.
 * Exceptions: Propagates exceptions from the input lambdas.
 */
export function decideEndOfTurnOutcome(input: EndOfTurnOutcomeInput): EndOfTurnOutcome {
  const active = activeSeats(input.seats);
  logDebug('decideEndOfTurnOutcome', { turnNumber: input.turnNumber, activeCount: active.length, rule: input.victory.rule });
  const reasonsFor = (victim: SeatRecord): SeatOutReason[] => {
    const reasons: SeatOutReason[] = [];
    const controlled = active.some((attacker) => attacker.seatId !== victim.seatId && input.controlWinMet(attacker.seatId, victim.seatId));
    if (controlled) reasons.push('home_control');
    if ((input.cityHexCountBySeat.get(victim.seatId) ?? 0) === 0) reasons.push('no_city_hexes');
    if ((input.intactHomeUrbanCellsBySeat.get(victim.seatId) ?? 0) === 0) reasons.push('home_cities_destroyed');
    return reasons;
  };
  const outByFor = (victim: SeatRecord, reasons: readonly SeatOutReason[]): SeatId | null => {
    const others = active.filter((seat) => seat.seatId !== victim.seatId);
    if (reasons.includes('home_control')) {
      return others.find((seat) => input.controlWinMet(seat.seatId, victim.seatId))?.seatId ?? null;
    }
    let best: SeatId | null = null;
    let bestCount = 0;
    for (const seat of others) {
      const count = input.homeCityCellsControlledBy(victim.seatId, seat.seatId);
      if (count > bestCount) {
        best = seat.seatId;
        bestCount = count;
      }
    }
    return best;
  };
  const qualified = active.flatMap((seat) => {
    const reasons = reasonsFor(seat);
    return reasons.length === 0 ? [] : [{ seat, reasons }];
  });
  if (active.length > 0 && qualified.length === active.length) {
    const finalPlaces = rankSeatsByCityHexes(active.map((seat) => seat.seatId), input.cityHexCountBySeat);
    const endReason: GameEndReason = turnLimitReached(input.victory, input.turnNumber) ? 'turn_limit' : 'mutual_elimination';
    logDebug('decideEndOfTurnOutcome: mutual wipe', { endReason, placeCount: finalPlaces.size });
    return { knockouts: [], gameOver: true, endReason, finalPlaces, winnerSeatId: soleFirstPlace(finalPlaces) };
  }
  const place = active.length - qualified.length + 1;
  const knockouts: SeatKnockout[] = qualified.map(({ seat, reasons }) => ({
    seatId: seat.seatId,
    outBy: outByFor(seat, reasons),
    reasons,
    place,
  }));
  const remaining = active.filter((seat) => !qualified.some((row) => row.seat.seatId === seat.seatId));
  if (remaining.length === 1) {
    const winnerSeatId = remaining[0]!.seatId;
    const finalPlaces = new Map<SeatId, number>([[winnerSeatId, 1]]);
    logDebug('decideEndOfTurnOutcome: last side standing', { winnerSeatId, knockoutCount: knockouts.length });
    return { knockouts, gameOver: true, endReason: 'last_side_standing', finalPlaces, winnerSeatId };
  }
  if (turnLimitReached(input.victory, input.turnNumber)) {
    const finalPlaces = rankSeatsByCityHexes(remaining.map((seat) => seat.seatId), input.cityHexCountBySeat);
    logDebug('decideEndOfTurnOutcome: turn limit', { remaining: remaining.length });
    return { knockouts, gameOver: true, endReason: 'turn_limit', finalPlaces, winnerSeatId: soleFirstPlace(finalPlaces) };
  }
  logDebug('decideEndOfTurnOutcome: match continues', { knockoutCount: knockouts.length });
  return { knockouts, gameOver: false, endReason: null, finalPlaces: new Map(), winnerSeatId: null };
}
