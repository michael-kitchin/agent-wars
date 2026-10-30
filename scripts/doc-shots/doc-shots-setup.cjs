/**
 * New-game screenshots for the guide: the global and regional setup previews.
 *
 * Purpose: The guide's Starting a Game section shows both tabs with two homes chosen and outlined on the map.
 * When to use: From `doc-shots.cjs`, in the `setup` group, while the new-game overlay is open and before any match starts.
 * Expected outcome: Writes `global-preview.png` and `regional-preview.png`, then leaves the Global tab selected.
 * Exceptions: A preview that cannot be set up is skipped by `runShot`; the old file stays.
 */
'use strict';

const { SETTLE_MS } = require('../ui-smoke/ui-smoke-scenes.cjs');
const { setSideHome } = require('../ui-smoke/ui-smoke-new-game.cjs');
const { parkPointer, setViewport } = require('../ui-smoke/ui-smoke-page.cjs');
const { runShot, waitForMapTiles } = require('./doc-shots-capture.cjs');

/**
 * The window size of the setup previews, in CSS pixels.
 *
 * Purpose: Wide enough that the setup panel and both outlined homes show side by side.
 * When to use: Both preview shots. The capture is the whole window.
 * Expected outcome: 1426 by 773.
 * Exceptions: None.
 */
const PREVIEW_VIEWPORT = Object.freeze({ w: 1426, h: 773 });

/**
 * The homes each preview chooses, as the visible labels of the side lists.
 *
 * Purpose: The captions name these homes.
 * When to use: Only by `writeSetupShots`.
 * Expected outcome: Eastern Asia against Southern Africa on the global map, and Japan against South & east China,
 *   Taiwan on the Eastern Asia regional map.
 * Exceptions: None.
 */
const PREVIEW_HOMES = Object.freeze({
  global: Object.freeze({ you: 'Eastern Asia', opponent: 'Southern Africa' }),
  regional: Object.freeze({ region: 'eastern_asia', you: 'Japan', opponent: 'South & east China, Taiwan' }),
});

/**
 * Finds the value of the list option a player would pick by its visible name.
 *
 * Purpose: Regional side values are group ids, not names, and a taken or abbreviated home adds text after the name.
 * When to use: Before `setSideHome`, with the side list's selector and the home's visible name.
 * Expected outcome: The value of the first option whose trimmed text is `label`, or starts with `label` followed by
 *   ` · ` or ` (`.
 * Exceptions: Throws when no option matches, or the list is missing.
 */
async function optionValueForLabel(page, selector, label) {
  const value = await page.$eval(selector, (el, wanted) => {
    const option = [...el.options].find((entry) => {
      const text = entry.textContent.trim();
      return text === wanted || text.startsWith(`${wanted} · `) || text.startsWith(`${wanted} (`);
    });
    return option ? option.value : null;
  }, label);
  if (value == null) throw new Error(`${selector} has no option named "${label}"`);
  return value;
}

/**
 * Waits until a side list offers a home with the given visible name.
 *
 * Purpose: The lists fill in after a tab or a region changes.
 * When to use: After clicking a tab or choosing a region.
 * Expected outcome: Resolves once the "You" list has an option named `label`.
 * Exceptions: Throws a Playwright timeout after 60 seconds.
 */
async function waitForHomeOption(page, label) {
  await page.waitForFunction((wanted) => {
    const select = document.querySelector('select[aria-label="You home"]');
    return select !== null && [...select.options].some((option) => option.textContent.trim().startsWith(wanted));
  }, label, { timeout: 60000 });
}

/**
 * Chooses both homes by their visible names.
 *
 * Purpose: Both previews choose two homes the same way.
 * When to use: After the side lists have filled in.
 * Expected outcome: "You" and "Opponent 1" show the named homes.
 * Exceptions: Throws when a home is missing or cannot be chosen.
 */
async function chooseHomes(page, homes) {
  await setSideHome(page, 'You', await optionValueForLabel(page, 'select[aria-label="You home"]', homes.you));
  await setSideHome(page, 'Opponent 1', await optionValueForLabel(page, 'select[aria-label="Opponent 1 home"]', homes.opponent));
}

/**
 * Lets the preview map settle and photographs the whole window.
 *
 * Purpose: The previews show the outlined homes on loaded map tiles, with no tip in the picture.
 * When to use: After both homes are chosen.
 * Expected outcome: A PNG buffer of the full window.
 * Exceptions: Throws when the map tiles do not load.
 */
async function capturePreview(page) {
  await page.waitForTimeout(SETTLE_MS.overlay);
  await waitForMapTiles(page);
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.click);
  return page.screenshot({ clip: { x: 0, y: 0, width: PREVIEW_VIEWPORT.w, height: PREVIEW_VIEWPORT.h } });
}

/**
 * Writes both setup previews.
 *
 * Purpose: The `setup` group of the screenshot run.
 * When to use: While the new-game overlay is open, before the `match` group.
 * Expected outcome: One `WROTE` or `SKIP` line per preview. The Global tab is selected afterwards, so the match group
 *   starts from it.
 * Exceptions: Throws when the window cannot be sized or the Global tab cannot be selected again.
 */
async function writeSetupShots(app, page, report) {
  if (!(await setViewport(app, page, PREVIEW_VIEWPORT))) throw new Error('the window did not take the preview size');
  await runShot(report, 'global-preview.png', async () => {
    await page.click('#new-game-tab-global');
    await waitForHomeOption(page, PREVIEW_HOMES.global.you);
    await chooseHomes(page, PREVIEW_HOMES.global);
    return capturePreview(page);
  });
  await runShot(report, 'regional-preview.png', async () => {
    await page.click('#new-game-tab-regional');
    await page.waitForTimeout(SETTLE_MS.click);
    await page.selectOption('#new-game-region-select', PREVIEW_HOMES.regional.region);
    await waitForHomeOption(page, PREVIEW_HOMES.regional.you);
    await page.waitForTimeout(SETTLE_MS.click);
    await chooseHomes(page, PREVIEW_HOMES.regional);
    return capturePreview(page);
  });
  await page.click('#new-game-tab-global');
  await page.waitForTimeout(SETTLE_MS.click);
}

module.exports = {
  writeSetupShots,
};
