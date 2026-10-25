/**
 * Puts better-sqlite3 on the requested ABI runtime.
 * - Electron runtime: used by the desktop app.
 * - Node runtime: used by npm test (dist/main/*.test.js under node).
 *
 * Prefers official prebuilds. A locked binary is retried on that path.
 * Falls back to a runtime-specific rebuild only when the prebuild itself is missing.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { nativeBuildStepAfterPrebuild } = require('./rebuild-native-plan.cjs');

/** How many times to retry prebuild-install after a locked better_sqlite3.node before giving up. */
const NATIVE_BINARY_LOCK_RETRIES = 4;

const root = path.join(__dirname, '..');
const betterSqlite = path.join(root, 'node_modules', 'better-sqlite3');
const electronPkg = path.join(root, 'node_modules', 'electron', 'package.json');
const runtimeArg = process.argv.find((arg) => arg.startsWith('--runtime='));
const runtime = runtimeArg ? runtimeArg.split('=')[1] : 'electron';

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...opts,
  });
  return r.status ?? 1;
}

/**
 * Runs a command and keeps its combined output for the prebuild decision.
 *
 * Purpose: A file-lock failure and a missing prebuild both exit non-zero; the text says which one happened.
 * When to use: For prebuild-install. Other rebuild commands can keep inheriting the console via `run`.
 * Expected outcome: `{ code, output }`. A spawn failure uses code 1 and includes the error message in `output`.
 * Exceptions: None. Does not throw.
 */
function runCapture(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    ...opts,
  });
  const output = `${r.stdout || ''}${r.stderr || ''}${r.error ? `\n${r.error.message}` : ''}`;
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.error) console.error(r.error);
  return { code: r.status ?? 1, output };
}

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function isBetterSqliteLoadableForRuntime(targetRuntime) {
  if (targetRuntime === 'node') {
    return (
      run(
        'node',
        ['-e', "new (require('better-sqlite3'))(':memory:').close()"],
        { shell: false }
      ) === 0
    );
  }
  // Electron does not support Node-style "-e" execution for module checks.
  // Runtime validation for Electron is therefore based on rebuild command success.
  return false;
}

if (!fs.existsSync(betterSqlite)) {
  console.error('rebuild-native: node_modules/better-sqlite3 not found. Run npm install first.');
  process.exit(1);
}

if (runtime !== 'electron' && runtime !== 'node') {
  console.error(`rebuild-native: unsupported runtime "${runtime}". Use --runtime=electron or --runtime=node.`);
  process.exit(1);
}

if (isBetterSqliteLoadableForRuntime(runtime)) {
  console.log(`rebuild-native: better-sqlite3 already loadable for ${runtime} runtime.`);
  process.exit(0);
}

let prebuildArgs;
if (runtime === 'electron') {
  if (!fs.existsSync(electronPkg)) {
    console.error('rebuild-native: node_modules/electron not found. Run npm install first.');
    process.exit(1);
  }
  const electronVersion = JSON.parse(fs.readFileSync(electronPkg, 'utf8')).version;
  console.log(`rebuild-native: Electron ${electronVersion} — trying prebuild-install for better-sqlite3…`);
  prebuildArgs = ['prebuild-install', '--runtime', 'electron', '--target', electronVersion];
} else {
  console.log('rebuild-native: Node runtime — trying prebuild-install for better-sqlite3…');
  prebuildArgs = ['prebuild-install', '--runtime', 'node'];
}

/**
 * Runs one prebuild-install attempt for the runtime selected above.
 *
 * Purpose: Downloads the official better-sqlite3 binary and records output for lock detection.
 * When to use: The first attempt, and each retry while the native file is locked.
 * Expected outcome: `{ code, output }` from prebuild-install.
 * Exceptions: None.
 */
function installPrebuild() {
  return runCapture('npx', prebuildArgs, { cwd: betterSqlite });
}

let prebuild = installPrebuild();
let step = nativeBuildStepAfterPrebuild(prebuild.code, prebuild.output);
let lockAttempt = 0;
while (step === 'retry-prebuild' && lockAttempt < NATIVE_BINARY_LOCK_RETRIES) {
  lockAttempt += 1;
  console.warn(
    `rebuild-native: better_sqlite3.node is in use; retrying prebuild-install (${lockAttempt}/${NATIVE_BINARY_LOCK_RETRIES}).`
  );
  sleepMs(1200);
  prebuild = installPrebuild();
  step = nativeBuildStepAfterPrebuild(prebuild.code, prebuild.output);
}

if (step === 'retry-prebuild') {
  console.error(
    'rebuild-native: better_sqlite3.node is still in use, so the prebuild could not be installed. Close Agent Wars and any Node process that has loaded better-sqlite3, then retry.'
  );
  process.exit(1);
}

let code = prebuild.code;
if (code === 0) {
  if (runtime === 'node' && !isBetterSqliteLoadableForRuntime(runtime)) {
    console.warn(
      'rebuild-native: prebuild-install reported success, but better-sqlite3 is still not loadable for node runtime; falling back to npm rebuild.'
    );
    code = 1;
  } else {
  console.log(`rebuild-native: better-sqlite3 ready (${runtime} prebuilt binary).`);
  process.exit(0);
  }
}

if (runtime === 'electron') {
  console.warn(
    'rebuild-native: prebuild-install failed (no binary for this Electron/OS yet?). Trying electron-rebuild — requires Visual Studio Build Tools (Desktop C++) on Windows.'
  );
  code = run('npx', ['electron-rebuild', '-f', '-w', 'better-sqlite3'], { cwd: root });
  if (code !== 0) {
    console.warn('rebuild-native: electron-rebuild failed; retrying once after short delay.');
    sleepMs(1200);
    code = run('npx', ['electron-rebuild', '-f', '-w', 'better-sqlite3'], { cwd: root });
  }
} else {
  console.warn(
    'rebuild-native: prebuild-install failed for node runtime. Trying npm rebuild better-sqlite3 (may require native build tools).'
  );
  code = run('npm', ['rebuild', 'better-sqlite3'], { cwd: root });
}
if (code === 0 || (runtime === 'node' && isBetterSqliteLoadableForRuntime(runtime))) {
  if (code !== 0) {
    console.warn(`rebuild-native: build command failed, but existing better-sqlite3 is loadable for ${runtime}; continuing.`);
  }
  process.exit(0);
}
process.exit(1);
