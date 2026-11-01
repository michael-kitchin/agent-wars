import type { SeatId } from '../seatIds';

/**
 * One sight line from a spotter hex to a hex that seat could see.
 *
 * Purpose: Ready sends these to the renderer for the opening playback stage.
 * When to use: After planning-time vision has been reduced to one line per hex pair.
 * Expected outcome: The spotter seat, the two hexes, and whether the target is new.
 * Exceptions: None.
 */
export interface SightCueBeam {
  /**
   * The AI seat whose units spotted the target.
   *
   * Contract: The beam uses that seat's map color, and a seat view shows only that seat's lines.
   * When to use: Drawing and filtering.
   * Expected outcome: An AI seat id.
   * Exceptions: None.
   */
  readonly seatId: SeatId;
  /**
   * The hex the spotter stands on.
   *
   * Contract: The beam starts one unit radius out from this hex.
   * When to use: Drawing the spotter end.
   * Expected outcome: A strategic hex index.
   * Exceptions: None.
   */
  readonly fromH3Index: string;
  /**
   * The hex that holds the spotted units.
   *
   * Contract: The beam ends one unit radius short of this hex. It is never the spotter hex.
   * When to use: Drawing the target end and the new-contact ring.
   * Expected outcome: A strategic hex index different from `fromH3Index`.
   * Exceptions: None.
   */
  readonly toH3Index: string;
  /**
   * Whether the target hex holds a unit this seat did not see last planning.
   *
   * Contract: A new contact is drawn stronger and gets a ring.
   * When to use: Choosing the beam style.
   * Expected outcome: True when at least one unit in the target hex is absent from that seat's previous memory.
   * Exceptions: None.
   */
  readonly isNewContact: boolean;
}
