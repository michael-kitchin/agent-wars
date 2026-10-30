#!/usr/bin/env node
'use strict';

/**
 * Contract tests for the documentation screenshot crop and PNG size helpers.
 *
 * Purpose: A crop must cover every box it was given and stay inside the window, and a written image must report its real size.
 * When to use: From `scripts/run-main-node-tests.cjs` as an extra CJS test, or directly with node.
 * Expected outcome: Exits 0 when the crops and sizes match.
 * Exceptions: Assertion failures abort the process via node:test.
 *
 * The boxes, viewports, and PNG buffers below are made-up test values.
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { pngSize, unionClip } = require('./doc-shots-capture.cjs');

/**
 * Builds the first bytes of a PNG: the signature, then an IHDR chunk with the given size.
 *
 * Purpose: `pngSize` reads only those bytes, so a test image needs no pixel data.
 * When to use: The PNG size test.
 * Expected outcome: A 24-byte buffer.
 * Exceptions: None.
 */
function pngHeader(width, height) {
  const buffer = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write('IHDR', 12, 'ascii');
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

test('a crop pads the union of its boxes and stays inside the window', () => {
  const boxes = [{ x: 10, y: 10, width: 20, height: 20 }, { x: 50, y: 5, width: 10, height: 10 }];
  const viewport = { w: 100, h: 100 };
  assert.deepEqual(unionClip({ boxes, pad: 4, viewport }), { x: 6, y: 1, width: 58, height: 33 });
  assert.deepEqual(unionClip({ boxes, pad: 50, viewport }), { x: 0, y: 0, width: 100, height: 80 });
});

test('a crop with nothing to frame throws', () => {
  assert.throws(() => unionClip({ boxes: [], pad: 4, viewport: { w: 100, h: 100 } }));
});

test('the PNG size comes from the IHDR chunk', () => {
  assert.deepEqual(pngSize(pngHeader(48, 32)), { width: 48, height: 32 });
  assert.throws(() => pngSize(Buffer.alloc(24)));
});
