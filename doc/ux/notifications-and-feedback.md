# Notifications and Feedback

Which surface reports which kind of message, including the two map toasts.

## Purpose

Keep errors, turn summaries, and the opponent's consultation text on the surfaces that already show them, so a new message does not invent a fourth channel.

## Feedback Channels

| Channel | Used For | Lifetime | Details In |
| --- | --- | --- | --- |
| Map toast | Errors, rejected orders, turn-loss summaries, unknown-battle announcements, and basemap load failure | Until dismiss, or until a fixed interval elapses. A new map toast replaces the old one and restarts the interval. The basemap failure uses the same interval. | This document |
| AI strategy toast | The opponent's message and strategy summary after a consultation | Until dismiss, or until the same fixed interval elapses. Empty content hides it. | This document |
| Sidebar error line | Nothing. It is not a player-visible surface. Errors reported to the sidebar, such as a failed Ready or a failed tactical commit, show on the map toast instead. | Always hidden | This document |
| AI activity log | AI interaction lines and error lines, including a one-line copy of a turn-update toast | Accumulates during a match. Starting a new match clears it. | [ai-activity-log.md](ai-activity-log.md) |
| Hex tooltips | The hex readout, whose Effects line includes movement, range, and cover when those apply, a blocked-order notice, and the terrain, weather, and target cover that change an aimed order | The hex readout and the effects notice appear one second after the pointer rests. Moving farther than 6 pixels before either opens starts that wait again. Once open, the hex readout stays while the pointer remains on that cell. The effects notice stays too, until the player stops aiming. The blocked notice appears one second after the pointer rests and follows the pointer, then hides itself a short time after the pointer stops. Moving farther than 6 pixels before it opens starts that wait again. Stopping the aim, changing cell, leaving the map, or pressing hides it, including a notice that has not opened. | [hex-tooltips.md](hex-tooltips.md) |
| Bonuses tooltip | Birth bonuses of one unit: Country, Terrain, and Weather when those options are on, and Tech when the tech bonus is on and the unit is Basic or Advanced | Appears one second after the pointer arrives on that unit flag or one-unit token, and stays while the pointer remains. Moving on the flag or token does not start that wait again. Hides when the pointer leaves. | [stack-callout.md](stack-callout.md) |
| Stack callout | Units in a hex | Until the player dismisses it or the next map gesture closes it | [stack-callout.md](stack-callout.md) |

## Availability

The map toast and the AI strategy toast can appear in Strategic planning, Resolution playback, and Tactical planning. They do not require a mode change. New game and Game over disable pointer input on the map, which includes the toasts, because those overlays disable the map container.

## Information Displayed

- The map toast shows one message at the lower right. The AI strategy toast shows at the upper right. Both use the navy chrome in the [UI style guide](../ui-style-guide.md). An error has a light-red border. An informational message, including a turn update, an unknown-battle announcement, a basemap failure, and the AI strategy toast, has the steel border. The body is the message text, not a fixed sentence list.
- In a turn-update toast, each victim named on a loss line is preceded by that unit's origin flag. The flag uses the same Bonuses tooltip as the [stack callout](stack-callout.md). A destroyed unit keeps those lines from the birth record remembered after it is gone, including a Tech line when the tech bonus is on and the unit's tech tier is known. Grouped totals such as "3 Infantry", the Updates section, and every other toast line have no flags. If two victims share a display name but came from different places, that name gets no flag.
- A basemap failure uses the map toast once: some tiles failed to load, and the game remains playable. It hides after the same interval as other map toasts, on dismiss, or when a later map toast replaces it.
- The AI strategy toast shows a Message section, a Strategy section, or both, in that order. A section whose text is empty or whitespace is omitted. If both are empty, the toast hides.
- The sidebar error line shows nothing and stays hidden.

## Inputs and Responses

### Mouse

- When the player clicks the map toast dismiss control, the map toast hides and its hide timer is cancelled.
- When the player clicks the AI strategy toast dismiss control, that toast hides and its hide timer is cancelled.

### Keyboard

- None.

### Other

- When a new map toast is shown, it replaces the previous map toast.
- When an error is reported to the sidebar, the map toast shows that text as an error. The sidebar error line stays hidden.

## States

- Hidden: the toast is not shown. This is the start state, the state after dismiss, and the state after the hide interval.
- Visible: a message is showing. A newer message of the same toast replaces the body and restarts the interval.
- The sidebar error line has only the hidden state.

## Invariants

- Errors are reported on the map toast only. The sidebar error line never shows text.
- Every map toast, including the basemap failure, hides after the fixed interval unless a newer message replaced it first.
- An empty AI strategy toast never stays visible.
- Showing one toast does not hide the other toast.

## Strategic and Tactical Differences

Both toasts use the same show, replace, and dismiss behavior in both theaters. Tactical Ready and strategic Ready can both raise a turn-update map toast and an AI strategy toast.

## Related Documents

- [modes-and-transitions.md](modes-and-transitions.md)
- [order-lifecycle.md](order-lifecycle.md)
- [input-map.md](input-map.md)
- [right-panel-selection-and-orders.md](right-panel-selection-and-orders.md)

## Known Deviations

None.

## Open Questions

None.

## Code Entry Points

- `static/index.html` (`#map-toast`, `#map-toast-text`, `#map-toast-dismiss`, `#ai-strategy-toast`, `#ai-strategy-toast-text`, `#ai-strategy-toast-dismiss`, `#sidebar-error`)
- `src/renderer/openRouter/openRouterUiHelpers.ts`
- `src/renderer/openRouter/openRouterControls.ts`
- `src/renderer/gameplay/sidebarSupport.ts`
- `src/renderer/gameplay/readyResolutionAnnouncements.ts`
- `src/renderer/gameplay/turnUpdateSummary.ts`
- `src/renderer/core/unitOriginFlags.ts`
- `src/shared/lossToastUnitSegments.ts`
- `src/renderer/map/worldLeafletMap.ts`
- `src/shared/aiStrategyToastContent.ts`
- `src/renderer/core/constants.ts`
