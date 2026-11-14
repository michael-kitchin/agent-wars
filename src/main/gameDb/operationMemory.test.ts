/**
 * Operation row: per-seat round trip, a bad entry, and the next id.
 * Run with: node dist/main/gameDb/operationMemory.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Operation } from '../../shared/operationTypes';
import { dbGetOne, dbRun } from '../gameDb';
import { upsertGameConfigValue } from './gameConfigRows';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import {
  OPERATION_EVENTS_CONFIG_KEY,
  OPERATION_NOTES_CONFIG_KEY,
  OPERATION_OFFERS_CONFIG_KEY,
  OPERATIONS_CONFIG_KEY,
  nextOperationId,
  readOperationEventTurn,
  readOperationOffer,
  readOperations,
  operationNoteTextForTurn,
  readOperationNote,
  writeOperationEventTurn,
  writeOperationNote,
  writeOperationOffer,
  writeOperationRefusal,
  writeOperationsForSeat,
} from './operationMemory';

/**
 * One stored operation for these tests.
 *
 * Purpose: Each case starts from a row the parser accepts.
 * When to use: The round-trip and the bad-entry cases.
 * Expected outcome: A sea operation in muster with the given id and seat-independent fields.
 * Exceptions: None.
 */
function sampleOperation(id: string): Operation {
  return {
    id,
    method: 'sea',
    objectiveH3: 'city-1',
    musterH3: 'port-1',
    landingH3: null,
    unitIds: ['inf-1', 'inf-2'],
    carrierIds: ['ship-1'],
    phase: 'muster',
    source: 'engine',
    launchedTurn: 3,
    phaseTurn: 3,
  };
}

test('operations round-trip per seat and drop a bad operation', () => {
  withTempGameDb('aw-operation-memory-', () => {
    const ops = { getOne: dbGetOne, run: dbRun };
    assert.equal(readOperations(ops).size, 0);
    const later = sampleOperation('a1-op4');
    const earlier = sampleOperation('a1-op3');
    writeOperationsForSeat(ops, 'a1', [later, earlier]);
    writeOperationsForSeat(ops, 'a2', [sampleOperation('a2-op3')]);
    assert.deepEqual(readOperations(ops).get('a1'), [earlier, later]);
    assert.equal(readOperations(ops).get('a2')?.[0]?.id, 'a2-op3');
    writeOperationsForSeat(ops, 'a1', []);
    assert.deepEqual([...readOperations(ops).keys()], ['a2']);
    upsertGameConfigValue(
      ops,
      OPERATIONS_CONFIG_KEY,
      JSON.stringify({
        a2: [
          { id: 'bad', phase: 'flying' },
          sampleOperation('a2-op3'),
        ],
      })
    );
    assert.deepEqual(readOperations(ops).get('a2'), [sampleOperation('a2-op3')]);
    upsertGameConfigValue(ops, OPERATIONS_CONFIG_KEY, 'not-json');
    assert.equal(readOperations(ops).size, 0);
  });
});

test('a stored land method is dropped and a sea sibling remains', () => {
  withTempGameDb('aw-operation-memory-', () => {
    const ops = { getOne: dbGetOne, run: dbRun };
    const sea = sampleOperation('a1-op3');
    upsertGameConfigValue(ops, OPERATIONS_CONFIG_KEY, JSON.stringify({
      a1: [{ ...sea, id: 'a1-land', method: 'land' }, sea],
    }));
    assert.deepEqual(readOperations(ops).get('a1'), [sea]);
  });
});

test('nextOperationId uses the plain id, then the b suffix', () => {
  const plain = nextOperationId('a1', [], 4);
  assert.equal(plain, 'a1-op4');
  const taken = nextOperationId('a1', [sampleOperation('a1-op4')], 4);
  assert.equal(taken, 'a1-op4b');
});

test('offer and event rows round-trip without disturbing operations', () => {
  withTempGameDb('aw-operation-memory-', () => {
    const ops = { getOne: dbGetOne, run: dbRun };
    writeOperationsForSeat(ops, 'a1', [sampleOperation('a1-op3')]);
    writeOperationOffer(ops, 'a1', { announcedTurn: 5, clearOfferTurn: 5 });
    writeOperationOffer(ops, 'a2', { announcedTurn: 4, clearOfferTurn: null });
    writeOperationEventTurn(ops, 'a1', 5);
    writeOperationEventTurn(ops, 'a2', 4);
    assert.deepEqual(readOperationOffer(ops, 'a1'), { announcedTurn: 5, clearOfferTurn: 5 });
    assert.deepEqual(readOperationOffer(ops, 'a2'), { announcedTurn: 4, clearOfferTurn: null });
    assert.equal(readOperationEventTurn(ops, 'a1'), 5);
    assert.equal(readOperations(ops).get('a1')?.[0]?.id, 'a1-op3');
    writeOperationOffer(ops, 'a1', null);
    assert.deepEqual(readOperationOffer(ops, 'a1'), { announcedTurn: null, clearOfferTurn: null });
    assert.equal(readOperationEventTurn(ops, 'a1'), 5);
    assert.equal(readOperationEventTurn(ops, 'a2'), 4);
    upsertGameConfigValue(ops, OPERATION_OFFERS_CONFIG_KEY, 'not-json');
    assert.deepEqual(readOperationOffer(ops, 'a2'), { announcedTurn: null, clearOfferTurn: null });
    assert.equal(readOperations(ops).get('a1')?.[0]?.id, 'a1-op3');
    upsertGameConfigValue(ops, OPERATION_EVENTS_CONFIG_KEY, '{"a2":"soon"}');
    assert.equal(readOperationEventTurn(ops, 'a2'), null);
    assert.equal(readOperations(ops).size, 1);
  });
});

test('a refusal note round-trips, a bad value reads as none, and clearing one seat leaves the other', () => {
  withTempGameDb('aw-operation-memory-', () => {
    const ops = { getOne: dbGetOne, run: dbRun };
    assert.equal(readOperationNote(ops, 'a1'), null);
    writeOperationNote(ops, 'a1', { turn: 5, text: 'operations launch dropped: AA is not a known enemy city.' });
    writeOperationNote(ops, 'a2', { turn: 5, text: 'operations dropped: expected an array.' });
    assert.deepEqual(readOperationNote(ops, 'a1'), { turn: 5, text: 'operations launch dropped: AA is not a known enemy city.' });
    assert.equal(operationNoteTextForTurn(readOperationNote(ops, 'a1'), 6), 'operations launch dropped: AA is not a known enemy city.');
    assert.equal(operationNoteTextForTurn(readOperationNote(ops, 'a1'), 7), '');
    upsertGameConfigValue(ops, OPERATION_NOTES_CONFIG_KEY, JSON.stringify({ a1: { turn: 'soon', text: 'x' }, a2: { turn: 5, text: '' } }));
    assert.equal(readOperationNote(ops, 'a1'), null);
    assert.equal(readOperationNote(ops, 'a2'), null);
    writeOperationRefusal(ops, 'a1', 8, ['ignored', 'operations launch dropped: AA is defended, and an air drop needs an empty, unfortified city.']);
    assert.equal(readOperationNote(ops, 'a1')?.text, 'operations launch dropped: AA is defended, and an air drop needs an empty, unfortified city.');
    writeOperationRefusal(ops, 'a1', 8, ['ignored']);
    assert.equal(readOperationNote(ops, 'a1'), null);
    writeOperationNote(ops, 'a2', { turn: 8, text: 'operations dropped: expected an array.' });
    writeOperationNote(ops, 'a1', null);
    assert.equal(readOperationNote(ops, 'a2')?.turn, 8);
  });
});
