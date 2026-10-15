import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SELECTION_HINT_FERRY,
  SELECTION_HINT_MIXED,
  SELECTION_HINT_MOVE,
  SELECTION_HINT_PLAYBACK,
  SELECTION_HINT_TARGETING,
  selectionBarHint,
  selectionElsewhereText,
} from './selectionBarText';

describe('selectionBarHint', () => {
  it('names the move gesture for land and naval units', () => {
    assert.equal(selectionBarHint({ playbackRunning: false, targetingOn: false, unitTypes: ['armor', 'infantry', 'naval'] }), SELECTION_HINT_MOVE);
  });

  it('names the ferry gesture when every selected unit is air', () => {
    assert.equal(selectionBarHint({ playbackRunning: false, targetingOn: false, unitTypes: ['air', 'air'] }), SELECTION_HINT_FERRY);
  });

  it('says why air units mixed with other types cannot move', () => {
    assert.equal(selectionBarHint({ playbackRunning: false, targetingOn: false, unitTypes: ['air', 'armor'] }), SELECTION_HINT_MIXED);
  });

  it('puts targeting ahead of the selection', () => {
    assert.equal(selectionBarHint({ playbackRunning: false, targetingOn: true, unitTypes: ['air'] }), SELECTION_HINT_TARGETING);
    assert.equal(selectionBarHint({ playbackRunning: false, targetingOn: true, unitTypes: ['armor'] }), SELECTION_HINT_TARGETING);
  });

  it('puts playback ahead of targeting and the selection', () => {
    assert.equal(selectionBarHint({ playbackRunning: true, targetingOn: true, unitTypes: ['air'] }), SELECTION_HINT_PLAYBACK);
    assert.equal(selectionBarHint({ playbackRunning: true, targetingOn: false, unitTypes: ['armor'] }), SELECTION_HINT_PLAYBACK);
  });
});

describe('selectionElsewhereText', () => {
  it('is null when every selected unit stands in the named hex', () => {
    assert.equal(selectionElsewhereText([{ inPanelHex: true }, { inPanelHex: true }]), null);
  });

  it('counts the selected units in other hexes', () => {
    assert.equal(selectionElsewhereText([{ inPanelHex: true }, { inPanelHex: false }]), '+1 elsewhere');
    assert.equal(selectionElsewhereText([{ inPanelHex: true }, { inPanelHex: false }, { inPanelHex: false }]), '+2 elsewhere');
  });
});
