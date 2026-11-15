/**
 * Pure choices for the chat panel: which draft to show, which side stays picked, and when the panel may be on screen.
 *
 * Purpose: The renderer applies these results. This module does not read the page or the database.
 * When to use: While drawing the panel and while deciding whether it is hidden.
 * Expected outcome: A draft, a recipient id, a stageable flag, or a show/hide answer.
 * Exceptions: None.
 */

import type { SideMessageView } from './sideMessageView';

/**
 * The unsent draft addressed to the side the player has picked.
 *
 * Purpose: The staged row shows one draft, the one for the current recipient.
 * When to use: While drawing the row above the entry line.
 * Expected outcome: That draft, or null when the pick has none or the pick is null.
 * Exceptions: None.
 */
export function stagedMessageFor(
  staged: readonly SideMessageView[],
  recipientSeatId: string | null
): SideMessageView | null {
  if (recipientSeatId == null) return null;
  return staged.find((row) => row.toSeatId === recipientSeatId) ?? null;
}

/**
 * The recipient to keep after the list of sides changes.
 *
 * Purpose: An open choice survives a refresh, and a side that has left the match does not stay selected.
 * When to use: After a thread snapshot arrives.
 * Expected outcome: `current` when it is still in the list, otherwise the first id, otherwise null.
 * Exceptions: None.
 */
export function nextRecipientSeatId(current: string | null, recipientSeatIds: readonly string[]): string | null {
  if (current != null && recipientSeatIds.includes(current)) return current;
  return recipientSeatIds[0] ?? null;
}

/**
 * Whether the text is worth staging.
 *
 * Purpose: The send button stays disabled, and Enter does nothing, while the field is blank.
 * When to use: On each change of the text field, and before a stage request.
 * Expected outcome: True when the text has a character that is not whitespace.
 * Exceptions: None.
 */
export function canStageText(text: string): boolean {
  return text.trim().length > 0;
}

/**
 * Whether the chat panel may be on screen.
 *
 * Purpose: Playback, the map toast, and an unloaded match each hide the panel on their own.
 * When to use: `syncChatPanelVisibility`.
 * Expected outcome: True only when a match is loaded and the other two are false.
 * Exceptions: None.
 */
export function chatPanelShouldShow(input: {
  readonly matchLoaded: boolean;
  readonly playbackRunning: boolean;
  readonly mapToastShowing: boolean;
}): boolean {
  return input.matchLoaded && !input.playbackRunning && !input.mapToastShowing;
}
