# Shift Key and Unmixed Opening Placement

> **For agentic workers:** Implement this plan phase by phase, in order. Do not start a phase until the previous phase's verification commands pass. Phases 3 and 4 both depend only on Phase 2; do Phase 3 before Phase 4 anyway. Steps use checkbox (`- [ ]`) syntax for tracking. Do not commit or push.

**Goal:** Shift replaces every game gesture that Ctrl triggers today, and the opening placement of a strategic game and of a tactical battle never puts human and opponent units in the same hex.

**Architecture:** The modifier rename is one atomic edit. A half-renamed `ctrlKey` tree does not compile and would leave some gestures on Ctrl. Opening placement gets two shared functions: one records which side holds a hex, and one lists hexes that hold both sides. Tactical opening placement and both strategic seeders call them. Same-side stacking at the start stays legal. Later-turn friendly stacking is not part of this work.

**Tech Stack:** TypeScript, Electron renderer, Node `node:test` on `dist` after `npm run build:main`.

## Global Constraints

- Do not commit or push.
- Do not put phase, stage, or plan identifiers into code, comments, tests, configuration, or lint messages.
- Directories and TypeScript files under `src/` use camelCase. Exported functions are camelCase. Exported types are PascalCase.
- Allowed role suffixes are `Handler`, `Helpers`, `Guards`, `Adapter`, `Pipeline`, `Core`, and `Types`. Do not use `Utils` or `Impl`. The new shared file has no role suffix.
- Do not rename frozen string values: IPC channel names, LLM tool names, SQL columns, vendor JSON fields. The breadcrumb `selection.ctrlToggle` and the reasons `ctrl_pressed` / `ctrl_released` are not frozen. Rename them as specified below.
- New and updated fields and non-overriding functions need an orienting comment saying why the symbol exists, when to use it, what to expect back, and what it throws.
- Test happy paths and essential failure cases only.
- Renderer and shared UI helpers do not take main-process debug or trace logging. New or updated public main-process functions do: debug on entry, error on every thrown failure and every catch, trace on getters that do not change state. Use `logDebug` and `logError` from `src/main/logger.ts`. Tactical code that only reads session state keeps `tacticalLogQuery`.
- A function that would need more than six named arguments takes one parameter object instead.
- Desirable source-file size is 600 lines, hard limit 1000. Do not split files for this work.
- Do not edit `static/renderer.js` by hand. Phase 1 regenerates it with `npm run build:renderer`.
- Do not edit other files under `.spec`, including `.spec/completed/` and `.spec/map-double-click-planning-and-deselect-execution-plan.md`. Those documents describe the old Ctrl gesture. Leave them.

## Locked behavior

**Shift replaces Ctrl for every current game gesture.** After Phase 1, holding or clicking with Ctrl does not multi-select, does not toggle build hexes, does not hide route lines, does not refresh or close the stack callout, and does not break a double-click gesture. Shift does all of those, with the same rules Ctrl uses today.

Keep one Ctrl read. In `src/renderer/map/initCore.ts`, the guard that ignores game hotkeys while a modifier is held must become:

```ts
if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
```

Ctrl stays in that guard so Ctrl+letter still does not pan the map or hide terrain. That is not a game gesture. A comment on that line may say Ctrl for that reason. No other `ctrlKey` read remains.

Do not call `preventDefault` on map `pointerdown` or on selection clicks because Shift is down. Selection runs on the `click` that follows `pointerdown`. Cancelling `pointerdown` can drop that `click`, and multi-select would stop working. The Leaflet map container already sets `user-select: none`.

**Opening placement.** A hex may hold several units of one side. It must not hold both sides. This applies when units are first placed: the world strategic seed, the region-vs-region strategic seed, and the tactical sub-units created when a battle snapshot is built. Movement, production, and mid-battle stacking stay as they are. Do not edit destination legality, prompt text, or march stacking.

When the only legal hexes are already held by the other side:

- A tactical sub-unit is not placed. The parent is reported through the existing skipped-parent list when fewer sub-units were placed than required. The battle still starts when both sides have at least one placed sub-unit (`tacticalSnapshotHasPlacedUnitsForBothSides`). It still refuses to start when one side placed nothing.
- A strategic flex unit is omitted. Log that omission at debug. Do not fail the seed for a flex collision.
- A required strategic infantry, armor, or naval spawn still fails the seed with a thrown `Error`. World seed already throws when it cannot find a hex. Region-vs-region seed throws only when a required unit has candidates, and every one of those candidates is already held by the other side. An empty candidate list still returns no hexes and does not throw. That empty return is how a side with no land, or no naval terrain, already drops that type.

