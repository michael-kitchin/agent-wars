/**
 * Contract tests for the selected build and hire item tip.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { queueItemTooltipText } from './queueItemTooltipText';

test('each queue item has its description', () => {
  assert.equal(queueItemTooltipText('infantry'), 'The cheapest unit. It cannot shoot on the world map, and it can shoot in a battle.');
  assert.equal(queueItemTooltipText('armor'), 'Costs more than infantry, shoots one hex on the world map, and cannot enter mountains, wetlands, or arctic.');
  assert.equal(queueItemTooltipText('naval'), 'Needs a seaport, shoots two hexes on the world map, and can carry land units.');
  assert.equal(queueItemTooltipText('air'), 'Strikes from an airport and does not march. A hex needs an airport to build it.');
  assert.equal(queueItemTooltipText('missile'), 'Launches once on the world map and is then gone. It cannot fire in a battle.');
  assert.equal(queueItemTooltipText('fortification'), 'Protects one city cell. It is not a unit, and a hit removes it before a unit.');
  assert.equal(queueItemTooltipText('credits'), 'Adds 20 credits to the treasury. It is not a unit and does not count toward a unit cap.');
});

test('an empty or unknown value has no item sentence', () => {
  assert.equal(queueItemTooltipText(''), null);
  assert.equal(queueItemTooltipText('not-a-type'), null);
});
