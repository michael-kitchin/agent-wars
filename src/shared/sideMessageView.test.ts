/**
 * History groups, You, and recipient order.
 *
 * Purpose: The chat panel and the message dialog share these rules.
 * When to use: `npm run build:main`, then `node dist/shared/sideMessageView.test.js`.
 * Expected outcome: Turns ascend, each turn follows seat order, an observer is never You, and bullets follow seat order.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  dispatchMessagesInSideOrder,
  groupSideMessagesByTurn,
  sideMessagePartyLabel,
  type SideMessageView,
} from './sideMessageView';

/**
 * One view for a grouping case.
 *
 * Purpose: The tests vary the turn, the sender, and the recipient.
 * When to use: Inside this file.
 * Expected outcome: A strategic view with the given turn, recipient, and sender. The sender defaults to `opponent`.
 * Exceptions: None.
 */
function view(messageId: number, turnNumber: number, toSeatId: string, fromSeatId = 'opponent'): SideMessageView {
  return {
    messageId,
    fromSeatId,
    toSeatId,
    text: `m${messageId}`,
    scope: 'strategic',
    turnNumber,
    beatNumber: 0,
  };
}

/**
 * Seat order for the grouping cases.
 *
 * Purpose: Human, then the first opponent, then the second. Anything else sorts last.
 * When to use: `groupSideMessagesByTurn` in this file.
 * Expected outcome: 1, 2, or 3 for the named seats.
 * Exceptions: None.
 */
function orderOf(seatId: string): number {
  if (seatId === 'human') return 1;
  if (seatId === 'opponent') return 2;
  if (seatId === 'opponent2') return 3;
  return Number.MAX_SAFE_INTEGER;
}

test('messages group by turn, oldest turn first, and an empty list gives no groups', () => {
  const groups = groupSideMessagesByTurn([view(1, 3, 'human'), view(2, 3, 'opponent2'), view(3, 5, 'human')], orderOf);
  assert.deepEqual(groups.map((group) => group.heading), ['Turn 3', 'Turn 5']);
  assert.deepEqual(groups[0]?.messages.map((message) => message.messageId), [1, 2]);
  assert.deepEqual(groups[1]?.messages.map((message) => message.messageId), [3]);
  assert.deepEqual(groupSideMessagesByTurn([], orderOf), []);
});

test('a turn lists senders in seat order, then recipients in seat order', () => {
  const groups = groupSideMessagesByTurn([
    view(1, 4, 'human', 'opponent2'),
    view(2, 4, 'opponent2', 'human'),
    view(5, 4, 'opponent', 'human'),
    view(3, 4, 'opponent', 'human'),
    view(4, 4, 'opponent2', 'opponent'),
  ], orderOf);
  assert.deepEqual(groups[0]?.messages.map((message) => message.messageId), [3, 5, 2, 4, 1]);
});

test('the viewer is You and an observer never is', () => {
  const nameOf = (seatId: string) => (seatId === 'opponent' ? 'West' : seatId);
  assert.equal(sideMessagePartyLabel('human', 'human', nameOf), 'You');
  assert.equal(sideMessagePartyLabel('opponent', 'human', nameOf), 'West');
  assert.equal(sideMessagePartyLabel('human', null, nameOf), 'human');
});

test('bullets follow seat order and a higher order sorts last', () => {
  const messages = [view(1, 1, 'third'), view(2, 1, 'first'), view(3, 1, 'second')];
  const orderOf = (seatId: string) => (seatId === 'first' ? 1 : seatId === 'second' ? 2 : 3);
  assert.deepEqual(dispatchMessagesInSideOrder(messages, orderOf).map((message) => message.toSeatId), ['first', 'second', 'third']);
});
