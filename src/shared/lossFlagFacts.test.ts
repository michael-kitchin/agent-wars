/**
 * Birth records copied onto casualties so a loss line can show an origin flag.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildLossFlagFacts, removedUnitSnapshot, withLossFlagFacts } from './lossFlagFacts';

const ORIGIN = {
  birthH3Index: '812d7ffffffffff',
  birthTacticalH3Index: '842d443ffffffff',
  birthTerrainKind: 'plains',
  birthIsUrban: true,
  birthCountryName: 'Russia',
  birthCountryCode: 'RU',
};

test('a named casualty keeps the birth record of a unit the player had not seen', () => {
  const facts = buildLossFlagFacts(
    [{ id: 'a1-a15', origin: ORIGIN, formedTurn: 3 }],
    {
      weatherEnabled: true,
      techEnabled: true,
      weatherTagsFor: () => ['heat'],
      techLevelFor: () => 'advanced',
    }
  );
  const casualty = withLossFlagFacts(
    {
      id: 'a1-a15',
      player: 'opponent',
      unitType: 'air',
      h3Index: '81387ffffffffff',
      displayOrder: 15,
    },
    facts.get('a1-a15')
  );
  assert.equal(casualty.origin?.birthCountryCode, 'RU');
  assert.equal(casualty.formedTurn, 3);
  assert.deepEqual(casualty.weatherTags, ['heat']);
  assert.equal(casualty.techLevel, 'advanced');
  assert.equal(casualty.h3Index, '81387ffffffffff');
});

test('weather and tech stay off the record when those bonuses are off, and a unit with no birth record is omitted', () => {
  const facts = buildLossFlagFacts(
    [
      { id: 'a1-a15', origin: ORIGIN, formedTurn: 3 },
      { id: 'a1-a16' },
    ],
    {
      weatherEnabled: false,
      techEnabled: false,
      weatherTagsFor: () => ['heat'],
      techLevelFor: () => 'advanced',
    }
  );
  assert.equal(facts.has('a1-a16'), false);
  const kept = facts.get('a1-a15');
  assert.equal(kept?.weatherTags, undefined);
  assert.equal(kept?.techLevel, undefined);
  const plain = withLossFlagFacts(
    { id: 'a1-a16', player: 'opponent', unitType: 'air', h3Index: '811e3ffffffffff' },
    facts.get('a1-a16')
  );
  assert.equal('origin' in plain, false);
});

test('a tactical casualty copies the birth record already on the sub-unit', () => {
  const snapshot = removedUnitSnapshot({
    id: 'a1-a15-01',
    player: 'opponent',
    unitType: 'air',
    h3Index: '84387ffffffffff',
    displayName: 'XV Squadron (01)',
    origin: ORIGIN,
    weatherTags: ['snow'],
    techLevel: 'basic',
  });
  assert.equal(snapshot.displayName, 'XV Squadron (01)');
  assert.equal(snapshot.origin?.birthCountryCode, 'RU');
  assert.deepEqual(snapshot.weatherTags, ['snow']);
  assert.equal(snapshot.techLevel, 'basic');
});
