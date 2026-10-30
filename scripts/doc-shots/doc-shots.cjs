/**
 * Documentation screenshot run: starts the built app in Electron and regenerates the images `doc/how-to-play.md` links.
 *
 * Purpose: The guide's pictures can be retaken after a UI change with one command, the same way every time.
 * When to use: `npm run doc:shots` (it builds first). Pass `-- --only tokens|setup|match`, repeatable, to run some groups.
 * Expected outcome: Writes PNG files straight into `doc/media/` and prints one `WROTE` or `SKIP` line per image, then a
 *   summary. A skipped image keeps its old file. Exits 0 only when nothing was skipped and every group finished.
 * Exceptions: Exits 1 when the app cannot start, the display is scaled, a group stops, or any image is skipped.
 *
 * The run uses a fresh, temporary Electron user-data folder (`AGENT_WARS_USER_DATA_DIR`), so it never reads or changes
 * the player's saved match, API key, or model choice, and it never calls a model.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { REPO_ROOT, editSavedMatch, launchApp } = require('../ui-smoke/ui-smoke-session.cjs');
const { waitForNewGameOverlay } = require('../ui-smoke/ui-smoke-new-game.cjs');
const { setViewport } = require('../ui-smoke/ui-smoke-page.cjs');
const { SETTLE_MS } = require('../ui-smoke/ui-smoke-scenes.cjs');
const { MATCH_VIEWPORT, skipShot } = require('./doc-shots-capture.cjs');
const { ECONOMY_SHOTS, writeEconomyShots } = require('./doc-shots-economy.cjs');
const { economyEdit } = require('./doc-shots-edits.cjs');
const { writeOrderShots } = require('./doc-shots-orders.cjs');
const { writeSetupShots } = require('./doc-shots-setup.cjs');
const { writeTokenImages } = require('./doc-shots-tokens.cjs');

const { GLOBAL_GAME_MAP } = require(path.join(REPO_ROOT, 'dist', 'shared', 'activeGameMap.js'));

/**
 * Electron switches for every session of the run.
 *
 * Purpose: At a device scale of 1, image pixels equal CSS pixels, so a crop's size is the image's size.
 * When to use: Every `launchApp` call in this run.
 * Expected outcome: The window renders at scale 1 on any display.
 * Exceptions: None.
 */
const LAUNCH_OPTIONS = Object.freeze({ extraArgs: Object.freeze(['--force-device-scale-factor=1']) });

/**
 * The groups of the run, in the order they run.
 *
 * Purpose: `setup` must run before `match`: `match` starts its scenario from the Global tab that `setup` leaves, and
 *   `match` closes the app.
 * When to use: Only by `readGroups` and `main`.
 * Expected outcome: Each group is `{ name, run(session, report, context) }`. `context.holder.session` is the open
 *   session, which a group that relaunches the app replaces, and `context.openSession()` launches on the run's folder.
 * Exceptions: None.
 */
const GROUPS = Object.freeze([
  { name: 'tokens', run: (session, report) => writeTokenImages(session.page, report) },
  { name: 'setup', run: (session, report) => writeSetupShots(session.app, session.page, report) },
  { name: 'match', run: (session, report, context) => writeMatchShots(session, report, context) },
]);

/**
 * Waits until a reopened match is back in world-map planning.
 *
 * Purpose: The second session starts from the saved match, which opens straight into planning.
 * When to use: After relaunching on the run's folder.
 * Expected outcome: The new-game overlay is hidden and the top bar's phase ends with `· Planning`.
 * Exceptions: Throws a Playwright timeout after 60 seconds.
 */
async function waitForReopenedPlanning(page) {
  await page.waitForFunction(() => document.getElementById('game-over-overlay')?.classList.contains('hidden')
    && /· Planning$/.test(document.getElementById('topbar-turn-phase')?.textContent || ''), null, { timeout: 60000 });
}

/**
 * Closes the app, applies the economy edit to the saved match, and reopens it in planning.
 *
 * Purpose: The second session's pictures need a state that play cannot reach on cue.
 * When to use: After the first session's shots, with the state they returned.
 * Expected outcome: Returns the edit. `context.holder.session` is the reopened session at the match viewport.
 * Exceptions: Throws when the edit cannot be worked out or applied, or the match does not reopen.
 */
async function reopenWithEconomyEdit(state, context) {
  const edit = economyEdit(state, GLOBAL_GAME_MAP.rules);
  await context.holder.session.app.close();
  context.holder.session = null;
  await editSavedMatch(context.userDataDir, edit.statements);
  context.holder.session = await context.openSession();
  const { app, page } = context.holder.session;
  if (!(await setViewport(app, page, MATCH_VIEWPORT))) throw new Error('the window did not take the match size');
  await waitForReopenedPlanning(page);
  await page.waitForTimeout(SETTLE_MS.start);
  return edit;
}

