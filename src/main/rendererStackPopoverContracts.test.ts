/**
 * Source contracts for the stack callout, sealift popup, and hover-planning dismiss.
 * Run with: node dist/main/rendererStackPopoverContracts.test.js
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { getFunctionSource } from './testSupport/rendererSourceAssertions';

/**
 * Defines the `testStackCalloutSingleUnitNonShiftClosesPopup` function shape (function testStackCalloutSingleUnitNonShiftClosesPopup(): void).

 * Purpose: Supports maintainability by documenting why `testStackCalloutSingleUnitNonShiftClosesPopup` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testStackCalloutSingleUnitNonShiftClosesPopup(): void {
  const stackCalloutPath = path.resolve(process.cwd(), 'src', 'renderer', 'map', 'stackCallout.ts');
  const source = fs.readFileSync(stackCalloutPath, 'utf8');
  const showStackCalloutFn = getFunctionSource(source, 'showStackCallout');
  const stackSingleUnitHandlerFn = getFunctionSource(source, 'onStackSingleUnitToggleClick');

  assert.ok(
    showStackCalloutFn.includes('onStackSingleUnitToggleClick(') &&
      stackSingleUnitHandlerFn.includes('if (!S.shiftKeyActive) {') &&
      stackSingleUnitHandlerFn.includes('hideStackCallout();'),
    'stack single-unit handler should close popup after non-Shift unit button clicks'
  );
}

/**
 * Defines the `testStackSealiftWaterStateHidesDebarkAndEmbarkedSelectionControls` function shape (function testStackSealiftWaterStateHidesDebarkAndEmbarkedSelectionControls(): void).

 * Purpose: Supports maintainability by documenting why `testStackSealiftWaterStateHidesDebarkAndEmbarkedSelectionControls` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testStackSealiftEmbarkedSelectionAndDebarkControls(): void {
  const stackCalloutPath = path.resolve(process.cwd(), 'src', 'renderer', 'map', 'stackCallout.ts');
  const source = fs.readFileSync(stackCalloutPath, 'utf8');
  const renderSealiftSectionFn = getFunctionSource(source, 'renderSealiftSection');
  const removeSealiftSectionFn = getFunctionSource(source, 'removeSealiftSection');
  const setNonSelectableFn = getFunctionSource(source, 'setStackPopupNonSelectableUnitIds');
  const applyVisibilityFn = getFunctionSource(source, 'applyStackCalloutSelectionButtonVisibility');
  const showStackCalloutFn = getFunctionSource(source, 'showStackCallout');
  const stackSingleUnitHandlerFn = getFunctionSource(source, 'onStackSingleUnitToggleClick');
  const stackAllActionHandlerFn = getFunctionSource(source, 'onStackAllActionClick');

  assert.ok(
    renderSealiftSectionFn.includes('.flatMap((row) => [row.slot1UnitId, row.slot2UnitId])') &&
      renderSealiftSectionFn.includes('setStackPopupNonSelectableUnitIds(calloutEl, nonSelectableEmbarkedIds);'),
    'sealift rendering should mark all embarked slot occupants as non-selectable in the stack popup'
  );
  assert.ok(
    renderSealiftSectionFn.includes('debarkBtn.style.visibility = debarkEnabled ? \'visible\' : \'hidden\'') &&
      renderSealiftSectionFn.includes('slotRow.appendChild(debarkBtn)') &&
      renderSealiftSectionFn.includes('row.debarkSlot1Enabled'),
    'sealift slot rows should always reserve a debark-control gap and enable it when debarkSlot*Enabled'
  );
  assert.ok(
    setNonSelectableFn.includes('applyStackCalloutSelectionButtonVisibility(calloutEl, nonSelectable);') &&
      applyVisibilityFn.includes(
        'btn.style.visibility = nonSelectableUnitIds.has(unitId) ? \'hidden\' : \'visible\';'
      ),
    'non-selectable stack-popup units should reserve space for per-unit select/unselect buttons while hiding them'
  );
  assert.ok(
    showStackCalloutFn.includes('getSelectableHumanIdsForStackCallout(units)') &&
      showStackCalloutFn.includes("onStackAllActionClick('selectAll'") &&
      showStackCalloutFn.includes("onStackAllActionClick('addAll'") &&
      showStackCalloutFn.includes("onStackAllActionClick('removeAll'"),
    'stack callout all-actions should filter through selectable human IDs so embarked land units remain unselectable'
  );
  assert.ok(
    renderSealiftSectionFn.includes('refreshGameStateAfterSealiftChange') &&
      renderSealiftSectionFn.includes('await refreshGameStateAfterSealiftChange()'),
    'strategic sealift embark/debark must refresh game state so same-turn select/move sees cleared embark flags'
  );
  assert.ok(
    removeSealiftSectionFn.includes("querySelectorAll('.stack-sealift-section')") &&
      renderSealiftSectionFn.includes('generation !== sealiftSectionRenderGeneration'),
    'sealift section must drop stale overlapping renders and remove every existing section before append'
  );
  assert.ok(
    stackSingleUnitHandlerFn.includes('refreshStackCallout: false') &&
      stackAllActionHandlerFn.includes('refreshStackCallout: false') &&
      setNonSelectableFn.includes('refreshStackCallout: false'),
    'callers that already rebuilt the open stack popup must not start a second sealift render via selection sync'
  );
}

/**
 * Defines the `testModifierDrivenPopoverCloseRulesCentralized` function shape (function testModifierDrivenPopoverCloseRulesCentralized(): void).

 * Purpose: Supports maintainability by documenting why `testModifierDrivenPopoverCloseRulesCentralized` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testModifierDrivenPopoverCloseRulesCentralized(): void {
  const stackCalloutPath = path.resolve(process.cwd(), 'src', 'renderer', 'map', 'stackCallout.ts');
  const source = fs.readFileSync(stackCalloutPath, 'utf8');
  const modifierRulesFn = getFunctionSource(source, 'applyModifierDrivenPopoverCloseRules');
  const initCorePath = path.resolve(process.cwd(), 'src', 'renderer', 'map', 'initCore.ts');
  const initCoreSource = fs.readFileSync(initCorePath, 'utf8');
  const wireInitCoreFn = getFunctionSource(initCoreSource, 'wireInitCore');

  assert.ok(
    modifierRulesFn.includes("if (reason === 'shift_pressed')") &&
      !modifierRulesFn.includes('hideBuildPopup();') &&
      modifierRulesFn.includes("if (reason === 'shift_released')") &&
      modifierRulesFn.includes('hideStackCallout();'),
    'Shift press should preserve the build popup for multi-select while Shift release closes the stack callout'
  );
  assert.ok(
    wireInitCoreFn.includes("applyModifierDrivenPopoverCloseRules('shift_pressed')") &&
      wireInitCoreFn.includes("applyModifierDrivenPopoverCloseRules('shift_released')"),
    'init key handlers should delegate popover-close behavior to shared modifier rule helper'
  );
  assert.ok(
    wireInitCoreFn.includes('shouldRefreshStackCalloutOnShiftKeydown(shiftKeyAlreadyActive)') &&
      wireInitCoreFn.includes("applyModifierDrivenPopoverCloseRules('shift_pressed')"),
    'Shift keydown should rebuild stack-callout chrome only on the inactive-to-active transition'
  );
}

/**
 * Defines the `testHoverOrderPlanningInteractionLock` function shape.

 * Purpose: Guards hover-planning UI lock wiring for selection, tactical entry, and build queue entry points.
 * When to use: Regression signal when refactoring hover preview or map interaction handlers.
 * Expected outcome: `isHoverOrderPlanningActive` and selection replace/toggle guards appear at documented boundaries.
 * Exceptions: None.
 */
