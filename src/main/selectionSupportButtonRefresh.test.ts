import * as assert from 'assert';
import { getFunctionSource, readRendererSource } from './testSupport/rendererSourceAssertions';

/**
 * Extracts one indented function body from TypeScript source by brace depth.
 *
 * Purpose: `getFunctionSource` misses `commitGroupedMarchOrders` because that function is nested and indented.
 * When to use: This test only, for that nested function.
 * Expected outcome: The slice from `async function commitGroupedMarchOrders` through its matching closing brace.
 * Exceptions: Throws if the function is missing or unterminated.
 */
function sliceIndentedFunction(source: string, functionName: string): string {
  const signaturePattern = new RegExp(
    `(^|\\n)[ \\t]*(?:export\\s+)?(?:async\\s+)?function\\s+${functionName}\\s*\\(`,
    'm'
  );
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
 * Asserts that each snippet appears, and that each appears after the one before it.
 *
 * Purpose: A file-wide search for the ranged sidebar refresh already passes because later click handlers call it.
 * When to use: On a function or switch-branch slice, not on a whole file.
 * Expected outcome: Throws when a snippet is missing or out of order.
 * Exceptions: AssertionError naming the slice and the missing snippet.
 */
function assertCallOrder(source: string, needles: readonly string[], label: string): void {
  let previous = -1;
  for (const needle of needles) {
    const index = source.indexOf(needle);
    assert.ok(index >= 0, `${label} should contain ${needle}`);
    assert.ok(index > previous, `${label} should reach ${needle} after the previous step`);
    previous = index;
  }
}

/**
 * Checks that a successful march or ferry clears the selection and then refreshes the ranged button.
 *
 * Purpose: Those two success paths clear the selection without the click-handler refresh, so the button can stay visible.
 * When to use: After changing `commitGroupedMarchOrders` or the ferry branch of the double-click handler.
 * Expected outcome: Both success slices refresh the ranged sidebar after the unit sidebar and before redraw. The march branch does not refresh it itself.
 * Exceptions: AssertionError when a call is missing, reordered, or the march branch grows its own refresh.
 */
function testCommittedOrderClearsRefreshRangedButton(): void {
  const march = sliceIndentedFunction(
    readRendererSource('map', 'mainMapInteractions.ts'),
    'commitGroupedMarchOrders'
  );
  assertCallOrder(
    march,
    ['clearCommittedOrderDraftState()', 'deps.updateSidebar()', 'deps.updateRangedSidebar()', 'deps.redraw()'],
    'commitGroupedMarchOrders'
  );

  const doubleClick = getFunctionSource(
    readRendererSource('map', 'mapDoubleClickHandler.ts'),
    'handleMainMapDoubleClick'
  );
  const planFerryStart = doubleClick.indexOf("case 'planFerry'");
  const planMarchStart = doubleClick.indexOf("case 'planMarch'");
  assert.ok(planFerryStart >= 0 && planMarchStart > planFerryStart, 'ferry branch should precede the march branch');
  const planFerry = doubleClick.slice(planFerryStart, planMarchStart);
  assertCallOrder(
    planFerry,
    ['clearCommittedOrderDraftState()', 'deps.updateSidebar()', 'deps.updateRangedSidebar()', 'deps.redraw()'],
    'planFerry'
  );

  const planMarch = doubleClick.slice(planMarchStart);
  assert.ok(
    !planMarch.includes('updateRangedSidebar'),
    'planMarch should refresh the ranged button through commitGroupedMarchOrders'
  );
}

/**
 * Runs the ranged-button refresh contract.
 *
 * Purpose: Single entry point so the discovery-based test runner can execute the file directly.
 * When to use: Invoked at module load; not imported anywhere.
 * Expected outcome: Prints a pass line, or throws on the first broken contract.
 * Exceptions: AssertionError from the contract above.
 */
function run(): void {
  testCommittedOrderClearsRefreshRangedButton();
  console.log('selectionSupportButtonRefresh.test.ts passed');
}

run();
