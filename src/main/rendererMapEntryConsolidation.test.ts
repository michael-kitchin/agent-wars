/**
 * Map entry and selection source contracts moved out of the over-limit renderer assertion file.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { getFunctionSource } from './testSupport/rendererSourceAssertions';

/**
 * Defines the `testTacticalEntryLayerPlanningAndContestedContracts` function shape (function testTacticalEntryLayerPlanningAndContestedContracts(): void).

 * Purpose: Static regression tests for tactical magnifier visibility rules (planning-only, contested strategic, mirrored vertical offset).
 * When to use: CI guard when refactoring `syncTacticalEntryButton` or overlay layout.
 * Expected outcome: Source encodes planning+tactical-active gate, co-presence contest check, and magnifyTop symmetric offset below the hex midpoint (same distance as overlay text is below center).
 * Exceptions: None.
 */
function testTacticalEntryLayerPlanningAndContestedContracts(): void {
  const entryPath = path.resolve(process.cwd(), 'src', 'renderer', 'map', 'tacticalEntryLayer.ts');
  const source = fs.readFileSync(entryPath, 'utf8');
  assert.ok(
    !source.includes('HIDE_MAGIFIERS_WHEN_TACTICAL_BATTLE_SESSION_ACTIVE'),
    'syncTacticalEntryButton should not reference removed optional magnifier-hide flag'
  );
  assert.ok(
    /if\s*\(\s*S\.gameState\.phase\s*!==\s*'planning'\s*\|\|\s*S\.tacticalBattleSnapshot\s*\)/.test(source),
    'syncTacticalEntryButton should gate overlays on planning phase OR renderer tactical snapshot in one condition'
  );
  assert.ok(
    source.includes('if (areResolutionDiceChipsShowing(S.resolutionMoveAnimation)) {'),
    'syncTacticalEntryButton should hide magnifiers while resolution dice chips are showing'
  );
  assert.ok(
    source.includes('if (!isContestedStrategicHex(S.gameState, hx.h3Index)) continue;'),
    'syncTacticalEntryButton should only place buttons on contested res1 hexes'
  );
  assert.ok(
    source.includes("u.player === 'human'") && source.includes("u.player === 'opponent'"),
    'tactical entry eligibility should require both human and opponent parent units in the same hex'
  );
  assert.ok(
    source.includes('offsetFromCenterToOverlayText') && source.includes('center.y + offsetFromCenterToOverlayText'),
    'syncTacticalEntryButton should place the magnifier below center by the same |y| offset the overlay text uses from center'
  );
  assert.ok(
    source.includes('class="tactical-entry-btn"') && source.includes('&#128269;'),
    'syncTacticalEntryButton should emit magnifying-glass tactical entry buttons'
  );
}

/**
 * Defines the `testMainMapInteractionsDelegatesHumanUnitIconSelectionToPolicyModule` function shape.

 * Purpose: Guards the shared click-selection policy for human unit icon hits on the main map.
 * When to use: Regression signal when refactoring `mainMapInteractions` selection branches.
 * Expected outcome: Icon hit path delegates to `applyHumanUnitIconClickSelectionPolicy` and clears use the shared timer helper.
 * Exceptions: None.
 */
function testMainMapInteractionsDelegatesHumanUnitIconSelectionToPolicyModule(): void {
  const interactionsPath = path.resolve(process.cwd(), 'src', 'renderer', 'map', 'mainMapInteractions.ts');
  const source = fs.readFileSync(interactionsPath, 'utf8');
  assert.ok(
    source.includes("from './mapClickSelectionPolicy'") &&
      source.includes('applyHumanUnitIconClickSelectionPolicy(') &&
      source.includes('clearDeferredHumanUnitSingleSelectTimer()'),
    'main map interactions should delegate human unit icon selection to shared policy helpers'
  );
}

/**
 * Defines the `testParityDiagnosticsBreadcrumbsCoverPlanningAndPositionSourceBoundaries` function shape.

 * Purpose: Guards parity diagnostics instrumentation around double-click planning and tactical draft-vs-committed source selection.
 * When to use: Regression signal when refactoring `mapDoubleClickHandler`, `mapClickSelectionPolicy`, or `tacticalDraftMarchOverlay`.
 * Expected outcome: Breadcrumb helper imports and event keys remain wired at the parity-sensitive boundaries.
 * Exceptions: None.
 */
