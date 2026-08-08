import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { selectionUnitIdSetsDiffer } from './selectionUnitIdSets';

describe('selectionUnitIdSetsDiffer', () => {
  it('treats identical membership as equal regardless of order', () => {
    assert.equal(selectionUnitIdSetsDiffer(['a', 'b'], ['b', 'a']), false);
  });

  it('detects empty-to-non-empty and membership changes', () => {
    assert.equal(selectionUnitIdSetsDiffer([], ['a']), true);
    assert.equal(selectionUnitIdSetsDiffer(['a'], ['a', 'b']), true);
    assert.equal(selectionUnitIdSetsDiffer(['a', 'b'], ['a', 'c']), true);
  });

  it('detects shrinking a multi-select while remaining non-empty', () => {
    assert.equal(selectionUnitIdSetsDiffer(['a', 'b'], ['a']), true);
  });

  it('treats empty lists as equal', () => {
    assert.equal(selectionUnitIdSetsDiffer([], []), false);
  });
});
