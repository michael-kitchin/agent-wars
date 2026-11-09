# Single-Unit Left-Click Implementation Plan

> **For agentic workers:** Implement this plan phase by phase, in order. Do not start a phase until the previous phase's verification commands pass. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A plain left-click on a single-unit token sole-selects that unit and starts movement planning. It does not open the unit list. The same click listener covers strategic planning and tactical planning.

**Architecture:** Both theaters already share the click listener in `src/renderer/map/mainMapInteractions.ts`. `soleSelectableHumanUnitId` already returns the one selectable human unit, or null. Add one plain-click return, before the existing callout schedule, for the case where that hex has exactly one stationary unit and that helper returns an id. Selection and the march preview stay inside `applyHumanUnitIconClickSelectionPolicy` with `shiftKey: false`. Do not add a planning-mode flag, a second listener, or a new helper.

**Tech Stack:** TypeScript, Electron renderer, Node `node:test`. The wiring test reads renderer source as text. Shared tests run from `dist/` after `npm run build:main`. PowerShell does not accept `&&`.

## Global Constraints

- Do not commit or push.
- Do not put phase, stage, or plan identifiers into code, comments, tests, configuration, documentation, or lint messages.
- Directories and TypeScript files under `src/` use camelCase. Exported functions are camelCase. Exported types are PascalCase.
- Allowed role suffixes are `Handler`, `Helpers`, `Guards`, `Adapter`, `Pipeline`, `Core`, and `Types`. Do not use `Utils` or `Impl`.
- Do not rename frozen string values.
- New and updated fields and non-overriding functions need an orienting comment saying why the symbol exists, when to use it, what to expect back, and what it throws. A new branch in an existing function gets a short comment in the same style as the Shift branch above it. Do not add a new function only to hold that comment.
- Test happy paths and essential failure cases only. This change is covered by the existing source-wiring test style in `src/main/mapGestureWiring.test.ts`. Do not add a browser test or a test that clicks a live map.
- Renderer and shared UI helpers do not take main-process debug or trace logging.
- Desirable source-file size is 600 lines. Hard limit is 1000. `mainMapInteractions.ts` is already near that hard limit. Keep the new branch inline. Do not extract a helper from it.
- Do not hand-edit `static/renderer.js`. Phase 4 regenerates it with `npm run build:renderer`.
- Do not change combat rules, AI prompt text, rubble chips, or the Shift-click toggle that is already in the click listener.
- Leave these early returns where they are: resolution playback, the outside-battle toast, Ranged and Strike targeting, tactical-entry markers, and build-marker clicks. The new branch stays inside the existing `unitsAtHit.length >= 1 && unitIconHit` block, after the Shift return and before `if (loneHumanUnit)`.

## Locked Behavior

A stationary unit is a unit in `unitsAtHit`. Moving units are already excluded there. A selectable human unit is a human unit for which `isEmbarkedLandUnitBlockedForSelection` returns false. Pass that predicate into `soleSelectableHumanUnitId`. Do not pass `shouldBlockEmbarkedLandUnitSelect`.

Do not modify `applyHumanUnitIconClickSelectionPolicy`. A plain click calls it with `shiftKey: false`. That function already sole-selects after the existing short delay and then calls `refreshHoverRoutePreview`. That preview is movement planning for every unit type, including air and naval. Do not add a march-only check. Do not shorten or remove the delay. The first press of a double-click starts that delay. The second press sets `suppressIconRetargetOnNextClick`, and the policy then clears the delay and does not sole-select. The order stays planned for the units selected when the gesture started.

Plain left-click (`e.shiftKey` is false) on a unit icon:

- Exactly one stationary unit, and it is a selectable human: call the policy with `shiftKey: false` and that unit's id. Do not call `scheduleDeferredStackCallout`. When `suppressIconRetargetOnNextClick` is false and `isHoverOrderPlanningActive()` is false, call `deps.hideStackCallout()` so a list left open by an earlier click closes. `hideStackCallout` does not clear the deferred single-select timer. Do not call `clearDeferredHumanUnitSingleSelectTimer` in this branch. Then update both sidebars, redraw, and return.
- The second press of a double-click sets `suppressIconRetargetOnNextClick`. The policy then changes nothing. Do not call `hideStackCallout` on that press. Do not schedule the list.
- While a hover order preview is already active, the policy already skips a replace that would add a unit. Do not call `hideStackCallout`. Do not schedule the list. An already-open list stays open.
- Exactly one stationary unit, and it is an enemy: do not take the new branch. The existing path still schedules the list and does not select the enemy.
- Exactly one stationary unit, and it is embarked land cargo: `soleSelectableHumanUnitId` returns null. Do not take the new branch. Keep the existing `if (loneHumanUnit)` block so this token still reaches `scheduleDeferredStackCallout`. The policy leaves an embarked unit unselected.
- Two or more stationary units: do not take the new branch, even when exactly one of them is a selectable human. The list still opens. A plain click still does not sole-select from the icon. A ship with embarked cargo is this case when both are stationary. Do not remove embarked units from `unitsAtHit` before the length check. A moving unit is already absent from `unitsAtHit`, so one stationary selectable human beside a moving unit is the one-unit case. The Shift branch above this one is unchanged: Shift-click on one selectable human, including one human beside enemies or embarked cargo, still toggles and does not schedule the list.
- Air and naval use this same branch. Do not special-case unit type.

Tactical planning uses this same listener. `unitsAtHit` is battle sub-units while a battle snapshot is active, and strategic units otherwise. `isEmbarkedLandUnitBlockedForSelection` already reads the tactical snapshot during a battle. Do not add a tactical copy of the branch.

Do not change the Bonuses tooltip on hover of a one-unit token. Do not change double-click order planning. Do not change right-click clear. Do not change sidebar Shift-click or a callout row's Shift toggle. Do not edit `src/renderer/renderer.ts`. Its stack-callout comment describes the rows shown once the list is open, and a single enemy or embarked unit can still be one of those rows.

## Phase 1: Wiring Test for the Plain-Click Return

**Files:**

- Modify: `src/main/mapGestureWiring.test.ts`
- Test: `src/main/mapGestureWiring.test.ts` (`testPlainClickOnOneSelectableUnitSelectsWithoutCallout`)

**Interfaces:**

- Consumes: the click listener in `src/renderer/map/mainMapInteractions.ts`, read as source text by `readRendererSource('map', 'mainMapInteractions.ts')`.
- Produces: a test that fails until Phase 2 inserts the literal `shiftKey: false` before `scheduleDeferredStackCallout(`.

- [x] **Step 1: Add the test and call it from `run()`**

Add this function beside `testShiftClickOnOneSelectableUnitTogglesWithoutCallout`, and call it from `run()` immediately after that test. The hover-planning `return` already sits above `scheduleDeferredStackCallout`. A test that only looks for some `return;` before that schedule still passes if this branch falls through and opens the list. Require the new `return;` to come before `if (loneHumanUnit)`.

