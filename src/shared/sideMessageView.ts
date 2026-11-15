/**
 * Shapes and labels for messages a screen may show.
 *
 * Purpose: The history, the dialog bullets, and the chat panel share one view of a stored message.
 * When to use: When a screen paints a stored message. This module does not decide visibility.
 * Expected outcome: Groups, labels, and a stable recipient order. No logging and no DOM.
 * Exceptions: None.
 */

/**
 * One message a screen may show.
 *
   * Contract: A stored message a screen is painting. `text` is the stored body.
 * When to use: A history row, a staged row, or a dialog bullet.
 * Expected outcome: The ids, the text, and the step the message was stored with.
 * Exceptions: None.
 */
export interface SideMessageView {
  /**
   * The stored `message_id`.
   *
   * Contract: The primary key of the row.
   * When to use: Telling a redraw whether the history changed.
   * Expected outcome: A positive integer.
   * Exceptions: None.
   */
  readonly messageId: number;
  /**
   * The seat that wrote the message.
   *
   * Contract: A seat id.
   * When to use: The history's sender label.
   * Expected outcome: The stored sender.
   * Exceptions: None.
   */
  readonly fromSeatId: string;
  /**
   * The seat the message is addressed to.
   *
   * Contract: A seat id, different from `fromSeatId`.
   * When to use: The history's recipient, the dialog bullet, and the staged-row lookup.
   * Expected outcome: The stored recipient.
   * Exceptions: None.
   */
  readonly toSeatId: string;
  /**
   * The stored message text.
   *
   * Contract: The cleaned body. Do not log it.
   * When to use: The only place message text is copied onto a screen.
   * Expected outcome: The text that was inserted.
   * Exceptions: None.
   */
  readonly text: string;
  /**
   * Whether the message belongs to a turn or a battle beat.
   *
   * Contract: `strategic` or `tactical`, from the row's step.
   * When to use: Marking a battle message in the history.
   * Expected outcome: The stored scope.
   * Exceptions: None.
   */
  readonly scope: 'strategic' | 'tactical';
  /**
   * The turn the message was stored on.
   *
   * Contract: The step's turn number.
   * When to use: Grouping the history.
   * Expected outcome: A turn number of 1 or more.
   * Exceptions: None.
   */
  readonly turnNumber: number;
  /**
   * The battle beat, when the message was sent during a battle.
   *
   * Contract: 0 when `scope` is `strategic`.
   * When to use: A history row that needs the beat.
   * Expected outcome: The stored beat number.
   * Exceptions: None.
   */
  readonly beatNumber: number;
}

/**
 * What the chat panel is allowed to show and send.
 *
 * Contract: `messages` and `staged` contain only rows the viewer may see. `viewerSeatId` is null for an observer.
 * When to use: The reply of `game:readSideMessages`.
 * Expected outcome: Recipients still in the match, sent messages oldest first, and the viewer's drafts.
 * Exceptions: None.
 */
export interface SideMessageThreadSnapshot {
  /**
   * The human seat that is still in the match.
   *
   * Contract: Null when the match is being observed.
   * When to use: Labelling the viewer's own messages as You.
   * Expected outcome: The active human seat id, or null.
   * Exceptions: None.
   */
  readonly viewerSeatId: string | null;
  /**
   * Whether the entry line is available.
   *
   * Contract: False for an observer and when no AI side remains.
   * When to use: Hiding the drop-down, the text field, and the send button.
   * Expected outcome: True only for a player who still has someone to write to.
   * Exceptions: None.
   */
  readonly canSend: boolean;
  /**
   * AI sides still in the match, in seat order.
   *
   * Contract: `activeAiSeatIds` order. A knocked-out side is absent.
   * When to use: The recipient drop-down.
   * Expected outcome: Seat ids the player may stage a message to.
   * Exceptions: None.
   */
  readonly recipientSeatIds: readonly string[];
  /**
   * Sent messages the viewer may see, oldest first.
   *
   * Contract: Already filtered. Staged drafts are not in this list.
   * When to use: The history.
   * Expected outcome: `message_id` order.
   * Exceptions: None.
   */
  readonly messages: readonly SideMessageView[];
  /**
   * The viewer's unsent drafts.
   *
   * Contract: Empty for an observer. One row per recipient at most.
   * When to use: The staged row above the entry line.
   * Expected outcome: Drafts from the viewer.
   * Exceptions: None.
   */
  readonly staged: readonly SideMessageView[];
}

