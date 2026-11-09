# Map Double-Click Planning and Deselect Implementation Plan

> **For agentic workers:** Implement this plan phase by phase, in order. Do not start a phase until the previous phase's verification commands pass. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a player plan a move or an air ferry by double-clicking an eligible destination hex, including when that click lands on a unit or stack icon, and let air and mixed selections clear completely from an empty click without deleting queued orders.

**Architecture:** All new decision logic lives in `src/shared/mapPlanningGesture.ts` as pure functions: one decides what a mouse press does to the selection snapshot, one decides what a double-click does, and a small classifier sorts a selection into air, non-air, or mixed. The renderer keeps a short-lived snapshot of the selection taken on the first press of a gesture, so a second press on a unit icon cannot retarget the order. Stack and lone-AI callouts wait out the same delay already used for single-select, because the callout is a fixed-position popup layered above the map and would otherwise swallow the second click. Strategic and tactical maps share `wireMainMapInteractions`, so one wiring covers both games.

**Tech Stack:** TypeScript, Electron renderer, Node `node:test` run from `dist` after `npm run build:main`, existing `validateGroupFerryTarget` and `assignHumanMarchOrders` IPC.

## Global Constraints

- Do not commit or push.
- Do not put phase, stage, or plan identifiers into code, comments, tests, configuration, or lint messages.
- Directories and TypeScript files under `src/` use camelCase. Exported functions are camelCase. Exported types are PascalCase.
- Allowed role suffixes are `Handler`, `Helpers`, `Guards`, `Adapter`, `Pipeline`, `Core`, and `Types`. Do not use `Utils` or `Impl`.
- Do not rename frozen string values: IPC channel names, the product toast sentences quoted in this plan, and the breadcrumb event keys listed below.
- New and updated fields and non-overriding functions need an orienting comment saying why the symbol exists, when to use it, what to expect back, and what it throws.
- Test happy paths and essential failure cases only. Do not test pass-through wrappers, accessors, or constructors.
- Renderer and shared UI helpers do not take main-process debug or trace logging. Do not add a new main-process API. No IPC surface changes.
- Prefer a parameter object once a function would need more than six named arguments.
- Desirable source-file size is 600 lines, hard limit 1000. `src/renderer/map/mainMapInteractions.ts` is near 800 lines today. Moving the double-click body out in Phase 4 must leave it smaller than it started.

## Locked behavior

An **empty click** is a click whose pixel misses every drawn unit and stack icon. The hex may still contain units. When strategic unit icons are hidden at far zoom, every click on the map is an empty click.

**Completely clear** means exactly this list, and nothing more:

- `selectedUnitIds` becomes empty
- `selectedUnitIdsAtMouseDown` becomes empty
- `gestureSelectionSnapshotAtMs` becomes `0`
- `selectedHexIndex` becomes null
- `hoverRoutePreview` becomes null and `hoverPreviewRequestSeq` increments
- `rangedModeActive` and `airStrikeModeActive` become false
- the deferred single-select timer and the deferred stack-callout timer are cancelled

Queued work survives a clear: `pendingFerryOrders`, `tacticalPendingMarches`, `pendingRangedAttacks`, `pendingAirStrikes`, `pendingEmbarkOrders`, and `humanStandingOrders`.

That list describes the whole gesture, not one function. `clearMapSelectionChrome` in Phase 4 covers the state fields; each caller cancels the two timers before calling it.

| Gesture | Selection | Click target | Result |
| --- | --- | --- | --- |
| Double-click | Any | Ranged mode or air-strike mode is on, or there is no destination hex, or nothing is selected | Ignore. |
| Double-click | Any | Empty click on a hex where every selected unit already stands | Completely clear the selection. No toast. This is what happens today, by way of the first click. |
| Double-click | Any | Icon hit on a hex where every selected unit already stands | Ignore. No clear, no toast. |
| Double-click | Air only | Eligible ferry hex, icon or empty | Queue the ferry. No error toast. |
| Double-click | Air only | Empty click on a hex that is not an eligible ferry destination | Completely clear the selection. No toast. |
| Double-click | Air only | Icon hit on a hex that is not an eligible ferry destination | Keep today's error toast. Leave the selection alone. |
| Double-click | Mixed air and non-air | Any other hex, icon or empty | Toast `Cannot issue grouped movement for mixed air and non-air units.` Leave the selection alone. |
| Double-click | Ground or naval only | Any other hex, icon or empty | Call the existing march assignment. On failure keep today's movement-failure toast. |
| Right-click | Any non-empty selection, or a hover preview is showing | Anywhere on the map, empty or on an icon | Completely clear the selection. |
| Right-click | Air or mixed | Empty click | Completely clear the selection. This is the case that must not be gated behind an icon-hit check. |

Ground and naval double-clicks keep toasting on an ineligible hex while air double-clicks silently clear. That asymmetry is intended. Do not "fix" it.

Eligibility is never reimplemented here. Ferry eligibility is the boolean `success` from `window.gameApi.validateGroupFerryTarget`. March eligibility stays inside `assignHumanMarchOrders`.

After a successful ferry or march, keep calling `clearCommittedOrderDraftState`. That is the existing post-commit cleanup. The new deselect path must not call it, because that helper also flips committed-line visibility state.

Leave these comment lines in `init` inside `src/renderer/renderer.ts` exactly as they are. A source test reads them:

```ts
// const hasAirSelection = selectedAtMouseDown.some((unit) => unit.unitType === 'air');
// const hasNonAirSelection = selectedAtMouseDown.some((unit) => unit.unitType !== 'air');
// Cannot issue grouped movement for mixed air and non-air units.
// window.gameApi?.validateGroupFerryTarget
// replacePendingFerryOrdersForSelected(selectedIds, destinationH3);
```

Keep emitting these breadcrumb keys from the double-click path: `planning.doubleClickIgnored`, `planning.doubleClickRejected`, `planning.doubleClickAccepted`. Add `planning.doubleClickDeselect` for the silent air clear. Breadcrumbs are free-form strings passed to `emitParityDiagnosticsBreadcrumb`; there is no registry to update.

## Background the implementer needs

Read these before Phase 2. They explain why the phases are shaped this way.

1. **Browser event order for a double-click** is: pointerdown, click, pointerdown, click, dblclick. Both presses land on `#main-map`, so the map's own `pointerdown` listener runs twice before `dblclick`.
2. **The selection snapshot already exists.** `S.selectedUnitIdsAtMouseDown` is copied from the live selection on every primary press, and the double-click handler plans for that snapshot rather than the live selection. The bug is that the second press of a double-click overwrites the snapshot, and the second click can retarget the live selection to whatever icon is under the cursor.
3. **Single-select is deferred by 250ms** (`HUMAN_UNIT_SINGLE_SELECT_DEBOUNCE_MS`). If the two presses are less than 250ms apart the deferred select has not fired yet. Between 250ms and the operating system double-click threshold it has, which is the window where the snapshot must be frozen and restored.
4. **`#stack-callout` is a `position: fixed` sibling of `#main-map` with `pointer-events: auto` and `z-index: 6500`.** Once it is open it covers the cursor, so the second press targets the popup and the map never sees a double-click. `initCore.ts` has a capture-phase window `pointerdown` listener that hides the callout on any press outside it, which is also why right-click already dismisses it. That listener and the `Escape` branch beside it both return early when the popup is hidden, so neither reaches a callout that is merely scheduled. Phase 3 closes that gap.
5. **`replaceSelection([])` already clears** the selected hex, the hover preview, the preview sequence counter, and both targeting modes. `clearSelection()` calls it. Do not duplicate that work.
6. **Hover planning blocks selection changes.** `shouldBlockSelectionReplaceDuringHoverPlanning` stops the second click from swapping the selection while a hover preview is on screen, which covers most double-clicks but not the case where no preview was produced. The snapshot freeze is what makes the behavior reliable in both cases.

