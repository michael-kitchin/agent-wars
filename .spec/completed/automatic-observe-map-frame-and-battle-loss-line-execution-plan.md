# Automatic map frame and battle loss line

Audience: a lower-quality coding agent. Implement one phase at a time. Stop after each phase and report files touched, test results, and any doc updated. Wait for the human before the next phase. If a phase fails, revert that phase. If a line in this plan disagrees with the code, trust the code, stop, and report the discrepancy.

## Goal

Two independent behaviors:

1. In an automatic AI-only match, frame the main map on the visible units plus 3 hexes on one axis, at the start of each strategic turn and at the start of each beat of an automatic AI-only battle.
2. When a tactical battle ends, the strategic update popup for the turn that opened that battle lists every strategic unit the battle destroyed. One line per side, for example `III Infantry, 6 Armored destroyed in battle.`

## Locked decisions

- Automatic means the roster is observing (`isObservingRoster` in [`src/shared/observeModeControls.ts`](src/shared/observeModeControls.ts)) and `S.autoAdvance` is true. That is the checkbox "Start the next turn when every commander is ready". Watch the rest turns it on in `chooseWatchTheRest` ([`src/renderer/gameplay/observeIntent.ts`](src/renderer/gameplay/observeIntent.ts)). Semi-automatic is observing with the checkbox off. A match with an active human seat is neither. A new observe-only match starts with the checkbox off (`clearObserveAfterKnockout`), so it is semi-automatic until the box is checked.
- The frame is the main map camera only. Do not fit the minimap. Do not call `setMaxBounds`, `setMinZoom`, or `applyLoadedMapExtent` from the unit-frame fit. Pan limits stay what they already are: the loaded map on the world map, the battle area in a battle.
- Expand the unit box by 3 hexes of span on one axis, centered (1.5 hex steps on each side of that axis). Choose the axis that `fitBounds` would leave tight. If the unit box's Mercator aspect is greater than or equal to the map panel's width/height, pad longitude. Otherwise pad latitude. Both choices still contain every unit. Equal aspects pad longitude.
- One hex step is the largest center-to-center `|Δlat|` or aligned `|Δlng|` from the sample cell to a `gridDisk(cell, 1)` neighbor. Align longitude to within 180° of the sample center before measuring, the same wrap as `alignTo` in [`src/shared/mapExtent.ts`](src/shared/mapExtent.ts). Measure at the unit hex nearest the average of the unit centers, not at an arbitrary first hex. If that index has no finite neighbor, try the other unit hexes. If none do, pad by 0.
- Clamp the padded box to the pan-limit box so the camera is not asked to show hexes outside it. Clamping may eat the pad. Units already sit inside the limit, so clamping must not push a unit center outside it.
- Build unit and limit boxes in the unwrapped longitude frame from `longitudeIntervalFromCenters` and `mapExtentBoxForHexes`. Pass them to Leaflet with `latLng(..., true)` (the `noWrap` argument `applyLoadedMapExtent` already uses). Do not clamp a dateline-crossing box back into ±180. On the global map the pan limit stays the Mercator world; the fit box may still be unwrapped.
- No visible units, or a map panel with width or height 0: do not move the camera.
- Strategic units are `gameState.units` for the current View as snapshot. That list is already the live units the view draws. Do not include last-known stale markers. All sides has every unit. A seat view has that seat's units plus enemies on visible hexes (`filteredUnits` in `getGameStateForPlayer`, [`src/main/gameDb/fogState.ts`](src/main/gameDb/fogState.ts)).
- Changing View as reloads the snapshot and does not move the camera. The next strategic turn, or the next battle beat, uses the view that is current then.
- Do not frame from `applyGameStateSnapshot`. That apply often happens before resolution playback is armed, and a frame there would jump the camera while the animation is about to draw units at their old positions. `readyTacticalCommit` sets `resolutionMoveAnimation` before the post-commit paint for the same reason.
- Tactical battles have no fog. Frame every living `subUnits` entry, using each sub-unit's tactical `h3Index`. Human battles and semi-automatic battles keep today's full battle-area fly in [`src/renderer/map/tacticalMapView.ts`](src/renderer/map/tacticalMapView.ts), including `finalizeTacticalViewZoomAndPan`.
- `tacticalPhasePlanning` stays true during beat playback. It is not a "beat just started" signal. Playback running means `S.resolutionMoveAnimation` is set.
- The strategic update popup is built when the turn resolves. When `tacticalAutoStartH3Index` is set, it is not shown until that battle ends and the Ready that follows the exit has returned. The world-map animation still plays before the battle. Per-beat tactical toasts stay as they are. Turns that do not open a battle show the popup immediately, as today.
- After the battle, that held popup contains the launch turn's other losses plus the new line. The Ready that follows the exit is a later turn. It does not list those units again. Its own turn-update toast may appear first and is filed on the Reports tab. The held popup is shown after that Ready returns, so it replaces the later toast and is the one left on screen. Playback of the later turn is not delayed. A battle entered from the map, with no held launch-turn popup, puts the same line on the Ready that runs as the exit returns. That is the first strategic popup after that battle, not a second copy.
- If the battle fails to start, show the held popup at once, without the battle line. If the match ends first, or a new match starts, drop the held popup and do not show it.
- A destroyed unit is a strategic parent deleted because every sub-unit is gone (`syncStrategicUnitsDbWhenTacticalParentsEliminated` in [`src/main/tacticalBattle/tacticalStrategicOrderPhases.ts`](src/main/tacticalBattle/tacticalStrategicOrderPhases.ts)), a parent deleted by the exit threshold (`survivors * 2 < baseline` in `applyHumanVoluntaryBailoutStrategicParentElimination`), or a strategic unit removed as transport fallout of one of those deletes. Surviving parents are omitted. A second delete of an id whose row is already gone adds nothing.
- A battle restored from a save reports only parents destroyed after that load. Do not reconstruct earlier beats.
- The line sits in that side's loss section after the cause lines and before missile, fortification, and hex sentences. A side with only this line still gets a header. The words are not a cause label. Do not add them to `LOSS_CAUSE_LABELS`, `formatPlayerLossInline`, `playerHasAnyLoss`, or commander prompts. Do not put the parents into a cause bucket. `buildUnitOriginByLossDisplayName` only walks cause buckets, so battle-line flags are merged in after that call.
- Names are the base display names other loss lines use (`buildUnitDisplayNameLookup` / `fallbackDisplayNameFromUnitId`). No short side prefix. Build the lookup from the roster before the deletes, so Roman numerals match a live unit. Three or fewer of one type stay named, in their original order. More than three collapse. Named units come first. Groups follow in naval, air, armored, infantry, missile order. Group text for this line only is `${count} ${label}`, such as `6 Armored`, not `6x Armored`. Other cause lines stay `6x Armored`. The line ends with ` destroyed in battle.` including the period. Example string: `III Infantry, 6 Armored destroyed in battle.` Flags and the type icon are DOM, from the existing painters.
- A unit is listed when the viewer is All sides (`viewerSeatId` null), or the unit's owner is the viewer, or its strategic hex is in the visible-hex set captured for that resolution. Same rule as `filteredUnits` in `getGameStateForPlayer`.
- Constant `UNIT_FRAME_PAD_HEXES = 3`. Mention it in the loaded-map-extent row of [`doc/README.md`](doc/README.md) and in [`doc/ux/map-surface.md`](doc/ux/map-surface.md). Do not add it to [`doc/combat-rules-v3.md`](doc/combat-rules-v3.md).
- Do not commit or push. Do not put phase numbers, this file's name, or words from these headings into code, comments, tests, lint text, or `doc/`.
- Do not edit pictures under `doc/media/`. Do not edit `static/renderer.js` by hand. `npm run build:renderer` rewrites it.
- Leave `doc/devleopment-plan-v3.4.md`, `doc/poc-analysis.md`, `doc/market-research.md`, `doc/ai-commander-prompts/`, and `.spec/completed/` alone.

