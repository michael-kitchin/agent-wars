# Multi-opponent polish

Audience: a lower-quality coding agent. Implement one phase at a time. Stop after each phase and report files touched, test results, and any doc updated. Wait for the human before the next phase. If a phase fails, revert that phase. If a line in this plan disagrees with the code, trust the code, stop, and report the discrepancy.

## Goal

Nine player-facing changes, plus one fix required for the message dialog to receive every opponent's text:

1. Adding an opponent after the first copies that previous opponent's commander settings.
2. Both maps offer Deathmatch and Most city hexes at turn limit. Deathmatch is the default. Under Deathmatch the turn-limit control is disabled and reads "Unlimited".
3. The tactical battles list shows the same hex tooltip text and symbols as `main`.
4. Commander popover controls match the 30 px controls in the new-game panel. The popover is wider and still opens under the button that was clicked.
5. Start game with no model selected asks for a yes or no before the match starts.
6. Full prompt logs, and full response logs, are one file per opponent, named with that opponent's number.
7. Opponent messages share one dialog with a tab per opponent. Tabs start disabled and turn on as each message arrives.
8. The turn-update popup keeps main's per-side loss sections, cause labels, unit names, and origin flags. Hex-capture sentences and the Updates section stay.
9. While Ready is waiting on opponents, its label is `AI: MM:SS (xN)`.

## Locked decisions

- Deathmatch is the existing stored rule `last_side_standing`. Do not add a new `victory_rule` string. The new-game control shows the word "Deathmatch". The end-of-match sentence stays "last side standing". Do not edit `standings.ts` or `knockoutNotice.ts`.
- Both maps offer both rules. An omitted `victoryRule` on a new match is Deathmatch, and the requested turn limit is ignored. `most_city_hexes_at_turn_limit` stores one of 20, 30, 40, or 50, or 30 when the request is missing or not in that list. A match already in the database keeps the rule it stored.
- `decideEndOfTurnOutcome` already implements both endings. Do not change it. A Deathmatch match ends when one side remains, or on a mutual wipe. It does not end at a turn count. The top bar, the Cities readout, and the prompt's turn-limit sentence already follow a null `turnLimit` and the stored rule. Do not change those readers.
- Copy-on-add copies `modelId`, `reasoningEffort`, `doctrineChoice`, and `apiKey` from the last AI row, as a new object. It does not copy the home. The first two rows, a tab change, and a region change still use `defaultCommander()` and the existing first-key prefill. Only the Add button uses the copy.
- The no-models question appears when no AI row has a non-empty `modelId`. API keys do not matter. A blocked start (shared home, missing home, fewer than two sides) still toasts and does not open the question. Yes continues the existing start. No, Escape, and a backdrop click leave the setup screen open and do not call `newGame`.
- The popover stays on `document.body`, opens 6 px under the clicked button, and flips above that button or shifts sideways only when it would leave the window. Width is 380 px. Selects, the key field, the refresh button, and the copy button are 30 px tall at 13 px text. The close control stays a 24 px icon. The in-match cards use this same popover.
- The Hex cell of each fight row is the world-hex tooltip again (`buildHexPopupHtml`, then `paintTerrainSwatches`). Yours, Enemy, the Neutral garrison line, and the "Resolve on the world map" section stay as they are on this branch. Do not put the tooltip on the world-map lines.
- The turn-update popup order is hex sentences, then one loss section per side that lost a visible unit, then Updates. Loss headers are `Your Losses` for the viewer, `{full home name} Losses` for every other seat, and `Neutral Losses`. While there is no viewer, every side uses its full name. Delete the "You lost", "You destroyed", and "Seen:" sentences. Keep `N hexes lost to opponent` inside Updates.
- Message tabs use each AI seat's full `homeRegion`, sorted with `localeCompare('en')`, then `seatId`. The human seat has no tab. Knocked-out AI seats still get a tab. A tab enables when that seat sends a non-empty message, or a non-empty strategy while the player is observing. Strategy is stored and shown only when the roster is being observed at the moment the dispatch is applied. A later dispatch from the same seat replaces that tab. Each applied dispatch selects its tab and restarts the 24 second timer. Hiding the dialog, by the timer, the dismiss control, or `hidePlanningChromeToasts`, clears the tabs. The next dispatch builds them again, all disabled except the ones in that batch.
- Follow-up consults must enqueue a `CommanderDispatch` or opponents after the first have no message to show. The dialog reads only drained dispatches. Do not keep a second toast path that shows `aiMessage` / `aiStrategy` from Ready or a push.
- `N` in the Ready label is the number of pool rows whose status is `planning`. A count below 1 is shown as 1. Do not clamp a larger count. The clock stays `formatElapsedMmSs`.
- Do not commit or push. Do not put phase numbers, this file's name, or words from these headings into code, comments, tests, lint text, or `doc/`.

## Working rules

- Shell is Windows PowerShell at `F:\Projects\Personal\agent-wars-public`. Run one command at a time. Do not chain with `&&`.
- Keep each file's existing line endings. New files use CRLF.
- Orienting comments on every new or changed field and function: Purpose, When to use, Expected outcome, Exceptions. Match the file you are editing.
- `logDebug` on new or updated public main-process functions, `logError` on caught exceptions, `logTrace` on getters that do not change state. Shared modules do not import the logger. Renderer catch blocks use `console.error`. Never log an API key, a prompt body, or a response body.
- Tests cover the happy path and the essential failure. `npm test` builds, lints, checks names, and runs `dist/**/*.test.js`. A new `*.test.ts` under `src/main` or `src/shared` is picked up automatically. Do not edit `package.json` to register a test. Do not refresh `scripts/circular-deps-baseline.json` or grow `scripts/renderer-typecheck-baseline.json`.
- When a phase edits `src/renderer` or `static/`, also run `npm run build:renderer`. Leave `static/renderer.js` changed. `npm start` does not rebuild it.
- Desirable file size is 600 lines. Hard limit is 1000. `src/main/main.ts` and `src/main/ipc/readyIpcResolutionMapping.ts` are already past 600. Do not add functions to them. A call and a field are allowed.
- Named arguments stay at or below 6. Use a parameter object past that. Use `readonly` and `const` for values that are not reassigned.
- Code blocks in this plan omit the orienting comment. Add one, in the file's existing style, above each new or changed function. Do not paste a block in without it.
- camelCase files and functions. PascalCase types. No `Utils` or `Impl` suffix. Do not rename IPC channels, DOM ids that docs name, SQL columns, or the stored `victory_rule` values.
- Update living `doc/` in the same phase as the behavior. Leave `doc/devleopment-plan-v3.4.md`, `doc/poc-analysis.md`, and `doc/market-research.md` alone. Leave files under `.spec/completed/` alone.

