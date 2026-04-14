/**
 * Verifies renderer draw-path consolidation remains intact.
 * Run with: node dist/main/rendererConsolidation.test.js
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Defines the `getFunctionSource` function shape (function getFunctionSource(source: string, functionName: string): string).

 * Purpose: Supports maintainability by documenting why `getFunctionSource` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function getFunctionSource(source: string, functionName: string): string {
  const signaturePattern = new RegExp(`(^|\\n)(?:export\\s+)?(?:async\\s+)?function\\s+${functionName}\\s*\\(`, 'm');
  const match = signaturePattern.exec(source);
  const start = match ? match.index + (match[1]?.length ?? 0) : -1;
  assert.ok(start >= 0, `Expected function ${functionName} to exist`);

  const openBrace = source.indexOf('{', start);
  assert.ok(openBrace >= 0, `Expected function ${functionName} to have a body`);

  let depth = 0;
  for (let i = openBrace; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    if (ch === '}') depth -= 1;
    if (depth === 0) return source.slice(start, i + 1);
  }

  throw new Error(`Unterminated function body for ${functionName}`);
}

/**
 * Defines the `assertMatches` function shape (function assertMatches(source: string, pattern: RegExp, message: string): void).

 * Purpose: Supports maintainability by documenting why `assertMatches` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function assertMatches(source: string, pattern: RegExp, message: string): void {
  assert.ok(pattern.test(source), message);
}

/**
 * Defines the `testRedrawAndResizeDelegateToSharedScene` function shape (function testRedrawAndResizeDelegateToSharedScene(): void).

 * Purpose: Supports maintainability by documenting why `testRedrawAndResizeDelegateToSharedScene` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testRedrawAndResizeDelegateToSharedScene(): void {
  const rendererPath = path.resolve(process.cwd(), 'src', 'renderer', 'renderer.ts');
  const source = fs.readFileSync(rendererPath, 'utf8');

  const resizeFn = getFunctionSource(source, 'resizeAndRedraw');
  const redrawFn = getFunctionSource(source, 'redraw');

  assert.ok(
    resizeFn.includes('drawGameScene(ctx, w, h, S.gameState);'),
    'resizeAndRedraw should delegate to drawGameScene'
  );
  assert.ok(
    redrawFn.includes('drawGameScene(ctx, w, h, S.gameState);'),
    'redraw should delegate to drawGameScene'
  );

  assert.ok(!resizeFn.includes('drawTerrainHexes('), 'resizeAndRedraw should not duplicate scene rendering steps');
  assert.ok(!redrawFn.includes('drawTerrainHexes('), 'redraw should not duplicate scene rendering steps');
}

/**
 * Defines the `testSharedSceneStillRendersStaleIntel` function shape (function testSharedSceneStillRendersStaleIntel(): void).

 * Purpose: Supports maintainability by documenting why `testSharedSceneStillRendersStaleIntel` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testSharedSceneStillRendersStaleIntel(): void {
  const rendererPath = path.resolve(process.cwd(), 'src', 'renderer', 'renderer.ts');
  const source = fs.readFileSync(rendererPath, 'utf8');
  const drawSceneFn = getFunctionSource(source, 'drawGameScene');

  assert.ok(
    drawSceneFn.includes('drawStaleEnemyIntel(ctx, state, inferUnitTypeLabelFromId);'),
    'drawGameScene should render stale enemy intel markers'
  );
}

/**
 * Defines the `testCommittedPathsRemainVisibleDuringResolutionAnimation` function shape (function testCommittedPathsRemainVisibleDuringResolutionAnimation(): void).

 * Purpose: Supports maintainability by documenting why `testCommittedPathsRemainVisibleDuringResolutionAnimation` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testCommittedPathsRemainVisibleDuringResolutionAnimation(): void {
  const rendererPath = path.resolve(process.cwd(), 'src', 'renderer', 'renderer.ts');
  const policyPath = path.resolve(process.cwd(), 'src', 'renderer', 'rendering', 'canvasPreviewPolicy.ts');
  const source = fs.readFileSync(rendererPath, 'utf8');
  const policySource = fs.readFileSync(policyPath, 'utf8');
  const drawSceneFn = getFunctionSource(source, 'drawGameScene');
  const shouldDrawCommittedOrderPathsFn = getFunctionSource(policySource, 'shouldDrawCommittedOrderPaths');
  const shouldDrawHoveredPathPreviewFn = getFunctionSource(policySource, 'shouldDrawHoveredPathPreview');
  const hiddenDuringPreviewFn = getFunctionSource(policySource, 'getCommittedOrderUnitsHiddenDuringPreview');

  assert.ok(
    drawSceneFn.includes('const shouldDrawCommittedPaths = shouldDrawCommittedOrderPaths();'),
    'drawGameScene should use shared committed-path visibility policy helper'
  );
  assert.ok(
    shouldDrawCommittedOrderPathsFn.includes('return !S.ctrlKeyActive;'),
    'shouldDrawCommittedOrderPaths should hide committed paths while ctrl is held for stack selection'
  );
  assert.ok(
    drawSceneFn.includes(
      'if (shouldDrawCommittedPaths && !S.hideCommittedOrderLinesAfterReady && S.humanStandingOrders.length > 0 && state.units.length)'
    ),
    'drawGameScene should keep committed paths visible once planned when ctrl is not held'
  );
  assert.ok(
    drawSceneFn.includes('const shouldDrawPathPreview = shouldDrawHoveredPathPreview();'),
    'drawGameScene should use shared hover-preview visibility policy helper'
  );
  assert.ok(
    shouldDrawHoveredPathPreviewFn.includes('return !S.ctrlKeyActive && S.selectedUnitIds.length > 0;'),
    'shouldDrawHoveredPathPreview should gate hover path preview by ctrl and active selection'
  );
  assert.ok(
    drawSceneFn.includes('drawPendingMarchesHoverAndSupportOrderStack({') &&
      drawSceneFn.includes('shouldDrawMarchHoverPreview: shouldDrawPathPreview,') &&
      drawSceneFn.includes('resolutionAnimationBlocksMarchHoverPreview: !!anim,') &&
      drawSceneFn.includes('drawMarchHoverPreview: drawHoverRoutePreview,'),
    'drawGameScene strategic branch should delegate pending stack with path preview gate'
  );
  assert.ok(
    drawSceneFn.includes('shouldDrawMarchHoverPreview: shouldDrawHoveredPathPreview(),') &&
      drawSceneFn.includes('resolutionAnimationBlocksMarchHoverPreview: !!S.resolutionMoveAnimation,'),
    'drawGameScene tactical branch should delegate pending stack with hover policy gating'
  );
  assert.ok(
    drawSceneFn.includes(
      'const hiddenCommittedUnitIdsWhilePreviewing = getCommittedOrderUnitsHiddenDuringPreview(shouldDrawPathPreview);'
    ),
    'drawGameScene should use helper to compute committed-path exclusions while previewing'
  );
  assert.ok(
    hiddenDuringPreviewFn.includes('if (!shouldDrawPathPreview || !S.hoverRoutePreview) return null;') &&
      hiddenDuringPreviewFn.includes('return new Set(S.selectedUnitIds);'),
    'getCommittedOrderUnitsHiddenDuringPreview should hide committed paths for units being replanned while preview is visible'
  );
  assert.ok(
    drawSceneFn.includes(
      'drawStandingOrderLines(ctx, S.humanStandingOrders, state.units, hiddenCommittedUnitIdsWhilePreviewing);'
    ),
    'drawGameScene should pass preview exclusion set into committed-path rendering'
  );
  assert.ok(
    !drawSceneFn.includes('if (!anim && !hideCommittedOrderLinesAfterReady'),
    'drawGameScene should not suppress committed paths while animation is active'
  );
  assert.ok(
    !source.includes('S.hideCommittedOrderLinesAfterReady = true;'),
    'renderer should not force-hide committed paths after ready'
  );
}

/**
 * Defines the `testProductionLabelContractsForExploredVsUnexploredHexes` function shape (function testProductionLabelContractsForExploredVsUnexploredHexes(): void).

 * Purpose: Supports maintainability by documenting why `testProductionLabelContractsForExploredVsUnexploredHexes` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testProductionLabelContractsForExploredVsUnexploredHexes(): void {
  const rendererPath = path.resolve(process.cwd(), 'src', 'renderer', 'renderer.ts');
  const terrainTooltipStatePath = path.resolve(process.cwd(), 'src', 'renderer', 'map', 'terrainTooltipRes1State.ts');
  const policyPath = path.resolve(process.cwd(), 'src', 'renderer', 'rendering', 'canvasPreviewPolicy.ts');
  const source = fs.readFileSync(rendererPath, 'utf8');
  const policySource = fs.readFileSync(policyPath, 'utf8');
  const terrainTooltipSource = fs.readFileSync(terrainTooltipStatePath, 'utf8');
  const drawProductionFn = getFunctionSource(source, 'drawRes1ProductionOverlays');
  const syncBuildEntryFn = getFunctionSource(source, 'syncBuildEntryButton');
  const getUrbanProductionCapacityForHexFn = getFunctionSource(source, 'getUrbanProductionCapacityForHex');
  const canonicalUrbanCapacityFn = getFunctionSource(terrainTooltipSource, 'getUrbanProductionCapacityForHex');
  const isRes1HexHumanUrbanProductionFn = getFunctionSource(source, 'isRes1HexHumanUrbanProduction');
  const drawHoverPreviewFn = getFunctionSource(source, 'drawHoverRoutePreview');
  const shouldDrawHoveredPathPreviewFn = getFunctionSource(policySource, 'shouldDrawHoveredPathPreview');

  assert.ok(
    drawProductionFn.includes('if (shouldRenderRes4Hexes()) return'),
    'drawRes1ProductionOverlays should draw no production labels when res4 hexes are shown'
  );
  assert.ok(
    drawProductionFn.includes('const overlayContext = buildProductionOverlayContext(S.gameState);'),
    'drawRes1ProductionOverlays should build a shared overlay context once per draw'
  );
  assertMatches(
    drawProductionFn,
    /if\s*\(!explored\s*&&\s*!overlayContext\.mapInspectionHeld\)\s*continue;/,
    'drawRes1ProductionOverlays should only show unexplored production labels while T is held'
  );
  assert.ok(
    drawProductionFn.includes('!overlayContext.mapInspectionHeld') &&
      drawProductionFn.includes('isRes1HexHumanUrbanProduction(S.gameState, hx)'),
    'drawRes1ProductionOverlays should include shared human-urban production eligibility checks'
  );
  assert.ok(
    drawProductionFn.includes(
      'const canShowLabelWithoutInspection = isRes1HexHumanUrbanProduction(S.gameState, hx) || controlledByHuman;'
    ),
    'drawRes1ProductionOverlays should keep $0 labels visible on explored human-controlled non-urban hexes'
  );
  assert.ok(
    drawProductionFn.includes('const hasClickableBuildEntryForHex =') &&
      drawProductionFn.includes('isRes1HexHumanUrbanProduction(S.gameState, hx)'),
    'drawRes1ProductionOverlays should keep build-entry clickability restricted to human urban-production hexes'
  );
  assertMatches(
    drawProductionFn,
    /:\s*`\$\$\{Math\.max\(0,\s*capacityPerTurn\)\.toLocaleString\(\)\}`;/,
    'drawRes1ProductionOverlays should show unexplored labels in $N format'
  );
  assert.ok(
    drawProductionFn.includes('const hasClickableBuildEntryForHex =') &&
      drawProductionFn.includes('explored &&') &&
      drawProductionFn.includes('isRes1HexHumanUrbanProduction(S.gameState, hx)') &&
      drawProductionFn.includes('if (hasClickableBuildEntryForHex) {'),
    'drawRes1ProductionOverlays should hide non-clickable label when clickable build entry exists'
  );
  assert.ok(
    drawProductionFn.includes('const capacityPerTurn = getUrbanProductionCapacityForHex(hx.h3Index);'),
    'drawRes1ProductionOverlays should derive production capacity from shared canonical urban-res4 count helper'
  );
  assert.ok(
    drawProductionFn.includes('overlayContext.revealAllControllerQueues'),
    'drawRes1ProductionOverlays should branch queue visibility by overlay context'
  );

  assert.ok(
    syncBuildEntryFn.includes('if (res4On) {') && syncBuildEntryFn.includes('hideBuildPopup()'),
    'syncBuildEntryButton should suppress build UI and close build popup on res4 zoom'
  );
  assert.ok(
    syncBuildEntryFn.includes('if (!explored) continue;'),
    'syncBuildEntryButton should only render clickable buttons for explored hexes'
  );
  assert.ok(
    syncBuildEntryFn.includes('isRes1HexHumanUrbanProduction(S.gameState, hx)'),
    'syncBuildEntryButton should use shared human-urban production eligibility'
  );
  assert.ok(
    !syncBuildEntryFn.includes("if (hx.terrain === 'water') continue;") &&
      !drawProductionFn.includes("if (hx.terrain === 'water') continue;"),
    'renderer production labels and build-entry buttons should not hard-exclude controlled water hexes'
  );
  assert.ok(
    isRes1HexHumanUrbanProductionFn.includes('getUrbanProductionCapacityForHex(hx.h3Index) > 0'),
    'isRes1HexHumanUrbanProduction should use canonical urban-res4 count for build eligibility'
  );
  assert.ok(
    getUrbanProductionCapacityForHexFn.includes('getUrbanProductionCapacityForHexFromTooltipState'),
    'renderer should delegate urban capacity to the shared terrain tooltip / res1 cache module'
  );
  assert.ok(
    canonicalUrbanCapacityFn.includes('countUrbanRes4HexesInRes1Hex(h3Index)'),
    'shared getUrbanProductionCapacityForHex should compute from live urban res4-child count'
  );
  assert.ok(
    drawHoverPreviewFn.includes('if (!shouldDrawHoveredPathPreview()) return;') &&
      shouldDrawHoveredPathPreviewFn.includes('return !S.ctrlKeyActive && S.selectedUnitIds.length > 0;'),
    'drawHoverRoutePreview should use shared policy to suppress path-plan preview while ctrl is held and when nothing is selected'
  );
}

/**
 * Defines the `testStackCalloutSingleUnitNonCtrlClosesPopup` function shape (function testStackCalloutSingleUnitNonCtrlClosesPopup(): void).

 * Purpose: Supports maintainability by documenting why `testStackCalloutSingleUnitNonCtrlClosesPopup` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testStackCalloutSingleUnitNonCtrlClosesPopup(): void {
  const rendererPath = path.resolve(process.cwd(), 'src', 'renderer', 'renderer.ts');
  const source = fs.readFileSync(rendererPath, 'utf8');
  const showStackCalloutFn = getFunctionSource(source, 'showStackCallout');
  const stackSingleUnitHandlerFn = getFunctionSource(source, 'onStackSingleUnitToggleClick');

  assert.ok(
    showStackCalloutFn.includes('onStackSingleUnitToggleClick(') &&
      stackSingleUnitHandlerFn.includes('if (!S.ctrlKeyActive) {') &&
      stackSingleUnitHandlerFn.includes('hideStackCallout();'),
    'stack single-unit handler should close popup after non-ctrl unit button clicks'
  );
}

/**
 * Defines the `testStackSealiftWaterStateHidesDebarkAndEmbarkedSelectionControls` function shape (function testStackSealiftWaterStateHidesDebarkAndEmbarkedSelectionControls(): void).

 * Purpose: Supports maintainability by documenting why `testStackSealiftWaterStateHidesDebarkAndEmbarkedSelectionControls` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testStackSealiftWaterStateHidesDebarkAndEmbarkedSelectionControls(): void {
  const rendererPath = path.resolve(process.cwd(), 'src', 'renderer', 'renderer.ts');
  const source = fs.readFileSync(rendererPath, 'utf8');
  const renderSealiftSectionFn = getFunctionSource(source, 'renderSealiftSection');
  const setNonSelectableFn = getFunctionSource(source, 'setStackPopupNonSelectableUnitIds');
  const applyVisibilityFn = getFunctionSource(source, 'applyStackCalloutSelectionButtonVisibility');
  const showStackCalloutFn = getFunctionSource(source, 'showStackCallout');

  assert.ok(
    renderSealiftSectionFn.includes('state.contextMode === \'water\'') &&
      renderSealiftSectionFn.includes('setStackPopupNonSelectableUnitIds(calloutEl, nonSelectableEmbarkedIds);'),
    'water-context sealift rendering should mark embarked land units as non-selectable in the stack popup'
  );
  assert.ok(
    renderSealiftSectionFn.includes('if (state.contextMode !== \'water\') {') &&
      renderSealiftSectionFn.includes('debarkBtn'),
    'water-context sealift rendering should hide debark controls instead of disabling them'
  );
  assert.ok(
    setNonSelectableFn.includes('applyStackCalloutSelectionButtonVisibility(calloutEl, nonSelectable);') &&
      applyVisibilityFn.includes('btn.style.display = nonSelectableUnitIds.has(unitId) ? \'none\' : \'\';'),
    'non-selectable stack-popup units should hide per-unit select/unselect buttons'
  );
  assert.ok(
    showStackCalloutFn.includes('getSelectableHumanIdsForStackCallout(units)') &&
      showStackCalloutFn.includes("onStackAllActionClick('selectAll'") &&
      showStackCalloutFn.includes("onStackAllActionClick('addAll'") &&
      showStackCalloutFn.includes("onStackAllActionClick('removeAll'"),
    'stack callout all-actions should filter through selectable human IDs so embarked land units on water remain unselectable'
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
  const rendererPath = path.resolve(process.cwd(), 'src', 'renderer', 'renderer.ts');
  const source = fs.readFileSync(rendererPath, 'utf8');
  const modifierRulesFn = getFunctionSource(source, 'applyModifierDrivenPopoverCloseRules');
  const keydownHandlerFn = getFunctionSource(source, 'init');

  assert.ok(
    modifierRulesFn.includes("if (reason === 'ctrl_pressed')") &&
      modifierRulesFn.includes('hideBuildPopup();') &&
      modifierRulesFn.includes("if (reason === 'ctrl_released')") &&
      modifierRulesFn.includes('hideStackCallout();'),
    'modifier-driven popover close rules should centralize ctrl pressed/released behavior'
  );
  assert.ok(
    keydownHandlerFn.includes("applyModifierDrivenPopoverCloseRules('ctrl_pressed');") &&
      keydownHandlerFn.includes("applyModifierDrivenPopoverCloseRules('ctrl_released');"),
    'init key handlers should delegate popover-close behavior to shared modifier rule helper'
  );
}

/**
 * Defines the `testInfrastructureGlyphSetsComeFromRes4Overrides` function shape (function testInfrastructureGlyphSetsComeFromRes4Overrides(): void).

 * Purpose: Supports maintainability by documenting why `testInfrastructureGlyphSetsComeFromRes4Overrides` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testInfrastructureGlyphSetsComeFromRes4Overrides(): void {
  const rendererPath = path.resolve(process.cwd(), 'src', 'renderer', 'renderer.ts');
  const source = fs.readFileSync(rendererPath, 'utf8');
  const drawInfraFn = getFunctionSource(source, 'drawTerrainInfrastructureOverlays');
  const hasVisibleRes1InfraFn = getFunctionSource(source, 'hasVisibleRes1InfrastructureGlyphs');

  assert.ok(
    source.includes('const nextState = deriveInfrastructureOverlayState(rows);') &&
      source.includes('terrainInfraRes4Airport = nextState.terrainInfraRes4Airport;') &&
      source.includes('terrainInfraRes4Seaport = nextState.terrainInfraRes4Seaport;'),
    'applyRes4TerrainOverrides should use centralized derivation for res4 airport/seaport glyph sets'
  );
  assert.ok(
    source.includes('terrainInfraRes1Airport = nextState.terrainInfraRes1Airport;') &&
      source.includes('terrainInfraRes1Seaport = nextState.terrainInfraRes1Seaport;'),
    'applyRes4TerrainOverrides should use centralized derivation for res1 airport/seaport glyph sets'
  );
  assert.ok(
    !source.includes('.getTerrainInfrastructureHints()'),
    'renderer init should not overwrite live glyph sets with major-only terrain hint snapshots'
  );
  assert.ok(
    !drawInfraFn.includes('if (unitHexes.has(hx.h3Index)) continue;') &&
      !drawInfraFn.includes('if (unitHexes.has(parent.h3Index)) continue;'),
    'drawTerrainInfrastructureOverlays should not suppress airport/seaport glyphs on hexes that contain units'
  );
  assert.ok(
    !hasVisibleRes1InfraFn.includes('!unitHexes.has(h3Index)'),
    'hasVisibleRes1InfrastructureGlyphs should remain true for explored infra hexes even when units are present'
  );
}

/**
 * Defines the `testAirFerryDoubleClickContracts` function shape (function testAirFerryDoubleClickContracts(): void).

 * Purpose: Supports maintainability by documenting why `testAirFerryDoubleClickContracts` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testAirFerryDoubleClickContracts(): void {
  const rendererPath = path.resolve(process.cwd(), 'src', 'renderer', 'renderer.ts');
  const orderDrawingPath = path.resolve(process.cwd(), 'src', 'renderer', 'rendering', 'orderDrawing.ts');
  const source = fs.readFileSync(rendererPath, 'utf8');
  const orderDrawingSource = fs.readFileSync(orderDrawingPath, 'utf8');
  const initFn = getFunctionSource(source, 'init');
  const pendingOrdersFn = getFunctionSource(source, 'updatePendingOrdersSidebar');
  const orderLabelFormattingPath = path.resolve(process.cwd(), 'src', 'renderer', 'gameplay', 'orderLabelFormatting.ts');
  const orderLabelFormattingSource = fs.readFileSync(orderLabelFormattingPath, 'utf8');
  const formatPendingFerryOrderSidebarLabelFn = getFunctionSource(
    orderLabelFormattingSource,
    'formatPendingFerryOrderSidebarLabel'
  );

  assert.ok(
    initFn.includes('const hasAirSelection = selectedAtMouseDown.some((unit) => unit.unitType === \'air\');') &&
      initFn.includes('const hasNonAirSelection = selectedAtMouseDown.some((unit) => unit.unitType !== \'air\');') &&
      initFn.includes('Cannot issue grouped movement for mixed air and non-air units.'),
    'double-click movement should reject mixed air and non-air selections with a toast'
  );
  assert.ok(
    initFn.includes('window.gameApi?.validateGroupFerryTarget') &&
      initFn.includes('replacePendingFerryOrdersForSelected(selectedIds, destinationH3);'),
    'double-click movement should validate grouped ferry destinations through main-process API and queue ferry orders for air selections'
  );
  assert.ok(
    source.includes('ferryOrders: S.pendingFerryOrders,'),
    'ready submit payload should include pending ferry orders'
  );
  assert.ok(
    pendingOrdersFn.includes('formatPendingFerryOrderSidebarLabel(S.gameState, ferry)'),
    'pending ferry sidebar rows should display via the ferry label formatter for Nh parity'
  );
  assert.ok(
    formatPendingFerryOrderSidebarLabelFn.includes('?h (ferry)') &&
      !formatPendingFerryOrderSidebarLabelFn.includes('destinationH3Index} (ferry)'),
    'ferry sidebar labels should avoid raw H3 fallback and stay in Nh notation'
  );
  const overlayStagesPath = path.resolve(process.cwd(), 'src', 'renderer', 'rendering', 'orderOverlayStages.ts');
  const overlayStagesSource = fs.readFileSync(overlayStagesPath, 'utf8');
  assert.ok(
    source.includes("from './rendering/orderOverlayStages'") &&
      source.includes('drawPendingMarchesHoverAndSupportOrderStack({') &&
      overlayStagesSource.includes('drawPendingSupportOrderOverlays(') &&
      overlayStagesSource.includes(
        'drawPendingFerryLines(ctx, S.pendingFerryOrders, unitsForOrderLines, hexList, drawLineArrow);'
      ) &&
      orderDrawingSource.includes('function drawPendingFerryLines(') &&
      orderDrawingSource.includes('drawLineArrow('),
    'pending ferry planning should render filled map arrows via shared overlay stage like other planned movement'
  );
}

/**
 * Defines the `testAirStrikeAndAirGlyphContracts` function shape (function testAirStrikeAndAirGlyphContracts(): void).

 * Purpose: Supports maintainability by documenting why `testAirStrikeAndAirGlyphContracts` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testAirStrikeAndAirGlyphContracts(): void {
  const rendererPath = path.resolve(process.cwd(), 'src', 'renderer', 'renderer.ts');
  const readyHandlerPath = path.resolve(process.cwd(), 'src', 'renderer', 'gameplay', 'readyHandler.ts');
  const tacticalOrdersPath = path.resolve(process.cwd(), 'src', 'renderer', 'gameplay', 'tacticalOrders.ts');
  const sidebarSupportPath = path.resolve(process.cwd(), 'src', 'renderer', 'gameplay', 'sidebarSupport.ts');
  const rendererConstantsPath = path.resolve(process.cwd(), 'src', 'renderer', 'core', 'constants.ts');
  const source = fs.readFileSync(rendererPath, 'utf8');
  const readyHandlerSource = fs.readFileSync(readyHandlerPath, 'utf8');
  const tacticalOrdersSource = fs.readFileSync(tacticalOrdersPath, 'utf8');
  const sidebarSupportSource = fs.readFileSync(sidebarSupportPath, 'utf8');
  const rendererConstantsSource = fs.readFileSync(rendererConstantsPath, 'utf8');
  const inferUnitTypeLabelFromIdFn = getFunctionSource(source, 'inferUnitTypeLabelFromId');

  assert.ok(
    rendererConstantsSource.includes("air: 'S'") && source.includes("from './core/constants'"),
    'air unit type label should render as S'
  );
  assert.ok(
    inferUnitTypeLabelFromIdFn.includes("if (unitId.includes('-air-')) return 'S';"),
    'unit-id fallback label should map air units to S instead of ?'
  );
  assert.ok(
    readyHandlerSource.includes("from './turnUpdateSummary'") &&
      readyHandlerSource.includes('buildTurnUpdateBullets({') &&
      readyHandlerSource.includes('formatKillLine: killToastFormatter.formatKillLine'),
    'ready update bullets should be delegated to shared turn update summary helpers'
  );
  assert.ok(
    source.includes("btnEl.style.display = S.airStrikeModeActive ? 'none' : 'inline-block';"),
    'Strike button should hide while strike planning mode is active'
  );
  assert.ok(
    tacticalOrdersSource.includes("from './orderLabelFormatting'") &&
      tacticalOrdersSource.includes(
        'formatPendingRangedAttackSidebarLabel(S.gameState, r, tacticalPositions)'
      ) &&
      tacticalOrdersSource.includes(
        'formatPendingAirStrikeSidebarLabel(S.gameState, strike, tacticalPositions)'
      ) &&
      sidebarSupportSource.includes("from './orderLabelFormatting'") &&
      sidebarSupportSource.includes('formatPendingFerryOrderSidebarLabel(S.gameState, ferry)'),
    'planned order list labels should use shared order label formatting helpers'
  );
  assert.ok(
    source.includes('function formatTargetingValidationReason(') &&
      source.includes("formatTargetingValidationReason(validation.reason, 'Selected air units cannot strike that target.')") &&
      source.includes("formatTargetingValidationReason(validation.reason, 'Selected units cannot fire at that target.')"),
    'grouped strike and ranged targeting toasts should format unit IDs as display names'
  );
  assert.ok(
    source.includes('airStrikeOutboundMoves: airStrikeOutboundMoves.length > 0 ? airStrikeOutboundMoves : undefined') &&
      source.includes('airStrikeReturnMoves: airStrikeReturnMoves.length > 0 ? airStrikeReturnMoves : undefined') &&
      source.includes('inAirStrikeOutbound') &&
      source.includes('inAirStrikeReturn'),
    'resolution playback should include outbound/return air-strike movement phases'
  );
  assert.ok(
    source.includes('const knownHumanAirStrikeTargetHexes = new Set(') &&
      source.includes(".filter((move) => move.player === 'human')") &&
      source.includes('.filter((h3) => !knownHumanAirStrikeTargetHexes.has(h3))'),
    'unknown battle announcements should not include known human air-strike target hexes'
  );
  assert.ok(
    source.includes('phase.inAirStrikeLightning || phase.inAirStrikeCasualty') &&
      source.includes('h3Index: move.toH3Index') &&
      source.includes('movingIds = new Set((anim.airStrikeReturnMoves ?? []).map((move) => move.unitId));'),
    'air strike playback should pin strikers at target during combat/casualty and hide survivors at base until return animation completes'
  );
  assert.ok(
    source.includes('function buildResolutionPlaybackState(') &&
      source.includes('const { phase } = buildResolutionPlaybackState(anim, elapsed);'),
    'resolution playback phase derivation should be centralized for all unit/scenario animation paths'
  );
  assert.ok(
    source.includes('if (!validation.success) {') &&
      source.includes('airStrikeModeActive = false;') &&
      source.includes('rangedModeActive = false;'),
    'invalid ranged/strike target clicks should cancel planning mode'
  );
  assert.ok(
    !source.includes('function formatAirStrikeTargetLabel(') && !source.includes('function formatRangedTargetUnitLabel('),
    'renderer should not keep dead local strike target label helpers after formatter extraction'
  );
}

/**
 * Defines the `testKillUpdateTextOmitsPlayerSuffixes` function shape (function testKillUpdateTextOmitsPlayerSuffixes(): void).

 * Purpose: Supports maintainability by documenting why `testKillUpdateTextOmitsPlayerSuffixes` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testKillUpdateTextOmitsPlayerSuffixes(): void {
  const rendererPath = path.resolve(process.cwd(), 'src', 'renderer', 'renderer.ts');
  const source = fs.readFileSync(rendererPath, 'utf8');
  const buildKillToastFormatterBundleFn = getFunctionSource(source, 'buildKillToastFormatterBundle');

  assert.ok(
    !buildKillToastFormatterBundleFn.includes("' (AI)'") && !buildKillToastFormatterBundleFn.includes("' (human)'"),
    'kill/update formatter should not append AI/human suffixes'
  );
}

/**
 * Defines the `testRes4RubbleTooltipAndTerrainVariantContracts` function shape (function testRes4RubbleTooltipAndTerrainVariantContracts(): void).

 * Purpose: Supports maintainability by documenting why `testRes4RubbleTooltipAndTerrainVariantContracts` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testRes4RubbleTooltipAndTerrainVariantContracts(): void {
  const rendererPath = path.resolve(process.cwd(), 'src', 'renderer', 'renderer.ts');
  const rendererSource = fs.readFileSync(rendererPath, 'utf8');
  const terrainTooltipStatePath = path.resolve(process.cwd(), 'src', 'renderer', 'map', 'terrainTooltipRes1State.ts');
  const terrainTooltipStateSource = fs.readFileSync(terrainTooltipStatePath, 'utf8');
  const terrainStylesPath = path.resolve(process.cwd(), 'src', 'renderer', 'rendering', 'terrainVisualStyles.ts');
  const terrainStylesSource = fs.readFileSync(terrainStylesPath, 'utf8');
  const drawTerrainHexesFn = getFunctionSource(rendererSource, 'drawTerrainHexes');
  const featureLabelsForRes4ChildFn = getFunctionSource(terrainTooltipStateSource, 'featureLabelsForRes4Child');
  const terrainStateForPointerFn = getFunctionSource(terrainTooltipStateSource, 'terrainStateForPointer');
  const formatTerrainTooltipHtmlFn = getFunctionSource(terrainTooltipStateSource, 'formatTerrainTooltipHtml');

  assert.ok(
    drawTerrainHexesFn.includes('if (res4Active) return;'),
    'res1 terrain fills/styles should be suppressed while res4 child hex rendering is active'
  );
  assert.ok(
    featureLabelsForRes4ChildFn.includes('detail?.isRubble') &&
      featureLabelsForRes4ChildFn.includes("labels.push('Rubble')"),
    'res4 feature labels should include rubble when a child override marks rubble'
  );
  assert.ok(
    terrainStateForPointerFn.includes('isRubble: detail?.isRubble ?? false'),
    'res4 tooltip state should preserve rubble override flags from terrain detail state'
  );
  assert.ok(
    formatTerrainTooltipHtmlFn.includes('formatTerrainVariantSuffix(state)'),
    'terrain tooltip rendering should use shared variant suffix formatting for urban/rubble'
  );
  assertMatches(
    terrainStylesSource,
    /const isRubble = options\?\.isRubble === true;/,
    'terrain fill logic should derive rubble variant directly from the rubble override flag'
  );
  assertMatches(
    terrainStylesSource,
    /const isUrban = !isRubble && options\?\.isUrban === true;/,
    'terrain fill logic should derive urban variant directly from the urban override flag'
  );
}

/**
 * Defines the `testTacticalDrawBranchSkipsStrategicStaleIntel` function shape (function testTacticalDrawBranchSkipsStrategicStaleIntel(): void).

 * Purpose: Guards milestone-2.1 no-fog tactical rendering against strategic stale-intel overlays.
 * When to use: Regression signal when refactoring `drawGameScene` tactical early return.
 * Expected outcome: The tactical-only slice of `drawGameScene` never calls `drawStaleEnemyIntel`.
 * Exceptions: None.
 */