---

### Phase 1: Pure decision logic

**Files:**

- Create: `src/shared/mapPlanningGesture.ts`
- Create: `src/shared/mapPlanningGesture.test.ts`

**Interfaces:**

- Consumes: nothing
- Produces: `MapSelectionComposition`, `MapDoubleClickAction`, `MapDoubleClickDecisionInput`, `MapGesturePressInput`, `MapGesturePressDecision`, `mapSelectionComposition`, `resolveMapDoubleClickAction`, `resolveMapGesturePress`, `MAP_DOUBLE_CLICK_SELECTION_FREEZE_MS`, `MAP_DOUBLE_CLICK_ANCHOR_TOLERANCE_PX`

This phase changes no runtime behavior. The unit test is the whole verification.

- [ ] **Step 1: Write the failing test**

Create `src/shared/mapPlanningGesture.test.ts`:

```ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MAP_DOUBLE_CLICK_ANCHOR_TOLERANCE_PX,
  MAP_DOUBLE_CLICK_SELECTION_FREEZE_MS,
  mapSelectionComposition,
  resolveMapDoubleClickAction,
  resolveMapGesturePress,
} from './mapPlanningGesture';

describe('mapSelectionComposition', () => {
  it('classifies empty, air, non-air, and mixed selections', () => {
    assert.equal(mapSelectionComposition([]), 'empty');
    assert.equal(mapSelectionComposition(['air', 'air']), 'airOnly');
    assert.equal(mapSelectionComposition(['infantry', 'naval']), 'nonAirOnly');
    assert.equal(mapSelectionComposition(['air', 'armor']), 'mixed');
  });
});

describe('resolveMapDoubleClickAction', () => {
  const airAway = {
    targetingModeActive: false,
    hasDestination: true,
    composition: 'airOnly' as const,
    allSelectedUnitsAlreadyAtDestination: false,
    iconHit: false,
    ferryEligible: null as boolean | null,
  };

  it('plans a ferry on an eligible hex whether or not the click hit an icon', () => {
    assert.deepEqual(resolveMapDoubleClickAction({ ...airAway, ferryEligible: true }), { kind: 'planFerry' });
    assert.deepEqual(
      resolveMapDoubleClickAction({ ...airAway, iconHit: true, ferryEligible: true }),
      { kind: 'planFerry' }
    );
  });

  it('asks the caller to validate before it can choose a ferry outcome', () => {
    assert.deepEqual(resolveMapDoubleClickAction(airAway), { kind: 'needFerryValidation' });
  });

  it('clears an air selection on an empty ineligible click and toasts on an icon one', () => {
    assert.deepEqual(resolveMapDoubleClickAction({ ...airAway, ferryEligible: false }), { kind: 'deselect' });
    assert.deepEqual(
      resolveMapDoubleClickAction({ ...airAway, iconHit: true, ferryEligible: false }),
      { kind: 'rejectFerry' }
    );
  });

  it('clears on an empty own-hex click and ignores an own-hex icon click, whatever the composition', () => {
    for (const composition of ['airOnly', 'nonAirOnly', 'mixed'] as const) {
      assert.deepEqual(
        resolveMapDoubleClickAction({ ...airAway, composition, allSelectedUnitsAlreadyAtDestination: true }),
        { kind: 'deselect' },
        `empty own-hex click should clear a ${composition} selection`
      );
      assert.deepEqual(
        resolveMapDoubleClickAction({
          ...airAway,
          composition,
          allSelectedUnitsAlreadyAtDestination: true,
          iconHit: true,
        }),
        { kind: 'ignore' },
        `own-hex icon click should do nothing for a ${composition} selection`
      );
    }
  });

  it('rejects a mixed selection on any other hex', () => {
    assert.deepEqual(resolveMapDoubleClickAction({ ...airAway, composition: 'mixed' }), { kind: 'rejectMixed' });
    assert.deepEqual(
      resolveMapDoubleClickAction({ ...airAway, composition: 'mixed', iconHit: true }),
      { kind: 'rejectMixed' }
    );
  });

  it('plans a march for non-air selections on icon hits and on empty clicks', () => {
    assert.deepEqual(
      resolveMapDoubleClickAction({ ...airAway, composition: 'nonAirOnly', iconHit: true }),
      { kind: 'planMarch' }
    );
    assert.deepEqual(
      resolveMapDoubleClickAction({ ...airAway, composition: 'nonAirOnly' }),
      { kind: 'planMarch' }
    );
  });

  it('ignores targeting mode, a missing destination, and an empty selection', () => {
    assert.deepEqual(resolveMapDoubleClickAction({ ...airAway, targetingModeActive: true }), { kind: 'ignore' });
    assert.deepEqual(resolveMapDoubleClickAction({ ...airAway, hasDestination: false }), { kind: 'ignore' });
    assert.deepEqual(resolveMapDoubleClickAction({ ...airAway, composition: 'empty' }), { kind: 'ignore' });
  });
});

describe('resolveMapGesturePress', () => {
  const secondPressInPlace = {
    snapshotAtMs: 1_000,
    snapshotAnchorClientX: 400,
    snapshotAnchorClientY: 300,
    snapshotUnitCount: 2,
    liveSelectionDiffersFromSnapshot: false,
    ctrlKey: false,
    clientX: 400,
    clientY: 300,
    nowMs: 1_200,
  };

  it('freezes the snapshot and suppresses retarget for a second press in place', () => {
    assert.deepEqual(resolveMapGesturePress(secondPressInPlace), {
      refreshSnapshot: false,
      restoreSnapshotSelection: false,
      suppressIconRetarget: true,
    });
  });

  it('restores the snapshot when a deferred select already changed the live selection', () => {
    assert.deepEqual(
      resolveMapGesturePress({ ...secondPressInPlace, liveSelectionDiffersFromSnapshot: true, nowMs: 1_400 }),
      { refreshSnapshot: false, restoreSnapshotSelection: true, suppressIconRetarget: true }
    );
  });

  it('takes a fresh snapshot for a first press, a late press, or a press somewhere else', () => {
    const fresh = { refreshSnapshot: true, restoreSnapshotSelection: false, suppressIconRetarget: false };
    assert.deepEqual(resolveMapGesturePress({ ...secondPressInPlace, snapshotAtMs: 0 }), fresh);
    assert.deepEqual(
      resolveMapGesturePress({
        ...secondPressInPlace,
        nowMs: 1_000 + MAP_DOUBLE_CLICK_SELECTION_FREEZE_MS + 1,
      }),
      fresh
    );
    assert.deepEqual(
      resolveMapGesturePress({
        ...secondPressInPlace,
        clientX: 400 + MAP_DOUBLE_CLICK_ANCHOR_TOLERANCE_PX + 1,
        liveSelectionDiffersFromSnapshot: true,
      }),
      fresh
    );
  });

  it('takes a fresh snapshot for ctrl presses and when nothing was selected', () => {
    const fresh = { refreshSnapshot: true, restoreSnapshotSelection: false, suppressIconRetarget: false };
    assert.deepEqual(resolveMapGesturePress({ ...secondPressInPlace, ctrlKey: true }), fresh);
    assert.deepEqual(
      resolveMapGesturePress({
        ...secondPressInPlace,
        snapshotUnitCount: 0,
        liveSelectionDiffersFromSnapshot: true,
      }),
      fresh
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm run build:main
node dist/shared/mapPlanningGesture.test.js
```