## What must stay the same

- Semi-automatic observe matches, and any match with an active human seat, keep today's strategic camera. A later snapshot still does not refit the loaded footprint (`shouldApplyLoadedMapExtent`).
- Human battles and semi-automatic battles still fly to the battle footprint and still run `finalizeTacticalViewZoomAndPan`. Pan stays inside the battle area in every battle.
- The resize listener in [`src/renderer/map/mapExtent.ts`](src/renderer/map/mapExtent.ts) stays as it is. It restores the previous center and the higher zoom after refitting the region.
- `exitTacticalMapView` still restores the loaded extent and `strategicScenarioInitialLeafletView` for battles that do not use the automatic frame. The automatic strategic frame, when it runs on exit, runs after that function returns.
- Melee Ignore, and any Ready that does not set `tacticalAutoStartH3Index`, still shows the update popup immediately.
- Per-beat tactical toasts, commander prompts, and `formatLossEntries` (`6x Infantry`) stay as they are.
- Error toasts still show immediately.

## Working rules

- Shell is Windows PowerShell at `F:\Projects\Personal\agent-wars-public`. Run one command at a time. Do not chain with `&&`.
- Keep each file's existing line endings. New files use CRLF.
- Orienting comments on every new or changed field and non-overriding method: Purpose, When to use, Expected outcome, Exceptions. Match the file you are editing.
- Shared modules do not import the logger. New main-process functions that change state log at debug with enough detail to troubleshoot, including counts and ids. Caught exceptions log at error. Getter-style reads log at trace. Use the existing logger. Do not check the log level before the call unless the message builds a large string.
- Tests cover the happy path and the essential failure named in the phase. No DOM tests, source-scan tests, or constructor tests. `npm test` builds, lints, checks names, and runs `dist/**/*.test.js`. A new `*.test.ts` under `src/shared` or `src/main` is picked up automatically. Do not edit `package.json` to register it.
- When a phase edits `src/renderer` or `static/`, also run `npm run build:renderer`. Leave `static/renderer.js` changed.
- Desirable file size is 600 lines. Hard limit is 1000. [`src/main/tacticalBattle/tacticalBattleSession.ts`](src/main/tacticalBattle/tacticalBattleSession.ts) is already past 600. Put the destroyed-parent list in a new main-process module. Do not keep growing the session file.
- Named arguments stay at or below 6. Use one argument object when a function would otherwise pass that. Use `readonly` and `const` for values that are not reassigned.
- camelCase files and functions. PascalCase types. No `Utils` or `Impl`. Do not rename IPC channels, DOM ids, or SQL columns. The channel string `game:endTacticalBattle` stays. Adding `destroyedParents` to `EndTacticalBattleIpcResult` is allowed.
- Update the living docs named in the phase. Search `doc/` for sentences that would become false. A later phase must keep the behavior an earlier phase wrote.

