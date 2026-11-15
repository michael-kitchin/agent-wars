/**
 * The chat panel at the map's bottom-right: the history, the pending lines, and the entry line.
 *
 * Purpose: The player reads what commanders say and writes a message that is sent on the next commit.
 * When to use: `wireChatPanel` once at startup, from the selection panel's wiring.
 * Expected outcome: The panel starts compact. Expanding shows the history. Enter or the send button stages the field. The field is cleared only after a successful stage.
 * Exceptions: Missing elements are skipped. A stage failure is shown on the map toast and the typed text stays.
 */

import { canStageText, chatNamedSeatKey, stagedMessageFor, stagedMessagesInSeatOrder } from '../../shared/chatPanelState';
import { groupSideMessagesByTurn, SIDE_MESSAGE_ARROW, type SideMessageView } from '../../shared/sideMessageView';
import { sideDisplayName, type SideDisplaySeat } from '../../shared/sideNicknames';
import { chatStagedCancelTooltipText, chatStagedEditTooltipText } from '../chrome/controlTooltipText';
import { startPanelHeightSlide } from '../chrome/panelSlideHelpers';
import { createMessagePartyFlag } from '../chrome/sideNumberFlag';
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
 * The drafts last painted above the entry bar.
 *
 * Purpose: A refresh that did not change those drafts must leave Edit and Cancel focused.
 * When to use: `renderStaged`.
 * Expected outcome: Empty until the first paint. The value contains message text, so nothing logs it.
 * Exceptions: None.
 */
let stagedKey = '';

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
 * When to use: Each recipient option, and each name in a message line.
 * Expected outcome: `sideDisplayName` for a roster seat, or the seat id when the seat is missing.
 * Exceptions: None.
 */
function seatName(seatId: string): string {
  const seat = rosterSeats().find((row) => row.seatId === seatId);
  return seat ? sideDisplayName(seat) : seatId;
}

/**
 * The roster order of one seat.
 *
 * Purpose: A turn lists messages by who sent them, then by who received them.
 * When to use: `groupSideMessagesByTurn`.
 * Expected outcome: That seat's `seatOrder`. A missing seat sorts after every known seat.
 * Exceptions: None.
 */
