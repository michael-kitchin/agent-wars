# Commanders Tab Status and Commander

The Commanders tab of the console: Run and a sentence, the API key and the model-list refresh, then one card per AI commander. New game and Offer tactical battles are in the [game menu](game-menu.md).

## Purpose

Let the player connect a model and start or stop opponent planning.

## Availability

Shown while the console's Commanders tab is selected and the console is expanded. The [Tool groups](opponent-tab-tool-groups.md) section and the [AI activity log](ai-activity-log.md) show below these sections at the same time; the tab has no sub-tabs. While the tactical battles list is open, these sections stay visible while the console is expanded and do not receive pointer input. In New game and Game over the console is absent, so these sections are absent with it.

## Information Displayed

- Run, then one sentence. It reads "Planning is on for all {n} commanders." while Run is pressed and "Planning is off." otherwise (`commanderPlanningSentence` in `src/shared/commanderPlanningStatus.ts`).
- The API key, and the button that loads the model list again. The model list stays in the page so each commander's popover can use it. It is not a control on this tab.
- A list titled Commanders, with "cost this match" on the right. One card per AI seat, in seat order: the seat dot and full name, a status chip, the seat's cost, and a summary button. The chip reads "Planning {m:ss}", "Ready", "Standing orders", "Timed out", or "Out, turn {N}". A timed-out card adds "No reply in {m:ss} of {m:ss} on turn {N}. Its standing orders ran instead." A knocked-out card is dimmed and its summary button is disabled. The summary button opens the commander popover, and a change is saved with `setSeatCommander`.
- An API key field. The placeholder is "Set key and blur to save" until a key is saved, then "Saved API key". The field does not show the saved key as visible text after it is stored; it is a password field.
- Run stays unavailable until a key is saved.
- The console footer's status line counts ready commanders and shows the match cost. See [console.md](console.md).
- Control tips for these controls are in [control-tooltips.md](control-tooltips.md).

## Inputs and Responses

### Mouse

- When the player leaves the API key field, or changes it, the key is saved if the text changed. An empty key clears the saved placeholder. A non-empty key refreshes the model list.
- Model, reasoning, and doctrine are edited in the commander popover, not on this tab. Choosing a model there saves it with `setSelectedModel` and clears the description tooltip when the choice is empty. The reasoning dropdown resets to the new model's default level, and any saved reasoning choice is cleared.
- When the player changes the reasoning effort in that popover, the choice is saved with the model choice and survives a restart. Choosing the "(default)" level saves no override, so the model's own default applies. Later consultations send the chosen level. Every level is allowed a reply as long as the model's advertised output limit when the model list reports one.
- When the player clicks refresh, the model list reloads. A failure is written to the AI activity log.
- A successful start can press Run, or release it, without a click on Run. It uses the Auto-start AI choice from the moment Start was clicked. When that box was checked and Run was enabled, Run is pressed and the first turn's planning starts the same way a click on an enabled Run does, and the selected tab does not change. Otherwise Run is released, planning does not start, and the Commanders tab opens. A failed start leaves Run as it was.
- When the player clicks Run and it is enabled, Run toggles. Pressed means opponent planning runs, and the status sentence and the footer status line follow. Turning it on starts planning and may disable Ready while a commander is planning. It does not change the selected tab. Turning it off stops every running opponent model call, in both theaters. The turn or beat still resolves. A cancelled call stores no new model orders. Orders already stored stay.
- When the player changes the model while Run is on and Ready is still waiting, the running call stops and planning starts again with the new model. A deferred consult that has already started is retried once. One that has not started is skipped, and the next turn uses standing orders.
- The one-second model description tooltip is attached to the hidden model list (`attachModelDescriptionTooltip` on `#openrouter-model`). Hovering a commander's card does not show it.

### Keyboard

- When the player presses Enter in the API key field, the key is saved the same way as leaving the field.
- While the API key field or a dropdown in the commander popover has focus, map pan keys do nothing. See [input-map.md](input-map.md).

### Other

- If the key or model is removed while Run is pressed, Run turns off and any in-flight planning request is cancelled.
- When the selected model does not support tool calls, its consultations run without tools, whatever the Tool groups section says. See [opponent-tab-tool-groups.md](opponent-tab-tool-groups.md).

## States

- Run disabled: no key or no model. The sentence reads "Planning is off."
- Run off: enabled, not pressed. The sentence reads "Planning is off." Ready does not wait on a commander.
- Run on: pressed. The sentence reads "Planning is on for all {n} commanders." Ready may show the AI wait label. See [modes-and-transitions.md](modes-and-transitions.md).

## Invariants

- Run never stays pressed when the key or the model is missing.
- The API key value is never written into this document or into the activity log by the key field itself.
- The status sentence always matches Run's pressed state.
- The reasoning dropdown never offers a level the selected model does not support, and a saved level the model no longer supports is ignored in favor of the default.
- The levels in a model option's label are exactly the levels the reasoning dropdown offers for that model, even when the dropdown is disabled because there are fewer than two.

## Strategic and Tactical Differences

Run, the key, the model, and the cost readout work in both theaters. The cost is the sum of the seats' stored consultation cost. In Tactical planning, Ready waits while the battle consult is planning.

## Commander Popover

The same model, reasoning, and doctrine choices, opened from a commander's card on this tab and from a side's commander button on the new-game screen.

- The popover is titled "{row name} commander". Model uses the Commanders tab's model list, including "— Select model —". Reasoning uses that model's levels and hides when the model has none. Doctrine lists Aggressive, Balanced, Cautious, and Random, with the selected choice's description from `DOCTRINE_CHOICE_DESCRIPTIONS`.
- The button that opened it shows `formatCommanderSummary`: "No model · standing orders only", or the model name, the effort when one is set, and the doctrine. A provider prefix on the model name is left off.
- Choosing a model saves it with `setSelectedModel`, so the next match's new sides start from it. Reasoning and doctrine stay on the side that was edited.
- "Use for every opponent" copies the three settings to every AI side. While Observe is on, that button reads "Use for every side".
- The close button, Escape, and a click outside close the popover.

## Related Documents

- [console.md](console.md)
- [opponent-tab-tool-groups.md](opponent-tab-tool-groups.md)
- [modes-and-transitions.md](modes-and-transitions.md)
- [notifications-and-feedback.md](notifications-and-feedback.md)
- [game-menu.md](game-menu.md)
- [ai-activity-log.md](ai-activity-log.md)

## Known Deviations

None.

## Open Questions

None.

## Code Entry Points

- `static/index.html` (`#openrouter-run-btn`, `#commander-status-text`, `#openrouter-model-panel`, `#openrouter-key`, `#openrouter-cost`, `#openrouter-model`, `#openrouter-refresh-models`, `#openrouter-reasoning-effort`, `#model-description-tooltip`)
- `static/consoleChrome.css`
- `src/shared/commanderPlanningStatus.ts`
- `src/renderer/openRouter/openRouterControls.ts`
- `src/renderer/openRouter/reasoningEffortSelect.ts`
- `src/shared/openRouterModelDisplay.ts`
- `src/shared/openRouterReasoningEffort.ts`
- `src/renderer/openRouter/openRouterRuntime.ts`
- `src/renderer/openRouter/openRouterUiHelpers.ts`
- `src/renderer/openRouter/modelDescriptionTooltip.ts`
- `src/renderer/openRouter/aiPlanningState.ts`
- `src/renderer/openRouter/commanderPopover.ts`
- `src/shared/commanderSummary.ts`
- `src/renderer/openRouter/openRouterModelCatalog.ts`
