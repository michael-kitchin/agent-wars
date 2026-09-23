# Right Panel

The panel beside the map. It holds the command controls, the selection and order lists, and the AI tabs.

## Purpose

Keep turn status, orders, and the opponent's model controls in one place that stays usable during both theaters.

## Availability

Shown in every mode. It accepts pointer input in Strategic planning, Tactical planning, and Resolution playback. While the tactical battles list is open, the panel stays visible and does not receive pointer input. In New game and Game over, pointer input on the panel is off. In Tactical annihilation, pointer input on the panel is off except the annihilation dialog, which is not part of this panel.

## Information Displayed

- The command bar. See [right-panel-command-bar.md](right-panel-command-bar.md).
- The selection and order lists. See [right-panel-selection-and-orders.md](right-panel-selection-and-orders.md).
- The Tools tab and the Model tab. One tab is selected at a time.
- The AI activity log, which stays visible under the tabs. See [ai-activity-log.md](ai-activity-log.md).

## Inputs and Responses

### Mouse

- When the player clicks Tools, the Tools tab is shown and the Model tab is hidden.
- When the player clicks Model, the Model tab is shown and the Tools tab is hidden.
- Turning Run on also selects the Tools tab. See [right-panel-model-tab.md](right-panel-model-tab.md).

### Keyboard

- None for the panel as a whole. Fields inside a tab follow [input-map.md](input-map.md).

### Other

- The panel starts on the Model tab.

## States

- Model tab selected: the Model tab is shown. This is the start state.
- Tools tab selected: the Tools tab is shown.
- Pointer input off: New game, Game over, or Tactical annihilation.

## Invariants

- The panel is never hidden just because a tactical battle is active.
- Only one of the Tools tab and the Model tab is shown at a time.

## Strategic and Tactical Differences

The panel stays visible in both theaters. Its turn readout and order lists follow the active theater. See [right-panel-command-bar.md](right-panel-command-bar.md) and [right-panel-selection-and-orders.md](right-panel-selection-and-orders.md).

## Related Documents

- [modes-and-transitions.md](modes-and-transitions.md)
- [input-map.md](input-map.md)
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

- `static/index.html` (`#sidebar`, `#sidebar-top`, `#sidebar-bottom`, `#openrouter-tab-tools`, `#openrouter-tab-model`)
- `src/renderer/openRouter/openRouterControls.ts`
- `src/renderer/tactical/tacticalUiOrchestration.ts`
