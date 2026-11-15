/**
 * The match screen's copy of the message thread.
 *
 * Purpose: The panel reads, stages, and cancels through the game API. It does not decide who may see a message.
 * When to use: When the panel opens, after a stage or cancel, and after a consult or a commit that may have sent messages.
 * Expected outcome: Listeners see the latest snapshot the viewer is allowed to have. A reply for a match that has since changed is dropped.
 * Exceptions: A missing API method returns quietly. A rejected call is logged and leaves the last snapshot in place.
 */

import type { SideMessageThreadSnapshot } from '../../shared/sideMessageView';
import { nextRecipientSeatId } from '../../shared/chatPanelState';
import { currentRendererMatchEpoch, rendererMatchEpochCurrent } from '../core/matchEpoch';

/**
 * The thread before the first successful read.
 *
 * Purpose: The panel can render before a match is loaded.
 * When to use: The initial value of `snapshot`.
 * Expected outcome: An observer-shaped snapshot with nothing to show or send.
 * Exceptions: None.
 */
const EMPTY_THREAD: SideMessageThreadSnapshot = {
  viewerSeatId: null,
  canSend: false,
  recipientSeatIds: [],
  messages: [],
  staged: [],
};

/**
 * The last thread the viewer was allowed to see.
 *
 * Purpose: A redraw uses this instead of asking again.
 * When to use: `chatSnapshot` and the stage and cancel paths.
 * Expected outcome: Replaced only by a reply for the match that is still showing.
 * Exceptions: None.
 */
let snapshot: SideMessageThreadSnapshot = EMPTY_THREAD;

/**
 * The side the entry line is addressed to.
 *
 * Purpose: Staging and the staged row use the same pick across redraws.
 * When to use: `setChatRecipient` and `refreshChatThread`.
 * Expected outcome: A seat id still in `recipientSeatIds`, or null.
 * Exceptions: None.
 */
let recipientSeatId: string | null = null;

/**
 * Redraw callbacks.
 *
 * Purpose: The panel paints when the thread changes.
 * When to use: `subscribeChatThread`.
 * Expected outcome: Each listener runs after a snapshot is stored.
 * Exceptions: None.
 */
const listeners: Array<() => void> = [];

/**
 * The thread the panel is showing.
 *
 * Purpose: Drawing reads one snapshot.
 * When to use: `renderChatPanel`.
 * Expected outcome: The last stored thread, or the empty thread before the first read.
 * Exceptions: None.
 */
export function chatSnapshot(): SideMessageThreadSnapshot {
  return snapshot;
}

/**
 * The side the entry line is addressed to.
 *
 * Purpose: The drop-down and the staged row share one pick.
 * When to use: While drawing, and before a stage or cancel.
 * Expected outcome: The stored seat id, or null when nobody can be written to.
 * Exceptions: None.
 */
export function chatRecipientSeatId(): string | null {
  return recipientSeatId;
}

/**
 * Points the entry line at one side.
 *
 * Purpose: Changing the drop-down changes which draft is shown, without a new read.
 * When to use: The recipient drop-down's change event.
 * Expected outcome: Later stage and cancel calls use this seat.
 * Exceptions: None.
 */
export function setChatRecipient(seatId: string): void {
  recipientSeatId = seatId;
}

/**
 * Runs `listener` after each stored snapshot.
 *
 * Purpose: The panel redraws without this module knowing the page.
 * When to use: Once, from `wireChatPanel`.
 * Expected outcome: The listener is called after a refresh stores a snapshot. The returned function removes it.
 * Exceptions: None.
 */
export function subscribeChatThread(listener: () => void): () => void {
  listeners.push(listener);
  return () => {
    const index = listeners.indexOf(listener);
    if (index >= 0) listeners.splice(index, 1);
  };
}

/**
 * Tells every listener the thread changed.
 *
 * Purpose: One place runs the redraws.
 * When to use: After a snapshot is stored.
 * Expected outcome: Each listener runs once.
 * Exceptions: A listener that throws stops the rest.
 */
function notifyChatThread(): void {
  for (const listener of listeners) listener();
}

/**
 * Reads the thread the viewer may see.
 *
 * Purpose: The history and the staged row come from the database, not from a consult dispatch.
 * When to use: When the panel is wired, when a match starts, after a stage or cancel, and after a consult or a commit.
 * Expected outcome: The snapshot and the recipient pick update, then listeners run. A reply for an older match is ignored.
 * Exceptions: A missing `readSideMessages` returns without changing state. A rejection is logged.
 */
export async function refreshChatThread(): Promise<void> {
  const read = window.gameApi?.readSideMessages;
  if (!read) return;
  const matchEpoch = currentRendererMatchEpoch();
  try {
    const next = await read();
    if (!rendererMatchEpochCurrent(matchEpoch)) return;
    snapshot = next;
    recipientSeatId = nextRecipientSeatId(recipientSeatId, next.recipientSeatIds);
    notifyChatThread();
  } catch (err) {
    console.error('readSideMessages failed', err);
  }
}

/**
 * Stages the text to the picked side and reads the thread again.
 *
 * Purpose: Enter and the send button share one request.
 * When to use: When the field has stageable text and a recipient is picked.
 * Expected outcome: Null when the draft is stored. The failure sentence when it is not. The thread is refreshed either way.
 * Exceptions: A missing API or recipient returns `Invalid message.` A rejection is logged and returns the same sentence.
 */
export async function stageChatMessage(text: string): Promise<string | null> {
  const stage = window.gameApi?.stageSideMessage;
  if (!stage || recipientSeatId == null) return 'Invalid message.';
  try {
    const result = await stage({ toSeatId: recipientSeatId, text });
    await refreshChatThread();
    return result.success ? null : result.reason;
  } catch (err) {
    console.error('stageSideMessage failed', err);
    return 'Invalid message.';
  }
}

/**
 * Drops the draft addressed to the picked side.
 *
 * Purpose: Edit and the × button both discard that draft.
 * When to use: After Edit has copied the text into the field, and when × is clicked.
 * Expected outcome: The draft is gone and the thread is read again. Nothing happens when there is no recipient.
 * Exceptions: A missing API returns. A rejection is logged.
 */
export async function cancelStagedChatMessage(): Promise<void> {
  const cancel = window.gameApi?.cancelStagedSideMessage;
  if (!cancel || recipientSeatId == null) return;
  try {
    await cancel({ toSeatId: recipientSeatId });
    await refreshChatThread();
  } catch (err) {
    console.error('cancelStagedSideMessage failed', err);
  }
}