function testTacticalDrawBranchSkipsStrategicStaleIntel(): void {
  const rendererPath = path.resolve(process.cwd(), 'src', 'renderer', 'renderer.ts');
  const source = fs.readFileSync(rendererPath, 'utf8');
  const drawSceneFn = getFunctionSource(source, 'drawGameScene');
  const tacticalIdx = drawSceneFn.indexOf('if (S.tacticalBattleSnapshot)');
  assert.ok(tacticalIdx >= 0, 'drawGameScene should branch on tactical snapshot');
  const tacticalReturnIdx = drawSceneFn.indexOf('return;', tacticalIdx);
  assert.ok(tacticalReturnIdx > tacticalIdx, 'tactical branch should return before strategic-only overlays');
  const tacticalSlice = drawSceneFn.slice(tacticalIdx, tacticalReturnIdx);
  assert.ok(
    !tacticalSlice.includes('drawStaleEnemyIntel'),
    'tactical draw branch must not apply strategic fog-of-war stale intel rendering'
  );
  assert.ok(tacticalSlice.includes('drawUnits('), 'tactical branch should still draw tactical unit markers');
}

/**
 * Defines the `testTacticalRes4DrawingSkipsExploredGateWhenTactical` function shape (function testTacticalRes4DrawingSkipsExploredGateWhenTactical(): void).

 * Purpose: Confirms res4 terrain drawing does not hide the enclosing tactical parent behind strategic exploration fog (milestone 2.1 Phase K).
 * When to use: Regression guard when refactoring `drawRes4TerrainHexes` parent filtering.
 * Expected outcome: Tactical branch uses `!tactical && !exploredHexes.has(parent.h3Index)` so explored is ignored when tactical is active.
 * Exceptions: None.
 */
