# Commanders Tab Status and Commander

The Commanders tab of the console: Run and a sentence, then one card per AI commander. The API key and the model-list refresh live in each commander's popover. New game and Offer tactical battles are in the [game menu](game-menu.md).

## Purpose

Let the player give each commander a key and a model, and start or stop opponent planning.

## Availability

Shown while the console's Commanders tab is selected and the console is expanded. The [Tool groups](opponent-tab-tool-groups.md) section and the [AI activity log](ai-activity-log.md) show below these sections at the same time; the tab has no sub-tabs. While the tactical battles list is open, these sections stay visible while the console is expanded and do not receive pointer input. In New game and Game over the console is absent, so these sections are absent with it.

## Information Displayed

- Run, then one sentence. It reads "Planning is on for all {n} commanders." while Run is pressed and "Planning is off." otherwise (`commanderPlanningSentence` in `src/shared/commanderPlanningStatus.ts`).
- A list titled Commanders, with "cost this match" on the right. One card per AI seat, in seat order: the seat dot and full name, a status chip, the seat's cost, and a summary button. The chip reads "Planning {m:ss}", "Ready", "Standing orders", "Timed out", or "Out, turn {N}". A timed-out card adds "No reply in {m:ss} of {m:ss} on turn {N}. Its standing orders ran instead." A knocked-out card is dimmed and its summary button is disabled. The summary button opens the commander popover, and a change is saved with `setSeatCommander`. The model list stays in the page so each commander's popover can use it. It is not a control on this tab.
- Run stays unavailable until at least one active AI seat has a stored key (`SeatCommander.hasApiKey`) and a model id.
- The console footer's status line counts ready commanders and shows the match cost. See [console.md](console.md).
- Control tips for these controls are in [control-tooltips.md](control-tooltips.md).

## Inputs and Responses

### Mouse

- The API key, the model, reasoning, and doctrine are edited in the commander popover, not on this tab. Leaving the key field, or pressing Enter, saves that opponent's key when the trimmed value changed. Clearing the field and leaving it forgets that opponent's key. Choosing a model there saves it with `setSelectedModel` and clears the description tooltip when the choice is empty. The reasoning dropdown resets to the new model's default level, and any saved reasoning choice is cleared. A save made while that model is not in the loaded list keeps the stored reasoning effort.
- When the player changes the reasoning effort in that popover, the choice is saved with the model choice and survives a restart. Choosing the "(default)" level saves no override, so the model's own default applies. Later consultations send the chosen level. Every level is allowed a reply as long as the model's advertised output limit when the model list reports one.
- When the player clicks refresh in the popover, the model list reloads with the key in that popover. Every popover shares that one list. A click while a load is already running waits, then loads with the key in the open popover. An empty key writes "No API key set." to the AI activity log and does not fetch. Any other failure is written to that log.
- A successful start can press Run, or release it, without a click on Run. It uses the Auto-start AI choice from the moment Start was clicked. When that box was checked and at least one AI row had a key and a model, Run is pressed and the first turn's planning starts the same way a click on an enabled Run does, and the selected tab does not change. Otherwise Run is released, planning does not start, and the Commanders tab opens. A failed start leaves Run as it was. An opponent with a model and an empty key does not call the model.
- When the player clicks Run and it is enabled, Run toggles. Pressed means opponent planning runs, and the status sentence and the footer status line follow. Turning it on starts planning and may disable Ready while a commander is planning. It does not change the selected tab. Turning it off stops every running opponent model call, in both theaters. The turn or beat still resolves. A cancelled call stores no new model orders. Orders already stored stay.
- When the player changes the model while Run is on and Ready is still waiting, the running call stops and planning starts again with the new model. A deferred consult that has already started is retried once. One that has not started is skipped, and the next turn uses standing orders.
- The one-second model description tooltip is attached to the hidden model list (`attachModelDescriptionTooltip` on `#openrouter-model`). Hovering a commander's card does not show it.

### Keyboard

- When the player presses Enter in the API key field, the key is saved the same way as leaving the field.
- While the API key field or a dropdown in the commander popover has focus, map pan keys do nothing. The password field is a text field, so [input-map.md](input-map.md) already covers it.

### Other

- If no active commander still has both a key and a model while Run is pressed, Run turns off and any in-flight planning request is cancelled.
- When the selected model does not support tool calls, its consultations run without tools, whatever the Tool groups section says. See [opponent-tab-tool-groups.md](opponent-tab-tool-groups.md).

## States

- Run disabled: no active commander has both a key and a model. The sentence reads "Planning is off."
- Run off: enabled, not pressed. The sentence reads "Planning is off." Ready does not wait on a commander.
- Run on: pressed. The sentence reads "Planning is on for all {n} commanders." Ready may show the AI wait label. See [modes-and-transitions.md](modes-and-transitions.md).

