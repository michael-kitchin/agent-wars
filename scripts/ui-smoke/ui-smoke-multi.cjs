/**
 * The UI smoke run's later scenes: four regional sides, three global sides, a knocked-out side, a four-side match,
 * standings, and Observe.
 *
 * Purpose: Keeps those scenes apart from the two-side sessions in `ui-smoke.cjs`.
 * When to use: After the finished-match session, on the same user-data folder, while that session's app is still open.
 * Expected outcome: The extra scenes are recorded, and the app is closed.
 * Exceptions: Propagates Playwright errors. Closes the app it still holds before the error leaves this module.
 */
'use strict';

const { SCENES, SETTLE_MS } = require('./ui-smoke-scenes.cjs');
const { clickStartGame, openNewGameOverlay, startObservedMatch, waitForNewGameOverlay } = require('./ui-smoke-new-game.cjs');
const { readGameState } = require('./ui-smoke-map.cjs');
const { editSavedMatch, launchApp } = require('./ui-smoke-session.cjs');

/**
 * The regional map used when a scene needs four homes.
 *
 * Purpose: Central America has four side groups, so four rows can each take one.
 * When to use: The four-side setup and the four-side match.
 * Expected outcome: The option value of `#new-game-region-select`.
 * Exceptions: None.
 */
const FOUR_SIDE_REGION = 'central_america';

/**
 * Marks the third AI seat knocked out and gives its units to Neutral.
 *
 * Purpose: The Reports scene needs a knockout and a neutral unit without playing one.
 * When to use: After an Observe match of three sides has been saved and the app is closed.
 * Expected outcome: Statements for `editSavedMatch`. The seat id is the third AI seat.
 * Exceptions: None.
 */
const KNOCKOUT_EDIT = Object.freeze([
  {
    sql: "UPDATE seats SET out_turn = 1, out_by = 'opponent', out_reasons = '[\"home_control\"]', place = 3 WHERE seat_id = 'opponent3'",
    params: [],
  },
  { sql: "UPDATE units SET player = 'neutral' WHERE player = 'opponent3'", params: [] },
]);

/**
 * Finishes a four-side match with one winner.
 *
 * Purpose: The standings scene needs places and an end reason, which play cannot reach on cue.
 * When to use: After the four-side match has been saved and the app is closed.
 * Expected outcome: The human seat is 4th, the first AI seat is the only winner, and the heading can be painted.
 * Exceptions: None.
 */
const STANDINGS_EDIT = Object.freeze([
  {
    sql: "UPDATE seats SET out_turn = 4, out_by = 'opponent', out_reasons = '[\"home_control\"]', place = 4 WHERE seat_id = 'human'",
    params: [],
  },
  { sql: "UPDATE seats SET place = 1 WHERE seat_id = 'opponent'", params: [] },
  {
    sql: "UPDATE seats SET out_turn = 2, out_by = 'opponent', out_reasons = '[\"no_city_hexes\"]', place = 3 WHERE seat_id = 'opponent2'",
    params: [],
  },
  {
    sql: "UPDATE seats SET out_turn = 1, out_by = 'opponent', out_reasons = '[\"home_cities_destroyed\"]', place = 2 WHERE seat_id = 'opponent3'",
    params: [],
  },
  { sql: "INSERT OR REPLACE INTO game_config (key, value) VALUES ('game_over', '1')", params: [] },
  { sql: "INSERT OR REPLACE INTO game_config (key, value) VALUES ('winner', 'opponent')", params: [] },
  { sql: "INSERT OR REPLACE INTO game_config (key, value) VALUES ('game_end_reason', 'last_side_standing')", params: [] },
]);

/**
 * Clicks Add another opponent until the side list has `count` rows.
 *
 * Purpose: The add button is the same control a player uses.
 * When to use: While the new-game overlay is open and fewer than `count` rows are showing.
 * Expected outcome: The side list has `count` rows.
 * Exceptions: Throws when the button is disabled before the list reaches `count`.
 */
