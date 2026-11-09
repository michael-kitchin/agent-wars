
# Auto-start AI and Minimap Outline

> **For the implementing agent:** Follow this plan from top to bottom, one phase at a time. Each phase is verifiable before the next one starts. When a check fails, stop and report the command, the actual output, and the expected output. Do not make a check pass by weakening the test or the smoke check. Do not commit or push. Do not implement anything this plan does not name.

**Goal:** Add an Auto-start AI checkbox beside Fog of war, and on a successful start either turn opponent planning on for turn 1 or turn it off and open the Opponent tab. Paint the minimap's inner frame the same opaque slate as the expand button. Put the main map's + and − buttons back at the bottom-right, and shift the scale and attribution left to make room.

**Architecture:** The checkbox is client-only. It is not a match setting and is not sent in the `newGame` payload. A pure function in `src/shared/` decides the two outcomes, and a small renderer helper applies that decision after a successful start. The minimap change is a CSS token swap plus a smoke check that the frame matches the expand button's computed background. The zoom buttons are Leaflet's zoom control, added to the bottom-right corner after the scale. That corner is already a horizontal row, and Leaflet inserts a bottom control at the front of the corner, so the existing row places the buttons on the right and shifts the scale and attribution left. The lower-left corner is not used: the selection panel lives there.

**Tech stack:** TypeScript under `src/`, markup in `static/index.html`, chrome CSS, Node `node:test` for `src/shared/`, and the existing UI smoke scripts.

## Locked decisions

- Label text is `Auto-start AI`. Element id is `new-game-auto-start-checkbox`. It sits on the same row as Fog of war, immediately to its right, and wraps only if the row is too narrow.
- It is checked in the markup. `resetNewGameOptionControls` checks it in the same assignment that checks Fog of war, so it follows every caller of that reset: opening the overlay, including game over and New game from the menu, and a refresh that shows the overlay. A refresh that returns before that reset, including a live match waiting under the screen, leaves the checkbox as the player set it. The starting month is still not part of that reset.
- It is not added to `NewGameOptionChoices` or the `newGame` IPC payload.
- Read both facts at the moment Start game or New game is clicked, before the `await`: the checkbox is checked, and `#openrouter-run-btn` exists and is not disabled. A missing checkbox counts as unchecked. A missing or disabled Run button counts as not enabled.
- After the new match is installed and the overlay has closed:
  - Checked and Run enabled: set `S.runButtonOn` to true and `aria-pressed` to `true`. Do not toggle. Call `startBackgroundRequestIfAllowed` once. Leave the console on whatever tab and collapsed state it already had.
  - Otherwise: set `S.runButtonOn` to false and `aria-pressed` to `false`. Do not start planning. Expand the console on the Opponent tab (`console-tab-opponent`). This is not a click on that tab: if the tab is already selected, the console stays expanded.
