# Right Panel Model Tab

The API key, model choice, reasoning effort, and Run, on the right panel's Opponent tab. New game and Offer tactical battles are in the [game menu](game-menu.md).

## Purpose

Let the player connect a model and start or stop opponent planning.

## Availability

Shown while the right panel's Opponent tab and its Model sub-tab are selected and the panel is expanded. The Opponent tab starts on this sub-tab. The model description tooltip can appear while this tab's model dropdown is in use. While the tactical battles list is open, the tab stays visible while the panel is expanded and does not receive pointer input. In New game and Game over the panel is absent, so this tab is absent with it.

## Information Displayed

- An API key field. The placeholder is "Set key and blur to save" until a key is saved, then "Saved API key". The field does not show the saved key as visible text after it is stored; it is a password field.
- A cost readout for the current match, as a currency amount. A new match resets it to zero.
- A model dropdown. It starts as "— Select model —" until models load. Each option shows the model name, then in brackets the combined prompt and completion price per million tokens and the model's reasoning levels, lowest first, abbreviated and separated by slashes, with the default level marked by an asterisk, for example `reasoning: None/Low/Med*/High`. Levels are abbreviated None, Min, Low, Med, High, Xhigh, and Max. A model that reports reasoning without listing levels shows `reasoning: <default level>` or `reasoning: default`.
- A refresh control labeled "Refresh model list". It and Run are the same height as the model dropdown beside them.
- A Run button. It stays unavailable until both a key and a model are set.
- A reasoning effort dropdown on the row directly below the model dropdown, at the same width. It lists only the selected model's reasoning levels, as "High" and so on, and marks the model's default level "(default)". When the model has no default level, or no levels at all, an extra first option reads "Model default". The dropdown is disabled when the model offers fewer than two levels, and before models load.
- Control tips for this tab's fields, buttons, and dropdowns are in [control-tooltips.md](control-tooltips.md). The model dropdown keeps the model description tooltip and does not use those tips.
- A model description tooltip: the selected model's description, one second after the pointer arrives on the model dropdown. Moving on the dropdown does not start that wait again. An empty description shows nothing.

## Inputs and Responses

### Mouse

- When the player leaves the API key field, or changes it, the key is saved if the text changed. An empty key clears the saved placeholder. A non-empty key refreshes the model list.
- When the player changes the model, that model is saved and the description tooltip clears if the choice is empty. The reasoning dropdown resets to the new model's default level, and any saved reasoning choice is cleared.
- When the player changes the reasoning effort, the choice is saved with the model choice and survives a restart. Choosing the "(default)" level saves no override, so the model's own default applies. Later consultations send the chosen level. Every level is allowed a reply as long as the model's advertised output limit when the model list reports one.
- When the player clicks refresh, the model list reloads. A failure is written to the AI activity log.
- When the player clicks Run and it is enabled, Run toggles. Pressed means opponent planning runs. Turning it on selects the Tools tab, clears any precomputed opponent plan, and may disable Ready until a plan is ready. Turning it off stops every running or pending opponent model call, in both theaters, and clears the precomputed plan. The turn or beat still resolves. A cancelled call stores no model orders.
- When the player changes the model while Run is on and Ready is still waiting, the running call stops and planning starts again with the new model. A deferred consult that has already started is retried once. One that has not started is skipped, and the next turn uses standing orders.
- When the pointer arrives on the model dropdown, the description tooltip appears one second later if the selected model has a description. Moving on the dropdown does not start that wait again.

### Keyboard

- When the player presses Enter in the API key field, the key is saved the same way as leaving the field.
- While the field or dropdown has focus, map pan keys do nothing. See [input-map.md](input-map.md).

### Other

- If the key or model is removed while Run is pressed, Run turns off and any in-flight planning request is cancelled.
- When the selected model does not support tool calls, its consultations run without tools, whatever the Tools tab says. See [right-panel-tools-tab.md](right-panel-tools-tab.md).

## States

- Run disabled: no key or no model.
- Run off: enabled, not pressed. Ready does not wait on precomputed orders.
- Run on: pressed. Ready may show the AI wait label. See [modes-and-transitions.md](modes-and-transitions.md).

## Invariants

- Run never stays pressed when the key or the model is missing.
- The API key value is never written into this document or into the activity log by the key field itself.
- The reasoning dropdown never offers a level the selected model does not support, and a saved level the model no longer supports is ignored in favor of the default.
- The levels in a model option's label are exactly the levels the reasoning dropdown offers for that model, even when the dropdown is disabled because there are fewer than two.

## Strategic and Tactical Differences

Run, the key, the model, and the cost readout work in both theaters. In Tactical planning, Run waits on an opponent battle plan when opponent units remain, instead of on a strategic precomputed plan.

## Related Documents

- [right-panel.md](right-panel.md)
- [right-panel-tools-tab.md](right-panel-tools-tab.md)
- [modes-and-transitions.md](modes-and-transitions.md)
- [notifications-and-feedback.md](notifications-and-feedback.md)
- [game-menu.md](game-menu.md)
- [ai-activity-log.md](ai-activity-log.md)

## Known Deviations

None.

## Open Questions

None.

## Code Entry Points

- `static/index.html` (`#openrouter-model-panel`, `#openrouter-key`, `#openrouter-cost`, `#openrouter-model`, `#openrouter-refresh-models`, `#openrouter-run-btn`, `#openrouter-reasoning-effort`, `#model-description-tooltip`)
- `src/renderer/openRouter/openRouterControls.ts`
- `src/renderer/openRouter/reasoningEffortSelect.ts`
- `src/shared/openRouterModelDisplay.ts`
- `src/shared/openRouterReasoningEffort.ts`
- `src/renderer/openRouter/openRouterRuntime.ts`
- `src/renderer/openRouter/openRouterUiHelpers.ts`
- `src/renderer/openRouter/modelDescriptionTooltip.ts`
- `src/renderer/openRouter/aiPlanningState.ts`