Same-side sharing stays allowed. Do not tighten world-seed land and naval picks, which already reserve a hex in `usedH3` so two required units do not share it. Do not loosen region-vs-region round-robin, which may assign several units of one side to one hex. Do not filter with `occupiedByHex.has`. A hex already held by the same side is still legal.

## Background the implementer needs

Read these before editing.

1. **Ctrl is a held flag plus the click's own modifier.** `S.ctrlKeyActive` is set on Control keydown and cleared on Control keyup and window blur. Clicks also read `event.ctrlKey`. Call sites combine them with `||`. Preserve that shape with Shift: `event.shiftKey || S.shiftKeyActive`.
2. **Shift keydown stays behind the editable-target check.** In `wireInitCore`, Escape is handled first, then `shouldIgnoreGlobalKeydown`, then the modifier branch. Keep that order. If Shift is handled before the editable-target check, holding Shift while typing in an input sets the game modifier and hides routes. The click's own `event.shiftKey` still multi-selects when the keydown was ignored. Keyup stays ungated, matching Control today: releasing Shift always clears `S.shiftKeyActive` and runs the release rule.
3. **The stack callout copies the modifier at click time.** In `src/renderer/map/mainMapInteractions.ts`, a deferred callout sets `S.ctrlKeyActive` from `e.ctrlKey` when it opens, so the Select All versus Add All / Remove All header matches the click that requested the callout. Copy `e.shiftKey` the same way. Do not "fix" the deferred copy.
4. **Key-repeat must not rebuild the callout.** `shouldRefreshStackCalloutOnControlKeydown` returns true only on the inactive-to-active transition. The modifier branch sits before `if (e.repeat) return`. Keep that order for Shift.
5. **Double-click freezes the selection only when the modifier is up.** `resolveMapGesturePress` continues a gesture only when `ctrlKey` is false. A Shift press must start a fresh snapshot, the way Ctrl does today.
6. **Tactical opening placement does not remember who owns a cell.** The loop in `computeTacticalBattleSnapshot` walks ordered res4 cells and places every passable cell, wrapping up to three full passes (`cellCursor >= orderedForParent.length * 3`). Both sides therefore land on the same high-scoring cells. One occupancy map lives for the whole snapshot, outside the parent loop. Same-side wrapping must keep working. The other side skips those cells and uses a later passable cell. A new map per parent would let the second parent of the other side reuse the first parent's cells.
7. **Flex placement falls back onto a used hex.** `pickPreferredHex` and `pickPreferredCandidate` in `src/main/gameDb/seeding/initialFlexAirSlot.ts` return the first ranked hex when every candidate is already in `usedH3`. They do not return null. Do not change those two functions. A non-null flex result can be an enemy hex. Gate it with `claimInitialPlacementHex`. Same-side fallback stays: a flex unit may sit on a hex its own side already holds when nothing unused is left. Enemy fallback is omitted.
8. **World-seed flex currently ignores the other side.** `buildSideUnits` passes a set of only that side's hexes into `resolveFlexUnitPlacement`. Naval pools overlap, and the human flex unit is chosen before the opponent's naval pick. Land and naval required picks already share `usedH3`.
9. **Region-vs-region infantry and armor are assigned independently.** `assignSpawnHexesRoundRobin` can put armor on a hex that already has that side's infantry. The two home regions usually do not overlap. The new check skips a hex the other side already holds, and it still allows a hex the same side already holds.

## File map

- Create: `src/shared/initialPlacementSides.ts` — claim and mixed-hex scan.
- Create: `src/shared/initialPlacementSides.test.ts`.
- Rename: `src/shared/stackCalloutCtrlKeydown.ts` to `src/shared/stackCalloutShiftKeydown.ts`, and the matching `.test.ts`. Delete the old files.
- Modify for Shift: `src/shared/mapPlanningGesture.ts`, `src/shared/mapPlanningGesture.test.ts`, `src/renderer/core/state.ts`, `src/renderer/map/initCore.ts`, `src/renderer/map/mainMapInteractions.ts`, `src/renderer/map/mapClickSelectionPolicy.ts`, `src/renderer/map/drawInteraction.ts`, `src/renderer/gameplay/buildQueuePopup.ts`, `src/renderer/gameplay/sidebarSupport.ts`, `src/renderer/rendering/canvasPreviewPolicy.ts`, `src/renderer/renderer.ts`, `src/main/rendererConsolidation.test.ts`.
- Modify for placement: `src/main/tacticalBattle/computeTacticalBattleSnapshot.ts`, `src/main/tacticalBattle/computeTacticalBattleSnapshot.test.ts`, `src/main/tacticalBattle/computeTacticalBattleSnapshotDb.test.ts`, `src/main/gameDb/seeding/seedUnits.ts`, `src/main/gameDb/seeding/regionScenarioSeeding.ts`.
- Create: `src/main/gameDb/seeding/regionScenarioSeeding.test.ts`.

