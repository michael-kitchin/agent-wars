import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { armorStopTerrainLabels, strategicFlagsFromCounts } from './strategicTerrainFlags';

describe('strategicFlagsFromCounts', () => {
  it('marks rugged or arctic at half the land cells and a city at 86 urban cells', () => {
    assert.deepEqual(strategicFlagsFromCounts(4, 2, 1, 85), { rugged: true, arctic: false, city: false });
    assert.deepEqual(strategicFlagsFromCounts(4, 1, 2, 86), { rugged: false, arctic: true, city: true });
    assert.deepEqual(strategicFlagsFromCounts(0, 0, 0, 100), { rugged: false, arctic: false, city: true });
  });
});

describe('armorStopTerrainLabels', () => {
  it('names legend kinds for the flags that stop armor', () => {
    assert.deepEqual(armorStopTerrainLabels({ rugged: true, arctic: false, city: true }), ['Urban', 'Mountain']);
    assert.deepEqual(armorStopTerrainLabels({ rugged: false, arctic: true, city: false }), ['Arctic']);
    assert.deepEqual(armorStopTerrainLabels({ rugged: false, arctic: false, city: false }), []);
  });
});