```ts
/**
 * Checks that a plain click on one stationary selectable human unit does not schedule the callout.
 *
 * Purpose: That click sole-selects through the existing policy. Stacks, enemy tokens, and embarked-only tokens still open the list.
 * When to use: Regression signal when refactoring the main-map click listener.
 * Expected outcome: The plain-click branch uses `shiftKey: false` and `unitsAtHit.length === 1`, and it returns before the embarked single-human path.
 * Exceptions: AssertionError when the wiring drifts.
 */
function testPlainClickOnOneSelectableUnitSelectsWithoutCallout(): void {
  const interactions = readRendererSource('map', 'mainMapInteractions.ts');
  const clickStart = interactions.indexOf("addEventListener('click'");
  const clickEnd = interactions.indexOf("addEventListener('dblclick'");
  assert.ok(clickStart >= 0 && clickEnd > clickStart, 'click listener precedes the double-click listener');
  const clickListener = interactions.slice(clickStart, clickEnd);
  const plainAt = clickListener.indexOf('shiftKey: false');
  const scheduleAt = clickListener.indexOf('scheduleDeferredStackCallout(');
  assert.ok(plainAt >= 0 && scheduleAt > plainAt, 'plain click on one selectable unit is wired before the callout schedule');
  const plainBranch = clickListener.slice(plainAt, scheduleAt);
  const returnAt = plainBranch.indexOf('return;');
  const embarkedAt = plainBranch.indexOf('if (loneHumanUnit)');
  assert.ok(returnAt >= 0 && embarkedAt > returnAt, 'the plain-click path returns before the embarked unit and the callout schedule');
  assert.ok(plainBranch.includes('unitsAtHit.length === 1'), 'the plain-click return is only the single stationary unit');
  assert.ok(plainBranch.includes('soleSelectableUnitId'), 'the plain-click return uses the selectable-human id');
  assert.ok(
    plainBranch.includes('!suppressIconRetargetOnNextClick && !isHoverOrderPlanningActive()'),
    'hideStackCallout on the plain-click path is guarded by the double-click and hover checks'
  );
  assert.ok(plainBranch.includes('deps.hideStackCallout()'), 'a new plain click closes a stale callout');
}
```

- [x] **Step 2: Retarget the old lone-human comment**

In `testLoneHumanUnitIconOpensCalloutAndSelects`, change the comment and the assertion message that say a lone human click opens the list. The `unitId: loneHumanUnit.id` policy call stays before `scheduleDeferredStackCallout` because that remaining call is the embarked single human, which still opens the list. Do not delete that test. Do not delete `testShiftClickOnOneSelectableUnitTogglesWithoutCallout`.

- [x] **Step 3: Confirm the new test fails**

From the repo root in PowerShell:

```powershell
npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node --test dist/main/mapGestureWiring.test.js
```

Expected: the process exits non-zero. `run()` throws `AssertionError: plain click on one selectable unit is wired before the callout schedule` and does not print `mapGestureWiring.test.ts passed`. The checks that `run()` calls before the new function still pass, so the failure is this assertion. Do not change the click listener in this phase. Do not change `testShiftClickOnOneSelectableUnitTogglesWithoutCallout` in this phase. Its slice currently runs through `scheduleDeferredStackCallout(`, and `shiftKey: false` does not exist yet.

## Phase 2: Skip the List on a Plain Click

**Files:**

- Modify: `src/renderer/map/mainMapInteractions.ts` (the click listener, immediately after the Shift `return` and before `if (loneHumanUnit)`)

**Interfaces:**

- Consumes: `soleSelectableUnitId` from the call already in that block, `applyHumanUnitIconClickSelectionPolicy`, `suppressIconRetargetOnNextClick`, `isHoverOrderPlanningActive`, `deps.hideStackCallout`.
- Produces: a `shiftKey: false` branch that returns before `scheduleDeferredStackCallout` only when `!e.shiftKey && unitsAtHit.length === 1 && soleSelectableUnitId`.

- [x] **Step 1: Insert this branch**

Place it after the Shift block's `return` and before `if (loneHumanUnit)`. Keep `if (loneHumanUnit)` and everything after it. The length check is required. A hex with one selectable human and any other stationary unit must still reach the callout schedule.

```ts
      // One stationary selectable human sole-selects and starts the hover route preview. The list stays closed.
      // The second press of a double-click, and a click during hover planning, leave an open callout in place.
      if (!e.shiftKey && unitsAtHit.length === 1 && soleSelectableUnitId) {
        applyHumanUnitIconClickSelectionPolicy({
          shiftKey: false,
          unitId: soleSelectableUnitId,
          suppressSelectionRetarget: suppressIconRetargetOnNextClick,
          deps: humanUnitIconSelectionDeps,
        });
        if (!suppressIconRetargetOnNextClick && !isHoverOrderPlanningActive()) {
          deps.hideStackCallout();
        }
        deps.updateSidebar();
        deps.updateRangedSidebar();
        deps.redraw();
        return;
      }
```

