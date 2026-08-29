import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readTurnStateRow, type TurnStateRow } from './turnStateReads';

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
