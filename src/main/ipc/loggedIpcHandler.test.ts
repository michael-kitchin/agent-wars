/**
 * Tests for logged IPC handler registration. Run with: node dist/main/ipc/loggedIpcHandler.test.js
 */

import assert from 'node:assert/strict';
import { registerLoggedIpcHandler } from './loggedIpcHandler';

/**
 * Verifies happy-path registration returns the handler value.
 *
 * Purpose: Essential contract for overlay-style IPC wrappers.
 * When to use: After changing `registerLoggedIpcHandler`.
 * Expected outcome: Fake ipcMain stores a listener that returns the handler result.
 * Exceptions: None.
 */
function testHappyPathReturnsHandlerValue(): void {
  const listeners: Array<(...args: unknown[]) => unknown> = [];
  const ipcMain = {
    handle: (_channel: string, listener: (...args: unknown[]) => unknown) => {
      listeners.push(listener);
    },
  };
  registerLoggedIpcHandler(ipcMain, 'game:test', 'main IPC_GAME.test', () => [1, 2], []);
  assert.equal(listeners.length, 1);
  assert.deepStrictEqual(listeners[0]!(), [1, 2]);
}

/**
 * Verifies thrown handlers return the fallback value.
 *
 * Purpose: Essential failure path matching tactical overlay handlers.
 * When to use: After changing catch/fallback behavior.
 * Expected outcome: Listener returns `fallback` when `handler` throws.
 * Exceptions: None.
 */
function testThrownHandlerReturnsFallback(): void {
  const listeners: Array<(...args: unknown[]) => unknown> = [];
  const ipcMain = {
    handle: (_channel: string, listener: (...args: unknown[]) => unknown) => {
      listeners.push(listener);
    },
  };
  registerLoggedIpcHandler(
    ipcMain,
    'game:test',
    'main IPC_GAME.test',
    () => {
      throw new Error('boom');
    },
    [] as number[]
  );
  assert.deepStrictEqual(listeners[0]!(), []);
}

/**
 * Runs logged IPC handler tests.
 *
 * Purpose: Node test entrypoint for main-process discovery.
 * When to use: `node dist/main/ipc/loggedIpcHandler.test.js`.
 * Expected outcome: Throws on failure; logs pass when all succeed.
 * Exceptions: Propagates assertion errors.
 */
function run(): void {
  testHappyPathReturnsHandlerValue();
  testThrownHandlerReturnsFallback();
  console.log('loggedIpcHandler.test.ts passed');
}

run();
