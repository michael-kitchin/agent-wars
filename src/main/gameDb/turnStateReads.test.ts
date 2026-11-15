import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readTurnNumberOrFirst, readTurnPhase, readTurnStateRow, type TurnStateRow } from './turnStateReads';

const TURN_SQL = 'SELECT phase, turn_number FROM turn_state WHERE id = 1';

test('readTurnStateRow returns the row from getOne and uses the singleton SQL', () => {
  const row: TurnStateRow = { phase: 'planning', turn_number: 4 };
  let seenSql: string | undefined;
  const getOne = <T extends Record<string, unknown>>(sql: string): T | undefined => {
    seenSql = sql;
    return row as unknown as T;
  };
  const result = readTurnStateRow(getOne);
  assert.equal(seenSql, TURN_SQL);
  assert.deepEqual(result, row);
});

test('readTurnStateRow returns undefined when getOne finds no row', () => {
  const getOne = <T extends Record<string, unknown>>(): T | undefined => undefined;
  assert.equal(readTurnStateRow(getOne), undefined);
});

test('readTurnNumberOrFirst returns the stored turn and 1 when the row is missing', () => {
  const seen: string[] = [];
  const present = <T extends Record<string, unknown>>(sql: string): T | undefined => {
    seen.push(sql);
    return { phase: 'planning', turn_number: 4 } as unknown as T;
  };
  const missing = <T extends Record<string, unknown>>(sql: string): T | undefined => {
    seen.push(sql);
    return undefined;
  };
  assert.equal(readTurnNumberOrFirst(present), 4);
  assert.equal(readTurnNumberOrFirst(missing), 1);
  assert.deepEqual(seen, [TURN_SQL, TURN_SQL]);
});

test('readTurnPhase returns the stored phase and undefined when the row is missing', () => {
  const seen: string[] = [];
  const present = <T extends Record<string, unknown>>(sql: string): T | undefined => {
    seen.push(sql);
    return { phase: 'resolution', turn_number: 2 } as unknown as T;
  };
  const missing = <T extends Record<string, unknown>>(sql: string): T | undefined => {
    seen.push(sql);
    return undefined;
  };
  assert.equal(readTurnPhase(present), 'resolution');
  assert.equal(readTurnPhase(missing), undefined);
  assert.deepEqual(seen, [TURN_SQL, TURN_SQL]);
});
