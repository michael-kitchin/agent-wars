# Right Panel Model Tab

The API key, model choice, Run, New, and the Tactical battles checkbox.

## Purpose

Let the player connect a model, start or stop opponent planning, and open a new match.

## Availability

Shown when the Model tab is selected. This is the tab the panel starts on. The model description tooltip can appear while this tab's model dropdown is in use. While the tactical battles list is open, the tab stays visible and does not receive pointer input.

## Information Displayed

- An API key field. The placeholder is "Set key and blur to save" until a key is saved, then "Saved API key". The field does not show the saved key as visible text after it is stored; it is a password field.
- A cost readout for the current match, as a currency amount. A new match resets it to zero.
- A model dropdown. It starts as "— Select model —" until models load.
- A refresh control labeled "Refresh model list".
- A Run button. It is disabled, with the tip "Set API key and model to enable", until both a key and a model are set.
- A New button labeled "New".
- A Tactical battles checkbox, checked by default. Its tip says that, when unchecked, the tactical battles list does not appear and melee resolves as if the player chose Ignore every time.
- A model description tooltip: the selected model's description, after the same dwell as the hex tooltip. An empty description shows nothing.

## Inputs and Responses

### Mouse

- When the player leaves the API key field, or changes it, the key is saved if the text changed. An empty key clears the saved placeholder. A non-empty key refreshes the model list.
- When the player changes the model, that model is saved and the description tooltip clears if the choice is empty.
- When the player clicks refresh, the model list reloads. A failure is written to the AI activity log.
- When the player clicks Run and it is enabled, Run toggles. Pressed means opponent planning runs. Turning it on selects the Tools tab, clears any precomputed opponent plan, and may disable Ready until a plan is ready. Turning it off cancels an in-flight planning request and clears the precomputed plan.
- When the player clicks New, the new-game overlay opens. See [new-game-dialog.md](new-game-dialog.md). New opens the overlay only during strategic planning. During a battle or resolution playback the click does nothing.
- When the player changes Tactical battles, later Ready resolutions either show the tactical battles list or skip it. See [tactical-battles-list.md](tactical-battles-list.md).
- When the pointer rests on the model dropdown, the description tooltip appears after a dwell if the selected model has a description.

### Keyboard

- When the player presses Enter in the API key field, the key is saved the same way as leaving the field.
- While the field or dropdown has focus, map pan keys do nothing. See [input-map.md](input-map.md).

### Other

- If the key or model is removed while Run is pressed, Run turns off and any in-flight planning request is cancelled.

## States

- Run disabled: no key or no model.
- Run off: enabled, not pressed. Ready does not wait on precomputed orders.
- Run on: pressed. Ready may show the AI wait label. See [modes-and-transitions.md](modes-and-transitions.md).
- Tactical battles checked or unchecked: only the later melee prompt changes.

## Invariants

- Run never stays pressed when the key or the model is missing.
- The API key value is never written into this document or into the activity log by the key field itself.
- Unchecking Tactical battles never opens the tactical battles list.

## Strategic and Tactical Differences

Run, the key, the model, and the cost readout work in both theaters. In Tactical planning, Run waits on an opponent battle plan when opponent units remain, instead of on a strategic precomputed plan.

## Related Documents

- [right-panel.md](right-panel.md)
- [modes-and-transitions.md](modes-and-transitions.md)
- [notifications-and-feedback.md](notifications-and-feedback.md)
- [new-game-dialog.md](new-game-dialog.md)
- [tactical-battles-list.md](tactical-battles-list.md)
- [ai-activity-log.md](ai-activity-log.md)

## Known Deviations

None.

## Open Questions

None.

## Code Entry Points

- `static/index.html` (`#openrouter-model-panel`, `#openrouter-key`, `#openrouter-cost`, `#openrouter-model`, `#openrouter-refresh-models`, `#openrouter-run-btn`, `#openrouter-new-btn`, `#openrouter-tactical-battles`, `#model-description-tooltip`)
- `src/renderer/openRouter/openRouterControls.ts`
- `src/renderer/openRouter/openRouterRuntime.ts`
- `src/renderer/openRouter/openRouterUiHelpers.ts`
- `src/renderer/openRouter/modelDescriptionTooltip.ts`
- `src/renderer/openRouter/aiPlanningState.ts`
- `src/renderer/gameplay/tacticalBattlePromptPreference.ts`
- `src/renderer/gameplay/newGame.ts`
