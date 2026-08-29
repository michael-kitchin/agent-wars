#!/usr/bin/env node
'use strict';

/**
 * Unit tests for renderer type-check parse/compare helpers.
 *
 * Purpose: Covers parsing, the disallowed-entry filter, and unusable-run detection without invoking tsc.
 * When to use: Discovered by `scripts/run-main-node-tests.cjs` as an extra CJS test.
 * Expected outcome: Exits 0 when parse, filter, and usable-run contracts hold.
 * Exceptions: Assertion failures abort the process via node:test.
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  normalizeTypecheckErrorLines,
  computeDisallowedTypecheckEntries,
  isRendererTypecheckRunUsable,
} = require('./renderer-typecheck-report.cjs');

test('normalizeTypecheckErrorLines keeps two file errors and drops continuations', () => {
  const raw = [
    "src/renderer/foo.ts(10,5): error TS2300: Duplicate identifier 'READY_REQUEST_TIMEOUT_MS'.",
    "src/renderer/bar.ts(3,1): error TS2307: Cannot find module '../../shared/unitDisplayNames' or its corresponding type declarations.",
    '  Type is missing the following properties from type X: a, b',
    'error TS6059: File is not under rootDir.',
    '',
  ].join('\n');
  const entries = normalizeTypecheckErrorLines(raw);
  assert.deepEqual(entries, [
    "src/renderer/foo.ts|TS2300|Duplicate identifier 'READY_REQUEST_TIMEOUT_MS'.",
    "src/renderer/bar.ts|TS2307|Cannot find module '../../shared/unitDisplayNames' or its corresponding type declarations.",
  ]);
});

test('computeDisallowedTypecheckEntries returns only entries missing from the baseline', () => {
  const baseline = ['src/a.ts|TS18048|x is possibly undefined.', 'src/b.ts|TS2345|Argument of type number is not assignable.'];
  const entries = [
    'src/a.ts|TS18048|x is possibly undefined.',
    'src/c.ts|TS2307|Cannot find module.',
  ];
  assert.deepEqual(computeDisallowedTypecheckEntries(entries, baseline), ['src/c.ts|TS2307|Cannot find module.']);
  assert.deepEqual(computeDisallowedTypecheckEntries([baseline[0]], baseline), []);
});

test('isRendererTypecheckRunUsable accepts parsed file errors and a clean tsc exit', () => {
  assert.equal(
    isRendererTypecheckRunUsable({ error: null, status: 1, entries: ['src/a.ts|TS2300|Duplicate identifier.'] }),
    true
  );
  assert.equal(isRendererTypecheckRunUsable({ error: null, status: 0, entries: [] }), true);
});

test('isRendererTypecheckRunUsable rejects spawn failure and unparsed tsc failure', () => {
  assert.equal(isRendererTypecheckRunUsable({ error: new Error('spawn'), status: 1, entries: [] }), false);
  assert.equal(isRendererTypecheckRunUsable({ error: null, status: 1, entries: [] }), false);
  assert.equal(isRendererTypecheckRunUsable({ error: null, status: null, entries: [] }), false);
});
