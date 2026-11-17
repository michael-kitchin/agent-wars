/**
 * Which turn limits a running match may still choose.
 *
 * Purpose: The match ends after the turn that reaches its limit resolves, so a limit equal to the current turn is still a real choice and a limit before it has passed. The in-match Game Options controls and their tests share this one decision.
 * When to use: Before offering the city-hexes rule and its turn limits during a match.
 * Expected outcome: Pure functions over `TURN_LIMIT_OPTIONS`. Nothing here reads or writes the page.
 * Exceptions: None.
 */

import { TURN_LIMIT_OPTIONS } from './victoryRules';

/**
 * The turn-limit choices open at one turn.
 *
 * Purpose: One answer for the limit list, the city-hexes rule, and the selected limit.
 * When to use: The result of `matchTurnLimitChoice`.
 * Expected outcome: See each field.
 * Exceptions: None.
 */
export interface MatchTurnLimitChoice {
  /**
   * The limits that have not passed.
   *
   * Contract: The entries of `TURN_LIMIT_OPTIONS` at or after the current turn, in the same order.
   * When to use: Enabling the turn-limit options.
   * Expected outcome: Possibly empty.
   * Exceptions: None.
   */
  readonly openLimits: readonly number[];
  /**
   * Whether the city-hexes rule can still be chosen.
   *
   * Contract: True exactly when `openLimits` is not empty.
   * When to use: Enabling the city-hexes victory option.
   * Expected outcome: A boolean.
   * Exceptions: None.
   */
  readonly cityHexesAvailable: boolean;
  /**
   * The limit the select should show.
   *
   * Contract: The chosen limit when it is open, otherwise the first open limit, or null when none is open.
   * When to use: Moving a selection off a limit that has passed.
   * Expected outcome: An entry of `openLimits`, or null.
   * Exceptions: None.
   */
  readonly selectedLimit: number | null;
}

/**
 * Decides which turn limits stay open at `currentTurn`.
 *
 * Purpose: Keeps the rule "a limit may equal the current turn but not precede it" in one tested place.
 * When to use: With the live match's turn and the limit the select shows now (null when it shows none).
 * Expected outcome: The open limits, whether city hexes is available, and the limit to select. Keeps `chosenLimit` when it is open; otherwise moves to the first open limit.
 * Exceptions: None.
 */
export function matchTurnLimitChoice(currentTurn: number, chosenLimit: number | null): MatchTurnLimitChoice {
  const openLimits: readonly number[] = TURN_LIMIT_OPTIONS.filter((turns) => turns >= currentTurn);
  const selectedLimit = chosenLimit !== null && openLimits.includes(chosenLimit) ? chosenLimit : (openLimits[0] ?? null);
  return { openLimits, cityHexesAvailable: openLimits.length > 0, selectedLimit };
}
