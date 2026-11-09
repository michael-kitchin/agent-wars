# Dismiss a hired mercenary from the selection panel

> **For agentic workers:** Implement this plan phase by phase. Steps use checkbox (`- [ ]`) syntax. Do not commit or push. Do not copy phase names, or any other plan identifier, into code, comments, configuration, lint text, or `doc/`.

**Goal:** In the expanded selection panel, during strategic planning, each mercenary the human player controls gets a Dismiss control. Confirm turns that unit Neutral immediately. The player can get it back only by the existing rehire order, which still fills at the end of the turn.

**Architecture:** The panel draws a button from a pure visibility rule. Confirm calls one new IPC action. That action calls `convertUnitsToNeutral` in [src/main/gameActions/unitOwnershipTransfer.ts](src/main/gameActions/unitOwnershipTransfer.ts), the same conversion desertion and knockout already use. The client then drops that unit's unsent drafts and reloads the match snapshot so the treasury readout, the token, and the selection update.

**Tech stack:** TypeScript shared rules, one main-process action, the existing hire IPC handler, and the selection panel. Node tests after `npm run build:main`. Renderer check after `npm run build:renderer`.

## Decisions already made

- The button is only in the expanded selection panel, only during strategic planning, only for a mercenary whose `player` is the human seat. It is absent in a tactical battle, during resolution playback, for a regular unit, and for another side's mercenary. Compact mode already hides the details with `display: none`, so the buttons are not clickable there. While the map pane ignores the pointer (`setMainUIControlsEnabled(false)`), the button is not given a second hide rule: the click cannot land.
- The visible labels are `Dismiss`, then `Cancel` and `Confirm`. Cancel only restores `Dismiss`. Confirm converts the unit immediately. There is no success toast. A refusal uses the map toast.
- Several rows may sit on Cancel/Confirm at once. A later redraw keeps that state for rows that are still the player's mercenaries.
- The original hire fee is not refunded. The treasury balance is not written. The unit leaves this turn's upkeep because it is no longer a mercenary when the economy is read again.
- The unit's queued drafts and its standing order are cleared. `convertUnitsToNeutral` then gives the Neutral unit a `defend` order on its current hex, as desertion does. Other selected units keep their orders. Already queued attacks of units that stayed selected stay queued. Turning targeting off does not cancel those queued attacks.
- A loaded mercenary ship takes every unit in its cargo Neutral with it, including a regular unit of the same seat. Transport rows stay. Rehire already refuses a loaded ship and a unit aboard a ship, so those units cannot be hired back. Do not unload them.
- A mercenary that is itself cargo is not dismissable. Embarked land units cannot be selected, and the action rejects that id. That matches desertion, which does not draw a mercenary aboard a ship that is not a mercenary.
- An empty ship, an air unit, and a mercenary on foot can be rehired in this same planning phase by the existing rehire order. That order still fills at the end of the turn. Do not add a same-turn ban.
- Commanders get no dismiss tool, and the commander prompts do not mention dismiss.
- After confirm, the unit leaves the selection because it is no longer human. Hover preview and Ranged, Strike, and Launch targeting turn off.

## Global constraints

- Do not commit or push.
- Do not add a database column, a table, or an AI tool. Do not edit files under `doc/ai-commander-prompts/` or `doc/release-notes/`. Leave [doc/ai-tools.md](doc/ai-tools.md) unchanged.
- Do not change `convertUnitsToNeutral` or `transferNeutralUnitToSeat`. Call them.
- Do not refund credits, write the treasury, or unload cargo.
- Do not edit historical docs: [doc/devleopment-plan-v3.4.md](doc/devleopment-plan-v3.4.md), [doc/poc-analysis.md](doc/poc-analysis.md), [doc/market-research.md](doc/market-research.md).
- Orienting comments on every new or updated function, field, and exported const: why it exists, when to use it, what it returns, and what it throws. Match the Purpose / When to use / Expected outcome / Exceptions shape in [src/shared/mapOrderGestureGate.ts](src/shared/mapOrderGestureGate.ts). Do not use the "Defines the function shape" template.
- A new or updated public main-process function logs once at debug on entry. A refusal logs at debug with the reason. A caught exception logs at error before it is rethrown. Getter-style reads log at trace. Use `logDebug`, `logError`, and `logTrace` from [src/main/logger.ts](src/main/logger.ts). Do not log inside `src/shared`. `parseDismissMercenaryPayload` does not log; the IPC handler logs an unreadable payload.
- Mark locals `const`. Mark fields that are not reassigned `readonly`.
- Tests cover the contract cases named in each phase. A new test file uses `node:test` and `node:assert/strict`, and lives beside the module it covers. Do not add a test whose only job is the IPC handler's delegation.
- PowerShell does not accept `&&`. Run each command in the verify lists as its own step.
- Do not run the full `npm test`. That rebuilds better-sqlite3 for Node. If it is run anyway, run `npm run rebuild:native:electron` afterward so the desktop app can start.
- After a renderer edit, run `npm run build:renderer`. Do not hand-edit `static/renderer.js`.
- Keep each new source file under 600 lines. [src/shared/mercenaryRules.ts](src/shared/mercenaryRules.ts) is already near that desirable limit, so the new strings and the visibility rule go in a new shared module.
- `executeDismissMercenary` takes the seat id and the unit id. Build map coordinates inside the function. Do not add a third coordinate argument.