function testHoverOrderPlanningInteractionLock(): void {
  const policyPath = path.resolve(process.cwd(), 'src', 'renderer', 'rendering', 'canvasPreviewPolicy.ts');
  const selectionPolicyPath = path.resolve(process.cwd(), 'src', 'renderer', 'map', 'mapClickSelectionPolicy.ts');
  const tacticalEntryPath = path.resolve(process.cwd(), 'src', 'renderer', 'map', 'tacticalEntryLayer.ts');
  const drawInteractionPath = path.resolve(process.cwd(), 'src', 'renderer', 'map', 'drawInteraction.ts');
  const buildPopupPath = path.resolve(process.cwd(), 'src', 'renderer', 'gameplay', 'buildQueuePopup.ts');
  const rendererPath = path.resolve(process.cwd(), 'src', 'renderer', 'renderer.ts');
  const policySource = fs.readFileSync(policyPath, 'utf8');
  const selectionPolicySource = fs.readFileSync(selectionPolicyPath, 'utf8');
  const tacticalEntrySource = fs.readFileSync(tacticalEntryPath, 'utf8');
  const drawInteractionSource = fs.readFileSync(drawInteractionPath, 'utf8');
  const buildPopupSource = fs.readFileSync(buildPopupPath, 'utf8');
  const rendererSource = fs.readFileSync(rendererPath, 'utf8');
  const stackCalloutSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src', 'renderer', 'map', 'stackCallout.ts'),
    'utf8'
  );

  assert.ok(
    policySource.includes('function isHoverOrderPlanningActive') &&
      policySource.includes('function shouldBlockSelectionReplaceDuringHoverPlanning') &&
      policySource.includes('function shouldBlockToggleSelectionDuringHoverPlanning'),
    'canvas preview policy should expose hover-planning lock helpers'
  );
  assert.ok(
    selectionPolicySource.includes('shouldBlockToggleSelectionDuringHoverPlanning') &&
      selectionPolicySource.includes('shouldBlockSelectionReplaceDuringHoverPlanning'),
    'map click selection policy should respect hover-planning selection guards'
  );
  const sidebarSupportPath = path.resolve(process.cwd(), 'src', 'renderer', 'gameplay', 'sidebarSupport.ts');
  const sidebarSupportSource = fs.readFileSync(sidebarSupportPath, 'utf8');
  assert.ok(
    sidebarSupportSource.includes('shouldBlockToggleSelectionDuringHoverPlanning') &&
      sidebarSupportSource.includes('shouldBlockSelectionReplaceDuringHoverPlanning'),
    'sidebar unit selection should respect hover-planning selection guards'
  );
  const entrySource = fs.readFileSync(
    path.resolve(process.cwd(), 'src', 'renderer', 'entryCallbacks.ts'),
    'utf8'
  );
  assert.ok(
    rendererSource.includes('isHoverOrderPlanningActive()') &&
      entrySource.includes('dismissMapDetailPopoversIfHoverPlanningActive') &&
      entrySource.includes('dismissMapDetailPopoversForHoverPlanning'),
    'renderer should wire hover-planning dismiss through tactical order deps and local helpers'
  );
  assert.ok(
    policySource.includes('function shouldDismissStackCalloutForHoverPlanning'),
    'a preview of the selected units\' own hex must not count as destination planning for the stack callout'
  );
  for (const functionName of [
    'dismissMapDetailPopoversIfHoverPlanningActive',
    'showStackCallout',
    'refreshStackCalloutIfOpen',
  ]) {
    const body = getFunctionSource(stackCalloutSource, functionName);
    assert.ok(
      body.includes('shouldDismissStackCalloutForHoverPlanning()'),
      `${functionName} should leave the stack callout up when the pointer is still on the selected units' hex`
    );
  }
  assert.ok(
    tacticalEntrySource.includes('isHoverOrderPlanningActive()') &&
      drawInteractionSource.includes('isHoverOrderPlanningActive()') &&
      buildPopupSource.includes('isHoverOrderPlanningActive()'),
    'tactical entry and build entry should block while hover planning is active'
  );
  const hoverRefreshPath = path.resolve(process.cwd(), 'src', 'renderer', 'gameplay', 'hoverRoutePreviewRefresh.ts');
  const hoverRefreshSource = fs.readFileSync(hoverRefreshPath, 'utf8');
  assert.ok(
    hoverRefreshSource.includes('dismissMapDetailPopoversForHoverPlanning?.()'),
    'hover preview publish should dismiss map detail popovers when planning is active'
  );
  assert.ok(
    hoverRefreshSource.includes('resolveOrderPreviewEffectsTooltipHtml') &&
      !hoverRefreshSource.includes('collectTacticalRangedSlowTerrainLabels') &&
      !hoverRefreshSource.includes('resolveOrderSlowerTooltipHtml'),
    'hover preview effects tooltip should use resolveOrderPreviewEffectsTooltipHtml and keep ranged collection out of the publisher'
  );
  const mainMapPath = path.resolve(process.cwd(), 'src', 'renderer', 'map', 'mainMapInteractions.ts');
  const mainMapSource = fs.readFileSync(mainMapPath, 'utf8');
  const pointerMoveAt = mainMapSource.indexOf("addEventListener('pointermove'");
  const pointerLeaveAt = mainMapSource.indexOf("addEventListener('pointerleave'");
  const pointerMoveBody = mainMapSource.slice(pointerMoveAt, pointerLeaveAt);
  const planningInMove = pointerMoveBody.indexOf('hexTooltipSuppressedForOrderPlanning({');
  const scheduleInMove = pointerMoveBody.indexOf('scheduleHexDetailsTooltip(');
  assert.ok(
    planningInMove >= 0 && scheduleInMove > planningInMove,
    'pointer move should decide order planning before starting the hex tooltip dwell'
  );
  const hexRestAnchorAt = mainMapSource.indexOf('let dwellAnchorX');
  assert.ok(
    hexRestAnchorAt >= 0 && pointerMoveAt > hexRestAnchorAt,
    'the hex tooltip rest spot must survive later pointer moves'
  );
  assert.ok(
    pointerMoveBody.includes('restartOrderEffectsDwellIfPointerMoved()') &&
      pointerMoveBody.includes('restartOrderBlockDwellIfPointerMoved()'),
    'a planning move inside one cell restarts the effects and blocked tooltip waits before they open'
  );
  const pointerDownAt = mainMapSource.indexOf("addEventListener('pointerdown'");
  const clickAt = mainMapSource.indexOf("addEventListener('click'", pointerDownAt);
  const pointerDownSource = mainMapSource.slice(pointerDownAt, clickAt);
  assert.ok(
    pointerDownSource.includes('hideOrderBlockHexTooltip') &&
      !pointerDownSource.includes('hideOrderSlowerHexTooltip') &&
      !pointerDownSource.includes('clearOrderEffectsTooltipDwell'),
    'a press hides the blocked notice and leaves the effects tooltip in place'
  );
  const initCorePath = path.resolve(process.cwd(), 'src', 'renderer', 'map', 'initCore.ts');
  const initCoreSource = fs.readFileSync(initCorePath, 'utf8');
  assert.ok(
    initCoreSource.includes('resumeHexTooltipDwellAfterAimingEnds()'),
    'Shift inspection starts the hex tooltip wait when the pointer is already resting'
  );
  assert.ok(
    initCoreSource.includes('function beginHoverSupportTargetingMode') &&
      initCoreSource.includes("beginHoverSupportTargetingMode(deps, 'ranged')") &&
      initCoreSource.includes("beginHoverSupportTargetingMode(deps, 'air')") &&
      initCoreSource.includes('hideOrderSlowerHexTooltip()'),
    'enabling ranged or air-strike mode should hide leftover slower hints and refresh hover preview'
  );
  assert.ok(
    stackCalloutSource.includes('function shouldSuppressTerrainTooltip') &&
      stackCalloutSource.includes('isHoverOrderPlanningActive()'),
    'hex details tooltip should be suppressed during hover order planning'
  );
}

/**
 * Runs the stack and hover-planning source contracts.
 *
 * Purpose: Standalone entry so these checks stay in the main-process test discovery set.
 * When to use: Invoked at module load after the main process is built.
 * Expected outcome: Logs success, or throws on the first failed assertion.
 * Exceptions: Assertion failures propagate to the process.
 */
function run(): void {
  testStackCalloutSingleUnitNonShiftClosesPopup();
  testStackSealiftEmbarkedSelectionAndDebarkControls();
  testModifierDrivenPopoverCloseRulesCentralized();
  testHoverOrderPlanningInteractionLock();
  console.log('rendererStackPopoverContracts.test.ts passed');
}

run();
