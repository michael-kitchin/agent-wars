# Production Symbol, Credits Symbol, and Hire Panel

This file is the plan. Saving it is not permission to implement the phases.

Audience: a lower-quality coding agent. Implement one phase at a time. Stop after each phase and report the files touched, the command you ran, and its result. Do not commit. Do not start the next phase until the human says to.

If a line in the plan disagrees with the code, trust the code, stop, and report the discrepancy. Do not invent a color, a sentence, or a second placement helper. Do not put phase names, or any other plan label, into code, comments, configuration, or docs. Every new exported function and exported constant gets an orienting comment in the shape used by [`src/shared/anchoredPopupPlacement.ts`](../src/shared/anchoredPopupPlacement.ts): Purpose, When to use, Expected outcome, Exceptions. Shared modules must not import the renderer and must not log. Do not add a logger to a formatter. [`src/renderer/gameplay/buildQueuePopup.ts`](../src/renderer/gameplay/buildQueuePopup.ts) and [`src/renderer/renderer.ts`](../src/renderer/renderer.ts) are already large. Change only the lines this plan names. If a file would pass 1000 lines, stop and report. Do not edit `static/renderer.js`. That file is build output.

## Locked decisions

- Production capacity uses `⚒` (U+2692) plus the text-presentation selector U+FE0E, so the glyph stays a text character and takes the surrounding text color. Store both code points in one constant. Credits use `¤` (U+00A4). Both constants live in a new [`src/shared/economySymbols.ts`](../src/shared/economySymbols.ts). Call sites use the helpers below. Do not paste the glyphs at each call site. Tests compare against the exported constants, so the variation selector is part of the expected string.
- `economySymbols.ts` imports nothing from `mercenaryRules`, `gameRules`, or the renderer.
- A raise charges one turn of upkeep once (`mercenaryHireFee('raise', upkeep)` equals that upkeep). A rehire charges twice the upkeep once (`MERCENARY_REHIRE_FEE_MULTIPLIER` is 2), then the same upkeep continues each turn. The compact price must not assume the two numbers are equal.
- Compact unit price, used on the raise menu, the rehire row, and a pending order. Callers wrap it in parentheses. Spaces around each `+`. The short suffix is `/t` only inside this compact price. The one-time number is the extra above one turn of upkeep (`fee - upkeep`), not the full fee. When that extra is 0, omit it. When the fee is not above the upkeep, show only the per-turn amount. Do not show a negative extra.
  - Fee equals upkeep, with a production cost: `(⚒20 + ¤3/t)`
  - Fee equals upkeep, credits only: `(¤3/t)`
  - Fee is 6 and upkeep is 3, so the extra is 3. With a production cost: `(⚒20 + ¤3 + ¤3/t)`. Credits only: `(¤3 + ¤3/t)`
  - A raise menu item is `Infantry (⚒20 + ¤3/t)`. A rehire row is `(¤3 + ¤3/t)`. The words `capacity`, `fee`, and `upkeep` come out of those items.
