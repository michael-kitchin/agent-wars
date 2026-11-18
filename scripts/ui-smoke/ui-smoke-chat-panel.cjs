/**
 * The UI smoke scenes for the chat panel's resize grip.
 *
 * Purpose: The grip sits at the panel's top-left corner in both states and stops at the panel's size limits. These
 *   scenes drag it the way a player would, to both limits while expanded and once more while compact.
 * When to use: From the first session in `ui-smoke.cjs`, right after the selection panel's resize scenes, while the
 *   match is in world-map planning and the chat panel is shown and compact.
 * Expected outcome: Three recorded scenes: the panel expanded, dragged as large as it goes, then dragged as small as it
 *   goes. The panel is compact again afterward, so the scenes after it start with an unobstructed map.
 * Exceptions: Throws a Playwright timeout when the panel is not shown or does not reach the awaited state.
 */
'use strict';

const { SCENES, SETTLE_MS } = require('./ui-smoke-scenes.cjs');
const { parkPointer } = require('./ui-smoke-page.cjs');
const { dragGrip } = require('./ui-smoke-map.cjs');

/**
 * Clicks the chat panel's expand control and waits for the panel to settle in the state that click chooses.
 *
 * Purpose: Each step waits on the panel's own `data-state`, not on a fixed time.
 * When to use: Between the scenes below.
 * Expected outcome: The panel is `expanded` or `compact` as asked, the pointer is parked, and the click has settled.
 * Exceptions: Throws a Playwright timeout when the state is not reached.
 */
async function toggleChatPanel(page, state) {
  await page.click('#chat-panel-expand');
  await parkPointer(page);
  await page.waitForSelector(`#chat-panel[data-state="${state}"]`, { timeout: SETTLE_MS.overlay * 4 });
  await page.waitForTimeout(SETTLE_MS.click);
}

/**
 * Drags the chat panel's grip until its center is at a point in the window.
 *
 * Purpose: A drag must end inside the window, and the grip's start depends on the panel's size. Aiming at a window
 *   point reaches either size limit from any start.
 * When to use: While the grip is on screen.
 * Expected outcome: The grip's center is at the point, unless the panel's size limits stop the panel first.
 * Exceptions: Throws when the grip is not on screen.
 */
async function dragChatGripTo(page, x, y) {
  const box = await page.locator('#chat-panel-grip').boundingBox();
  if (!box) throw new Error('the chat panel grip is not on screen');
  await dragGrip(page, '#chat-panel-grip', x - (box.x + box.width / 2), y - (box.y + box.height / 2));
}

/**
 * Expands the chat panel, drags its grip to the largest and then the smallest size, collapses it, and drags it once more.
 *
 * Purpose: The size limits are the contract; a drag far past them must stop at them.
 * When to use: Once, from the first session.
 * Expected outcome: `SCENES.chatExpanded`, `SCENES.chatResized`, `SCENES.chatResizedMin`, and `SCENES.chatCompactResized`
 *   are recorded in that order. The panel is compact afterward, 100 px wider than its smallest width.
 * Exceptions: Throws a Playwright timeout when the panel is not shown or does not settle.
 */
async function runChatPanelScenes({ page, report, outDir, recordScene }) {
  await page.waitForSelector('#chat-panel:not([hidden])', { state: 'visible', timeout: SETTLE_MS.overlay * 4 });
  await toggleChatPanel(page, 'expanded');
  await recordScene(page, report, outDir, SCENES.chatExpanded);
  // To the window's top-left corner: the width and height stop at their largest.
  await dragChatGripTo(page, 8, 8);
  await parkPointer(page);
  await recordScene(page, report, outDir, SCENES.chatResized);
  // To the window's bottom-right corner: both stop at their smallest.
  const viewport = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
  await dragChatGripTo(page, viewport.w - 8, viewport.h - 8);
  await parkPointer(page);
  await recordScene(page, report, outDir, SCENES.chatResizedMin);
  await toggleChatPanel(page, 'compact');
  // Up and left on the compact panel: wider by 100 px, and still the bar alone.
  await dragGrip(page, '#chat-panel-grip', -100, -200);
  await parkPointer(page);
  await recordScene(page, report, outDir, SCENES.chatCompactResized);
}

module.exports = { runChatPanelScenes };
