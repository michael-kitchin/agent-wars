/**
 * UI smoke run: starts the built app in Electron, plays fixed scenarios over three sessions, and records screenshots
 * plus layout checks.
 *
 * Purpose: Lets a layout change be verified the same way every time, with a report a reviewer can read and
 *   screenshots a person can compare.
 * When to use: `npm run ui:smoke` (it builds first). Pass `-- --label <name>` to choose the output folder.
 * Expected outcome: Writes `.test/ui-smoke/<label>/` with numbered PNG files and `report.json`, prints one line per
 *   check, and exits 0 only when no check failed and the page threw no uncaught error.
 * Exceptions: Exits 1 when the app cannot start, the scenario cannot be set up, or a check fails.
 *
 * The run uses a fresh, temporary Electron user-data folder (`AGENT_WARS_USER_DATA_DIR`), so it never reads or
 * changes the player's saved match, API key, or model choice, and it never calls a model. The three sessions share
 * that folder: the first plays a new global match, the second reopens it with a hex both sides hold, queues an order
 * in a battle there, and starts a regional match, and the third reopens that match after the run marks it as lost.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { SCENES, probePage, probeSelectors, runChecks } = require('./ui-smoke-checks.cjs');
const {
  LAND_UNIT_TYPES,
  captureMainMap,
  contestedHexEdit,
  enterBattleAt,
  queueBattleMarch,
  queueLoneUnitMarch,
  readGameState,
  selectHumanStack,
  selectLoneBattleUnit,
  selectLoneUnit,
} = require('./ui-smoke-map.cjs');
const { FINISHED_MATCH_EDIT, REPO_ROOT, editSavedMatch, launchApp } = require('./ui-smoke-session.cjs');

/**
 * Window sizes for the strategic scene, in CSS pixels.
 *
 * Purpose: The layout must hold at the common sizes and at the app's minimum window size.
 * When to use: The strategic scene runs once per size. Every other scene uses the first size.
 * Expected outcome: 1280 x 720, 1920 x 1080, then the 800 x 600 minimum.
 * Exceptions: None.
 */
const VIEWPORTS = Object.freeze([
  { w: 1280, h: 720 },
  { w: 1920, h: 1080 },
  { w: 800, h: 600 },
]);

/**
 * The fixed scenario, as option values in the new-game overlay.
 *
 * Purpose: Every run shows the same match, so checks can compare known values.
 * When to use: Only by `startScenarioMatch`.
 * Expected outcome: Southern Europe against Northern Africa, a small game, starting in September.
 * Exceptions: None.
 */
const SCENARIO = Object.freeze({
  humanRegion: 'Southern Europe',
  aiRegion: 'Northern Africa',
  startMonth: '9',
  gameSize: 'small',
});

/**
 * The fixed regional scenario, as option values on the new-game overlay's Regional tab.
 *
 * Purpose: The regional scenes always show the same region and sides, so their checks can compare known values.
 * When to use: Only by `startRegionalMatch`.
 * Expected outcome: Southern Mexico and the isthmus against NE Mexico and the Bajio in Central America, a small game,
 *   starting in April.
 * Exceptions: None.
 */
const REGIONAL_SCENARIO = Object.freeze({
  region: 'central_america',
  humanSide: 'southern_mexico_isthmus',
  aiSide: 'ne_mexico_bajio',
  startMonth: '4',
  gameSize: 'small',
});

/**
 * The window size of the small-window scene: the app's minimum.
 *
 * Purpose: The console's contents and the selection panel must still fit there.
 * When to use: The small-window scene.
 * Expected outcome: The last entry of `VIEWPORTS`.
 * Exceptions: None.
 */
const SMALL_WINDOW = VIEWPORTS[VIEWPORTS.length - 1];

/**
 * How long to let the page settle, in milliseconds.
 *
 * Purpose: Map tiles, canvas redraws, and the new-game overlay's own start-up work finish before a probe.
 * When to use: After a size change (`resize`), a click (`click`), the overlay opening (`overlay`), a match start
 *   (`start`), and while the pointer rests on a control until its tip shows (`tip`, longer than the one-second dwell).
 * Expected outcome: Fixed waits; the checks do not depend on map tiles having loaded.
 * Exceptions: None.
 */
