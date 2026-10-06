# Source File Decomposition Execution Plan

The executing agent follows this plan phase by phase, in order.

## Goal

Bring every in-scope source file to 1,000 physical lines or fewer without changing behavior. The four files over that cap are the whole scope. The next file is 988 lines and stays as it is.

Current sizes, by `(Get-Content -LiteralPath <file>).Count`:

- `src/renderer/renderer.ts`: 3,332 lines
- `src/main/tacticalBattle/tacticalRes4MovementPlanner.test.ts`: 1,428 lines
- `src/main/rendererConsolidation.test.ts`: 1,217 lines
- `src/main/gameActionsMultiSelect.test.ts`: 1,158 lines

`renderer.ts` keeps its filename. It is the esbuild entry for `npm run build:renderer`. Do not hand-edit `static/renderer.js`.

## Ground Rules

1. **Behavior preservation.** Cut and paste function bodies. The only text change allowed on a function whose body a test reads is adding `export` before `function`. Do not add a parameter. Do not rewrite a call as `deps.something()`. Source tests match exact substrings such as `drawGameScene(ctx, w, h, S.gameState);`, `hideStackCallout();`, and `await refreshGameStateAfterSealiftChange()`.
2. **Same spelling.** A name used inside a moved function must still resolve to the same behavior under the same spelling. Import an existing export under that spelling, or move the callee with it. Do not import `src/renderer/renderer.ts` from a module that `renderer.ts` imports. If that would cycle, move the shared callee to a third file, or bind the one cycling name through a module-level `let` of the same spelling, assigned from `init` before any listener runs. Use that late bind only for an untested wrapper.
3. **Function declarations.** `getFunctionSource` in `src/main/testSupport/rendererSourceAssertions.ts` matches `function name(`, including `export` and `async`. A re-export does not satisfy it. Do not convert functions to arrow consts.
4. **Do not delete a tested body.** Search `src/main/**/*.test.ts` for the function name first. If a test reads the body, move the whole function, including comments inside the body. Contract-anchor comments are part of the asserted text.
5. **Assertions.** When a test reads `renderer.ts` and checks several substrings, split the assertion only if those substrings no longer share one file. Keep every substring. One allowed message edit: `inferUnitTypeLabelFromId must remain declared in renderer.ts` may name the new file after that function moves. `function inferUnitTypeLabelFromId` must still exist. A comment-only anchor such as `btnEl.style.display = S.airStrikeModeActive ? 'none' : 'inline-block';` may be checked against the file that already contains that text as live code (`src/renderer/gameplay/tacticalOrders.ts`). Delete the comment-only copy only after that assertion passes.
6. **`init` stays.** Strings asserted against `init` stay inside `init` in `renderer.ts`. `init` and the `DOMContentLoaded` bootstrap stay in `renderer.ts`.
7. **Naming.** New files are camelCase under the existing folder for that job (`map/`, `rendering/`, `gameplay/`, `core/`, `testSupport/`). Allowed role suffixes are only `Handler`, `Helpers`, `Guards`, `Adapter`, `Pipeline`, `Core`, and `Types`. Never use `Utils`, `Impl`, `Manager`, `Service`, `Processor`, or `Controller`. Never write a plan section name into code, comments, tests, or config.
8. **Orienting comments.** Follow `.spec/completed/orienting-comments-style-contract-v1.md`. Every module-scope function, type, and mutable binding in a file this work creates or edits has one `/** */` block immediately above it: a summary line, then Purpose, When to use, Expected outcome, and Exceptions. A block that already has those parts stays, including generic blocks. Add a block only where one is missing. `drawGameScene` has none; add one above it, not inside the body. This includes declarations left in the original file. Do not run `orienting-comments:apply`.
9. **No new logs.** This work does not add public backend methods. Do not add log calls.
10. **Frozen literals.** Do not change IPC channel strings, LLM tool names, SQL, or other frozen string values.
11. **Never commit or push.**
12. **Line count.** Physical lines, including blanks and comments. `Measure-Object -Line` is the wrong count. A file over 1,000 fails that phase. Do not split further only to reach the 600-line preference.
13. **One phase at a time.** Finish that phase's verification before the next. If verification fails and the cause is not clear after two focused attempts, stop and report the command and output.

## Phase 1: Planner Tests

