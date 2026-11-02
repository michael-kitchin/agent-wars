import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dbGetOne } from './gameDb';
import { readHexEmbarkFacts } from './hexEmbarkFacts';
import { withTempGameDb } from './testSupport/withTempGameDb';

test('a seeded hex returns its terrain and a seaport count', () => {
  withTempGameDb('aw-embark-facts-', () => {
    const row = dbGetOne<{ h3_index: string; terrain: string }>('SELECT h3_index, terrain FROM hexes LIMIT 1');
    assert.ok(row);
    const facts = readHexEmbarkFacts(row.h3_index);
    assert.ok(facts);
    assert.equal(facts.nativeTerrain, row.terrain);
    assert.ok(facts.seaportCount >= 0);
  });
});

test('an unknown hex has no embark facts', () => {
  withTempGameDb('aw-embark-facts-missing-', () => {
    assert.equal(readHexEmbarkFacts('not-a-hex'), null);
  });
});
