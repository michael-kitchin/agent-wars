import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { AIR_STRIKE_TARGET_TYPES, isAirStrikeTargetType } from './airStrikeTarget';

test('the target list stays in schema order', () => {
  assert.deepEqual(AIR_STRIKE_TARGET_TYPES, ['units', 'urban', 'airport', 'seaport']);
});

test('only the four target categories pass', () => {
  for (const targetType of AIR_STRIKE_TARGET_TYPES) {
    assert.equal(isAirStrikeTargetType(targetType), true);
  }
  assert.equal(isAirStrikeTargetType('Units'), false);
  assert.equal(isAirStrikeTargetType(' units'), false);
  assert.equal(isAirStrikeTargetType(''), false);
  assert.equal(isAirStrikeTargetType(null), false);
  assert.equal(isAirStrikeTargetType(undefined), false);
  assert.equal(isAirStrikeTargetType(1), false);
});

test('the database check lists the same target types', () => {
  const schema = fs.readFileSync(path.resolve(process.cwd(), 'src', 'main', 'gameDb', 'schema.ts'), 'utf8');
  const check = schema.match(/target_type TEXT NOT NULL CHECK \(target_type IN \(([^)]+)\)\)/);
  assert.ok(check);
  assert.deepEqual(
    [...check[1].matchAll(/'([^']+)'/g)].map((match) => match[1]),
    [...AIR_STRIKE_TARGET_TYPES]
  );
});