## Phase 1: Unit frame box

**Goal.** A pure function returns the padded, clamped camera box, and a second pure function reports the hex steps. No Leaflet and no renderer.

**Create.** [`src/shared/unitFrameBox.ts`](src/shared/unitFrameBox.ts) and [`src/shared/unitFrameBox.test.ts`](src/shared/unitFrameBox.test.ts).

**Behavior.** Export `UNIT_FRAME_PAD_HEXES` as `3`. Export a box type with `south`, `west`, `north`, `east`. Export `unitFrameBox` with one argument object: `unit`, `latStep`, `lngStep`, `panelWidthPx`, `panelHeightPx`, `limit`. The caller has already unwrapped longitude so `west <= east`.

- Panel width or height less than or equal to 0, or a non-finite edge: return null.
- Mercator x is longitude in radians. Mercator y is `ln(tan(π/4 + lat/2))` with latitude in radians. `boxAspect` is width over height in that space. `panelAspect` is `panelWidthPx / panelHeightPx`. Pad longitude when `boxAspect >= panelAspect`. Otherwise pad latitude.
- Each side of the chosen axis grows by `(UNIT_FRAME_PAD_HEXES / 2) * step`. A step that is not a positive finite number adds 0.
- Then clamp each edge into `limit`. If the result has `south > north` or `west > east`, return null.
- Export `hexCenterSteps(h3Index)`. Neighbors come from `gridDisk(h3Index, 1)` except the cell itself. Align each neighbor longitude to within 180° of the cell center. `latStep` is the max absolute latitude delta. `lngStep` is the max absolute aligned longitude delta. Return null when there is no finite neighbor delta. A dateline neighbor must not produce a step near 360°.

**Tests.** Use boxes near the equator so a degree of latitude and a degree of longitude are almost the same Mercator size.

- Unit box longitude 0 to 10, latitude 0 to 1, both steps 1, panel 100 by 100, limit large enough to hold the pad. Result longitude is -1.5 to 11.5. Latitude stays 0 to 1.
- Unit box longitude 0 to 1, latitude 0 to 10, same steps and panel. Result latitude is -1.5 to 11.5. Longitude stays 0 to 1.
- Unit box longitude 0 to 2, latitude 0 to 2, panel 200 by 200. Pad longitude, not latitude.
- Unit box longitude 0 to 2, latitude 0 to 1, steps 1, limit longitude 0 to 3 and latitude -10 to 10. The pad would reach longitude -1.5 and 3.5. The result longitude is 0 to 3. Latitude is unchanged.
- Panel width 0 returns null.
- `hexCenterSteps(latLngToCell(0, 0, 1))` from `h3-js` returns two positive finite steps, and the longitude step is less than 180.