## Invariants

- Run never stays pressed when no active commander has both a key and a model.
- The API key value is never written into this document, a tooltip, a commander summary, or the activity log. The password field shows the stored key, masked.
- The status sentence always matches Run's pressed state.
- The reasoning dropdown never offers a level the selected model does not support, and a saved level the model no longer supports is ignored in favor of the default.
- The levels in a model option's label are exactly the levels the reasoning dropdown offers for that model, even when the dropdown is disabled because there are fewer than two.

## Strategic and Tactical Differences

Run and the cost readout work in both theaters. Each commander's key and model are on that commander's popover. The cost is the sum of the seats' stored consultation cost. In Tactical planning, Ready waits while the battle consult is planning.

## Commander Popover

The same key, model, reasoning, and doctrine choices, opened from a commander's card on this tab and from a side's commander button on the new-game screen. It is 380 px wide. Its fields and the refresh button are 30 px tall. It opens under the button that opened it, and above that button when there is no room below (`placeBelowAnchor` in `src/shared/popoverPlacement.ts`).

- The popover is titled "{row name} commander". The first field is the API key, a password field whose value is the key, masked. The model select uses the shared model list, including "— Select model —", and the refresh button sits on its right. Reasoning uses that model's levels and hides when the model has none. Doctrine lists Aggressive, Balanced, Cautious, and Random, with the selected choice's description from `DOCTRINE_CHOICE_DESCRIPTIONS`.
- The button that opened it shows `formatCommanderSummary`: "No model · standing orders only", or the model name, the effort when one is set, and the doctrine. A provider prefix on the model name is left off. The summary does not show the key.
- Choosing a model saves it with `setSelectedModel`, so the next match's new sides start from it. Reasoning, doctrine, and the key stay on the side that was edited.
- During a match the popover has no copy button. The new-game screen's copy button is described in [new-game-dialog.md](new-game-dialog.md).
- An empty key means that opponent does not call the model. The activity log can say that no API key is set, and it does not contain the key. Run stays off until a seat's `hasApiKey` flag is set, so a match that still has only the legacy key (`openrouter_api_key`) does not start planning until a commander is saved. A consult that does run before that map exists uses the legacy key. `hasKey` is true when that legacy key is non-empty or any seat's `hasApiKey` flag is true, and that check is what lets a modeled seat reach `requestOrders`. The first save of a commander, when no per-seat key has been stored yet, writes that seat's field and stores the legacy key on the other AI seats. A later save changes only the seat that was edited. A seat whose stored key is empty does not call the model. The remembered commanders for the next new game are written when the match starts and updated by that same save (`readCommanderKeyMemory` in `src/main/openRouter/commanderKeyMemory.ts`). Saving a later commander on a match that has no remembered record yet stores empty commanders in the earlier slots.
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

- `static/index.html` (`#openrouter-run-btn`, `#commander-status-text`, `#openrouter-model-panel`, `#openrouter-cost`, `#openrouter-model`, `#openrouter-reasoning-effort`, `#model-description-tooltip`)
- `static/newGameChrome.css` (the commander popover, including the key field and the refresh button on the model row)
- `static/consoleChrome.css`
- `src/shared/commanderPlanningStatus.ts`
- `src/renderer/openRouter/openRouterControls.ts`
- `src/renderer/openRouter/openRouterRunToggle.ts` (refreshes whether Run can be clicked after a seat save or a match snapshot)
- `src/renderer/openRouter/openRouterModelRefresh.ts` (the popover's model refresh and empty-key log line)
- `src/renderer/openRouter/reasoningEffortSelect.ts`
- `src/shared/openRouterModelDisplay.ts`
- `src/shared/openRouterReasoningEffort.ts`
- `src/renderer/openRouter/openRouterRuntime.ts`
- `src/renderer/openRouter/openRouterUiHelpers.ts`
- `src/renderer/openRouter/modelDescriptionTooltip.ts`
- `src/renderer/openRouter/aiPlanningState.ts`
- `src/renderer/openRouter/commanderPopover.ts`
- `src/shared/popoverPlacement.ts` (`placeBelowAnchor`)
- `src/renderer/openRouter/commanderCardsUi.ts`
- `src/main/openRouter/commanderKeyMemory.ts` (`readSeatApiKey`, `readCommanderKeyMemory`)
- `src/main/openRouter/secretConfig.ts`
- `src/main/gameDb/seatApiKeyFlags.ts` (`readSeatHasApiKey`)
- `src/main/openRouter/requestOrdersFlow.ts`
- `src/shared/commanderSummary.ts`
- `src/renderer/openRouter/openRouterModelCatalog.ts`
