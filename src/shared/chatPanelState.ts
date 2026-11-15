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
 * Every unsent draft, in the recipient list's order.
 *
 * Purpose: The pending list shows each draft, and the drop-down does not choose which ones appear.
 * When to use: While drawing the lines above the entry field.
 * Expected outcome: Drafts whose recipient is in `recipientSeatIds` come first, in that order. A draft to anyone else follows, in `messageId` order. The input arrays are not changed.
 * Exceptions: None.
 */
export function stagedMessagesInSeatOrder(
  staged: readonly SideMessageView[],
  recipientSeatIds: readonly string[],
): SideMessageView[] {
  const order = new Map(recipientSeatIds.map((seatId, index) => [seatId, index]));
  return [...staged].sort((left, right) => {
    const leftOrder = order.get(left.toSeatId) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = order.get(right.toSeatId) ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return left.messageId - right.messageId;
  });
}

/**
 * The unsent draft addressed to one side.
 *
 * Purpose: Edit reads the draft it is about to put back in the field.
 * When to use: When the player edits one pending line.
 * Expected outcome: That draft, or null when that side has none or the seat id is null.
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
 * A cache key for a list of seats and the names the panel is showing.
 *
 * Purpose: The recipient list and the history rebuild when a side is renamed, not only when the ids change.
 * When to use: `renderRecipient` and `renderHistory`.
 * Expected outcome: The same ids and names produce the same key. A renamed seat, or the same names in another order, produces a different key. The separators are NUL and U+0001, which `sideDisplayName` strips from a name.
 * Exceptions: None.
 */
export function chatNamedSeatKey(seatIds: readonly string[], nameOf: (seatId: string) => string): string {
  return seatIds.map((seatId) => `${seatId}\u0000${nameOf(seatId)}`).join('\u0001');
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
