/**
 * Puts better-sqlite3 on the requested ABI runtime.
 * - Electron runtime: used by the desktop app.
 * - Node runtime: used by npm test (dist/main/*.test.js under node).
 *
 * Prefers official prebuilds; falls back to runtime-specific rebuild when needed.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

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

if (!fs.existsSync(betterSqlite)) {
  console.error('rebuild-native: node_modules/better-sqlite3 not found. Run npm install first.');
  process.exit(1);
}

if (runtime !== 'electron' && runtime !== 'node') {
  console.error(`rebuild-native: unsupported runtime "${runtime}". Use --runtime=electron or --runtime=node.`);
  process.exit(1);
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

let code = run('npx', prebuildArgs, { cwd: betterSqlite });
if (code === 0) {
  console.log(`rebuild-native: better-sqlite3 ready (${runtime} prebuilt binary).`);
  process.exit(0);
}

if (runtime === 'electron') {
  console.warn(
    'rebuild-native: prebuild-install failed (no binary for this Electron/OS yet?). Trying electron-rebuild — requires Visual Studio Build Tools (Desktop C++) on Windows.'
  );
  code = run('npx', ['electron-rebuild', '-f', '-w', 'better-sqlite3'], { cwd: root });
} else {
  console.warn(
    'rebuild-native: prebuild-install failed for node runtime. Trying npm rebuild better-sqlite3 (may require native build tools).'
  );
  code = run('npm', ['rebuild', 'better-sqlite3'], { cwd: root });
}
process.exit(code === 0 ? 0 : 1);