function seatOrderOf(seatId: string): number {
  return rosterSeats().find((row) => row.seatId === seatId)?.seatOrder ?? Number.MAX_SAFE_INTEGER;
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
    expanded ? 'Hide the message history.' : 'Show every message sent this match.',
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
 * The message field, when the page has the multiline control.
 *
 * Purpose: Enter, the send button, and Edit share one lookup.
 * When to use: Any read or write of the text the player is composing.
 * Expected outcome: The textarea, or null when the panel is absent.
 * Exceptions: None.
 */
function chatMessageField(): HTMLTextAreaElement | null {
  const input = document.getElementById('chat-panel-input');
  return input instanceof HTMLTextAreaElement ? input : null;
}

/**
 * Sizes the recipient list to its longest name.
 *
 * Purpose: The closed list stays as wide as the widest entry, including the menu arrow, and no wider.
 * When to use: After the options are painted, including when the stored pick changes.
 * Expected outcome: `width` is the longest option's text plus padding, borders, and the arrow. The stylesheet max-width still leaves the message field its minimum.
 * Exceptions: None.
 */
function fitRecipientToWidestOption(select: HTMLSelectElement): void {
  const probe = document.createElement('span');
  probe.style.position = 'fixed';
  probe.style.left = '-9999px';
  probe.style.whiteSpace = 'nowrap';
  probe.style.font = getComputedStyle(select).font;
  document.body.append(probe);
  const widest = Math.max(
    0,
    ...Array.from(select.options, (option) => {
      probe.textContent = option.textContent ?? '';
      return probe.offsetWidth;
    }),
  );
  probe.remove();
  const paddingBordersAndArrow = 28;
  select.style.width = `${widest + paddingBordersAndArrow}px`;
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
  const input = chatMessageField();
  const send = document.getElementById('chat-panel-send');
  if (!input || !(send instanceof HTMLButtonElement)) return;
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
  const input = chatMessageField();
  if (!input || !canStageText(input.value)) return;
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
 * Moves one pending draft back into the field and discards that draft.
 *
 * Purpose: The player edits by staging the text again, to the same side.
 * When to use: The edit button on that line.
 * Expected outcome: The drop-down points at that side, the field holds the draft, the caret is at the end, and that line is gone. Other pending lines stay.
 * Exceptions: None. No draft for that side leaves the field unchanged.
 */
async function editStaged(toSeatId: string): Promise<void> {
  const staged = stagedMessageFor(chatSnapshot().staged, toSeatId);
  const input = chatMessageField();
  if (!staged || !input) return;
  setChatRecipient(toSeatId);
  input.value = staged.text;
  syncSendEnabled();
  await cancelStagedChatMessage(toSeatId);
  input.focus();
  const end = input.value.length;
  input.setSelectionRange(end, end);
}

/**
 * The pencil mark on an edit button.
 *
 * Purpose: Each pending line uses the same mark the single row used.
 * When to use: While building one pending line.
 * Expected outcome: An SVG that does not get its own accessible name.
 * Exceptions: None.
 */
function stagedEditMark(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'chrome-icon');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M9.5 2.5l4 4L6 14H2v-4L9.5 2.5z');
  svg.append(path);
  return svg;
}

/**
 * One icon button for a pending line.
 *
 * Purpose: Edit and cancel share the control class and the tip installer.
 * When to use: While building one pending line.
 * Expected outcome: A button whose tip is the catalog sentence for that action.
 * Exceptions: None.
 */
function stagedIconButton(label: string, tooltip: string, mark: Node): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'chat-panel-icon-btn';
  button.setAttribute('aria-label', label);
  button.setAttribute('data-control-tooltip', tooltip);
  button.append(mark);
  return button;
}

/**
 * One pending line: the human's flag and name, an arrow, the target's flag and name, and the text.
 *
 * Purpose: The current-turn list names who each draft will go to.
 * When to use: Once per draft, in recipient order.
 * Expected outcome: The line's text is set with `textContent` and text nodes. Edit points the drop-down at that side and puts the text back in the field. Cancel discards that draft. The title is the full line, without the flags.
 * Exceptions: None.
 */
function stagedRow(row: SideMessageView, viewerSeatId: string | null): HTMLElement {
  const line = document.createElement('div');
  line.className = 'chat-panel-staged-row';
  const text = document.createElement('p');
  text.className = 'chat-panel-staged-text';
  const fromSeatId = viewerSeatId ?? row.fromSeatId;
  appendParty(text, fromSeatId);
  text.append(document.createTextNode(` ${SIDE_MESSAGE_ARROW} `));
  appendParty(text, row.toSeatId);
  const words = document.createElement('span');
  words.textContent = `: ${row.text}`;
  text.append(words);
  text.title = `${seatName(fromSeatId)} ${SIDE_MESSAGE_ARROW} ${seatName(row.toSeatId)}: ${row.text}`;
  const edit = stagedIconButton('Edit this message', chatStagedEditTooltipText, stagedEditMark());
  edit.addEventListener('click', () => {
    void editStaged(row.toSeatId);
  });
  const cancel = stagedIconButton('Cancel this message', chatStagedCancelTooltipText, document.createTextNode('×'));
  cancel.addEventListener('click', () => {
    void cancelStagedChatMessage(row.toSeatId);
  });
  line.append(text, edit, cancel);
  return line;
}

/**
 * Paints one side's flag, then that side's name.
 *
 * Purpose: The history and a pending line name the human the same way as every other side.
 * When to use: Each end of a history row, and both ends of a pending line.
 * Expected outcome: The seat-1 badge and `sideDisplayName` for the human. An opponent gets that opponent's number flag and name. A missing flag still leaves the name.
 * Exceptions: None.
 */