const SETTLE_MS = Object.freeze({ resize: 1500, click: 500, overlay: 2500, start: 2500, tip: 1500 });

/**
 * Reads `--label <name>` from the command line.
 *
 * Purpose: Keeps each run's output in its own folder, so an earlier run can be compared with a later one.
 * When to use: Once at start-up.
 * Expected outcome: The label, or `latest` when none is given. Only letters, digits, dots, dashes, and underscores are kept.
 * Exceptions: None.
 */
function readLabel(argv) {
  const index = argv.indexOf('--label');
  const raw = index >= 0 && argv[index + 1] ? argv[index + 1] : 'latest';
  const label = raw.replace(/[^A-Za-z0-9._-]/g, '');
  return label || 'latest';
}

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
 * Waits for the new-game overlay to be open.
 *
 * Purpose: Both the first start and a new game opened from the match end on this overlay.
 * When to use: After launch, and after opening the overlay from the match.
 * Expected outcome: Resolves once `#game-over-overlay` is in the page without the `hidden` class.
 * Exceptions: Throws a Playwright timeout after 60 seconds.
 */
async function waitForNewGameOverlay(page) {
  await page.waitForFunction(() => {
    const overlay = document.getElementById('game-over-overlay');
    return overlay !== null && !overlay.classList.contains('hidden');
  }, null, { timeout: 60000 });
}

/**
 * Chooses the fixed scenario on the new-game overlay and starts the match.
 *
 * Purpose: Every run must show the same match so checks can compare known values.
 * When to use: Once, while the startup overlay is open.
 * Expected outcome: The overlay closes with Southern Europe against Northern Africa, a small game, starting in September.
 * Exceptions: Throws when a choice does not hold or the match does not start within 60 seconds.
 */
async function startScenarioMatch(page) {
  await page.waitForFunction((region) => {
    const select = document.getElementById('new-game-human-region-select');
    return select !== null && Array.from(select.options).some((o) => o.value === region || o.textContent.trim() === region);
  }, SCENARIO.humanRegion, { timeout: 60000 });
  // The overlay draws random homes and a random month after its lists load; let that finish first.
  await page.waitForTimeout(SETTLE_MS.overlay);
  await page.click('#new-game-tab-global');
  await page.selectOption('#new-game-human-region-select', SCENARIO.humanRegion);
  await page.selectOption('#new-game-ai-region-select', SCENARIO.aiRegion);
  await page.selectOption('#new-game-start-month', SCENARIO.startMonth);
  await page.selectOption('#new-game-size-select', SCENARIO.gameSize);
  await page.waitForTimeout(SETTLE_MS.click);
  const chosen = await page.evaluate(() => ({
    human: document.getElementById('new-game-human-region-select').value,
    ai: document.getElementById('new-game-ai-region-select').value,
    month: document.getElementById('new-game-start-month').value,
    size: document.getElementById('new-game-size-select').value,
  }));
  if (chosen.month !== SCENARIO.startMonth || chosen.size !== SCENARIO.gameSize
    || !chosen.human.includes(SCENARIO.humanRegion) || !chosen.ai.includes(SCENARIO.aiRegion)) {
    throw new Error(`scenario choices did not hold: ${JSON.stringify(chosen)}`);
  }
  await page.click('#new-game-btn');
  await page.waitForFunction(() => document.getElementById('game-over-overlay').classList.contains('hidden'), null, { timeout: 60000 });
  await page.waitForTimeout(SETTLE_MS.start);
}

/**
 * Opens the new-game overlay from the running match, the way a player would.
 *
 * Purpose: One scene checks the overlay opened from a match, not only at startup, and the regional match starts from it.
 * When to use: In the second session, before the regional match.
 * Expected outcome: The game menu is opened, New game is clicked, and the overlay is open.
 * Exceptions: Throws a Playwright timeout when a control is missing or the overlay does not open.
 */
async function openNewGameOverlay(page) {
  await page.click('#game-menu-btn');
  await page.click('#openrouter-new-btn');
  await waitForNewGameOverlay(page);
  await page.waitForTimeout(SETTLE_MS.click);
}

/**
 * Moves the pointer to empty space in the top bar.
 *
 * Purpose: After a click the pointer would rest on a control, and that control's tip would show up in the next screenshot.
 * When to use: After each click in a scene, and after a scene that shows a tip.
 * Expected outcome: The pointer is over the top bar's spacer, which has no tip and no click action.
 * Exceptions: Throws when the top bar has no spacer.
 */
