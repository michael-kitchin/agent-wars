#!/usr/bin/env node
'use strict';

/**
 * Downloads the Electron runtime binary after `npm ci --ignore-scripts`, which skips electron's postinstall hook.
 *
 * Purpose: GitHub Actions runners often set `ELECTRON_SKIP_BINARY_DOWNLOAD`, causing `electron/install.js` to exit 0
 * without creating `path.txt` or `dist/`. Packaging and some integration paths need the binary on disk.
 * When to use: CI workflow after `npm ci --ignore-scripts`, and locally when reproducing that install layout.
 * Expected outcome: `node_modules/electron/path.txt` exists and points at an on-disk executable under `dist/`.
 * Exceptions: Exits 1 when install fails, times out, or the expected binary path is missing.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const electronDir = path.join(repoRoot, 'node_modules', 'electron');
const installJs = path.join(electronDir, 'install.js');
const pathTxt = path.join(electronDir, 'path.txt');

/**
 * Builds the absolute path to the Electron executable using `path.txt` and `dist/`.
 *
 * Purpose: Shared validation for post-install checks in CI and local repro scripts.
 * When to use: After `install.js` completes to confirm the binary is present.
 * Expected outcome: Absolute path to the platform executable (or `.app` bundle entry on macOS).
 * Exceptions: Throws when `path.txt` is missing or unreadable.
 */
function resolveElectronBinaryPath() {
  const rel = fs.readFileSync(pathTxt, 'utf8').trim();
  return path.join(electronDir, 'dist', rel);
}

/**
 * Runs `electron/install.js` with download skip disabled and validates the extracted binary.
 *
 * Purpose: Single entry point for CI so workflow YAML does not duplicate env/platform edge cases.
 * When to use: From `.github/workflows/build.yml` immediately after dependency install.
 * Expected outcome: Process exit code 0 when install and validation succeed.
 * Exceptions: Exits 1 on spawn failure, non-zero install status, or missing binary.
 */
function main() {
  if (!fs.existsSync(installJs)) {
    console.error('install-electron-binary: node_modules/electron/install.js not found. Run npm ci first.');
    process.exit(1);
  }

  const env = { ...process.env };
  delete env.ELECTRON_SKIP_BINARY_DOWNLOAD;

  if (process.env.ELECTRON_SKIP_BINARY_DOWNLOAD) {
    console.log(
      'install-electron-binary: clearing ELECTRON_SKIP_BINARY_DOWNLOAD (CI runners often set this; install.js would otherwise no-op).'
    );
  }

  console.log('install-electron-binary: running electron/install.js…');
  const result = spawnSync(process.execPath, [installJs], {
    cwd: repoRoot,
    env,
    stdio: 'inherit',
  });

  if (result.error) {
    console.error('install-electron-binary: failed to spawn install.js', result.error);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`install-electron-binary: install.js exited with status ${result.status ?? 'unknown'}`);
    process.exit(result.status ?? 1);
  }

  if (!fs.existsSync(pathTxt)) {
    console.error(
      'install-electron-binary: path.txt missing after install.js. ' +
        'If ELECTRON_SKIP_BINARY_DOWNLOAD is still set in the environment, unset it for this step.'
    );
    process.exit(1);
  }

  const binaryPath = resolveElectronBinaryPath();
  if (!fs.existsSync(binaryPath)) {
    console.error('install-electron-binary: Electron binary missing at', binaryPath);
    process.exit(1);
  }

  console.log('install-electron-binary: Electron binary ready at', binaryPath);
}

main();