**Doc.** None.

**Verify.** `npm test`.

## Phase 2: Strategic camera

**Goal.** While a match is automatic, the main map frames visible units at the start of each strategic planning turn. Pan limits stay the loaded map.

**Read first.** [`src/renderer/map/mapExtent.ts`](src/renderer/map/mapExtent.ts) (`loadedMapExtentTarget`, `applyLoadedMapExtent`, `restoreLoadedMapExtent`), [`src/renderer/map/tacticalMapView.ts`](src/renderer/map/tacticalMapView.ts) (`exitTacticalMapView`), [`src/renderer/gameplay/observeChrome.ts`](src/renderer/gameplay/observeChrome.ts), [`src/renderer/gameplay/observeIntent.ts`](src/renderer/gameplay/observeIntent.ts), and [`src/renderer/openRouter/resolutionPlaybackDeferral.ts`](src/renderer/openRouter/resolutionPlaybackDeferral.ts) (`onResolutionPlaybackFinished`).

**Behavior.** Put the gate in [`src/shared/unitFrameBox.ts`](src/shared/unitFrameBox.ts) so it can be tested without the DOM. `shouldApplyAutomaticUnitFrame` takes one argument object and is true only when `observing`, `autoAdvance`, `inBattle` is false, `phase` is `planning`, `playbackRunning` is false, and `framedTurnNumber` is not `turnNumber`.

Frame from a new renderer module [`src/renderer/map/unitFrameCamera.ts`](src/renderer/map/unitFrameCamera.ts). Build the unit box and the limit box in the unwrapped frame. The limit is `loadedMapExtentTarget()`, or the Mercator world when that target is `'world'`. Panel size is the main map element's `clientWidth` and `clientHeight`. Call `fitBounds` with padding `[2, 2]` and `animate: false`. That padding is two pixels. It is not the 3-hex pad. Construct the Leaflet bounds the way `applyLoadedMapExtent` does, with `noWrap` true. Do not change max bounds, min zoom, world copy, or the minimap.

Remember the framed turn number in renderer state. Clear it when a new match loads.

Call the frame only when the gate is true, and only from these moments:

- After resolution playback finishes (`onResolutionPlaybackFinished`), when no battle is about to open. `holdObserveAutoAdvanceForBattleEntry` is set while a watched match is waiting to enter a battle. Add a getter next to it if the flag is private, and skip the strategic frame while that hold is true. The battle camera takes over. Frame that planning turn after the battle exits.
- When Ready finishes with no playback and no battle entry.
- When auto-advance turns on (`chooseWatchTheRest` and the checkbox listener in `wireObserveMode`) and the gate is true. Turning it on during playback does not frame. The playback-finished listener frames the planning turn that follows.
- Inside `tacticalPerformBattleExit`, after `exitTacticalMapView()` returns and before `runReadyAfterExit`. `exitTacticalMapView` sets the view back to `strategicScenarioInitialLeafletView`. A frame before that return is overwritten. On an AI-only exit, `runReadyAfterExit` is empty and the real Ready is `maybeObserveAutoAdvance` after the exit, so this frame still happens before that Ready.

Do not call the frame from `applyGameStateSnapshot` or from a View as change.

**Tests.** Extend [`src/shared/unitFrameBox.test.ts`](src/shared/unitFrameBox.test.ts). The gate is false for a human roster, for observing with auto-advance off, during playback, in a battle, and for a turn already framed. It is true for observing, auto-advance on, planning, and an unframed turn.

**Doc.** In [`doc/ux/map-surface.md`](doc/ux/map-surface.md), state the automatic frame, the one-axis pad, the pan-limit rule, and that each later planning turn does move this camera while the match stays automatic. Keep the existing sentence that a later snapshot does not refit the loaded footprint. In the loaded-map-extent row of [`doc/README.md`](doc/README.md), name `UNIT_FRAME_PAD_HEXES` and `unitFrameBox` as the automatic camera, and point at map-surface for the player rule.

**Verify.** `npm test`, then `npm run build:renderer`.

## Phase 3: Tactical camera