- In both success branches, `await stopOpponentPlanning('run_off')` before changing the flag and before any new planning request. The await matters: the stop cancels in-flight model work, and starting the next request before that cancel returns can cancel the new request. The stop bumps the renderer sequence first, so a late result from the previous match cannot set `eventDrivenInitialConsultationDone` or apply orders. Do not use the cancel reason `new_game` here. That reason advances match generation, and the new match already exists. Do not call the stop on a failed start.
- If Start returns early (`regionalStartBlocked`, missing `newGame` API) or throws, do not change Run and do not open the Opponent tab. The dialog stays open.
- The minimap change is the 2 px inner frame on `.minimap-overview::after`, today `var(--chrome-border)` (`#5a7090`). It becomes `var(--chrome-bg)` (`#1b2838`), the face of `.minimap-tabs-toggle`. Width stays 2 px. The zoomed-in viewport rectangle already uses `--chrome-bg` and stays as it is.
- Tooltip, copied into the markup, `controlTooltipText.ts`, and `doc/ux/control-tooltips.md`: `Leave this checked to turn opponent planning on when the match starts, when an API key and a model are already set. Uncheck it, or start without them, to open the Opponent tab with planning off.`
- The + and − buttons go on the main map only, at its bottom-right, 12 px from the map's right and bottom edges (`MAP_CHROME_INSET`). The scale stays on the same bottom line, immediately left of the buttons, and the attribution stays immediately left of the scale. The corner's existing 6 px gap is the space between those three. The minimap does not get zoom buttons.
- This fits the existing corner, so the lower-left fallback is not implemented. `#main-map .leaflet-bottom.leaflet-right` is already a row with `flex-direction: row-reverse` and `align-items: flex-end`. Leaflet inserts a bottom control before the corner's first child (`addTo` in `static/vendor/leaflet/leaflet.js`). Adding the zoom control after the scale makes it the first child, and the row places that first child on the right.
- Do not set the map option `zoomControl: true`. That would add a second control at the top-left. Add `control.zoom({ position: 'bottomright' })` after the scale control.
- Do not change `zoomDelta` (0.5), wheel zoom, Shift-drag zoom, or double-click zoom. One click is half a level. Two clicks of + are one level, which is what [doc/how-to-play.md](doc/how-to-play.md) already says. Leave that file unchanged.
- Do not move the toast band. It stays against the map's right edge. The buttons are not a top-edge obstacle.
- Do not hide the buttons during New game or Game over. The scale stays visible then, and the buttons sit in that same corner. The setup panel is at the top-left and does not cover them.
- Do not narrow the selection panel. On a short map it can cover the scale, and it can cover these buttons the same way. It already draws above the scale. When the panel is closed, or the map is wider than the panel, the buttons stay clear at the right inset.
- The buttons use the current button face, not Leaflet's white bar and not the retired navy zoom rules in `.spec/completed`. Each is a 30 px square: background `--button-bg`, text `--button-text`, border `--button-border`, hover `--button-bg-hover`. At a zoom limit Leaflet adds `leaflet-disabled`; that face is `--button-off-bg` with `--button-off-text`, and hover does not brighten it. Keep Leaflet's `+` and `−` glyphs and its `Zoom in` and `Zoom out` titles. Do not add a second tooltip.

## Global constraints

- Follow `AGENTS.md` and `.cursor/rules/`. Never commit or push.
- No plan, phase, or workflow identifiers in code, comments, tests, `doc/`, or configuration. Phase names in this file stay in this file.
- Orienting comments on every new function, type, and module-level constant, in the style of [`src/shared/consoleTabState.ts`](src/shared/consoleTabState.ts).
- Do not edit `static/renderer.js` by hand. Regenerate it with `npm run build:renderer` when a phase changes renderer TypeScript.
- Shell is Windows PowerShell at `F:\Projects\Personal\agent-wars-public`. Do not chain commands with `&&`.
- Keep each file's existing line endings.
- `npm test` already runs lint, the naming check, renderer typecheck, and `src/shared/` tests. A new `*.test.ts` beside a `src/shared/` module is picked up after `npm run build:main`. Renderer modules are not in that test runner, so anything that must be unit-tested belongs in `src/shared/`.

## Files