## Phase 1: One prompt log file per opponent

**Goal.** With `AGENT_WARS_LOG_FULL_PROMPTS` or `AGENT_WARS_LOG_FULL_RESPONSES` set, each opponent writes its own files. The screen is unchanged. Consultations still overwrite that opponent's own previous file.

**Read first.** `resolveFullPromptLogFileName`, `logPromptPreview`, and `logResponsePreview` in `src/main/openRouter/requestOrdersFlowSupport.ts`. The two `logPromptPreview` calls in `src/main/openRouter/requestOrdersFlow.ts` (system prompt and user message). `logResponsePreview` in `src/main/openRouter/requestOrdersToolLoop.ts` and `src/main/openRouter/requestOrdersRepairExchange.ts`. `aiIndexForSeatId` in `src/shared/seatIds.ts`. `coordinateContextSeatId` in `src/main/briefing/map/coordinateContext.ts`.

**Filenames.** `aiIndex` is 1 for `opponent`, 2 for `opponent2`, 3 for `opponent3`, 4 for `opponent4`.

- `resolveFullPromptLogFileName(kind, aiIndex)` returns `debug-last-user-prompt-1.txt`, `debug-last-strategic-prompt-2.txt`, or `debug-last-tactical-prompt-3.txt`. Same switch as today, with `-${aiIndex}` before `.txt`.
- `resolveFullResponseLogFileName(aiIndex)` returns `debug-last-openrouter-response-body-1.txt`.
- `logPromptPreview` passes `options.aiIndex` into the resolver. Add `aiIndex: number` to `LogPromptPreviewOptions`.
- `logResponsePreview(label, content, aiIndex)` uses the response resolver. Update both call sites.
- Callers pass `aiIndexForSeatId(seatId) ?? 1`. In the tool loop the seat is `coordinateContextSeatId(coordinateContext)`. When the index is null, `logError` once at that call site and still pass 1. Do not log the prompt or the body.
- `runParseRepairExchange` takes `aiIndex` on `ParseRepairExchangeArgs` and passes it to `logResponsePreview`. The call in `repairAssistantText` inside `requestOrdersFlow.ts` sets it from the same `seatId` the flow already resolved.

**Tests.** Update `src/main/openRouter/requestOrdersFlowSupport.test.ts`. Assert index 1 and index 2 for each prompt kind, and the response name for index 1. Assert that the three prompt names for one index are distinct, and that index 1 and index 2 of the same kind differ.

**Doc.** Replace the four unsuffixed names with the numbered pattern in `README.md` (the full-prompt section), `doc/hybrid-ai.md`, `doc/ui-style-guide.md`, `doc/ai-commander-prompts/README.md`, `doc/ai-commander-prompts/source-inventory.md`, and `doc/ai-commander-prompts/tactical-prompt.md`. Say the number is `aiIndexForSeatId` of the seat being consulted, and that opponent 1 writes `debug-last-strategic-prompt-1.txt`. `.gitignore` already ignores `debug-last-*.txt`. Do not change it.

**Verify:** `npm test`. No renderer build.

## Phase 2: Deathmatch on both maps

**Goal.** The new-game Rule control offers Deathmatch and Most city hexes at turn limit on Global and Regional. Deathmatch is selected when the overlay opens. The turn-limit row stays visible. Under Deathmatch it is disabled and shows "Unlimited". A city-hex match stores the selected limit. A match already stored is unchanged.

**Read first.** `src/shared/victoryRules.ts`, `src/shared/victoryRules.test.ts`, `readVictorySettings` in `src/main/gameDb/gameConfigKv.ts`, the victory write in `src/main/gameDb/resetGame.ts` (`victorySettingsForMapKind`), `NewGameIpcPayload.turnLimit` in `src/shared/ipc/ordersTypes.ts`, the `game:newGame` handler in `src/main/main.ts`, `fillVictoryControls` and `renderNewGameSides` in `src/renderer/gameplay/newGameSidesUi.ts`, the Victory section in `static/index.html`, and `src/main/gameDb/newMatchSeats.test.ts` (`the snapshot reports the win rule for the map`).

**Shared.** In `victoryRules.ts`, replace `victorySettingsForMapKind` with:

```ts
export function victorySettingsForRequest(
  rule: VictoryRule | undefined,
  requestedTurnLimit: number | undefined
): VictorySettings {
  if (rule !== 'most_city_hexes_at_turn_limit') return { rule: 'last_side_standing', turnLimit: null };
  const turnLimit = requestedTurnLimit !== undefined && isTurnLimitOption(requestedTurnLimit)
    ? requestedTurnLimit
    : DEFAULT_TURN_LIMIT;
  return { rule: 'most_city_hexes_at_turn_limit', turnLimit };
}
```

Export `DEFAULT_VICTORY_RULE: VictoryRule = 'last_side_standing'` and `VICTORY_RULE_LABELS` with `last_side_standing: 'Deathmatch'` and `most_city_hexes_at_turn_limit: 'Most city hexes at turn limit'`. Export `UNLIMITED_TURN_LIMIT_LABEL = 'Unlimited'`. Update the comments that say a regional match has no turn limit and a global match always ends by city hexes. `readVictorySettings` already forces a null limit for `last_side_standing`. Leave it.

**Persistence.** Add `victoryRule?: VictoryRule` to `ResetGameForNewMatchOptions` and to `NewGameIpcPayload`, beside `turnLimit`. `resetGameForNewMatch` calls `victorySettingsForRequest(options?.victoryRule, options?.turnLimit)`. The `game:newGame` handler passes `payload?.victoryRule` through and adds `victoryRule: payload?.victoryRule ?? null` to the existing `logDebug`. Do not log seats.

**Tests.**