## Out of scope

- Dismiss from the stack callout, the Orders tab, or the Hire tab.
- A way to dismiss an embarked mercenary on its own.
- Unloading a ship so it can be rehired.
- Any change to payroll math, desertion draws, or rehire eligibility.

## File map

- New: [src/shared/mercenaryDismiss.ts](src/shared/mercenaryDismiss.ts), [src/shared/mercenaryDismiss.test.ts](src/shared/mercenaryDismiss.test.ts), [src/shared/draftsWithoutUnits.ts](src/shared/draftsWithoutUnits.ts), [src/shared/draftsWithoutUnits.test.ts](src/shared/draftsWithoutUnits.test.ts), [src/main/gameActions/dismissMercenary.ts](src/main/gameActions/dismissMercenary.ts), [src/main/gameActions/dismissMercenary.test.ts](src/main/gameActions/dismissMercenary.test.ts), [src/renderer/gameplay/selectionPanelDismiss.ts](src/renderer/gameplay/selectionPanelDismiss.ts)
- Edited: [src/shared/selectionPanelSummary.ts](src/shared/selectionPanelSummary.ts), [src/shared/selectionPanelSummary.test.ts](src/shared/selectionPanelSummary.test.ts), [src/shared/ipc/channels.ts](src/shared/ipc/channels.ts), [src/shared/ipc/gameApiTypes.ts](src/shared/ipc/gameApiTypes.ts), [src/main/ipcPayloadGuards.ts](src/main/ipcPayloadGuards.ts), [src/main/ipc/mercenaryIpcHandler.ts](src/main/ipc/mercenaryIpcHandler.ts), [src/main/preload.ts](src/main/preload.ts), [src/renderer/gameplay/selectionPanel.ts](src/renderer/gameplay/selectionPanel.ts), [src/renderer/core/stateSnapshot.ts](src/renderer/core/stateSnapshot.ts), [src/renderer/wiredEntryCallbacks.ts](src/renderer/wiredEntryCallbacks.ts), [src/renderer/renderer.ts](src/renderer/renderer.ts), [src/renderer/core/uiState.ts](src/renderer/core/uiState.ts), [static/selectionChrome.css](static/selectionChrome.css), [doc/ux/selection-panel.md](doc/ux/selection-panel.md), [doc/ux/control-tooltips.md](doc/ux/control-tooltips.md), [doc/ux/order-lifecycle.md](doc/ux/order-lifecycle.md), [doc/how-to-play.md](doc/how-to-play.md), [doc/combat-rules-v3.md](doc/combat-rules-v3.md)

## Phase 1: Shared rule and row flag

**Produces:** The labels, the refusal sentences, and the rule that decides whether a row shows Dismiss. The panel does not draw it yet, so the game looks the same.