Expected: failure. If `build:main` type-checks the test before the module exists, the expected failure is a compile error naming `./mapPlanningGesture`.

- [ ] **Step 3: Write the decision module**

Create `src/shared/mapPlanningGesture.ts` with exactly this content:

```ts
/**
 * How the human selection is composed for map planning gestures.
 *
 * Purpose: Lets double-click handling branch on air, non-air, and mixed selections without repeating type scans.
 * When to use: Build it from the unit types captured in the gesture-start snapshot, not the live selection.
 * Expected outcome: `empty` for no types, `mixed` when air and non-air are both present, otherwise `airOnly` or `nonAirOnly`.
 * Exceptions: None.
 */
export type MapSelectionComposition = 'empty' | 'airOnly' | 'nonAirOnly' | 'mixed';

/**
 * What a main-map double-click should do once the selection snapshot and icon hit are known.
 *
 * Purpose: Keeps ferry, march, reject, ignore, and deselect outcomes in one table shared by both map modes.
 * When to use: Returned by `resolveMapDoubleClickAction`. On `needFerryValidation`, run the ferry check and resolve again.
 * Expected outcome: Exactly one outcome per call.
 * Exceptions: None.
 */
export type MapDoubleClickAction =
  | { kind: 'ignore' }
  | { kind: 'needFerryValidation' }
  | { kind: 'rejectMixed' }
  | { kind: 'planFerry' }
  | { kind: 'rejectFerry' }
  | { kind: 'deselect' }
  | { kind: 'planMarch' };

/**
 * Inputs for `resolveMapDoubleClickAction`.
 *
 * Purpose: Bundles gesture facts so the decision stays a pure function testable without a DOM.
 * When to use: Build one object per double-click. Leave `ferryEligible` null until the ferry check returns.
 * Expected outcome: Consumed only by `resolveMapDoubleClickAction`.
 * Exceptions: None.
 */
export type MapDoubleClickDecisionInput = {
  targetingModeActive: boolean;
  hasDestination: boolean;
  composition: MapSelectionComposition;
  allSelectedUnitsAlreadyAtDestination: boolean;
  iconHit: boolean;
  ferryEligible: boolean | null;
};

/**
 * Inputs for `resolveMapGesturePress`.
 *
 * Purpose: Carries everything needed to tell the second press of a double-click apart from an unrelated new click.
 * When to use: Build one object on each primary-button press on the map.
 * Expected outcome: Consumed only by `resolveMapGesturePress`.
 * Exceptions: None.
 */
export type MapGesturePressInput = {
  snapshotAtMs: number;
  snapshotAnchorClientX: number;
  snapshotAnchorClientY: number;
  snapshotUnitCount: number;
  liveSelectionDiffersFromSnapshot: boolean;
  ctrlKey: boolean;
  clientX: number;
  clientY: number;
  nowMs: number;
};

/**
 * What a primary-button press should do to the gesture selection snapshot.
 *
 * Purpose: One place to decide whether a press starts a new gesture or continues a double-click already underway.
 * When to use: Returned by `resolveMapGesturePress`. Keep `suppressIconRetarget` until the click that follows this press is handled.
 * Expected outcome: `refreshSnapshot` and the other two flags are mutually consistent; a refreshing press never suppresses or restores.
 * Exceptions: None.
 */
export type MapGesturePressDecision = {
  refreshSnapshot: boolean;
  restoreSnapshotSelection: boolean;
  suppressIconRetarget: boolean;
};

/**
 * Milliseconds within which a second press can still belong to the first press's gesture.
 *
 * Purpose: Matches the usual operating system double-click threshold, so a genuine double-click is covered and two deliberate single clicks are not.
 * When to use: Only inside `resolveMapGesturePress`.
 * Expected outcome: A press later than this always starts a fresh snapshot.
 * Exceptions: None.
 */
export const MAP_DOUBLE_CLICK_SELECTION_FREEZE_MS = 500;

/**
 * Pixels of movement allowed between the two presses of one double-click.
 *
 * Purpose: Without a distance limit, clicking one unit and then quickly clicking a different unit would be treated as a double-click and the second unit would never get selected.
 * When to use: Only inside `resolveMapGesturePress`.
 * Expected outcome: A press further than this from the anchor starts a fresh snapshot.
 * Exceptions: None.
 */
export const MAP_DOUBLE_CLICK_ANCHOR_TOLERANCE_PX = 6;

/**
 * Classifies a selection by air and non-air membership.
 *
 * Purpose: Shared rule so strategic and tactical double-click handling cannot drift apart.
 * When to use: Pass the `unitType` of every human unit in the gesture-start snapshot.
 * Expected outcome: See `MapSelectionComposition`.
 * Exceptions: None. The literal `'air'` is the only air unit type.
 */
export function mapSelectionComposition(unitTypes: readonly string[]): MapSelectionComposition {
  if (unitTypes.length === 0) return 'empty';
  let hasAir = false;
  let hasNonAir = false;
  for (const unitType of unitTypes) {
    if (unitType === 'air') hasAir = true;
    else hasNonAir = true;
  }
  if (hasAir && hasNonAir) return 'mixed';
  if (hasAir) return 'airOnly';
  return 'nonAirOnly';
}

/**
 * Chooses the double-click outcome from selection composition, icon hit, and ferry eligibility.
 *
 * Purpose: One table for both map modes so icon clicks and empty clicks cannot grow separate branches.
 * When to use: After the destination hex and the gesture-start selection are known.
 * Expected outcome: An empty click on the units' own hex always clears, matching today's behavior. Air units otherwise clear on an empty ineligible click and toast on an icon one. Mixed selections reject. Non-air selections plan a march.
 * Exceptions: None.
 */
export function resolveMapDoubleClickAction(input: MapDoubleClickDecisionInput): MapDoubleClickAction {
  if (input.targetingModeActive || !input.hasDestination || input.composition === 'empty') {
    return { kind: 'ignore' };
  }
  if (input.allSelectedUnitsAlreadyAtDestination) {
    return input.iconHit ? { kind: 'ignore' } : { kind: 'deselect' };
  }
  if (input.composition === 'mixed') {
    return { kind: 'rejectMixed' };
  }
  if (input.composition === 'airOnly') {
    if (input.ferryEligible === null) return { kind: 'needFerryValidation' };
    if (input.ferryEligible) return { kind: 'planFerry' };
    if (!input.iconHit) return { kind: 'deselect' };
    return { kind: 'rejectFerry' };
  }
  return { kind: 'planMarch' };
}

/**
 * Decides whether a press starts a new gesture or continues a double-click already in progress.
 *
 * Purpose: The second press must plan for the units the player had selected, not for whatever icon sits under the cursor, while two separate clicks in different places keep behaving normally.
 * When to use: On every primary-button press on the main map. Pass `snapshotAtMs` `0` when no gesture is open.
 * Expected outcome: A press continues the gesture only when it is inside the time window, within the pixel tolerance, without Ctrl, and the snapshot holds at least one unit. Continuing presses suppress icon retarget and restore the snapshot when a deferred select already changed the live selection.
 * Exceptions: None.
 */
export function resolveMapGesturePress(input: MapGesturePressInput): MapGesturePressDecision {
  const withinWindow =
    input.snapshotAtMs !== 0 && input.nowMs - input.snapshotAtMs <= MAP_DOUBLE_CLICK_SELECTION_FREEZE_MS;
  const withinAnchor =
    Math.abs(input.clientX - input.snapshotAnchorClientX) <= MAP_DOUBLE_CLICK_ANCHOR_TOLERANCE_PX &&
    Math.abs(input.clientY - input.snapshotAnchorClientY) <= MAP_DOUBLE_CLICK_ANCHOR_TOLERANCE_PX;
  const continuesGesture = withinWindow && withinAnchor && !input.ctrlKey && input.snapshotUnitCount > 0;
  if (!continuesGesture) {
    return { refreshSnapshot: true, restoreSnapshotSelection: false, suppressIconRetarget: false };
  }
  return {
    refreshSnapshot: false,
    restoreSnapshotSelection: input.liveSelectionDiffersFromSnapshot,
    suppressIconRetarget: true,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm run build:main
node dist/shared/mapPlanningGesture.test.js
npx eslint src/shared/mapPlanningGesture.ts src/shared/mapPlanningGesture.test.ts
```