- `victoryRules.test.ts`: omitted rule with limit 40 is `{ rule: 'last_side_standing', turnLimit: null }`. `most_city_hexes_at_turn_limit` with 40 stores 40. The same rule with 15 stores `DEFAULT_TURN_LIMIT`. Delete the assertions on `victorySettingsForMapKind`.
- `newMatchSeats.test.ts`: the regional case that passes `turnLimit: 40` and no rule still reads `{ rule: 'last_side_standing', turnLimit: null }`. The global case must pass `victoryRule: 'most_city_hexes_at_turn_limit'` to keep `{ rule: 'most_city_hexes_at_turn_limit', turnLimit: 40 }`. Add a global case with no `victoryRule` that reads Deathmatch and a null limit. Add a regional case with `victoryRule: 'most_city_hexes_at_turn_limit'` and `turnLimit: 40` that stores that rule and 40.

**Screen.** Move the victory DOM work out of `newGameSidesUi.ts` into `src/renderer/gameplay/newGameVictoryUi.ts`. `bindNewGameSides` calls `bindNewGameVictory()`. `renderNewGameSides` calls `renderNewGameVictory()` and stops editing the victory select itself. `readNewGameSeatsStart` returns `victoryRule` from the new module along with `turnLimit`.

`newGameVictoryUi.ts`:

- `bindNewGameVictory` fills `#new-game-victory-select` once, with both ids and labels from `VICTORY_RULE_LABELS`, Deathmatch selected. It fills `#new-game-turn-limit-select` with 20, 30, 40, and 50, 30 selected. Remember the last numeric limit in a module variable, starting at 30. Do not rebuild the Rule select on later renders. Rebuilding it would put Deathmatch back every time the side rows redraw.
- `renderNewGameVictory` reads the Rule select as it is. When that rule is Deathmatch, remember the numeric value if one is selected, disable the turn-limit select, and make its only choice `Unlimited` (`value=""`). When the rule is city hexes, restore the four options, select the remembered limit, and enable the select. A Rule `change` calls the same render. Do not hide `#new-game-turn-limit-row` on Regional.
- `readNewGameVictory()` returns `{ victoryRule, turnLimit }`. Deathmatch returns `last_side_standing` and the remembered number (the main process ignores it). City hexes returns that rule and the selected number, or 30 when the value is not a listed limit.
- Changing tabs does not reset the rule the player already picked. Opening the overlay does. `refreshNewGameSides({ reset: true })` is the one place that calls `resetNewGameVictory()`, so Deathmatch and limit 30 come back. Both openers already pass `reset: true`: `openNewGameOverlayFromModelTab` in `newGame.ts`, and the startup path in `src/renderer/core/uiState.ts`. A tab change calls `refreshNewGameSides()` without `reset` and must leave the rule alone.

`newGame.ts` sends `victoryRule: seatsStart.victoryRule` next to `turnLimit`.

The write is the two-argument `resetGameForNewMatch` in `src/main/gameDb/resetGame.ts`. The one-argument facade in `src/main/gameDb.ts` already forwards the options object. Do not copy the victory logic into the facade. A bare `resetGameForNewMatch()` with no rule stores Deathmatch. Tests that do not read `victory` stay valid. The only test that asserts the stored rule today is `newMatchSeats.test.ts`.

**Tooltips.** In `static/index.html`, replace the Rule tip with: "Deathmatch ends when one side remains. Most city hexes at turn limit ends the match at the turn limit, and the side holding the most city hexes wins." Replace the Turn limit tip with: "How long a Most city hexes match lasts. 30 is the usual length. Deathmatch has no turn limit."

**Doc.** Update the sentences that say a global match always has a turn limit and a regional match never does. The new fact is: the player picks the rule on either map; Deathmatch stores `last_side_standing` and a null limit; city hexes stores `most_city_hexes_at_turn_limit` and 20, 30, 40, or 50. Name `victorySettingsForRequest`.

- `doc/combat-rules-v3.md` §14, including the sentence that cites `victorySettingsForMapKind`.
- `doc/region-vs-region.md` (the global-limit sentence and the goal sentence that says the turn limit is appended on a global match). The prompt appends the `{L}` sentence only when the stored rule is `most_city_hexes_at_turn_limit`.
- `doc/how-to-play.md` paragraphs that say a global match ends after the picked limit and a regional match has none, the Starting the game sentence, and the Global / Regional cells of the comparison table.
- `doc/ux/new-game-dialog.md` Victory bullet, and the bullet that says switching to Global shows the turn limit.
- `doc/ux/control-tooltips.md` Victory rule and Turn limit entries. Match the new `index.html` tips.
- `doc/ux/top-bar.md` only where it says a global match is the thing that has a turn limit. Cities and "Turn N of L" stay tied to a stored turn limit, which is now the city-hex rule on either map.
- `doc/ui-style-guide.md` the live top-bar sentence that says Cities replaces Enemy homes when the match has a turn limit. That part is still true. Do not rewrite it unless it says the limit is global-only.
- `doc/ai-commander-prompts/strategic-prompt.md` §1.2, so the `{L}` sentence is included for the city-hex rule and omitted for Deathmatch. `doc/ai-commander-prompts/information-decision-model.md` and `doc/ai-commander-prompts/source-inventory.md` only if they say the limit sentence is global-only.
- `doc/README.md` engine-constants row "Win rules, knockout, and places": add `victorySettingsForRequest` and `DEFAULT_VICTORY_RULE` beside the symbols already named. Do not remove `TURN_LIMIT_OPTIONS` or `DEFAULT_TURN_LIMIT`.

**Verify:** `npm test` and `npm run build:renderer`. Open the setup screen: Global and Regional both show Deathmatch and an Unlimited, disabled turn limit. Pick Most city hexes and confirm 20, 30, 40, and 50 return, with the previously picked number if one was picked. Start is not required for this phase's manual check.

## Phase 3: Add copies the previous opponent

**Goal.** Add another opponent, or Add another side, gives the new row the previous AI row's key, model, reasoning effort, and doctrine. The first AI row is unchanged.

**Read first.** `addSideRow` in `src/shared/newGameSides.ts`, the add click in `src/renderer/gameplay/newGameSidesUi.ts`, and `src/shared/newGameSides.test.ts`.

**Shared.** At the end of `addSideRow`, the new row's commander is a new object copied from the last AI row that already has a commander (`modelId`, `reasoningEffort`, `doctrineChoice`, `apiKey`). A missing `apiKey` becomes `''` after trim. Do not import `commanderSetupCopy.ts`. That file already imports `newGameSides.ts`, and the reverse import would cycle. When no earlier AI commander exists, use the `defaultCommander` argument, as today. Do not mutate the source row. Do not change `initialSidesState`.