function testTacticalRes4DrawingSkipsExploredGateWhenTactical(): void {
  const terrainPath = path.resolve(process.cwd(), 'src', 'renderer', 'rendering', 'terrainRendering.ts');
  const source = fs.readFileSync(terrainPath, 'utf8');
  const fn = getFunctionSource(source, 'drawRes4TerrainHexes');
  assert.ok(
    fn.includes('if (!tactical && !exploredHexes.has(parent.h3Index)) continue;'),
    'drawRes4TerrainHexes should skip exploredHexes gating for the tactical enclosing res1 parent'
  );
}

/**
 * Defines the `testTacticalEntryLayerPlanningAndContestedContracts` function shape (function testTacticalEntryLayerPlanningAndContestedContracts(): void).

 * Purpose: Static regression tests for milestone-2.1 Phase B tactical magnifier visibility rules (planning-only, contested res1, mirrored vertical offset).
 * When to use: CI guard when refactoring `syncTacticalEntryButton` or overlay layout.
 * Expected outcome: Source encodes planning+tactical-active gate, co-presence contest check, and magnifyTop mirror formula.
 * Exceptions: None.
 */
function testTacticalEntryLayerPlanningAndContestedContracts(): void {
  const entryPath = path.resolve(process.cwd(), 'src', 'renderer', 'map', 'tacticalEntryLayer.ts');
  const source = fs.readFileSync(entryPath, 'utf8');
  assert.ok(
    source.includes("if (S.gameState.phase !== 'planning' || S.tacticalBattleSnapshot)"),
    'syncTacticalEntryButton should hide overlays outside strategic planning or while a tactical snapshot is active'
  );
  assert.ok(
    source.includes('if (!isContestedRes1Hex(S.gameState, hx.h3Index)) continue;'),
    'syncTacticalEntryButton should only place buttons on contested res1 hexes'
  );
  assert.ok(
    source.includes("u.player === 'human'") && source.includes("u.player === 'opponent'"),
    'tactical entry eligibility should require both human and opponent parent units in the same hex'
  );
  assert.ok(
    source.includes('const magnifyTop = Math.round(2 * center.y - textY);'),
    'syncTacticalEntryButton should mirror build-label vertical offset using 2*center.y - textY'
  );
  assert.ok(
    source.includes('class="tactical-entry-btn"') && source.includes('&#128269;'),
    'syncTacticalEntryButton should emit magnifying-glass tactical entry buttons'
  );
}

