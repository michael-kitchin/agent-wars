# Notifications and Feedback

Which surface reports which kind of message, including the two map toasts.

## Purpose

Keep errors, turn summaries, and the opponent's consultation text on the surfaces that already show them, so a new message does not invent a fourth channel.

## Feedback Channels

| Channel | Used For | Lifetime | Details In |
| --- | --- | --- | --- |
| Map toast | Errors, rejected orders, turn-loss summaries, unknown-battle announcements, and basemap load failure | Until dismiss, or until a fixed interval elapses. A new map toast replaces the old one and restarts the interval. The basemap failure uses the same interval. | This document |
| Reports tab | A copy of every informational map toast, and one Message entry per kept commander dispatch. The message dialog is not filed | Accumulates during a match. Starting a new match clears it. | [reports-tab.md](reports-tab.md) |
| AI strategy toast | One tab per AI opponent. A tab starts disabled and turns on when that opponent sends a message. Strategy is on the selected tab only while observing | Until dismiss, or until the same fixed interval elapses. Each new message restarts that interval and selects its tab | This document |
| Sidebar error line | Nothing. It is not a player-visible surface. Errors reported to the sidebar, such as a failed Ready or a failed tactical commit, show on the map toast instead. | Always hidden | This document |
| AI activity log | AI interaction lines and error lines, including a one-line copy of a turn-update toast | Accumulates during a match. Starting a new match clears it. | [ai-activity-log.md](ai-activity-log.md) |
| Hex tooltips | The hex readout, whose Effects line includes movement, range, and cover when those apply, a blocked-order notice, and the terrain, weather, and target cover that change an aimed order | The hex readout and the effects notice appear one second after the pointer rests. Moving farther than 6 pixels before either opens starts that wait again. Once open, the hex readout stays while the pointer remains on that cell. The effects notice stays too, until the player stops aiming. The blocked notice appears one second after the pointer rests and follows the pointer, then hides itself a short time after the pointer stops. Moving farther than 6 pixels before it opens starts that wait again. Stopping the aim, changing cell, leaving the map, or pressing hides it, including a notice that has not opened. A control tip hides the hex readout when that control tip appears. | [hex-tooltips.md](hex-tooltips.md) |
| Control tips | Why the player would use a button, text field, checkbox, or dropdown, and what they can enter | Appears one second after the pointer or keyboard focus arrives on the control or its label. Moving on that same control does not start the wait again. Hides when the pointer and focus leave, when the control is hidden, when a dropdown list opens or a choice is made, or while a blocked or effects order tip is showing. | [control-tooltips.md](control-tooltips.md) |
| Bonuses tooltip | The unit's name and formation date when those are known, then its birth bonuses: Origin, Terrain, and Weather when those options are on, and Tech when the tech bonus is on and the unit is Basic or Advanced | Appears one second after the pointer arrives on that unit flag or one-unit token, and stays while the pointer remains. Moving on the flag or token does not start that wait again. Hides when the pointer leaves. | [stack-callout.md](stack-callout.md) |
| Stack callout | Units in a hex | Until the player dismisses it or the next map gesture closes it | [stack-callout.md](stack-callout.md) |

## Availability

The map toast and the AI strategy toast can appear in Strategic planning, Resolution playback, and Tactical planning. They do not require a mode change. While the new-game overlay is open, those toasts stay without pointer input, though the map under the setup panel can be dragged. They sit in the map's band, so they stay clear of the setup panel.

## Information Displayed

