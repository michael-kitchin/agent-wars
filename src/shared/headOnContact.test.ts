/**
 * Contracts for head-on contact grouping.
 * Run with: node dist/shared/headOnContact.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  resolveHeadOnContacts,
  type HeadOnHeldCellPicker,
  type HeadOnMover,
} from './headOnContact';

/**
 * A picker that records each call and always returns `held`.
 *
 * Purpose: Tests need to see that a contact asks for its cell exactly once, in sorted order.
 * When to use: Each case that supplies a picker.
 * Expected outcome: `calls` gains one pair per real contact, and the return is `held` even when it is not one of the cells.
 * Exceptions: None.
 */
function recordingPicker(held: string, calls: string[][]): HeadOnHeldCellPicker {
  return (cellA, cellB) => {
    calls.push([cellA, cellB]);
    return held;
  };
}

/**
 * One mover between two cells.
 *
 * Purpose: Keeps the four fields of a fixture row together.
 * When to use: Building the lists passed to `resolveHeadOnContacts`.
 * Expected outcome: A mover with the given id, owner, and cells.
 * Exceptions: None.
 */
function mover(unitId: string, owner: string, fromCell: string, toCell: string): HeadOnMover {
  return { unitId, owner, fromCell, toCell };
}

test('opposing movers that trade cells meet in the picked cell', () => {
  const calls: string[][] = [];
  const resolution = resolveHeadOnContacts(
    [
      mover('human-1', 'human', 'cell-x', 'cell-y'),
      mover('opponent-1', 'opponent', 'cell-y', 'cell-x'),
    ],
    recordingPicker('cell-x', calls),
  );
  assert.equal(resolution.contacts.length, 1);
  const contact = resolution.contacts[0]!;
  assert.equal(contact.heldCell, 'cell-x');
  assert.deepEqual(contact.holdingUnitIds, ['human-1']);
  assert.deepEqual(contact.enteringUnitIds, ['opponent-1']);
  assert.deepEqual([...resolution.cancelledUnitIds], ['human-1']);
  assert.deepEqual(calls, [['cell-x', 'cell-y']]);
});

test('every mover between the two cells joins the contact', () => {
  const calls: string[][] = [];
  const resolution = resolveHeadOnContacts(
    [
      mover('human-b', 'human', 'cell-x', 'cell-y'),
      mover('human-a', 'human', 'cell-x', 'cell-y'),
      mover('opponent-1', 'opponent', 'cell-y', 'cell-x'),
    ],
    recordingPicker('cell-y', calls),
  );
  assert.equal(resolution.contacts.length, 1);
  const contact = resolution.contacts[0]!;
  assert.equal(contact.heldCell, 'cell-y');
  assert.deepEqual(contact.holdingUnitIds, ['opponent-1']);
  assert.deepEqual(contact.enteringUnitIds, ['human-a', 'human-b']);
  assert.deepEqual([...resolution.cancelledUnitIds], ['opponent-1']);
  assert.equal(calls.length, 1);
});

test('same-owner trades and three-cell rings are not contacts', () => {
  const calls: string[][] = [];
  const pick = recordingPicker('cell-x', calls);
  const sameOwner = resolveHeadOnContacts(
    [
      mover('human-1', 'human', 'cell-x', 'cell-y'),
      mover('human-2', 'human', 'cell-y', 'cell-x'),
    ],
    pick,
  );
  const ring = resolveHeadOnContacts(
    [
      mover('human-1', 'human', 'cell-x', 'cell-y'),
      mover('opponent-1', 'opponent', 'cell-y', 'cell-z'),
      mover('opponent-2', 'opponent2', 'cell-z', 'cell-x'),
    ],
    pick,
  );
  assert.equal(sameOwner.contacts.length, 0);
  assert.equal(sameOwner.cancelledUnitIds.size, 0);
  assert.equal(ring.contacts.length, 0);
  assert.equal(ring.cancelledUnitIds.size, 0);
  assert.deepEqual(calls, []);
});

test('a picker that returns neither cell throws', () => {
  assert.throws(
    () => resolveHeadOnContacts(
      [
        mover('human-1', 'human', 'cell-x', 'cell-y'),
        mover('opponent-1', 'opponent', 'cell-y', 'cell-x'),
      ],
      () => 'cell-q',
    ),
    /picker returned cell-q/,
  );
});