- Modify: [`static/shellChrome.css`](static/shellChrome.css) (minimap frame, then zoom-button face)
- Modify: [`src/renderer/map/worldLeafletMap.ts`](src/renderer/map/worldLeafletMap.ts) (add the bottom-right zoom control; leave the minimap without one)
- Modify: [`scripts/ui-smoke/ui-smoke-checks.cjs`](scripts/ui-smoke/ui-smoke-checks.cjs) and [`scripts/ui-smoke/ui-smoke-map-chrome-checks.cjs`](scripts/ui-smoke/ui-smoke-map-chrome-checks.cjs)
- Modify: [`doc/ux/minimap.md`](doc/ux/minimap.md), [`doc/ui-style-guide.md`](doc/ui-style-guide.md), [`doc/ux/map-surface.md`](doc/ux/map-surface.md), [`doc/ux/input-map.md`](doc/ux/input-map.md), [`doc/ux/selection-panel.md`](doc/ux/selection-panel.md)
- Modify: [`static/index.html`](static/index.html), [`static/newGameChrome.css`](static/newGameChrome.css)
- Modify: [`src/renderer/gameplay/newGameOptionsUi.ts`](src/renderer/gameplay/newGameOptionsUi.ts)
- Modify: [`src/renderer/chrome/controlTooltipText.ts`](src/renderer/chrome/controlTooltipText.ts)
- Modify: [`scripts/ui-smoke/ui-smoke-new-game-checks.cjs`](scripts/ui-smoke/ui-smoke-new-game-checks.cjs)
- Create: [`src/shared/startMatchAiChoice.ts`](src/shared/startMatchAiChoice.ts) and [`src/shared/startMatchAiChoice.test.ts`](src/shared/startMatchAiChoice.test.ts)
- Modify: [`src/shared/consoleTabState.ts`](src/shared/consoleTabState.ts) and [`src/shared/consoleTabState.test.ts`](src/shared/consoleTabState.test.ts)
- Modify: [`src/renderer/chrome/consoleFrame.ts`](src/renderer/chrome/consoleFrame.ts)
- Create: [`src/renderer/gameplay/newGameAiStart.ts`](src/renderer/gameplay/newGameAiStart.ts)
- Modify: [`src/renderer/gameplay/newGame.ts`](src/renderer/gameplay/newGame.ts)
- Docs in the same phase as the behavior they describe: [`doc/ux/new-game-dialog.md`](doc/ux/new-game-dialog.md), [`doc/ux/control-tooltips.md`](doc/ux/control-tooltips.md), [`doc/ux/modes-and-transitions.md`](doc/ux/modes-and-transitions.md), [`doc/ux/opponent-tab-commander.md`](doc/ux/opponent-tab-commander.md), [`doc/ux/console.md`](doc/ux/console.md), [`doc/region-vs-region.md`](doc/region-vs-region.md)

---

### Phase 1: Minimap frame

Independent of the checkbox. Verified by the smoke check below.

In [`static/shellChrome.css`](static/shellChrome.css), change `.minimap-overview::after` from `border: 2px solid var(--chrome-border);` to `border: 2px solid var(--chrome-bg);`. Update the comment above `.minimap-overview` so it says the inner frame uses the expand control's background.

In [`scripts/ui-smoke/ui-smoke-checks.cjs`](scripts/ui-smoke/ui-smoke-checks.cjs), beside `minimapBorderWidth`, also read `getComputedStyle(overview, '::after').borderTopColor` and the background color of `#map-mode-tabs-toggle`. Put both on the probe object. Document them in the probe comment.

In the `minimap-overview-border` check in [`scripts/ui-smoke/ui-smoke-map-chrome-checks.cjs`](scripts/ui-smoke/ui-smoke-map-chrome-checks.cjs), keep the `2px` width check. Also fail when the frame color is missing or differs from the toggle's background color. The failure message names both colors.

Update the inner-edge sentence in [`doc/ux/minimap.md`](doc/ux/minimap.md) and the Minimap bullet in [`doc/ui-style-guide.md`](doc/ui-style-guide.md): the 2 px inner frame is `--chrome-bg`, the same opaque color as the expand control, read from `.minimap-overview::after`. The viewport rectangle sentence stays.

Verify:

```powershell
npm run ui:smoke -- --label minimap-frame
```

Expected: the `minimap-overview-border` line is `PASS`, and the summary has `0 failed`. Do not click in the smoke windows.

### Phase 2: Zoom buttons

Independent of the checkbox. Depends on nothing in Phase 1, but it edits [`static/shellChrome.css`](static/shellChrome.css) and the map-chrome smoke file after Phase 1, so do it second. The Phase 1 border check must still pass.

In [`src/renderer/map/worldLeafletMap.ts`](src/renderer/map/worldLeafletMap.ts), after the scale control is added to the main map, add Leaflet's zoom control at `bottomright`. Leave `zoomControl: false` on both map constructors. Update the comment that says the map has no +/− control: the main map has one at the bottom-right; the minimap does not. Do not change zoom limits, `zoomDelta`, wheel handling, or `doubleClickZoom.disable()`.

