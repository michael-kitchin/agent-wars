/**
 * Sentences and the visibility rule for firing a hired mercenary from the selection panel.
 *
 * Purpose: The panel, the IPC bridge, and the main-process action share one set of labels and one show/hide rule.
 * When to use: Drawing the Dismiss control, and returning a refusal from the dismiss action.
 * Expected outcome: The same words on the button, the tip, and the toast. The button shows only for a human mercenary in strategic planning.
 * Exceptions: None. `mercenaryDismissShown` does not throw.
 */

import { HUMAN_SEAT_ID } from './seatIds';

/**
 * A dismiss that turned the named units Neutral.
 *
 * Purpose: The panel drops drafts and selection for exactly these ids.
 * When to use: The success arm of `DismissMercenaryResult`.
 * Expected outcome: `unitIds` lists the dismissed unit, then a loaded ship's cargo.
 * Exceptions: None.
 */
export interface DismissMercenarySuccess {
  /**
   * Marks the arm that changed the board.
   *
   * Contract: Always true on this arm.
   * When to use: Branching in the panel.
   * Expected outcome: True.
   * Exceptions: None.
   */
  readonly success: true;
  /**
   * Every unit that became Neutral.
   *
   * Contract: The dismissed unit first, then cargo ids in transport-table order. One id when there is no cargo.
   * When to use: Draft removal and selection cleanup.
   * Expected outcome: At least one id.
   * Exceptions: None.
   */
  readonly unitIds: readonly string[];
}

/**
 * A dismiss the action refused.
 *
 * Purpose: The panel toasts the reason and leaves the unit in place.
 * When to use: The failure arm of `DismissMercenaryResult`.
 * Expected outcome: `reason` is one of the dismiss sentences in this module.
 * Exceptions: None.
 */
export interface DismissMercenaryRefusal {
  /**
   * Marks the arm that changed nothing.
   *
   * Contract: Always false on this arm.
   * When to use: Branching in the panel.
   * Expected outcome: False.
   * Exceptions: None.
   */
  readonly success: false;
  /**
   * The sentence shown on the map toast.
   *
   * Contract: A dismiss reason from this module.
   * When to use: The failure toast.
   * Expected outcome: Plain text.
   * Exceptions: None.
   */
  readonly reason: string;
}

/**
 * The dismiss action's result.
 *
 * Purpose: One shape for the main process, the preload bridge, and the panel.
 * When to use: `executeDismissMercenary` and `game:dismissMercenary`.
 * Expected outcome: Success lists the units that became Neutral. Failure names the reason and changes nothing.
 * Exceptions: None.
 */
export type DismissMercenaryResult = DismissMercenarySuccess | DismissMercenaryRefusal;

/**
 * Visible label before the player has armed the control.
 *
 * Purpose: The first button on a mercenary row.
 * When to use: The closed state of the dismiss slot.
 * Expected outcome: The word Dismiss.
 * Exceptions: None.
 */
export const DISMISS_MERCENARY_LABEL = 'Dismiss';

/**
 * Visible label that puts the row back to Dismiss.
 *
 * Purpose: The player can leave the confirm pair without firing the unit.
 * When to use: The left button while the row is armed.
 * Expected outcome: The word Cancel.
 * Exceptions: None.
 */
export const DISMISS_MERCENARY_CANCEL_LABEL = 'Cancel';

/**
 * Visible label that fires the mercenary.
 *
 * Purpose: The second step of the confirm pair.
 * When to use: The right button while the row is armed.
 * Expected outcome: The word Confirm.
 * Exceptions: None.
 */
export const DISMISS_MERCENARY_CONFIRM_LABEL = 'Confirm';

/**
 * Toast and IPC result when the payload cannot be read.
 *
 * Purpose: A missing or empty unit id is not a dismiss.
 * When to use: The dismiss IPC handler.
 * Expected outcome: The invalid-request sentence.
 * Exceptions: None.
 */
export const DISMISS_REASON_INVALID = 'Invalid dismiss request.';

/**
 * Refusal when the match is not in planning.
 *
 * Purpose: Resolution must not change owners under the playback.
 * When to use: The dismiss action's first check.
 * Expected outcome: The planning sentence.
 * Exceptions: None.
 */
export const DISMISS_REASON_NOT_PLANNING = 'Mercenaries can only be dismissed during planning.';