Expected: every test passes and eslint is clean.

---

### Phase 2: Hold the gesture selection through a double-click

**Files:**

- Modify: `src/renderer/core/state.ts`, beside `selectedUnitIdsAtMouseDown`
- Modify: `src/renderer/map/mainMapInteractions.ts`, the `pointerdown` listener and the human-icon call site
- Modify: `src/renderer/map/mapClickSelectionPolicy.ts`, `applyHumanUnitIconClickSelectionPolicy`
- Modify: `src/renderer/gameplay/newGame.ts`, `src/renderer/gameplay/tacticalOrders.ts`, `src/renderer/tactical/tacticalIpcHandlers.ts`, each at their existing `S.selectedUnitIdsAtMouseDown = []` line

**Interfaces:**

- Consumes: `resolveMapGesturePress` from `../../shared/mapPlanningGesture`, `selectionUnitIdSetsDiffer` from `../../shared/selectionUnitIdSets`, `deps.replaceSelection`
- Produces: `S.gestureSelectionSnapshotAtMs`, `S.gestureSelectionAnchorClientX`, `S.gestureSelectionAnchorClientY`, a `wireMainMapInteractions` local named `suppressIconRetargetOnNextClick`, and a `suppressSelectionRetarget` field on the `applyHumanUnitIconClickSelectionPolicy` argument object

After this phase, ordinary selection must be unchanged. Verification is mostly manual because this is renderer wiring.

- [ ] **Step 1: Add the snapshot fields to shared state**

In `src/renderer/core/state.ts`, directly after the `selectedUnitIdsAtMouseDown` property, add three properties. Each needs its own orienting comment in the surrounding style:

```ts
  /**
   * Epoch milliseconds when `selectedUnitIdsAtMouseDown` was last copied from the live selection. `0` means no gesture is open.
   *
   * Purpose: Lets the second press of a double-click keep the units the player had selected instead of resnapshotting whatever the first click selected.
   * When to use: Written by the main-map pointer-down listener. Reset to `0` everywhere the snapshot array is cleared.
   * Expected outcome: A press inside the gesture window leaves the snapshot array untouched.
   * Exceptions: None.
   */
  gestureSelectionSnapshotAtMs: 0,
  /**
   * Client X of the press that took the current gesture snapshot.
   *
   * Purpose: A second press far from this point is a new click, not the second half of a double-click, so the snapshot must be retaken.
   * When to use: Written beside `gestureSelectionSnapshotAtMs`.
   * Expected outcome: Meaningless while `gestureSelectionSnapshotAtMs` is `0`.
   * Exceptions: None.
   */
  gestureSelectionAnchorClientX: 0,
  /**
   * Client Y of the press that took the current gesture snapshot.
   *
   * Purpose: Pairs with `gestureSelectionAnchorClientX` for the double-click distance check.
   * When to use: Written beside `gestureSelectionSnapshotAtMs`.
   * Expected outcome: Meaningless while `gestureSelectionSnapshotAtMs` is `0`.
   * Exceptions: None.
   */
  gestureSelectionAnchorClientY: 0,
```

Then find every place that assigns `S.selectedUnitIdsAtMouseDown = []` and add `S.gestureSelectionSnapshotAtMs = 0;` on the following line. Those places are, today:

- `src/renderer/map/mainMapInteractions.ts`, in the `contextmenu` listener (Phase 5 rewrites this listener, but add the reset now so no path can leave the field stale)
- `src/renderer/gameplay/newGame.ts`
- `src/renderer/gameplay/tacticalOrders.ts`, inside `clearCommittedOrderDraftState`
- `src/renderer/tactical/tacticalIpcHandlers.ts`

The two anchor fields do not need resetting; they are only read when `gestureSelectionSnapshotAtMs` is non-zero.

- [ ] **Step 2: Apply the press decision on pointer down**

Inside `wireMainMapInteractions`, declare a local beside the other locals:

```ts
let suppressIconRetargetOnNextClick = false;
```

Replace the body of the existing primary-button `pointerdown` listener with:

```ts
mainMapEl.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  const press = resolveMapGesturePress({
    snapshotAtMs: S.gestureSelectionSnapshotAtMs,
    snapshotAnchorClientX: S.gestureSelectionAnchorClientX,
    snapshotAnchorClientY: S.gestureSelectionAnchorClientY,
    snapshotUnitCount: S.selectedUnitIdsAtMouseDown.length,
    liveSelectionDiffersFromSnapshot: selectionUnitIdSetsDiffer(
      S.selectedUnitIdsAtMouseDown,
      S.selectedUnitIds
    ),
    ctrlKey: e.ctrlKey,
    clientX: e.clientX,
    clientY: e.clientY,
    nowMs: Date.now(),
  });
  suppressIconRetargetOnNextClick = press.suppressIconRetarget;
  if (press.refreshSnapshot) {
    S.selectedUnitIdsAtMouseDown = [...S.selectedUnitIds];
    S.gestureSelectionSnapshotAtMs = Date.now();
    S.gestureSelectionAnchorClientX = e.clientX;
    S.gestureSelectionAnchorClientY = e.clientY;
  } else {
    clearDeferredHumanUnitSingleSelectTimer();
    if (press.restoreSnapshotSelection) {
      deps.replaceSelection([...S.selectedUnitIdsAtMouseDown]);
    }
  }
  deps.clearTerrainTooltipTimer();
  deps.hideTerrainTooltipVisual();
  hideOrderBlockHexTooltip();
  hideOrderSlowerHexTooltip();
});
```

Import `resolveMapGesturePress` from `../../shared/mapPlanningGesture` and `selectionUnitIdSetsDiffer` from `../../shared/selectionUnitIdSets`.

Call `deps.replaceSelection` directly. Do not route the restore through `shouldBlockSelectionReplaceDuringHoverPlanning`. That guard exists to stop new units being added during hover planning, and putting the player's own gesture-start units back is not an add.

- [ ] **Step 3: Stop the second click from retargeting the selection**