---

### Phase 1: Move every Ctrl game gesture to Shift

**Files:** the Shift list above. Do not touch placement files in this phase.

**Interfaces:**
- Consumes: nothing from later phases.
- Produces: `S.shiftKeyActive`, `MapGesturePressInput.shiftKey`, `shouldRefreshStackCalloutOnShiftKeydown(shiftKeyAlreadyActive: boolean): boolean`, popover reasons `'shift_pressed' | 'shift_released' | 'window_blur'`, breadcrumb `selection.shiftToggle`.

This phase is atomic. Do not stop after renaming one file. The project must compile at the end, with no gesture still reading Ctrl except the hotkey guard.

- [x] **Step 1: Rename the shared helpers and their tests**

Replace `src/shared/stackCalloutCtrlKeydown.ts` with `src/shared/stackCalloutShiftKeydown.ts`:

```ts
/**
 * Whether Shift keydown should rebuild stack-callout chrome (Select All vs Add All / Remove All).
 *
 * Purpose: Holding Shift generates key-repeat events. Rebuilding the open stack popup on each
 * repeat replaces the button under the cursor and cancels the subsequent click, so All and
 * per-unit actions appear to do nothing. Strategic and tactical battles share that popup.
 * When to use: Window Shift keydown, before applying shift-pressed popover rules.
 * Expected outcome: `true` only on the inactive-to-active transition; repeats while already held return `false`.
 * Exceptions: None.
 */
export function shouldRefreshStackCalloutOnShiftKeydown(shiftKeyAlreadyActive: boolean): boolean {
  return !shiftKeyAlreadyActive;
}
```

Delete the old module and its test. Write `src/shared/stackCalloutShiftKeydown.test.ts` with the same two cases, using the new names and saying Shift in the test titles.

In `src/shared/mapPlanningGesture.ts`, rename `MapGesturePressInput.ctrlKey` to `shiftKey`. In `resolveMapGesturePress`, continue the gesture only when `!input.shiftKey`. Update the orienting comment that says "without Ctrl" so it says "without Shift". In `src/shared/mapPlanningGesture.test.ts`, rename every `ctrlKey` field, including the shared `secondPressInPlace` fixture, and the test title that says ctrl. The assertion stays: a press with the modifier true returns the fresh-snapshot decision.

- [x] **Step 2: Rename renderer state and every reader**

In `src/renderer/core/state.ts`, replace `ctrlKeyActive` with `shiftKeyActive: false`. Replace the comment on that field with:

```ts
/**
 * True while Shift is held as the multi-select modifier.
 *
 * Purpose: Hides committed paths and hover previews, and switches the stack callout from Select All to Add All / Remove All.
 * When to use: Set on Shift keydown, cleared on Shift keyup and window blur. Clicks also read `event.shiftKey`.
 * Expected outcome: `false` whenever Shift is up and the window is focused.
 * Exceptions: None.
 */
```

Then replace every `S.ctrlKeyActive` and every selection or build `ctrlKey` / `eventCtrlKey` / `calloutCtrlKey` name with the Shift name. Boolean logic stays the same.

Exact call-site rules:

