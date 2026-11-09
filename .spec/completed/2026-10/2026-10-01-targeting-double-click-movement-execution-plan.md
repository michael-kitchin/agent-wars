# Targeting Double-Click Commit Implementation Plan

> **For agentic workers:** Implement this plan phase by phase, in order. Do not start a phase until the previous phase's verification commands pass. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** While Ranged or Strike targeting is on, a double-click places that attack and does not plan a march or ferry. A single click does not place the attack and does not change the selection.

**Architecture:** `resolveMapDoubleClickAction` gains one outcome, `planSupportTarget`, used only when targeting is on, the pointer is over a hex, and the gesture snapshot has units. The double-click handler performs today's ranged and air-strike validation. The click listener returns before it can queue an attack or clear the selection. Strategic and tactical maps share `wireMainMapInteractions`.

**Tech Stack:** TypeScript, Electron renderer, Node `node:test` for `src/shared`, and direct `node` runs for the renderer source-contract tests. Validators stay `validateGroupAirStrikeTarget` and `validateGroupRangedTarget`.

## Global Constraints

- Do not commit or push.
- Do not put phase, stage, or plan identifiers into code, comments, tests, configuration, or lint messages. Headings in this plan stay here.
- Directories and TypeScript files under `src/` use camelCase. Exported functions are camelCase. Exported types are PascalCase.
- Allowed role suffixes are `Handler`, `Helpers`, `Guards`, `Adapter`, `Pipeline`, `Core`, and `Types`. Do not use `Utils` or `Impl`.
- Do not rename frozen string values: IPC names, the toast sentences quoted below, and the breadcrumb keys `planning.doubleClickIgnored`, `planning.doubleClickRejected`, `planning.doubleClickAccepted`, and `planning.doubleClickDeselect`.
- New and updated fields and non-overriding functions need an orienting comment. Use the comment text in this plan. Do not restyle the boilerplate comments already in files you touch.
- Test the decision outcomes and the wiring assertions in this plan only.
- Renderer and shared modules do not take main-process debug or trace logging. Do not add a main-process API. No IPC changes.
- Do not add a timer, a gesture latch, or a rollback of a queued attack.
- `src/renderer/map/mainMapInteractions.ts` must end smaller than it started. Do not split it.

## Locked behavior

While `rangedModeActive` or `airStrikeModeActive` is on and at least one unit is selected:

- A single click does not queue an attack, a march, or a ferry. It does not change the selection, the selected hex, build entry, tactical entry, or the stack callout. Hover shot lines stay as they are.
- That click returns after the existing tactical-footprint toast and before `S.selectedHexIndex = hit`, including when the hit is null. A miss must not reach `clearSelection()`. That call turns targeting off while `selectedUnitIdsAtMouseDown` still holds the units, and the double-click would then plan a march.
- A click outside the active tactical battle still toasts `That hex is outside the active tactical battle.` and returns. That path already leaves targeting on. The double-click must not toast that sentence again.
- A double-click places the attack. Check air strike before ranged. The target hex is the hex under the pointer (`clickHit`). Do not use `clickHit ?? S.hoveredHexH3 ?? S.selectedHexIndex` for the attack. That fallback stays in place for marches and ferries.
- A double-click with no hex under the pointer does not place an attack and does not plan a move.
- Legality stays inside `validateGroupAirStrikeTarget` and `validateGroupRangedTarget`. Pass the gesture-snapshot ids from `getSelectedHumanUnitsAtMouseDown`.
- A missing validate API returns without a toast. If targeting turns off during the await, or the live selection no longer matches the snapshot ids, queue nothing and show no toast. Emit `planning.doubleClickIgnored` with reason `targeting_changed_during_validation`.
- Read `S.airStrikeTargetType` once, before the air-strike await, and pass that same value to both validation and `replacePendingAirStrikesForSelected`. A target-type change during the await must not queue a type that was not validated.
- Success queues the attack, turns that targeting mode off, and clears the selection with the same follow-up the click path uses today. Set `S.selectedHexIndex` to `clickHit` before validation so a failure still leaves that hex selected. Do not call `clearCommittedOrderDraftState`.
- Failure shows today's error toast, queues nothing, leaves targeting on, and does not clear the hover preview.
- The double-click does not deselect, march, ferry, or show `Cannot issue grouped movement for mixed air and non-air units.`, including on the units' own hex, on a unit icon, and when the pointer hex is outside the battle. Outside the battle, emit `planning.doubleClickIgnored` with reason `outside_tactical_footprint` and return.