In [`static/shellChrome.css`](static/shellChrome.css), keep the bottom-right corner's 12 px inset, row, and 6 px gap. Add rules scoped to `#main-map .leaflet-control-zoom` for the locked button face, including the 30 px size and the disabled face. The selector must not match the minimap. Update the corner comment so it names the zoom buttons as the rightmost item, then the scale, then the attribution.

In [`scripts/ui-smoke/ui-smoke-checks.cjs`](scripts/ui-smoke/ui-smoke-checks.cjs), add a probe flag that is true when `#minimap .leaflet-control-zoom` exists. Document it next to the other probe fields.

In [`scripts/ui-smoke/ui-smoke-map-chrome-checks.cjs`](scripts/ui-smoke/ui-smoke-map-chrome-checks.cjs):

- Change `scale-and-attribution-bottom-right` so the scale is no longer required to touch the right inset. Its bottom stays on that inset. Its right edge is the zoom control's left edge minus the 6 px gap, within `near` (1 px). The attribution stays left of the scale on that same bottom line. Add `#main-map .leaflet-control-zoom` to that check's `needs`.
- Add `zoom-buttons-bottom-right` on `PLACEMENT_SCENES` and `NEW_GAME_SCENES`. It fails when the control is missing, when the minimap probe says the minimap has a zoom control, or when the control's right and bottom are not 12 px in from `#canvas-container`. `needs` includes `#canvas-container` and `#main-map .leaflet-control-zoom` only. A `needs` entry must exist on the page, so the minimap control is not a `needs` entry.

Search `doc/` for `no +/−` and `+/− zoom`, skipping `.spec/`. Update each current sentence:

- [`doc/ux/map-surface.md`](doc/ux/map-surface.md): the scale and attribution are left of the +/− buttons, and the buttons are 12 px from the map's bottom-right. Wheel and Shift-drag still zoom. Double-click still does not. The buttons zoom the preview while the new-game overlay is open.
- [`doc/ux/input-map.md`](doc/ux/input-map.md): one row for a click on + or −. It zooms the main map by `zoomDelta`. It does not select or order.
- [`doc/ui-style-guide.md`](doc/ui-style-guide.md): the live-app sentence and the Minimap bullet no longer say the map has no +/− buttons. Say the buttons are the teal 30 px squares at the map's bottom-right.
- [`doc/ux/selection-panel.md`](doc/ux/selection-panel.md): the overlap sentence includes the zoom buttons with the scale.

Leave [`doc/how-to-play.md`](doc/how-to-play.md) as it is. Do not change toast placement or [`src/shared/mapChromePlacement.ts`](src/shared/mapChromePlacement.ts).

Verify:

```powershell
npm run check:renderer-types
npm run ui:smoke -- --label zoom-buttons
```

Expected: typecheck prints `check-renderer-typecheck: ok`. `zoom-buttons-bottom-right`, `scale-and-attribution-bottom-right`, and `minimap-overview-border` are `PASS`, and the summary has `0 failed`. Do not click in the smoke windows.

### Phase 3: Checkbox, reset, and layout

Verifiable with the dialog open. Start game still ignores the checkbox until Phase 5. Say that in the docs you touch in this phase, in one plain sentence, so the docs are not ahead of the code.

Markup, replacing the current Fog of war label in [`static/index.html`](static/index.html):

```html
<div class="new-game-checks">
  <label class="new-game-check" for="new-game-fog-checkbox"><input type="checkbox" id="new-game-fog-checkbox" checked data-control-tooltip="Leave this checked to hide places and enemy units you have not seen. Uncheck it to show the whole map for the next match." /> Fog of war</label>
  <label class="new-game-check" for="new-game-auto-start-checkbox"><input type="checkbox" id="new-game-auto-start-checkbox" checked data-control-tooltip="Leave this checked to turn opponent planning on when the match starts, when an API key and a model are already set. Uncheck it, or start without them, to open the Opponent tab with planning off." /> Auto-start AI</label>
</div>
```