- `src/renderer/rendering/canvasPreviewPolicy.ts`: `return !S.shiftKeyActive` and `return !S.shiftKeyActive && S.selectedUnitIds.length > 0`. Comments say Shift, not Ctrl.
- `src/renderer/gameplay/sidebarSupport.ts`: `const useMultiSelect = event.shiftKey || S.shiftKeyActive`.
- `src/renderer/map/mapClickSelectionPolicy.ts`: parameter `shiftKey`. The branch that toggles selection runs when `args.shiftKey` is true. Breadcrumb string becomes `selection.shiftToggle`. The orienting comment that says "non-ctrl" says "non-shift".
- `src/renderer/map/mainMapInteractions.ts`: pass `shiftKey: e.shiftKey` into `resolveMapGesturePress` and into `applyHumanUnitIconClickSelectionPolicy`. Pass `e.shiftKey` into `tryHandleBuildEntryAtClientXY`. The dependency type and its comment use `eventShiftKey`. The deferred callout stores `const calloutShiftKey = e.shiftKey` and assigns `S.shiftKeyActive = calloutShiftKey`.
- `src/renderer/map/drawInteraction.ts`: rename `eventCtrlKey` to `eventShiftKey` on `tryHandleBuildEntryAtClientXY` and on the `handleBuildEntryClick` dependency. The hit test still does `eventShiftKey || S.shiftKeyActive`. Update the comment that spells the old parameter name.
- `src/renderer/renderer.ts`: the wrapper around `tryHandleBuildEntryAtClientXY` and `handleBuildEntryClick` use `eventShiftKey` and `shiftKey`. `onStackSingleUnitToggleClick` uses `if (!S.shiftKeyActive)`. `showStackCallout` uses `!S.shiftKeyActive` for Select All versus Add All / Remove All. The comment on `resolveUnitsForStackCalloutRefresh` that says Control keydown and `ctrl_pressed` says Shift keydown and `shift_pressed`.
- `src/renderer/gameplay/buildQueuePopup.ts`: rename the `ctrlKey` arguments of `processBuildEntryClick` and `handleBuildEntryClick` to `shiftKey`. `if (!shiftKey)` remains the plain-click path. Comments that say Ctrl say Shift.
- `src/renderer/map/initCore.ts`: the `handleBuildEntryClick` dependency uses `shiftKey`.

- [x] **Step 3: Retarget keydown, keyup, and blur**

In `wireInitCore` inside `src/renderer/map/initCore.ts`, import `shouldRefreshStackCalloutOnShiftKeydown` from `../../shared/stackCalloutShiftKeydown`.

Leave Escape handling and `shouldIgnoreGlobalKeydown` where they are. Replace the modifier branch with:

```ts
if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') {
  clearMapKeyboardPan();
  if (e.key === 'Shift') {
    const shiftKeyAlreadyActive = S.shiftKeyActive;
    S.shiftKeyActive = true;
    if (shouldRefreshStackCalloutOnShiftKeydown(shiftKeyAlreadyActive)) {
      deps.applyModifierDrivenPopoverCloseRules('shift_pressed');
    }
  }
  return;
}
if (e.repeat) return;
if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
```

Control, Alt, and Meta still clear pan and return. They do not set `shiftKeyActive`.

On keyup, clear the flag only for Shift. Do not wrap this in `shouldIgnoreGlobalKeydown`:

```ts
if (e.key === 'Shift') {
  S.shiftKeyActive = false;
  deps.applyModifierDrivenPopoverCloseRules('shift_released');
  return;
}
```

On blur, set `S.shiftKeyActive = false` and keep `applyModifierDrivenPopoverCloseRules('window_blur')`.

Change the reason union on `applyModifierDrivenPopoverCloseRules` in both `src/renderer/map/initCore.ts` and `src/renderer/renderer.ts` to `'shift_pressed' | 'shift_released' | 'window_blur'`. Press still calls `refreshStackCalloutIfOpen`. Release still calls `hideStackCallout`. Blur still refreshes. Update the orienting comment so it says Shift, and so it still says that repeat must not rebuild.

Update the two comment anchors in `init` in `src/renderer/renderer.ts` to the new reason strings. The consolidation test reads them:

```ts
// applyModifierDrivenPopoverCloseRules('shift_pressed');
// applyModifierDrivenPopoverCloseRules('shift_released');
```

The build-entry click in `initCore` passes `e.shiftKey || S.shiftKeyActive`.

- [x] **Step 4: Update source-text assertions**

In `src/main/rendererConsolidation.test.ts`:

- Change every asserted `S.ctrlKeyActive` snippet to `S.shiftKeyActive`. There are four: committed paths, hover preview (two copies), and `if (!S.ctrlKeyActive)`.
- Change `ctrl_pressed` / `ctrl_released` to `shift_pressed` / `shift_released`.
- Change `shouldRefreshStackCalloutOnControlKeydown(ctrlKeyAlreadyActive)` to `shouldRefreshStackCalloutOnShiftKeydown(shiftKeyAlreadyActive)`.
- Rename `testStackCalloutSingleUnitNonCtrlClosesPopup` to `testStackCalloutSingleUnitNonShiftClosesPopup`, update its call in `run`, and update the assertion message so it says Shift. Update that function's orienting comment so the name in the comment matches the function.
- Update the other assertion messages that say "ctrl" so they say Shift.