The add click keeps passing `defaultCommander()`. Do not call `prefillFirstAiApiKey` from the add click.

**Test.** In `newGameSides.test.ts`, start a human-plus-one-AI state, `setRowCommander` on the AI row with model `test-model`, effort `high`, doctrine `aggressive`, and key `test-openrouter-key` (the test file says that key is for testing), then `addSideRow`. The new row's commander equals that copy and is not the same object. The source row is unchanged. A state whose only AI commander is null still uses the fallback object.

**Doc.** In `doc/ux/new-game-dialog.md`, on the Sides bullet, say that Add another opponent copies the key, model, reasoning effort, and doctrine from the AI row just above, and that the home is still the next free home. Say that changing the tab or the region still rebuilds the rows from the app-wide model and the remembered first key.

**Verify:** `npm test`. No renderer build unless a comment-only renderer edit was made. There should be none.

## Phase 4: Ask before starting with no models

**Goal.** Start game, or New game, with no AI model selected opens a yes/no dialog. Yes starts the match. No stays on the setup screen.

**Read first.** The `#new-game-btn` click in `src/renderer/gameplay/newGame.ts`, `newGameHasRunnableCommander` in `newGameSidesUi.ts`, and `#knockout-dialog` in `static/index.html` plus `.game-over-overlay` in `static/feedbackChrome.css`. There is no shared confirm helper. Do not reuse the knockout dialog. Its buttons are fixed.

**Shared.** Add `sidesHaveAnyModel(state: NewGameSidesState | null): boolean` to `newGameSides.ts`. True when some AI row has a trimmed non-empty `modelId`. Null state is false. Test it in `newGameSides.test.ts`: one AI row with a model is true; every AI `modelId` null is false; a human row is ignored.

**Screen.** Add `newGameHasAnyModel()` in `newGameSidesUi.ts`, reading the module's `sidesState`.

Add `src/renderer/gameplay/startConfirmDialog.ts` with `confirmStartWithNoModels(): Promise<boolean>`. It shows `#start-confirm-dialog` and resolves true for Yes, false for No, Escape, or a click on the backdrop. A missing dialog resolves false and logs `console.error`. Bind the buttons once. A second call while one is open resolves the first false, then opens again. Do not disable the map controls. The setup screen is already modal.

Markup, after `#knockout-dialog` in `static/index.html`:

- `#start-confirm-dialog.start-confirm-dialog.game-over-overlay.hidden`, `role="dialog"`, `aria-modal="true"`, labelled by `#start-confirm-title`.
- A `game-over-box` with title "No models set", lead "Start the game with no models set?", note "This means no model calls will be made during the game.", and buttons `#start-confirm-yes` "Yes" and `#start-confirm-no` "No".

CSS in `static/feedbackChrome.css`. The overlay is `position: fixed; z-index: 7070` so it covers the setup panel (`z-index: 7002`) and the commander popover (`7060`). The note uses the existing `.knockout-dialog-copy` size or a smaller 13 px line. Title stays the box's existing heading size.

**Click order.** Keep this order in the `#new-game-btn` handler. The confirm sits before `advanceRendererMatchEpoch`. A No after that call would retire the match waiting under the screen.

1. `const startMatchAi = chooseStartMatchAi(readStartMatchAiInput())`.
2. Return if `window.gameApi.newGame` is missing.
3. `readNewGameSeatsStart()`. If `blocked` is set, toast it and return.
4. If `!newGameHasAnyModel()`, call `closeCommanderPopover()`, then `await confirmStartWithNoModels()`. False returns. Do not advance the match epoch. Import `closeCommanderPopover` from `src/renderer/openRouter/commanderPopover.ts`. This file does not import it today.
5. The rest of the handler stays as it is, starting at `advanceRendererMatchEpoch()`.

`.game-over-overlay` is `position: absolute`. The confirm rule must set `position: fixed` and `inset: 0` itself. Put the element after `#knockout-dialog`, inside `#canvas-container`. `#canvas-container` does not create a stacking context, so `z-index: 7070` paints above the setup panel (`z-index: 7002`). Do not put the dialog inside the setup panel. It would scroll with the choices.

**Doc.** `doc/ux/new-game-dialog.md` Start bullet: when no AI row has a model, this dialog appears, and No leaves the screen open. `doc/ux/control-tooltips.md` only if a tooltip is added. Do not add one.

**Verify:** `npm test` and `npm run build:renderer`. Manual: Start with no model opens the dialog; No leaves the setup screen; set a model on one opponent and Start does not ask. Do not need a live model call.

## Phase 5: Popover controls match the setup panel

**Goal.** The commander popover's fields, refresh button, and copy button are the same height and type size as the new-game panel's 30 px controls. The popover is 380 px wide and still opens under the clicked button.

**Read first.** `.commander-popover` through `.commander-popover-apply` in `static/newGameChrome.css`, `.new-game-panel-body select` in that file, `.openrouter-refresh-btn` in `static/shellChrome.css`, and `placeCommanderPopover` in `src/renderer/openRouter/commanderPopover.ts`.

**Placement.** Add `src/shared/popoverPlacement.ts`:

```ts
export interface PopoverAnchorBox {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
}

export interface PopoverSize {
  readonly width: number;
  readonly height: number;
}

export function placeBelowAnchor(
  anchor: PopoverAnchorBox,
  popover: PopoverSize,
  viewport: { readonly width: number; readonly height: number }
): { readonly top: number; readonly left: number } {
  const gap = 6;
  const margin = 8;
  const left = Math.max(margin, Math.min(anchor.left, viewport.width - popover.width - margin));
  let top = anchor.bottom + gap;
  if (top + popover.height > viewport.height - margin) top = anchor.top - popover.height - gap;
  if (top < margin) top = margin;
  return { top, left };
}
```

Test in `popoverPlacement.test.ts`: a short anchor near the top-left returns `top = bottom + 6` and `left = anchor.left`. An anchor whose popover would pass the right edge shifts left to `viewport.width - width - 8`. An anchor whose popover would pass the bottom flips to `anchor.top - height - 6`.

