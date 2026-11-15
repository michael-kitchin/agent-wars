# Chat Panel

The panel at the map's bottom-right where the player reads messages and writes one.

## Purpose

Show the messages the viewer may see, and let a player stage a message to one commander. The message is sent when Ready commits the turn or the beat.

## Availability

Shown in Strategic planning and Tactical planning while a match is loaded, playback is not running, and the map toast is hidden. Hidden while resolution playback is running and while the map toast is showing, including an error toast. Hidden for the whole New game and Game over overlay (`body:has(#game-over-overlay:not(.hidden)) #chat-panel` in `static/chatChrome.css`). An observer sees the panel and cannot write. See [modes-and-transitions.md](modes-and-transitions.md) and [resolution-playback.md](resolution-playback.md).

## Information Displayed

- Two states. Compact: the entry bar alone. Expanded: the history above that bar. The app opens compact (`data-state="compact"` on `#chat-panel`). The choice lasts until the app closes and is not saved.
- The panel is as wide as the message dialog's band (`chatPanelPlacement` in `src/shared/mapChromePlacement.ts`, using the width `layoutMapChrome` computed). Its right edge is 12 px in from the map (`MAP_CHROME_INSET`). Its bottom edge is 12 px in, plus the scale's height and 8 px (`MAP_CHROME_GAP`) when the scale is showing. The history's maximum height is half the map height, rounded down. The panel stays inside the map (`max-width: calc(100% - 24px)`). It draws under the selection panel (z-index 6100, under 6200) and hides while the map toast shows, so the toast is not covered by raising it.
- The entry bar is one 50 px row at the bottom of the panel. From left to right, while the viewer can send:
  - The expand control, the bar's full height and 32 px wide. The chevron points up while the panel is compact and down while it is expanded.
  - A drop-down of the AI sides still in the match, in seat order. Each option is that side's `sideDisplayName` (`src/shared/sideNicknames.ts`). A long name ends in an ellipsis. The drop-down shrinks before the text field does. The text field keeps at least 80 px.
  - A text field, placeholder "Write a message", at most `SIDE_MESSAGE_MAX_CHARS` (280) characters.
  - A send button, a right-facing arrow.
- While the viewer cannot send (`data-can-send="false"`), the bar shows the expand control and the title "Messages". The drop-down, the text field, the send button, and the staged row are hidden. An observer is that case. So is a player with no AI side left.
- The staged row sits above the bar when the picked side has an unsent draft. It shows that text, ending in an ellipsis, with the full text as the row's title, then Edit and ×. A side that is not picked does not show its draft. The history is not filtered by the drop-down.
- The history, while expanded, groups sent messages by turn, oldest at the top (`groupSideMessagesByTurn`). Each heading is `Turn N`. A row is the sender's flag and name, `→`, the recipient's flag and name, `: `, and the text. A message sent in a battle adds ` (battle)` after the recipient. You has no flag, in the history and in the message dialog. The viewer's own rows are heavier. A long name wraps and does not widen the panel. With no messages the history reads "No messages yet."
- The main process decides which messages are in the snapshot (`sideMessageVisibleTo`). With fog on, a player sees messages they sent and messages sent to them. With fog off, the player sees every message. An observer sees every message. Commanders are unchanged: each sees only what they sent or received. A later fog change updates the history on the next read. It does not rewrite an open message dialog or a Reports entry already filed.
- The history refreshes when the panel is wired, when a match starts, when the commander pool drains a consult or finishes one, and after Ready or a tactical commit returns success. It reads `readSideMessages`, not the consult dispatches.

## Inputs and Responses

- The expand control toggles compact and expanded. The height slides unless reduced motion is requested (`startPanelHeightSlide`). Expanding scrolls the history to the latest message.
- The drop-down picks the recipient. The staged row follows that pick. The list is rebuilt only when the seat ids change.
- Enter in the text field, without Shift and while an input method is not composing, stages the text. The send button does the same. The button is disabled while the field has no character that is not whitespace. A successful stage clears the field when it still holds that text, and leaves focus there. Text typed while the stage is in flight stays. Staging the same side again replaces the draft. A refusal is an error map toast (`showMapToast` with no options). The typed text stays, and the panel hides until that toast closes.
- Edit copies the staged text into the field, discards the draft, and puts the caret at the end. × discards the draft.
- The text field is not rewritten by a refresh. Only Edit writes it.
- Map keys do not act while the field, the drop-down, or any other editable control has focus (`shouldIgnoreGlobalKeydown`). A click, a drag, or a wheel turn that starts on the panel does not reach the map, because the panel is a sibling of `#main-map`. The wheel scrolls the history when the history can scroll.
- Tab order is the expand control, the drop-down, the text field, the send button, then Edit and × when the staged row is showing. Each control has the selection panel's focus ring.
- Entering the panel hides the hex tooltip, the same as entering the selection panel.

## States

- Compact, expanded, and the slide between them (`expanding`, `collapsing`).
- Hidden, while playback runs, while `#map-toast` lacks the class `hidden`, while no match is loaded, and during New game and Game over.
- Can send, or read only.

## Invariants

- Message text reaches the page through `textContent`. The panel does not use `innerHTML`.
- A staged message is sent by the existing commit path. The panel does not send it itself.
- A side that leaves the match drops out of the drop-down. A draft addressed to that side is discarded on commit.
- The history keeps its scroll place unless it was within 8 px of the bottom, or the panel has just been expanded.
- Dialog bullets and Reports lines are the messages the viewer could see when the consult was stored. You has no flag there either.

## Strategic and Tactical Differences

The panel is the same in both theaters. A message sent on a battle beat is marked ` (battle)`. It hides during playback in either theater and shows again for a battle's planning turn when no map toast is up.

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
- `src/renderer/chat/chatPanelClient.ts` (`refreshChatThread`, `stageChatMessage`, `cancelStagedChatMessage`)
- `src/renderer/chat/chatPanelVisibility.ts` (`syncChatPanelVisibility`)
- `src/shared/chatPanelState.ts` (`stagedMessageFor`, `nextRecipientSeatId`, `canStageText`, `chatPanelShouldShow`)
- `src/shared/mapChromePlacement.ts` (`chatPanelPlacement`)
- `src/renderer/map/mapChromeLayout.ts` (`layoutMapChrome`)
- `src/shared/sideMessageView.ts` (`groupSideMessagesByTurn`, `sideMessagePartyLabel`)
- `src/renderer/chrome/sideNumberFlag.ts` (`createSideNumberFlag`)