Leave every assertion that is about controllers, `setMainUIControlsEnabled`, or sealift controls alone.

- [x] **Step 5: Verify**

Run:

```text
npm run build:main
node --test dist/shared/stackCalloutShiftKeydown.test.js dist/shared/mapPlanningGesture.test.js dist/main/rendererConsolidation.test.js dist/main/mapGestureWiring.test.js
npm run check:renderer-types
npm run build:renderer
```

Expected: all of those succeed, and `dist/shared/stackCalloutCtrlKeydown.test.js` is gone.

Search `src` for `ctrlKeyActive`, `selection.ctrlToggle`, `ctrl_pressed`, `ctrl_released`, `shouldRefreshStackCalloutOnControlKeydown`, `stackCalloutCtrlKeydown`, `event.ctrlKey`, `eventCtrlKey`, and `calloutCtrlKey`. Expected: no matches.

Search `src` for `ctrlKey`. Expected: one match, `e.ctrlKey` in the hotkey guard in `src/renderer/map/initCore.ts`.

Manual check in the running game, strategic and tactical: Shift+click adds a unit to the selection; click without Shift replaces the selection; holding Shift hides committed paths and the hover preview; Shift+click on a second build-entry button adds that hex; releasing Shift closes the stack callout; Ctrl+click does none of those. A double-click without Shift still plans. A double-click while Shift is held does not continue the gesture. Shift+letter does not pan or hide terrain. Typing a capital letter in a text field does not hide routes.

### Phase 2: Shared opening-placement claim

**Files:**
- Create: `src/shared/initialPlacementSides.ts`
- Test: `src/shared/initialPlacementSides.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:

```ts
export type InitialPlacementSide = 'human' | 'opponent';

export function claimInitialPlacementHex(
  occupiedByHex: Map<string, InitialPlacementSide>,
  h3Index: string,
  placingSide: InitialPlacementSide
): boolean;

export function findMixedInitialPlacementHexes(
  units: readonly { h3Index: string; side: InitialPlacementSide }[]
): string[]
```

`claimInitialPlacementHex` returns `true` and stores `placingSide` when the hex is absent from the map or already that side. It returns `false` and does not change the map when the other side is already there. `findMixedInitialPlacementHexes` returns the sorted unique hex ids that appear with both sides. Empty input returns `[]`. Two units of one side on one hex are not mixed.

These are pure shared functions. Do not add main-process logging here.

- [x] **Step 1: Write the failing test**

Cover four cases:

- First claim on an empty hex returns true, and a later read of the map is that side.
- A second claim by the same side returns true, and the recorded side stays that side.
- A claim by the other side returns false, and the map still records the first side.
- `findMixedInitialPlacementHexes` returns the shared hex for opposite sides, returns `[]` for two units of one side on one hex, and returns `[]` for units on different hexes.

- [x] **Step 2: Run the test to verify it fails**

```text
npm run build:main
node --test dist/shared/initialPlacementSides.test.js
```

Expected: fail because the module does not exist.

- [x] **Step 3: Implement the two functions**

```ts
/**
 * Records that `placingSide` holds `h3Index` when that hex is empty or already held by the same side.
 *
 * Purpose: Opening placement for a strategic game and for a tactical battle must never put both sides in one hex.
 * When to use: Immediately before committing a starting unit or tactical sub-unit to a hex.
 * Expected outcome: `true` and the map updated when the hex is empty or already this side; `false` and the map unchanged when the other side is already there.
 * Exceptions: None.
 */
export function claimInitialPlacementHex(
  occupiedByHex: Map<string, InitialPlacementSide>,
  h3Index: string,
  placingSide: InitialPlacementSide
): boolean {
  const occupiedBy = occupiedByHex.get(h3Index);
  if (occupiedBy !== undefined && occupiedBy !== placingSide) return false;
  occupiedByHex.set(h3Index, placingSide);
  return true;
}

/**
 * Lists hexes whose opening units include both sides.
 *
 * Purpose: Seeders use this as a backstop after placement so a missed filter cannot start a game with mixed hexes.
 * When to use: After both sides' opening units are known, and in tests of that scan.
 * Expected outcome: Sorted unique hex ids that contain both `'human'` and `'opponent'`. Empty when every hex is one side or empty.
 * Exceptions: None.
 */
