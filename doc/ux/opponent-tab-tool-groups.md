# Commanders Tab Tool Groups

The Tool groups section of the console's Commanders tab: the tool groups the commanders' models may use.

## Purpose

Let the player turn tool groups on or off and see how many times each group was used in the current consult, across every commander.

## Availability

Shown while the console's Commanders tab is selected and the console is expanded, below the [Status and Commander](opponent-tab-commander.md) sections and above the [AI activity log](ai-activity-log.md). While the tactical battles list is open, the section stays visible while the console is expanded and does not receive pointer input. See [console.md](console.md). In New game and Game over the console is absent, so this section is absent with it.

## Information Displayed

- A "Tool groups" heading, with "uses this consult, all" beside it.
- One cell per tool group, in two columns. A cell shows the count of uses in the current consult, then the group's label. The count is `toolInvocationCounts` on the commander pool snapshot (`commanderToolCountSum` in `src/main/openRouter/commanderToolCounts.ts`): the sum of that group's uses by every commander who has reported in this consult.
- The group list comes from the app. If that list has no Events group, Events is added.
- What the groups do is described in [AI tools](../ai-tools.md).
- Control tips for these cells are in [control-tooltips.md](control-tooltips.md).
- The first consult after a new game, after Start is turned on, or after Events is turned on is started through the commander pool. Later event-driven turns do not start another strategic one at Ready. They use the pending orders from the post-resolution consult, or standing orders. See [Hybrid AI](../hybrid-ai.md).

## Inputs and Responses

### Mouse

- When the player clicks a cell's count control, that group toggles on or off. The control shows as pressed while the group is on.
- When the player turns Events on or off, event-driven consultation follows that group, and Ready's enabled state refreshes.

### Keyboard

- None.

### Other

- All groups start on.
- When the selected model does not support tool calls, consultations run as if every group of model-callable tools were off. Events still follows its cell, because it decides when consultations happen rather than offering the model a tool. The cells keep their pressed state, and the groups apply again once a model with tool support is selected. The AI activity log says so once per app session for each such model. See [ai-activity-log.md](ai-activity-log.md).
- A parallel consult sets every count to zero when the first commander in that consult launches. The previous total stays until then. Strategic planning, tactical planning, and the consult after a turn or a beat are each their own consult. A commander who returns no counts adds nothing. A failed or cancelled consult that reports the tools it already used still adds those uses. The cells update from the pool snapshot as commanders finish.

## States

- Group on: the control is pressed and the opponent may use that group.
- Group off: the control is not pressed.
- Section hidden: another console tab is selected, or the console is collapsed.

## Invariants

- The count in a cell is the use count, not an on/off label. On and off are the pressed state.
- Turning a group off never clears queued player orders.
- The model choice never changes a cell's pressed state.

## Strategic and Tactical Differences

The same section is used in both theaters. A strategic consult and a tactical consult each start their own total at zero.

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
- `src/renderer/openRouter/openRouterToolCountLabels.ts` (`applyCommanderToolCountSum`)
- `src/renderer/openRouter/commanderPoolClient.ts`
- `src/main/openRouter/commanderToolCounts.ts` (`commanderToolCountSum`)
