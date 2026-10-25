#!/usr/bin/env node
'use strict';

/**
 * Contract tests for choosing a native-module install step after prebuild-install.
 *
 * Purpose: A locked better-sqlite3 binary must stay on the prebuild path. Source compilation is only for a real prebuild miss.
 * When to use: From `scripts/run-main-node-tests.cjs` as an extra CJS test, or directly with node.
 * Expected outcome: Exits 0 when lock, success, and missing-prebuild decisions match.
 * Exceptions: Assertion failures abort the process via node:test.
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { nativeBuildStepAfterPrebuild } = require('./rebuild-native-plan.cjs');

test('a locked native binary retries the prebuild instead of compiling', () => {
  const output = [
    "prebuild-install warn install EBUSY: resource busy or locked, open 'F:\\Projects\\better_sqlite3.node'",
    "Error: EPERM: operation not permitted, unlink 'F:\\Projects\\better_sqlite3.node'",
  ].join('\n');
  assert.equal(nativeBuildStepAfterPrebuild(1, output), 'retry-prebuild');
});

test('a successful prebuild is ready to load', () => {
  assert.equal(
    nativeBuildStepAfterPrebuild(0, 'prebuild-install info install Successfully installed prebuilt binary!'),
    'ready'
  );
});

test('a non-lock prebuild failure falls back to compiling', () => {
  assert.equal(nativeBuildStepAfterPrebuild(1, 'prebuild-install warn install 404 Not Found'), 'compile');
});