- [ ] Add [src/shared/mercenaryDismiss.ts](src/shared/mercenaryDismiss.ts).
  - Export this result type, used by the action, the IPC bridge, and the panel:

    `export type DismissMercenaryResult = { readonly success: true; readonly unitIds: readonly string[] } | { readonly success: false; readonly reason: string }`

    Each field gets an orienting comment. On success, `unitIds` is every unit that became Neutral.
  - Exported label consts: `DISMISS_MERCENARY_LABEL` = `Dismiss`, `DISMISS_MERCENARY_CANCEL_LABEL` = `Cancel`, `DISMISS_MERCENARY_CONFIRM_LABEL` = `Confirm`.
  - Exported reason consts: `DISMISS_REASON_INVALID` = `Invalid dismiss request.`; `DISMISS_REASON_NOT_PLANNING` = `Mercenaries can only be dismissed during planning.`; `DISMISS_REASON_TACTICAL` = `Dismissing is unavailable during a tactical battle.`; `DISMISS_REASON_NOT_ACTIVE` = `Only a side still in the match can dismiss a mercenary.`; `DISMISS_REASON_MISSING` = `That unit is no longer on the map.`; `DISMISS_REASON_NOT_YOURS` = `You can only dismiss your own mercenary.`; `DISMISS_REASON_NOT_MERCENARY` = `Only a mercenary can be dismissed.`; `DISMISS_REASON_EMBARKED` = `A mercenary aboard a ship cannot be dismissed.`; `DISMISS_MERCENARY_FAILED` = `Failed to dismiss that mercenary.`
  - Tooltip consts: `DISMISS_MERCENARY_TOOLTIP` = `Fire this mercenary. It becomes Neutral now.`; `DISMISS_MERCENARY_CANCEL_TOOLTIP` = `Keep this mercenary.`; `DISMISS_MERCENARY_CONFIRM_TOOLTIP` = `Fire this mercenary now. You can rehire it for the next turn.`
  - `export function mercenaryDismissShown(input: { readonly strategicPlanning: boolean; readonly playbackRunning: boolean; readonly player: string; readonly isMercenary: boolean }): boolean`. Return true only when `strategicPlanning` is true, `playbackRunning` is false, `player` is `HUMAN_SEAT_ID`, and `isMercenary` is true. Import `HUMAN_SEAT_ID` from [src/shared/seatIds.ts](src/shared/seatIds.ts).
- [ ] Add [src/shared/mercenaryDismiss.test.ts](src/shared/mercenaryDismiss.test.ts). One case returns true for the human mercenary during strategic planning with playback off. One case returns false for each of: playback on, strategic planning off, `isMercenary` false, and `player` set to another seat.
- [ ] On `SelectionPanelUnitInput` in [src/shared/selectionPanelSummary.ts](src/shared/selectionPanelSummary.ts), add optional `readonly isMercenary?: boolean`. Do not make it required: `S.gameState.units` and the existing fixtures omit it. On `SelectionPanelRow`, add required `readonly isMercenary: boolean` and required `readonly player: string`. `summarizeSelectionPanel` copies `unit.isMercenary === true` and `unit.player`.
- [ ] In [src/shared/selectionPanelSummary.test.ts](src/shared/selectionPanelSummary.test.ts), assert that a unit with `isMercenary: true` produces a row with `isMercenary` true and `player` `human`, and that a unit without the field produces `isMercenary` false.
- [ ] Verify, as separate commands: `npm run build:main`, then `node dist/shared/mercenaryDismiss.test.js`, then `node dist/shared/selectionPanelSummary.test.js`. Each test file finishes with no failures.

## Phase 2: Neutral conversion

**Produces:** `executeDismissMercenary`, covered by a temporary-database test. Nothing calls it from IPC yet, so the running game is unchanged.

- [ ] Add [src/main/gameActions/dismissMercenary.ts](src/main/gameActions/dismissMercenary.ts).
  - `export function executeDismissMercenary(seatId: SeatId, unitId: string): DismissMercenaryResult`, returning the shared result type. On success, `unitIds` is the dismissed unit, then each cargo id from `listCargoUnitIdsForShip` in that function's order. An empty ship or a unit on foot returns one id.
  - Log debug on entry with `seatId` and `unitId`. Log debug on each refusal with the reason. Log debug once before a successful return with `unitCount`.
  - Refuse, in this order, with the matching reason from phase 1: `turn_state.phase` is not `planning`; the seat is human and `isTacticalBattleActive()` from [src/main/tacticalBattle/tacticalBattleSession.ts](src/main/tacticalBattle/tacticalBattleSession.ts); the seat is missing or its `outTurn` is set; the unit id is missing; `units.player` is not `seatId`; `is_mercenary` is not 1; a `unit_transport_assignments` row has this id as `land_unit_id`.
  - On success, open a transaction the way [src/main/gameActions/mercenaryTurnStep.ts](src/main/gameActions/mercenaryTurnStep.ts) does (`BEGIN`, then `COMMIT`, and `ROLLBACK` in the catch). Call `convertUnitsToNeutral` with the id list and `buildLatLngCoordinateMap(getOrderedHexList())` from [src/main/mapData.ts](src/main/mapData.ts). On a thrown error, log at error, roll back, and rethrow. Do not write `res_s_treasury`. Do not delete transport rows.