Cut `src/main/tacticalBattle/tacticalRes4MovementPlanner.test.ts` immediately before:

`test('classifyLandInfantryArmorEnterStep: armor into mountain without transport is base (infinite cost)'`

Keep the original file for the tests above that line. Create `src/main/tacticalBattle/tacticalRes4MovementPlannerStepLegality.test.ts` for that test through the end. Both stay `node:test` files. Keep relative order. Copy only the imports each file still uses.

The first file needs `planTacticalRes4March`, `tacticalNavalHasMovableNeighborInFootprint`, `res4GridDiskNeighborsOrdered`, `buildTacticalTerrainKindResolverFromSnapshot`, `firstRingCellDistinctFrom`, and `tacticalRes4Cell`.

The second file needs those plus `buildLandMarchStepLegalityDetailAlongPath`, `classifyLandInfantryArmorEnterStep`, `summarizeLandMarchStepLegalityAlongPath`, and `pairedTransportSidesForAdjacentHexes`. Drop `tacticalNavalHasMovableNeighborInFootprint` from the second file if nothing there calls it.

Verify:

```text
npm run build:main
node --test dist/main/tacticalBattle/tacticalRes4MovementPlanner.test.js dist/main/tacticalBattle/tacticalRes4MovementPlannerStepLegality.test.js
```

Both files must be at or under 1,000 lines.

## Phase 2: Multi-Select Fixtures

Create `src/main/testSupport/gameActionsMultiSelectFixtures.ts`. Move these helpers verbatim, and export them. Keep them in one module because they call each other.

- `withTempDb`
- `findNearestLandSeaportHex`
- `findAdjacentNavalPassableHex`
- `isOpenOceanLandMass`
- `findPureLandDestinationHex`
- `findAdjacentMixedTransitHex`
- `findOpenOceanHexPair`
- `setHumanControlledPort`
- `findAirportPairByDistance`
- `setArcticTerrain`
- `positionLandUnitOnAdjacentWaterPorts`
- `findAdjacentHex`
- `findAdjacentNonArcticLandHex`
- `findWaterHexWithAdjacentLand`
- `findCoastalHexWithAdjacentLand`

`findCoastalHexWithAdjacentLand` has no orienting comment. Add one above it. Leave every other comment as it is.

Leave every `test*` function and `run()` in `src/main/gameActionsMultiSelect.test.ts`, in the same order. Move helper-only imports into the fixture module (`withTempGameDb`, `resetHumanMarchPreviewDiagnosticsForTests`, `gridDisk`, `gridDistance`, `getRes1LandMassByH3`, `hexHasSeaport`, `landUnitCanOccupyHex`, `canLandUnitTraverseEdge`, `hexSupportsMixedLandAndNaval`, `dbGetOne`, `dbRun`, `getGameState`). Do not leave the test file importing a symbol only a helper uses.

If the test file is still over 1,000 lines, move `testPreviewEmbarkedLandUnitOnWaterShowsInvalidWithoutPathPlanning` through `testReadyIncludesEmbarkedCargoFollowMoveForNavalMovement` into `src/main/gameActionsMultiSelectEmbark.test.ts` with its own `run()`, and add `dist/main/gameActionsMultiSelectEmbark.test.js` to `scripts/verify-modularization-tests.manifest`.

Verify:

```text
npm run build:main
node --test dist/main/gameActionsMultiSelect.test.js
```

## Phase 3: Popover Contract Tests

Move these functions and their comment blocks out of `src/main/rendererConsolidation.test.ts`, and remove them from `run()` without reordering the calls that stay:

- `testStackCalloutSingleUnitNonShiftClosesPopup`
- `testStackSealiftEmbarkedSelectionAndDebarkControls`
- `testModifierDrivenPopoverCloseRulesCentralized`
- `testHoverOrderPlanningInteractionLock`

Create `src/main/rendererStackPopoverContracts.test.ts` with the same `run()` style. Import `fs`, `path`, `assert`, and `getFunctionSource` from `./testSupport/rendererSourceAssertions`. Do not change assertion strings. They still read `renderer.ts`.

If `rendererConsolidation.test.ts` is still over 1,000 lines, also move `testInfrastructureGlyphSetsComeFromRes4Overrides` and stop.