`placeCommanderPopover` reads the anchor and popover rects and the window size, calls `placeBelowAnchor`, and sets `style.top` and `style.left`. Call it again at the end of `showReasoning` in `popoverFields`, because showing or hiding Reasoning changes the height. Scroll and resize already call it.

**CSS.** Replace the popover control rules. Do not change `.openrouter-refresh-btn` globally. The Commanders tab is not this popover.

- `.commander-popover` width 380 px. Keep the existing background, border, radius, shadow, and `z-index: 7060`.
- `.commander-popover-field` font-size 13 px. Its `select` and `input` are height 30 px, padding `0 8px`, `box-sizing: border-box`, font-size 13 px. Drop the fixed 160 px width. The control side is `flex: 1; min-width: 0; width: auto`.
- `.commander-popover-model-controls` is `flex: 1; width: auto; min-width: 0`. The select inside it is `flex: 1; height: 30px`. The refresh button inside the popover is height 30 px, width 30 px, padding 0, font-size 13 px. Scope that button rule as `.commander-popover .openrouter-refresh-btn`.
- `.commander-popover-apply` is height 30 px, padding `0 12px`, font-size 13 px.
- `.commander-popover-close` stays 24 px.
- Doctrine description stays 12 px muted text.

**Doc.** `doc/ux/new-game-dialog.md` popover bullet: the popover is 380 px, its fields match the panel's 30 px controls, and it opens under the button, above it when there is no room below. `doc/ui-style-guide.md` the sentence that says new-game body controls are 30 px: add that the commander popover uses that same control height.

**Verify:** `npm test` and `npm run build:renderer`. Manual: open a commander from the setup screen and from a Commanders card. The model select and the refresh button are the same height. A row near the bottom of the window flips the popover above the button. A row near the right edge keeps the popover inside the window.

## Phase 6: Hex tooltip on the tactical battles list

**Goal.** Each fight row's Hex cell shows the world-hex tooltip, including the place name, country flags, terrain-mix chips, weather icon, and the Control, Production, Tech, Features, Terrain, Weather, and Effects lines. The rest of this branch's dialog stays.

**Read first.** `openMeleeInterceptModal` in `src/renderer/gameplay/meleeInterceptModal.ts`, `buildMeleeInterceptHexPopupHtmlForStrategic` in `src/renderer/gameplay/meleeInterceptHexTooltip.ts`, `paintTerrainSwatches` in `src/renderer/rendering/terrainVisualStyles.ts`, and `doc/ux/tactical-battles-list.md`. `readyHandler.ts` already passes `buildHexPopupHtml`. The modal ignores it.

**Modal.** For each eligible row, create the Hex cell with the plain code immediately: `(${getStrategicHexCode(h3Index)})`, or the raw id when that code is missing. Then:

```ts
void args.buildHexPopupHtml(row.h3Index).then(
  (html) => {
    if (!tdHex.isConnected) return;
    tdHex.replaceChildren();
    tdHex.innerHTML = html;
    paintTerrainSwatches(tdHex);
  },
  () => {
    /* keep the plain code already shown */
  }
);
```

Delete `hexCell` and `hexDetailLine`. Remove the imports that only those two used (`formatHexControlLabel`, `homeSeatIdsAtHex`, `formatTerrainKindLabel`, `formatWeatherLabel`, `activeHumanSeatId`). Keep `getStrategicHexCode` for the world-map section and this fallback. Keep `shortSideName`, `paletteForOwner`, and `rendererSharedState`. The party cells still use them. Do not change `enemyCell`, `worldMapSection`, the columns, or `tacticalEligible`.

**Doc.** In `doc/ux/tactical-battles-list.md`, the Hex cell is the world-hex tooltip in the same line order as `doc/ux/hex-tooltips.md`, including a country flag before each country name and a legend chip before each terrain kind. Yours, Enemy, and the world-map section stay as that file already describes them. The failure sentence already says a failed load shows the hex id. Change it to: the cell keeps the hex code it showed while loading. `doc/ux/hex-tooltips.md` already says this list uses the world-hex tooltip. After this phase that sentence is true again. Do not edit it unless a phrase still describes the muted Control / Terrain / Weather line.

**Verify:** `npm run typecheck:renderer` and `npm run build:renderer`. There is no renderer unit test. Manual check waits until a match can reach Ready with two hostile stacks on one hex. If that is not practical in this phase, say so and leave the manual check for Phase 11.

## Phase 7: Loss sections on the turn-update popup

**Goal.** The update popup shows main's loss sections again, one per side, with cause labels, unit names, and origin flags. Hex sentences stay. "You lost", "You destroyed", and "Seen:" go away. Updates stays, including `N hexes lost to opponent`.

**Read first.** `buildConsolidatedTurnUpdateToastMessage` in `src/shared/consolidatedTurnUpdateToast.ts`, `buildTurnReportLines` in `src/shared/turnReportLines.ts`, `formatPlayerLossLinesMultiline` and `LOSS_CAUSE_LABELS` in `src/shared/lossSummary.ts`, `announceResolutionTurnUpdate` in `src/renderer/gameplay/readyResolutionAnnouncements.ts`, `appendMapToastMessageBody` in `src/renderer/openRouter/openRouterUiHelpers.ts`, and `src/shared/turnReportLines.test.ts`.

**Loss sections.** Add `src/shared/turnLossSections.ts` with `buildTurnLossSections`. Arguments: `summary: TurnLossSummary`, `viewerSeatId: string | null`, and `seats: readonly { seatId: string; seatOrder: number; homeRegion: string }[]`. Return `string[]` using `MAP_TOAST_SECTION_HEADER_PREFIX` (`## `) and lines `${causeLabel}: ${text}` from `formatPlayerLossLinesMultiline`. Skip an owner with no losses.

Order:

1. When `viewerSeatId` is non-null and that owner has losses, header `Your Losses`.
2. Every other owner id on `summary.byOwner` that has losses, except `NEUTRAL_OWNER_ID`, sorted by `seatOrder`. An owner missing from `seats` sorts after the known seats, ids compared with `localeCompare('en')`. Header is `${homeRegion} Losses`, or `${ownerId} Losses` when the seat is missing.
3. Neutral last, header `Neutral Losses`, when Neutral has losses.

Do not use `shortSideName`.

