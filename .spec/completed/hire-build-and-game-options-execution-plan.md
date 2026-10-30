# Hire panel, build popup, and Game Options

> **For agentic workers:** Implement this plan phase by phase. Steps use checkbox (`- [ ]`) syntax. Do not commit or push. Do not copy phase names, or any other plan identifier, into code, comments, configuration, lint text, or `doc/`.

**Goal:** Adjust hire-marker and hire-panel copy, narrow the build popup, put Starting month beside Game size, and move Victory plus the remaining Rules controls into a Game Options popover.

**Architecture:** Copy and layout only. Prices, capacity, victory, and match start keep their current reads. Shared formatters in `src/shared/economySymbols.ts` and `src/shared/mercenaryRules.ts` own the hire strings. The start dialog keeps the existing select and checkbox elements, so `src/renderer/gameplay/newGameVictoryUi.ts` and `src/renderer/gameplay/newGameOptionsUi.ts` keep working by id. A new popover module only shows, places, and closes those nodes.

**Tech stack:** TypeScript renderer and shared modules, `static/index.html`, `static/overlayChrome.css`, `static/newGameChrome.css`, Node `node:test` after `npm run build:main`.

**Spec:** This file is the spec. UX behavior that changes is also written into the living docs named in each phase.

## Global constraints

- Do not commit or push.
- Do not put phase, stage, or plan identifiers into code, comments, docs, lint text, or configuration.
- New and updated functions get an orienting comment in the shape already used in that file: why it exists, when to use it, what it returns, and what it throws.
- Player-facing credit amounts use `formatCreditsAmount`. Production amounts use `formatProductionCapacityAmount`. Do not paste `¤` or `⚒` at a call site.
- Do not change mechanics, IPC channel strings, AI prompt text, the top-bar upkeep suffix (`formatCreditsUpkeepSuffix`, a minus sign then `¤N/turn`), or the hex-tooltip Production line in `src/renderer/map/terrainTooltipHtml.ts`.
- The multi-hex build popup in `src/renderer/gameplay/buildQueueMultiPopup.ts` keeps the label `Production`.
- Panel width stays `--new-game-panel-width` (432px) in `static/shellChrome.css`.
- These popover functions are renderer UI, in the same style as `src/renderer/openRouter/commanderPopover.ts`. Do not add a logger.
- Leave historical docs alone: `doc/devleopment-plan-v3.4.md`, `doc/poc-analysis.md`, `doc/market-research.md`, and everything under `.spec/completed/`.
- Edit living docs in place. Do not rewrite a whole paragraph to change one clause.

## Decisions already made

- The hire-only map button suffix is ` · Hire` (U+00B7), from `formatHireEntryLabel`. That is the suffix to remove. There is no hyphen form.
- The Credits label stays `Credits:`. The value is always `¤N + ¤N / turn`, including when upkeep is 0. The second number is `upkeepPerTurn`, not pending hire fees.
- `Production (Hire)` is shown only when `view.raise` is set, the same condition Capacity uses today. The funds warning (`HIRE_FUNDS_WARNING`) stays, including its mention of hire orders.
- Queue prefixes that exist are only `Raise ` and `Rehire ` in `formatHireOrderLabel`. Remove both. A raise row still starts with the count. Do not search the AI prompt or the combat rules for those words.
- `/t` becomes ` / turn` (space, slash, space, `turn`) inside `formatCompactHireCost` only. That updates the hire dropdown, the Neutral-unit price, and the hire queue together. Do not change `formatCreditsUpkeepSuffix` or the selection-panel `/turn` chip.
- Both build-popup max widths shrink by one quarter: `.build-popup` from 200px to 150px, and `.build-popup.build-popup-wide` from 280px to 210px. `width` stays `fit-content`. Build-only and multi-hex popups use the 150px cap because they remove `build-popup-wide`. That shrink is intended. Do not add a third width.
- The single-hex production label lives in one assignment in `buildQueuePopup.ts`. Renaming it changes that panel with or without the Hire tab, including a hex the player does not control. Do not add a second label that depends on the tab.
- Game size and Starting month share one row. Both selects are equal width. The 30px randomize button stays to the right of the month. A long closed month may clip. The open list still shows the full name. The panel stays 432px.
- The Game Options control is a full-width outline button labeled `Game Options`, with the same face as `.new-game-side-commander` but its own class. It sits directly under the unit-cost row. The popover holds the existing Victory block (Rule, Turn limit) and the remaining Rules block (four bonuses, Fog of war, Auto-start AI), with those headings. Starting month is not in the popover.

