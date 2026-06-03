/**
 * Tests for shared march path tail resolution. Run with: node dist/main/marchPathUtils.test.js
 */

import assert from 'node:assert/strict';
import { findPathTailFromCurrentPosition } from '../shared/marchPathUtils';

function testHeadMatchReturnsFullPath(): void {
  const path = ['a', 'b', 'c'];
  assert.deepStrictEqual(findPathTailFromCurrentPosition(path, 'a'), path);
}

function testMidPathMatchReturnsTail(): void {
  const path = ['a', 'b', 'c', 'd'];
  assert.deepStrictEqual(findPathTailFromCurrentPosition(path, 'c'), ['c', 'd']);
}

function testOffPathReturnsNull(): void {
  assert.strictEqual(findPathTailFromCurrentPosition(['a', 'b'], 'z'), null);
}

function testEmptyPathReturnsNull(): void {
  assert.strictEqual(findPathTailFromCurrentPosition([], 'a'), null);
}

function run(): void {
  testHeadMatchReturnsFullPath();
  testMidPathMatchReturnsTail();
  testOffPathReturnsNull();
  testEmptyPathReturnsNull();
  console.log('marchPathUtils.test.ts passed');
}

run();