Test: the viewer and one opponent both lost a unit, so `Your Losses` comes before `Western Turkey Losses`, and the cause line is `Ranged attack: 1st Infantry` when that is the display name. A null viewer uses `Levant Losses` for the human seat, not `Your Losses`. An owner with empty buckets is omitted. Neutral sorts after the seats.

**Toast.** `buildConsolidatedTurnUpdateToastMessage` appends, in order: hex lines from `buildTurnReportLines`, then the loss sections, then the Updates section. When `turnReport` is present, the loss-section viewer and seats come from it. When it is absent, pass `viewerSeatId: null` and `seats: []`. Do not read `turnReport.viewerSeatId` without that check. `hasLossSections` is true when either the hex lines or the loss sections are non-empty, so the combat-activity fallback does not also appear. A turn with only a deployment still has Updates and no loss header.

`src/main/turnUpdateSummary.test.ts` builds a toast with `losses: []` on `turnReport` and expects `You took 1 hex from E. Turkey.` before the Updates header. Remove the `losses` field. Keep that order assertion. It still passes, because the hex sentence stays ahead of Updates.

**Hex sentences only.** Remove `losses` from `TurnReportInput`. Delete `viewerLossLines`, `seenLines`, and the helpers that only those two use (`typeList`, `typePhrase`, `fightParties`, `groupLosses`, and `sortGroups` if nothing else calls them). Keep `hexLines` and `otherLines`. `buildTurnReportLines` returns hex lines, then `otherLines`. The toast passes `otherLines: []` and still appends Updates itself, so deployments are not duplicated.

Rewrite `turnReportLines.test.ts`. The first assertion stays `You took 2 hexes from E. Turkey.` The loss and Seen assertions move to the new loss-section test. The null-viewer test asserts there is no `You ` line and no `fought at` line. Keep a deployment line on `otherLines` if `buildTurnReportLines` still appends `otherLines`.

`announceResolutionTurnUpdate` stops passing `losses` on `turnReport`. Delete `turnReportLosses` and `reportUnitType` when nothing else calls them. Keep the call text `buildConsolidatedTurnUpdateToastMessage({` and `buildPopupTurnLossSummary({`. `src/main/rendererProductionAirConsolidation.test.ts` asserts both strings are in this file. Keep `buildUnitOriginByLossDisplayName`. The flag map already keys on display names, and the cause lines are what `splitLossCauseLineForUnitFlags` matches.

**Blank line.** In `appendMapToastMessageBody`, insert the `<br>` before a `## ` header whenever the target already has child nodes, not only between two headers. Hex sentences then sit a blank line above `Your Losses`, and Updates stays a blank line below the last loss section. The first header of a losses-only message still has no leading break.

**Doc.** `doc/ux/notifications-and-feedback.md`: the turn-update toast leads with the hex sentences, then one section per side that lost a visible unit (`Your Losses`, `{full home name} Losses`, `Neutral Losses`) with the five cause labels and the name list or the grouped totals. Flags stay on the named victims. Seen lines are gone. Updates is unchanged, including `N hexes lost to opponent`. `doc/ux/reports-tab.md` the turn-report bullet, because the Reports entry is a copy of this toast.

**Verify:** `npm test` and `npm run build:renderer`.

## Phase 8: Follow-up consults keep their messages

**Goal.** A post-turn consult and a post-beat consult enqueue one dispatch per seat, the same way a planning consult does. The screen still shows messages the way it does today. This phase is what makes Phase 9 able to see opponents after the first.

**Read first.** `applyConsultOutcome` in `src/main/openRouter/commanderPoolSettle.ts`, `emptyConsultOutcome` in `src/main/openRouter/commanderPoolSupport.ts`, `runEventDrivenAfterResolutionConsultation` and `runEventDrivenAfterTacticalBeatConsultation` in `src/main/ipc/readyIpcResolutionMapping.ts`, and the finished-consult test in `src/main/openRouter/commanderPool.test.ts`.

Post-turn consults return `finished: false` with a message and a strategy, so `applyConsultOutcome` hits the failure branch and drops the prose. Post-beat consults return `finished: true` without copying `message` or `strategy` onto the outcome, so the dispatch is stored with both null.

**Settle.** Inside the existing `enqueueCommanderPoolWrite` callback, in the `!outcome.finished` branch, after recording a positive cost and before setting the seat ready, push one dispatch when the trimmed message or the trimmed strategy is non-empty. Push on `context.dispatches`, the same object the success branch pushes (`seatId`, `message`, `strategy`, `modelLabel(outcome.modelId)`, `turnNumber`). Store null for a blank side. Do not push before the write callback. An error with no prose still stores nothing. The timeout branch above this one still stores nothing. The success branch already pushes once. Do not push again there.

**Post-beat.** Both `emptyConsultOutcome` returns in `runEventDrivenAfterTacticalBeatConsultation` pass `message: post.message ?? null` and `strategy: post.strategy ?? null`. The return that has no `post` yet stays empty. Do not add a helper to `readyIpcResolutionMapping.ts`.

**Test.** Add one case beside the three-commander test, or a smaller `withMatch` case: the runner returns `emptyConsultOutcome({ finished: false, message: 'You cannot hide.', strategy: 'Hold the coast.', costUsd: 0, modelId: 'model-a' })`. After settle, a draining read has that message and that strategy for that seat. A runner that returns `emptyConsultOutcome({ finished: false, errorMessage: 'nope' })` leaves `dispatches` empty. A runner that returns `finished: false` with `message: '   '` and `strategy: null` also leaves `dispatches` empty. Use the existing `finishedConsult` shape as the model. Do not log the message text from production code.

**Doc.** None. The player-visible change is Phase 9. Update the comment on `CommanderDispatch` only if it says a dispatch exists only for a finished consult.

**Verify:** `npm test`. No renderer build.

## Phase 9: One message dialog with a tab per opponent

**Goal.** The first message opens the existing `#ai-strategy-toast` with one tab per AI opponent, in alphabetical order, all disabled. A tab enables and becomes selected when that opponent's message arrives. Message, then Strategy while observing. The 24 second timer and hide-on-planning stay. Later opponents no longer replace the whole dialog.

