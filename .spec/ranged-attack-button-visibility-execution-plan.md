# Ranged Attack Button Visibility Implementation Plan

> **For agentic workers:** Implement this plan phase by phase, in order. Do not start a phase until the previous phase's verification commands pass. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide `#ranged-attack-btn` unless every currently selected unit can issue a direct ranged attack in the current theater, and hide it again when a later deselect leaves an empty or not-entirely-capable selection.

**Architecture:** One pure function in `src/shared/selectionSupportButtonMode.ts` decides `hidden`, `ranged`, or `strike` from unit types and whether a tactical battle is active. The sidebar writer and the button click handler both call it. Turning a targeting flag off from the sidebar drops any hover preview that sampled the old flag. Two order-commit paths that already clear the selection also call `updateRangedSidebar`, which they skip today.

**Tech Stack:** TypeScript, Electron renderer, Node `node:test` compiled by `npm run build:main` into `dist/shared` and `dist/main`. Run every command from the repo root.

## Global Constraints

- Do not commit or push.
- Do not put phase, stage, or plan identifiers into code, comments, tests, configuration, or lint messages. Headings in this plan stay here. Do not copy them into source.
- Directories and TypeScript files under `src/` use camelCase. Exported functions are camelCase. Exported types are PascalCase.
- Allowed role suffixes are `Handler`, `Helpers`, `Guards`, `Adapter`, `Pipeline`, `Core`, and `Types`. Do not use `Utils` or `Impl`.
- Do not rename frozen string values. `#ranged-attack-btn` stays. Do not change `unitHasDirectRangedPlanning`, `unitHasStrategicRangedBaseline`, `unitHasTacticalRangedBaseline`, the range tables, or [`src/main/openRouter/possibleUnitActions.ts`](src/main/openRouter/possibleUnitActions.ts). Air stays range-capable inside those range helpers because strike range and perimeter disks depend on them. `possibleUnitActions.ts` already excludes air with `unit.unitType !== 'air' && unitHasDirectRangedPlanning(...)`. The new button function must agree with that exclusion and must not be used to "fix" the action table.
- New and updated fields and non-overriding functions need an orienting comment saying why the symbol exists, when to use it, what to expect back, and what it throws. Use the comment text in this plan. Do not write a comment that only restates the signature. Do not rewrite unrelated boilerplate comments in files you touch.
- Test happy paths and essential failure cases only. Do not test pass-through wrappers.
- Renderer and shared modules do not take main-process debug or trace logging. Do not add a new main-process API. No IPC changes.
- Prefer a parameter object once a function would need more than six named arguments. The new function has two arguments; keep them as two arguments.
- Desirable source-file size is 600 lines, hard limit 1000. Do not split `tacticalOrders.ts`, `initCore.ts`, or `mainMapInteractions.ts` for this change.
- `npm test` rebuilds native modules. Do not run it.

## Locked behavior

`#ranged-attack-btn` is one element. While it is shown, its label is `Ranged`, `Cancel`, or `Strike`. Hidden means `style.display` is `none`. Do not clear or rewrite `textContent` in the hidden branch. An all-air selection still shows `Strike`, as it does today, including when several air units are selected.

`selectionSupportButtonMode` is a pure function of the current type list. It does not read renderer state and it does not remember the previous selection. A deselect is just a later call with the types that remain.

A unit is incapable of a ranged attack when any of these is true:

- Its type is `air`. Air uses Strike, and only when every selected unit is air.
- On the strategic map, `unitHasDirectRangedPlanning(unitType, false)` is false. With current tables that is infantry and any unknown type. Armor and naval are capable.
- In a tactical battle, `unitHasDirectRangedPlanning(unitType, true)` is false. With current tables infantry, armor, and naval are capable. Unknown types are not. Tactical infantry must keep showing Ranged. Do not copy the strategic infantry rule into the tactical branch.

Terrain, a shot already queued, and embark status do not hide the button by themselves. Do not add those checks.

Pass resolved `unit.unitType` strings, never unit ids. Callers already drop ids that do not resolve. Keep that filter. Do not treat a missing id as an incapable unit.

Recompute from the selection that remains:

- Empty selection: hide. Clear `rangedModeActive` and `airStrikeModeActive`.
- At least one selected unit is incapable, including air mixed with anything else: hide. Clear both mode flags.
- Every remaining unit can range: keep the button visible. If `rangedModeActive` is already true, the label stays `Cancel`. Do not clear `rangedModeActive` in this case. Do clear `airStrikeModeActive`, so a previous Strike latch cannot swallow the next click.
- Every remaining unit is air: show `Strike` using today's strike-control visibility. Clear `rangedModeActive` so a previous Ranged latch cannot swallow the next click. Do not clear `airStrikeModeActive` in this case.

When this sidebar update is what turns `rangedModeActive` or `airStrikeModeActive` from true to false, drop the hover preview that may already be in flight. `refreshHoverRoutePreview` samples those flags before its `await`, and [`hoverRoutePreviewAsyncContextStillValid`](src/renderer/gameplay/hoverRoutePreviewStale.ts) does not look at them. Without an invalidation, deselecting the ranged unit out of an armor-plus-air selection can publish a ranged hover line after the button has switched to Strike. Do this only on a true-to-false transition. A refresh that leaves both flags as they were must not bump `hoverPreviewRequestSeq` and must not call `refreshHoverRoutePreview`. Unconditional invalidation would cancel a march preview that the caller just started.

Map click, right-click clear, sidebar toggle, and stack-popup toggle already call `updateRangedSidebar` after they change `selectedUnitIds`. Do not add a second refresh inside `applyHumanUnitIconClickSelectionPolicy`.

Do not change `mapSelectionComposition` in [`src/shared/mapPlanningGesture.ts`](src/shared/mapPlanningGesture.ts). That classifier is for march and ferry gestures. It does not know theater ranged reach.

## Background the implementer needs

Read these before changing UI code.

1. Visibility is decided in [`src/renderer/gameplay/tacticalOrders.ts`](src/renderer/gameplay/tacticalOrders.ts) inside `updateRangedSidebar`. The click gate is duplicated in [`src/renderer/map/initCore.ts`](src/renderer/map/initCore.ts) on `#ranged-attack-btn`. Both currently treat a selection as ranged-capable when every resolved unit passes `unitHasDirectRangedPlanning`. That helper returns true for air. The all-air branch runs first and relabels the button Strike, so armor plus air falls through to Ranged and stays visible.
2. Two success paths clear the selection through `clearCommittedOrderDraftState` and then refresh the unit sidebar without refreshing the ranged button. After a successful grouped march or a successful air ferry, the button can stay on screen with nothing selected. Those paths are `commitGroupedMarchOrders` in [`src/renderer/map/mainMapInteractions.ts`](src/renderer/map/mainMapInteractions.ts) and the `planFerry` branch of `handleMainMapDoubleClick` in [`src/renderer/map/mapDoubleClickHandler.ts`](src/renderer/map/mapDoubleClickHandler.ts). The `deselect` branch already calls `deps.updateRangedSidebar()`. `case 'planMarch'` only awaits `commitGroupedMarchOrders`. Do not add a second `updateRangedSidebar` there.
3. `clearCommittedOrderDraftState` already nulls `hoverRoutePreview` and, because an empty `replaceSelection` clears both mode flags, a successful march or ferry does not need the new hover invalidation. It only needs the button refresh.
4. [`src/main/rendererConsolidation.test.ts`](src/main/rendererConsolidation.test.ts) asserts that both renderer files still contain the text `unitHasDirectRangedPlanning(unit.unitType, !!tb)`. Replacing that text requires updating the assertion in the same change, or that test fails.
5. The same test file asserts that [`src/renderer/renderer.ts`](src/renderer/renderer.ts) still contains the comment line `btnEl.style.display = S.airStrikeModeActive ? 'none' : 'inline-block';` inside `function updateRangedSidebar`. That comment is a retained anchor. Do not edit `renderer.ts`. The live assignment in `tacticalOrders.ts` must keep that exact expression in the strike branch. Also leave these call strings in `tacticalOrders.ts` unchanged: `formatPendingRangedAttackSidebarLabel(S.gameState, r, tacticalPositions)` and `formatPendingAirStrikeSidebarLabel(S.gameState, strike, tacticalPositions)`.
6. `commitGroupedMarchOrders` is nested and indented. [`getFunctionSource`](src/main/testSupport/rendererSourceAssertions.ts) only matches a function whose `function` keyword starts at column 0, so it cannot see this function. `handleMainMapDoubleClick` is top-level and `getFunctionSource` can see it. A file-wide search for `updateRangedSidebar` would already pass, because later click handlers call it. Bound the march assertion to that function's body.
7. On a failed march assignment, `commitGroupedMarchOrders` returns before `clearCommittedOrderDraftState`. Leave that return where it is. The new sidebar call belongs only on the success path, after the clear.