async function parkPointer(page) {
  const box = await page.locator('#app-topbar .topbar-spacer').boundingBox();
  if (!box) throw new Error('the top bar spacer is not on screen');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
}

/**
 * Probes, checks, and photographs the page for one scene.
 *
 * Purpose: Every scene produces the same three things.
 * When to use: After the scene's clicks or resize have settled.
 * Expected outcome: Appends the scene's results to `report.results` and writes `<NN>-<scene>.png`.
 * Exceptions: None from the checks; Playwright errors propagate to the caller.
 */
async function recordScene(page, report, outDir, sceneName) {
  const probe = await page.evaluate(probePage, probeSelectors());
  for (const result of runChecks(sceneName, probe)) report.results.push({ scene: sceneName, ...result });
  report.sceneCount += 1;
  const fileName = `${String(report.sceneCount).padStart(2, '0')}-${sceneName.replace('@', '-')}.png`;
  await page.screenshot({ path: path.join(outDir, fileName) });
  report.screenshots.push(fileName);
}

/**
 * Chooses the fixed regional scenario on the open new-game overlay and starts the match.
 *
 * Purpose: The regional scenes check the console on a map other than the world map.
 * When to use: While the new-game overlay is open.
 * Expected outcome: The overlay closes with `REGIONAL_SCENARIO`'s region and sides.
 * Exceptions: Throws when a choice does not hold or the match does not start within 90 seconds.
 */
async function startRegionalMatch(page) {
  await page.click('#new-game-tab-regional');
  await page.waitForTimeout(SETTLE_MS.click);
  await page.selectOption('#new-game-region-select', REGIONAL_SCENARIO.region);
  await page.waitForTimeout(SETTLE_MS.click);
  await page.selectOption('#new-game-human-side-select', REGIONAL_SCENARIO.humanSide);
  await page.selectOption('#new-game-ai-side-select', REGIONAL_SCENARIO.aiSide);
  await page.selectOption('#new-game-start-month', REGIONAL_SCENARIO.startMonth);
  await page.selectOption('#new-game-size-select', REGIONAL_SCENARIO.gameSize);
  await page.waitForTimeout(SETTLE_MS.click);
  const chosen = await page.evaluate(() => ({
    region: document.getElementById('new-game-region-select').value,
    human: document.getElementById('new-game-human-side-select').value,
    ai: document.getElementById('new-game-ai-side-select').value,
  }));
  if (chosen.region !== REGIONAL_SCENARIO.region || chosen.human !== REGIONAL_SCENARIO.humanSide || chosen.ai !== REGIONAL_SCENARIO.aiSide) {
    throw new Error(`regional choices did not hold: ${JSON.stringify(chosen)}`);
  }
  await page.click('#new-game-btn');
  await page.waitForFunction(() => document.getElementById('game-over-overlay').classList.contains('hidden'), null, { timeout: 90000 });
  await page.waitForTimeout(SETTLE_MS.start);
}

/**
 * Runs the first session: a new match, the frame scenes, the console scenes, and the small window.
 *
 * Purpose: The scene order is part of the contract with the checks. The match starts after the first scene. Scenes
 *   that select units or queue orders come after the frame scenes, so the frame screenshots show an untouched match.
 *   The session ends with the Orders scene's march still queued, which the reopened match must still show.
 * When to use: Once, on a fresh user-data folder.
 * Expected outcome: One recorded scene per step below, in this order. Returns the game state at the end.
 * Exceptions: Propagates Playwright and scenario errors.
 */
