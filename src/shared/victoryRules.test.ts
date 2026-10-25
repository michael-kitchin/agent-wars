import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NEUTRAL_OWNER_ID } from './seatIds';
import { countCityHexesBySeat, DEFAULT_TURN_LIMIT, rankSeatsByCityHexes, victorySettingsForRequest } from './victoryRules';

test('an omitted rule is Deathmatch and a city-hex rule keeps a listed limit', () => {
  assert.deepEqual(victorySettingsForRequest(undefined, 40), { rule: 'last_side_standing', turnLimit: null });
  assert.deepEqual(victorySettingsForRequest('most_city_hexes_at_turn_limit', 40), {
    rule: 'most_city_hexes_at_turn_limit',
    turnLimit: 40,
  });
  assert.deepEqual(victorySettingsForRequest('most_city_hexes_at_turn_limit', 15), {
    rule: 'most_city_hexes_at_turn_limit',
    turnLimit: DEFAULT_TURN_LIMIT,
  });
});

test('city hexes count only seats that hold urban hexes', () => {
  const counts = countCityHexesBySeat(
    [
      { h3Index: 'city', controllerPlayerId: 'human' },
      { h3Index: 'empty', controllerPlayerId: 'opponent' },
      { h3Index: 'neutral-city', controllerPlayerId: NEUTRAL_OWNER_ID },
      { h3Index: 'unowned', controllerPlayerId: null },
    ],
    [
      { h3Index: 'city', urbanHexCount: 2 },
      { h3Index: 'empty', urbanHexCount: 0 },
      { h3Index: 'neutral-city', urbanHexCount: 4 },
    ]
  );
  assert.equal(counts.get('human'), 1);
  assert.equal(counts.has('opponent'), false);
  assert.equal(counts.has(NEUTRAL_OWNER_ID), false);
});

test('tied city hexes share first place', () => {
  const places = rankSeatsByCityHexes(['human', 'opponent', 'opponent2'], new Map([
    ['human', 4],
    ['opponent', 4],
    ['opponent2', 1],
  ]));
  assert.equal(places.get('human'), 1);
  assert.equal(places.get('opponent'), 1);
  assert.equal(places.get('opponent2'), 3);
});
