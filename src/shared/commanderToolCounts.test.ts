import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sumCommanderToolCounts } from './commanderToolCounts';

describe('sumCommanderToolCounts', () => {
  it('adds the same group across commanders', () => {
    assert.deepEqual(
      sumCommanderToolCounts([
        { planning: 2, events: 1 },
        { planning: 3, assessment: 4 },
      ]),
      { planning: 5, events: 1, assessment: 4 }
    );
  });

  it('returns an empty map when no commander has reported', () => {
    assert.deepEqual(sumCommanderToolCounts([]), {});
  });

  it('leaves out a non-finite count', () => {
    assert.deepEqual(sumCommanderToolCounts([{ planning: Number.NaN, events: 2 }]), { events: 2 });
  });
});
