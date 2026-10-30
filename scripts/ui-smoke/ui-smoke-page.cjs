/**
 * Page helpers shared by the scripts that drive the built app: window size, pointer parking, and the wait for
 * world-map planning.
 *
 * Purpose: The UI smoke run and the documentation screenshot run size the window, keep tips out of their pictures,
 *   and wait out a played turn the same way.
 * When to use: From `ui-smoke.cjs` and `scripts/doc-shots/`, after the app's window has opened.
 * Expected outcome: Each helper resolves once the page shows its result.
 * Exceptions: Each helper documents its own.
 */
'use strict';

const { SETTLE_MS } = require('./ui-smoke-scenes.cjs');

/**
 * Sets the page to an exact CSS size and waits until the page reports it.
 *
 * Purpose: Screenshots and checks must describe the size they claim.
 * When to use: Before each sized scene.
 * Expected outcome: True when `innerWidth` and `innerHeight` match. Falls back to resizing the window's content
 *   area when viewport emulation does not take.
 * Exceptions: None; returns false when neither method reaches the size.
 */
async function setViewport(app, page, size) {
  const matches = async () => page.evaluate(([w, h]) => window.innerWidth === w && window.innerHeight === h, [size.w, size.h]);
  await page.setViewportSize({ width: size.w, height: size.h });
  await page.waitForTimeout(200);
  if (await matches()) return true;
  await app.evaluate(({ BrowserWindow }, s) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) win.setContentSize(s.w, s.h);
  }, size);
  await page.waitForTimeout(500);
  return matches();
}

/**
 * Moves the pointer to empty space in the top bar.
 *
 * Purpose: After a click the pointer would rest on a control, and that control's tip would show up in the next screenshot.
 * When to use: After each click in a scene, and after a scene that shows a tip.
 * Expected outcome: The pointer is over the top bar's spacer, or over the battle header's title while a battle is open.
 *   Neither has a tip or a click action.
 * Exceptions: Throws when neither is on screen.
 */
async function parkPointer(page) {
  const spacer = await page.locator('#app-topbar .topbar-spacer').boundingBox();
  const box = spacer ?? (await page.locator('#battle-header-place').boundingBox());
  if (!box) throw new Error('neither the top bar spacer nor the battle header title is on screen');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
}

/**
 * Waits until world-map planning is open again after a turn plays, skipping any offered battle.
 *
 * Purpose: A played turn can offer the tactical battles list; the run never fights from it, so it chooses Ignore,
 *   which resolves the fight as a player's Ignore does.
 * When to use: After Ready on the world map, and after leaving a battle.
 * Expected outcome: The battle header is gone, the top bar reads a world-map planning line, and Ready can be clicked.
 * Exceptions: Throws a Playwright timeout when planning does not return within `SETTLE_MS.turn`.
 */
async function waitForWorldPlanning(page) {
  const battlesList = '[role="dialog"][aria-label="Tactical battles"]';
  const deadline = Date.now() + SETTLE_MS.turn;
  while (Date.now() < deadline) {
    // In a battle the date block is hidden but still names the world-map turn, so the battle header must be gone too.
    const planning = await page.evaluate(() => !document.getElementById('app-topbar')?.classList.contains('topbar-battle')
      && /^Turn \d+(?: of \d+)? · Planning$/.test(document.getElementById('topbar-turn-phase')?.textContent || '')
      && document.getElementById('ready-btn')?.disabled === false);
    if (planning) return;
    if (await page.isVisible(battlesList)) await page.click(`${battlesList} button:has-text("Ignore")`);
    await page.waitForTimeout(SETTLE_MS.click);
  }
  throw new Error('world-map planning did not return after the turn');
}

module.exports = {
  parkPointer,
  setViewport,
  waitForWorldPlanning,
};
