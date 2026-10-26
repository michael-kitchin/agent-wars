#!/usr/bin/env node
'use strict';

/**
 * Downloads the Electron runtime binary after `npm ci --ignore-scripts`, which skips electron's postinstall hook.
 *
 * Purpose: `electron/install.js` starts an async download and can exit before `path.txt` is written when spawned from CI;
 * this script awaits `@electron/get` and extract directly so the process does not return early.
 * When to use: CI workflow before Electron packaging (after Node tests).
 * Expected outcome: `node_modules/electron/path.txt` exists and points at an on-disk executable under `dist/`.
 * Exceptions: Exits 1 when download/extract fails or the expected binary path is missing.
 */

const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const electronDir = path.join(repoRoot, 'node_modules', 'electron');
const pathTxt = path.join(electronDir, 'path.txt');

/**
 * Returns the relative executable path written to `path.txt` for the current platform.
 *
 * Purpose: Mirrors `electron/install.js` so CI and local installs share the same layout.
 * When to use: Before writing or validating `path.txt`.
 * Expected outcome: Platform-specific relative path under `dist/`.
 * Exceptions: Throws when the platform has no official Electron builds.
 */
function getPlatformPath() {
  const platform = process.env.npm_config_platform || process.platform;
  switch (platform) {
    case 'mas':
    case 'darwin':
      return 'Electron.app/Contents/MacOS/Electron';
    case 'freebsd':
    case 'openbsd':
    case 'linux':
      return 'electron';
    case 'win32':
      return 'electron.exe';
    default:
      throw new Error(`install-electron-binary: Electron builds are not available on platform: ${platform}`);
  }
}

/**
 * Builds the absolute path to the Electron executable using `path.txt` and `dist/`.
 *
 * Purpose: Shared validation for post-install checks in CI and local repro scripts.
 * When to use: After `path.txt` is written to confirm the binary is present.
 * Expected outcome: Absolute path to the platform executable (or `.app` bundle entry on macOS).
 * Exceptions: Throws when `path.txt` is missing or unreadable.
 */
function resolveElectronBinaryPath() {
  const rel = fs.readFileSync(pathTxt, 'utf8').trim();
  return path.join(electronDir, 'dist', rel);
}

/**
 * Returns whether the installed Electron version, `path.txt`, and binary match expectations.
 *
 * Purpose: Skip redundant downloads when a prior step already extracted the runtime.
 * When to use: At the start of `downloadAndExtractElectron`.
 * Expected outcome: `true` when all install markers exist and match the package version.
 * Exceptions: None.
 */
function isElectronInstalled(version, platformPath) {
  try {
    if (fs.readFileSync(path.join(electronDir, 'dist', 'version'), 'utf8').replace(/^v/, '') !== version) {
      return false;
    }
    if (fs.readFileSync(pathTxt, 'utf8') !== platformPath) {
      return false;
    }
  } catch {
    return false;
  }
  const electronPath =
    process.env.ELECTRON_OVERRIDE_DIST_PATH || path.join(electronDir, 'dist', platformPath);
  return fs.existsSync(electronPath);
}

/**
 * Downloads and extracts the Electron zip, then writes `path.txt`.
 *
 * Purpose: Single awaited install path for CI; avoids `electron/install.js` early-exit races under `spawnSync`. The zip is extracted with `@electron-internal/extract-zip`, the same module `electron/install.js` uses.
 * When to use: From `.github/workflows/build.yml` before Electron-native rebuild and packaging.
 * Expected outcome: Resolves when the binary exists on disk.
 * Exceptions: Propagates download, extract, or filesystem errors to the caller.
 */
async function downloadAndExtractElectron() {
  delete process.env.ELECTRON_SKIP_BINARY_DOWNLOAD;

  if (!fs.existsSync(path.join(electronDir, 'package.json'))) {
    throw new Error('install-electron-binary: node_modules/electron not found. Run npm ci first.');
  }

  const { version } = JSON.parse(fs.readFileSync(path.join(electronDir, 'package.json'), 'utf8'));
  const platformPath = getPlatformPath();

  if (isElectronInstalled(version, platformPath)) {
    console.log('install-electron-binary: already installed at', resolveElectronBinaryPath());
    return;
  }

  const platform = process.env.npm_config_platform || process.platform;
  let arch = process.env.npm_config_arch || process.arch;

  if (
    platform === 'darwin' &&
    process.platform === 'darwin' &&
    arch === 'x64' &&
    process.env.npm_config_arch === undefined
  ) {
    try {
      const output = childProcess.execSync('sysctl -in sysctl.proc_translated');
      if (output.toString().trim() === '1') {
        arch = 'arm64';
      }
    } catch {
      // Not macOS Rosetta; keep requested arch.
    }
  }

  console.log(`install-electron-binary: downloading Electron ${version} for ${platform}/${arch}…`);
  const { downloadArtifact } = require('@electron/get');
  const { extract } = require('@electron-internal/extract-zip');

  const zipPath = await downloadArtifact({
    version,
    artifactName: 'electron',
    force: process.env.force_no_cache === 'true',
    cacheRoot: process.env.electron_config_cache,
    checksums:
      process.env.electron_use_remote_checksums || process.env.npm_config_electron_use_remote_checksums
        ? undefined
        : require(path.join(electronDir, 'checksums.json')),
    platform,
    arch,
  });

  const distPath = path.join(electronDir, 'dist');
  fs.mkdirSync(distPath, { recursive: true });
  await extract(zipPath, { dir: distPath });

  const srcTypeDefPath = path.join(distPath, 'electron.d.ts');
  const targetTypeDefPath = path.join(electronDir, 'electron.d.ts');
  if (fs.existsSync(srcTypeDefPath)) {
    fs.renameSync(srcTypeDefPath, targetTypeDefPath);
  }

  await fs.promises.writeFile(pathTxt, platformPath);

  const binaryPath = resolveElectronBinaryPath();
  if (!fs.existsSync(binaryPath)) {
    throw new Error(`install-electron-binary: Electron binary missing at ${binaryPath} after extract`);
  }

  console.log('install-electron-binary: Electron binary ready at', binaryPath);
}

downloadAndExtractElectron().catch((err) => {
  console.error('install-electron-binary: failed', err);
  process.exit(1);
});
