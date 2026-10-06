/**
 * Verifies the main-map gesture wiring that makes double-click planning and full deselect work.
 * Run with: node dist/main/mapGestureWiring.test.js
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { getFunctionSource } from './testSupport/rendererSourceAssertions';

/**
 * Reads a renderer source file as UTF-8 text.
 *
 * Purpose: The renderer has no DOM test harness, so these contracts are checked against source text.
 * When to use: Inside this file only, to keep the path building in one place.
 * Expected outcome: File contents for a path relative to `src/renderer`.
 * Exceptions: Throws if the file is missing, which is the intended signal that a module was moved.
 */
function readRendererSource(...relativeParts: string[]): string {
  return fs.readFileSync(path.resolve(process.cwd(), 'src', 'renderer', ...relativeParts), 'utf8');
}

/**
 * Checks that the gesture selection snapshot survives the second press of a double-click.
 *
 * Purpose: Without these two call sites the second press resnapshots the selection and the second click
 * retargets it, so a double-click would plan an order for whichever icon sits under the cursor.
 * When to use: Regression signal when refactoring the map pointer-down path or the icon click policy.
 * Expected outcome: Both the press decision and the retarget guard remain wired.
 * Exceptions: AssertionError naming the missing call site.
 */
function testGestureSelectionSnapshotSurvivesDoubleClick(): void {
  const interactionsSource = readRendererSource('map', 'mainMapInteractions.ts');
  const selectionPolicySource = readRendererSource('map', 'mapClickSelectionPolicy.ts');

  assert.ok(
    interactionsSource.includes('resolveMapGesturePress({'),
    'main map pointer-down should resolve the shared gesture press decision'
  );
  assert.ok(
    selectionPolicySource.includes('suppressSelectionRetarget'),
    'human unit icon click policy should honor the double-click retarget suppression flag'
  );
}

/**
 * Checks that the stack callout opens on a timer that every hide path can cancel.
 *
 * Purpose: The callout is layered above the map, so an immediate open swallows the second click and no
 * double-click ever reaches the map.
 * When to use: Regression signal when refactoring stack callout display.
 * Expected outcome: Both timer helpers exist and `hideStackCallout` cancels a pending open.
 * Exceptions: AssertionError naming the missing piece.
 */
function testStackCalloutOpensOnCancellableTimer(): void {
  const selectionPolicySource = readRendererSource('map', 'mapClickSelectionPolicy.ts');
  const stackCalloutSource = readRendererSource('map', 'stackCallout.ts');

  assert.ok(
    selectionPolicySource.includes('function scheduleDeferredStackCallout') &&
      selectionPolicySource.includes('function clearDeferredStackCalloutTimer'),
    'map click selection policy should own the deferred stack callout timer helpers'
  );
  assert.ok(
    getFunctionSource(stackCalloutSource, 'hideStackCallout').includes('clearDeferredStackCalloutTimer();'),
    'hideStackCallout should cancel a stack callout that has not opened yet'
  );
  assert.ok(
    readRendererSource('map', 'initCore.ts').includes('clearDeferredStackCalloutTimerForPressAway('),
    'a press away from a scheduled callout should cancel it, including presses the map click handler never sees'
  );
}

/**
 * Checks that double-click outcomes come from the shared decision table and can clear the selection.
 *
 * Purpose: Keeps ferry, march, reject, and deselect outcomes in one place for strategic and tactical maps.
 * When to use: Regression signal when refactoring double-click planning.
 * Expected outcome: The handler resolves the shared action and can clear selection chrome, and the old
 * ferry commit helper stays deleted so it cannot toast over a silent deselect.
 * Exceptions: AssertionError naming the missing call site.
 */
function testDoubleClickPlanningUsesSharedDecisionTable(): void {
  const handlerSource = readRendererSource('map', 'mapDoubleClickHandler.ts');
  const interactionsSource = readRendererSource('map', 'mainMapInteractions.ts');

  assert.ok(
    handlerSource.includes('resolveMapDoubleClickAction(') && handlerSource.includes('clearMapSelectionChrome('),
    'double-click handler should resolve the shared action and be able to clear selection chrome'
  );
  assert.ok(
    !interactionsSource.includes('commitGroupedAirFerryOrders'),
    'the superseded grouped air ferry commit helper should stay deleted'
  );
}

