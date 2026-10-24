/**
 * Win rule and turn limit for a match, and the city-hex count those rules use.
 *
 * Purpose: The global map ends on a turn limit. A regional map ends when one side is left.
 * When to use: Starting a match, reading the snapshot, and ranking seats by city hexes.
 * Expected outcome: Helpers do not read the database. Callers pass the rows they already have.
 * Exceptions: None. This module does not import the main-process logger.
 */

import { isSeatId, type SeatId } from './seatIds';

/**
 * The two ways a match can end by the rules.
 *
 * Purpose: One id is stored for the match. The interface offers the turn limit only on the global map.
 * When to use: New-game persistence and the end-of-turn check.
 * Expected outcome: `'last_side_standing'` or `'most_city_hexes_at_turn_limit'`.
 * Exceptions: None.
 */
export const VICTORY_RULES = ['last_side_standing', 'most_city_hexes_at_turn_limit'] as const;

/**
 * A stored win rule.
 *
 * Purpose: Narrows a config string to one of `VICTORY_RULES`.
 * When to use: Reading `victory_rule` and the snapshot.
 * Expected outcome: One of the two rule ids.
 * Exceptions: None.
 */
export type VictoryRule = (typeof VICTORY_RULES)[number];

/**
 * Turn limits the global map offers.
 *
 * Purpose: The new-game control and the stored limit share this list.
 * When to use: Validating a requested limit.
 * Expected outcome: 20, 30, 40, and 50.
 * Exceptions: None.
 */
export const TURN_LIMIT_OPTIONS = [20, 30, 40, 50] as const;

/**
 * Turn limit used when a global match does not name one of the offered values.
 *
 * Purpose: An absent or unknown request still starts a bounded match.
 * When to use: `victorySettingsForMapKind` for the global map.
 * Expected outcome: 30.
 * Exceptions: None.
 */
export const DEFAULT_TURN_LIMIT = 30;

/**
 * Why a finished match ended.
 *
 * Purpose: The snapshot and the stored `game_end_reason` share one list.
 * When to use: Recording the end of a match and reading it back.
 * Expected outcome: Last side standing, the turn limit, a mutual wipe, or the human ending the match.
 * Exceptions: None.
 */
export const GAME_END_REASONS = ['last_side_standing', 'turn_limit', 'mutual_elimination', 'ended_by_human'] as const;

/**
 * A stored reason the match ended.
 *
 * Purpose: Narrows `game_end_reason` to a known id.
 * When to use: The snapshot and end-of-turn recording.
 * Expected outcome: One of `GAME_END_REASONS`.
 * Exceptions: None.
 */
export type GameEndReason = (typeof GAME_END_REASONS)[number];

/**
 * The win rule and turn limit stored for one match.
 *
 * Contract: A regional match has a null turn limit. A global match has one of `TURN_LIMIT_OPTIONS`.
 * When to use: The snapshot and the end-of-turn check.
 * Expected outcome: `rule` and `turnLimit` agree with `victorySettingsForMapKind`.
 * Exceptions: None.
 */
export interface VictorySettings {
  /**
   * Which rule ends the match.
   *
   * Contract: `'last_side_standing'` on a regional map. `'most_city_hexes_at_turn_limit'` on the global map.
   * When to use: Deciding whether the turn limit can end the match.
   * Expected outcome: One of `VICTORY_RULES`.
   * Exceptions: None.
   */
  readonly rule: VictoryRule;
  /**
   * The global turn limit, or null when the match has none.
   *
   * Contract: Null for `last_side_standing`. One of `TURN_LIMIT_OPTIONS` otherwise.
   * When to use: Comparing the turn that just resolved with the limit.
   * Expected outcome: The stored limit.
   * Exceptions: None.
   */
  readonly turnLimit: number | null;
}

/**
 * Whether a number is one of the offered turn limits.
 *
 * Purpose: An unlisted request must not be stored.
 * When to use: `victorySettingsForMapKind`.
 * Expected outcome: True for 20, 30, 40, and 50.
 * Exceptions: None.
 */
function isTurnLimitOption(value: number): value is (typeof TURN_LIMIT_OPTIONS)[number] {
  return (TURN_LIMIT_OPTIONS as readonly number[]).includes(value);
}

/**
 * The win settings for a map kind.
 *
 * Purpose: A regional match has no turn limit. A global match ends by city hexes at a chosen limit.
 * When to use: When a match is started, before the settings are stored.
 * Expected outcome: Regional settings ignore the requested limit. A global limit that is not offered becomes 30.
 * Exceptions: None.
 */
export function victorySettingsForMapKind(
  mapKind: 'global' | 'regional',
  requestedTurnLimit: number | undefined
): VictorySettings {
  if (mapKind === 'regional') return { rule: 'last_side_standing', turnLimit: null };
  const turnLimit = requestedTurnLimit !== undefined && isTurnLimitOption(requestedTurnLimit)
    ? requestedTurnLimit
    : DEFAULT_TURN_LIMIT;
  return { rule: 'most_city_hexes_at_turn_limit', turnLimit };
}

/**
 * Counts city hexes held by each seat.
 *
 * Purpose: The turn-limit ranking uses strategic hexes a seat controls whose urban count is above zero.
 * When to use: With the control rows and the infrastructure rows already loaded.
 * Expected outcome: A count per seat that holds at least one such hex. Neutral and an empty controller are omitted.
 * Exceptions: None.
 */
export function countCityHexesBySeat(
  control: readonly { readonly h3Index: string; readonly controllerPlayerId: string | null }[],
  infrastructure: readonly { readonly h3Index: string; readonly urbanHexCount: number }[]
): Map<string, number> {
  const urbanByHex = new Map(infrastructure.map((row) => [row.h3Index, row.urbanHexCount]));
  const counts = new Map<string, number>();
  for (const row of control) {
    if (!row.controllerPlayerId || !isSeatId(row.controllerPlayerId)) continue;
    if ((urbanByHex.get(row.h3Index) ?? 0) <= 0) continue;
    counts.set(row.controllerPlayerId, (counts.get(row.controllerPlayerId) ?? 0) + 1);
  }
  return counts;
}

/**
 * Ranks seats by city hexes held.
 *
 * Purpose: Ties share a place. A seat with fewer city hexes ranks lower.
 * When to use: The turn limit, a mutual wipe, and the Cities readout.
 * Expected outcome: Each seat's place is 1 plus the number of seats in the list with strictly more city hexes. A missing count is zero.
 * Exceptions: None.
 */
export function rankSeatsByCityHexes(
  seatIds: readonly SeatId[],
  cityHexCountBySeat: ReadonlyMap<string, number>
): Map<SeatId, number> {
  const places = new Map<SeatId, number>();
  for (const seatId of seatIds) {
    const held = cityHexCountBySeat.get(seatId) ?? 0;
    const better = seatIds.filter((other) => (cityHexCountBySeat.get(other) ?? 0) > held).length;
    places.set(seatId, 1 + better);
  }
  return places;
}
