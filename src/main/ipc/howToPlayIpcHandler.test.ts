/**
 * The How to play guide link.
 *
 * Purpose: The game menu's How to play item opens one fixed guide page in the system browser, and a failed open does not break the menu.
 * When to use: `npm run build:main`, then `node dist/main/ipc/howToPlayIpcHandler.test.js`.
 * Expected outcome: The fixed URL is opened, a success resolves true, and a rejected open resolves false.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HOW_TO_PLAY_URL, openHowToPlay } from './howToPlayIpcHandler';

test('the guide URL is the How to play page on GitHub', () => {
  assert.equal(HOW_TO_PLAY_URL, 'https://github.com/michael-kitchin/agent-wars/blob/main/doc/how-to-play.md');
});

test('openHowToPlay opens exactly the guide URL and resolves true', async () => {
  const opened: string[] = [];
  const result = await openHowToPlay(async (url) => {
    opened.push(url);
  });
  assert.equal(result, true);
  assert.deepEqual(opened, [HOW_TO_PLAY_URL]);
});

test('openHowToPlay resolves false when the browser cannot be opened', async () => {
  const result = await openHowToPlay(() => Promise.reject(new Error('no browser')));
  assert.equal(result, false);
});