**Goal.** An automatic AI-only battle frames living sub-units the same way, at battle entry and after each beat's playback, when the next beat is in planning. Pan stays inside the battle area. The observer can still zoom out to the whole battle footprint.

**Read first.** [`src/renderer/map/tacticalMapView.ts`](src/renderer/map/tacticalMapView.ts) and [`src/renderer/gameplay/readyTacticalCommit.ts`](src/renderer/gameplay/readyTacticalCommit.ts).

**Behavior.** Add `shouldApplyAutomaticBattleFrame` beside the strategic gate. One argument object. True only when observing, auto-advance is on, a battle is open, playback is not running, and `framedBeatNumber` is not the current `tacticalTurnNumber`.

On automatic entry, do not fly to the footprint and do not schedule `finalizeTacticalViewZoomAndPan`. That timeout sets min zoom from whatever zoom is current, which would lock the camera at the unit frame. Do this instead, all with `animate: false`:

1. Fit the battle footprint, the same corners `enterTacticalMapView` uses today.
2. Read that zoom and `setMinZoom` to it, so zoom-out stops at the whole battle.
3. `setMaxBounds` to that battle area.
4. Fit the unit frame. If the unit frame is null, leave the camera on the battle footprint from step 1.

When playback finishes, the battle is still open, and the battle gate is true, fit the unit frame only. Do not change max bounds or min zoom. Skip that fit when the battle has already ended (`aiOnlyEndReason` is set, or the snapshot is already gone). The exit path frames the strategic map instead. When auto-advance turns on during a battle and playback is not running, fit once for the current beat if it has not been framed.

Human and semi-automatic entry keep the existing fly, the 750 ms finalize, and no per-beat refit. An empty sub-unit list does not move the camera off the battle footprint.

**Tests.** The battle gate is false when auto-advance is off, when playback is running, and when the beat was already framed. It is true for an automatic battle whose current beat has not been framed and whose playback is not running.

**Doc.** Update the tactical rows in [`doc/ux/map-surface.md`](doc/ux/map-surface.md). Automatic battles start on the unit frame and refit when each beat's playback ends. Other battles still frame the battle area. Pan stays in the battle area in every battle. Zoom-out in an automatic battle still reaches the battle footprint.

**Verify.** `npm test`, then `npm run build:renderer`.

## Phase 4: Remember units the battle destroyed

**Goal.** Ending a battle returns every strategic unit that battle removed, with the facts the popup needs. No toast yet.

**Read first.** [`deleteStrategicParentUnitAndApplyTransportOutcome`](src/main/gameActions/sealift.ts), [`syncStrategicUnitsDbWhenTacticalParentsEliminated`](src/main/tacticalBattle/tacticalStrategicOrderPhases.ts), `applyHumanVoluntaryBailoutStrategicParentElimination` and the three `endTacticalBattleSession*` functions in [`src/main/tacticalBattle/tacticalBattleSession.ts`](src/main/tacticalBattle/tacticalBattleSession.ts), `buildLossFlagFacts` in [`src/shared/lossFlagFacts.ts`](src/shared/lossFlagFacts.ts), and the weather and tech options at the `buildLossFlagFacts` call in [`src/main/gameActions/readyStrategicResolutionPipeline.ts`](src/main/gameActions/readyStrategicResolutionPipeline.ts). The IPC handler that returns `{ success: true }` is `IPC_GAME.endTacticalBattle` in [`src/main/main.ts`](src/main/main.ts). `EndTacticalBattleIpcResult` is in [`src/shared/tacticalBattleTypes.ts`](src/shared/tacticalBattleTypes.ts). The bailout tests are in [`src/main/tacticalBattle/tacticalBattleSession.test.ts`](src/main/tacticalBattle/tacticalBattleSession.test.ts).

**Behavior.** Add [`src/shared/destroyedBattleParent.ts`](src/shared/destroyedBattleParent.ts) with type `DestroyedBattleParent`: `id`, `ownerId`, `unitType`, `displayName`, `h3Index`, and optional `origin`, `formedTurn`, `weatherTags`, `techLevel`. Display name is the base name, with no side prefix.

Add [`src/main/tacticalBattle/destroyedBattleParents.ts`](src/main/tacticalBattle/destroyedBattleParents.ts) to hold the list. Clear it when a battle starts. `takeDestroyedBattleParents` returns the list and clears it. Log at debug when a unit is recorded and when the list is taken, with counts and ids. A missing row is skipped, not thrown.