CSS in [`static/newGameChrome.css`](static/newGameChrome.css): `.new-game-checks` spans `grid-column: 1 / -1`, is a wrapping flex row, `align-items: center`, `column-gap: 16px`, `row-gap: 8px`, `margin-top: 12px`. Move the top margin off `.new-game-check` (`margin-top: 0`) so the pair keeps the gap Fog of war has today.

In [`src/renderer/gameplay/newGameOptionsUi.ts`](src/renderer/gameplay/newGameOptionsUi.ts):

- Add `NEW_GAME_AUTO_START_CHECKBOX_ID = 'new-game-auto-start-checkbox'` and a private lookup.
- In `resetNewGameOptionControls`, set that box to checked when it is present. Update the function comment: Fog of war and Auto-start AI are both checked; the bonuses stay Low; the month is unchanged.
- Correct the module comment that calls Fog of war the only on/off option. Auto-start AI is the second on/off control, and it is not part of `readNewGameOptionChoices`.
- Do not add a field to `NewGameOptionChoices`.

Add `autoStartCheckboxTooltipText` in [`src/renderer/chrome/controlTooltipText.ts`](src/renderer/chrome/controlTooltipText.ts) with the locked sentence, next to `fogCheckboxTooltipText`, with the same comment shape. The page reads the sentence from the markup attribute, as Fog of war does.

Extend the `new-game-rules` smoke check so it still requires Fog of war under the starting month, and also requires `#new-game-auto-start-checkbox` shown, on nearly the same `y` as Fog of war, and with a greater `x`. Add the new id to that check's `needs`.

Docs for this phase only, matching the code that exists now:

- [`doc/ux/new-game-dialog.md`](doc/ux/new-game-dialog.md): the pair on one row; both are checked by the same reset, including when the overlay opens and when a refresh shows it, and a refresh that returns before that reset leaves them as set; Auto-start AI is not sent with the match; Start does not read it yet. Add the id to Code Entry Points.
- [`doc/ux/control-tooltips.md`](doc/ux/control-tooltips.md): the locked sentence under Fog of war.
- [`doc/ux/modes-and-transitions.md`](doc/ux/modes-and-transitions.md): the Rules sentence names both checkboxes.
- [`doc/region-vs-region.md`](doc/region-vs-region.md): one clause that Auto-start AI sits to the right of Fog of war and is checked when the dialog opens. Do not describe start behavior yet.
- Comments in [`src/renderer/core/uiState.ts`](src/renderer/core/uiState.ts) and [`src/renderer/gameplay/newGame.ts`](src/renderer/gameplay/newGame.ts) that say the reset restores Fog of war: mention Auto-start AI as well.

Verify:

```powershell
npm run check:renderer-types
npm run ui:smoke -- --label auto-start-checkbox
```

Expected: typecheck prints `check-renderer-typecheck: ok`. Smoke `new-game-rules` is `PASS` and the summary has `0 failed`.

### Phase 4: Decisions with tests

No change to what Start does yet. Verified by `npm test` without opening the app.

Create [`src/shared/startMatchAiChoice.ts`](src/shared/startMatchAiChoice.ts):

```ts
export interface StartMatchAiInput {
  readonly autoStartChecked: boolean;
  readonly runEnabled: boolean;
}

export interface StartMatchAiChoice {
  readonly runOn: boolean;
  readonly openOpponentTab: boolean;
}

export function chooseStartMatchAi(input: StartMatchAiInput): StartMatchAiChoice {
  if (input.autoStartChecked && input.runEnabled) {
    return { runOn: true, openOpponentTab: false };
  }
  return { runOn: false, openOpponentTab: true };
}
```

Orienting comments: the input is the click-time reading of the checkbox and of Run's enabled state. The result is what a successful start should do. `runOn` means set Run pressed and start turn-1 planning once. `openOpponentTab` means show the Opponent tab expanded and leave planning off. Checked plus enabled is the only `runOn` case. The other three combinations open the tab and leave planning off.

