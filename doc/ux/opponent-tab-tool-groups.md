# Opponent Tab Tool Groups

The Tool groups section of the console's Opponent tab: the tool groups the opponent's model may use.

## Purpose

Let the player turn tool groups on or off and see how many times each group was used since the last Ready.

## Availability

Shown while the console's Opponent tab is selected and the console is expanded, below the [Status and Commander](opponent-tab-commander.md) sections and above the [AI activity log](ai-activity-log.md). While the tactical battles list is open, the section stays visible while the console is expanded and does not receive pointer input. See [console.md](console.md). In New game and Game over the console is absent, so this section is absent with it.

## Information Displayed

- A "Tool groups" heading, with "uses since last Ready" beside it.
- One cell per tool group, in two columns. A cell shows a count of uses since the counters were reset, then the group's label.
- The group list comes from the app. If that list has no Events group, Events is added.
- What the groups do is described in [AI tools](../ai-tools.md).
- Control tips for these cells are in [control-tooltips.md](control-tooltips.md).
- The first consult after a new game, after Run is turned on, or after Events is turned on is still a background request. Later event-driven turns do not start another one. They use the pending orders from the post-resolution consult, or standing orders. See [Hybrid AI](../hybrid-ai.md).

## Inputs and Responses

### Mouse

- When the player clicks a cell's count control, that group toggles on or off. The control shows as pressed while the group is on.
- When the player turns Events on or off, event-driven consultation follows that group, and Ready's enabled state refreshes.

### Keyboard

- None.

### Other

- All groups start on.
- When the selected model does not support tool calls, consultations run as if every group of model-callable tools were off. Events still follows its cell, because it decides when consultations happen rather than offering the model a tool. The cells keep their pressed state, and the groups apply again once a model with tool support is selected. The AI activity log says so once per app session for each such model. See [ai-activity-log.md](ai-activity-log.md).
- Ready resets the counts to zero at click time, then restores the counts from the consultation that just ran. See [modes-and-transitions.md](modes-and-transitions.md).

## States

- Group on: the control is pressed and the opponent may use that group.
- Group off: the control is not pressed.
- Section hidden: another console tab is selected, or the console is collapsed.

## Invariants

- The count in a cell is the use count, not an on/off label. On and off are the pressed state.
- Turning a group off never clears queued player orders.
- The model choice never changes a cell's pressed state.

## Strategic and Tactical Differences

The same section is used in both theaters. Counts reset on both strategic Ready and tactical Ready.

## Related Documents

- [console.md](console.md)
- [opponent-tab-commander.md](opponent-tab-commander.md)
- [ai-activity-log.md](ai-activity-log.md)
- [AI tools](../ai-tools.md)
- [modes-and-transitions.md](modes-and-transitions.md)

## Known Deviations

None.

## Open Questions

None.

## Code Entry Points

- `static/index.html` (`#openrouter-tools-panel`, `#openrouter-tools-list`)
- `static/shellChrome.css`
- `src/renderer/openRouter/openRouterControls.ts`
- `src/renderer/openRouter/openRouterRuntime.ts`
- `src/renderer/openRouter/openRouterUiHelpers.ts`
