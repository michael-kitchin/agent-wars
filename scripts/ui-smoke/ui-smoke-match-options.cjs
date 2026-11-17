/**
 * The UI smoke scenes for Game Options opened from the top bar's settings button during a match.
 *
 * Purpose: The settings button opens Game Options as a centered dialog over the match, and Cancel must put the
 *   popover back the way the new-game screen expects it. These scenes check both without changing a setting.
 * When to use: From the first session in `ui-smoke.cjs`, right after the charts dialog closes, while the match is in
 *   world-map planning with nothing selected and no other dialog open.
 * Expected outcome: Two recorded scenes: the dialog open, then the dialog closed with Cancel. Focus is cleared after
 *   the second, so the scenes after it start as they did before these were added.
 * Exceptions: Throws a Playwright timeout when the dialog does not open or close.
 */
'use strict';

const { SCENES, SETTLE_MS } = require('./ui-smoke-scenes.cjs');
const { parkPointer } = require('./ui-smoke-page.cjs');

/**
 * Opens Game Options from the settings button, records it, closes it with Cancel, and records that.
 *
 * Purpose: The dialog reads the live match before it shows, so each step waits on the popover's own state, not on a
 *   fixed time.
 * When to use: Once, from the first session, during world-map planning.
 * Expected outcome: `SCENES.matchOptionsOpen` and `SCENES.matchOptionsClosed` are recorded in that order. No setting is
 *   applied, and focus is not left on the settings button.
 * Exceptions: Throws a Playwright timeout when the popover does not reach the awaited state within `SETTLE_MS.overlay` x 4.
 */
async function runMatchOptionsScenes({ page, report, outDir, recordScene }) {
  const timeout = SETTLE_MS.overlay * 4;
  await page.click('#topbar-settings-btn');
  await parkPointer(page);
  await page.waitForSelector('#new-game-options-popover[data-mode="match"]', { state: 'visible', timeout });
  await page.waitForTimeout(SETTLE_MS.click);
  await recordScene(page, report, outDir, SCENES.matchOptionsOpen);
  await page.click('#match-options-cancel');
  await parkPointer(page);
  await page.waitForFunction(() => {
    const popover = document.getElementById('new-game-options-popover');
    return popover !== null && popover.hidden && !popover.hasAttribute('data-mode');
  }, null, { timeout });
  await page.waitForTimeout(SETTLE_MS.click);
  await recordScene(page, report, outDir, SCENES.matchOptionsClosed);
  // Closing puts focus on the settings button, and a focused control shows its tip. Clear it for the scenes after.
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
}

module.exports = { runMatchOptionsScenes };