Add a `suppressSelectionRetarget: boolean` field to the argument object of `applyHumanUnitIconClickSelectionPolicy` in `src/renderer/map/mapClickSelectionPolicy.ts`. Document it: when true this click is the second press of a double-click, so it must neither replace the selection nor schedule a deferred replace.

Insert this immediately after the existing `shouldBlockEmbarkedLandUnitSelect` guard and before the Ctrl branch:

```ts
  if (args.suppressSelectionRetarget) {
    clearDeferredHumanUnitSingleSelectTimer();
    return;
  }
```

At the human-icon call site in the click listener, add the new field:

```ts
          suppressSelectionRetarget: suppressIconRetargetOnNextClick,
```

- [ ] **Step 4: Verify**

```bash
npm run build:main
node dist/shared/mapPlanningGesture.test.js
npx eslint src/renderer/core/state.ts src/renderer/map/mainMapInteractions.ts src/renderer/map/mapClickSelectionPolicy.ts src/renderer/gameplay/newGame.ts src/renderer/gameplay/tacticalOrders.ts src/renderer/tactical/tacticalIpcHandlers.ts
npm run check:renderer-types
npm run build:renderer
```

Expected: eslint clean on those files, `build:renderer` succeeds, and `check:renderer-types` reports nothing beyond the failures already recorded in `scripts/renderer-typecheck-baseline.json`.

Manual checks. Run these on the strategic map, then repeat on a tactical battle map. All of them describe behavior that already exists and must not change.

1. Single-click a human unit. It becomes selected shortly after the click.
2. Ctrl-click a second human unit. Both are selected. Ctrl-click it again. It is removed.
3. Click one human unit, then quickly click a different human unit a few hexes away. The second unit ends up selected on its own. This is the case the pixel tolerance protects.
4. Click a human unit twice in the same spot with nothing previously selected. That unit ends up selected.

---

### Phase 3: Defer the stack callout so it cannot swallow the second click

**Files:**

- Modify: `src/renderer/core/state.ts`, beside `pendingSelectTimeout`
- Modify: `src/renderer/map/mapClickSelectionPolicy.ts`
- Modify: `src/renderer/map/mainMapInteractions.ts`, the stack branch and the two icon hit tests in the click listener
- Modify: `src/renderer/renderer.ts`, `hideStackCallout`
- Modify: `src/renderer/map/initCore.ts`, the window `pointerdown` and `Escape` dismiss paths

**Interfaces:**

- Consumes: `HUMAN_UNIT_SINGLE_SELECT_DEBOUNCE_MS`, `MAP_DOUBLE_CLICK_ANCHOR_TOLERANCE_PX` from Phase 1, `suppressIconRetargetOnNextClick` from Phase 2
- Produces: `S.pendingStackCalloutTimeout`, `S.pendingStackCalloutAnchorClientX`, `S.pendingStackCalloutAnchorClientY`, `scheduleDeferredStackCallout`, `clearDeferredStackCalloutTimer`, `clearDeferredStackCalloutTimerForPressAway`, and a `pointerHitsDrawnUnitIcon` local inside `wireMainMapInteractions`

- [ ] **Step 1: Add the timer field**

In `src/renderer/core/state.ts`, after `pendingSelectTimeout`:

```ts
  /**
   * Timer that will open the stack callout after a single click, or `null` when no open is waiting.
   *
   * Purpose: The callout is layered above the map, so opening it on the first click would swallow the second click of a double-click. Waiting out the single-select delay lets a double-click on a stack icon plan an order instead.
   * When to use: Written only by `scheduleDeferredStackCallout`; cleared by `clearDeferredStackCalloutTimer`.
   * Expected outcome: The callout appears only if this timer is allowed to fire.
   * Exceptions: None.
   */
  pendingStackCalloutTimeout: null as ReturnType<typeof setTimeout> | null,
  /**
   * Client X of the click that scheduled the pending stack callout.
   *
   * Purpose: A press away from this point means the player moved on, so the popup must not still appear there; a press on the same point is the second half of a double-click and must leave it scheduled.
   * When to use: Written only by `scheduleDeferredStackCallout`; read only by `clearDeferredStackCalloutTimerForPressAway`.
   * Expected outcome: Meaningless while `pendingStackCalloutTimeout` is `null`.
   * Exceptions: None.
   */
  pendingStackCalloutAnchorClientX: 0,
  /**
   * Client Y of the click that scheduled the pending stack callout.
   *
   * Purpose: Pairs with `pendingStackCalloutAnchorClientX` for the press-away distance check.
   * When to use: Written only by `scheduleDeferredStackCallout`; read only by `clearDeferredStackCalloutTimerForPressAway`.
   * Expected outcome: Meaningless while `pendingStackCalloutTimeout` is `null`.
   * Exceptions: None.
   */
  pendingStackCalloutAnchorClientY: 0,
```

- [ ] **Step 2: Add the schedule and cancel helpers**

Append to `src/renderer/map/mapClickSelectionPolicy.ts`:

```ts
/**
 * Cancels a stack callout that has been scheduled but has not opened yet.
 *
 * Purpose: A right-click, an Escape, every existing hide path, and a double-click that plans an order must not leave a late popup to appear on its own.
 * When to use: From `hideStackCallout`, from gestures that supersede the popup, and before scheduling a new callout.
 * Expected outcome: `S.pendingStackCalloutTimeout` is null and the pending open never runs.
 * Exceptions: None.
 */
export function clearDeferredStackCalloutTimer(): void {
  if (S.pendingStackCalloutTimeout !== null) {
    clearTimeout(S.pendingStackCalloutTimeout);
    S.pendingStackCalloutTimeout = null;
  }
}

/**
 * Cancels a scheduled stack callout when a press lands away from where the callout would open.
 *
 * Purpose: A press somewhere else means the player moved on, so the popup must not appear over whatever
 * they went to. A press on the same spot is the second half of a double-click, which the double-click
 * handler resolves instead: it cancels the popup when it plans an order and leaves it when it has nothing
 * to plan, so double-clicking a stack still shows the same popup a single click would.
 * When to use: From the window-level press listener, before deciding whether to hide an open callout.
 * Expected outcome: No effect when nothing is scheduled or when the press is within the double-click pixel tolerance.
 * Exceptions: None.
 */
export function clearDeferredStackCalloutTimerForPressAway(clientX: number, clientY: number): void {
  if (S.pendingStackCalloutTimeout === null) return;
  const withinAnchor =
    Math.abs(clientX - S.pendingStackCalloutAnchorClientX) <= MAP_DOUBLE_CLICK_ANCHOR_TOLERANCE_PX &&
    Math.abs(clientY - S.pendingStackCalloutAnchorClientY) <= MAP_DOUBLE_CLICK_ANCHOR_TOLERANCE_PX;
  if (withinAnchor) return;
  clearDeferredStackCalloutTimer();
}

/**
 * Opens a stack or lone-enemy callout after the same delay used for human single-select.
 *
 * Purpose: Keeps the popup from covering the cursor before a double-click can reach the map, while keeping single-click behavior recognisable.
 * When to use: From the main-map click handler for a stack or lone-enemy icon hit, only on the click that started a new gesture.
 * Expected outcome: `show` runs once after `HUMAN_UNIT_SINGLE_SELECT_DEBOUNCE_MS`, at the click point it was scheduled for, unless the timer is cleared first.
 * Exceptions: None. `show` owns its own DOM failure handling.
 */
export function scheduleDeferredStackCallout(
  clientX: number,
  clientY: number,
  show: (calloutClientX: number, calloutClientY: number) => void
): void {
  clearDeferredStackCalloutTimer();
  S.pendingStackCalloutAnchorClientX = clientX;
  S.pendingStackCalloutAnchorClientY = clientY;
  S.pendingStackCalloutTimeout = setTimeout(() => {
    S.pendingStackCalloutTimeout = null;
    show(clientX, clientY);
  }, HUMAN_UNIT_SINGLE_SELECT_DEBOUNCE_MS);
}
```

