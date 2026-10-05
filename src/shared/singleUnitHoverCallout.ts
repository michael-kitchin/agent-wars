/**
 * Decides whether a resting pointer should show the Bonuses tooltip for a one-unit token.
 *
 * Purpose: Keeps the token-tooltip rule testable without the map timer or the DOM.
 * When to use: The map pointer handler, once per move, after the hex under the pointer is known.
 * Expected outcome: A one-unit token arms the Bonuses tooltip. A stack, or the rest of a one-unit hex, does not.
 * Exceptions: None.
 */

/**
 * What the map should do with the one-unit hover after this pointer sample.
 *
 * Purpose: One result the timer code can apply without re-deciding.
 * When to use: The return value of `decideSingleUnitHoverCallout`.
 * Expected outcome: `schedule` starts the dwell, `clearPending` drops a dwell that is no longer for this token, `dismissOpen` closes a tooltip this hover opened, and `suppressHexTooltip` keeps the hex tooltip from covering that tooltip.
 * Exceptions: None.
 */
export interface SingleUnitHoverDecision {
  /**
   * Start the one-second dwell for this hex.
   *
   * Contract: True only when the pointer is on a one-unit token and no dwell or open tooltip is already for it.
   * When to use: The timer module, before `setTimeout`.
   * Expected outcome: False when the pointer is still on the token that is already waiting or open.
   * Exceptions: None.
   */
  readonly schedule: boolean;
  /**
   * Drop a dwell that belongs to a different hex.
   *
   * Contract: True when a timer is waiting for a hex this sample does not keep.
   * When to use: Before starting a new dwell, and when the pointer leaves a one-unit hex.
   * Expected outcome: The pending timer is cleared and does not open.
   * Exceptions: None.
   */
  readonly clearPending: boolean;
  /**
   * Hide the Bonuses tooltip this hover opened.
   *
   * Contract: True when the pointer left that token.
   * When to use: Before hiding the Bonuses tooltip.
   * Expected outcome: A click-opened stack list is not closed by this flag.
   * Exceptions: None.
   */
  readonly dismissOpen: boolean;
  /**
   * Keep the hex tooltip from opening on this sample.
   *
   * Contract: True only while the pointer is on a one-unit token that is not blocked.
   * When to use: After the decision, to clear the hex-tooltip timer.
   * Expected outcome: The Bonuses tooltip is the readout for that token. The rest of the hex can still show the hex tooltip.
   * Exceptions: None.
   */
  readonly suppressHexTooltip: boolean;
}

/**
 * The pointer sample the decision reads.
 *
 * Purpose: Bundles the hex, whether the pointer is on its token, and whether a hover tooltip is already open.
 * When to use: Built by the map pointer handler. `blocked` is planning, playback, or another popup.
 * Expected outcome: `stationaryUnitCount` is the number of units drawn and not mid-move. `pointerOnToken` is true only on that drawn marker.
 * Exceptions: None.
 */
export interface SingleUnitHoverInput {
  /**
   * Hex under the pointer, or null when the pointer has left the map.
   *
   * Contract: A world hex on the strategic map, or a battle cell in a battle.
   * When to use: Compared with `pendingH3` and `hoverOpenedH3`.
   * Expected outcome: Null means this sample cannot arm a hover.
   * Exceptions: None.
   */
  readonly h3: string | null;
  /**
   * Units drawn on `h3` that are not mid-move.
   *
   * Contract: Zero when unit markers are hidden. One can arm the hover when `pointerOnToken` is true. Two or more is a stack.
   * When to use: The one-unit test.
   * Expected outcome: Matches the click path's stationary-unit filter.
   * Exceptions: None.
   */
  readonly stationaryUnitCount: number;
  /**
   * The pointer is on the drawn marker of the hex, not the rest of the hex.
   *
   * Contract: False for a stack, an empty hex, or the ground of a one-unit hex.
   * When to use: The one-unit token test.
   * Expected outcome: Only a true value can arm the Bonuses tooltip.
   * Exceptions: None.
   */
  readonly pointerOnToken: boolean;
  /**
   * Hex whose dwell timer is waiting, or null when none is waiting.
   *
   * Contract: Null after the timer fires or is cleared.
   * When to use: To avoid restarting the dwell on every move inside the same hex.
   * Expected outcome: Equal to `h3` while the pointer rests on the hex that armed the hover.
   * Exceptions: None.
   */
  readonly pendingH3: string | null;
  /**
   * Hex whose Bonuses tooltip this hover opened, or null when it is closed.
   *
   * Contract: Null after the tooltip hides.
   * When to use: To hide only a tooltip this hover opened.
   * Expected outcome: A stack opened by a click stays open when this is null.
   * Exceptions: None.
   */
  readonly hoverOpenedH3: string | null;
  /**
   * Planning, playback, or another popup.
   *
   * Contract: True means this sample must not arm, even on a one-unit token.
   * When to use: The blocked branch.
   * Expected outcome: The dwell is cancelled and the Bonuses tooltip hides.
   * Exceptions: None.
   */
  readonly blocked: boolean;
}

/**
 * Chooses the next token-tooltip step for this pointer sample.
 *
 * Purpose: The pointer on a one-unit token shows that unit's Bonuses tooltip after a dwell. A stack does not.
 * When to use: Once per pointer sample, before starting or clearing the dwell timer.
 * Expected outcome: Arm when this is a new one-unit token. Hold when the dwell or the open tooltip is already for it. Dismiss when the pointer leaves the token.
 * Exceptions: None.
 */
export function decideSingleUnitHoverCallout(input: SingleUnitHoverInput): SingleUnitHoverDecision {
  const oneUnit = input.h3 !== null && input.stationaryUnitCount === 1 && input.pointerOnToken && !input.blocked;
  if (oneUnit) {
    const already = input.pendingH3 === input.h3 || input.hoverOpenedH3 === input.h3;
    return {
      schedule: !already,
      clearPending: input.pendingH3 !== null && input.pendingH3 !== input.h3,
      dismissOpen: input.hoverOpenedH3 !== null && input.hoverOpenedH3 !== input.h3,
      suppressHexTooltip: true,
    };
  }
  return {
    schedule: false,
    clearPending: input.pendingH3 !== null,
    dismissOpen: input.hoverOpenedH3 !== null,
    suppressHexTooltip: false,
  };
}
