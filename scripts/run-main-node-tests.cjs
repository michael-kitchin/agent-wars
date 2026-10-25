#!/usr/bin/env node
'use strict';

/**
 * Runs Node `node:test` entrypoints under `dist/main` and `dist/shared` (and optional extra roots) without listing every file in package.json.
 *
 * Purpose: Keeps `npm test` / verify scripts stable when new `*.test.ts` files appear—only `build:main` output layout matters.
 * When to use: From npm `test`, `verify:modularization`, or locally after `npm run build:main`.
 * Expected outcome: Exits with the first failing test file’s status; prints each file banner on stderr for log separation. With `--list`, prints repo-relative paths only (no `node` runs).
 * Exceptions: Exits 1 if `dist/main` is missing, no tests found, or a manifest path is missing.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');

/**
 * Recursively collects `*.test.js` paths under `rootDir` (absolute).
 *
 * Purpose: Single discovery rule for the main-process test bundle.
 * When to use: Default mode and as a building block for manifest validation.
 * Expected outcome: Sorted relative paths for deterministic run order.
 * Exceptions: Skips unreadable directories quietly (empty result for missing root).
 */
function collectTestJsUnderDir(rootDir, acc = []) {
  if (!fs.existsSync(rootDir)) return acc;
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  for (const ent of entries) {
    const p = path.join(rootDir, ent.name);
    if (ent.isDirectory()) {
      collectTestJsUnderDir(p, acc);
    } else if (ent.isFile() && ent.name.endsWith('.test.js')) {
      acc.push(p);
    }
  }
  return acc;
}

/**
 * Reads `--manifest <file>` lines: non-empty, non-`#` lines are repo-relative POSIX paths to test JS files.
 *
 * Purpose: Supports a smaller curated subset (e.g. modularization smoke) without encoding it in package.json.
 * When to use: `node scripts/run-main-node-tests.cjs --manifest scripts/foo.manifest`.
 * Expected outcome: Absolute paths in declaration order.
 * Exceptions: Throws if any listed file does not exist.
 */
function readManifest(manifestPath) {
  const abs = path.isAbsolute(manifestPath) ? manifestPath : path.join(repoRoot, manifestPath);
  const raw = fs.readFileSync(abs, 'utf8');
  const lines = raw.split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const rel = t.replace(/\//g, path.sep);
    const p = path.join(repoRoot, rel);
    if (!fs.existsSync(p)) {
      throw new Error(`run-main-node-tests: manifest entry not found: ${t}`);
    }
    out.push(p);
  }
  return out;
}

function parseArgs(argv) {
  const manifestIdx = argv.indexOf('--manifest');
  const listOnly = argv.includes('--list');
  if (manifestIdx >= 0 && argv[manifestIdx + 1]) {
    return { mode: 'manifest', manifestPath: argv[manifestIdx + 1], listOnly };
  }
  return { mode: 'discover', listOnly };
}

function runOne(fileAbs) {
  const rel = path.relative(repoRoot, fileAbs);
  process.stderr.write(`\n--- ${rel} ---\n`);
  const r = spawnSync(process.execPath, [fileAbs], { stdio: 'inherit', cwd: repoRoot, env: process.env });
  if (r.error) {
    process.stderr.write(String(r.error) + '\n');
    process.exit(1);
  }
  const failedByStatus = r.status !== 0 && r.status !== null;
  const failedBySignal = r.status === null && r.signal != null;
  if (failedByStatus || failedBySignal) {
    process.exit(typeof r.status === 'number' && r.status !== 0 ? r.status : 1);
  }
}

function main() {
  const args = process.argv.slice(2);
  const opts = parseArgs(args);

  let files;
  if (opts.mode === 'manifest') {
    files = readManifest(opts.manifestPath);
  } else {
    const mainDist = path.join(repoRoot, 'dist', 'main');
    if (!fs.existsSync(mainDist)) {
      process.stderr.write('run-main-node-tests: dist/main not found; run npm run build:main first.\n');
      process.exit(1);
    }
    files = collectTestJsUnderDir(mainDist);
    const sharedDist = path.join(repoRoot, 'dist', 'shared');
    collectTestJsUnderDir(sharedDist, files);
    files.sort((a, b) => a.localeCompare(b));
    for (const extraName of [
      'collect-release-archives.test.cjs',
      'electron-builder-config.test.cjs',
      'linux-sandbox-launcher.test.cjs',
      'generated-data-packaging.test.cjs',
      'generated-data-pack-assert.test.cjs',
      'rebuild-native-plan.test.cjs',
      'renderer-typecheck-report.test.cjs',
      'ui-smoke/ui-smoke-checks.test.cjs',
    ]) {
      const extra = path.join(repoRoot, 'scripts', extraName);
      if (fs.existsSync(extra)) {
        files.push(extra);
      }
    }
  }

  if (files.length === 0) {
    process.stderr.write('run-main-node-tests: no test files to run.\n');
    process.exit(1);
  }

  if (opts.listOnly) {
    for (const f of files) {
      process.stdout.write(path.relative(repoRoot, f) + '\n');
    }
    return;
  }

  for (const f of files) {
    runOne(f);
  }
}

main();
