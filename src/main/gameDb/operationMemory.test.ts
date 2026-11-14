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
  OPERATIONS_CONFIG_KEY,
  nextOperationId,
  readOperations,
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

test('nextOperationId uses the plain id, then the b suffix', () => {
  const plain = nextOperationId('a1', [], 4);
  assert.equal(plain, 'a1-op4');
  const taken = nextOperationId('a1', [sampleOperation('a1-op4')], 4);
  assert.equal(taken, 'a1-op4b');
});