function appendParty(parent: HTMLElement, seatId: string): void {
  const flag = createMessagePartyFlag(seatId, rosterSeats());
  if (flag) parent.append(flag);
  const name = document.createElement('span');
  name.textContent = seatName(seatId);
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
  appendParty(line, row.fromSeatId);
  const arrow = document.createElement('span');
  arrow.textContent = ` ${SIDE_MESSAGE_ARROW} `;
  line.append(arrow);
  appendParty(line, row.toSeatId);
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
 * Expected outcome: Groups from `groupSideMessagesByTurn`, each turn in source seat order, or `No messages yet.` The view is rebuilt when the side list or a side's name changes. It scrolls to the bottom when it was already there, or when the panel has just been expanded.
 * Exceptions: None. A missing history element is skipped.
 */
function renderHistory(): void {
  const history = document.getElementById('chat-panel-history');
  if (!(history instanceof HTMLElement)) return;
  const snapshot = chatSnapshot();
  const appearing = [...new Set(snapshot.messages.flatMap((row) => [row.fromSeatId, row.toSeatId]))];
  const key = `${snapshot.viewerSeatId ?? ''}|${snapshot.messages.map((row) => row.messageId).join(',')}|${chatNamedSeatKey(appearing, seatName)}`;
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
    for (const group of groupSideMessagesByTurn(snapshot.messages, seatOrderOf)) {
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
 * Expected outcome: One option per recipient seat id, labelled with `sideDisplayName`, and the stored pick selected. The list is rebuilt when the side list or a side's name changes, and its width follows the longest name.
 * Exceptions: None. A missing select is skipped.
 */
function renderRecipient(): void {
  const select = document.getElementById('chat-panel-recipient');
  if (!(select instanceof HTMLSelectElement)) return;
  const ids = chatSnapshot().recipientSeatIds;
  const key = chatNamedSeatKey(ids, seatName);
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
  fitRecipientToWidestOption(select);
}

/**
 * Shows every unsent draft, in the recipient list's order.
 *
 * Purpose: The player sees each message that will be sent this turn, whichever side the drop-down shows.
 * When to use: From `renderChatPanel`. This function does not write the text field.
 * Expected outcome: One line per draft from `stagedMessagesInSeatOrder`. The block is hidden when there is no draft, and while the viewer cannot send. An unchanged list keeps its buttons.
 * Exceptions: None.
 */
function renderStaged(): void {
  const host = document.getElementById('chat-panel-staged');
  if (!(host instanceof HTMLElement)) return;
  const snapshot = chatSnapshot();
  const staged = snapshot.canSend ? stagedMessagesInSeatOrder(snapshot.staged, snapshot.recipientSeatIds) : [];
  const fromSeatId = snapshot.viewerSeatId ?? staged[0]?.fromSeatId ?? '';
  const fromName = fromSeatId === '' ? '' : seatName(fromSeatId);
  const rows = staged.map((row) => [row.messageId, row.toSeatId, seatName(row.toSeatId), row.text].join('\u0000')).join('\u0001');
  const key = [fromSeatId, fromName, rows].join('\u0000');
  if (key === stagedKey && (staged.length === 0 || host.childElementCount === staged.length)) {
    host.hidden = staged.length === 0;
    return;
  }
  stagedKey = key;
  host.replaceChildren();
  if (staged.length === 0) {
    host.hidden = true;
    return;
  }
  host.hidden = false;
  for (const row of staged) host.append(stagedRow(row, snapshot.viewerSeatId));
}

/**
 * Paints the panel from the stored thread.
 *
 * Purpose: A refresh, a drop-down change, and an expand all leave the panel matching the thread.
 * When to use: The thread listener, and the expand control before it measures the open height.
 * Expected outcome: The history, the drop-down, every pending line, and `data-can-send` match the snapshot. The text field is not written. The panel's visibility is synced.
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
  const input = chatMessageField();
  if (input) {
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
  subscribeChatThread(() => renderChatPanel());
  void refreshChatThread();
  syncChatPanelVisibility();
  layoutMapChrome();
}
