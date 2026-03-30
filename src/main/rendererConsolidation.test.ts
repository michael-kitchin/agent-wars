/**
 * Verifies renderer draw-path consolidation remains intact.
 * Run with: node dist/main/rendererConsolidation.test.js
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Extracts one top-level function body from a TypeScript source string.
 */
function getFunctionSource(source: string, functionName: string): string {
  const signature = `function ${functionName}(`;
  const start = source.indexOf(signature);
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

function testRedrawAndResizeDelegateToSharedScene(): void {
  const rendererPath = path.resolve(process.cwd(), 'src', 'renderer', 'renderer.ts');
  const source = fs.readFileSync(rendererPath, 'utf8');

  const resizeFn = getFunctionSource(source, 'resizeAndRedraw');
  const redrawFn = getFunctionSource(source, 'redraw');

  assert.ok(
    resizeFn.includes('drawGameScene(ctx, w, h, gameState);'),
    'resizeAndRedraw should delegate to drawGameScene'
  );
  assert.ok(
    redrawFn.includes('drawGameScene(ctx, w, h, gameState);'),
    'redraw should delegate to drawGameScene'
  );

  assert.ok(!resizeFn.includes('drawTerrainHexes('), 'resizeAndRedraw should not duplicate scene rendering steps');
  assert.ok(!redrawFn.includes('drawTerrainHexes('), 'redraw should not duplicate scene rendering steps');
}

function testSharedSceneStillRendersStaleIntel(): void {
  const rendererPath = path.resolve(process.cwd(), 'src', 'renderer', 'renderer.ts');
  const source = fs.readFileSync(rendererPath, 'utf8');
  const drawSceneFn = getFunctionSource(source, 'drawGameScene');

  assert.ok(
    drawSceneFn.includes('drawStaleEnemyIntel(ctx, state);'),
    'drawGameScene should render stale enemy intel markers'
  );
}

function testCommittedPathsRemainVisibleDuringResolutionAnimation(): void {
  const rendererPath = path.resolve(process.cwd(), 'src', 'renderer', 'renderer.ts');
  const source = fs.readFileSync(rendererPath, 'utf8');
  const drawSceneFn = getFunctionSource(source, 'drawGameScene');

  assert.ok(
    drawSceneFn.includes(
      'if (!hideCommittedOrderLinesAfterReady && humanStandingOrders.length > 0 && state.units.length)'
    ),
    'drawGameScene should draw committed paths regardless of animation state when not explicitly hidden'
  );
  assert.ok(
    !drawSceneFn.includes('if (!anim && !hideCommittedOrderLinesAfterReady'),
    'drawGameScene should not suppress committed paths while animation is active'
  );
  assert.ok(
    !source.includes('hideCommittedOrderLinesAfterReady = true;'),
    'renderer should not force-hide committed paths after ready'
  );
}

function run(): void {
  testRedrawAndResizeDelegateToSharedScene();
  testSharedSceneStillRendersStaleIntel();
  testCommittedPathsRemainVisibleDuringResolutionAnimation();
  console.log('rendererConsolidation.test.ts passed');
}

run();