async function runFirstSession(app, page, report, outDir) {
  const first = VIEWPORTS[0];
  if (!(await setViewport(app, page, first))) report.notes.push(`could not size the page to ${first.w}x${first.h}`);
  await waitForNewGameOverlay(page);
  await page.waitForTimeout(SETTLE_MS.resize);
  await recordScene(page, report, outDir, SCENES.newGameStartup);

  await startScenarioMatch(page);
  for (const size of VIEWPORTS) {
    if (!(await setViewport(app, page, size))) {
      report.results.push({ scene: `${SCENES.strategic}@${size.w}x${size.h}`, check: 'viewport-size', status: 'FAIL', detail: 'the page did not take this size' });
      continue;
    }
    await page.waitForTimeout(SETTLE_MS.resize);
    await recordScene(page, report, outDir, `${SCENES.strategic}@${size.w}x${size.h}`);
  }
  await setViewport(app, page, first);
  await page.waitForTimeout(SETTLE_MS.resize);

  await page.click('#console-tab-opponent');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.click);
  await recordScene(page, report, outDir, SCENES.opponentTab);
  await page.click('#console-tab-orders');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.click);

  // Ready sits at the window's bottom-right corner, so its tip has to open up and to the left.
  await page.hover('#console-footer .control-tooltip-host');
  await page.waitForTimeout(SETTLE_MS.tip);
  await recordScene(page, report, outDir, SCENES.readyTip);
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.click);

  await page.click('#console-collapse-btn');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.resize);
  await recordScene(page, report, outDir, SCENES.consoleCollapsed);
  await page.click('#console-tab-orders');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.resize);
  await recordScene(page, report, outDir, SCENES.consoleExpandedAgain);

  await page.click('#game-menu-btn');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.click);
  await recordScene(page, report, outDir, SCENES.gameMenuOpen);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(SETTLE_MS.click);
  await recordScene(page, report, outDir, SCENES.gameMenuEscape);
  await page.click('#game-menu-btn');
  await page.waitForTimeout(SETTLE_MS.click);
  // Empty top-bar space is outside the menu, and a click there does nothing else.
  await page.click('#app-topbar .topbar-spacer');
  await page.waitForTimeout(SETTLE_MS.click);
  await recordScene(page, report, outDir, SCENES.gameMenuOutside);

  // Queue a one-hex march with the lone armor unit, then select it again from its row in the Orders tab.
  await captureMainMap(page);
  await queueLoneUnitMarch(page);
  await page.click('#pending-orders-list .console-order-select');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.click);
  await recordScene(page, report, outDir, SCENES.ordersQueued);

  await page.click('#selection-panel-close');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.click);
  await recordScene(page, report, outDir, SCENES.selectionCleared);

  await selectHumanStack(page);
  await parkPointer(page);
  await recordScene(page, report, outDir, SCENES.selectionStack);

  // Aim an air strike from the selection panel, record it, then stop aiming.
  await selectLoneUnit(page, await readGameState(page), 'air');
  await page.click('#ranged-attack-btn');
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.click);
  await recordScene(page, report, outDir, SCENES.strikeAiming);
  await page.click('#air-strike-cancel-btn');

  // At the minimum window size, select the stack; the selection panel must stay on the map.
  await setViewport(app, page, SMALL_WINDOW);
  await page.waitForTimeout(SETTLE_MS.resize);
  await selectHumanStack(page);
  await parkPointer(page);
  await recordScene(page, report, outDir, SCENES.smallWindow);

  await setViewport(app, page, first);
  await page.waitForTimeout(SETTLE_MS.resize);
  return readGameState(page);
}

/**
 * Runs the second session: the reopened match, a battle on the hex both sides now hold, and a new regional match.
 *
 * Purpose: Checks what a player sees after restarting the app, inside a battle, and on a regional map.
 * When to use: After `runFirstSession` and the saved-match change from `contestedHexEdit`, on the same folder.
 * Expected outcome: One recorded scene per step below, in this order.
 * Exceptions: Propagates Playwright and scenario errors.
 */
async function runReopenedSession(app, page, report, outDir, battleHex) {
  await setViewport(app, page, VIEWPORTS[0]);
  await page.waitForFunction(() => document.getElementById('game-over-overlay')?.classList.contains('hidden')
    && /· Planning$/.test(document.getElementById('topbar-turn-phase')?.textContent || ''), null, { timeout: 60000 });
  await page.waitForTimeout(SETTLE_MS.start);
  await parkPointer(page);
  await recordScene(page, report, outDir, SCENES.matchReopened);

  await captureMainMap(page);
  await enterBattleAt(page, battleHex);
  await parkPointer(page);
  await recordScene(page, report, outDir, SCENES.battleStart);
  const unit = await selectLoneBattleUnit(page);
  await parkPointer(page);
  await recordScene(page, report, outDir, SCENES.battleSelection);
  await queueBattleMarch(page, unit);
  await parkPointer(page);
  await page.waitForTimeout(SETTLE_MS.click);
  await recordScene(page, report, outDir, SCENES.battleOrders);

  await openNewGameOverlay(page);
  await recordScene(page, report, outDir, SCENES.newGameReopened);
  await startRegionalMatch(page);
  await parkPointer(page);
  await recordScene(page, report, outDir, SCENES.regionalStart);
  await captureMainMap(page);
  await selectLoneUnit(page, await readGameState(page), LAND_UNIT_TYPES);
  await parkPointer(page);
  await recordScene(page, report, outDir, SCENES.regionalSelection);
}

