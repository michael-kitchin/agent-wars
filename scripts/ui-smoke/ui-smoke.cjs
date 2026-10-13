/**
 * UI smoke run: starts the built app in Electron, plays one fixed scenario, and records screenshots plus layout checks.
 *
 * Purpose: Lets a layout change be verified the same way every time, with a report a reviewer can read and
 *   screenshots a person can compare.
 * When to use: `npm run ui:smoke` (it builds first). Pass `-- --label <name>` to choose the output folder.
 * Expected outcome: Writes `.test/ui-smoke/<label>/` with numbered PNG files and `report.json`, prints one line per
 *   check, and exits 0 only when no check failed and the page threw no uncaught error.
 * Exceptions: Exits 1 when the app cannot start, the scenario cannot be set up, or a check fails.
 *
 * The run uses a fresh, temporary Electron user-data folder (`AGENT_WARS_USER_DATA_DIR`), so it never reads or
 * changes the player's saved match, API key, or model choice, and it never calls a model.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { _electron: electron } = require('playwright-core');
const { SCENES, probePage, probeSelectors, runChecks } = require('./ui-smoke-checks.cjs');

/**
 * Repository root, two levels above this file.
 *
 * Purpose: The app is launched from the repository, and the output folder lives under it.
 * When to use: Launch arguments, the working directory, and the output path.
 * Expected outcome: An absolute path.
 * Exceptions: None.
 */
const REPO_ROOT = path.resolve(__dirname, '..', '..');

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
 * How long to let the page settle, in milliseconds.
 *
 * Purpose: Map tiles, canvas redraws, and the new-game overlay's own start-up work finish before a probe.
 * When to use: After a size change (`resize`), a click (`click`), the overlay opening (`overlay`), and a match
 *   start (`start`).
 * Expected outcome: Fixed waits; the checks do not depend on map tiles having loaded.
 * Exceptions: None.
 */
const SETTLE_MS = Object.freeze({ resize: 1500, click: 500, overlay: 2500, start: 2500 });

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
 * Purpose: The last scene checks the overlay opened from a match, not only at startup.
 * When to use: For the last scene.
 * Expected outcome: The Model tab is selected, New is clicked, and the overlay is open.
 * Exceptions: Throws a Playwright timeout when a control is missing or the overlay does not open.
 */
async function openNewGameOverlay(page) {
  await page.click('#openrouter-tab-model');
  await page.click('#openrouter-new-btn');
  await waitForNewGameOverlay(page);
  await page.waitForTimeout(SETTLE_MS.click);
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
 * Runs every scene in order.
 *
 * Purpose: The scene order is part of the contract with the checks. The match starts after the first scene, and
 *   the new-game overlay is opened last because it ends the match view.
 * When to use: Once, after the app window exists.
 * Expected outcome: One recorded scene per step below, in this order.
 * Exceptions: Propagates Playwright and scenario errors.
 */
async function runScenes(app, page, report, outDir) {
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

  await openNewGameOverlay(page);
  await recordScene(page, report, outDir, SCENES.newGameReopened);
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
 * Purpose: Owns the app's lifetime and the temporary user-data folder.
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
  let app = null;
  let exitCode = 1;
  try {
    app = await electron.launch({
      executablePath: require('electron'),
      args: [REPO_ROOT],
      cwd: REPO_ROOT,
      env: { ...process.env, AGENT_WARS_USER_DATA_DIR: userDataDir },
      timeout: 60000,
    });
    const page = await app.firstWindow();
    page.on('pageerror', (err) => report.pageErrors.push(err && err.message ? err.message : String(err)));
    page.on('console', (msg) => {
      if (msg.type() === 'error') report.consoleErrors.push(msg.text());
    });
    await page.waitForLoadState('domcontentloaded');
    await runScenes(app, page, report, outDir);
    exitCode = printReport(report, outDir);
  } catch (err) {
    report.notes.push(`run stopped: ${err && err.stack ? err.stack : String(err)}`);
    printReport(report, outDir);
    exitCode = 1;
  } finally {
    fs.writeFileSync(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    if (app) await app.close().catch(() => undefined);
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