- Fund lines and the top bar keep today's longer rate spelling. Credits: `¤120`. Upkeep: `¤3 / turn`. The top-bar upkeep suffix becomes `−¤3/turn` (the existing minus, then `¤`, then the digits, then `/turn`). The Hire orders line is the one-time total of orders already placed, so it is `¤12` with no `/t` and no second number.
- The top-bar production total gains the production symbol in front of the digits and keeps the plus: `+⚒1,530`, suffix `/turn`. There is no `$` on that readout today. This is an added mark, not a replacement of a dollar sign.
- The mercenary token keeps `$` ([`MERCENARY_BADGE_TEXT`](../src/renderer/rendering/mercenaryBadgeDrawing.ts)). Real-money readouts keep `$`: [`src/shared/standings.ts`](../src/shared/standings.ts) and [`src/shared/openRouterModelDisplay.ts`](../src/shared/openRouterModelDisplay.ts). Turn-report sentences and commander-prompt sentences stay in words. In [`formatCreditsTooltip`](../src/shared/mercenaryRules.ts), prefix the three bare amounts (balance, upkeep, this turn's hire orders). Leave the closing sentence that already says "20 credits" as it is.
- A hire-only map button swaps the shared button face and border. Resting face is `var(--button-border)`, resting border and label are `var(--button-bg)`. Hover face is `var(--button-bg)`, hover border is `var(--button-border)`, hover label is `var(--button-text)`. Hire buttons are never selected. Do not add a selected rule for them, and do not change `.build-entry-btn.selected`.
- Marker tips, exactly: `Hire Units` on a hire-only button, `Build/Hire Units` on a build button whose hex is in the human hire set, `Build Units` on every other build button. These replace the long sentences. They do not get appended to them. Choose the build tip from `hireHexes.has(h3)` inside `syncBuildEntryButton`. Do not call `getHexHireView` while building markers. A build hex stays in that set when it has a pending hire order or a raise option that no longer fits this turn's remaining capacity, and the popup can still open as build-only in that case. That approximation is accepted.
- The hex tooltip (`#hex-tooltip`) uses the existing [`placeAnchoredPopupElement`](../src/renderer/chrome/placeAnchoredPopup.ts) after it is visible. Preferred point is the pointer plus `TOOLTIP_OFFSET_PX`. Each edge stops at the window. A tooltip larger than the window sits at 0 on that axis. It may cover the top bar, console, or minimap. Do this in the same turn as the DOM write. Do not defer it with `requestAnimationFrame`. Do not use the control-tip flip in [`placeTip`](../src/renderer/chrome/controlTooltip.ts). Do not add a resize listener. Leave `#order-block-tooltip`, `#order-slower-tooltip`, `#control-tooltip`, and `#unit-origin-tooltip` on their current placement.

## Formatters

New [`src/shared/economySymbols.ts`](../src/shared/economySymbols.ts):

- `PRODUCTION_CAPACITY_SYMBOL`: `⚒` plus U+FE0E.
- `CREDITS_SYMBOL`: `¤`.
- `formatProductionCapacityAmount(formattedNumber: string): string` returns the production symbol plus that string. The caller keeps its own grouping (`toLocaleString()`, `toLocaleString('en-US')`, or a raw integer). A zero stays zero. Do not substitute another word for `0`.
- `formatCreditsAmount(formattedNumber: string): string` does the same with `¤`.
- `formatCompactHireCost(fee: number, upkeep: number): string` returns the credits-only compact price, without parentheses. Integers, no grouping. Extra is `fee - upkeep`. For fee 3 and upkeep 3 the visible text is `¤3/t`. For fee 6 and upkeep 3 the visible text is `¤3 + ¤3/t`.
- `formatCompactRaiseCost(unitCost: number, fee: number, upkeep: number): string` returns the production symbol, the unit cost, ` + `, then `formatCompactHireCost`. For 20, 3, and 3 the visible text is `⚒20 + ¤3/t`. For 20, 6, and 3 the visible text is `⚒20 + ¤3 + ¤3/t`.

## Phase 1 — Symbols

Create the module and [`src/shared/economySymbols.test.ts`](../src/shared/economySymbols.test.ts). Assert:

- `formatProductionCapacityAmount('1,530')` equals `PRODUCTION_CAPACITY_SYMBOL` plus `1,530`.
- `formatCreditsAmount('120')` equals `CREDITS_SYMBOL` plus `120`.
- `formatCompactHireCost(3, 3)` equals `CREDITS_SYMBOL` plus `3/t`.
- `formatCompactHireCost(6, 3)` equals `CREDITS_SYMBOL`, `3 + `, `CREDITS_SYMBOL`, `3/t`.
- `formatCompactRaiseCost(20, 3, 3)` equals `PRODUCTION_CAPACITY_SYMBOL`, `20 + `, then `formatCompactHireCost(3, 3)`.
- `formatCompactRaiseCost(20, 6, 3)` equals `PRODUCTION_CAPACITY_SYMBOL`, `20 + `, then `formatCompactHireCost(6, 3)`.

No other file imports the module yet.

Verify: `npm run build:main`, then `node --test dist/shared/economySymbols.test.js`.

## Phase 2 — Production symbol

Replace the production `$` prefix with `formatProductionCapacityAmount` applied to the number text only. Leave the surrounding words, slashes, and turn suffixes as they are. The top bar is the exception listed last: it has no `$` today.

- [`src/renderer/gameplay/productionOverlayHelpers.ts`](../src/renderer/gameplay/productionOverlayHelpers.ts): the capacity text in `formatProductionQueueAwareLabel`, and the non-human branch of `formatProductionLabelForHumanControllerOnly`. A label such as `$1,530 / 3t` becomes the symbol plus `1,530 / 3t`.
- [`src/renderer/renderer.ts`](../src/renderer/renderer.ts): the unexplored-hex label near the production-overlay draw (the `` `$${...}` `` fallback). No other edit in this file in this phase.
- [`src/renderer/gameplay/hireEntryMarkers.ts`](../src/renderer/gameplay/hireEntryMarkers.ts): the capacity text passed into `formatHireEntryLabel`. The label stays `{capacity} · Hire`. Do not add a second symbol inside `formatHireEntryLabel`.
- [`src/renderer/gameplay/buildQueuePopup.ts`](../src/renderer/gameplay/buildQueuePopup.ts): the Production value and the Queue cost.
- [`src/renderer/gameplay/buildQueueMultiPopup.ts`](../src/renderer/gameplay/buildQueueMultiPopup.ts): the Production value and both Queue cost strings.
- [`src/renderer/map/terrainTooltipHtml.ts`](../src/renderer/map/terrainTooltipHtml.ts): the Production value.
- [`src/shared/selectionPanelSummary.ts`](../src/shared/selectionPanelSummary.ts): the production chip. `$1,094/turn` becomes the symbol plus `1,094/turn`.
- [`src/shared/mercenaryRules.ts`](../src/shared/mercenaryRules.ts): `formatRaiseCapacityValue`, so it reads the symbol, `12 of `, the symbol, `40 this turn`.
- [`src/shared/gameMapList.ts`](../src/shared/gameMapList.ts): `formatUnitCostLabel` (the symbol plus `20`, still with no thousands separator) and `formatAdvancedTechLine` (`Advanced tech: `, the symbol, `60+ hexes`). The Advanced line is an urban-cell threshold that uses this same prefix today. Both start-screen marks change together.
- [`src/shared/topBarStats.ts`](../src/shared/topBarStats.ts): production becomes `+` plus `formatProductionCapacityAmount(formatCount(...))`. The suffix stays `/turn`.

Update these tests. Build the expected text from `PRODUCTION_CAPACITY_SYMBOL`.

- [`src/shared/gameMapList.test.ts`](../src/shared/gameMapList.test.ts)
- [`src/shared/selectionPanelSummary.test.ts`](../src/shared/selectionPanelSummary.test.ts), the chip that is now `$1,094/turn`
- [`src/shared/topBarStats.test.ts`](../src/shared/topBarStats.test.ts), the production field that is now `+1,530`. Leave `credits: ''` and `creditsSuffix: ''` as they are.

Update the production sentences in:

- [`doc/ux/map-surface.md`](../doc/ux/map-surface.md) (plain `$N`, and the dollars-per-turn wording)
- [`doc/ux/minimap.md`](../doc/ux/minimap.md) (plain `$N`)
- [`doc/ux/hex-tooltips.md`](../doc/ux/hex-tooltips.md) (the Production bullet that says "dollars per turn")
- [`doc/ux/selection-panel.md`](../doc/ux/selection-panel.md) (`"$94/turn"`)
- [`doc/ux/top-bar.md`](../doc/ux/top-bar.md) (Production is `+N`)
- [`doc/ux/new-game-dialog.md`](../doc/ux/new-game-dialog.md) (`Advanced tech: $N+ hexes` and the price example `12 · $20`)
- [`doc/how-to-play.md`](../doc/how-to-play.md): the Advanced-tech sentence, the italic production-capacity caption, and the image alt text on the same figure. Leave the mercenary-token `$` sentence. Do not edit the png.
- The live-app top-bar paragraph in [`doc/ui-style-guide.md`](../doc/ui-style-guide.md)

Leave unchanged: [`src/renderer/rendering/mercenaryBadgeDrawing.ts`](../src/renderer/rendering/mercenaryBadgeDrawing.ts), [`src/shared/standings.ts`](../src/shared/standings.ts), [`src/shared/openRouterModelDisplay.ts`](../src/shared/openRouterModelDisplay.ts), [`doc/combat-rules-v3.md`](../doc/combat-rules-v3.md), the mercenary-badge paragraph in [`doc/ui-style-guide.md`](../doc/ui-style-guide.md), commander prompt text, turn-report sentences, and `formatHireOptionLabel`. That last function still contains `$` until the compact-price phase.

Verify: `npm run build:main`, then `node --test dist/shared/gameMapList.test.js dist/shared/selectionPanelSummary.test.js dist/shared/topBarStats.test.js`. The test title in [`src/main/rendererProductionAirConsolidation.test.ts`](../src/main/rendererProductionAirConsolidation.test.ts) that mentions `$0` is a description of zero-capacity labels. Leave that title.

## Phase 3 — Credits symbol on balances

Prefix displayed credit amounts. Do not change payroll math.

- [`formatCreditsUpkeepSuffix`](../src/shared/mercenaryRules.ts): `−¤3/turn` when upkeep is above 0. Empty when upkeep is 0. Keep the existing minus character `\u2212`.
- [`formatTopBarStatParts`](../src/shared/topBarStats.ts): the credits number goes through `formatCreditsAmount`. An absent economy still yields `''` for both credits fields.
- [`formatCreditsTooltip`](../src/shared/mercenaryRules.ts): put `¤` before the balance, the upkeep, and this turn's hire-order cost. Leave the sentence that names `CREDITS_PER_ITEM` and the word "credits".
- [`formatMercenaryTooltipValue`](../src/shared/mercenaryRules.ts): `upkeep ¤3 per turn`.
- [`appendFunds`](../src/renderer/gameplay/hirePanel.ts): Credits `¤120`, Upkeep `¤3 / turn`, Hire orders `¤12` when that line is shown. The warning sentence stays. Use `String(...)` as today, with no thousands separator.

Update the Credits sentence in [`doc/ux/top-bar.md`](../doc/ux/top-bar.md) and the Hire-panel funds wording in [`doc/ux/build-popup.md`](../doc/ux/build-popup.md). Update [`src/shared/unitOriginTooltipText.test.ts`](../src/shared/unitOriginTooltipText.test.ts): it looks for `upkeep 3 credits per turn`. The new substring is `upkeep `, `CREDITS_SYMBOL`, `3 per turn`.

Verify: `npm run build:main`, then `node --test dist/shared/unitOriginTooltipText.test.js dist/shared/topBarStats.test.js`.

## Phase 4 — Compact hire and rehire prices

Do not add fields to [`HireOrderView`](../src/shared/ipc/mercenaryTypes.ts). Do not change [`hireOrderFee`](../src/main/gameDb/mercenaryEconomyRead.ts), [`orderView`](../src/main/gameActions/hireOrders.ts), or [`query_mercenaries`](../src/main/tools/mercenaryTools.ts). The hex tool spreads the hire view, so a new field would reach the model. The stored `fee` is already the tech-adjusted charge.

- `formatHireOptionLabel` returns `Infantry (⚒20 + ¤3/t)` via `formatCompactRaiseCost(option.unitCost, option.fee, option.upkeep)`, wrapped in parentheses. A raise's fee equals its upkeep, so the extra term is omitted.
- A rehire row's fee span in [`hirePanel.ts`](../src/renderer/gameplay/hirePanel.ts) shows parentheses around `formatCompactHireCost(unit.fee, unit.upkeep)`. A rehire's fee is twice its upkeep, so the span reads `(¤3 + ¤3/t)` when both numbers are 3 and 6. The unit name stays where it is.
- `formatHireOrderLabel` recovers the per-unit figures from the order it already has, then uses the same compact helpers:
  - A raise: per-unit fee is `Math.trunc(order.fee / order.count)`, and per-unit upkeep is that same number, because a raise fee is one turn of upkeep times the count. Production cost is `unitCostFor(order.unitType)` from [`src/shared/gameRules.ts`](../src/shared/gameRules.ts). The label is `Raise 2 Infantry (⚒20 + ¤3/t)`. The count stays outside the parentheses.
  - A rehire: per-unit upkeep is `Math.trunc(order.fee / MERCENARY_REHIRE_FEE_MULTIPLIER)`. The label is `Rehire {name} (¤3 + ¤3/t)` via `formatCompactHireCost(order.fee, upkeep)` when the fee is 6 and the upkeep is 3. The one-time `¤3` is the extra turn, not the full fee of 6.
  - `count` is at least 1. Do not throw when a remainder is non-zero. `Math.trunc` is enough.
- Assert `formatHireOptionLabel` and `formatHireOrderLabel` in a new [`src/shared/mercenaryRules.test.ts`](../src/shared/mercenaryRules.test.ts). One raise example and one rehire example. Build the expected text from the symbol constants and, for the raise, from `unitCostFor('infantry')` so a different active-map infantry price still matches. The compact-helper assertions from the symbols phase stay in [`src/shared/economySymbols.test.ts`](../src/shared/economySymbols.test.ts).

Leave the commander briefing tables in [`src/main/openRouter/briefingSectionsMercenaries.ts`](../src/main/openRouter/briefingSectionsMercenaries.ts) in words.

Verify: `npm run build:main`, then `node --test dist/shared/mercenaryRules.test.js dist/shared/economySymbols.test.js dist/main/mercenaryTurnFlow.test.js`. The turn-flow test checks `pendingOrders[0].fee`. That assertion stays.

## Phase 5 — Hire panel layout

In [`renderHirePanel`](../src/renderer/gameplay/hirePanel.ts) and its helpers, the Hire panel becomes:

1. Close row.
2. Hex caption, then a `0.5em` spacer, the same empty `div` with `style.height = '0.5em'` the build panel uses. Do not add a CSS class for it.
3. The tech line from `formatProducedUnitTechLineHtml` in [`src/shared/featureIconHtml.ts`](../src/shared/featureIconHtml.ts), with `techBonusEnabled: S.gameState?.techBonusEnabled === true` and `baselineUrbanHexCount: baselineUrbanHexCountForStrategicHex(h3Index)` imported from [`src/renderer/rendererTacticalHydration.ts`](../src/renderer/rendererTacticalHydration.ts), the same import [`buildQueuePopup.ts`](../src/renderer/gameplay/buildQueuePopup.ts) uses. When that function returns null, omit the line and its spacer. When it returns HTML, add the `0.5em` spacer under it.
4. Labeled lines, each `<strong>Label:</strong> value`, with a `0.5em` spacer after each line that is shown: Credits, Upkeep, Hire orders only when pending fees are above 0, Capacity only when `view.raise` is set. Capacity uses `formatRaiseCapacityValue`. It is no longer inside the raise section. When raising is blocked, or when nothing fits the remaining capacity, `view.raise` is null and the view has no capacity numbers. Omit the line. Do not add fields to the hire view to recover them.
5. The short-credits warning when the existing comparison is true. It stays a note, with no extra spacer of its own.
6. The raise controls when `view.raise` is set: the type select, count, and Hire button, with no `Raise` heading. The blocked-raise sentence stays when raising is blocked.
7. Neutral units, then orders this turn, with their existing headings.
8. Remove the arrival note. Delete `HIRE_ARRIVAL_NOTE` and `RAISE_SECTION_TITLE` from [`mercenaryRules.ts`](../src/shared/mercenaryRules.ts) once nothing imports them. The arrival rule in the commander prompt stays.

Leave the rehire fee text and the option labels from the previous phase as they are.

Update the Hire panel bullet in [`doc/ux/build-popup.md`](../doc/ux/build-popup.md) so it describes this order, the tech line, and the absence of the arrival note and the Raise heading.

Verify: `npm run check:renderer-types`. There is no DOM test harness. Read `renderHirePanel` and confirm the order above before reporting the phase done.

## Phase 6 — Hire-only button and marker tips

In [`static/overlayChrome.css`](../static/overlayChrome.css), after `.build-entry-btn.has-capacity`:

- `.build-entry-btn.hire-entry-btn`: background `var(--button-border)`, border-color `var(--button-bg)`, color `var(--button-bg)`.
- `.build-entry-btn.hire-entry-btn:hover`: background `var(--button-bg)`, border-color `var(--button-border)`, color `var(--button-text)`.

The hover rule has to set the background. `.build-entry-btn.hire-entry-btn` is more specific than `button:hover`, so a missing hover background would leave the light face in place and the global blue hover would never show. With the hover rule above, the light face is the resting state and the hover state uses the ordinary teal face, light border, and white label.

Replace `hireEntryTooltipText` in [`src/renderer/chrome/hireTooltipText.ts`](../src/renderer/chrome/hireTooltipText.ts) with `Hire Units`. Replace `buildEntryTooltipText` in [`src/renderer/chrome/controlTooltipText.ts`](../src/renderer/chrome/controlTooltipText.ts) with a function `buildEntryTooltipTextFor(canHire: boolean)` returning `Build/Hire Units` or `Build Units`. In the build-button HTML in [`renderer.ts`](../src/renderer/renderer.ts), `canHire` is `hireHexes.has(r.h3)`. That set is already computed in `syncBuildEntryButton`. A hire-only button keeps `hireEntryTooltipText`. Do not change aria-labels. The new sentences contain no quotes, so the existing double-quoted `data-control-tooltip` attribute can take them as they are.

Update [`doc/ux/control-tooltips.md`](../doc/ux/control-tooltips.md) (the build-marker sentence and the hire-marker anchor), the marker sentence in [`doc/ux/build-popup.md`](../doc/ux/build-popup.md), and the button-face row plus the Hire-only marker sentence in [`doc/ui-style-guide.md`](../doc/ui-style-guide.md). The style guide today says a Hire-only marker uses the same teal entry, and the button table says every button uses the Ready teal with white text. Add the hire-only resting colors to that table. Leave the +/− buttons and the message-popup tabs as that table already describes them.

Verify: `npm run check:renderer-types`.

## Phase 7 — Hex tooltip inside the window

In [`showTerrainTooltip`](../src/renderer/entryCallbacks.ts): set the HTML, paint the swatches, remove `hidden`, then call `placeAnchoredPopupElement(el, clientX, clientY)`. Delete the two lines that set `left` and `top` from the pointer plus the offset alone. `placeAnchoredPopupElement` returns without writing while the element still has class `hidden`, so the class has to be removed first. Do not read `data-x` or `data-y`. The follow path already calls `showTerrainTooltip` on pointer move, so the clamp runs again there. `#hex-tooltip` is `position: fixed` in `#canvas-container`, the same arrangement as `#build-popup`.

Add one sentence to the behavior section of [`doc/ux/hex-tooltips.md`](../doc/ux/hex-tooltips.md): the tooltip opens `TOOLTIP_OFFSET_PX` (12) below and to the right of the pointer, then shifts so it stays inside the window (`placeAnchoredPopup`), and it may cover the top bar, the console, or the minimap. A tooltip taller or wider than the window sits against the top and left. Add `src/renderer/chrome/placeAnchoredPopup.ts` to that document's Code Entry Points.

Verify: `npm run check:renderer-types`.

## Phase 8 — Full check

Run `npm test`. Fix failures that these phases caused. Leave unrelated failures unedited and report them. In the report, name every `doc/` file updated. Do not recapture screenshots.
