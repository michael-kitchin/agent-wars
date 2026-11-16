# Chat Panel

The panel at the map's bottom-right where the player reads messages and writes one.

## Purpose

Show every message sent between sides, and let a player stage a message to one commander. The message is sent when Ready commits the turn or the beat.

## Availability

Shown in Strategic planning and Tactical planning while a match is loaded, playback is not running, the map toast is hidden, and the checkbox "Start the next turn when every commander is ready" is off (`S.autoAdvance`). Hidden while that checkbox is on, while resolution playback is running, and while the map toast is showing, including an error toast. Hidden for the whole New game and Game over overlay (`body:has(#game-over-overlay:not(.hidden)) #chat-panel` in `static/chatChrome.css`). Clearing the checkbox shows the panel again, unless playback or the map toast is using that corner. An observer with the checkbox off sees the panel and cannot write. See [modes-and-transitions.md](modes-and-transitions.md) and [resolution-playback.md](resolution-playback.md). While [replay](replay-panel.md) is on, the panel is hidden.

## Information Displayed

- Two states. Compact: the entry bar alone. Expanded: the history above that bar. The app opens compact (`data-state="compact"` on `#chat-panel`). The choice lasts until the app closes and is not saved.
- The panel is as wide as the message dialog's band (`chatPanelPlacement` in `src/shared/mapChromePlacement.ts`, using the width `layoutMapChrome` computed). Its right edge is 12 px in from the map (`MAP_CHROME_INSET`). Its bottom edge is 12 px in, plus the scale's height and 8 px (`MAP_CHROME_GAP`) when the scale is showing. The history's maximum height is half the map height, rounded down. The panel stays inside the map (`max-width: calc(100% - 24px)`). It draws under the selection panel (z-index 6100, under 6200) and hides while the map toast shows, so the toast is not covered by raising it.
- The entry bar is one 50 px row at the bottom of the panel. From left to right, while the viewer can send:
  - The expand control, the bar's full height and 32 px wide. The chevron points up while the panel is compact and down while it is expanded.
  - A drop-down of the AI sides still in the match, in seat order. Each option is that side's `sideDisplayName` (`src/shared/sideNicknames.ts`). The closed list is as wide as its widest name, plus its padding and menu arrow (`fitRecipientToWidestOption`). A name that would leave the field under 80 px ends in an ellipsis, and the list shrinks before the field does.
  - A message field, the same height as that drop-down, filling the rest of the row. Placeholder "Write a message", at most `SIDE_MESSAGE_MAX_CHARS` (280) characters. The text wraps. A line that does not fit scrolls inside the field.
  - A send button, a right-facing arrow.
- While the viewer cannot send (`data-can-send="false"`), the bar shows the expand control and the title "Messages". The drop-down, the text field, the send button, and the pending lines are hidden. An observer is that case. So is a player with no AI side left.
- The pending lines sit above the bar, one per unsent draft, in the drop-down's order (`stagedMessagesInSeatOrder`). Each line is the human's seat-1 flag and `sideDisplayName`, `→`, that side's flag and `sideDisplayName`, `: `, and the text, ending in an ellipsis, with the full line as the row's title, then Edit and ×. The drop-down does not choose which lines appear. A draft whose side has left the match is last. The history is not filtered by the drop-down.
- The history, while expanded, groups sent messages by turn, oldest at the top (`groupSideMessagesByTurn`). Each heading is `Turn N`. Under it, every message sent that turn, in the sender's `seatOrder`, and within one sender in the recipient's `seatOrder`. A row is the sender's flag and name, `→`, the recipient's flag and name, `: `, and the text. A message sent in a battle adds ` (battle)` after the recipient. The human is named the same way: the seat-1 flag from `createMessagePartyFlag` and `sideDisplayName`. The viewer's own rows are heavier. A long name wraps and does not widen the panel. With no messages the history reads "No messages yet."
- The snapshot lists every sent message. Fog and observing do not remove one. Commanders are unchanged: each sees only what they sent or received (`sideMessageVisibleTo`). A later fog change does not add or remove a history line, and it does not rewrite an open message dialog or a Reports entry already filed.
- The history refreshes when the panel is wired, when a match starts, when the commander pool drains a consult or finishes one, and after Ready or a tactical commit returns success. It reads `readSideMessages`, not the consult dispatches.

## Inputs and Responses

### Mouse

- The expand control toggles compact and expanded. The height slides unless reduced motion is requested (`startPanelHeightSlide`). Expanding scrolls the history to the latest message.
- The drop-down picks the recipient for the next message. It does not change the pending lines. The list is rebuilt when the seat ids change or a side's name changes.
- Edit on a pending line points the drop-down at that side, copies that text into the field, discards that draft, and puts the caret at the end. × discards that draft. Other drafts stay.
- A click, a drag, or a wheel turn that starts on the panel does not reach the map, because the panel is a sibling of `#main-map`. The wheel scrolls the history when the history can scroll.

