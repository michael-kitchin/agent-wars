/**
 * History groups, You, and recipient order.
 *
 * Purpose: The chat panel and the message dialog share these rules.
 * When to use: `npm run build:main`, then `node dist/shared/sideMessageView.test.js`.
 * Expected outcome: Turns ascend, an observer is never You, and bullets follow seat order.
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
 * Purpose: The tests only vary the turn and the recipient.
 * When to use: Inside this file.
 * Expected outcome: A strategic view with the given turn and recipient.
 * Exceptions: None.
 */
function view(messageId: number, turnNumber: number, toSeatId: string): SideMessageView {
  return {
    messageId,
    fromSeatId: 'opponent',
    toSeatId,
    text: `m${messageId}`,
    scope: 'strategic',
    turnNumber,
    beatNumber: 0,
  };
}

test('messages group by turn, oldest turn first, and an empty list gives no groups', () => {
  const groups = groupSideMessagesByTurn([view(1, 3, 'human'), view(2, 3, 'opponent2'), view(3, 5, 'human')]);
  assert.deepEqual(groups.map((group) => group.heading), ['Turn 3', 'Turn 5']);
  assert.deepEqual(groups[0]?.messages.map((message) => message.messageId), [1, 2]);
  assert.deepEqual(groups[1]?.messages.map((message) => message.messageId), [3]);
  assert.deepEqual(groupSideMessagesByTurn([]), []);
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