/**
 * Defines the `testTacticalMapViewLocksZoomPanAndRestoresWorld` function shape (function testTacticalMapViewLocksZoomPanAndRestoresWorld(): void).

 * Purpose: Static regression tests for milestone-2.1 Phase C Leaflet tactical camera constraints and exit restoration.
 * When to use: CI guard when refactoring `enterTacticalMapView` / `exitTacticalMapView`.
 * Expected outcome: Enter clamps min/max zoom and maxBounds to the tactical footprint with animated bounds; exit restores world maxBounds and saved zoom limits.
 * Exceptions: None.
 */
/**
 * Defines the `testStrategicAndTacticalBranchesShareOrderOverlayPipeline` function shape.

 * Purpose: Guards Phase 5 overlay consolidation so tactical/strategic `drawGameScene` paths cannot drop pending support overlays independently.
 * When to use: Regression signal when refactoring `drawGameScene` or `orderOverlayStages`.
 * Expected outcome: Both branches call `drawPendingMarchesHoverAndSupportOrderStack` from the shared module (which stages hover preview then support overlays).
 * Exceptions: None.
 */
function testStrategicAndTacticalBranchesShareOrderOverlayPipeline(): void {
  const rendererPath = path.resolve(process.cwd(), 'src', 'renderer', 'renderer.ts');
  const source = fs.readFileSync(rendererPath, 'utf8');
  const drawSceneFn = getFunctionSource(source, 'drawGameScene');
  assert.ok(
    source.includes("from './rendering/orderOverlayStages'") && source.includes('drawPendingMarchesHoverAndSupportOrderStack'),
    'renderer should import shared order overlay stack helper'
  );
  const stackCalls = drawSceneFn.match(/drawPendingMarchesHoverAndSupportOrderStack\(/g) ?? [];
  assert.ok(stackCalls.length >= 2, 'drawGameScene should invoke shared pending march/hover/support stack in tactical and strategic paths');
}

/**
 * Defines the `testMainMapInteractionsDelegatesHumanUnitIconSelectionToPolicyModule` function shape.

 * Purpose: Guards Phase 4 click-selection consolidation for human unit icon hits on the main map.
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

 * Purpose: Guards Phase 7 parity diagnostics instrumentation around double-click planning and tactical draft-vs-committed source selection.
 * When to use: Regression signal when refactoring `mainMapInteractions`, `mapClickSelectionPolicy`, or `tacticalDraftMarchOverlay`.
 * Expected outcome: Breadcrumb helper imports and event keys remain wired at the parity-sensitive boundaries.
 * Exceptions: None.
 */
function testParityDiagnosticsBreadcrumbsCoverPlanningAndPositionSourceBoundaries(): void {
  const interactionsPath = path.resolve(process.cwd(), 'src', 'renderer', 'map', 'mainMapInteractions.ts');
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
    'main map interactions should emit parity breadcrumbs for double-click planning decisions'
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
    exitFn.includes('map.setMaxBounds(worldBounds)'),
    'exitTacticalMapView should restore world maxBounds after tactical mode'
  );
  assert.ok(
    exitFn.includes('map.fitBounds(worldBounds') || exitFn.includes('map.fitBounds?.(worldBounds'),
    'exitTacticalMapView should fit the default strategic world view after restoring zoom limits'
  );
  assert.ok(
    exitFn.includes('map.setMinZoom(S.preTacticalLeafletMinZoom)') &&
      exitFn.includes('map.setMaxZoom(S.preTacticalLeafletMaxZoom)'),
    'exitTacticalMapView should restore pre-tactical min/max zoom when captured'
  );
}