- [ ] Add [src/main/gameActions/dismissMercenary.test.ts](src/main/gameActions/dismissMercenary.test.ts). Follow `withTempGameDb` and `insertUnitRow` as [src/main/gameActions/unitOwnershipTransfer.test.ts](src/main/gameActions/unitOwnershipTransfer.test.ts) does. Do not wrap `executeDismissMercenary` in `BEGIN`: the function opens its own transaction, and a second `BEGIN` fails. Cover these contracts:
  - A human mercenary infantry becomes Neutral, `is_mercenary` is 0, and a second human mercenary in the same hex is unchanged. Credits from `setTreasuryCredits` are unchanged. `readMercenaryFunds` no longer counts the dismissed unit. Before the call, insert a `standing_orders` row for the human seat and that unit with `order_type` `march`, `params` `{}`, `status` `active`, `created_turn` 1, and `origin_hex` set to the unit hex. After the call, that human row is gone, and a Neutral `defend` row exists for the unit. `transferNeutralUnitToSeat` then makes that unit a human mercenary again.
  - A human mercenary naval unit with one regular infantry and one mercenary infantry in `unit_transport_assignments` (`land_unit_id`, `naval_unit_id`) converts all three. Both assignment rows remain. `transferNeutralUnitToSeat` on the ship throws.
  - Refusals leave the unit human and mercenary: not a mercenary; another seat's mercenary when `seatId` is human; a missing id; a mercenary whose id is `land_unit_id`; `UPDATE turn_state SET phase = 'resolution' WHERE id = 1`; `UPDATE seats SET out_turn = 1 WHERE seat_id = 'human'`, which returns `DISMISS_REASON_NOT_ACTIVE`.
  - With `setActiveTacticalBattleSnapshotRef` set to a non-null value, a human mercenary is refused with `DISMISS_REASON_TACTICAL` and stays human. A cast to `TacticalBattleSnapshot` is enough: the gate only checks that the ref is non-null. Clear the ref in `finally`.
- [ ] Verify, as separate commands: `npm run build:main`, then `node dist/main/gameActions/dismissMercenary.test.js`.

## Phase 3: Human IPC

**Produces:** The renderer can call the action. The panel still has no button.

- [ ] Add `dismissMercenary: 'game:dismissMercenary'` to `IPC_GAME` in [src/shared/ipc/channels.ts](src/shared/ipc/channels.ts).
- [ ] Add the same key, with the same string, to the preload-local `IPC_GAME` object in [src/main/preload.ts](src/main/preload.ts). That object is a copy. [src/main/preloadChannelParity.test.ts](src/main/preloadChannelParity.test.ts) and [src/main/preloadIpcChannelParity.test.ts](src/main/preloadIpcChannelParity.test.ts) fail when the two maps differ. Preload cannot import the shared module.
- [ ] Add `dismissMercenary: (payload: { unitId: string }) => Promise<DismissMercenaryResult>` to `GameApi` in [src/shared/ipc/gameApiTypes.ts](src/shared/ipc/gameApiTypes.ts). Import the result type from [src/shared/mercenaryDismiss.ts](src/shared/mercenaryDismiss.ts).
- [ ] Add `parseDismissMercenaryPayload` in [src/main/ipcPayloadGuards.ts](src/main/ipcPayloadGuards.ts). Accept only an object whose `unitId` is a non-empty string. Return null otherwise. Follow `parseHireOrderRemovalPayload`. Do not log.
- [ ] In [src/main/ipc/mercenaryIpcHandler.ts](src/main/ipc/mercenaryIpcHandler.ts), handle the channel for `HUMAN_SEAT_ID`. An unreadable payload returns `{ success: false, reason: DISMISS_REASON_INVALID }` and logs at debug. A readable payload returns `executeDismissMercenary`.
- [ ] On the preload bridge object, expose `dismissMercenary` the same way `removeHireOrder` is exposed: `ipcRenderer.invoke` of the preload-local channel.
- [ ] Verify, as separate commands: `npm run build:main`, then `node dist/main/preloadChannelParity.test.js`, then `node dist/main/preloadIpcChannelParity.test.js`.

