# Right Panel

The console docked on the right of the map. It holds the Orders tab, the Opponent tab, a tab rail, and a footer with Ready.

## Purpose

Keep orders, the opponent's model controls, and Ready in one place that stays usable during both theaters.

## Availability

Shown in Strategic planning, Tactical planning, Resolution playback, the tactical battles list, and Tactical annihilation. It is not on screen in New game or Game over, including while the new-game form is hidden, and the map fills the window. It accepts pointer input in Strategic planning, Tactical planning, and Resolution playback. While the tactical battles list is open, the panel stays visible and does not receive pointer input. In Tactical annihilation, pointer input on the panel is off except the annihilation dialog, which is not part of this panel.

## Information Displayed

- A tab rail on the panel's outer edge, with Orders, Opponent, Build, and Forces. Build and Forces are disabled in this version. The selected tab is marked.
- A header with the selected tab's name.
- The Orders tab: the selected-unit readout, the Ranged and Strike controls, and the order lists. See [right-panel-command-bar.md](right-panel-command-bar.md) and [right-panel-selection-and-orders.md](right-panel-selection-and-orders.md).
- The Opponent tab: the Tools tab and the Model tab, one shown at a time, with the AI activity log under them. See [right-panel-tools-tab.md](right-panel-tools-tab.md), [right-panel-model-tab.md](right-panel-model-tab.md), and [ai-activity-log.md](ai-activity-log.md).
- A footer with Ready, under the tab content. See [right-panel-command-bar.md](right-panel-command-bar.md).
- Control tips for the tabs are in [control-tooltips.md](control-tooltips.md).

## Inputs and Responses

### Mouse

- When the player clicks a tab other than the selected one, that tab's content shows and the header names it.
- When the player clicks the selected tab, nothing changes.
- Inside the Opponent tab, clicking Tools or Model shows that sub-tab. Turning Run on also selects the Tools sub-tab. See [right-panel-model-tab.md](right-panel-model-tab.md).

### Keyboard

- None for the panel as a whole. Fields inside a tab follow [input-map.md](input-map.md).

### Other

- The panel starts on the Orders tab. Inside the Opponent tab, the Model sub-tab is selected first.
- The selected tab lasts until the app closes. It is not saved.

## States

- Orders tab selected: the start state.
- Opponent tab selected.
- Absent: New game and Game over, including while the new-game form is hidden. The map fills the window.
- Pointer input off: the tactical battles list, and Tactical annihilation.

## Invariants

- The panel is never hidden just because a tactical battle is active.
- The panel is absent for the whole New game and Game over overlay, and present again as soon as that overlay closes.
- Exactly one tab's content shows.
- Ready is on screen whenever the panel is.
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

- `static/index.html` (`#sidebar`, `#console-main`, `#console-title`, `#console-panel-orders`, `#console-panel-opponent`, `#console-rail`, `#console-tab-orders`, `#console-tab-opponent`, `#console-tab-build`, `#console-tab-forces`, `#console-footer`, `#openrouter-tab-tools`, `#openrouter-tab-model`)
- `static/frameChrome.css`
- `src/renderer/chrome/consoleFrame.ts`
- `src/renderer/openRouter/openRouterControls.ts`
- `src/renderer/tactical/tacticalUiOrchestration.ts`