Cancel, the air-strike Cancel button, right-click, and a selection that can no longer fire already turn targeting off. Leave them alone. The next double-click can plan a march or ferry. A strategic click that misses every hex no longer cancels targeting. Playback still returns before any of this. Both theaters share one wiring.

Toast sentences to copy exactly:

- `That hex is outside the active tactical battle.`
- `Selected air units cannot strike that target.`
- `Selected units cannot fire at that target.`
- `Cannot issue grouped movement for mixed air and non-air units.`

## Background the implementer needs

Read these before editing.

1. Browser order for a double-click is click, click, dblclick. The click listener in [`src/renderer/map/mainMapInteractions.ts`](src/renderer/map/mainMapInteractions.ts) currently awaits validation and, on success, turns targeting off and calls `clearSelection()`. That clears the live selection and both mode flags, but not `selectedUnitIdsAtMouseDown`. [`handleMainMapDoubleClick`](src/renderer/map/mapDoubleClickHandler.ts) then sees targeting off and plans a march or ferry from the snapshot.
2. [`resolveMapDoubleClickAction`](src/shared/mapPlanningGesture.ts) returns `ignore` whenever `targetingModeActive` is true. That ignore is what the double-click was supposed to do. It loses because the flag is already false.
3. `destinationH3` in the double-click handler is `clickHit ?? S.hoveredHexH3 ?? S.selectedHexIndex`. Attacks must not use that fallback. `pointerHasHit` is `clickHit !== null`.
4. A null hit during a tactical battle is already outside the footprint: `tacticalHitIsInsideBattle` returns false when `hit` is null. The click listener toasts and returns before `selectedHexIndex` is assigned. Keep that toast where it is.
5. On the strategic map there is no footprint toast. A null hit falls through to `clearSelection()`, which is the march bug above. The new early return closes it.
6. [`src/main/selectionSupportButtonRefresh.test.ts`](src/main/selectionSupportButtonRefresh.test.ts) slices `handleMainMapDoubleClick` from `case 'planFerry':` to `case 'planMarch':`. Put `case 'planSupportTarget':` before `case 'planFerry':` so that slice stays the ferry branch.
7. Do not change `resolveMapGesturePress`, ferry validation, or `commitGroupedMarchOrders`.

## Phase 1: Decision table

**Files:**

- Modify: `src/shared/mapPlanningGesture.ts`
- Modify: `src/shared/mapPlanningGesture.test.ts`
- Modify: `src/renderer/map/mapDoubleClickHandler.ts` (compile glue only)
- Test: `dist/shared/mapPlanningGesture.test.js` after `npm run build:main`

**Produces:** `MapDoubleClickDecisionInput.pointerHasHit` and `MapDoubleClickAction` kind `planSupportTarget`.

The `case 'planSupportTarget': return;` added below does not place an attack. Phase 2 replaces it. Do not stop after this phase.

- [ ] **Step 1: Write the failing test**

In `src/shared/mapPlanningGesture.test.ts`, add `pointerHasHit: true` to the `airAway` object, next to `targetingModeActive: false`.

Replace the test named `ignores targeting mode, a missing destination, and an empty selection` with these two tests:

