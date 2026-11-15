/**
 * Who may see a message, and how message text is cleaned.
 *
 * Purpose: The visibility rule and the cleaner are pure, so they can be checked without a database.
 * When to use: `npm run build:main`, then `node dist/shared/sideMessages.test.js`.
 * Expected outcome: Commanders see only their own messages. Players see everything only when fog of war is off. Cleaning collapses whitespace and cuts at the limit.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  cleanSideMessageText,
  isSideStance,
  SIDE_MESSAGE_MAX_CHARS,
  sideMessageVisibleTo,
} from './sideMessages';

test('a commander sees only messages it sent or received', () => {
  const commander = { kind: 'commander' as const, seatId: 'opponent' };
  for (const fogOfWarEnabled of [true, false]) {
    assert.equal(sideMessageVisibleTo({ viewer: commander, fogOfWarEnabled, fromSeatId: 'human', toSeatId: 'opponent' }), true);
    assert.equal(sideMessageVisibleTo({ viewer: commander, fogOfWarEnabled, fromSeatId: 'opponent', toSeatId: 'human' }), true);
    assert.equal(sideMessageVisibleTo({ viewer: commander, fogOfWarEnabled, fromSeatId: 'opponent2', toSeatId: 'opponent3' }), false);
  }
});

test('a player sees every message only when fog of war is off', () => {
  const player = { kind: 'player' as const, seatId: 'human' };
  assert.equal(sideMessageVisibleTo({ viewer: player, fogOfWarEnabled: true, fromSeatId: 'opponent', toSeatId: 'human' }), true);
  assert.equal(sideMessageVisibleTo({ viewer: player, fogOfWarEnabled: true, fromSeatId: 'opponent', toSeatId: 'opponent2' }), false);
  assert.equal(sideMessageVisibleTo({ viewer: player, fogOfWarEnabled: false, fromSeatId: 'opponent', toSeatId: 'opponent2' }), true);
  assert.equal(sideMessageVisibleTo({ viewer: { kind: 'observer' }, fogOfWarEnabled: true, fromSeatId: 'opponent', toSeatId: 'opponent2' }), true);
});

test('cleaning collapses whitespace, strips controls, and cuts at the limit', () => {
  assert.equal(cleanSideMessageText('a\n\n b\t c', 20), 'a b c');
  assert.equal(cleanSideMessageText('a\u0001b', 20), 'ab');
  assert.equal(cleanSideMessageText('x'.repeat(SIDE_MESSAGE_MAX_CHARS + 5), SIDE_MESSAGE_MAX_CHARS).length, SIDE_MESSAGE_MAX_CHARS);
  assert.equal(cleanSideMessageText(42, 20), '');
  assert.equal(cleanSideMessageText(`${'a'.repeat(279)}😀`, 280), `${'a'.repeat(279)}😀`);
  const cut = cleanSideMessageText(`${'a'.repeat(280)}😀`, 280);
  assert.equal(cut, 'a'.repeat(280));
  assert.equal([...cut].some((ch) => {
    const code = ch.charCodeAt(0);
    return code >= 0xD800 && code <= 0xDFFF;
  }), false);
  assert.equal(isSideStance('wary'), true);
  assert.equal(isSideStance('allied'), false);
});