async function addSidesUntil(page, count) {
  for (let guard = 0; guard < 6 && await page.locator('.new-game-side-row').count() < count; guard += 1) {
    const button = page.locator('#new-game-add-side-btn');
    if (await button.isDisabled()) {
      const tip = await page.locator('.new-game-add-side-host').getAttribute('data-control-tooltip');
      const got = await page.locator('.new-game-side-row').count();
      throw new Error(`cannot add a side (${got} of ${count}): ${tip}`);
    }
    await button.click();
    await page.waitForTimeout(SETTLE_MS.click);
  }
  const got = await page.locator('.new-game-side-row').count();
  if (got < count) throw new Error(`the side list stopped at ${got}, expected ${count}`);
}

/**
 * Removes AI rows until the side list has `count` rows.
 *
 * Purpose: Switching maps keeps the previous count, so a later scene has to drop rows.
 * When to use: While more than `count` rows are showing and at least one remove button is enabled.
 * Expected outcome: The side list has `count` rows.
 * Exceptions: Throws when a remove button is not available.
 */
async function removeSidesUntil(page, count) {
  for (let guard = 0; guard < 6 && await page.locator('.new-game-side-row').count() > count; guard += 1) {
    const button = page.locator('#new-game-side-rows .new-game-side-remove:not([disabled])').last();
    if (await button.count() === 0) throw new Error('no side can be removed');
    await button.click();
    await page.waitForTimeout(SETTLE_MS.click);
  }
}

/**
 * Selects Central America and fills four side rows.
 *
 * Purpose: The four-side scenes share one setup.
 * When to use: While the new-game overlay is open.
 * Expected outcome: The Regional tab shows four rows.
 * Exceptions: Throws when the region has fewer than four homes.
 */
async function prepareFourRegionalSides(page) {
  await page.click('#new-game-tab-regional');
  await page.waitForTimeout(SETTLE_MS.click);
  await page.selectOption('#new-game-region-select', FOUR_SIDE_REGION);
  await page.waitForFunction(() => document.querySelectorAll('select[aria-label="You home"] option').length >= 4, null, { timeout: 60000 });
  await page.waitForTimeout(SETTLE_MS.click);
  await addSidesUntil(page, 4);
}

/**
 * Shows the Global tab with three sides.
 *
 * Purpose: The three-side scene starts from whatever count the previous scene left.
 * When to use: While the new-game overlay is open.
 * Expected outcome: Three side rows on the Global tab.
 * Exceptions: Throws when rows cannot be added or removed.
 */
async function prepareThreeGlobalSides(page) {
  await page.click('#new-game-tab-global');
  await page.waitForTimeout(SETTLE_MS.click);
  await removeSidesUntil(page, 3);
  await addSidesUntil(page, 3);
}

/**
 * Closes the app, changes the saved match, and opens it again.
 *
 * Purpose: The knockout and the standings are written while nothing holds the database.
 * When to use: After the match those statements describe has been started.
 * Expected outcome: A new `{ app, page }` on the same folder, at `viewport`.
 * Exceptions: Propagates a failure to edit or launch. The previous app is closed first.
 */
async function reopenEditedMatch(ctx, app, statements) {
  await app.close();
  await editSavedMatch(ctx.userDataDir, statements);
  const session = await launchApp(ctx.userDataDir, ctx.report);
  if (!(await ctx.setViewport(session.app, session.page, ctx.viewport))) {
    ctx.report.notes.push(`could not size the page to ${ctx.viewport.w}x${ctx.viewport.h}`);
  }
  return session;
}

/**
 * Opens View as the way a player does, with the keyboard.
 *
 * Purpose: The Observe screenshot should show the list.
 * When to use: While View as is on screen. A mouse move after this can close the list.
 * Expected outcome: The View as select is focused and Alt+Down has been pressed.
 * Exceptions: Propagates a Playwright failure.
 */
async function openViewAs(page) {
  await page.focus('#topbar-view-as-select');
  await page.keyboard.press('Alt+ArrowDown');
  await page.waitForTimeout(SETTLE_MS.click);
}