```ts
  it('plans a support target while targeting is on, including own hex and icon hits', () => {
    for (const composition of ['airOnly', 'nonAirOnly', 'mixed'] as const) {
      assert.deepEqual(
        resolveMapDoubleClickAction({
          ...airAway,
          composition,
          targetingModeActive: true,
          allSelectedUnitsAlreadyAtDestination: true,
          iconHit: true,
        }),
        { kind: 'planSupportTarget' },
        `targeting should plan a support target for a ${composition} selection`
      );
    }
  });

  it('ignores a targeting double-click with no pointer hex or an empty selection, and ignores a move with no destination', () => {
    assert.deepEqual(
      resolveMapDoubleClickAction({ ...airAway, targetingModeActive: true, pointerHasHit: false, hasDestination: true }),
      { kind: 'ignore' }
    );
    assert.deepEqual(
      resolveMapDoubleClickAction({ ...airAway, targetingModeActive: true, composition: 'empty' }),
      { kind: 'ignore' }
    );
    assert.deepEqual(resolveMapDoubleClickAction({ ...airAway, hasDestination: false }), { kind: 'ignore' });
    assert.deepEqual(resolveMapDoubleClickAction({ ...airAway, composition: 'empty' }), { kind: 'ignore' });
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run build:main`

Expected: compile failure, because `pointerHasHit` is not on the input type yet. If the build succeeds, run `node --test dist/shared/mapPlanningGesture.test.js` and expect failure mentioning `planSupportTarget`.

- [ ] **Step 3: Update the decision table**

Add this field to `MapDoubleClickDecisionInput`, after `targetingModeActive`:

```ts
  /**
   * Whether the double-click pointer was over a map hex.
   *
   * Purpose: Ranged and air-strike commits use only that hex. March and ferry planning may fall back to the hovered or selected hex, and must not lend that fallback to an attack.
   * When to use: Set from `clickHit !== null` before calling `resolveMapDoubleClickAction`.
   * Expected outcome: With targeting on, a true value and a non-empty selection plan a support target. A false value ignores the double-click.
   * Exceptions: None.
   */
  pointerHasHit: boolean;
```

Add `{ kind: 'planSupportTarget' }` to `MapDoubleClickAction` after `{ kind: 'ignore' }`.

In the comment on `MapDoubleClickAction`, add `planSupportTarget` to the list of outcomes.

Replace the body of `resolveMapDoubleClickAction` with:

```ts
export function resolveMapDoubleClickAction(input: MapDoubleClickDecisionInput): MapDoubleClickAction {
  if (input.targetingModeActive) {
    if (input.pointerHasHit && input.composition !== 'empty') return { kind: 'planSupportTarget' };
    return { kind: 'ignore' };
  }
  if (!input.hasDestination || input.composition === 'empty') {
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
```

Replace the expected-outcome sentence on `resolveMapDoubleClickAction` with: `While targeting is on, a pointer hex and a non-empty selection plan a support target; anything else is ignored and movement is not considered. With targeting off, an empty click on the units' own hex clears, air units otherwise clear on an empty ineligible click and toast on an icon one, mixed selections reject, and non-air selections plan a march.`

- [ ] **Step 4: Keep the handler compiling**

In `handleMainMapDoubleClick`, set `pointerHasHit: clickHit !== null` on `decisionInput`.

In the `switch`, immediately before `case 'planFerry':`, add:

```ts
    case 'planSupportTarget':
      return;
```

Leave `ignoreReasonFor` as it is. When targeting is on and the result is `ignore`, the first check still returns `targeting_mode_active`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run build:main`

Run: `node --test dist/shared/mapPlanningGesture.test.js`

Expected: pass, including the existing ferry, march, deselect, and press tests.

## Phase 2: Double-click commit and inert single click

**Files:**

- Modify: `src/renderer/map/mapDoubleClickHandler.ts`
- Modify: `src/renderer/map/mainMapInteractions.ts`
- Modify: `src/main/mapGestureWiring.test.ts`
- Test: `dist/main/mapGestureWiring.test.js` and `dist/main/selectionSupportButtonRefresh.test.js` after `npm run build:main`

**Consumes:** `planSupportTarget` and `pointerHasHit` from Phase 1.

**Produces:** a double-click that queues the attack, and a click listener that does not.

- [ ] **Step 1: Write the failing wiring test**

In `src/main/mapGestureWiring.test.ts`, add this function and call it from `run()`:

```ts
/**
 * Checks that a targeting click cannot queue an attack and that the double-click does.
 *
 * Purpose: The first click of a double-click used to turn targeting off, so the double-click planned a march.
 * When to use: After moving ranged and air-strike commit onto the double-click handler.
 * Expected outcome: The click listener returns after the footprint toast and before the selected-hex write, and the support-target branch validates both attack kinds before the ferry branch.
 * Exceptions: AssertionError naming the missing guard.
 */