## Review focus

- Upkeep 0 still renders `¤0` in the Credits value. Pending hire fees are not folded into that value.
- A hex that cannot raise omits `Production (Hire)` and still shows Credits. The funds warning still appears when credits are below upkeep plus fees.
- A rehire queue row is the unit name and price, with no `Rehire ` prefix. A raise queue row keeps the count and drops `Raise `.
- Start game still reads victory, turn limit, bonuses, fog, month, and game size while the popover is closed. Changing Weather bonus or Tech bonus inside the popover still updates the preview, because those selects are the same elements.
- Opening Game Options closes the commander popover. Opening a commander from a new-game side row closes Game Options. The two popover modules do not import each other. Escape closes Game Options and does not start the match, dismiss the new-game screen, or close the game menu while Game Options is closed.
- After the overlay hides, or the choices collapse, or the player presses the panel grip, the Game Options popover is gone. It is not left fixed over the match.

## File map

- `src/shared/mercenaryRules.ts` — marker label, queue title, queue row text, credits value, capacity label.
- `src/shared/economySymbols.ts` — `/t` spelling.
- `src/renderer/gameplay/hirePanel.ts` — fund line order.
- `src/renderer/gameplay/hireEntryMarkers.ts` — comment on the marker label only.
- `src/renderer/gameplay/buildQueuePopup.ts` — `Production (Build)` on the single-hex build panel.
- `static/overlayChrome.css` — popup max widths and hire-queue wrapping.
- `static/index.html` and `static/newGameChrome.css` — Forces row and Game Options.
- New `src/renderer/gameplay/newGameOptionsPopover.ts` — show, place, and close. Placement uses `placeBelowAnchor` from `src/shared/popoverPlacement.ts`.
- `src/renderer/gameplay/newGame.ts`, `src/renderer/gameplay/newGameSidesUi.ts`, `src/renderer/gameplay/newGameReturn.ts`, `src/renderer/gameplay/newGameDialogCollapse.ts`, and `src/renderer/core/uiState.ts` — close or toggle calls only. Do not edit `src/renderer/openRouter/commanderPopover.ts`.
- Docs named in each phase, plus `scripts/ui-smoke/ui-smoke-new-game-checks.cjs`, `scripts/ui-smoke/ui-smoke-scenes.cjs`, `scripts/ui-smoke/ui-smoke.cjs`, and `scripts/ui-smoke/ui-smoke-new-game.cjs`.

---

### Phase 1: Hire-only marker text

**Files:** Modify `src/shared/mercenaryRules.ts` (`formatHireEntryLabel`), `src/renderer/gameplay/hireEntryMarkers.ts` (the `label` field comment), `src/shared/mercenaryRules.test.ts`, and the hire-marker sentence in `doc/ux/build-popup.md`.

**Produces:** `formatHireEntryLabel(productionText: string): string` returns `productionText` unchanged. Keep the function. The marker module stays the caller and does not format the figure itself.

- [ ] In `mercenaryRules.test.ts`, import `formatHireEntryLabel` and `formatProductionCapacityAmount`. Assert `formatHireEntryLabel(formatProductionCapacityAmount('12'))` equals `formatProductionCapacityAmount('12')`.
- [ ] Run `npm run build:main`, then `node dist/shared/mercenaryRules.test.js`. Expected: the new test fails.
- [ ] Change `formatHireEntryLabel` to return `productionText`. Update its orienting comment and the `label` field comment in `hireEntryMarkers.ts`, which today says the text ends with ` · Hire`. Leave `formatHireEntryAriaLabel` (`Open hiring for …`) and the `Hire Units` tip alone.
- [ ] In `doc/ux/build-popup.md`, say the hire marker's button text is that production figure only.
- [ ] Re-run `node dist/shared/mercenaryRules.test.js`. Expected: pass.