Use the literal `shiftKey: false`. Do not write `shiftKey: e.shiftKey` here. Do not wrap this condition around the Shift branch. Do not call `scheduleDeferredStackCallout` inside this branch. Do not call `addUnitsToSelection`. Do not remove the Shift branch's `hideStackCallout` guard. The comment says hover route preview, not a march, because air and naval use the same preview.

- [x] **Step 2: Keep the Shift wiring test on the Shift branch**

In `testShiftClickOnOneSelectableUnitTogglesWithoutCallout`, the slice from `soleSelectableHumanUnitId(` to `scheduleDeferredStackCallout(` will now contain both hide guards. End that slice at `shiftKey: false` instead, and assert `shiftKey: false` is after `shiftKey: true` and before `scheduleDeferredStackCallout(`. The guard and `deps.hideStackCallout()` assertions stay on that shorter slice, so they still describe the Shift branch.

- [x] **Step 3: Re-run the wiring test**

```powershell
npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node --test dist/main/mapGestureWiring.test.js
```

Expected: the file passes, including the new test and the Shift test. `mainMapInteractions.ts` stays under 1000 lines.

## Phase 3: UX Docs

**Files:**

- Modify: `doc/ux/selection-model.md`
- Modify: `doc/ux/stack-callout.md`
- Modify: `doc/ux/input-map.md`
- Modify: `doc/ux-specification.md`

Do not edit `doc/combat-rules-v3.md` or anything under `doc/ai-commander-prompts/`. Do not edit the terrain-legend or hex-tooltip docs.

- [x] **Step 1: Selection model**

In `doc/ux/selection-model.md`, replace only these sentences. Leave the Shift-toggle sentences, the debounce sentences, and the double-click sentence as they are.

- Replace `A plain click on a unit icon opens the stack callout.` with `A plain click on a unit icon opens the stack callout, except when that hex has exactly one stationary unit and that unit is a selectable human. That click sole-selects the unit and starts movement planning.`
- Replace `The stack callout opens on that click.` with `When that hex has exactly one stationary selectable human unit, the stack callout stays closed and movement planning starts once that selection applies. A plain click on any other unit icon still opens the stack callout.`
- Replace `A plain click on a unit icon still schedules the callout.` with `A plain click on a unit icon still schedules the callout, except a hex with exactly one stationary selectable human unit.`
- In the bullet that begins `When Ranged and Strike targeting are off and the player clicks a unit icon`, replace `except a Shift-click on one selectable human unit, which does not open it` with `except a Shift-click on one selectable human unit, and except a plain click on a hex with exactly one stationary selectable human unit`.

Do not change the first bullet under What Can Be Selected. A stack still does not sole-select from a plain click on its icon. Do not say that a hex with one selectable human beside other stationary units skips the list. That hex still opens the list on a plain click. Keep the sentences that say a hover preview does not close a callout a stack click already scheduled.

- [x] **Step 2: Stack callout**

In `doc/ux/stack-callout.md`:

- Replace the Purpose sentence with `Let the player see the units in a hex and change which human units in that hex are selected. A plain click on a hex with exactly one stationary selectable human unit does not open this list.`
- In Availability, replace `Opens in Strategic planning and Tactical planning after a plain click on a unit icon, including a single unit, once a short delay elapses. A Shift-click on an icon whose hex has one selectable human unit does not open the list. A plain click on that icon still does.` with `Opens in Strategic planning and Tactical planning after a plain click on a unit icon once a short delay elapses, except a hex with exactly one stationary selectable human unit. A plain click on an enemy-only token, an embarked-only token, or two or more stationary units still opens the list. A Shift-click on an icon whose hex has one selectable human unit does not open the list.` Leave the rest of that paragraph, including hover, playback, zoom, and the hover-preview sentences.
- Under Invariants, after the Shift-click invariant, add `A plain click on one stationary selectable human unit does not schedule the callout. A plain click on two or more stationary units, or on one unselectable unit, schedules it when the hover-preview and double-click rules allow.` Do not delete the Shift-click invariant.