**Read first.** `showCommanderMessagesToast`, `showAiStrategyToast`, `showFilledAiStrategyToast`, and `hideAiStrategyToast` in the renderer OpenRouter modules. `messageLines` and `bindCommanderPoolScreen` in `src/renderer/openRouter/commanderPoolClient.ts`. Every `showAiStrategyToast(` call: `readyHandler.ts`, `readyTacticalCommit.ts`, `openRouterControls.ts` (the post-resolution listener), and `applyTacticalPostBeatConsultSideEffects.ts`. `AI_SEAT_KIND`, `findSeat`, and `homeRegion` on `SeatSnapshot`. `isObservingRoster` in `src/shared/observeModeControls.ts`. `.openrouter-tab-bar` in `static/shellChrome.css`. `doc/ux/notifications-and-feedback.md`.

**Pure state.** Add `src/shared/commanderMessageTabs.ts`.

```ts
export interface CommanderMessageTab {
  readonly seatId: string;
  readonly label: string;
  readonly enabled: boolean;
  readonly message: string | null;
  readonly strategy: string | null;
}

export interface CommanderMessageTabState {
  readonly tabs: readonly CommanderMessageTab[];
  readonly selectedSeatId: string | null;
}

export function initialCommanderMessageTabs(
  seats: readonly { readonly seatId: string; readonly label: string }[]
): CommanderMessageTabState

export function applyCommanderMessage(
  state: CommanderMessageTabState,
  arrival: {
    readonly seatId: string;
    readonly message: string | null;
    readonly strategy: string | null;
  }
): CommanderMessageTabState
```

`initialCommanderMessageTabs` sorts by label (`localeCompare('en')`), then `seatId`, and sets every tab disabled, message and strategy null, `selectedSeatId` null. `applyCommanderMessage` enables that seat, replaces its message and strategy, and selects it. A null or whitespace message is stored as null. Same for strategy. If both are null, return the state unchanged. An unknown `seatId` returns the state unchanged. Do not reorder tabs on apply.

Tests use the labels `Central Thailand` and `Northern America`. Tab order is Central Thailand, then Northern America. Apply a message to the second seat: that tab is enabled and selected, and the other stays disabled. Apply again with a new message: the body is replaced, not appended. Whitespace does not enable a tab. An unknown seat id does not add a tab.

**UI.** Add `src/renderer/openRouter/commanderMessageTabsUi.ts`. `showCommanderMessageTabs(dispatches)`:

- If the toast is hidden or there is no tab state, build `initialCommanderMessageTabs` from `S.gameState.seats` where `kind === AI_SEAT_KIND`. Label is `homeRegion`, or the seat id when the name is empty.
- While observing (`isObservingRoster`), keep `strategy`. Otherwise store strategy as null before `applyCommanderMessage`.
- Apply the kept dispatches in array order. A dispatch with no message and no stored strategy is skipped. This UI does not file. `messageLines` already calls `fileCommanderMessage`, and that callback in `openRouterControls.ts` writes the Reports entry.
- If no tab is enabled after the batch, do not show the toast.
- Render inside `#ai-strategy-toast-text`: a `role="tablist"` bar, then one `role="tabpanel"` for the selected tab. Each tab is a button, `role="tab"`, `aria-selected`, disabled while `enabled` is false. The selected panel uses `buildAiStrategyToastSections({ message, strategy })` and `appendMapToastSectionHeader`, the same bold `Message:` and `Strategy:` as main. An enabled tab with no sections is not a panel. Put that fill in one function, `renderCommanderMessageTabs`.
- A new dispatch calls `showFilledAiStrategyToast(renderCommanderMessageTabs, false)`. That is the only call. It restarts the 24 second timer, which is what a new message does today. `fileReport` stays false. Reports are already filed from the dispatch in `initOpenRouterUI` (`fileCommanderMessage` in `openRouterControls.ts`). Do not file the tab panel, or each message is recorded twice.
- Clicking an enabled tab updates `selectedSeatId` and calls `renderCommanderMessageTabs` only. It does not call `showFilledAiStrategyToast`, or the click would restart the timer. Disabled tabs do not select.
- Do not import `commanderMessageTabsUi.ts` from `openRouterUiHelpers.ts`. The tab UI already imports that file (`showFilledAiStrategyToast`, `appendMapToastSectionHeader`), and the reverse import would cycle. Add `setAiStrategyToastHiddenListener(listener: () => void)` in `openRouterUiHelpers.ts`. `hideAiStrategyToast` calls it. `bindCommanderMessageTabs()` in the tab module registers a listener that drops its tab state. Call `bindCommanderMessageTabs()` from `initOpenRouterUI`, next to `bindCommanderPoolScreen`, so the listener exists before a hide. `hidePlanningChromeToasts` and the dismiss control already call `hideAiStrategyToast`. Do not change them.

Markup: no new toast. The tab bar is created in script. CSS in `static/feedbackChrome.css`, scoped under `#ai-strategy-toast`. Match `.openrouter-tab-bar`: a bottom border, the selected tab bold with the accent underline, disabled tabs muted and not clickable. The bar wraps (`flex-wrap: wrap`) so four names fit the toast's one-third map width. Do not widen the toast band.

**Pool client.** Change the screen callback from `(lines: readonly string[]) => void` to `(dispatches: readonly CommanderDispatch[]) => void`. `messageLines` still files and returns the dispatches that were kept, instead of formatted strings. `readCommanderPoolAndApply(drain, showMessages = true)` shows only when `showMessages` is true and that list is non-empty. An empty list does not show and does not hide. Keep the seat-cost refresh: when `drain` is true and (`next.dispatches.length > 0` or planning just finished), still `await refreshSeatCosts()`. Delete `showCommanderMessagesToast` and `commanderMessagesToast.ts`. Update `bindCommanderPoolScreen` in `openRouterControls.ts` to pass `showCommanderMessageTabs`.

**Remove the untagged toast.** Delete `showAiStrategyToast`. Do not add a drain in `readyHandler.ts`. Delete the `showAiStrategyToast` call there. Its `finally` already calls `void readCommanderPoolAndApply(true)`, and a second drain in the same turn would race that one. Replace the call in `readyTacticalCommit.ts`, in `applyTacticalPostBeatConsultSideEffects.ts`, and on the successful post-resolution listener in `openRouterControls.ts` with `void readCommanderPoolAndApply(true)`. On the stale-turn returns of both deferred listeners, and inside `applyAbandonedDeferredConsultRecovery`, call `void readCommanderPoolAndApply(true, false)`. The second argument is `showMessages`. False still files through `messageLines` and does not call `showCommanderMessageTabs`, and it does not hide a dialog that is already open. A later poll must not open a dialog for a consult the player was told was ignored, because this drain has already taken those dispatches. Every existing `readCommanderPoolAndApply(true)` keeps the default and still shows. The early return while the new-game screen is open and no match is waiting does not drain.

