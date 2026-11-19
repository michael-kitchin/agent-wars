/**
 * Draws commander-written text with side codes shown as side display names.
 *
 * Purpose: The chat panel, the message dialog, and the Reports tab show the same conversion in one line each.
 * When to use: Wherever commander text is put into an element for the player.
 * Expected outcome: The element holds text only, never markup.
 * Exceptions: None.
 */

import { sideCodesToDisplayNames } from '../../shared/sideCodeDisplayText';
import type { SideDisplaySeat } from '../../shared/sideNicknames';

/**
 * The inputs of one `setSideCodeText` call.
 *
 * Contract: Every field is read once. Nothing is kept.
 * When to use: The second argument of `setSideCodeText`.
 * Expected outcome: The element shows `prefix` followed by the converted text.
 * Exceptions: None.
 */
export interface SideCodeTextArgs {
  /**
   * Text printed before the commander text, unchanged.
   *
   * Contract: Game text such as `: ` or `Strategy: `. It is never converted.
   * When to use: A line that names the recipient or the kind of text first.
   * Expected outcome: Appears first in the element.
   * Exceptions: None.
   */
  readonly prefix: string;
  /**
   * The text as stored.
   *
   * Contract: Exactly what the commander or player wrote.
   * When to use: Always.
   * Expected outcome: Converted for display. It is also the tooltip when `rawTooltip` is true and a code changed.
   * Exceptions: None.
   */
  readonly rawText: string;
  /**
   * The seats of the match.
   *
   * Contract: Only codes of these seats are replaced.
   * When to use: Pass the roster on screen.
   * Expected outcome: An empty list leaves the text as written.
   * Exceptions: None.
   */
  readonly seats: readonly SideDisplaySeat[];
  /**
   * Whether a changed text gets the original as its tooltip.
   *
   * Contract: True adds the title only when conversion changed the text.
   * When to use: False when the element already has its own title.
   * Expected outcome: Text with no replaced code never gets a new title.
   * Exceptions: None.
   */
  readonly rawTooltip: boolean;
}

/**
 * Sets an element's text with side codes shown as display names.
 *
 * Purpose: The player reads names, and can hover to read what the commander wrote.
 * When to use: In place of assigning `textContent` for commander-written text.
 * Expected outcome: `textContent` is `prefix` plus the converted text. The title is the stored text when `rawTooltip` is
 *   true and a code was replaced.
 * Exceptions: None. The element's markup is never read or written.
 */
export function setSideCodeText(element: HTMLElement, args: SideCodeTextArgs): void {
  const shown = sideCodesToDisplayNames(args.rawText, args.seats);
  element.textContent = `${args.prefix}${shown}`;
  if (args.rawTooltip && shown !== args.rawText) element.title = args.rawText;
}
