/**
 * The chat panel at the map's bottom-right: the history, the staged draft, and the entry line.
 *
 * Purpose: The player reads what commanders say and writes a message that is sent on the next commit.
 * When to use: `wireChatPanel` once at startup, from the selection panel's wiring.
 * Expected outcome: The panel starts compact. Expanding shows the history. Enter or the send button stages the field. The field is cleared only after a successful stage.
 * Exceptions: Missing elements are skipped. A stage failure is shown on the map toast and the typed text stays.
 */

import { canStageText, stagedMessageFor } from '../../shared/chatPanelState';
import { groupSideMessagesByTurn, sideMessagePartyLabel, type SideMessageView } from '../../shared/sideMessageView';
import { sideDisplayName, type SideDisplaySeat } from '../../shared/sideNicknames';
import { startPanelHeightSlide } from '../chrome/panelSlideHelpers';
import { createSideNumberFlag } from '../chrome/sideNumberFlag';
import { rendererSharedState as S } from '../core/state';
import { layoutMapChrome } from '../map/mapChromeLayout';
import { showMapToast } from '../openRouter/openRouterUiHelpers';
import {
  cancelStagedChatMessage,
  chatRecipientSeatId,
  chatSnapshot,
  setChatRecipient,
  stageChatMessage,
  subscribeChatThread,
  refreshChatThread,
} from './chatPanelClient';
import { syncChatPanelVisibility } from './chatPanelVisibility';

/**
 * How close to the bottom, in pixels, still counts as following the latest message.
 *
 * Purpose: A reader who has scrolled up is not pulled down when a message arrives.
 * When to use: Before the history is rebuilt.
 * Expected outcome: 8.
 * Exceptions: None.
 */
const HISTORY_BOTTOM_SLACK_PX = 8;

/**
 * Whether the player last chose the expanded history.
 *
 * Purpose: The choice lasts until the app closes. It is not saved.
 * When to use: The expand control.
 * Expected outcome: False when the app opens.
 * Exceptions: None.
 */
let expanded = false;

/**
 * The slide in progress, if any.
 *
 * Purpose: A click during a slide starts the next one from the panel's current height.
 * When to use: Set when a slide starts and cleared when it ends.
 * Expected outcome: Null while the panel is settled.
 * Exceptions: None.
 */
let slide: Animation | null = null;

/**
 * The message ids last painted into the history, with the viewer id.
 *
 * Purpose: A refresh that did not change the messages must not rebuild the list or jump the scroll.
 * When to use: `renderHistory`.
 * Expected outcome: Empty until the first paint.
 * Exceptions: None.
 */
let historyKey = '';

/**
 * The recipient ids last painted into the drop-down.
 *
 * Purpose: Rebuilding the options closes an open drop-down, so it happens only when the list changes.
 * When to use: `renderRecipient`.
 * Expected outcome: Empty until the first paint.
 * Exceptions: None.
 */
let recipientKey = '';

/**
 * Whether the next history paint should scroll to the latest message.
 *
 * Purpose: Expanding the panel shows the latest messages. A later refresh keeps the reader's place.
 * When to use: Set when the panel expands, consumed by `renderHistory`.
 * Expected outcome: False except for the paint that follows an expand.
 * Exceptions: None.
 */
let scrollHistoryToEnd = false;

/**
 * A roster row the panel can name and flag.
 *
 * Purpose: Labels and flags need the seat's name, kind, and order.
 * When to use: `rosterSeats`.
 * Expected outcome: The fields `sideDisplayName` and `createSideNumberFlag` read.
 * Exceptions: None.
 */
type ChatSeat = SideDisplaySeat & { readonly seatOrder: number };

/**
 * The seats of the match on screen.
 *
 * Purpose: Names and flags come from the same roster as the rest of the map.
 * When to use: While painting a row or a drop-down option.
 * Expected outcome: The current seats, or an empty list before a match is loaded.
 * Exceptions: None.
 */
function rosterSeats(): readonly ChatSeat[] {
  return (S.gameState?.seats ?? []) as readonly ChatSeat[];
}

/**
 * The name shown for one seat.
 *
 * Purpose: The drop-down and the history use the match's side names.
 * When to use: `sideMessagePartyLabel` and each recipient option.
 * Expected outcome: `sideDisplayName` for a roster seat, or the seat id when the seat is missing.
 * Exceptions: None.
 */
