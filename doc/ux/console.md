# Console

The console docked on the right of the map. It holds the Orders tab, the Reports tab, the Commanders tab, a tab rail, and a footer with the commander status line, the Observe auto-advance checkbox, and Ready.

## Purpose

Keep orders, the reports from this match, the commanders' settings, and Ready in one place that stays usable during both theaters, and let the player fold it away to widen the map.

## Availability

Shown in Strategic planning, Tactical planning, Resolution playback, the tactical battles list, and Tactical annihilation. It is not on screen in New game or Game over, including while the new-game choices are hidden, and the map widens to the window's right edge. It accepts pointer input in Strategic planning, Tactical planning, and Resolution playback. While the tactical battles list is open, the console stays visible and does not receive pointer input. In Tactical annihilation, pointer input on the console is off except the annihilation dialog, which is not part of the console.

## Information Displayed

- A tab rail on the console's outer edge, with Orders, Reports, Command, Build, and Forces. Command opens the Commanders tab. Build and Forces are disabled in this version. Each tab is 56 × 58 px, an icon above a 9 px label, the same size as the map-mode tabs on the [minimap panel](minimap.md). The selected tab is marked while the console is expanded, and the mark is cleared while the console is collapsed.
- A header with the selected tab's name and a subtitle. It has no collapse button: the selected tab collapses the console. On the Orders tab the subtitle reads "N queued for turn T", or "N queued for beat B" in a battle, where N counts every row of the three order groups (`formatQueuedOrdersSubtitle` in `src/shared/orderRowDetail.ts`). On the Reports tab it reads "this match". On the Commanders tab it reads "{n} opponents", or "{n} sides, observing" when no human seat is playing.
- A count on the Orders tab in the rail: the number of queued orders, the same N. It is hidden while nothing is queued.
- A count on the Reports tab in the rail: the number of unread reports. It is hidden at zero. See [reports-tab.md](reports-tab.md).
- The Orders tab: the order groups. See [orders-tab.md](orders-tab.md). The selected units, and the reticle that aims a ranged attack or an air strike, are in the [selection panel](selection-panel.md) on the map.
- The Reports tab: what the map toasts showed during this match. See [reports-tab.md](reports-tab.md).
- The Commanders tab, labeled Command on the rail: Start or Stop, and a sentence, one card per AI commander, tool groups, and the AI activity log. The API key and the model-list refresh are in each commander's popover. The sentence reads "Planning is on for all {n} commanders." while the button reads Stop, and "Planning is off." otherwise. See [opponent-tab-commander.md](opponent-tab-commander.md), [opponent-tab-tool-groups.md](opponent-tab-tool-groups.md), and [ai-activity-log.md](ai-activity-log.md).
- A footer under the tab content, with the commander status line above Ready. While observing, a checkbox between them reads "Start the next turn when every commander is ready". It starts unchecked. Watch the rest checks it. See [modes-and-transitions.md](modes-and-transitions.md). For Ready, see [console-command-bar.md](console-command-bar.md).
- While observing, the Orders tab is disabled. If it was the selected tab, the console moves to Commanders. A collapsed console stays collapsed. Build and Forces stay disabled.
- The opponent status line, read-only and with no tip:
  - A dot: grey while planning is off, teal while it is on, and rose while the opponent plans.
  - A label: "Commanders off" while the button reads Start, "Commanders planning · {ready} of {active} ready" while any commander is planning, and "Commanders ready" otherwise. While observing, the planning label is "Planning · {ready} of {active} ready". Ready's wait label is "AI: {m:ss} (x{n})", and `{n}` is how many commanders are still planning.
  - The selected model's name: the model option's text before " [", or "No model". A long name is cut short with an ellipsis.
  - The match cost, the sum of the seats' stored cost.
  - The labels come from `src/shared/commanderPlanningStatus.ts`.