/**
 * Records the several-side scenes and closes the app.
 *
 * Purpose: One pass after the two-side sessions, so those sessions stay in their own order.
 * When to use: `ui-smoke.cjs`, with the finished-match session's app still open. `ctx` carries that app and page,
 *   the user-data folder, the report, the output folder, the viewport, and the runner's scene helpers.
 * Expected outcome: Six scenes recorded. The app is closed, including when a later step throws.
 * Exceptions: Propagates Playwright and setup errors after closing the app.
 */
async function runMultiCommanderScenes(ctx) {
  let app = ctx.app;
  let page = ctx.page;
  try {
    if (!(await ctx.setViewport(app, page, ctx.viewport))) {
      ctx.report.notes.push(`could not size the page to ${ctx.viewport.w}x${ctx.viewport.h}`);
    }
    await prepareFourRegionalSides(page);
    await page.click('[aria-label="Opponent 1 commander"]');
    await page.waitForSelector('.commander-popover');
    await ctx.parkPointer(page);
    await ctx.recordScene(page, ctx.report, ctx.outDir, SCENES.newGameFourSides);

    await page.keyboard.press('Escape');
    await page.waitForSelector('.commander-popover', { state: 'detached' });
    await prepareThreeGlobalSides(page);
    await page.focus('select[aria-label="You home"]');
    await page.keyboard.press('Alt+ArrowDown');
    await page.waitForTimeout(SETTLE_MS.click);
    await ctx.recordScene(page, ctx.report, ctx.outDir, SCENES.newGameThreeSides);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(SETTLE_MS.click);
    if (!(await page.locator('#new-game-observe-only').isChecked())) await page.click('#new-game-observe-only');
    await page.waitForFunction(() => document.getElementById('new-game-observe-only')?.checked === true, null, { timeout: 10000 });
    await startObservedMatch(page, 120000);
    ({ app, page } = await reopenEditedMatch(ctx, app, KNOCKOUT_EDIT));
    await page.waitForFunction(() => (document.getElementById('topbar-sides')?.textContent || '').includes('Observing'), null, { timeout: 60000 });
    const knockedOut = await readGameState(page);
    const neutral = (knockedOut.units || []).filter((unit) => unit.player === 'neutral').length;
    if (neutral === 0) throw new Error('the knocked-out side left no neutral unit');
    ctx.report.notes.push(`knockout scene has ${neutral} neutral units`);
    await page.click('#console-tab-reports');
    await ctx.parkPointer(page);
    await page.waitForTimeout(SETTLE_MS.click);
    await ctx.recordScene(page, ctx.report, ctx.outDir, SCENES.matchKnockoutReports);

    await openNewGameOverlay(page);
    await prepareFourRegionalSides(page);
    await clickStartGame(page, 120000);
    await page.click('#console-tab-commanders');
    await ctx.parkPointer(page);
    await page.waitForTimeout(SETTLE_MS.click);
    await ctx.recordScene(page, ctx.report, ctx.outDir, SCENES.matchFourCommanders);

    ({ app, page } = await reopenEditedMatch(ctx, app, STANDINGS_EDIT));
    await waitForNewGameOverlay(page);
    await page.waitForTimeout(SETTLE_MS.overlay);
    await ctx.parkPointer(page);
    await ctx.recordScene(page, ctx.report, ctx.outDir, SCENES.standingsFour);

    await page.click('#new-game-tab-global');
    await page.waitForTimeout(SETTLE_MS.click);
    if (await page.locator('#new-game-observe-only').isChecked()) {
      await page.click('#new-game-observe-only');
      await page.waitForTimeout(SETTLE_MS.click);
    }
    await page.click('#new-game-observe-only');
    await page.waitForFunction(() => document.getElementById('new-game-observe-only')?.checked === true, null, { timeout: 10000 });
    await addSidesUntil(page, 4);
    await startObservedMatch(page, 120000);
    await openViewAs(page);
    await ctx.recordScene(page, ctx.report, ctx.outDir, SCENES.matchObserve);
  } finally {
    if (app) await app.close().catch(() => undefined);
  }
}

module.exports = { runMultiCommanderScenes };