## Phase 1: Decision function

**Files:**

- Create: `src/shared/selectionSupportButtonMode.ts`
- Create: `src/shared/selectionSupportButtonMode.test.ts`
- Test: `dist/shared/selectionSupportButtonMode.test.js` after `npm run build:main`

**Produces:** `selectionSupportButtonMode(unitTypes: readonly string[], tacticalBattleActive: boolean): SelectionSupportButtonMode` where `SelectionSupportButtonMode` is `'hidden' | 'ranged' | 'strike'`.

- [ ] **Step 1: Write the failing test**

Create `src/shared/selectionSupportButtonMode.test.ts` in the same style as [`src/shared/selectionUnitIdSets.test.ts`](src/shared/selectionUnitIdSets.test.ts): `node:test` `describe` / `it`, `node:assert/strict`. No per-case boilerplate comments. Cover only these cases. Each one blocks a different wrong implementation.

Strategic (`tacticalBattleActive === false`):

- `[]` returns `hidden` (empty deselect)
- `['armor']` returns `ranged` (one capable unit stays available)
- `['armor', 'naval']` returns `ranged` (several capable units stay available)
- `['armor', 'infantry']` returns `hidden` (one incapable land unit hides Ranged)
- `['armor', 'air']` returns `hidden` (air is not a ranged attacker)
- `['air']` and `['air', 'air']` return `strike` (all-air stays Strike, including a multi-select)

Tactical (`tacticalBattleActive === true`):

- `['infantry']` and `['infantry', 'armor']` return `ranged`
- `['infantry', 'air']` returns `hidden`

- [ ] **Step 2: Run the test and confirm it fails**

```
npm run build:main
node dist/shared/selectionSupportButtonMode.test.js
```

Expected: fail because the module does not exist yet.

- [ ] **Step 3: Implement the function**

`src/shared/selectionSupportButtonMode.ts` imports `unitHasDirectRangedPlanning` from `./rangePerimeterModel`. Implement exactly this decision order:

1. Length 0 returns `hidden`.
2. Every type is `air` returns `strike`.
3. Every type is not `air` and `unitHasDirectRangedPlanning(unitType, tacticalBattleActive)` returns `ranged`.
4. Otherwise return `hidden`.

The `unitType !== 'air'` check in step 3 is required. `unitHasDirectRangedPlanning('air', ...)` is true, so without it armor plus air would return `ranged`. Step 2 must stay first, or an all-air selection would return `hidden` instead of `strike`.

Put this comment above the exported function:

```ts
/**
 * Chooses whether the shared support button offers Ranged, Strike, or nothing.
 *
 * Purpose: Mixed selections must hide Ranged when any selected unit cannot fire one, including air. All-air stays Strike.
 * When to use: Sidebar visibility and the `#ranged-attack-btn` click gate, on the strategic map and in a tactical battle.
 * Expected outcome: `hidden` for empty, mixed, strategic infantry, unknown types, or air combined with anything else. `strike` when every unit is air. `ranged` when every unit is non-air and has direct ranged planning in this theater.
 * Exceptions: None.
 */
```

- [ ] **Step 4: Re-run the Phase 1 command**

Expected: the test file passes. The button on screen is unchanged until the next phase.

## Phase 2: Use the decision in both UI gates

**Files:**

- Modify: [`src/renderer/gameplay/tacticalOrders.ts`](src/renderer/gameplay/tacticalOrders.ts) `updateRangedSidebar` button block (the `allAir` / `allHaveRanged` locals) and that function's orienting comment
- Modify: [`src/renderer/map/initCore.ts`](src/renderer/map/initCore.ts) `#ranged-attack-btn` click listener (the same two locals)
- Modify: [`src/main/rendererConsolidation.test.ts`](src/main/rendererConsolidation.test.ts) assertion that both files contain `unitHasDirectRangedPlanning(unit.unitType, !!tb)`