export function findMixedInitialPlacementHexes(
  units: readonly { h3Index: string; side: InitialPlacementSide }[]
): string[] {
  const sidesByHex = new Map<string, Set<InitialPlacementSide>>();
  for (const unit of units) {
    const sides = sidesByHex.get(unit.h3Index) ?? new Set<InitialPlacementSide>();
    sides.add(unit.side);
    sidesByHex.set(unit.h3Index, sides);
  }
  return [...sidesByHex.entries()]
    .filter(([, sides]) => sides.size > 1)
    .map(([h3Index]) => h3Index)
    .sort((a, b) => a.localeCompare(b));
}
```

Add the `InitialPlacementSide` type export with an orienting comment: it is the two opening-placement owners, used by the claim map and by the mixed-hex scan.

- [x] **Step 4: Re-run the test**

Expected: pass. Phase 1 tests still pass. No callers yet.

### Phase 3: Tactical opening placement skips enemy cells

**Files:**
- Modify: `src/main/tacticalBattle/computeTacticalBattleSnapshot.ts`
- Test: `src/main/tacticalBattle/computeTacticalBattleSnapshot.test.ts`
- Test: `src/main/tacticalBattle/computeTacticalBattleSnapshotDb.test.ts`

**Interfaces:**
- Consumes: `claimInitialPlacementHex` and `InitialPlacementSide` from Phase 2.
- Produces: `takeNextOpeningCell` in the tactical snapshot module.

```ts
export function takeNextOpeningCell(args: {
  orderedCells: readonly string[];
  cellCursor: number;
  maxCursor: number;
  passable: (cell: string) => boolean;
  occupiedByHex: Map<string, InitialPlacementSide>;
  placingSide: InitialPlacementSide;
}): { cell: string; nextCursor: number } | null
```

Walk from `cellCursor` while `cursor < maxCursor`. The cell is `orderedCells[cursor % orderedCells.length]`. Advance the cursor on every visit, including skips. Skip a cell the passable predicate rejects. Skip a cell `claimInitialPlacementHex` rejects. Return the first cell that is passable and claimable, with `nextCursor` already past it. Return `null` when `orderedCells` is empty or the cursor reaches `maxCursor`, and check the empty list before the modulo. A same-side cell stays claimable, so wrapping onto a cell this side already holds still succeeds.

This is a new public main-process function. Call `logDebug('takeNextOpeningCell', { placingSide, cellCursor, cellCount })` once at entry. Do not log each skipped cell.

- [x] **Step 1: Write the failing test**

In `computeTacticalBattleSnapshot.test.ts`, use one shared map across the paired calls:

- Human, cursor 0, cells `['a', 'b']`, both passable, takes `'a'` and returns `nextCursor` 1. Opponent, starting at cursor 0 on that same map, takes `'b'`, not `'a'`.
- With only `['a']` passable, human claims `'a'`. Opponent's call on that same map returns `null`. The map still records `'a'` as human.
- A second human call with cursor 0, after the first human call claimed `'a'`, may take `'a'` again.
- Cells `['a', 'b']`, `'a'` impassable, `'b'` passable, returns `'b'` with `nextCursor` 2.
- An empty `orderedCells` returns `null`.

- [x] **Step 2: Run that test file and confirm the new cases fail**

```text
npm run build:main
node --test dist/main/tacticalBattle/computeTacticalBattleSnapshot.test.js
```

- [x] **Step 3: Implement `takeNextOpeningCell` and use it in the placement loop**

Add the function next to the placement loop. Orienting comment: tactical opening placement uses it so a sub-unit never lands on a cell the other side already holds; same-side stacking still wraps onto this side's cells.

Create one `Map<string, InitialPlacementSide>` before the `for (const parent of inHex)` loop. Do not create it inside the loop.

Replace the body of `while (placed < n)` so each successful place comes from `takeNextOpeningCell`. Keep the cursor bound `orderedForParent.length * 3` as `maxCursor`. The passable predicate is the existing `isRes4CellPassableForUnitType` call with the same arguments it has now. `placingSide` is `parent.player === 'human' ? 'human' : 'opponent'`. When the helper returns `null`, break. When it returns a cell, set `cellCursor` to `nextCursor`, increment `placed`, and push the sub-unit with that `h3Index`. Parent skip and the both-sides start check stay as they are.

Do not add a second cleanup pass over `subUnits`.

- [x] **Step 4: Lock the real snapshot**

In the existing test `computeTacticalBattleSnapshot is deterministic for identical battle id and DB state` in `computeTacticalBattleSnapshotDb.test.ts`, after `a.snapshot` is known, group `a.snapshot.subUnits` by `h3Index` and assert each group has one `player`. Also assert the snapshot contains both `'human'` and `'opponent'`.

If that both-sides assertion fails, the fixture does not have a passable cell left for the second side. Stop and report that. Do not allow mixed hexes to make the assertion pass.

- [x] **Step 5: Re-run the tactical snapshot tests**

```text
npm run build:main
node --test dist/main/tacticalBattle/computeTacticalBattleSnapshot.test.js dist/main/tacticalBattle/computeTacticalBattleSnapshotDb.test.js
```

Expected: pass, including the older count tests and the deterministic DB test.

### Phase 4: Strategic seeders refuse mixed hexes

**Files:**
- Modify: `src/main/gameDb/seeding/seedUnits.ts`
- Modify: `src/main/gameDb/seeding/regionScenarioSeeding.ts`
- Test: `src/main/gameDb/seeding/regionScenarioSeeding.test.ts`

**Interfaces:**
- Consumes: `claimInitialPlacementHex`, `findMixedInitialPlacementHexes`, `InitialPlacementSide`.
- Produces: `assignRegionOpeningHexes`, exported from `regionScenarioSeeding.ts`, replacing the private `assignSpawnHexesRoundRobin`.

```ts
export function assignRegionOpeningHexes(args: {
  candidates: readonly SpawnCandidate[];
  count: number;
  targetLat: number;
  targetLng: number;
  occupiedByHex: Map<string, InitialPlacementSide>;
  placingSide: InitialPlacementSide;
}): string[]
```

One parameter object, because six loose arguments would cross the project limit. Orienting comment: ranks region spawn candidates the way round-robin does today, skips hexes the other side already holds, and records each assigned hex for `placingSide`. Same-side hexes stay in the ranked list. Returns `[]` when `count <= 0` or `candidates` is empty, without throwing. Throws `Error` with message `Could not allocate required ${placingSide} spawn hex without mixing sides` when `count > 0`, `candidates` is non-empty, and every candidate is held by the other side.

`logDebug` at entry with `placingSide`, `count`, and `candidates.length`. `logError` with the same fields immediately before the throw. Add `logError` to the logger import. `regionScenarioSeeding.ts` already imports `logDebug`.

- [x] **Step 1: Write the failing scenario test**

In `regionScenarioSeeding.test.ts`, build candidates as `{ h3, lat, lng, terrain: 'land' }`.

- One side, one candidate, `count` 2: both results are that hex. Same-side sharing stays. The map records that side.
- After human has claimed hex `H` on a shared map, an opponent assignment whose only candidate is `H` throws `Error` whose message is `Could not allocate required opponent spawn hex without mixing sides`.
- After human has claimed hex `H`, an opponent assignment with candidates `H` and `F` and `count` 2 returns `F` twice. It does not return `H`.
- `count` 0, or an empty candidate list, returns `[]` and does not throw, even when the other side holds nothing.

- [x] **Step 2: Run it and confirm failure**

```text
npm run build:main
node --test dist/main/gameDb/seeding/regionScenarioSeeding.test.js
```

- [x] **Step 3: Filter scenario round-robin and flex**

Implement `assignRegionOpeningHexes` with the contract above. Delete `assignSpawnHexesRoundRobin` and point the three call sites in `buildSidePlan` at the new function. Rank by squared distance the way the old function does, then drop candidates where `occupiedByHex.get(h3)` is the other side. Do not drop candidates held by `placingSide`. On each assigned hex, call `claimInitialPlacementHex`. A false return from claim cannot happen after that filter; if it does, `logError` and throw the same message rather than pushing the hex.

Create one `occupiedByHex` map in `trySeedScenarioRegionVsRegion` and pass that same map into both `buildSidePlan` calls. Do not construct a new map inside `buildSidePlan`. Human is planned first, so opponent sees human claims.

Add `logDebug('trySeedScenarioRegionVsRegion', { scenarioId: scenario.scenarioId })` at the start of `trySeedScenarioRegionVsRegion`, including the path that returns false for a different scenario. The function is public and this edit updates it.

For flex, build `usedH3` as the keys of `occupiedByHex` plus this side's planned hexes. Pass that set into `resolveFlexUnitPlacement`. If flex returns a hex and `claimInitialPlacementHex` returns true, push it. If claim returns false, do not push. `logDebug` with the player and the rejected hex. Remember that flex can return a used hex on purpose. Do not treat a non-null result as proof the hex was free, and do not change `pickPreferredHex`.

After both plans are built and before `insertPlannedUnitsForPlayer`, call `findMixedInitialPlacementHexes` on the combined units, each tagged with its side. If the result is non-empty, `logError` with those hexes and throw `new Error('Opening placement mixed sides')`. That throw is a backstop for a missed filter. The round-robin test throws the "without mixing sides" message instead, and it does so before any unit is inserted.

- [x] **Step 4: Close the world-seed flex hole**

In `seedUnits`, after `humanLand` and `opponentLand` are picked, create one `occupiedByHex` map. Claim each human land hex as `'human'` and each opponent land hex as `'opponent'` through `claimInitialPlacementHex`. If a land claim returns false, `logError` and throw `new Error('Opening placement mixed sides')`. Pass that same map into both `buildSideUnits` calls by adding `occupiedByHex` to the existing args object.

Inside the naval loop, after a spawn is chosen and pushed, call `claimInitialPlacementHex` for `args.player`. If it returns false, `logError` and throw `new Error(`Could not allocate required ${args.player} naval spawn hex`)`. That is the existing sentence. `pickClosestSpawnCandidates` still maintains `usedGlobalH3`. Do not change `pickClosestSpawnCandidates`.

When `args.sacrificed` is set, build the flex `usedH3` set from `args.usedGlobalH3` plus this side's unit hexes. Do not use a set of only this side's hexes. After `resolveFlexUnitPlacement`:

- If it returns a hex and `claimInitialPlacementHex` returns true, push the unit and `args.usedGlobalH3.add(flex.h3Index)`.
- If it returns a hex and claim returns false, do not push. `logDebug` with the player and the hex. This is the enemy-hex fallback.
- If it returns null, leave the flex unit omitted. `logDebug` with the player. This is the existing "no candidate" path.

`seedUnits` already logs at entry. Add `logError` to its logger import. After `humanUnits` and `opponentUnits` are both built, and before insert, run `findMixedInitialPlacementHexes` on the two lists tagged with their sides. On a non-empty result, `logError` and throw `new Error('Opening placement mixed sides')`.

Human `buildSideUnits` runs before opponent `buildSideUnits`, so an accepted human flex hex is in `usedGlobalH3` before the opponent naval pick.

- [x] **Step 5: Verify**

```text
npm run build:main
node --test dist/shared/initialPlacementSides.test.js dist/main/tacticalBattle/computeTacticalBattleSnapshot.test.js dist/main/tacticalBattle/computeTacticalBattleSnapshotDb.test.js dist/main/gameDb/seeding/regionScenarioSeeding.test.js dist/main/gameDb/seeding/initialFlexAirSlot.test.js
```

Expected: pass. `initialFlexAirSlot.test.js` must still pass because a single side with an empty used set still receives the preferred hex, and the fallback inside `pickPreferredHex` is unchanged.

## Out of scope

- Mid-game stacking, march legality, and prompt sentences that say friendly stacking is legal.
- Renaming controllers, `setMainUIControlsEnabled`, or other "control" words that are not the Ctrl key.
- Editing `static/renderer.js` by hand, or editing other `.spec` documents.
- Making required world-seed units share hexes with their own side. They stay one required unit per hex.
- Changing `pickPreferredHex` or `pickPreferredCandidate` so they return null when every hex is used. The claim gate handles the enemy case. Same-side fallback stays.

## Self-check

- Every Ctrl gesture (unit toggle on the map, sidebar toggle, build-hex toggle, path hiding, callout refresh and release, gesture snapshot, deferred callout modifier copy) has a Shift edit in Phase 1.
- Ctrl remains only as `e.ctrlKey` in the hotkey-suppress guard.
- Shift keydown stays after `shouldIgnoreGlobalKeydown`. Keyup stays ungated.
- Tactical placement uses one occupancy map for the whole snapshot.
- Both strategic seeders call `claimInitialPlacementHex` per unit and `findMixedInitialPlacementHexes` before insert.
- A hex held by the same side is still legal. `occupiedByHex.has` is not the filter.
- Flex on an enemy hex is omitted. Flex on an empty hex or on the same side is kept. Required spawns still throw. A tactical battle still uses the existing both-sides gate.
- No step tells the implementer to commit.