## Phase 4: Selection panel

**Produces:** The button, the confirm pair, the aligned column, and the client update after a successful dismiss. A selection that contains no dismissable mercenary keeps today's row layout.

- [ ] Add [src/shared/draftsWithoutUnits.ts](src/shared/draftsWithoutUnits.ts). `export function draftsWithoutUnits<T extends { readonly unitId: string }>(drafts: readonly T[], unitIds: readonly string[]): T[]`. Return every draft whose `unitId` is not in `unitIds`. An empty id list returns a copy of the drafts. Add [src/shared/draftsWithoutUnits.test.ts](src/shared/draftsWithoutUnits.test.ts): one id drops one row and keeps the other; an empty id list keeps both.
- [ ] Add `refreshGameStateAfterMercenaryDismiss` in [src/renderer/core/stateSnapshot.ts](src/renderer/core/stateSnapshot.ts). It calls `refreshGameStateFromMain` with the same dep argument shape as `refreshGameStateAfterSealiftChange`, and with `refreshStandingOrders: true`, `updateGameStateSidebarUi: true`, `updateSelectionUi: true`, `refreshBuildPopup: true`, `redraw: true`, and the other flags false. `refreshBuildPopup: true` refreshes an open Hire tab so the dismissed unit can be rehired. The log text is `refreshGameStateAfterMercenaryDismiss failed:`. The helper logs and does not rethrow. Do not call the sealift function. A failed reload is a stale client, and it is not a failed dismiss: do not toast `DISMISS_MERCENARY_FAILED` for it.
- [ ] In [src/renderer/wiredEntryCallbacks.ts](src/renderer/wiredEntryCallbacks.ts), add `reloadAfterMercenaryDismiss` beside `refreshGameStateAfterSealiftChange`. It awaits `refreshGameStateAfterMercenaryDismiss({ applyGameStateSnapshot })`, then calls `refreshStackCalloutIfOpen`. An open stack list otherwise keeps the pre-dismiss owner.
- [ ] Add [src/renderer/gameplay/selectionPanelDismiss.ts](src/renderer/gameplay/selectionPanelDismiss.ts).
  - Keep the armed unit ids and the in-flight unit ids in module state. `forgetDismissArmedExcept` drops armed ids that are not in the rows just drawn. An in-flight id stays in flight until reload finishes.
  - `createMercenaryDismissCell(row, unitName, deps)` returns an element. It does not append it. Return an empty `span` with class `selection-panel-dismiss-slot` when `mercenaryDismissShown` is false. `strategicPlanning` is true only when `S.tacticalBattleSnapshot` is null and `S.gameState?.phase === 'planning'`. `playbackRunning` is `resolutionPlaybackBlocksMapOrders(S.resolutionMoveAnimation)` from [src/shared/mapOrderGestureGate.ts](src/shared/mapOrderGestureGate.ts).
  - Each control is a `button type="button"` inside that slot. Visible text is the label const. `aria-label` is that label, a space, and the unit name. `data-control-tooltip` is the matching tooltip const. The class is `selection-panel-order selection-panel-dismiss`.
  - Dismiss adds the id to the armed set and calls `deps.redrawSelectionPanel`. Cancel removes the id and redraws. Neither calls IPC. Cancel does nothing while that id is in flight.
  - An armed id, and an in-flight id, render Cancel and Confirm. While the id is in flight, both buttons are disabled. Confirm ignores a second click while that id is in flight.
  - Confirm adds the id to the in-flight set, then calls `window.gameApi.dismissMercenary({ unitId })`. On a thrown error, or on `success: false`, clear the in-flight flag, leave the row armed, and toast the thrown path with `DISMISS_MERCENARY_FAILED` or the result `reason`, using `deps.showMapToast(message, { isError: true })`. `showMapToast` is the existing function in [src/renderer/openRouter/openRouterUiHelpers.ts](src/renderer/openRouter/openRouterUiHelpers.ts).
  - On success, keep the id in flight and armed so a redraw cannot show Dismiss again before the snapshot arrives. Replace `S.pendingRangedAttacks`, `S.pendingAirStrikes`, `S.pendingMissileLaunches`, `S.pendingFerryOrders`, and `S.pendingEmbarkOrders` through `draftsWithoutUnits` and the returned `unitIds`. Set `S.hoverRoutePreview` to null and set `S.rangedModeActive`, `S.airStrikeModeActive`, and `S.missileLaunchModeActive` to false. Then `await deps.reloadAfterDismiss()`. Then `removeUnitsFromSelection(result.unitIds)` from [src/renderer/core/selection.ts](src/renderer/core/selection.ts), so an empty selection clears the selected hex the way other deselect paths do. Then clear that id from the armed set and the in-flight set.
  - `stopPropagation` on each button click.