Import `MAP_DOUBLE_CLICK_ANCHOR_TOLERANCE_PX` from `../../shared/mapPlanningGesture`; the press-away check and the double-click press check use the same tolerance because they answer the same question.

In `src/renderer/renderer.ts`, make `clearDeferredStackCalloutTimer()` the first statement of `hideStackCallout`, importing it from `./map/mapClickSelectionPolicy`. Put it before the early return that checks whether the element is already hidden, otherwise a pending open can survive a hide.

In `src/renderer/map/initCore.ts`, two window-level paths dismiss the callout but return early when it is still hidden, which a scheduled callout is. In the capture-phase `pointerdown` listener, move the `isStackCalloutTargetInsideDialog` guard to the top and call `clearDeferredStackCalloutTimerForPressAway(e.clientX, e.clientY)` before the hidden check. In the `Escape` branch of the `keydown` listener, call `clearDeferredStackCalloutTimer()` before the hidden check. Without these, pressing the tactical entry control or pressing Escape within the delay is followed by the popup appearing anyway.

- [ ] **Step 3: Share one icon hit test and defer the callout**

The click listener currently hit-tests drawn icons twice with slightly different local variables. Replace both with one local function declared inside `wireMainMapInteractions`:

```ts
  /**
   * Returns whether a client pixel lands on a drawn unit or stack icon in `h3Index`.
   *
   * Contract: Hidden strategic icons at far zoom and units currently animating a move are misses, which makes those clicks empty clicks.
   * When to use: Click and double-click handling, wherever an icon hit changes the outcome.
   * Expected outcome: False when the map is unavailable, no game state is loaded, or nothing is drawn in that hex.
   * Exceptions: None.
   */
  function pointerHitsDrawnUnitIcon(clientX: number, clientY: number, h3Index: string): boolean {
    if (shouldHideStrategicMapUnitsForRes4Zoom()) return false;
    if (!S.gameState) return false;
    const map = getMainLeafletMap() as { getContainer: () => HTMLElement } | null;
    if (!map) return false;
    const rect = map.getContainer().getBoundingClientRect();
    const { unitsToDraw, movingIds } = deps.getUnitsForDrawWithMovingIds(S.gameState);
    const drawnAtHit = unitsToDraw.filter((unit) => unit.h3Index === h3Index && !movingIds?.has(unit.id));
    if (drawnAtHit.length === 0) return false;
    return deps.containerPixelHitsDrawnUnitIcon(
      clientX - rect.left,
      clientY - rect.top,
      h3Index,
      drawnAtHit.length
    );
  }
```

Use it for the stack branch condition and in place of the `unitIconHit` term in the human-icon condition. That leaves seven locals in the click listener unused: `mapForClick`, `clickRect`, `px`, `py`, `strategicUnitsHiddenOnMap`, `stackIconHit`, and `drawnAtHit`. Delete all seven. Keep `unitsToDraw` and `movingIds`, which still build `unitsAtHit`, and keep `unitsAtHit`, `isStack`, and `isLoneAi`, which still feed the callout. Let eslint's unused-variable rule confirm you removed exactly the right set.

Replace the stack branch with:

```ts
    if (hit && (isStack || isLoneAi) && pointerHitsDrawnUnitIcon(e.clientX, e.clientY, hit)) {
      if (isHoverOrderPlanningActive()) {
        return;
      }
      if (!suppressIconRetargetOnNextClick) {
        const calloutCtrlKey = e.ctrlKey;
        scheduleDeferredStackCallout(e.clientX, e.clientY, (calloutClientX, calloutClientY) => {
          S.ctrlKeyActive = calloutCtrlKey;
          deps.showStackCallout(unitsAtHit, calloutClientX, calloutClientY);
          deps.updateSidebar();
          deps.updateRangedSidebar();
          deps.redraw();
        });
      }
      deps.updateSidebar();
      deps.updateRangedSidebar();
      deps.redraw();
      return;
    }
```

`unitsAtHit` is a fresh array from `filter`, so the callback can close over it. Do not read from `e` inside the timer callback; take the position from the callback parameters and copy any other event field into a local first.

Do not cancel the pending callout in the `pointerdown` listener from Phase 2. That press is the second half of a double-click on the same spot, and Phase 4 decides whether the popup still opens.

- [ ] **Step 4: Verify**

```bash
npm run build:main
npx eslint src/renderer/core/state.ts src/renderer/map/mapClickSelectionPolicy.ts src/renderer/map/mainMapInteractions.ts src/renderer/renderer.ts
npm run check:renderer-types
npm run build:renderer
```

Expected: eslint clean, renderer build succeeds, no new renderer type failures.

Manual checks, strategic then tactical:

1. Single-click a stack icon. The callout opens a moment later and lists the units.
2. Single-click a lone enemy unit icon. The callout opens a moment later.
3. Open a callout, then click empty ground. The callout closes and no stale popup reappears.
4. Click a stack icon and immediately press Escape, or immediately click the sidebar or a tactical entry control. No popup appears afterwards.
5. Press Escape with a callout open. It closes, as before.

Double-clicking a stack is covered in Phase 4, once the double-click handler can tell a gesture that plans an order from one that has nothing to plan.

---

### Phase 4: Apply the double-click decision table

**Files:**

- Create: `src/renderer/map/mapDoubleClickHandler.ts`
- Modify: `src/renderer/core/selection.ts`
- Modify: `src/renderer/map/mainMapInteractions.ts`, the `dblclick` listener; delete `commitGroupedAirFerryOrders`
- Modify: `src/main/rendererConsolidation.test.ts`, only `testParityDiagnosticsBreadcrumbsCoverPlanningAndPositionSourceBoundaries`

**Interfaces:**

- Consumes: `resolveMapDoubleClickAction`, `mapSelectionComposition`, `clearMapSelectionChrome`, `clearDeferredHumanUnitSingleSelectTimer`, `clearDeferredStackCalloutTimer`, and from the deps object `clientXYToHit`, `pointerHitsDrawnUnitIcon`, `getSelectedHumanUnitsAtMouseDown`, `commitGroupedMarchOrders`
- Produces: `handleMainMapDoubleClick`, `MainMapDoubleClickDeps`, `clearMapSelectionChrome`

- [ ] **Step 1: Add the shared selection-chrome clear**

Append to `src/renderer/core/selection.ts`:

```ts
/**
 * Clears the live selection and the gesture snapshot while leaving queued orders alone.
 *
 * Purpose: Right-click and an ineligible empty air double-click must drop the same chrome, and neither may discard marches, ferries, or other drafts the player already queued.
 * When to use: Those two gestures only. A successful order commit keeps using `clearCommittedOrderDraftState`.
 * Expected outcome: Selection, gesture snapshot, selected hex, hover preview, and both targeting modes are clear. Pending order arrays are untouched.
 * Exceptions: None.
 */
export function clearMapSelectionChrome(): void {
  clearSelection();
  S.selectedUnitIdsAtMouseDown = [];
  S.gestureSelectionSnapshotAtMs = 0;
}
```