function seatName(seatId: string): string {
  const seat = rosterSeats().find((row) => row.seatId === seatId);
  return seat ? sideDisplayName(seat) : seatId;
}

/**
 * Sets the expand control's name from the player's choice.
 *
 * Purpose: The button says what the next click does.
 * When to use: After the choice changes, and once at startup.
 * Expected outcome: `aria-expanded`, `aria-label`, and the control tip match `expanded`.
 * Exceptions: None.
 */
function syncExpandControl(button: HTMLElement): void {
  button.setAttribute('aria-expanded', String(expanded));
  button.setAttribute('aria-label', expanded ? 'Hide the message history' : 'Show the message history');
  button.setAttribute(
    'data-control-tooltip',
    expanded ? 'Hide the message history.' : 'Show the messages sent and received this match.',
  );
}

/**
 * Ends the panel in the state the player chose.
 *
 * Purpose: One place leaves the panel settled after a slide or without one.
 * When to use: When a slide finishes, and when no slide is needed.
 * Expected outcome: `data-state` is `expanded` or `compact`, and no inline height remains.
 * Exceptions: None.
 */
function settleChat(panel: HTMLElement): void {
  slide?.cancel();
  slide = null;
  panel.dataset.state = expanded ? 'expanded' : 'compact';
  panel.style.height = '';
}

/**
 * Slides the panel's height from `from` to `to`, then settles it.
 *
 * Purpose: The panel's bottom edge stays put, so the history opens upward.
 * When to use: From the expand control, after the target height is measured.
 * Expected outcome: The panel settles at once when `startPanelHeightSlide` declines to slide.
 * Exceptions: None.
 */
function slideChat(panel: HTMLElement, from: number, to: number): void {
  slide = startPanelHeightSlide(panel, from, to, (finished) => {
    if (slide === finished) settleChat(panel);
  });
  if (!slide) settleChat(panel);
}

/**
 * Switches the history between hidden and shown.
 *
 * Purpose: The expand control's single action.
 * When to use: On a click on `#chat-panel-expand`.
 * Expected outcome: The choice flips. Expanding reveals the history and scrolls to the latest message. Collapsing shrinks the panel to the bar.
 * Exceptions: None.
 */
function toggleChatPanel(panel: HTMLElement, bar: HTMLElement, button: HTMLElement): void {
  const from = panel.getBoundingClientRect().height;
  slide?.cancel();
  slide = null;
  expanded = !expanded;
  syncExpandControl(button);
  if (expanded) {
    scrollHistoryToEnd = true;
    panel.dataset.state = 'expanding';
    renderChatPanel();
    slideChat(panel, from, panel.getBoundingClientRect().height);
    return;
  }
  panel.dataset.state = 'collapsing';
  panel.style.height = '';
  const borders = panel.offsetHeight - panel.clientHeight;
  slideChat(panel, from, bar.offsetHeight + borders);
}

/**
 * Enables the send button only when the field has stageable text.
 *
 * Purpose: A blank field cannot be staged.
 * When to use: On each input event, and after a redraw.
 * Expected outcome: The button is disabled while `canStageText` is false.
 * Exceptions: None. Missing elements are skipped.
 */
function syncSendEnabled(): void {
  const input = document.getElementById('chat-panel-input');
  const send = document.getElementById('chat-panel-send');
  if (!(input instanceof HTMLInputElement) || !(send instanceof HTMLButtonElement)) return;
  send.disabled = !canStageText(input.value);
}

/**
 * Stages the field and clears it only when that succeeds.
 *
 * Purpose: Enter and the send button share one path.
 * When to use: When the field has text that is not only whitespace.
 * Expected outcome: The field clears and keeps focus when it still holds the text that was stored. A later edit is left in place. A refusal is shown on the map toast and the text stays.
 * Exceptions: None. A blank field returns without a request.
 */
async function stageFromInput(): Promise<void> {
  const input = document.getElementById('chat-panel-input');
  if (!(input instanceof HTMLInputElement) || !canStageText(input.value)) return;
  const text = input.value;
  const failure = await stageChatMessage(text);
  if (failure) {
    showMapToast(failure);
    return;
  }
  if (input.value === text) {
    input.value = '';
    syncSendEnabled();
  }
  input.focus();
}