/**
 * Checks that build markers and multi-hex template edits cannot run during playback.
 *
 * Purpose: Marker buttons sit outside the main-map click listener, and template handlers write the shared
 * template before the server call, so the map-click return does not cover either path.
 * When to use: Regression signal when refactoring build-entry activation or the multi-hex queue editor.
 * Expected outcome: Marker activation returns before it writes the selected hex, and template handlers consult
 * playback before replacing the template.
 * Exceptions: AssertionError naming the missing gate.
 */
function testPlaybackIgnoresBuildMarkersAndTemplateEdits(): void {
  const popupSource = readRendererSource('gameplay', 'buildQueuePopup.ts');
  assert.ok(
    /async function processBuildEntryClick\([\s\S]*?\)\s*:\s*Promise<void>\s*\{\s*if \(resolutionPlaybackBlocksMapOrders\(S\.resolutionMoveAnimation\)\) return;/.test(
      popupSource
    ),
    'a build marker click during playback should return before it changes the selected hex or the build selection'
  );
  assert.ok(
    popupSource.includes('function restoreSingleHexQueueIfPlaybackBlocks('),
    'a single-hex queue control should restore the stored queue when playback ignores the edit'
  );

  const multiSource = readRendererSource('gameplay', 'buildQueueMultiPopup.ts');
  const commit = getFunctionSource(multiSource, 'commitEditedTemplate');
  assert.ok(
    commit.includes('S.buildQueueTemplate ='),
    'commitEditedTemplate should replace the shared template after the caller has allowed the edit'
  );
  const multiRender = getFunctionSource(multiSource, 'renderMultiBuildQueueIntoMount');
  const gateAt = multiRender.indexOf('buildQueueEditBlockedByPlayback()');
  const commitAt = multiRender.indexOf('commitEditedTemplate(');
  assert.ok(
    gateAt >= 0 && commitAt > gateAt,
    'multi-hex template edits should consult playback before replacing the shared template'
  );
}

/**
 * Checks that right-click clears the selection everywhere, with no icon-hit exception.
 *
 * Purpose: Air and mixed selections must clear from a right-click on an empty hex as well as on an icon.
 * When to use: Regression signal when refactoring the map context-menu listener.
 * Expected outcome: The listener clears shared selection chrome and never hit-tests icons.
 * Exceptions: AssertionError when the listener is missing or grows an icon-hit branch.
 */
function testRightClickClearsSelectionWithoutIconException(): void {
  const interactionsSource = readRendererSource('map', 'mainMapInteractions.ts');
  const listenerStart = interactionsSource.indexOf("addEventListener('contextmenu'");
  assert.ok(listenerStart >= 0, 'main map should still register a context-menu listener');
  const listenerEnd = interactionsSource.indexOf('});', listenerStart);
  assert.ok(listenerEnd > listenerStart, 'context-menu listener should be terminated');
  const listenerSource = interactionsSource.slice(listenerStart, listenerEnd);

  assert.ok(
    listenerSource.includes('clearMapSelectionChrome()'),
    'right-click should clear selection chrome through the shared helper'
  );
  assert.ok(
    !listenerSource.includes('pointerHitsDrawnUnitIcon'),
    'right-click should clear on empty hexes and on icons alike'
  );
}

/**
 * Checks that a stack, an enemy token, and an embarked single human still reach the callout schedule.
 *
 * Purpose: Those clicks still open the list. The embarked single human still goes through `unitId: loneHumanUnit.id` before that schedule. Hover shows the Bonuses tooltip instead of the list.
 * When to use: Regression signal when refactoring the main-map click listener.
 * Expected outcome: `unitId: loneHumanUnit.id` stays before `scheduleDeferredStackCallout`, and the later `hideStackCallout` is the miss-icon path.
 * Exceptions: AssertionError when the wiring drifts.
 */
function testLoneHumanUnitIconOpensCalloutAndSelects(): void {
  const interactions = readRendererSource('map', 'mainMapInteractions.ts');
  const clickStart = interactions.indexOf("addEventListener('click'");
  const clickEnd = interactions.indexOf("addEventListener('dblclick'");
  assert.ok(clickStart >= 0 && clickEnd > clickStart, 'click listener precedes the double-click listener');
  const clickListener = interactions.slice(clickStart, clickEnd);
  assert.equal(clickListener.includes('isLoneAi'), false, 'a stack icon should open the callout whether or not an enemy is in it');
  assert.ok(clickListener.includes('unitsAtHit.length >= 1 && unitIconHit'), 'a stationary unit icon still enters the click path');
  assert.ok(clickListener.includes('unitsAtHit.length >= 1'), 'a unit icon schedules the callout from a click');
  const policyAt = clickListener.indexOf('unitId: loneHumanUnit.id');
  const scheduleAt = clickListener.indexOf('scheduleDeferredStackCallout(');
  const hideAt = clickListener.indexOf('deps.hideStackCallout()', scheduleAt);
  assert.ok(
    policyAt >= 0 && scheduleAt > policyAt && hideAt > scheduleAt,
    'embarked lone-human selection policy stays before the callout schedule, and the later hideStackCallout is the miss-icon path'
  );
  assert.ok(clickListener.includes('unitId: loneHumanUnit.id'), 'the selected id is the stationary token, not whichever unit getUnitAtHex finds first');
  const moveStart = interactions.indexOf("addEventListener('pointermove'");
  const moveEnd = interactions.indexOf("addEventListener('pointerleave'");
  const moveListener = interactions.slice(moveStart, moveEnd);
  assert.ok(moveListener.includes('pointerOnToken:'), 'a one-unit token shows its tooltip from the pointer dwell');
  assert.equal(moveListener.includes('showCallout'), false, 'the pointer dwell does not open the unit list');
}

/**
 * Checks that Shift-click on one selectable human unit toggles it and does not schedule the callout.
 *
 * Purpose: A one-unit hex does not need the stack list. Stacks, enemy icons, and embarked-only icons still open it.
 * When to use: Regression signal when refactoring the main-map click listener.
 * Expected outcome: The Shift branch uses the embarked predicate and `shiftKey: true`. Its hide is guarded so a double-click's second press and a hover preview leave an existing callout alone. Other icon hits still schedule the callout.
 * Exceptions: AssertionError when the wiring drifts.
 */
function testShiftClickOnOneSelectableUnitTogglesWithoutCallout(): void {
  const interactions = readRendererSource('map', 'mainMapInteractions.ts');
  const clickStart = interactions.indexOf("addEventListener('click'");
  const clickEnd = interactions.indexOf("addEventListener('dblclick'");
  assert.ok(clickStart >= 0 && clickEnd > clickStart, 'click listener precedes the double-click listener');
  const clickListener = interactions.slice(clickStart, clickEnd);
  const soleAt = clickListener.indexOf('soleSelectableHumanUnitId(');
  const embarkedAt = clickListener.indexOf('isEmbarkedLandUnitBlockedForSelection');
  const shiftPolicyAt = clickListener.indexOf('shiftKey: true');
  const plainAt = clickListener.indexOf('shiftKey: false');
  const scheduleAt = clickListener.indexOf('scheduleDeferredStackCallout(');
  assert.ok(soleAt >= 0 && embarkedAt > soleAt && shiftPolicyAt > soleAt, 'Shift-click resolves the sole selectable unit before toggling it');
  assert.ok(plainAt > shiftPolicyAt && scheduleAt > plainAt, 'the plain-click branch follows Shift and still precedes the callout schedule');
  const shiftBranch = clickListener.slice(soleAt, plainAt);
  assert.ok(
    shiftBranch.includes('!suppressIconRetargetOnNextClick && !isHoverOrderPlanningActive()'),
    'hideStackCallout in the Shift branch is guarded by the double-click and hover checks'
  );
  assert.ok(shiftBranch.includes('deps.hideStackCallout()'), 'a new Shift gesture closes a stale callout');
}

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
  const conditionAt = clickListener.indexOf('!e.shiftKey && unitsAtHit.length === 1 && soleSelectableUnitId');
  const plainAt = clickListener.indexOf('shiftKey: false');
  const scheduleAt = clickListener.indexOf('scheduleDeferredStackCallout(');
  assert.ok(
    conditionAt >= 0 && plainAt > conditionAt && scheduleAt > plainAt,
    'plain click on one selectable unit is wired before the callout schedule'
  );
  const plainBranch = clickListener.slice(conditionAt, scheduleAt);
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

/**
 * Asserts a targeting click is inert and the following double-click is the only place that queues the attack.
 *
 * Purpose: The failure mode is a click that turns targeting off, after which the double-click plans a march
 * from the gesture snapshot. This contract keeps the attack on the double-click.
 * When to use: From `run`.
 * Expected outcome: The footprint toast still precedes the targeting return, the click listener does not
 * validate an attack, and `planSupportTarget` precedes `planFerry` and contains both validators.
 * Exceptions: AssertionError when the wiring drifts.
 */
function testTargetingDoubleClickPlacesTheAttack(): void {
  const interactions = readRendererSource('map', 'mainMapInteractions.ts');
  const clickStart = interactions.indexOf("addEventListener('click'");
  const clickEnd = interactions.indexOf("addEventListener('dblclick'");
  assert.ok(clickStart >= 0 && clickEnd > clickStart, 'click listener precedes the double-click listener');
  const clickListener = interactions.slice(clickStart, clickEnd);
  const footprintAt = clickListener.indexOf('That hex is outside the active tactical battle.');
  const swallowAt = clickListener.indexOf('S.rangedModeActive || S.airStrikeModeActive');
  const selectedHexAt = clickListener.indexOf('S.selectedHexIndex = hit');
  assert.ok(footprintAt >= 0 && swallowAt > footprintAt && selectedHexAt > swallowAt, 'footprint toast precedes the targeting return, which precedes selected-hex assignment');
  const betweenSwallowAndHex = clickListener.slice(swallowAt, selectedHexAt);
  assert.ok(betweenSwallowAndHex.includes('return;'), 'targeting click returns before changing the selected hex');
  assert.equal(clickListener.includes('validateGroupRangedTarget'), false);
  assert.equal(clickListener.includes('validateGroupAirStrikeTarget'), false);

  const handler = readRendererSource('map', 'mapDoubleClickHandler.ts');
  const supportAt = handler.indexOf("case 'planSupportTarget':");
  const ferryAt = handler.indexOf("case 'planFerry':");
  assert.ok(supportAt >= 0 && ferryAt > supportAt, 'planSupportTarget precedes planFerry');
  const supportCase = handler.slice(supportAt, ferryAt);
  assert.ok(supportCase.includes('validateGroupRangedTarget'));
  assert.ok(supportCase.includes('validateGroupAirStrikeTarget'));
}

/**
 * Runs every wiring contract in this file.
 *
 * Purpose: Single entry point so the discovery-based test runner can execute the file directly.
 * When to use: Invoked at module load; not imported anywhere.
 * Expected outcome: Prints a pass line, or throws on the first broken contract.
 * Exceptions: AssertionError from any contract above.
 */
function run(): void {
  testGestureSelectionSnapshotSurvivesDoubleClick();
  testStackCalloutOpensOnCancellableTimer();
  testDoubleClickPlanningUsesSharedDecisionTable();
  testLoneHumanUnitIconOpensCalloutAndSelects();
  testShiftClickOnOneSelectableUnitTogglesWithoutCallout();
  testPlainClickOnOneSelectableUnitSelectsWithoutCallout();
  testTargetingDoubleClickPlacesTheAttack();
  testPlaybackIgnoresBuildMarkersAndTemplateEdits();
  testRightClickClearsSelectionWithoutIconException();
  console.log('mapGestureWiring.test.ts passed');
}

run();
