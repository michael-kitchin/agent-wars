/**
 * Callback subscriptions (Phase 1) — storage and replace-all semantics.
 * Without a live DB, getSubscriptions returns []; replaceSubscriptions/clearSubscriptions no-op.
 * Run with: node dist/callbackSubscriptions.test.js
 */

import * as assert from 'assert';
import { getSubscriptions, replaceSubscriptions, clearSubscriptions } from './callbackSubscriptions';

function testGetSubscriptionsReturnsArray(): void {
  const list = getSubscriptions('opponent');
  assert.ok(Array.isArray(list));
}

function testReplaceSubscriptionsNoThrow(): void {
  replaceSubscriptions('opponent', [{ event: 'turns', params: { n: 3 } }], 10);
}

function testClearSubscriptionsNoThrow(): void {
  clearSubscriptions('opponent');
}

function run(): void {
  testGetSubscriptionsReturnsArray();
  testReplaceSubscriptionsNoThrow();
  testClearSubscriptionsNoThrow();
  console.log('callbackSubscriptions.test.ts passed');
}

run();
