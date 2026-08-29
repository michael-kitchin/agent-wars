#!/usr/bin/env node
'use strict';

/**
 * Parses `tsc` renderer type-check output into baseline-stable error entries.
 *
 * Purpose: Shared parse/compare helpers for the renderer type-check gate so dump and check scripts stay in sync.
 * When to use: From `check-renderer-typecheck.cjs`, `dump-renderer-typecheck-baseline.cjs`, and their tests.
 * Expected outcome: Path-normalized `file|TScode|message` strings with line/column dropped; unknown output lines ignored.
 * Exceptions: None; never throws on malformed tsc text.
 */

const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const TSC_ERROR_LINE = /^(\S.*?)\((\d+),(\d+)\): error (TS\d+): (.*)$/;

/**
 * Turns raw `tsc` stdout/stderr into comparable error keys.
 *
 * Purpose: Drops line/column so moving code inside a file does not churn the baseline.
 * When to use: After capturing `tsc -p tsconfig.renderer.json` output.
 * Expected outcome: One `posixPath|TSnnnn|message` string per matching error line; continuation lines omitted.
 * Exceptions: None.
 */
function normalizeTypecheckErrorLines(rawOutput) {
  const text = typeof rawOutput === 'string' ? rawOutput : '';
  const entries = [];
  for (const line of text.split(/\r?\n/)) {
    const match = TSC_ERROR_LINE.exec(line);
    if (!match) continue;
    const filePath = match[1].replace(/\\/g, '/');
    const code = match[4];
    const message = match[5];
    entries.push(`${filePath}|${code}|${message}`);
  }
  return entries;
}

/**
 * Returns type-check entries that are not already listed in the baseline.
 *
 * Purpose: Encodes the gate's "new error" rule as a pure function so tests can cover failure without invoking tsc.
 * When to use: After normalizing a fresh type-check run against the saved baseline array.
 * Expected outcome: Entries from `entries` whose exact string is absent from `baselineEntries`, preserving input order.
 * Exceptions: None.
 */
function computeDisallowedTypecheckEntries(entries, baselineEntries) {
  const baseline = new Set(Array.isArray(baselineEntries) ? baselineEntries : []);
  const list = Array.isArray(entries) ? entries : [];
  return list.filter((entry) => !baseline.has(entry));
}

/**
 * Tells whether a renderer `tsc` spawn produced output the baseline gate can trust.
 *
 * Purpose: Distinguishes “file errors we already baseline” from “tsc never type-checked files”
 * (spawn failure, config diagnostics only, or a crash with no per-file error lines).
 * When to use: Before comparing `entries` to the baseline or writing a new baseline file.
 * Expected outcome: True when `tsc` exited 0, or exited non-zero but still emitted at least one parsed file error.
 * Exceptions: None.
 */
function isRendererTypecheckRunUsable(run) {
  if (!run || run.error) return false;
  if (run.status === 0) return true;
  if (run.status == null) return false;
  return Array.isArray(run.entries) && run.entries.length > 0;
}

/**
 * Runs `tsc -p tsconfig.renderer.json` and returns raw plus normalized entries.
 *
 * Purpose: Single spawn path for dump and check so they cannot drift on flags or cwd.
 * When to use: Baseline generation and CI/local renderer type-check gating.
 * Expected outcome: `{ raw, entries, status, error }` from concatenated stdout/stderr; `tsc` non-zero is expected when file errors exist.
 * Exceptions: Throws if the TypeScript CLI cannot be resolved.
 */
function runRendererTypecheck() {
  const tscBin = require.resolve('typescript/bin/tsc');
  const result = spawnSync(process.execPath, [tscBin, '-p', 'tsconfig.renderer.json'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  const raw = `${result.stdout || ''}${result.stderr || ''}`;
  return {
    raw,
    entries: normalizeTypecheckErrorLines(raw),
    status: result.status,
    error: result.error || null,
  };
}

module.exports = {
  normalizeTypecheckErrorLines,
  computeDisallowedTypecheckEntries,
  isRendererTypecheckRunUsable,
  runRendererTypecheck,
};