- [ ] In [src/renderer/gameplay/selectionPanel.ts](src/renderer/gameplay/selectionPanel.ts), `wireSelectionPanel` is the only function that receives `SelectionPanelDeps`. Store those deps. `renderSelectionPanel()` takes no argument and uses the stored deps. When the deps are not stored yet, return without throwing. Extend the deps with `readonly showMapToast`, `readonly reloadAfterDismiss: () => Promise<void>`, and `readonly redrawSelectionPanel: () => void`. `redrawSelectionPanel` calls `renderSelectionPanel`. [src/renderer/core/uiState.ts](src/renderer/core/uiState.ts) calls `renderSelectionPanel()` with no deps object. [src/renderer/renderer.ts](src/renderer/renderer.ts) passes `showMapToast` and `reloadAfterMercenaryDismiss` into `wireSelectionPanel`. Do not import `uiState` or `wiredEntryCallbacks` from the panel.
  - `createUnitRow` still builds the type token, the name, the hex code when `inPanelHex` is false, and the order chip. When any row in this render would show a dismiss control, every row is a grid row: type token, one name cell, the dismiss cell, the order chip. The name cell holds the flag and name, and the hex code when the row has one. The dismiss cell is the element from `createMercenaryDismissCell`. When no row would show a control, keep today's flex children and do not insert a dismiss cell. After the rows are built, call `forgetDismissArmedExcept` with the ids of rows that still pass `mercenaryDismissShown`.
- [ ] In [static/selectionChrome.css](static/selectionChrome.css), add a class on the list, set from the panel only when at least one row shows a dismiss control. That class makes `#selection-panel-units` a grid: `grid-template-columns: auto max-content max-content minmax(0, 1fr) auto`, keeping `flex: 1 1 auto`, `min-height`, and `overflow-y`. Each `.selection-panel-unit` under that class uses `display: grid`, `grid-template-columns: subgrid`, and `grid-column: 1 / -1`, and keeps its padding and top border. The column template lives on the list. A separate track on each row would not share one left edge. Column gap is 8px. Column 1 is the type token. Column 2 is the name cell (`max-content`), so its right edge is the widest name cell, including a hex code that lives in that cell. Column 3 is the dismiss cell. Every Dismiss, Cancel, and Confirm button shares that column's left edge. Cancel and Confirm sit in one cell, in a row, with gap 8px, Confirm on the right. A row with an empty slot still occupies that column, so a regular unit beside a mercenary shows a blank the width of the widest dismiss cell. That blank is what keeps the buttons aligned. Do not collapse it. Column 4 takes the free space. Column 5 is the order chip, on the right edge of the line.
  - Leave `.selection-panel-order` `margin-left: auto` in place. Rows that are still flex, including every tactical row and every strategic selection with no dismissable mercenary, still need it to pin the order chip to the right.
  - `.selection-panel-dismiss` keeps the order chip's border, radius, font size, and text color. Set `min-height: 24px`, horizontal padding `8px`, `background: transparent`, `font: inherit`, `line-height: 1`, and `box-sizing: border-box`, so it matches the order chip that contains the 20px cancel mark. Hover uses the same background as `.selection-panel-order-cancel:hover`. A disabled button does not use that hover background.
  - The name column does not shrink. A row that is wider than the panel scrolls with the details.
- [ ] Verify, as separate commands: `npm run build:main`, `node dist/shared/draftsWithoutUnits.test.js`, `npm run build:renderer`, `npm run check:renderer-types`.
- [ ] Verify the panel in the running app. Do not start commander planning. Do not enter or use an API key. Do not press Ready when that would start a commander. If the app cannot be opened, stop and say this checklist was not run.
  - Expand the selection panel on two of your units, one of them a mercenary. Dismiss lines up at the right of the longer name. The order chip stays on the right. A regular unit has no Dismiss, and the blank beside its name is the width of that button. A selection with no mercenary still pins "No orders" or the order chip to the right, as it does today.
  - Dismiss switches that row to Cancel and Confirm. Cancel returns to Dismiss and the unit stays yours.
  - Confirm removes the unit from the selection, clears the `¤` badge, and shows it as Neutral. The credits readout drops that unit's upkeep. The balance does not gain the old hire fee. The stack list, if it was open on that hex, shows the new owner.
  - Place a rehire on that Neutral unit in the same planning phase. It is not yours again until the turn ends.
  - A loaded mercenary ship takes its cargo Neutral and stays loaded. The Hire tab does not offer that ship or that cargo.
  - The button is absent in a battle and while playback is running.

