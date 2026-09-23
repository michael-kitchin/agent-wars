import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { selectionSupportButtonMode } from './selectionSupportButtonMode';

describe('selectionSupportButtonMode strategic', () => {
  it('hides the button when nothing is selected', () => {
    assert.equal(selectionSupportButtonMode([], false), 'hidden');
  });

  it('offers Ranged for one capable unit and for several capable units', () => {
    assert.equal(selectionSupportButtonMode(['armor'], false), 'ranged');
    assert.equal(selectionSupportButtonMode(['armor', 'naval'], false), 'ranged');
  });

  it('hides Ranged when any selected unit cannot fire one', () => {
    assert.equal(selectionSupportButtonMode(['armor', 'infantry'], false), 'hidden');
    assert.equal(selectionSupportButtonMode(['armor', 'air'], false), 'hidden');
  });

  it('offers Strike for one air unit and for several air units', () => {
    assert.equal(selectionSupportButtonMode(['air'], false), 'strike');
    assert.equal(selectionSupportButtonMode(['air', 'air'], false), 'strike');
  });
});

describe('selectionSupportButtonMode tactical', () => {
  it('offers Ranged for tactical infantry alone and with armor', () => {
    assert.equal(selectionSupportButtonMode(['infantry'], true), 'ranged');
    assert.equal(selectionSupportButtonMode(['infantry', 'armor'], true), 'ranged');
  });

  it('hides Ranged when air is mixed with a tactical ranged unit', () => {
    assert.equal(selectionSupportButtonMode(['infantry', 'air'], true), 'hidden');
  });
});