- While collapsed, only the tab rail and a smaller Ready show. The opponent status line is hidden. Ready shows only its check mark while its label is "Ready". While Ready reads "AI:" and a time, that label wraps at the space onto two lines, in the same type as the open console.
- Control tips for the tabs are in [control-tooltips.md](control-tooltips.md). Each enabled tab's tip ends by saying that a click on the selected tab hides the console.

## Inputs and Responses

### Mouse

- When the player clicks a tab other than the selected one, that tab's content shows and the header names it.
- When the player clicks the selected tab, the console collapses to its rail.
- When the player clicks any tab while the console is collapsed, the console expands on that tab.
- The map takes the width the console gives up, and gives it back when the console expands.
- Clicking Start while the Commanders tab is open collapses the console. The selected tab stays Commanders. Clicking Stop does not change the tab or the collapsed state. See [opponent-tab-commander.md](opponent-tab-commander.md).
- Starting a match collapses the console (`collapseConsole` in `src/renderer/chrome/consoleFrame.ts`). The selected tab stays selected, so the next click on that rail button opens it again. Planning follows Auto-start AI and does not choose the tab. That path is not a click on Start.

### Keyboard

- None for the console as a whole. Fields inside a tab follow [input-map.md](input-map.md).

### Other

- The console starts expanded on the Orders tab. When the app opens onto a live match, that launch expands it on the Commanders tab. A launch that shows the new-game dialog leaves it on Orders. That launch open does not run again when a snapshot refreshes or when the player closes the dialog back onto the match.
- The commander status line updates whenever the planning button, a commander's wait, the selected model, or the match cost changes.
- The selected tab, and whether the console is collapsed, last until the app closes. Neither is saved.

## States

- Expanded on Orders: the console's own start state. A launch onto a live match then moves to Commanders.
- Expanded on Reports.
- Expanded on Commanders.
- Collapsed: only the rail and Ready show. The last selected tab is remembered.
- Absent: New game and Game over, including while the new-game choices are hidden. The map widens to the window's right edge.
- Pointer input off: the tactical battles list, and Tactical annihilation.

## Invariants

- The console is never hidden just because a tactical battle is active.
- The console is absent for the whole New game and Game over overlay, and present again as soon as that overlay closes.
- Exactly one tab's content shows while the console is expanded.
- Ready is on screen whenever the console is, expanded or collapsed.
- The opponent status line's label always agrees with the planning button and with Ready's "AI:" label.
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

- `static/index.html` (`#sidebar`, `#console-main`, `#console-title`, `#console-subtitle`, `#console-tab-orders-badge`, `#console-panel-orders`, `#console-panel-reports`, `#console-panel-commanders`, `#console-rail`, `#console-tab-orders`, `#console-tab-reports`, `#console-tab-reports-badge`, `#console-tab-commanders`, `#console-tab-build`, `#console-tab-forces`, `#console-footer`, `#commander-status-line`, `#commander-status-label`, `#commander-status-model`, `#commander-status-cost`)
- `static/frameChrome.css`
- `static/consoleChrome.css`
- `src/renderer/chrome/consoleFrame.ts` (`showConsoleTab`, `collapseConsole`)
- `src/renderer/map/initCore.ts` (`wireInitCore`, which calls `showConsoleTab` after the launch snapshot when `consoleTabIdForLiveMatchLaunch` returns the Commanders tab)
- `src/renderer/core/uiState.ts` (`updateGameStateSidebar`, which redraws the Commanders subtitle when the snapshot changes)
- `src/renderer/gameplay/queuedOrderRows.ts`
- `src/shared/consoleTabState.ts` (`nextConsoleTabState`, `expandedConsoleTabState`, `collapsedConsoleState`, `consoleTabWhenOrdersDisabled`, `consoleTabIdForLiveMatchLaunch`)
- `src/shared/commanderPlanningStatus.ts`
- `src/renderer/openRouter/openRouterUiHelpers.ts` (`renderOpponentStatus`)
- `src/renderer/map/mapContainerResize.ts`
- `src/renderer/openRouter/openRouterControls.ts`
- `src/renderer/tactical/tacticalUiOrchestration.ts`