### Phase 2: Hire price spelling

**Files:** Modify `src/shared/economySymbols.ts` (`formatCompactHireCost`), `src/shared/economySymbols.test.ts`, and the price sentences in the Hire panel bullet of `doc/ux/build-popup.md`.

**Produces:** `formatCompactHireCost(fee, upkeep)` uses ` / turn` instead of `/t`. Callers of `formatCompactRaiseCost` and `formatCompactHireCost` pick this up with no further edits. When `fee - upkeep` is not above 0, the result is still the per-turn piece alone. Do not change that branch except the spelling of the per-turn piece.

- [ ] In `economySymbols.test.ts`, expect `` `${CREDITS_SYMBOL}3 / turn` `` when the fee equals upkeep, and `` `${CREDITS_SYMBOL}3 + ${CREDITS_SYMBOL}3 / turn` `` when the fee is 6 and upkeep is 3. The raise-cost assertions already delegate to `formatCompactHireCost`. Leave that delegation.
- [ ] Run `npm run build:main`, then `node dist/shared/economySymbols.test.js`. Expected: fail on `/t`.
- [ ] In `formatCompactHireCost`, build the per-turn piece as `` `${CREDITS_SYMBOL}${upkeep} / turn` ``. Update that function's orienting comment, and the comment on `formatCompactRaiseCost` that still shows `¤3/t`. The one-time extra, when `fee - upkeep > 0`, stays `` `${CREDITS_SYMBOL}${extra} + ${perTurn}` ``.
- [ ] Replace the `/t` examples in the Hire panel bullet of `doc/ux/build-popup.md` with ` / turn`. Do not edit top-bar, selection-panel, or prompt text that uses `/turn` without this spacing.
- [ ] Re-run `node dist/shared/economySymbols.test.js`. Expected: pass. `mercenaryRules.test.ts` still passes because its expectations call these formatters.

### Phase 3: Hire queue text

**Files:** Modify `src/shared/mercenaryRules.ts`, `src/shared/mercenaryRules.test.ts`, and the Hire panel bullet in `doc/ux/build-popup.md`.

**Produces:** `PENDING_HIRE_SECTION_TITLE` is `Hire Queue`. `formatHireOrderLabel` no longer prefixes `Raise ` or `Rehire `.

- [ ] Change the raise-order assertion to `` `2 Infantry (${formatCompactRaiseCost(unitCostFor('infantry'), 3, 3)})` ``. Change the rehire-order assertion to `` `4th Infantry (${formatCompactHireCost(6, 3)})` ``. Keep the same input objects.
- [ ] Run `npm run build:main`, then `node dist/shared/mercenaryRules.test.js`. Expected: fail on the old prefixes.
- [ ] Set `PENDING_HIRE_SECTION_TITLE` to `Hire Queue`. In `formatHireOrderLabel`, a rehire returns `` `${name} (${formatCompactHireCost(order.fee, upkeep)})` ``. A raise returns `` `${order.count} ${capitalizeUnitType(order.unitType)} (${price})` ``. `name` stays `order.displayName` or the title-cased unit type when the display name is null. Update the orienting comments. Do not add another prefix.
- [ ] In the Hire panel bullet, the orders heading is `Hire Queue`. A pending raise is the count, the type, and the price. A pending rehire is the unit name and the price.
- [ ] Re-run `node dist/shared/mercenaryRules.test.js`. Expected: pass.

### Phase 4: Hire fund lines

**Files:** Modify `src/shared/mercenaryRules.ts`, `src/renderer/gameplay/hirePanel.ts`, `src/shared/mercenaryRules.test.ts`, and the Hire panel bullet in `doc/ux/build-popup.md`.

**Produces:** `formatHireCreditsValue(credits: number, upkeepPerTurn: number): string`. `RAISE_CAPACITY_LABEL` is `Production (Hire)`.

