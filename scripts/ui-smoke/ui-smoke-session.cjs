/**
 * Starts the app for the UI smoke run, and changes its saved match between launches.
 *
 * Purpose: The run plays more than one session on the same throwaway user-data folder, so a reopened match, a battle,
 *   and a finished match can be checked as a player would meet them.
 * When to use: From `ui-smoke.cjs`.
 * Expected outcome: Each launch returns the app and its window, with page errors collected in the run's report.
 * Exceptions: Launch and edit failures are thrown to the runner, which stops the run and reports them.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { _electron: electron } = require('playwright-core');

/**
 * Repository root, two levels above this file.
 *
 * Purpose: The app is launched from the repository, and the run's output folder lives under it.
 * When to use: Launch arguments, the working directory, and the output path.
 * Expected outcome: An absolute path.
 * Exceptions: None.
 */
const REPO_ROOT = path.resolve(__dirname, '..', '..');

/**
 * The saved match's file name inside the user-data folder, such as `game-baseline-v12.sqlite`.
 *
 * Purpose: The version in the name changes with the schema, so the file is found by pattern, not by a fixed name.
 * When to use: Only by `savedMatchFile`.
 * Expected outcome: Matches the name `src/main/gameDb.ts` gives the file.
 * Exceptions: None.
 */
const SAVED_MATCH_FILE = /^game-baseline-v\d+\.sqlite$/;

/**
 * The saved-match change that ends the match with the opponent as the winner.
 *
 * Purpose: The game-over scene needs a finished match, and play cannot finish one in a smoke run.
 * When to use: Pass to `editSavedMatch` before the last session.
 * Expected outcome: The reopened match opens on the game-over screen. With no end reason stored, the heading is
 *   "The match is over." The keys are the ones `src/main/gameDb/gameConfigKv.ts` writes when a match ends.
 * Exceptions: None.
 */
const FINISHED_MATCH_EDIT = Object.freeze([
  { sql: "INSERT OR REPLACE INTO game_config (key, value) VALUES ('game_over', '1')", params: [] },
  { sql: "INSERT OR REPLACE INTO game_config (key, value) VALUES ('winner', 'opponent')", params: [] },
]);

/**
 * Starts the built app on a user-data folder and waits for its window.
 *
 * Purpose: Every session of the run starts the same way, and every page error lands in the report.
 * When to use: Once per session. Pass the same folder to reopen the match the previous session left.
 * Expected outcome: `{ app, page }` once the window's document has loaded. Uncaught page errors are added to
 *   `report.pageErrors`, and console errors to `report.consoleErrors`.
 * Exceptions: Throws when the app does not start within 60 seconds.
 */
async function launchApp(userDataDir, report) {
  const app = await electron.launch({
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
  return { app, page };
}

/**
 * Finds the saved match's file in a user-data folder.
 *
 * Purpose: The edit must change the file the app reopens.
 * When to use: Only by `editSavedMatch`, after the app has closed.
 * Expected outcome: The file's absolute path.
 * Exceptions: Throws unless exactly one file matches `SAVED_MATCH_FILE`.
 */
function savedMatchFile(userDataDir) {
  const matches = fs.readdirSync(userDataDir).filter((name) => SAVED_MATCH_FILE.test(name));
  if (matches.length !== 1) throw new Error(`expected one saved match in ${userDataDir}, found ${matches.length}`);
  return path.join(userDataDir, matches[0]);
}

/**
 * How many times, and how far apart, the run tries to change the saved match.
 *
 * Purpose: On some systems the closed app's files stay locked for a moment after it exits.
 * When to use: Only by `editSavedMatch`.
 * Expected outcome: A few short retries before the run gives up.
 * Exceptions: None.
 */
const EDIT_ATTEMPTS = Object.freeze({ count: 5, delayMs: 1000 });

/**
 * Changes the saved match while the app is closed.
 *
 * Purpose: Sets up a state that play cannot reach on cue, such as a hex both sides hold or a finished match.
 * When to use: Between two sessions, after `app.close()` has returned. Only on the run's throwaway folder.
 * Expected outcome: Every statement runs in one transaction under Electron's own Node, which can load the SQLite
 *   module the smoke run built for Electron. A failed attempt is retried after a short wait.
 * Exceptions: Throws, with the script's output, when the file is missing or the last attempt fails.
 */
async function editSavedMatch(userDataDir, statements) {
  const script = path.join(__dirname, 'ui-smoke-db-edit.cjs');
  const args = [script, savedMatchFile(userDataDir), JSON.stringify(statements)];
  for (let attempt = 1; ; attempt += 1) {
    try {
      execFileSync(require('electron'), args, { cwd: REPO_ROOT, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: 'pipe' });
      return;
    } catch (err) {
      if (attempt >= EDIT_ATTEMPTS.count) {
        const output = `${err.stdout || ''}${err.stderr || ''}`.trim();
        throw new Error(`could not change the saved match: ${output || err.message}`);
      }
      await new Promise((resolve) => setTimeout(resolve, EDIT_ATTEMPTS.delayMs));
    }
  }
}

module.exports = {
  FINISHED_MATCH_EDIT,
  REPO_ROOT,
  launchApp,
  editSavedMatch,
};