`clearSelection` already nulls the selected hex and hover preview, bumps `hoverPreviewRequestSeq`, and turns off both targeting modes. Do not repeat that work and do not call `clearCommittedOrderDraftState` here.

- [ ] **Step 2: Write the handler module**

Create `src/renderer/map/mapDoubleClickHandler.ts`. Export a `MainMapDoubleClickDeps` type and one async function `handleMainMapDoubleClick(event: MouseEvent, deps: MainMapDoubleClickDeps): Promise<void>`. Both need orienting comments.

`MainMapDoubleClickDeps` carries what the current `dblclick` listener closes over:

- `clientXYToHit: (clientX: number, clientY: number) => string | null`
- `pointerHitsDrawnUnitIcon: (clientX: number, clientY: number, h3Index: string) => boolean`
- `getSelectedHumanUnitsAtMouseDown: (state: GameStateSnapshot) => DoubleClickSelectedUnit[]`
- `commitGroupedMarchOrders: (selectedIds: string[], destinationH3: string) => Promise<boolean>`
- `showMapToast`, `formatTargetingValidationReason`
- `replacePendingFerryOrdersForSelected`, `clearCommittedOrderDraftState`
- `updatePendingOrdersSidebar`, `updateSidebar`, `updateRangedSidebar`, `redraw`

`mainMapInteractions.ts` has this row shape today as a private `GroupedMarchSelectedUnit`. Move it into this module as an exported `DoubleClickSelectedUnit` and import it back, so the type lives with the code that defines what the rows are for. Do not duplicate the definition.

This module imports `rendererSharedState as S` from `../core/state`, `emitParityDiagnosticsBreadcrumb` from `../core/parityDiagnostics`, `clearMapSelectionChrome` from `../core/selection`, the two timer helpers from `./mapClickSelectionPolicy`, and the two decision functions from `../../shared/mapPlanningGesture`.

Behavior, in order:

1. Call `clearDeferredHumanUnitSingleSelectTimer()`. Set `S.gestureSelectionSnapshotAtMs = 0` so the next press starts a fresh gesture. Leave `S.selectedUnitIdsAtMouseDown` populated, because the rest of this function reads it. Do not touch the stack callout timer yet; step 7 decides that.
2. If `S.gameState` is null, emit `planning.doubleClickIgnored` with `{ reason: 'missing_game_state' }` and return.
3. Resolve the destination: `clientXYToHit(event.clientX, event.clientY)` first, then `S.hoveredHexH3`, then `S.selectedHexIndex`. Do not put `S.selectedHexIndex` first. `replaceSelection` rewrites it to the primary selected unit's own hex, which is exactly what breaks an icon double-click today.
4. Compute `iconHit`. It is `pointerHitsDrawnUnitIcon(event.clientX, event.clientY, destination)` only when the destination came from the click hit in step 3. When the destination fell back to the hovered or selected hex, the pixel is not over that hex, so `iconHit` is false.
5. Build the rest of the decision input. `targetingModeActive` is `S.rangedModeActive || S.airStrikeModeActive`. The selected units come from `getSelectedHumanUnitsAtMouseDown(S.gameState)`; keep their ids in a `selectedIds` local, because the ferry and march calls below both need it. `composition` is `mapSelectionComposition` over their `unitType` values. `allSelectedUnitsAlreadyAtDestination` is true when the list is non-empty and every `h3Index` equals the destination. `ferryEligible` starts as null.
6. Call `resolveMapDoubleClickAction`. If it returns `ignore`, emit `planning.doubleClickIgnored` and return. Pick the reason from the facts you already have, reusing today's strings: `targeting_mode_active`, `missing_destination`, `missing_selection_at_mouse_down`, or `destination_equals_current_positions`.
7. Call `clearDeferredStackCalloutTimer()`. Every outcome that survives step 6 supersedes the popup, and returning in step 6 instead is what keeps a double-click on a stack showing the same popup a single click would. Cancelling here rather than after the ferry check also means a slow ferry validation cannot be interrupted by the popup opening mid-flight. Then narrow the destination to a non-null string; `ignore` is the only outcome the table returns without one, so no cast is needed anywhere below.
8. If the action is `needFerryValidation`: when `window.gameApi?.validateGroupFerryTarget` is missing, emit `planning.doubleClickIgnored` with `{ reason: 'ferry_api_missing' }` and return. Otherwise await it with the existing payload shape `{ unitIds, destinationH3Index }`, keep the returned validation object for its `reason`, and call `resolveMapDoubleClickAction` again with `ferryEligible` set to `validation.success`. Re-resolving cannot produce `ignore`, because nothing else in the input changed.
9. Apply the action:
   - `rejectMixed`: emit `planning.doubleClickRejected` with `{ reason: 'mixed_air_non_air_selection', selectedCount }`. Show `Cannot issue grouped movement for mixed air and non-air units.` with `{ isError: true }`. Return.
   - `rejectFerry`: emit `planning.doubleClickRejected` with `{ reason: 'ferry_destination_rejected' }`. Show `formatTargetingValidationReason(validation.reason, 'Selected air units cannot ferry to that destination.')` with `{ isError: true }`. Return without changing the selection.
   - `deselect`: emit `planning.doubleClickDeselect` with `{ destinationH3, selectedCount }`. Call `clearMapSelectionChrome()`, then `updateSidebar()`, `updateRangedSidebar()`, and `redraw()`. Show no toast.
   - `planFerry`: emit `planning.doubleClickAccepted` with the fields used today, `{ tacticalModeActive: !!S.tacticalBattleSnapshot, selectedCount, destinationH3, hasAirSelection: true }`. Call `replacePendingFerryOrdersForSelected(selectedIds, destinationH3)`, then `clearCommittedOrderDraftState()`, `updatePendingOrdersSidebar()`, `updateSidebar()`, and `redraw()`. Do not call the ferry validation a second time.
   - `planMarch`: emit `planning.doubleClickAccepted` with the same fields and `hasAirSelection: false`, then await `commitGroupedMarchOrders(selectedIds, destinationH3)`. That function already handles its own toast, sidebar refresh, and redraw.

Then replace the `dblclick` listener in `mainMapInteractions.ts` with a single delegation:

```ts
  mainMapEl.addEventListener('dblclick', (e) => {
    void handleMainMapDoubleClick(e, {
      clientXYToHit,
      pointerHitsDrawnUnitIcon,
      getSelectedHumanUnitsAtMouseDown,
      commitGroupedMarchOrders,
      showMapToast: deps.showMapToast,
      formatTargetingValidationReason: deps.formatTargetingValidationReason,
      replacePendingFerryOrdersForSelected: deps.replacePendingFerryOrdersForSelected,
      clearCommittedOrderDraftState: deps.clearCommittedOrderDraftState,
      updatePendingOrdersSidebar: deps.updatePendingOrdersSidebar,
      updateSidebar: deps.updateSidebar,
      updateRangedSidebar: deps.updateRangedSidebar,
      redraw: deps.redraw,
    });
  });
```

Keep `commitGroupedMarchOrders` where it is inside `wireMainMapInteractions`. Delete `commitGroupedAirFerryOrders` entirely. Nothing calls it after this phase, and leaving it would risk a future edit reintroducing a toast on a click that is supposed to clear the selection silently. Delete the old inline double-click decision code so it cannot run alongside the new handler.

- [ ] **Step 3: Repoint the existing breadcrumb test**