/**
 * Sent messages for one turn, in the order they were given.
 *
 * Contract: `heading` is `Turn N`. `messages` keeps the caller's order.
 * When to use: One block of the chat history.
 * Expected outcome: A turn number and its rows.
 * Exceptions: None.
 */
export interface SideMessageTurnGroup {
  /**
   * The turn these messages belong to.
   *
   * Contract: The `turnNumber` shared by `messages`.
   * When to use: Sorting groups.
   * Expected outcome: The turn number.
   * Exceptions: None.
   */
  readonly turnNumber: number;
  /**
   * The heading shown above the group.
   *
   * Contract: `Turn` plus the turn number.
   * When to use: The history heading.
   * Expected outcome: `Turn 12` for turn 12.
   * Exceptions: None.
   */
  readonly heading: string;
  /**
   * The messages in this turn.
   *
   * Contract: Sender seat order, then recipient seat order, then `messageId`.
   * When to use: The rows under the heading.
   * Expected outcome: One or more views.
   * Exceptions: None.
   */
  readonly messages: readonly SideMessageView[];
}

/**
 * The dialog and panel title.
 *
 * Purpose: The word Messages is written once.
 * When to use: The dialog section heading and the panel title.
 * Expected outcome: The string `Messages`.
 * Exceptions: None.
 */
export const SIDE_MESSAGES_TITLE = 'Messages';

/**
 * The arrow between two sides on a message line.
 *
 * Purpose: The dialog, the history, and a pending line use one mark.
 * When to use: At the start of a dialog line, and between the two sides of a history row or a pending line.
 * Expected outcome: The character `→`.
 * Exceptions: None.
 */
export const SIDE_MESSAGE_ARROW = '→';

/**
 * Groups sent messages under their turns.
 *
 * Purpose: The history is read by turn, oldest turn first, and each turn lists senders in seat order.
 * When to use: When painting the chat history.
 * Expected outcome: One group per turn that has a message, turns ascending. Inside a turn, the sender's seat order, then the recipient's, then `messageId`. A missing seat sorts last. An empty list gives no groups.
 * Exceptions: None.
 */
export function groupSideMessagesByTurn(
  messages: readonly SideMessageView[],
  seatOrderOf: (seatId: string) => number
): SideMessageTurnGroup[] {
  const byTurn = new Map<number, SideMessageView[]>();
  for (const message of messages) {
    const existing = byTurn.get(message.turnNumber);
    if (existing) existing.push(message);
    else byTurn.set(message.turnNumber, [message]);
  }
  return [...byTurn.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([turnNumber, group]) => ({
      turnNumber,
      heading: `Turn ${turnNumber}`,
      messages: [...group].sort((left, right) =>
        seatOrderOf(left.fromSeatId) - seatOrderOf(right.fromSeatId)
        || seatOrderOf(left.toSeatId) - seatOrderOf(right.toSeatId)
        || left.messageId - right.messageId),
    }));
}

/**
 * The name a history row uses for one seat.
 *
 * Purpose: A Reports line still reads You for the viewer's own seat. The message dialog and the chat panel do not use this.
 * When to use: A Reports message line.
 * Expected outcome: `You` when `seatId` is the viewer's seat. Otherwise `nameOf(seatId)`. An observer never gets You.
 * Exceptions: None.
 */
export function sideMessagePartyLabel(
  seatId: string,
  viewerSeatId: string | null,
  nameOf: (seatId: string) => string
): string {
  if (viewerSeatId !== null && seatId === viewerSeatId) return 'You';
  return nameOf(seatId);
}

/**
 * Orders dialog bullets by the recipient's seat order.
 *
 * Purpose: Bullets follow the roster instead of the order the model wrote them.
 * When to use: Before painting a Messages section. `seatOrderOf` reads `seat.seatOrder`, and returns a number past every known seat when the recipient is missing.
 * Expected outcome: A new array, stable when two recipients share an order.
 * Exceptions: None.
 */
export function dispatchMessagesInSideOrder<T extends { readonly toSeatId: string }>(
  messages: readonly T[],
  seatOrderOf: (seatId: string) => number
): T[] {
  return [...messages].sort((left, right) => seatOrderOf(left.toSeatId) - seatOrderOf(right.toSeatId));
}