## Phase 5: Documentation

**Produces:** The maintained docs describe the landed behavior. Do this in the same working tree as the code, before the work is handed back.

- [ ] [doc/ux/selection-panel.md](doc/ux/selection-panel.md): in the unit-row sentence, say a human mercenary during strategic planning, while playback is not running, has Dismiss after the name. Describe the Cancel/Confirm pair, that Cancel changes nothing, and that Confirm dismisses immediately. Say the dismiss column's left edge is the right edge of the widest name cell, a regular row in that selection leaves that column blank, and the order chip stays at the right edge. A selection with no such mercenary keeps the current row. Add the click rules beside the order-cancel bullet. Add an invariant that a tactical battle, playback, a regular unit, and another side's unit never show the button. Name `mercenaryDismissShown`, `executeDismissMercenary`, and `selectionPanelDismiss.ts` in Code Entry Points.
- [ ] [doc/ux/control-tooltips.md](doc/ux/control-tooltips.md): add the three tooltip sentences after the selection-panel expand bullets, each naming its const. Leave the order-cancel control in "Controls with no tip".
- [ ] [doc/ux/order-lifecycle.md](doc/ux/order-lifecycle.md): say a confirmed dismiss drops that unit's queued drafts and standing order immediately, and does the same for cargo converted with a mercenary ship. Other units' queued orders stay. The Neutral unit receives `defend` from `convertUnitsToNeutral`.
- [ ] [doc/how-to-play.md](doc/how-to-play.md): under Credits and Hiring, add that Dismiss on your mercenary in the expanded selection panel asks you to confirm, then makes it Neutral immediately, and that hiring it back uses rehire and waits until the turn ends. Say a loaded ship takes its cargo and cannot be rehired while loaded. A mercenary aboard someone else's ship cannot be dismissed.
- [ ] [doc/combat-rules-v3.md](doc/combat-rules-v3.md) section 2.1: add a paragraph after the rehire rules. Name `executeDismissMercenary`. Say it runs only in strategic planning for the human seat, rejects an embarked land unit, calls `convertUnitsToNeutral` for the unit and a loaded ship's cargo, leaves transport rows and the treasury balance unchanged, and removes the unit from later payroll because `is_mercenary` is cleared. Say commanders have no dismiss action.
- [ ] Search `doc/` for sentences that say the only way a mercenary becomes Neutral is desertion, combat, or knockout. Update the maintained hits. Leave historical docs, `doc/release-notes/`, and `doc/ai-commander-prompts/` alone. [doc/ux-specification.md](doc/ux-specification.md) already says Neutral is never a mercenary; leave that sentence unless a dismiss sentence next to it would make it false.
- [ ] Verify: read the edited doc sections once and confirm each new sentence names a symbol that exists in the code from phases 1–4.

## Review focus

- Do not call `cancelHumanStandingOrder` after conversion. The unit is already Neutral, and `convertUnitsToNeutral` has already deleted the human standing order and written Neutral `defend`.
- Do not filter drafts for units that were not in the returned `unitIds`.
- Do not show Dismiss from `isMercenary` alone. The visibility function also requires strategic planning, no playback, and the human seat.
- The name cell includes the hex code. A separate column for the hex code would push one row's button out of line.
- A refusal clears only the in-flight flag. The row stays on Cancel and Confirm.
- Between a successful IPC result and the end of reload, the row stays in flight. Showing Dismiss in that gap would accept a second click and then toast a refusal for a unit that already became Neutral.
- Do not remove `margin-left: auto` from `.selection-panel-order`. Do not put the dismiss grid on a list that has no dismiss control.
- Do not nest `BEGIN` around `executeDismissMercenary`.
- Clear the tactical-battle ref in the test's `finally`, or later tests in the same process will refuse every human hire and dismiss.
