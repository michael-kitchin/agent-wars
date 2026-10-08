# Right Panel Tools Tab

The list of tool groups the opponent's model may use.

## Purpose

Let the player turn tool groups on or off and see how many times each group was used since the last Ready.

## Availability

Shown when the Tools tab is selected. The right panel starts on the Model tab. Turning Run on selects this tab. While the tactical battles list is open, the tab stays visible and does not receive pointer input. See [right-panel.md](right-panel.md) and [right-panel-model-tab.md](right-panel-model-tab.md). In New game and Game over the panel is absent, so this tab is absent with it.

## Information Displayed

- One row per tool group. The row shows the group's label and a count of uses since the counters were reset.
- The group list comes from the app. If that list has no Events group, Events is added.
- What the groups do is described in [AI tools](../ai-tools.md).
- Control tips for these rows are in [control-tooltips.md](control-tooltips.md).
- The first consult after a new game, after Run is turned on, or after Events is turned on is still a background request. Later event-driven turns do not start another one. They use the pending orders from the post-resolution consult, or standing orders. See [Hybrid AI](../hybrid-ai.md).

## Inputs and Responses

### Mouse

- When the player clicks a row's count control, that group toggles on or off. The control shows as pressed while the group is on.
- When the player turns Events on or off, event-driven consultation follows that group, and Ready's enabled state refreshes.

### Keyboard

- None.

### Other

- All groups start on.
- When the selected model does not support tool calls, consultations run as if every group of model-callable tools were off. Events still follows its row, because it decides when consultations happen rather than offering the model a tool. The rows keep their pressed state, and the groups apply again once a model with tool support is selected. The AI activity log says so once per app session for each such model. See [ai-activity-log.md](ai-activity-log.md).
- Ready resets the counts to zero at click time, then restores the counts from the consultation that just ran. See [modes-and-transitions.md](modes-and-transitions.md).

## States

- Group on: the control is pressed and the opponent may use that group.
- Group off: the control is not pressed.
- Tab hidden: the Model tab is selected.

## Invariants

- The count on a row is the use count, not an on/off label. On and off are the pressed state.
- Turning a group off never clears queued player orders.
- The model choice never changes a row's pressed state.

## Strategic and Tactical Differences

The same tab is used in both theaters. Counts reset on both strategic Ready and tactical Ready.

## Related Documents

- [right-panel.md](right-panel.md)
- [right-panel-model-tab.md](right-panel-model-tab.md)
- [ai-activity-log.md](ai-activity-log.md)
- [AI tools](../ai-tools.md)
- [modes-and-transitions.md](modes-and-transitions.md)

## Known Deviations

None.

## Open Questions

None.

## Code Entry Points

- `static/index.html` (`#openrouter-tab-tools`, `#openrouter-tools-panel`, `#openrouter-tools-list`)
- `src/renderer/openRouter/openRouterControls.ts`
- `src/renderer/openRouter/openRouterRuntime.ts`
- `src/renderer/openRouter/openRouterUiHelpers.ts`