/**
 * Defines the `testResolutionMovingStackGroupsMixedEmbarkedAndNavalMoves` function shape (function testResolutionMovingStackGroupsMixedEmbarkedAndNavalMoves(): void).

 * Purpose: Static regression tests for resolution-phase movement stacks (naval + embarked cargo grouped animation).
 * When to use: CI guard when refactoring `drawMovingUnits` in `pathDrawing.ts`.
 * Expected outcome: Source encodes groupKey, aggregation, mixed-type label, and count badge layout for stacked moves.
 * Exceptions: None.
 */
function testResolutionMovingStackGroupsMixedEmbarkedAndNavalMoves(): void {
  const pathDrawingPath = path.resolve(process.cwd(), 'src', 'renderer', 'rendering', 'pathDrawing.ts');
  const source = fs.readFileSync(pathDrawingPath, 'utf8');
  const drawMovingUnitsFn = getFunctionSource(source, 'drawMovingUnits');

  assert.ok(
    drawMovingUnitsFn.includes('const groupKey = `${move.player}|${move.fromH3Index}|${move.toH3Index}`;'),
    'drawMovingUnits should group by player+origin+destination so naval + embarked cargo animate as one stack'
  );
  assert.ok(
    drawMovingUnitsFn.includes('existing.count += 1;') &&
      drawMovingUnitsFn.includes('existing.unitTypes.add(move.unitType);'),
    'drawMovingUnits should aggregate grouped move count and unit-type set for mixed stacks'
  );
  assert.ok(
    drawMovingUnitsFn.includes("const label = group.unitTypes.size > 1 ? '*' : (UNIT_TYPE_LABELS[move.unitType] ?? '?');"),
    'drawMovingUnits should show mixed-type stack marker when grouped moves include multiple unit types'
  );
  assert.ok(
    drawMovingUnitsFn.includes('if (group.count > 1) {') &&
      drawMovingUnitsFn.includes('p.x + STACK_OFFSET_X') &&
      drawMovingUnitsFn.includes('p.y + STACK_OFFSET_Y') &&
      drawMovingUnitsFn.includes('ctx.fillText(String(group.count), badgeX, badgeY);'),
    'drawMovingUnits should render grouped movement as stacked markers with a count badge'
  );
}