### Keyboard

- Enter in the text field, without Shift and while an input method is not composing, stages the text. Shift+Enter starts a new line. The send button stages the text too. The button is disabled while the field has no character that is not whitespace. A successful stage clears the field when it still holds that text, and leaves focus there. Text typed while the stage is in flight stays. Staging the same side again replaces the draft. A refusal is an error map toast (`showMapToast` with no options). The typed text stays, and the panel hides until that toast closes.
- Map keys do not act while the field, the drop-down, or any other editable control has focus (`shouldIgnoreGlobalKeydown`).
- Tab order is the expand control, the drop-down, the text field, the send button, then each pending line's Edit and ×. Each control has the selection panel's focus ring.

### Other

- The text field is not rewritten by a refresh. Only Edit writes it.
- Entering the panel hides the hex tooltip, the same as entering the selection panel.
- Side names in the drop-down and the history follow `sideDisplayName` after New game, after a nickname edit, and after the app restarts with a match in progress.
- The panel is repainted from the stored thread (`repaintChatThread`), and its visibility set again, whenever a match snapshot is applied. A restored match reads the thread before its first snapshot, so that repaint is what replaces seat ids with side names.

## States

- Compact, expanded, and the slide between them (`expanding`, `collapsing`).
- Hidden, while the auto-advance checkbox is on, while playback runs, while `#map-toast` lacks the class `hidden`, while no match is loaded, and during New game and Game over.
- Can send, or read only.

## Invariants

- Message text reaches the page through `textContent`. The panel does not use `innerHTML`.
- A staged message is sent by the existing commit path. The panel does not send it itself.
- A side that leaves the match drops out of the drop-down. A draft addressed to that side is discarded on commit.
- The history keeps its scroll place unless it was within 8 px of the bottom, or the panel has just been expanded.
- A refresh that does not change the drafts leaves each pending line's Edit and Cancel in place. A changed draft, a new line, or a removed line rebuilds the list.
- The message dialog and the Reports entry list every message that commander sent in that consult. The dialog names the human with the seat-1 flag and `sideDisplayName`. A Reports line still says You and gives that seat no flag. The history lists every sent message, in source seat order then recipient seat order within each turn.

## Strategic and Tactical Differences

The panel is the same in both theaters. A message sent on a battle beat is marked ` (battle)`. It hides during playback in either theater and shows again for a battle's planning turn when no map toast is up and the auto-advance checkbox is off. While that checkbox is on, the panel stays hidden in both theaters.

## Related Documents

- [notifications-and-feedback.md](notifications-and-feedback.md)
- [reports-tab.md](reports-tab.md)
- [input-map.md](input-map.md)
- [control-tooltips.md](control-tooltips.md)
- [hex-tooltips.md](hex-tooltips.md)
- [modes-and-transitions.md](modes-and-transitions.md)
- [resolution-playback.md](resolution-playback.md)
- [commander-messages.md](../commander-messages.md)

## Known Deviations

- None.

## Open Questions

- None.

## Code Entry Points

- `static/index.html` (`#chat-panel`)
- `static/chatChrome.css`
- `src/renderer/chat/chatPanel.ts` (`wireChatPanel`, `renderChatPanel`)
- `src/renderer/chat/chatPanelClient.ts` (`refreshChatThread`, `repaintChatThread`, `stageChatMessage`, `cancelStagedChatMessage`)
- `src/renderer/core/stateSnapshot.ts` (`applyGameStateSnapshot`)
- `src/renderer/chat/chatPanelVisibility.ts` (`syncChatPanelVisibility`)
- `src/renderer/gameplay/observeChrome.ts` (the auto-advance checkbox, `stopObserveAutoAdvance`)
- `src/renderer/gameplay/observeIntent.ts` (`chooseWatchTheRest`, `clearObserveAfterKnockout`)
- `src/shared/chatPanelState.ts` (`stagedMessagesInSeatOrder`, `stagedMessageFor`, `nextRecipientSeatId`, `canStageText`, `chatPanelShouldShow`)
- `src/shared/mapChromePlacement.ts` (`chatPanelPlacement`)
- `src/renderer/map/mapChromeLayout.ts` (`layoutMapChrome`)
- `src/shared/sideMessageView.ts` (`groupSideMessagesByTurn`)
- `src/renderer/chrome/sideNumberFlag.ts` (`createMessagePartyFlag`)
- `src/renderer/gameplay/selectionPanel.ts` (`wireChatPanel` from `wireSelectionPanel`)
- `src/main/ipc/sideMessageIpcHandler.ts` (`buildSideMessageThreadSnapshot`)