/**
 * Refusal while a tactical battle is active.
 *
 * Purpose: Battle sub-units are not dismissed from the strategic owner row.
 * When to use: The human seat during a battle.
 * Expected outcome: The tactical sentence.
 * Exceptions: None.
 */
export const DISMISS_REASON_TACTICAL = 'Dismissing is unavailable during a tactical battle.';

/**
 * Refusal when the seat is out of the match.
 *
 * Purpose: A knocked-out side has already lost its units.
 * When to use: After the planning check.
 * Expected outcome: The inactive-seat sentence.
 * Exceptions: None.
 */
export const DISMISS_REASON_NOT_ACTIVE = 'Only a side still in the match can dismiss a mercenary.';

/**
 * Refusal when the unit id is not on the board.
 *
 * Purpose: A stale panel must not invent a conversion.
 * When to use: After the seat check.
 * Expected outcome: The missing-unit sentence.
 * Exceptions: None.
 */
export const DISMISS_REASON_MISSING = 'That unit is no longer on the map.';

/**
 * Refusal when the unit belongs to another seat.
 *
 * Purpose: The player fires only their own mercenaries.
 * When to use: After the unit is found.
 * Expected outcome: The ownership sentence.
 * Exceptions: None.
 */
export const DISMISS_REASON_NOT_YOURS = 'You can only dismiss your own mercenary.';

/**
 * Refusal when the unit is not a mercenary.
 *
 * Purpose: Regular units are not fired from this control.
 * When to use: After the ownership check.
 * Expected outcome: The mercenary sentence.
 * Exceptions: None.
 */
export const DISMISS_REASON_NOT_MERCENARY = 'Only a mercenary can be dismissed.';

/**
 * Refusal when the unit is cargo aboard a ship.
 *
 * Purpose: Desertion does not draw a mercenary riding a ship. Dismiss follows that rule.
 * When to use: After the mercenary check.
 * Expected outcome: The embarked sentence.
 * Exceptions: None.
 */
export const DISMISS_REASON_EMBARKED = 'A mercenary aboard a ship cannot be dismissed.';

/**
 * Toast when the dismiss IPC call itself throws.
 *
 * Purpose: A broken bridge is not one of the refusal sentences.
 * When to use: The panel's catch around `dismissMercenary`.
 * Expected outcome: The failed sentence.
 * Exceptions: None.
 */
export const DISMISS_MERCENARY_FAILED = 'Failed to dismiss that mercenary.';

/**
 * Tip for the Dismiss button.
 *
 * Purpose: Says what Confirm will do before the player arms it.
 * When to use: `data-control-tooltip` on the closed button.
 * Expected outcome: The fire sentence.
 * Exceptions: None.
 */
export const DISMISS_MERCENARY_TOOLTIP = 'Fire this mercenary. It becomes Neutral now.';

/**
 * Tip for the Cancel button.
 *
 * Purpose: Says that leaving the confirm pair keeps the unit.
 * When to use: `data-control-tooltip` on Cancel.
 * Expected outcome: The keep sentence.
 * Exceptions: None.
 */
export const DISMISS_MERCENARY_CANCEL_TOOLTIP = 'Keep this mercenary.';

/**
 * Tip for the Confirm button.
 *
 * Purpose: Says the unit becomes Neutral and can be rehired for the next turn.
 * When to use: `data-control-tooltip` on Confirm.
 * Expected outcome: The confirm sentence.
 * Exceptions: None.
 */
export const DISMISS_MERCENARY_CONFIRM_TOOLTIP = 'Fire this mercenary now. You can rehire it for the next turn.';

/**
 * Whether a selection-panel row shows the Dismiss control.
 *
 * Purpose: Tactical battles, playback, regular units, and other sides never get the button.
 * When to use: Once per row, and again when forgetting armed rows that no longer qualify.
 * Expected outcome: True only for a human mercenary during strategic planning while playback is off.
 * Exceptions: None.
 */
export function mercenaryDismissShown(input: {
  readonly strategicPlanning: boolean;
  readonly playbackRunning: boolean;
  readonly player: string;
  readonly isMercenary: boolean;
}): boolean {
  return input.strategicPlanning && !input.playbackRunning && input.player === HUMAN_SEAT_ID && input.isMercenary;
}
