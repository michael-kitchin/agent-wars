# Right Panel

The console docked on the right of the map. It holds the Orders tab, the Opponent tab, a tab rail, and a footer with Ready.

## Purpose

Keep orders, the opponent's model controls, and Ready in one place that stays usable during both theaters, and let the player fold it away to widen the map.

## Availability

Shown in Strategic planning, Tactical planning, Resolution playback, the tactical battles list, and Tactical annihilation. It is not on screen in New game or Game over, including while the new-game form is hidden, and the map fills the window. It accepts pointer input in Strategic planning, Tactical planning, and Resolution playback. While the tactical battles list is open, the panel stays visible and does not receive pointer input. In Tactical annihilation, pointer input on the panel is off except the annihilation dialog, which is not part of this panel.

## Information Displayed

- A tab rail on the panel's outer edge, with Orders, Opponent, Build, and Forces. Build and Forces are disabled in this version. The selected tab is marked while the panel is expanded, and the mark is cleared while the panel is collapsed.
- A header with the selected tab's name, a subtitle, and a button that collapses the panel. On the Orders tab the subtitle reads "N queued for turn T", or "N queued for beat B" in a battle, where N counts every row of the three order groups (`formatQueuedOrdersSubtitle` in `src/shared/orderRowDetail.ts`). The Opponent tab has no subtitle.
- A count on the Orders tab in the rail: the number of queued orders, the same N. It is hidden while nothing is queued.
- The Orders tab: the order groups. See [right-panel-selection-and-orders.md](right-panel-selection-and-orders.md). The selected units, and the Ranged and Strike controls, are in the [selection panel](selection-panel.md) on the map.
- The Opponent tab: the Tools tab and the Model tab, one shown at a time, with the AI activity log under them. See [right-panel-tools-tab.md](right-panel-tools-tab.md), [right-panel-model-tab.md](right-panel-model-tab.md), and [ai-activity-log.md](ai-activity-log.md).
- A footer with Ready, under the tab content. See [right-panel-command-bar.md](right-panel-command-bar.md).
- While collapsed, only the tab rail and a smaller Ready show. While Ready reads "AI:" and a time, that label takes two lines.
- Control tips for the tabs and the collapse button are in [control-tooltips.md](control-tooltips.md).

## Inputs and Responses

### Mouse

- When the player clicks a tab other than the selected one, that tab's content shows and the header names it.
- When the player clicks the selected tab, the panel collapses to its rail.
- When the player clicks the collapse button, the panel collapses to its rail.
- When the player clicks any tab while the panel is collapsed, the panel expands on that tab.
- The map takes the width the panel gives up, and gives it back when the panel expands.
- Inside the Opponent tab, clicking Tools or Model shows that sub-tab. Turning Run on also selects the Tools sub-tab. See [right-panel-model-tab.md](right-panel-model-tab.md).

### Keyboard

- None for the panel as a whole. Fields inside a tab follow [input-map.md](input-map.md).

### Other

- The panel starts expanded on the Orders tab. Inside the Opponent tab, the Model sub-tab is selected first.
- The selected tab, and whether the panel is collapsed, last until the app closes. Neither is saved.

## States

- Expanded on Orders: the start state.
- Expanded on Opponent.
- Collapsed: only the rail and Ready show. The last selected tab is remembered.
- Absent: New game and Game over, including while the new-game form is hidden. The map fills the window.
- Pointer input off: the tactical battles list, and Tactical annihilation.

## Invariants

- The panel is never hidden just because a tactical battle is active.
- The panel is absent for the whole New game and Game over overlay, and present again as soon as that overlay closes.
- Exactly one tab's content shows while the panel is expanded.
- Ready is on screen whenever the panel is, expanded or collapsed.
- Build and Forces never open a tab in this version.

## Strategic and Tactical Differences

The panel stays visible in both theaters. Its order lists follow the active theater. See [right-panel-selection-and-orders.md](right-panel-selection-and-orders.md).

## Related Documents

- [modes-and-transitions.md](modes-and-transitions.md)
- [input-map.md](input-map.md)
- [top-bar.md](top-bar.md)
- [right-panel-command-bar.md](right-panel-command-bar.md)
- [right-panel-selection-and-orders.md](right-panel-selection-and-orders.md)
- [right-panel-tools-tab.md](right-panel-tools-tab.md)
- [right-panel-model-tab.md](right-panel-model-tab.md)
- [ai-activity-log.md](ai-activity-log.md)

## Known Deviations

None.

## Open Questions

None.

## Code Entry Points

- `static/index.html` (`#sidebar`, `#console-main`, `#console-title`, `#console-subtitle`, `#console-tab-orders-badge`, `#console-collapse-btn`, `#console-panel-orders`, `#console-panel-opponent`, `#console-rail`, `#console-tab-orders`, `#console-tab-opponent`, `#console-tab-build`, `#console-tab-forces`, `#console-footer`, `#openrouter-tab-tools`, `#openrouter-tab-model`)
- `static/frameChrome.css`
- `static/consoleChrome.css`
- `src/renderer/chrome/consoleFrame.ts`
- `src/renderer/gameplay/queuedOrderRows.ts`
- `src/shared/consoleTabState.ts`
- `src/renderer/map/mapContainerResize.ts`
- `src/renderer/openRouter/openRouterControls.ts`
- `src/renderer/tactical/tacticalUiOrchestration.ts`