/**
 * Moves the staged draft back into the field and discards the draft.
 *
 * Purpose: The player edits by staging the text again.
 * When to use: The edit button.
 * Expected outcome: The field holds the draft, the caret is at the end, and the staged row is gone.
 * Exceptions: None. No draft leaves the field unchanged.
 */
async function editStaged(): Promise<void> {
  const staged = stagedMessageFor(chatSnapshot().staged, chatRecipientSeatId());
  const input = document.getElementById('chat-panel-input');
  if (!staged || !(input instanceof HTMLInputElement)) return;
  input.value = staged.text;
  syncSendEnabled();
  await cancelStagedChatMessage();
  input.focus();
  const end = input.value.length;
  input.setSelectionRange(end, end);
}

/**
 * Paints one side's flag, unless the label is You, then the label.
 *
 * Purpose: The history names the sender and the recipient the same way, and You has no flag.
 * When to use: Each end of a history row.
 * Expected outcome: A flag element when the side is an opponent, then a text node of the label.
 * Exceptions: None.
 */
function appendParty(parent: HTMLElement, seatId: string, viewerSeatId: string | null): void {
  const label = sideMessagePartyLabel(seatId, viewerSeatId, seatName);
  if (label !== 'You') {
    const flag = createSideNumberFlag(seatId, rosterSeats());
    if (flag) parent.append(flag);
  }
  const name = document.createElement('span');
  name.textContent = label;
  parent.append(name);
}

/**
 * Paints one stored message.
 *
 * Purpose: A row reads sender, arrow, recipient, and text, with a battle mark when the message was sent in a battle.
 * When to use: Under each turn heading.
 * Expected outcome: Every piece is set with `textContent`. The viewer's own row is marked `data-own`.
 * Exceptions: None.
 */
function appendHistoryRow(parent: HTMLElement, row: SideMessageView, viewerSeatId: string | null): void {
  const line = document.createElement('p');
  line.className = 'chat-panel-row';
  if (viewerSeatId != null && row.fromSeatId === viewerSeatId) line.dataset.own = 'true';
  appendParty(line, row.fromSeatId, viewerSeatId);
  const arrow = document.createElement('span');
  arrow.textContent = ' → ';
  line.append(arrow);
  appendParty(line, row.toSeatId, viewerSeatId);
  if (row.scope === 'tactical') {
    const battle = document.createElement('span');
    battle.textContent = ' (battle)';
    line.append(battle);
  }
  const words = document.createElement('span');
  words.textContent = `: ${row.text}`;
  line.append(words);
  parent.append(line);
}

/**
 * Rebuilds the history when the message ids changed, and keeps the scroll place otherwise.
 *
 * Purpose: Older messages stay on screen while the player is reading them.
 * When to use: From `renderChatPanel`.
 * Expected outcome: Groups from `groupSideMessagesByTurn`, or `No messages yet.` The view scrolls to the bottom when it was already there, or when the panel has just been expanded.
 * Exceptions: None. A missing history element is skipped.
 */
function renderHistory(): void {
  const history = document.getElementById('chat-panel-history');
  if (!(history instanceof HTMLElement)) return;
  const snapshot = chatSnapshot();
  const key = `${snapshot.viewerSeatId ?? ''}|${snapshot.messages.map((row) => row.messageId).join(',')}`;
  const followLatest = scrollHistoryToEnd;
  scrollHistoryToEnd = false;
  const nearBottom = history.scrollHeight - history.scrollTop - history.clientHeight <= HISTORY_BOTTOM_SLACK_PX;
  if (key === historyKey && history.childElementCount > 0) {
    if (followLatest) history.scrollTop = history.scrollHeight;
    return;
  }
  historyKey = key;
  history.textContent = '';
  if (snapshot.messages.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'chat-panel-empty';
    empty.textContent = 'No messages yet.';
    history.append(empty);
  } else {
    for (const group of groupSideMessagesByTurn(snapshot.messages)) {
      const heading = document.createElement('p');
      heading.className = 'chat-panel-turn';
      heading.textContent = group.heading;
      history.append(heading);
      for (const row of group.messages) appendHistoryRow(history, row, snapshot.viewerSeatId);
    }
  }
  if (nearBottom || followLatest) history.scrollTop = history.scrollHeight;
}