/**
 * Runs the last session: the reopened match after it was marked as lost.
 *
 * Purpose: A finished match must open on the game-over screen, with the match's chrome out of the way.
 * When to use: After `runReopenedSession` and `FINISHED_MATCH_EDIT`, on the same folder.
 * Expected outcome: One recorded scene.
 * Exceptions: Propagates Playwright errors.
 */
async function runFinishedMatchSession(app, page, report, outDir) {
  await setViewport(app, page, VIEWPORTS[0]);
  await waitForNewGameOverlay(page);
  await page.waitForTimeout(SETTLE_MS.overlay);
  await recordScene(page, report, outDir, SCENES.gameOverReopened);
}

/**
 * Prints the report and returns the exit code.
 *
 * Purpose: The terminal output is what the implementing agent pastes back.
 * When to use: Once, at the end.
 * Expected outcome: One line per result, then a summary line. Exit code 1 when any check failed or the page threw.
 * Exceptions: None.
 */
function printReport(report, outDir) {
  for (const r of report.results) {
    console.log(`${r.status.padEnd(4)} ${r.scene} :: ${r.check}${r.detail ? ` :: ${r.detail}` : ''}`);
  }
  for (const note of report.notes) console.log(`NOTE ${note}`);
  for (const err of report.pageErrors) console.log(`PAGE-ERROR ${err}`);
  const passed = report.results.filter((r) => r.status === 'PASS').length;
  const failed = report.results.length - passed;
  console.log(`ui-smoke ${report.label}: ${passed} passed, ${failed} failed, ${report.pageErrors.length} page errors, ${report.screenshots.length} screenshots in ${outDir}`);
  return failed === 0 && report.pageErrors.length === 0 ? 0 : 1;
}

/**
 * Entry point.
 *
 * Purpose: Owns the app's lifetime and the temporary user-data folder. The three sessions share the folder, so each
 *   one reopens the match the previous one left, changed as the scenes need.
 * When to use: Run by `npm run ui:smoke`.
 * Expected outcome: The app is closed and the temporary folder removed even when a scene fails.
 * Exceptions: Exits 1 on any failure.
 */
async function main() {
  const label = readLabel(process.argv);
  const outDir = path.join(REPO_ROOT, '.test', 'ui-smoke', label);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-wars-ui-smoke-'));
  const report = { label, startedAt: new Date().toISOString(), sceneCount: 0, results: [], screenshots: [], notes: [], pageErrors: [], consoleErrors: [] };
  let session = null;
  let exitCode = 1;
  try {
    session = await launchApp(userDataDir, report);
    const lastState = await runFirstSession(session.app, session.page, report, outDir);
    await session.app.close();
    session = null;
    const contested = contestedHexEdit(lastState);
    await editSavedMatch(userDataDir, contested.statements);

    session = await launchApp(userDataDir, report);
    await runReopenedSession(session.app, session.page, report, outDir, contested.h3Index);
    await session.app.close();
    session = null;
    await editSavedMatch(userDataDir, FINISHED_MATCH_EDIT);

    session = await launchApp(userDataDir, report);
    await runFinishedMatchSession(session.app, session.page, report, outDir);
    exitCode = printReport(report, outDir);
  } catch (err) {
    report.notes.push(`run stopped: ${err && err.stack ? err.stack : String(err)}`);
    printReport(report, outDir);
    exitCode = 1;
  } finally {
    fs.writeFileSync(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    if (session) await session.app.close().catch(() => undefined);
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
    } catch (err) {
      // A file still held open by the closing app must not turn a passing run into a failure.
      console.log(`NOTE could not remove the temporary user-data folder ${userDataDir}: ${err && err.message ? err.message : String(err)}`);
    }
  }
  process.exit(exitCode);
}

main();