- [ ] Test `formatHireCreditsValue(85, 5)` equals `` `${formatCreditsAmount('85')} + ${formatCreditsAmount('5')} / turn` ``. Test `formatHireCreditsValue(85, 0)` equals `` `${formatCreditsAmount('85')} + ${formatCreditsAmount('0')} / turn` ``. Assert `RAISE_CAPACITY_LABEL` is `Production (Hire)`. Use `String` for the digits, as the panel does today. No thousands separators.
- [ ] Run `npm run build:main`, then `node dist/shared/mercenaryRules.test.js`. Expected: fail because the function is missing.
- [ ] Add `formatHireCreditsValue`. It returns `` `${formatCreditsAmount(String(credits))} + ${formatCreditsAmount(String(upkeepPerTurn))} / turn` ``. Set `RAISE_CAPACITY_LABEL` to `Production (Hire)`. Delete `UPKEEP_LINE_LABEL` and `HIRE_FEES_LINE_LABEL` only after a search shows `hirePanel.ts` is their only importer, and remove those imports there. Leave `HIRE_FUNDS_WARNING` and `HIRE_REASON_NOT_PLANNING` unchanged.
- [ ] In `appendFunds`, when `view.raise` is set, append the capacity line first, using `formatRaiseCapacityValue(raise.capacityLeft, raise.capacityPerTurn)`. Then append Credits with `formatHireCreditsValue(funds.credits, funds.upkeepPerTurn)`. Do not append Upkeep or Hire orders. Tech stays in `appendTechLine`, which already runs before `appendFunds`, so the visible order is Tech, then `Production (Hire)` when raising is available, then Credits. Leave the funds warning and the blocked-reason notes where `renderHirePanel` already puts them, after `appendFunds`. Update the `appendFunds` comment.
- [ ] Rewrite the Hire panel bullet in `doc/ux/build-popup.md` to that order. No Upkeep line. No Hire orders line. The warning, raise controls, Neutral units, and Hire Queue stay.
- [ ] Run `npm run build:main`, `node dist/shared/mercenaryRules.test.js`, and `npm run check:renderer-types`. Expected: pass.

### Phase 5: Build-panel production label

**Files:** Modify the one assignment in `src/renderer/gameplay/buildQueuePopup.ts` that sets `` `<strong>Production:</strong> ${productionDetail}` ``. Modify the Production bullet in `doc/ux/build-popup.md`.

- [ ] Change that label to `Production (Build)`. The value, including `(none)` when production is 0, stays. Do not change `src/renderer/gameplay/buildQueueMultiPopup.ts` or `src/renderer/map/terrainTooltipHtml.ts`.
- [ ] Say the single-hex build panel labels that line `Production (Build)`, with or without the Hire tab. The multi-hex popup keeps `Production`.
- [ ] Run `npm run check:renderer-types`. Expected: pass.

### Phase 6: Build popup width

**Files:** Modify `static/overlayChrome.css` and the live-app production sentence in `doc/ui-style-guide.md` (section 2.9).

- [ ] Set `.build-popup` `max-width` from `200px` to `150px`. Set `.build-popup.build-popup-wide` `max-width` from `280px` to `210px`. Leave `width: fit-content`.
- [ ] Let hire text shrink inside the cap. On `.hire-panel .build-queue-row > span`, set `min-width: 0` and `overflow-wrap: anywhere`. Do not set `flex: 1` on those spans, and do not add `flex-wrap` to `.build-queue-row`. The type select already has `flex: 1` and `min-width: 0`, so the closed list clips and the count and Hire button stay on the row.
- [ ] In the style guide, change the existing width clause in place: the wide popup max width is 210px, and the plain `.build-popup` max width is 150px. Do not rewrite the rest of that sentence.
- [ ] Verification for this phase is those CSS values and that sentence. `npm test` does not run UI smoke.

### Phase 7: Game size and starting month

**Files:** Modify `static/index.html`, `static/newGameChrome.css`, `doc/ux/new-game-dialog.md`, `doc/game-size-unit-caps.md`, the New game paragraph in `doc/ui-style-guide.md`, and the month assertion in `scripts/ui-smoke/ui-smoke-new-game-checks.cjs`.

