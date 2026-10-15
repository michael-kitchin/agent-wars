# Console

The console docked on the right of the map. It holds the Orders tab, the Reports tab, the Opponent tab, a tab rail, and a footer with the opponent status line and Ready.

## Purpose

Keep orders, the reports from this match, the opponent's model controls, and Ready in one place that stays usable during both theaters, and let the player fold it away to widen the map.

## Availability

Shown in Strategic planning, Tactical planning, Resolution playback, the tactical battles list, and Tactical annihilation. It is not on screen in New game or Game over, including while the new-game choices are hidden, and the map widens to the window's right edge. It accepts pointer input in Strategic planning, Tactical planning, and Resolution playback. While the tactical battles list is open, the console stays visible and does not receive pointer input. In Tactical annihilation, pointer input on the console is off except the annihilation dialog, which is not part of the console.

## Information Displayed

- A tab rail on the console's outer edge, with Orders, Reports, Opponent, Build, and Forces. Build and Forces are disabled in this version. Each tab is 56 × 58 px, an icon above a 9 px label, the same size as the map-mode tabs on the [minimap panel](minimap.md). The selected tab is marked while the console is expanded, and the mark is cleared while the console is collapsed.
- A header with the selected tab's name, a subtitle, and a button that collapses the console. On the Orders tab the subtitle reads "N queued for turn T", or "N queued for beat B" in a battle, where N counts every row of the three order groups (`formatQueuedOrdersSubtitle` in `src/shared/orderRowDetail.ts`). On the Reports tab it reads "this match". On the Opponent tab it names the opponent's home region, as the top bar does.
- A count on the Orders tab in the rail: the number of queued orders, the same N. It is hidden while nothing is queued.
- A count on the Reports tab in the rail: the number of unread reports. It is hidden at zero. See [reports-tab.md](reports-tab.md).
- The Orders tab: the order groups. See [orders-tab.md](orders-tab.md). The selected units, and the Ranged and Strike controls, are in the [selection panel](selection-panel.md) on the map.
- The Reports tab: what the map toasts showed during this match. See [reports-tab.md](reports-tab.md).
- The Opponent tab: four sections shown together, with no sub-tabs. Status holds Run and a sentence saying whether opponent planning is on. Commander holds the API key with the match cost, the model with refresh, and the reasoning effort. Tool groups holds the tool toggles in two columns. The AI activity log fills the height that is left. See [opponent-tab-commander.md](opponent-tab-commander.md), [opponent-tab-tool-groups.md](opponent-tab-tool-groups.md), and [ai-activity-log.md](ai-activity-log.md).
- A footer under the tab content, with the opponent status line above Ready. For Ready, see [console-command-bar.md](console-command-bar.md).
- The opponent status line, read-only and with no tip:
  - A dot: grey while planning is off, teal while it is on, and rose while the opponent plans.
  - A label: "Opponent planning off" while Run is off, "Opponent planning…" while Ready shows "AI:" and a time, and "Opponent planning on" otherwise.
  - The selected model's name: the model option's text before " [", or "No model". A long name is cut short with an ellipsis.
  - The match cost, the same amount as the Commander section's cost readout.
  - The labels come from `src/shared/opponentPlanningStatus.ts`.
- While collapsed, only the tab rail and a smaller Ready show. The opponent status line is hidden. While Ready reads "AI:" and a time, that label takes two lines.
- Control tips for the tabs and the collapse button are in [control-tooltips.md](control-tooltips.md).

## Inputs and Responses

### Mouse

- When the player clicks a tab other than the selected one, that tab's content shows and the header names it.
- When the player clicks the selected tab, the console collapses to its rail.
- When the player clicks the collapse button, the console collapses to its rail.
- When the player clicks any tab while the console is collapsed, the console expands on that tab.
- The map takes the width the console gives up, and gives it back when the console expands.
- Turning Run on or off does not change the selected tab. See [opponent-tab-commander.md](opponent-tab-commander.md).

### Keyboard

- None for the console as a whole. Fields inside a tab follow [input-map.md](input-map.md).

### Other

- The console starts expanded on the Orders tab.
- The opponent status line updates whenever Run, the opponent's wait, the selected model, or the match cost changes.
- The selected tab, and whether the console is collapsed, last until the app closes. Neither is saved.

## States

- Expanded on Orders: the start state.
- Expanded on Reports.
- Expanded on Opponent.
- Collapsed: only the rail and Ready show. The last selected tab is remembered.
- Absent: New game and Game over, including while the new-game choices are hidden. The map widens to the window's right edge.
- Pointer input off: the tactical battles list, and Tactical annihilation.

## Invariants

- The console is never hidden just because a tactical battle is active.
- The console is absent for the whole New game and Game over overlay, and present again as soon as that overlay closes.
- Exactly one tab's content shows while the console is expanded.
- Ready is on screen whenever the console is, expanded or collapsed.
- The opponent status line's label always agrees with Run and with Ready's "AI:" label.
- Build and Forces never open a tab in this version.

## Strategic and Tactical Differences

The console stays visible in both theaters. Its order lists follow the active theater. See [orders-tab.md](orders-tab.md).

## Related Documents

- [modes-and-transitions.md](modes-and-transitions.md)
- [input-map.md](input-map.md)
- [top-bar.md](top-bar.md)
- [console-command-bar.md](console-command-bar.md)
- [orders-tab.md](orders-tab.md)
- [reports-tab.md](reports-tab.md)
- [opponent-tab-tool-groups.md](opponent-tab-tool-groups.md)
- [opponent-tab-commander.md](opponent-tab-commander.md)
- [ai-activity-log.md](ai-activity-log.md)

## Known Deviations

None.

## Open Questions

None.

## Code Entry Points

- `static/index.html` (`#sidebar`, `#console-main`, `#console-title`, `#console-subtitle`, `#console-tab-orders-badge`, `#console-collapse-btn`, `#console-panel-orders`, `#console-panel-reports`, `#console-panel-opponent`, `#console-rail`, `#console-tab-orders`, `#console-tab-reports`, `#console-tab-reports-badge`, `#console-tab-opponent`, `#console-tab-build`, `#console-tab-forces`, `#console-footer`, `#opponent-status-line`, `#opponent-status-label`, `#opponent-status-model`, `#opponent-status-cost`)
- `static/frameChrome.css`
- `static/consoleChrome.css`
- `src/renderer/chrome/consoleFrame.ts`
- `src/renderer/core/uiState.ts` (`updateGameStateSidebar`, which redraws the Opponent subtitle when the snapshot changes)
- `src/renderer/gameplay/queuedOrderRows.ts`
- `src/shared/consoleTabState.ts`
- `src/shared/opponentPlanningStatus.ts`
- `src/renderer/openRouter/openRouterUiHelpers.ts` (`renderOpponentStatus`)
- `src/renderer/map/mapContainerResize.ts`
- `src/renderer/openRouter/openRouterControls.ts`
- `src/renderer/tactical/tacticalUiOrchestration.ts`
