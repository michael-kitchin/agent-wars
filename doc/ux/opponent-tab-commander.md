# Opponent Tab Status and Commander

The first two sections of the console's Opponent tab: Status, with Run and a sentence saying whether opponent planning is on, then Commander, with the API key, model choice, and reasoning effort. New game and Offer tactical battles are in the [game menu](game-menu.md).

## Purpose

Let the player connect a model and start or stop opponent planning.

## Availability

Shown while the console's Opponent tab is selected and the console is expanded. The [Tool groups](opponent-tab-tool-groups.md) section and the [AI activity log](ai-activity-log.md) show below these sections at the same time; the tab has no sub-tabs. The model description tooltip can appear while the model dropdown is in use. While the tactical battles list is open, these sections stay visible while the console is expanded and do not receive pointer input. In New game and Game over the console is absent, so these sections are absent with it.

## Information Displayed

- The Status section: Run, then one sentence. It reads "Opponent planning is on." while Run is pressed and "Opponent planning is off." otherwise (`opponentStatusSentence` in `src/shared/opponentPlanningStatus.ts`).
- The Commander section, under a "Commander" heading, with the labels API key, Model, and Reasoning in a column on the left.
- An API key field. The placeholder is "Set key and blur to save" until a key is saved, then "Saved API key". The field does not show the saved key as visible text after it is stored; it is a password field.
- A cost readout for the current match, as a currency amount, beside the key field. A new match resets it to zero.
- A model dropdown. It starts as "— Select model —" until models load. Each option shows the model name, then in brackets the combined prompt and completion price per million tokens and the model's reasoning levels, lowest first, abbreviated and separated by slashes, with the default level marked by an asterisk, for example `reasoning: None/Low/Med*/High`. Levels are abbreviated None, Min, Low, Med, High, Xhigh, and Max. A model that reports reasoning without listing levels shows `reasoning: <default level>` or `reasoning: default`.
- A refresh control labeled "Refresh model list", the same height as the model dropdown beside it.
- A Run button in the Status section. It stays unavailable until both a key and a model are set.
- A reasoning effort dropdown on the row below the model dropdown. It lists only the selected model's reasoning levels, as "High" and so on, and marks the model's default level "(default)". When the model has no default level, or no levels at all, an extra first option reads "Model default". The dropdown is disabled when the model offers fewer than two levels, and before models load.
- The console footer's status line repeats whether planning is on, the selected model's name, and the match cost. See [console.md](console.md).
- Control tips for these sections' fields, buttons, and dropdowns are in [control-tooltips.md](control-tooltips.md). The model dropdown keeps the model description tooltip and does not use those tips.
- A model description tooltip: the selected model's description, one second after the pointer arrives on the model dropdown. Moving on the dropdown does not start that wait again. An empty description shows nothing.

## Inputs and Responses

### Mouse

- When the player leaves the API key field, or changes it, the key is saved if the text changed. An empty key clears the saved placeholder. A non-empty key refreshes the model list.
- When the player changes the model, that model is saved and the description tooltip clears if the choice is empty. The reasoning dropdown resets to the new model's default level, and any saved reasoning choice is cleared.
- When the player changes the reasoning effort, the choice is saved with the model choice and survives a restart. Choosing the "(default)" level saves no override, so the model's own default applies. Later consultations send the chosen level. Every level is allowed a reply as long as the model's advertised output limit when the model list reports one.
- When the player clicks refresh, the model list reloads. A failure is written to the AI activity log.
- A successful start can press Run, or release it, without a click on Run. It uses the Auto-start AI choice from the moment Start was clicked. When that box was checked and Run was enabled, Run is pressed and the first turn's planning starts the same way a click on an enabled Run does, and the selected tab does not change. Otherwise Run is released, planning does not start, and the Opponent tab opens. A failed start leaves Run as it was.
- When the player clicks Run and it is enabled, Run toggles. Pressed means opponent planning runs, and the status sentence and the footer status line follow. Turning it on clears any precomputed opponent plan and may disable Ready until a plan is ready. It does not change the selected tab. Turning it off stops every running or pending opponent model call, in both theaters, and clears the precomputed plan. The turn or beat still resolves. A cancelled call stores no model orders.
- When the player changes the model while Run is on and Ready is still waiting, the running call stops and planning starts again with the new model. A deferred consult that has already started is retried once. One that has not started is skipped, and the next turn uses standing orders.
- When the pointer arrives on the model dropdown, the description tooltip appears one second later if the selected model has a description. Moving on the dropdown does not start that wait again.

### Keyboard

- When the player presses Enter in the API key field, the key is saved the same way as leaving the field.
- While the field or dropdown has focus, map pan keys do nothing. See [input-map.md](input-map.md).

### Other

- If the key or model is removed while Run is pressed, Run turns off and any in-flight planning request is cancelled.
- When the selected model does not support tool calls, its consultations run without tools, whatever the Tool groups section says. See [opponent-tab-tool-groups.md](opponent-tab-tool-groups.md).

## States

- Run disabled: no key or no model. The sentence reads "Opponent planning is off."
- Run off: enabled, not pressed. The sentence reads "Opponent planning is off." Ready does not wait on precomputed orders.
- Run on: pressed. The sentence reads "Opponent planning is on." Ready may show the AI wait label. See [modes-and-transitions.md](modes-and-transitions.md).

## Invariants

- Run never stays pressed when the key or the model is missing.
- The API key value is never written into this document or into the activity log by the key field itself.
- The status sentence always matches Run's pressed state.
- The reasoning dropdown never offers a level the selected model does not support, and a saved level the model no longer supports is ignored in favor of the default.
- The levels in a model option's label are exactly the levels the reasoning dropdown offers for that model, even when the dropdown is disabled because there are fewer than two.

## Strategic and Tactical Differences

Run, the key, the model, and the cost readout work in both theaters. In Tactical planning, Run waits on an opponent battle plan when opponent units remain, instead of on a strategic precomputed plan.

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

- `static/index.html` (`#openrouter-run-btn`, `#opponent-status-text`, `#openrouter-model-panel`, `#openrouter-key`, `#openrouter-cost`, `#openrouter-model`, `#openrouter-refresh-models`, `#openrouter-reasoning-effort`, `#model-description-tooltip`)
- `static/consoleChrome.css`
- `src/shared/opponentPlanningStatus.ts`
- `src/renderer/openRouter/openRouterControls.ts`
- `src/renderer/openRouter/reasoningEffortSelect.ts`
- `src/shared/openRouterModelDisplay.ts`
- `src/shared/openRouterReasoningEffort.ts`
- `src/renderer/openRouter/openRouterRuntime.ts`
- `src/renderer/openRouter/openRouterUiHelpers.ts`
- `src/renderer/openRouter/modelDescriptionTooltip.ts`
- `src/renderer/openRouter/aiPlanningState.ts`
