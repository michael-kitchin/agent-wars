#!/usr/bin/env node
'use strict';

/**
 * Contract tests for the Markdown link checker.
 *
 * Purpose: A heading rename and a missing image must be reported, and a link up a directory must still resolve.
 * When to use: From `scripts/run-main-node-tests.cjs` as an extra CJS test, or directly with node.
 * Expected outcome: Exits 0 when the anchors and the broken-link report match.
 * Exceptions: Assertion failures abort the process via node:test.
 *
 * The fixture files below are made-up test values.
 */

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test } = require('node:test');
const { findBrokenLinks, headingSlugs } = require('./check-doc-links.cjs');

test('repeated headings get a numeric suffix', () => {
  const slugs = headingSlugs('# Things That May Surprise You\n## Credits and Hiring\n## Credits and Hiring');
  assert.equal(slugs.has('things-that-may-surprise-you'), true);
  assert.equal(slugs.has('credits-and-hiring'), true);
  assert.equal(slugs.has('credits-and-hiring-1'), true);
});

test('a missing anchor and a missing image are both reported', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-links-'));
  const dir = path.join(root, 'nested');
  fs.mkdirSync(dir);
  const file = path.join(dir, 'page.md');
  fs.writeFileSync(file, '# Here\n\n[Gone](#missing)\n\n![None](media/none.png)\n');
  const broken = findBrokenLinks(file);
  assert.deepEqual(broken.map((link) => link.target), ['#missing', 'media/none.png']);
});

test('a link to a parent file checks that file\'s headings', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-links-'));
  const dir = path.join(root, 'nested');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(root, 'other.md'), '# Real\n');
  const file = path.join(dir, 'page.md');
  fs.writeFileSync(file, '[Yes](../other.md#real)\n\n[No](../other.md#gone)\n');
  const broken = findBrokenLinks(file);
  assert.deepEqual(broken.map((link) => link.target), ['../other.md#gone']);
});