function testTargetingDoubleClickPlacesTheAttack(): void {
  const interactionsSource = readRendererSource('map', 'mainMapInteractions.ts');
  const listenerStart = interactionsSource.indexOf("addEventListener('click'");
  const listenerEnd = interactionsSource.indexOf("addEventListener('dblclick'");
  assert.ok(listenerStart >= 0 && listenerEnd > listenerStart, 'click listener should precede the double-click listener');
  const listenerSource = interactionsSource.slice(listenerStart, listenerEnd);
  const footprintAt = listenerSource.indexOf('That hex is outside the active tactical battle.');
  const swallowAt = listenerSource.indexOf('S.rangedModeActive || S.airStrikeModeActive');
  const selectedHexAt = listenerSource.indexOf('S.selectedHexIndex = hit');
  assert.ok(
    footprintAt >= 0 && swallowAt > footprintAt && selectedHexAt > swallowAt,
    'a targeting click should return after the footprint toast and before the selected hex is assigned'
  );
  assert.ok(
    listenerSource.slice(swallowAt, selectedHexAt).includes('return;'),
    'the targeting click should return before it assigns the selected hex'
  );
  assert.ok(
    !listenerSource.includes('validateGroupRangedTarget') && !listenerSource.includes('validateGroupAirStrikeTarget'),
    'the click listener should not validate ranged or air-strike targets'
  );

  const handlerSource = getFunctionSource(
    readRendererSource('map', 'mapDoubleClickHandler.ts'),
    'handleMainMapDoubleClick'
  );
  const supportAt = handlerSource.indexOf("case 'planSupportTarget':");
  const ferryAt = handlerSource.indexOf("case 'planFerry':");
  assert.ok(supportAt >= 0 && ferryAt > supportAt, 'support-target handling should precede the ferry branch');
  const supportBody = handlerSource.slice(supportAt, ferryAt);
  assert.ok(
    supportBody.includes('validateGroupAirStrikeTarget') && supportBody.includes('validateGroupRangedTarget'),
    'the support-target branch should validate air strikes and ranged attacks'
  );
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run build:main`

Run: `node dist/main/mapGestureWiring.test.js`

Expected: fail on the first assertion. The click listener does not yet contain `S.rangedModeActive || S.airStrikeModeActive` after the footprint toast. After that string exists, the test still fails until the support-target case contains both validators.

- [ ] **Step 3: Extend the double-click deps**

In `src/renderer/map/mapDoubleClickHandler.ts`, change the `ipcTypes` import to:

```ts
import type { AirStrikeTargetType, GameStateSnapshot } from '../../shared/ipcTypes';
```

Add these imports:

```ts
import { selectionUnitIdSetsDiffer } from '../../shared/selectionUnitIdSets';
import { tacticalRendererHitInsideBattleFootprint } from '../tactical/tacticalUiGuards';
```

Add these members to `MainMapDoubleClickDeps`, using these comments:

```ts
  /**
   * Queues one air strike per snapshot unit, replacing any previous strike for those ids.
   *
   * Purpose: The double-click commit path must record the strike the click path used to record.
   * When to use: After `validateGroupAirStrikeTarget` succeeds.
   * Expected outcome: `pendingAirStrikes` holds the new rows for `selectedIds` and keeps other units' rows.
   * Exceptions: None.
   */
  replacePendingAirStrikesForSelected: (
    selectedIds: string[],
    targetH3Index: string,
    targetType: AirStrikeTargetType
  ) => void;
  /**
   * Queues one ranged attack per snapshot unit, replacing any previous attack for those ids.
   *
   * Purpose: The double-click commit path must record the attack the click path used to record.
   * When to use: After `validateGroupRangedTarget` succeeds.
   * Expected outcome: `pendingRangedAttacks` holds the new rows for `selectedIds` and keeps other units' rows.
   * Exceptions: None.
   */
  replacePendingRangedAttacksForSelected: (selectedIds: string[], targetH3Index: string) => void;
  /**
   * Clears the live selection, both targeting flags, the selected hex, and the hover preview.
   *
   * Purpose: A successful attack ends targeting the same way the old click path did. `clearCommittedOrderDraftState` also changes committed-line visibility, so this path must not call it.
   * When to use: Only after a ranged attack or air strike has been queued.
   * Expected outcome: Selection chrome for the draft is clear. Queued orders stay queued.
   * Exceptions: None.
   */
  clearSelection: () => void;
  /**
   * Hides an open stack callout.
   *
   * Purpose: A successful attack used to close the callout from the click path.
   * When to use: After a ranged attack or air strike has been queued.
   * Expected outcome: The callout is hidden.
   * Exceptions: None.
   */
  hideStackCallout: () => void;
```

In the `dblclick` listener inside `wireMainMapInteractions`, pass the four members through from the existing `deps` argument. Their names already match:

```ts
      replacePendingAirStrikesForSelected: deps.replacePendingAirStrikesForSelected,
      replacePendingRangedAttacksForSelected: deps.replacePendingRangedAttacksForSelected,
      clearSelection: deps.clearSelection,
      hideStackCallout: deps.hideStackCallout,
```

- [ ] **Step 4: Replace the temporary support-target case**

Delete `case 'planSupportTarget': return;`.

Insert this case immediately before `case 'planFerry':`. `clickHit`, `selectedIds`, `selectedAtMouseDown`, and `acceptedDetails` already exist in the function. `acceptedDetails.destinationH3` may be the fallback hex; the emits below override it with `clickHit`.

```ts
    case 'planSupportTarget': {
      // The decision table only returns this kind when the pointer is over a hex. This narrows the type.
      if (clickHit === null) return;
      if (
        S.tacticalBattleSnapshot &&
        !tacticalRendererHitInsideBattleFootprint(clickHit, S.tacticalBattleSnapshot)
      ) {
        emitParityDiagnosticsBreadcrumb('planning.doubleClickIgnored', {
          reason: 'outside_tactical_footprint',
          selectedCount: selectedAtMouseDown.length,
        });
        return;
      }
      S.selectedHexIndex = clickHit;
      const idsAtStart = [...selectedIds];
      if (S.airStrikeModeActive) {
        if (!window.gameApi?.validateGroupAirStrikeTarget) {
          emitParityDiagnosticsBreadcrumb('planning.doubleClickIgnored', { reason: 'support_target_api_missing' });
          return;
        }
        const targetTypeAtStart = S.airStrikeTargetType;
        const validation = await window.gameApi.validateGroupAirStrikeTarget({
          unitIds: idsAtStart,
          targetH3Index: clickHit,
          targetType: targetTypeAtStart,
        });
        if (!S.airStrikeModeActive || selectionUnitIdSetsDiffer(idsAtStart, S.selectedUnitIds)) {
          emitParityDiagnosticsBreadcrumb('planning.doubleClickIgnored', {
            reason: 'targeting_changed_during_validation',
            selectedCount: idsAtStart.length,
          });
          return;
        }
        if (!validation.success) {
          emitParityDiagnosticsBreadcrumb('planning.doubleClickRejected', {
            reason: 'air_strike_target_rejected',
            selectedCount: idsAtStart.length,
            destinationH3: clickHit,
          });
          deps.showMapToast(
            deps.formatTargetingValidationReason(validation.reason, 'Selected air units cannot strike that target.'),
            { isError: true }
          );
          deps.updateRangedSidebar();
          deps.redraw();
          return;
        }
        emitParityDiagnosticsBreadcrumb('planning.doubleClickAccepted', {
          ...acceptedDetails,
          destinationH3: clickHit,
          hasAirSelection: true,
        });
        deps.replacePendingAirStrikesForSelected(idsAtStart, clickHit, targetTypeAtStart);
        S.airStrikeModeActive = false;
        deps.clearSelection();
        S.hoverRoutePreview = null;
        S.hoverPreviewRequestSeq++;
        deps.updateRangedSidebar();
        deps.hideStackCallout();
        deps.updateSidebar();
        deps.redraw();
        return;
      }
      if (!S.rangedModeActive) {
        emitParityDiagnosticsBreadcrumb('planning.doubleClickIgnored', {
          reason: 'targeting_changed_during_validation',
          selectedCount: idsAtStart.length,
        });
        return;
      }
      if (!window.gameApi?.validateGroupRangedTarget) {
        emitParityDiagnosticsBreadcrumb('planning.doubleClickIgnored', { reason: 'support_target_api_missing' });
        return;
      }
      const validation = await window.gameApi.validateGroupRangedTarget({
        unitIds: idsAtStart,
        targetH3Index: clickHit,
      });
      if (!S.rangedModeActive || selectionUnitIdSetsDiffer(idsAtStart, S.selectedUnitIds)) {
        emitParityDiagnosticsBreadcrumb('planning.doubleClickIgnored', {
          reason: 'targeting_changed_during_validation',
          selectedCount: idsAtStart.length,
        });
        return;
      }
      if (!validation.success) {
        emitParityDiagnosticsBreadcrumb('planning.doubleClickRejected', {
          reason: 'ranged_target_rejected',
          selectedCount: idsAtStart.length,
          destinationH3: clickHit,
        });
        deps.showMapToast(
          deps.formatTargetingValidationReason(validation.reason, 'Selected units cannot fire at that target.'),
          { isError: true }
        );
        deps.updateRangedSidebar();
        deps.redraw();
        return;
      }
      emitParityDiagnosticsBreadcrumb('planning.doubleClickAccepted', {
        ...acceptedDetails,
        destinationH3: clickHit,
        hasAirSelection: false,
      });
      deps.replacePendingRangedAttacksForSelected(idsAtStart, clickHit);
      S.rangedModeActive = false;
      deps.clearSelection();
      S.hoverRoutePreview = null;
      S.hoverPreviewRequestSeq++;
      deps.updateRangedSidebar();
      deps.hideStackCallout();
      deps.updateSidebar();
      deps.redraw();
      return;
    }
```

Replace the purpose and expected-outcome sentences on `handleMainMapDoubleClick` with:

```ts
 * Purpose: Single entry point for support-target commits, move and ferry planning, mixed-selection rejection,
 * and the air deselect gesture, so strategic and tactical behavior stays identical.
 * Expected outcome: While resolution playback is running, returns before planning or clearing. A targeting
 * double-click either queues that attack or shows its validation toast, and does not plan a move. Otherwise
 * at most one order is queued or one toast is shown per call. An empty click that cannot plan an air ferry
 * clears the selection without discarding anything already queued for Ready.
```

`clearSelection` already nulls the hover preview and bumps `hoverPreviewRequestSeq`. The success path still repeats those two lines, because that is what the click path does today. Do not delete them.

- [ ] **Step 5: Stop the click listener from committing**

In the click listener, after the footprint `return` and before `S.selectedHexIndex = hit`, insert:

```ts
    // A click while targeting is on must not queue the attack or clear the selection.
    // The double-click that follows places the attack. Clearing here would turn targeting
    // off and let that double-click plan a march from the gesture snapshot.
    if ((S.rangedModeActive || S.airStrikeModeActive) && S.selectedUnitIds.length > 0 && S.gameState) {
      return;
    }
```

Delete both targeting blocks that start with `if (hit && S.airStrikeModeActive` and `if (hit && S.rangedModeActive`. Do not delete the footprint toast above the new return.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run build:main`

Run: `node --test dist/shared/mapPlanningGesture.test.js`

Run: `node dist/main/mapGestureWiring.test.js`

Run: `node dist/main/selectionSupportButtonRefresh.test.js`

Expected: all three pass. `mapGestureWiring.test.js` prints `mapGestureWiring.test.ts passed`. `selectionSupportButtonRefresh.test.js` prints `selectionSupportButtonRefresh.test.ts passed`.

## Phase 3: Docs

These sentences are already in the UX docs. Do not edit them again unless a sentence has drifted. This phase is a check.

**Files:**

- `doc/ux/order-lifecycle.md`
- `doc/ux/input-map.md`
- `doc/ux/selection-model.md`
- `doc/ux/right-panel-command-bar.md`
- `doc/ux/resolution-playback.md`

No product code in this phase.

- [ ] **Step 1: Confirm order lifecycle**

`doc/ux/order-lifecycle.md` already contains the paragraphs below. If one is missing, restore it.

The Ferry paragraph is:

```markdown
When the player double-clicks with an all-air selection, and Strike targeting is off, the game checks whether a ferry is legal. A legal ferry is queued. An illegal ferry on empty ground clears the selection. An illegal ferry on a unit icon shows an error toast and keeps the selection. Legality is in the [combat rules](../combat-rules-v3.md). While Strike targeting is on, that double-click places the strike instead.
```

The March paragraph is:

```markdown
When the player double-clicks a destination with a non-air selection, and targeting is off, the selection plans a grouped march. If every selected unit is already on that hex and the click missed unit icons, the selection clears instead. A mixed air and non-air selection is rejected and shows an error toast. While Ranged or Strike targeting is on, a double-click does not plan a march.
```

The Ranged attack section is:

```markdown
### Ranged attack

When Ranged targeting is on, a double-click on a hex validates the target for every selected unit. A single click does not queue the attack and does not change the selection, including a click that misses every hex. Success queues one ranged attack per selected unit, turns targeting off, and clears the selection. Failure shows an error toast, queues nothing, and leaves targeting on so the player can pick another hex. Cancel turns targeting off. A double-click outside the active tactical battle does not queue an attack; the clicks that led to it already show the outside-battle toast.
```

The Air strike section is:

```markdown
### Air strike

When Strike targeting is on, a double-click validates the target and the chosen target type: Enemy Units, Production, Airports, or Seaports. A single click does not queue the strike. Success queues the strikes, turns targeting off, and clears the selection. Failure shows an error toast, queues nothing, and leaves strike targeting on, the same as a failed ranged double-click.
```

The invariant is:

```markdown
- A rejected Ranged or Strike target double-click never turns targeting off. Targeting turns off only on Cancel, a successful target double-click, right-click, a selection that can no longer fire, or entering a battle. A single click does not turn it off.
```

- [ ] **Step 2: Confirm the input map**

`doc/ux/input-map.md` already contains these mouse-table rows:

```markdown
| Click | Main map | Selects or opens a popup. While Ranged or Strike targeting is on, a click does not place the attack and does not change the selection. | [selection-model.md](selection-model.md) |
| Double-click | Main map | Plans a march or ferry, or clears the selection, when targeting is off. While Ranged or Strike targeting is on, places that attack and does not plan a move. Map zoom-on-double-click is off. | [order-lifecycle.md](order-lifecycle.md) |
```

- [ ] **Step 3: Confirm selection, the command bar, and playback**

`doc/ux/selection-model.md` already says a successful target double-click clears the selection, a single click while targeting is on does not, and a failed target double-click keeps the selection and the mode. It also says that while Ranged or Strike targeting is on, a click does not change the selection, open the stack callout, or record a new selected hex. The unit-icon, Shift-click, and stack-callout rules in Selecting apply only when both targeting modes are off.

`doc/ux/right-panel-command-bar.md` already says a failed target double-click shows an error toast and never turns targeting off.

`doc/ux/resolution-playback.md` already says Ranged and Strike target double-clicks are ignored during playback.

- [ ] **Step 4: Check the sentences**

Search `doc/ux` for `target click`. Expected: no remaining matches. The playback sentence now says `target double-clicks`.