**Consumes:** `selectionSupportButtonMode` from the previous phase.

- [ ] **Step 1: Replace the duplicated booleans**

In both files, delete the `unitHasDirectRangedPlanning` import and import `selectionSupportButtonMode` from `../../shared/selectionSupportButtonMode`. Keep each file's existing unit lookup, including the click handler's `unit.player === 'human'` filter. Pass `selectedUnits.map((unit) => unit.unitType)` and `!!tb`.

Replace the orienting comment on `updateRangedSidebar` with:

```ts
/**
 * Rebuilds the pending ranged and air-strike rows and chooses Ranged, Strike, or neither for the current selection.
 *
 * Purpose: The shared button follows `selectionSupportButtonMode`. Clearing a targeting flag here must also drop a hover preview that sampled the old flag.
 * When to use: After a selection change, a pending-order change, or a targeting-mode toggle.
 * Expected outcome: Pending rows match the draft arrays. The button is hidden unless every resolved unit can range, or every resolved unit is air. `Cancel` stays while ranged mode is still valid. A true-to-false flag change nulls the hover preview, hides the block and slower tooltips, redraws, and starts one hover refresh.
 * Exceptions: None. Returns immediately when `#ranged-attacks-list` is missing, and then leaves the button untouched.
 */
```

In `updateRangedSidebar`, remember whether each targeting flag is true before changing it. Then replace the `allAir` / `allHaveRanged` chain:

- `strike`: set `S.rangedModeActive = false`. Keep today's Strike label and strike-control visibility. The button display line must stay exactly `btnEl.style.display = S.airStrikeModeActive ? 'none' : 'inline-block';`. Show the target-type and cancel controls only while `airStrikeModeActive` is set.
- `ranged`: set `S.airStrikeModeActive = false`. Show the button. Label `Cancel` when `S.rangedModeActive` else `Ranged`. Hide the strike target-type and cancel controls.
- `hidden`: keep today's else branch. `display: none`, both mode flags false, strike controls hidden. Do not change `textContent`.

After that chain, if either flag went from true to false:

- Set `S.hoverRoutePreview = null`.
- Call `showOrderBlockHexTooltip(null)` and `hideOrderSlowerHexTooltip()`. Both are already imported in this file.
- Call `deps.redraw()`.
- Call `void refreshHoverRoutePreview(deps)`. That function is already imported in this file. It increments `hoverPreviewRequestSeq`, which makes the older in-flight preview fail its stale check.

If neither flag changed, do none of those four steps.

Leave the `if (!listEl) return` guard where it is, before the button block. Leave the pending-order list loops unchanged.

In the click listener, after the existing "already in strike mode" and "already in ranged mode" toggles, replace the `allAir` / `allHaveRanged` start with:

- `strike` calls `beginHoverSupportTargetingMode(deps, 'air')`
- `ranged` calls `beginHoverSupportTargetingMode(deps, 'ranged')`
- `hidden` starts neither mode

Do not change `beginHoverSupportTargetingMode`. It already sets one flag, clears the other, and refreshes hover. The click that turns a mode on therefore does not need the sidebar's true-to-false path.

- [ ] **Step 2: Update the existing source assertion**

In `rendererConsolidation.test.ts`, replace the assertion whose message is `Ranged button enable/show must use theater-aware planning, not tactical baseline on the strategic map` with an assertion that both `initCoreSource` and `tacticalOrdersSource` include `selectionSupportButtonMode(`. Message: `Ranged and Strike button visibility must share selectionSupportButtonMode`.

Do not change the assertion that `renderer.ts` contains `btnEl.style.display = S.airStrikeModeActive ? 'none' : 'inline-block';`.

- [ ] **Step 3: Verify**

```
npm run build:main
node dist/shared/selectionSupportButtonMode.test.js
node dist/main/rendererConsolidation.test.js
node scripts/check-renderer-typecheck.cjs
```

Expected: all three pass. A failure in `rendererConsolidation.test.js` that names `unitHasDirectRangedPlanning(unit.unitType, !!tb)` means Step 2 was skipped. A failure that names the Strike `display` expression means `renderer.ts` was edited or the strike branch no longer uses that expression. The button still will not refresh after a successful march or ferry until the next phase.

## Phase 3: Refresh after a commit clears the selection

**Files:**

- Modify: [`src/renderer/map/mainMapInteractions.ts`](src/renderer/map/mainMapInteractions.ts) `commitGroupedMarchOrders`
- Modify: [`src/renderer/map/mapDoubleClickHandler.ts`](src/renderer/map/mapDoubleClickHandler.ts) `case 'planFerry'`
- Create: `src/main/selectionSupportButtonRefresh.test.ts`

**Consumes:** The previous phase's sidebar, which hides the button for an empty selection.

- [ ] **Step 1: Write the failing source test**

Follow the imports in [`src/main/mapGestureWiring.test.ts`](src/main/mapGestureWiring.test.ts): `readRendererSource` and `getFunctionSource` from `./testSupport/rendererSourceAssertions`.

Add a local `sliceIndentedFunction` that matches `getFunctionSource` except the signature regex allows spaces or tabs between the newline and `async function`. Use it only for `commitGroupedMarchOrders`. Put this comment above it:

```ts
/**
 * Extracts one indented function body from TypeScript source by brace depth.
 *
 * Purpose: `getFunctionSource` misses `commitGroupedMarchOrders` because that function is nested and indented.
 * When to use: This test only, for that nested function.
 * Expected outcome: The slice from `async function commitGroupedMarchOrders` through its matching closing brace.
 * Exceptions: Throws if the function is missing or unterminated.
 */
```

Assert all of the following:

- In the `commitGroupedMarchOrders` slice, the indexes increase in this order: `clearCommittedOrderDraftState()`, `deps.updateSidebar()`, `deps.updateRangedSidebar()`, `deps.redraw()`.
- In `getFunctionSource(doubleClickSource, 'handleMainMapDoubleClick')`, take the slice from `case 'planFerry'` up to but not including `case 'planMarch'`. The same four-call order holds there: `deps.updateSidebar()`, then `deps.updateRangedSidebar()`, then `deps.redraw()`. `clearCommittedOrderDraftState()` still occurs before `deps.updateSidebar()` in that slice.
- The `planMarch` slice, from `case 'planMarch'` through the end of `handleMainMapDoubleClick`, does not contain `updateRangedSidebar`.

Do not search the whole double-click function or the whole interactions file for `updateRangedSidebar`. Those searches pass before this change.

- [ ] **Step 2: Run it and confirm it fails**

```
npm run build:main
node dist/main/selectionSupportButtonRefresh.test.js
```

Expected: fail because those two success paths do not call `updateRangedSidebar`. A failure that says the function does not exist means the slice helper still requires column 0. Fix the helper, not the production indent.

- [ ] **Step 3: Add the two calls**

In `commitGroupedMarchOrders`, insert `deps.updateRangedSidebar();` immediately after the existing `deps.updateSidebar();` that follows `clearCommittedOrderDraftState`, and immediately before `deps.redraw();`. Do not place it above the `if (!assign.success)` return.

In `case 'planFerry'`, insert `deps.updateRangedSidebar();` immediately after `deps.updateSidebar();` and immediately before `deps.redraw();`.

`handleMainMapDoubleClick`'s deps already include `updateRangedSidebar`. `commitGroupedMarchOrders` already closes over `deps.updateRangedSidebar`. Do not clear pending orders. Do not call `clearMapSelectionChrome`. Do not edit `case 'planMarch'` or the `deselect` branch.

- [ ] **Step 4: Re-run the checks**

```
npm run build:main
node dist/main/selectionSupportButtonRefresh.test.js
node dist/shared/selectionSupportButtonMode.test.js
node dist/main/rendererConsolidation.test.js
node scripts/check-renderer-typecheck.cjs
npm run naming:check
```

Expected: all pass. `naming:check` compiles a small tool first. That is the naming gate. It is not `npm test`.

## Out of scope

- Changing who may legally fire, including terrain caps, queued shots, and embark blocks.
- Hiding Strike for an all-air selection.
- Hiding the button when one ranged-capable unit is removed but every unit still selected can range.
- Refactoring the pending-order lists inside `updateRangedSidebar`.
- Adding a `refreshHoverRoutePreview` field to `TacticalOrderDeps`. The sidebar file already imports that function.
- Editing `renderer.ts`, `possibleUnitActions.ts`, or `mapPlanningGesture.ts`.