In `testParityDiagnosticsBreadcrumbsCoverPlanningAndPositionSourceBoundaries` in `src/main/rendererConsolidation.test.ts`, read `src/renderer/map/mapDoubleClickHandler.ts` in place of `mainMapInteractions.ts` for the three planning breadcrumb strings. Leave the selection-policy and tactical-overlay assertions pointing at their current files. Update that function's orienting comment to name the new file.

- [ ] **Step 4: Verify**

```bash
npm run build:main
node dist/shared/mapPlanningGesture.test.js
node dist/main/rendererConsolidation.test.js
npx eslint src/renderer/map/mapDoubleClickHandler.ts src/renderer/map/mainMapInteractions.ts src/renderer/core/selection.ts src/main/rendererConsolidation.test.ts
npm run check:renderer-types
npm run build:renderer
```

Expected: both node tests pass, eslint clean, renderer build succeeds, no new renderer type failures.

Manual checks. Do all seven on the strategic map, then all seven in a tactical battle.

1. Select air units only. Double-click an eligible ferry destination on open ground. A ferry order is queued and no error toast appears.
2. Select air units only. Double-click an eligible ferry destination that contains a unit or stack icon, landing the click on the icon. The ferry is queued for the air units that were selected before the double-click.
3. Queue a ferry, select air units again, then double-click open ground that is not a ferry destination. The selection and hover preview clear, no toast appears, and the previously queued ferry is still listed in the pending orders sidebar.
4. Select air units only. Double-click a unit icon on a hex that is not a ferry destination. The ferry error toast appears and the air units stay selected.
5. Select ground or naval units. Double-click an eligible destination that contains a unit icon, landing on the icon. The move is queued for the originally selected units.
6. Select ground or naval units. Double-click an ineligible hex. The existing movement-failure toast appears and the selection is not silently cleared.
7. Select one air and one ground unit. Double-click another hex, once on open ground and once on an icon. Both times the mixed-movement toast appears and the selection stays.
8. Select a ground unit, then double-click open ground inside the hex it already occupies. The selection clears, which is what happens today.

---

### Phase 5: Right-click clears every selection completely

**Files:**

- Modify: `src/renderer/map/mainMapInteractions.ts`, the `contextmenu` listener

**Interfaces:**

- Consumes: `clearMapSelectionChrome`, `clearDeferredHumanUnitSingleSelectTimer`, `clearDeferredStackCalloutTimer`
- Produces: nothing new

Right-click already clears a selection anywhere on the map. This phase makes that clear match the locked chrome list and cancels the two deferred timers so neither can undo it. It deliberately does not add an icon-hit exception: right-click clears on empty hexes and on icons alike. An open stack callout is already dismissed by the capture-phase window `pointerdown` listener in `initCore.ts`, so this listener does not need to hide it.

- [ ] **Step 1: Replace the listener body**

Import `clearMapSelectionChrome` from `../core/selection`. The two timer helpers are already imported from `./mapClickSelectionPolicy` by earlier phases.

```ts
  mainMapEl.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    clearDeferredHumanUnitSingleSelectTimer();
    clearDeferredStackCalloutTimer();
    if (S.selectedUnitIds.length === 0 && !S.hoverRoutePreview) {
      S.selectedUnitIdsAtMouseDown = [];
      S.gestureSelectionSnapshotAtMs = 0;
      return;
    }
    clearMapSelectionChrome();
    deps.updateSidebar();
    deps.updateRangedSidebar();
    deps.redraw();
  });
```

Do not hit-test icons here. Do not touch any pending order array.

- [ ] **Step 2: Verify**

```bash
npm run build:main
npx eslint src/renderer/map/mainMapInteractions.ts
npm run check:renderer-types
npm run build:renderer
```

Expected: eslint clean, renderer build succeeds, no new renderer type failures.

Manual checks, strategic then tactical:

1. Select air units and hover a destination so a preview line is showing. Right-click open ground. Selection and preview are gone, and a ferry queued earlier is still in the pending orders sidebar.
2. Select one air and one ground unit. Right-click open ground. The whole selection clears.
3. Select a ground unit. Right-click directly on a unit icon. The selection still clears.
4. With nothing selected, right-click the map. Nothing changes and no error appears.

---

### Phase 6: Wiring test and full suite

**Files:**

- Create: `src/main/mapGestureWiring.test.ts`

**Interfaces:**

- Consumes: `getFunctionSource` from `src/main/testSupport/rendererSourceAssertions.ts`
- Produces: nothing used by product code

The renderer has no DOM test harness, so the existing pattern for renderer coverage is source-text assertions run from `src/main`. Keep this file small: assert only the call sites that would silently break the feature if they were dropped in a later refactor. Do not mirror every line of the implementation.

- [ ] **Step 1: Write the wiring test**

Create `src/main/mapGestureWiring.test.ts`. Follow the file style of `src/main/rendererConsolidation.test.ts`: read sources with `fs.readFileSync`, use `getFunctionSource` where a claim is about one function, and give every test function an orienting comment. Assert exactly these seven things:

1. `src/renderer/map/mainMapInteractions.ts` calls `resolveMapGesturePress(` in its pointer-down path, so the snapshot cannot silently go back to being overwritten on every press.
2. `src/renderer/map/mapClickSelectionPolicy.ts` contains `suppressSelectionRetarget`, so the second click of a double-click still cannot retarget the selection.
3. `src/renderer/map/mapClickSelectionPolicy.ts` contains both `function scheduleDeferredStackCallout` and `function clearDeferredStackCalloutTimer`.
4. `hideStackCallout` in `src/renderer/renderer.ts` calls `clearDeferredStackCalloutTimer()`, and `src/renderer/map/initCore.ts` calls `clearDeferredStackCalloutTimerForPressAway(`, so a scheduled popup cannot outlive either dismiss path.
5. `src/renderer/map/mapDoubleClickHandler.ts` calls `resolveMapDoubleClickAction(` and `clearMapSelectionChrome(`.
6. `src/renderer/map/mainMapInteractions.ts` does not contain `commitGroupedAirFerryOrders`, so the deleted silent-clear-blocking path cannot come back unnoticed.
7. The `contextmenu` listener body in `src/renderer/map/mainMapInteractions.ts` contains `clearMapSelectionChrome()` and does not contain `pointerHitsDrawnUnitIcon`, so right-click never grows an icon-hit exception.

For assertion 7, slice the listener text between `addEventListener('contextmenu'` and the end of that callback rather than searching the whole file.

- [ ] **Step 2: Run the new test**

```bash
npm run build:main
node dist/main/mapGestureWiring.test.js
```

Expected: all assertions pass.

- [ ] **Step 3: Run the full suite**

```bash
npm test
npm run build:renderer
```

Expected: `npm test` completes successfully. It runs `build:main`, `lint`, `naming:check`, `check:renderer-types`, and every `node:test` file under `dist`. Fix anything it reports before calling the work done. Do not commit.

---

## Done when

- Every phase's verification commands have passed, in order, ending with a clean `npm test`.
- The Phase 4 and Phase 5 manual checks have been done on both the strategic map and a tactical battle.
- The Phase 2 manual checks still pass, in particular clicking two different units in quick succession.
- No deselect path clears a pending order array.
- `src/renderer/renderer.ts` still contains the contract-anchor comment lines quoted under Locked behavior.
- `src/renderer/map/mainMapInteractions.ts` is shorter than it was before this work.