Add this line to `scripts/verify-modularization-tests.manifest` immediately after `dist/main/rendererConsolidation.test.js`:

```text
dist/main/rendererStackPopoverContracts.test.js
```

Verify:

```text
npm run build:main
node --test dist/main/rendererConsolidation.test.js dist/main/rendererStackPopoverContracts.test.js
```

Phases 1, 2, and 3 do not share files. A failure in one does not require reverting the others.

## Phase 4: Stack Callout

Move the stack popup and sealift section into `src/renderer/map/stackCallout.ts`. Start at `formatStackTooltip` through `refreshStackCalloutIfOpen`, including `stackCalloutNonSelectableUnitIds` and `sealiftSectionRenderGeneration`. Also move `hideBuildPopup` so `dismissMapDetailPopoversIfHoverPlanningActive` can keep calling `hideBuildPopup()`. Export the functions `init` and map wiring still call.

Inside the new file, calls between these functions stay as they are.

- Import `replaceSelection`, `addUnitsToSelection`, `removeUnitsFromSelection`, and `toggleUnitSelection` from `src/renderer/core/selection.ts` under those names. Do not route them through the one-line wrappers in `renderer.ts`.
- `renderSealiftSection` calls `await refreshGameStateAfterSealiftChange()`. Leave `refreshGameStateAfterSealiftChange` and `applyGameStateSnapshot` in `renderer.ts` with their bodies unchanged. In the stack file, `refreshGameStateAfterSealiftChange` is a module-level `let` assigned from the start of `init`, before any listener runs, to that same local function. Do not import `applyGameStateSnapshot` from `stateSnapshot.ts`. That export takes a different parameter list. Do not move `applyGameStateSnapshot` into the stack file.
- `syncUiAfterSelectionChange` passes `refreshStackCalloutIfOpen` into its module helper. Keep that wrapper's body text. If the stack file imports the wrapper, the wrapper must not import the stack file. Assign `refreshStackCalloutIfOpen` from `init` into a module-level `let` of that same name in the file that owns the sync wrapper. Tested stack functions still call `syncUiAfterSelectionChange(...)` exactly as written.
- `hideStackCallout` calls `scheduleTerrainTooltipRestoreAfterPopoverClose`. Move `showTerrainTooltip`, `restoreTerrainTooltipAfterPopoverClose`, and `scheduleTerrainTooltipRestoreAfterPopoverClose` into the stack file if it stays at or under 1,000 lines. If it would exceed 1,000, put those three in `src/renderer/map/terrainTooltipRestore.ts` and import `scheduleTerrainTooltipRestoreAfterPopoverClose` under that name.

If `stackCallout.ts` is still over 1,000 after the tooltip split, move `renderSealiftSection`, `removeSealiftSection`, `buildSealiftUnitLabel`, and `setStackPopupNonSelectableUnitIds` into `src/renderer/map/stackCalloutSealift.ts`. `showStackCallout` must still contain `void renderSealiftSection(sorted, calloutEl);`.

Retarget `getFunctionSource` for `showStackCallout`, `refreshStackCalloutIfOpen`, `onStackSingleUnitToggleClick`, `onStackAllActionClick`, `renderSealiftSection`, `removeSealiftSection`, `setStackPopupNonSelectableUnitIds`, `applyStackCalloutSelectionButtonVisibility`, `applyModifierDrivenPopoverCloseRules`, and `dismissMapDetailPopoversIfHoverPlanningActive`. Also retarget `src/main/mapGestureWiring.test.ts`, which reads `hideStackCallout` from `renderer.ts`. The hover-planning test checks that one source contains both `dismissMapDetailPopoversIfHoverPlanningActive` and `dismissMapDetailPopoversForHoverPlanning`. After the move, check each substring in the file that still contains it. Do not drop either substring.

## Phase 5: Game Scene

Move `drawGameScene`, `redraw`, `resizeAndRedraw`, `tickResolutionMoveAnimation`, `requestRedraw`, and `mergeTacticalSubUnitsForMarchPlayback` verbatim into `src/renderer/rendering/gameScene.ts`. Add the orienting comment above `drawGameScene` only. Import callees under the names the body already uses (`drawTerrainHexes`, `drawHoverRoutePreview`, `hideStackCallout`, `inferUnitTypeLabelFromId`, and the rest). Do not add a deps parameter to `drawGameScene`.