- [x] **Step 3: Input map and glossary**

In `doc/ux/input-map.md`, replace the main-map Click result with `Selects and opens map popups. A plain click on one stationary selectable human unit's icon sole-selects that unit and starts movement planning, and does not open the unit list. Hovering that icon shows the Bonuses tooltip and does not open the list. A stack, an enemy-only token, and an embarked-only token open the list from a click. While Ranged or Strike targeting is on, a click does not place the attack and does not change the selection.` Do not edit the Shift row. Its one-selectable sentence already leaves the list closed, and its two-or-more sentence already schedules the list only when a plain click would.

In `doc/ux-specification.md`, replace the Stack glossary entry with `Stack: two or more units in the same hex. The stack callout lists the units in one hex. A plain click on one stationary selectable human unit does not open it. A Shift-click on one selectable human unit does not open it. Hovering a one-unit token shows that unit's Bonuses tooltip.`

- [x] **Step 4: Read the four files and check the exception**

Search those four files for `including a single unit`, `opens the unit list`, `A plain click on that icon still does`, and `The stack callout opens on that click`. None of those phrases should remain. Every remaining sentence about opening the list must still be true for a stack, an enemy-only token, and an embarked-only token.

## Phase 4: Verify

- [x] **Step 1: Lint, compile, and test**

```powershell
npx eslint src/renderer/map/mainMapInteractions.ts src/main/mapGestureWiring.test.ts; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run build:main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node --test dist/main/mapGestureWiring.test.js dist/main/rendererConsolidation.test.js dist/shared/soleSelectableHumanUnit.test.js; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run check:renderer-types; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run build:renderer
```

Expected: eslint prints nothing and exits 0. Wiring, consolidation, and the sole-selectable test pass. Renderer typecheck reports ok with the two existing `hoverPreview.ts` null entries only. `build:renderer` writes `static/renderer.js`. The Leaflet copy warning about a missing `node_modules/leaflet` is a pre-existing warning, not a failure, when the command still exits 0.

- [x] **Step 2: Confirm the bundle contains the branch**

Search `static/renderer.js` for `shiftKey: false` inside the click path that also contains `soleSelectableHumanUnitId`. It must be present. Do not edit the bundle by hand.

- [ ] **Step 3: Manual check after the app restarts**

Restart with `npm start` so the new bundle loads. The selection and the hover route preview start after the existing short delay, not on the click itself. In strategic planning:

- Left-click a token that is the only stationary unit and is a selectable human. After the delay, that unit is the selection, the hover route preview starts, and the unit list does not open.
- Left-click a stack of two or more stationary units, including one selectable human beside an enemy or beside embarked cargo. The list still opens, and the click does not sole-select.
- Left-click an enemy-only token. The list still opens, and the enemy stays unselected.
- Left-click an embarked-only token. The list still opens, and the unit stays unselected.
- Double-click the one selectable human. The order is planned for the units selected when the gesture started, and the list does not open.
- Shift-click that one selectable human. It toggles, and the list stays closed.

Repeat the one-unit left-click and the stack left-click in tactical planning.

## Out of Scope

- Changing when a stack, an enemy-only token, or an embarked-only token opens the list.
- Changing Shift-click, double-click order planning, hover Bonuses tooltips, targeting, playback, or build-hex selection.
- A new movement-planning mode. The existing delayed sole-select plus `refreshHoverRoutePreview` is the planning entry.
- Rubble chips, terrain legend, combat rules, and AI prompts.