Change `deleteStrategicParentUnitAndApplyTransportOutcome` so it returns every strategic unit it actually removed, including transport fallout, captured before the corresponding `DELETE`. Read origin and formation the same way the live snapshot does. Build flag facts with `buildLossFlagFacts` and the same weather and tech options the ready pipeline uses. Copy that call. Do not invent a second rule. A unit with no origin has no flag facts. Build display names with `buildUnitDisplayNameLookup` on the roster before the deletes. Use `fallbackDisplayNameFromUnitId` only when the id is absent from that lookup. If the parent row is already gone, return an empty list and delete nothing more.

Both current callers of that delete function append the returned units to the battle list. Do not record the same id twice. The three session-end functions return the taken list after bailout deletes have been recorded. `endTacticalBattleSession` (no bailout) still returns parents already recorded during beats. The IPC handler puts that array on `destroyedParents` for every success result, including an empty array. Do not change the channel string.

**Tests.** In [`src/main/tacticalBattle/tacticalBattleSession.test.ts`](src/main/tacticalBattle/tacticalBattleSession.test.ts), using the fixture style already in that file:

- A parent removed by the exit threshold is on the list returned by the bailout end, with its id, owner, type, and a non-empty display name.
- While a battle is active, `syncStrategicUnitsDbWhenTacticalParentsEliminated` with that parent in `subsBefore` and not in `subsAfter` records the parent. A parent that still has a sub-unit is absent. Take the list in the test so it does not leak.
- Calling the delete for an id that is already gone does not add a second row.

Do not add a test that only checks SQL text.

**Doc.** None.

**Verify.** `npm test`.

## Phase 5: Held strategic popup

**Goal.** The launch turn's update popup waits until the battle ends, then includes the destroyed-in-battle line. Turns with no battle are unchanged. A battle that did not come from a resolved turn still reports its destroyed units on the Ready that follows the exit.

**Read first.** [`announceResolutionTurnUpdate`](src/renderer/gameplay/readyResolutionAnnouncements.ts), the `needsAnimation` block and `offerHumanKnockoutChoice` in [`src/renderer/gameplay/readyHandler.ts`](src/renderer/gameplay/readyHandler.ts), [`buildTurnLossSections`](src/shared/turnLossSections.ts), [`buildConsolidatedTurnUpdateToastMessage`](src/shared/consolidatedTurnUpdateToast.ts), [`splitLossCauseLineForUnitFlags`](src/shared/lossToastUnitSegments.ts), [`buildUnitOriginByLossDisplayName`](src/renderer/core/unitOriginFlags.ts), [`tacticalPerformBattleExit`](src/renderer/tactical/tacticalExitFlow.ts), [`leaveAiOnlyBattle`](src/renderer/tactical/tacticalExitFlow.ts), [`performTacticalBattleExitWithGameApi`](src/renderer/tactical/tacticalEntryFlow.ts), and [`startTacticalBattleFromEntryHex`](src/renderer/tactical/tacticalEntryFlow.ts). Existing tests: [`src/shared/turnLossSections.test.ts`](src/shared/turnLossSections.test.ts) and [`src/shared/lossToastUnitSegments.test.ts`](src/shared/lossToastUnitSegments.test.ts).

**Behavior.** Add [`src/shared/destroyedInBattleLine.ts`](src/shared/destroyedInBattleLine.ts). `visibleDestroyedParents` keeps a unit when the viewer is null, or the owner is the viewer, or `h3Index` is in the visible set. `formatDestroyedInBattleLine` returns the one sentence, or an empty string when given no units. Use `LOSS_TYPE_NAME_LIST_MAX`. Do not call `formatLossEntries`, because that writes `6x`.

Add optional `battleLinesByOwner` to the argument object of `buildConsolidatedTurnUpdateToastMessage` and pass it into `buildTurnLossSections`. That is one more field on the existing object, not a new positional parameter. `buildTurnLossSections` gains one parameter, the map, defaulting to an empty map. That is its sixth parameter. Do not add a seventh. `orderedOwners` and `sectionLines` may take the same map. An owner who has only that line is still ordered and still gets a section. Inside the section the order is cause lines, the battle line, strike lines, hex lines. Do not put the sentence in the Updates section. Omitting the map leaves every existing toast string unchanged.