Move `inferUnitTypeLabelFromId`, unchanged, to `src/renderer/core/unitTypeLabel.ts`. Point `getFunctionSource` at that file and update the one assertion message to name `unitTypeLabel.ts`. The check that `renderer.ts` contains `from './core/constants'` stays on `renderer.ts` until that import is unused. If lint requires removing it, point that half of the assertion at the file that still imports `./core/constants` for the air glyph, and keep the `air: 'S'` check on `src/renderer/core/constants.ts`.

`drawTerrainHexes` in `renderer.ts` is a wrapper whose body contains the comment `// if (res4Active) return;`. Move that wrapper unchanged into `gameScene.ts` so `drawGameScene` can still call `drawTerrainHexes(ctx)`. Do not merge it into the existing `export function drawTerrainHexes` in `terrainRendering.ts`, which takes a deps argument. Retarget the rubble-tooltip test to `gameScene.ts`.

Retarget reads of `drawGameScene`, `redraw`, and `resizeAndRedraw`, including both `ensureRangePerimeterAnimation(redraw);` hits in `src/main/rangePerimeterStroke.test.ts`. Both occurrences must remain inside the moved `drawGameScene`.

## Phase 6: Passthrough Wrappers

Continue only while `renderer.ts` is over 1,000 lines. Do not delete a wrapper whose body a test reads. Move that wrapper unchanged and retarget the test. A wrapper may be deleted only when no test reads its body and every remaining call site can call the module function without changing the body of a tested function. `init`'s comment anchors stay.

Batch order, with the phase verification between batches:

1. `core/selection.ts` wrappers (`replaceSelection`, `clearSelection`, hex-set helpers, and the other selection aliases)
2. `core/uiState.ts`, `gameplay/sidebarSupport.ts`, `gameplay/newGame.ts`
3. `gameplay/tacticalOrders.ts` and `rendering/hoverPreview.ts`
4. `rendering/terrainRendering.ts` wrappers (`drawRes4TerrainHexes`, infrastructure glyph wrappers). `drawTerrainHexes` already moved in Phase 5.
5. `openRouter/openRouterRuntime.ts` and `openRouter/openRouterControls.ts`
6. `core/stateSnapshot.ts` and `map/drawInteraction.ts`

If `renderer.ts` is still over 1,000, move these remaining real bodies verbatim:

- `syncBuildEntryButton` and `drawRes1ProductionOverlays` into `src/renderer/rendering/res1ProductionOverlays.ts`. Tests read both bodies (`if (res4On)`, `hideBuildPopup()`, `buildProductionOverlayContext(S.gameState)`, `if (!explored) continue;`). Retarget those reads. Do not append them to a file that would then exceed 1,000.
- `detailHitAtClientPixel` into `src/renderer/map/detailHit.ts` only if `renderer.ts` is still over 1,000.

Leave `init`, the `DOMContentLoaded` bootstrap, and `tacticalExitSessionAccessor` in `renderer.ts`. `src/main/tacticalExitSidebarRefreshContract.test.ts` reads `performTacticalBattleExit` from `renderer.ts`. Leave that function there unless the test is retargeted and these substrings still match the unchanged body: `performTacticalBattleExitWithGameApi`, `refreshSidebarAfterTacticalDraftTeardown`, `hideStackCallout`, `refreshStrategicOrderSidebars`, `refreshStrategicSnapshotAfterExit`, `getGameState`, `applyGameStateSnapshot`, `refreshStandingOrders: false`.

## Renderer Verification

After `npm run build:main` when a test file changed, run:

```text
npm run check:renderer-types
npm run build:renderer
npm run check:circular
node --test dist/main/rendererConsolidation.test.js dist/main/rendererStackPopoverContracts.test.js dist/main/mapGestureWiring.test.js dist/main/tacticalExitSidebarRefreshContract.test.js dist/main/rangePerimeterStroke.test.js
```

Then count lines. A file over 1,000, a cycle, or a failed test fails the phase. Fix that phase before the next.

## Last Check

On every file created or edited, add orienting comments only where a declaration has none. Then run `npm test`. Record final physical line counts for the four original files and every new file. All of them must be 1,000 or fewer.

Report stack popup, sealift section, and scene draw order as needing a human look. Tests pin the source text of those paths. They do not click the map.