Tests in [`src/shared/startMatchAiChoice.test.ts`](src/shared/startMatchAiChoice.test.ts), using `node:test` and `node:assert/strict`, one assertion object per case:

- `{ autoStartChecked: true, runEnabled: true }` returns `{ runOn: true, openOpponentTab: false }`
- `{ autoStartChecked: true, runEnabled: false }` returns `{ runOn: false, openOpponentTab: true }`
- `{ autoStartChecked: false, runEnabled: true }` returns `{ runOn: false, openOpponentTab: true }`
- `{ autoStartChecked: false, runEnabled: false }` returns `{ runOn: false, openOpponentTab: true }`

In [`src/shared/consoleTabState.ts`](src/shared/consoleTabState.ts), add `expandedConsoleTabState(tabId: string): ConsoleTabState` returning `{ activeTabId: tabId, collapsed: false }`. Comment: this is how a successful start shows a tab. It does not use `nextConsoleTabState`, because a click on the selected tab collapses the console. Tests: the returned `collapsed` is false for a fresh id, and the function's result does not depend on a previous collapsed or selected state (call it twice with two ids and assert each result on its own).

Do not add `showConsoleTab` in this phase. Phase 5 adds it, so this phase does not leave an unused export.

Verify:

```powershell
npm test
```

Expected: exit 0. The new choice tests and the expanded-tab tests are in the run. `check:circular` is not part of `npm test`. If you run it yourself and see the two existing cycles through `src/main/tools/standingOrders.ts`, those are already there. A third cycle means stop.

### Phase 5: Apply the choice after a successful start

Depends on Phases 3 and 4. This is the behavior change.

In [`src/renderer/chrome/consoleFrame.ts`](src/renderer/chrome/consoleFrame.ts), export `showConsoleTab(tabId: string): void`. If `tabId` is not one of `CONSOLE_TABS`, `console.error` the id and return without changing `consoleState`. Otherwise `console.debug` the id, set `consoleState` from `expandedConsoleTabState`, and call the existing `applyConsoleState`. Do not call `nextConsoleTabState`.

Create [`src/renderer/gameplay/newGameAiStart.ts`](src/renderer/gameplay/newGameAiStart.ts). Two exports:

`readStartMatchAiInput(): StartMatchAiInput` reads `#new-game-auto-start-checkbox` (`checked === true`) and `#openrouter-run-btn` (present and `disabled === false`). `console.debug` the two booleans.

`applyStartMatchAiChoice(choice: StartMatchAiChoice, deps: { startPlanning: () => void; updateReadyButtonState: () => void }): Promise<void>`:

1. `console.debug` the choice.
2. `await stopOpponentPlanning('run_off')` from [`src/renderer/openRouter/openRouterRuntime.ts`](src/renderer/openRouter/openRouterRuntime.ts). This function catches a rejected cancel, logs it, and does not throw.
3. Set `rendererSharedState.runButtonOn` from `choice.runOn`.
4. Set `#openrouter-run-btn` `aria-pressed` to `true` or `false` when the button exists.
5. Call `deps.updateReadyButtonState()` so Ready and the opponent status sentence follow the flag.
6. If `choice.runOn`, call `deps.startPlanning()` once. This call stays after the await.
7. If `choice.openOpponentTab`, call `showConsoleTab('console-tab-opponent')`.

Do not call `startPlanning` when `runOn` is false. Do not call `showConsoleTab` when `openOpponentTab` is false. Do not simulate a click on Run. A click toggles, and Run may already be pressed from the previous match.

In the Start click handler in [`src/renderer/gameplay/newGame.ts`](src/renderer/gameplay/newGame.ts):

- Call `readStartMatchAiInput()` at the beginning of the click handler, before `regionalStartBlocked` returns and before the `await` of `newGame`. Hold that object. Do not read the checkbox again after the await.
- After `deps.updateSidebar()` and in place of the current `deps.updateReadyButtonState()` plus `if (S.runButtonOn) deps.startBackgroundRequestIfAllowed()`, `await applyStartMatchAiChoice(capturedChoice, { startPlanning: () => deps.startBackgroundRequestIfAllowed(), updateReadyButtonState: () => deps.updateReadyButtonState() })`.
- Leave `deps.resizeAndRedraw()` after that call.
- The `catch` path and the `regionalStartBlocked` return stay free of this call.
- Update the handler's expected-outcome comment: a successful start applies the click-time Auto-start AI choice; a failure leaves Run and the console unchanged.

