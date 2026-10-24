/**
 * Seat ids and the Neutral owner id for a match of two to four sides.
 *
 * Purpose: One module owns the id strings so the rest of the game can import constants
 * instead of repeating them.
 * When to use: Any check or lookup of who owns a unit, a hex, or a seat row.
 * Expected outcome: Predicates accept only the ids declared here. Index helpers map
 * AI seats 1 through 4.
 * Exceptions: `aiSeatIdForIndex` throws `RangeError` outside 1..4. This module does not
 * import the main-process logger; it is pure shared code.
 */

/**
 * The one seat a person plays.
 *
 * Purpose: The stored id of the human seat, including in a two-sided match.
 * When to use: Roster writes, fog, and any comparison with `units.player`.
 * Expected outcome: The string `'human'`.
 * Exceptions: None.
 */
export const HUMAN_SEAT_ID = 'human' as const;

/**
 * AI seat ids in AI order.
 *
 * Purpose: The first AI seat keeps today's `'opponent'` id. Later AI seats follow it.
 * When to use: Index conversion and "is this an AI seat?" checks.
 * Expected outcome: Index 1 is `'opponent'`. Index 4 is `'opponent4'`.
 * Exceptions: None.
 */
export const AI_SEAT_IDS = ['opponent', 'opponent2', 'opponent3', 'opponent4'] as const;

/**
 * Owner id for neutral garrisons and neutral land.
 *
 * Purpose: Knocked-out units and the land they held use this owner. It is not a seat.
 * When to use: Control flips and unit-owner checks after a knockout.
 * Expected outcome: The string `'neutral'`.
 * Exceptions: None.
 */
export const NEUTRAL_OWNER_ID = 'neutral' as const;

/**
 * Fewest seats a match may have.
 *
 * Purpose: Setup rejects a one-seat match.
 * When to use: New-match validation.
 * Expected outcome: `2`.
 * Exceptions: None.
 */
export const MIN_SEATS = 2;

/**
 * Most seats a match may have.
 *
 * Purpose: Setup rejects a fifth seat. Observe mode can use all four AI ids.
 * When to use: New-match validation and row caps.
 * Expected outcome: `4`.
 * Exceptions: None.
 */
export const MAX_SEATS = 4;

/**
 * An AI seat id.
 *
 * Purpose: Narrows a string to one of `AI_SEAT_IDS`.
 * When to use: Commander and consult code that must not run for the human seat.
 * Expected outcome: `'opponent'` through `'opponent4'`.
 * Exceptions: None.
 */
export type AiSeatId = (typeof AI_SEAT_IDS)[number];

/**
 * A seat id: the human seat or an AI seat.
 *
 * Purpose: The id stored for a side that can win, lose, or consult.
 * When to use: Roster rows and seat-only collections. Neutral is an `OwnerId`, not a seat.
 * Expected outcome: `'human'` or an `AiSeatId`.
 * Exceptions: None.
 */
export type SeatId = typeof HUMAN_SEAT_ID | AiSeatId;

/**
 * A seat id or the Neutral owner.
 *
 * Purpose: Turn resolution takes one order set per owner, and Neutral is an owner.
 * When to use: Movement, control, and order maps.
 * Expected outcome: A `SeatId` or `'neutral'`.
 * Exceptions: None.
 */
export type OwnerId = SeatId | typeof NEUTRAL_OWNER_ID;

/**
 * Returns whether `value` is the human seat id.
 *
 * Purpose: Call sites can narrow a player string without comparing to a literal.
 * When to use: Before human-only order handling.
 * Expected outcome: `true` only for `'human'`.
 * Exceptions: None.
 */
export function isHumanSeatId(value: string): value is typeof HUMAN_SEAT_ID {
  return value === HUMAN_SEAT_ID;
}

/**
 * Returns whether `value` is an AI seat id.
 *
 * Purpose: Call sites can narrow a player string to a commander seat.
 * When to use: Before consults, doctrine, and AI order storage.
 * Expected outcome: `true` for `'opponent'` through `'opponent4'`.
 * Exceptions: None.
 */
export function isAiSeatId(value: string): value is AiSeatId {
  return (AI_SEAT_IDS as readonly string[]).includes(value);
}

/**
 * Returns whether `value` is a seat id.
 *
 * Purpose: Neutral and unknown strings are not seats. Production and fog use this.
 * When to use: Before treating a controller as a side that can build or see.
 * Expected outcome: `true` for the human seat and every AI seat id.
 * Exceptions: None.
 */
export function isSeatId(value: string): value is SeatId {
  return isHumanSeatId(value) || isAiSeatId(value);
}

/**
 * Returns whether `value` is the Neutral owner id.
 *
 * Purpose: Neutral land and neutral garrisons share one owner that is not a seat.
 * When to use: Control and garrison checks.
 * Expected outcome: `true` only for `'neutral'`.
 * Exceptions: None.
 */
export function isNeutralOwnerId(value: string): value is typeof NEUTRAL_OWNER_ID {
  return value === NEUTRAL_OWNER_ID;
}

/**
 * Returns whether `value` is a seat id or the Neutral owner.
 *
 * Purpose: Order and traversal maps key by owner, which includes Neutral.
 * When to use: Before recording movement for a unit owner.
 * Expected outcome: `true` for a seat id or `'neutral'`.
 * Exceptions: None.
 */
export function isOwnerId(value: string): value is OwnerId {
  return isSeatId(value) || isNeutralOwnerId(value);
}

/**
 * Maps an AI index to its seat id.
 *
 * Purpose: Row order of AI seats becomes the stored id. Index 1 stays `'opponent'`.
 * When to use: While resolving a new match's AI rows.
 * Expected outcome: 1 → `'opponent'`, 2 → `'opponent2'`, 3 → `'opponent3'`, 4 → `'opponent4'`.
 * Exceptions: Throws `RangeError` when `aiIndex` is not an integer from 1 to 4.
 */
export function aiSeatIdForIndex(aiIndex: number): AiSeatId {
  const seatId = AI_SEAT_IDS[aiIndex - 1];
  if (!Number.isInteger(aiIndex) || seatId === undefined) {
    throw new RangeError(`AI seat index must be from 1 to ${MAX_SEATS}, got ${aiIndex}`);
  }
  return seatId;
}

/**
 * Maps an AI seat id back to its index.
 *
 * Purpose: Unit-id prefixes and roster order need the 1-based AI index.
 * When to use: After a value has been read from a player column.
 * Expected outcome: `'opponent'` → 1, `'opponent3'` → 3. Anything else, including the
 * human seat and Neutral, returns null.
 * Exceptions: None.
 */
export function aiIndexForSeatId(seatId: string): number | null {
  const index = (AI_SEAT_IDS as readonly string[]).indexOf(seatId);
  return index < 0 ? null : index + 1;
}
