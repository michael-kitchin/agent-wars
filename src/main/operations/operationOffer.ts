/**
 * Decides whether this seat waits, is asked, or is given an undefended landing.
 *
 * Purpose: The turn advance and the tests share one rule for the one-turn window.
 * When to use: Once per free sea slot, after the candidate list for that slot is known.
 * Expected outcome: The next stored offer, whether to launch the first undefended row, and whether this turn should consult.
 * Exceptions: None.
 */

import { logDebug } from '../logger';

/**
 * The two turn numbers one seat remembers about its menu.
 *
 * Purpose: A defended menu and an undefended menu start different clocks.
 * When to use: The offer row and `decideOperationOffer`.
 * Expected outcome: Both null when the seat has nothing to show.
 * Exceptions: None.
 */
export interface OperationOfferState {
  /**
   * Turn any menu was first shown.
   *
   * Contract: Null when the seat has no candidate.
   * When to use: So a defended menu consults once.
   * Expected outcome: A turn number, or null.
   * Exceptions: None.
   */
  readonly announcedTurn: number | null;
  /**
   * Turn an undefended row was shown.
   *
   * Contract: Null when the current menu has no undefended row.
   * When to use: The engine launches only after this turn has passed.
   * Expected outcome: A turn number, or null.
   * Exceptions: None.
   */
  readonly clearOfferTurn: number | null;
}

/**
 * What the seat should do with the menu on this turn.
 *
 * Purpose: The caller stores the offer, launches at most one row, and consults when asked.
 * When to use: The return of `decideOperationOffer`.
 * Expected outcome: `launch` is never true on the turn `clearOfferTurn` is set.
 * Exceptions: None.
 */
export interface OperationOfferDecision {
  /**
   * Whether the engine starts the first undefended landing.
   *
   * Contract: True only when an undefended row was already offered on an earlier turn.
   * When to use: The launch step.
   * Expected outcome: At most one true result before the offer is cleared.
   * Exceptions: None.
   */
  readonly launch: boolean;
  /**
   * Offer to store after this decision.
   *
   * Contract: Both turns null when the seat has no candidate.
   * When to use: The write at the end of the seat's tick.
   * Expected outcome: The clocks described above.
   * Exceptions: None.
   */
  readonly offer: OperationOfferState;
  /**
   * Whether this turn should ask the seat about the menu.
   *
   * Contract: True the first time any menu appears, and the turn an undefended row first appears.
   * When to use: The event-turn write. A phase change is the caller's own reason to consult.
   * Expected outcome: False when the same menu was already shown.
   * Exceptions: None.
   */
  readonly consult: boolean;
}

/**
 * An offer with neither clock set.
 *
 * Purpose: Callers share one empty value instead of repeating the pair.
 * When to use: A missing row and a seat with no candidate.
 * Expected outcome: Both turns null.
 * Exceptions: None.
 */
export const EMPTY_OPERATION_OFFER: OperationOfferState = { announcedTurn: null, clearOfferTurn: null };

/**
 * Chooses the offer, the launch, and the consult for one free slot.
 *
 * Purpose: An undefended row waits one turn. A defended menu never starts that wait. A gap with no undefended row clears it.
 * When to use: Inside the free-slot loop. Call again after a launch; the next result opens a window and does not launch.
 * Expected outcome: The decision above. The input offer is not changed.
 * Exceptions: None.
 */
export function decideOperationOffer(args: {
  readonly turnNumber: number;
  readonly hasCandidate: boolean;
  readonly hasClear: boolean;
  readonly offer: OperationOfferState;
}): OperationOfferDecision {
  logDebug('operationOffer decideOperationOffer', {
    turnNumber: args.turnNumber,
    hasCandidate: args.hasCandidate,
    hasClear: args.hasClear,
    announcedTurn: args.offer.announcedTurn,
    clearOfferTurn: args.offer.clearOfferTurn,
  });
  if (!args.hasCandidate) {
    return { launch: false, consult: false, offer: EMPTY_OPERATION_OFFER };
  }
  if (!args.hasClear) {
    return {
      launch: false,
      consult: args.offer.announcedTurn === null,
      offer: {
        announcedTurn: args.offer.announcedTurn ?? args.turnNumber,
        clearOfferTurn: null,
      },
    };
  }
  if (args.offer.clearOfferTurn === null) {
    return {
      launch: false,
      consult: true,
      offer: {
        announcedTurn: args.offer.announcedTurn ?? args.turnNumber,
        clearOfferTurn: args.turnNumber,
      },
    };
  }
  if (args.offer.clearOfferTurn < args.turnNumber) {
    return {
      launch: true,
      consult: false,
      offer: { announcedTurn: args.offer.announcedTurn, clearOfferTurn: null },
    };
  }
  return { launch: false, consult: false, offer: args.offer };
}