Teach `splitLossCauseLineForUnitFlags` to recognize a body that ends with ` destroyed in battle.`. Split the front on `, `. A known display name is a unit segment. A token matching `^(\d+) (Naval|Air|Armored|Infantry|Missile)$` that is not a known name is a group segment, so the existing type icon paints. The suffix, including the leading space and the period, is a plain segment. Lines that start with a `LOSS_CAUSE_LABELS` prefix keep today's `4x` parsing. A battle line must not fall through to the hex-sentence flag path.

When the ready result has `tacticalAutoStartH3Index`, stash the toast inputs in a new renderer module [`src/renderer/gameplay/heldBattleTurnUpdate.ts`](src/renderer/gameplay/heldBattleTurnUpdate.ts) and do not call `showMapToast`. Do this even when `needsAnimation` is false, so a battle with no other strategic animation can still show later. Stash the visible-hex set, the viewer, the seats, the launch-turn report tag, and the inputs `announceResolutionTurnUpdate` already collects. Keep [`src/renderer/gameplay/readyHandler.ts`](src/renderer/gameplay/readyHandler.ts) to a call. The world-map animation still starts when there is something to animate.

`tacticalPerformBattleExit` does not show the hold. Before `runReadyAfterExit`, attach `destroyedParents` from the end result. If a hold exists, attach them to the hold. If no hold exists, store them for the next strategic `announceResolutionTurnUpdate` only. That next announce consumes them and does not leave them for a later turn.

Show the hold, when it has text, from exactly two places, after Ready has returned:

- `performTacticalBattleExitWithGameApi`, after `tacticalPerformBattleExit`. The human Ready ran inside the exit.
- `leaveAiOnlyBattle`, after `maybeObserveAutoAdvance` when auto-advance is on, and after the exit when it is off. Do not show before that Ready. An early return because the battle snapshot is still set does not show and does not clear the hold.

Showing files the Reports entry with the launch turn's tag, through the existing `showMapToast` report option. Clear the hold when it is shown. `rememberUnitOrigins` must run for the destroyed parents the same way it runs for ready casualties. Then `buildUnitOriginByLossDisplayName`, then merge battle-parent flags for names that are not already in that map. Two parents of one side with the same display name and different origins get no flag for that name, which is the rule already in that function.

If the end IPC fails, keep the hold and the battle. If start fails after a hold (`startTacticalBattleFromEntryHex`), show the strategic message without battle lines, when it is non-empty, and clear the hold. `offerHumanKnockoutChoice` returning `'ended'`, and a new match (`tacticalReleaseRendererSessionForNewStrategicMatch` and new-game start), drop the hold without showing.

**Tests.**

- One named infantry and six armor become `III Infantry, 6 Armored destroyed in battle.` Use the display names you pass in. Assert the string, not the flag DOM.
- Four infantry and no other type become `4 Infantry destroyed in battle.`
- Three infantry stay three names.
- An empty list is an empty string.
- All-sides keeps every parent. A seat viewer keeps its own parent off the visible set, keeps an enemy parent on a visible hex, and drops an enemy parent off the visible set.
- In [`src/shared/turnLossSections.test.ts`](src/shared/turnLossSections.test.ts): a section with only the battle line is `## Your Losses` then that line, and it does not contain `Ranged attack` or `## Updates`. A section that also has a ranged loss prints the ranged line first. A call that omits the map still matches the previous string for a ranged-only section.
- In [`src/shared/lossToastUnitSegments.test.ts`](src/shared/lossToastUnitSegments.test.ts): the splitter marks `III Infantry` as a unit name, `6 Armored` as an armor group, and leaves ` destroyed in battle.` plain. A normal `Ranged attack: 4x Infantry` line still groups with `4x`.

**Doc.** In [`doc/ux/notifications-and-feedback.md`](doc/ux/notifications-and-feedback.md), describe the line, its place in the section, the name and group rules, and that flags and the type icon match the other loss lines. Say a battle opened by Fight holds that turn's popup until the battle ends and the following Ready has returned, and that the held popup is the one left on screen. In [`doc/ux/resolution-playback.md`](doc/ux/resolution-playback.md), say the world-map animation still finishes before the battle, and the strategic update toast for that turn waits until the battle ends. Search [`doc/how-to-play.md`](doc/how-to-play.md) and [`doc/ux/reports-tab.md`](doc/ux/reports-tab.md). Update a sentence only when it now states the wrong time or the wrong loss line. Do not edit prompt docs.

**Verify.** `npm test`, then `npm run build:renderer`.