The handler already sets `eventDrivenInitialConsultationDone` to false and clears the precomputed plan before this call. Leave that reset where it is, so a turn-on still requests the first consult.

Docs, replacing the "Start does not read it yet" sentence from Phase 3:

- [`doc/ux/new-game-dialog.md`](doc/ux/new-game-dialog.md): on a successful Start game or New game, the click-time checkbox and Run's enabled state follow the locked decisions above. A failed start leaves Run and the console unchanged and leaves the screen open. Name `chooseStartMatchAi`, `readStartMatchAiInput`, and `applyStartMatchAiChoice` in Code Entry Points.
- [`doc/ux/opponent-tab-commander.md`](doc/ux/opponent-tab-commander.md): a successful start can press Run, or release it, without a click on Run. Releasing it does not start planning. Pressing it starts the first turn's planning the same way a click on an enabled Run does, and it does not change the selected tab.
- [`doc/ux/console.md`](doc/ux/console.md): a successful start that does not turn planning on expands the console on the Opponent tab. That open does not collapse the console when Opponent was already selected. A start that turns planning on leaves the tab and the collapsed state as they were.
- [`doc/ux/modes-and-transitions.md`](doc/ux/modes-and-transitions.md): one sentence on the new-game screen for the same success rule.
- [`doc/region-vs-region.md`](doc/region-vs-region.md): point at the new-game document for what the checkbox does when the match starts. Keep the match-rules text free of the checkbox, because the engine does not store it.

Verify:

```powershell
npm test
npm run build:renderer
```

Expected: `npm test` exits 0. Then check the app by hand, without spending an API call on a case you can see from the console:

- Open the dialog twice. Auto-start AI is checked both times, including after you unchecked it before the second open. It sits to the right of Fog of war.
- Start with Auto-start AI unchecked. The console is expanded on Opponent, Run is not pressed, and the status sentence is "Opponent planning is off." If Run was pressed in the previous match, it is released.
- Start with Auto-start AI checked while Run is disabled (no key, or no model). Same result as the unchecked case.
- Start with Auto-start AI checked while Run is enabled. Run is pressed, the console stays on the tab it had before the dialog (Orders, unless you had selected another), and Ready shows the AI wait. That wait is the first turn's planning. Do not need a second click on Run.
- Force a failed start if you can (a regional map with fewer than two sides). The dialog stays open, and Run's pressed state is whatever it was before the click.

`npm run ui:smoke -- --label auto-start-wired` is optional after the hand check. It does not click Start in a way that calls the model. If you run it, `new-game-rules`, `minimap-overview-border`, `zoom-buttons-bottom-right`, and `scale-and-attribution-bottom-right` must still pass.

Hand-check the zoom buttons once, on a started match and on the new-game screen: + and − are at the map's bottom-right, the scale is to their left, the attribution is left of the scale, and the minimap has neither button. + and − zoom. At the zoom limit the button that cannot go further is dimmed and does nothing. The wheel, Shift-drag, and a double-click behave as they did before.

## Self-check for the author of this plan

- Checkbox placement, default, and the same reset as Fog of war: Phase 3.
- Enabled Run plus checked box starts planning once, after the previous consult is cancelled, and does not open the tab: Phases 4 and 5.
- Every other combination turns Run off and opens Opponent: Phases 4 and 5.
- Failed start changes nothing: Phase 5.
- The stop cannot cancel the planning request a successful auto-start just began, because that request starts only after the stop's await: Phase 5.
- Minimap frame matches the expand button: Phase 1.
- Zoom buttons at the bottom-right, scale and attribution shifted left, minimap unchanged, toast band unchanged: Phase 2.
- The checkbox never enters the match payload: Phases 3 and 5.