Keep `#new-game-start-month` and `#new-game-start-month-randomize`. Do not recreate them. `src/renderer/gameplay/newGame.ts` and `src/renderer/gameplay/newGameOptionsUi.ts` already find them by id.

- [ ] Move the Starting month label, `#new-game-start-month`, and `#new-game-start-month-randomize` into `.new-game-size-row`, as direct children after `#new-game-size-select`. Remove the `.new-game-month-controls` wrapper. Nothing in TypeScript references that class.
- [ ] Lay `.new-game-size-row` out as a grid: `max-content minmax(0, 1fr) max-content minmax(0, 1fr) 30px`, `align-items: center`, column gap 6px. Both selects are `width: 100%`, `min-width: 0`, and `box-sizing: border-box`. Labels use `white-space: nowrap`. The randomize button stays 30px square. Delete the `width: max-content` rules for these two selects and the month rule `grid-column: 2 / -1`.
- [ ] Leave the four bonus labels inside `.new-game-rules`. After the month label leaves that grid, `label:nth-of-type(2n)` still matches Tech and Weather. Do not change that rule. `.new-game-checks` stays inside `.new-game-rules` so `grid-column: 1 / -1` still spans the bonus grid.
- [ ] Update the Forces and Rules sentences so Starting month is on the Game size line, both lists the same width, the closed month allowed to clip, and the randomize control still on that line. Update the Game size sentence in `doc/game-size-unit-caps.md` the same way. Update the matching clause in the style guide's New game paragraph. Do not move Fog of war in this phase.
- [ ] `near` in `scripts/ui-smoke/ui-smoke-scenes.cjs` is 1 CSS pixel. Do not loosen it. In the `new-game-rules` smoke check, delete the assertion that the month sits under the bonuses on the first bonus column. Add a check, on the same panel scenes, that `#new-game-size-select` and `#new-game-start-month` share a y (`near`), have the same width (`near`), the month's x is greater than the game-size select's x, and `#new-game-start-month-randomize` is 30px wide, the same height as the month select (`near`), and 6px to the month's right (`near` on `month.x + month.w` against `button.x - 6`). Leave the bonus, fog, and auto-start assertions until the next phase.
- [ ] Do not run `npm run ui:smoke` in this phase.

### Phase 8: Game Options popover

**Files:** Modify `static/index.html`, `static/newGameChrome.css`, `src/renderer/gameplay/newGame.ts`, `src/renderer/gameplay/newGameSidesUi.ts`, `src/renderer/gameplay/newGameReturn.ts`, `src/renderer/gameplay/newGameDialogCollapse.ts`, and `src/renderer/core/uiState.ts`. Create `src/renderer/gameplay/newGameOptionsPopover.ts`. Update `doc/ux/new-game-dialog.md`, `doc/ux/control-tooltips.md`, `doc/ui-style-guide.md`, `doc/region-vs-region.md`, and `doc/game-size-unit-caps.md` if it still says the Rules section follows Game size. Update `scripts/ui-smoke/ui-smoke-scenes.cjs`, `scripts/ui-smoke/ui-smoke.cjs`, `scripts/ui-smoke/ui-smoke-new-game.cjs`, and `scripts/ui-smoke/ui-smoke-new-game-checks.cjs`.

**Consumes:** The month controls already live on the Forces row. Victory and Rules markup still uses the same ids: `#new-game-victory-select`, `#new-game-turn-limit-select`, `#new-game-origin-bonus-select`, `#new-game-tech-bonus-select`, `#new-game-terrain-bonus-select`, `#new-game-weather-bonus-select`, `#new-game-fog-checkbox`, `#new-game-auto-start-checkbox`.

**Produces:** `wireNewGameOptionsPopover(): void`, `toggleNewGameOptionsPopover(anchor: HTMLButtonElement): void`, `closeNewGameOptionsPopover(): void`, and `newGameOptionsPopoverIsOpen(): boolean`.