/**
 * Defines the `run` function shape (function run(): void).

 * Purpose: Supports maintainability by documenting why `run` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function run(): void {
  testRedrawAndResizeDelegateToSharedScene();
  testSharedSceneStillRendersStaleIntel();
  testCommittedPathsRemainVisibleDuringResolutionAnimation();
  testProductionLabelContractsForExploredVsUnexploredHexes();
  testStackCalloutSingleUnitNonCtrlClosesPopup();
  testStackSealiftWaterStateHidesDebarkAndEmbarkedSelectionControls();
  testModifierDrivenPopoverCloseRulesCentralized();
  testInfrastructureGlyphSetsComeFromRes4Overrides();
  testAirFerryDoubleClickContracts();
  testAirStrikeAndAirGlyphContracts();
  testKillUpdateTextOmitsPlayerSuffixes();
  testRes4RubbleTooltipAndTerrainVariantContracts();
  testResolutionMovingStackGroupsMixedEmbarkedAndNavalMoves();
  testTacticalDrawBranchSkipsStrategicStaleIntel();
  testTacticalRes4DrawingSkipsExploredGateWhenTactical();
  testTacticalEntryLayerPlanningAndContestedContracts();
  testStrategicAndTacticalBranchesShareOrderOverlayPipeline();
  testMainMapInteractionsDelegatesHumanUnitIconSelectionToPolicyModule();
  testParityDiagnosticsBreadcrumbsCoverPlanningAndPositionSourceBoundaries();
  testTacticalMapViewLocksZoomPanAndRestoresWorld();
  console.log('rendererConsolidation.test.ts passed');
}

run();