Remove `showAiStrategyToast` from the dependency objects in `readyHandlerTypes.ts`, `openRouterRuntime.ts`, `entryCallbacks.ts`, `wiredEntryCallbacks.ts`, `openRouterControls.ts`, and `applyTacticalPostBeatConsultSideEffects.ts`. Do not leave a field that nothing reads.

`strategicConsultFields` may keep returning the first seat's `aiMessage` for the IPC payload. Nothing on the screen shows it. Update its comment so it does not say the toast uses that field.

**New match.** `clearOpenRouterLog` runs on a successful start. Clear the message-tab state there too, by calling `hideAiStrategyToast` if it is not already called. Search the start handler. If the toast can still be open underneath, hide it.

**Doc.**

- `doc/ux/notifications-and-feedback.md`: the AI strategy toast is a tab per AI opponent, labels are full home names in alphabetical order, tabs start disabled, and each dispatch enables and selects its tab. The panel is Message, then Strategy only while observing. The timer restarts on each dispatch. Dismiss, the timer, and starting a planning action clear it. The next dispatch builds the tabs again. The shared toast is not filed. Each kept dispatch is already its own Reports entry.
- `doc/ux/reports-tab.md`: a drained dispatch is still one Message per commander. Delete any sentence that says a single Message/Strategy toast is filed as one copy. The stale and abandoned drains file and do not open the dialog.
- `doc/how-to-play.md` the sentence that says the toast is one Message and Strategy, or "Messages (n)" when several commanders finish together.

**Verify:** `npm test`, `npm run typecheck:renderer`, and `npm run build:renderer`. Manual check is in Phase 11, because it needs two opponents to finish apart.

## Phase 10: Ready label `AI: MM:SS (xN)`

**Goal.** While Ready is waiting on opponents, the button reads `AI: 00:05 (x2)` when two commanders are planning and five seconds have elapsed. The collapsed rail still wraps after `AI:`.

**Read first.** `setReadyButtonLabelAiWait` and `formatElapsedMmSs` in `src/renderer/openRouter/readyButtonLabel.ts`, `planningCommanderCount` and the three `setReadyButtonLabelAiWait` calls in `src/renderer/openRouter/openRouterUiHelpers.ts`, and the Ready bullets in `doc/ux/console-command-bar.md`, `doc/ux/console.md`, `doc/ux/modes-and-transitions.md`, and `doc/how-to-play.md`.

**Shared.** Add `src/shared/readyAiWaitLabel.ts`:

```ts
export function readyAiWaitLabel(elapsedLabel: string, pendingCount: number): string {
  const count = pendingCount < 1 ? 1 : pendingCount;
  return `AI: ${elapsedLabel} (x${count})`;
}
```

Test `readyAiWaitLabel('00:05', 2)`, count 0, count 1, and count 4. Count 0 is `AI: 00:05 (x1)`. Do not format the clock in this module. `formatElapsedMmSs` stays in the renderer.

**Screen.** `setReadyButtonLabelAiWait` sets the span text to `readyAiWaitLabel(formatElapsedMmSs(elapsedMs), planningCount)`. The calls already pass `planningCommanderCount()`. Do not change them. Update the function's orienting comment, which currently says ` · {k} planning`.

**Doc.** Replace `AI: {m:ss} · {k} planning` with `AI: {m:ss} (x{n})` in:

- `doc/ux/console-command-bar.md`
- `doc/ux/console.md` (the footer label and the collapsed-rail sentence; the wrap-at-the-space sentence stays true, because the text still has one space)
- `doc/ux/modes-and-transitions.md` (the planning wait, the deferred consult, and the tactical wait)
- `doc/how-to-play.md` "Waiting on the AI"

Say `n` is how many commanders are still planning. The footer status line (`Commanders planning · {ready} of {active} ready`) stays.

**Verify:** `npm test` and `npm run build:renderer`.

## Phase 11: Whole-game check

**Goal.** The branch agrees with this plan, and a player can see each change.

**Automated.** Run `npm test`, then `npm run typecheck:renderer`, then `npm run build:renderer`. Do not commit.

**Search.**

- `victorySettingsForMapKind` is gone.
- `showAiStrategyToast` and `commanderMessagesToast` are gone.
- `debug-last-strategic-prompt.txt` as an exact filename remains only in `.spec/completed/` and in git history. Living docs use the numbered form.
- No phase number or heading from this file appears under `src/`, `static/`, or `doc/`.
- New files are at or under 600 lines. `main.ts` and `readyIpcResolutionMapping.ts` get no new functions. A file this plan only extends by an extra argument, such as `requestOrdersToolLoop.ts`, may pass 600. Do not split it for that. Nothing this work touches passes 1000.

**Manual**, with two AI opponents that have keys and models, then once more with no models:

- Add the third opponent. Its model, effort, doctrine, and masked key match the second. Its home does not.
- Global and Regional open on Deathmatch with Unlimited disabled. Most city hexes enables 20, 30, 40, and 50. Start one Deathmatch and confirm the top bar says `Turn 1` with no `of 30`, and Enemy homes shows instead of Cities.
- Start with no model. No leaves the setup screen. Yes starts, and no model call is logged.
- Open the popover. The model select and the refresh button are the same height. The popover stays on screen.
- Ready while both plan reads `AI: MM:SS (x2)`. After one finishes, `(x1)`.
- Messages: the dialog opens with both names as tabs, alphabetical, the unfinished one disabled. When the second message arrives, its tab enables and is selected, and the panel shows that opponent. Click the first tab: its own Message is still there, and the timer does not restart. While playing, Strategy is absent. Dismiss, wait out the timer, or select a unit, and the next message starts from disabled tabs again.
- After a fight, the update popup shows a `Your Losses` or `{name} Losses` section with a cause label and an origin flag on a named unit, the hex sentences, and Updates. It does not show `Seen:`.
- Reach a tactical battles list if a melee hex is available. The Hex cell shows the place name, a flag, and a terrain chip. Yours and Enemy still show the dot and the short name.

If a live model call is not available, say which of the last three checks were not run.