/**
 * Fills the recipient drop-down when the side list changes.
 *
 * Purpose: An open list is not rebuilt on every refresh.
 * When to use: From `renderChatPanel`.
 * Expected outcome: One option per recipient seat id, labelled with `sideDisplayName`, and the stored pick selected.
 * Exceptions: None. A missing select is skipped.
 */
function renderRecipient(): void {
  const select = document.getElementById('chat-panel-recipient');
  if (!(select instanceof HTMLSelectElement)) return;
  const ids = chatSnapshot().recipientSeatIds;
  const key = ids.join('\n');
  if (key !== recipientKey) {
    recipientKey = key;
    select.textContent = '';
    for (const seatId of ids) {
      const option = document.createElement('option');
      option.value = seatId;
      option.textContent = seatName(seatId);
      select.append(option);
    }
  }
  const picked = chatRecipientSeatId();
  if (picked && select.value !== picked) select.value = picked;
}

/**
 * Shows the draft for the picked side, or hides the row.
 *
 * Purpose: The player sees the message that will be sent to that side.
 * When to use: From `renderChatPanel`. This function does not write the text field.
 * Expected outcome: The row's text and title are the draft. The row is hidden when that side has no draft, and while the viewer cannot send.
 * Exceptions: None.
 */
function renderStaged(): void {
  const row = document.getElementById('chat-panel-staged');
  const text = document.getElementById('chat-panel-staged-text');
  if (!(row instanceof HTMLElement) || !(text instanceof HTMLElement)) return;
  const snapshot = chatSnapshot();
  const staged = snapshot.canSend ? stagedMessageFor(snapshot.staged, chatRecipientSeatId()) : null;
  if (!staged) {
    row.hidden = true;
    text.textContent = '';
    text.removeAttribute('title');
    return;
  }
  row.hidden = false;
  text.textContent = staged.text;
  text.title = staged.text;
}

/**
 * Paints the panel from the stored thread.
 *
 * Purpose: A refresh, a drop-down change, and an expand all leave the panel matching the thread.
 * When to use: The thread listener, and the expand control before it measures the open height.
 * Expected outcome: The history, the drop-down, the staged row, and `data-can-send` match the snapshot. The text field is not written. The panel's visibility is synced.
 * Exceptions: None. A missing panel is skipped.
 */
export function renderChatPanel(): void {
  const panel = document.getElementById('chat-panel');
  if (!(panel instanceof HTMLElement)) return;
  panel.dataset.canSend = chatSnapshot().canSend ? 'true' : 'false';
  renderRecipient();
  renderStaged();
  renderHistory();
  syncSendEnabled();
  syncChatPanelVisibility();
}

/**
 * Binds the panel's controls and reads the thread.
 *
 * Purpose: The panel is ready when the match screen is.
 * When to use: Once, immediately after `wireSelectionPanelExpand`.
 * Expected outcome: Expand slides the history. The drop-down, Enter, send, edit, and cancel talk to the thread. A refresh runs for the match already on screen.
 * Exceptions: None. Missing elements are skipped.
 */
export function wireChatPanel(): void {
  const panel = document.getElementById('chat-panel');
  const button = document.getElementById('chat-panel-expand');
  const bar = document.getElementById('chat-panel-bar');
  if (panel instanceof HTMLElement && button instanceof HTMLElement && bar instanceof HTMLElement) {
    syncExpandControl(button);
    button.addEventListener('click', () => toggleChatPanel(panel, bar, button));
  }
  const input = document.getElementById('chat-panel-input');
  if (input instanceof HTMLInputElement) {
    input.addEventListener('input', () => syncSendEnabled());
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
      event.preventDefault();
      void stageFromInput();
    });
  }
  document.getElementById('chat-panel-send')?.addEventListener('click', () => {
    void stageFromInput();
  });
  const select = document.getElementById('chat-panel-recipient');
  if (select instanceof HTMLSelectElement) {
    select.addEventListener('change', () => {
      setChatRecipient(select.value);
      renderChatPanel();
    });
  }
  document.getElementById('chat-panel-staged-edit')?.addEventListener('click', () => {
    void editStaged();
  });
  document.getElementById('chat-panel-staged-cancel')?.addEventListener('click', () => {
    void cancelStagedChatMessage();
  });
  subscribeChatThread(() => renderChatPanel());
  void refreshChatThread();
  syncChatPanelVisibility();
  layoutMapChrome();
}