Do not import `newGameOptionsPopover.ts` from `commanderPopover.ts`, and do not import `commanderPopover.ts` from a module that `newGameOptionsPopover.ts` would then reach only through a cycle. The allowed edge is one way: `newGameOptionsPopover.ts` may import `closeCommanderPopover`. Callers that already open a commander import `closeNewGameOptionsPopover` and call it before `openCommanderPopover`.

- [ ] In `index.html`, put `#new-game-options-btn` immediately after `ul.new-game-units`, inside the Forces section. Text: `Game Options`. Class `new-game-options-btn`. Do not use `new-game-side-commander`; that class sets `grid-column: 1 / -1`. Copy its face onto the new class: transparent background, `color: var(--chrome-text)`, `border: 1px solid var(--chrome-border)`, height 28px, padding `0 8px`, border-radius 2px, font-size 12.5px, text-align left, cursor pointer, `width: 100%`, `margin-top: 12px`. Hover sets `border-color: var(--chrome-accent-edge)`. `data-control-tooltip`: `Victory rule, turn limit, bonuses, fog of war, and Auto-start AI.` Add that sentence to `doc/ux/control-tooltips.md` beside the other new-game sentences.
- [ ] Move the Victory `<section>` and the Rules `<section>` into `#new-game-options-popover`. The month is already gone from Rules. Put the popover in `index.html` as a sibling after `#game-over-overlay`, a direct child of `body`, not inside the overlay. The overlay is `z-index: 7002` and creates a stacking context, so a popover inside it cannot paint above the panel the way `.commander-popover` does from `document.body`. Give the popover `hidden` in the initial markup.
- [ ] Because the popover is outside `#game-over-dialog`, the Forces section is the last child of that body. The existing `.new-game-section:last-child { border-bottom: 0 }` rule removes the divider under the unit row. Do not add a replacement divider.
- [ ] Popover chrome follows `.commander-popover`: `position: fixed`, navy background, 1px border, 6px radius, the same shadow, `z-index: 7060`, width 400px, `max-width: calc(100vw - 24px)`, padding 10px. Header text `Game Options` and a close control with `aria-label="Close"` and text `×`, using the commander header classes. Body order is the Victory section, then the Rules section. Keep `.new-game-rules` and `.new-game-checks` so the bonuses stay two columns and Fog of war stays on one row with Auto-start AI to the right.
- [ ] Inside the popover, section chrome must not repeat the panel's 18px padding. Set `.new-game-options-popover .new-game-section` padding to `12px 0` and border-bottom to the same divider the panel uses. Set the last section's border and bottom padding to 0. Titles stay.
- [ ] `wireNewGameOptionsPopover` runs once from `registerNewGameButton`. It sets the button click to `toggleNewGameOptionsPopover(button)`. `toggleNewGameOptionsPopover` closes the popover when `newGameOptionsPopoverIsOpen()` is already true. Otherwise it calls `closeCommanderPopover()`, removes `hidden`, then reads `getBoundingClientRect` and places with `placeBelowAnchor`, using the same anchor and viewport fields `placeCommanderPopover` passes. Measuring while `hidden` is still set yields an empty box. Place at the returned `top` and `left`.
- [ ] While open, reposition on `scroll` (capture, so `#game-over-dialog` scrolling counts), and on `window` `resize`. Remove those listeners on close. Close on Escape, on the close control, and on a document `pointerdown` whose target is outside the popover and outside `#new-game-options-btn`. A `change` on a select inside the popover does not close it. Match `commanderPopover.ts`: attach the document listeners on open and remove them on close, so a closed popover does not take Escape from the game menu.
- [ ] Also call `closeNewGameOptionsPopover` from these places, and nowhere that would import this module in a cycle:
  - `openRowCommander` in `newGameSidesUi.ts`, immediately before `openCommanderPopover`.
  - The `closeCommanderPopover()` call in `registerNewGameButton` in `newGame.ts`, beside it.
  - `closeNewGameOverlayToMatch` in `newGameReturn.ts`, when the overlay is about to hide.
  - `updateGameOverUI` in `uiState.ts`, both when the overlay hides (`!showOverlay`) and when it is shown again (`wasHidden`), so a new open starts with the popover closed.
  - `toggleNewGameDialogCollapsed` in `newGameDialogCollapse.ts`, when the choices are collapsing (`expanded` becomes false).
  - A `pointerdown` listener on `#new-game-panel-grip`, registered from `wireNewGameOptionsPopover`, so a drag does not leave the popover behind the moved panel.