- Both toasts show in one band at the top of the map, 12 px below the map's top edge. The band is only as wide as its widest toast, and no wider than one third of the visible map. The visible map is the area beside the console, so that third is smaller while the console is open and larger while the console is collapsed to the rail. Its right edge stays 12 px in from the map's right edge, with the same gap while the console is open and while it is collapsed to the rail. It stays to the right of the minimap panel, or of the terrain legend when that legend is open beside the panel, or of the new-game setup panel when that panel reaches farther, each with 12 px of clearance. When the space between that left chrome and the right inset is narrower than 280 px, as at the 800 × 600 minimum window, the toast may overlap that chrome. It still stays against the right inset and within one third of the map (`toastBandSpan` in `src/shared/mapChromePlacement.ts`). The map toast sits above the AI strategy toast when both show, so a knockout notice stays above the opponent's message. Both use the navy chrome in the [UI style guide](../ui-style-guide.md). An error has a light-red border. An informational message, including a turn update, an unknown-battle announcement, a basemap failure, and the AI strategy toast, has the steel border. The body is the message text, not a fixed sentence list.
- A turn-update toast leads with the hex sentences (`buildTurnReportLines` in `src/shared/turnReportLines.ts`), then one section per side that lost a visible unit (`buildTurnLossSections` in `src/shared/turnLossSections.ts`): `Your Losses` for the viewer, then `{full home name} Losses` for every other seat in seat order, then `Neutral Losses`. A blank home name uses the seat id. Each section uses the five cause labels and the name list or the grouped totals, and a named unit shows its origin flag. While there is no viewer, every side uses its full name. Deployments, caps, and `N hexes lost to opponent` stay in the Updates section.
- In a turn-update toast, each victim named on a loss line is preceded by that unit's origin flag. The flag uses the same Bonuses tooltip as the [stack callout](stack-callout.md). A destroyed unit keeps those lines from the birth record remembered after it is gone, including a Tech line when the tech bonus is on and the unit's tech tier is known. Grouped totals such as "3 Infantry", the Updates section, and every other toast line have no flags. If two victims share a display name but would not show the same flag and the same formation date, that name gets no flag.
- A count of one in that Updates section uses the singular: "1 infantry unit deployed", and "1 hex lost to opponent". Two or more keep the plural, so one armor and one infantry read "1 armor and 1 infantry units deployed" (`buildOtherTurnUpdatePrimaryLines` in `src/shared/consolidatedTurnUpdateToast.ts`).
- A basemap failure uses the map toast once: some tiles failed to load, and the game remains playable. It hides after the same interval as other map toasts, on dismiss, or when a later map toast replaces it.
- The AI strategy toast is a tab for each AI opponent, including one who has been knocked out, labeled with that side's full home name, or the seat id when that name is blank, and ordered alphabetically. Every tab starts disabled. A message enables that opponent's tab. A strategy does too, while the match is being observed. That arrival replaces the tab's body and selects it. The selected panel shows Message, then Strategy while the match is being observed. A click on an enabled tab shows that opponent's tab and does not restart the timer. Dismiss, the timer, selecting a unit, opening the build popup, arming ranged or air targeting, and entering a battle hide the toast. The next message builds the tabs again, disabled until that message. The shared toast is not filed. Each kept dispatch is its own Reports entry. A stale or abandoned consult is filed and does not open the dialog.
- A knockout uses the map toast. The text is one notice per seat (`announceKnockouts` in `src/renderer/gameplay/knockoutNotices.ts`). The Reports tab already has one Notice per seat, so that toast is not filed again.
- The sidebar error line shows nothing and stays hidden.

## Inputs and Responses

### Mouse

- When the player clicks the map toast dismiss control, the map toast hides and its hide timer is cancelled.
- When the player clicks the AI strategy toast dismiss control, that toast hides and its hide timer is cancelled.

### Keyboard

- None.

### Other

- When a new map toast is shown, it replaces the previous map toast.
- When an informational map toast is shown, the [Reports tab](reports-tab.md) files a copy, unless the caller already filed that notice. An error toast is not filed. The message dialog is not filed. Each kept commander dispatch is already its own Message entry. A stale or abandoned consult is filed and does not open the dialog.
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
- Every informational map toast is filed on the Reports tab unless that notice was already filed. Each kept commander dispatch is filed once, from the pool. The message dialog is not filed. An error toast never is.

## Strategic and Tactical Differences

Both toasts use the same show, replace, and dismiss behavior in both theaters. Tactical Ready and strategic Ready can both raise a turn-update map toast and an AI strategy toast.

## Related Documents

- [modes-and-transitions.md](modes-and-transitions.md)
- [order-lifecycle.md](order-lifecycle.md)
- [input-map.md](input-map.md)
- [orders-tab.md](orders-tab.md)
- [reports-tab.md](reports-tab.md)

## Known Deviations

None.

## Open Questions

None.

## Code Entry Points

- `static/index.html` (`#map-toast-band`, `#map-toast`, `#map-toast-text`, `#map-toast-dismiss`, `#ai-strategy-toast`, `#ai-strategy-toast-text`, `#ai-strategy-toast-dismiss`, `#sidebar-error`)
- `static/feedbackChrome.css` (`.map-toast-band`)
- `src/renderer/openRouter/openRouterUiHelpers.ts`
- `src/renderer/openRouter/commanderMessageTabsUi.ts` (`showCommanderMessageTabs`)
- `src/shared/commanderMessageTabs.ts` (`initialCommanderMessageTabs`, `applyCommanderMessage`)
- `src/renderer/openRouter/commanderPoolClient.ts` (`readCommanderPoolAndApply`)
- `src/renderer/gameplay/knockoutNotices.ts` (`announceKnockouts`)
- `src/shared/knockoutNotice.ts` (`formatKnockoutNotice`)
- `src/renderer/openRouter/openRouterControls.ts`
- `src/renderer/gameplay/sidebarSupport.ts`
- `src/renderer/gameplay/readyResolutionAnnouncements.ts`
- `src/renderer/gameplay/turnUpdateSummary.ts`
- `src/shared/consolidatedTurnUpdateToast.ts` (`buildOtherTurnUpdatePrimaryLines`, `buildConsolidatedTurnUpdateToastMessage`)
- `src/shared/turnReportLines.ts` (`buildTurnReportLines`)
- `src/shared/turnLossSections.ts` (`buildTurnLossSections`)
- `src/renderer/core/unitOriginFlags.ts`
- `src/shared/lossToastUnitSegments.ts`
- `src/renderer/map/worldLeafletMap.ts`
- `src/renderer/map/mapChromeLayout.ts` (`layoutMapChrome`)
- `src/shared/mapChromePlacement.ts` (`toastBandSpan`)
- `src/shared/aiStrategyToastContent.ts`
- `src/renderer/core/constants.ts`