function testParityDiagnosticsBreadcrumbsCoverPlanningAndPositionSourceBoundaries(): void {
  const interactionsPath = path.resolve(process.cwd(), 'src', 'renderer', 'map', 'mapDoubleClickHandler.ts');
  const selectionPolicyPath = path.resolve(process.cwd(), 'src', 'renderer', 'map', 'mapClickSelectionPolicy.ts');
  const tacticalOverlayPath = path.resolve(process.cwd(), 'src', 'renderer', 'tactical', 'tacticalDraftMarchOverlay.ts');
  const interactionsSource = fs.readFileSync(interactionsPath, 'utf8');
  const selectionPolicySource = fs.readFileSync(selectionPolicyPath, 'utf8');
  const tacticalOverlaySource = fs.readFileSync(tacticalOverlayPath, 'utf8');
  assert.ok(
    interactionsSource.includes('emitParityDiagnosticsBreadcrumb') &&
      interactionsSource.includes("'planning.doubleClickAccepted'") &&
      interactionsSource.includes("'planning.doubleClickIgnored'") &&
      interactionsSource.includes("'planning.doubleClickRejected'"),
    'main map double-click handling should emit parity breadcrumbs for planning decisions'
  );
  assert.ok(
    selectionPolicySource.includes('emitParityDiagnosticsBreadcrumb') &&
      selectionPolicySource.includes("'selection.deferSingleSelect'") &&
      selectionPolicySource.includes("'selection.applyDeferredSingleSelect'"),
    'main map click-selection policy should emit parity breadcrumbs for deferred single-select behavior'
  );
  assert.ok(
    tacticalOverlaySource.includes('emitParityDiagnosticsBreadcrumb') &&
      tacticalOverlaySource.includes("'tactical.positionSourceSelection'"),
    'tactical draft overlay helpers should emit parity breadcrumbs for draft-vs-committed position source selection'
  );
}

/**
 * Defines the `testTacticalMapViewLocksZoomPanAndRestoresWorld` function shape (function testTacticalMapViewLocksZoomPanAndRestoresWorld(): void).

 * Purpose: Static regression tests for Leaflet tactical camera constraints and exit restoration.
 * When to use: CI guard when refactoring `enterTacticalMapView` / `exitTacticalMapView`.
 * Expected outcome: Enter clamps min/max zoom and maxBounds to the tactical footprint with animated bounds; exit restores the loaded map extent and saved zoom limits.
 * Exceptions: None.
 */
function testTacticalMapViewLocksZoomPanAndRestoresWorld(): void {
  const tacticalMapPath = path.resolve(process.cwd(), 'src', 'renderer', 'map', 'tacticalMapView.ts');
  const source = fs.readFileSync(tacticalMapPath, 'utf8');
  const enterFn = getFunctionSource(source, 'enterTacticalMapView');
  assert.ok(
    enterFn.includes('map.setMaxBounds(tacticalBounds)') || enterFn.includes('map.setMaxBounds?.(tacticalBounds)'),
    'enterTacticalMapView should clamp Leaflet pan to the tactical footprint bounds'
  );
  assert.ok(
    enterFn.includes('setMinZoom(map.getZoom())') || enterFn.includes('map.setMinZoom(map.getZoom())'),
    'enterTacticalMapView should lock tactical min zoom to the level reached after fitting the footprint'
  );
  assert.ok(
    enterFn.includes('tacticalFlyMaxZoom') || enterFn.includes('maxZoom: tacticalFlyMaxZoom'),
    'enterTacticalMapView should use a raised tactical fly max zoom for a closer default view'
  );
  assert.ok(
    enterFn.includes('map.flyToBounds') || enterFn.includes('map.fitBounds'),
    'enterTacticalMapView should animate or fit bounds into the tactical footprint'
  );
  const exitFn = getFunctionSource(source, 'exitTacticalMapView');
  assert.ok(
    exitFn.includes('restoreLoadedMapExtent()'),
    'exitTacticalMapView should restore the loaded map extent after tactical mode'
  );
  assert.ok(
    exitFn.includes('restoreLoadedMapExtent(true)'),
    'exitTacticalMapView should fit the loaded map extent when no strategic home view was saved'
  );
  assert.ok(
    exitFn.includes('map.setMinZoom(S.preTacticalLeafletMinZoom)') &&
      exitFn.includes('map.setMaxZoom(S.preTacticalLeafletMaxZoom)'),
    'exitTacticalMapView should restore pre-tactical min/max zoom when captured'
  );
}

/**
 * Runs this file's source contracts.
 *
 * Purpose: The test runner executes this file as a script, the same way the previous combined file ran.
 * When to use: The call at the bottom of this file.
 * Expected outcome: Each contract function runs, and a thrown assertion fails the process.
 * Exceptions: Assertion errors propagate.
 */
function run(): void {
  testTacticalEntryLayerPlanningAndContestedContracts();
  testMainMapInteractionsDelegatesHumanUnitIconSelectionToPolicyModule();
  testParityDiagnosticsBreadcrumbsCoverPlanningAndPositionSourceBoundaries();
  testTacticalMapViewLocksZoomPanAndRestoresWorld();
  console.log('rendererMapEntryConsolidation.test.ts passed');
}

run();