- [ ] Do not destroy, clone, or rebind the selects. `readNewGameVictory`, `readNewGameOptionChoices`, `resetNewGameOptionControls`, and the weather and tech preview listeners stay valid while the popover is closed because the elements stay in the document.
- [ ] Docs, edited in place: the panel body shows Map, Sides, and Forces. Victory and Rules open from Game Options, under the unit-cost row. Starting month is on the Forces row, not in that popover. Fog of war and Auto-start AI stay one row inside it. `doc/region-vs-region.md` no longer says fog is on the line after the starting month; the month is beside Game size, and fog is inside Game Options. The style guide's New game paragraph matches this, including that the body no longer has five sections. The code-entry list in `doc/ux/new-game-dialog.md` names `newGameOptionsPopover.ts`. Preview behavior is unchanged: Weather bonus and Tech bonus still update the map under the panel, and opening the overlay still resets bonuses, fog, Auto-start AI, and the month.
- [ ] Smoke driver: Playwright `selectOption` waits until the control is visible. In `startScenarioMatch` in `scripts/ui-smoke/ui-smoke-new-game.cjs`, click `#new-game-options-btn` immediately before selecting `#new-game-victory-select`, then select the turn limit. Do not pass `force: true`. The victory value in that scenario enables the turn limit, so the turn-limit select is visible after the victory change. Month and game size stay on the panel and need no click.
- [ ] Smoke scenes: in `scripts/ui-smoke/ui-smoke-scenes.cjs`, add a scene id `newGameOptions` with value `new-game-options`. Do not add it to `NEW_GAME_SCENES` or `PANEL_SCENES`. In `runFirstSession` in `scripts/ui-smoke/ui-smoke.cjs`, after the `newGameStartup` recording and before the game-menu click: click `#new-game-options-btn`, park the pointer, wait the usual click settle, `recordScene` as `newGameOptions`, click the button again to close, and park the pointer. The later Escape that closes the game menu must run while this popover is closed.
- [ ] Smoke checks: `new-game-sections` expects the visible titles `Map, Sides, Forces` in that vertical order, using `#new-game-section-map`, `#new-game-section-sides`, and `#new-game-section-forces`. It does not read Victory or Rules. On `PANEL_SCENES`, `#new-game-options-btn` is shown, its text is `Game Options`, its top is below `.new-game-units`, and `#new-game-section-victory` is not shown. Hidden nodes still appear in the probe with `shown: false` and a zero box, so a leftover `PANEL_SCENES` assertion that the bonuses form two rows will fail. Delete those bonus, fog, and auto-start assertions from `PANEL_SCENES`. Add one check whose `scenes` list is only `newGameOptions`: the popover is shown, `#new-game-victory-select` is above `#new-game-origin-bonus-select`, the four bonuses are two rows of two with the same column edges the old check required, and `#new-game-fog-checkbox` and `#new-game-auto-start-checkbox` share a y with Auto-start AI to the right. The file header comment that says the checks cover Map, Forces, and Rules needs the same update.
- [ ] Run `npm run check:renderer-types`. Expected: pass.
- [ ] Run `npm test` once after this phase. Expected: pass. Do not run `npm run ui:smoke` unless Electron can launch. The smoke edits are the contract for the next run.

## Doc check before finishing

Search `doc/` for these hire-panel and setup strings. Update a living doc when the sentence describes the old UI. Leave a hit that is the top bar, a prompt, the combat rules, or a historical file:

- `· Hire`
- `Orders this turn`
- the Hire panel label `Hire orders` (not the prompt sentence "Hire orders this turn")
- `/t` inside `doc/ux/build-popup.md`
- `280 px max`
- `five setup sections`
- `only as wide as its longest`
- `on the line after the starting month`

Do not edit `.spec/completed/`.