/**
 * Takes every match shot over two sessions.
 *
 * Purpose: The `match` group. The first session starts the scenario and takes the order and save/load shots. The
 *   second reopens the match after `economyEdit` and takes the economy and missile shots.
 * When to use: Only through `GROUPS`, after the `setup` group when both run.
 * Expected outcome: One `WROTE` or `SKIP` line per match image. When the edit or the relaunch fails, every
 *   second-session image is skipped and no further session starts.
 * Exceptions: Throws when the first match cannot start.
 */
async function writeMatchShots(session, report, context) {
  const state = await writeOrderShots(session.app, session.page, report);
  let edit;
  try {
    edit = await reopenWithEconomyEdit(state, context);
  } catch (err) {
    for (const fileName of ECONOMY_SHOTS) skipShot(report, fileName, err && err.message ? err.message : String(err));
    return;
  }
  await writeEconomyShots(context.holder.session.page, report, edit);
}

/**
 * Reads the `--only <group>` flags from the command line.
 *
 * Purpose: A reviewer can retake one group without waiting for the whole run.
 * When to use: Once at start-up.
 * Expected outcome: The groups to run, in `GROUPS` order. With no flag, every group.
 * Exceptions: Throws `unknown group` for a name not in `GROUPS`, or a flag with no name.
 */
function readGroups(argv) {
  const wanted = new Set();
  argv.forEach((arg, index) => {
    if (arg !== '--only') return;
    const name = argv[index + 1];
    if (!GROUPS.some((group) => group.name === name)) throw new Error(`unknown group: ${name}`);
    wanted.add(name);
  });
  return wanted.size === 0 ? [...GROUPS] : GROUPS.filter((group) => wanted.has(group.name));
}

/**
 * Stops the run when the window is scaled.
 *
 * Purpose: On a scaled display a crop in CSS pixels would not match the image's pixels.
 * When to use: After each launch, before any shot.
 * Expected outcome: Resolves when `window.devicePixelRatio` is 1.
 * Exceptions: Throws, naming the ratio, otherwise.
 */
async function requireUnscaledWindow(page) {
  const ratio = await page.evaluate(() => window.devicePixelRatio);
  if (ratio !== 1) throw new Error(`the window's device pixel ratio is ${ratio}, not 1`);
}

/**
 * Starts the app on the run's folder and waits until it can take shots.
 *
 * Purpose: The first launch and any relaunch need the same switches and the same scale check.
 * When to use: At the start of the run, and by a group that closes and reopens the app.
 * Expected outcome: `{ app, page }` with the window unscaled.
 * Exceptions: Throws when the app cannot start or the window is scaled.
 */
async function openSession(userDataDir, report) {
  const session = await launchApp(userDataDir, report, LAUNCH_OPTIONS);
  await requireUnscaledWindow(session.page);
  return session;
}

/**
 * Prints the summary line and returns the exit code.
 *
 * Purpose: The terminal output is what the reviewer reads.
 * When to use: Once, at the end.
 * Expected outcome: Notes and page errors, then `doc-shots: N written, M skipped`. Exit code 1 when anything was
 *   skipped or a group stopped.
 * Exceptions: None.
 */
function printSummary(report) {
  for (const note of report.notes) console.log(`NOTE ${note}`);
  for (const err of report.pageErrors) console.log(`PAGE-ERROR ${err}`);
  console.log(`doc-shots: ${report.written.length} written, ${report.skipped.length} skipped`);
  return report.skipped.length === 0 && !report.stopped ? 0 : 1;
}

/**
 * Entry point.
 *
 * Purpose: Owns the app's lifetime and the temporary user-data folder for every group.
 * When to use: Run by `npm run doc:shots`.
 * Expected outcome: The app is closed and the temporary folder removed even when a group fails.
 * Exceptions: Exits 1 on any failure.
 */
async function main() {
  const report = { written: [], skipped: [], notes: [], pageErrors: [], consoleErrors: [], stopped: false };
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-wars-doc-shots-'));
  const holder = { session: null };
  let exitCode = 1;
  try {
    const groups = readGroups(process.argv.slice(2));
    holder.session = await openSession(userDataDir, report);
    await waitForNewGameOverlay(holder.session.page);
    const context = { holder, userDataDir, openSession: () => openSession(userDataDir, report) };
    for (const group of groups) await group.run(holder.session, report, context);
    exitCode = printSummary(report);
  } catch (err) {
    report.stopped = true;
    report.notes.push(`run stopped: ${err && err.stack ? err.stack : String(err)}`);
    printSummary(report);
    exitCode = 1;
  } finally {
    if (holder.session) await holder.session.app.close().catch(() => undefined);
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
    } catch (err) {
      // A file still held open by the closing app must not turn a good run into a failure.
      console.log(`NOTE could not remove the temporary user-data folder ${userDataDir}: ${err && err.message ? err.message : String(err)}`);
    }
  }
  process.exit(exitCode);
}

main();
